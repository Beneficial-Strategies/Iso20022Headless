import type { Kind } from './catalog.ts';

export interface GlossaryTerm {
  term: string;
  /** Required rendering in the target language (a stem is enough: matching is case-insensitive substring). */
  to: string;
  note?: string;
}

export interface Problem {
  severity: 'error' | 'warning';
  message: string;
}

/** Things in the source that must survive translation unchanged: codes, identifiers, paths, numbers. */
export function protectedTokens(source: string): string[] {
  const tokens = new Set<string>();
  for (const m of source.matchAll(/\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g)) tokens.add(m[0]); // CamelCase element names
  for (const m of source.matchAll(/\b[A-Z][A-Z0-9]{1,}\b/g)) tokens.add(m[0]); // CHK, IBAN, ISO, BIC, XML
  // /A/B[*]/C paths: a slash that starts a word, not the slash inside "and/or" or "matching/reconciliation"
  for (const m of source.matchAll(/(?<![\w)\]])\/[A-Za-z][\w/[\]*]*/g)) tokens.add(m[0]);
  for (const m of source.matchAll(/\b\d[\d.,]*\b/g)) tokens.add(m[0]); // numbers
  return [...tokens];
}

/** Compare without case or accents, so "operaciones" satisfies "operación". */
const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Single capitals and ordinary short words are not protected; a few are real English words in capitals.
const IGNORED = new Set(['A', 'I', 'OR', 'AND', 'NOT', 'IF', 'THEN']);

/** Sanity checks for one translated unit. They catch structural damage, not poor wording. */
export function checkTranslation(kind: Kind, source: string, target: string, glossary: GlossaryTerm[] = []): Problem[] {
  const out: Problem[] = [];
  const err = (message: string): void => void out.push({ severity: 'error', message });
  const warn = (message: string): void => void out.push({ severity: 'warning', message });

  if (!target.trim()) {
    err('empty translation');
    return out;
  }
  if (target !== target.trim()) warn('leading or trailing whitespace');
  if (/[\t\n\r]/.test(target)) err('contains a tab or line break');

  if (kind === 'label' || kind === 'codeName') {
    if (target.length > 80) warn(`long for a label (${target.length} characters)`);
    return out;
  }

  const bars = (s: string): number => (s.match(/\|/g) ?? []).length;
  if (bars(source) !== bars(target)) err(`paragraph markers "|" differ (source ${bars(source)}, target ${bars(target)})`);

  const missing = protectedTokens(source).filter((t) => !IGNORED.has(t) && !target.includes(t));
  if (missing.length) err(`not preserved: ${missing.join(', ')}`);

  const ratio = target.length / Math.max(1, source.length);
  if (ratio < 0.5 || ratio > 2.5) warn(`length ratio ${ratio.toFixed(2)}`);

  // Rules name elements (Debtor, Creditor...) that must stay as written, so glossary hints do not apply.
  for (const g of kind === 'rule' ? [] : glossary) {
    if (new RegExp(`\\b${g.term}\\b`, 'i').test(source) && !plain(target).includes(plain(g.to))) {
      warn(`glossary: "${g.term}" should read "${g.to}"`);
    }
  }
  return out;
}
