import { XMLParser } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { pain001Message } from '@beneficial-strategies/iso20022-validate';
import { serializeFragmentIsoJson, serializeToIsoJson, serializeToXml } from '../src/index.ts';

const sample = () => ({
  GroupHeader: {
    MessageIdentification: 'MSG-001',
    CreationDateTime: '2026-10-05T09:30:00Z',
    NumberOfTransactions: '3',
    ControlSum: '350.75',
    InitiatingParty: { Name: 'Acme Corp & Sons' },
  },
  PaymentInformation: [
    {
      PaymentInformationIdentification: 'PMT-1',
      PaymentMethod: 'TRF',
      BatchBooking: 'true',
      RequestedExecutionDate: { Date: '2026-10-06' },
      Debtor: { Name: 'Acme Corp' },
      DebtorAccount: { Identification: { IBAN: 'DE89370400440532013000' } },
      DebtorAgent: { FinancialInstitutionIdentification: { BICFI: 'COBADEFFXXX' } },
      CreditTransferTransactionInformation: [
        { PaymentIdentification: { EndToEndIdentification: 'E2E-1' }, Amount: { InstructedAmount: { Ccy: 'EUR', Value: '100.50' } } },
        { PaymentIdentification: { EndToEndIdentification: 'E2E-2' }, Amount: { InstructedAmount: { Ccy: 'USD', Value: '250.25' } } },
      ],
    },
    {
      PaymentInformationIdentification: 'PMT-2',
      PaymentMethod: 'CHK',
      RequestedExecutionDate: { DateTime: '2026-10-07T00:00:00Z' },
      Debtor: { Name: 'Acme Corp' },
      DebtorAccount: { Identification: { Other: { Identification: 'ACC-9' } } },
      DebtorAgent: { FinancialInstitutionIdentification: { Name: 'Some Bank' } },
      CreditTransferTransactionInformation: [
        { PaymentIdentification: { EndToEndIdentification: 'E2E-3' }, Amount: { InstructedAmount: { Ccy: 'EUR', Value: '0.00' } } }, // exactly one item
      ],
    },
  ],
});

const iso = () => JSON.parse(serializeToIsoJson(pain001Message, sample()));

