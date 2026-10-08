import { describe, expect, it } from 'vitest';
import { evaluateExpression, ruleCodeLists, type RuleExpression } from '../src/index.ts';
import { allTypeDescriptors as types } from '../src/generated/all.ts';

/**
 * A rule that names a field the type does not have (a typo in the spec data, say) would read that field as absent for
 * ever and answer wrongly. The evaluator reports such a rule as "cannot be checked"; this test lists them, and lists
 * the ones we know about, so a new one is noticed.
 */
const ctx = { types, codeLists: ruleCodeLists };

/** Rules whose expression names a field that does not exist, with why. Reported as unsupported, never guessed. */
const KNOWN_SPEC_TYPOS: Record<string, string> = {
  'FIToFIPaymentReversalV14.TotalReversedInterbankSettlementAmountAndSumRule': 'the expression says ReversedInterbankSttlementAmount (missing "e"); the field is ReversedInterbankSettlementAmount',
  'PaymentReturnV15.TotalReturnedInterbankSettlementAmountAndSumRule': 'the expression says ReturnedInterbankSttlementAmount (missing "e"); the field is ReturnedInterbankSettlementAmount',
  // a copy of the rule of UnderlyingTransaction36 (where TransactionInformation exists); UnderlyingTransaction37 has OriginalPaymentInformationAndCancellation instead
  'UnderlyingTransaction37.GroupCancellationAndNumberOfTransactionsRule': 'the rule counts TransactionInformation, which UnderlyingTransaction37 does not have (it was copied from UnderlyingTransaction36)',
};

describe('rule paths', () => {
  it('every field a machine-checkable rule names exists in its type, except known spec typos', () => {
    const unknown: string[] = [];
    for (const t of Object.values(types)) {
      for (const r of t.rules ?? []) {
        if (!r.expression) continue;
        try {
          evaluateExpression(ctx, t.name, r.expression, {});
        } catch (e) {
          if ((e as { issue?: { code?: string } }).issue?.code === 'rule_path_unknown') unknown.push(`${t.name}.${r.name}`);
        }
      }
    }
    expect(Object.fromEntries(unknown.map((n) => [n, KNOWN_SPEC_TYPOS[n] ?? 'NOT EXPLAINED']))).toEqual(KNOWN_SPEC_TYPOS);
  });

  it('a rule naming a missing field is not evaluated (it would answer wrongly), and says which path', () => {
    const t = { Root: { name: 'Root', kind: 'component' as const, fields: [{ name: 'Total', xmlTag: 'T', displayName: 'Total', kind: 'text' as const, type: 'Txt', required: false }] }, Txt: { name: 'Txt', kind: 'text' as const } };
    const rule = (path: string): RuleExpression => ({ mustBe: { connector: 'AND', rules: [{ op: 'Presence', path }] } });
    expect(evaluateExpression({ types: t } as never, 'Root', rule('/Total'), {})).toBe(false); // a real field: absent, so it fails
    expect(() => evaluateExpression({ types: t } as never, 'Root', rule('/Totl'), {})).toThrow(/rule_path_unknown/);
    const sum: RuleExpression = { mustBe: { connector: 'AND', rules: [{ op: 'EqualToValue', path: '/Total', value: 'sum of /Itms' }] } };
    expect(() => evaluateExpression({ types: t } as never, 'Root', sum, {})).toThrow(/rule_path_unknown/);
  });
});
