import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simpleTypeRows, simpleTypesTsv, closureOf, messageJson, writeStructure, type Closure, type MessageSpec } from './extract.ts';
import { loadSnapshots } from './snapshot.ts';
import { codeOrders, mergeOrders, orderFileText, parseOrderFile, typeOrders } from './xsd-order.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = resolve(root, 'fixtures');
const messages: MessageSpec[] = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../messages.json'), 'utf8'));

const rows = (file: string): string[][] =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')) : [];

/** Type names already captured by committed fixture directories (other than `except`). */
function knownTypes(except: Set<string>): { complex: Set<string>; simple: Set<string>; codeSets: Set<string> } {
  const complex = new Set<string>();
  const simple = new Set<string>();
  const codeSets = new Set<string>();
  for (const d of readdirSync(fixtures)) {
    if (except.has(d) || !existsSync(resolve(fixtures, d, 'message.json'))) continue;
    for (const r of rows(resolve(fixtures, d, 'complex-types.tsv'))) if (r[0] === 'DATATYPE') complex.add(r[1]!);
    for (const r of rows(resolve(fixtures, d, 'simple-types.tsv')).slice(1)) simple.add(r[0]!);
    for (const r of rows(resolve(fixtures, d, 'codesets.tsv')).slice(1)) codeSets.add(r[0]!);
  }
  return { complex, simple, codeSets };
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function main(): number {
  const cmd = process.argv[2];
  if (cmd === 'order') return writeOrder();
  const dir = arg('--snapshots');
  if (!['analyze', 'write', 'verify'].includes(cmd ?? '') || !dir) {
    console.error('usage: spec-extract <analyze|write|verify> --snapshots <dir of saved get_spec_snapshot files> [--only <message name>]');
    return 2;
  }
  const spec = loadSnapshots(dir);
  console.log(`loaded: ${spec.loaded.sort().join(', ')}`);
  for (const w of spec.warnings.slice(0, 5)) console.log(`warning: ${w}`);

  if (cmd === 'verify') return verify(spec);

  const only = arg('--only');
  const chosen = messages.filter((m) => !only || m.name === only);
  // types captured so far: committed fixtures of other messages, plus the messages of this run in order
  const seen = knownTypes(new Set(chosen.map((m) => m.dir)));
  const report: Record<string, unknown>[] = [];
  for (const m of chosen) {
    const c: Closure = closureOf(spec, m);
    const fresh = (n: string): boolean => !seen.complex.has(n);
    const newSimple = c.simpleTypes.filter((n) => !seen.simple.has(n));
    const newCodeSets = c.codeSets.filter((n) => !seen.codeSets.has(n));
    report.push({
      message: m.identifier,
      components: `${c.components.filter(fresh).length} new / ${c.components.length}`,
      choices: `${c.choices.filter(fresh).length} new / ${c.choices.length}`,
      amounts: c.amounts.filter(fresh),
      simple: `${newSimple.length} new / ${c.simpleTypes.length}`,
      codeSets: `${newCodeSets.length} new / ${c.codeSets.length}`,
      external: c.externalSchemas,
      unresolved: c.unresolved,
    });
    if (cmd === 'write') {
      const out = resolve(fixtures, m.dir);
      mkdirSync(out, { recursive: true });
      const w = writeStructure(spec, c, fresh, (n) => !seen.codeSets.has(n));
      writeFileSync(resolve(out, 'message.json'), JSON.stringify(messageJson(spec, m), null, 2) + '\n');
      writeFileSync(resolve(out, 'complex-types.tsv'), w.complexTypes);
      writeFileSync(resolve(out, 'snapshot-raw.tsv'), w.snapshotRaw);
      writeFileSync(resolve(out, 'choice-defs.tsv'), w.choiceDefs);
      writeFileSync(resolve(out, 'codeset-defs.tsv'), w.codeSetDefs);
      // simple types and amounts: constraints come from the snapshot's FACET rows (no universal_lookup needed)
      const newAmounts = c.amounts.filter(fresh);
      writeFileSync(resolve(out, 'simple-types.tsv'), simpleTypesTsv(simpleTypeRows(spec, [...newSimple, ...newAmounts, ...c.externalSchemas.filter((n) => !seen.simple.has(n))])));
      // what still needs a targeted lookup (the snapshot has no code names or rules; facets are in the snapshot now)
      const needs = {
        message: m.identifier,
        simpleTypesWithoutFacets: newSimple.filter((n) => !spec.facets.has(n)),
        codeSets: newCodeSets.map((n) => ({ name: n, isoId: spec.codeSets.get(n)!.isoId, codes: (spec.codes.get(n) ?? []).length })),
        components: c.components.filter(fresh).map((n) => ({ name: n, isoId: spec.components.get(n)!.isoId })),
        externalSchemas: c.externalSchemas.filter((n) => !seen.simple.has(n)),
      };
      writeFileSync(resolve(out, 'needs.json'), JSON.stringify(needs, null, 2) + '\n');
    }
    c.components.filter(fresh).forEach((n) => seen.complex.add(n));
    c.choices.filter(fresh).forEach((n) => seen.complex.add(n));
    c.amounts.filter(fresh).forEach((n) => seen.complex.add(n));
    newSimple.forEach((n) => seen.simple.add(n));
    newCodeSets.forEach((n) => seen.codeSets.add(n));
  }
  console.table(report);
  return 0;
}

/** Re-derive pain.002 from the snapshot and compare it with the committed (hand-verified) fixture. */
function verify(spec: ReturnType<typeof loadSnapshots>): number {
  const m = messages.find((x) => x.identifier === 'pain.002.001.15') ?? {
    name: 'CustomerPaymentStatusReportV15', id: '0a3b2906-aae5-4c8c-b5cb-4ce211d29911', identifier: 'pain.002.001.15', bodyTag: 'CstmrPmtStsRpt', out: 'pain002', dir: 'pain002-v15',
  };
  const known = knownTypes(new Set([m.dir]));
  const c = closureOf(spec, m);
  const w = writeStructure(spec, c, (n) => !known.complex.has(n), (n) => !known.codeSets.has(n));
  const key = (r: string[]): string => (r[0] === 'DATATYPE' ? `T ${r[1]} ${r[2]} ${r[3]}` : `M ${r.slice(1, 9).join('|')}`);
  const mine = new Set(w.complexTypes.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => key(l.split('\t'))));
  const theirs = new Set(rows(resolve(fixtures, m.dir, 'complex-types.tsv')).map(key));
  const onlyMine = [...mine].filter((k) => !theirs.has(k));
  const onlyTheirs = [...theirs].filter((k) => !mine.has(k));
  console.log(`pain.002: ${mine.size} rows derived, ${theirs.size} committed; only derived: ${onlyMine.length}; only committed: ${onlyTheirs.length}`);
  for (const k of onlyMine.slice(0, 8)) console.log(`  derived only: ${k.slice(0, 200)}`);
  for (const k of onlyTheirs.slice(0, 8)) console.log(`  committed only: ${k.slice(0, 200)}`);
  let bad = onlyMine.length + onlyTheirs.length;
  const both: MessageSpec[] = [
    m,
    { name: 'CustomerCreditTransferInitiationV13', id: 'faf24cbe-3869-45f3-a382-ffcd8713ffd3', identifier: 'pain.001.001.13', bodyTag: 'CstmrCdtTrfInitn', out: 'pain001', dir: 'pain001-v13' },
  ];
  for (const x of both) {
    const mine = JSON.stringify(messageJson(spec, x));
    const theirs = JSON.stringify(JSON.parse(readFileSync(resolve(fixtures, x.dir, 'message.json'), 'utf8')));
    console.log(`${x.identifier} message.json: ${mine === theirs ? 'identical' : 'DIFFERENT'}`);
    if (mine !== theirs) bad++;
  }
  bad += verifySimpleTypes(spec);
  return bad === 0 ? 0 : 1;
}