describe('ISO 20022 JSON output', () => {
  it('has the Document root and the message element, with no namespace', () => {
    const j = iso();
    expect(Object.keys(j)).toEqual(['Document']);
    expect(Object.keys(j.Document)).toEqual(['CstmrCdtTrfInitn']);
    expect(JSON.stringify(j)).not.toMatch(/xmlns|urn:iso|@/);
  });

  it('uses the abbreviated XML tags, in message order', () => {
    const body = iso().Document.CstmrCdtTrfInitn;
    expect(Object.keys(body)).toEqual(['GrpHdr', 'PmtInf']);
    expect(Object.keys(body.GrpHdr)).toEqual(['MsgId', 'CreDtTm', 'NbOfTxs', 'CtrlSum', 'InitgPty']);
    expect(JSON.stringify(body)).not.toContain('MessageIdentification');
  });

  it('writes repeatable elements as arrays, even with a single item', () => {
    const body = iso().Document.CstmrCdtTrfInitn;
    expect(Array.isArray(body.PmtInf)).toBe(true);
    expect(body.PmtInf).toHaveLength(2);
    expect(body.PmtInf[1].CdtTrfTxInf).toHaveLength(1);
    expect(Array.isArray(body.GrpHdr)).toBe(false); // exactly-one elements are plain objects
  });

  it('writes amounts as { amt, Ccy } with the amount as a string', () => {
    const tx = iso().Document.CstmrCdtTrfInitn.PmtInf[0].CdtTrfTxInf[0];
    expect(tx.Amt).toEqual({ InstdAmt: { amt: '100.50', Ccy: 'EUR' } });
  });

  it('every leaf is a string: decimals, indicators, dates and codes', () => {
    const body = iso().Document.CstmrCdtTrfInitn;
    expect(body.GrpHdr.CtrlSum).toBe('350.75');
    expect(body.GrpHdr.NbOfTxs).toBe('3');
    expect(body.PmtInf[0].BtchBookg).toBe('true');
    expect(body.PmtInf[0].PmtMtd).toBe('TRF');
    const leaves: unknown[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      else leaves.push(v);
    };
    walk(body);
    expect(leaves.every((x) => typeof x === 'string')).toBe(true);
  });

  it('a Choice holds only the chosen alternative', () => {
    const [a, b] = iso().Document.CstmrCdtTrfInitn.PmtInf;
    expect(a.ReqdExctnDt).toEqual({ Dt: '2026-10-06' });
    expect(b.ReqdExctnDt).toEqual({ DtTm: '2026-10-07T00:00:00Z' });
    expect(Object.keys(a.DbtrAcct.Id)).toEqual(['IBAN']);
    expect(Object.keys(b.DbtrAcct.Id)).toEqual(['Othr']);
  });

  it('absent and empty elements are omitted', () => {
    const j = JSON.parse(serializeToIsoJson(pain001Message, { GroupHeader: { MessageIdentification: 'M', Authorisation: [], ControlSum: '' } }));
    expect(j.Document.CstmrCdtTrfInitn.GrpHdr).toEqual({ MsgId: 'M' });
    expect(JSON.parse(serializeToIsoJson(pain001Message, {})).Document.CstmrCdtTrfInitn).toEqual({});
  });

  it('an xs:any envelope embeds valid JSON as JSON, anything else as a string', () => {
    const wrap = (envelope: string) => ({ SupplementaryData: [{ Envelope: envelope }] });
    const ok = JSON.parse(serializeToIsoJson(pain001Message, wrap('{"Custom":{"a":1}}'))).Document.CstmrCdtTrfInitn.SplmtryData[0].Envlp;
    expect(ok).toEqual({ Custom: { a: 1 } });
    const raw = JSON.parse(serializeToIsoJson(pain001Message, wrap('<x/>'))).Document.CstmrCdtTrfInitn.SplmtryData[0].Envlp;
    expect(raw).toBe('<x/>');
  });

  it('a single component or choice can be shown on its own', () => {
    const j = JSON.parse(serializeFragmentIsoJson(pain001Message.typeDescriptors, 'PostalAddress27', { TownName: 'Paris', Country: 'FR', AddressLine: ['1 Rue A', '2 Rue B'] }));
    expect(j).toEqual({ PostalAddress27: { TwnNm: 'Paris', Ctry: 'FR', AdrLine: ['1 Rue A', '2 Rue B'] } });
    expect(JSON.parse(serializeFragmentIsoJson(pain001Message.typeDescriptors, 'PostalAddress27', undefined))).toEqual({ PostalAddress27: {} });
  });
});

/**
 * An independent implementation of the informative Annex A algorithm ("Converting ISO 20022 XML into JSON"), applied to
 * OUR XML output. Annex A collapses a lone value to a value; the schema allows both a value and an array for repeatable
 * elements, so our always-array output is compared after collapsing single-item arrays.
 */
describe('agrees with ISO Annex A applied to our XML', () => {
  const parser = new XMLParser({ ignoreAttributes: false, ignoreDeclaration: true, attributeNamePrefix: '@_', parseTagValue: false, removeNSPrefix: true, trimValues: true });

  function annexA(node: unknown): unknown {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(annexA);
    const o = node as Record<string, unknown>;
    if ('@_Ccy' in o) return { amt: o['#text'], Ccy: o['@_Ccy'] }; // element with a Ccy attribute
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) if (!k.startsWith('@_')) out[k] = annexA(v); // prefixes/attributes (xmlns) dropped
    return out;
  }
  const collapse = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.length === 1 ? collapse(v[0]) : v.map(collapse);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, collapse(x)]));
    return v;
  };

  it('same JSON as Annex A for a full sample message', () => {
    const fromXml = annexA(parser.parse(serializeToXml(pain001Message, sample())));
    const ours = collapse(iso());
    expect(ours).toEqual(fromXml);
  });

  it('same JSON for a sparse message', () => {
    const v = { GroupHeader: { MessageIdentification: 'M', InitiatingParty: { Name: 'X' } }, PaymentInformation: [{ PaymentMethod: 'TRF' }] };
    expect(collapse(JSON.parse(serializeToIsoJson(pain001Message, v)))).toEqual(annexA(parser.parse(serializeToXml(pain001Message, v))));
  });
});
