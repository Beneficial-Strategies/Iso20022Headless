/**
 * Visual and layout regression tooling for the two demos. Needs a Chrome or Chromium on the machine
 * (found automatically; override with CHROME_PATH). It starts the demo servers itself.
 *
 *   pnpm visual shots [--only name] [--out dir]    save a screenshot of every state (default: tools/visual/out)
 *   pnpm visual check [--only name] [--out dir]    same, and fail on layout problems (exit code 1)
 *   pnpm visual selftest                           inject known defects and prove the checks catch them
 *   pnpm visual pages [--site dir] [--prefix /repo/]  smoke-test the built GitHub Pages site under its sub-path
 *   pnpm visual list                               list the states
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, Page } from 'puppeteer-core';
import { launch } from './browser.ts';
import { runPageChecks, type Violation } from './checks.ts';
import { scenarios, type Scenario } from './scenarios.ts';
import { startApp, type AppName, type Running } from './servers.ts';
import { serveStatic } from './static.ts';

const here = dirname(fileURLToPath(import.meta.url));

function arg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

async function open(browser: Browser, base: string, s: Pick<Scenario, 'query' | 'viewport'>): Promise<{ page: Page; problems: string[] }> {
  const page = await browser.newPage();
  const problems: string[] = [];
  await page.setViewport({ ...s.viewport, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.location().url?.includes('favicon')) return;
    problems.push(`console error: ${m.text().slice(0, 240).replace(/\s+/g, ' ')}`);
  });
  page.on('pageerror', (e) => problems.push(`page error: ${String(e).slice(0, 240)}`));
  await page.goto(base + (s.query ?? ''), { waitUntil: 'networkidle0' });
  await settle();
  return { page, problems };
}

async function main(argv: string[]): Promise<number> {
  const cmd = argv[0];
  if (cmd === 'list') {
    for (const s of scenarios) console.log(`${s.name.padEnd(30)} ${s.app} ${s.viewport.width}x${s.viewport.height}${s.query ?? ''}`);
    return 0;
  }
  if (cmd === 'pages') return pagesSmokeTest(argv);
  if (cmd !== 'shots' && cmd !== 'check' && cmd !== 'selftest') {
    console.error('usage: pnpm visual <shots|check|selftest|pages|list> [--only name] [--out dir]');
    return 2;
  }

  const only = arg(argv, '--only');
  const list = only ? scenarios.filter((s) => s.name === only) : scenarios;
  if (cmd !== 'selftest' && list.length === 0) {
    console.error(`no state named ${only}. Try: pnpm visual list`);
    return 2;
  }
  const out = resolve(arg(argv, '--out') ?? resolve(here, '../out'));
  mkdirSync(out, { recursive: true });

  const apps: Record<string, Running> = {};
  let browser: Browser | undefined;
  try {
    const needed = cmd === 'selftest' ? ['demo-form'] : [...new Set(list.map((s) => s.app))];
    for (const [i, name] of needed.entries()) apps[name] = await startApp(name as AppName, 5290 + i);
    browser = await launch();

    if (cmd === 'selftest') return await selftest(browser, apps['demo-form']!.url);

    let failed = 0;
    for (const s of list) {
      const { page, problems } = await open(browser, apps[s.app]!.url, s);
      try {
        await s.steps?.(page);
        await settle();
        await page.screenshot({ path: resolve(out, `${s.name}.png`) });
        if (cmd === 'check') {
          // the quickstart apps are not the demo, so they have no demo form area
          const violations = (await runPageChecks(page)).filter((v) => !(s.app.startsWith('quickstart') && v.check === 'no-form-area'));
          const found = [...violations.map((v) => `${v.check}: ${v.detail}`), ...problems, ...((await s.expect?.(page)) ?? [])];
          if (found.length) failed++;
          console.log(found.length ? `✗ ${s.name}\n${found.map((f) => `    - ${f}`).join('\n')}` : `✓ ${s.name}`);
        } else {
          console.log(`saved ${s.name}.png`);
        }
      } catch (e) {
        failed++;
        console.log(`✗ ${s.name}\n    - could not run: ${String(e).slice(0, 240)}`);
      } finally {
        await page.close();
      }
    }
    console.log(cmd === 'check' ? `\n${list.length - failed}/${list.length} states clean. Screenshots in ${out}` : `\nScreenshots in ${out}`);
    return failed ? 1 : 0;
  } finally {
    await browser?.close();
    await Promise.all(Object.values(apps).map((a) => a.close()));
  }
}

/**
 * The built site (`pnpm pages:build`) served under the sub-path GitHub Pages uses. Proves what a visitor gets:
 * every asset loads (including the lazily loaded Spanish chunk), nothing logs an error, and the demos render.
 */
