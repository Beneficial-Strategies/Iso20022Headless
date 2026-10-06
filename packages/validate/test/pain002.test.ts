import { describe, expect, it } from 'vitest';
import { evaluateRules, formatIssues, messageIndex, ruleCodeLists } from '../src/index.ts';
import { pain001Message, schemas as schemas001, typeDescriptors as types001 } from '../src/generated/pain001.ts';
import { pain002Message, schemas as schemas002, typeDescriptors as types002 } from '../src/generated/pain002.ts';

const sample = () => ({
  GroupHeader: { MessageIdentification: 'STS-1', CreationDateTime: '2026-10-06T10:00:00Z' },
  OriginalGroupInformationAndStatus: {
    OriginalMessageIdentification: 'MSG-001',
    OriginalMessageNameIdentification: 'pain.001.001.13',
    GroupStatus: 'RJCT',
  },
  OriginalPaymentInformationAndStatus: [{ OriginalPaymentInformationIdentification: 'PMT-1', PaymentInformationStatus: 'RJCT' }],
});

const errors = (v: unknown) => {
  const r = pain002Message.schema.safeParse(v);
  return r.success ? {} : formatIssues(r.error);
};
const ctx = { types: types002, codeLists: ruleCodeLists };
const results = (v: unknown) => evaluateRules(ctx, pain002Message.rootType, v);
const status = (v: unknown, rule: string) => results(v).find((r) => r.rule === rule)?.status;

describe('the message registry', () => {
  it('lists both messages and loads each on demand', async () => {
    expect(messageIndex.map((m) => m.identifier)).toEqual(['pain.001.001.13', 'pain.002.001.15']);
    const loaded = await Promise.all(messageIndex.map((m) => m.load()));
    expect(loaded.map((b) => b.message.identifier)).toEqual(['pain.001.001.13', 'pain.002.001.15']);
    for (const b of loaded) expect(Object.keys(b.schemas).length).toBeGreaterThan(40);
  });
});

describe('types shared between messages are emitted once', () => {
  it('a shared type is the very same object in both messages', () => {
    for (const name of ['PartyIdentification272', 'PostalAddress27', 'SupplementaryData1', 'BranchAndFinancialInstitutionIdentification8']) {
      expect(types002[name], name).toBeDefined();
      expect(types002[name], name).toBe(types001[name]);
      expect(schemas002[name as keyof typeof schemas002], name).toBe(schemas001[name as keyof typeof schemas001]);
    }
  });

  it('each message also has types of its own', () => {
    expect(types002.OriginalGroupHeader22).toBeDefined();
    expect(types001.OriginalGroupHeader22).toBeUndefined();
    expect(types001.PaymentInstruction51).toBeDefined();
    expect(types002.PaymentInstruction51).toBeUndefined();
  });

  it('most of pain.002 is reused from pain.001', () => {
    const shared = Object.keys(types002).filter((n) => types001[n] === types002[n]);
    expect(shared.length / Object.keys(types002).length).toBeGreaterThan(0.7);
  });
});

