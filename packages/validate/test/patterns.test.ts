import { describe, expect, it } from 'vitest';
import { createMessages, describePattern, formatHint, formatIssues } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';
import { pain001Message } from '../src/generated/pain001.ts';

describe('describePattern', () => {
  it('describes the classes, counts and optional groups ISO patterns use', () => {
    expect(describePattern('[A-Z0-9]{4,4}[A-Z]{2,2}[A-Z0-9]{2,2}([A-Z0-9]{3,3}){0,1}')).toBe(
      '4 uppercase letters or digits, then 2 uppercase letters, then 2 uppercase letters or digits, then optionally 3 uppercase letters or digits',
    );
    expect(describePattern('[0-9]{1,15}')).toBe('1 to 15 digits');
    expect(describePattern('[a-zA-Z0-9]{4}')).toBe('4 letters or digits');
    expect(describePattern('[A-Z]{1,1}')).toBe('1 uppercase letter');
    expect(describePattern('\\d{4}')).toBe('4 digits');
  });

  it('accepts the anchored form Zod reports', () => {
    expect(describePattern('/^(?:[A-Z]{3,3})$/')).toBe('3 uppercase letters');
  });

  it('describes in Spanish', () => {
    expect(describePattern('[A-Z]{2,2}[0-9]{2,2}', 'es')).toBe('2 letras mayúsculas, luego 2 dígitos');
    expect(describePattern('[0-9]{1,15}', 'es')).toBe('1 a 15 dígitos');
  });

  it('describes a literal character and a hexadecimal class', () => {
    expect(describePattern('[a-f0-9]{8}-[a-f0-9]{4}')).toContain('8 lowercase hexadecimal digits, then the character "-"');
  });

  it('gives up (undefined) on features it does not describe, instead of guessing', () => {
    for (const p of ['a|b', '[^0-9]', '.*', '\\w+', '(?=x)y']) expect(describePattern(p)).toBeUndefined();
  });

  it('describes every text pattern the generated schemas use', () => {
    const patterns = Object.values(allTypeDescriptors).flatMap((t) => (t.pattern ? [t.pattern] : []));
    expect(patterns.length).toBeGreaterThan(10);
    expect(patterns.filter((p) => describePattern(p) === undefined)).toEqual([]);
  });
});

describe('formatHint', () => {
  it('names well-known identifiers and gives an example', () => {
    expect(formatHint('[A-Z0-9]{18,18}[0-9]{2,2}')).toBe(
      'Not a valid LEI (20 characters). Expected: 18 uppercase letters or digits, then 2 digits. Example: 529900T8BM49AURSDO55',
    );
    expect(formatHint('[A-Z0-9]{18,18}[0-9]{2,2}', 'es')).toContain('No es un LEI (20 caracteres)');
  });

  it('says what is expected for other patterns, and says nothing without one', () => {
    expect(formatHint('[0-9]{2}')).toBe('Invalid format. Expected: 2 digits.');
    expect(formatHint(undefined)).toBeUndefined();
  });
});

describe('format errors in the form messages', () => {
  const run = (value: unknown, lang = 'en', overrides = {}) => {
    const r = pain001Message.schema.safeParse(value);
    return formatIssues(r.error, createMessages(lang, overrides));
  };
  const withBic = (bic: string) => ({
    GroupHeader: { MessageIdentification: 'x', CreationDateTime: '2026-10-05T09:30:00Z', NumberOfTransactions: '1', InitiatingParty: { Identification: { OrganisationIdentification: { AnyBIC: bic } } } },
  });
  const path = 'GroupHeader.InitiatingParty.Identification.OrganisationIdentification.AnyBIC';

  it('tells the user what a BIC looks like', () => {
    expect(run(withBic('bad'))[path]).toMatch(/^Not a valid BIC \(8 or 11 characters\)\. Expected: 4 uppercase letters or digits, then 2 uppercase letters/);
    expect(run(withBic('bad'))[path]).toContain('Example: DEUTDEFF');
  });

  it('is localized, and a consumer override still wins', () => {
    expect(run(withBic('bad'), 'es')[path]).toMatch(/^No es un BIC \(8 u 11 caracteres\)/);
    expect(run(withBic('bad'), 'en', { invalid_format: 'Bad BIC' })[path]).toBe('Bad BIC');
  });

  it('explains dates, date-times and amounts', () => {
    const e = run({ GroupHeader: { CreationDateTime: 'x', MessageIdentification: 'm' } });
    expect(e['GroupHeader.CreationDateTime']).toContain('YYYY-MM-DDThh:mm:ss');
  });
});
