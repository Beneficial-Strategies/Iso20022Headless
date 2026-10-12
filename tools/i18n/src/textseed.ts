/**
 * Seed a language repository from what the library has today (a one-time migration, so it needs the library).
 *
 *   node src/textseed.ts --lang en-US --source <artifact folder> --repo <dir>
 *       the ISO English with the library's en-US rules applied, written only where it differs
 *   node src/textseed.ts --lang fr --source <artifact folder> --repo <dir> --catalog <fr.catalog.json> [--glossary <glossary.fr.json>]
 *       the translations of a catalog, by name instead of by repository id
 *
 * The English comes from the source artifact. For a catalog, each entry of the artifact is matched to the catalog entry of the same
 * element, type, code or rule through the library's descriptors (the artifact has no ids).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { allTypeDescriptors } from '../../../packages/validate/src/generated/all.ts';
import { applyVariant, enUS } from '../../../packages/validate/src/variants.ts';
import { hashOf } from './catalog.ts';
import { KINDS, LICENSE, README, readArtifact, writeLock, writeOverrides, writeSorted, type Artifact, type Overrides, type RepoKind } from './textrepoLib.ts';

const UNIT_KIND = { labels: 'label', types: 'type', members: 'field', codeSets: 'codeSet', codes: 'code', codeNames: 'codeName', rules: 'rule' } as const;
type CatalogEntry = { text: string; source?: string; status: 'machine' | 'reviewed' };

function finish(repo: string, lang: string, art: Artifact, ov: Overrides, lock: Record<string, string>, reviewed: string[], config: Record<string, unknown>, mode: 'regional' | 'translation'): void {
  mkdirSync(repo, { recursive: true });
  writeOverrides(repo, ov, art.placement);
  writeLock(repo, lock, art.placement);
  writeFileSync(join(repo, 'reviewed.json'), JSON.stringify(reviewed.sort(), null, 1) + '\n');
  writeFileSync(join(repo, 'text.config.json'), JSON.stringify({ lang, kind: mode, base: 'ISO English', schema: 1, ...config, source: { sourceHash: art.manifest.sourceHash, core: art.manifest.core } }, null, 1) + '\n');
  writeFileSync(join(repo, 'README.md'), README(lang, mode));
  writeFileSync(join(repo, 'LICENSE'), LICENSE);
  writeFileSync(join(repo, '.gitignore'), 'source/\n');
  console.log(`${repo}: ${KINDS.map((k) => `${k} ${Object.keys(ov[k]).length}`).join(', ')}`);
}

function seedRegional(repo: string, lang: string, art: Artifact): void {
  if (lang !== 'en-US') throw new Error("seeding without a catalog is built for en-US (the seed comes from the library's en-US rules)");
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
  finish(repo, lang, art, ov, lock, [], { seededFrom: 'the en-US rewrite rules of the library (variants.ts)' }, 'regional');
}

/** The repository ids of each key of the artifact: an element name can have many (one per type that has it). */
function idsByKey(): Record<RepoKind, Map<string, string[]>> {
  const m = Object.fromEntries(KINDS.map((k) => [k, new Map<string, string[]>()])) as Record<RepoKind, Map<string, string[]>>;
  const add = (k: RepoKind, key: string, id: string | undefined): void => {
    if (id) (m[k].get(key) ?? m[k].set(key, []).get(key)!).push(id);
  };
  for (const t of Object.values(allTypeDescriptors)) {
    add('types', t.name, t.isoId);
    if (t.kind === 'code') add('codeSets', t.name, t.isoId);
    for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) {
      add('members', `${t.name}/${f.name}`, f.isoId);
      add('labels', f.name, f.isoId);
    }
    for (const o of t.options ?? []) {
      add('codes', `${t.name}/${o.value}`, o.isoId);
      add('codeNames', `${t.name}/${o.value}`, o.isoId);
    }
    for (const r of t.rules ?? []) add('rules', `${t.name}/${r.name}`, r.isoId);
  }
  return m;
}

function seedCatalog(repo: string, lang: string, art: Artifact, catalogFile: string, glossaryFile: string | undefined): void {
  const cat = (JSON.parse(readFileSync(catalogFile, 'utf8')) as { entries: Record<string, CatalogEntry & { by?: string; date?: string }> }).entries;
  const ids = idsByKey();
  const ov: Overrides = { labels: {}, types: {}, members: {}, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
  const lock: Record<string, string> = {};
  const reviewed: string[] = [];
  const conflicts: Record<string, { chosen: string; candidates: Record<string, number> }> = {};
  let missing = 0;
  const drafted = new Set<string>();
  for (const k of KINDS) {
    for (const [key, src] of Object.entries(art.source[k])) {
      // the translations of every element this entry stands for; for a label, the most common one (a reviewed one first)
      const votes = new Map<string, { n: number; reviewed: boolean; source: string }>();
      for (const id of ids[k].get(key) ?? []) {
        const e = cat[`${UNIT_KIND[k]}:${id}`];
        if (!e) continue;
        if (e.by && e.date) drafted.add(`${e.by}, ${e.date}`);
        const v = votes.get(e.text) ?? { n: 0, reviewed: false, source: e.source ?? hashOf(src.text) };
        v.n++;
        v.reviewed ||= e.status === 'reviewed';
        votes.set(e.text, v);
      }
      if (votes.size === 0) {
        missing++;
        continue;
      }
      const ranked = [...votes].sort((a, b) => Number(b[1].reviewed) - Number(a[1].reviewed) || b[1].n - a[1].n);
      const [text, v] = ranked[0]!;
      ov[k][key] = text;
      // the hash of the English the translation was made against, so a translation that was already stale stays stale
      lock[`${k}/${key}`] = v.source;
      if (v.reviewed) reviewed.push(`${k}/${key}`);
      if (votes.size > 1) conflicts[key] = { chosen: text, candidates: Object.fromEntries(ranked.map(([t, x]) => [t, x.n])) };
    }
  }
  mkdirSync(repo, { recursive: true });
  finish(repo, lang, art, ov, lock, reviewed, { seededFrom: `the library's ${lang} catalog (machine-drafted${drafted.size ? `: ${[...drafted].sort().join('; ')}` : ''})` }, 'translation');
  if (Object.keys(conflicts).length) {
    writeSorted(join(repo, 'review', 'label-conflicts.json'), conflicts);
    console.log(`${Object.keys(conflicts).length} element names had more than one translation in the catalog: see review/label-conflicts.json`);
  }
  if (glossaryFile && existsSync(glossaryFile)) copyFileSync(glossaryFile, join(repo, 'glossary.json'));
  if (missing) console.log(`${missing} texts have no translation in the catalog (they show the English)`);
}

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
if (process.argv[1]?.endsWith('textseed.ts')) {
  const source = arg('--source');
  const repo = arg('--repo');
  const lang = arg('--lang') ?? 'en-US';
  if (!source || !repo) throw new Error('usage: textseed.ts --lang <tag> --source <artifact folder> --repo <dir> [--catalog <file> [--glossary <file>]]');
  if (existsSync(join(resolve(repo), 'text.config.json'))) throw new Error(`${repo} is already a text repository`);
  const art = readArtifact(resolve(source));
  const catalog = arg('--catalog');
  if (catalog) seedCatalog(resolve(repo), lang, art, resolve(catalog), arg('--glossary') ? resolve(arg('--glossary')!) : undefined);
  else seedRegional(resolve(repo), lang, art);
}
