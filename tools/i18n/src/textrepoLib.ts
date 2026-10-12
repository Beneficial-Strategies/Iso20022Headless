/**
 * The tools of a language's text repository. They know nothing of the library: everything they need about the English, the structure of
 * the messages and where each text belongs is in the **source artifact** (see sourceArtifact.ts), a folder the library's release
 * publishes. A language repository reads it from `source/` (or `--source <dir>`), so these tools can run in any repository.
 *
 * Layout of a language repository (en-US: only what differs from the ISO English; other languages: the translations):
 *   labels.json                                  element name -> label (the same in every message)
 *   areas/<area>/{types,members,code-sets,codes,code-names,rules}.json    texts of the types that belong to that area (`shared`: used by 2+ areas)
 *   reviewed.json, text.lock.json, text.config.json, README.md
 * One entry per line, sorted. The artifact's placement table says which area a key belongs to; the tools put each entry there.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashOf } from './catalog.ts';
import { checkTranslation } from './validate.ts';
import { codeKey, memberKey, ruleKey, type LabelsPack, type MessagePack, type PackEntry } from './packFormat.ts';

export const KINDS = ['labels', 'types', 'members', 'codeSets', 'codes', 'codeNames', 'rules'] as const;
export type RepoKind = (typeof KINDS)[number];
export const FILE: Record<RepoKind, string> = { labels: 'labels.json', types: 'types.json', members: 'members.json', codeSets: 'code-sets.json', codes: 'codes.json', codeNames: 'code-names.json', rules: 'rules.json' };
const UNIT_KIND = { labels: 'label', types: 'type', members: 'field', codeSets: 'codeSet', codes: 'code', codeNames: 'codeName', rules: 'rule' } as const;
export const sourceFile = (kind: RepoKind): string => FILE[kind].replace('.json', '.en.json');

export interface SourceEntry {
  text: string;
  note: string;
}
export type Source = Record<RepoKind, Record<string, SourceEntry>>;
export interface SourceManifest {
  schema: 1;
  artifact: 'iso20022-text-source';
  core: { name: string; version: string; commit: string };
  iso: string;
  /** Identity of this version of the English: a hash of every file's hash. */
  sourceHash: string;
  areas: string[];
  files: Record<string, { sha256: string; entries: number }>;
}
export interface Artifact {
  dir: string;
  manifest: SourceManifest;
  /** type name -> area (`shared` when messages of two or more areas use it) */
  placement: Record<string, string>;
  /** message identifier -> its name, area and the names of the types it uses */
  messages: Record<string, { name: string; area: string; types: string[] }>;
  source: Source;
}

