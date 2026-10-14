import { describe, expect, it } from 'vitest';
import { areaIndex } from '@beneficial-strategies/iso20022-validate';
import { createI18n } from '@beneficial-strategies/iso20022-react-ui';
import { PAGE_KEYS, createPageMessages, makePageText, pageLocales, untranslatedPageKeys } from '../src/text/messages.ts';
import { demoText, demoTextTables } from '../src/demoText.ts';
import { pageEn } from '../src/text/page.en.ts';
// the languages the Explorer used to carry (the text hosts' now): still files, imported here to keep them complete and to exercise the mechanism
import { pageEs } from '../src/text/page.es.ts';
import { pageFr } from '../src/text/page.fr.ts';
import { pageDe } from '../src/text/page.de.ts';
import { pagePt } from '../src/text/page.pt.ts';
import { ES } from '../src/demoText.es.ts';
import { FR } from '../src/demoText.fr.ts';
import { DE } from '../src/demoText.de.ts';
import { PT } from '../src/demoText.pt.ts';
import { uiFr } from '../../../packages/react-ui/src/i18n/ui.fr.ts';

const LEGACY_PAGE = { es: pageEs, fr: pageFr, de: pageDe, pt: pagePt } as const;
const LEGACY_DEMO = { es: ES, fr: FR, de: DE, pt: PT } as const;
/** The English plus one legacy language, as the base of the page text. */
const withLegacy = (lang: keyof typeof LEGACY_PAGE) => ({ en: pageEn, [lang]: LEGACY_PAGE[lang] });

const SHIPPED = ['es', 'fr', 'de', 'pt'] as const;
const slots = (m: unknown) => (typeof m === 'string' ? [...m.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort() : null);

describe("the demo page's own text", () => {
  it.each(SHIPPED)('%s has every key the demo English has, and nothing extra', (lang) => {
    expect(Object.keys(LEGACY_PAGE[lang]).sort()).toEqual([...PAGE_KEYS].sort());
    expect(Object.keys(pageEn).sort()).toEqual([...PAGE_KEYS].sort());
  });

  it.each(SHIPPED)('every %s message has the same placeholders as the English (plain templates)', (lang) => {
    for (const k of PAGE_KEYS) {
      const [e, s] = [slots(pageEn[k]), slots(LEGACY_PAGE[lang][k])];
      if (e && s) expect(s, `${lang}.${k}`).toEqual(e);
    }
  });

  it('function messages in every language accept a count', () => {
    for (const lang of SHIPPED) {
      const t = makePageText(createI18n(lang), undefined, withLegacy(lang)).t;
      for (const k of ['draft', 'problemsRemain', 'rulesViolated'] as const) {
        expect(t(k, { n: 1 }), `${lang}.${k}`).toMatch(/1/);
        expect(t(k, { n: 3 }), `${lang}.${k}`).toMatch(/3/);
      }
    }
  });

  it('plural forms read well in Spanish and English', () => {
    const es = makePageText(createI18n('es'), undefined, withLegacy('es')).t;
    expect(es('draft', { n: 1 })).toBe('borrador — 1 problema');
    expect(es('problemsRemain', { n: 2 })).toBe('Quedan 2 problemas.');
    expect(makePageText(createI18n('en')).t('draft', { n: 3 })).toBe('draft — 3 problem(s)');
  });

  it('nothing in a legacy language falls through to English', () => {
    for (const lang of SHIPPED) expect(untranslatedPageKeys(lang, withLegacy(lang)), lang).toEqual([]);
  });

  it('the Explorer carries English only', () => {
    expect(Object.keys(pageLocales)).toEqual(['en']);
    expect(makePageText(createI18n('fr')).t('doneEditing')).toBe('Done editing');
  });

  it('its fallback is the demo\'s own English, never the ISO text or the library catalog', () => {
    expect(untranslatedPageKeys('it').length).toBe(PAGE_KEYS.length);
    expect(makePageText(createI18n('it')).t('doneEditing')).toBe('Done editing');
    expect(createPageMessages('es-MX', {}, withLegacy('es')).doneEditing).toBe(pageEs.doneEditing); // es-MX -> es -> demo English
    expect(createPageMessages('en-US').doneEditing).toBe(pageEn.doneEditing);
  });

  it('library keys come from the library, so the two catalogs never disagree', () => {
    const fr = makePageText(createI18n('fr', { ui: { fr: uiFr } }), undefined, withLegacy('fr')).t;
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
        expect(LEGACY_PAGE[lang][`areaName_${a.code}` as keyof typeof pageEn], `${lang} ${a.code}`).toBeTruthy();
        // the repository gives no description for some areas (trck); then there is nothing to translate
        if (a.definition) expect(LEGACY_PAGE[lang][`areaDesc_${a.code}` as keyof typeof pageEn], `${lang} ${a.code}`).toBeTruthy();
      }
    }
  });
});

describe('the Copy as and field-mode text', () => {
  const keys = Object.keys(demoTextTables.en!).sort();

  it.each(SHIPPED)('%s has every key the English has, with the same placeholders', (lang) => {
    expect(Object.keys(LEGACY_DEMO[lang]).sort()).toEqual(keys);
    for (const k of keys) {
      const [e, s] = [slots(demoTextTables.en![k as keyof typeof demoTextTables.en]), slots(LEGACY_DEMO[lang][k as keyof typeof demoTextTables.en])];
      expect(s, `${lang}.${k}`).toEqual(e);
    }
  });

  it('a regional tag uses its language, and an unknown language the English', () => {
    expect(Object.keys(demoTextTables)).toEqual(['en']);
    expect(demoText('fr-CA', undefined, { en: demoTextTables.en!, fr: FR })('copyAs')).toBe(FR.copyAs);
    expect(demoText('it')('copyAs')).toBe(demoTextTables.en!.copyAs);
    expect(demoText('de', undefined, { en: demoTextTables.en!, de: DE })('saved', { format: 'XML' })).toContain('XML');
  });
});
