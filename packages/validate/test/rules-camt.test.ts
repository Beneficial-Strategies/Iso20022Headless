import { describe, expect, it } from 'vitest';
import { evaluateRules, ruleCodeLists } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';

/**
 * Behavior of the cancellation and investigation rules that the camt messages added. Several of them reach through lists inside
 * lists (/Underlying[*]/OriginalPaymentInformationAndCancellation[*]/TransactionInformation[*]/Case), and several index an element that
 * occurs at most once as `[1]` (OriginalGroupInformationAndStatus[1]), which the evaluator must read as that element.
 */
const ctx = { types: allTypeDescriptors, codeLists: ruleCodeLists };
const run = (type: string, rule: string, instance: unknown): string => {
  const r = evaluateRules(ctx, type, instance).filter((x) => x.rule === rule && x.instancePath === '');
  expect(r, `${type}.${rule} was evaluated`).toHaveLength(1);
  return r[0]!.status;
};
const C = { Identification: 'CASE-1' };

describe('CustomerPaymentCancellationRequestV13: a case is given at one level only', () => {
  const T = 'CustomerPaymentCancellationRequestV13';
  const payInfo = (extra: object) => ({ Underlying: [{ OriginalPaymentInformationAndCancellation: [{ OriginalPaymentInformationIdentification: 'P1', ...extra }] }] });

  it('a case on the message and on a payment information block breaks the rule; either alone does not', () => {
    expect(run(T, 'MessageOrPaymentInformationCaseRule', { Case: C, ...payInfo({ Case: C }) })).toBe('fail');
    expect(run(T, 'MessageOrPaymentInformationCaseRule', { Case: C, ...payInfo({}) })).toBe('pass');
    expect(run(T, 'MessageOrPaymentInformationCaseRule', payInfo({ Case: C }))).toBe('pass');
  });

  it('the same for a case on a transaction, three lists down', () => {
    const tx = (extra: object) => payInfo({ TransactionInformation: [{ OriginalEndToEndIdentification: 'E1', ...extra }] });
    expect(run(T, 'MessageOrTransactionCaseRule', { Case: C, ...tx({ Case: C }) })).toBe('fail');
    expect(run(T, 'MessageOrTransactionCaseRule', { Case: C, ...tx({}) })).toBe('pass');
    expect(run(T, 'MessageOrTransactionCaseRule', tx({ Case: C }))).toBe('pass');
  });
});

describe('ResolutionOfInvestigationV14', () => {
  const T = 'ResolutionOfInvestigationV14';

  it('a resolved case on the message and in the group header breaks the rule (the group header occurs once, but the spec writes it as [1])', () => {
    const group = (extra: object) => ({ CancellationDetails: [{ OriginalGroupInformationAndStatus: { OriginalMessageIdentification: 'M1', OriginalMessageNameIdentification: 'pacs.008.001.14', ...extra } }] });
    expect(run(T, 'MessageOrGroupResolvedCaseRule', { ResolvedCase: C, ...group({ ResolvedCase: C }) })).toBe('fail');
    expect(run(T, 'MessageOrGroupResolvedCaseRule', { ResolvedCase: C, ...group({}) })).toBe('pass');
    expect(run(T, 'MessageOrGroupResolvedCaseRule', group({ ResolvedCase: C }))).toBe('pass');
  });

  it('a partially executed or rejected cancellation needs its cancellation details; other outcomes do not', () => {
    const details = { CancellationDetails: [{ OriginalGroupInformationAndStatus: { OriginalMessageIdentification: 'M1', OriginalMessageNameIdentification: 'pacs.008.001.14' } }] };
    expect(run(T, 'PartialOrRejectedCancellationRule', { Status: { Confirmation: 'PECR' } })).toBe('fail');
    expect(run(T, 'PartialOrRejectedCancellationRule', { Status: { Confirmation: 'RJCR' } })).toBe('fail');
    expect(run(T, 'PartialOrRejectedCancellationRule', { Status: { Confirmation: 'PECR' }, ...details })).toBe('pass');
    expect(run(T, 'PartialOrRejectedCancellationRule', { Status: { Confirmation: 'CNCL' } })).toBe('pass');
  });
});

describe('a rule that names a field its type lacks is reported, not guessed', () => {
  it('UnderlyingTransaction37 counts TransactionInformation, which only UnderlyingTransaction36 has', () => {
    const r = evaluateRules(ctx, 'UnderlyingTransaction37', {}).find((x) => x.rule === 'GroupCancellationAndNumberOfTransactionsRule');
    expect(r?.status).toBe('unsupported');
    expect(r?.reason?.code).toBe('rule_path_unknown');
  });
});
