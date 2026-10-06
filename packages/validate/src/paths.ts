import type { z } from 'zod';
import { ISSUE_CODES, en, formatIssue, type Issue, type IssueCode, type MessageParams, type ValidationMessages } from './messages.ts';
import type { FieldDescriptor, TypeDescriptors } from './runtime.ts';

/**
 * Path syntax shared by the whole library (same as TanStack Form): `A.B[0].C`.
 * Pure helpers over plain JSON values; nothing here depends on a form library.
 */
export type Segment = string | number;

export function parsePath(path: string): Segment[] {
  const out: Segment[] = [];
  for (const part of path.split('.')) {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!m) throw new Error(`bad path segment ${part}`);
    if (m[1]) out.push(m[1]);
    for (const idx of m[2]!.matchAll(/\[(\d+)\]/g)) out.push(Number(idx[1]));
  }
  return out;
}

export function toPath(segments: readonly (string | number | symbol)[]): string {
  return segments.reduce<string>((acc, s) => {
    if (typeof s === 'number') return `${acc}[${s}]`;
    return acc === '' ? String(s) : `${acc}.${String(s)}`;
  }, '');
}

export function getIn(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const s of parsePath(path)) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<Segment, unknown>)[s];
  }
  return cur;
}

/** Immutable set; creates intermediate objects/arrays as needed. */
export function setIn<T>(value: T, path: string, next: unknown): T {
  const segs = parsePath(path);
  const rec = (cur: unknown, i: number): unknown => {
    if (i === segs.length) return next;
    const s = segs[i]!;
    const base: Record<Segment, unknown> | unknown[] = Array.isArray(cur)
      ? [...cur]
      : cur && typeof cur === 'object'
        ? { ...(cur as object) }
        : typeof s === 'number'
          ? []
          : {};
    (base as Record<Segment, unknown>)[s] = rec((base as Record<Segment, unknown>)[s], i + 1);
    return base;
  };
  return rec(value, 0) as T;
}

export function removeIn<T>(value: T, path: string): T {
  const segs = parsePath(path);
  const last = segs[segs.length - 1]!;
  const parentPath = toPath(segs.slice(0, -1));
  const parent = parentPath === '' ? value : getIn(value, parentPath);
  if (parent === undefined || parent === null) return value;
  let nextParent: unknown;
  if (Array.isArray(parent) && typeof last === 'number') nextParent = parent.filter((_, i) => i !== last);
  else {
    const { [last as string]: _omit, ...rest } = parent as Record<string, unknown>;
    nextParent = rest;
  }
  return parentPath === '' ? (nextParent as T) : setIn(value, parentPath, nextParent);
}

/** The value a newly added/included element of the given type starts with. */
export function emptyValue(types: TypeDescriptors, typeName: string): unknown {
  const t = types[typeName];
  if (!t) throw new Error(`unknown type ${typeName}`);
  if (t.kind === 'component') return initialValue(types, typeName);
  if (t.kind === 'choice') return {};
  if (t.kind === 'amount') return { Ccy: '', Value: '' };
  return '';
}

/** Initial form values: required components exist (so their leaves can be edited), optionals are absent. */
export function initialValue(types: TypeDescriptors, typeName: string): Record<string, unknown> {
  const t = types[typeName];
  if (!t) throw new Error(`unknown type ${typeName}`);
  const out: Record<string, unknown> = {};
  for (const f of t.fields ?? []) {
    if (!f.required) continue;
    out[f.name] = f.repeat ? [emptyField(types, f)] : emptyField(types, f);
  }
  return out;
}

function emptyField(types: TypeDescriptors, f: FieldDescriptor): unknown {
  return emptyValue(types, f.type);
}

type ZodIssue = z.core.$ZodIssue;

const KNOWN = new Set<string>(ISSUE_CODES);

