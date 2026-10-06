import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, resolveLocale, resolveTheme, settingsToSearch } from '../src/settings.ts';

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
});
