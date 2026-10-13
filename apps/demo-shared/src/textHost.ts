/**
 * The Explorer's text from text hosts (see the ISO 20022 text convention, https://github.com/Beneficial-Strategies/iso-20022-text).
 *
 * One host serves one language. Which host serves which language is configuration, in the page's address:
 *
 *   ?textHosts=en=http://localhost:8801,fr=http://localhost:8803     a host per language tag
 *   ?textHost=https://iso-20022-text-{lang}.beneficialstrategies.com   one pattern for every language (`{lang}` is the tag in lower case)
 *   ?textLangs=en,fr,de                                                languages the pattern serves (default: the languages the demo knows)
 *
 * A deployment can set the same three once at build time (VITE_TEXT_HOSTS, VITE_TEXT_HOST, VITE_TEXT_LANGS); a parameter in the address overrides it.
 *
 * With neither parameter nothing changes: the text is what the demo and the library carry. With a host, everything the Explorer shows in that
 * language comes from it: the page and controls text (`/tools/explorer/*`), the form controls and validation messages (`/tools/headless/*`),
 * and the ISO names, definitions, codes and rules of the message (`/{message}`), converted into the overrides the library already accepts.
 * Whatever a host does not have (a message it does not cover, a host that is down) falls back to the bundled text.
 */
import { createContext, useEffect, useMemo, useState } from 'react';
import { createUiMessages, translate, type I18n, type I18nOverrides, type UiMessages } from '@beneficial-strategies/iso20022-react-ui';
import { createMessages, normalizePattern, type TypeDescriptor, type TypeDescriptors, type ValidationMessages } from '@beneficial-strategies/iso20022-validate';
import { createDefinitions, definitionLocales, type DefinitionCatalog } from '@beneficial-strategies/iso20022-validate/definitions';
import { DEFAULT_LOCALES } from './settings.ts';
import { formatIcu, type IcuParams } from './icu.ts';
import type { DemoKey } from './demoText.ts';
import type { PageMessages } from './text/messages.ts';

export interface TextHostConfig {
  /** Host (base URL) by language tag. */
  hosts: Record<string, string>;
  /** A host pattern with `{lang}`, for the languages in `languages`. */
  template?: string;
  /** Every language this configuration offers. */
  languages: string[];
}

const trimSlash = (url: string): string => url.replace(/\/+$/, '');

/** The configuration in a query string (empty when it has none), with `defaults` for any parameter the string lacks. */
export function parseTextHosts(search: string, known: readonly string[] = DEFAULT_LOCALES, defaults: Partial<Record<'textHosts' | 'textHost' | 'textLangs', string>> = {}): TextHostConfig {
  const q = new URLSearchParams(search);
  // a deployment (or a developer's .env.local) can set the same three parameters once; the address overrides them
  for (const [k, v] of Object.entries(defaults)) if (v && !q.has(k)) q.set(k, v);
  const hosts: Record<string, string> = {};
  for (const part of (q.get('textHosts') ?? '').split(',')) {
    const eq = part.indexOf('=');
    if (eq > 0 && eq < part.length - 1) hosts[part.slice(0, eq).trim()] = trimSlash(part.slice(eq + 1).trim());
  }
  const template = q.get('textHost')?.trim() || undefined;
  const listed = (q.get('textLangs') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const languages = [...new Set([...Object.keys(hosts), ...(template ? (listed.length ? listed : known) : [])])];
  return { hosts, ...(template ? { template } : {}), languages };
}

/** The host that serves a locale: its own tag (`en-US`), then its language (`es` for `es-MX`), then the pattern. */
export function hostFor(config: TextHostConfig, locale: string): string | undefined {
  const lang = locale.split('-')[0] ?? locale;
  const own = config.hosts[locale] ?? config.hosts[lang];
  if (own) return own;
  if (!config.template) return undefined;
  const tag = config.languages.includes(locale) ? locale : lang;
  return trimSlash(config.template.replace('{lang}', tag.toLowerCase()));
}

type Texts = Record<string, string>;

/** A type resource, as the convention defines it (only what the Explorer reads). */
export interface TypeResource {
  isoType: string;
  name?: string;
  definition?: string;
  format?: string;
  isoElements?: Record<string, { name?: string; definition?: string }>;
  isoCodes?: Record<string, { isoName?: string; name?: string; definition?: string }>;
  isoRules?: Record<string, { definition?: string }>;
}

export interface HostResources {
  page?: Texts;
  controls?: Texts;
  ui?: Texts;
  validation?: Texts;
  /** The business areas (`/areas`) and the names of the messages (`/messages`), ISO's own text. */
  areas?: { isoAreas?: Record<string, { name?: string; definition?: string }> };
  messages?: { isoMessages?: Record<string, { name?: string }> };
  /** The type resources of the messages asked for, by type name. */
  types: Record<string, TypeResource>;
}

type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const cache = new Map<string, Promise<unknown>>();
async function getJson<T>(url: string, fetcher: Fetcher): Promise<T | undefined> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetcher(url).then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined);
    cache.set(url, pending);
  }
  return (await pending) as T | undefined;
}

