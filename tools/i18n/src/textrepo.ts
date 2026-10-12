/**
 * The layout of a language's text repository (proof of concept) and the tools to keep it: made so that the people who own a language
 * can edit it by hand and a tool tells them what to do next.
 *
 *   node src/textrepo.ts init   --repo <dir> --lang en-US       create the repository, seeded from what the library does today
 *   node src/textrepo.ts status --repo <dir>                    what is overridden, reviewed, stale, orphaned
 *   node src/textrepo.ts check  --repo <dir>                    lint (exit code 1 on errors)
 *   node src/textrepo.ts add    --repo <dir> --kind labels --key PostCode     copy the English into the file, ready to edit
 *   node src/textrepo.ts sync   --repo <dir>                    refresh source/ from the library (after the ISO English changed)
 *   node src/textrepo.ts build  --repo <dir> --out <dir> [--messages id,id]   the files a text host serves
 *
 * A repository holds only what DIFFERS from the ISO English (regional English) or what is translated (other languages); anything
 * not written falls back to the English. Edit `labels.json`, `members.json`, ... (name or `Type/Member` -> text). Read `source/`,
 * generated and read-only, for the English and a note on where each text appears.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hashOf } from './catalog.ts';
import { checkTranslation } from './validate.ts';
import { allTypeDescriptors } from '../../../packages/validate/src/generated/all.ts';
import { messageIndex } from '../../../packages/validate/src/generated/registry.ts';
import { codeDefinitions, codeSetDefinitions, fieldDefinitions, typeDefinitions } from '../../../packages/validate/src/generated/definitions.ts';
import { displayName } from '../../../packages/validate/src/runtime.ts';
import { applyVariant, enUS } from '../../../packages/validate/src/variants.ts';
import { codeKey, memberKey, ruleKey, type LabelsPack, type MessagePack, type PackEntry } from '../../../packages/validate/src/text-pack.ts';

export const KINDS = ['labels', 'types', 'members', 'codeSets', 'codes', 'codeNames', 'rules'] as const;
export type RepoKind = (typeof KINDS)[number];
const FILE: Record<RepoKind, string> = { labels: 'labels.json', types: 'types.json', members: 'members.json', codeSets: 'code-sets.json', codes: 'codes.json', codeNames: 'code-names.json', rules: 'rules.json' };
const UNIT_KIND = { labels: 'label', types: 'type', members: 'field', codeSets: 'codeSet', codes: 'code', codeNames: 'codeName', rules: 'rule' } as const;

export interface SourceEntry {
  text: string;
  note: string;
}
export type Source = Record<RepoKind, Record<string, SourceEntry>>;

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
      if (text) out.members[memberKey(t.name, f.name)] = { text, note: `Definition of the element ${f.name} (XML tag ${f.xmlTag}) in ${t.name}.` };
    }
    for (const r of t.rules ?? []) out.rules[ruleKey(t.name, r.name)] = { text: r.text, note: `Business rule ${r.name} of ${t.name}.` };
  }
  return out;
}

type Overrides = Record<RepoKind, Record<string, string>>;
const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback);
/** One entry per line, sorted: a diff shows exactly what changed. */
const writeSorted = (file: string, obj: Record<string, unknown>): void => {
  const sorted = Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
};
const loadOverrides = (repo: string): Overrides => Object.fromEntries(KINDS.map((k) => [k, readJson<Record<string, string>>(join(repo, FILE[k]), {})])) as Overrides;
const loadSource = (repo: string): Source =>
  // `source/` is generated and not committed: without it the tools build the English view themselves
  !existsSync(join(repo, 'source')) ? buildSource() : Object.fromEntries(KINDS.map((k) => [k, readJson<Record<string, SourceEntry>>(join(repo, 'source', FILE[k].replace('.json', '.en.json')), {})])) as Source;
const lockOf = (repo: string): Record<string, string> => readJson(join(repo, 'text.lock.json'), {});

function writeSource(repo: string, source: Source): void {
  mkdirSync(join(repo, 'source'), { recursive: true });
  for (const k of KINDS) writeSorted(join(repo, 'source', FILE[k].replace('.json', '.en.json')), source[k]);
}

