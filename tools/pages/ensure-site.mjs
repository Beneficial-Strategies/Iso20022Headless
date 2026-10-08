// Builds the Cloudflare site (the TanStack Form demo plus the schema pass-through's page settings) when ./site is not there yet.
// wrangler runs this before it reads `assets.directory`, so a Cloudflare build that never ran the dashboard's build command
// (preview builds, as of Worker Previews) still has a site to publish. When the build command already ran, this does nothing.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

if (existsSync(resolve(root, 'site/index.html'))) {
  console.log('ensure-site: ./site is already built.');
} else {
  console.log('ensure-site: ./site is missing; building it (pnpm pages:cloudflare).');
  execSync('pnpm pages:cloudflare', { cwd: root, stdio: 'inherit' });
}
