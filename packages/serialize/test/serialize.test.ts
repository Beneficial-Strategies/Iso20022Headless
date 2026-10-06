import { describe, expect, it } from 'vitest';
import { pain001Message } from '@beneficial-strategies/iso20022-validate/pain001';
import { serializeToXml } from '../src/index.ts';

describe('serializeToXml', () => {
  it('writes tags in spec order, Ccy attribute, and escapes text', () => {
    const xml = serializeToXml(pain001Message, {
      GroupHeader: { MessageIdentification: 'A&B', NumberOfTransactions: '1', InitiatingParty: { Name: 'X' } },
      PaymentInformation: [
        {
          PaymentMethod: 'TRF',
          RequestedExecutionDate: { Date: '2026-10-06' },
          CreditTransferTransactionInformation: [
            { Amount: { InstructedAmount: { Ccy: 'EUR', Value: '10.00' } } },
          ],
        },
      ],
    });
    expect(xml).toContain('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.13">');
    expect(xml).toContain('<MsgId>A&amp;B</MsgId>');
    expect(xml).toContain('<InstdAmt Ccy="EUR">10.00</InstdAmt>');
    expect(xml.indexOf('<MsgId>')).toBeLessThan(xml.indexOf('<NbOfTxs>'));
    expect(xml).toContain('<ReqdExctnDt>\n');
    expect(xml).toContain('<Dt>2026-10-06</Dt>');
  });
});
