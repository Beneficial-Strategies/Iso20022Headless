/**
 * The values of ISO's external code sets (purpose codes, clearing systems, ...): the repository lists them as ordinary codes of the set
 * (with ids, names and definitions), in the order the publisher declares them, but they belong to no message's fixtures because the
 * model treats the set as "external" (an outside body maintains the values). This writes them to one shared directory,
 * `fixtures/external-codes/`, that the generator reads for every external code set that has values.
 *
 *   spec-extract external-codes --pages <dir of saved resource pages (needs the CodeSet kind)> [--fixtures <dir>]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadResources } from './resources.ts';

const tsv = (cols: (string | number | undefined)[]): string => cols.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t');

/** The external code sets some message uses: the ones whose codesets.tsv in a message's fixtures holds the "external" marker row. */
function usedExternalSets(fixtures: string): Set<string> {
  const used = new Set<string>();
  for (const d of readdirSync(fixtures)) {
    const file = join(fixtures, d, 'codesets.tsv');
    if (d === 'external-codes' || !existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const c = line.split('\t');
      if (c[3] === '*EXTERNAL*') used.add(c[0]!);
    }
  }
  return used;
}

export function writeExternalCodes(pages: string, fixtures: string): { written: string[]; withoutValues: string[]; duplicates: string[] } {
  const { codeSets } = loadResources(pages);
  const used = usedExternalSets(fixtures);
  const dir = join(fixtures, 'external-codes');
  mkdirSync(dir, { recursive: true });
  const sets: string[] = [tsv(['codeSetName', 'isoId', 'restrictionOf', 'code', 'enumName'])];
  const defs: string[] = [tsv(['codeSet', 'code', 'enumName', 'isoId', 'text'])];
  const written: string[] = [];
  const withoutValues: string[] = [];
  const duplicates: string[] = [];
  for (const c of [...codeSets.values()].filter((x) => x.isExternal && used.has(x.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    if (c.codes.length === 0) {
      withoutValues.push(c.name);
      continue;
    }
    // a value is one option however often the repository lists it (ExternalLocalInstrument1Code has CTP twice, with two meanings): the first stays
    const seen = new Set<string>();
    const codes = c.codes.filter((k) => {
      if (seen.has(k.value)) {
        duplicates.push(`${c.name}.${k.value}`);
        return false;
      }
      seen.add(k.value);
      return true;
    });
    for (const k of codes) {
      sets.push(tsv([c.name, c.isoId, c.restrictionOf ?? '', k.value, k.name]));
      defs.push(tsv([c.name, k.value, k.name, k.isoId, k.definition]));
    }
    written.push(c.name);
  }
  writeFileSync(join(dir, 'codesets.tsv'), sets.join('\n') + '\n');
  writeFileSync(join(dir, 'codedefs.tsv'), defs.join('\n') + '\n');
  return { written, withoutValues, duplicates };
}
