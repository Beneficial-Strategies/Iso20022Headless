// Spec definitions and translated labels. A separate entry point, so validation-only consumers
// don't bundle ~50 KB of prose.
import type { FieldDescriptor, TypeDescriptor } from './runtime.ts';
import { codeDefinitions, codeSetDefinitions, fieldDefinitions, typeDefinitions } from './generated/pain001.definitions.ts';

export * from './generated/pain001.definitions.ts';
export { typeDescriptors } from './generated/pain001.ts';

export type TranslationStatus = 'machine' | 'reviewed';

/** A translation: bare text, or text with its review status. */
export type CatalogEntry = string | { text: string; status?: TranslationStatus };

/** Text for one language, keyed by ISO 20022 repository id (the `isoId` on descriptors). */
export interface DefinitionCatalog {
  types?: Record<string, CatalogEntry>;
  fields?: Record<string, CatalogEntry>;
  codes?: Record<string, CatalogEntry>;
  codeSets?: Record<string, CatalogEntry>;
  /** Translated element names. Without one, the English name derived from the ISO element name is used. */
  labels?: Record<string, CatalogEntry>;
  /** Translated code names (the word after the code in a dropdown, e.g. `CHK — Cheque`). */
  codeNames?: Record<string, CatalogEntry>;
  /** Translated text of business rules, keyed by constraint id. */
  rules?: Record<string, CatalogEntry>;
}

/** The ISO repository text is English. Add a language by registering a catalog here or passing `locales`. */
export const definitionLocales: Record<string, DefinitionCatalog> = {
  en: { types: typeDefinitions, fields: fieldDefinitions, codes: codeDefinitions, codeSets: codeSetDefinitions },
};

/** A piece of text, the language it is actually in (English when the requested language has none), and its review status. */
export interface Localized {
  text: string;
  lang: string;
  /** Present for translations that carry a status. `machine` = drafted by a machine, not yet reviewed. */
  status?: TranslationStatus;
}

export interface Definitions {
  locale: string;
  field: (field: FieldDescriptor, fieldType: TypeDescriptor | undefined) => Localized | undefined;
  type: (type: TypeDescriptor | undefined) => Localized | undefined;
  code: (option: { isoId?: string | undefined }) => Localized | undefined;
  /** Element label: a translation when one exists, else `fallback` (English). */
  label: (field: { isoId?: string | undefined }, fallback: string) => Localized;
  /** Code name: a translation when one exists, else `fallback` (the English name). */
  codeName: (option: { isoId?: string | undefined }, fallback: string) => Localized;
  /** Business rule text: a translation when one exists, else `fallback` (the English spec text). */
  rule: (rule: { isoId?: string | undefined }, fallback: string) => Localized;
}

type Layer = { lang: string; catalog: DefinitionCatalog };

const asLocalized = (e: CatalogEntry, lang: string): Localized =>
  typeof e === 'string' ? { text: e, lang } : { text: e.text, lang, ...(e.status ? { status: e.status } : {}) };

/**
 * Resolve text for a locale. Order: your `overrides`, the exact locale (`es-MX`), its language (`es`),
 * then English. Each result says which language it is in (so a UI can mark untranslated text) and, for
 * translations, whether it has been reviewed.
 */
export function createDefinitions(
  locale = 'en',
  overrides: DefinitionCatalog = {},
  locales: Record<string, DefinitionCatalog> = definitionLocales,
): Definitions {
  const lang = locale.split('-')[0] ?? 'en';
  const layers: Layer[] = [];
  const add = (l: string, catalog: DefinitionCatalog | undefined) => catalog && layers.push({ lang: l, catalog });
  add(locale, overrides);
  add(locale, locales[locale]);
  if (lang !== locale) add(lang, locales[lang]);
  if (lang !== 'en') add('en', locales.en);

  const find = (pick: (c: DefinitionCatalog) => Record<string, CatalogEntry> | undefined, id: string | undefined): Localized | undefined => {
    if (!id) return undefined;
    for (const { lang: l, catalog } of layers) {
      const e = pick(catalog)?.[id];
      if (e) return asLocalized(e, l);
    }
    return undefined;
  };

  return {
    locale,
    // an element's own definition, else the definition of its type
    field: (field, fieldType) => find((c) => c.fields, field.isoId) ?? find((c) => c.types, fieldType?.isoId),
    type: (type) => find((c) => c.types, type?.isoId),
    code: (option) => find((c) => c.codes, option.isoId),
    label: (field, fallback) => find((c) => c.labels, field.isoId) ?? { text: fallback, lang: 'en' },
    codeName: (option, fallback) => find((c) => c.codeNames, option.isoId) ?? { text: fallback, lang: 'en' },
    rule: (rule, fallback) => find((c) => c.rules, rule.isoId) ?? { text: fallback, lang: 'en' },
  };
}