async function pagesSmokeTest(argv: string[]): Promise<number> {
  const site = resolve(arg(argv, '--site') ?? resolve(here, '../../../site'));
  const prefix = arg(argv, '--prefix') ?? process.env.PAGES_PREFIX ?? '/Iso20022Headless/';
  if (!existsSync(resolve(site, 'index.html'))) {
    console.error(`no built site in ${site}. Run: pnpm pages:build`);
    return 2;
  }
  const out = resolve(arg(argv, '--out') ?? resolve(here, '../out'));
  mkdirSync(out, { recursive: true });
  const served = await serveStatic(site, prefix);
  const browser = await launch();
  const cases: { name: string; path: string; expect: (page: Page) => Promise<string[]> }[] = [
    {
      name: 'landing page',
      path: '',
      expect: async (page) => {
        const links = await page.evaluate(() => [...document.querySelectorAll('a.button')].map((a) => (a as HTMLAnchorElement).href));
        return links.length === 2 && links.every((l) => l.startsWith(served.url)) ? [] : [`expected two demo links under ${served.url}, got ${JSON.stringify(links)}`];
      },
    },
    { name: 'form demo', path: 'form/', expect: async (page) => ((await page.$('#GroupHeader-MessageIdentification')) ? [] : ['the form did not render']) },
    { name: 'zod demo', path: 'zod/', expect: async (page) => ((await page.$('#GroupHeader-MessageIdentification')) ? [] : ['the form did not render']) },
    {
      name: 'Spanish (lazy chunk)',
      path: 'form/?lang=es',
      expect: async (page) => ((await page.evaluate(() => document.body.textContent ?? '')).includes('Identificación del mensaje') ? [] : ['Spanish labels did not load: the lazy catalog chunk is missing or failed']),
    },
    {
      name: 'JSON output',
      path: 'form/?format=json',
      expect: async (page) => ((await page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '')).includes('"Document"') ? [] : ['JSON output not shown']),
    },
  ];
  let failed = 0;
  try {
    for (const c of cases) {
      const page = await browser.newPage();
      const problems: string[] = [];
      await page.setViewport({ width: 1280, height: 800 });
      page.on('pageerror', (e) => problems.push(`page error: ${String(e).slice(0, 200)}`));
      page.on('console', (m) => m.type() === 'error' && !m.location().url?.includes('favicon') && problems.push(`console error: ${m.text().slice(0, 200)}`));
      page.on('response', (r) => r.status() >= 400 && !r.url().includes('favicon') && problems.push(`HTTP ${r.status()}: ${r.url().replace(served.url, '/')}`));
      page.on('requestfailed', (r) => problems.push(`request failed: ${r.url().replace(served.url, '/')}`));
      await page.goto(served.url + c.path, { waitUntil: 'networkidle0' });
      await settle(500);
      problems.push(...(await c.expect(page)));
      problems.push(...(await runPageChecks(page)).filter((v) => c.path !== '' || !v.check.startsWith('no-form-area')).filter((v) => v.check !== 'no-form-area').map((v) => `${v.check}: ${v.detail}`));
      await page.screenshot({ path: resolve(out, `pages-${c.name.replace(/\W+/g, '-')}.png`) });
      await page.close();
      if (problems.length) failed++;
      console.log(problems.length ? `✗ ${c.name}\n${problems.map((p) => `    - ${p}`).join('\n')}` : `✓ ${c.name}`);
    }
  } finally {
    await browser.close();
    await served.close();
  }
  console.log(failed ? `\n${failed} page(s) failed under ${prefix}` : `\nAll pages load correctly under ${prefix}`);
  return failed ? 1 : 0;
}

/**
 * The checks must not pass vacuously. Break the page in each way a check is meant to catch and confirm
 * that exact check fires, and that the untouched page is clean.
 */
async function selftest(browser: Browser, base: string): Promise<number> {
  const desktop = { width: 1440, height: 900 };
  const cases: { label: string; expect: string; query?: string; apply: (p: Page) => Promise<void> }[] = [
    { label: 'baseline is clean', expect: '', apply: async () => {} },
    { label: 'text boxes lose their borders (the plain-skin bug)', expect: 'control-invisible', apply: async (p) => {
        await p.addStyleTag({ content: '[data-form-area] input{border:0!important;background:transparent!important;box-shadow:none!important}' });
      },
    },
    { label: 'page grows wider than the window', expect: 'page-overflow-x', apply: async (p) => {
        await p.addStyleTag({ content: 'body{min-width:3000px}' });
      },
    },
    { label: 'the Display button wraps (the narrow-screen bug)', expect: 'single-line', apply: async (p) => {
        await p.addStyleTag({ content: 'header button{white-space:normal!important;width:3rem!important}' });
      },
    },
    {
      label: 'a dropdown list ends up off screen',
      expect: 'popup-outside-viewport',
      apply: async (p) => {
        await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /add payment information/i.test(b.textContent ?? ''))?.click());
        await p.locator('#PaymentInformation-0-PaymentMethod').click();
        await settle();
        await p.evaluate(() => ((document.querySelector('[data-placement]') as HTMLElement).style.left = '5000px'));
      },
    },
    {
      label: 'a dropdown list is covered by other content',
      expect: 'popup-covered',
      apply: async (p) => {
        await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => /add payment information/i.test(b.textContent ?? ''))?.click());
        await p.locator('#PaymentInformation-0-PaymentMethod').click();
        await settle();
        await p.evaluate(() => {
          const cover = document.createElement('div');
          cover.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.1)';
          document.body.appendChild(cover);
        });
      },
    },
    { label: 'the app logs an error (e.g. invalid HTML nesting)', expect: 'console error', apply: async (p) => {
        await p.evaluate(() => console.error('In HTML, <details> cannot be a descendant of <p>'));
      },
    },
  ];

  let bad = 0;
  for (const c of cases) {
    const { page, problems } = await open(browser, base + (c.query ?? ''), { viewport: desktop });
    await c.apply(page);
    await settle();
    const found = [...(await runPageChecks(page)).map((v: Violation) => v.check), ...problems.map((p) => (p.startsWith('console error') ? 'console error' : p))];
    await page.close();
    const ok = c.expect === '' ? found.length === 0 : found.includes(c.expect);
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${c.label}: ${c.expect === '' ? (found.length ? `unexpected: ${found.join(', ')}` : 'no problems found') : found.includes(c.expect) ? `caught (${c.expect})` : `NOT caught (saw: ${found.join(', ') || 'nothing'})`}`);
  }
  console.log(bad ? `\n${bad} check(s) failed to detect their defect` : '\nAll checks detect the defects they exist for.');
  return bad ? 1 : 0;
}

process.exit(await main(process.argv.slice(2)));
