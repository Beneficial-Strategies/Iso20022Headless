/**
 * Assemble the Cloudflare site: only the TanStack Form demo (apps/demo-form), at the root of the host.
 *   site/index.html, site/assets/...   the demo, built with a relative base
 *   site/_headers                      cache and security headers for those paths
 * Run `pnpm pages:cloudflare`, which builds the demo (asking its pages to use the Worker's schema pass-through) and then calls this.
 * The GitHub Pages site (both demos and a landing page) is built by `pnpm pages:build` and is not touched.
 */
import { execFileSync } from 'node:child_process';
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
// The text host of the text-packs proof of concept (docs/text-packs-poc.md), on the same site: `/text/v1/<language>/...`. The demo reads it
// with `?textHost=/text`. French and German come from the catalogs; en-US from its own repository (text-repos/en-US).
const node = ['--experimental-transform-types', '--no-warnings'];
execFileSync('node', [...node, resolve(root, 'tools/i18n/src/packs.ts'), 'build', '--out', resolve(site, 'text'), '--langs', 'fr,de'], { stdio: 'inherit', cwd: root });
// en-US: the library's release publishes the English as a source artifact; the language tools read only that
const artifact = resolve(root, 'node_modules/.cache/text-source');
execFileSync('node', [...node, resolve(root, 'tools/i18n/src/sourceArtifact.ts'), 'build', '--out', artifact], { stdio: 'inherit', cwd: root });
execFileSync('node', [...node, resolve(root, 'tools/i18n/src/textrepo.ts'), 'build', '--repo', resolve(root, 'text-repos/en-US'), '--source', artifact, '--out', resolve(site, 'text')], { stdio: 'inherit', cwd: root });
console.log(`Cloudflare site assembled in ${site}: the TanStack Form demo at the root, text packs under /text`);
