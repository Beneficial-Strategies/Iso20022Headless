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
    expect(all.length).toBe(320);
    expect(named('pass').length + named('fail').length).toBe(232);
  });

  it('cannot check four rules, and says why: two compare with a literal that is not a code value, two name a field that does not exist (spec typos)', () => {
    const reasons = Object.fromEntries(all.filter((x) => x.result.status === 'unsupported').map((x) => [`${x.type}.${x.rule}`, x.result.reason?.code]));
    expect(reasons).toEqual({
      'FIToFIPaymentReversalV14.TotalReversedInterbankSettlementAmountAndSumRule': 'rule_path_unknown',
      'PaymentInstruction50.ChargesAccountAgentRule': 'rule_literal_not_code_value',
      'PaymentInstruction51.ChargesAccountAgentRule': 'rule_literal_not_code_value',
      'PaymentReturnV15.TotalReturnedInterbankSettlementAmountAndSumRule': 'rule_path_unknown',
    });
  });

  it('has no machine form for guidelines, the supplementary-data rule, and seven more rules that exist only as prose in the spec', () => {
    const odd = named('prose-only').filter((n) => !/Guideline$|SupplementaryDataRule$/.test(n));
    expect(odd.sort()).toEqual([
      'CreditTransferTransaction73.InstructionForCreditorAgentRule', // the repository gives it in another rule language (UGRule), no expression
      'OriginalTransactionReference45.UnderlyingFinancialInstitutionCreditTransferRule',
      'OriginalTransactionReference45.UnderlyingCustomerCreditTransferRule',
      'PaymentInstruction48.ChequeInstructionRule',
      'PaymentInstruction48.CreditorAgentRule',
      'PaymentInstruction48.CreditorAndOrCreditorAgentRule',
      'PaymentInstruction48.PaymentTypeInformationRule',
    ].sort());
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
