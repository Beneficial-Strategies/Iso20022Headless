import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';

/**
 * Find a Chrome/Chromium to drive. This is the browser already installed on the machine (or CI runner);
 * nothing is downloaded. Override with CHROME_PATH.
 */
export function findChrome(): string {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`CHROME_PATH is set to ${fromEnv}, which does not exist`);
    return fromEnv;
  }
  const fixed = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of fixed) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' }).trim().split('\n')[0];
      if (out) return out;
    } catch {
      /* not on PATH */
    }
  }
  throw new Error('No Chrome or Chromium found. Install Google Chrome, or set CHROME_PATH to its executable.');
}

export const launch = (): Promise<Browser> =>
  puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox'] });
