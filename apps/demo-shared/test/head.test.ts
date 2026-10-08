import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** What a browser tab and a link preview show for each page: the title, the icon, and the preview card. */
const root = resolve(import.meta.dirname, '../../..');
const brand = resolve(root, 'tools/pages/brand');
const NAME = 'Beneficial Strategies ISO 20022 Message Explorer';

const pages = [
  { file: 'apps/demo-form/index.html', title: NAME, prefix: '/' },
  { file: 'apps/demo-zod/index.html', title: `${NAME} (Zod only)`, prefix: '/' },
  { file: 'tools/pages/index.html', title: `${NAME}: demos`, prefix: './' },
];

const tag = (html: string, re: RegExp): string | undefined => re.exec(html)?.[1];
const meta = (html: string, attr: 'name' | 'property', key: string): string | undefined => tag(html, new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`));
/** The width and height a PNG file declares in its header. */
const pngSize = (name: string): { width: number; height: number } => {
  const b = readFileSync(resolve(brand, name));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

describe.each(pages)('the head of $file', ({ file, title, prefix }) => {
  const html = readFileSync(resolve(root, file), 'utf8');

  it('is called Beneficial Strategies ISO 20022 Message Explorer, not "headless demo"', () => {
    expect(tag(html, /<title>([^<]*)<\/title>/)).toBe(title);
    expect(html).not.toMatch(/headless demo/i);
    expect(meta(html, 'property', 'og:title')).toBe(title);
    expect(meta(html, 'property', 'og:site_name')).toBe('Beneficial Strategies');
  });

  it('describes what it is, once, for search results and link previews', () => {
    const d = meta(html, 'name', 'description')!;
    expect(d.length).toBeGreaterThan(60);
    expect(d.length).toBeLessThan(220);
    expect(meta(html, 'property', 'og:description')).toBe(d);
  });

  it('has an icon for the tab and one for phones, and they are files that exist', () => {
    const icons = [...html.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[2]!);
    expect(icons).toEqual([`${prefix}favicon.svg`, `${prefix}favicon-32.png`, `${prefix}apple-touch-icon.png`]);
    for (const href of icons) expect(existsSync(resolve(brand, href.slice(prefix.length))), href).toBe(true);
  });

  it('has a link preview card: an absolute address of a real file, of the size it says', () => {
    const image = meta(html, 'property', 'og:image')!;
    expect(image).toMatch(/^https:\/\/iso20022-explorer\.beneficialstrategies\.com\/og\.png$/);
    expect(existsSync(resolve(brand, 'og.png'))).toBe(true);
    expect(pngSize('og.png')).toEqual({ width: Number(meta(html, 'property', 'og:image:width')), height: Number(meta(html, 'property', 'og:image:height')) });
    expect(meta(html, 'property', 'og:image:alt')).toMatch(/Beneficial Strategies/);
    expect(meta(html, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(meta(html, 'property', 'og:type')).toBe('website');
  });
});

describe('the brand files', () => {
  it('the icons have the sizes they are meant for', () => {
    expect(pngSize('favicon-32.png')).toEqual({ width: 32, height: 32 });
    expect(pngSize('apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(pngSize('og.png')).toEqual({ width: 1200, height: 630 });
  });

  it('the favicon is an SVG of the rook in the logo\'s two colors, on a white tile', () => {
    const svg = readFileSync(resolve(brand, 'favicon.svg'), 'utf8');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('#1B3A5C');
    expect(svg).toContain('#2A9D8F');
    expect(svg).toMatch(/<rect width="120" height="120" rx="24" fill="#ffffff"\/>/);
    expect(svg).not.toMatch(/<text|<image|<script|href=/);
  });

  it('the logo the card is made from is there', () => {
    expect(readFileSync(resolve(brand, 'logo.svg'), 'utf8')).toContain('BENEFICIAL');
  });
});
