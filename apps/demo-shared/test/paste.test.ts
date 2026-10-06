import { beforeAll, describe, expect, it } from 'vitest';
import { messageIndex, type MessageBundle } from '@beneficial-strategies/iso20022-validate';
import { serializeFragment, serializeFragmentIsoJson, serializeToIsoJson, serializeToXml } from '@beneficial-strategies/iso20022-serialize';
import { namespaceOf, planPaste, type PastePlan } from '../src/paste.ts';

const bundles = new Map<string, MessageBundle>();
const load = async (id: string): Promise<MessageBundle> => bundles.get(id) ?? (await messageIndex.find((m) => m.identifier === id)!.load());
beforeAll(async () => {
  for (const m of messageIndex) bundles.set(m.identifier, await m.load());
});

const current = (identifier: string, typeName?: string) => {
  const bundle = bundles.get(identifier)!;
  return { identifier, bundle, typeName: typeName ?? bundle.message.rootType };
};
const err = (p: PastePlan) => (p.ok ? undefined : p.error);

// the message a user pasted when reporting a bug
const USER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.15">
  <CstmrPmtStsRpt>
    <GrpHdr>
      <MsgId>87787878878778877</MsgId>
      <CreDtTm>2026-10-06T15:44:55-05:00</CreDtTm>
    </GrpHdr>
    <OrgnlGrpInfAndSts>
      <OrgnlMsgId>54465464646554</OrgnlMsgId>
      <OrgnlMsgNmId>hhhjjjjjj</OrgnlMsgNmId>
      <GrpSts>ABCD</GrpSts>
      <StsRsnInf>
        <AddtlInf>It just failed.</AddtlInf>
      </StsRsnInf>
    </OrgnlGrpInfAndSts>
  </CstmrPmtStsRpt>
