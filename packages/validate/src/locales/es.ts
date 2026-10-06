import file from './es.catalog.json' with { type: 'json' };
import { fromCatalogFile, type CatalogFile } from './from-catalog.ts';

/** Spanish spec text (labels, definitions, code names, rules). Machine-drafted until marked reviewed. */
export default fromCatalogFile(file as CatalogFile);
