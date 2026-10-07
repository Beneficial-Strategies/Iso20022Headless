/**
 * Assemble the Cloudflare site: only the TanStack Form demo (apps/demo-form), at the root of the host.
 *   site/index.html, site/assets/...   the demo, built with a relative base
 *   site/_headers                      cache and security headers for those paths
 * Run `pnpm pages:cloudflare`, which builds the demo (asking its pages to use the Worker's schema pass-through) and then calls this.
 * The GitHub Pages site (both demos and a landing page) is built by `pnpm pages:build` and is not touched.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const site = resolve(root, 'site');
const demo = resolve(root, 'apps/demo-form/dist');

if (!existsSync(resolve(demo, 'index.html'))) throw new Error('apps/demo-form/dist is missing: build the demo first (pnpm pages:cloudflare)');

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
cpSync(demo, site, { recursive: true });
cpSync(resolve(root, 'tools/pages/_headers.cloudflare'), resolve(site, '_headers'));
writeFileSync(resolve(site, '.nojekyll'), '');
console.log(`Cloudflare site assembled in ${site}: the TanStack Form demo at the root`);
