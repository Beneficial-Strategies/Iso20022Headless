import { describe, expect, it } from 'vitest';
import { areaIndex, messageIndex } from '@beneficial-strategies/iso20022-validate';
import { allTypeDescriptors as typeDescriptors } from '@beneficial-strategies/iso20022-validate/all';
import { createI18n, supportedLocales } from '../src/i18n/context.tsx';
import { UI_KEYS, uiEn, uiLocales, type UiKey } from '../src/i18n/messages.ts';

const SHIPPED = ['es', 'fr', 'de', 'pt'] as const;

const method = typeDescriptors.PaymentInstruction51!.fields!.find((f) => f.name === 'PaymentMethod')!;

describe('interface catalogs', () => {
  it.each(SHIPPED)('%s has every key that English has, and nothing extra', (lang) => {
    expect(Object.keys(uiLocales[lang]!).sort()).toEqual(Object.keys(uiEn).sort());
    expect(UI_KEYS.length).toBe(Object.keys(uiEn).length);
  });

  it.each(SHIPPED)('every %s message has the same placeholders as English (plain templates)', (lang) => {
    const slots = (m: unknown) => (typeof m === 'string' ? [...m.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort() : null);
    for (const k of UI_KEYS) {
      const [e, s] = [slots(uiEn[k]), slots(uiLocales[lang]![k])];
      if (e && s) expect(s, `${lang}.${k}`).toEqual(e);
    }
  });

  it('function messages in every language accept a count', () => {
    for (const lang of SHIPPED) {
      const i = createI18n(lang);
      for (const k of ['draft', 'problemsRemain', 'rulesViolated'] as const) {
        expect(i.t(k, { n: 1 }), `${lang}.${k}`).toMatch(/1/);
        expect(i.t(k, { n: 3 }), `${lang}.${k}`).toMatch(/3/);
      }
    }
  });

  it('English text is the library default and plural forms read well in Spanish', () => {
    const en = createI18n('en');
    const es = createI18n('es');
    expect(en.t('doneEditing')).toBe('Done editing');
    expect(en.t('draft', { n: 3 })).toBe('draft — 3 problem(s)');
    expect(es.t('draft', { n: 1 })).toBe('borrador — 1 problema');
    expect(es.t('draft', { n: 3 })).toBe('borrador — 3 problemas');
    expect(es.t('problemsRemain', { n: 1 })).toBe('Queda 1 problema.');
    expect(es.t('problemsRemain', { n: 2 })).toBe('Quedan 2 problemas.');
    expect(es.t('add', { label: 'Pago' })).toBe('+ Añadir Pago');
  });

  it('French, German and Portuguese are shipped and use their own text', () => {
    expect(createI18n('fr').t('copyXml')).toBe('Copier le XML');
    expect(createI18n('de').t('copyXml')).toBe('XML kopieren');
    expect(createI18n('pt-BR').t('copyXml')).toBe('Copiar XML');
    expect(createI18n('fr').validation.required).toBe('Obligatoire');
  });

  it('American English shares the ISO interface text and rewrites the ISO spec text', () => {
    expect(createI18n('en-US').t('doneEditing')).toBe('Done editing');
    expect(createI18n('en-US').lang).toBe('en');
    expect(createI18n('en').defs.label({ isoId: undefined }, 'Organisation Identification').text).toBe('Organisation Identification');
    expect(createI18n('en-US').defs.label({ isoId: undefined }, 'Organisation Identification').text).toBe('Organization Identification');
  });

  it('regional tags and unknown languages fall back sensibly', () => {
    expect(createI18n('es-MX').t('doneEditing')).toBe('Edición terminada');
    expect(createI18n('it').t('doneEditing')).toBe('Done editing');
  });
});

describe('consumer overrides', () => {
  it('override one message and keep the rest of the shipped language', () => {
    const i = createI18n('es', { ui: { es: { doneEditing: 'Terminado' } }, validation: { es: { required: 'Campo obligatorio' } } });
    expect(i.t('doneEditing')).toBe('Terminado');
    expect(i.t('copyXml')).toBe('Copiar XML'); // untouched shipped Spanish
    expect(i.validation.required).toBe('Campo obligatorio');
    expect(i.validation.select_one).toBe('Seleccione una opción'); // untouched shipped Spanish
  });

  it('add a language the library does not ship; missing keys fall back to English', () => {
    const overrides = { ui: { it: { doneEditing: 'Terminato' } }, validation: { it: { required: 'Obbligatorio' } } };
    const i = createI18n('it', overrides);
    expect(i.t('doneEditing')).toBe('Terminato');
    expect(i.t('copyXml')).toBe('Copy XML');
    expect(i.validation.required).toBe('Obbligatorio');
    expect(supportedLocales(overrides)).toEqual(['en', 'en-US', 'es', 'fr', 'de', 'pt', 'it']);
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
  it('every area has a name and description in every shipped language, and the English matches the registry', () => {
    expect(areaIndex.length).toBeGreaterThan(1);
    for (const a of areaIndex) {
      expect(uiEn[`areaName_${a.code}` as UiKey], a.code).toBe(a.name);
      expect(uiEn[`areaDesc_${a.code}` as UiKey], a.code).toBe(a.definition);
      for (const lang of SHIPPED) {
        expect(uiLocales[lang]![`areaName_${a.code}` as UiKey], `${lang} ${a.code}`).toBeTruthy();
        expect(uiLocales[lang]![`areaDesc_${a.code}` as UiKey], `${lang} ${a.code}`).toBeTruthy();
      }
    }
  });

  it('every message belongs to a listed area, and every listed area has a message', () => {
    const codes = new Set(areaIndex.map((a) => a.code));
    for (const m of messageIndex) expect(codes.has(m.area), m.identifier).toBe(true);
    for (const a of areaIndex) expect(messageIndex.some((m) => m.area === a.code), a.code).toBe(true);
    expect(messageIndex.every((m) => m.identifier.startsWith(`${m.area}.`))).toBe(true);
  });
});
