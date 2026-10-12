/**
 * Text packs (proof of concept): turn the translation catalogs into the static files a text host serves.
 *
 *   node src/packs.ts build --out <dir> --langs fr,de --messages pain.001.001.13,pain.002.001.15,head.001.001.04
 *   node src/packs.ts serve --dir <dir> [--port 5200]
 *
 * Layout (see packages/validate/src/text-pack.ts): `<dir>/v1/<lang>/labels.json` and `<dir>/v1/<lang>/messages/<identifier>.json`.
 * Labels are keyed by element NAME, so a field has one label in a language wherever it appears. The catalogs hold one label per element
 * id, and the same name can have several translations there (machine drift); the pack takes the reviewed one, else the most common,
 * and `labels.conflicts.json` lists every name that had more than one so that a reviewer can settle it.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, normalize, resolve } from 'node:path';
import { labelsFor, loadCatalog, messagePack } from './packsLib.ts';

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function build(): Promise<void> {
  const out = arg('--out');
  const langs = (arg('--langs') ?? 'fr,de').split(',');
  const messages = (arg('--messages') ?? 'pain.001.001.13,pain.002.001.15,head.001.001.04').split(',');
  if (!out) throw new Error('usage: packs.ts build --out <dir> [--langs fr,de] [--messages id,id]');
  for (const lang of langs) {
    const cat = loadCatalog(lang);
    const dir = join(out, 'v1', lang);
    mkdirSync(join(dir, 'messages'), { recursive: true });
    const { labels, conflicts } = labelsFor(cat, lang);
    const write = (file: string, data: unknown): void => {
      const text = JSON.stringify(data);
      writeFileSync(join(dir, file), text);
      console.log(`${lang}/${file}: ${(text.length / 1024).toFixed(0)} KB, ${(gzipSync(text).length / 1024).toFixed(0)} KB gzipped`);
    };
    write('labels.json', labels);
    writeFileSync(join(dir, 'labels.conflicts.json'), JSON.stringify(conflicts, null, 1));
    console.log(`${lang}: ${Object.keys(labels.labels).length} names, ${Object.keys(conflicts).length} with more than one translation in the catalog`);
    for (const id of messages) write(`messages/${id}.json`, await messagePack(cat, lang, id));
    write('manifest.json', { schema: 1, lang, source: 'ISO 20022 repository, snapshot 2026-09-04', pack: 'proof-of-concept', labels: 'labels.json', messages: Object.fromEntries(messages.map((m) => [m, `messages/${m}.json`])) });
  }
}

/** A text host for development: static files, any origin may read them (as a real host would allow). */
function serve(): void {
  const dir = resolve(arg('--dir') ?? '.');
  const port = Number(arg('--port') ?? 5200);
  createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!));
    const file = join(dir, path);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=60');
    createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`text host on http://localhost:${port}/ serving ${dir}`));
}

const cmd = process.argv[2];
if (cmd === 'build') await build();
else if (cmd === 'serve') serve();
else console.error('usage: packs.ts <build|serve> ...');
