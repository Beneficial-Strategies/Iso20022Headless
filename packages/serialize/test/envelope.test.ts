import { describe, expect, it } from 'vitest';
import { APPLICATION_HEADER, messageIndex, withApplicationHeader } from '@beneficial-strategies/iso20022-validate';
import {
  inspectJson,
  inspectXml,
  parseIsoJsonEnvelope,
  parseXmlEnvelope,
  serializeEnvelopeToIsoJson,
  serializeEnvelopeToXml,
  serializeToIsoJson,
  serializeToXml,
} from '../src/index.ts';

/**
 * A message with its Business Application Header: `<Envelope><AppHdr/><Document/></Envelope>` (ISO defines no such element; this is our
 * convention) and `{ "Envelope": { "AppHdr": …, "Document": … } }`. The form values hold the header under `ApplicationHeader`.
 */
const load = (id: string) => messageIndex.find((m) => m.identifier === id)!.load();
const head = await load('head.001.001.04');
const pain = await load('pain.002.001.15');

const header = { BusinessMessageIdentifier: 'BIZ-1', MessageDefinitionIdentifier: 'pain.002.001.15', CreationDate: '2026-01-02T03:04:05Z' };
const body = { GroupHeader: { MessageIdentification: 'M1' } };

describe('message with its header in an envelope', () => {
  it('writes the header first, then the message, as siblings', () => {
    const xml = serializeEnvelopeToXml({ message: head.message, values: header }, pain.message, body);
    const lines = xml.split('\n');
    expect(lines.slice(0, 3)).toEqual(['<?xml version="1.0" encoding="UTF-8"?>', '<Envelope>', '  <AppHdr xmlns="urn:iso:std:iso:20022:tech:xsd:head.001.001.04">']);
    expect(xml).toContain('  <Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.15">');
    expect(xml.indexOf('<AppHdr')).toBeLessThan(xml.indexOf('<Document'));
    expect(xml.indexOf('</AppHdr>')).toBeLessThan(xml.indexOf('<Document')); // siblings, not nested
    expect(xml.trimEnd().endsWith('</Envelope>')).toBe(true);
  });

  it('is the message alone when there is no header, and ignores an ApplicationHeader key in the message values', () => {
    const plain = serializeToXml(pain.message, body);
    expect(serializeToXml(pain.message, { ...body, [APPLICATION_HEADER]: header })).toBe(plain);
    expect(serializeToIsoJson(pain.message, { ...body, [APPLICATION_HEADER]: header })).toBe(serializeToIsoJson(pain.message, body));
  });

  it('writes JSON the same way', () => {
    const json = JSON.parse(serializeEnvelopeToIsoJson({ message: head.message, values: header }, pain.message, body));
    expect(Object.keys(json)).toEqual(['Envelope']);
    expect(Object.keys(json.Envelope)).toEqual(['AppHdr', 'Document']);
    expect(json.Envelope.AppHdr.BizMsgIdr).toBe('BIZ-1');
    expect(json.Envelope.Document.CstmrPmtStsRpt.GrpHdr.MsgId).toBe('M1');
  });

  it('reads both back, with the header under ApplicationHeader', () => {
    const xml = serializeEnvelopeToXml({ message: head.message, values: header }, pain.message, body);
    const r = parseXmlEnvelope(head.message, pain.message, xml);
    expect(r).toMatchObject({ ok: true, issues: [] });
    if (r.ok) {
      expect((r.values as Record<string, unknown>)[APPLICATION_HEADER]).toMatchObject(header);
      expect((r.values as { GroupHeader: unknown }).GroupHeader).toMatchObject({ MessageIdentification: 'M1' });
      const again = serializeEnvelopeToXml({ message: head.message, values: (r.values as Record<string, unknown>)[APPLICATION_HEADER] }, pain.message, r.values);
      expect(again).toBe(xml);
    }
    const j = parseIsoJsonEnvelope(head.message, pain.message, serializeEnvelopeToIsoJson({ message: head.message, values: header }, pain.message, body));
    expect(j).toMatchObject({ ok: true, issues: [] });
    if (j.ok && r.ok) expect(j.values).toEqual(r.values);
  });

  it('accepts an envelope without a header, and reports what it does not know, with the header\'s issues placed under ApplicationHeader', () => {
    const noHeader = parseXmlEnvelope(head.message, pain.message, `<Envelope><Document xmlns="x"><CstmrPmtStsRpt><GrpHdr><MsgId>M1</MsgId></GrpHdr></CstmrPmtStsRpt></Document></Envelope>`);
    expect(noHeader).toMatchObject({ ok: true });
    if (noHeader.ok) expect(noHeader.values).not.toHaveProperty(APPLICATION_HEADER);
    const odd = parseXmlEnvelope(head.message, pain.message, `<Envelope><AppHdr><Bogus/></AppHdr><Document><CstmrPmtStsRpt/></Document><Extra/></Envelope>`);
    expect(odd).toMatchObject({ ok: true });
    if (odd.ok) expect(odd.issues.map((i) => `${i.code}:${i.path}`)).toEqual(['unknown_element:ApplicationHeader.Bogus', 'unknown_element:Extra']);
  });

  it('refuses text that is not an envelope or has no Document', () => {
    expect(parseXmlEnvelope(head.message, pain.message, '<Document/>')).toMatchObject({ ok: false, error: { code: 'wrong_root' } });
    expect(parseXmlEnvelope(head.message, pain.message, '<Envelope><AppHdr/></Envelope>')).toMatchObject({ ok: false, error: { code: 'wrong_body' } });
    expect(parseIsoJsonEnvelope(head.message, pain.message, '{"Document":{}}')).toMatchObject({ ok: false, error: { code: 'wrong_root' } });
  });

  it('is recognised as an envelope', () => {
    const xml = serializeEnvelopeToXml({ message: head.message, values: header }, pain.message, body);
    expect(inspectXml(xml)).toEqual({ ok: true, info: { format: 'xml', kind: 'envelope', name: 'CstmrPmtStsRpt', namespace: 'urn:iso:std:iso:20022:tech:xsd:pain.002.001.15' } });
    expect(inspectJson(serializeEnvelopeToIsoJson({ message: head.message, values: header }, pain.message, body))).toEqual({ ok: true, info: { format: 'json', kind: 'envelope', name: 'CstmrPmtStsRpt' } });
  });
});

