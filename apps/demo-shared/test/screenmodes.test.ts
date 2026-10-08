import { describe, expect, it } from 'vitest';
import type { FieldExtraContext, FieldMode } from '@beneficial-strategies/iso20022-react-ui';
import { buildScreenModel, type ScreenNode } from '../src/screenModel.ts';
import { DEFAULT_OPTIONS, toHtml, toJson, toMarkdown, toOutline, toTsv, type ExportOptions } from '../src/screenExport.ts';
import { estimateText, toFigmaSvg } from '../src/screenSvg.ts';
import { demoText } from '../src/demoText.ts';
import { defsEn, defsEs, groupHeaderForm } from './screenfixture.ts';

const t = demoText('en');
const values = {
  MessageIdentification: 'DEFAULT-1',
  NumberOfTransactions: '3',
  Authorisation: [{ Code: 'AUTH' }],
  InitiatingParty: { Name: 'Acme', PostalAddress: { TownName: 'Berlin' } },
};
const modesFor = (modes: Record<string, FieldMode>) => (e: FieldExtraContext) => modes[e.path];
const model = (modes?: Record<string, FieldMode>, defs = defsEn) => buildScreenModel(groupHeaderForm(values, {}), defs, { identifier: 'pain.001.001.13' }, modes ? modesFor(modes) : undefined);
const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ ...DEFAULT_OPTIONS, ...o });
const find = (nodes: ScreenNode[], path: string): ScreenNode | undefined => {
  for (const n of nodes) {
    if (n.path === path) return n;
    const inner = find(n.children, path);
    if (inner) return inner;
  }
  return undefined;
};
const MODES = { MessageIdentification: 'hidden', NumberOfTransactions: 'label', InitiatingParty: 'label', 'InitiatingParty.Name': 'hidden' } as const;
const parse = (svg: string): Document => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('the model carries each element\'s mode', () => {
  it('is editable everywhere without field modes', () => {
    const all = (nodes: ScreenNode[]): ScreenNode[] => nodes.flatMap((n) => [n, ...all(n.children)]);
    for (const n of all(model().children)) {
      expect(n.mode).toBe('editable');
      expect(n.modeSetHere).toBeUndefined();
    }
  });

  it('says what is set on an element, and gives what is inside a section the section\'s mode', () => {
    const m = model(MODES);
    expect(find(m.children, 'MessageIdentification')).toMatchObject({ mode: 'hidden', modeSetHere: 'hidden' });
    expect(find(m.children, 'InitiatingParty')).toMatchObject({ mode: 'label', modeSetHere: 'label' });
    expect(find(m.children, 'InitiatingParty.PostalAddress')).toMatchObject({ mode: 'label' });
    expect(find(m.children, 'InitiatingParty.PostalAddress')!.modeSetHere).toBeUndefined();
    expect(find(m.children, 'InitiatingParty.PostalAddress.TownName')!.mode).toBe('label');
    expect(find(m.children, 'ControlSum')!.mode).toBe('editable');
  });

  it('the stronger mode wins: a hidden element inside a label section is hidden', () => {
    expect(find(model(MODES).children, 'InitiatingParty.Name')).toMatchObject({ mode: 'hidden', modeSetHere: 'hidden' });
  });

  it('an element set to editable is the same as none', () => {
    expect(find(model({ MessageIdentification: 'editable' }).children, 'MessageIdentification')).toMatchObject({ mode: 'editable' });
    expect(find(model({ MessageIdentification: 'editable' }).children, 'MessageIdentification')!.modeSetHere).toBeUndefined();
  });

  it('hidden elements keep their value: the default is in the model', () => {
    expect(find(model(MODES).children, 'MessageIdentification')).toMatchObject({ status: 'filled', value: 'DEFAULT-1' });
  });
});

