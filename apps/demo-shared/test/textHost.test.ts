import { describe, expect, it } from 'vitest';
import type { TypeDescriptors } from '@beneficial-strategies/iso20022-validate';
import { DEMO_ENGLISH_ONLY } from '../src/demoText.ts';
import { ENGLISH_ONLY, makePageText } from '../src/text/messages.ts';
import { catalogFromTypes, createHostI18n, hostFor, hostOverrides, loadHostResources, mergeI18nOverrides, parseTextHosts, type HostResources } from '../src/textHost.ts';
import { demoText } from '../src/demoText.ts';

describe('which host serves which language', () => {
  it('takes the configuration set at build time, unless the address says otherwise', () => {
    const d = { textHosts: 'fr=http://h:8803,de=http://h:8804' };
    expect(parseTextHosts('', undefined, d).languages).toEqual(['fr', 'de']);
    expect(hostFor(parseTextHosts('?lang=fr', undefined, d), 'fr')).toBe('http://h:8803');
    expect(parseTextHosts('?textHosts=es=http://h:8805', undefined, d).languages).toEqual(['es']);
  });
  it('has none without a parameter', () => {
    const c = parseTextHosts('?lang=fr');
    expect(c.languages).toEqual([]);
    expect(hostFor(c, 'fr')).toBeUndefined();
  });
  it('reads a host per language, and finds the language of a regional tag', () => {
    const c = parseTextHosts('?textHosts=en=http://h:8801,fr=http://h:8803/,en-US=http://h:8802');
    expect(c.languages).toEqual(['en', 'fr', 'en-US']);
    expect(hostFor(c, 'fr')).toBe('http://h:8803');
    expect(hostFor(c, 'fr-CA')).toBe('http://h:8803');
    expect(hostFor(c, 'en-US')).toBe('http://h:8802');
    expect(hostFor(c, 'de')).toBeUndefined();
  });
  it('reads one pattern for the languages it serves', () => {
    const c = parseTextHosts('?textHost=https://iso-20022-text-{lang}.example.com&textLangs=en,en-US,fr');
    expect(c.languages).toEqual(['en', 'en-US', 'fr']);
    expect(hostFor(c, 'en-US')).toBe('https://iso-20022-text-en-us.example.com');
    expect(hostFor(c, 'fr')).toBe('https://iso-20022-text-fr.example.com');
  });
});

// a message of two types: a component with an element, and a code set with a code and a rule on the component
const descriptors = {
  Address: {
    name: 'Address', isoId: 'T1', kind: 'component',
    fields: [{ name: 'PostCode', isoId: 'F1', xmlTag: 'PstCd', displayName: 'Post Code', kind: 'text', type: 'Max16Text', required: false }],
    rules: [{ name: 'SomeRule', isoId: 'R1', text: 'x' }],
  },
  AdviceCode: { name: 'AdviceCode', isoId: 'S1', kind: 'code', options: [{ value: 'ADWD', name: 'AdviceWithDetails', isoId: 'C1' }] },
  Bic: { name: 'Bic', isoId: 'T3', kind: 'text', pattern: '[A-Z]{4}' },
} as unknown as TypeDescriptors;

const types = {
  Address: { isoType: 'Address', name: 'Adresse postale', definition: 'Adresse.', isoElements: { PostCode: { name: 'Code postal', definition: 'Le code.' } }, isoRules: { SomeRule: { definition: 'La règle.' } } },
  AdviceCode: { isoType: 'AdviceCode', definition: 'Avis.', isoCodes: { ADWD: { isoName: 'AdviceWithDetails', name: 'Avis avec détails', definition: 'Avec détail.' } } },
  Bic: { isoType: 'Bic', definition: 'BIC.', format: 'Format requis : 4 lettres' },
  ISODateTime: { isoType: 'ISODateTime', format: 'Utilisez AAAA-MM-JJThh:mm:ss' },
};

