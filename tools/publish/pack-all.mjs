#!/usr/bin/env node
// Builds the five packages from this checkout and packs them exactly as `npm publish` would (compiled files, `publishConfig.exports`,
// workspace versions resolved), without publishing anything. Another project installs the tarballs to try an unreleased branch.
//   node tools/publish/pack-all.mjs [--out <folder>]
// The folder defaults to ../_work/headless-packs next to the repository. It is emptied of older tarballs first. Prints one line per tarball
// and writes `manifest.json` (branch, commit, versions) beside them.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES = ['types', 'validate', 'serialize', 'react', 'react-ui'];
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const out = resolve(arg('--out') ?? join(root, '..', '_work', 'headless-packs'));
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const git = (...args) => { try { return run('git', args); } catch { return ''; } };

mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith('.tgz') || f === 'manifest.json') rmSync(join(out, f));

// `corepack pnpm` works where pnpm is not installed globally
const hasPnpm = (() => { try { run('pnpm', ['--version']); return true; } catch { return false; } })();
const pnpm = (args, cwd) => (hasPnpm ? run('pnpm', args, cwd) : run('corepack', ['pnpm', ...args], cwd));
console.error('Building the packages...');
pnpm(['--filter', './packages/*', 'run', 'build']);

const files = {};
for (const name of PACKAGES) {
  const dir = join(root, 'packages', name);
  pnpm(['pack', '--pack-destination', out], dir);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  files[pkg.name] = { version: pkg.version, file: `${pkg.name.replace('@', '').replace('/', '-')}-${pkg.version}.tgz` };
}
const manifest = { branch: git('rev-parse', '--abbrev-ref', 'HEAD'), commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain') !== '', packages: files };
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const [name, p] of Object.entries(files)) console.log(`${out}/${p.file}`);
console.error(`Packed ${PACKAGES.length} packages from ${manifest.branch} @ ${manifest.commit.slice(0, 7)}${manifest.dirty ? ' (uncommitted changes)' : ''}.`);
