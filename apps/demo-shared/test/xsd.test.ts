import { describe, expect, it } from 'vitest';
import { checkSchemaFile, devProxyUrl, inspectSchema, tidyMessage, validateXsd, withDefaultNamespace, wrapperSchema, type ValidateXml } from '../src/xsd.ts';

const NS = 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.13';

describe('withDefaultNamespace: the namespace the part would inherit from its container', () => {
  it('declares it on the root element, like an inherited default namespace', () => {
    expect(withDefaultNamespace('<GroupHeader114>\n  <MessageIdentification>A</MessageIdentification>\n</GroupHeader114>', NS)).toBe(
      `<GroupHeader114 xmlns="${NS}">\n  <MessageIdentification>A</MessageIdentification>\n</GroupHeader114>`,
    );
  });

  it('changes only the first line, so line numbers of messages still match the text shown', () => {
    const xml = '<A>\n<B/>\n<C/>\n</A>';
    const out = withDefaultNamespace(xml, NS);
    expect(out.split('\n').slice(1)).toEqual(xml.split('\n').slice(1));
  });

  it('leaves a root that already declares a default namespace alone', () => {
    const xml = `<Document xmlns="${NS}"><X/></Document>`;
    expect(withDefaultNamespace(xml, 'urn:other')).toBe(xml);
  });

  it('skips the XML declaration, comments, a DOCTYPE and processing instructions', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- <Fake> -->\n<?pi x?>\n<!DOCTYPE A>\n<A b="1"/>';
    expect(withDefaultNamespace(xml, NS)).toBe(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- <Fake> -->\n<?pi x?>\n<!DOCTYPE A>\n<A xmlns="${NS}" b="1"/>`);
  });

  it('is not fooled by a ">" or an xmlns-looking text inside an attribute value, and prefixed declarations are not defaults', () => {
    expect(withDefaultNamespace('<A note="a>b xmlns=\'x\'" c="1"/>', NS)).toBe(`<A xmlns="${NS}" note="a>b xmlns='x'" c="1"/>`);
    expect(withDefaultNamespace('<p:A xmlns:p="urn:p"/>', NS)).toBe(`<p:A xmlns="${NS}" xmlns:p="urn:p"/>`);
  });

  it('returns text without an element unchanged', () => {
    expect(withDefaultNamespace('', NS)).toBe('');
    expect(withDefaultNamespace('just text', NS)).toBe('just text');
  });
});

describe('inspectSchema', () => {
  const xsd = (attrs: string) => `<?xml version="1.0"?><!-- <xs:schema fake="x"> --><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" ${attrs}><xs:element name="Document"/></xs:schema>`;

  it('finds the target namespace', () => {
    expect(inspectSchema(xsd(`targetNamespace="${NS}"`))).toEqual({ isSchema: true, targetNamespace: NS });
    expect(inspectSchema(xsd(`targetNamespace='${NS}'`))).toEqual({ isSchema: true, targetNamespace: NS });
  });

  it('accepts any prefix, and a schema without a target namespace', () => {
    expect(inspectSchema(`<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:a"/>`)).toEqual({ isSchema: true, targetNamespace: 'urn:a' });
    expect(inspectSchema(xsd(''))).toEqual({ isSchema: true });
  });

  it('says no for anything that is not an XML Schema', () => {
    expect(inspectSchema('<hello/>').isSchema).toBe(false);
    expect(inspectSchema('{"json": true}').isSchema).toBe(false);
    expect(inspectSchema('<schema targetNamespace="urn:a"/>').isSchema).toBe(false); // not in the XML Schema namespace
  });
});

describe('checkSchemaFile', () => {
  const ok = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="${NS}"/>`;
  it('accepts the schema of this message only', () => {
    expect(checkSchemaFile(ok, NS, 'a.xsd')).toBeUndefined();
    expect(checkSchemaFile(ok.replace('001.001.13', '002.001.15'), NS, 'a.xsd')).toMatchObject({ en: 'wrongSchema', params: { file: 'a.xsd', expected: NS } });
    expect(checkSchemaFile('<x/>', NS, 'a.xsd')).toEqual({ en: 'notSchema', params: { file: 'a.xsd' } });
  });
});

describe('wrapperSchema: a part of a message as a top-level element', () => {
  it('includes the message schema and declares an element named like the type, of that type', () => {
    const w = wrapperSchema(NS, 'GroupHeader114', 'message.xsd');
    expect(w).toContain(`targetNamespace="${NS}"`);
    expect(w).toContain('<xs:include schemaLocation="message.xsd"/>');
    expect(w).toContain('<xs:element name="GroupHeader114" type="GroupHeader114"/>');
  });
});

describe('tidyMessage', () => {
  it('drops the validator\'s prefix and the namespace noise', () => {
    expect(tidyMessage("Schemas validity error : Element '{urn:iso:std:iso:20022:tech:xsd:pain.001.001.13}MsgId': [facet 'maxLength'] too long.")).toBe("Element 'MsgId': [facet 'maxLength'] too long.");
    expect(tidyMessage('parser error : Opening and ending tag mismatch')).toBe('Opening and ending tag mismatch');
  });
});

describe('validateXsd', () => {
  const calls: Parameters<ValidateXml>[0][] = [];
  const fake: ValidateXml = async (o) => {
    calls.push(o);
    return { valid: false, errors: [{ message: "Schemas validity error : Element '{urn:x}A': bad.", loc: { lineNumber: 3 } }, { message: 'input.xml fails to validate', loc: null }] };
  };
  const base = { xml: '<Part>\n<A/>\n</Part>', schema: '<xs:schema/>', namespace: NS, type: 'Part' };

  it('a whole message goes against the schema as it is, and its own namespace is untouched', async () => {
    calls.length = 0;
    const xml = `<Document xmlns="${NS}"/>`;
    const r = await validateXsd({ ...base, xml, isMessage: true }, fake);
    expect(calls[0]!.xml[0]!.contents).toBe(xml);
    expect(calls[0]!.schema).toEqual([{ fileName: 'message.xsd', contents: '<xs:schema/>' }]);
    expect(calls[0]!.preload).toBeUndefined();
    expect(r).toEqual({ valid: false, issues: [{ message: "Element 'A': bad.", line: 3 }] });
  });

  it('a part gets the inherited namespace and a wrapper schema that includes the message schema', async () => {
    calls.length = 0;
    await validateXsd({ ...base, isMessage: false }, fake);
    expect(calls[0]!.xml[0]!.contents).toBe(`<Part xmlns="${NS}">\n<A/>\n</Part>`);
    expect(calls[0]!.schema[0]!.contents).toContain('<xs:element name="Part" type="Part"/>');
    expect(calls[0]!.preload).toEqual([{ fileName: 'message.xsd', contents: '<xs:schema/>' }]);
  });

  it('asks for more memory than the validator\'s default, since ISO schemas are big', async () => {
    calls.length = 0;
    await validateXsd({ ...base, isMessage: true }, fake);
    expect(calls[0]!.maxMemoryPages).toBeGreaterThan(512);
  });

  it('is valid only when the validator says so and reports nothing', async () => {
    const ok: ValidateXml = async () => ({ valid: true, errors: [] });
    expect(await validateXsd({ ...base, isMessage: true }, ok)).toEqual({ valid: true, issues: [] });
  });
});

describe('devProxyUrl', () => {
  it('maps ISO\'s schema addresses to the dev server\'s proxy, and only those', () => {
    expect(devProxyUrl('https://www.iso20022.org/sites/default/files/documents/messages/pain/schemas/pain.001.001.13.xsd')).toBe('/iso20022-xsd/pain/schemas/pain.001.001.13.xsd');
    expect(devProxyUrl('https://example.test/pain.001.001.13.xsd')).toBeUndefined();
    expect(devProxyUrl('')).toBeUndefined();
  });
});
