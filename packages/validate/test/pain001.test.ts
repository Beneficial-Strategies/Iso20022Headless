import { describe, expect, it } from 'vitest';
import { pain001Message, pruneEmpty, typeDescriptors } from '../src/index.ts';

const valid = () => ({
  GroupHeader: {
    MessageIdentification: 'MSG-001',
    CreationDateTime: '2026-10-05T09:30:00Z',
    NumberOfTransactions: '1',
    InitiatingParty: { Name: 'Acme Corp' },
  },
  PaymentInformation: [
    {
      PaymentInformationIdentification: 'PMT-001',
      PaymentMethod: 'TRF',
      RequestedExecutionDate: { Date: '2026-10-06' },
      Debtor: { Name: 'Acme Corp' },
      DebtorAccount: { Identification: { IBAN: 'DE89370400440532013000' } },
      DebtorAgent: { FinancialInstitutionIdentification: { BICFI: 'COBADEFFXXX' } },
      CreditTransferTransactionInformation: [
        {
          PaymentIdentification: { EndToEndIdentification: 'E2E-1' },
          Amount: { InstructedAmount: { Ccy: 'EUR', Value: '100.50' } },
        },
      ],
    },
  ],
});

const issues = (v: unknown) => {
  const r = pain001Message.schema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('pain.001.001.13 generated schema', () => {
  it('accepts a minimal valid message', () => {
    expect(issues(valid())).toEqual([]);
  });

  it('validates recursively: error paths reach deep nested fields', () => {
    const v = valid();
    v.PaymentInformation[0]!.DebtorAccount.Identification.IBAN = 'not-an-iban';
    expect(issues(v)).toContain('PaymentInformation.0.DebtorAccount.Identification.IBAN');
  });

  it('enforces code sets (wire values)', () => {
    const v = valid();
    (v.PaymentInformation[0] as { PaymentMethod: string }).PaymentMethod = 'Cheque'; // enum NAME, not wire value
    expect(issues(v)).toContain('PaymentInformation.0.PaymentMethod');
  });

  it('enforces max length', () => {
    const v = valid();
    v.GroupHeader.MessageIdentification = 'x'.repeat(36);
    expect(issues(v)).toContain('GroupHeader.MessageIdentification');
  });

  it('enforces Choice: exactly one variant', () => {
    const v = valid();
    (v.PaymentInformation[0]!.RequestedExecutionDate as Record<string, string>).DateTime = '2026-10-06T00:00:00Z';
    expect(issues(v).length).toBeGreaterThan(0);
  });

  it('enforces amount precision and currency', () => {
    const v = valid();
    v.PaymentInformation[0]!.CreditTransferTransactionInformation[0]!.Amount.InstructedAmount = { Ccy: 'euro', Value: '1.123456' };
    expect(issues(v).length).toBeGreaterThan(0);
  });

  it('requires at least one PaymentInformation', () => {
    const v = { ...valid(), PaymentInformation: [] };
    expect(issues(v)).toContain('PaymentInformation');
  });

  it('pruneEmpty drops empty form values so optionals are absent', () => {
    const v = valid() as Record<string, unknown>;
    (v.GroupHeader as Record<string, unknown>).ControlSum = '';
    expect(issues(v)).toContain('GroupHeader.ControlSum');
    expect(issues(pruneEmpty(v))).toEqual([]);
  });

  it('exposes prose business rules on PaymentInstruction51 as descriptors', () => {
    expect(typeDescriptors.PaymentInstruction51?.rules).toHaveLength(17);
  });
});
