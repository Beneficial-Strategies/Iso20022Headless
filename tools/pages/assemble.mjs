/**
 * Assemble the GitHub Pages site from the two built demos:
 *   site/index.html   landing page (tools/pages/index.html)
 *   site/form/        demo using our TanStack Form hook
 *   site/zod/         demo using only Zod
 *   site/.nojekyll    publish files as they are (no Jekyll processing)
 *   site/_headers     cache and security headers (read by Cloudflare, ignored by GitHub Pages)
 * Run `pnpm pages:build`, which builds both demos with a relative base and then calls this.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const site = resolve(root, 'site');
const parts = [
  ['apps/demo-form/dist', 'form'],
  ['apps/demo-zod/dist', 'zod'],
];

for (const [from] of parts) {
  if (!existsSync(resolve(root, from, 'index.html'))) throw new Error(`${from} is missing: build the demos first (pnpm pages:build)`);
}

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
for (const [from, to] of parts) cpSync(resolve(root, from), resolve(site, to), { recursive: true });
cpSync(resolve(root, 'tools/pages/index.html'), resolve(site, 'index.html'));
for (const f of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'og.png']) cpSync(resolve(root, 'tools/pages/brand', f), resolve(site, f)); // the landing page's own
cpSync(resolve(root, 'tools/pages/_headers'), resolve(site, '_headers')); // read by Cloudflare, ignored by GitHub Pages
writeFileSync(resolve(site, '.nojekyll'), '');
console.log(`site assembled in ${site}: index.html, form/, zod/`);
