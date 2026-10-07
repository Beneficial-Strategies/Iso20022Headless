import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export type AppName = 'demo-form' | 'demo-zod' | 'quickstart-react' | 'quickstart-tailwind';

export interface Running {
  name: string;
  url: string;
  close: () => Promise<void>;
}

/** Start an app's own Vite dev server on a free port. No manual `pnpm dev` needed. */
export async function startApp(name: AppName, port: number): Promise<Running> {
  // the checks must not depend on the network: the dev server's fetching of ISO's schemas is off (the page then behaves like a deployed one)
  process.env.VITE_XSD_PROXY = 'off';
  const server: ViteDevServer = await createServer({
    root: resolve(root, 'apps', name),
    logLevel: 'error',
    clearScreen: false,
    server: { port, strictPort: false, host: '127.0.0.1' },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0] ?? `http://127.0.0.1:${port}/`;
  return { name, url, close: () => server.close() };
}