/** Everything a host has for the Explorer. A resource it does not have is simply missing. */
export async function loadHostResources(host: string, messageIds: readonly string[], fetcher: Fetcher = (u) => fetch(u)): Promise<HostResources> {
  const [page, controls, ui, validation, areas, messages, ...bundles] = await Promise.all([
    getJson<Texts>(`${host}/tools/explorer/page`, fetcher),
    getJson<Texts>(`${host}/tools/explorer/controls`, fetcher),
    getJson<Texts>(`${host}/tools/headless/ui`, fetcher),
    getJson<Texts>(`${host}/tools/headless/validation`, fetcher),
    getJson<NonNullable<HostResources['areas']>>(`${host}/areas`, fetcher),
    getJson<NonNullable<HostResources['messages']>>(`${host}/messages`, fetcher),
    ...messageIds.map((id) => getJson<{ types?: Record<string, TypeResource> }>(`${host}/${id}`, fetcher)),
  ]);
  const types: Record<string, TypeResource> = {};
  for (const b of bundles) Object.assign(types, b?.types);
  return { ...(page ? { page } : {}), ...(controls ? { controls } : {}), ...(ui ? { ui } : {}), ...(validation ? { validation } : {}), ...(areas ? { areas } : {}), ...(messages ? { messages } : {}), types };
}

/** A text that may hold `{param}` or a plural: a plain string when it needs no values. */
const message = (text: string): string | ((p: IcuParams) => string) => (text.includes('{') ? (p) => formatIcu(text, p) : text);
const messages = (texts: Texts): Record<string, string | ((p: IcuParams) => string)> => Object.fromEntries(Object.entries(texts).map(([k, t]) => [k, message(t)]));

/** The validation messages whose text is the `format` of a type of the specification (see the convention). */
const FORMAT_TYPES: Record<string, string> = { date_format: 'ISODate', datetime_format: 'ISODateTime', time_format: 'ISOTime', year_format: 'ISOYear' };

/** The ISO text of the message's types, in the shape the library's definitions take (keyed by repository id). */
export function catalogFromTypes(descriptors: TypeDescriptors, types: Record<string, TypeResource>): DefinitionCatalog {
  const c: Required<DefinitionCatalog> = { types: {}, fields: {}, codes: {}, codeSets: {}, labels: {}, codeNames: {}, typeNames: {}, rules: {} };
  for (const [name, t] of Object.entries(descriptors) as [string, TypeDescriptor][]) {
    const r = types[name];
    if (!r) continue;
    if (t.isoId && r.definition) (t.kind === 'code' ? c.codeSets : c.types)[t.isoId] = r.definition;
    if (t.isoId && r.name) c.typeNames[t.isoId] = r.name;
    for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) {
      const e = r.isoElements?.[f.name];
      if (!e || !f.isoId) continue;
      if (e.definition) c.fields[f.isoId] = e.definition;
      if (e.name) c.labels[f.isoId] = e.name;
    }
    for (const o of t.options ?? []) {
      // a code is found by its value or by its ISO name
      const e = r.isoCodes?.[o.value] ?? Object.values(r.isoCodes ?? {}).find((x) => x.isoName === o.name);
      if (!e || !o.isoId) continue;
      if (e.definition) c.codes[o.isoId] = e.definition;
      if (e.name) c.codeNames[o.isoId] = e.name;
    }
    for (const x of t.rules ?? []) {
      const e = r.isoRules?.[x.name];
      if (e?.definition && x.isoId) c.rules[x.isoId] = e.definition;
    }
  }
  return c;
}

/** The names a list of areas or messages shows, from a host. */
export interface HostCatalog {
  areas: Record<string, { name?: string; definition?: string }>;
  messages: Record<string, { name?: string }>;
}

export const HostCatalogContext = createContext<HostCatalog | undefined>(undefined);

export interface HostOverrides {
  catalog: HostCatalog;
  i18n: I18nOverrides;
  page: Partial<PageMessages>;
  controls: Partial<Record<DemoKey, string>>;
}

