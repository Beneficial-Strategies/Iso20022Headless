import { describe, expect, it } from 'vitest';
import { evaluateRules, ruleCodeLists } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';

const ctx = { types: allTypeDescriptors, codeLists: ruleCodeLists };
const status = (type: string, value: unknown, rule: string) => evaluateRules(ctx, type, value).find((r) => r.rule === rule && r.instancePath === '')?.status;

describe('payment reversal (pain.007) rules', () => {
  const T = 'CustomerPaymentReversalV13';
  const group = (reversal: 'true' | 'false') => ({ GroupHeader: { GroupReversal: reversal } });

  it('a group reversal may not carry payment-level reversals', () => {
    const rule = 'GroupReversalAndPaymentInformationNotPresentRule';
    expect(status(T, { ...group('true'), OriginalPaymentInformationAndReversal: [{ OriginalPaymentInformationIdentification: 'P1' }] }, rule)).toBe('fail');
    expect(status(T, group('true'), rule)).toBe('pass');
    expect(status(T, group('false'), rule)).toBe('pass'); // condition not met: rule does not apply
  });

  it('a group reversal needs a reason', () => {
    const rule = 'GroupReversalAndReasonRule';
    expect(status(T, group('true'), rule)).toBe('fail');
    expect(status(T, { ...group('true'), OriginalGroupInformation: { ReversalReasonInformation: [{ Reason: { Code: 'AC03' } }] } }, rule)).toBe('pass');
    expect(status(T, group('false'), rule)).toBe('pass');
  });

  it('a non-group reversal needs at least one payment-level reversal (numeric index [1])', () => {
    const rule = 'GroupReversalAndPaymentInformationPresentRule';
    expect(status(T, group('false'), rule)).toBe('fail');
    expect(status(T, { ...group('false'), OriginalPaymentInformationAndReversal: [{ OriginalPaymentInformationIdentification: 'P1' }] }, rule)).toBe('pass');
    expect(status(T, group('true'), rule)).toBe('pass');
  });

  it('the number-of-transactions guideline has no machine form', () => {
    expect(status('GroupHeader124', {}, 'GroupReversalAndNumberOfTransactionsGuideline')).toBe('prose-only');
  });
});

describe('cheque maturity (pain.008 / pain.013) rule', () => {
  const rule = 'ChequeMaturityDateRule';
  it('a maturity date needs a draft-type cheque', () => {
    expect(status('Cheque19', { ChequeMaturityDate: '2026-12-01' }, rule)).toBe('fail');
    expect(status('Cheque19', { ChequeMaturityDate: '2026-12-01', ChequeType: 'DRFT' }, rule)).toBe('pass');
    expect(status('Cheque19', { ChequeMaturityDate: '2026-12-01', ChequeType: 'ELDR' }, rule)).toBe('pass');
    expect(status('Cheque19', { ChequeMaturityDate: '2026-12-01', ChequeType: 'CCHQ' }, rule)).toBe('fail');
    expect(status('Cheque19', { ChequeType: 'CCHQ' }, rule)).toBe('pass'); // no maturity date: rule does not apply
  });
});

describe('"at least one of" rules', () => {
  it('an account needs an identification or a proxy', () => {
    const rule = 'IdentificationOrProxyPresenceRule';
    expect(status('CashAccount40', { Name: 'Main' }, rule)).toBe('fail');
    expect(status('CashAccount40', { Identification: { IBAN: 'DE89370400440532013000' } }, rule)).toBe('pass');
    expect(status('CashAccount40', { Proxy: { Identification: 'a@b.example' } }, rule)).toBe('pass');
  });

  it('structured regulatory reporting needs a code or information', () => {
    const rule = 'ReportingCodeAndInformationRule';
    expect(status('StructuredRegulatoryReporting5', {}, rule)).toBe('fail');
    expect(status('StructuredRegulatoryReporting5', { ReportingCode: 'X' }, rule)).toBe('pass');
    expect(status('StructuredRegulatoryReporting5', { Information: ['text'] }, rule)).toBe('pass');
  });
});

describe('mandate acceptance (pain.012) rule', () => {
  // The spec's prose says "when Accepted is true"; its machine-readable expression applies when Accepted is NOT true.
  // We follow the expression (see fixtures/rules/PROVENANCE.md). This test pins that behavior so a spec fix shows up here.
  const rule = 'OriginalMandateIdentificationPresenceRule';
  it('follows the machine-readable expression, which applies when Accepted is not true', () => {
    expect(status('MandateAcceptance8', { AcceptanceResult: { Accepted: 'false' } }, rule)).toBe('fail');
    expect(status('MandateAcceptance8', { AcceptanceResult: { Accepted: 'false' }, OriginalMandate: { OriginalMandateIdentification: 'M1' } }, rule)).toBe('pass');
    expect(status('MandateAcceptance8', { AcceptanceResult: { Accepted: 'true' } }, rule)).toBe('pass');
  });
});
