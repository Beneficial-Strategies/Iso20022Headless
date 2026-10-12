/**
 * The source artifact: what the library's release publishes for the language repositories. The English of every text with a note on where
 * it appears, the table that says which area each type belongs to, and which types each message uses. Language repositories (and the hub)
 * read this folder, never the library's code.
 *
 *   node src/sourceArtifact.ts build --out <dir>
 *
 *   manifest.json                  versions, files with hashes, `sourceHash` (the identity of this English)
 *   placement.json                 type name -> area (`shared` when messages of two or more areas use it)
 *   messages.json                  identifier -> { name, area, types: [type names] }
 *   labels.en.json                 element name -> { text, note }
 *   areas/<area>/<kind>.en.json    texts of the types of that area, keyed by name (`Type/Member`, `CodeSet/VALUE`, `Type/Rule`, ...)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { allTypeDescriptors } from '../../../packages/validate/src/generated/all.ts';
import { messageIndex } from '../../../packages/validate/src/generated/registry.ts';
import { codeDefinitions, codeSetDefinitions, fieldDefinitions, typeDefinitions } from '../../../packages/validate/src/generated/definitions.ts';
import { displayName } from '../../../packages/validate/src/runtime.ts';
import { KINDS, sourceFile, writeSorted, type RepoKind, type Source, type SourceEntry, type SourceManifest } from './textrepoLib.ts';

const root = resolve(import.meta.dirname, '../../..');
const codeKey = (set: string, value: string): string => `${set}/${value}`;

/** The English of every text, by the names the repositories use, each with a note saying what it is and where it appears. */
export function buildSource(): Source {
  const out: Source = { labels: {}, types: {}, members: {}, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
  const uses = new Map<string, { types: Set<string>; tags: Set<string> }>();
  for (const t of Object.values(allTypeDescriptors)) {
    for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) {
      const u = uses.get(f.name) ?? uses.set(f.name, { types: new Set(), tags: new Set() }).get(f.name)!;
      u.types.add(t.name);
      u.tags.add(f.xmlTag);
    }
  }
  for (const [name, u] of uses) {
    out.labels[name] = { text: displayName(name), note: `Form label of the element ${name} (XML tag ${[...u.tags].join(', ')}). One label for every message and type that has it: used in ${u.types.size} types.` };
  }
  for (const t of Object.values(allTypeDescriptors)) {
    const typeText = t.isoId ? typeDefinitions[t.isoId] : undefined;
    if (typeText) out.types[t.name] = { text: typeText, note: `Definition of the type ${t.name}.` };
    if (t.kind === 'code') {
      const setText = t.isoId ? codeSetDefinitions[t.isoId] : undefined;
      if (setText) out.codeSets[t.name] = { text: setText, note: `Definition of the code set ${t.name}.` };
      for (const o of t.options ?? []) {
        const defText = o.isoId ? codeDefinitions[o.isoId] : undefined;
        if (defText) out.codes[codeKey(t.name, o.value)] = { text: defText, note: `Definition of the code ${o.value} (${o.name}) of ${t.name}.` };
        out.codeNames[codeKey(t.name, o.value)] = { text: o.name, note: `Name of the code ${o.value} of ${t.name}, shown in a dropdown as "${o.value} — <name>". CamelCase in the source.` };
      }
    }
    for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) {
      const text = f.isoId ? fieldDefinitions[f.isoId] : undefined;
      if (text) out.members[`${t.name}/${f.name}`] = { text, note: `Definition of the element ${f.name} (XML tag ${f.xmlTag}) in ${t.name}.` };
    }
    for (const r of t.rules ?? []) out.rules[`${t.name}/${r.name}`] = { text: r.text, note: `Business rule ${r.name} of ${t.name}.` };
  }
  return out;
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

export async function writeSourceArtifact(out: string): Promise<SourceManifest> {
  const source = buildSource();
  // which areas use each type, and which types each message uses
  const typeAreas = new Map<string, Set<string>>();
  const messages: Record<string, { name: string; area: string; types: string[] }> = {};
  for (const m of messageIndex) {
    const { typeDescriptors } = await m.load();
    const types = Object.keys(typeDescriptors).sort();
    messages[m.identifier] = { name: m.name, area: m.area, types };
    for (const t of types) (typeAreas.get(t) ?? typeAreas.set(t, new Set()).get(t)!).add(m.area);
  }
  const placement: Record<string, string> = {};
  for (const [t, areas] of typeAreas) placement[t] = areas.size === 1 ? [...areas][0]! : 'shared';
  const areaOf = (kind: RepoKind, key: string): string | undefined => (kind === 'labels' ? undefined : (placement[key.split('/')[0]!] ?? 'shared'));

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const files: SourceManifest['files'] = {};
  const write = (rel: string, data: Record<string, unknown>, sorted: boolean): void => {
    const file = join(out, rel);
    if (sorted) writeSorted(file, data);
    else {
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
    }
    files[rel] = { sha256: sha(readFileSync(file, 'utf8')), entries: Object.keys(data).length };
  };
  const groups = new Map<string, Record<string, SourceEntry>>();
  for (const k of KINDS) {
    for (const [key, e] of Object.entries(source[k])) {
      const area = areaOf(k, key);
      const rel = area === undefined ? sourceFile(k) : join('areas', area, sourceFile(k));
      (groups.get(rel) ?? groups.set(rel, {}).get(rel)!)[key] = e;
    }
  }
  for (const [rel, entries] of groups) write(rel, entries, true);
  write('placement.json', placement, true);
  write('messages.json', messages, true);
  const areas = [...new Set(Object.values(placement))].sort();
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    /* not a git checkout */
  }
  const pkg = JSON.parse(readFileSync(join(root, 'packages/validate/package.json'), 'utf8')) as { name: string; version: string };
  const sourceHash = sha(Object.keys(files).sort().map((f) => `${f} ${files[f]!.sha256}`).join('\n'));
  const manifest: SourceManifest = { schema: 1, artifact: 'iso20022-text-source', core: { name: pkg.name, version: pkg.version, commit }, iso: 'ISO 20022 repository, MCP snapshot 2026-09-04', sourceHash, areas, files };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  return manifest;
}

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
if (process.argv[1]?.endsWith('sourceArtifact.ts')) {
  const out = arg('--out');
  if (process.argv[2] !== 'build' || !out) throw new Error('usage: sourceArtifact.ts build --out <dir>');
  const m = await writeSourceArtifact(resolve(out));
  console.log(`source artifact ${m.sourceHash.slice(0, 8)} in ${resolve(out)}: ${Object.keys(m.files).length} files, ${m.areas.length} areas (${m.areas.join(', ')}); library ${m.core.version} ${m.core.commit}`);
}
