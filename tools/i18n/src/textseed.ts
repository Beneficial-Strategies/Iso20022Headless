/**
 * Seed a language repository from what the library does today (a one-time migration, so it needs the library): for en-US, the ISO English
 * with the library's en-US rules applied, written only where it differs. Reads the English from a source artifact.
 *
 *   node src/textseed.ts --lang en-US --source <artifact folder> --repo <dir>
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyVariant, enUS } from '../../../packages/validate/src/variants.ts';
import { hashOf } from './catalog.ts';
import { KINDS, README, readArtifact, writeOverrides, writeSorted, type Overrides } from './textrepoLib.ts';

function seed(repo: string, lang: string, sourceDir: string): void {
  if (lang !== 'en-US') throw new Error("seeding is built for en-US so far (the seed comes from the library's en-US rules)");
  if (existsSync(join(repo, 'text.config.json'))) throw new Error(`${repo} is already a text repository`);
  const art = readArtifact(sourceDir);
  const ov: Overrides = { labels: {}, types: {}, members: {}, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
  const lock: Record<string, string> = {};
  for (const k of KINDS) {
    for (const [key, e] of Object.entries(art.source[k])) {
      // element and message names inside prose stay as they are; a code name is camel case itself and is rewritten
      const us = applyVariant(e.text, enUS, k !== 'codeNames' && k !== 'labels');
      if (us === e.text) continue;
      ov[k][key] = us;
      lock[`${k}/${key}`] = hashOf(e.text);
    }
  }
  mkdirSync(repo, { recursive: true });
  writeOverrides(repo, ov, art.placement);
  writeSorted(join(repo, 'text.lock.json'), lock);
  writeFileSync(join(repo, 'reviewed.json'), '[]\n');
  writeFileSync(join(repo, 'text.config.json'), JSON.stringify({ lang, base: 'ISO English', schema: 1, seededFrom: 'the en-US rewrite rules of the library (variants.ts)', source: { sourceHash: art.manifest.sourceHash, core: art.manifest.core } }, null, 1) + '\n');
  writeFileSync(join(repo, 'README.md'), README(lang));
  writeFileSync(join(repo, '.gitignore'), 'source/\n');
  console.log(`${repo}: ${KINDS.map((k) => `${k} ${Object.keys(ov[k]).length}`).join(', ')}`);
}

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
if (process.argv[1]?.endsWith('textseed.ts')) {
  const source = arg('--source');
  const repo = arg('--repo');
  if (!source || !repo) throw new Error('usage: textseed.ts --lang en-US --source <artifact folder> --repo <dir>');
  seed(resolve(repo), arg('--lang') ?? 'en-US', resolve(source));
}
