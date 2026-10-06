import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../src/theme.css'), 'utf8');

function tokens(selector: string): Record<string, string> {
  const block = new RegExp(`${selector.replace(/[[\]'.]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

// [foreground token, background token]
const TEXT: [string, string][] = [
  ['fg', 'surface'], ['fg', 'surface-alt'], ['muted', 'surface'], ['muted', 'surface-alt'],
  ['accent-fg', 'accent'], ['accent-fg', 'accent-hover'], ['accent-fg', 'ok'],
  ['danger', 'surface'], ['danger', 'surface-alt'], ['danger', 'danger-soft'],
  ['ok-fg', 'ok-soft'], ['warn-fg', 'warn-soft'], ['fg', 'accent-soft'], ['fg', 'danger-soft'],
];
// Non-text UI (control borders, focus ring): WCAG 1.4.11 needs 3:1.
const UI: [string, string][] = [['edge', 'surface'], ['edge', 'surface-alt'], ['focus', 'surface'], ['focus', 'surface-alt'], ['danger-line', 'danger-soft']];

describe.each([
  ['light', ':root'],
  ['dark', ":root[data-theme='dark']"],
])('%s theme contrast', (_name, selector) => {
  const t = { ...tokens(':root'), ...tokens(selector) };

  it('defines every token it is checked against', () => {
    for (const k of new Set([...TEXT, ...UI].flat())) expect(t[k], k).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it.each(TEXT)('text %s on %s is at least 4.5:1 (WCAG AA)', (fg, bg) => {
    expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI)('UI element %s against %s is at least 3:1', (fg, bg) => {
    expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });
});
