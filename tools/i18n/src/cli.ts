/**
 * Translation tooling for the generated ISO 20022 text.
 *
 *   node src/cli.ts extract                         write i18n/source.en.json (all English units)
 *   node src/cli.ts status <locale>                 coverage, machine vs reviewed, stale and orphan entries
 *   node src/cli.ts check <locale>                  like status, but exits 1 on stale/orphan entries (for CI)
 *   node src/cli.ts lint <locale> <draft.json>      validate a draft without writing anything
 *   node src/cli.ts merge <locale> <draft.json> [by] add machine translations; never overwrites reviewed entries
 *
 * A draft is a JSON object. Keys are either unit keys (`field:_abc…`) or an English source text, which
 * applies to every unit with exactly that text (so a repeated label is translated once).
 *   node src/cli.ts export-xliff <locale>           write i18n/xliff/<locale>.xlf for a translator or a TMS
 *   node src/cli.ts import-xliff <locale> <file> <reviewer>   apply an edited file; edits become reviewed
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashOf, readCatalog, writeCatalog, type Catalog, type Unit } from './catalog.ts';
import { extractUnits, MESSAGE } from './units.ts';
import { checkTranslation, type GlossaryTerm } from './validate.ts';
import { fromXliff, toXliff } from './xliff.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const paths = {
  source: resolve(root, 'i18n/source.en.json'),
  catalog: (locale: string) => resolve(root, `packages/validate/src/locales/${locale}.catalog.json`),
  glossary: (locale: string) => resolve(root, `i18n/glossary.${locale}.json`),
  xliff: (locale: string) => resolve(root, `i18n/xliff/${locale}.xlf`),
};

export function loadGlossary(locale: string): GlossaryTerm[] {
  return existsSync(paths.glossary(locale)) ? (JSON.parse(readFileSync(paths.glossary(locale), 'utf8')) as GlossaryTerm[]) : [];
}

export interface Status {
  total: number;
  translated: number;
  machine: number;
  reviewed: number;
  missing: string[];
  stale: string[];
  orphans: string[];
}

export function statusOf(units: Unit[], catalog: Catalog): Status {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const s: Status = { total: units.length, translated: 0, machine: 0, reviewed: 0, missing: [], stale: [], orphans: [] };
  for (const u of units) {
    const e = catalog.entries[u.key];
    if (!e) s.missing.push(u.key);
    else if (e.source !== u.hash) s.stale.push(u.key);
    else {
      s.translated++;
      s[e.status]++;
    }
  }
  for (const k of Object.keys(catalog.entries)) if (!byKey.has(k)) s.orphans.push(k);
  return s;
}

/** Expand English-text keys to unit keys. Keys that match nothing are returned as unknown. */
export function expandDraft(units: Unit[], draft: Record<string, string>): { keyed: Record<string, string>; unknown: string[] } {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const byText = Object.groupBy(units, (u) => u.text);
  const keyed: Record<string, string> = {};
  const unknown: string[] = [];
  for (const [k, v] of Object.entries(draft)) {
    if (byKey.has(k)) keyed[k] = v;
    else if (byText[k]) for (const u of byText[k]!) keyed[u.key] ??= v;
    else unknown.push(k);
  }
  return { keyed, unknown };
}

export interface MergeResult {
  added: string[];
  replacedMachine: string[];
  keptReviewed: string[];
  rejected: { key: string; problems: string[] }[];
  warnings: { key: string; problems: string[] }[];
  unknown: string[];
}

/** Add drafted translations. Reviewed entries are never overwritten; invalid drafts are rejected. */
export function mergeDraft(units: Unit[], catalog: Catalog, draft: Record<string, string>, by: string, date: string, glossary: GlossaryTerm[] = []): MergeResult {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const res: MergeResult = { added: [], replacedMachine: [], keptReviewed: [], rejected: [], warnings: [], unknown: [] };
  for (const [key, text] of Object.entries(draft)) {
    const u = byKey.get(key);
    if (!u) {
      res.unknown.push(key);
      continue;
    }
    const cur = catalog.entries[key];
    if (cur?.status === 'reviewed' && cur.source === u.hash) {
      res.keptReviewed.push(key);
      continue;
    }
    const problems = checkTranslation(u.kind, u.text, text, glossary);
    const errors = problems.filter((p) => p.severity === 'error').map((p) => p.message);
    if (errors.length) {
      res.rejected.push({ key, problems: errors });
      continue;
    }
    const warns = problems.filter((p) => p.severity === 'warning').map((p) => p.message);
    if (warns.length) res.warnings.push({ key, problems: warns });
    (cur ? res.replacedMachine : res.added).push(key);
    catalog.entries[key] = { text, source: hashOf(u.text), status: 'machine', by, date };
  }
  return res;
}

