import { describe, expect, it } from 'vitest';
import { createDefinitions } from '../src/definitions.ts';
import { allTypeDescriptors as typeDescriptors } from '../src/generated/all.ts';
import { loadDefinitionCatalog, shippedDefinitionLocales } from '../src/locales/index.ts';

const types = Object.values(typeDescriptors);
const fields = types.flatMap((t) => [...(t.fields ?? []), ...(t.choiceOptions ?? [])]).filter((f) => f.isoId);
const options = types.flatMap((t) => t.options ?? []);
const rules = types.flatMap((t) => t.rules ?? []);
const method = typeDescriptors.PaymentInstruction51!.fields!.find((f) => f.name === 'PaymentMethod')!;
const trf = typeDescriptors.PaymentMethod3Code!.options!.find((o) => o.value === 'TRF')!;
const chequeRule = typeDescriptors.PaymentInstruction51!.rules!.find((r) => r.name === 'ChequeAndCreditorAccountRule')!;

const EXPECT = {
  fr: { method: 'Mode de paiement', trf: /virement/i },
  de: { method: 'Zahlungsart', trf: /Überweisung/i },
  pt: { method: 'Método de pagamento', trf: /transferência/i },
} as const;

describe.each(Object.keys(EXPECT) as (keyof typeof EXPECT)[])('the shipped %s catalog', (lang) => {
  it('is registered and loads on demand, including for a regional tag', async () => {
    expect(shippedDefinitionLocales).toContain(lang);
    const catalog = await loadDefinitionCatalog(lang);
    expect(catalog).toBeDefined();
    expect(await loadDefinitionCatalog(`${lang}-XX`)).toBe(catalog);
  });

  it('covers every element, type, code, code set and rule', async () => {
    const defs = createDefinitions(lang, {}, { [lang]: (await loadDefinitionCatalog(lang))! });
    expect(fields.filter((f) => defs.label(f, 'EN').lang !== lang).map((f) => f.name)).toEqual([]);
    expect(fields.filter((f) => defs.field(f, typeDescriptors[f.type])?.lang !== lang).map((f) => f.name)).toEqual([]);
    expect(options.filter((o) => defs.code(o)?.lang !== lang || defs.codeName(o, 'EN').lang !== lang).map((o) => o.value)).toEqual([]);
    expect(rules.filter((r) => defs.rule(r, 'EN').lang !== lang).map((r) => r.name)).toEqual([]);
    expect(types.filter((t) => t.isoId && defs.type(t) && defs.type(t)!.lang !== lang).map((t) => t.name)).toEqual([]);
  });

  it('is marked machine-translated until a person reviews it', async () => {
    const defs = createDefinitions(lang, {}, { [lang]: (await loadDefinitionCatalog(lang))! });
    const statuses = new Set([...fields.map((f) => defs.label(f, '').status), ...options.map((o) => defs.code(o)?.status), ...rules.map((r) => defs.rule(r, '').status)]);
    expect([...statuses]).toEqual(['machine']);
  });

  it('follows the glossary for the core terms and keeps codes and paths', async () => {
    const defs = createDefinitions(lang, {}, { [lang]: (await loadDefinitionCatalog(lang))! });
    expect(defs.label(method, 'Payment Method').text).toBe(EXPECT[lang].method);
    expect(defs.codeName(trf, 'CreditTransfer').text).toMatch(EXPECT[lang].trf);
    expect(defs.rule(chequeRule, 'EN').text).toContain('CreditTransferTransactionInformation/CreditorAccount');
    expect(defs.rule(chequeRule, 'EN').text).toContain('CHK');
  });

  it('a regional tag uses the catalog', async () => {
    expect(createDefinitions(`${lang}-XX`, {}, { [lang]: (await loadDefinitionCatalog(lang))! }).label(method, 'EN').lang).toBe(lang);
  });
});

describe('languages without spec text', () => {
  it('fall back to ISO English and say so', async () => {
    expect(await loadDefinitionCatalog('it')).toBeUndefined();
    expect(createDefinitions('it').label(method, 'Payment Method')).toEqual({ text: 'Payment Method', lang: 'en' });
  });
});
