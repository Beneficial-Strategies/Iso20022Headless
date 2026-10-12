import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { emptySpec, type Spec } from './snapshot.ts';

/**
 * Reader for the ISO 20022 MCP's resources (`iso20022://dictionary/<Kind>/details` and `iso20022://element/<area>/details`).
 * Save every page as `<dir>/<Kind>/001.json, 002.json, ...` (the harness spills big pages to a file; that file is the input) and
 * point this at the directory. The result is the same `Spec` the snapshot reader makes, plus what the snapshot never had:
 * business rules with their expressions, code names and values, and the messages' identifiers and body tags.
 */

interface Node {
  id?: string;
  name?: string;
  xmlElementName: string;
  xsiType?: string;
  registrationStatus?: string;
  xmlTag?: string;
  minOccurs?: string;
  maxOccurs?: string;
  codeName?: string;
  definition?: string;
  isExternal?: boolean;
  hasMembers?: boolean;
  restrictionOf?: { id: string; name: string };
  externalValues?: { count: number; uri?: string };
  attributes?: Record<string, string>;
  references?: { relation: string; id: string; name: string }[];
  children?: Node[];
}

export interface RuleRow {
  scope: string;
  scopeId: string;
  id: string;
  name: string;
  text: string;
  /** The spec's RuleDefinition XML; absent for rules that are prose only (guidelines, some rules). */
  expression?: string;
}

export interface CodeRow {
  /** The wire value. */
  value: string;
  /** The enumeration name, e.g. `Cheque` for `CHK`. */
  name: string;
  isoId: string;
  status: string;
  definition: string;
}

export interface CodeSetInfo {
  name: string;
  isoId: string;
  definition: string;
  isExternal: boolean;
  hasMembers: boolean;
  restrictionOf?: string;
  pattern?: string;
  minLength?: string;
  maxLength?: string;
  length?: string;
  codes: CodeRow[];
  externalCount?: number;
}

export interface MessageInfo {
  name: string;
  isoId: string;
  identifier: string;
  bodyTag: string;
  area: string;
  status: string;
  definition: string;
}

export interface Resources {
  spec: Spec;
  rules: RuleRow[];
  codeSets: Map<string, CodeSetInfo>;
  messages: Map<string, MessageInfo>;
  /** Business areas by code (`camt`): name and definition. */
  areas: Map<string, { code: string; name: string; definition: string }>;
  /** The members of each component and choice in the order the resources list them, which is the specification's order. */
  memberOrder: Map<string, string[]>;
}

/** Dictionary kinds that become simple types (their constraints are attributes). */
const SIMPLE_KINDS = ['Text', 'Binary', 'Date', 'DateTime', 'IdentifierSet', 'Indicator', 'Quantity', 'Rate', 'Time', 'Year', 'YearMonth', 'Month'];
const IGNORED_ATTRIBUTES = new Set(['previousVersion', 'nextVersions', 'removalDate']);

const pagesOf = (dir: string, kind: string): Node[][] =>
  existsSync(join(dir, kind))
    ? readdirSync(join(dir, kind))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => {
          const page = JSON.parse(readFileSync(join(dir, kind, f), 'utf8')) as { data: { children: Node[] }; page: { total: number; returned: number } };
          return page.data.children;
        })
    : [];

/** A resource page file as saved: the `page` block says whether the set is complete. */
export function pageTotals(dir: string, kind: string): { files: number; returned: number; total: number } {
  let returned = 0;
  let total = 0;
  let files = 0;
  for (const f of existsSync(join(dir, kind)) ? readdirSync(join(dir, kind)).filter((x) => x.endsWith('.json')).sort() : []) {
    const p = (JSON.parse(readFileSync(join(dir, kind, f), 'utf8')) as { page: { total: number; returned: number } }).page;
    files++;
    returned += p.returned;
    total = p.total;
  }
  return { files, returned, total };
}

const typeRef = (n: Node): string | undefined => n.references?.find((r) => r.relation === 'type' || r.relation === 'simpleType' || r.relation === 'complexType')?.name;
/** The spec's text with `|` for each line break (the convention the committed fixtures and the generated definitions use); edges trimmed. */
const clean = (s: string | undefined): string => (s ?? '').replace(/\r\n|\r|\n/g, '|').replace(/^[\s|]+|[\s|]+$/g, '');
const id = (n: Node): string => n.id ?? '';
const status = (n: Node): string => n.registrationStatus ?? '';

/** A set of members of which at most one (or, when each is mandatory on its own, exactly one) may be present: the repository's `xors` constraint. */
interface ExclusiveGroup {
  id: string;
  name: string;
  text: string;
  /** Member names, in the order the component lists them. */
  members: string[];
  /** Exactly one must be present (each member is mandatory in the repository, and in ISO's schema they form a choice). */
  required: boolean;
}

