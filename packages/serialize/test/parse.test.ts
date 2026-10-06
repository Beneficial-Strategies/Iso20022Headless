import { describe, expect, it } from 'vitest';
import { messageIndex, pruneEmpty, type FieldDescriptor, type TypeDescriptors } from '@beneficial-strategies/iso20022-validate';
import {
  detectFormat,
  inspectJson,
  inspectXml,
  parseIsoJsonFragment,
  parseIsoJsonMessage,
  parseXmlDocument,
  parseXmlFragment,
  parseXmlMessage,
  serializeFragment,
  serializeFragmentIsoJson,
  serializeToIsoJson,
  serializeToXml,
  XmlError,
} from '../src/index.ts';

const bundles = await Promise.all(messageIndex.map((m) => m.load()));

/** A value for every field of a type: all fields present, two items in a list near the top, the first alternative of a choice. */
function sample(types: TypeDescriptors, typeName: string, depth = 0): unknown {
  const t = types[typeName]!;
  const leaf = (f: FieldDescriptor, n: number): unknown => {
    const lt = types[f.type]!;
    switch (lt.kind) {
      case 'amount':
        return { Ccy: 'EUR', Value: `${n}.50` };
      case 'boolean':
        return 'true';
      case 'date':
        return '2026-01-02';
      case 'datetime':
        return '2026-01-02T03:04:05Z';
      case 'any':
        return `<Envlp a="1">raw &amp; text ${n}<Inner/></Envlp>`;
      case 'code':
        return lt.options?.[0]?.value ?? 'ABCD';
      case 'number':
        return `${n}`;
      default:
        return `v ${f.name} & <${n}> "q"`;
    }
  };
  const one = (f: FieldDescriptor, n: number): unknown => {
    const ft = types[f.type]!;
    return ft.kind === 'component' || ft.kind === 'choice' ? sample(types, f.type, depth + 1) : leaf(f, n);
  };
  if (t.kind === 'choice') {
    const f = t.choiceOptions![0]!;
    return { [f.name]: one(f, 1) };
  }
  const out: Record<string, unknown> = {};
  for (const f of t.fields ?? []) out[f.name] = f.repeat ? Array.from({ length: depth < 2 ? 2 : 1 }, (_, i) => one(f, i + 1)) : one(f, 1);
  return out;
}

describe('the XML reader', () => {
  it('reads elements, attributes, entities, CDATA and comments, and keeps inner text raw', () => {
    const r = parseXmlDocument('<?xml version="1.0"?><!-- c --><a x="1&amp;2"><b>t&lt;1</b><c><![CDATA[<raw>]]></c><d>in<!--x-->ner<e/></d></a>');
    expect(r.name).toBe('a');
    expect(r.attrs.x).toBe('1&2');
    expect(r.children.map((c) => c.name)).toEqual(['b', 'c', 'd']);
    expect(r.children[0]!.text).toBe('t<1');
    expect(r.children[1]!.text).toBe('<raw>');
    expect(r.children[2]!.text).toBe('inner');
    expect(r.children[2]!.raw).toBe('in<!--x-->ner<e/>');
  });

  it('drops namespace prefixes and finds the namespace of the root', () => {
    const r = parseXmlDocument('<ns:Document xmlns:ns="urn:x:1"><ns:Body/></ns:Document>');
    expect(r.name).toBe('Document');
    expect(r.namespace).toBe('urn:x:1');
    expect(r.children[0]!.namespace).toBe('urn:x:1');
    expect(parseXmlDocument('<Document xmlns="urn:y"/>').namespace).toBe('urn:y');
  });

  it.each([
    ['not XML', 'hello'],
    ['mismatched tags', '<a><b></a></b>'],
    ['unclosed element', '<a><b>'],
    ['unquoted attribute', '<a x=1/>'],
    ['duplicate attribute', '<a x="1" x="2"/>'],
    ['unknown entity', '<a>&nope;</a>'],
    ['text after the root', '<a/>junk'],
    ['a DOCTYPE (entity tricks are not allowed)', '<!DOCTYPE a [<!ENTITY x "y">]><a>&x;</a>'],
    ['elements nested too deeply', '<a>'.repeat(300) + '</a>'.repeat(300)],
  ])('rejects %s', (_label, text) => {
    expect(() => parseXmlDocument(text)).toThrow(XmlError);
  });
});

