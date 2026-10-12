/**
 * Text packs (proof of concept): turn the translation catalogs into the static files a text host serves.
 *
 *   node src/packs.ts build --out <dir> --langs fr,de --messages pain.001.001.13,pain.002.001.15,head.001.001.04
 *   node src/packs.ts serve --dir <dir> [--port 5200]
 *
 * Layout (see packages/validate/src/text-pack.ts): `<dir>/v1/<lang>/labels.json` and `<dir>/v1/<lang>/messages/<identifier>.json`.
 * Labels are keyed by element NAME, so a field has one label in a language wherever it appears. The catalogs hold one label per element
 * id, and the same name can have several translations there (machine drift); the pack takes the reviewed one, else the most common,
 * and `labels.conflicts.json` lists every name that had more than one so that a reviewer can settle it.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { allTypeDescriptors } from '../../../packages/validate/src/generated/all.ts';
import { messageIndex } from '../../../packages/validate/src/generated/registry.ts';
import { codeKey, memberKey, ruleKey, type LabelsPack, type MessagePack, type PackEntry } from '../../../packages/validate/src/text-pack.ts';

export type CatalogEntries = Record<string, { text: string; status: 'machine' | 'reviewed' }>;
const localesDir = resolve(import.meta.dirname, '../../../packages/validate/src/locales');
export const loadCatalog = (lang: string): CatalogEntries => (JSON.parse(readFileSync(join(localesDir, `${lang}.catalog.json`), 'utf8')) as { entries: CatalogEntries }).entries;

const pack = (e: CatalogEntries[string] | undefined): PackEntry | undefined => (e ? (e.status === 'reviewed' ? { text: e.text, status: 'reviewed' } : e.text) : undefined);

/** One label per element name: the reviewed translation, else the most common one (the first seen on a tie). */
export function labelsFor(cat: CatalogEntries, lang: string): { labels: LabelsPack; conflicts: Record<string, { chosen: string; candidates: Record<string, number> }> } {
  const votes = new Map<string, Map<string, { n: number; reviewed: boolean }>>();
  for (const t of Object.values(allTypeDescriptors)) {
    for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) {
      const e = f.isoId ? cat[`label:${f.isoId}`] : undefined;
      if (!e) continue;
      const byText = votes.get(f.name) ?? votes.set(f.name, new Map()).get(f.name)!;
      const v = byText.get(e.text) ?? { n: 0, reviewed: false };
      v.n++;
      v.reviewed ||= e.status === 'reviewed';
      byText.set(e.text, v);
    }
  }
  const labels: Record<string, PackEntry> = {};
  const conflicts: Record<string, { chosen: string; candidates: Record<string, number> }> = {};
  for (const [name, byText] of [...votes].sort(([a], [b]) => a.localeCompare(b))) {
    const ranked = [...byText].sort((a, b) => Number(b[1].reviewed) - Number(a[1].reviewed) || b[1].n - a[1].n);
    const [text, v] = ranked[0]!;
    labels[name] = v.reviewed ? { text, status: 'reviewed' } : text;
    if (byText.size > 1) conflicts[name] = { chosen: text, candidates: Object.fromEntries(ranked.map(([t, x]) => [t, x.n])) };
  }
  return { labels: { schema: 1, lang, labels }, conflicts };
}

export async function messagePack(cat: CatalogEntries, lang: string, identifier: string): Promise<MessagePack> {
  const info = messageIndex.find((m) => m.identifier === identifier);
  if (!info) throw new Error(`no message ${identifier}`);
  const { typeDescriptors } = await info.load();
  const out: MessagePack = { schema: 1, lang, message: identifier, types: {}, members: {}, codeSets: {}, codes: {}, codeNames: {}, rules: {} };
  const set = (map: Record<string, PackEntry>, key: string, e: CatalogEntries[string] | undefined): void => {
    const v = pack(e);
    if (v !== undefined) map[key] = v;
  };
  for (const t of Object.values(typeDescriptors)) {
    if (t.isoId) set(out.types, t.name, cat[`type:${t.isoId}`]);
    if (t.kind === 'code' && t.isoId) set(out.codeSets, t.name, cat[`codeSet:${t.isoId}`]);
    for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) if (f.isoId) set(out.members, memberKey(t.name, f.name), cat[`field:${f.isoId}`]);
    for (const o of t.options ?? []) {
      if (!o.isoId) continue;
      set(out.codes, codeKey(t.name, o.value), cat[`code:${o.isoId}`]);
      set(out.codeNames, codeKey(t.name, o.value), cat[`codeName:${o.isoId}`]);
    }
    for (const r of t.rules ?? []) if (r.isoId) set(out.rules, ruleKey(t.name, r.name), cat[`rule:${r.isoId}`]);
  }
  return out;
}

