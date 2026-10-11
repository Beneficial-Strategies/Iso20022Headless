import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { closureOf, messageJson, simpleTypeRows, simpleTypesTsv, writeStructure, type Closure, type MessageSpec } from './extract.ts';
import { loadResources, pageTotals, type CodeSetInfo, type Resources, SIMPLE_KINDS } from './resources.ts';
import { orderFileText, parseOrderFile } from './xsd-order.ts';

/**
 * `resources --pages <dir> --messages <messages.json> [--fixtures <dir>] [analyze|write]`: write the fixture directories of the
 * listed messages from the MCP's resources alone (no snapshot, no lookups, no XSDs). See tools/spec-extract/README.md.
 */

const tsv = (cols: (string | number | undefined)[]): string => cols.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t');
const rowsOf = (file: string): string[][] =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')) : [];

interface Seen {
  complex: Set<string>;
  simple: Set<string>;
  codeSets: Set<string>;
  ruleIds: Set<string>;
}

/** What committed fixture directories (other than `except`) already hold. */
function knownIn(fixtures: string, except: Set<string>, exceptRuleFiles: Set<string>): Seen {
  const seen: Seen = { complex: new Set(), simple: new Set(), codeSets: new Set(), ruleIds: new Set() };
  for (const d of readdirSync(fixtures)) {
    const dir = resolve(fixtures, d);
    if (!statSync(dir).isDirectory()) continue;
    const isMessage = existsSync(resolve(dir, 'message.json'));
    if (isMessage && !except.has(d)) {
      for (const r of rowsOf(resolve(dir, 'complex-types.tsv'))) if (r[0] === 'DATATYPE') seen.complex.add(r[1]!);
      for (const r of rowsOf(resolve(dir, 'simple-types.tsv')).slice(1)) seen.simple.add(r[0]!);
      for (const r of rowsOf(resolve(dir, 'codesets.tsv')).slice(1)) seen.codeSets.add(r[0]!);
    }
    if (isMessage || d === 'rules') {
      for (const f of readdirSync(dir).filter((x) => /^constraints.*\.tsv$/.test(x) && !exceptRuleFiles.has(x))) {
        for (const r of rowsOf(resolve(dir, f)).slice(1)) {
          seen.ruleIds.add(r[0]!);
          seen.ruleIds.add(r[1]!);
        }
      }
    }
  }
  return seen;
}

const lengths = (c: CodeSetInfo): { min?: string; max?: string } => ({ min: c.minLength ?? c.length, max: c.maxLength ?? c.length });

/** codesets.tsv rows (and codedefs rows) for one code set; the generator reads the marker rows as "not enumerated". */
function codeSetRows(c: CodeSetInfo): { sets: string[]; defs: string[] } {
  const base = c.restrictionOf ?? '';
  if (c.isExternal || (!c.hasMembers && c.pattern === undefined)) {
    const { min, max } = lengths(c);
    const bounds = [min ? `minLength=${min}` : '', max ? `maxLength=${max}` : ''].filter(Boolean).join(' ');
    const note = c.isExternal ? `~${c.externalCount ?? c.codes.length} codes (not enumerated)` : 'no code list, length or pattern published; not enumerated';
    return { sets: [tsv([c.name, c.isoId, base, '*EXTERNAL*', [bounds, note].filter(Boolean).join('; ')])], defs: [] };
  }
  if (!c.hasMembers) {
    return { sets: [tsv([c.name, c.isoId, base, '*PATTERN*', `${c.pattern} (no code list in repository; not enumerated)`])], defs: [] };
  }
  return {
    sets: c.codes.map((k) => tsv([c.name, c.isoId, base, k.value, k.name])),
    defs: c.codes.map((k) => tsv([c.name, k.value, k.name, k.isoId, k.definition])),
  };
}

export interface Plan {
  message: MessageSpec;
  closure: Closure;
}

