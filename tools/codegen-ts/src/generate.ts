/**
 * Codegen: MCP-derived TSV fixtures -> JSON IR -> TypeScript interfaces + Zod schemas + descriptors.
 *
 * Inputs (fixtures/pain001-v13/, captured from the ISO 20022 MCP server):
 *   complex-types.tsv, simple-types.tsv, codesets.tsv, constraints-PaymentInstruction51.tsv
 * Outputs (committed):
 *   tools/codegen-ts/ir/pain.001.001.13.json
 *   packages/types/src/generated/pain001.ts
 *   packages/validate/src/generated/pain001.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = resolve(root, 'fixtures/pain001-v13');

// ---------------------------------------------------------------- message definition
// From the MCP: pain.001.001.13 (CustomerCreditTransferInitiationV13) building blocks.
const MESSAGE = {
  identifier: 'pain.001.001.13',
  name: 'CustomerCreditTransferInitiationV13',
  namespace: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.13',
  bodyTag: 'CstmrCdtTrfInitn',
  blocks: [
    { name: 'GroupHeader', xmlTag: 'GrpHdr', type: 'GroupHeader114', min: 1, max: 1 },
    { name: 'PaymentInformation', xmlTag: 'PmtInf', type: 'PaymentInstruction51', min: 1, max: null },
    { name: 'SupplementaryData', xmlTag: 'SplmtryData', type: 'SupplementaryData1', min: 0, max: null },
  ],
};

// ---------------------------------------------------------------- IR types
type Kind = 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'code' | 'amount' | 'any' | 'component' | 'choice';
interface Field {
  name: string;
  isoId?: string;
  xmlTag: string;
  type: string;
  kind: Kind;
  min: number;
  max: number | null;
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

// ---------------------------------------------------------------- parsing
const rowsOf = (file: string): string[][] =>
  readFileSync(resolve(fixtures, file), 'utf8')
    .split('\n')
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => l.split('\t'));

const num = (s: string | undefined): number | undefined => (s === undefined || s === '' ? undefined : Number(s));

const complexRows = rowsOf('complex-types.tsv').filter((r) => r[0] === 'DATATYPE' || r[0] === 'MEMBER');
const datatypes = new Map<string, string[]>();
const members = new Map<string, string[][]>();
for (const r of complexRows) {
  if (r[0] === 'DATATYPE') datatypes.set(r[1]!, r);
  else (members.get(r[1]!) ?? members.set(r[1]!, []).get(r[1]!)!).push(r);
}

const simple = new Map<string, string[]>();
for (const r of rowsOf('simple-types.tsv').slice(1)) simple.set(r[0]!, r);

const codeRows = rowsOf('codesets.tsv').slice(1);
const codesets = new Map<string, string[][]>();
for (const r of codeRows) (codesets.get(r[0]!) ?? codesets.set(r[0]!, []).get(r[0]!)!).push(r);

// ISO ids of individual codes, from codedefs.tsv (codeSet, code, enumName, isoId, text)
const codeIsoIds = new Map<string, string>();
if (existsSync(resolve(fixtures, 'codedefs.tsv'))) {
  for (const r of rowsOf('codedefs.tsv').slice(1)) codeIsoIds.set(`${r[0]}\t${r[1]}`, r[3]!);
}

const rulesFile = resolve(fixtures, 'constraints-PaymentInstruction51.tsv');
interface BooleanRuleIr {
  op: string;
  path: string;
  value?: string;
}
interface RuleExprIr {
  mustBe: { connector: 'AND' | 'OR'; rules: BooleanRuleIr[] };
  onCondition?: { connector: 'AND' | 'OR'; rules: BooleanRuleIr[] };
}

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

const expressionsFile = resolve(fixtures, 'constraint-expressions-PaymentInstruction51.tsv');
const expressionByName = new Map<string, string>();
if (existsSync(expressionsFile)) {
  for (const r of rowsOf('constraint-expressions-PaymentInstruction51.tsv').slice(1)) {
    if (r[2]) expressionByName.set(r[1]!, r[2]);
  }
}
const paymentInstructionRules = existsSync(rulesFile)
  ? rowsOf('constraints-PaymentInstruction51.tsv')
      .slice(1)
      .map((r) => {
        const xml = expressionByName.get(r[1]!);
        return { name: r[1]!, isoId: r[0]!, text: r[2]!, ...(xml ? { expression: parseExpression(xml, r[1]!) } : {}) };
      })
  : [];

// Code sets that expressions reference but that are not types in the message closure.
const ruleCodeLists: Record<string, string[]> = {};
const ruleCodeListsFile = resolve(fixtures, 'rule-codelists.tsv');
if (existsSync(ruleCodeListsFile)) {
  for (const r of rowsOf('rule-codelists.tsv').slice(1)) (ruleCodeLists[r[0]!] ??= []).push(r[1]!);
}

// ---------------------------------------------------------------- type resolution
const ir = new Map<string, IrType>();
const problems: string[] = [];

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
  const cur = /currencyIdentifierSet=(\w+)/.exec(r[10]!)![1]!;
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
  resolve_(type);
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

function resolve_(name: string): void {
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

// root
const rootName = MESSAGE.name;
const rootFields: Field[] = MESSAGE.blocks.map((b) => {
  resolve_(b.type);
  return { name: b.name, xmlTag: b.xmlTag, type: b.type, kind: ir.get(b.type)!.kind, min: b.min, max: b.max };
});
ir.set(rootName, { name: rootName, kind: 'component', fields: rootFields });
const pi = ir.get('PaymentInstruction51');
if (pi && paymentInstructionRules.length > 0) pi.rules = paymentInstructionRules;

if (problems.length > 0) {
  console.error('PROBLEMS:\n' + problems.join('\n'));
  process.exit(1);
}

// dependency order (post-order DFS from the root)
const order: string[] = [];
const seen = new Set<string>();
function visit(n: string): void {
  if (seen.has(n)) return;
  seen.add(n);
  const t = ir.get(n)!;
  for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) visit(f.type);
  order.push(n);
}
visit(rootName);

// ---------------------------------------------------------------- emit IR
const irOut = resolve(root, 'tools/codegen-ts/ir');
mkdirSync(irOut, { recursive: true });
writeFileSync(
  resolve(irOut, `${MESSAGE.identifier}.json`),
  JSON.stringify({ message: MESSAGE, root: rootName, order, types: Object.fromEntries(order.map((n) => [n, ir.get(n)])) }, null, 2) + '\n',
);

// ---------------------------------------------------------------- emit types
const HEADER = '// GENERATED by tools/codegen-ts from the ISO 20022 MCP spec data. Do not edit.\n';
const q = (s: string): string => JSON.stringify(s);

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

let typesTs = HEADER + `// ${MESSAGE.identifier} (${MESSAGE.name}). Leaf values are wire strings.\n\n`;
for (const n of order) {
  const t = ir.get(n)!;
  if (t.kind === 'component') {
    typesTs += `export interface ${n} {\n${(t.fields ?? []).map((f) => '  ' + fieldTs(f, true)).join('\n')}\n}\n\n`;
  } else if (t.kind === 'choice') {
    const alts = (t.choiceOptions ?? []).map((f) => `{ ${fieldTs({ ...f, min: 1 }, false).replace(/;$/, '')} }`);
    typesTs += `export type ${n} =\n  | ${alts.join('\n  | ')};\n\n`;
  } else if (t.kind === 'amount') {
    typesTs += `export interface ${n} {\n  /** Currency code, serialized as the Ccy attribute. */\n  Ccy: string;\n  Value: string;\n}\n\n`;
  }
}
typesTs += `export type Pain001Document = ${rootName};\n`;
writeFileSync(resolve(root, 'packages/types/src/generated/pain001.ts'), typesTs);

// ---------------------------------------------------------------- emit zod + descriptors
function zodExpr(t: IrType): string {
  switch (t.kind) {
    case 'text':
      return `textType({${[
        t.minLength !== undefined ? `min: ${t.minLength}` : '',
        t.maxLength !== undefined ? `max: ${t.maxLength}` : '',
        t.pattern !== undefined ? `pattern: ${q(t.pattern)}` : '',
      ]
        .filter(Boolean)
        .join(', ')}})`;
    case 'number':
      return `decimalType({${[
        t.totalDigits !== undefined ? `totalDigits: ${t.totalDigits}` : '',
        t.fractionDigits !== undefined ? `fractionDigits: ${t.fractionDigits}` : '',
        t.minInclusive !== undefined ? `minInclusive: ${t.minInclusive}` : '',
      ]
        .filter(Boolean)
        .join(', ')}})`;
    case 'date':
      return 'isoDate';
    case 'datetime':
      return 'isoDateTime';
    case 'boolean':
      return 'indicator';
    case 'any':
      return 'anyXml';
    case 'code':
      if (t.options) return `z.enum([${t.options.map((o) => q(o.value)).join(', ')}])`;
      return `textType({${[
        t.minLength !== undefined ? `min: ${t.minLength}` : '',
        t.maxLength !== undefined ? `max: ${t.maxLength}` : '',
        t.pattern !== undefined ? `pattern: ${q(t.pattern)}` : '',
      ]
        .filter(Boolean)
        .join(', ')}})`;
    case 'amount':
      return `z.strictObject({ Ccy: textType({ pattern: ${q(t.pattern!)} }), Value: decimalType({ totalDigits: ${t.totalDigits}, fractionDigits: ${t.fractionDigits}, minInclusive: ${t.minInclusive} }) })`;
    default:
      throw new Error('unreachable');
  }
}

const schemaName = (n: string): string => `${n}Schema`;

function fieldZod(f: Field): string {
  const t = ir.get(f.type)!;
  const ref = t.kind === 'component' || t.kind === 'choice' ? schemaName(t.name) : `${schemaName(t.name)}`;
  let e = ref;
  if (f.max !== 1) {
    e = `z.array(${e})`;
    if (f.min > 0) e += `.min(${f.min})`;
    if (f.max !== null) e += `.max(${f.max})`;
  }
  if (f.min === 0) e += '.optional()';
  return e;
}

let zodTs =
  HEADER +
  `import { z } from 'zod';\nimport {\n  anyXml,\n  choiceOf,\n  decimalType,\n  displayName,\n  indicator,\n  isoDate,\n  isoDateTime,\n  textType,\n  type FieldDescriptor,\n  type TypeDescriptors,\n} from '../runtime.ts';\n\n`;
for (const n of order) {
  const t = ir.get(n)!;
  if (t.kind === 'component') {
    zodTs += `export const ${schemaName(n)} = z.strictObject({\n${(t.fields ?? []).map((f) => `  ${f.name}: ${fieldZod(f)},`).join('\n')}\n});\n\n`;
  } else if (t.kind === 'choice') {
    zodTs += `export const ${schemaName(n)} = choiceOf({\n${(t.choiceOptions ?? []).map((f) => `  ${f.name}: ${fieldZod({ ...f, min: 1 })},`).join('\n')}\n});\n\n`;
  } else {
    zodTs += `export const ${schemaName(n)} = ${zodExpr(t)};\n\n`;
  }
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

zodTs += `const f = (d: FieldDescriptor): FieldDescriptor => d;\n\nexport const typeDescriptors: TypeDescriptors = {\n`;
for (const n of order) {
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
  zodTs += `  ${q(n)}: {\n    ${props.join(',\n    ')},\n  },\n`;
}
zodTs += `};\n\n`;
zodTs += `/** Code lists referenced by rule expressions that are not message types: set name -> wire values. */\nexport const ruleCodeLists: Record<string, string[]> = ${JSON.stringify(ruleCodeLists)};\n\n`;
zodTs += `/** Schemas for every component/choice type, for editing a single type on its own. */\nexport const schemas = {\n${order.filter((n) => ['component', 'choice'].includes(ir.get(n)!.kind)).map((n) => `  ${q(n)}: ${schemaName(n)},`).join('\n')}\n} as const;\n\n`;
zodTs += `export const pain001Message = {\n  identifier: ${q(MESSAGE.identifier)},\n  namespace: ${q(MESSAGE.namespace)},\n  rootTag: 'Document',\n  bodyTag: ${q(MESSAGE.bodyTag)},\n  rootType: ${q(rootName)},\n  schema: ${schemaName(rootName)},\n  typeDescriptors,\n} as const;\n`;
writeFileSync(resolve(root, 'packages/validate/src/generated/pain001.ts'), zodTs);

// ---------------------------------------------------------------- emit definitions (separate module)
// Spec prose for tooltips. Kept out of the descriptors so validation-only consumers don't pay for it.
// Sources: snapshot-raw.tsv (types + members; saved verbatim from the MCP) and, for Choice variants
// (which the snapshot omits), choice-defs.tsv (looked up per Choice and cross-checked).
const typeDefs: Record<string, string> = {};
const fieldDefs: Record<string, string> = {};
const snapshotFile = resolve(fixtures, 'snapshot-raw.tsv');
if (existsSync(snapshotFile)) {
  for (const l of readFileSync(snapshotFile, 'utf8').split('\n')) {
    if (!l || l.startsWith('#')) continue;
    const c = l.split('\t');
    if (c[0] === 'DATATYPE' && ir.has(c[1]!)) typeDefs[c[2]!] = c[c.length - 1]!.trim();
    else if (c[0] === 'MEMBER' && ir.has(c[1]!)) fieldDefs[c[2]!] = c[c.length - 1]!.trim();
  }
}
const choiceDefsFile = resolve(fixtures, 'choice-defs.tsv');
if (existsSync(choiceDefsFile)) {
  for (const l of readFileSync(choiceDefsFile, 'utf8').split('\n').slice(1)) {
    if (!l) continue;
    const c = l.split('\t');
    fieldDefs[c[1]!] = c.slice(3).join('\t').trim();
  }
}
// Code values: definition per code keyed `CodeSet.wireValue`, plus one definition per code set.
// Sources: codedefs.tsv / codeset-defs.tsv (get_code_set_details, double-captured and diffed).
const codeDefs: Record<string, string> = {};
const codeSetDefs: Record<string, string> = {};
const codeDefsFile = resolve(fixtures, 'codedefs.tsv');
if (existsSync(codeDefsFile)) {
  for (const l of readFileSync(codeDefsFile, 'utf8').split('\n').slice(1)) {
    if (!l) continue;
    const c = l.split('\t');
    if (ir.has(c[0]!)) codeDefs[c[3]!] = c.slice(4).join('\t').trim();
  }
}
const codeSetDefsFile = resolve(fixtures, 'codeset-defs.tsv');
if (existsSync(codeSetDefsFile)) {
  for (const l of readFileSync(codeSetDefsFile, 'utf8').split('\n').slice(1)) {
    if (!l) continue;
    const c = l.split('\t');
    if (ir.has(c[0]!)) codeSetDefs[c[1]!] = c.slice(2).join('\t').trim();
  }
}
const sortedEntries = (o: Record<string, string>): string =>
  Object.keys(o)
    .sort()
    .map((k) => `  ${q(k)}: ${q(o[k]!)},`)
    .join('\n');
writeFileSync(
  resolve(root, 'packages/validate/src/generated/pain001.definitions.ts'),
  HEADER +
    '// Definitions use `|` for line breaks and `||` for paragraph breaks, as returned by the MCP.\n' +
    '// All maps are keyed by ISO 20022 repository id (see isoId on the descriptors).\n' +
    `export const typeDefinitions: Record<string, string> = {\n${sortedEntries(typeDefs)}\n};\n\n` +
    `/** Keyed by element id. */\nexport const fieldDefinitions: Record<string, string> = {\n${sortedEntries(fieldDefs)}\n};\n\n` +
    `/** Keyed by code id. */\nexport const codeDefinitions: Record<string, string> = {\n${sortedEntries(codeDefs)}\n};\n\n` +
    `/** Keyed by code set id. */\nexport const codeSetDefinitions: Record<string, string> = {\n${sortedEntries(codeSetDefs)}\n};\n`,
);
console.log(
  `definitions: ${Object.keys(typeDefs).length} types, ${Object.keys(fieldDefs).length} fields, ` +
    `${Object.keys(codeDefs).length} codes, ${Object.keys(codeSetDefs).length} code sets`,
);

console.log(
  `generated ${order.length} types: ` +
    ['component', 'choice', 'amount', 'code', 'text', 'number', 'date', 'datetime', 'boolean', 'any']
      .map((k) => `${k}=${order.filter((n) => ir.get(n)!.kind === k).length}`)
      .join(' '),
);
