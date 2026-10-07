import { describe, expect, it } from 'vitest';
import { buildScreenModel, type ScreenNode } from '../src/screenModel.ts';
import { DEFAULT_OPTIONS, toHtml, toJson, toMarkdown, toOutline, toTsv, type ExportOptions } from '../src/screenExport.ts';
import { demoText } from '../src/demoText.ts';
import { defsEn, defsEs, groupHeaderForm } from './screenfixture.ts';

const t = demoText('en');
const values = {
  MessageIdentification: 'MSG-1',
  NumberOfTransactions: '2',
  Authorisation: [{ Code: 'AUTH' }],
  InitiatingParty: { Name: 'Acme', PostalAddress: { TownName: 'Berlin' } },
};
const errors = { NumberOfTransactions: 'Invalid format' };
const form = () => groupHeaderForm(values, errors);
const model = () => buildScreenModel(form(), defsEn, { identifier: 'pain.001.001.13' });
const find = (nodes: ScreenNode[], path: string): ScreenNode | undefined => {
  for (const n of nodes) {
    if (n.path === path) return n;
    const inner = find(n.children, path);
    if (inner) return inner;
  }
  return undefined;
};
const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ ...DEFAULT_OPTIONS, ...o });

describe('the screen model follows what the form shows', () => {
  it('names the screen: heading, type and message', () => {
    expect(model()).toMatchObject({ title: 'Group Header114', type: 'GroupHeader114', identifier: 'pain.001.001.13' });
  });

  it('filled and empty values, required or not, with the error shown for them', () => {
    const m = model();
    expect(find(m.children, 'MessageIdentification')).toMatchObject({ label: 'Message Identification', name: 'MessageIdentification', type: 'Max35Text', required: true, status: 'filled', value: 'MSG-1' });
    expect(find(m.children, 'CreationDateTime')).toMatchObject({ required: true, status: 'empty', value: '' });
    expect(find(m.children, 'ControlSum')).toMatchObject({ required: false, status: 'empty' });
    expect(find(m.children, 'NumberOfTransactions')).toMatchObject({ status: 'filled', error: 'Invalid format' });
  });

  it('an optional section left out is one line, one that is included shows its elements', () => {
    const m = model();
    expect(find(m.children, 'ForwardingAgent')).toMatchObject({ status: 'excluded', required: false, children: [] });
    const address = find(m.children, 'InitiatingParty.PostalAddress')!;
    expect(address).toMatchObject({ status: 'group', required: false });
    expect(address.children.length).toBeGreaterThan(5);
    expect(find(m.children, 'InitiatingParty.PostalAddress.TownName')).toMatchObject({ status: 'filled', value: 'Berlin' });
    expect(find(m.children, 'InitiatingParty.PostalAddress.AddressType')).toMatchObject({ status: 'excluded' });
    // a required section is always shown
    expect(find(m.children, 'InitiatingParty')).toMatchObject({ status: 'group', required: true });
  });

  it('a list shows its entries, numbered like the screen, and how many are allowed', () => {
    const list = find(model().children, 'Authorisation')!;
    expect(list).toMatchObject({ status: 'list', repeat: { min: 0, max: 2 } });
    expect(list.children.map((c) => [c.label, c.path])).toEqual([['Authorisation 1', 'Authorisation[0]']]);
  });

  it('a choice shows the alternative chosen, and a code its name as the screen does', () => {
    const entry = find(model().children, 'Authorisation[0]')!;
    expect(entry).toMatchObject({ status: 'choice', value: 'Code', raw: 'Code' });
    expect(find(model().children, 'Authorisation[0].Code')).toMatchObject({ status: 'filled', raw: 'AUTH', value: 'AUTH — PreAuthorisedFile' });
  });

  it('a choice with nothing chosen is empty', () => {
    const f = groupHeaderForm({ Authorisation: [{}] });
    expect(find(buildScreenModel(f, defsEn, { identifier: 'x' }).children, 'Authorisation[0]')).toMatchObject({ status: 'empty', children: [] });
  });

  it('carries the ISO definition, in the page\'s language when there is one', () => {
    const en = find(model().children, 'MessageIdentification')!;
    expect(en.definition).toMatch(/Point to point reference/i);
    expect(en.definition).not.toContain('|');
    const es = find(buildScreenModel(form(), defsEs, { identifier: 'x' }).children, 'MessageIdentification')!;
    expect(es.definition).toMatch(/Referencia/i);
    expect(es.label).toBe('Identificación del mensaje');
  });

  it('shows amounts as the screen does: amount and currency', () => {
    const f = groupHeaderForm({ ControlSum: '5' }, {}, 'GroupHeader114');
    expect(find(buildScreenModel(f, defsEn, { identifier: 'x' }).children, 'ControlSum')).toMatchObject({ status: 'filled', value: '5' });
  });
});

