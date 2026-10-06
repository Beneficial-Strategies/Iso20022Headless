import { describe, expect, it } from 'vitest';
import { createDefinitions, typeDescriptors } from '../src/definitions.ts';
import { loadDefinitionCatalog, shippedDefinitionLocales } from '../src/locales/index.ts';
import es from '../src/locales/es.ts';

const types = Object.values(typeDescriptors);
const fields = types.flatMap((t) => [...(t.fields ?? []), ...(t.choiceOptions ?? [])]).filter((f) => f.isoId);
const options = types.flatMap((t) => t.options ?? []);
const rules = types.flatMap((t) => t.rules ?? []);
const method = typeDescriptors.PaymentInstruction51!.fields!.find((f) => f.name === 'PaymentMethod')!;
const defs = createDefinitions('es', {}, { es });

describe('the shipped Spanish catalog', () => {
  it('is registered and loads on demand', async () => {
    expect(shippedDefinitionLocales).toContain('es');
    expect(await loadDefinitionCatalog('es')).toBe(es);
    expect(await loadDefinitionCatalog('es-MX')).toBe(es);
    expect(await loadDefinitionCatalog('fr')).toBeUndefined();
  });

  it('covers every element, type, code, code set and rule of the message', () => {
    expect(fields.filter((f) => defs.label(f, 'EN').lang !== 'es').map((f) => f.name)).toEqual([]);
    expect(fields.filter((f) => !f.isoId || defs.field(f, typeDescriptors[f.type])?.lang !== 'es').map((f) => f.name)).toEqual([]);
    expect(options.filter((o) => defs.code(o)?.lang !== 'es' || defs.codeName(o, 'EN').lang !== 'es')).toEqual([]);
    expect(rules.filter((r) => defs.rule(r, 'EN').lang !== 'es')).toEqual([]);
    expect(types.filter((t) => t.isoId && defs.type(t) && defs.type(t)!.lang !== 'es')).toEqual([]);
  });

  it('every entry is marked as machine translated until a person reviews it', () => {
    const statuses = new Set([
      ...fields.map((f) => defs.label(f, '').status),
      ...options.map((o) => defs.code(o)?.status),
      ...rules.map((r) => defs.rule(r, '').status),
    ]);
    expect([...statuses]).toEqual(['machine']);
  });

  it('translates labels, code names and definitions, keeping codes and identifiers', () => {
    expect(defs.label(method, 'Payment Method').text).toBe('Método de pago');
    const trf = typeDescriptors.PaymentMethod3Code!.options!.find((o) => o.value === 'TRF')!;
    expect(defs.codeName(trf, 'CreditTransfer').text).toBe('Transferencia');
    expect(defs.code(trf)?.text).toMatch(/^Transferencia de una cantidad de dinero/);
    const rule = typeDescriptors.PaymentInstruction51!.rules!.find((r) => r.name === 'ChequeAndCreditorAccountRule')!;
    expect(defs.rule(rule, 'EN').text).toContain('CreditTransferTransactionInformation/CreditorAccount'); // path untouched
    expect(defs.rule(rule, 'EN').text).toContain('CHK (Cheque)');
  });

  it('a regional tag uses the Spanish catalog', () => {
    expect(createDefinitions('es-MX', {}, { es }).label(method, 'EN').lang).toBe('es');
  });

  it('a consumer correction wins and is not flagged as machine text', () => {
    const d = createDefinitions('es', { labels: { [method.isoId!]: 'Medio de pago' } }, { es });
    expect(d.label(method, 'EN')).toEqual({ text: 'Medio de pago', lang: 'es' }); // no status
    expect(d.label({ isoId: method.isoId }, 'EN').status).toBeUndefined();
    // everything else is still the shipped machine translation
    const other = typeDescriptors.PaymentInstruction51!.fields!.find((f) => f.name === 'ChargeBearer')!;
    expect(d.label(other, 'EN').status).toBe('machine');
  });

  it('a reviewed entry in a catalog is reported as reviewed', () => {
    const d = createDefinitions('es', { labels: { [method.isoId!]: { text: 'Forma de pago', status: 'reviewed' } } }, { es });
    expect(d.label(method, 'EN')).toEqual({ text: 'Forma de pago', lang: 'es', status: 'reviewed' });
  });
});
