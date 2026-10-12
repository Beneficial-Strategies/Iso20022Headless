import { describe, expect, it } from 'vitest';
import { evaluateRules, ruleCodeLists } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';

/**
 * Corporate action rules over a list: "If one occurrence of OfferType is DISS, no occurrence may be NDIS". They need two list items
 * to fail, which the one-item search of rule-satisfiability.test.ts does not build; this shows by behavior that they fail and pass.
 */
const ctx = { types: allTypeDescriptors, codeLists: ruleCodeLists };
const status = (type: string, rule: string, instance: unknown): string | undefined =>
  evaluateRules(ctx, type, instance).find((x) => x.rule === rule && x.instancePath === '')?.status;

describe.each(['CorporateAction88', 'CorporateAction87', 'CorporateAction94', 'CorporateActionOption245', 'CorporateActionOption247', 'CorporateActionOption252'])('%s dissenter rights', (type) => {
  const items = (...codes: string[]) => ({ OfferType: codes.map((Code) => ({ Code })) });
  it('DISS and NDIS in two occurrences of OfferType fail both rules, either alone or with other codes passes', () => {
    expect(status(type, 'DissenterRights1Rule', items('DISS', 'NDIS'))).toBe('fail');
    expect(status(type, 'DissenterRights2Rule', items('DISS', 'NDIS'))).toBe('fail');
    for (const only of [['DISS'], ['NDIS'], ['DISS', 'ABCD'], ['NDIS', 'ABCD'], []]) {
      expect(status(type, 'DissenterRights1Rule', items(...only)), only.join()).toBe('pass');
      expect(status(type, 'DissenterRights2Rule', items(...only)), only.join()).toBe('pass');
    }
  });
});
