#!/usr/bin/env node
// After `tsc -p tsconfig.build.json` in a package: make dist/ publishable.
//   node ../../tools/publish/postbuild.mjs
// 1. TypeScript rewrites `./x.ts` to `./x.js` in the JavaScript it emits but not in the declarations; consumers cannot resolve `.ts` there, so rewrite them.
// 2. Copy the assets the package exports from src (a stylesheet) into dist, at the same relative path.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const pkgDir = process.cwd();
const dist = join(pkgDir, 'dist');
if (!existsSync(dist)) throw new Error(`${dist} does not exist: run the build first`);

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
let rewritten = 0;
for (const file of walk(dist).filter((f) => f.endsWith('.d.ts'))) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(/((?:from|import)\s*\(?\s*['"])(\.{1,2}\/[^'"]*?)\.tsx?(['"])/g, '$1$2.js$3');
  if (after !== before) { writeFileSync(file, after); rewritten++; }
}

const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
let assets = 0;
for (const target of Object.values(pkg.exports ?? {})) {
  if (typeof target !== 'string' || /\.tsx?$/.test(target)) continue;
  const from = join(pkgDir, target), to = join(dist, target.replace(/^\.\/src\//, ''));
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  assets++;
}
console.log(`${pkg.name}: ${rewritten} declaration files rewritten, ${assets} asset(s) copied into dist`);
