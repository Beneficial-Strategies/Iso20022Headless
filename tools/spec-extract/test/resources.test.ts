import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadResources, pageTotals } from '../src/resources.ts';
import { runResources } from '../src/resources-write.ts';

/** A tiny repository in the shape of the MCP's resource pages: one message, a component, a choice, three code sets, an amount. */
function pages(): string {
  const dir = mkdtempSync(join(tmpdir(), 'resources-'));
  const page = (kind: string, children: unknown[], element?: unknown): void => {
    mkdirSync(join(dir, kind), { recursive: true });
    const n = children.length;
    writeFileSync(join(dir, kind, '001.json'), JSON.stringify({ data: { ...(element ? { element } : {}), children }, page: { total: n, returned: n, complete: true } }));
  };
  const el = (id: string, name: string, tag: string, type: string, rel: string, min?: string, max?: string, definition?: string) => ({
    id, name, xmlElementName: 'messageElement', xmlTag: tag, ...(min ? { minOccurs: min } : {}), ...(max ? { maxOccurs: max } : {}), ...(definition ? { definition } : {}), references: [{ relation: rel, id: `id-${type}`, name: type }],
  });
  page('CashManagementArea', [
    {
      id: 'M1', name: 'ThingReportV01', xmlElementName: 'messageDefinition', registrationStatus: 'Registered', xmlTag: 'ThngRpt', definition: 'Scope\r\nA thing report.\r\n',
      children: [
        { xmlElementName: 'messageDefinitionIdentifier', name: 'camt.999.001.01' },
        { id: 'R1', name: 'ThingRule', xmlElementName: 'constraint', definition: 'A must be present.', attributes: { expression: '<RuleDefinition>x</RuleDefinition>' } },
        { id: 'B1', name: 'Header', xmlElementName: 'messageBuildingBlock', xmlTag: 'Hdr', minOccurs: '1', maxOccurs: '1', references: [{ relation: 'complexType', id: 'x', name: 'Header1' }] },
        { id: 'B2', name: 'Item', xmlElementName: 'messageBuildingBlock', xmlTag: 'Itm', minOccurs: '0', references: [{ relation: 'complexType', id: 'x', name: 'Item1Choice' }] },
      ],
    },
  ], { name: 'Cash Management', attributes: { code: 'camt' }, definition: 'Cash.' });
  page('MessageComponent', [
    // the resources list members in the specification's order, not alphabetically
    { id: 'C1', name: 'Header1', xmlElementName: 'topLevelDictionaryEntry', registrationStatus: 'Registered', definition: 'A header.\n', children: [el('E1', 'Zeta', 'Zt', 'Max35Text', 'simpleType', '1', '1', 'First.'), el('E2', 'Alpha', 'Alp', 'Amt', 'simpleType', '0', undefined, 'Second.')] },
  ]);
  page('ChoiceComponent', [{ id: 'H1', name: 'Item1Choice', xmlElementName: 'topLevelDictionaryEntry', definition: 'One of.', children: [el('V1', 'Code', 'Cd', 'Method1Code', 'simpleType', '1', '1', 'By code.'), el('V2', 'Other', 'Othr', 'ExternalThing1Code', 'simpleType', '1', '1', 'Other.')] }]);
  page('Text', [{ id: 'T1', name: 'Max35Text', xmlElementName: 'topLevelDictionaryEntry', definition: 'Up to 35.', attributes: { minLength: '1', maxLength: '35' } }]);
  page('Amount', [{ id: 'A1', name: 'Amt', xmlElementName: 'topLevelDictionaryEntry', definition: 'An amount.', attributes: { totalDigits: '18', fractionDigits: '5', minInclusive: '0' }, references: [{ relation: 'currencyIdentifierSet', id: 'S3', name: 'CurrencyCode' }] }]);
  const code = (id: string, name: string, value: string) => ({ id, name, xmlElementName: 'code', codeName: value, definition: `${name}.` });
  page('CodeSet', [
    { id: 'S1', name: 'Method1Code', xmlElementName: 'topLevelDictionaryEntry', isExternal: false, hasMembers: true, restrictionOf: { id: 'S0', name: 'MethodCode' }, children: [code('K1', 'Transfer', 'TRF'), code('K2', 'Cheque', 'CHK')] },
    { id: 'S2', name: 'ExternalThing1Code', xmlElementName: 'topLevelDictionaryEntry', isExternal: true, hasMembers: false, attributes: { minLength: '1', maxLength: '4' }, externalValues: { count: 7 }, children: [] },
    { id: 'S3', name: 'CurrencyCode', xmlElementName: 'topLevelDictionaryEntry', isExternal: false, hasMembers: false, attributes: { pattern: '[A-Z]{3,3}' }, children: [] },
  ]);
  for (const kind of ['Binary', 'Date', 'DateTime', 'IdentifierSet', 'Indicator', 'Quantity', 'Rate', 'Time', 'Year', 'YearMonth', 'Month', 'ExternalSchema']) page(kind, []);
  return dir;
}