/** Map a Zod issue to a library issue: a code plus parameters, with no wording. */
function toIssue(issue: ZodIssue): Issue {
  switch (issue.code) {
    case 'invalid_type':
      return { code: (issue as { input?: unknown }).input === undefined || /undefined/.test(issue.message) ? 'required' : 'invalid_type' };
    case 'invalid_format':
      // validators in runtime.ts name their own format codes via the message
      return { code: KNOWN.has(issue.message) ? (issue.message as IssueCode) : 'invalid_format' };
    case 'too_small':
      return issue.origin === 'array'
        ? { code: 'too_few_items', params: { min: Number(issue.minimum) } }
        : { code: 'too_short', params: { min: Number(issue.minimum) } };
    case 'too_big':
      return issue.origin === 'array'
        ? { code: 'too_many_items', params: { max: Number(issue.maximum) } }
        : { code: 'too_long', params: { max: Number(issue.maximum) } };
    case 'invalid_value':
      return { code: 'not_allowed_value' };
    case 'invalid_union':
      return { code: 'select_one' };
    case 'unrecognized_keys':
      return { code: 'not_allowed_here' };
    case 'custom': {
      const params = (issue as { params?: MessageParams }).params;
      return { code: KNOWN.has(issue.message) ? (issue.message as IssueCode) : 'invalid', ...(params ? { params } : {}) };
    }
    default:
      return { code: 'invalid' };
  }
}

/** First problem per path (`A.B[0].C`), as codes and parameters. Localize with `formatIssue`. */
export function collectIssues(error: z.ZodError | undefined): Record<string, Issue> {
  const out: Record<string, Issue> = {};
  for (const issue of error?.issues ?? []) {
    const key = toPath(issue.path);
    if (!(key in out)) out[key] = toIssue(issue);
  }
  return out;
}

/** First error per path, as display text from the given catalog (English by default). */
export function formatIssues(error: z.ZodError | undefined, messages: ValidationMessages = en): Record<string, string> {
  return Object.fromEntries(Object.entries(collectIssues(error)).map(([k, v]) => [k, formatIssue(v, messages)]));
}

/**
 * Resolve the descriptor for a field path like `PaymentInformation[0].Debtor.Name`.
 * Array indices are skipped; amount sub-values (`Ccy` / `Value`) resolve to the amount field.
 */
export function descriptorAt(
  types: TypeDescriptors,
  rootType: string,
  path: string,
): FieldDescriptor | undefined {
  let current = types[rootType];
  let found: FieldDescriptor | undefined;
  for (const seg of parsePath(path)) {
    if (typeof seg === 'number') continue;
    if (found && types[found.type]?.kind === 'amount') return found;
    const candidates = [...(current?.fields ?? []), ...(current?.choiceOptions ?? [])];
    found = candidates.find((f) => f.name === seg);
    if (!found) return undefined;
    current = types[found.type];
  }
  return found;
}

/**
 * Prepare form state for validation. Empty strings count as "not entered", but required components stay
 * in place (even empty) so that each missing required field reports its own error at its own path,
 * instead of one "Required" on the whole group. Optional components that are empty disappear, as does
 * anything the user has not filled in. For serialization use `pruneEmpty`, which drops all empties.
 */
export function pruneForValidation(types: TypeDescriptors, typeName: string, value: unknown, required = true): unknown {
  const t = types[typeName];
  if (value === '' || value === undefined || value === null) return required && t && (t.kind === 'component' || t.kind === 'amount') ? {} : undefined;
  if (!t || (t.kind !== 'component' && t.kind !== 'choice' && t.kind !== 'amount')) return value;
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (t.kind === 'amount') {
    for (const k of ['Ccy', 'Value']) if (typeof src[k] === 'string' && src[k] !== '') out[k] = src[k];
    return out;
  }

  if (t.kind === 'choice') {
    // only the alternative that was actually selected; none selected stays `{}` ("select one")
    for (const f of t.choiceOptions ?? []) {
      if (f.name in src) out[f.name] = pruneForValidation(types, f.type, src[f.name], true);
    }
    return out;
  }

  for (const f of t.fields ?? []) {
    const v = src[f.name];
    if (f.repeat) {
      if (v === undefined) {
        if (f.required && f.repeat.min > 0) out[f.name] = [];
        continue;
      }
      out[f.name] = (Array.isArray(v) ? v : []).map((item) => pruneForValidation(types, f.type, item, true));
    } else {
      const pv = pruneForValidation(types, f.type, v, f.required);
      if (pv !== undefined) out[f.name] = pv;
    }
  }
  // A component that is present (required, or ticked "Include") stays even if empty, so its
  // own required fields report errors. Absent optional components are simply absent.
  return out;
}
