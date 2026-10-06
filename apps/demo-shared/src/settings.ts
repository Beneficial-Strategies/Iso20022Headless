import { useCallback, useEffect, useState } from 'react';

export const THEMES = ['system', 'light', 'dark'] as const;
export const SIZES = ['normal', 'large', 'xlarge'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;

export type Theme = (typeof THEMES)[number];
export type Size = (typeof SIZES)[number];
export type Density = (typeof DENSITIES)[number];

export interface Settings {
  theme: Theme;
  size: Size;
  density: Density;
  /** Id of the skin (see skin/index.ts). */
  skin: string;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', size: 'normal', density: 'comfortable', skin: 'tailwind' };

const pick = <T extends string>(allowed: readonly T[], v: string | null, fallback: T): T =>
  (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;

/** Settings live in the URL (`?theme=dark&size=large`), so a configuration is linkable and nothing is stored. */
export function parseSettings(search: string, skins: readonly string[]): Settings {
  const q = new URLSearchParams(search);
  return {
    theme: pick(THEMES, q.get('theme'), DEFAULT_SETTINGS.theme),
    size: pick(SIZES, q.get('size'), DEFAULT_SETTINGS.size),
    density: pick(DENSITIES, q.get('density'), DEFAULT_SETTINGS.density),
    skin: pick(skins, q.get('skin'), DEFAULT_SETTINGS.skin),
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

export function resolveTheme(theme: Theme, systemDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

/** Applies settings to <html> as data attributes (consumed by theme.css) and keeps the URL in sync. */
export function useSettings(skins: readonly string[]): { settings: Settings; resolvedTheme: 'light' | 'dark'; update: (patch: Partial<Settings>) => void } {
  const [settings, setSettings] = useState<Settings>(() => parseSettings(typeof window === 'undefined' ? '' : window.location.search, skins));
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolvedTheme = resolveTheme(settings.theme, systemDark);

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = resolvedTheme;
    el.dataset.size = settings.size;
    el.dataset.density = settings.density;
    el.dataset.skin = settings.skin;
  }, [resolvedTheme, settings.size, settings.density, settings.skin]);

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

  return { settings, resolvedTheme, update };
}
