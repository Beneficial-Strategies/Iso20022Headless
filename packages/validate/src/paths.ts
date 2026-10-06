import type { z } from 'zod';
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

type Issue = z.core.$ZodIssue;

function friendly(issue: Issue): string {
  switch (issue.code) {
    case 'invalid_type':
      return /undefined/.test(issue.message) || (issue as { input?: unknown }).input === undefined
        ? 'Required'
        : 'Invalid value';
    case 'invalid_format':
      return 'Invalid format';
    case 'too_small':
      return issue.origin === 'array'
        ? `At least ${String(issue.minimum)} required`
        : `Must be at least ${String(issue.minimum)} characters`;
    case 'too_big':
      return issue.origin === 'array'
        ? `At most ${String(issue.maximum)} allowed`
        : `Must be at most ${String(issue.maximum)} characters`;
    case 'invalid_value':
      return 'Not an allowed value';
    case 'invalid_union':
      return 'Select one option';
    case 'unrecognized_keys':
      return 'Not allowed here';
    default:
      return issue.message;
  }
}

/** First error per path, keyed by `A.B[0].C` paths, with plain-language messages. */
export function formatIssues(error: z.ZodError | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error?.issues ?? []) {
    const key = toPath(issue.path);
    if (!(key in out)) out[key] = friendly(issue);
  }
  return out;
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