describe('the text formats say the mode where it is set', () => {
  it('Markdown and the outline put it among the remarks, and not again on what is inside', () => {
    const md = toMarkdown(model(MODES), t, opts());
    expect(md).toContain('- **Message Identification** (required, hidden): DEFAULT-1');
    expect(md).toContain('- **Number Of Transactions** (required, label): 3');
    expect(md).toContain('- **Initiating Party** (required, label)');
    expect(md).toContain('  - **Postal Address** (optional)'); // inherits: not said again
    expect(md).toContain('  - **Name** (optional, hidden): Acme');
    expect(toOutline(model(MODES), t, opts())).toContain('  Message Identification (required, hidden): DEFAULT-1');
    // nothing set: nothing said
    expect(toMarkdown(model(), t, opts())).not.toMatch(/hidden|label\)/);
  });

  it('the spreadsheet gets a Mode column when any element has one, with each row\'s mode; otherwise it is unchanged', () => {
    const rows = (text: string) => text.replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    const without = rows(toTsv(model(), t, opts()));
    expect(without[0]).not.toContain('Mode');
    expect(without[0]).toHaveLength(10);
    const withModes = rows(toTsv(model(MODES), t, opts()));
    expect(withModes[0]![8]).toBe('Mode');
    expect(new Set(withModes.map((r) => r.length))).toEqual(new Set([11]));
    const modeOf = (path: string) => withModes.find((r) => r[1] === path)![8];
    expect(modeOf('MessageIdentification')).toBe('Hidden');
    expect(modeOf('InitiatingParty')).toBe('Label');
    expect(modeOf('InitiatingParty.PostalAddress.TownName')).toBe('Label'); // from its section
    expect(modeOf('InitiatingParty.Name')).toBe('Hidden');
    expect(modeOf('ControlSum')).toBe('Editable');
    // a hidden element is still listed, with its default value
    expect(withModes.find((r) => r[1] === 'MessageIdentification')![9]).toBe('DEFAULT-1');
  });

  it('JSON gives the mode of every element that is not editable', () => {
    const j = JSON.parse(toJson(model(MODES), opts())) as { elements: Array<{ name: string; mode?: string; children?: Array<{ name: string; mode?: string }> }> };
    expect(j.elements.find((e) => e.name === 'MessageIdentification')!.mode).toBe('hidden');
    expect(j.elements.find((e) => e.name === 'InitiatingParty')!.mode).toBe('label');
    expect(j.elements.find((e) => e.name === 'ControlSum')!.mode).toBeUndefined();
    expect(JSON.parse(toJson(model(), opts())).elements.some((e: { mode?: string }) => 'mode' in e)).toBe(false);
  });

  it('the Word table gets a Mode column only when needed', () => {
    expect(toHtml(model(), t, opts())).not.toContain('>Mode</th>');
    const html = toHtml(model(MODES), t, opts());
    expect(html).toContain('>Mode</th>');
    expect(html).toContain('>Hidden</td>');
    expect(html).toContain('>Label</td>');
    expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThan(10);
  });

  it('Spanish words', () => {
    const es = demoText('es');
    const md = toMarkdown(model(MODES, defsEs), es, opts());
    expect(md).toContain('(obligatorio, oculto): DEFAULT-1');
    expect(md).toContain('(obligatorio, etiqueta)');
    expect(toTsv(model(MODES, defsEs), es, opts()).split('\n')[0]).toContain('\tModo\t');
  });
});

describe('the Figma drawing shows what an application would show', () => {
  const svg = (modes?: Record<string, FieldMode>, o: Partial<ExportOptions> = {}) => parse(toFigmaSvg(model(modes), t, opts(o), estimateText));

  it('leaves out hidden elements, and everything inside a hidden section', () => {
    const doc = svg({ MessageIdentification: 'hidden', InitiatingParty: 'hidden' });
    expect(doc.getElementById('MessageIdentification')).toBeNull();
    expect(doc.getElementById('InitiatingParty')).toBeNull();
    expect(doc.getElementById('InitiatingParty.Name')).toBeNull();
    expect(doc.getElementById('CreationDateTime')).not.toBeNull();
    expect(svg().getElementById('MessageIdentification')).not.toBeNull();
  });

  it('draws a label as its text, with no box', () => {
    const doc = svg({ NumberOfTransactions: 'label' });
    expect(doc.getElementById('NumberOfTransactions.label')!.textContent).toBe('Number Of Transactions');
    expect(doc.getElementById('NumberOfTransactions.value')!.textContent).toBe('3');
    expect(doc.getElementById('NumberOfTransactions.input')).toBeNull();
    expect(doc.getElementById('NumberOfTransactions.input.box')).toBeNull();
    // the others still have theirs
    expect(doc.getElementById('CreationDateTime.input.box')).not.toBeNull();
  });

  it('an empty label shows a dash, and a code its name', () => {
    const doc = svg({ ControlSum: 'label', Authorisation: 'label' });
    expect(doc.getElementById('ControlSum.value')!.textContent).toBe('—');
    expect(doc.getElementById('Authorisation.0.Code.value')!.textContent).toBe('AUTH — PreAuthorisedFile');
  });

  it('a section in label mode has no boxes inside, no checkboxes, no add buttons; sections left out are not drawn', () => {
    const doc = svg({ InitiatingParty: 'label', Authorisation: 'label' });
    expect(doc.querySelectorAll('[id^="InitiatingParty."][id$=".box"]')).toHaveLength(0);
    expect(doc.getElementById('InitiatingParty.Name.value')!.textContent).toBe('Acme');
    expect(doc.getElementById('InitiatingParty.PostalAddress.include')).toBeNull(); // the included optional section: no box to tick
    expect(doc.getElementById('InitiatingParty.PostalAddress')).not.toBeNull();
    expect(doc.getElementById('InitiatingParty.Identification.include')).toBeNull(); // left out: nothing to show
    expect(doc.getElementById('Authorisation.add')).toBeNull();
    expect(doc.getElementById('Authorisation.0')).not.toBeNull();
    // a section left out, in no mode, is still the unchecked box
    expect(doc.getElementById('ForwardingAgent.include')).not.toBeNull();
  });

  it('is still well-formed, with unique ids, inside its page, in any mix', () => {
    const doc = svg({ MessageIdentification: 'hidden', NumberOfTransactions: 'label', InitiatingParty: 'label', 'InitiatingParty.Name': 'hidden', Authorisation: 'label' });
    expect(doc.querySelector('parsererror')).toBeNull();
    const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const h = Number(doc.documentElement.getAttribute('height'));
    for (const r of doc.querySelectorAll('rect')) expect(Number(r.getAttribute('y')) + Number(r.getAttribute('height'))).toBeLessThanOrEqual(h);
  });

  it('is shorter with elements hidden', () => {
    const height = (d: Document) => Number(d.documentElement.getAttribute('height'));
    expect(height(svg({ InitiatingParty: 'hidden' }))).toBeLessThan(height(svg()));
  });
});
