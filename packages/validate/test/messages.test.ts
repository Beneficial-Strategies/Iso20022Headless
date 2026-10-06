import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { collectIssues, createMessages, en, es, formatIssue, formatIssues, formatMessage, ISSUE_CODES } from '../src/index.ts';
import { schemas } from '../src/generated/pain001.ts';

const errors = (schema: ZodType, v: unknown) => {
  const r = schema.safeParse(v);
  return r.success ? undefined : r.error;
};

const group = schemas.GroupHeader114;
const goodHeader = { MessageIdentification: 'M1', CreationDateTime: '2026-10-05T09:30:00Z', NumberOfTransactions: '1', InitiatingParty: { Name: 'A' } };

describe('issues are codes plus parameters', () => {
  it('collectIssues reports codes and params, with no wording', () => {
    const e = errors(group, { ...goodHeader, MessageIdentification: 'x'.repeat(40), NumberOfTransactions: 'abc' });
    const issues = collectIssues(e);
    expect(issues.MessageIdentification).toEqual({ code: 'too_long', params: { max: 35 } });
    expect(issues.NumberOfTransactions).toEqual({ code: 'invalid_format' });
  });

  it('required fields report `required`', () => {
    const { MessageIdentification: _omit, ...rest } = goodHeader;
    expect(collectIssues(errors(group, rest)).MessageIdentification).toEqual({ code: 'required' });
  });

  it('format validators name their own code', () => {
    const issues = collectIssues(errors(group, { ...goodHeader, CreationDateTime: 'yesterday' }));
    expect(issues.CreationDateTime).toEqual({ code: 'datetime_format' });
  });
});

describe('English default wording is unchanged', () => {
  const text = (v: unknown) => formatIssues(errors(group, v));
  it.each([
    ['required', (({ MessageIdentification: _o, ...r }) => r)(goodHeader), 'MessageIdentification', 'Required'],
    ['too long', { ...goodHeader, MessageIdentification: 'x'.repeat(36) }, 'MessageIdentification', 'Must be at most 35 characters'],
    ['bad pattern', { ...goodHeader, NumberOfTransactions: 'abc' }, 'NumberOfTransactions', 'Invalid format'],
    ['bad date-time', { ...goodHeader, CreationDateTime: 'x' }, 'CreationDateTime', 'Invalid format'],
  ])('%s', (_n, value, path, expected) => {
    expect(text(value)[path]).toBe(expected);
  });

  it('amount precision', () => {
    const e = errors(schemas.AmountType4Choice, { InstructedAmount: { Ccy: 'EUR', Value: '1.1234567' } });
    expect(collectIssues(e)['InstructedAmount.Value']).toEqual({ code: 'fraction_digits', params: { max: 5 } });
    expect(formatIssues(e)['InstructedAmount.Value']).toBe('At most 5 fraction digits');
    expect(formatIssues(e, es)['InstructedAmount.Value']).toBe('Como máximo 5 decimales');
  });

  it('array and union messages match the historical strings', () => {
    const pi = formatIssues(errors(schemas.PaymentInstruction51, { PaymentMethod: 'TRF', CreditTransferTransactionInformation: [] }));
    expect(pi.CreditTransferTransactionInformation).toBe('At least 1 required'); // unpruned empty array
    const choice = formatIssues(errors(schemas.AccountIdentification4Choice, {}));
    expect(choice['']).toBe('Select one option');
    expect(formatIssues(errors(schemas.PaymentInstruction51, { PaymentMethod: 'Cheque' })).PaymentMethod).toBe('Not an allowed value');
  });
});

describe('catalogs', () => {
  it('every issue code has a message in every shipped language', () => {
    for (const code of ISSUE_CODES) {
      expect(en[code], `en.${code}`).toBeTruthy();
      expect(es[code], `es.${code}`).toBeTruthy();
    }
  });

  it('Spanish is used when asked, with plural-aware wording', () => {
    const m = createMessages('es');
    expect(formatIssue({ code: 'required' }, m)).toBe('Obligatorio');
    expect(formatIssue({ code: 'too_long', params: { max: 35 } }, m)).toBe('Debe tener como máximo 35 caracteres');
    expect(formatIssue({ code: 'too_short', params: { min: 1 } }, m)).toBe('Debe tener al menos 1 carácter');
    const issues = formatIssues(errors(group, { ...goodHeader, MessageIdentification: 'x'.repeat(40) }), m);
    expect(issues.MessageIdentification).toBe('Debe tener como máximo 35 caracteres');
  });

  it('a regional tag falls back to its language, then to English', () => {
    expect(formatIssue({ code: 'required' }, createMessages('es-MX'))).toBe('Obligatorio');
    expect(formatIssue({ code: 'required' }, createMessages('fr'))).toBe('Required');
    expect(formatIssue({ code: 'required' }, createMessages())).toBe('Required');
  });

  it('consumer overrides win and can be partial', () => {
    const m = createMessages('es', { required: 'Campo obligatorio', too_long: ({ max }) => `Máx. ${max}` });
    expect(formatIssue({ code: 'required' }, m)).toBe('Campo obligatorio');
    expect(formatIssue({ code: 'too_long', params: { max: 5 } }, m)).toBe('Máx. 5');
    expect(formatIssue({ code: 'select_one' }, m)).toBe('Seleccione una opción'); // untouched
  });

  it('consumers can add a language with a partial catalog (missing keys fall back to English)', () => {
    const m = createMessages('fr', {}, { fr: { required: 'Obligatoire' } });
    expect(formatIssue({ code: 'required' }, m)).toBe('Obligatoire');
    expect(formatIssue({ code: 'select_one' }, m)).toBe('Select one option');
  });

  it('plain object spread also works, and unknown placeholders stay visible', () => {
    expect(formatIssue({ code: 'required' }, { ...en, required: 'Needed' })).toBe('Needed');
    expect(formatMessage('Max {max}, {missing}', { max: 3 })).toBe('Max 3, {missing}');
  });

  it('rule diagnostics are localizable too', () => {
    const issue = { code: 'rule_literal_not_code_value', params: { value: 'Branch', path: '/Name' } } as const;
    expect(formatIssue(issue, en)).toBe('literal "Branch" is not a value of a code set at /Name');
    expect(formatIssue(issue, es)).toContain('no es un valor');
  });
});