describe('the ISO text of a message from a host', () => {
  it('is keyed by the repository ids of the descriptors', () => {
    const c = catalogFromTypes(descriptors, types);
    expect(c.types).toEqual({ T1: 'Adresse.', T3: 'BIC.' });
    expect(c.codeSets).toEqual({ S1: 'Avis.' });
    expect(c.fields).toEqual({ F1: 'Le code.' });
    expect(c.labels).toEqual({ F1: 'Code postal' });
    expect(c.codes).toEqual({ C1: 'Avec détail.' });
    expect(c.codeNames).toEqual({ C1: 'Avis avec détails' });
    expect(c.rules).toEqual({ R1: 'La règle.' });
    expect(c.typeNames).toEqual({ T1: 'Adresse postale' });
  });
  it('finds a code by its ISO name when the value is not a key', () => {
    const c = catalogFromTypes(descriptors, { AdviceCode: { isoType: 'AdviceCode', isoCodes: { WithDetails: { isoName: 'AdviceWithDetails', name: 'Avec' } } } });
    expect(c.codeNames).toEqual({ C1: 'Avec' });
  });
});

const resources: HostResources = {
  page: { draft: '{n, plural, =1 {brouillon — # problème} other {brouillon — # problèmes}}', copyXml: 'Copier le XML' },
  controls: { copyAs: 'Copier en tant que', saved: '{format} enregistré' },
  ui: { required: '(obligatoire)', add: '+ Ajouter {label}' },
  validation: { too_short: '{min, plural, =1 {Au moins # caractère} other {Au moins # caractères}}', invalid_format: 'Format non valide' },
  types,
};

describe('the overrides a host becomes', () => {
  const o = hostOverrides('fr', resources, descriptors);
  it('gives the page text, with its plurals', () => {
    const draft = o.page.draft as (p: Record<string, number>) => string;
    expect(draft({ n: 1 })).toBe('brouillon — 1 problème');
    expect(draft({ n: 4 })).toBe('brouillon — 4 problèmes');
    expect(o.page.copyXml).toBe('Copier le XML');
  });
  it('gives the controls text, which the demo function fills', () => expect(demoText('fr', o.controls)('saved', { format: 'PNG' })).toBe('PNG enregistré'));
  it('gives the library ui and validation messages for the locale', () => {
    const add = o.i18n.ui!.fr!.add as (p: Record<string, string>) => string;
    expect(add({ label: 'Nom' })).toBe('+ Ajouter Nom');
    expect(o.i18n.ui!.fr!.required).toBe('(obligatoire)');
    const short = o.i18n.validation!.fr!.too_short as (p: Record<string, number>) => string;
    expect(short({ min: 1 })).toBe('Au moins 1 caractère');
  });
  it('says what the type says when a text does not match its pattern, else the generic text', () => {
    const invalid = o.i18n.validation!.fr!.invalid_format as (p: Record<string, string>) => string;
    expect(invalid({ pattern: '[A-Z]{4}' })).toBe('Format requis : 4 lettres');
    expect(invalid({ pattern: 'unknown' })).toBe('Format non valide');
    // the issue carries the compiled expression
    expect(invalid({ pattern: '^(?:[A-Z]{4})$' })).toBe('Format requis : 4 lettres');
  });
  it('takes the date and time messages from the format of their types', () => expect(o.i18n.validation!.fr!.datetime_format).toBe('Utilisez AAAA-MM-JJThh:mm:ss'));
  it('puts the ISO text in the definitions of the locale', () => expect(o.i18n.definitions!.fr!.labels).toEqual({ F1: 'Code postal' }));
  it('has nothing for a host that has nothing', () => {
    const none = hostOverrides('fr', { types: {} }, descriptors);
    expect(none.i18n).toEqual({});
    expect(none.page).toEqual({});
  });
});

