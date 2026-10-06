import { describe, expect, it } from 'vitest';
import { evaluateRules, ruleCodeLists, type RuleResult } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';

/**
 * Which business rules can the evaluator actually check? Every rule is classified without any data.
 * This pins the picture so a change in the spec data or the evaluator shows up here.
 */
const ctx = { types: allTypeDescriptors, codeLists: ruleCodeLists };

/** All rules on every type, each evaluated once against an empty instance of its own type. */
function classify(): { rule: string; type: string; result: RuleResult }[] {
  const out: { rule: string; type: string; result: RuleResult }[] = [];
  for (const t of Object.values(allTypeDescriptors)) {
    if (!t.rules?.length) continue;
    for (const r of evaluateRules(ctx, t.name, { __probe: true }).filter((x) => x.instancePath === '')) out.push({ rule: r.rule, type: t.name, result: r });
  }
  return out;
}

describe('business rule coverage', () => {
  const all = classify();
  const named = (status: string) => all.filter((r) => r.result.status === status).map((r) => `${r.type}.${r.rule}`);

  it('finds every rule and checks the machine-readable ones', () => {
    expect(all.length).toBe(149);
    expect(named('pass').length + named('fail').length).toBe(94);
  });

  it('cannot check exactly two rules: a literal that is not a code value, reported and never guessed', () => {
    expect(named('unsupported').sort()).toEqual(['PaymentInstruction50.ChargesAccountAgentRule', 'PaymentInstruction51.ChargesAccountAgentRule']);
    for (const r of all.filter((x) => x.result.status === 'unsupported')) expect(r.result.reason?.code).toBe('rule_literal_not_code_value');
  });

  it('has no machine form for guidelines, the supplementary-data rule, and four pain.013 cheque rules', () => {
    const odd = named('prose-only').filter((n) => !/Guideline$|SupplementaryDataRule$/.test(n));
    expect(odd.sort()).toEqual([
      'PaymentInstruction48.ChequeInstructionRule',
      'PaymentInstruction48.CreditorAgentRule',
      'PaymentInstruction48.CreditorAndOrCreditorAgentRule',
      'PaymentInstruction48.PaymentTypeInformationRule',
    ]);
  });

  it('has exactly one kind of rule with a list inside a list, and a behavior test for it', () => {
    // evaluateExpression handles /A[*]/B[*] (see rules.test.ts and pain002.test.ts). If another rule ever uses it,
    // this fails so that someone writes a behavior test for that rule too.
    const nested: string[] = [];
    for (const t of Object.values(allTypeDescriptors)) {
      for (const r of t.rules ?? []) {
        const paths = [...(r.expression?.mustBe.rules ?? []), ...(r.expression?.onCondition?.rules ?? [])].map((x) => x.path);
        if (paths.some((p) => (p.match(/\[\*\]/g) ?? []).length >= 2)) nested.push(r.name);
      }
    }
    expect([...new Set(nested)]).toEqual(['StatusReasonInformationRule']);
  });
});
