#!/usr/bin/env node
// Keeps the publishing part of every package.json in step with its `exports`.
//   node tools/publish/sync-manifests.mjs           write
//   node tools/publish/sync-manifests.mjs --check   exit 1 when a package.json is out of step (CI)
// In the repository the packages export their TypeScript source (`./src/x.ts`), so the apps and the tests need no build. A published package exports
// the compiled files: `publishConfig.exports`, which pnpm puts in place of `exports` when it packs, points the same names at dist/.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const check = process.argv.includes('--check');
const PACKAGES = ['types', 'validate', 'serialize', 'react', 'react-ui'];
const REPO = 'https://github.com/Beneficial-Strategies/Iso20022Headless';
const DESCRIPTIONS = {
  types: 'TypeScript types for ISO 20022 messages.',
  validate: 'ISO 20022 message schemas (Zod), field rules and English validation text, for 363 messages. Headless: logic only, no UI and no translations.',
  serialize: 'Read and write ISO 20022 messages as XML and as ISO JSON, from and to the values of the validate schemas.',
  react: 'React hooks that drive an ISO 20022 form from the validate schemas (TanStack Form). No markup.',
  'react-ui': 'React components that render an ISO 20022 form from the validate schemas, with English text and replaceable skins.',
};
const KEYWORDS = ['iso20022', 'iso-20022', 'payments', 'pain.001', 'camt', 'pacs', 'financial-messaging'];

const dist = (source) => {
  const out = source.replace(/^\.\/src\//, './dist/');
  return /\.tsx?$/.test(out) ? { types: out.replace(/\.tsx?$/, '.d.ts'), default: out.replace(/\.tsx?$/, '.js') } : out;
};

let drift = 0;
for (const name of PACKAGES) {
  const file = join(root, 'packages', name, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  const publishExports = Object.fromEntries(Object.entries(pkg.exports).map(([k, v]) => [k, dist(v)]));
  const next = { ...pkg };
  delete next.private;
  Object.assign(next, {
    description: DESCRIPTIONS[name],
    license: 'MIT',
    author: 'Beneficial Strategies',
    homepage: `${REPO}#readme`,
    bugs: { url: `${REPO}/issues` },
    repository: { type: 'git', url: `git+${REPO}.git`, directory: `packages/${name}` },
    keywords: KEYWORDS,
    files: ['dist', 'README.md', 'LICENSE'],
    sideEffects: name === 'react-ui' ? ['**/*.css'] : false,
    publishConfig: { access: 'public', exports: publishExports },
  });
  next.scripts = { ...pkg.scripts, build: 'tsc -p tsconfig.build.json && node ../../tools/publish/postbuild.mjs', prepack: 'node ../../tools/publish/prepack.mjs' };
  // a stable key order, so a rewrite does not reshuffle the file
  const order = ['name', 'version', 'description', 'license', 'author', 'homepage', 'bugs', 'repository', 'keywords', 'type', 'sideEffects', 'exports', 'files', 'publishConfig', 'scripts', 'dependencies', 'peerDependencies', 'devDependencies'];
  const sorted = Object.fromEntries([...order.filter((k) => k in next), ...Object.keys(next).filter((k) => !order.includes(k))].map((k) => [k, next[k]]));
  const text = JSON.stringify(sorted, null, 2) + '\n';
  if (text !== readFileSync(file, 'utf8')) {
    drift++;
    if (check) console.error(`${file} is out of step with tools/publish/sync-manifests.mjs`);
    else writeFileSync(file, text);
  }
}
if (check && drift) process.exit(1);
console.log(check ? 'package.json files are in step' : `${drift} package.json file(s) written`);
