import { describe, expect, it } from 'vitest';
import { allTypeDescriptors } from '../src/generated/all.ts';
import { schemas } from '../src/generated/pain001.ts';

/**
 * External code sets (purpose codes, clearing systems, ...): an outside body maintains the values, ISO's repository lists them like any
 * code set's (fixtures/external-codes, written by `spec-extract external-codes`). The type offers them as options but accepts any value
 * of the right length.
 */
const external = Object.values(allTypeDescriptors).filter((t) => t.external);

describe('external code sets', () => {
  it('83 of the 100 list their values; the other 17 stay free text (ISO publishes no list, or the set is not external)', () => {
    expect(external).toHaveLength(100);
    expect(external.filter((t) => t.options)).toHaveLength(83);
    expect(external.filter((t) => !t.options).map((t) => t.name).sort()).toEqual([
      'BusinessMessagePriorityCode',
      'ExternalBankTransactionDomain1Code',
      'ExternalBankTransactionFamily1Code',
      'ExternalBankTransactionSubFamily1Code',
      'ExternalCardTransactionCategory1Code',
      'ExternalChequeAgentInstruction1Code',
      'ExternalCommunicationFormat1Code',
      'ExternalCreditLineType1Code',
      'ExternalFinancialInstitutionIdentification1Code',
      'ExternalMandateSetupReason1Code',
      'ExternalNotificationCancellationReason1Code',
      'ExternalPaymentMethode1Code',
      'ExternalPaymentScenario1Code',
      'ExternalPenaltyPartyType1Code',
      'LanguageCode',
      'NationalityCode',
      'UnicodeChartsCode',
    ]);
  });

  it('lists each value once, within the length the type allows, in the publisher\'s order', () => {
    for (const t of external.filter((x) => x.options)) {
      const values = t.options!.map((o) => o.value);
      expect(new Set(values).size, t.name).toBe(values.length);
      for (const v of values) {
        expect(v.length, `${t.name} ${v}`).toBeLessThanOrEqual(t.maxLength ?? Infinity);
        expect(v.length, `${t.name} ${v}`).toBeGreaterThanOrEqual(t.minLength ?? 0);
      }
    }
    const purpose = allTypeDescriptors.ExternalPurpose1Code!.options!;
    expect(purpose).toHaveLength(366);
    expect(purpose.slice(0, 3).map((o) => o.value)).toEqual(['BKDF', 'BKFE', 'BKFM']);
    expect(purpose.slice(-3).map((o) => o.value)).toEqual(['TIPS', 'SCAC', 'WALT']);
    expect(purpose[0]).toMatchObject({ value: 'BKDF', name: 'BankLoanDelayedDrawFunding' });
    // the repository lists CTP twice, with two meanings: one option
    expect(allTypeDescriptors.ExternalLocalInstrument1Code!.options!.filter((o) => o.value === 'CTP')).toHaveLength(1);
  });

  it('still accepts a value that is not listed, as long as it has the right length', () => {
    const purpose = schemas.Purpose2Choice!;
    expect(purpose.safeParse({ Code: 'SALA' }).success).toBe(true);
    expect(purpose.safeParse({ Code: 'ZZZZ' }).success).toBe(true); // not on the list
    expect(purpose.safeParse({ Code: 'TOOLONG' }).success).toBe(false);
    expect(purpose.safeParse({ Code: '' }).success).toBe(false);
  });
});