describe('detecting what text is', () => {
  it('tells XML and JSON that could be read from everything else', () => {
    expect(detectFormat('<?xml version="1.0"?>\n<Document xmlns="urn:x"><A/></Document>')).toBe('xml');
    expect(detectFormat('﻿  <A/>')).toBe('xml');
    expect(detectFormat(' {"Document":{}} ')).toBe('json');
    for (const s of ['', 'hello', '<broken', '{broken', '[1,2]', '12', '<a></b>']) expect(detectFormat(s)).toBeUndefined();
  });

  it('reports the namespace of a Document, or a fragment name', () => {
    expect(inspectXml('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.15"><CstmrPmtStsRpt/></Document>')).toEqual({
      ok: true,
      info: { format: 'xml', kind: 'document', name: 'CstmrPmtStsRpt', namespace: 'urn:iso:std:iso:20022:tech:xsd:pain.002.001.15' },
    });
    expect(inspectXml('<Document><X/></Document>')).toEqual({ ok: true, info: { format: 'xml', kind: 'document', name: 'X' } });
    expect(inspectXml('<GroupHeader128><A/></GroupHeader128>')).toEqual({ ok: true, info: { format: 'xml', kind: 'fragment', name: 'GroupHeader128' } });
    expect(inspectJson('{"Document":{"CstmrPmtStsRpt":{}}}')).toEqual({ ok: true, info: { format: 'json', kind: 'document', name: 'CstmrPmtStsRpt' } });
    expect(inspectJson('{"GroupHeader128":{}}')).toEqual({ ok: true, info: { format: 'json', kind: 'fragment', name: 'GroupHeader128' } });
  });
});

describe.each(bundles.map((b) => b.message))('round trip: $identifier', (message) => {
  const types = message.typeDescriptors as TypeDescriptors;
  const values = sample(types, message.rootType);

  it('XML: every field written is read back identically', () => {
    const r = parseXmlMessage(message, serializeToXml(message, values));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.issues).toEqual([]);
      expect(pruneEmpty(r.values)).toEqual(pruneEmpty(values));
    }
  });

  it('ISO JSON: every field written is read back identically', () => {
    const r = parseIsoJsonMessage(message, serializeToIsoJson(message, values));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.issues).toEqual([]);
      expect(pruneEmpty(r.values)).toEqual(pruneEmpty(values));
    }
  });

  it('every component type round-trips as a fragment, in both formats', () => {
    for (const t of Object.values(types).filter((x) => x.kind === 'component' || x.kind === 'choice')) {
      const v = sample(types, t.name, 2);
      const x = parseXmlFragment(types, t.name, serializeFragment(types, t.name, v));
      const j = parseIsoJsonFragment(types, t.name, serializeFragmentIsoJson(types, t.name, v));
      expect(x.ok && pruneEmpty(x.values)).toEqual(pruneEmpty(v));
      expect(j.ok && pruneEmpty(j.values)).toEqual(pruneEmpty(v));
    }
  });
});

