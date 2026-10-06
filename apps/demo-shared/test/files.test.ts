import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_FILE_BYTES, downloadText, readTextFile, saveFileName } from '../src/files.ts';
import { describePasteError } from '../src/PasteReport.tsx';

afterEach(() => vi.restoreAllMocks());

describe('saveFileName', () => {
  it('names a whole message after its identifier and a component after message and type', () => {
    expect(saveFileName('pain.002.001.15', 'CustomerPaymentStatusReportV15', 'CustomerPaymentStatusReportV15', 'xml')).toBe('pain.002.001.15.xml');
    expect(saveFileName('pain.002.001.15', 'CustomerPaymentStatusReportV15', 'CustomerPaymentStatusReportV15', 'json')).toBe('pain.002.001.15.json');
    expect(saveFileName('pain.001.001.13', 'GroupHeader114', 'CustomerCreditTransferInitiationV13', 'xml')).toBe('pain.001.001.13_GroupHeader114.xml');
  });
});

describe('downloadText', () => {
  it('offers the text to the browser as a named file of the right type, then cleans up', () => {
    const made: Blob[] = [];
    vi.stubGlobal('URL', { createObjectURL: (b: Blob) => (made.push(b), 'blob:x'), revokeObjectURL: vi.fn() });
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });
    downloadText('a.xml', '<A/>', 'xml');
    downloadText('b.json', '{}', 'json');
    expect(clicked).toEqual([
      { href: 'blob:x', download: 'a.xml' },
      { href: 'blob:x', download: 'b.json' },
    ]);
    expect(made.map((b) => b.type)).toEqual(['application/xml', 'application/json']);
    expect(document.querySelector('a[download]')).toBeNull(); // the temporary link is removed
    vi.unstubAllGlobals();
  });
});

describe('readTextFile', () => {
  it('reads the text', async () => {
    expect(await readTextFile(new File(['<A/>'], 'a.xml'))).toEqual({ ok: true, text: '<A/>' });
  });
  it('refuses a file over the limit without reading it', async () => {
    const f = new File(['x'.repeat(11)], 'big.xml');
    expect(await readTextFile(f, 10)).toEqual({ ok: false, reason: 'too_large' });
    expect(MAX_FILE_BYTES).toBe(20 * 1024 * 1024);
  });
  it('reports a file the browser cannot read', async () => {
    const f = new File(['x'], 'a.xml');
    Object.defineProperty(f, 'text', { value: () => Promise.reject(new Error('denied')) });
    expect(await readTextFile(f)).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('error wording depends on where the text came from', () => {
  const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`;
  it('says "file" for a file and "clipboard" for the clipboard', () => {
    expect(describePasteError(t as never, { code: 'empty' }, { kind: 'file', name: 'a.xml' })).toBe('fileError_empty');
    expect(describePasteError(t as never, { code: 'not_xml_or_json' }, { kind: 'file', name: 'a.xml' })).toBe('fileError_not_xml_or_json');
    expect(describePasteError(t as never, { code: 'empty' })).toBe('pasteError_empty');
    expect(describePasteError(t as never, { code: 'file_too_large' }, { kind: 'file', name: 'a' })).toBe('fileError_too_large');
    expect(describePasteError(t as never, { code: 'file_unreadable' }, { kind: 'file', name: 'a' })).toBe('fileError_unreadable');
  });
});
