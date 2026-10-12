// Runtime text packs (proof of concept). The text of one language lives outside the library, as static files:
//
//   <base>/v1/<lang>/labels.json                  { "BatchHeader": "En-tête de lot", ... }       element name -> label, the same in every message
//   <base>/v1/<lang>/messages/<identifier>.json   definitions of one message, keyed by NAMES      "<Type>/<Member>", "<CodeSet>/<VALUE>", ...
//
// Names, not repository ids, are the keys: a field is called the same wherever it appears, and a stakeholder reviews a name once.
// `expandTextPack` turns the files into the `DefinitionCatalog` the form already understands (keyed by id), using the message's own
// type descriptors, so nothing else in the library changes.
import type { CatalogEntry, DefinitionCatalog } from './definitions.ts';
import type { TypeDescriptors } from './runtime.ts';

/** Plain text is a machine draft; a reviewed text says so. */
export type PackEntry = string | { text: string; status: 'reviewed' };
type Entries = Record<string, PackEntry>;

export interface LabelsPack {
  schema: 1;
  lang: string;
  labels: Record<string, PackEntry>;
}

export interface MessagePack {
  schema: 1;
  lang: string;
  /** e.g. `pain.001.001.13` */
  message: string;
  /** `<Type>` -> the type's definition */
  types: Entries;
  /** `<Type>/<Member>` -> the member's definition */
  members: Entries;
  /** `<CodeSet>` -> definition */
  codeSets: Entries;
  /** `<CodeSet>/<VALUE>` -> the code's definition */
  codes: Entries;
  /** `<CodeSet>/<VALUE>` -> the name shown after the code in a dropdown */
  codeNames: Entries;
  /** `<Type>/<RuleName>` -> the rule's text */
  rules: Entries;
}

export const memberKey = (type: string, member: string): string => `${type}/${member}`;
export const codeKey = (codeSet: string, value: string): string => `${codeSet}/${value}`;
export const ruleKey = (type: string, rule: string): string => `${type}/${rule}`;

const entry = (e: PackEntry | undefined): CatalogEntry | undefined => (e === undefined ? undefined : typeof e === 'string' ? { text: e, status: 'machine' } : e);

/** Build the id-keyed catalog for the types of one or more messages from their packs. */
export function expandTextPack(typeDescriptors: TypeDescriptors, labels: LabelsPack | undefined, packs: readonly MessagePack[]): DefinitionCatalog {
  const out: Required<DefinitionCatalog> = { types: {}, fields: {}, codes: {}, codeSets: {}, labels: {}, codeNames: {}, rules: {} };
  const put = (map: Record<string, CatalogEntry>, id: string | undefined, e: PackEntry | undefined): void => {
    const v = entry(e);
    if (id && v) map[id] = v;
  };
  const find = <K extends keyof MessagePack>(kind: K, key: string): PackEntry | undefined => {
    for (const p of packs) {
      const e = (p[kind] as Entries)[key];
      if (e !== undefined) return e;
    }
    return undefined;
  };
  for (const t of Object.values(typeDescriptors)) {
    put(out.types, t.isoId, find('types', t.name));
    if (t.kind === 'code') put(out.codeSets, t.isoId, find('codeSets', t.name));
    for (const f of [...(t.fields ?? []), ...(t.choiceOptions ?? [])]) {
      put(out.fields, f.isoId, find('members', memberKey(t.name, f.name)));
      put(out.labels, f.isoId, labels?.labels[f.name]);
    }
    for (const o of t.options ?? []) {
      put(out.codes, o.isoId, find('codes', codeKey(t.name, o.value)));
      put(out.codeNames, o.isoId, find('codeNames', codeKey(t.name, o.value)));
    }
    for (const r of t.rules ?? []) put(out.rules, r.isoId, find('rules', ruleKey(t.name, r.name)));
  }
  return out;
}

const cache = new Map<string, Promise<unknown>>();
/** One request per file, however many forms ask; a failed request is forgotten so that a retry can succeed. */
function getJson<T>(url: string): Promise<T | undefined> {
  let p = cache.get(url) as Promise<T | undefined> | undefined;
  if (!p) {
    p = fetch(url)
      .then((r) => {
        // a host with no pack for a language answers 404: that is "no text of its own", not a failure
        if (r.status === 404) return undefined;
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<T>;
      })
      .catch((e: unknown) => {
        cache.delete(url);
        console.warn(`iso20022: could not load ${url} (${e instanceof Error ? e.message : String(e)}); using the English text`);
        return undefined;
      });
    cache.set(url, p);
  }
  return p;
}

/**
 * Load the text of `messages` in `lang` (a locale tag such as `fr` or `en-US`) from a text host and expand it for `typeDescriptors`.
 * Undefined when nothing could be loaded (the form then shows the English text, as it does for any missing entry).
 */
export async function loadTextPack(baseUrl: string, lang: string, messages: readonly string[], typeDescriptors: TypeDescriptors): Promise<DefinitionCatalog | undefined> {
  const base = `${baseUrl.replace(/\/+$/, '')}/v1/${lang}`;
  const [labels, ...packs] = await Promise.all([getJson<LabelsPack>(`${base}/labels.json`), ...messages.map((m) => getJson<MessagePack>(`${base}/messages/${m}.json`))]);
  const found = packs.filter((p): p is MessagePack => p !== undefined);
  if (!labels && found.length === 0) return undefined;
  return expandTextPack(typeDescriptors, labels, found);
}
