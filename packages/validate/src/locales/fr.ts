import file from './fr.catalog.json' with { type: 'json' };
import { fromCatalogFile, type CatalogFile } from './from-catalog.ts';

/** French spec text (labels, definitions, code names, rules). Machine-drafted until marked reviewed. */
export default fromCatalogFile(file as CatalogFile);