describe('pain.002.001.15 validation', () => {
  it('is the status report message', () => {
    expect(pain002Message.identifier).toBe('pain.002.001.15');
    expect(pain002Message.bodyTag).toBe('CstmrPmtStsRpt');
    expect(pain001Message.bodyTag).toBe('CstmrCdtTrfInitn');
  });

  it('accepts a minimal status report', () => {
    expect(errors(sample())).toEqual({});
  });

  it('requires the group header and the original group information, at their own paths', () => {
    const e = errors({});
    expect(Object.keys(e).sort()).toEqual(['GroupHeader', 'OriginalGroupInformationAndStatus']);
    const e2 = errors({ GroupHeader: {}, OriginalGroupInformationAndStatus: {} });
    expect(e2['GroupHeader.MessageIdentification']).toBe('Required');
    expect(e2['OriginalGroupInformationAndStatus.OriginalMessageIdentification']).toBe('Required');
  });

  it('OriginalPaymentInformationAndStatus may repeat or be absent; items are validated', () => {
    const { OriginalPaymentInformationAndStatus: _omit, ...without } = sample();
    expect(errors(without)).toEqual({});
    const bad = { ...sample(), OriginalPaymentInformationAndStatus: [{ OriginalPaymentInformationIdentification: 'x'.repeat(40) }] };
    expect(errors(bad)['OriginalPaymentInformationAndStatus[0].OriginalPaymentInformationIdentification']).toBe('Must be at most 35 characters');
  });

  it('a new Choice (status reason: code or proprietary) accepts exactly one alternative', () => {
    const withReason = (reason: unknown) => ({
      ...sample(),
      OriginalGroupInformationAndStatus: { ...sample().OriginalGroupInformationAndStatus, StatusReasonInformation: [{ Reason: reason }] },
    });
    expect(errors(withReason({ Code: 'AC01' }))).toEqual({});
    expect(errors(withReason({ Proprietary: 'MY-REASON' }))).toEqual({});
    expect(Object.keys(errors(withReason({ Code: 'AC01', Proprietary: 'X' }))).length).toBeGreaterThan(0);
  });

  it('a new code set is enforced (SettlementMethod: wire values, not names)', () => {
    const ok = types002.SettlementMethod1Code?.options?.map((o) => o.value).sort();
    expect(ok).toEqual(['CLRG', 'COVE', 'INDA', 'INGA']);
  });
});

describe('pain.002.001.15 business rules', () => {
  it('lists the message-level rules on the message root, with the 5 captured rules', () => {
    const rules = types002[pain002Message.rootType]!.rules!;
    expect(rules.map((r) => r.name).sort()).toEqual(['GroupStatusAcceptedRule', 'GroupStatusPendingRule', 'GroupStatusReceivedRule', 'GroupStatusRejectedRule', 'SupplementaryDataRule']);
  });

  it('message-level rules are checked against the message itself', () => {
    const r = results(sample()).filter((x) => x.rule.startsWith('GroupStatus'));
    expect(r).toHaveLength(4);
    expect(r.every((x) => x.instancePath === '')).toBe(true);
    expect(r.every((x) => x.status === 'pass' || x.status === 'fail')).toBe(true); // none unsupported: the status code lists are available
  });

  it('GroupStatusRejectedRule: a rejected group may not contain a payment with another status', () => {
    expect(status(sample(), 'GroupStatusRejectedRule')).toBe('pass');
    const bad = { ...sample(), OriginalPaymentInformationAndStatus: [{ OriginalPaymentInformationIdentification: 'PMT-1', PaymentInformationStatus: 'ACCP' }] };
    expect(status(bad, 'GroupStatusRejectedRule')).toBe('fail');
  });

  it('GroupStatusReceivedRule: a received group has no payment information status', () => {
    const received = (pmtStatus?: string) => ({
      ...sample(),
      OriginalGroupInformationAndStatus: { ...sample().OriginalGroupInformationAndStatus, GroupStatus: 'RCVD' },
      OriginalPaymentInformationAndStatus: [{ OriginalPaymentInformationIdentification: 'PMT-1', ...(pmtStatus ? { PaymentInformationStatus: pmtStatus } : {}) }],
    });
    expect(status(received(), 'GroupStatusReceivedRule')).toBe('pass');
    expect(status(received('RCVD'), 'GroupStatusReceivedRule')).toBe('fail');
  });

  it('GroupStatusPendingRule: a pending group may not contain a rejected payment', () => {
    const pending = (pmtStatus: string) => ({
      ...sample(),
      OriginalGroupInformationAndStatus: { ...sample().OriginalGroupInformationAndStatus, GroupStatus: 'PDNG' },
      OriginalPaymentInformationAndStatus: [{ OriginalPaymentInformationIdentification: 'PMT-1', PaymentInformationStatus: pmtStatus }],
    });
    expect(status(pending('ACCP'), 'GroupStatusPendingRule')).toBe('pass');
    expect(status(pending('RJCT'), 'GroupStatusPendingRule')).toBe('fail');
  });

  it('guidelines and rules without an expression are prose-only', () => {
    expect(status(sample(), 'SupplementaryDataRule')).toBe('prose-only');
    expect(status(sample(), 'NumberOfTransactionPerStatusGuideline')).toBe('prose-only');
  });
});
