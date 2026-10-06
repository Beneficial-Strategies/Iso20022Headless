import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { pain002Message } from '@beneficial-strategies/iso20022-validate/pain002';
import { serializeToIsoJson, serializeToXml } from '../src/index.ts';

const sample = () => ({
  GroupHeader: { MessageIdentification: 'STS-1', CreationDateTime: '2026-10-05T09:30:00Z' },
  OriginalGroupInformationAndStatus: {
    OriginalMessageIdentification: 'MSG-001',
    OriginalMessageNameIdentification: 'pain.001.001.13',
    GroupStatus: 'RJCT',
  },
  OriginalPaymentInformationAndStatus: [
    { OriginalPaymentInformationIdentification: 'PMT-1', PaymentInformationStatus: 'ACCP' },
  ],
});

describe('pain.002 serialization', () => {
  it('writes XML in spec order under the pain.002 namespace and body tag', () => {
    const xml = serializeToXml(pain002Message, sample());
    expect(xml).toContain('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.002.001.15">');
    expect(xml).toContain('<CstmrPmtStsRpt>');
    expect(xml.indexOf('<GrpHdr>')).toBeLessThan(xml.indexOf('<OrgnlGrpInfAndSts>'));
    expect(xml.indexOf('<OrgnlGrpInfAndSts>')).toBeLessThan(xml.indexOf('<OrgnlPmtInfAndSts>'));
    expect(xml).toContain('<GrpSts>RJCT</GrpSts>');
  });

  it('parses back to the same content (XML) and nests under the message in ISO JSON', () => {
    const parsed = new XMLParser().parse(serializeToXml(pain002Message, sample()));
    expect(parsed.Document.CstmrPmtStsRpt.GrpHdr.MsgId).toBe('STS-1');
    expect(parsed.Document.CstmrPmtStsRpt.OrgnlPmtInfAndSts.PmtInfSts).toBe('ACCP');
    const json = JSON.parse(serializeToIsoJson(pain002Message, sample()));
    expect(JSON.stringify(json)).toContain('"GrpSts":"RJCT"');
    expect(JSON.stringify(json)).toContain('"MsgId":"STS-1"');
  });
});
