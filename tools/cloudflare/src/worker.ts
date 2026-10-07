import { USER_AGENT, handleXsdRequest } from './xsd-proxy.ts';

/** The parts of Cloudflare's runtime this file uses (no dependency on its type package). */
interface Assets {
  fetch: (request: Request) => Promise<Response>;
}
interface WorkerEnv {
  ASSETS: Assets;
}
interface WorkerContext {
  waitUntil: (promise: Promise<unknown>) => void;
}
declare const caches: { default: { match: (key: Request) => Promise<Response | undefined>; put: (key: Request, response: Response) => Promise<void> } };

export default {
  /**
   * `/iso20022-xsd/...` is the schema pass-through (wrangler.jsonc sends only those requests here first); everything
   * else is the built site, served from the assets.
   */
  async fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
    const answer = await handleXsdRequest(request, {
      fetchUpstream: (url) => fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml, text/xml, */*' } }),
      cache: {
        match: (key) => caches.default.match(new Request(key)),
        put: (key, response) => {
          ctx.waitUntil(caches.default.put(new Request(key), response));
          return Promise.resolve();
        },
      },
    });
    return answer ?? env.ASSETS.fetch(request);
  },
};
