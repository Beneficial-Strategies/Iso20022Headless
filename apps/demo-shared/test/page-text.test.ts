import { describe, expect, it } from 'vitest';
import { areaIndex } from '@beneficial-strategies/iso20022-validate';
import { createI18n } from '@beneficial-strategies/iso20022-react-ui';
import { PAGE_KEYS, createPageMessages, makePageText, pageLocales, untranslatedPageKeys } from '../src/text/messages.ts';
import { demoText, demoTextTables, type DemoKey } from '../src/demoText.ts';
import { pageEn } from '../src/text/page.en.ts';

// a little text of another language, as a text host would serve it, passed in to exercise the mechanism
const pageEs = { doneEditing: 'Edición terminada', draft: ({ n }: { n: number }) => `borrador — ${n} ${n === 1 ? 'problema' : 'problemas'}`, problemsRemain: ({ n }: { n: number }) => `Quedan ${n} problemas.` };
const withEs = { en: pageEn, es: { ...pageEn, ...pageEs } } as never;
const pageFr = { ...pageEn, doneEditing: 'Édition terminée' };

describe("the demo page's own text", () => {
  it('English has every key, and nothing extra', () => {
    expect(Object.keys(pageEn).sort()).toEqual([...PAGE_KEYS].sort());
  });

  it('function messages accept a count', () => {
    const t = makePageText(createI18n('en')).t;
    for (const k of ['draft', 'problemsRemain', 'rulesViolated'] as const) {
      expect(t(k, { n: 1 }), k).toMatch(/1/);
      expect(t(k, { n: 3 }), k).toMatch(/3/);
    }
  });

  it('plural forms read well in English, and in a language passed in', () => {
    const es = makePageText(createI18n('es'), undefined, withEs).t;
    expect(es('draft', { n: 1 })).toBe('borrador — 1 problema');
    expect(es('problemsRemain', { n: 2 })).toBe('Quedan 2 problemas.');
    expect(makePageText(createI18n('en')).t('draft', { n: 3 })).toBe('draft — 3 problem(s)');
  });

  it('the Explorer carries English only', () => {
    expect(Object.keys(pageLocales)).toEqual(['en']);
    expect(makePageText(createI18n('fr')).t('doneEditing')).toBe('Done editing');
  });

  it("its fallback is the demo's own English, never the ISO text or the library catalog", () => {
    expect(untranslatedPageKeys('it').length).toBe(PAGE_KEYS.length);
    expect(makePageText(createI18n('it')).t('doneEditing')).toBe('Done editing');
    expect(createPageMessages('es-MX', {}, withEs).doneEditing).toBe(pageEs.doneEditing); // es-MX -> es -> demo English
    expect(createPageMessages('en-US').doneEditing).toBe(pageEn.doneEditing);
  });

  it('library keys come from the library, so the two catalogs never disagree', () => {
    const fr = makePageText(createI18n('fr', { ui: { fr: { now: 'Maintenant' } } }), undefined, { en: pageEn, fr: pageFr } as never).t;
    expect(fr('now')).toBe('Maintenant'); // a library key
    expect(fr('doneEditing')).toBe('Édition terminée'); // a page key
  });

  it('a key nobody defined reads as an empty string, so callers can fall back', () => {
    expect(makePageText(createI18n('en')).t('skin_nobody' as never)).toBe('');
  });

  it('every area has an English name and description that match the registry', () => {
    for (const a of areaIndex) {
      expect(pageEn[`areaName_${a.code}` as keyof typeof pageEn], a.code).toBe(a.name);
      expect(pageEn[`areaDesc_${a.code}` as keyof typeof pageEn], a.code).toBe(a.definition);
    }
  });
});

describe('the Copy as and field-mode text', () => {
  const FR = { ...demoTextTables.en!, copyAs: 'Copier sous' } as Record<DemoKey, string>;

  it('a regional tag uses its language, and an unknown language the English', () => {
    expect(Object.keys(demoTextTables)).toEqual(['en']);
    expect(demoText('fr-CA', undefined, { en: demoTextTables.en!, fr: FR })('copyAs')).toBe(FR.copyAs);
    expect(demoText('it')('copyAs')).toBe(demoTextTables.en!.copyAs);
    expect(demoText('de', undefined, { en: demoTextTables.en!, de: FR })('saved', { format: 'XML' })).toContain('XML');
  });
});
