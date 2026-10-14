#!/usr/bin/env node
// Used by the publish workflow: every package has the same version, and it is the version of the tag that was pushed.
//   node tools/publish/check-version.mjs 0.1.0-alpha.0      prints the npm dist-tag to publish under ("alpha", or "latest" for a plain version)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const expected = process.argv[2];
if (!expected) throw new Error('usage: check-version.mjs <version from the tag, without the v>');
const versions = ['types', 'validate', 'serialize', 'react', 'react-ui'].map((p) => [p, JSON.parse(readFileSync(join(root, 'packages', p, 'package.json'), 'utf8')).version]);
const wrong = versions.filter(([, v]) => v !== expected);
if (wrong.length) {
  console.error(`the tag says ${expected} but ${wrong.map(([p, v]) => `${p} is ${v}`).join(', ')}`);
  process.exit(1);
}
// npm needs an explicit dist-tag for a prerelease: the first identifier after the hyphen (0.1.0-alpha.0 -> alpha)
const pre = /^\d+\.\d+\.\d+-([A-Za-z][A-Za-z0-9]*)/.exec(expected);
console.log(pre ? pre[1].toLowerCase() : 'latest');