describe('Markdown', () => {
  it('is an outline: bold labels, required or optional, values, and what is not included', () => {
    const out = toMarkdown(model(), t, opts());
    expect(out).toContain('# Group Header114');
    expect(out).toContain('`pain.001.001.13` · GroupHeader114');
    expect(out).toContain('- **Message Identification** (required): MSG-1');
    expect(out).toContain('- **Creation Date Time** (required): *(empty)*');
    expect(out).toContain('- **Forwarding Agent** (optional): *not included*');
    expect(out).toContain('  - **Name** (optional): Acme');
    expect(out).toContain('- **Authorisation** (list 0..2, optional): *1 item*');
    expect(out).toContain('    - **Code** (required): AUTH — PreAuthorisedFile');
    expect(out).toContain('- **Number Of Transactions** (required): 2 ⚠ Invalid format');
  });

  it('escapes what Markdown would take for formatting', () => {
    const f = groupHeaderForm({ MessageIdentification: 'a_b*c [x] `y`' });
    const out = toMarkdown(buildScreenModel(f, defsEn, { identifier: 'x' }), t, opts());
    expect(out).toContain('a\\_b\\*c \\[x\\] \\`y\\`');
  });
});

describe('the options', () => {
  it('definitions are added only when asked for', () => {
    expect(toMarkdown(model(), t, opts())).not.toMatch(/_Point to point/);
    expect(toMarkdown(model(), t, opts({ definitions: true }))).toMatch(/- _Point to point reference/);
    expect(toOutline(model(), t, opts({ definitions: true }))).toMatch(/Point to point reference/);
    expect(toOutline(model(), t, opts())).not.toMatch(/Point to point reference/);
  });

  it('sections that are not included can be left out', () => {
    for (const out of [toMarkdown(model(), t, opts({ excluded: false })), toOutline(model(), t, opts({ excluded: false })), toTsv(model(), t, opts({ excluded: false }))]) {
      expect(out).not.toMatch(/Forwarding Agent/);
      expect(out).not.toMatch(/Initiation Source/);
      expect(out).toMatch(/Initiating Party/);
    }
    expect(JSON.parse(toJson(model(), opts({ excluded: false }))).elements.map((e: { name: string }) => e.name)).not.toContain('ForwardingAgent');
  });

  it('optional elements left empty can be left out, but a required one left empty always shows', () => {
    const out = toMarkdown(model(), t, opts({ emptyOptional: false }));
    expect(out).not.toContain('Control Sum');
    expect(out).not.toContain('Care Of');
    expect(out).not.toContain('Address Line'); // an optional list with no entries
    expect(out).toContain('Creation Date Time'); // required, still empty
    expect(out).toContain('Town Name');
    expect(out).toContain('Forwarding Agent'); // a section left out is a different option
  });
});

describe('plain-text outline', () => {
  it('is an indented tree with the error beside the element', () => {
    const lines = toOutline(model(), t, opts()).split('\n');
    expect(lines[0]).toBe('Group Header114 (pain.001.001.13)');
    expect(lines).toContain('  Message Identification (required): MSG-1');
    expect(lines).toContain('    Name (optional): Acme');
    expect(lines).toContain('  Number Of Transactions (required): 2  [Error: Invalid format]');
  });
});