const README = (lang: string): string => `# ISO 20022 text: ${lang}

The ${lang} text of the ISO 20022 message explorer and library. This repository holds **only what differs from the ISO English**: anything
not written here shows the ISO English text.

## What to edit

| File | Key | What it is |
|---|---|---|
| \`labels.json\` | \`PostCode\` | the form label of an element, the same in every message that has it |
| \`members.json\` | \`PostalAddress27/PostCode\` | the definition of an element inside one type |
| \`types.json\` | \`PostalAddress27\` | the definition of a type |
| \`codes.json\`, \`code-names.json\` | \`AddressType2Code/HOME\` | a code's definition and the name shown after it in a dropdown |
| \`code-sets.json\`, \`rules.json\` | \`AddressType2Code\`, \`Type/RuleName\` | a code set's definition; the text of a business rule |

Each file is one entry per line, sorted. Keep placeholders, element names, acronyms (IBAN, BIC, ...) and \`|\` (a line break) as they are in the English.

## Finding what to change

* \`source/*.en.json\` (generated, read-only) has the English of every text and a note on where it appears. Search it, then use
  \`node tools/i18n/src/textrepo.ts add --repo . --kind members --key PostalAddress27/PostCode\` to copy that entry into the file ready to edit.
* \`status\` lists what is overridden, reviewed, stale (the English changed after the entry was written) and orphaned (no longer in the English).
* \`check\` lints the files; it runs on every pull request.
* \`reviewed.json\` lists the entries a person has approved. Anything else is a machine draft and is shown as such.

\`text.lock.json\` records the English each entry was written against; the tools keep it. Do not edit \`source/\` by hand: it is generated and not committed (\`node tools/i18n/src/textrepo.ts sync --repo .\` writes it; without it the tools work out the English themselves).
`;

