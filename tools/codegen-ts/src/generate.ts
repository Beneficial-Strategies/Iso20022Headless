/**
 * Codegen: MCP-derived TSV fixtures -> JSON IR -> TypeScript interfaces + Zod schemas + descriptors.
 *
 * Inputs: every directory under fixtures/ that holds a message.json (one per message), each with
 *   message.json, complex-types.tsv, simple-types.tsv, codesets.tsv, snapshot-raw.tsv, codedefs.tsv, codeset-defs.tsv,
 *   choice-defs.tsv, constraints*.tsv, constraint-expressions*.tsv, rule-codelists.tsv   (all optional except the first four)
 * A type that appears in several messages is defined once: the fixtures are merged into one pool.
 *
 * Outputs (committed):
 *   tools/codegen-ts/ir/<identifier>.json                      per message
 *   packages/validate/src/generated/shared.ts                  types used by more than one message (+ rule code lists)
 *   packages/validate/src/generated/<out>.ts                   per message: its own types, schemas, descriptors, message object
 *   packages/validate/src/generated/definitions.ts             spec text for all messages, keyed by ISO id
 *   packages/validate/src/generated/registry.ts                message index with lazy loaders
 *   packages/validate/src/generated/all.ts                     descriptors of every message (tools and tests)
 *   packages/types/src/generated/shared.ts, <out>.ts           interfaces
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixturesRoot = resolve(root, 'fixtures');

// ---------------------------------------------------------------- message definitions
interface Block {
  name: string;
  isoId: string;
  xmlTag: string;
  type: string;
  min: number;
  max: number | null;
}
interface MessageConfig {
  identifier: string;
  name: string;
  namespace: string;
  bodyTag: string;
  /** Output module name, e.g. pain001. */
  out: string;
  /** Repository id and spec text of the message definition itself (tooltip for the whole message). */
  isoId?: string;
  definition?: string;
  blocks: Block[];
}

const dirs = readdirSync(fixturesRoot)
  .filter((d) => existsSync(resolve(fixturesRoot, d, 'message.json')))
  .sort();
const configs = new Map<string, MessageConfig>();
for (const d of dirs) configs.set(d, JSON.parse(readFileSync(resolve(fixturesRoot, d, 'message.json'), 'utf8')) as MessageConfig);

// ---------------------------------------------------------------- IR types
type Kind = 'text' | 'number' | 'date' | 'datetime' | 'time' | 'boolean' | 'code' | 'amount' | 'any' | 'component' | 'choice';
interface Field {
  name: string;
  isoId?: string;
  xmlTag: string;
  type: string;
  kind: Kind;
  min: number;
  max: number | null;
}
interface BooleanRuleIr {
  op: string;
  path: string;
  value?: string;
}
interface RuleExprIr {
  mustBe: { connector: 'AND' | 'OR'; rules: BooleanRuleIr[] };
  onCondition?: { connector: 'AND' | 'OR'; rules: BooleanRuleIr[] };
}
interface IrType {
  name: string;
  isoId?: string;
  kind: Kind;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  totalDigits?: number;
  fractionDigits?: number;
  minInclusive?: number;
  options?: { value: string; name: string; isoId?: string }[];
  external?: boolean;
  fields?: Field[];
  choiceOptions?: Field[];
  rules?: { name: string; isoId?: string; text: string; expression?: RuleExprIr }[];
}

// ---------------------------------------------------------------- reading fixtures
const num = (s: string | undefined): number | undefined => (s === undefined || s === '' ? undefined : Number(s));

/** Rows of a tab-separated fixture; `#` comment lines and blank lines are dropped, and so is a header row if asked. */
function rowsOf(dir: string, file: string, header = false): string[][] {
  const p = resolve(fixturesRoot, dir, file);
  if (!existsSync(p)) return [];
  const rows = readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => l.split('\t'));
  return header ? rows.slice(1) : rows;
}
const filesMatching = (dir: string, re: RegExp): string[] => readdirSync(resolve(fixturesRoot, dir)).filter((f) => re.test(f)).sort();

// The pool: everything from every message's fixtures, merged. First definition of a name wins; a conflict is an error.
const datatypes = new Map<string, string[]>();
const members = new Map<string, string[][]>();
const simple = new Map<string, string[]>();
const codesets = new Map<string, string[][]>();
const codeIsoIds = new Map<string, string>();
const ruleCodeLists: Record<string, string[]> = {};
const problems: string[] = [];

