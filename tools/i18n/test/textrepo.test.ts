import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { KINDS, buildSource } from '../src/textrepo.ts';

/**
 * The text repository of a language (proof of concept; en-US first): its source view, its seed, and the tools that keep it. The tools
 * run as the people who own the language run them, as commands on a directory.
 */
const run = (repo: string, ...args: string[]): { out: string; code: number } => {
  try {
    const out = execFileSync('node', ['--experimental-transform-types', 'src/textrepo.ts', ...args, '--repo', repo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { out: err.stdout ?? '', code: err.status ?? 1 };
  }
};

describe('the source view', () => {
  const source = buildSource();
  it('gives every text a note saying what it is, and one label per element name', () => {
    for (const k of KINDS) for (const [key, e] of Object.entries(source[k]).slice(0, 200)) expect(e.note, `${k}/${key}`).toMatch(/\w/);
    expect(Object.keys(source.labels)).toHaveLength(4107);
    expect(source.labels.GroupHeader).toMatchObject({ text: 'Group Header' });
    expect(source.labels.GroupHeader!.note).toMatch(/XML tag GrpHdr.*used in \d+ types/);
    expect(source.members['PostalAddress27/PostCode']!.note).toMatch(/PostCode.*PostalAddress27/);
  });
});

describe('an en-US repository', () => {
  const repo = mkdtempSync(join(tmpdir(), 'text-en-US-'));
  it('is seeded with what the library does today, only where US differs, and element names inside prose are left alone', () => {
    expect(run(repo, 'init', '--lang', 'en-US').code).toBe(0);
    const labels = JSON.parse(readFileSync(join(repo, 'labels.json'), 'utf8')) as Record<string, string>;
    expect(labels.PostCode).toBe('Postal Code');
    expect(labels.GroupHeader).toBeUndefined(); // the same as the English: not written
    const rules = JSON.parse(readFileSync(join(repo, 'rules.json'), 'utf8')) as Record<string, string>;
    expect(rules['PaymentInstruction51/ChequeInstructionRule']).toMatch(/\(Check\).*CreditTransferTransactionInformation\/ChequeInstruction/);
    const status = run(repo, 'status');
    expect(status.out).toMatch(/\d+ entries, 0 reviewed, 0 stale, 0 orphaned, 0 identical/);
    expect(run(repo, 'check').code).toBe(0);
  }, 120_000);

  it('add copies the English in to edit, and records the English it was written against', () => {
    const r = run(repo, 'add', '--kind', 'labels', '--key', 'GroupHeader');
    expect(r.out).toMatch(/English: Group Header[\s\S]*GrpHdr/);
    const labels = JSON.parse(readFileSync(join(repo, 'labels.json'), 'utf8')) as Record<string, string>;
    expect(labels.GroupHeader).toBe('Group Header');
    expect(run(repo, 'status').out).toMatch(/1 identical to the English/);
  }, 60_000);

  it('check refuses a key that is not in the English and an entry that loses an element name; status says what is stale', () => {
    const file = join(repo, 'labels.json');
    const labels = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    labels.NoSuchElement = 'Nothing';
    writeFileSync(file, JSON.stringify(labels, null, 1));
    const orphan = run(repo, 'check');
    expect(orphan.code).toBe(1);
    expect(orphan.out).toMatch(/labels\/NoSuchElement: not in the English source/);
    delete labels.NoSuchElement;
    writeFileSync(file, JSON.stringify(labels, null, 1));

    const rulesFile = join(repo, 'rules.json');
    const rules = JSON.parse(readFileSync(rulesFile, 'utf8')) as Record<string, string>;
    rules['PaymentInstruction51/ChequeInstructionRule'] = rules['PaymentInstruction51/ChequeInstructionRule']!.replace('ChequeInstruction', 'CheckInstruction');
    writeFileSync(rulesFile, JSON.stringify(rules, null, 1));
    expect(run(repo, 'check').out).toMatch(/error: rules\/PaymentInstruction51\/ChequeInstructionRule: not preserved: ChequeInstruction/);

    const lockFile = join(repo, 'text.lock.json');
    const lock = JSON.parse(readFileSync(lockFile, 'utf8')) as Record<string, string>;
    lock['labels/PostCode'] = 'old-english';
    writeFileSync(lockFile, JSON.stringify(lock));
    expect(run(repo, 'status').out).toMatch(/stale[\s\S]*labels\/PostCode/);
  }, 120_000);
});
