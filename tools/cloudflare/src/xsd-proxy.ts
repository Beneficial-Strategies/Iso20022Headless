/**
 * Passing ISO's XSD schemas through to the page.
 *
 * ISO publishes the schema of every message at a fixed address but sends no cross-origin permission, so a page on another
 * site cannot read it. This answers `/iso20022-xsd/<area>/schemas/<identifier>.xsd` on the page's own site by fetching that
 * file from ISO, once per day per file (the rest from Cloudflare's cache). It is not an open proxy: only that exact shape of
 * path, only GET and HEAD, only ISO's host, and only an answer that is an XML Schema.
 */

export const PREFIX = '/iso20022-xsd/';
const ISO_BASE = 'https://www.iso20022.org/sites/default/files/documents/messages/';
/** `<area>/schemas/<identifier>.xsd`: four letters, then area.functionality.flavour.version, like pain/schemas/pain.001.001.13.xsd */
const PATH = /^([a-z]{4})\/schemas\/(\1\.\d{3}\.\d{3}\.\d{2})\.xsd$/;
/** The largest schema accepted (ISO's biggest are around 2 MB). */
export const MAX_BYTES = 8 * 1024 * 1024;
export const USER_AGENT = 'Iso20022Explorer (+https://github.com/Beneficial-Strategies/Iso20022Headless; schema pass-through for a web page)';

/** ISO's address for a request path, or undefined when the path is not exactly a schema's. */
export function upstreamUrl(pathname: string): string | undefined {
  if (!pathname.startsWith(PREFIX)) return undefined;
  const m = PATH.exec(pathname.slice(PREFIX.length));
  return m ? `${ISO_BASE}${m[1]}/schemas/${m[2]}.xsd` : undefined;
}

/** Whether text is an XML Schema document (not, say, a bot-protection page that answers 200). */
export const looksLikeSchema = (text: string): boolean => /<(?:[\w.-]+:)?schema\b[^>]*XMLSchema/.test(text.slice(0, 4096));

/** What the proxy needs from its surroundings, so that it can be tested without a network or a cache. */
export interface Env {
  fetchUpstream: (url: string) => Promise<Response>;
  cache?: { match: (key: string) => Promise<Response | undefined>; put: (key: string, response: Response) => Promise<void> };
}

const fail = (status: number, message: string): Response =>
  new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** The schema, or why not. `undefined` means the request is not for a schema at all (the caller serves the site instead). */
export async function handleXsdRequest(request: Request, env: Env): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Only GET and HEAD.');
  const upstream = upstreamUrl(url.pathname);
  if (!upstream) return fail(404, 'Not a schema address.');

  const key = upstream; // the cache is keyed by ISO's address: the same file whoever asks and however it was spelled
  const cached = await env.cache?.match(key);
  if (cached) return request.method === 'HEAD' ? new Response(null, cached) : cached;

  let answer: Response;
  try {
    answer = await env.fetchUpstream(upstream);
  } catch {
    return fail(502, 'ISO\'s server could not be reached.');
  }
  if (answer.status === 404) return fail(404, 'ISO publishes no schema at that address.');
  if (!answer.ok) return fail(502, `ISO's server answered ${answer.status}.`);
  const declared = Number(answer.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return fail(502, 'The schema is larger than expected.');
  const body = await answer.text();
  if (body.length > MAX_BYTES) return fail(502, 'The schema is larger than expected.');
  if (!looksLikeSchema(body)) return fail(502, 'ISO\'s server did not answer with an XML Schema.');

  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // the browser may keep it for an hour, Cloudflare's cache for a day
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Content-Type-Options': 'nosniff',
      'X-Schema-Source': upstream,
    },
  });
  await env.cache?.put(key, response.clone());
  return request.method === 'HEAD' ? new Response(null, response) : response;
}
