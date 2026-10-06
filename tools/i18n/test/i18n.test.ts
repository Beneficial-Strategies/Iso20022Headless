import { describe, expect, it } from 'vitest';
import { hashOf, type Catalog, type Unit } from '../src/catalog.ts';
import { expandDraft, mergeDraft, statusOf } from '../src/cli.ts';
import { extractUnits } from '../src/units.ts';
import { checkTranslation, protectedTokens } from '../src/validate.ts';
import { fromXliff, toXliff } from '../src/xliff.ts';

const u = (key: string, text: string, kind: Unit['kind'] = 'field'): Unit => ({ key, kind, id: key.split(':')[1]!, text, context: `ctx ${key}`, hash: hashOf(text) });
const empty = (): Catalog => ({ locale: 'es', message: 'm', entries: {} });

describe('extraction', () => {
  const units = extractUnits();
  it('finds every translatable unit of the message, with unique keys', () => {
    expect(new Set(units.map((x) => x.key)).size).toBe(units.length);
    const count = (k: string) => units.filter((x) => x.kind === k).length;
    expect(units.length).toBe(2588);
    expect(count('field')).toBe(952);
    expect(count('label')).toBe(998); // 952 elements + the message building blocks of the fourteen messages (46)
    expect(count('type')).toBe(195);
    expect(count('code')).toBe(126);
    expect(count('codeName')).toBe(126);
    expect(count('codeSet')).toBe(42);
    expect(count('rule')).toBe(149);
  });
  it('every unit has text, a context and a hash of its text', () => {
    for (const x of units) {
      expect(x.text.length, x.key).toBeGreaterThan(0);
      expect(x.context.length, x.key).toBeGreaterThan(0);
      expect(x.hash).toBe(hashOf(x.text));
    }
  });
});

describe('checks on a translation', () => {
  it('keeps codes, identifiers, paths and paragraph markers', () => {
    const src = 'If PaymentMethod is CHK (Cheque), then CreditTransferTransactionInformation/ChequeInstruction is not allowed.';
    expect(checkTranslation('rule', src, 'Si PaymentMethod es CHK (Cheque), entonces CreditTransferTransactionInformation/ChequeInstruction no está permitido.')).toEqual([]);
    const bad = checkTranslation('rule', src, 'Si el método de pago es cheque, entonces la instrucción de cheque no está permitida.');
    expect(bad.some((p) => p.severity === 'error' && /PaymentMethod/.test(p.message))).toBe(true);
    expect(checkTranslation('field', 'A.|Usage: B.', 'A. Uso: B.').some((p) => /paragraph/.test(p.message))).toBe(true);
    expect(checkTranslation('field', 'Text.', '   ').some((p) => /empty/.test(p.message))).toBe(true);
  });
  it('"and/or" is not a path', () => {
    expect(protectedTokens('letters and/or numbers, matching/reconciliation')).toEqual([]);
    expect(protectedTokens('see /A/B[*]/C')).toContain('/A/B[*]/C');
  });
  it('glossary hints ignore case and accents', () => {
    const g = [{ term: 'Transaction', to: 'operación' }];
    expect(checkTranslation('field', 'A transaction.', 'Una operación.', g)).toEqual([]);
    expect(checkTranslation('field', 'Many transactions.', 'Varias operaciones.', g)).toEqual([]);
    expect(checkTranslation('field', 'A transaction.', 'Una transacción.', g).some((p) => p.severity === 'warning')).toBe(true);
  });
});

describe('merging machine drafts', () => {
  const units = [u('field:a', 'Alpha one.'), u('field:b', 'Alpha one.'), u('label:c', 'Name', 'label')];

  it('a draft keyed by English text applies to every unit with that text', () => {
    const { keyed, unknown } = expandDraft(units, { 'Alpha one.': 'Alfa uno.', Name: 'Nombre', 'No such text': 'x' });
    expect(keyed).toEqual({ 'field:a': 'Alfa uno.', 'field:b': 'Alfa uno.', 'label:c': 'Nombre' });
    expect(unknown).toEqual(['No such text']);
  });

  it('adds machine entries with the hash of the English they came from', () => {
    const c = empty();
    const r = mergeDraft(units, c, { 'field:a': 'Alfa uno.' }, 'engine', '2026-10-06');
    expect(r.added).toEqual(['field:a']);
    expect(c.entries['field:a']).toEqual({ text: 'Alfa uno.', source: hashOf('Alpha one.'), status: 'machine', by: 'engine', date: '2026-10-06' });
  });

  it('NEVER overwrites a reviewed entry', () => {
    const c = empty();
    c.entries['field:a'] = { text: 'Alfa uno (corregido).', source: hashOf('Alpha one.'), status: 'reviewed', by: 'Ana', date: '2026-10-07' };
    const r = mergeDraft(units, c, { 'field:a': 'Otra máquina.' }, 'engine', '2026-10-08');
    expect(r.keptReviewed).toEqual(['field:a']);
    expect(c.entries['field:a']?.text).toBe('Alfa uno (corregido).');
    expect(c.entries['field:a']?.status).toBe('reviewed');
  });

  it('replaces machine entries, and replaces a reviewed entry only when its English changed (stale)', () => {
    const c = empty();
    c.entries['field:a'] = { text: 'vieja', source: hashOf('Alpha one.'), status: 'machine' };
    expect(mergeDraft(units, c, { 'field:a': 'nueva' }, 'e', 'd').replacedMachine).toEqual(['field:a']);
    c.entries['field:b'] = { text: 'texto viejo', source: hashOf('Different English'), status: 'reviewed' };
    expect(mergeDraft(units, c, { 'field:b': 'texto nuevo' }, 'e', 'd').replacedMachine).toEqual(['field:b']);
    expect(c.entries['field:b']?.status).toBe('machine'); // back to machine until someone reviews it again
  });

  it('rejects structurally broken drafts and keeps the catalog clean', () => {
    const c = empty();
    const r = mergeDraft([u('field:p', 'One.|Usage: Two.')], c, { 'field:p': 'Uno. Uso: Dos.' }, 'e', 'd');
    expect(r.rejected).toHaveLength(1);
    expect(c.entries).toEqual({});
  });
});

