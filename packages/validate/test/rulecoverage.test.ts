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
    expect(all.length).toBe(375);
    expect(named('pass').length + named('fail').length).toBe(270);
  });

  it('cannot check five rules, and says why: two compare with a literal that is not a code value, three name a field that does not exist (spec typos and a copied rule)', () => {
    const reasons = Object.fromEntries(all.filter((x) => x.result.status === 'unsupported').map((x) => [`${x.type}.${x.rule}`, x.result.reason?.code]));
    expect(reasons).toEqual({
      'FIToFIPaymentReversalV14.TotalReversedInterbankSettlementAmountAndSumRule': 'rule_path_unknown',
      'PaymentInstruction50.ChargesAccountAgentRule': 'rule_literal_not_code_value',
      'PaymentInstruction51.ChargesAccountAgentRule': 'rule_literal_not_code_value',
      'PaymentReturnV15.TotalReturnedInterbankSettlementAmountAndSumRule': 'rule_path_unknown',
      'UnderlyingTransaction37.GroupCancellationAndNumberOfTransactionsRule': 'rule_path_unknown', // counts TransactionInformation, which this type lacks (copied from UnderlyingTransaction36)
    });
  });

  it('has no machine form for guidelines, the supplementary-data rule, and twelve more rules that exist only as prose in the spec', () => {
    const odd = named('prose-only').filter((n) => !/Guideline$|SupplementaryDataRule$/.test(n));
    expect(odd.sort()).toEqual([
      'BankTransactionCodeStructure4.FamilyAndSubFamilyRule',
      'CashBalance8.ForwardBalanceAndAvailabilityRule',
      'CorporateActionEventType104Choice.EventTypeRule',
      'FinancialInstrumentQuantity33Choice.DigitalTokenUnitUsageRule',
      'SecurityIdentification19.DescriptionUsageRule',
      'CreditTransferTransaction73.InstructionForCreditorAgentRule', // the repository gives it in another rule language (UGRule), no expression
      'OriginalTransactionReference45.UnderlyingFinancialInstitutionCreditTransferRule',
      'OriginalTransactionReference45.UnderlyingCustomerCreditTransferRule',
      'PaymentInstruction48.ChequeInstructionRule',
      'PaymentInstruction48.CreditorAgentRule',
      'PaymentInstruction48.CreditorAndOrCreditorAgentRule',
      'PaymentInstruction48.PaymentTypeInformationRule',
    ].sort());
  });

  it('knows every rule with a list inside a list, and each has a behavior test', () => {
    // evaluateExpression handles /A[*]/B[*] (see rules.test.ts, pain002.test.ts and rules-camt.test.ts). If another rule ever uses it,
    // this fails so that someone writes a behavior test for that rule too. rule-satisfiability.test.ts proves each of these can both
    // pass and fail; rules-camt.test.ts tests the "a case may be given at one level only" shape by behavior, pain002.test.ts the status reasons.
    const nested: string[] = [];
    for (const t of Object.values(allTypeDescriptors)) {
      for (const r of t.rules ?? []) {
        const paths = [...(r.expression?.mustBe.rules ?? []), ...(r.expression?.onCondition?.rules ?? [])].map((x) => x.path);
        if (paths.some((p) => (p.match(/\[\*\]/g) ?? []).length >= 2)) nested.push(`${t.name}.${r.name}`);
      }
    }
    expect([...new Set(nested)].sort()).toEqual([
      'CustomerPaymentCancellationRequestV13.MessageOrPaymentInformationCaseRule',
      'CustomerPaymentCancellationRequestV13.MessageOrTransactionCaseRule',
      'FIToFIPaymentCancellationRequestV12.MessageOrTransactionCaseRule',
      'OriginalGroupHeader22.StatusReasonInformationRule',
      'OriginalGroupHeader23.CancellationStatusReasonInformationRule',
      'OriginalGroupInformation32.StatusReasonInformationRule',
      'OriginalPaymentInstruction54.CancellationStatusReasonInformationRule',
      'ResolutionOfInvestigationV14.MessageOrInterbankTransactionResolvedCaseRule',
      'ResolutionOfInvestigationV14.MessageOrPaymentInformationResolvedCaseRule',
      'UnderlyingTransaction35.GroupOrInitiationTransactionResolvedCaseRule',
      'UnderlyingTransaction37.GroupOrTransactionCaseRule',
      'ResolutionOfInvestigationV14.MessageOrInitiationTransactionResolvedCaseRule',
    ].sort());
  });
});