for (const d of dirs) {
  const localTypes = new Map<string, string[]>();
  const localMembers = new Map<string, string[][]>();
  for (const r of rowsOf(d, 'complex-types.tsv')) {
    if (r[0] === 'DATATYPE') localTypes.set(r[1]!, r);
    else if (r[0] === 'MEMBER') (localMembers.get(r[1]!) ?? localMembers.set(r[1]!, []).get(r[1]!)!).push(r);
  }
  for (const [name, row] of localTypes) {
    const have = datatypes.get(name);
    if (have) {
      if (have[2] !== row[2]) problems.push(`type ${name} has different ids in ${d} (${row[2]}) and an earlier message (${have[2]})`);
      continue;
    }
    datatypes.set(name, row);
    members.set(name, localMembers.get(name) ?? []);
  }
  for (const r of rowsOf(d, 'simple-types.tsv', true)) if (!simple.has(r[0]!)) simple.set(r[0]!, r);
  for (const r of rowsOf(d, 'codesets.tsv', true)) {
    const have = codesets.get(r[0]!);
    if (!have) codesets.set(r[0]!, [r]);
    else if (have[0]![1] === r[1] && !have.some((h) => h[3] === r[3])) have.push(r); // more codes of the same set
  }
  for (const r of rowsOf(d, 'codedefs.tsv', true)) codeIsoIds.set(`${r[0]}\t${r[1]}`, r[3]!);
  for (const r of rowsOf(d, 'rule-codelists.tsv', true)) {
    const list = (ruleCodeLists[r[0]!] ??= []);
    if (!list.includes(r[1]!)) list.push(r[1]!);
  }
}

// ---------------------------------------------------------------- business rules (constraints)
/** Parse the spec's RuleDefinition XML. The format is regular (mustBe / onCondition groups of BooleanRule). */
function parseExpression(xml: string, name: string): RuleExprIr {
  const group = (tag: string): RuleExprIr['mustBe'] | undefined => {
    const m = new RegExp(`<${tag}>(.*?)</${tag}>`, 's').exec(xml);
    if (!m) return undefined;
    const body = m[1]!;
    const connector = /<connector>(AND|OR)<\/connector>/.exec(body)?.[1] as 'AND' | 'OR' | undefined;
    if (!connector) throw new Error(`rule ${name}: no connector in ${tag}`);
    const rules: BooleanRuleIr[] = [];
    for (const r of body.matchAll(/<BooleanRule xsi:type="(\w+)">(.*?)<\/BooleanRule>/gs)) {
      const left = /<leftOperand>([^<]*)<\/leftOperand>/.exec(r[2]!)?.[1];
      const right = /<rightOperand>([^<]*)<\/rightOperand>/.exec(r[2]!)?.[1];
      if (!left) throw new Error(`rule ${name}: BooleanRule without leftOperand`);
      rules.push({ op: r[1]!, path: left, ...(right !== undefined ? { value: right } : {}) });
    }
    if (rules.length === 0) throw new Error(`rule ${name}: empty ${tag}`);
    return { connector, rules };
  };
  const mustBe = group('mustBe');
  if (!mustBe) throw new Error(`rule ${name}: no mustBe`);
  const onCondition = group('onCondition');
  return { mustBe, ...(onCondition ? { onCondition } : {}) };
}

/**
 * constraints*.tsv: either `scope id name text` (header starts with "scope") or, in the older single-scope files,
 * `id name text` with the scope taken from the file name (constraints-<Scope>.tsv). Expressions likewise, keyed by constraint id.
 */
function scopedRows(dir: string, file: string): { scope: string; cols: string[] }[] {
  const rows = rowsOf(dir, file);
  const head = rows[0];
  if (!head) return [];
  if (head[0] === 'scope') return rows.slice(1).map((r) => ({ scope: r[0]!, cols: r.slice(1) }));
  const scope = /^constraints?-(?:expressions-)?(.+)\.tsv$/.exec(file)?.[1] ?? file;
  return rows.slice(1).map((r) => ({ scope, cols: r }));
}

// rules gathered across several messages live in fixtures/rules (no message.json), next to the per-message files
const ruleDirs = existsSync(resolve(fixturesRoot, 'rules')) ? [...dirs, 'rules'] : dirs;
const expressionById = new Map<string, string>();
const rulesByScope = new Map<string, { name: string; isoId: string; text: string; expression?: RuleExprIr }[]>();
for (const d of ruleDirs) {
  for (const f of filesMatching(d, /^constraint-expressions.*\.tsv$/)) {
    for (const { cols } of scopedRows(d, f)) if (cols[2]) expressionById.set(cols[0]!, cols[2]);
  }
}
for (const d of ruleDirs) {
  for (const f of filesMatching(d, /^constraints.*\.tsv$/)) {
    for (const { scope, cols } of scopedRows(d, f)) {
      const [id, name, text] = cols as [string, string, string];
      const list = rulesByScope.get(scope) ?? rulesByScope.set(scope, []).get(scope)!;
      if (list.some((r) => r.isoId === id)) continue;
      const xml = expressionById.get(id);
      list.push({ name, isoId: id, text, ...(xml ? { expression: parseExpression(xml, name) } : {}) });
    }
  }
}