/** The rules the library applies today to make ISO English into en-US, kept here as seed data: the repository holds the result. */
function seedEnUS(source: Source): Overrides {
  const o: Overrides = { labels: {}, types: {}, members: {}, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
  for (const k of KINDS) for (const [key, e] of Object.entries(source[k])) {
    // element and message names inside prose stay as they are; a code name is camel case itself and is rewritten
    const us = applyVariant(e.text, enUS, k !== 'codeNames' && k !== 'labels');
    if (us !== e.text) o[k][key] = us;
  }
  return o;
}

function init(repo: string, lang: string): void {
  if (lang !== 'en-US') throw new Error('init is built for en-US so far (the seed comes from the library\'s en-US rules)');
  if (existsSync(join(repo, 'text.config.json'))) throw new Error(`${repo} is already a text repository`);
  mkdirSync(repo, { recursive: true });
  const source = buildSource();
  const seed = seedEnUS(source);
  const lock: Record<string, string> = {};
  for (const k of KINDS) {
    writeSorted(join(repo, FILE[k]), seed[k]);
    for (const key of Object.keys(seed[k])) lock[`${k}/${key}`] = hashOf(source[k][key]!.text);
  }
  writeSource(repo, source);
  writeSorted(join(repo, 'text.lock.json'), lock);
  writeFileSync(join(repo, 'reviewed.json'), '[]\n');
  writeFileSync(join(repo, 'text.config.json'), JSON.stringify({ lang, base: 'ISO English', schema: 1, library: 'proof of concept', seededFrom: 'the en-US rewrite rules of packages/validate/src/variants.ts' }, null, 1) + '\n');
  writeFileSync(join(repo, 'README.md'), README(lang));
  console.log(`${repo}: ${KINDS.map((k) => `${FILE[k]} ${Object.keys(seed[k]).length}`).join(', ')}`);
}

interface Report {
  overrides: number;
  reviewed: number;
  stale: string[];
  orphans: string[];
  sameAsEnglish: string[];
  problems: string[];
}

function analyse(repo: string): Report {
  const source = loadSource(repo);
  const ov = loadOverrides(repo);
  const lock = lockOf(repo);
  const reviewed = new Set(readJson<string[]>(join(repo, 'reviewed.json'), []));
  const r: Report = { overrides: 0, reviewed: 0, stale: [], orphans: [], sameAsEnglish: [], problems: [] };
  for (const k of KINDS) {
    for (const [key, text] of Object.entries(ov[k])) {
      const id = `${k}/${key}`;
      r.overrides++;
      if (reviewed.has(id)) r.reviewed++;
      const src = source[k][key];
      if (!src) {
        r.orphans.push(id);
        continue;
      }
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

function status(repo: string): Report {
  const r = analyse(repo);
  const ov = loadOverrides(repo);
  console.log(KINDS.map((k) => `${FILE[k]}: ${Object.keys(ov[k]).length}`).join('   '));
  console.log(`${r.overrides} entries, ${r.reviewed} reviewed, ${r.stale.length} stale, ${r.orphans.length} orphaned, ${r.sameAsEnglish.length} identical to the English`);
  for (const [label, list] of [['stale (the English changed since the entry was written)', r.stale], ['orphaned (no longer in the English)', r.orphans], ['identical to the English (can be removed)', r.sameAsEnglish]] as const) {
    if (list.length) console.log(`${label}:\n${list.slice(0, 10).map((x) => '  ' + x).join('\n')}${list.length > 10 ? `\n  … ${list.length - 10} more` : ''}`);
  }
  return r;
}

function check(repo: string): number {
  const r = analyse(repo);
  const errors = [...r.orphans.map((o) => `error: ${o}: not in the English source (renamed or removed?)`), ...r.problems.filter((p) => p.startsWith('error'))];
  for (const e of [...errors, ...r.problems.filter((p) => p.startsWith('warning')).slice(0, 20), ...r.stale.map((s) => `warning: ${s}: the English changed since this was written`)]) console.log(e);
  console.log(`${r.overrides} entries checked: ${errors.length} errors`);
  return errors.length ? 1 : 0;
}

function add(repo: string, kind: string, key: string): void {
  if (!(KINDS as readonly string[]).includes(kind)) throw new Error(`--kind is one of ${KINDS.join(', ')}`);
  const k = kind as RepoKind;
  const src = loadSource(repo)[k][key];
  if (!src) throw new Error(`no ${kind} entry "${key}" in source/ (look it up there)`);
  const file = join(repo, FILE[k]);
  const ov = readJson<Record<string, string>>(file, {});
  if (key in ov) {
    console.log(`already there: ${ov[key]}`);
    return;
  }
  ov[key] = src.text;
  writeSorted(file, ov);
  const lock = lockOf(repo);
  lock[`${k}/${key}`] = hashOf(src.text);
  writeSorted(join(repo, 'text.lock.json'), lock);
  console.log(`added to ${FILE[k]}: ${key}\n  English: ${src.text}\n  ${src.note}\nEdit the text in ${FILE[k]}.`);
}

function sync(repo: string): void {
  writeSource(repo, buildSource());
  const r = analyse(repo);
  console.log(`source/ refreshed. ${r.stale.length} stale, ${r.orphans.length} orphaned entries`);
}

async function build(repo: string, out: string, messages: string[], lang: string): Promise<void> {
  const ov = loadOverrides(repo);
  const reviewed = new Set(readJson<string[]>(join(repo, 'reviewed.json'), []));
  const entry = (k: RepoKind, key: string): PackEntry | undefined => {
    const text = ov[k][key];
    return text === undefined ? undefined : reviewed.has(`${k}/${key}`) ? { text, status: 'reviewed' } : text;
  };
  const dir = join(out, 'v1', lang);
  mkdirSync(join(dir, 'messages'), { recursive: true });
  const labels: LabelsPack = { schema: 1, lang, labels: Object.fromEntries(Object.keys(ov.labels).map((n) => [n, entry('labels', n)!])) };
  writeFileSync(join(dir, 'labels.json'), JSON.stringify(labels));
  for (const id of messages) {
    const { typeDescriptors } = await messageIndex.find((m) => m.identifier === id)!.load();
    const p: MessagePack = { schema: 1, lang, message: id, types: {}, members: {}, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
    const put = (map: Record<string, PackEntry>, k: RepoKind, key: string): void => {
      const e = entry(k, key);
      if (e !== undefined) map[key] = e;
    };
    for (const t of Object.values(typeDescriptors)) {
      put(p.types, 'types', t.name);
      if (t.kind === 'code') put(p.codeSets, 'codeSets', t.name);
      for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) put(p.members, 'members', memberKey(t.name, f.name));
      for (const o of t.options ?? []) {
        put(p.codes, 'codes', codeKey(t.name, o.value));
        put(p.codeNames, 'codeNames', codeKey(t.name, o.value));
      }
      for (const r of t.rules ?? []) put(p.rules, 'rules', ruleKey(t.name, r.name));
    }
    writeFileSync(join(dir, 'messages', `${id}.json`), JSON.stringify(p));
  }
  console.log(`${lang}: labels ${Object.keys(labels.labels).length}, messages ${messages.join(', ')} -> ${dir}`);
}

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

if (process.argv[1]?.endsWith('textrepo.ts')) {
  const cmd = process.argv[2];
  const repo = resolve(arg('--repo') ?? '.');
  if (cmd === 'init') init(repo, arg('--lang') ?? 'en-US');
  else if (cmd === 'status') status(repo);
  else if (cmd === 'check') process.exitCode = check(repo);
  else if (cmd === 'add') add(repo, arg('--kind') ?? '', arg('--key') ?? '');
  else if (cmd === 'sync') sync(repo);
  else if (cmd === 'build') await build(repo, resolve(arg('--out') ?? 'out'), (arg('--messages') ?? 'pain.001.001.13,pain.002.001.15,head.001.001.04').split(','), readJson<{ lang: string }>(join(repo, 'text.config.json'), { lang: 'en-US' }).lang);
  else console.error('usage: textrepo.ts <init|status|check|add|sync|build> --repo <dir> ...');
}
