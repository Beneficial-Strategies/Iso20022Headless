import type { Issue } from './messages.ts';
import { pruneEmpty, type BooleanRule, type RuleExpression, type RuleGroup, type TypeDescriptor, type TypeDescriptors } from './runtime.ts';

/**
 * Evaluator for the spec's machine-readable business rules (the `expression` of a Constraint).
 *
 * A rule belongs to a component type (e.g. PaymentInstruction51) and is evaluated against one
 * instance of it. Semantics: if `onCondition` is present and false, the rule is satisfied;
 * otherwise `mustBe` has to hold. Groups combine their BooleanRules with AND / OR.
 *
 * Paths are `/A/B[*]/C`, relative to the instance. `[*]` ranges over an array: the rule is checked
 * once per element (a rule holds only if it holds for every element); an empty or missing array is
 * checked once with everything under it absent. `[n]` picks one element, counting from 1 as in XPath
 * (`/A[1]` is the first A, so `Presence(/A[1])` means "there is at least one A").
 *
 * A literal `number of occurrences of A` (also written `Number Occurrences A`) is how many times `A` occurs.
 * A path `substring(/A/B,1,8)` is the first 8 characters of `/A/B` (positions count from 1, as in XPath).
 * A literal `sum of /A/B` is the exact decimal total of every occurrence of `/A/B` (an amount counts by its value).
 * `/A/@Currency` is the currency of an amount (its `Ccy`). `EqualToNode` / `DifferentFromNode` compare two fields; as in
 * XPath, comparing with a field that is absent is false for both.
 *
 * The spec writes code values by NAME (`Cheque`); our values are wire strings (`CHK`). Literals are
 * mapped through the code set of the field being compared. A literal comparison on a field that is
 * not a code (e.g. the pseudo-literal "Branch of DebtorAgent" against a Name) cannot be checked
 * mechanically, so that rule is reported `unsupported`, never a false pass or fail.
 */

export type RuleStatus = 'pass' | 'fail' | 'unsupported' | 'prose-only';

export interface RuleResult {
  /** Path of the component instance the rule was checked against, e.g. `PaymentInformation[0]`. */
  instancePath: string;
  rule: string;
  /** ISO id of the constraint (key for translations of its text). */
  isoId?: string;
  status: RuleStatus;
  /** The spec's prose for the rule. */
  text: string;
  /** Why a rule is unsupported, as a code plus parameters (localize with `formatIssue`). */
  reason?: Issue;
}

export interface RuleContext {
  types: TypeDescriptors;
  /** Extra code lists referenced by expressions (set name -> wire values). */
  codeLists?: Record<string, string[]>;
}

interface Seg {
  name: string;
  each: boolean;
  /** 1-based position, for `[n]`. */
  index?: number;
}

const parseRulePath = (path: string): Seg[] =>
  path
    .split('/')
    .filter(Boolean)
    .map((p): Seg => {
      const m = /^(.*?)(?:\[(\*|\d+)\])?$/.exec(p)!;
      return { name: m[1]!, each: m[2] === '*', ...(m[2] && m[2] !== '*' ? { index: Number(m[2]) } : {}) };
    });

class Unsupported extends Error {
  constructor(readonly issue: Issue) {
    super(issue.code);
  }
}

/** Type descriptor of the field a path ends at, walking descriptors from the owning type. */
function leafType(ctx: RuleContext, owner: string, segs: Seg[]): TypeDescriptor | undefined {
  let t: TypeDescriptor | undefined = ctx.types[owner];
  for (const s of segs) {
    const f = [...(t?.fields ?? []), ...(t?.choiceOptions ?? [])].find((x) => x.name === s.name);
    if (!f) return undefined;
    t = ctx.types[f.type];
  }
  return t;
}

