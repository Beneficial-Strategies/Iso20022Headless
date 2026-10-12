import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadDefinitionCatalog } from '@beneficial-strategies/iso20022-validate/locales';
import { loadTextPack } from '@beneficial-strategies/iso20022-validate/text-pack';
import { createMessages, validationLocales, type MessageParams, type TypeDescriptors, type ValidationMessages } from '@beneficial-strategies/iso20022-validate';
import {
  createDefinitions,
  definitionLocales,
  type DefinitionCatalog,
  type Definitions,
} from '@beneficial-strategies/iso20022-validate/definitions';
import { createUiMessages, translate, uiLocales, type UiKey, type UiMessages } from './messages.ts';

/** Consumer overrides, each keyed by locale tag. Anything omitted falls back to the shipped defaults, then English. */
export interface I18nOverrides {
  /** Interface text: `{ es: { doneEditing: 'Terminado' } }`. A new locale tag adds a language. */
  ui?: Record<string, Partial<UiMessages>>;
  /** Validation messages: `{ es: { required: 'Campo obligatorio' } }`. */
  validation?: Record<string, Partial<ValidationMessages>>;
  /** Spec text and translated element names, keyed by ISO id. */
  definitions?: Record<string, DefinitionCatalog>;
}

export interface I18n {
  /** Resolved locale tag, e.g. `es` or `es-MX`. */
  locale: string;
  /** Its language part, e.g. `es`. */
  lang: string;
  t: (key: UiKey, params?: MessageParams) => string;
  validation: ValidationMessages;
  defs: Definitions;
}

/** Layer `extra` over `base` per locale and per key, so overriding one message keeps the rest of that language. */
function mergeLocales<T extends object>(base: Record<string, T>, extra: Record<string, T> = {}): Record<string, T> {
  const out: Record<string, T> = { ...base };
  for (const [tag, catalog] of Object.entries(extra)) out[tag] = { ...out[tag], ...catalog };
  return out;
}

const CATALOG_MAPS = ['types', 'fields', 'codes', 'codeSets', 'labels', 'codeNames', 'rules'] as const;

function mergeDefinitionLocales(base: Record<string, DefinitionCatalog>, extra: Record<string, DefinitionCatalog> = {}): Record<string, DefinitionCatalog> {
  const out: Record<string, DefinitionCatalog> = { ...base };
  for (const [tag, c] of Object.entries(extra)) {
    const cur: DefinitionCatalog = out[tag] ?? {};
    const merged: DefinitionCatalog = {};
    for (const m of CATALOG_MAPS) merged[m] = { ...cur[m], ...c[m] };
    out[tag] = merged;
  }
  return out;
}

/**
 * `shipped` is extra base catalogs (for example the lazily loaded Spanish text); `overrides` always win over them.
 */
export function createI18n(locale = 'en', overrides: I18nOverrides = {}, shipped: Record<string, DefinitionCatalog> = {}): I18n {
  const lang = locale.split('-')[0] ?? 'en';
  const ui = createUiMessages(locale, {}, mergeLocales(uiLocales, overrides.ui));
  const validation = createMessages(locale, {}, mergeLocales(validationLocales, overrides.validation));
  const defs = createDefinitions(locale, {}, mergeDefinitionLocales(mergeDefinitionLocales(definitionLocales, shipped), overrides.definitions));
  return { locale, lang, t: (key, params) => translate(ui, key, params), validation, defs };
}

const I18nContext = createContext<I18n>(createI18n('en'));

export const I18nProvider = I18nContext.Provider;
export const useI18n = (): I18n => useContext(I18nContext);

/** The shipped spec-text catalog for a locale, loaded on demand (undefined while loading or when none exists). `enabled` false: do not load it. */
export function useShippedCatalog(locale: string, enabled = true): Record<string, DefinitionCatalog> {
  const lang = locale.split('-')[0] ?? 'en';
  const [loaded, setLoaded] = useState<Record<string, DefinitionCatalog>>({});
  useEffect(() => {
    if (!enabled || lang === 'en' || loaded[lang]) return;
    let live = true;
    void loadDefinitionCatalog(lang).then((c) => {
      if (live && c) setLoaded((cur) => ({ ...cur, [lang]: c }));
    });
    return () => {
      live = false;
    };
  }, [enabled, lang, loaded]);
  return loaded;
}

/**
 * Where the spec text of the language comes from instead of the catalogs shipped with the library: a text host that serves static
 * files (see `loadTextPack`). The form asks for the labels of the language and the definitions of the messages it shows, nothing else.
 */
export interface TextSource {
  /** The host's address, e.g. `https://iso-20022-text.beneficialstrategies.com`. */
  baseUrl: string;
  /** The messages whose text is needed, e.g. `['pain.001.001.13']` (a message with the application header also needs `head.001.001.04`). */
  messages: readonly string[];
  /** The type descriptors of those messages: the pack's names are matched to ids through them. */
  typeDescriptors: TypeDescriptors;
}

/**
 * The text of a language from a text host, as the catalogs `createI18n` takes, keyed by locale tag: the exact tag (`en-US`, `es-MX`) and
 * its language (`es`) when different, each only if the host has a pack for it. Empty while loading, or when `source` is not given.
 */
export function useTextPack(locale: string, source: TextSource | undefined): Record<string, DefinitionCatalog> {
  const lang = locale.split('-')[0] ?? 'en';
  // English is the base text and has no pack; a regional English (`en-US`) is a pack of its own
  const tags = [...new Set([locale, lang])].filter((t) => t !== 'en');
  const tagKey = tags.join(',');
  const [loaded, setLoaded] = useState<{ key: string; catalogs: Record<string, DefinitionCatalog> } | undefined>();
  const key = source && tags.length ? `${source.baseUrl}|${tagKey}|${source.messages.join(',')}` : '';
  const typeDescriptors = source?.typeDescriptors;
  useEffect(() => {
    if (!source || tags.length === 0) return;
    let live = true;
    void Promise.all(tags.map((t) => loadTextPack(source.baseUrl, t, source.messages, source.typeDescriptors).then((c) => [t, c] as const))).then((all) => {
      const catalogs = Object.fromEntries(all.filter((x): x is readonly [string, DefinitionCatalog] => x[1] !== undefined));
      if (live && Object.keys(catalogs).length > 0) setLoaded({ key, catalogs });
    });
    return () => {
      live = false;
    };
    // the source object is rebuilt on every render; what matters is its address, the messages and the descriptors
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, typeDescriptors]);
  return useMemo(() => (loaded && loaded.key === key ? loaded.catalogs : {}), [loaded, key]);
}

/** Build (and memoize) an I18n for a locale. Pass a stable `overrides` object. Spec text for the locale loads lazily. */
export function useCreateI18n(locale: string, overrides?: I18nOverrides, textSource?: TextSource): I18n {
  // with a text source the spec text comes from the host, not from the catalogs bundled with the library
  const shipped = useShippedCatalog(locale, !textSource);
  const fromHost = useTextPack(locale, textSource);
  const catalogs = textSource ? fromHost : shipped;
  return useMemo(() => createI18n(locale, overrides, catalogs), [locale, overrides, catalogs]);
}

/** Locale tags with any text of their own: shipped ones plus anything the consumer adds. */
export function supportedLocales(overrides: I18nOverrides = {}): string[] {
  return [...new Set([...Object.keys(uiLocales), ...Object.keys(overrides.ui ?? {})])];
}
