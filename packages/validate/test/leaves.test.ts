import { describe, expect, it } from 'vitest';
import type { FieldDescriptor, TypeDescriptor, TypeDescriptors } from '../src/index.ts';
import { messageIndex } from '../src/index.ts';

const bundles = await Promise.all(messageIndex.map((m) => m.load()));

/**
 * Does validation reach every leaf of the hierarchy? For every leaf field, at every place it can occur
 * (a shared type is visited once per use), plant an invalid value at just that spot and require the
 * schema to report an issue at exactly that path.
 */

interface Leaf {
  /** Path segments as zod reports them (array items are numbers). */
  path: (string | number)[];
  field: FieldDescriptor;
  type: TypeDescriptor;
}

const childrenOf = (t: TypeDescriptor): FieldDescriptor[] => (t.kind === 'choice' ? t.choiceOptions : t.fields) ?? [];

function collectLeaves(types: TypeDescriptors, rootType: string): Leaf[] {
  const out: Leaf[] = [];
  const walk = (typeName: string, path: (string | number)[], stack: string[]): void => {
    for (const f of childrenOf(types[typeName]!)) {
      const t = types[f.type]!;
      const here = [...path, f.name, ...(f.repeat ? [0] : [])];
      if (t.kind === 'component' || t.kind === 'choice') {
        if (!stack.includes(f.type)) walk(f.type, here, [...stack, f.type]);
      } else out.push({ path: here, field: f, type: t });
    }
  };
  walk(rootType, [], [rootType]);
  return out;
}

/** Wrap a value in the objects/arrays that lead to it. Nothing else is filled in. */
const nest = (path: (string | number)[], value: unknown): unknown =>
  path.reduceRight<unknown>((inner, seg) => (typeof seg === 'number' ? [inner] : { [seg]: inner }), value);

/** Invalid values for a leaf: a wrong JSON type always, plus one breaking each constraint the descriptor states. */
function invalidValues(t: TypeDescriptor): unknown[] {
  const bad: unknown[] = [123];
  if (t.kind === 'code' && t.options) bad.push('NOT_A_CODE');
  if (t.kind === 'date' || t.kind === 'datetime') bad.push('nope');
  if (t.kind === 'boolean') bad.push('maybe');
  if (t.kind === 'number') bad.push('abc');
  if (t.minLength) bad.push('');
  if (t.maxLength) bad.push('a'.repeat(t.maxLength + 1));
  if (t.pattern) {
    const re = new RegExp(`^(?:${t.pattern})$`);
    const miss = ['!!', '\u0001', '~', 'a', '1', ''].find((c) => !re.test(c));
    if (miss !== undefined) bad.push(miss);
  }
  return bad;
}

/** Issues from the schema, including those nested inside failed Choice alternatives. */
function allIssues(issues: readonly any[], prefix: (string | number)[] = []): string[] {
  const out: string[] = [];
  for (const i of issues) {
    const p = [...prefix, ...i.path];
    out.push(p.join('.'));
    if (i.code === 'invalid_union') for (const alt of i.errors ?? []) out.push(...allIssues(alt, p));
  }
  return out;
}

const reported = (schema: { safeParse(v: unknown): any }, value: unknown): string[] => {
  const r = schema.safeParse(value);
  return r.success ? [] : allIssues(r.error.issues);
};

describe.each(bundles.map((b) => b.message))('every leaf is validated in $identifier', (message) => {
  const types = message.typeDescriptors as TypeDescriptors;
  const leaves = collectLeaves(types, message.rootType);

  it('covers a substantial number of leaf positions', () => {
    expect(leaves.length).toBeGreaterThan(60);
  });

  it('rejects a wrong JSON type at every leaf position', () => {
    const misses = leaves
      .filter((l) => !reported(message.schema, nest(l.path, 123)).includes(l.path.join('.')))
      .map((l) => l.path.join('.'));
    expect(misses).toEqual([]);
  });

  it('rejects every kind of constraint violation the descriptor states, at every leaf position', () => {
    const misses: string[] = [];
    let checks = 0;
    for (const l of leaves) {
      for (const bad of invalidValues(l.type)) {
        checks++;
        if (!reported(message.schema, nest(l.path, bad)).includes(l.path.join('.'))) {
          misses.push(`${l.path.join('.')} = ${JSON.stringify(bad).slice(0, 40)} (${l.type.name})`);
        }
      }
    }
    expect(checks).toBeGreaterThan(leaves.length);
    expect(misses).toEqual([]);
  });

  it('checks both parts of every amount', () => {
    const amounts = leaves.filter((l) => l.type.kind === 'amount');
    expect(amounts.length).toBeGreaterThan(0);
    for (const a of amounts) {
      expect(reported(message.schema, nest(a.path, { Ccy: 'eur', Value: '1' }))).toContain([...a.path, 'Ccy'].join('.'));
      expect(reported(message.schema, nest(a.path, { Ccy: 'EUR', Value: 'abc' }))).toContain([...a.path, 'Value'].join('.'));
    }
  });
});
