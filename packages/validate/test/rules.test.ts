import { describe, expect, it } from 'vitest';
import { evaluateExpression, evaluateRules, ruleCodeLists } from '../src/index.ts';
import { pain001Message, typeDescriptors } from '../src/generated/pain001.ts';

const ctx = { types: typeDescriptors, codeLists: ruleCodeLists };

type Obj = Record<string, unknown>;
const tx = (extra: Obj = {}): Obj => ({ CreditorAccount: { Identification: { IBAN: 'DE89370400440532013000' } }, ...extra });
const pi = (extra: Obj = {}, txs: Obj[] = [tx()]): Obj => ({
  PaymentMethod: 'TRF',
  CreditTransferTransactionInformation: txs,
  ...extra,
});
const run = (instruction: Obj) => evaluateRules(ctx, pain001Message.rootType, { PaymentInformation: [instruction] });
const status = (instruction: Obj, rule: string) => run(instruction).find((r) => r.rule === rule)?.status;

const present = { Name: 'x' }; // stands in for "element present"

describe('business rule evaluation (PaymentInstruction51)', () => {
  it('reports every rule: 11 evaluable, 1 unsupported, 5 prose-only guidelines', () => {
    const results = run(pi());
    expect(results).toHaveLength(17);
    const by = (s: string) => results.filter((r) => r.status === s).length;
    expect(by('prose-only')).toBe(5);
    expect(by('unsupported')).toBe(1);
    expect(by('pass') + by('fail')).toBe(11);
    expect(results.every((r) => r.instancePath === 'PaymentInformation[0]')).toBe(true);
  });

  it('a clean TRF instruction passes every evaluable rule', () => {
    expect(run(pi()).filter((r) => r.status === 'fail')).toEqual([]);
  });

  it('ChequeInstructionRule: cheque details only allowed for CHK (maps name "Cheque" to wire "CHK")', () => {
    const withCheque = { ChequeInstruction: present };
    expect(status(pi({}, [tx(withCheque)]), 'ChequeInstructionRule')).toBe('fail'); // TRF + cheque instruction
    expect(status(pi({ PaymentMethod: 'CHK' }, [tx(withCheque)]), 'ChequeInstructionRule')).toBe('pass');
  });

  it.each([
    ['PaymentTypeInformationRule', 'PaymentTypeInformation'],
    ['ChargeBearerRule', 'ChargeBearer'],
    ['UltimateDebtorRule', 'UltimateDebtor'],
    ['InstructionForDebtorAgentRule', 'InstructionForDebtorAgent'],
  ])('%s: group level and transaction level are mutually exclusive', (rule, field) => {
    const v = field === 'ChargeBearer' ? 'SLEV' : present;
    expect(status(pi({ [field]: v }, [tx({ [field]: v })]), rule)).toBe('fail');
    expect(status(pi({ [field]: v }, [tx()]), rule)).toBe('pass');
    expect(status(pi({}, [tx({ [field]: v })]), rule)).toBe('pass');
    expect(status(pi(), rule)).toBe('pass'); // may both be absent
    // checked per transaction: one offending transaction among several is enough to fail
    expect(status(pi({ [field]: v }, [tx(), tx({ [field]: v })]), rule)).toBe('fail');
  });

  it('ChargesAccountRule: charges account agent requires a charges account', () => {
    expect(status(pi({ ChargesAccountAgent: present }), 'ChargesAccountRule')).toBe('fail');
    expect(status(pi({ ChargesAccountAgent: present, ChargesAccount: present }), 'ChargesAccountRule')).toBe('pass');
    expect(status(pi(), 'ChargesAccountRule')).toBe('pass');
  });

  it('ChequeAndCreditorAccountRule: no creditor account when paying by cheque', () => {
    expect(status(pi({ PaymentMethod: 'CHK' }, [tx()]), 'ChequeAndCreditorAccountRule')).toBe('fail');
    expect(status(pi({ PaymentMethod: 'CHK' }, [{ Creditor: present }]), 'ChequeAndCreditorAccountRule')).toBe('pass');
    expect(status(pi(), 'ChequeAndCreditorAccountRule')).toBe('pass'); // TRF
  });

  it('NonChequePaymentMethodRule: non-cheque with no creditor needs a creditor account', () => {
    expect(status(pi({}, [{}]), 'NonChequePaymentMethodRule')).toBe('fail');
    expect(status(pi({}, [{ Creditor: present }]), 'NonChequePaymentMethodRule')).toBe('pass');
    expect(status(pi({}, [tx()]), 'NonChequePaymentMethodRule')).toBe('pass');
    expect(status(pi({ PaymentMethod: 'CHK' }, [{}]), 'NonChequePaymentMethodRule')).toBe('pass');
  });

  it('cheque delivery rules use the ChequeDelivery2Code list (MLFA, CRFA, RGFA, PUFA)', () => {
    const chk = (code: string, extra: Obj = {}) =>
      pi({ PaymentMethod: 'CHK' }, [{ ChequeInstruction: { DeliveryMethod: { Code: code } }, ...extra }]);
    // final-agent delivery methods require a creditor agent
    expect(status(chk('MLFA'), 'ChequeDeliveryAndCreditorAgentRule')).toBe('fail');
    expect(status(chk('MLFA', { CreditorAgent: present }), 'ChequeDeliveryAndCreditorAgentRule')).toBe('pass');
    expect(status(chk('CRCD'), 'ChequeDeliveryAndCreditorAgentRule')).toBe('pass'); // not in the list: rule does not apply
    // any other delivery method forbids a creditor agent
    expect(status(chk('MLCD', { CreditorAgent: present }), 'ChequeDeliveryAndNoCreditorAgentRule')).toBe('fail');
    expect(status(chk('MLCD'), 'ChequeDeliveryAndNoCreditorAgentRule')).toBe('pass');
    expect(status(chk('RGFA', { CreditorAgent: present }), 'ChequeDeliveryAndNoCreditorAgentRule')).toBe('pass');
  });

  it('ChequeNoDeliveryAndNoCreditorAgentRule: no delivery method means no creditor agent', () => {
    const base = (extra: Obj) => pi({ PaymentMethod: 'CHK' }, [{ ChequeInstruction: present, ...extra }]);
    expect(status(base({ CreditorAgent: present }), 'ChequeNoDeliveryAndNoCreditorAgentRule')).toBe('fail');
    expect(status(base({}), 'ChequeNoDeliveryAndNoCreditorAgentRule')).toBe('pass');
  });

  it('ChargesAccountAgentRule is reported unsupported whatever the data (pseudo-literal "Branch of DebtorAgent")', () => {
    expect(status(pi(), 'ChargesAccountAgentRule')).toBe('unsupported');
    expect(status(pi({ ChargesAccountAgent: present }), 'ChargesAccountAgentRule')).toBe('unsupported');
  });

  it('guidelines are prose-only', () => {
    for (const g of ['UltimateDebtorGuideline', 'ChequeFromGuideline']) expect(status(pi(), g)).toBe('prose-only');
  });

  it('checks every PaymentInformation occurrence and reports its path', () => {
    const results = evaluateRules(ctx, pain001Message.rootType, {
      PaymentInformation: [pi(), pi({ ChargesAccountAgent: present })],
    });
    const failing = results.filter((r) => r.status === 'fail');
    expect(failing.map((r) => `${r.instancePath}:${r.rule}`)).toEqual(['PaymentInformation[1]:ChargesAccountRule']);
  });

  it('numeric path indexes count from 1, as in XPath: Presence(/A[1]) means "at least one A"', () => {
    const types = {
      Root: { name: 'Root', kind: 'component' as const, fields: [{ name: 'Items', xmlTag: 'It', displayName: 'Items', kind: 'component' as const, type: 'Item', required: false, repeat: { min: 0, max: null } }, { name: 'Flag', xmlTag: 'Fl', displayName: 'Flag', kind: 'text' as const, type: 'Txt', required: false }] },
      Item: { name: 'Item', kind: 'component' as const, fields: [] },
      Txt: { name: 'Txt', kind: 'text' as const },
    };
    // if there is a first Item, Flag must be absent
    const expression = {
      mustBe: { connector: 'AND' as const, rules: [{ op: 'Absence' as const, path: '/Flag' }] },
      onCondition: { connector: 'AND' as const, rules: [{ op: 'Presence' as const, path: '/Items[1]' }] },
    };
    const holds = (v: unknown) => evaluateExpression({ types }, 'Root', expression, v);
    expect(holds({ Flag: 'x' })).toBe(true); // no Items: the condition is false, the rule does not apply
    expect(holds({ Items: [{ a: '1' }], Flag: 'x' })).toBe(false);
    expect(holds({ Items: [{ a: '1' }] })).toBe(true);
  });
});
