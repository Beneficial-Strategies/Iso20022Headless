import { describe, expect, it } from 'vitest';
import { descriptorAt, emptyValue, getIn, initialValue, parsePath, pain001Message, removeIn, setIn, toPath } from '../src/index.ts';

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
