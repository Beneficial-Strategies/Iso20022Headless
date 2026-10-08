import file from './pt.catalog.json' with { type: 'json' };
import { fromCatalogFile, type CatalogFile } from './from-catalog.ts';

/** Portuguese spec text (labels, definitions, code names, rules). Machine-drafted until marked reviewed. */
export default fromCatalogFile(file as CatalogFile);