describe('merging with what the embedding page passes', () => {
  it('keeps the host text and lets the page win per message', () => {
    const host = hostOverrides('fr', resources, descriptors).i18n;
    const m = mergeI18nOverrides(host, { ui: { fr: { required: '(requis)' } } })!;
    expect(m.ui!.fr!.required).toBe('(requis)');
    expect(m.ui!.fr!.add).toBeDefined();
    expect(m.definitions).toEqual(host.definitions);
  });
});

describe('loading from a host', () => {
  it('collects what answers and ignores what does not (404, a host that is down)', async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(url);
      if (url.endsWith('/tools/explorer/page')) return { ok: true, json: async () => ({ copyXml: 'Copier' }) };
      if (url.endsWith('/Bic')) return { ok: true, json: async () => ({ isoType: 'Bic', name: 'BIC' }) };
      if (url.endsWith('/Iban')) throw new Error('network');
      return { ok: false, json: async () => ({}) };
    };
    const r = await loadHostResources('http://h:8803', ['Bic', 'Iban', 'Missing'], fetcher);
    expect(r.page).toEqual({ copyXml: 'Copier' });
    expect(r.controls).toBeUndefined();
    // one request per type name, at /{TypeName}: no per-message bundle
    expect(Object.keys(r.types)).toEqual(['Bic']);
    expect(calls).toContain('http://h:8803/Bic');
    expect(calls).toContain('http://h:8803/Missing');
    expect(calls).toContain('http://h:8803/tools/headless/ui');
    expect(calls).toContain('http://h:8803/tools/headless/validation');
    expect(calls).toContain('http://h:8803/areas');
    expect(calls).toContain('http://h:8803/messages');
  });
});

describe('the Explorer carries no language but English', () => {
  it('shows English for a language no host supplies, although the library and the demo have French', () => {
    const i18n = createHostI18n('fr');
    expect(i18n.t('required')).toBe('(required)');
    expect(i18n.validation.required).toBe('Required');
    expect(makePageText(i18n, undefined, ENGLISH_ONLY).t('copyXml')).toBe('Copy XML');
    expect(demoText('fr', undefined, DEMO_ENGLISH_ONLY)('copyAs')).toBe('Copy as');
  });
  it('shows what a host supplies, and English for the rest', () => {
    const o = hostOverrides('fr', resources, descriptors);
    const i18n = createHostI18n('fr', o.i18n);
    expect(i18n.t('required')).toBe('(obligatoire)');
    expect(i18n.t('optional')).toBe('(optional)');
    expect(i18n.defs.label({ name: 'PostCode', isoId: 'F1' } as never, 'Post Code').text).toBe('Code postal');
    expect(i18n.defs.label({ name: 'Other', isoId: 'F9' } as never, 'Other').text).toBe('Other');
  });
  it('does not apply the library American-English rules unless a host says so', () => {
    expect(createHostI18n('en-US').defs.label({ name: 'TownName', isoId: 'x' } as never, 'Town Name').text).toBe('Town Name');
  });
});

describe('the areas and messages a host names', () => {
  it('become the names a list shows', () => {
    const o = hostOverrides('fr', { types: {}, areas: { isoAreas: { pain: { name: 'Initiation de paiements', definition: 'Messages…' } } }, messages: { isoMessages: { 'pain.001.001.13': { name: 'Initiation de virement' } } } }, descriptors);
    expect(o.catalog.areas.pain!.name).toBe('Initiation de paiements');
    expect(o.catalog.messages['pain.001.001.13']!.name).toBe('Initiation de virement');
    expect(hostOverrides('fr', { types: {} }, descriptors).catalog).toEqual({ areas: {}, messages: {} });
  });
});

describe('the title of a form', () => {
  it('is the type name a host gives, and the English derived name otherwise', () => {
    const o = hostOverrides('fr', resources, descriptors);
    const i18n = createHostI18n('fr', o.i18n);
    expect(i18n.defs.typeName({ isoId: 'T1' }, 'Address').text).toBe('Adresse postale');
    expect(i18n.defs.typeName({ isoId: 'unknown' }, 'Address 27').text).toBe('Address 27');
  });
});
