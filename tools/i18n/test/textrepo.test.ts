import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { writeSourceArtifact } from '../src/sourceArtifact.ts';
import { readArtifact, type Artifact } from '../src/textrepoLib.ts';

/**
 * The source artifact the library publishes, and the language repository tools that read only it. The tools run as the people who own a
 * language run them: commands on a directory.
 */
const run = (script: string, ...args: string[]): { out: string; code: number } => {
  try {
    return { out: execFileSync('node', ['--experimental-transform-types', '--no-warnings', `src/${script}.ts`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { out: err.stdout ?? '', code: err.status ?? 1 };
  }
};
const json = <T,>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

const work = mkdtempSync(join(tmpdir(), 'text-tools-'));
const artifactDir = join(work, 'source-artifact');
const repo = join(work, 'text-en-US');
let art: Artifact;

beforeAll(async () => {
  await writeSourceArtifact(artifactDir);
  art = readArtifact(artifactDir);
}, 120_000);

describe('the source artifact', () => {
  it('says where each type belongs, which types each message uses, and gives every text a note', () => {
    expect(art.manifest.areas).toContain('shared');
    expect(art.manifest.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(art.placement.PostalAddress27).toBe('shared'); // used by pain, pacs and camt
    expect(art.placement.CustomerCreditTransferInitiationV13).toBe('pain');
    expect(Object.keys(art.messages)).toHaveLength(363);
    expect(art.messages['pain.001.001.13']).toMatchObject({ area: 'pain' });
    expect(art.messages['pain.001.001.13']!.types).toContain('PostalAddress27');
    expect(Object.keys(art.source.labels)).toHaveLength(4107);
    expect(art.source.labels.GroupHeader!.note).toMatch(/XML tag GrpHdr.*used in \d+ types/);
    expect(art.source.members['PostalAddress27/PostCode']!.note).toMatch(/PostCode.*PostalAddress27/);
    for (const k of ['types', 'members', 'codes', 'rules'] as const) for (const [key, e] of Object.entries(art.source[k]).slice(0, 300)) expect(e.note, `${k}/${key}`).toMatch(/\w/);
  });

  it('is deterministic: the same library gives the same hash', async () => {
    const again = join(work, 'again');
    await writeSourceArtifact(again);
    expect(readArtifact(again).manifest.sourceHash).toBe(art.manifest.sourceHash);
  }, 120_000);
});

describe('the language tools use only the artifact', () => {
  it('import nothing from the library', () => {
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const m of readFileSync(join(import.meta.dirname, '../src', file), 'utf8').matchAll(/from '(\.[^']+)'/g)) {
        expect(m[1], `${file} imports ${m[1]}`).not.toMatch(/packages\/|generated/);
        walk(m[1]!.replace(/^\.\//, ''));
      }
    };
    walk('textrepo.ts');
    expect([...seen].sort()).toEqual(['catalog.ts', 'packFormat.ts', 'textrepo.ts', 'textrepoLib.ts', 'validate.ts']);
  });
});

describe('an en-US repository', () => {
  it('is seeded only where US differs, in area folders, with element names inside prose left alone', () => {
    expect(run('textseed', '--lang', 'en-US', '--source', artifactDir, '--repo', repo).code).toBe(0);
    expect(json<Record<string, string>>(join(repo, 'labels.json')).PostCode).toBe('Postal Code');
    expect(json<Record<string, string>>(join(repo, 'labels.json')).GroupHeader).toBeUndefined();
    const rules = json<Record<string, string>>(join(repo, 'areas/pain/rules.json'));
    expect(rules['PaymentInstruction51/ChequeInstructionRule']).toMatch(/\(Check\).*CreditTransferTransactionInformation\/ChequeInstruction/);
    expect(existsSync(join(repo, 'areas/shared/members.json'))).toBe(true);
    // a repository says what it is: free, as is, MIT, with the controls lax for now
    expect(readFileSync(join(repo, 'LICENSE'), 'utf8')).toMatch(/THE SOFTWARE IS PROVIDED "AS IS"/);
    expect(readFileSync(join(repo, 'README.md'), 'utf8')).toMatch(/free of charge and as is[\s\S]*controls here are lax at present[\s\S]*adoption\s+and sponsorship/);
  }, 120_000);

  it('works from a copy of the artifact in source/: status and check', () => {
    expect(run('textrepo', 'sync', '--repo', repo, '--from', artifactDir).code).toBe(0);
    expect(existsSync(join(repo, 'source/manifest.json'))).toBe(true);
    expect(run('textrepo', 'status', '--repo', repo).out).toMatch(/\d+ entries, 0 reviewed, 0 stale, 0 orphaned, 0 misplaced, 0 identical/);
    expect(run('textrepo', 'check', '--repo', repo).code).toBe(0);
  }, 120_000);

  it('add puts the English in the area the placement table names, and records the English it was written against', () => {
    const r = run('textrepo', 'add', '--repo', repo, '--kind', 'members', '--key', 'PaymentTypeInformation28/ServiceLevel');
    expect(r.out).toMatch(/added to areas\/shared\/members\.json/);
    expect(json<Record<string, string>>(join(repo, 'areas/shared/members.json'))['PaymentTypeInformation28/ServiceLevel']).toMatch(/Agreement under which/);
    expect(json<Record<string, string>>(join(repo, 'areas/shared/text.lock.json'))['members/PaymentTypeInformation28/ServiceLevel']).toMatch(/\w/); // the lock sits beside the entries
    const label = run('textrepo', 'add', '--repo', repo, '--kind', 'labels', '--key', 'GroupHeader');
    expect(label.out).toMatch(/added to labels\.json/);
  }, 60_000);

  it('check refuses an orphan, a misplaced entry and an entry that loses an element name; status says what is stale', () => {
    const labelsFile = join(repo, 'labels.json');
    const labels = json<Record<string, string>>(labelsFile);
    writeFileSync(labelsFile, JSON.stringify({ ...labels, NoSuchElement: 'Nothing' }));
    expect(run('textrepo', 'check', '--repo', repo)).toMatchObject({ code: 1 });
    expect(run('textrepo', 'check', '--repo', repo).out).toMatch(/labels\/NoSuchElement: not in the English source/);
    writeFileSync(labelsFile, JSON.stringify(labels));

    // a pain entry written in the camt folder
    const camtFile = join(repo, 'areas/camt/members.json');
    const painFile = join(repo, 'areas/pain/members.json');
    const pain = json<Record<string, string>>(painFile);
    const key = Object.keys(pain)[0]!;
    // twice (a copy left behind) is an error of its own
    writeFileSync(camtFile, JSON.stringify({ ...(existsSync(camtFile) ? json<Record<string, string>>(camtFile) : {}), [key]: pain[key] }));
    expect(run('textrepo', 'check', '--repo', repo).out).toMatch(/is in both camt and pain/);
    const moved = { ...pain };
    delete moved[key];
    writeFileSync(painFile, JSON.stringify(moved));
    expect(run('textrepo', 'check', '--repo', repo).out).toMatch(new RegExp(`error: members/${key.replace('/', '\\/')} is in camt but belongs in pain`));
    run('textrepo', 'sync', '--repo', repo, '--from', artifactDir); // sync puts it where it belongs
    expect(run('textrepo', 'check', '--repo', repo).code).toBe(0);

    const rulesFile = join(repo, 'areas/pain/rules.json');
    const rules = json<Record<string, string>>(rulesFile);
    rules['PaymentInstruction51/ChequeInstructionRule'] = rules['PaymentInstruction51/ChequeInstructionRule']!.replace('ChequeInstruction', 'CheckInstruction');
    writeFileSync(rulesFile, JSON.stringify(rules));
    expect(run('textrepo', 'check', '--repo', repo).out).toMatch(/error: rules\/PaymentInstruction51\/ChequeInstructionRule: not preserved: ChequeInstruction/);

    const lockFile = join(repo, 'text.lock.json');
    writeFileSync(lockFile, JSON.stringify({ ...json<Record<string, string>>(lockFile), 'labels/PostCode': 'old-english' }));
    expect(run('textrepo', 'status', '--repo', repo).out).toMatch(/stale[\s\S]*labels\/PostCode/);
  }, 120_000);

  it('build writes the files a host serves: the labels, and for a message the entries of the types it uses', () => {
    const out = join(work, 'host');
    expect(run('textrepo', 'build', '--repo', repo, '--out', out, '--messages', 'pain.001.001.13').code).toBe(0);
    expect(json<{ labels: Record<string, string> }>(join(out, 'v1/en-US/labels.json')).labels.PostCode).toBe('Postal Code');
    const m = json<{ members: Record<string, string>; codeNames: Record<string, string> }>(join(out, 'v1/en-US/messages/pain.001.001.13.json'));
    expect(m.members['CreditTransferTransaction76/ChequeInstruction']).toMatch(/check/);
    expect(Object.keys(m.members).length).toBeGreaterThan(10);
    expect(m.codeNames['AddressType2Code/BIZZ'] ?? Object.values(m.codeNames)[0]).toBeTruthy();
  }, 60_000);
});

describe('a translated repository seeded from a catalog', () => {
  it('matches each name to the entries of its elements, takes the most common label (a reviewed one first) and the hash the translation was made against', async () => {
    const { allTypeDescriptors } = await import('../../../packages/validate/src/generated/all.ts');
    const ids = Object.values(allTypeDescriptors).flatMap((t) => (t.fields ?? []).filter((f) => f.name === 'GroupHeader' && f.isoId).map((f) => f.isoId!));
    expect(ids.length).toBeGreaterThan(3);
    const post = Object.values(allTypeDescriptors).flatMap((t) => (t.fields ?? []).filter((f) => f.name === 'PostCode' && f.isoId).map((f) => f.isoId!));
    const entries: Record<string, unknown> = {};
    ids.forEach((id, i) => (entries[`label:${id}`] = { text: i === 0 ? 'Autre' : 'En-tête de groupe', source: 'aaaaaaaaaaaa', status: 'machine' }));
    post.forEach((id, i) => (entries[`label:${id}`] = { text: i === 0 ? 'Code postal (revu)' : 'Code postal', source: 'bbbbbbbbbbbb', status: i === 0 ? 'reviewed' : 'machine' }));
    const memberType = Object.values(allTypeDescriptors).find((t) => t.name === 'PostalAddress27')!;
    const postField = memberType.fields!.find((f) => f.name === 'PostCode')!;
    entries[`field:${postField.isoId}`] = { text: 'Identifiant postal.', source: 'cccccccccccc', status: 'machine' };
    const catalog = join(work, 'mini.catalog.json');
    writeFileSync(catalog, JSON.stringify({ locale: 'fr', entries }));
    const frRepo = join(work, 'text-fr');
    expect(run('textseed', '--lang', 'fr', '--source', artifactDir, '--repo', frRepo, '--catalog', catalog).code).toBe(0);
    const labels = json<Record<string, string>>(join(frRepo, 'labels.json'));
    expect(labels.GroupHeader).toBe('En-tête de groupe'); // most common
    expect(labels.PostCode).toBe('Code postal (revu)'); // a reviewed translation comes first
    expect(json<Record<string, string>>(join(frRepo, 'areas/shared/members.json'))['PostalAddress27/PostCode']).toBe('Identifiant postal.');
    expect(json<Record<string, string>>(join(frRepo, 'areas/shared/text.lock.json'))['members/PostalAddress27/PostCode']).toBe('cccccccccccc');
    expect(json<string[]>(join(frRepo, 'reviewed.json'))).toEqual(['labels/PostCode']);
    expect(json<Record<string, { chosen: string }>>(join(frRepo, 'review/label-conflicts.json')).GroupHeader!.chosen).toBe('En-tête de groupe');
    expect(json<{ kind: string }>(join(frRepo, 'text.config.json')).kind).toBe('translation');
    // an entry the catalog lacks is simply not written: it shows the English
    expect(Object.keys(labels)).toHaveLength(2);
  }, 120_000);
});