export const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback);
/** One entry per line, sorted: a diff shows exactly what changed. */
export const writeSorted = (file: string, obj: Record<string, unknown>): void => {
  mkdirSync(join(file, '..'), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
};

/** The type a key belongs to (`PostalAddress27/PostCode` -> `PostalAddress27`); labels belong to no type. */
export const typeOfKey = (kind: RepoKind, key: string): string | undefined => (kind === 'labels' ? undefined : key.split('/')[0]);
export const areaOfKey = (placement: Record<string, string>, kind: RepoKind, key: string): string | undefined => {
  const t = typeOfKey(kind, key);
  return t === undefined ? undefined : (placement[t] ?? 'shared');
};
const fileOfKey = (kind: RepoKind, area: string | undefined): string => (area === undefined ? FILE[kind] : join('areas', area, FILE[kind]));

export function readArtifact(dir: string): Artifact {
  const manifest = readJson<SourceManifest | undefined>(join(dir, 'manifest.json'), undefined);
  if (!manifest) throw new Error(`${dir} is not a text source artifact (no manifest.json). Run \`sync --from <artifact folder>\` in the repository, or pass --source.`);
  const source: Source = { labels: {}, types: {}, members: {}, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
  Object.assign(source.labels, readJson(join(dir, sourceFile('labels')), {}));
  for (const area of manifest.areas) for (const k of KINDS) if (k !== 'labels') Object.assign(source[k], readJson(join(dir, 'areas', area, sourceFile(k)), {}));
  return { dir, manifest, placement: readJson(join(dir, 'placement.json'), {}), messages: readJson(join(dir, 'messages.json'), {}), source };
}

export type Overrides = Record<RepoKind, Record<string, string>>;
const emptyOverrides = (): Overrides => ({ labels: {}, types: {}, members: {}, codeSets: {}, codes: {}, codeNames: {}, rules: {} });

/** All entries of a repository, and the folder each is in now. */
export function readOverrides(repo: string): { ov: Overrides; where: Record<string, string | undefined>; duplicates: string[] } {
  const ov = emptyOverrides();
  const where: Record<string, string | undefined> = {};
  const duplicates: string[] = [];
  const take = (kind: RepoKind, file: string, area: string | undefined): void => {
    for (const [key, text] of Object.entries(readJson<Record<string, string>>(file, {}))) {
      const id = `${kind}/${key}`;
      if (id in where) duplicates.push(`${id} is in both ${where[id] ?? 'the root'} and ${area ?? 'the root'}`);
      ov[kind][key] = text;
      where[id] = area;
    }
  };
  take('labels', join(repo, FILE.labels), undefined);
  const areas = existsSync(join(repo, 'areas')) ? readdirSync(join(repo, 'areas')) : [];
  for (const area of areas) for (const k of KINDS) if (k !== 'labels') take(k, join(repo, 'areas', area, FILE[k]), area);
  return { ov, where, duplicates };
}

/** Write the entries where the placement table says they belong (an emptied file is removed). */
export function writeOverrides(repo: string, ov: Overrides, placement: Record<string, string>): void {
  const areasDir = join(repo, 'areas');
  if (existsSync(areasDir)) for (const area of readdirSync(areasDir)) for (const k of KINDS) if (k !== 'labels') rmSync(join(areasDir, area, FILE[k]), { force: true });
  const groups = new Map<string, Record<string, string>>();
  for (const k of KINDS) {
    for (const [key, text] of Object.entries(ov[k])) {
      const file = fileOfKey(k, areaOfKey(placement, k, key));
      (groups.get(file) ?? groups.set(file, {}).get(file)!)[key] = text;
    }
  }
  for (const [file, entries] of groups) writeSorted(join(repo, file), entries);
  if (!groups.has(FILE.labels)) writeSorted(join(repo, FILE.labels), {});
}

export const README = (lang: string): string => `# ISO 20022 text: ${lang}

The ${lang} text of the ISO 20022 message explorer and library. This repository holds **only what differs from the ISO English**: anything
not written here shows the ISO English text.

## What to edit

\`labels.json\` has the form label of every element, one per element name, the same in every message that has it. Everything else is
under \`areas/<area>/\`, where \`<area>\` is a business area (\`pain\`, \`camt\`, \`seev\`, ...) or \`shared\` for types that messages of two or
more areas use. In each area folder:

| File | Key | What it is |
|---|---|---|
| \`members.json\` | \`PostalAddress27/PostCode\` | the definition of an element inside one type |
| \`types.json\` | \`PostalAddress27\` | the definition of a type |
| \`codes.json\`, \`code-names.json\` | \`AddressType2Code/HOME\` | a code's definition and the name shown after it in a dropdown |
| \`code-sets.json\`, \`rules.json\` | \`AddressType2Code\`, \`Type/RuleName\` | a code set's definition; the text of a business rule |

Each file is one entry per line, sorted. Keep placeholders, element names, acronyms (IBAN, BIC, ...) and \`|\` (a line break) as they are in the English.
You do not decide which area folder an entry goes in: \`add\` puts it in the right one, and \`check\` says if one is in the wrong place.

## Finding what to change

* \`source/\` is the English of every text with a note on where it appears (the *source artifact* of the library's release; \`sync --from <folder>\`
  fetches it; it is not committed). Search it, then \`add --kind members --key PostalAddress27/PostCode\` copies that entry in, ready to edit.
* \`status\` lists what is overridden, reviewed, stale (the English changed after the entry was written) and orphaned (no longer in the English).
* \`check\` lints the files; it runs on every pull request.
* \`reviewed.json\` lists the entries a person has approved. Anything else is a machine draft and is shown as such.
* \`text.lock.json\` records the English each entry was written against; the tools keep it. Who changed what and when is the repository's history.
`;

export interface Report {
  overrides: number;
  reviewed: number;
  stale: string[];
  orphans: string[];
  misplaced: string[];
  duplicates: string[];
  sameAsEnglish: string[];
  problems: string[];
}

export function analyse(repo: string, art: Artifact): Report {
  const { ov, where, duplicates } = readOverrides(repo);
  const lock = readJson<Record<string, string>>(join(repo, 'text.lock.json'), {});
  const reviewed = new Set(readJson<string[]>(join(repo, 'reviewed.json'), []));
  const r: Report = { overrides: 0, reviewed: 0, stale: [], orphans: [], misplaced: [], duplicates, sameAsEnglish: [], problems: [] };
  for (const k of KINDS) {
    for (const [key, text] of Object.entries(ov[k])) {
      const id = `${k}/${key}`;
      r.overrides++;
      if (reviewed.has(id)) r.reviewed++;
      const src = art.source[k][key];
      if (!src) {
        r.orphans.push(id);
        continue;
      }
      if (where[id] !== areaOfKey(art.placement, k, key)) r.misplaced.push(`${id} is in ${where[id] ?? 'the root'} but belongs in ${areaOfKey(art.placement, k, key) ?? 'the root'}`);
      if (text === src.text) r.sameAsEnglish.push(id);
      if (lock[id] !== undefined && lock[id] !== hashOf(src.text)) r.stale.push(id);
      for (const p of checkTranslation(UNIT_KIND[k], src.text, text)) {
        if (/tab or line break/.test(p.message) && /[\t\n\r]/.test(src.text)) continue; // the English has it too
        r.problems.push(`${p.severity}: ${id}: ${p.message}`);
      }
    }
  }
  return r;
}

export function status(repo: string, art: Artifact): Report {
  const r = analyse(repo, art);
  const { ov } = readOverrides(repo);
  console.log(KINDS.map((k) => `${FILE[k]}: ${Object.keys(ov[k]).length}`).join('   '));
  console.log(`${r.overrides} entries, ${r.reviewed} reviewed, ${r.stale.length} stale, ${r.orphans.length} orphaned, ${r.misplaced.length} misplaced, ${r.sameAsEnglish.length} identical to the English`);
  const config = readJson<{ source?: { sourceHash?: string } }>(join(repo, 'text.config.json'), {});
  if (config.source?.sourceHash && config.source.sourceHash !== art.manifest.sourceHash) console.log(`the source in use (${art.manifest.sourceHash.slice(0, 8)}) is not the one this repository was last synced with (${config.source.sourceHash.slice(0, 8)}): run sync`);
  for (const [label, list] of [['stale (the English changed since the entry was written)', r.stale], ['orphaned (no longer in the English)', r.orphans], ['misplaced', r.misplaced], ['identical to the English (can be removed)', r.sameAsEnglish]] as const) {
    if (list.length) console.log(`${label}:\n${list.slice(0, 10).map((x) => '  ' + x).join('\n')}${list.length > 10 ? `\n  … ${list.length - 10} more` : ''}`);
  }
  return r;
}

export function check(repo: string, art: Artifact): number {
  const r = analyse(repo, art);
  const errors = [...r.orphans.map((o) => `error: ${o}: not in the English source (renamed or removed?)`), ...r.misplaced.map((m) => `error: ${m}`), ...r.duplicates.map((d) => `error: ${d}`), ...r.problems.filter((p) => p.startsWith('error'))];
  for (const e of [...errors, ...r.problems.filter((p) => p.startsWith('warning')).slice(0, 20), ...r.stale.map((s) => `warning: ${s}: the English changed since this was written`)]) console.log(e);
  console.log(`${r.overrides} entries checked: ${errors.length} errors`);
  return errors.length ? 1 : 0;
}

export function add(repo: string, art: Artifact, kind: string, key: string): void {
  if (!(KINDS as readonly string[]).includes(kind)) throw new Error(`--kind is one of ${KINDS.join(', ')}`);
  const k = kind as RepoKind;
  const src = art.source[k][key];
  if (!src) throw new Error(`no ${kind} entry "${key}" in source/ (look it up there)`);
  const { ov } = readOverrides(repo);
  if (key in ov[k]) {
    console.log(`already there: ${ov[k][key]}`);
    return;
  }
  ov[k][key] = src.text;
  writeOverrides(repo, ov, art.placement);
  const lock = readJson<Record<string, string>>(join(repo, 'text.lock.json'), {});
  lock[`${k}/${key}`] = hashOf(src.text);
  writeSorted(join(repo, 'text.lock.json'), lock);
  const area = areaOfKey(art.placement, k, key);
  console.log(`added to ${fileOfKey(k, area)}: ${key}\n  English: ${src.text}\n  ${src.note}\nEdit the text in that file.`);
}

/** Take a (new) version of the source artifact from `from` into `source/`, and put every entry where the new placement says. */
export function sync(repo: string, from: string): Artifact {
  const incoming = readArtifact(from);
  rmSync(join(repo, 'source'), { recursive: true, force: true });
  cpSync(from, join(repo, 'source'), { recursive: true });
  const { ov, where } = readOverrides(repo);
  const moved = Object.entries(where).filter(([id, area]) => {
    const [k, ...rest] = id.split('/');
    return area !== areaOfKey(incoming.placement, k as RepoKind, rest.join('/'));
  }).length;
  writeOverrides(repo, ov, incoming.placement);
  const configFile = join(repo, 'text.config.json');
  writeFileSync(configFile, JSON.stringify({ ...readJson<Record<string, unknown>>(configFile, {}), source: { sourceHash: incoming.manifest.sourceHash, core: incoming.manifest.core } }, null, 1) + '\n');
  const r = analyse(repo, incoming);
  console.log(`source/ is now ${incoming.manifest.sourceHash.slice(0, 8)} (library ${incoming.manifest.core.version}, ${incoming.manifest.core.commit}). ${moved} entries moved, ${r.stale.length} stale, ${r.orphans.length} orphaned`);
  return incoming;
}

/** The files a text host serves for the messages: labels, and for each message the entries of the types it uses. */
export function build(repo: string, art: Artifact, out: string, messages: string[], lang: string): void {
  const { ov } = readOverrides(repo);
  const reviewed = new Set(readJson<string[]>(join(repo, 'reviewed.json'), []));
  const entry = (k: RepoKind, key: string): PackEntry => (reviewed.has(`${k}/${key}`) ? { text: ov[k][key]!, status: 'reviewed' } : ov[k][key]!);
  // the entries of each type, by kind
  const byType: Record<RepoKind, Map<string, string[]>> = Object.fromEntries(KINDS.map((k) => [k, new Map<string, string[]>()])) as Record<RepoKind, Map<string, string[]>>;
  for (const k of KINDS) {
    if (k === 'labels') continue;
    for (const key of Object.keys(ov[k])) {
      const t = typeOfKey(k, key)!;
      (byType[k].get(t) ?? byType[k].set(t, []).get(t)!).push(key);
    }
  }
  const dir = join(out, 'v1', lang);
  mkdirSync(join(dir, 'messages'), { recursive: true });
  const labels: LabelsPack = { schema: 1, lang, labels: Object.fromEntries(Object.keys(ov.labels).map((n) => [n, entry('labels', n)])) };
  writeFileSync(join(dir, 'labels.json'), JSON.stringify(labels));
  for (const id of messages) {
    const m = art.messages[id]!;
    const p: MessagePack = { schema: 1, lang, message: id, types: {}, members: {}, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
    const into: Record<Exclude<RepoKind, 'labels'>, Record<string, PackEntry>> = { types: p.types, members: p.members, codeSets: p.codeSets, codes: p.codes, codeNames: p.codeNames, rules: p.rules };
    for (const t of m.types) for (const k of Object.keys(into) as (keyof typeof into)[]) for (const key of byType[k].get(t) ?? []) into[k][key] = entry(k, key);
    writeFileSync(join(dir, 'messages', `${id}.json`), JSON.stringify(p));
  }
  console.log(`${lang}: labels ${Object.keys(labels.labels).length}, messages ${messages.join(', ')} -> ${dir}`);
}

export { codeKey, memberKey, ruleKey };
