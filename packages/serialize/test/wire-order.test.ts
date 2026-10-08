import { describe, expect, it } from 'vitest';
import { messageIndex } from '@beneficial-strategies/iso20022-validate';
import { serializeToXml } from '../src/index.ts';

/** XML elements must come in the XSD's sequence whatever order the values were entered in. */
describe('XML element order', () => {
  it('camt.029: the assignment starts with its Id, then the creation time (it used to put CreDtTm first)', async () => {
    const { message } = await messageIndex.find((m) => m.identifier === 'camt.029.001.14')!.load();
    const xml = serializeToXml(message, { Assignment: { CreationDateTime: '2026-10-08T10:00:00Z', Identification: 'ASSIGN-1' } });
    expect(xml.indexOf('<Id>')).toBeGreaterThan(-1);
    expect(xml.indexOf('<Id>')).toBeLessThan(xml.indexOf('<CreDtTm>'));
  });

  it('pain.001: values given in reverse order still come out as MsgId, CreDtTm, NbOfTxs', async () => {
    const { message } = await messageIndex.find((m) => m.identifier === 'pain.001.001.13')!.load();
    const xml = serializeToXml(message, { GroupHeader: { NumberOfTransactions: '1', CreationDateTime: '2026-10-08T10:00:00Z', MessageIdentification: 'M1' } });
    const at = (tag: string) => xml.indexOf(`<${tag}>`);
    expect(at('MsgId')).toBeLessThan(at('CreDtTm'));
    expect(at('CreDtTm')).toBeLessThan(at('NbOfTxs'));
  });
});