/**
 * Every committed simple-types.tsv row that the snapshot describes must agree with the snapshot's FACET rows on pattern, lengths,
 * digits and bounds. (Rows for synthetic members of amount types, which the snapshot does not list, are skipped.)
 */
function verifySimpleTypes(spec: ReturnType<typeof loadSnapshots>): number {
  if (spec.facets.size === 0) {
    console.log('simple types: the snapshot has no FACET rows (re-pull `types` from a current staging server); skipped');
    return 0;
  }
  const seen = new Set<string>();
  let compared = 0;
  let bad = 0;
  for (const d of readdirSync(fixtures)) {
    const file = resolve(fixtures, d, 'simple-types.tsv');
    if (!existsSync(file)) continue;
    const [head, ...lines] = rows(file);
    void head;
    for (const committed of lines) {
      const name = committed[0]!;
      if (seen.has(name) || !spec.facets.has(name)) continue;
      seen.add(name);
      compared++;
      const [mine] = simpleTypeRows(spec, [name]);
      for (const [i, label] of [[2, 'type'], [3, 'pattern'], [4, 'minLength'], [5, 'maxLength'], [6, 'totalDigits'], [7, 'fractionDigits'], [8, 'minInclusive'], [9, 'maxInclusive']] as const) {
        if ((committed[i] ?? '') !== (mine![i] ?? '')) {
          bad++;
          console.log(`  ${name} (${d}) ${label}: committed "${committed[i] ?? ''}", snapshot "${mine![i] ?? ''}"`);
        }
      }
    }
  }
  console.log(`simple types: ${compared} committed rows compared with the snapshot's facets; differences: ${bad}`);
  return bad;
}