function exclusiveGroups(component: Node, members: Node[]): ExclusiveGroup[] {
  const out: ExclusiveGroup[] = [];
  for (const x of component.children ?? []) {
    if (x.xmlElementName !== 'xors') continue;
    const named = new Set((x.references ?? []).filter((r) => r.relation === 'impactedElements').map((r) => r.name));
    const group = members.filter((m) => named.has(m.name ?? ''));
    if (group.length < 2) continue;
    out.push({ id: id(x), name: x.name ?? '', text: clean(x.definition), members: group.map((m) => m.name!), required: group.every((m) => (m.minOccurs ?? '1') !== '0') });
  }
  return out;
}

const XSI = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
const operand = (op: 'Presence' | 'Absence', member: string): string => `<BooleanRule xsi:type="${op}"><leftOperand>/${member}</leftOperand></BooleanRule>`;

/**
 * The rules of one exclusive group, in the rule language of the specification: one that at least one is present when exactly one must be,
 * and for every member but the last "if it is present, the later ones are not". All carry the repository's own text.
 */
function exclusiveRules(scope: string, g: ExclusiveGroup): RuleRow[] {
  const rows: RuleRow[] = [];
  const row = (suffix: string, expression: string): void => void rows.push({ scope, scopeId: '', id: suffix ? `${g.id}~${suffix}` : g.id, name: `${g.name}${suffix}`, text: g.text, expression });
  if (g.required) {
    row('', `<RuleDefinition><SimpleRule ${XSI} xsi:type="SimpleRule"><mustBe><connector>OR</connector>${g.members.map((m) => operand('Presence', m)).join('')}</mustBe></SimpleRule></RuleDefinition>`);
  }
  g.members.slice(0, -1).forEach((m, i) => {
    const later = g.members.slice(i + 1);
    const suffix = g.required ? `NotBoth${i === 0 ? '' : i + 1}` : i === 0 ? '' : String(i + 1);
    row(suffix, `<RuleDefinition><ComplexRule ${XSI} xsi:type="ComplexRule"><mustBe><connector>AND</connector>${later.map((l) => operand('Absence', l)).join('')}</mustBe><onCondition><connector>AND</connector>${operand('Presence', m)}</onCondition></ComplexRule></RuleDefinition>`);
  });
  return rows;
}

