import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

export interface StaticSite {
  /** e.g. http://127.0.0.1:41234/Iso20022Headless/ */
  url: string;
  close: () => Promise<void>;
}

/**
 * Serve a directory under a URL prefix, the way GitHub Pages serves a project site
 * (https://<org>.github.io/<repo>/). Anything outside the prefix is a 404, as on Pages.
 */
export function serveStatic(dir: string, prefix: string): Promise<StaticSite> {
  const base = resolve(dir);
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    if (!path.startsWith(prefix)) {
      res.writeHead(404).end('not found');
      return;
    }
    let file = normalize(join(base, path.slice(prefix.length)));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      ok({ url: `http://127.0.0.1:${port}${prefix}`, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}
