import type { CatalogEntry, DefinitionCatalog } from '../definitions.ts';

/** The on-disk translation catalog (see tools/i18n): entries keyed `kind:isoId` with a review status. */
export interface CatalogFile {
  locale: string;
  message: string;
  entries: Record<string, { text: string; source: string; status: 'machine' | 'reviewed'; by?: string; date?: string }>;
}

const KIND_TO_MAP = {
  label: 'labels',
  field: 'fields',
  type: 'types',
  code: 'codes',
  codeName: 'codeNames',
  codeSet: 'codeSets',
  rule: 'rules',
} as const;

/** Turn a catalog file into the runtime shape, keeping each entry's review status. */
export function fromCatalogFile(file: CatalogFile): DefinitionCatalog {
  const out: Record<string, Record<string, CatalogEntry>> = {};
  for (const [key, e] of Object.entries(file.entries)) {
    const sep = key.indexOf(':');
    const map = KIND_TO_MAP[key.slice(0, sep) as keyof typeof KIND_TO_MAP];
    if (!map) continue;
    (out[map] ??= {})[key.slice(sep + 1)] = { text: e.text, status: e.status };
  }
  return out as DefinitionCatalog;
}