function main(argv: string[]): number {
  const [cmd, locale, a, b] = argv;
  const date = new Date().toISOString().slice(0, 10);
  const units = extractUnits();

  if (cmd === 'extract') {
    mkdirSync(dirname(paths.source), { recursive: true });
    writeFileSync(paths.source, JSON.stringify({ message: MESSAGE, units }, null, 2) + '\n');
    const kinds = Object.entries(Object.groupBy(units, (u) => u.kind)).map(([k, v]) => `${k}=${v?.length}`);
    console.log(`wrote ${paths.source}: ${units.length} units (${kinds.join(' ')})`);
    return 0;
  }
  if (!locale) {
    console.error('missing <locale>');
    return 2;
  }
  const catalog = readCatalog(paths.catalog(locale), locale, MESSAGE);

  if (cmd === 'status' || cmd === 'check') {
    const s = statusOf(units, catalog);
    console.log(`${locale}: ${s.translated}/${s.total} current (${s.machine} machine, ${s.reviewed} reviewed), ${s.missing.length} missing, ${s.stale.length} stale, ${s.orphans.length} orphaned`);
    for (const [label, list] of [['stale', s.stale], ['orphaned', s.orphans]] as const) if (list.length) console.log(`  ${label}: ${list.slice(0, 10).join(', ')}${list.length > 10 ? ` … (+${list.length - 10})` : ''}`);
    return cmd === 'check' && (s.stale.length > 0 || s.orphans.length > 0) ? 1 : 0;
  }
  if (cmd === 'lint' || cmd === 'merge') {
    if (!a) return console.error('missing <draft.json>'), 2;
    const { keyed, unknown } = expandDraft(units, JSON.parse(readFileSync(a, 'utf8')) as Record<string, string>);
    if (cmd === 'lint') {
      const covered = new Set(Object.keys(keyed));
      let bad = 0;
      for (const u of units) {
        if (!keyed[u.key]) continue;
        const ps = checkTranslation(u.kind, u.text, keyed[u.key]!, loadGlossary(locale));
        const errors = ps.filter((p) => p.severity === 'error');
        if (errors.length) bad++;
        for (const p of ps) console.log(`  ${p.severity.toUpperCase()} ${u.key}: ${p.message}`);
      }
      const texts = new Set(units.filter((u) => covered.has(u.key)).map((u) => u.text));
      console.log(`lint: ${texts.size} distinct texts covering ${covered.size} units, ${bad} with errors, ${unknown.length} keys matching nothing${unknown.length ? ` (e.g. ${unknown.slice(0, 3).map((k) => JSON.stringify(k.slice(0, 40))).join(', ')})` : ''}`);
      return bad || unknown.length ? 1 : 0;
    }
    const draft = keyed;
    const r = mergeDraft(units, catalog, draft, b ?? 'machine', date, loadGlossary(locale));
    r.unknown.push(...unknown);
    writeCatalog(paths.catalog(locale), catalog);
    console.log(`merged: ${r.added.length} added, ${r.replacedMachine.length} machine entries replaced, ${r.keptReviewed.length} reviewed kept, ${r.rejected.length} rejected, ${r.unknown.length} unknown keys, ${r.warnings.length} with warnings`);
    for (const x of r.rejected) console.log(`  REJECTED ${x.key}: ${x.problems.join('; ')}`);
    for (const x of r.warnings.slice(0, 20)) console.log(`  warning ${x.key}: ${x.problems.join('; ')}`);
    return r.rejected.length ? 1 : 0;
  }
  if (cmd === 'export-xliff') {
    mkdirSync(dirname(paths.xliff(locale)), { recursive: true });
    writeFileSync(paths.xliff(locale), toXliff(units, catalog));
    console.log(`wrote ${paths.xliff(locale)}`);
    return 0;
  }
  if (cmd === 'import-xliff') {
    if (!a || !b) return console.error('usage: import-xliff <locale> <file> <reviewer>'), 2;
    const r = fromXliff(readFileSync(a, 'utf8'), units, catalog, b, date);
    writeCatalog(paths.catalog(locale), r.catalog);
    console.log(`imported: ${r.reviewed.length} reviewed/edited, ${r.unchanged.length} unchanged, ${r.skipped.length} skipped, ${r.unknown.length} unknown`);
    return 0;
  }
  console.error(`unknown command ${cmd}`);
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
