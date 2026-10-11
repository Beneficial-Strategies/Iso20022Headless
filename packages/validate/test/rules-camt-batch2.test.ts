import { describe, expect, it } from 'vitest';
import { evaluateRules, ruleCodeLists } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';

/**
 * Behavior of the charges rules that camt batch 2 added. Each says "when the group header gives X, the charges blocks must not give
 * it" (or the reverse), and reaches through `Charges/PerType[*]/Record[*]`, a list inside a list. rule-satisfiability.test.ts proves
 * each can pass and fail; this pins which input does which.
 */
const ctx = { types: allTypeDescriptors, codeLists: ruleCodeLists };
const run = (type: string, rule: string, instance: unknown): string => {
  const r = evaluateRules(ctx, type, instance).filter((x) => x.rule === rule && x.instancePath === '');
  expect(r, `${type}.${rule} was evaluated`).toHaveLength(1);
  return r[0]!.status;
};
const ACCOUNT = { Identification: { Other: { Identification: 'ACC-1' } } };
const OWNER = { Name: 'Owner' };
const AGENT = { FinancialInstitutionIdentification: { BICFI: 'AAAAUS33' } };

describe('ChargesPaymentNotificationV03: the charges account is given in the group header or in the charges, not both', () => {
  const T = 'ChargesPaymentNotificationV03';
  const perType = (extra: object, record?: object) => ({ Charges: { PerType: [{ ...extra, ...(record ? { Record: [record] } : {}) }] } });

  it('ChargesAccountHeaderOrType1Rule: with an account in the header, none may be given per type or per record', () => {
    expect(run(T, 'ChargesAccountHeaderOrType1Rule', { GroupHeader: { ChargesAccount: ACCOUNT }, ...perType({ ChargesAccount: ACCOUNT }) })).toBe('fail');
    expect(run(T, 'ChargesAccountHeaderOrType1Rule', { GroupHeader: { ChargesAccountOwner: OWNER }, ...perType({}, { ChargesAccountOwner: OWNER }) })).toBe('fail');
    expect(run(T, 'ChargesAccountHeaderOrType1Rule', { GroupHeader: { ChargesAccount: ACCOUNT }, ...perType({}) })).toBe('pass');
    expect(run(T, 'ChargesAccountHeaderOrType1Rule', perType({ ChargesAccount: ACCOUNT }))).toBe('pass'); // no header account: the rule does not apply
  });

  it('ChargesAccountHeaderOrType2Rule: with an account per type or per record, none may be given in the header', () => {
    expect(run(T, 'ChargesAccountHeaderOrType2Rule', { GroupHeader: { ChargesAccount: ACCOUNT }, ...perType({ ChargesAccount: ACCOUNT }) })).toBe('fail');
    expect(run(T, 'ChargesAccountHeaderOrType2Rule', { GroupHeader: { ChargesAccountOwner: OWNER }, ...perType({}, { ChargesAccount: ACCOUNT }) })).toBe('fail');
    expect(run(T, 'ChargesAccountHeaderOrType2Rule', { GroupHeader: {}, ...perType({ ChargesAccount: ACCOUNT }) })).toBe('pass');
    expect(run(T, 'ChargesAccountHeaderOrType2Rule', { GroupHeader: { ChargesAccount: ACCOUNT }, ...perType({}) })).toBe('pass');
  });
});

describe('ChargesPaymentRequestV03: the charges account agent and the requestor are given in the group header or in the charges, not both', () => {
  const T = 'ChargesPaymentRequestV03';
  const perType = (extra: object, record?: object) => ({ Charges: { PerType: [{ ...extra, ...(record ? { Record: [record] } : {}) }] } });

  it('ChargesAccountAgentHeaderOrType1Rule and ...Type2Rule are the two directions of the same exclusion', () => {
    expect(run(T, 'ChargesAccountAgentHeaderOrType1Rule', { GroupHeader: { ChargesAccountAgent: AGENT }, ...perType({ ChargesAccountAgent: AGENT }) })).toBe('fail');
    expect(run(T, 'ChargesAccountAgentHeaderOrType1Rule', { GroupHeader: { ChargesAccountAgent: AGENT }, ...perType({}) })).toBe('pass');
    expect(run(T, 'ChargesAccountAgentHeaderOrType2Rule', { GroupHeader: { ChargesAccountAgent: AGENT }, ...perType({}, { ChargesAccountAgent: AGENT }) })).toBe('fail');
    expect(run(T, 'ChargesAccountAgentHeaderOrType2Rule', { GroupHeader: {}, ...perType({}, { ChargesAccountAgent: AGENT }) })).toBe('pass');
  });

  it('ChargesRequestorGroupHeaderRule: a requestor in the header excludes one in a single charge or in any record', () => {
    const REQ = { Name: 'Requestor' };
    expect(run(T, 'ChargesRequestorGroupHeaderRule', { GroupHeader: { ChargesRequestor: REQ }, Charges: { Single: { ChargesRequestor: REQ } } })).toBe('fail');
    expect(run(T, 'ChargesRequestorGroupHeaderRule', { GroupHeader: { ChargesRequestor: REQ }, ...perType({}, { ChargesRequestor: REQ }) })).toBe('fail');
    expect(run(T, 'ChargesRequestorGroupHeaderRule', { GroupHeader: { ChargesRequestor: REQ }, Charges: { Single: {} } })).toBe('pass');
    expect(run(T, 'ChargesRequestorGroupHeaderRule', { GroupHeader: {}, Charges: { Single: { ChargesRequestor: REQ } } })).toBe('pass');
  });
});