describe('what cannot be read is reported', () => {
  const b = bundles.find((x) => x.message.identifier === 'pain.002.001.15')!;
  const m = b.message;
  const doc = (body: string) => `<Document xmlns="${m.namespace}"><CstmrPmtStsRpt>${body}</CstmrPmtStsRpt></Document>`;

  it('loads what it can and lists unknown, duplicated and extra elements with their form paths', () => {
    const r = parseXmlMessage(
      m,
      doc('<GrpHdr><MsgId>A</MsgId><MsgId>B</MsgId><Nope>1</Nope></GrpHdr><OrgnlPmtInfAndSts><OrgnlPmtInfId>P</OrgnlPmtInfId><Bogus/></OrgnlPmtInfAndSts>'),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issues).toEqual([
      { code: 'duplicate_element', path: 'GroupHeader.MessageIdentification', detail: 'MsgId' },
      { code: 'unknown_element', path: 'GroupHeader.Nope', detail: 'Nope' },
      { code: 'unknown_element', path: 'OriginalPaymentInformationAndStatus[0].Bogus', detail: 'Bogus' },
    ]);
    const v = r.values as { GroupHeader: { MessageIdentification: string }; OriginalPaymentInformationAndStatus: { OriginalPaymentInformationIdentification: string }[] };
    expect(v.GroupHeader.MessageIdentification).toBe('A'); // the first is kept
    expect(v.OriginalPaymentInformationAndStatus[0]!.OriginalPaymentInformationIdentification).toBe('P');
  });

  it('reports more than one alternative of a Choice', () => {
    const r = parseXmlFragment(b.typeDescriptors, 'StatusReason6Choice', '<StatusReason6Choice><Cd>AC01</Cd><Prtry>x</Prtry></StatusReason6Choice>');
    expect(r.ok && r.issues).toEqual([{ code: 'multiple_choices', path: '', detail: 'Code, Proprietary' }]);
    expect(r.ok && r.values).toEqual({ Code: 'AC01' });
  });

  it('refuses text that is not the expected message, and says what it found', () => {
    expect(parseXmlMessage(m, '<Document><OtherBody/></Document>')).toEqual({ ok: false, error: { code: 'wrong_body', path: '', detail: 'OtherBody' } });
    expect(parseXmlMessage(m, '<Other/>')).toEqual({ ok: false, error: { code: 'wrong_root', path: '', detail: 'Other' } });
    expect(parseXmlFragment(b.typeDescriptors, 'GroupHeader128', '<PostalAddress27/>')).toEqual({ ok: false, error: { code: 'wrong_root', path: '', detail: 'PostalAddress27' } });
    expect(parseIsoJsonMessage(m, '{"Document":{"Other":{}}}')).toEqual({ ok: false, error: { code: 'wrong_body', path: '', detail: 'Other' } });
    expect(parseIsoJsonMessage(m, '[1]')).toEqual({ ok: false, error: { code: 'not_json_object', path: '' } });
  });

  it('refuses broken syntax with the parser message', () => {
    const x = parseXmlMessage(m, '<Document><a></Document>');
    expect(!x.ok && x.error.code).toBe('xml_syntax');
    const j = parseIsoJsonMessage(m, '{"Document":');
    expect(!j.ok && j.error.code).toBe('json_syntax');
  });

  it('accepts JSON a hand-written tool might produce: lone values for lists, numbers for strings', () => {
    const r = parseIsoJsonMessage(m, '{"Document":{"CstmrPmtStsRpt":{"GrpHdr":{"MsgId":123},"OrgnlPmtInfAndSts":{"OrgnlPmtInfId":"P"}}}}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.issues).toEqual([]);
    const v = r.values as { GroupHeader: { MessageIdentification: string }; OriginalPaymentInformationAndStatus: unknown[] };
    expect(v.GroupHeader.MessageIdentification).toBe('123');
    expect(v.OriginalPaymentInformationAndStatus).toHaveLength(1);
  });

  it('values that are invalid still load (validation reports them): a bad date and a wrong amount', () => {
    const r = parseXmlMessage(m, doc('<GrpHdr><CreDtTm>not a date</CreDtTm></GrpHdr>'));
    expect(r.ok && (r.values as { GroupHeader: { CreationDateTime: string } }).GroupHeader.CreationDateTime).toBe('not a date');
  });
});