describe('the resource reader', () => {
  const dir = pages();
  const res = loadResources(dir, ['CashManagementArea']);

  it('reads a message with its identifier, body tag, blocks and area', () => {
    const m = res.messages.get('M1')!;
    expect([m.identifier, m.bodyTag, m.area]).toEqual(['camt.999.001.01', 'ThngRpt', 'Cash Management']);
    expect(res.areas.get('camt')?.name).toBe('Cash Management');
    expect(res.spec.blocks.get('ThingReportV01')!.map((b) => [b[3], b[4], b[5], b[6]])).toEqual([['Hdr', 'Header1', '1', '1'], ['Itm', 'Item1Choice', '0', '']]);
  });

  it('keeps members in the order the resources give them and records that order', () => {
    expect(res.spec.elements.get('Header1')!.map((e) => e[2])).toEqual(['Zeta', 'Alpha']);
    expect(res.memberOrder.get('Header1')).toEqual(['Zt', 'Alp']);
    expect(res.memberOrder.get('Item1Choice')).toEqual(['Cd', 'Othr']);
    expect(res.memberOrder.get('message:M1')).toEqual(['Hdr', 'Itm']);
  });

  it('writes line breaks as the | marker and trims the edges', () => {
    expect(res.spec.messages.get('M1')!.definition).toBe('Scope|A thing report.');
    expect(res.spec.components.get('Header1')!.definition).toBe('A header.');
  });

  it('takes rules with their text and expression, and facets from attributes', () => {
    expect(res.rules).toEqual([{ scope: 'ThingReportV01', scopeId: 'M1', id: 'R1', name: 'ThingRule', text: 'A must be present.', expression: '<RuleDefinition>x</RuleDefinition>' }]);
    expect(res.spec.facets.get('Max35Text')).toEqual({ specType: 'Text', minLength: '1', maxLength: '35' });
    expect(res.spec.facets.get('Amt')).toMatchObject({ currencyIdentifierSet: 'S3', totalDigits: '18' });
  });

  it('reports how many entries of a kind are saved, so an incomplete pull is noticed', () => {
    expect(pageTotals(dir, 'CodeSet')).toEqual({ files: 1, returned: 3, total: 3 });
    expect(pageTotals(dir, 'Nothing')).toEqual({ files: 0, returned: 0, total: 0 });
  });
});

describe('writing fixtures from resources', () => {
  it('writes a message directory the generator can read, and the order, rule and code files', () => {
    const pagesDir = pages();
    const out = mkdtempSync(join(tmpdir(), 'fixtures-'));
    const list = join(out, 'messages.json');
    writeFileSync(list, JSON.stringify([{ name: 'ThingReportV01', id: 'M1', identifier: 'camt.999.001.01', bodyTag: 'ThngRpt', out: 'camt999', dir: 'camt999-v01' }]));
    expect(runResources({ pages: pagesDir, messages: list, fixtures: out, mode: 'write', rulesTag: 'test' })).toBe(0);
    const f = (p: string): string => readFileSync(join(out, p), 'utf8');

    expect(JSON.parse(f('camt999-v01/message.json')).blocks.map((b: { xmlTag: string; max: number | null }) => [b.xmlTag, b.max])).toEqual([['Hdr', 1], ['Itm', null]]);
    // wire values in the resources' order, with the base set; the external set and the pattern set are markers, not lists
    expect(f('camt999-v01/codesets.tsv')).toContain('Method1Code\tS1\tMethodCode\tTRF\tTransfer\nMethod1Code\tS1\tMethodCode\tCHK\tCheque');
    expect(f('camt999-v01/codesets.tsv')).toContain('ExternalThing1Code\tS2\t\t*EXTERNAL*\tminLength=1 maxLength=4; ~7 codes (not enumerated)');
    expect(f('camt999-v01/codesets.tsv')).toContain('CurrencyCode\tS3\t\t*PATTERN*\t[A-Z]{3,3}');
    expect(f('code-order.tsv')).toContain('Method1Code\tTRF,CHK');
    expect(f('member-order.tsv')).toContain('Header1\tZt,Alp');
    expect(f('member-order.tsv')).toContain('ThingReportV01\tHdr,Itm');
    expect(f('rules/constraints-test.tsv')).toContain('ThingReportV01\tR1\tThingRule\tA must be present.');
    expect(f('rules/constraint-expressions-test.tsv')).toContain('<RuleDefinition>x</RuleDefinition>');

    // running again writes the same files (its own rule file is not counted as already known)
    const before = [f('rules/constraints-test.tsv'), f('member-order.tsv'), f('code-order.tsv')];
    expect(runResources({ pages: pagesDir, messages: list, fixtures: out, mode: 'write', rulesTag: 'test' })).toBe(0);
    expect([f('rules/constraints-test.tsv'), f('member-order.tsv'), f('code-order.tsv')]).toEqual(before);
  });

  it('refuses a member order that disagrees with the one already on file', () => {
    const pagesDir = pages();
    const out = mkdtempSync(join(tmpdir(), 'fixtures-'));
    writeFileSync(join(out, 'member-order.tsv'), 'type\ttags\nHeader1\tAlp,Zt\n');
    const list = join(out, 'messages.json');
    writeFileSync(list, JSON.stringify([{ name: 'ThingReportV01', id: 'M1', identifier: 'camt.999.001.01', bodyTag: 'ThngRpt', out: 'camt999', dir: 'camt999-v01' }]));
    expect(runResources({ pages: pagesDir, messages: list, fixtures: out, mode: 'write' })).toBe(1);
  });
});
