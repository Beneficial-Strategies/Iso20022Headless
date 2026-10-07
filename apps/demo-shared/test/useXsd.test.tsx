import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useXsd } from '../src/useXsd.ts';

const NS1 = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.13';
const NS2 = 'urn:iso:std:iso:20022:tech:xsd:pain.002.001.15';
const URL1 = 'https://example.test/pain.001.001.13.xsd';
const URL2 = 'https://example.test/pain.002.001.15.xsd';
const xsd = (ns: string) => `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="${ns}"/>`;
const m1 = { identifier: 'pain.001.001.13', xsdUrl: URL1, namespace: NS1 };
const m2 = { identifier: 'pain.002.001.15', xsdUrl: URL2, namespace: NS2 };
const ok = (text: string) => ({ ok: true, status: 200, text: async () => text }) as Response;
// jsdom's File has no text(); browsers do
const fileOf = (text: string, name = 'chosen.xsd') => ({ name, text: async () => text }) as unknown as File;

describe('useXsd', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('asks for the schema at the message\'s address, and is ready when it answers with that message\'s schema', async () => {
    fetchMock.mockResolvedValue(ok(xsd(NS1)));
    const { result } = renderHook(() => useXsd(m1));
    expect(result.current.state).toEqual({ status: 'loading', url: URL1 });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetchMock.mock.calls[0]![0]).toBe(URL1);
    expect(result.current.state).toMatchObject({ status: 'ready', url: URL1, source: 'url' });
  });

  it('is unavailable when the browser refuses the request (no cross-origin permission), or the answer is an error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const a = renderHook(() => useXsd(m1));
    await waitFor(() => expect(a.result.current.state).toEqual({ status: 'unavailable', url: URL1 }));
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'nope' } as Response);
    const b = renderHook(() => useXsd(m1));
    await waitFor(() => expect(b.result.current.state.status).toBe('unavailable'));
  });

  it('does not accept an answer that is not this message\'s schema', async () => {
    fetchMock.mockResolvedValue(ok(xsd(NS2)));
    const { result } = renderHook(() => useXsd(m1));
    await waitFor(() => expect(result.current.state.status).toBe('unavailable'));
    fetchMock.mockResolvedValue(ok('<html>sign in</html>'));
    const b = renderHook(() => useXsd(m1));
    await waitFor(() => expect(b.result.current.state.status).toBe('unavailable'));
  });

  it('waits for the message namespace, and does not ask for anything without a message', () => {
    renderHook(() => useXsd(undefined));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a schema from a file is used when it is this message\'s, and remembered through renders (as when only the type changes)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result, rerender } = renderHook(() => useXsd(m1));
    await waitFor(() => expect(result.current.state.status).toBe('unavailable'));
    await act(() => result.current.loadFile(fileOf(xsd(NS1))));
    expect(result.current.state).toMatchObject({ status: 'ready', source: 'file', fileName: 'chosen.xsd' });
    rerender();
    rerender();
    expect(result.current.state.status).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a file that is not a schema, or is another message\'s, says why, and keeps what it had', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useXsd(m1));
    await waitFor(() => expect(result.current.state.status).toBe('unavailable'));
    await act(() => result.current.loadFile(fileOf('<hello/>', 'notes.xsd')));
    expect(result.current.notice).toEqual({ key: 'xsdNotSchema', params: { file: 'notes.xsd' } });
    await act(() => result.current.loadFile(fileOf(xsd(NS2), 'other.xsd')));
    expect(result.current.notice).toMatchObject({ key: 'xsdWrongSchema', params: { file: 'other.xsd', found: NS2, expected: NS1 } });
    expect(result.current.state.status).toBe('unavailable');
    await act(() => result.current.loadFile(fileOf(xsd(NS1))));
    expect(result.current.notice).toBeUndefined();
    expect(result.current.state.status).toBe('ready');
  });

  it('starts over when another message is chosen: the loaded schema, the notice and the open window are gone', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    let message = m1;
    const { result, rerender } = renderHook(() => useXsd(message));
    await waitFor(() => expect(result.current.state.status).toBe('unavailable'));
    await act(() => result.current.loadFile(fileOf(xsd(NS1))));
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    message = m2;
    rerender();
    expect(result.current.state).toEqual({ status: 'loading', url: URL2 });
    expect(result.current.open).toBe(false);
    expect(result.current.notice).toBeUndefined();
    await waitFor(() => expect(result.current.state).toEqual({ status: 'unavailable', url: URL2 }));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([URL1, URL2]);
  });

  it('a slow answer for the previous message does not become the new message\'s schema', async () => {
    let resolveFirst: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => (resolveFirst = r)));
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    let message = m1;
    const { result, rerender } = renderHook(() => useXsd(message));
    message = m2;
    rerender();
    await waitFor(() => expect(result.current.state).toEqual({ status: 'unavailable', url: URL2 }));
    resolveFirst(ok(xsd(NS1)));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.state).toEqual({ status: 'unavailable', url: URL2 });
  });

  it('a schema loaded from a file is not replaced by a late answer from the address', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (resolveFetch = r)));
    const { result } = renderHook(() => useXsd(m1));
    await act(() => result.current.loadFile(fileOf(xsd(NS1), 'mine.xsd')));
    resolveFetch(ok(xsd(NS1)));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.state).toMatchObject({ status: 'ready', source: 'file', fileName: 'mine.xsd' });
  });

  it('while developing, asks the dev server\'s proxy first and says ISO\'s address, and falls back to ISO\'s address if the proxy fails', async () => {
    const withProxy = { ...m1, proxyUrl: '/iso20022-xsd/pain/schemas/pain.001.001.13.xsd' };
    fetchMock.mockResolvedValue(ok(xsd(NS1)));
    const a = renderHook(() => useXsd(withProxy));
    await waitFor(() => expect(a.result.current.state.status).toBe('ready'));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/iso20022-xsd/pain/schemas/pain.001.001.13.xsd']);
    expect(a.result.current.state).toMatchObject({ url: URL1, source: 'url' });

    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError('proxy down')).mockResolvedValueOnce(ok(xsd(NS1)));
    const b = renderHook(() => useXsd(withProxy));
    await waitFor(() => expect(b.result.current.state.status).toBe('ready'));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/iso20022-xsd/pain/schemas/pain.001.001.13.xsd', URL1]);
  });
});