export function runResources(args: { pages: string; messages: string; fixtures: string; mode: 'analyze' | 'write'; only?: string; rulesTag?: string }): number {
  const areaDirs = readdirSync(args.pages).filter((d) => d.endsWith('Area'));
  const res: Resources = loadResources(args.pages, areaDirs);
  // an incomplete pull would silently leave types out
  for (const kind of ['MessageComponent', 'ChoiceComponent', 'CodeSet', ...SIMPLE_KINDS, 'Amount', 'ExternalSchema']) {
    const t = pageTotals(args.pages, kind);
    if (t.returned !== t.total) {
      console.error(`${kind}: ${t.returned} of ${t.total} entries in ${args.pages}; pull every page first`);
      return 1;
    }
  }
  for (const w of res.spec.warnings) console.log(`warning: ${w}`);

  const all: MessageSpec[] = JSON.parse(readFileSync(args.messages, 'utf8'));
  const chosen = all.filter((m) => !args.only || m.name === args.only);
  const fixtures = args.fixtures;
  mkdirSync(fixtures, { recursive: true });
  const tag = args.rulesTag ?? args.only ?? 'resources';
  // the rule files this run writes are not "known": running again must write the same rules, not skip them as done
  const seen = knownIn(fixtures, new Set(chosen.map((m) => m.dir)), new Set([`constraints-${tag}.tsv`]));
  const report: Record<string, unknown>[] = [];

  // the existing order files are merged with what the resources say; a type listed differently is a conflict
  const orderFile = resolve(fixtures, 'member-order.tsv');
  const codeOrderFile = resolve(fixtures, 'code-order.tsv');
  const memberOrders = new Map<string, string[]>(existsSync(orderFile) ? parseOrderFile(readFileSync(orderFile, 'utf8')) : []);
  const codeOrders = new Map<string, string[]>(existsSync(codeOrderFile) ? parseOrderFile(readFileSync(codeOrderFile, 'utf8')) : []);
  const conflicts: string[] = [];
  const addOrder = (target: Map<string, string[]>, type: string, tags: string[], what: string): void => {
    const have = target.get(type);
    if (have && have.join() !== tags.join()) conflicts.push(`${what} ${type}: file has ${have.join(',')}, resources have ${tags.join(',')}`);
    else target.set(type, tags);
  };

  const ruleLines: string[] = [];
  const exprLines: string[] = [];
  const codeListLines = new Map<string, string[]>();

  for (const m of chosen) {
    const info = res.messages.get(m.id);
    if (!info) throw new Error(`${m.name} (${m.id}) is not in the resources`);
    for (const [what, a, b] of [['name', info.name, m.name], ['identifier', info.identifier, m.identifier], ['body tag', info.bodyTag, m.bodyTag]] as const) {
      if (a !== b) throw new Error(`${m.name}: ${what} is ${a} in the resources but ${b} in the message list`);
    }
    const c = closureOf(res.spec, m);
    const fresh = (n: string): boolean => !seen.complex.has(n);
    const newSimple = c.simpleTypes.filter((n) => !seen.simple.has(n));
    // an amount type's currency set is not reached through any member, but the generator reads its pattern
    const currencySets = [...new Set(c.amounts.filter(fresh).map((a) => res.spec.facets.get(a)?.currencyIdentifierSet).filter((x): x is string => !!x))]
      .map((setId) => [...res.codeSets.values()].find((s) => s.isoId === setId)?.name)
      .filter((n): n is string => !!n && !seen.codeSets.has(n) && !c.codeSets.includes(n));
    const newCodeSets = [...c.codeSets, ...currencySets].filter((n) => !seen.codeSets.has(n));
    report.push({
      message: m.identifier,
      components: `${c.components.filter(fresh).length} new / ${c.components.length}`,
      choices: `${c.choices.filter(fresh).length} new / ${c.choices.length}`,
      amounts: c.amounts.filter(fresh),
      simple: `${newSimple.length} new / ${c.simpleTypes.length}`,
      codeSets: `${newCodeSets.length} new / ${c.codeSets.length}`,
      unresolved: c.unresolved,
    });

    if (args.mode === 'write') {
      const out = resolve(fixtures, m.dir);
      mkdirSync(out, { recursive: true });
      const w = writeStructure(res.spec, c, fresh, (n) => !seen.codeSets.has(n));
      writeFileSync(resolve(out, 'message.json'), JSON.stringify(messageJson(res.spec, m), null, 2) + '\n');
      writeFileSync(resolve(out, 'complex-types.tsv'), w.complexTypes.replace('from get_spec_snapshot (components + choices). Choice members are the snapshot\'s VARIANT rows.', 'from the ISO 20022 MCP resources (dictionary details). Choice members are the resources\' variants.'));
      writeFileSync(resolve(out, 'snapshot-raw.tsv'), w.snapshotRaw.replace('from get_spec_snapshot', 'from the MCP resources'));
      writeFileSync(resolve(out, 'choice-defs.tsv'), w.choiceDefs);
      writeFileSync(resolve(out, 'codeset-defs.tsv'), w.codeSetDefs);
      writeFileSync(resolve(out, 'simple-types.tsv'), simpleTypesTsv(simpleTypeRows(res.spec, [...newSimple, ...c.amounts.filter(fresh), ...c.externalSchemas.filter((n) => !seen.simple.has(n))])));

      const sets = ['codeSetName\tisoId\trestrictionOf\tcode\tenumName'];
      const defs = ['codeSet\tcode\tenumName\tisoId\ttext'];
      for (const n of newCodeSets) {
        const info2 = res.codeSets.get(n)!;
        const r = codeSetRows(info2);
        sets.push(...r.sets);
        defs.push(...r.defs);
        if (r.defs.length >= 2) addOrder(codeOrders, n, info2.codes.map((k) => k.value), 'code order');
      }
      writeFileSync(resolve(out, 'codesets.tsv'), sets.join('\n') + '\n');
      writeFileSync(resolve(out, 'codedefs.tsv'), defs.join('\n') + '\n');

      const blockTags = res.memberOrder.get(`message:${m.id}`) ?? [];
      if (blockTags.length >= 2) addOrder(memberOrders, m.name, blockTags, 'building block order');
      for (const n of [...c.components, ...c.choices].filter(fresh)) {
        const tags = res.memberOrder.get(n) ?? [];
        if (tags.length >= 2) addOrder(memberOrders, n, tags, 'member order');
      }

      // business rules of every type this message adds (and of the message itself)
      // (rules on simple types, amounts and code sets are prose notes without expressions; they are not generated yet)
      const scopes = new Set<string>([m.name, ...c.components.filter(fresh), ...c.choices.filter(fresh)]);
      for (const r of res.rules) {
        if (!scopes.has(r.scope) || seen.ruleIds.has(r.id)) continue;
        seen.ruleIds.add(r.id);
        ruleLines.push(tsv([r.scope, r.id, r.name, r.text]));
        if (r.expression) {
          exprLines.push(tsv([r.scope, r.id, r.name, r.expression]));
          // a WithInList operand that names a code set no message type reaches needs its values for the rule evaluator
          for (const lm of r.expression.matchAll(/WithInList"><leftOperand>[^<]*<\/leftOperand><rightOperand>([^<]+)<\/rightOperand>/g)) {
            const set = res.codeSets.get(lm[1]!);
            if (set && !c.codeSets.includes(set.name) && !seen.codeSets.has(set.name)) {
              codeListLines.set(set.name, set.codes.map((k) => tsv([set.name, k.value, k.name])));
            }
          }
        }
      }
      if (codeListLines.size) {
        const lines = ['# Code sets referenced by constraint expressions (WithInList) that are not types in the message closures.', '# Source: ISO 20022 MCP resources (dictionary CodeSet details).', 'codeSet\tcode\tenumName'];
        for (const l of codeListLines.values()) lines.push(...l);
        writeFileSync(resolve(out, 'rule-codelists.tsv'), lines.join('\n') + '\n');
        codeListLines.clear();
      }
    }
    c.components.filter(fresh).forEach((n) => seen.complex.add(n));
    c.choices.filter(fresh).forEach((n) => seen.complex.add(n));
    c.amounts.filter(fresh).forEach((n) => seen.complex.add(n));
    newSimple.forEach((n) => seen.simple.add(n));
    newCodeSets.forEach((n) => seen.codeSets.add(n));
  }
  console.table(report);

  if (args.mode === 'write') {
    for (const x of conflicts) console.log(`conflict: ${x}`);
    if (conflicts.length) return 1;
    writeFileSync(orderFile, orderFileText(memberOrders));
    writeFileSync(codeOrderFile, orderFileText(codeOrders));
    const rulesDir = resolve(fixtures, 'rules');
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(resolve(rulesDir, `constraints-${tag}.tsv`), ['scope\tid\tname\ttext', ...ruleLines].join('\n') + '\n');
    writeFileSync(resolve(rulesDir, `constraint-expressions-${tag}.tsv`), ['scope\tid\tname\texpression', ...exprLines].join('\n') + '\n');
    console.log(`wrote ${chosen.length} message directories, ${ruleLines.length} rules (${exprLines.length} with expressions)`);
  }
  return 0;
}
