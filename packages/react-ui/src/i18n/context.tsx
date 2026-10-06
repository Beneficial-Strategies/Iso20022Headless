import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { loadDefinitionCatalog } from '@beneficial-strategies/iso20022-validate/locales';
import { createMessages, validationLocales, type MessageParams, type ValidationMessages } from '@beneficial-strategies/iso20022-validate';
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

/** The shipped spec-text catalog for a locale, loaded on demand (undefined while loading or when none exists). */
export function useShippedCatalog(locale: string): Record<string, DefinitionCatalog> {
  const lang = locale.split('-')[0] ?? 'en';
  const [loaded, setLoaded] = useState<Record<string, DefinitionCatalog>>({});
  useEffect(() => {
    if (lang === 'en' || loaded[lang]) return;
    let live = true;
    void loadDefinitionCatalog(lang).then((c) => {
      if (live && c) setLoaded((cur) => ({ ...cur, [lang]: c }));
    });
    return () => {
      live = false;
    };
  }, [lang, loaded]);
  return loaded;
}

/** Build (and memoize) an I18n for a locale. Pass a stable `overrides` object. Spec text for the locale loads lazily. */
export function useCreateI18n(locale: string, overrides?: I18nOverrides): I18n {
  const shipped = useShippedCatalog(locale);
  return useMemo(() => createI18n(locale, overrides, shipped), [locale, overrides, shipped]);
}

/** Locale tags with any text of their own: shipped ones plus anything the consumer adds. */
export function supportedLocales(overrides: I18nOverrides = {}): string[] {
  return [...new Set([...Object.keys(uiLocales), ...Object.keys(overrides.ui ?? {})])];
}
