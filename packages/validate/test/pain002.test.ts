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
  const ALL = ['pain.001.001.13', 'pain.002.001.15', 'pain.007.001.13', 'pain.008.001.12', 'pain.009.001.08', 'pain.010.001.08', 'pain.011.001.08', 'pain.012.001.08', 'pain.013.001.12', 'pain.014.001.12', 'pain.017.001.04', 'pain.018.001.04', 'pacs.002.001.16', 'pacs.003.001.12', 'pacs.004.001.15', 'pacs.007.001.14', 'pacs.008.001.14', 'pacs.009.001.13', 'pacs.010.001.06', 'pacs.028.001.07', 'pacs.029.001.02', 'caam.001.001.05', 'caam.002.001.04', 'caam.003.001.05', 'caam.004.001.05', 'caam.005.001.03', 'caam.006.001.02', 'caam.007.001.01', 'caam.008.001.01', 'caam.009.001.03', 'caam.010.001.03', 'caam.011.001.02', 'caam.012.001.02', 'caam.013.001.01', 'caam.014.001.01', 'caam.015.001.01', 'caam.016.001.01', 'camt.003.001.08', 'camt.004.001.10', 'camt.005.001.11', 'camt.006.001.11', 'camt.007.001.10', 'camt.008.001.11', 'camt.009.001.08', 'camt.010.001.09', 'camt.011.001.08', 'camt.012.001.08', 'camt.013.001.04', 'camt.014.001.05', 'camt.015.001.04', 'camt.016.001.04', 'camt.017.001.05', 'camt.018.001.05', 'camt.019.001.07', 'camt.020.001.04', 'camt.021.001.06', 'camt.023.001.07', 'camt.024.001.08', 'camt.025.001.09', 'camt.026.001.10', 'camt.027.001.10', 'camt.028.001.12', 'camt.029.001.14', 'camt.030.001.06', 'camt.031.001.07', 'camt.032.001.05', 'camt.033.001.07', 'camt.034.001.07', 'camt.035.001.06', 'camt.036.001.06', 'camt.037.001.10', 'camt.038.001.05', 'camt.039.001.06', 'camt.040.001.04', 'camt.041.001.04', 'camt.042.001.04', 'camt.043.001.04', 'camt.044.001.03', 'camt.045.001.03', 'camt.046.001.08', 'camt.047.001.08', 'camt.048.001.07', 'camt.049.001.07', 'camt.050.001.07', 'camt.051.001.07', 'camt.052.001.14', 'camt.053.001.14', 'camt.054.001.14', 'camt.055.001.13', 'camt.056.001.12', 'camt.057.001.09', 'camt.058.001.10', 'camt.059.001.09', 'camt.060.001.07', 'camt.061.001.02', 'camt.062.001.03', 'camt.063.001.02', 'camt.064.001.01', 'camt.065.001.01', 'camt.066.001.02', 'camt.067.001.02', 'camt.068.001.02', 'camt.069.001.05', 'camt.070.001.06', 'camt.071.001.05', 'camt.072.001.02', 'camt.073.001.02', 'camt.074.001.02', 'camt.075.001.02', 'camt.076.001.01', 'camt.077.001.01', 'camt.078.001.02', 'camt.079.001.02', 'camt.080.001.02', 'camt.081.001.02', 'camt.082.001.02', 'camt.083.001.02', 'camt.084.001.02', 'camt.085.001.02', 'camt.086.001.05', 'camt.087.001.09', 'camt.088.001.04', 'camt.101.001.02', 'camt.102.001.03', 'camt.103.001.03', 'camt.104.001.01', 'camt.105.001.03', 'camt.106.001.03', 'camt.107.001.02', 'camt.108.001.02', 'camt.109.001.02', 'camt.110.001.02', 'camt.111.001.03', 'camt.113.001.01', 'camt.114.001.01', 'camt.115.001.01', 'camt.116.001.01', 'admi.002.001.01', 'admi.004.001.02', 'admi.005.001.02', 'admi.006.001.01', 'admi.007.001.01', 'admi.009.001.02', 'admi.010.001.02', 'admi.011.001.01', 'admi.017.001.02', 'admi.024.001.01', 'remt.001.001.07', 'remt.002.001.03', 'trck.001.001.05', 'trck.002.001.04', 'trck.004.001.04', 'acmt.001.001.08', 'acmt.002.001.08', 'acmt.003.001.08', 'acmt.005.001.06', 'acmt.006.001.07', 'acmt.007.001.05', 'acmt.008.001.05', 'acmt.009.001.04', 'acmt.010.001.04', 'acmt.011.001.04', 'acmt.012.001.04', 'acmt.013.001.04', 'acmt.014.001.05', 'acmt.015.001.05', 'acmt.016.001.05', 'acmt.017.001.05', 'acmt.018.001.05', 'acmt.019.001.04', 'acmt.020.001.04', 'acmt.021.001.04', 'acmt.022.001.04', 'acmt.023.001.04', 'acmt.024.001.04', 'acmt.027.001.06', 'acmt.028.001.06', 'acmt.029.001.06', 'acmt.030.001.04', 'acmt.031.001.06', 'acmt.032.001.06', 'acmt.033.001.02', 'acmt.034.001.06', 'acmt.035.001.02', 'acmt.036.001.01', 'acmt.037.001.02', 'head.001.001.04', 'semt.001.001.04', 'semt.002.001.12', 'semt.002.002.11', 'semt.003.001.12', 'semt.003.002.11', 'semt.004.001.02', 'semt.005.001.02', 'semt.006.001.02', 'semt.007.001.02', 'semt.013.001.07', 'semt.013.002.06', 'semt.014.001.09', 'semt.014.002.07', 'semt.015.001.10', 'semt.015.002.09', 'semt.016.001.10', 'semt.016.002.09', 'semt.017.001.14', 'semt.017.002.12', 'semt.018.001.15', 'semt.018.002.13', 'semt.019.001.12', 'semt.019.002.10', 'semt.020.001.07', 'semt.020.002.07', 'semt.021.001.09', 'semt.021.002.08', 'semt.022.001.07', 'semt.022.002.05', 'semt.023.001.02', 'semt.025.001.01', 'semt.026.001.01', 'semt.027.001.01', 'semt.028.001.01', 'semt.029.001.01', 'semt.030.001.01', 'semt.031.001.01', 'semt.032.001.01', 'semt.033.001.01', 'semt.034.001.01', 'semt.040.001.01', 'semt.041.001.02', 'semt.042.001.01', 'semt.044.001.01', 'seev.001.001.13', 'seev.002.001.10', 'seev.003.001.10', 'seev.004.001.11', 'seev.005.001.10', 'seev.006.001.12', 'seev.007.001.12', 'seev.008.001.10', 'seev.009.001.03', 'seev.010.001.01', 'seev.011.001.04', 'seev.012.001.01', 'seev.013.001.01', 'seev.014.001.01', 'seev.015.001.01', 'seev.016.001.01', 'seev.018.001.01', 'seev.019.001.01', 'seev.020.001.01', 'seev.022.001.01', 'seev.023.001.01', 'seev.024.001.01', 'seev.025.001.01', 'seev.026.001.01', 'seev.027.001.01', 'seev.028.001.01', 'seev.029.001.01', 'seev.030.001.01', 'seev.031.001.16', 'seev.031.002.15', 'seev.032.001.09', 'seev.032.002.09', 'seev.033.001.14', 'seev.033.002.13', 'seev.034.001.16', 'seev.034.002.15', 'seev.035.001.17', 'seev.035.002.16', 'seev.036.001.17', 'seev.036.002.16', 'seev.037.001.17', 'seev.037.002.16', 'seev.038.001.09', 'seev.038.002.09', 'seev.039.001.13', 'seev.039.002.13', 'seev.040.001.13', 'seev.040.002.13', 'seev.041.001.15', 'seev.041.002.14', 'seev.042.001.14', 'seev.042.002.13', 'seev.044.001.13', 'seev.044.002.13', 'seev.045.001.04', 'seev.046.001.01', 'seev.047.001.03', 'seev.048.001.01', 'seev.049.001.01', 'seev.050.001.04', 'seev.051.001.02', 'seev.052.001.04', 'seev.053.001.04', 'seev.060.001.01', 'seev.061.001.01', 'seev.062.001.01', 'seev.063.001.01', 'seev.064.001.01', 'seev.065.001.01', 'seev.066.001.01', 'seev.067.001.01', 'sese.001.001.10', 'sese.002.001.09', 'sese.003.001.10', 'sese.004.001.09', 'sese.005.001.10', 'sese.006.001.09', 'sese.007.001.10', 'sese.008.001.09', 'sese.009.001.09', 'sese.010.001.07', 'sese.011.001.10', 'sese.012.001.12', 'sese.013.001.12', 'sese.014.001.09', 'sese.018.001.10', 'sese.019.001.09', 'sese.020.001.09', 'sese.020.002.07', 'sese.021.001.08', 'sese.021.002.06', 'sese.022.001.08', 'sese.022.002.06', 'sese.023.001.13', 'sese.023.002.11', 'sese.024.001.14', 'sese.024.002.12', 'sese.025.001.13', 'sese.025.002.11', 'sese.026.001.12', 'sese.026.002.10', 'sese.027.001.09', 'sese.027.002.07', 'sese.028.001.12', 'sese.028.002.10', 'sese.029.001.08', 'sese.029.002.06', 'sese.030.001.10', 'sese.030.002.09', 'sese.031.001.11', 'sese.031.002.09', 'sese.032.001.13', 'sese.032.002.11', 'sese.033.001.13', 'sese.033.002.11', 'sese.034.001.11', 'sese.034.002.09', 'sese.035.001.13', 'sese.035.002.11', 'sese.036.001.10', 'sese.036.002.08', 'sese.037.001.09', 'sese.037.002.07', 'sese.038.001.11', 'sese.038.002.09', 'sese.039.001.08', 'sese.039.002.06', 'sese.040.001.06', 'sese.040.002.04', 'sese.041.001.02', 'sese.042.001.02', 'sese.043.001.02'];
  it('lists every message (pain, pacs, caam, camt, admi, remt, trck, acmt, head, semt, seev, then sese) and loads each on demand', async () => {
    expect(messageIndex.map((m) => m.identifier)).toEqual(ALL);
    expect(messageIndex.map((m) => m.module)).toEqual(ALL.map((id) => id.slice(0, 8).replace('.', '') + (id.split('.')[2] === '001' ? '' : `f${Number(id.split('.')[2])}`))); // a second flavour of a message is `semt002f2`
    const loaded = await Promise.all(messageIndex.map((m) => m.load()));
    expect(loaded.map((b) => b.message.identifier)).toEqual(ALL);
    for (const b of loaded) expect(Object.keys(b.schemas).length).toBeGreaterThan(1);
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

describe('package entry points', () => {
  it('every message in the registry can be imported as @beneficial-strategies/iso20022-validate/<module>', async () => {
    const { readFileSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    for (const m of messageIndex) expect(pkg.exports[`./${m.module}`], m.module).toBe(`./src/generated/${m.module}.ts`);
  });
});

describe('status reason rule: a list inside a list (reported by a user)', () => {
  // GroupStatus is not RJCT or PDNG, so StatusReasonInformation/AdditionalInformation must be absent.
  const msg = (groupStatus: string, reasons?: unknown) => ({
    GroupHeader: { MessageIdentification: '87787878878778877', CreationDateTime: '2026-10-06T15:44:55-05:00' },
    OriginalGroupInformationAndStatus: {
      OriginalMessageIdentification: '54465464646554',
      OriginalMessageNameIdentification: 'hhhjjjjjj',
      GroupStatus: groupStatus,
      ...(reasons ? { StatusReasonInformation: reasons } : {}),
    },
  });
  const rule = (v: unknown) => results(v).find((r) => r.rule === 'StatusReasonInformationRule' && r.instancePath === 'OriginalGroupInformationAndStatus')?.status;

  it('fails for the reported message: status ABCD with additional information', () => {
    expect(rule(msg('ABCD', [{ AdditionalInformation: ['It just failed.'] }]))).toBe('fail');
  });
  it('passes for RJCT or PDNG, and without additional information', () => {
    expect(rule(msg('RJCT', [{ AdditionalInformation: ['It just failed.'] }]))).toBe('pass');
    expect(rule(msg('PDNG', [{ AdditionalInformation: ['It just failed.'] }]))).toBe('pass');
    expect(rule(msg('ABCD'))).toBe('pass');
    expect(rule(msg('ABCD', [{ Reason: { Code: 'AC01' } }]))).toBe('pass');
  });
  it('finds additional information on a later status reason', () => {
    expect(rule(msg('ABCD', [{ Reason: { Code: 'AC01' } }, { AdditionalInformation: ['late'] }]))).toBe('fail');
  });
});