// ---------------------------------------------------------------- type resolution
const ir = new Map<string, IrType>();

function regexOk(p: string, where: string): string {
  try {
    new RegExp(`^(?:${p})$`);
  } catch {
    problems.push(`pattern does not compile (${where}): ${p}`);
  }
  return p;
}

function simpleType(name: string): IrType {
  const r = simple.get(name)!;
  const [, , xsi, pattern, minLength, maxLength, totalDigits, fractionDigits, minInclusive] = r;
  const base: IrType = { name, kind: 'text', ...(r[1] && !r[1].startsWith('(') ? { isoId: r[1] } : {}) };
  switch (xsi) {
    case 'Text':
    case 'IdentifierSet':
      return {
        ...base,
        kind: 'text',
        ...(pattern ? { pattern: regexOk(pattern, name) } : {}),
        ...(minLength ? { minLength: num(minLength) } : {}),
        ...(maxLength ? { maxLength: num(maxLength) } : {}),
      };
    case 'Quantity':
    case 'Rate':
      return {
        ...base,
        kind: 'number',
        totalDigits: num(totalDigits),
        fractionDigits: num(fractionDigits),
        ...(minInclusive ? { minInclusive: num(minInclusive) } : {}),
      };
    case 'Date':
      return { ...base, kind: 'date' };
    case 'DateTime':
      return { ...base, kind: 'datetime' };
    case 'Time':
      return { ...base, kind: 'time' };
    case 'Year':
      return { ...base, kind: 'text', pattern: '\\d{4}' };
    case 'Indicator':
      return { ...base, kind: 'boolean' };
    case 'Binary':
      return { ...base, kind: 'text', ...(maxLength ? { maxLength: num(maxLength) } : {}) };
    case 'ExternalSchema':
      return { ...base, kind: 'any' };
    default:
      throw new Error(`unhandled simple type ${name} (${xsi})`);
  }
}

function codeType(name: string): IrType {
  const rows = codesets.get(name)!;
  const first = rows[0]!;
  const marker = first[3];
  if (marker === '*PATTERN*') {
    const p = /^(\S+)/.exec(first[4]!)![1]!;
    return { name, isoId: first[1], kind: 'code', pattern: regexOk(p, name) };
  }
  if (marker === '*EXTERNAL*') {
    const min = /minLength=(\d+)/.exec(first[4]!)?.[1];
    const max = /maxLength=(\d+)/.exec(first[4]!)?.[1];
    return {
      name,
      isoId: first[1],
      kind: 'code',
      external: true,
      ...(min ? { minLength: Number(min) } : {}),
      ...(max ? { maxLength: Number(max) } : {}),
    };
  }
  return {
    name,
    isoId: first[1],
    kind: 'code',
    options: rows
      .map((r) => ({ value: r[3]!, name: r[4]!, ...(codeIsoIds.has(`${name}\t${r[3]}`) ? { isoId: codeIsoIds.get(`${name}\t${r[3]}`)! } : {}) }))
      .sort((a, b) => a.value.localeCompare(b.value)),
  };
}

function amountType(name: string): IrType {
  const r = simple.get(name)!;
  const curMatch = /currencyIdentifierSet=(\w+)/.exec(r[10]!);
  if (!curMatch) {
    // The currency is implied by the context (no currency attribute on the wire): a plain decimal.
    return { name, isoId: r[1], kind: 'number', totalDigits: num(r[6]), fractionDigits: num(r[7]), minInclusive: num(r[8]) };
  }
  const cur = curMatch[1]!;
  const curPattern = codesets.get(cur)![0]![4]!.split(' ')[0]!;
  return {
    name,
    isoId: r[1],
    kind: 'amount',
    pattern: regexOk(curPattern, name),
    totalDigits: num(r[6]),
    fractionDigits: num(r[7]),
    minInclusive: num(r[8]),
  };
}

function toField(m: string[]): Field {
  // MEMBER parent id name xmlTag kind dataTypeName minOccurs maxOccurs definition
  const [, , memberId, name, xmlTag, , dataTypeName, minOccurs, maxOccurs] = m;
  const type = dataTypeName!;
  resolveType(type);
  return {
    name: name!,
    ...(memberId ? { isoId: memberId } : {}),
    xmlTag: xmlTag!,
    type,
    kind: ir.get(type)!.kind,
    min: num(minOccurs) ?? 0,
    max: maxOccurs === '*' || maxOccurs === '' ? null : Number(maxOccurs),
  };
}

