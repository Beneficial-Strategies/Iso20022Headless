// Fails when a package that the published packages depend on (directly or not) has a license outside the allowed list.
// Run from the repository root after `pnpm install`. See tools/licenses/README.md.
import { execSync } from 'node:child_process';

const ALLOWED = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD']);

const out = execSync('pnpm --filter "./packages/*" licenses list --prod --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const byLicense = JSON.parse(out); // { "MIT": [{ name, versions, ... }], ... }

let failed = false;
for (const [license, packages] of Object.entries(byLicense).sort()) {
  const ok = ALLOWED.has(license);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${license} (${packages.length}): ${packages.map((p) => `${p.name}@${p.versions.join(',')}`).join(', ')}`);
  if (!ok) failed = true;
}
if (failed) {
  console.error(`\nA dependency has a license outside the allowed list (${[...ALLOWED].join(', ')}). See tools/licenses/README.md.`);
  process.exit(1);
}
