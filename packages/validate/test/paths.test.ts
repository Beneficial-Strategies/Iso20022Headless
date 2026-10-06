import { describe, expect, it } from 'vitest';
import { descriptorAt, emptyValue, getIn, initialValue, parsePath, pain001Message, pruneForValidation, removeIn, setIn, toPath } from '../src/index.ts';

const types = pain001Message.typeDescriptors;
const root = pain001Message.rootType;

describe('path helpers', () => {
  it('parses and rebuilds paths with array indices', () => {
    expect(parsePath('A.B[0].C[12]')).toEqual(['A', 'B', 0, 'C', 12]);
    expect(toPath(['A', 'B', 0, 'C'])).toBe('A.B[0].C');
  });

  it('getIn / setIn / removeIn work immutably, creating intermediates', () => {
    const v = { A: { B: [{ C: 1 }] } };
    expect(getIn(v, 'A.B[0].C')).toBe(1);
    const w = setIn(v, 'A.B[1].C', 2);
    expect(v.A.B).toHaveLength(1);
    expect(getIn(w, 'A.B[1].C')).toBe(2);
    expect(getIn(removeIn(w, 'A.B[0]'), 'A.B[0].C')).toBe(2);
    expect(setIn({}, 'X.Y[0]', 'z')).toEqual({ X: { Y: ['z'] } });
  });

  it('descriptorAt resolves fields (skipping indices) and amount sub-values', () => {
    expect(descriptorAt(types, root, 'PaymentInformation[0].Debtor.Name')?.name).toBe('Name');
    expect(descriptorAt(types, root, 'PaymentInformation[0].PaymentMethod')?.required).toBe(true);
    const amount = descriptorAt(types, root, 'PaymentInformation[0].CreditTransferTransactionInformation[0].Amount.InstructedAmount.Ccy');
    expect(amount?.name).toBe('InstructedAmount');
    expect(descriptorAt(types, root, 'Nope.Nothing')).toBeUndefined();
  });

  it('initialValue creates required components only; emptyValue by kind', () => {
    const v = initialValue(types, 'PaymentInstruction51');
    expect(v).toHaveProperty('Debtor');
    expect(v).not.toHaveProperty('ChargesAccount');
    expect(emptyValue(types, 'AccountIdentification4Choice')).toEqual({});
  });
});

describe('pruneForValidation', () => {
  it('keeps required components so each field reports its own error', async () => {
    const { pruneForValidation, schemas, formatIssues } = await import('../src/index.ts');
    const form = initialValue(types, root) as Record<string, unknown>; // every field empty
    const pruned = pruneForValidation(types, root, form) as Record<string, unknown>;
    expect(pruned).toHaveProperty('GroupHeader');
    const r = pain001Message.schema.safeParse(pruned);
    const errors = r.success ? {} : formatIssues(r.error);
    expect(errors['GroupHeader.MessageIdentification']).toBe('Required');
    expect(errors['GroupHeader']).toBeUndefined(); // not one error for the whole group
    expect(errors['PaymentInformation[0].PaymentMethod']).toBeDefined();
    void schemas;
  });

  it('drops optional components and empty values, keeps entered ones', () => {
    const v = pruneForValidation(types, 'GroupHeader114', { MessageIdentification: 'M1', CreationDateTime: '', ControlSum: '', InitiatingParty: { Name: '' } }) as Record<string, unknown>;
    expect(v.MessageIdentification).toBe('M1');
    expect(v).not.toHaveProperty('CreationDateTime');
    expect(v).not.toHaveProperty('ControlSum');
    expect(v.InitiatingParty).toEqual({}); // required component stays, empty
  });

  it('an optional component the user included stays (so its required fields report errors); an absent one stays absent', () => {
    expect(pruneForValidation(types, 'CashAccount40', { Name: '' })).toEqual({}); // Identification absent
    expect(pruneForValidation(types, 'CashAccount40', { Identification: {}, Name: '' })).toEqual({ Identification: {} }); // included, no variant chosen
    const pi = pruneForValidation(types, 'PaymentInstruction51', { PaymentMethod: 'TRF' }) as Record<string, unknown>;
    expect(pi).not.toHaveProperty('PaymentTypeInformation');
  });

  it('a choice keeps only the selected alternative', () => {
    const v = pruneForValidation(types, 'AccountIdentification4Choice', { IBAN: 'DE89370400440532013000' });
    expect(v).toEqual({ IBAN: 'DE89370400440532013000' });
    const none = pain001Message.schema.safeParse(pruneForValidation(types, 'AccountIdentification4Choice', {}));
    void none;
  });

  it('amounts keep only entered parts; a required list stays present even when empty', () => {
    const v = pruneForValidation(types, 'AmountType4Choice', { InstructedAmount: { Ccy: 'EUR', Value: '' } }) as { InstructedAmount: unknown };
    expect(v.InstructedAmount).toEqual({ Ccy: 'EUR' });
    const pi = pruneForValidation(types, 'PaymentInstruction51', {}) as Record<string, unknown>;
    expect(pi.CreditTransferTransactionInformation).toEqual([]);
  });
});