/** Resolve a path in an instance. `binding` gives the index for each `[*]` segment prefix. */
function resolve(instance: unknown, segs: Seg[], binding: Map<string, number>): unknown {
  let cur: unknown = instance;
  let prefix = '';
  for (const s of segs) {
    if (cur === undefined || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[s.name === '@Currency' ? 'Ccy' : s.name]; // the currency attribute of an amount
    prefix += `/${s.name}`;
    if (s.each) {
      const i = binding.get(prefix);
      if (i === undefined || i < 0 || !Array.isArray(cur)) return undefined;
      cur = cur[i];
    } else if (s.index !== undefined) {
      // `[1]` on an element that occurs at most once (the spec writes it so, e.g. OriginalGroupInformationAndStatus[1]) is that element
      if (!Array.isArray(cur)) {
        if (s.index !== 1) return undefined;
      } else cur = cur[s.index - 1];
    }
  }
  return cur;
}

/** A path without its leading slash is relative to the same root, so `A/B` means `/A/B`. */
const rooted = (p: string): string => (p.startsWith('/') ? p : `/${p}`);

/** `sum of /A/B`: the path whose occurrences are added up. */
const sumPath = (literal: string | undefined): string | undefined => {
  const m = /^sum of\s+(\S+)$/i.exec(literal ?? '');
  return m ? rooted(m[1]!) : undefined;
};

/** `number of occurrences of A` / `Number Occurrences A`: the path whose occurrences are counted. */
const countPath = (literal: string | undefined): string | undefined => {
  const m = /^(?:number of occurrences of|number occurrences)\s+(\S+)$/i.exec(literal ?? '');
  return m ? rooted(m[1]!) : undefined;
};

/** `substring(/A/B,1,8)`: the path inside, and which characters to take. */
const SUBSTRING = /^substring\(\s*(\S+?)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/;
const innerPath = (path: string): string => SUBSTRING.exec(path)?.[1] ?? path;

/** Every value at a path, across all occurrences of every list on the way (no `[*]` needed). */
function collectAll(instance: unknown, segs: Seg[]): unknown[] {
  let level: unknown[] = [instance];
  for (const s of segs) {
    const next: unknown[] = [];
    for (const node of level) {
      if (node === undefined || node === null) continue;
      const v = (node as Record<string, unknown>)[s.name === '@Currency' ? 'Ccy' : s.name];
      for (const item of Array.isArray(v) ? v : [v]) if (item !== undefined) next.push(item);
    }
    level = next;
  }
  return level;
}

/** A decimal (or an amount's value) as digits and a scale, so sums are exact. Undefined if it is not a decimal. */
function decimalOf(v: unknown): { n: bigint; scale: number } | undefined {
  const text = typeof v === 'object' && v !== null ? (v as { Value?: unknown }).Value : v;
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(text ?? ''));
  if (!m) return undefined;
  const frac = m[3] ?? '';
  return { n: BigInt(`${m[1]}${m[2]}${frac}`), scale: frac.length };
}

/** Is the value at the left of a `sum of` rule equal to the exact sum of the occurrences at the path? */
function equalsSum(value: unknown, occurrences: unknown[]): boolean {
  const total = decimalOf(value);
  if (!total) return false;
  const parts = occurrences.map(decimalOf);
  if (parts.some((p) => p === undefined)) return false;
  const scale = Math.max(total.scale, ...parts.map((p) => p!.scale));
  const up = (d: { n: bigint; scale: number }): bigint => d.n * 10n ** BigInt(scale - d.scale);
  return up(total) === parts.reduce((sum, p) => sum + up(p!), 0n);
}

function evalRule(ctx: RuleContext, owner: string, r: BooleanRule, instance: unknown, binding: Map<string, number>): boolean {
  const sub = SUBSTRING.exec(r.path);
  const segs = parseRulePath(sub ? sub[1]! : r.path);
  let value = resolve(instance, segs, binding);
  if (sub) value = typeof value === 'string' ? value.slice(Number(sub[2]) - 1, Number(sub[2]) - 1 + Number(sub[3])) : undefined;
  switch (r.op) {
    case 'Presence':
      return value !== undefined;
    case 'Absence':
      return value === undefined;
    case 'EqualToValue':
    case 'DifferentFromValue': {
      const sum = sumPath(r.value);
      if (sum !== undefined) {
        if (value === undefined) return false;
        const equal = equalsSum(value, collectAll(instance, parseRulePath(sum)));
        return r.op === 'EqualToValue' ? equal : !equal;
      }
      const count = countPath(r.value);
      if (count !== undefined) {
        if (value === undefined) return false;
        const equal = /^\d+$/.test(String(value)) && BigInt(String(value)) === BigInt(collectAll(instance, parseRulePath(count)).length);
        return r.op === 'EqualToValue' ? equal : !equal;
      }
      if (sub) {
        // a piece of text: compare with the literal as written (it is not a code)
        if (value === undefined) return false;
        return r.op === 'EqualToValue' ? value === r.value : value !== r.value;
      }
      const t = leafType(ctx, owner, segs);
      const wire =
        t?.kind === 'code'
          ? t.options?.find((o) => o.name === r.value || o.value === r.value)?.value
          : t?.kind === 'boolean' && ['true', 'false', '1', '0'].includes(r.value ?? '')
            ? r.value // indicators are written as "true"/"false" (or "1"/"0")
            : undefined;
      if (wire === undefined) throw new Unsupported({ code: 'rule_literal_not_code_value', params: { value: r.value, path: r.path } });
      if (value === undefined) return false;
      return r.op === 'EqualToValue' ? value === wire : value !== wire;
    }
    case 'EqualToNode':
    case 'DifferentFromNode': {
      const other = resolve(instance, parseRulePath(r.value ?? ''), binding);
      if (value === undefined || other === undefined) return false; // nothing to compare: neither equal nor different
      return r.op === 'EqualToNode' ? String(value) === String(other) : String(value) !== String(other);
    }
    case 'WithInList':
    case 'NotWithInList': {
      const list = ctx.codeLists?.[r.value ?? ''] ?? ctx.types[r.value ?? '']?.options?.map((o) => o.value);
      if (!list) throw new Unsupported({ code: 'rule_code_list_unavailable', params: { list: r.value } });
      if (value === undefined) return false;
      return r.op === 'WithInList' ? list.includes(String(value)) : !list.includes(String(value));
    }
    default:
      throw new Unsupported({ code: 'rule_operator_unsupported', params: { op: String(r.op) } });
  }
}

function evalGroup(ctx: RuleContext, owner: string, g: RuleGroup, instance: unknown, binding: Map<string, number>): boolean {
  const results = g.rules.map((r) => evalRule(ctx, owner, r, instance, binding));
  return g.connector === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

/**
 * Every `[*]` list used by the rule, outer lists before the lists inside them: the prefix (`/A/B`, which keys the
 * binding) and the path to the list itself, whose own marker is dropped so that resolving it yields the array.
 */
function eachLists(e: RuleExpression): { prefix: string; segs: Seg[] }[] {
  const out: { prefix: string; segs: Seg[] }[] = [];
  for (const g of [e.mustBe, e.onCondition]) {
    for (const r of g?.rules ?? []) {
      for (const path of [innerPath(r.path), ...(r.op === 'EqualToNode' || r.op === 'DifferentFromNode' ? [r.value ?? ''] : [])]) {
        const segs = parseRulePath(path);
        let prefix = '';
        segs.forEach((s, i) => {
          prefix += `/${s.name}`;
          if (s.each && !out.some((l) => l.prefix === prefix)) out.push({ prefix, segs: segs.slice(0, i + 1).map((x, j) => (j === i ? { ...x, each: false } : x)) });
        });
      }
    }
  }
  return out;
}

/** Does a rule path name real fields of the type? (`/A/@Currency` is valid after an amount.) */
function pathExists(ctx: RuleContext, owner: string, path: string): boolean {
  let t: TypeDescriptor | undefined = ctx.types[owner];
  for (const s of parseRulePath(path)) {
    if (s.name === '@Currency') return t?.kind === 'amount';
    const f = [...(t?.fields ?? []), ...(t?.choiceOptions ?? [])].find((x) => x.name === s.name);
    if (!f) return false;
    t = ctx.types[f.type];
  }
  return t !== undefined;
}

/** Reject rules we cannot check mechanically, independent of the data (so the status never depends on it). */
function assertSupported(ctx: RuleContext, owner: string, e: RuleExpression): void {
  for (const g of [e.mustBe, e.onCondition]) {
    for (const r of g?.rules ?? []) {
      // a path that is not a field (a typo in the spec, say) would read as "absent" for ever and give wrong answers
      const named = [innerPath(r.path), ...(r.op === 'EqualToNode' || r.op === 'DifferentFromNode' ? [r.value ?? ''] : []), ...[sumPath(r.value), countPath(r.value)].filter((x): x is string => x !== undefined)];
      for (const p of named) if (!pathExists(ctx, owner, p)) throw new Unsupported({ code: 'rule_path_unknown', params: { path: p } });
      if ((r.op === 'EqualToValue' || r.op === 'DifferentFromValue') && sumPath(r.value) === undefined && countPath(r.value) === undefined && !SUBSTRING.test(r.path)) {
        const t = leafType(ctx, owner, parseRulePath(r.path));
        const known =
          (t?.kind === 'code' && t.options?.some((o) => o.name === r.value || o.value === r.value)) ||
          (t?.kind === 'boolean' && ['true', 'false', '1', '0'].includes(r.value ?? ''));
        if (!known) throw new Unsupported({ code: 'rule_literal_not_code_value', params: { value: r.value, path: r.path } });
      } else if (r.op === 'WithInList' || r.op === 'NotWithInList') {
        if (!ctx.codeLists?.[r.value ?? ''] && !ctx.types[r.value ?? '']?.options) {
          throw new Unsupported({ code: 'rule_code_list_unavailable', params: { list: r.value } });
        }
      }
    }
  }
}

/** Evaluate one expression against one instance. Throws `Unsupported` for rules that cannot be checked. */
export function evaluateExpression(ctx: RuleContext, owner: string, e: RuleExpression, instance: unknown): boolean {
  assertSupported(ctx, owner, e);
  // One binding per combination of elements of the `[*]` lists. A list inside another is measured within each chosen
  // element of the outer one; an empty (or missing) list is checked once as "-1", meaning everything under it is absent.
  let bindings: Map<string, number>[] = [new Map()];
  for (const { prefix, segs } of eachLists(e)) {
    bindings = bindings.flatMap((b) => {
      const v = resolve(instance, segs, b);
      const n = Array.isArray(v) ? v.length : 0;
      const idx = n === 0 ? [-1] : Array.from({ length: n }, (_, k) => k);
      return idx.map((k) => new Map(b).set(prefix, k));
    });
  }
  return bindings.every((b) => {
    if (e.onCondition && !evalGroup(ctx, owner, e.onCondition, instance, b)) return true;
    return evalGroup(ctx, owner, e.mustBe, instance, b);
  });
}

/** Find every instance of component type `target` inside `values`, with its path. */
export function findInstances(
  types: TypeDescriptors,
  rootType: string,
  values: unknown,
  target: string,
): { path: string; value: unknown }[] {
  const out: { path: string; value: unknown }[] = [];
  const walk = (typeName: string, value: unknown, path: string): void => {
    if (value === undefined || value === null) return;
    const t = types[typeName];
    if (!t) return;
    if (typeName === target) out.push({ path, value });
    const fields = t.kind === 'choice' ? t.choiceOptions : t.fields;
    if (t.kind !== 'component' && t.kind !== 'choice') return;
    for (const f of fields ?? []) {
      const v = (value as Record<string, unknown>)[f.name];
      if (v === undefined) continue;
      const base = path === '' ? f.name : `${path}.${f.name}`;
      if (Array.isArray(v)) v.forEach((item, i) => walk(f.type, item, `${base}[${i}]`));
      else walk(f.type, v, base);
    }
  };
  walk(rootType, values, '');
  return out;
}

/**
 * Check every business rule of every type that has rules, for every instance in `values`.
 * `values` may be raw form state; empty strings/arrays/objects are treated as absent.
 */
export function evaluateRules(ctx: RuleContext, rootType: string, values: unknown): RuleResult[] {
  const pruned = pruneEmpty(values) ?? {};
  const results: RuleResult[] = [];
  for (const [typeName, t] of Object.entries(ctx.types)) {
    if (!t.rules?.length) continue;
    for (const inst of findInstances(ctx.types, rootType, pruned, typeName)) {
      for (const rule of t.rules) {
        const base = { instancePath: inst.path, rule: rule.name, ...(rule.isoId ? { isoId: rule.isoId } : {}), text: rule.text };
        if (!rule.expression) {
          results.push({ ...base, status: 'prose-only' });
          continue;
        }
        try {
          const ok = evaluateExpression(ctx, typeName, rule.expression, inst.value);
          results.push({ ...base, status: ok ? 'pass' : 'fail' });
        } catch (e) {
          if (!(e instanceof Unsupported)) throw e;
          results.push({ ...base, status: 'unsupported', reason: e.issue });
        }
      }
    }
  }
  return results;
}
