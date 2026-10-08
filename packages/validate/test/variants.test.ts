import { describe, expect, it } from 'vitest';
import { applyVariant, createDefinitions, enUS } from '../src/definitions.ts';
import { allTypeDescriptors as typeDescriptors } from '../src/generated/all.ts';
import { displayName } from '../src/runtime.ts';

const types = Object.values(typeDescriptors);
const fields = types.flatMap((t) => [...(t.fields ?? []), ...(t.choiceOptions ?? [])]).filter((f) => f.isoId);
const options = types.flatMap((t) => t.options ?? []);
const rules = types.flatMap((t) => t.rules ?? []);
const us = (s: string) => applyVariant(s, enUS);

describe('American English rewrite rules', () => {
  it('changes spelling and keeps capitalization', () => {
    expect(us('Organisation')).toBe('Organization');
    expect(us('ORGANISATION')).toBe('ORGANIZATION');
    expect(us('authorised and authorisation')).toBe('authorized and authorization');
    expect(us('Cheque')).toBe('Check');
    expect(us('cheques')).toBe('checks');
    expect(us('InstructionLevelAuthorisation')).toBe('InstructionLevelAuthorization');
    expect(us('cancelled')).toBe('canceled');
  });

  it('swaps terms, whole phrases only', () => {
    expect(us('Town Name')).toBe('City Name');
    expect(us('Post Code')).toBe('Postal Code');
    expect(us('Country Sub Division')).toBe('State or Province');
    expect(us('Downtown Names')).toBe('Downtown Names');
  });

  it('leaves words that merely resemble a rule alone, and is idempotent', () => {
    for (const w of ['Organ', 'organic', 'advise', 'Recognition', 'Initial', 'Sub Division']) expect(us(w)).toBe(w);
    const once = us('Organisation Cheque Town Name');
    expect(us(once)).toBe(once);
  });
});

describe('en-US definitions', () => {
  const en = createDefinitions('en');
  const enUs = createDefinitions('en-US');

  it('en is the ISO text exactly; en-US rewrites it and says it is still English', () => {
    const f = fields.find((x) => /Organisation/.test(displayName(x.name)))!;
    const label = displayName(f.name);
    expect(en.label(f, label).text).toBe(label);
    expect(enUs.label(f, label)).toEqual({ text: us(label), lang: 'en' });
    expect(enUs.label(f, label).text).not.toMatch(/Organisation/);
  });

  it('after rewriting, no British spelling the rules know is left anywhere in the labels, code names, definitions or rules', () => {
    const left = /authoris|organis|initialis|synchronis|recognis|motoris|digitis|\bcheque|cypher|acknowledgement|cancelled|fulfil\b|enquir|storey/i;
    const found: string[] = [];
    const check = (where: string, text: string | undefined) => text && left.test(text) && found.push(`${where}: ${text.slice(0, 60)}`);
    for (const f of fields) {
      check(`label ${f.name}`, enUs.label(f, displayName(f.name)).text);
      check(`field ${f.name}`, enUs.field(f, typeDescriptors[f.type])?.text);
    }
    for (const o of options) {
      check(`code ${o.value}`, enUs.code(o)?.text);
      check(`codeName ${o.value}`, enUs.codeName(o, o.name).text);
    }
    for (const r of rules) check(`rule ${r.name}`, enUs.rule(r, r.text).text);
    expect(found).toEqual([]);
  });

  it('never changes what is sent: code values and element names are untouched', () => {
    const chk = options.find((o) => o.value === 'CHK');
    expect(chk?.value).toBe('CHK');
    for (const f of fields) expect(f.name).toBe(f.name); // names come from descriptors, which the rules never see
    expect(enUs.codeName({ isoId: undefined }, 'Cheque').text).toBe('Check');
  });

  it('text a catalog wrote for en-US itself is kept as written', () => {
    const f = fields[0]!;
    const d = createDefinitions('en-US', {}, { 'en-US': { labels: { [f.isoId!]: 'Organisation, on purpose' } } });
    expect(d.label(f, 'x').text).toBe('Organisation, on purpose');
  });
});