/**
 * `order --xsd <dir of XSD files>`: add the member order of every type in those XSDs to fixtures/member-order.tsv (existing lines are
 * kept; a type that an XSD orders differently from the file is an error).
 */
function writeOrder(): number {
  const dir = arg('--xsd');
  if (!dir) {
    console.error('usage: spec-extract order --xsd <dir of ISO XSD files (e.g. camt.053.001.14.xsd)>');
    return 2;
  }
  const file = resolve(fixtures, 'member-order.tsv');
  const files = new Map<string, ReturnType<typeof typeOrders>>();
  if (existsSync(file)) files.set('fixtures/member-order.tsv', [...parseOrderFile(readFileSync(file, 'utf8'))].map(([type, tags]) => ({ type, tags })));
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.xsd')).sort()) files.set(f, typeOrders(readFileSync(resolve(dir, f), 'utf8')));
  const { orders, conflicts } = mergeOrders(files);
  for (const c of conflicts) console.log(`conflict: ${c}`);
  if (conflicts.length) return 1;
  writeFileSync(file, orderFileText(orders));
  console.log(`member-order.tsv: ${orders.size} types from ${files.size} files`);

  // codes in the XSD's enumeration order, which is the spec's
  const codeFile = resolve(fixtures, 'code-order.tsv');
  const codeFiles = new Map<string, ReturnType<typeof codeOrders>>();
  if (existsSync(codeFile)) codeFiles.set('fixtures/code-order.tsv', [...parseOrderFile(readFileSync(codeFile, 'utf8'))].map(([type, tags]) => ({ type, tags })));
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.xsd')).sort()) codeFiles.set(f, codeOrders(readFileSync(resolve(dir, f), 'utf8')));
  const codes = mergeOrders(codeFiles);
  for (const c of codes.conflicts) console.log(`conflict: ${c}`);
  if (codes.conflicts.length) return 1;
  writeFileSync(codeFile, orderFileText(codes.orders));
  console.log(`code-order.tsv: ${codes.orders.size} code sets`);
  return 0;
}

process.exit(main());
