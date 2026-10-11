import { describe, expect, it } from 'vitest';
import { messageIndex } from '@beneficial-strategies/iso20022-validate';
import { inspectJson, inspectXml, parseIsoJsonMessage, parseXmlMessage, serializeFragment, serializeToIsoJson, serializeToXml } from '../src/index.ts';

/**
 * The Business Application Header (head.001.001.04) is its own root: `<AppHdr xmlns="…head.001.001.04">` with its fields directly
 * inside, not `<Document><AppHdr>…</AppHdr></Document>`; in ISO JSON `{ "AppHdr": { … } }`.
 */
const info = messageIndex.find((m) => m.identifier === 'head.001.001.04')!;
const { message, typeDescriptors } = await info.load();

const values = {
  From: { FinancialInstitutionIdentification: { FinancialInstitutionIdentification: { BICFI: 'AAAAUS33' } } },
  To: { FinancialInstitutionIdentification: { FinancialInstitutionIdentification: { BICFI: 'BBBBDEFF' } } },
  BusinessMessageIdentifier: 'BIZ-1',
  MessageDefinitionIdentifier: 'camt.053.001.14',
  CreationDate: '2026-01-02T03:04:05Z',
};

describe('head.001.001.04 is its own root', () => {
  it('is registered as AppHdr in the header namespace', () => {
    expect(message.rootTag).toBe('AppHdr');
    expect(message.bodyTag).toBe('AppHdr');
    expect(message.namespace).toBe('urn:iso:std:iso:20022:tech:xsd:head.001.001.04');
  });

  it('writes the fields directly inside AppHdr', () => {
    const xml = serializeToXml(message, values);
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<AppHdr xmlns="urn:iso:std:iso:20022:tech:xsd:head.001.001.04">',
        '  <Fr>',
        '    <FIId>',
        '      <FinInstnId>',
        '        <BICFI>AAAAUS33</BICFI>',
        '      </FinInstnId>',
        '    </FIId>',
        '  </Fr>',
        '  <To>',
        '    <FIId>',
        '      <FinInstnId>',
        '        <BICFI>BBBBDEFF</BICFI>',
        '      </FinInstnId>',
        '    </FIId>',
        '  </To>',
        '  <BizMsgIdr>BIZ-1</BizMsgIdr>',
        '  <MsgDefIdr>camt.053.001.14</MsgDefIdr>',
        '  <CreDt>2026-01-02T03:04:05Z</CreDt>',
        '</AppHdr>',
        '',
      ].join('\n'),
    );
    expect(xml).not.toContain('<Document');
  });

  it('writes ISO JSON as { "AppHdr": { … } }', () => {
    const json = JSON.parse(serializeToIsoJson(message, values));
    expect(Object.keys(json)).toEqual(['AppHdr']);
    expect(json.AppHdr.BizMsgIdr).toBe('BIZ-1');
    expect(json.AppHdr.Fr.FIId.FinInstnId.BICFI).toBe('AAAAUS33');
  });

  it('reads both back, with no issues', () => {
    const fromXml = parseXmlMessage(message, serializeToXml(message, values));
    expect(fromXml).toMatchObject({ ok: true, issues: [] });
    const fromJson = parseIsoJsonMessage(message, serializeToIsoJson(message, values));
    expect(fromJson).toMatchObject({ ok: true, issues: [] });
    if (fromXml.ok && fromJson.ok) expect(fromJson.values).toEqual(fromXml.values);
    if (fromXml.ok) expect(serializeToXml(message, fromXml.values)).toBe(serializeToXml(message, values));
  });

  it('reports an element inside AppHdr that the header does not have', () => {
    const r = parseXmlMessage(message, serializeToXml(message, values).replace('<BizMsgIdr>', '<Bogus>1</Bogus>\n  <BizMsgIdr>'));
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.issues.map((i) => i.code)).toContain('unknown_element');
  });

  it('refuses a Document, and a header read as another message is refused too', () => {
    expect(parseXmlMessage(message, '<Document xmlns="x"><AppHdr/></Document>')).toMatchObject({ ok: false, error: { code: 'wrong_root', detail: 'Document' } });
    expect(parseIsoJsonMessage(message, '{"Document":{"AppHdr":{}}}')).toMatchObject({ ok: false, error: { code: 'wrong_root' } });
  });

  it('is recognised as a whole message, not as a fragment', () => {
    expect(inspectXml(serializeToXml(message, values))).toEqual({
      ok: true,
      info: { format: 'xml', kind: 'document', name: 'AppHdr', namespace: 'urn:iso:std:iso:20022:tech:xsd:head.001.001.04' },
    });
    expect(inspectJson(serializeToIsoJson(message, values))).toEqual({ ok: true, info: { format: 'json', kind: 'document', name: 'AppHdr' } });
  });

  it('keeps fragments (no namespace) as fragments', () => {
    const xml = serializeFragment(typeDescriptors, 'Party51Choice', values.From);
    expect(inspectXml(xml)).toEqual({ ok: true, info: { format: 'xml', kind: 'fragment', name: 'Party51Choice' } });
    expect(inspectJson('{"Party51Choice":{}}')).toEqual({ ok: true, info: { format: 'json', kind: 'fragment', name: 'Party51Choice' } });
  });
});
