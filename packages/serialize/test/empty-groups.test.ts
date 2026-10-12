import { describe, expect, it } from 'vitest';
import { messageIndex } from '@beneficial-strategies/iso20022-validate';
import { serializeEnvelopeToXml, serializeFragment, serializeFragmentIsoJson, serializeToIsoJson, serializeToXml } from '../src/index.ts';

/**
 * A group that is required is written even when nothing is filled in below it, and so is an optional group that is included (present,
 * though empty); an optional group that is not included is not written. Empty leaves are left out. That lets a schema say what is
 * missing inside a group instead of that the whole group is missing.
 */
const load = (id: string) => messageIndex.find((m) => m.identifier === id)!.load();
const pain018 = await load('pain.018.001.04');
const pain001 = await load('pain.001.001.13');
const head = await load('head.001.001.04');

describe('required groups are written empty', () => {
  it('an empty pain.018 has its group header', () => {
    const xml = serializeToXml(pain018.message, {});
    expect(xml).toContain('    <GrpHdr>\n    </GrpHdr>');
    expect(xml).toContain('<UndrlygSspnsnDtls>'); // required too, and what it requires
    expect(xml).not.toMatch(/<MsgId>/); // empty texts stay out
  });

  it('writes what is required all the way down, and nothing optional', () => {
    const xml = serializeToXml(pain001.message, {});
    expect(xml).toContain('<GrpHdr>');
    expect(xml).toContain('<InitgPty>'); // required inside the group header
    expect(xml).not.toContain('<CtrlSum>'); // optional text
    expect(xml).not.toContain('<Authstn>'); // optional list
    expect(xml).not.toContain('<SplmtryData>'); // optional group not included
  });

  it('keeps a required group that has some of its fields filled in', () => {
    const xml = serializeToXml(pain001.message, { GroupHeader: { MessageIdentification: 'M' } });
    expect(xml).toContain('<MsgId>M</MsgId>');
    expect(xml).toContain('<InitgPty>');
  });
});

describe('optional groups are written when included', () => {
  it('an included optional group is written empty, a group left out is not written', () => {
    const base = { GroupHeader: { MessageIdentification: 'M' } };
    expect(serializeToXml(pain001.message, base)).not.toContain('<Authstn>');
    const included = serializeToXml(pain001.message, { GroupHeader: { MessageIdentification: 'M', Authorisation: [{}] } });
    expect(included).toContain('<Authstn>');
    const noPostal = serializeToXml(pain001.message, { GroupHeader: { MessageIdentification: 'M', InitiatingParty: {} } });
    expect(noPostal).not.toContain('<PstlAdr>');
    const withPostal = serializeToXml(pain001.message, { GroupHeader: { MessageIdentification: 'M', InitiatingParty: { PostalAddress: {} } } });
    expect(withPostal).toContain('<PstlAdr>\n');
  });

  it('the Business Application Header of an envelope, ticked and empty, shows its required groups', () => {
    const xml = serializeEnvelopeToXml({ message: head.message, values: {} }, pain018.message, {});
    expect(xml).toContain('<Fr>');
    expect(xml).toContain('<To>');
    expect(xml).toContain('<AppHdr xmlns="urn:iso:std:iso:20022:tech:xsd:head.001.001.04">');
  });
});

describe('the same in ISO JSON and for a part of a message', () => {
  it('JSON', () => {
    const j = JSON.parse(serializeToIsoJson(pain018.message, {}));
    expect(j.Document[pain018.message.bodyTag].GrpHdr).toEqual({});
  });

  it('a fragment writes its required groups, empty', () => {
    expect(serializeFragment(pain018.typeDescriptors, 'GroupHeader110', {})).toContain('<GroupHeader110>');
    const groupHeader = pain001.typeDescriptors[pain001.message.rootType]!.fields!.find((f) => f.name === 'GroupHeader')!.type;
    const j = JSON.parse(serializeFragmentIsoJson(pain001.typeDescriptors, groupHeader, {}));
    expect(j[groupHeader].InitgPty).toEqual({});
  });
});
