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
    cur = (cur as Record<string, unknown>)[s.name];
    prefix += `/${s.name}`;
    if (s.each) {
      const i = binding.get(prefix);
      if (i === undefined || i < 0 || !Array.isArray(cur)) return undefined;
      cur = cur[i];
    } else if (s.index !== undefined) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[s.index - 1];
    }
  }
  return cur;
}

function evalRule(ctx: RuleContext, owner: string, r: BooleanRule, instance: unknown, binding: Map<string, number>): boolean {
  const segs = parseRulePath(r.path);
  const value = resolve(instance, segs, binding);
  switch (r.op) {
    case 'Presence':
      return value !== undefined;
    case 'Absence':
      return value === undefined;
    case 'EqualToValue':
    case 'DifferentFromValue': {
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

/** Every `[*]` prefix (`/A/B`) used by the rule, in first-seen order. */
function eachPrefixes(e: RuleExpression): string[] {
  const out: string[] = [];
  for (const g of [e.mustBe, e.onCondition]) {
    for (const r of g?.rules ?? []) {
      let prefix = '';
      for (const s of parseRulePath(r.path)) {
        prefix += `/${s.name}`;
        if (s.each && !out.includes(prefix)) out.push(prefix);
      }
    }
  }
  return out;
}

/** Reject rules we cannot check mechanically, independent of the data (so the status never depends on it). */
function assertSupported(ctx: RuleContext, owner: string, e: RuleExpression): void {
  for (const g of [e.mustBe, e.onCondition]) {
    for (const r of g?.rules ?? []) {
      if (r.op === 'EqualToValue' || r.op === 'DifferentFromValue') {
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
  const prefixes = eachPrefixes(e);
  const lengths = prefixes.map((p) => {
    const v = resolve(instance, parseRulePath(p), new Map());
    return Array.isArray(v) ? v.length : 0;
  });
  // Cartesian product over each `[*]` range; an empty range is checked once as "-1" (everything absent).
  let bindings: Map<string, number>[] = [new Map()];
  prefixes.forEach((p, i) => {
    const n = lengths[i]!;
    const idx = n === 0 ? [-1] : Array.from({ length: n }, (_, k) => k);
    bindings = bindings.flatMap((b) => idx.map((k) => new Map(b).set(p, k)));
  });
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