export function loadResources(dir: string, areaKinds: string[] = []): Resources {
  const spec = emptySpec();
  const rules: RuleRow[] = [];
  const codeSets = new Map<string, CodeSetInfo>();
  const messages = new Map<string, MessageInfo>();
  const areas = new Map<string, { code: string; name: string; definition: string }>();
  const memberOrder = new Map<string, string[]>();
  const warn = (s: string): void => void spec.warnings.push(s);

  const addRules = (scope: string, scopeId: string, parent: Node): void => {
    for (const c of parent.children ?? []) {
      if (c.xmlElementName !== 'constraint') continue;
      const expression = c.attributes?.expression;
      rules.push({ scope, scopeId, id: id(c), name: c.name ?? '', text: clean(c.definition), ...(expression ? { expression } : {}) });
    }
  };

  for (const e of pagesOf(dir, 'MessageComponent').flat()) {
    const name = e.name!;
    if (spec.components.has(name)) {
      warn(`duplicate component name ${name}`);
      continue;
    }
    spec.components.set(name, { name, isoId: id(e), status: status(e), checksum: '', definition: clean(e.definition) });
    const members = (e.children ?? []).filter((c) => c.xmlElementName === 'messageElement');
    const groups = exclusiveGroups(e, members);
    // a member of a group of which exactly one must be present is optional on its own: the group's rules say "one of them"
    const required = new Set(groups.filter((g) => g.required).flatMap((g) => g.members));
    // MSGELEMENT: parentName memberId memberName xmlTag typeName minOccurs maxOccurs status definition
    spec.elements.set(name, members.map((m) => [name, id(m), m.name!, m.xmlTag ?? '', typeRef(m) ?? '', required.has(m.name!) ? '0' : (m.minOccurs ?? ''), m.maxOccurs ?? '', status(m), clean(m.definition)]));
    memberOrder.set(name, members.map((m) => m.xmlTag ?? ''));
    addRules(name, id(e), e);
    for (const g of groups) rules.push(...exclusiveRules(name, g));
  }

  for (const e of pagesOf(dir, 'ChoiceComponent').flat()) {
    const name = e.name!;
    if (spec.choices.has(name)) {
      warn(`duplicate choice name ${name}`);
      continue;
    }
    spec.choices.set(name, { name, isoId: id(e), status: status(e), checksum: '', definition: clean(e.definition) });
    const members = (e.children ?? []).filter((c) => c.xmlElementName === 'messageElement');
    // VARIANT: choiceName variantId variantName xmlTag typeName status definition
    spec.variants.set(name, members.map((m) => [name, id(m), m.name!, m.xmlTag ?? '', typeRef(m) ?? '', status(m), clean(m.definition)]));
    memberOrder.set(name, members.map((m) => m.xmlTag ?? ''));
    addRules(name, id(e), e);
  }

  for (const e of pagesOf(dir, 'Amount').flat()) {
    spec.amounts.set(e.name!, { name: e.name!, isoId: id(e), status: status(e), checksum: '', definition: clean(e.definition) });
    const facets: Record<string, string> = { specType: 'Amount' };
    for (const [k, v] of Object.entries(e.attributes ?? {})) if (!IGNORED_ATTRIBUTES.has(k)) facets[k] = v;
    const set = e.references?.find((r) => r.relation === 'currencyIdentifierSet');
    if (set) facets.currencyIdentifierSet = set.id;
    spec.facets.set(e.name!, facets);
    addRules(e.name!, id(e), e);
  }

  for (const kind of SIMPLE_KINDS) {
    for (const e of pagesOf(dir, kind).flat()) {
      const name = e.name!;
      if (spec.simpleTypes.has(name)) {
        warn(`duplicate simple type name ${name}`);
        continue;
      }
      spec.simpleTypes.set(name, { name, isoId: id(e), definition: clean(e.definition) });
      const facets: Record<string, string> = { specType: kind };
      for (const [k, v] of Object.entries(e.attributes ?? {})) if (!IGNORED_ATTRIBUTES.has(k)) facets[k] = v;
      spec.facets.set(name, facets);
      addRules(name, id(e), e);
    }
  }
  for (const e of pagesOf(dir, 'ExternalSchema').flat()) {
    spec.externalSchemas.set(e.name!, { name: e.name!, isoId: id(e), definition: clean(e.definition) });
  }

  for (const e of pagesOf(dir, 'CodeSet').flat()) {
    const name = e.name!;
    if (codeSets.has(name)) {
      warn(`duplicate code set name ${name}`);
      continue;
    }
    const a = e.attributes ?? {};
    const info: CodeSetInfo = {
      name,
      isoId: id(e),
      definition: clean(e.definition),
      isExternal: e.isExternal === true,
      hasMembers: e.hasMembers === true,
      ...(e.restrictionOf ? { restrictionOf: e.restrictionOf.name } : {}),
      ...(e.externalValues ? { externalCount: e.externalValues.count } : {}),
      ...(a.pattern !== undefined ? { pattern: a.pattern } : {}),
      ...(a.minLength !== undefined ? { minLength: a.minLength } : {}),
      ...(a.maxLength !== undefined ? { maxLength: a.maxLength } : {}),
      ...(a.length !== undefined ? { length: a.length } : {}),
      codes: (e.children ?? [])
        .filter((c) => c.xmlElementName === 'code')
        .map((c) => ({ value: c.codeName ?? '', name: c.name ?? '', isoId: id(c), status: status(c), definition: clean(c.definition) })),
    };
    codeSets.set(name, info);
    spec.codeSets.set(name, { name, isoId: id(e), definition: info.definition });
    spec.codes.set(
      name,
      info.codes.map((c) => [name, c.isoId, c.value, c.status, '', c.definition]),
    );
    addRules(name, id(e), e);
  }

  // business areas: each page's `data.element` is the area, its children the messages
  for (const kind of areaKinds) {
    if (!existsSync(join(dir, kind))) continue;
    let area: Node | undefined; // only a catalogue entry's first page carries the entry itself
    for (const f of readdirSync(join(dir, kind)).filter((x) => x.endsWith('.json')).sort()) {
      const p = JSON.parse(readFileSync(join(dir, kind, f), 'utf8')) as { data: { element?: Node; children: Node[] } };
      area = p.data.element ?? area;
      if (!area) throw new Error(`${kind}/${f}: no business area on the first page`);
      areas.set(area.attributes?.code ?? '', { code: area.attributes?.code ?? '', name: area.name ?? '', definition: clean(area.definition) });
      for (const m of p.data.children) {
        if (m.xmlElementName !== 'messageDefinition') continue;
        const identifier = (m.children ?? []).find((c) => c.xmlElementName === 'messageDefinitionIdentifier')?.name ?? '';
        const info: MessageInfo = { name: m.name!, isoId: id(m), identifier, bodyTag: m.xmlTag ?? '', area: area!.name ?? '', status: status(m), definition: clean(m.definition) };
        messages.set(info.isoId, info);
        spec.messages.set(info.isoId, { name: info.name, isoId: info.isoId, area: info.area, status: info.status, definition: info.definition });
        // MSGBLOCK: messageName blockId blockName xmlTag componentName minOccurs maxOccurs status definition
        const blocks = (m.children ?? []).filter((c) => c.xmlElementName === 'messageBuildingBlock');
        const rows = blocks.map((b) => [m.name!, id(b), b.name!, b.xmlTag ?? '', typeRef(b) ?? '', b.minOccurs ?? '', b.maxOccurs ?? '', status(b), clean(b.definition)]);
        if (spec.blocks.has(m.name!)) warn(`duplicate message name ${m.name}`);
        else spec.blocks.set(m.name!, rows);
        memberOrder.set(`message:${info.isoId}`, blocks.map((b) => b.xmlTag ?? ''));
        addRules(m.name!, id(m), m);
      }
    }
  }
  return { spec, rules, codeSets, messages, areas, memberOrder };
}

export { SIMPLE_KINDS };