/** What a host's resources become for one locale: the library's overrides plus the demo's own two sets. */
export function hostOverrides(locale: string, res: HostResources, descriptors: TypeDescriptors): HostOverrides {
  const i18n: I18nOverrides = {};
  if (res.ui) i18n.ui = { [locale]: messages(res.ui) as Partial<UiMessages> };
  const validation: Record<string, string | ((p: IcuParams) => string)> = res.validation ? messages(res.validation) : {};
  for (const [code, type] of Object.entries(FORMAT_TYPES)) {
    const format = res.types[type]?.format;
    if (format) validation[code] = message(format);
  }
  // a text that does not match its pattern says what the type's `format` says; the generic text is for a pattern the host does not know
  const byPattern = new Map<string, string>();
  for (const t of Object.values(descriptors)) {
    const format = res.types[t.name]?.format;
    // an issue carries the regular expression as it was compiled (`^(?:...)$`); the descriptor has the ISO pattern
    if (t.kind === 'text' && t.pattern && format && !byPattern.has(normalizePattern(t.pattern))) byPattern.set(normalizePattern(t.pattern), format);
  }
  const generic = validation.invalid_format;
  if (byPattern.size || generic) {
    validation.invalid_format = (p: IcuParams) => byPattern.get(normalizePattern(String(p.pattern ?? ''))) ?? (typeof generic === 'function' ? generic(p) : generic ?? 'Invalid format');
  }
  if (Object.keys(validation).length) i18n.validation = { [locale]: validation as Partial<ValidationMessages> };
  if (Object.keys(res.types).length) i18n.definitions = { [locale]: catalogFromTypes(descriptors, res.types) };
  return { catalog: { areas: res.areas?.isoAreas ?? {}, messages: res.messages?.isoMessages ?? {} }, i18n, page: (res.page ? messages(res.page) : {}) as Partial<PageMessages>, controls: (res.controls ?? {}) as Partial<Record<DemoKey, string>> };
}

/** Load a locale's resources from its host (if the configuration has one) and convert them. Undefined until loaded, and when there is no host. */
export function useHostText(config: TextHostConfig, locale: string, messageIds: readonly string[], descriptors: TypeDescriptors | undefined): HostOverrides | undefined {
  const host = hostFor(config, locale);
  const ids = messageIds.join(',');
  const [loaded, setLoaded] = useState<{ key: string; res: HostResources } | undefined>();
  useEffect(() => {
    if (!host) return;
    let live = true;
    void loadHostResources(host, ids ? ids.split(',') : []).then((res) => live && setLoaded({ key: `${host}|${ids}`, res }));
    return () => {
      live = false;
    };
  }, [host, ids]);
  return useMemo(() => (host && loaded?.key === `${host}|${ids}` && descriptors ? hostOverrides(locale, loaded.res, descriptors) : undefined), [host, ids, loaded, locale, descriptors]);
}

/** Layer `top` over `base`, per section and locale, so that overriding one message keeps the rest of that locale. */
export function mergeI18nOverrides(base: I18nOverrides | undefined, top: I18nOverrides | undefined): I18nOverrides | undefined {
  if (!base) return top;
  if (!top) return base;
  const out: I18nOverrides = {};
  for (const section of ['ui', 'validation'] as const) {
    const a = base[section] as Record<string, object> | undefined, b = top[section] as Record<string, object> | undefined;
    if (!a && !b) continue;
    const merged: Record<string, object> = { ...a };
    for (const [tag, m] of Object.entries(b ?? {})) merged[tag] = { ...merged[tag], ...m };
    (out as Record<string, unknown>)[section] = merged;
  }
  if (base.definitions || top.definitions) {
    const merged: Record<string, DefinitionCatalog> = { ...base.definitions };
    for (const [tag, c] of Object.entries(top.definitions ?? {})) {
      const cur = merged[tag] ?? {};
      merged[tag] = Object.fromEntries(['types', 'fields', 'codes', 'codeSets', 'labels', 'codeNames', 'typeNames', 'rules'].map((k) => [k, { ...cur[k as keyof DefinitionCatalog], ...c[k as keyof DefinitionCatalog] }]));
    }
    out.definitions = merged;
  }
  return out;
}

/**
 * The library's `I18n` for a locale with none of its bundled languages: English, plus whatever the overrides (from a host) say. The library's translated
 * interface text, validation messages, spec-text catalogs and American-English rewrite rules are not used; only the ISO English that the specification itself is written in.
 */
export function createHostI18n(locale: string, overrides: I18nOverrides = {}): I18n {
  const lang = locale.split('-')[0] ?? 'en';
  const ui = createUiMessages(locale, {}, overrides.ui ?? {});
  const validation = createMessages(locale, {}, overrides.validation ?? {});
  const own: DefinitionCatalog = { ...overrides.definitions?.[lang], ...overrides.definitions?.[locale] };
  const defs = createDefinitions(locale, own, { en: definitionLocales.en! }, {});
  return { locale, lang, t: (key, params) => translate(ui, key, params), validation, defs };
}