describe('withApplicationHeader', () => {
  const composite = withApplicationHeader(pain, head);

  it('offers the header as the first, optional group of the message, and leaves the message itself alone', () => {
    const fields = composite.typeDescriptors[pain.message.rootType]!.fields!;
    expect(fields[0]).toMatchObject({ name: APPLICATION_HEADER, xmlTag: 'AppHdr', type: 'BusinessApplicationHeaderV04', kind: 'component', required: false });
    expect(fields.slice(1).map((f) => f.name)).toEqual(pain.typeDescriptors[pain.message.rootType]!.fields!.map((f) => f.name));
    expect(composite.message).toBe(pain.message);
    expect(pain.typeDescriptors[pain.message.rootType]!.fields![0]!.name).not.toBe(APPLICATION_HEADER);
  });

  it('brings the header\'s types and schemas along', () => {
    expect(composite.typeDescriptors.BusinessApplicationHeaderV04).toBeDefined();
    expect(composite.schemas.BusinessApplicationHeaderV04).toBeDefined();
  });

  it('accepts a message with or without the header group, and checks the header\'s own rules', () => {
    const schema = composite.schemas[pain.message.rootType]!;
    const without = { GroupHeader: { MessageIdentification: 'M1' } };
    expect(schema.safeParse(without).success).toBe(pain.schemas[pain.message.rootType]!.safeParse(without).success); // no header group: nothing changes
    const withEmptyHeader = schema.safeParse({ GroupHeader: { MessageIdentification: 'M1' }, [APPLICATION_HEADER]: { Bogus: 1 } });
    expect(withEmptyHeader.success).toBe(false); // the header is validated (strictly) too
    const plainSchema = pain.schemas[pain.message.rootType]!;
    expect(plainSchema.safeParse({ GroupHeader: { MessageIdentification: 'M1' }, [APPLICATION_HEADER]: {} }).success).toBe(false); // the plain message does not know it
  });
});
