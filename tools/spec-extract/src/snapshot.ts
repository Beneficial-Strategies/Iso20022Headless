import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reader for the ISO 20022 MCP's `get_spec_snapshot` output (TSV, one record per line, `#` comments).
 * Save every page of every section to files (the MCP spills big results to a file) and point this at them.
 */

export interface Spec {
  /** MSGDEF by isoId. */
  messages: Map<string, { name: string; isoId: string; area: string; status: string; definition: string }>;
  /** MSGBLOCK rows by message NAME (names are unique except for a few cross-area duplicates; look up by id via `blocksOf`). */
  blocks: Map<string, string[][]>;
  components: Map<string, { name: string; isoId: string; status: string; checksum: string; definition: string }>;
  /** MSGELEMENT rows by owning component name. */
  elements: Map<string, string[][]>;
  choices: Map<string, { name: string; isoId: string; status: string; checksum: string; definition: string }>;
  /** VARIANT rows by choice name. */
  variants: Map<string, string[][]>;
  amounts: Map<string, { name: string; isoId: string; status: string; checksum: string; definition: string }>;
  simpleTypes: Map<string, { name: string; isoId: string; definition: string }>;
  externalSchemas: Map<string, { name: string; isoId: string; definition: string }>;
  codeSets: Map<string, { name: string; isoId: string; definition: string }>;
  /** CODE rows by code set name: codeSet, codeIsoId, code, status, removalDate, definition. */
  codes: Map<string, string[][]>;
  /** FACET rows by type name: facet name to value (the spec's constraints, verbatim). Repeated facets are joined with ` || `. */
  facets: Map<string, Record<string, string>>;
  /** EXTCODE rows by external code set name: code and its definition. */
  externalCodes: Map<string, string[][]>;
  /** Which sections/pages were loaded, e.g. `components 3/8`. */
  loaded: string[];
  /** Problems found while reading (duplicate names, etc.). */
  warnings: string[];
}

const push = <V>(m: Map<string, V[]>, k: string, v: V): void => void (m.get(k)?.push(v) ?? m.set(k, [v]));

export function emptySpec(): Spec {
  return {
    messages: new Map(), blocks: new Map(), components: new Map(), elements: new Map(), choices: new Map(), variants: new Map(),
    amounts: new Map(), simpleTypes: new Map(), externalSchemas: new Map(), codeSets: new Map(), codes: new Map(), facets: new Map(), externalCodes: new Map(), loaded: [], warnings: [],
  };
}

export function addSnapshot(spec: Spec, text: string): void {
  const header = /^# Section: (\w+) \| Page (\d+) of (\d+)/m.exec(text);
  spec.loaded.push(header ? `${header[1]} ${header[2]}/${header[3]}` : 'unknown section');
  const unique = <V extends { name: string }>(m: Map<string, V>, v: V, what: string): void => {
    if (m.has(v.name)) spec.warnings.push(`duplicate ${what} name ${v.name}`);
    else m.set(v.name, v);
  };
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const c = line.split('\t');
    switch (c[0]) {
      case 'MSGDEF':
        spec.messages.set(c[2]!, { name: c[1]!, isoId: c[2]!, area: c[3]!, status: c[4]!, definition: c[7] ?? '' });
        break;
      case 'MSGBLOCK':
        push(spec.blocks, c[1]!, c.slice(1));
        break;
      case 'MSGCOMP':
        unique(spec.components, { name: c[1]!, isoId: c[2]!, status: c[3]!, checksum: c[5]!, definition: c[6] ?? '' }, 'component');
        break;
      case 'MSGELEMENT':
        push(spec.elements, c[1]!, c.slice(1));
        break;
      case 'CHOICE':
        unique(spec.choices, { name: c[1]!, isoId: c[2]!, status: c[3]!, checksum: c[5]!, definition: c[6] ?? '' }, 'choice');
        break;
      case 'VARIANT':
        push(spec.variants, c[1]!, c.slice(1));
        break;
      case 'AMOUNT':
        unique(spec.amounts, { name: c[1]!, isoId: c[2]!, status: c[3] ?? '', checksum: c[5] ?? '', definition: c[6] ?? '' }, 'amount');
        break;
      case 'SIMPLETYPE':
        unique(spec.simpleTypes, { name: c[1]!, isoId: c[2]!, definition: c[6] ?? '' }, 'simple type');
        break;
      case 'EXTSCHEMA':
        unique(spec.externalSchemas, { name: c[1]!, isoId: c[2]!, definition: c[6] ?? '' }, 'external schema');
        break;
      case 'CODESET':
        unique(spec.codeSets, { name: c[1]!, isoId: c[2]!, definition: c[6] ?? '' }, 'code set');
        break;
      case 'CODE':
        push(spec.codes, c[1]!, c.slice(1));
        break;
      case 'FACET': {
        const f = spec.facets.get(c[1]!) ?? {};
        const value = c.slice(3).join('\t');
        f[c[2]!] = c[2]! in f ? `${f[c[2]!]} || ${value}` : value;
        spec.facets.set(c[1]!, f);
        break;
      }
      case 'EXTCODE':
        push(spec.externalCodes, c[1]!, c.slice(2));
        break;
      default:
        break;
    }
  }
}

/** Load every `.txt` file in a directory whose first lines say it is a get_spec_snapshot section. */
export function loadSnapshots(dir: string): Spec {
  const spec = emptySpec();
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (!statSync(p).isFile() || !f.endsWith('.txt')) continue;
    const text = readFileSync(p, 'utf8');
    if (text.startsWith('# ISO 20022 Spec Snapshot')) addSnapshot(spec, text);
  }
  return spec;
}
