import { describe, expect, it } from 'vitest';
import { evaluateRules, ruleCodeLists } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';

const ctx = { types: allTypeDescriptors, codeLists: ruleCodeLists };
const status = (type: string, value: unknown, rule: string) => evaluateRules(ctx, type, value).find((r) => r.rule === rule && r.instancePath === '')?.status;
const eur = (v: string) => ({ Ccy: 'EUR', Value: v });
const usd = (v: string) => ({ Ccy: 'USD', Value: v });

describe('pacs.002 (FI to FI payment status report): the group status limits the transaction statuses', () => {
  const T = 'FIToFIPaymentStatusReportV16';
  const msg = (group: string, tx?: string) => ({
    OriginalGroupInformationAndStatus: [{ OriginalMessageIdentification: 'M1', GroupStatus: group }],
    TransactionInformationAndStatus: [{ OriginalInstructionIdentification: 'I1', ...(tx ? { TransactionStatus: tx } : {}) }],
  });

  it('accepted group: no transaction may be rejected', () => {
    expect(status(T, msg('ACCP', 'RJCT'), 'GroupStatusAcceptedRule')).toBe('fail');
    expect(status(T, msg('ACCP', 'ACCP'), 'GroupStatusAcceptedRule')).toBe('pass');
  });
  it('pending group: no transaction may be rejected', () => {
    expect(status(T, msg('PDNG', 'RJCT'), 'GroupStatusPendingRule')).toBe('fail');
    expect(status(T, msg('PDNG', 'ACSC'), 'GroupStatusPendingRule')).toBe('pass');
  });
  it('rejected group: a transaction status that is present must be rejected', () => {
    expect(status(T, msg('RJCT', 'ACCP'), 'GroupStatusRejectedRule')).toBe('fail');
    expect(status(T, msg('RJCT', 'RJCT'), 'GroupStatusRejectedRule')).toBe('pass');
    expect(status(T, msg('RJCT'), 'GroupStatusRejectedRule')).toBe('pass');
  });
  it('received group: no transaction status is allowed', () => {
    expect(status(T, msg('RCVD', 'RCVD'), 'GroupStatusReceivedRule')).toBe('fail');
    expect(status(T, msg('RCVD'), 'GroupStatusReceivedRule')).toBe('pass');
  });
});

describe('pacs.002: where the original group information goes', () => {
  const T = 'FIToFIPaymentStatusReportV16';
  const group = (n: number) => Array.from({ length: n }, (_, i) => ({ OriginalMessageIdentification: `M${i}` }));
  const tx = (withGroup: boolean) => [{ OriginalInstructionIdentification: 'I1', ...(withGroup ? { OriginalGroupInformation: { OriginalMessageIdentification: 'M1' } } : {}) }];

  it('without a group-level block, every transaction must carry its own', () => {
    expect(status(T, { TransactionInformationAndStatus: tx(false) }, 'OriginalGroupInformationAbsenceRule')).toBe('fail');
    expect(status(T, { TransactionInformationAndStatus: tx(true) }, 'OriginalGroupInformationAbsenceRule')).toBe('pass');
  });
  it('with exactly one group-level block, transactions must not repeat it', () => {
    expect(status(T, { OriginalGroupInformationAndStatus: group(1), TransactionInformationAndStatus: tx(true) }, 'OriginalGroupInformationSinglePresenceRule')).toBe('fail');
    expect(status(T, { OriginalGroupInformationAndStatus: group(1), TransactionInformationAndStatus: tx(false) }, 'OriginalGroupInformationSinglePresenceRule')).toBe('pass');
  });
  it('with several group-level blocks (a second one: [2]), transactions must say which one', () => {
    expect(status(T, { OriginalGroupInformationAndStatus: group(2), TransactionInformationAndStatus: tx(false) }, 'OriginalGroupInformationMultiplePresenceRule')).toBe('fail');
    expect(status(T, { OriginalGroupInformationAndStatus: group(2), TransactionInformationAndStatus: tx(true) }, 'OriginalGroupInformationMultiplePresenceRule')).toBe('pass');
    expect(status(T, { OriginalGroupInformationAndStatus: group(1), TransactionInformationAndStatus: tx(false) }, 'OriginalGroupInformationMultiplePresenceRule')).toBe('pass'); // only one: the rule does not apply
  });
});

