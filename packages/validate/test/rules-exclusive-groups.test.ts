import { describe, expect, it } from 'vitest';
import { evaluateRules, ruleCodeLists } from '../src/index.ts';
import { allTypeDescriptors } from '../src/generated/all.ts';

/**
 * Members of which only one may be present (the repository's `xors` constraints; ISO's schema writes them as an xs:choice inside the
 * component). When each member is mandatory on its own, they are optional here and the group's rules say exactly one; when each may be
 * left out, the rules say not more than one.
 */
const ctx = { types: allTypeDescriptors, codeLists: ruleCodeLists };
const statuses = (type: string, instance: unknown): Record<string, string> =>
  Object.fromEntries(evaluateRules(ctx, type, instance).filter((x) => x.instancePath === '').map((x) => [x.rule, x.status]));

describe('exactly one of two (Intermediary11: Role or ExtendedRole, optional)', () => {
  const type = 'Intermediary11';
  it('the members are optional', () => {
    const fields = allTypeDescriptors[type]!.fields!;
    expect(fields.find((f) => f.name === 'Role')!.required).toBe(false);
    expect(fields.find((f) => f.name === 'ExtendedRole')!.required).toBe(false);
  });
  it('none or one passes, both fails', () => {
    expect(statuses(type, {}).RoleOrExtendedRoleRule).toBe('pass');
    expect(statuses(type, { Role: 'CUST' }).RoleOrExtendedRoleRule).toBe('pass');
    expect(statuses(type, { ExtendedRole: 'X' }).RoleOrExtendedRoleRule).toBe('pass');
    expect(statuses(type, { Role: 'CUST', ExtendedRole: 'X' }).RoleOrExtendedRoleRule).toBe('fail');
  });
});

describe('one of two must be present (UnitPrice11: Type or ExtendedType)', () => {
  const type = 'UnitPrice11';
  it('the members are optional on their own', () => {
    const fields = allTypeDescriptors[type]!.fields!;
    expect(fields.find((f) => f.name === 'Type')!.required).toBe(false);
    expect(fields.find((f) => f.name === 'ExtendedType')!.required).toBe(false);
  });
  it('one passes; none fails (at least one), both fails (not both)', () => {
    const rule = (v: unknown) => statuses(type, v);
    expect(rule({ Type: 'MRKT' })).toMatchObject({ TypeOrExtendedTypeRule: 'pass', TypeOrExtendedTypeRuleNotBoth: 'pass' });
    expect(rule({ ExtendedType: 'X' })).toMatchObject({ TypeOrExtendedTypeRule: 'pass', TypeOrExtendedTypeRuleNotBoth: 'pass' });
    expect(rule({})).toMatchObject({ TypeOrExtendedTypeRule: 'fail', TypeOrExtendedTypeRuleNotBoth: 'pass' });
    expect(rule({ Type: 'MRKT', ExtendedType: 'X' })).toMatchObject({ TypeOrExtendedTypeRule: 'pass', TypeOrExtendedTypeRuleNotBoth: 'fail' });
  });
});

describe('one of four must be present (InvestmentFundTransaction3)', () => {
  const type = 'InvestmentFundTransaction3';
  const names = ['TransactionType', 'ExtendedTransactionType', 'CorporateActionEventType', 'ExtendedCorporateActionEventType'];
  const rules = (v: unknown) => statuses(type, v);
  it('one of them passes every rule of the group, none fails, any two fail', () => {
    for (const n of names) {
      const s = rules({ [n]: 'X' });
      expect(Object.entries(s).filter(([k]) => /OrExtended|NotBoth/.test(k) && s[k] !== 'pass'), n).toEqual([]);
    }
    expect(Object.values(rules({})).includes('fail')).toBe(true);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) expect(Object.values(rules({ [names[i]!]: 'X', [names[j]!]: 'Y' })).includes('fail'), `${names[i]} and ${names[j]}`).toBe(true);
  });
});
