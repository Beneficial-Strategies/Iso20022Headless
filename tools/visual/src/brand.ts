import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'puppeteer-core';

/**
 * Makes the pictures that go with the page heads from the SVG sources in tools/pages/brand: the favicon as PNGs (32 and 180 pixels)
 * and the 1200x630 card that link previews show. Run `pnpm visual brand` after changing the sources; the results are committed.
 */
const brand = resolve(dirname(fileURLToPath(import.meta.url)), '../../pages/brand');

const TITLE = 'ISO 20022 Message Explorer';
const SUBTITLE = 'Explore every element, definition, code and business rule of ISO 20022 messages. Create one, check it against the XSD, and copy the screen into Word, Markdown, spreadsheets or Figma.';

export async function makeBrand(browser: Browser): Promise<string[]> {
  const favicon = readFileSync(resolve(brand, 'favicon.svg'), 'utf8');
  const logo = readFileSync(resolve(brand, 'logo.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '');
  const made: string[] = [];
  const page = await browser.newPage();
  try {
    for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180]] as const) {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${favicon.replace('width="120" height="120"', `width="${size}" height="${size}"`)}</div></body>`);
      const png = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      writeFileSync(resolve(brand, name), png);
      made.push(name);
    }
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><body style="margin:0;width:1200px;height:630px;background:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;position:relative;overflow:hidden">
      <div style="position:absolute;left:0;right:0;top:0;height:14px;background:#2A9D8F"></div>
      <div style="position:absolute;left:72px;top:88px;width:600px;height:150px">${logo.replace('width="480" height="120"', 'width="600" height="150"')}</div>
      <div style="position:absolute;left:72px;top:292px;right:60px;font-size:74px;font-weight:700;letter-spacing:-1px;color:#1B3A5C;line-height:1.05;white-space:nowrap">${TITLE}</div>
      <div style="position:absolute;left:72px;top:410px;right:96px;font-size:34px;line-height:1.35;color:#475569">${SUBTITLE}</div>
      <div style="position:absolute;left:72px;bottom:36px;font-size:26px;color:#2A9D8F;font-weight:600">iso20022-explorer.beneficialstrategies.com</div>
    </body>`);
    writeFileSync(resolve(brand, 'og.png'), await page.screenshot({ type: 'png' }));
    made.push('og.png');
  } finally {
    await page.close();
  }
  return made;
}