describe('spreadsheet (tab-separated)', () => {
  const rowsOf = (text: string) => text.replace(/\n$/, '').split('\n').map((l) => l.split('\t'));

  it('has a header row and one row per element, with the same number of columns', () => {
    const rows = rowsOf(toTsv(model(), t, opts()));
    expect(rows[0]).toEqual(['Level', 'Path', 'Element', 'ISO element', 'ISO type', 'Kind', 'Required', 'Status', 'Value', 'Error']);
    expect(new Set(rows.map((r) => r.length))).toEqual(new Set([10]));
    expect(rows.find((r) => r[1] === 'MessageIdentification')).toEqual(['1', 'MessageIdentification', 'Message Identification', 'MessageIdentification', 'Max35Text', 'text', 'yes', 'filled', 'MSG-1', '']);
    expect(rows.find((r) => r[1] === 'ForwardingAgent')![7]).toBe('not included');
    expect(rows.find((r) => r[1] === 'InitiatingParty.PostalAddress.TownName')![0]).toBe('3');
  });

  it('a value with a tab, a new line or a quote stays in its one cell', () => {
    const f = groupHeaderForm({ MessageIdentification: 'a\tb "c"\nd' });
    const out = toTsv(buildScreenModel(f, defsEn, { identifier: 'x' }), t, opts());
    expect(out).toContain('"a\tb ""c""\nd"');
  });

  it('adds a definition column only when asked for', () => {
    expect(rowsOf(toTsv(model(), t, opts()))[0]).not.toContain('Definition');
    const rows = rowsOf(toTsv(model(), t, opts({ definitions: true })));
    expect(rows[0]!.at(-1)).toBe('Definition');
    expect(rows.find((r) => r[1] === 'MessageIdentification')!.at(-1)).toMatch(/Point to point reference/i);
  });
});

describe('JSON', () => {
  it('is the same structure, with values and errors, and no definitions unless asked', () => {
    const j = JSON.parse(toJson(model(), opts()));
    expect(j).toMatchObject({ title: 'Group Header114', type: 'GroupHeader114', identifier: 'pain.001.001.13' });
    const first = j.elements[0];
    expect(first).toEqual({ path: 'MessageIdentification', name: 'MessageIdentification', label: 'Message Identification', type: 'Max35Text', kind: 'text', required: true, status: 'filled', value: 'MSG-1', raw: 'MSG-1' });
    expect(j.elements.find((e: { name: string }) => e.name === 'NumberOfTransactions').error).toBe('Invalid format');
    expect(JSON.parse(toJson(model(), opts({ definitions: true }))).elements[0].definition).toMatch(/Point to point/i);
  });
});

describe('Word / rich text (HTML)', () => {
  const html = toHtml(model(), t, opts());

  it('is a table with inline styles only, since word processors drop classes and external CSS', () => {
    expect(html).toContain('<table');
    expect(html).toContain('<thead><tr>');
    expect(html).not.toMatch(/class=/);
    expect(html).not.toMatch(/<style/);
    expect(html).not.toMatch(/<script/i);
  });

  it('has a heading, one row per element, indented by level, with groups in bold', () => {
    expect(html).toContain('<h2>Group Header114</h2>');
    expect(html).toContain('<b>Initiating Party</b>');
    expect(html).toMatch(/padding-left:6px">Message Identification<\/td>/);
    expect(html).toMatch(/padding-left:24px">Name<\/td>/); // one level in
    expect(html).toMatch(/padding-left:42px">Town Name<\/td>/); // two levels in
    expect(html).toContain('MSG-1');
    expect(html).toContain('<i>not included</i>');
  });

  it('escapes what would be read as markup, and shows errors', () => {
    const f = groupHeaderForm({ MessageIdentification: '<b>&"x"</b>' }, { MessageIdentification: 'Bad <value>' });
    const out = toHtml(buildScreenModel(f, defsEn, { identifier: 'x' }), t, opts());
    expect(out).toContain('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
    expect(out).toContain('Error: Bad &lt;value&gt;');
    expect(out).not.toContain('<b>&"x"');
  });

  it('adds a definition column only when asked for', () => {
    expect(html).not.toContain('Definition</th>');
    expect(toHtml(model(), t, opts({ definitions: true }))).toContain('Definition</th>');
  });
});

describe('Spanish', () => {
  it('the words in the copy follow the page language; the ISO names do not', () => {
    const es = demoText('es');
    const m = buildScreenModel(form(), defsEs, { identifier: 'pain.001.001.13' });
    const out = toMarkdown(m, es, opts());
    expect(out).toContain('- **Identificación del mensaje** (obligatorio): MSG-1');
    expect(out).toContain('*no incluido*');
    expect(out).toContain('*(vacío)*');
    expect(toTsv(m, es, opts()).split('\n')[0]).toBe(['Nivel', 'Ruta', 'Elemento', 'Elemento ISO', 'Tipo ISO', 'Clase', 'Obligatorio', 'Estado', 'Valor', 'Error'].join('\t'));
  });
});
