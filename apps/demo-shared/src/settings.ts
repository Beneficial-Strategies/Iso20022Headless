import { useCallback, useEffect, useState } from 'react';

export const THEMES = ['system', 'light', 'dark'] as const;
export const SIZES = ['normal', 'large', 'xlarge'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const FORMATS = ['xml', 'json'] as const;

export type Theme = (typeof THEMES)[number];
export type Size = (typeof SIZES)[number];
export type Density = (typeof DENSITIES)[number];
export type Format = (typeof FORMATS)[number];

export interface Settings {
  theme: Theme;
  size: Size;
  density: Density;
  /** Id of the skin (see skin/index.ts). */
  skin: string;
  /** Locale tag, or `auto` to follow the browser. */
  lang: string;
  /** Output shown beside the form. */
  format: Format;
  /** Message identifier, e.g. pain.002.001.15. */
  message: string;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', size: 'normal', density: 'comfortable', skin: 'tailwind', lang: 'auto', format: 'xml', message: 'pain.001.001.13' };

export const DEFAULT_LOCALES: readonly string[] = ['en', 'es'];

const pick = <T extends string>(allowed: readonly T[], v: string | null, fallback: T): T =>
  (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

/** Settings live in the URL (`?theme=dark&size=large`), so a configuration is linkable and nothing is stored. */
export function parseSettings(
  search: string,
  skins: readonly string[],
  locales: readonly string[] = DEFAULT_LOCALES,
  messages: readonly string[] = [DEFAULT_SETTINGS.message],
): Settings {
  const q = new URLSearchParams(search);
  return {
    theme: pick(THEMES, q.get('theme'), DEFAULT_SETTINGS.theme),
    size: pick(SIZES, q.get('size'), DEFAULT_SETTINGS.size),
    density: pick(DENSITIES, q.get('density'), DEFAULT_SETTINGS.density),
    skin: pick(skins, q.get('skin'), DEFAULT_SETTINGS.skin),
    lang: pick(['auto', ...locales], q.get('lang'), DEFAULT_SETTINGS.lang),
    format: pick(FORMATS, q.get('format'), DEFAULT_SETTINGS.format),
    message: pick(messages, q.get('message'), DEFAULT_SETTINGS.message),
  };
}

/** Only non-default values are written, so the default URL stays clean. */
export function settingsToSearch(s: Settings, existing = ''): string {
  const q = new URLSearchParams(existing);
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (s[k] === DEFAULT_SETTINGS[k]) q.delete(k);
    else q.set(k, s[k]);
  }
  const out = q.toString();
  return out ? `?${out}` : '';
}

const prefersDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;

/** `auto` follows the browser's language list; the first language we have text for wins, else English. */
export function resolveLocale(lang: string, browser: readonly string[], supported: readonly string[]): string {
  if (lang !== 'auto') return lang;
  for (const tag of browser) {
    const base = tag.split('-')[0] ?? '';
    if (supported.includes(tag) || supported.includes(base)) return tag;
  }
  return 'en';
}

export function resolveTheme(theme: Theme, systemDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

/** Applies settings to <html> as data attributes (consumed by theme.css) and keeps the URL in sync. */
export function useSettings(
  skins: readonly string[],
  locales: readonly string[] = DEFAULT_LOCALES,
  messages: readonly string[] = [DEFAULT_SETTINGS.message],
): { settings: Settings; resolvedTheme: 'light' | 'dark'; locale: string; update: (patch: Partial<Settings>) => void } {
  const [settings, setSettings] = useState<Settings>(() => parseSettings(typeof window === 'undefined' ? '' : window.location.search, skins, locales, messages));
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolvedTheme = resolveTheme(settings.theme, systemDark);
  const locale = resolveLocale(settings.lang, typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]), locales);

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = resolvedTheme;
    el.dataset.size = settings.size;
    el.dataset.density = settings.density;
    el.dataset.skin = settings.skin;
    el.lang = locale;
  }, [resolvedTheme, settings.size, settings.density, settings.skin, locale]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      try {
        window.history.replaceState(null, '', `${window.location.pathname}${settingsToSearch(next, window.location.search)}${window.location.hash}`);
      } catch {
        /* e.g. sandboxed iframe: the settings still apply, they just aren't linkable */
      }
      return next;
    });
  }, []);

  return { settings, resolvedTheme, locale, update };
}