function resolveType(name: string): void {
  if (ir.has(name)) return;
  const inDt = datatypes.has(name);
  const inCode = codesets.has(name);
  const inSimple = simple.has(name);
  // Amount types legitimately appear in both: DATATYPE row (it has members) and simple-types (constraints).
  const amountBoth = inDt && inSimple && !inCode && datatypes.get(name)![3] === 'Amount';
  if (!amountBoth && [inDt, inCode, inSimple].filter(Boolean).length > 1) problems.push(`ambiguous type name ${name}`);
  if (inDt) {
    const dt = datatypes.get(name)!;
    const kind = dt[3]!;
    if (kind === 'Amount') {
      ir.set(name, amountType(name));
    } else if (kind === 'Choice') {
      ir.set(name, { name, kind: 'choice' }); // placeholder, no cycles expected but guard anyway
      const choiceOptions = (members.get(name) ?? []).map(toField);
      if (choiceOptions.length === 0) problems.push(`choice ${name} has no variants: capture them into the fixtures`);
      ir.set(name, { name, isoId: dt[2]!, kind: 'choice', choiceOptions });
    } else {
      ir.set(name, { name, kind: 'component' });
      const fields = (members.get(name) ?? []).map(toField);
      ir.set(name, { name, isoId: dt[2]!, kind: 'component', fields });
    }
  } else if (inCode) {
    ir.set(name, codeType(name));
  } else if (inSimple) {
    ir.set(name, simpleType(name));
  } else {
    throw new Error(`unresolved type ${name}`);
  }
}

// each message: a synthetic root type holding its building blocks, then the types reachable from it
const closure = new Map<string, string[]>(); // message identifier -> types in dependency order
const rootName = new Map<string, string>();
for (const [, cfg] of configs) {
  const fields: Field[] = cfg.blocks.map((b) => {
    resolveType(b.type);
    return { name: b.name, isoId: b.isoId, xmlTag: b.xmlTag, type: b.type, kind: ir.get(b.type)!.kind, min: b.min, max: b.max };
  });
  ir.set(cfg.name, { name: cfg.name, ...(cfg.isoId ? { isoId: cfg.isoId } : {}), kind: 'component', fields });
  rootName.set(cfg.identifier, cfg.name);
}
for (const [scope, rules] of rulesByScope) {
  const t = ir.get(scope);
  if (t) t.rules = rules;
  else console.warn(`note: constraints for ${scope} are not used by any message and were skipped`);
}
if (problems.length > 0) {
  console.error('PROBLEMS:\n' + problems.join('\n'));
  process.exit(1);
}

function dependencyOrder(start: string[], keep: (n: string) => boolean): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (n: string): void => {
    if (seen.has(n) || !keep(n)) return;
    seen.add(n);
    const t = ir.get(n)!;
    for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) visit(f.type);
    out.push(n);
  };
  start.forEach(visit);
  return out;
}
for (const [, cfg] of configs) closure.set(cfg.identifier, dependencyOrder([cfg.name], () => true));

// which messages use each type, and so which types are shared
const usedBy = new Map<string, Set<string>>();
for (const [id, names] of closure) for (const n of names) (usedBy.get(n) ?? usedBy.set(n, new Set()).get(n)!).add(id);
const isShared = (n: string): boolean => (usedBy.get(n)?.size ?? 0) > 1;
const sharedOrder = dependencyOrder([...usedBy.keys()].filter(isShared).sort(), isShared);
const ownOrder = (cfg: MessageConfig): string[] => closure.get(cfg.identifier)!.filter((n) => !isShared(n));

