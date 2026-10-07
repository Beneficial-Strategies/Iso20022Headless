import { describe, expect, it } from 'vitest';
import { codeDefinitions, createDefinitions, fieldDefinitions, typeDefinitions } from '../src/definitions.ts';
import { allTypeDescriptors as typeDescriptors } from '../src/generated/all.ts';

const types = Object.values(typeDescriptors);
const fields = types.flatMap((t) => [...(t.fields ?? []), ...(t.choiceOptions ?? [])]);

describe('ISO ids on descriptors', () => {
  it('every type, including each message root, has an id; ids are unique', () => {
    const missing = types.filter((t) => !t.isoId).map((t) => t.name);
    expect(missing).toEqual([]);
    const ids = types.map((t) => t.isoId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every element has an id, including the three message building blocks', () => {
    const missing = fields.filter((f) => !f.isoId).map((f) => f.name);
    expect(missing).toEqual([]);
  });

  it('element ids are unique across the whole message', () => {
    // a reused component appears once in `types`, so each element id appears once
    const ids = fields.map((f) => f.isoId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('enumerated code options carry ids', () => {
    const options = types.flatMap((t) => t.options ?? []);
    expect(options.length).toBe(716); // enumerated codes across all messages
    expect(options.every((o) => o.isoId)).toBe(true);
  });
});

describe('definitions are keyed by id and fully covered', () => {
  // An amount is rendered as { Ccy, Value }: its two sub-members are not separate descriptors, but have definitions.
  const amountParts = types.filter((t) => t.kind === 'amount').flatMap((t) => [`${t.isoId}_Amount`, `${t.isoId}_Currency`]);
  const allIds = new Set([...types.map((t) => t.isoId), ...fields.map((f) => f.isoId), ...types.flatMap((t) => (t.options ?? []).map((o) => o.isoId)), ...amountParts]);

  it('no orphan keys: every definition id belongs to something in the message', () => {
    for (const id of [...Object.keys(typeDefinitions), ...Object.keys(fieldDefinitions), ...Object.keys(codeDefinitions)]) {
      expect(allIds.has(id), id).toBe(true);
    }
  });

  it('every element has a definition (own text, else its type text)', () => {
    const d = createDefinitions('en');
    const missing = fields.filter((f) => f.isoId).filter((f) => !d.field(f, typeDescriptors[f.type]));
    expect(missing.map((f) => f.name)).toEqual([]);
  });

  it('every enumerated code has a definition', () => {
    const d = createDefinitions('en');
    const missing = types.flatMap((t) => t.options ?? []).filter((o) => !d.code(o));
    expect(missing).toEqual([]);
  });

  it('counts match the captures (all thirty-seven messages): 1970 elements, 381 types, 716 codes', () => {
    expect(Object.keys(fieldDefinitions)).toHaveLength(1970);
    expect(Object.keys(typeDefinitions)).toHaveLength(381);
    expect(Object.keys(codeDefinitions)).toHaveLength(716);
  });
});

describe('definition lookup by language', () => {
  const payment = typeDescriptors.PaymentInstruction51!;
  const method = payment.fields!.find((f) => f.name === 'PaymentMethod')!;
  const methodType = typeDescriptors[method.type];

  it('English returns the spec text and says it is English', () => {
    const r = createDefinitions('en').field(method, methodType);
    expect(r?.lang).toBe('en');
    expect(r?.text).toMatch(/means of payment/);
  });

  it('a language without a catalog falls back to English and says so', () => {
    expect(createDefinitions('es').field(method, methodType)?.lang).toBe('en');
    expect(createDefinitions('es-MX').field(method, methodType)?.lang).toBe('en');
  });

  it('a consumer catalog wins, is marked as that language, and falls back per entry', () => {
    const d = createDefinitions('es', { fields: { [method.isoId!]: 'Medio de pago.' } });
    expect(d.field(method, methodType)).toEqual({ text: 'Medio de pago.', lang: 'es' });
    const other = payment.fields!.find((f) => f.name === 'BatchBooking')!;
    expect(d.field(other, typeDescriptors[other.type])?.lang).toBe('en');
  });

  it('labels: translation when given, English fallback otherwise', () => {
    const d = createDefinitions('es', { labels: { [method.isoId!]: 'Método de pago' } });
    expect(d.label(method, 'Payment Method')).toEqual({ text: 'Método de pago', lang: 'es' });
    expect(d.label({ isoId: 'unknown' }, 'Whatever')).toEqual({ text: 'Whatever', lang: 'en' });
  });

  it('a catalog added through the third argument is used for its language', () => {
    const d = createDefinitions('fr', {}, { fr: { fields: { [method.isoId!]: 'Moyen de paiement.' } } });
    expect(d.field(method, methodType)).toEqual({ text: 'Moyen de paiement.', lang: 'fr' });
  });
});
