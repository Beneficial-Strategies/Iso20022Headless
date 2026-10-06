import { describe, expect, it } from 'vitest';
import { evaluateExpression, ruleCodeLists, type FieldDescriptor, type RuleDescriptor, type TypeDescriptor } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';

/**
 * A rule that can never fail (or never pass) is almost certainly mis-evaluated, which is how a bug in nested lists
 * once made a rule always pass. So for every machine-checkable rule, search small inputs built from the values the
 * rule mentions and require BOTH outcomes to be reachable.
 */
const ctx = { types: allTypeDescriptors, codeLists: ruleCodeLists };

const segsOf = (path: string) =>
  path.split('/').filter(Boolean).map((p) => {
    const m = /^(.*?)(?:\[(\*|\d+)\])?$/.exec(p)!;
    return { name: m[1]!, list: m[2] !== undefined };
  });

/** The type a rule path ends at, walking descriptors from the owner. */
function leafOf(owner: TypeDescriptor, path: string): TypeDescriptor | undefined {
  let t: TypeDescriptor | undefined = owner;
  for (const s of segsOf(path)) {
    const f: FieldDescriptor | undefined = [...(t?.fields ?? []), ...(t?.choiceOptions ?? [])].find((x) => x.name === s.name);
    if (!f) return undefined;
    t = allTypeDescriptors[f.type];
  }
  return t;
}

/** Put `value` at `path`, creating objects and one-element arrays on the way. */
function setAt(root: Record<string, unknown>, path: string, value: unknown): void {
  let cur: Record<string, unknown> = root;
  const segs = segsOf(path);
  segs.forEach((s, i) => {
    const last = i === segs.length - 1;
    if (s.list) {
      const arr = (cur[s.name] as Record<string, unknown>[] | undefined) ?? (cur[s.name] = [{}]);
      if (last) {
        if (arr[0] === undefined || Object.keys(arr[0]).length === 0) arr[0] = value as Record<string, unknown>;
      } else cur = arr[0] as Record<string, unknown>;
    } else if (last) {
      if (typeof cur[s.name] !== 'object' || cur[s.name] === null) cur[s.name] = value;
    } else {
      if (typeof cur[s.name] !== 'object' || cur[s.name] === null) cur[s.name] = {};
      cur = cur[s.name] as Record<string, unknown>;
    }
  });
}

interface Reach {
  rule: RuleDescriptor;
  type: string;
  pass: boolean;
  fail: boolean;
  tried: number;
}

function reach(t: TypeDescriptor, rule: RuleDescriptor): Reach | undefined {
  const e = rule.expression!;
  const ops = [...e.mustBe.rules, ...(e.onCondition?.rules ?? [])];
  const paths = [...new Set(ops.map((r) => r.path))];
  // candidate values for each path: absent, a generic value, and every code value the rule or the field knows
  const options = paths.map((p) => {
    const vals = new Set<string>(['x']);
    const leaf = leafOf(t, p);
    for (const o of leaf?.options ?? []) vals.add(o.value);
    for (const r of ops.filter((r) => r.path === p)) {
      if (r.value && ruleCodeLists[r.value]) for (const v of ruleCodeLists[r.value]!) vals.add(v);
      if (r.value && allTypeDescriptors[r.value]?.options) for (const o of allTypeDescriptors[r.value]!.options!) vals.add(o.value);
      if (leaf?.kind === 'boolean') (vals.add('true'), vals.add('false'));
    }
    vals.add('ZZZZ'); // a value in no list
    return [undefined, ...vals];
  });
  const out: Reach = { rule, type: t.name, pass: false, fail: false, tried: 0 };
  const total = options.reduce((n, o) => n * o.length, 1);
  const step = Math.max(1, Math.floor(total / 30000)); // sample when the space is large
  for (let n = 0; n < total; n += step) {
    let rest = n;
    const inst: Record<string, unknown> = {};
    options.forEach((o, i) => {
      const v = o[rest % o.length];
      rest = Math.floor(rest / o.length);
      if (v !== undefined) setAt(inst, paths[i]!, v);
    });
    try {
      const ok = evaluateExpression(ctx, t.name, e, inst);
      out[ok ? 'pass' : 'fail'] = true;
    } catch {
      return undefined; // unsupported rule: covered by rulecoverage.test.ts
    }
    out.tried++;
    if (out.pass && out.fail) break;
  }
  return out;
}

describe('every machine-checkable rule can both pass and fail', () => {
  const all: Reach[] = [];
  for (const t of Object.values(allTypeDescriptors)) {
    for (const rule of t.rules ?? []) {
      if (!rule.expression) continue;
      const r = reach(t, rule);
      if (r) all.push(r);
    }
  }

  it('covers every checkable rule', () => {
    expect(all.length).toBe(67);
  });

  it('none is stuck always passing or always failing', () => {
    const stuck = all.filter((r) => !(r.pass && r.fail)).map((r) => `${r.type}.${r.rule.name}: ${r.pass ? 'never fails' : 'never passes'} (${r.tried} tried)`);
    expect(stuck).toEqual([]);
  });
});
