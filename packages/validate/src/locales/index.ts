import type { DefinitionCatalog } from '../definitions.ts';

/**
 * Translation catalogs for spec text, loaded on demand so a language costs nothing until it is used.
 *   const catalog = await loadDefinitionCatalog('es');   // undefined when no catalog is shipped
 */
const loaders: Record<string, () => Promise<DefinitionCatalog>> = {
  es: () => import('./es.ts').then((m) => m.default),
  fr: () => import('./fr.ts').then((m) => m.default),
  de: () => import('./de.ts').then((m) => m.default),
  pt: () => import('./pt.ts').then((m) => m.default),
};

export const shippedDefinitionLocales: readonly string[] = Object.keys(loaders);

export async function loadDefinitionCatalog(locale: string): Promise<DefinitionCatalog | undefined> {
  const load = loaders[locale] ?? loaders[locale.split('-')[0] ?? ''];
  return load ? load() : undefined;
}
