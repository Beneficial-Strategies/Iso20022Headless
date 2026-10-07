import { describe, expect, it } from 'vitest';
import { MAX_BYTES, PREFIX, handleXsdRequest, looksLikeSchema, upstreamUrl, type Env } from '../src/xsd-proxy.ts';

const SCHEMA = '<?xml version="1.0"?>\n<xs:schema xmlns="urn:x" xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:x"/>';
const ISO = 'https://www.iso20022.org/sites/default/files/documents/messages/pain/schemas/pain.001.001.13.xsd';
const req = (path: string, method = 'GET') => new Request(`https://explorer.example${path}`, { method });
const memoryCache = () => {
  const store = new Map<string, Response>();
  return { store, cache: { match: async (k: string) => store.get(k)?.clone(), put: async (k: string, r: Response) => void store.set(k, r) } };
};
const env = (answer: () => Response | Promise<Response>, calls: string[] = []): Env => ({ fetchUpstream: async (u) => (calls.push(u), answer()) });

describe('upstreamUrl: only schema addresses, only ISO', () => {
  it('maps the page\'s path to ISO\'s address', () => {
    expect(upstreamUrl('/iso20022-xsd/pain/schemas/pain.001.001.13.xsd')).toBe(ISO);
    expect(upstreamUrl('/iso20022-xsd/caam/schemas/caam.001.001.05.xsd')).toBe('https://www.iso20022.org/sites/default/files/documents/messages/caam/schemas/caam.001.001.05.xsd');
  });

  it('refuses everything else: other shapes, other hosts, traversal, mismatched areas', () => {
    for (const p of [
      '/', '/form/', '/iso20022-xsd/', '/iso20022-xsd/pain/schemas/', '/iso20022-xsd/pain/schemas/pain.001.001.13.xml',
      '/iso20022-xsd/pain/schemas/pacs.001.001.13.xsd', // the identifier must belong to the area
      '/iso20022-xsd/../secret', '/iso20022-xsd/pain/schemas/../../x.xsd', '/iso20022-xsd/pain/schemas/pain.001.001.13.xsd/extra',
      '/iso20022-xsd/https://evil.example/x.xsd', '/iso20022-xsd//evil.example/pain/schemas/pain.001.001.13.xsd',
      '/iso20022-xsd/PAIN/schemas/PAIN.001.001.13.xsd', '/iso20022-xsd/pain/schemas/pain.1.1.13.xsd', '/iso20022-xsd/pain/schemas/pain.001.001.13.xsd?x=1#y%2f',
    ]) {
      expect(upstreamUrl(p), p).toBeUndefined();
    }
  });
});

describe('looksLikeSchema', () => {
  it('accepts an XML Schema, with any prefix, and rejects an HTML page that answered 200', () => {
    expect(looksLikeSchema(SCHEMA)).toBe(true);
    expect(looksLikeSchema('<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema"/>')).toBe(true);
    expect(looksLikeSchema('<html><body>Access Denied</body></html>')).toBe(false);
    expect(looksLikeSchema('')).toBe(false);
  });
});

describe('handleXsdRequest', () => {
  it('leaves requests that are not for a schema to the site (undefined)', async () => {
    expect(await handleXsdRequest(req('/form/'), env(() => new Response(SCHEMA)))).toBeUndefined();
    expect(await handleXsdRequest(req('/assets/index.js'), env(() => new Response(SCHEMA)))).toBeUndefined();
  });

  it('answers a schema request with ISO\'s file, as XML, with cache headers, fetching ISO\'s address only', async () => {
    const calls: string[] = [];
    const r = (await handleXsdRequest(req(`${PREFIX}pain/schemas/pain.001.001.13.xsd`), env(() => new Response(SCHEMA), calls)))!;
    expect(calls).toEqual([ISO]);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(r.headers.get('cache-control')).toContain('s-maxage=86400');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await r.text()).toBe(SCHEMA);
  });

  it('keeps the answer: the second request for the same file does not go to ISO', async () => {
    const calls: string[] = [];
    const { cache } = memoryCache();
    const e = { ...env(() => new Response(SCHEMA), calls), cache };
    await handleXsdRequest(req(`${PREFIX}pain/schemas/pain.001.001.13.xsd`), e);
    const again = (await handleXsdRequest(req(`${PREFIX}pain/schemas/pain.001.001.13.xsd`), e))!;
    expect(calls).toHaveLength(1);
    expect(await again.text()).toBe(SCHEMA);
  });

  it('does not keep a failure or a non-schema', async () => {
    const { store, cache } = memoryCache();
    await handleXsdRequest(req(`${PREFIX}pain/schemas/pain.001.001.13.xsd`), { ...env(() => new Response('Access Denied', { status: 403 })), cache });
    await handleXsdRequest(req(`${PREFIX}pain/schemas/pain.001.001.13.xsd`), { ...env(() => new Response('<html/>')), cache });
    expect(store.size).toBe(0);
  });

  it('says 404 when ISO has no such file, and 502 for everything else that goes wrong', async () => {
    const path = `${PREFIX}pain/schemas/pain.999.001.01.xsd`;
    expect((await handleXsdRequest(req(path), env(() => new Response('', { status: 404 }))))!.status).toBe(404);
    expect((await handleXsdRequest(req(path), env(() => new Response('', { status: 403 }))))!.status).toBe(502); // bot protection, say
    expect((await handleXsdRequest(req(path), env(() => new Response('', { status: 500 }))))!.status).toBe(502);
    expect((await handleXsdRequest(req(path), env(() => { throw new Error('network'); })))!.status).toBe(502);
    expect((await handleXsdRequest(req(path), env(() => new Response('<html>blocked</html>'))))!.status).toBe(502); // 200, but not a schema
  });

  it('refuses a file that is too large, declared or not', async () => {
    const path = `${PREFIX}pain/schemas/pain.001.001.13.xsd`;
    const declared = () => new Response(SCHEMA, { headers: { 'content-length': String(MAX_BYTES + 1) } });
    expect((await handleXsdRequest(req(path), env(declared)))!.status).toBe(502);
    expect((await handleXsdRequest(req(path), env(() => new Response(SCHEMA + ' '.repeat(MAX_BYTES)))))!.status).toBe(502);
  });

  it('allows only GET and HEAD; HEAD has no body', async () => {
    const path = `${PREFIX}pain/schemas/pain.001.001.13.xsd`;
    expect((await handleXsdRequest(req(path, 'POST'), env(() => new Response(SCHEMA))))!.status).toBe(405);
    expect((await handleXsdRequest(req(path, 'DELETE'), env(() => new Response(SCHEMA))))!.status).toBe(405);
    const head = (await handleXsdRequest(req(path, 'HEAD'), env(() => new Response(SCHEMA))))!;
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('a malformed path under the prefix is a 404, not a fetch', async () => {
    const calls: string[] = [];
    const r = (await handleXsdRequest(req(`${PREFIX}anything/else`), env(() => new Response(SCHEMA), calls)))!;
    expect(r.status).toBe(404);
    expect(calls).toEqual([]);
  });
});
