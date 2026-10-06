import { z } from 'zod';

/**
 * Hand-written runtime used by the generated schemas and descriptors.
 *
 * Value model: every leaf value is the wire string (what ends up in the XML text node).
 * Components are plain objects keyed by ISO element name; repeatable elements are arrays;
 * a Choice is an object holding exactly one variant key; an Amount is { Ccy, Value }.
 */

export type FieldKind =
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'code'
  | 'amount'
  | 'any'
  | 'component'
  | 'choice';

export interface FieldDescriptor {
  /** ISO element name; also the key in the value object. */
  name: string;
  xmlTag: string;
  displayName: string;
  kind: FieldKind;
  /** Key into the typeDescriptors map. */
  type: string;
  required: boolean;
  /** Present when maxOccurs !== 1. max === null means unbounded. */
  repeat?: { min: number; max: number | null };
}

export interface TypeDescriptor {
  name: string;
  kind: FieldKind;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  totalDigits?: number;
  fractionDigits?: number;
  minInclusive?: number;
  /** Code sets: allowed wire values. Absent for external or pattern-only sets. */
  options?: { value: string; name: string }[];
  /** External code set: values are maintained outside ISO 20022 and not enumerated here. */
  external?: boolean;
  /** component: ordered fields. */
  fields?: FieldDescriptor[];
  /** choice: the alternatives. Exactly one may be present. */
  choiceOptions?: FieldDescriptor[];
  /** Business rules that cannot be expressed structurally: spec prose, plus the machine-readable form when the spec has one. */
  rules?: RuleDescriptor[];
}

export type RuleOp = 'Presence' | 'Absence' | 'EqualToValue' | 'DifferentFromValue' | 'WithInList' | 'NotWithInList';

export interface BooleanRule {
  op: RuleOp;
  /** Path relative to the owning component, e.g. `/CreditTransferTransactionInformation[*]/CreditorAgent`. */
  path: string;
  /** Literal (code NAME, as in the spec) or, for list ops, the name of a code set. */
  value?: string;
}

export interface RuleGroup {
  connector: 'AND' | 'OR';
  rules: BooleanRule[];
}

export interface RuleExpression {
  mustBe: RuleGroup;
  /** Rule applies only when this holds; absent means unconditional. */
  onCondition?: RuleGroup;
}

export interface RuleDescriptor {
  name: string;
  text: string;
  /** Absent for spec "Guidelines", which are prose only. */
  expression?: RuleExpression;
}

export type TypeDescriptors = Record<string, TypeDescriptor>;

export function displayName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

const anchored = (pattern: string): RegExp => new RegExp(`^(?:${pattern})$`);

export function textType(c: { min?: number; max?: number; pattern?: string }): z.ZodString {
  let s = z.string();
  if (c.min !== undefined) s = s.min(c.min);
  if (c.max !== undefined) s = s.max(c.max);
  if (c.pattern !== undefined) s = s.regex(anchored(c.pattern));
  return s;
}

export function decimalType(c: {
  totalDigits?: number;
  fractionDigits?: number;
  minInclusive?: number;
}): z.ZodType<string> {
  return z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, 'Must be a decimal number')
    .superRefine((v, ctx) => {
      const [int = '', frac = ''] = v.replace('-', '').split('.');
      if (c.fractionDigits !== undefined && frac.length > c.fractionDigits) {
        ctx.addIssue({ code: 'custom', message: `At most ${c.fractionDigits} fraction digits` });
      }
      if (c.totalDigits !== undefined && int.length + frac.length > c.totalDigits) {
        ctx.addIssue({ code: 'custom', message: `At most ${c.totalDigits} digits in total` });
      }
      if (c.minInclusive !== undefined && Number(v) < c.minInclusive) {
        ctx.addIssue({ code: 'custom', message: `Must be at least ${c.minInclusive}` });
      }
    });
}

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/, 'Must be YYYY-MM-DD');
export const isoDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
    'Must be YYYY-MM-DDThh:mm:ss[.fff][Z|±hh:mm]',
  );
export const isoYear = z.string().regex(/^\d{4}$/, 'Must be a 4-digit year');
export const indicator = z.enum(['true', 'false']);
export const anyXml = z.string().min(1);

/** Exactly one variant key, which is what an ISO Choice means. */
export function choiceOf<const K extends string>(variants: Record<K, z.ZodType>) {
  const alternatives = (Object.keys(variants) as K[]).map((k) =>
    z.strictObject({ [k]: variants[k] } as Record<K, z.ZodType>),
  );
  return z.union(alternatives as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
}

/**
 * Form inputs yield '' for "nothing entered". Drop empty strings, empty arrays and empty
 * objects so that optional ISO elements are genuinely absent before validation/serialization.
 */
export function pruneEmpty<T>(value: T): T | undefined {
  if (typeof value === 'string') return (value === '' ? undefined : value) as T | undefined;
  if (Array.isArray(value)) {
    const items = value.map(pruneEmpty).filter((v) => v !== undefined);
    return (items.length === 0 ? undefined : items) as T | undefined;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, pruneEmpty(v)] as const)
      .filter(([, v]) => v !== undefined);
    return (entries.length === 0 ? undefined : Object.fromEntries(entries)) as T | undefined;
  }
  return value;
}
