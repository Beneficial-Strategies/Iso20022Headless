import { describe, expect, it } from 'vitest';
import { pain001Message } from '@beneficial-strategies/iso20022-validate/pain001';
import type { TypeDescriptor } from '@beneficial-strategies/iso20022-validate';
import { FULL_ABOVE, MIN_CHARS, controlChars } from '../src/sizing.ts';

const t = (kind: string, rest: Partial<TypeDescriptor> = {}): TypeDescriptor => ({ name: 'T', kind, ...rest }) as TypeDescriptor;
const real = (name: string): TypeDescriptor => pain001Message.typeDescriptors[name]!;

describe('controlChars: how wide a control needs to be', () => {
  it('a text type is as wide as its longest value, at least a few characters', () => {
    expect(controlChars(t('text', { maxLength: 35 }))).toBe(35);
    expect(controlChars(t('text', { maxLength: 2 }))).toBe(MIN_CHARS);
    expect(controlChars(t('text', { maxLength: FULL_ABOVE }))).toBe(FULL_ABOVE);
  });

  it('a long text takes the full width (undefined), and so does one with no limit', () => {
    expect(controlChars(t('text', { maxLength: FULL_ABOVE + 1 }))).toBeUndefined();
    expect(controlChars(t('text', { maxLength: 140 }))).toBeUndefined();
    expect(controlChars(t('text'))).toBeUndefined();
  });

  it('a pattern gives the limit when there is no length, and the smaller of the two when there are both', () => {
    expect(controlChars(t('text', { pattern: '[0-9]{1,15}' }))).toBe(15);
    expect(controlChars(t('text', { pattern: '[A-Z0-9]{4,4}[A-Z]{2,2}[A-Z0-9]{2,2}([A-Z0-9]{3,3}){0,1}' }))).toBe(11);
    expect(controlChars(t('text', { pattern: '[0-9]{1,15}', maxLength: 10 }))).toBe(10);
    expect(controlChars(t('text', { pattern: '[0-9]+' }))).toBeUndefined();
  });

  it('numbers and amounts: the digits, a point and a sign', () => {
    expect(controlChars(t('number', { totalDigits: 18, fractionDigits: 17 }))).toBe(20);
    expect(controlChars(t('amount', { totalDigits: 18 }))).toBe(20);
    expect(controlChars(t('number', { totalDigits: 3 }))).toBe(MIN_CHARS);
    expect(controlChars(t('number'))).toBe(20);
  });

  it('dates, date-times, times and booleans have their own widths', () => {
    expect(controlChars(t('date'))).toBe(16);
    expect(controlChars(t('datetime'))).toBe(30);
    expect(controlChars(t('time'))).toBe(18);
    expect(controlChars(t('boolean'))).toBe(12);
  });

  it('a dropdown is as wide as its longest option (with a little room), whatever the language', () => {
    expect(controlChars(t('code'), ['CHK — Cheque', 'TRF — CreditTransfer'])).toBe(22);
    expect(controlChars(t('choice'), ['Organisation', 'Person'])).toBe(MIN_CHARS + 6);
    expect(controlChars(t('code'), ['x'.repeat(200)])).toBeUndefined();
  });

  it('something that is not a simple value has no size: sections and raw XML take the full width', () => {
    expect(controlChars(t('component'))).toBeUndefined();
    expect(controlChars(t('any'))).toBeUndefined();
  });

  it('on the real pain.001 types: a name is full width, an identifier is not, a country code is small', () => {
    expect(controlChars(real('Max140Text'))).toBeUndefined();
    expect(controlChars(real('Max35Text'))).toBe(35);
    expect(controlChars(real('CountryCode'))).toBe(MIN_CHARS);
    expect(controlChars(real('Max15NumericText'))).toBe(15);
    expect(controlChars(real('ISODateTime'))).toBe(30);
  });
});