// ---------------------------------------------------------------- emit helpers
const HEADER = '// GENERATED by tools/codegen-ts from the ISO 20022 MCP spec data. Do not edit.\n';
const q = (s: string): string => JSON.stringify(s);
const schemaName = (n: string): string => `${n}Schema`;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const writeOut = (rel: string, text: string): void => {
  const p = resolve(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
};

function tsLeaf(t: IrType): string {
  switch (t.kind) {
    case 'boolean':
      return "'true' | 'false'";
    case 'code':
      return t.options ? t.options.map((o) => q(o.value)).join(' | ') : 'string';
    default:
      return 'string';
  }
}

function fieldTs(f: Field, optionalMark: boolean): string {
  const t = ir.get(f.type)!;
  const base = t.kind === 'component' || t.kind === 'choice' || t.kind === 'amount' ? t.name : tsLeaf(t);
  const arr = f.max === 1 ? base : `Array<${base}>`;
  return `${f.name}${optionalMark && f.min === 0 ? '?' : ''}: ${arr};`;
}

function interfacesTs(names: string[]): string {
  let out = '';
  for (const n of names) {
    const t = ir.get(n)!;
    if (t.kind === 'component') {
      out += `export interface ${n} {\n${(t.fields ?? []).map((f) => '  ' + fieldTs(f, true)).join('\n')}\n}\n\n`;
    } else if (t.kind === 'choice') {
      const alts = (t.choiceOptions ?? []).map((f) => `{ ${fieldTs({ ...f, min: 1 }, false).replace(/;$/, '')} }`);
      out += `export type ${n} =\n  | ${alts.join('\n  | ')};\n\n`;
    } else if (t.kind === 'amount') {
      out += `export interface ${n} {\n  /** Currency code, serialized as the Ccy attribute. */\n  Ccy: string;\n  Value: string;\n}\n\n`;
    }
  }
  return out;
}

const opts = (parts: (string | false)[]): string => parts.filter(Boolean).join(', ');

function zodExpr(t: IrType): string {
  const textArgs = opts([
    t.minLength !== undefined && `min: ${t.minLength}`,
    t.maxLength !== undefined && `max: ${t.maxLength}`,
    t.pattern !== undefined && `pattern: ${q(t.pattern)}`,
  ]);
  switch (t.kind) {
    case 'text':
      return `textType({${textArgs}})`;
    case 'number':
      return `decimalType({${opts([
        t.totalDigits !== undefined && `totalDigits: ${t.totalDigits}`,
        t.fractionDigits !== undefined && `fractionDigits: ${t.fractionDigits}`,
        t.minInclusive !== undefined && `minInclusive: ${t.minInclusive}`,
      ])}})`;
    case 'date':
      return 'isoDate';
    case 'datetime':
      return 'isoDateTime';
    case 'time':
      return 'isoTime';
    case 'boolean':
      return 'indicator';
    case 'any':
      return 'anyXml';
    case 'code':
      return t.options ? `z.enum([${t.options.map((o) => q(o.value)).join(', ')}])` : `textType({${textArgs}})`;
    case 'amount':
      return `z.strictObject({ Ccy: textType({ pattern: ${q(t.pattern!)} }), Value: decimalType({ totalDigits: ${t.totalDigits}, fractionDigits: ${t.fractionDigits}, minInclusive: ${t.minInclusive} }) })`;
    default:
      throw new Error('unreachable');
  }
}

function fieldZod(f: Field): string {
  let e = schemaName(f.type);
  if (f.max !== 1) {
    e = `z.array(${e})`;
    if (f.min > 0) e += `.min(${f.min})`;
    if (f.max !== null) e += `.max(${f.max})`;
  }
  if (f.min === 0) e += '.optional()';
  return e;
}

function schemasTs(names: string[]): string {
  let out = '';
  for (const n of names) {
    const t = ir.get(n)!;
    if (t.kind === 'component') {
      out += `export const ${schemaName(n)} = z.strictObject({\n${(t.fields ?? []).map((f) => `  ${f.name}: ${fieldZod(f)},`).join('\n')}\n});\n\n`;
    } else if (t.kind === 'choice') {
      out += `export const ${schemaName(n)} = choiceOf({\n${(t.choiceOptions ?? []).map((f) => `  ${f.name}: ${fieldZod({ ...f, min: 1 })},`).join('\n')}\n});\n\n`;
    } else {
      out += `export const ${schemaName(n)} = ${zodExpr(t)};\n\n`;
    }
  }
  return out;
}

const descField = (f: Field): string => {
  const parts = [
    `name: ${q(f.name)}`,
    ...(f.isoId ? [`isoId: ${q(f.isoId)}`] : []),
    `xmlTag: ${q(f.xmlTag)}`,
    `displayName: displayName(${q(f.name)})`,
    `kind: ${q(f.kind)}`,
    `type: ${q(f.type)}`,
    `required: ${f.min > 0}`,
  ];
  if (f.max !== 1) parts.push(`repeat: { min: ${f.min}, max: ${f.max === null ? 'null' : f.max} }`);
  return `{ ${parts.join(', ')} }`;
};

function descriptorsTs(names: string[]): string {
  let out = '';
  for (const n of names) {
    const t = ir.get(n)!;
    const props = [`name: ${q(n)}`, ...(t.isoId ? [`isoId: ${q(t.isoId)}`] : []), `kind: ${q(t.kind)}`];
    for (const k of ['minLength', 'maxLength', 'totalDigits', 'fractionDigits', 'minInclusive'] as const) {
      if (t[k] !== undefined) props.push(`${k}: ${t[k]}`);
    }
    if (t.pattern !== undefined) props.push(`pattern: ${q(t.pattern)}`);
    if (t.external) props.push('external: true');
    if (t.options) props.push(`options: [${t.options.map((o) => `{ value: ${q(o.value)}, name: ${q(o.name)}${o.isoId ? `, isoId: ${q(o.isoId)}` : ''} }`).join(', ')}]`);
    if (t.fields) props.push(`fields: [\n${t.fields.map((x) => `      f(${descField(x)}),`).join('\n')}\n    ]`);
    if (t.choiceOptions) props.push(`choiceOptions: [\n${t.choiceOptions.map((x) => `      f(${descField({ ...x, min: 1 })}),`).join('\n')}\n    ]`);
    if (t.rules) props.push(`rules: [\n${t.rules.map((r) => `      { name: ${q(r.name)}${r.isoId ? `, isoId: ${q(r.isoId)}` : ''}, text: ${q(r.text)}${r.expression ? `, expression: ${JSON.stringify(r.expression)}` : ''} },`).join('\n')}\n    ]`);
    out += `  ${q(n)}: {\n    ${props.join(',\n    ')},\n  },\n`;
  }
  return out;
}

const ZOD_IMPORT = `import { z } from 'zod';\nimport {\n  anyXml,\n  choiceOf,\n  decimalType,\n  displayName,\n  indicator,\n  isoDate,\n  isoDateTime,\n  isoTime,\n  textType,\n  type FieldDescriptor,\n  type TypeDescriptors,\n} from '../runtime.ts';\n`;
const sharedCols = (names: string[]): string[] => names.filter(isShared);

// ---------------------------------------------------------------- emit IR (per message)
const irOut = resolve(root, 'tools/codegen-ts/ir');
mkdirSync(irOut, { recursive: true });
for (const [, cfg] of configs) {
  const order = closure.get(cfg.identifier)!;
  writeOut(
    `tools/codegen-ts/ir/${cfg.identifier}.json`,
    JSON.stringify({ message: cfg, root: cfg.name, order, types: Object.fromEntries(order.map((n) => [n, ir.get(n)])) }, null, 2) + '\n',
  );
}

// ---------------------------------------------------------------- emit types package
writeOut(
  'packages/types/src/generated/shared.ts',
  HEADER + '// Types used by more than one message. Leaf values are wire strings.\n\n' + (interfacesTs(sharedOrder) || 'export {};\n'),
);
const typesIndex: string[] = ["export * from './generated/shared.ts';"];
for (const [, cfg] of configs) {
  const own = ownOrder(cfg);
  const refsShared = new Set<string>();
  for (const n of own) {
    for (const f of [...(ir.get(n)!.fields ?? []), ...(ir.get(n)!.choiceOptions ?? [])]) {
      const t = ir.get(f.type)!;
      if (isShared(f.type) && (t.kind === 'component' || t.kind === 'choice' || t.kind === 'amount')) refsShared.add(f.type);
    }
  }
  const imp = refsShared.size ? `import type { ${[...refsShared].sort().join(', ')} } from './shared.ts';\n\n` : '';
  writeOut(
    `packages/types/src/generated/${cfg.out}.ts`,
    HEADER + `// ${cfg.identifier} (${cfg.name}). Leaf values are wire strings.\n` + imp + (imp ? '' : '\n') + interfacesTs(own) + `export type ${cap(cfg.out)}Document = ${cfg.name};\n`,
  );
  typesIndex.push(`export * from './generated/${cfg.out}.ts';`);
}
writeOut('packages/types/src/index.ts', typesIndex.join('\n') + '\n');

// ---------------------------------------------------------------- emit validate: shared + per message
const sharedDescriptors = descriptorsTs(sharedOrder);
writeOut(
  'packages/validate/src/generated/shared.ts',
  HEADER +
    ZOD_IMPORT +
    '\n// Types used by more than one message are defined once, here.\n\n' +
    schemasTs(sharedOrder) +
    'const f = (d: FieldDescriptor): FieldDescriptor => d;\n\n' +
    `export const sharedTypeDescriptors: TypeDescriptors = {\n${sharedDescriptors}};\n`,
);
writeOut(
  'packages/validate/src/generated/rulelists.ts',
  HEADER + `/** Code lists referenced by rule expressions that are not message types: set name -> wire values. */\nexport const ruleCodeLists: Record<string, string[]> = ${JSON.stringify(ruleCodeLists)};\n`,
);

for (const [, cfg] of configs) {
  const own = ownOrder(cfg);
  const all = closure.get(cfg.identifier)!;
  const shared = sharedCols(all);
  const importShared = shared.length ? `import {\n${shared.map((n) => `  ${schemaName(n)},`).join('\n')}\n  sharedTypeDescriptors,\n} from './shared.ts';\n` : '';
  const body =
    HEADER +
    ZOD_IMPORT +
    importShared +
    '\n' +
    schemasTs(own) +
    'const f = (d: FieldDescriptor): FieldDescriptor => d;\n\n' +
    `const ownTypeDescriptors: TypeDescriptors = {\n${descriptorsTs(own)}};\n\n` +
    `/** Descriptors for every type of ${cfg.identifier}, shared ones included. */\nexport const typeDescriptors: TypeDescriptors = {\n${shared.map((n) => `  ${q(n)}: sharedTypeDescriptors[${q(n)}]!,`).join('\n')}\n  ...ownTypeDescriptors,\n};\n\n` +
    `/** Schemas for every component/choice type, for editing a single type on its own. */\nexport const schemas = {\n${all
      .filter((n) => ['component', 'choice'].includes(ir.get(n)!.kind))
      .map((n) => `  ${q(n)}: ${schemaName(n)},`)
      .join('\n')}\n} as const;\n\n` +
    `export const ${cfg.out}Message = {\n  identifier: ${q(cfg.identifier)},\n  namespace: ${q(cfg.namespace)},\n  rootTag: 'Document',\n  bodyTag: ${q(cfg.bodyTag)},\n  rootType: ${q(cfg.name)},\n  schema: ${schemaName(cfg.name)},\n  typeDescriptors,\n} as const;\n`;
  writeOut(`packages/validate/src/generated/${cfg.out}.ts`, body);
}

// registry (lazy loaders) and the union of all descriptors
// "FIToFIPaymentStatusReportV16" -> "FI To FI Payment Status Report"
const title = (name: string): string => name.replace(/V\d+$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

// business areas (pain, pacs, ...): the first part of a message identifier. Their names and descriptions are fixtures/areas.json.
interface AreaFixture {
  code: string;
  name: string;
  isoId: string;
  definition: string;
}
const areas: AreaFixture[] = JSON.parse(readFileSync(resolve(fixturesRoot, 'areas.json'), 'utf8'));
const areaOf = (identifier: string): string => identifier.split('.')[0]!;
for (const c of configs.values()) if (!areas.some((x) => x.code === areaOf(c.identifier))) problems.push(`no business area ${areaOf(c.identifier)} in fixtures/areas.json for ${c.identifier}`);
// the order messages are listed in: by area (as in areas.json), then identifier
const listed = [...configs.values()].sort((x, y) => areas.findIndex((a) => a.code === areaOf(x.identifier)) - areas.findIndex((a) => a.code === areaOf(y.identifier)) || x.identifier.localeCompare(y.identifier));
if (problems.length > 0) {
  console.error('PROBLEMS:\n' + problems.join('\n'));
  process.exit(1);
}
writeOut(
  'packages/validate/src/generated/registry.ts',
  HEADER +
    "import type { ZodType } from 'zod';\nimport type { TypeDescriptors } from '../runtime.ts';\n\n" +
    'export interface MessageBundle {\n  message: { identifier: string; namespace: string; rootTag: string; bodyTag: string; rootType: string; schema: ZodType; typeDescriptors: TypeDescriptors };\n  schemas: Record<string, ZodType>;\n  typeDescriptors: TypeDescriptors;\n}\n\n' +
    'export interface AreaInfo {\n  /** The first part of a message identifier, e.g. `pain`. */\n  code: string;\n  name: string;\n  /** The repository\'s description of the business area. */\n  definition: string;\n}\n\nexport interface MessageInfo {\n  identifier: string;\n  name: string;\n  title: string;\n  /** Business area code (`pain`, `pacs`): the first part of the identifier. */\n  area: string;\n  /** Entry point under the validate package, e.g. `pain001` for `@beneficial-strategies/iso20022-validate/pain001`. */\n  module: string;\n  /** Loads the message on demand, so a page only downloads the messages it uses. */\n  load: () => Promise<MessageBundle>;\n}\n\n' +
    `export const areaIndex: readonly AreaInfo[] = [\n${areas
      .filter((a) => listed.some((c) => areaOf(c.identifier) === a.code))
      .map((a) => `  { code: ${q(a.code)}, name: ${q(a.name)}, definition: ${q(a.definition)} },`)
      .join('\n')}\n];\n\n` +
    `export const messageIndex: readonly MessageInfo[] = [\n${listed
      .map(
        (c) =>
          `  {\n    identifier: ${q(c.identifier)},\n    name: ${q(c.name)},\n    title: ${q(title(c.name))},\n    area: ${q(areaOf(c.identifier))},\n    module: ${q(c.out)},\n    load: () =>\n      import('./${c.out}.ts').then((m) => ({ message: m.${c.out}Message, schemas: m.schemas as unknown as Record<string, ZodType>, typeDescriptors: m.typeDescriptors })),\n  },`,
      )
      .join('\n')}\n];\n`,
);
writeOut(
  'packages/validate/src/generated/all.ts',
  HEADER +
    "// The descriptors of every message together. Loads every message: for tools and tests, not for pages.\nimport type { TypeDescriptors } from '../runtime.ts';\n" +
    [...configs.values()].map((c) => `import { typeDescriptors as ${c.out}Descriptors } from './${c.out}.ts';`).join('\n') +
    `\n\nexport const allTypeDescriptors: TypeDescriptors = {\n${[...configs.values()].map((c) => `  ...${c.out}Descriptors,`).join('\n')}\n};\n`,
);

// ---------------------------------------------------------------- emit definitions (all messages, one module)
// Spec prose for tooltips. Kept out of the descriptors so validation-only consumers don't pay for it.
// Sources: snapshot-raw.tsv (types + members; saved verbatim from the MCP) and, for Choice variants
// (which the snapshot omits), choice-defs.tsv; codedefs.tsv / codeset-defs.tsv for codes and code sets.
const typeDefs: Record<string, string> = {};
const fieldDefs: Record<string, string> = {};
const codeDefs: Record<string, string> = {};
const codeSetDefs: Record<string, string> = {};
for (const d of dirs) {
  for (const c of rowsOf(d, 'snapshot-raw.tsv')) {
    if (c[0] === 'DATATYPE' && ir.has(c[1]!)) typeDefs[c[2]!] = c[c.length - 1]!.trim();
    else if (c[0] === 'MEMBER' && ir.has(c[1]!)) fieldDefs[c[2]!] = c[c.length - 1]!.trim();
  }
  for (const c of rowsOf(d, 'choice-defs.tsv', true)) fieldDefs[c[1]!] = c.slice(3).join('\t').trim();
  for (const c of rowsOf(d, 'codedefs.tsv', true)) if (ir.has(c[0]!)) codeDefs[c[3]!] = c.slice(4).join('\t').trim();
  for (const c of rowsOf(d, 'codeset-defs.tsv', true)) if (ir.has(c[0]!)) codeSetDefs[c[1]!] = c.slice(2).join('\t').trim();
}
for (const cfg of configs.values()) if (cfg.isoId && cfg.definition) typeDefs[cfg.isoId] = cfg.definition;
const sortedEntries = (o: Record<string, string>): string =>
  Object.keys(o)
    .sort()
    .map((k) => `  ${q(k)}: ${q(o[k]!)},`)
    .join('\n');
writeOut(
  'packages/validate/src/generated/definitions.ts',
  HEADER +
    '// Definitions use `|` for line breaks and `||` for paragraph breaks, as returned by the MCP.\n' +
    '// All maps are keyed by ISO 20022 repository id (see isoId on the descriptors).\n' +
    `export const typeDefinitions: Record<string, string> = {\n${sortedEntries(typeDefs)}\n};\n\n` +
    `/** Keyed by element id. */\nexport const fieldDefinitions: Record<string, string> = {\n${sortedEntries(fieldDefs)}\n};\n\n` +
    `/** Keyed by code id. */\nexport const codeDefinitions: Record<string, string> = {\n${sortedEntries(codeDefs)}\n};\n\n` +
    `/** Keyed by code set id. */\nexport const codeSetDefinitions: Record<string, string> = {\n${sortedEntries(codeSetDefs)}\n};\n`,
);

// ---------------------------------------------------------------- summary
const count = (names: string[], k: string): number => names.filter((n) => ir.get(n)!.kind === k).length;
for (const [, cfg] of configs) {
  const all = closure.get(cfg.identifier)!;
  console.log(
    `${cfg.identifier}: ${all.length} types (${ownOrder(cfg).length} own, ${sharedCols(all).length} shared): ` +
      ['component', 'choice', 'amount', 'code', 'text', 'number', 'date', 'datetime', 'time', 'boolean', 'any'].map((k) => `${k}=${count(all, k)}`).join(' '),
  );
}
console.log(`shared by 2+ messages: ${sharedOrder.length} types. definitions: ${Object.keys(typeDefs).length} types, ${Object.keys(fieldDefs).length} fields, ${Object.keys(codeDefs).length} codes, ${Object.keys(codeSetDefs).length} code sets`);