describe('staleness and coverage', () => {
  it('flags missing, stale and orphaned entries', () => {
    const units = [u('field:a', 'A'), u('field:b', 'B'), u('field:c', 'C')];
    const c = empty();
    c.entries['field:a'] = { text: 'a', source: hashOf('A'), status: 'machine' };
    c.entries['field:b'] = { text: 'b', source: hashOf('OLD B'), status: 'reviewed' };
    c.entries['field:gone'] = { text: 'x', source: 'x', status: 'machine' };
    const s = statusOf(units, c);
    expect(s).toMatchObject({ total: 3, translated: 1, machine: 1, reviewed: 0 });
    expect(s.missing).toEqual(['field:c']);
    expect(s.stale).toEqual(['field:b']);
    expect(s.orphans).toEqual(['field:gone']);
  });
});

describe('XLIFF round trip', () => {
  const units = [u('field:a', 'Alpha & <one>.'), u('field:b', 'Beta.'), u('field:c', 'Gamma.')];
  const base = (): Catalog => {
    const c = empty();
    c.entries['field:a'] = { text: 'Alfa & <uno>.', source: hashOf('Alpha & <one>.'), status: 'machine' };
    c.entries['field:b'] = { text: 'Beta.', source: hashOf('Beta.'), status: 'reviewed', by: 'Ana' };
    return c;
  };

  it('exports XLIFF 2.0 with source, target, state and notes; escapes markup', () => {
    const xml = toXliff(units, base());
    expect(xml).toContain('version="2.0"');
    expect(xml).toContain('srcLang="en"');
    expect(xml).toContain('trgLang="es"');
    expect(xml).toContain('Alpha &amp; &lt;one&gt;.');
    expect(xml).toMatch(/state="translated"/);
    expect(xml).toMatch(/state="final"/);
    expect(xml).toMatch(/state="initial"/); // field:c has no translation yet
    expect(xml).toContain('category="context"');
  });

  it('importing an unchanged export changes nothing', () => {
    const c = base();
    const r = fromXliff(toXliff(units, c), units, c, 'Ben', '2026-10-07');
    expect(r.reviewed).toEqual([]);
    expect(r.catalog.entries).toEqual(base().entries);
  });

  it('a translator editing a target makes that entry reviewed; untouched ones stay machine', () => {
    const c = base();
    const edited = toXliff(units, c).replace('Alfa &amp; &lt;uno&gt;.', 'Alfa &amp; &lt;uno&gt; (revisado).');
    const r = fromXliff(edited, units, c, 'Ben', '2026-10-07');
    expect(r.reviewed).toEqual(['field:a']);
    expect(r.catalog.entries['field:a']).toMatchObject({ text: 'Alfa & <uno> (revisado).', status: 'reviewed', by: 'Ben', date: '2026-10-07' });
  });

  it('marking a machine unit state="final" without editing approves it as is', () => {
    const c = base();
    const xml = toXliff(units, c).replace(/(<unit id="field:a"[\s\S]*?<segment state=")translated"/, '$1final"');
    const r = fromXliff(xml, units, c, 'Ben', '2026-10-07');
    expect(r.catalog.entries['field:a']).toMatchObject({ text: 'Alfa & <uno>.', status: 'reviewed', by: 'Ben' });
  });

  it('fills a missing translation from the file, as reviewed', () => {
    const c = base();
    const xml = toXliff(units, c).replace(/(<unit id="field:c"[\s\S]*?<target>)<\/target>/, '$1Gamma en español.</target>');
    const r = fromXliff(xml, units, c, 'Ben', '2026-10-07');
    expect(r.catalog.entries['field:c']).toMatchObject({ text: 'Gamma en español.', status: 'reviewed' });
  });

  it('ignores translations made against English that has since changed, and unknown ids', () => {
    const c = base();
    const xml = toXliff(units, c).replace('<source>Beta.</source>', '<source>Beta, old wording.</source>').replace('field:c', 'field:zzz');
    const r = fromXliff(xml, units, c, 'Ben', 'd');
    expect(r.skipped).toContain('field:b');
    expect(r.unknown).toEqual(['field:zzz']);
  });

  it('a stale entry is exported as initial with the previous translation in a note', () => {
    const c = base();
    c.entries['field:a'] = { text: 'texto antiguo', source: hashOf('Old English'), status: 'machine' };
    const xml = toXliff(units, c);
    expect(xml).toContain('stale');
    expect(xml).toContain('previous-translation');
    expect(xml).toContain('texto antiguo');
  });
});

describe('the committed Spanish catalog', () => {
  it('is complete and current against the generated English', async () => {
    const { readFileSync } = await import('node:fs');
    const { paths } = await import('../src/cli.ts');
    const cat = JSON.parse(readFileSync(paths.catalog('es'), 'utf8')) as Catalog;
    const s = statusOf(extractUnits(), cat);
    expect(s.missing).toEqual([]);
    expect(s.stale).toEqual([]);
    expect(s.orphans).toEqual([]);
  });
});
