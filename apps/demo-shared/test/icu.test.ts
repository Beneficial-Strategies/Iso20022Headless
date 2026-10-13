import { describe, expect, it } from 'vitest';
import { formatIcu } from '../src/icu.ts';

describe('the ICU subset of the text hosts', () => {
  it('leaves a plain text as it is', () => expect(formatIcu('Copy XML')).toBe('Copy XML'));
  it('fills {name} and leaves what has no value', () => expect(formatIcu('+ Add {label} {n}', { label: 'Name' })).toBe('+ Add Name {n}'));
  const t = '{min, plural, =1 {At least # character} other {At least # characters}}';
  it('picks the form of a count and writes the count where # is', () => {
    expect(formatIcu(t, { min: 1 })).toBe('At least 1 character');
    expect(formatIcu(t, { min: 0 })).toBe('At least 0 characters');
    expect(formatIcu(t, { min: 35 })).toBe('At least 35 characters');
  });
  it('fills other values inside a form', () => expect(formatIcu('{n, plural, =1 {# problem in {where}} other {# problems in {where}}}', { n: 2, where: 'Party' })).toBe('2 problems in Party'));
  it('keeps a plural whose count is missing', () => expect(formatIcu(t, {})).toBe(t));
});
