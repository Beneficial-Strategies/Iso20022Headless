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
    expect(all.length).toBe(617);
    expect(named('pass').length + named('fail').length).toBe(432);
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

  it('has no machine form for guidelines, the supplementary-data rule, and seventy-eight more rules that exist only as prose in the spec', () => {
    const odd = named('prose-only').filter((n) => !/Guideline$|SupplementaryDataRule$/.test(n));
    expect(odd.sort()).toEqual([
      'AccountNotification26.TotalAmountAndAmount2Rule',
      'BankTransactionCodeStructure4.FamilyAndSubFamilyRule',
      'BreakdownByUserDefinedParameter3.UserDefinedRule',
      'BusinessInformationCriteria1.ReturnCriteriaAndOrSearchCriteriaRule',
      'CashBalance8.ForwardBalanceAndAvailabilityRule',
      'CorporateActionEventType104Choice.EventTypeRule',
      'CreditTransferTransaction73.InstructionForCreditorAgentRule', // the repository gives it in another rule language (UGRule), no expression
      'DocumentNumber5Choice.ShortLongNumberRule',
      'EstimatedFundCashForecast5.ExceptionalCashFlowIndicatorRule',
      'EstimatedFundCashForecast6.ExceptionalCashFlowIndicatorRule',
      'Extension1.ExtensionRule',
      'FinancialInstrumentQuantity33Choice.DigitalTokenUnitUsageRule',
      'FundCashForecast6.ExceptionalCashFlowIndicatorRule',
      'FundCashForecast7.ExceptionalCashFlowIndicatorRule',
      'IntraBalance5.AdditionalDetailsRule',
      'IntraBalance5.BalanceFromToRule',
      'IntraBalanceCancellation7.CashAccountOwnerRule',
      'IntraBalanceCancellation7.CashAccountRule',
      'IntraBalanceCancellation7.CashAccountServicerRule',
      'IntraBalanceCancellation7.ProcessingStatusRule',
      'IntraBalanceModification7.CashAccountOwnerRule',
      'IntraBalanceModification7.CashAccountRule',
      'IntraBalanceModification7.CashAccountServicerRule',
      'IntraBalanceModification7.ProcessingStatusRule',
      'IntraBalanceMovement7.NoAccountOwnerTransactionIdentificationRule',
      'IntraBalanceMovementCancellationReportV02.ActivityIndicatorNoRule',
      'IntraBalanceMovementCancellationReportV02.ActivityIndicatorYesRule',
      'IntraBalanceMovementCancellationReportV02.QueryTypeFullRule',
      'IntraBalanceMovementCancellationReportV02.QueryTypeStatusRule',
      'IntraBalanceMovementModificationReportV02.ActivityIndicatorNoRule',
      'IntraBalanceMovementModificationReportV02.ActivityIndicatorYesRule',
      'IntraBalanceMovementModificationReportV02.QueryTypeFullRule',
      'IntraBalanceMovementModificationReportV02.QueryTypeStatusRule',
      'IntraBalanceMovementPendingReportV02.ActivityIndicatorNoRule',
      'IntraBalanceMovementPendingReportV02.ActivityIndicatorYesRule',
      'IntraBalanceMovementPostingReportV02.ActivityIndicatorNoRule',
      'IntraBalanceMovementPostingReportV02.ActivityIndicatorYesRule',
      'IntraBalanceMovementQueryResponseV02.ActivityIndicatorNoRule',
      'IntraBalanceMovementQueryResponseV02.ActivityIndicatorYesRule',
      'IntraBalanceMovementQueryResponseV02.QueryTypeFullRule',
      'IntraBalanceMovementQueryResponseV02.QueryTypeStatusRule',
      'IntraBalanceMovements4.CashAccountOwnerRule',
      'IntraBalanceMovements4.CashAccountRule',
      'IntraBalanceMovements4.CashAccountServicerRule',
      'IntraBalanceMovements4.StatusAndReasonRule',
      'IntraBalancePending5.StatusAndReasonRule',
      'IntraBalancePending6.NoAccountOwnerTransactionIdentificationRule',
      'IntraBalancePosting6.NoAccountOwnerTransactionIdentificationRule',
      'IntraBalanceReport5.ReportNumberRule',
      'IntraBalanceReport6.ReportNumberRule',
      'IntraBalanceType3.BalanceFromToRule',
      'InvestigationRequestAction1.ObjectionActionRule',
      'MemberCriteria4.ReturnCriteriaAndOrSearchCriteriaRule',
      'ModifyMemberV04.MandatoryValueRule',
      'MovementReport1.ReportIdentificationRule',
      'NetObligation4.CounterpartyIdentificationRule',
      'NetObligation4.CounterpartySettlementInstructionRule',
      'NetReportV04.CounterpartyIdentificationRule',
      'NumberCount1Choice.CurrentInstructionNumberRule',
      'OriginalNotificationReference15.TotalAmountAndAmount2Rule',
      'OriginalNotificationReference16.TotalAmountAndAmount2Rule',
      'OriginalTransactionReference45.UnderlyingCustomerCreditTransferRule',
      'OriginalTransactionReference45.UnderlyingFinancialInstitutionCreditTransferRule',
      'PaymentInstruction48.ChequeInstructionRule',
      'PaymentInstruction48.CreditorAgentRule',
      'PaymentInstruction48.CreditorAndOrCreditorAgentRule',
      'PaymentInstruction48.PaymentTypeInformationRule',
      'ProcessingPosition7Choice.WithLinkageRule',
      'ProprietaryReason4.AdditionalReasonInforrmationRule',
      'ReportHeader6.MessagePaginationRule',
      'RequestDetails22.ModificationRequestPresenceRule',
      'RequestDetails22.OtherProcessingRule',
      'SecurityIdentification19.DescriptionUsageRule',
      'SettlementStatus16Choice.PendingToFailingRule',
      'StandingOrder10.ModifyStandingOrderValueSetRule',
      'StructuredLongPostalAddress1.StreetNameAndOrPostOfficeBoxRule',
      'TotalNumber1.CurrentInstructionNumberRule',
      'TransactionIdentifications24.NoAccountOwnerTransactionIdentificationRule',
    ].sort());
  });

  it('knows every rule with a list inside a list, and each has a behavior test', () => {
    // evaluateExpression handles /A[*]/B[*] (see rules.test.ts, pain002.test.ts and rules-camt.test.ts). If another rule ever uses it,
    // this fails so that someone writes a behavior test for that rule too. rule-satisfiability.test.ts proves each of these can both
    // pass and fail; rules-camt.test.ts tests the "a case may be given at one level only" shape by behavior, pain002.test.ts the status reasons, rules-camt-batch2.test.ts the charges and related-account rules.
    const nested: string[] = [];
    for (const t of Object.values(allTypeDescriptors)) {
      for (const r of t.rules ?? []) {
        const paths = [...(r.expression?.mustBe.rules ?? []), ...(r.expression?.onCondition?.rules ?? [])].map((x) => x.path);
        if (paths.some((p) => (p.match(/\[\*\]/g) ?? []).length >= 2)) nested.push(`${t.name}.${r.name}`);
      }
    }
    expect([...new Set(nested)].sort()).toEqual([
      'ChargesPaymentNotificationV03.ChargesAccountHeaderOrType1Rule',
      'ChargesPaymentNotificationV03.ChargesAccountHeaderOrType2Rule',
      'ChargesPaymentRequestV03.ChargesAccountAgentHeaderOrType1Rule',
      'ChargesPaymentRequestV03.ChargesAccountAgentHeaderOrType2Rule',
      'ChargesPaymentRequestV03.ChargesRequestorGroupHeaderRule',
      'CustomerPaymentCancellationRequestV13.MessageOrPaymentInformationCaseRule',
      'CustomerPaymentCancellationRequestV13.MessageOrTransactionCaseRule',
      'FIToFIPaymentCancellationRequestV12.MessageOrTransactionCaseRule',
      'OriginalGroupHeader22.StatusReasonInformationRule',
      'OriginalGroupHeader23.CancellationStatusReasonInformationRule',
      'OriginalGroupInformation32.StatusReasonInformationRule',
      'OriginalNotificationReference15.RelatedAccountRule',
      'OriginalNotificationReference16.RelatedAccountRule',
      'OriginalPaymentInstruction54.CancellationStatusReasonInformationRule',
      'ResolutionOfInvestigationV14.MessageOrInitiationTransactionResolvedCaseRule',
      'ResolutionOfInvestigationV14.MessageOrInterbankTransactionResolvedCaseRule',
      'ResolutionOfInvestigationV14.MessageOrPaymentInformationResolvedCaseRule',
      'UnderlyingTransaction35.GroupOrInitiationTransactionResolvedCaseRule',
      'UnderlyingTransaction37.GroupOrTransactionCaseRule',
    ].sort());
  });
});
