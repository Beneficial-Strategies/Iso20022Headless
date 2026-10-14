import { describe, expect, it } from 'vitest';
import { areaIndex, messageIndex } from '@beneficial-strategies/iso20022-validate';
import { allTypeDescriptors as typeDescriptors } from '@beneficial-strategies/iso20022-validate/all';
import { createI18n, supportedLocales } from '../src/i18n/context.tsx';
import { UI_KEYS, uiEn, uiLocales } from '../src/i18n/messages.ts';
// a few texts of other languages, as a text host would serve them, passed in to exercise the mechanism
const uiEs = { now: 'Ahora', remove: 'Quitar' };
const uiFr = { now: 'Maintenant' };
const uiDe = { now: 'Jetzt' };
const uiPt = { now: 'Agora' };
const validationFr = { required: 'Obligatoire' };
const validationEs = { required: 'Obligatorio', select_one: 'Seleccione una opción' };

const method = typeDescriptors.PaymentInstruction51!.fields!.find((f) => f.name === 'PaymentMethod')!;

describe('interface catalogs', () => {
  it('English is the only language the library carries, and has a text for every key', () => {
    expect(UI_KEYS.length).toBe(Object.keys(uiEn).length);
    expect(Object.keys(uiLocales)).toEqual(['en']);
    const en = createI18n('en');
    expect(en.t('optional')).toBe('(optional)');
    expect(en.t('removeItem', { label: 'Payment', n: 2 })).toBe('Remove Payment 2');
    // any other language is English until a text host (or the consumer) supplies it
    expect(createI18n('es').t('add', { label: 'Pago' })).toBe('+ Add Pago');
    expect(createI18n('fr').t('now')).toBe('Now');
    expect(createI18n('fr').validation.required).toBe('Required');
  });

  it('a language passed in is used', () => {
    expect(createI18n('fr', { ui: { fr: uiFr }, validation: { fr: validationFr } }).t('now')).toBe('Maintenant');
    expect(createI18n('de', { ui: { de: uiDe } }).t('now')).toBe('Jetzt');
    expect(createI18n('pt-BR', { ui: { pt: uiPt } }).t('now')).toBe('Agora');
    expect(createI18n('fr', { validation: { fr: validationFr } }).validation.required).toBe('Obligatoire');
  });

  it('American English is the ISO text unless a text host (the en-US glossary) rewrites it', () => {
    expect(createI18n('en-US').t('now')).toBe('Now');
    expect(createI18n('en-US').lang).toBe('en');
    expect(createI18n('en').defs.label({ isoId: undefined }, 'Organisation Identification').text).toBe('Organisation Identification');
    expect(createI18n('en-US').defs.label({ isoId: undefined }, 'Organisation Identification').text).toBe('Organisation Identification');
  });

  it('regional tags use their language, and unknown languages fall back to English', () => {
    expect(createI18n('es-MX', { ui: { es: uiEs } }).t('now')).toBe('Ahora');
    expect(createI18n('it').t('now')).toBe('Now');
  });
});

describe('consumer overrides', () => {
  it('override one message and keep the rest of the shipped language', () => {
    const i = createI18n('es', { ui: { es: { ...uiEs, now: 'Ya' } }, validation: { es: { ...validationEs, required: 'Campo obligatorio' } } });
    expect(i.t('now')).toBe('Ya');
    expect(i.t('remove')).toBe('Quitar'); // untouched shipped Spanish
    expect(i.validation.required).toBe('Campo obligatorio');
    expect(i.validation.select_one).toBe('Seleccione una opción'); // untouched shipped Spanish
  });

  it('add a language the library does not ship; missing keys fall back to English', () => {
    const overrides = { ui: { it: { now: 'Adesso' } }, validation: { it: { required: 'Obbligatorio' } } };
    const i = createI18n('it', overrides);
    expect(i.t('now')).toBe('Adesso');
    expect(i.t('remove')).toBe('Remove');
    expect(i.validation.required).toBe('Obbligatorio');
    expect(supportedLocales(overrides)).toEqual(['en', 'it']);
  });

  it('spec text and labels: English fallback is reported, translations win and are marked as such', () => {
    const none = createI18n('es');
    expect(none.defs.field(method, typeDescriptors[method.type])?.lang).toBe('en'); // not translated
    expect(none.defs.label(method, 'Payment Method')).toEqual({ text: 'Payment Method', lang: 'en' });

    const overrides = { definitions: { es: { fields: { [method.isoId!]: 'Medio de pago.' }, labels: { [method.isoId!]: 'Método de pago' } } } };
    const i = createI18n('es', overrides);
    expect(i.defs.field(method, typeDescriptors[method.type])).toEqual({ text: 'Medio de pago.', lang: 'es' });
    expect(i.defs.label(method, 'Payment Method').text).toBe('Método de pago');
  });
});

describe('business areas (the first dropdown)', () => {
  it('every message belongs to a listed area, and every listed area has a message', () => {
    const codes = new Set(areaIndex.map((a) => a.code));
    for (const m of messageIndex) expect(codes.has(m.area), m.identifier).toBe(true);
    for (const a of areaIndex) expect(messageIndex.some((m) => m.area === a.code), a.code).toBe(true);
    expect(messageIndex.every((m) => m.identifier.startsWith(`${m.area}.`))).toBe(true);
  });
});
