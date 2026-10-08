import { describe, expect, it } from 'vitest';
import { areaIndex } from '@beneficial-strategies/iso20022-validate';
import { createI18n } from '@beneficial-strategies/iso20022-react-ui';
import { PAGE_KEYS, createPageMessages, makePageText, pageLocales, untranslatedPageKeys } from '../src/text/messages.ts';
import { demoText, demoTextTables } from '../src/demoText.ts';
import { pageEn } from '../src/text/page.en.ts';

const SHIPPED = ['es', 'fr', 'de', 'pt'] as const;
const slots = (m: unknown) => (typeof m === 'string' ? [...m.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort() : null);

describe("the demo page's own text", () => {
  it.each(SHIPPED)('%s has every key the demo English has, and nothing extra', (lang) => {
    expect(Object.keys(pageLocales[lang]!).sort()).toEqual([...PAGE_KEYS].sort());
    expect(Object.keys(pageEn).sort()).toEqual([...PAGE_KEYS].sort());
  });

  it.each(SHIPPED)('every %s message has the same placeholders as the English (plain templates)', (lang) => {
    for (const k of PAGE_KEYS) {
      const [e, s] = [slots(pageEn[k]), slots(pageLocales[lang]![k])];
      if (e && s) expect(s, `${lang}.${k}`).toEqual(e);
    }
  });

  it('function messages in every language accept a count', () => {
    for (const lang of SHIPPED) {
      const t = makePageText(createI18n(lang)).t;
      for (const k of ['draft', 'problemsRemain', 'rulesViolated'] as const) {
        expect(t(k, { n: 1 }), `${lang}.${k}`).toMatch(/1/);
        expect(t(k, { n: 3 }), `${lang}.${k}`).toMatch(/3/);
      }
    }
  });

  it('plural forms read well in Spanish and English', () => {
    const es = makePageText(createI18n('es')).t;
    expect(es('draft', { n: 1 })).toBe('borrador — 1 problema');
    expect(es('problemsRemain', { n: 2 })).toBe('Quedan 2 problemas.');
    expect(makePageText(createI18n('en')).t('draft', { n: 3 })).toBe('draft — 3 problem(s)');
  });

  it('nothing in a shipped language falls through to English', () => {
    for (const lang of SHIPPED) expect(untranslatedPageKeys(lang), lang).toEqual([]);
  });

  it('its fallback is the demo\'s own English, never the ISO text or the library catalog', () => {
    expect(untranslatedPageKeys('it').length).toBe(PAGE_KEYS.length);
    expect(makePageText(createI18n('it')).t('doneEditing')).toBe('Done editing');
    expect(createPageMessages('es-MX').doneEditing).toBe(pageLocales.es!.doneEditing); // es-MX -> es -> demo English
    expect(createPageMessages('en-US').doneEditing).toBe(pageEn.doneEditing);
  });

  it('library keys come from the library, so the two catalogs never disagree', () => {
    const fr = makePageText(createI18n('fr')).t;
    expect(fr('now')).toBe('Maintenant'); // a library key
    expect(fr('doneEditing')).toBe('Édition terminée'); // a page key
  });

  it('a key nobody defined reads as an empty string, so callers can fall back', () => {
    expect(makePageText(createI18n('en')).t('skin_nobody' as never)).toBe('');
  });

  it('every area has a name and description in every shipped language, and the English matches the registry', () => {
    for (const a of areaIndex) {
      expect(pageEn[`areaName_${a.code}` as keyof typeof pageEn], a.code).toBe(a.name);
      expect(pageEn[`areaDesc_${a.code}` as keyof typeof pageEn], a.code).toBe(a.definition);
      for (const lang of SHIPPED) {
        expect(pageLocales[lang]![`areaName_${a.code}` as keyof typeof pageEn], `${lang} ${a.code}`).toBeTruthy();
        expect(pageLocales[lang]![`areaDesc_${a.code}` as keyof typeof pageEn], `${lang} ${a.code}`).toBeTruthy();
      }
    }
  });
});

describe('the Copy as and field-mode text', () => {
  const keys = Object.keys(demoTextTables.en!).sort();

  it.each(SHIPPED)('%s has every key the English has, with the same placeholders', (lang) => {
    expect(Object.keys(demoTextTables[lang]!).sort()).toEqual(keys);
    for (const k of keys) {
      const [e, s] = [slots(demoTextTables.en![k as keyof typeof demoTextTables.en]), slots(demoTextTables[lang]![k as keyof typeof demoTextTables.en])];
      expect(s, `${lang}.${k}`).toEqual(e);
    }
  });

  it('a regional tag uses its language, and an unknown language the English', () => {
    expect(demoText('fr-CA')('copyAs')).toBe(demoTextTables.fr!.copyAs);
    expect(demoText('it')('copyAs')).toBe(demoTextTables.en!.copyAs);
    expect(demoText('de')('saved', { format: 'XML' })).toContain('XML');
  });
});
