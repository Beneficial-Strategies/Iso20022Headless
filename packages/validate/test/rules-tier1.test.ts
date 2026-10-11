import { describe, expect, it } from 'vitest';
import { evaluateRules, ruleCodeLists } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';

/**
 * Behavior of the tracker rules that tier 1 added. They reach through `TrackerStatusAndTransaction[*]/Transaction[*]/...`, a list
 * inside a list. rule-satisfiability.test.ts proves each can pass and fail; this pins which input does which.
 */
const ctx = { types: allTypeDescriptors, codeLists: ruleCodeLists };
const run = (type: string, rule: string, instance: unknown): string => {
  const r = evaluateRules(ctx, type, instance).filter((x) => x.rule === rule && x.instancePath === '');
  expect(r, `${type}.${rule} was evaluated`).toHaveLength(1);
  return r[0]!.status;
};
const PARTY = { Identification: { Name: 'Tracker party' } };
const REASON = { Reason: { Code: 'AC01' } };

describe('PaymentStatusTrackerUpdateV05: who informs and who is informed is given in the group header or per transaction', () => {
  const T = 'PaymentStatusTrackerUpdateV05';
  const perTx = (key: string) => ({ TrackerStatusAndTransaction: [{ Transaction: [{ [key]: PARTY }] }] });

  it('TrackerInformingPartyRule: the informing party must be somewhere', () => {
    expect(run(T, 'TrackerInformingPartyRule', { GroupHeader: { TrackerInformingParty: PARTY } })).toBe('pass');
    expect(run(T, 'TrackerInformingPartyRule', perTx('TrackerInformingParty'))).toBe('pass');
    expect(run(T, 'TrackerInformingPartyRule', { GroupHeader: {}, TrackerStatusAndTransaction: [{ Transaction: [{}] }] })).toBe('fail');
  });

  it('TrackerInformedPartyRule: an informed party in the header excludes one in a transaction', () => {
    expect(run(T, 'TrackerInformedPartyRule', { GroupHeader: { TrackerInformedParty: PARTY }, ...perTx('TrackerInformedParty') })).toBe('fail');
    expect(run(T, 'TrackerInformedPartyRule', { GroupHeader: { TrackerInformedParty: PARTY } })).toBe('pass');
    expect(run(T, 'TrackerInformedPartyRule', perTx('TrackerInformedParty'))).toBe('pass');
  });

  it('TrackerInformingParty2Rule: an informing party in the header excludes one in a transaction', () => {
    expect(run(T, 'TrackerInformingParty2Rule', { GroupHeader: { TrackerInformingParty: PARTY }, ...perTx('TrackerInformingParty') })).toBe('fail');
    expect(run(T, 'TrackerInformingParty2Rule', { GroupHeader: { TrackerInformingParty: PARTY } })).toBe('pass');
    expect(run(T, 'TrackerInformingParty2Rule', perTx('TrackerInformingParty'))).toBe('pass');
  });
});

describe('TrackerStatusAndTransaction21 and 22: the reject or return reason is given on the status or on its transactions, not both', () => {
  for (const T of ['TrackerStatusAndTransaction21', 'TrackerStatusAndTransaction22']) {
    it(`${T}.RejectReturnReasonRule`, () => {
      const onStatus = { TransactionStatus: { RejectReturnReason: [REASON] } };
      const onTx = { Transaction: [{ RejectReturnReason: [REASON] }] };
      expect(run(T, 'RejectReturnReasonRule', { ...onStatus, ...onTx })).toBe('fail');
      expect(run(T, 'RejectReturnReasonRule', onStatus)).toBe('pass');
      expect(run(T, 'RejectReturnReasonRule', onTx)).toBe('pass');
    });
  }
});
