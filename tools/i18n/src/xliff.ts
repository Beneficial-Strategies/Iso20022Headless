import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { Catalog, Entry, Status, Unit } from './catalog.ts';
import { hashOf } from './catalog.ts';

/**
 * XLIFF 2.0 export/import. Statuses map to the standard `state` attribute:
 *   (no entry)        -> state="initial", empty target
 *   machine           -> state="translated"  (+ <note category="status">machine</note>)
 *   reviewed          -> state="final"
 * On import, a unit counts as reviewed when its state is reviewed/final, OR when a person changed the
 * text (a changed target means somebody edited it). Untouched "translated" units stay machine.
 */

const NS = 'urn:oasis:std:xliff:document:2.0';

export function toXliff(units: Unit[], catalog: Catalog, srcLang = 'en'): string {
  const unit = units.map((u) => {
    const e = catalog.entries[u.key];
    const stale = e && e.source !== u.hash;
    const state = !e ? 'initial' : stale ? 'initial' : e.status === 'reviewed' ? 'final' : 'translated';
    const notes = [
      { '@_category': 'context', '#text': u.context },
      { '@_category': 'kind', '#text': u.kind },
      ...(e ? [{ '@_category': 'status', '#text': stale ? 'stale: the English changed since this was translated' : e.status }] : []),
      ...(e && stale ? [{ '@_category': 'previous-translation', '#text': e.text }] : []),
    ];
    return {
      '@_id': u.key,
      notes: { note: notes },
      segment: { '@_state': state, source: u.text, target: e && !stale ? e.text : '' },
    };
  });
  const doc = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    xliff: {
      '@_xmlns': NS,
      '@_version': '2.0',
      '@_srcLang': srcLang,
      '@_trgLang': catalog.locale,
      file: { '@_id': catalog.message, unit },
    },
  };
  const xml = new XMLBuilder({ ignoreAttributes: false, format: true, indentBy: '  ', suppressEmptyNode: false }).build(doc) as string;
  return xml.endsWith('\n') ? xml : xml + '\n';
}

export interface ImportResult {
  catalog: Catalog;
  reviewed: string[];
  unchanged: string[];
  skipped: string[];
  unknown: string[];
}

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const textOf = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' && '#text' in v ? String((v as { '#text': unknown })['#text']) : '');

/**
 * Apply an edited XLIFF file to a catalog. Never touches a `reviewed` entry unless the file changes it, and
 * ignores units whose source no longer matches the current English (they would be translations of old text).
 */
export function fromXliff(xml: string, units: Unit[], catalog: Catalog, by: string, date: string): ImportResult {
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, trimValues: false }).parse(xml) as {
    xliff?: { file?: { unit?: unknown } };
  };
  const byKey = new Map(units.map((u) => [u.key, u]));
  const entries = { ...catalog.entries };
  const result: ImportResult = { catalog: { ...catalog, entries }, reviewed: [], unchanged: [], skipped: [], unknown: [] };

  for (const u of arr(parsed.xliff?.file?.unit as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    const id = String(u['@_id']);
    const unit = byKey.get(id);
    if (!unit) {
      result.unknown.push(id);
      continue;
    }
    const seg = arr(u.segment as Record<string, unknown> | Record<string, unknown>[] | undefined)[0] ?? {};
    const source = textOf(seg.source);
    const target = textOf(seg.target);
    const state = String(seg['@_state'] ?? 'initial');
    if (source !== unit.text) {
      result.skipped.push(id); // translated against different English
      continue;
    }
    if (!target.trim()) {
      result.skipped.push(id);
      continue;
    }
    const cur = entries[id];
    const edited = !cur || cur.text !== target;
    const approved = state === 'reviewed' || state === 'final';
    if (!edited && !(approved && cur.status !== 'reviewed')) {
      result.unchanged.push(id);
      continue;
    }
    const status: Status = edited || approved ? 'reviewed' : 'machine';
    const entry: Entry = { text: target, source: hashOf(unit.text), status, by, date };
    entries[id] = entry;
    result.reviewed.push(id);
  }
  return result;
}