</Document>`;

describe('text that is not XML or JSON, or is broken', () => {
  it('says so, and why', async () => {
    const c = current('pain.002.001.15');
    expect(err(await planPaste('   ', c, load))).toEqual({ code: 'empty' });
    expect(err(await planPaste('just some words', c, load))).toEqual({ code: 'not_xml_or_json' });
    const x = err(await planPaste('<Document><a></Document>', c, load));
    expect(x).toMatchObject({ code: 'parse', issue: { code: 'xml_syntax' } });
    const j = err(await planPaste('{"Document": ', c, load));
    expect(j).toMatchObject({ code: 'parse', issue: { code: 'json_syntax' } });
  });
});

describe('a whole message with a namespace', () => {
  it('loads into the selected message when the namespace matches', async () => {
    const p = await planPaste(USER_XML, current('pain.002.001.15'), load);
    expect(p).toMatchObject({ ok: true, format: 'xml', switched: false, issues: [], target: { identifier: 'pain.002.001.15', typeName: 'CustomerPaymentStatusReportV15' } });
    const v = (p as Extract<PastePlan, { ok: true }>).values as { OriginalGroupInformationAndStatus: { GroupStatus: string } };
    expect(v.OriginalGroupInformationAndStatus.GroupStatus).toBe('ABCD');
  });

  it('switches to the message the namespace names', async () => {
    const b001 = bundles.get('pain.001.001.13')!;
    const xml = serializeToXml(b001.message, { GroupHeader: { MessageIdentification: 'M1' } });
    const p = await planPaste(xml, current('pain.002.001.15'), load);
    expect(p).toMatchObject({ ok: true, switched: true, target: { identifier: 'pain.001.001.13', typeName: 'CustomerCreditTransferInitiationV13' } });
    expect(((p as Extract<PastePlan, { ok: true }>).values as { GroupHeader: { MessageIdentification: string } }).GroupHeader.MessageIdentification).toBe('M1');
  });

  it('switches for every message we have', async () => {
    for (const m of messageIndex) {
      const b = bundles.get(m.identifier)!;
      const p = await planPaste(serializeToXml(b.message, {}), current('pain.002.001.15'), load);
      expect(p, m.identifier).toMatchObject({ ok: true, target: { identifier: m.identifier }, switched: m.identifier !== 'pain.002.001.15' });
    }
  });

  it('refuses a namespace no message uses, and changes nothing', async () => {
    const xml = USER_XML.replace('pain.002.001.15', 'pain.999.001.01');
    expect(err(await planPaste(xml, current('pain.002.001.15'), load))).toEqual({ code: 'unknown_namespace', namespace: namespaceOf('pain.999.001.01') });
    // an older version of a message we have is a different namespace, so it is refused too
    const old = USER_XML.replace('pain.002.001.15', 'pain.002.001.14');
    expect(err(await planPaste(old, current('pain.002.001.15'), load))).toMatchObject({ code: 'unknown_namespace' });
  });

  it('selects the whole message when one arrives while a component is selected', async () => {
    const p = await planPaste(USER_XML, current('pain.002.001.15', 'GroupHeader128'), load);
    expect(p).toMatchObject({ ok: true, switched: true, target: { typeName: 'CustomerPaymentStatusReportV15' } });
  });

  it('reports a body that does not belong to the namespace it names', async () => {
    const xml = USER_XML.replace(/CstmrPmtStsRpt/g, 'CstmrCdtTrfInitn');
    expect(err(await planPaste(xml, current('pain.002.001.15'), load))).toMatchObject({ code: 'parse', issue: { code: 'wrong_body' }, expected: 'CstmrPmtStsRpt' });
  });

  it('still loads what it can and lists what it could not place', async () => {
    const xml = USER_XML.replace('<GrpSts>ABCD</GrpSts>', '<GrpSts>ABCD</GrpSts><Mystery>1</Mystery>');
    const p = await planPaste(xml, current('pain.002.001.15'), load);
    expect(p).toMatchObject({ ok: true, issues: [{ code: 'unknown_element', path: 'OriginalGroupInformationAndStatus.Mystery' }] });
  });
});

describe('a whole message without a namespace, and ISO JSON', () => {
  const b002 = () => bundles.get('pain.002.001.15')!;
  const json = () => serializeToIsoJson(b002().message, { GroupHeader: { MessageIdentification: 'J1' } });

  it('XML without a namespace loads into the selected message, never switches', async () => {
    const xml = USER_XML.replace(' xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.15"', '');
    expect(await planPaste(xml, current('pain.002.001.15'), load)).toMatchObject({ ok: true, switched: false });
    const other = xml.replace(/CstmrPmtStsRpt/g, 'CstmrCdtTrfInitn');
    expect(err(await planPaste(other, current('pain.002.001.15'), load))).toMatchObject({ code: 'parse', issue: { code: 'wrong_body' } });
  });

  it('JSON loads into the selected message', async () => {
    const p = await planPaste(json(), current('pain.002.001.15'), load);
    expect(p).toMatchObject({ ok: true, format: 'json', switched: false, issues: [] });
  });

  it('JSON for another message is an error, not a switch (JSON has no namespace)', async () => {
    const other = serializeToIsoJson(bundles.get('pain.001.001.13')!.message, {});
    expect(err(await planPaste(other, current('pain.002.001.15'), load))).toMatchObject({ code: 'parse', issue: { code: 'wrong_body' }, expected: 'CstmrPmtStsRpt' });
  });

  it('a whole message cannot go into a component when it declares no namespace', async () => {
    expect(err(await planPaste(json(), current('pain.002.001.15', 'GroupHeader128'), load))).toEqual({ code: 'whole_message_for_part', typeName: 'GroupHeader128' });
  });
});

describe('a single component', () => {
  const b = () => bundles.get('pain.001.001.13')!;
  const T = 'BranchAndFinancialInstitutionIdentification8';
  const value = { FinancialInstitutionIdentification: { BICFI: 'DEUTDEFF' } };

  it('loads into the selected component, in both formats', async () => {
    for (const text of [serializeFragment(b().typeDescriptors, T, value), serializeFragmentIsoJson(b().typeDescriptors, T, value)]) {
      const p = await planPaste(text, current('pain.001.001.13', T), load);
      expect(p).toMatchObject({ ok: true, switched: false, target: { typeName: T } });
      expect(((p as Extract<PastePlan, { ok: true }>).values as typeof value).FinancialInstitutionIdentification.BICFI).toBe('DEUTDEFF');
    }
  });

  it('refuses a different component, or one pasted into the whole message', async () => {
    const xml = serializeFragment(b().typeDescriptors, T, value);
    expect(err(await planPaste(xml, current('pain.001.001.13', 'GroupHeader114'), load))).toEqual({ code: 'fragment_mismatch', found: T, typeName: 'GroupHeader114' });
    expect(err(await planPaste(xml, current('pain.001.001.13'), load))).toMatchObject({ code: 'fragment_mismatch', typeName: 'CustomerCreditTransferInitiationV13' });
  });
});
