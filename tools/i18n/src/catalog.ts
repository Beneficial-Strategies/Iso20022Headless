import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Translation catalog for one language. One entry per translatable unit, keyed `kind:isoId`.
 *
 * Statuses:
 *   machine   drafted by a machine (or an assistant); usable, but nobody has checked it
 *   reviewed  a person has approved or edited it; never overwritten by a machine pass
 */
export type Status = 'machine' | 'reviewed';

export const KINDS = ['label', 'field', 'type', 'code', 'codeName', 'codeSet', 'rule'] as const;
export type Kind = (typeof KINDS)[number];

export interface Entry {
  text: string;
  /** Hash of the English text this was translated from. A different current hash means the entry is stale. */
  source: string;
  status: Status;
  /** Who or what produced `text` (e.g. an engine name, or a reviewer). */
  by?: string;
  date?: string;
}

export interface Catalog {
  locale: string;
  /** The message these units come from. */
  message: string;
  entries: Record<string, Entry>;
}

export interface Unit {
  key: string;
  kind: Kind;
  id: string;
  /** English source text. */
  text: string;
  /** Human-readable hint for translators. */
  context: string;
  hash: string;
}

export const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12);

export function readCatalog(path: string, locale: string, message: string): Catalog {
  if (!existsSync(path)) return { locale, message, entries: {} };
  return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
}

/** Stable output (sorted keys) so diffs show only real changes. */
export function writeCatalog(path: string, catalog: Catalog): void {
  const entries = Object.fromEntries(Object.entries(catalog.entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(path, JSON.stringify({ ...catalog, entries }, null, 2) + '\n');
}
