import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, resolveLocale, resolveTheme, settingsToSearch, wantsImplementationBanner } from '../src/settings.ts';

const skins = ['tailwind', 'plain'];

describe('settings in the URL', () => {
  it('defaults when nothing is given', () => {
    expect(parseSettings('', skins)).toEqual(DEFAULT_SETTINGS);
  });

  it('reads every setting', () => {
    expect(parseSettings('?theme=dark&size=xlarge&density=compact&skin=plain&lang=es&format=json', skins)).toEqual({
      theme: 'dark',
      size: 'xlarge',
      density: 'compact',
      skin: 'plain',
      lang: 'es',
      format: 'json',
      message: 'pain.001.001.13',
    });
  });

  it('ignores unknown values instead of trusting the URL', () => {
    expect(parseSettings('?theme=neon&size=huge&density=tiny&skin=evil&lang=klingon&format=yaml', skins)).toEqual(DEFAULT_SETTINGS);
  });

  it('writes only non-default values and round-trips', () => {
    expect(settingsToSearch(DEFAULT_SETTINGS)).toBe('');
    const s = { ...DEFAULT_SETTINGS, theme: 'dark' as const, skin: 'plain' };
    const search = settingsToSearch(s);
    expect(search).toBe('?theme=dark&skin=plain');
    expect(parseSettings(search, skins)).toEqual(s);
  });

  it('keeps unrelated query parameters and removes a setting that returns to default', () => {
    expect(settingsToSearch({ ...DEFAULT_SETTINGS, size: 'large' }, '?x=1&theme=dark')).toBe('?x=1&size=large');
  });

  it('resolves "system" from the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('language: auto follows the browser list, an explicit choice wins, unknown languages fall back to English', () => {
    expect(resolveLocale('auto', ['es-MX', 'en-US'], ['en', 'es'])).toBe('es-MX');
    expect(resolveLocale('auto', ['fr-FR', 'es'], ['en', 'es'])).toBe('es'); // first one we have text for
    expect(resolveLocale('auto', ['fr', 'de'], ['en', 'es'])).toBe('en');
    expect(resolveLocale('en', ['es'], ['en', 'es'])).toBe('en');
    expect(resolveLocale('auto', [], ['en', 'es'])).toBe('en');
  });

  it('a locale added by the consumer is accepted from the URL', () => {
    expect(parseSettings('?lang=fr', skins, ['en', 'es', 'fr']).lang).toBe('fr');
    expect(parseSettings('?lang=fr', skins).lang).toBe('auto');
  });

  it('the message comes from the URL when it is one we have; anything else falls back to the default', () => {
    const ids = ['pain.001.001.13', 'pain.002.001.15'];
    expect(parseSettings('?message=pain.002.001.15', skins, undefined, ids).message).toBe('pain.002.001.15');
    expect(parseSettings('?message=pacs.008.001.13', skins, undefined, ids).message).toBe('pain.001.001.13');
    expect(parseSettings('?message=pain.002.001.15', skins).message).toBe('pain.001.001.13'); // not offered
    expect(settingsToSearch({ ...DEFAULT_SETTINGS, message: 'pain.002.001.15' })).toBe('?message=pain.002.001.15');
    expect(settingsToSearch(DEFAULT_SETTINGS)).toBe('');
  });
});

describe('?ImplementationBanner=true brings back the original banner', () => {
  it('is true only for "true" (name and value in any case)', () => {
    expect(wantsImplementationBanner('?ImplementationBanner=true')).toBe(true);
    expect(wantsImplementationBanner('?implementationbanner=TRUE')).toBe(true);
    expect(wantsImplementationBanner('?lang=es&ImplementationBanner=true&theme=dark')).toBe(true);
  });

  it('is false when missing, false, empty or anything else', () => {
    for (const q of ['', '?', '?lang=es', '?ImplementationBanner=false', '?ImplementationBanner=', '?ImplementationBanner', '?ImplementationBanner=1', '?ImplementationBanner=yes']) {
      expect(wantsImplementationBanner(q), q).toBe(false);
    }
  });

  it('survives a change of settings, which rewrite the address', () => {
    const next = settingsToSearch({ ...DEFAULT_SETTINGS, theme: 'dark' }, '?ImplementationBanner=true');
    expect(wantsImplementationBanner(next)).toBe(true);
    expect(next).toContain('theme=dark');
  });
});