describe('pacs.003 (FI to FI customer direct debit): totals, currencies and dates', () => {
  const T = 'FIToFICustomerDirectDebitV12';
  const dd = (...amounts: { Ccy: string; Value: string }[]) => amounts.map((a) => ({ InterbankSettlementAmount: a }));
  const withTotal = (total: { Ccy: string; Value: string }, ...items: { Ccy: string; Value: string }[]) => ({ GroupHeader: { TotalInterbankSettlementAmount: total }, DirectDebitTransactionInformation: dd(...items) });

  it('every transaction amount must have the currency of the group total (comparing currencies of two amounts)', () => {
    expect(status(T, withTotal(eur('5'), eur('2'), usd('3')), 'TotalInterbankSettlementAmountRule')).toBe('fail');
    expect(status(T, withTotal(eur('5'), eur('2'), eur('3')), 'TotalInterbankSettlementAmountRule')).toBe('pass');
    expect(status(T, { DirectDebitTransactionInformation: dd(usd('3')) }, 'TotalInterbankSettlementAmountRule')).toBe('pass'); // no total: not applicable
  });

  it('the group total must equal the exact sum of the transaction amounts', () => {
    expect(status(T, withTotal(eur('5'), eur('2'), eur('3')), 'TotalInterbankSettlementAmountAndSumRule')).toBe('pass');
    expect(status(T, withTotal(eur('5'), eur('2'), eur('2.99')), 'TotalInterbankSettlementAmountAndSumRule')).toBe('fail');
    expect(status(T, withTotal(eur('0.30'), eur('0.1'), eur('0.2')), 'TotalInterbankSettlementAmountAndSumRule')).toBe('pass');
  });

  it('a settlement date is given once: in the group header or on every transaction', () => {
    const date = '2026-10-07';
    const gh = { GroupHeader: { InterbankSettlementDate: date } };
    expect(status(T, { ...gh, DirectDebitTransactionInformation: [{ InterbankSettlementDate: date }] }, 'GroupHeaderInterbankSettlementDateRule')).toBe('fail');
    expect(status(T, { ...gh, DirectDebitTransactionInformation: dd(eur('1')) }, 'GroupHeaderInterbankSettlementDateRule')).toBe('pass');
    expect(status(T, { DirectDebitTransactionInformation: dd(eur('1')) }, 'TransactionInterbankSettlementDateRule')).toBe('fail');
    expect(status(T, { DirectDebitTransactionInformation: [{ InterbankSettlementDate: date }] }, 'TransactionInterbankSettlementDateRule')).toBe('pass');
  });

  it('an instructed agent is given once: in the group header or on every transaction', () => {
    const agent = { FinancialInstitutionIdentification: { BICFI: 'DEUTDEFF' } };
    expect(status(T, { GroupHeader: { InstructedAgent: agent }, DirectDebitTransactionInformation: [{ InstructedAgent: agent }] }, 'InstructedAgentRule')).toBe('fail');
    expect(status(T, { GroupHeader: { InstructedAgent: agent }, DirectDebitTransactionInformation: dd(eur('1')) }, 'InstructedAgentRule')).toBe('pass');
  });
});

describe('pacs.003 transaction: an exchange rate is needed exactly when the currencies differ', () => {
  const T = 'DirectDebitTransactionInformation35';
  const base = { InstructedAmount: eur('10'), InterbankSettlementAmount: eur('10') };
  it('different currencies need an exchange rate', () => {
    const differ = { ...base, InterbankSettlementAmount: usd('11') };
    expect(status(T, differ, 'InstructedAmountAndExchangeRate1Rule')).toBe('fail');
    expect(status(T, { ...differ, ExchangeRate: '1.1' }, 'InstructedAmountAndExchangeRate1Rule')).toBe('pass');
  });
  it('the same currency must not have one', () => {
    expect(status(T, { ...base, ExchangeRate: '1.1' }, 'InstructedAmountAndExchangeRate2Rule')).toBe('fail');
    expect(status(T, base, 'InstructedAmountAndExchangeRate2Rule')).toBe('pass');
  });
});
