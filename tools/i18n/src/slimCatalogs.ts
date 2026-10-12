/**
 * A build step for the sites: what the browser needs from a translation catalog is each entry's text and review status. The source
 * hash, author and date are bookkeeping for the translation workflow (tools/i18n) and about half of the file. The catalog files
 * in the repository keep them; the built page does not.
 */
export function slimCatalog(json: string): string {
  const file = JSON.parse(json) as { locale: string; message: string; entries: Record<string, { text: string; status: string }> };
  const entries: Record<string, { text: string; status: string }> = {};
  for (const [key, e] of Object.entries(file.entries)) entries[key] = { text: e.text, status: e.status };
  return JSON.stringify({ locale: file.locale, message: file.message, entries });
}

/** A Vite plugin applying slimCatalog to every `<language>.catalog.json` the build imports. */
export function slimCatalogs() {
  return {
    name: 'slim-catalogs',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!/\.catalog\.json(\?|$)/.test(id)) return null;
      return { code: slimCatalog(code), map: null };
    },
  };
}
