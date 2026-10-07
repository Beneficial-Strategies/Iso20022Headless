import { describe, expect, it } from 'vitest';
import { buildScreenModel, type ScreenNode } from '../src/screenModel.ts';
import { DEFAULT_OPTIONS, visible, type ExportOptions } from '../src/screenExport.ts';
import { estimateText, svgId, toFigmaSvg } from '../src/screenSvg.ts';
import { demoText } from '../src/demoText.ts';
import { defsEn, defsEs, groupHeaderForm } from './screenfixture.ts';

const values = {
  MessageIdentification: 'MSG-1',
  NumberOfTransactions: '2x',
  Authorisation: [{ Code: 'AUTH' }],
  InitiatingParty: { Name: 'Acme', PostalAddress: { TownName: 'Berlin' } },
};
const errors = { NumberOfTransactions: 'Invalid format. Expected: 1 to 15 digits.' };
const model = (v: unknown = values, e: Record<string, string> = errors, defs = defsEn) => buildScreenModel(groupHeaderForm(v, e), defs, { identifier: 'pain.001.001.13' });
const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ ...DEFAULT_OPTIONS, ...o });
const parse = (svg: string): Document => new DOMParser().parseFromString(svg, 'image/svg+xml');
const draw = (o: Partial<ExportOptions> = {}, m = model(), lang = 'en'): string => toFigmaSvg(m, demoText(lang), opts(o), estimateText);

const flat = (nodes: ScreenNode[], out: ScreenNode[] = []): ScreenNode[] => {
  for (const n of nodes) {
    out.push(n);
    flat(n.children, out);
  }
  return out;
};

describe('the Figma drawing is plain SVG that a design tool can read', () => {
  const svg = draw();
  const doc = parse(svg);

  it('is well-formed XML with a size', () => {
    expect(doc.querySelector('parsererror')).toBeNull();
    const root = doc.documentElement;
    expect(root.tagName).toBe('svg');
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    expect(Number(root.getAttribute('width'))).toBe(760);
    expect(Number(root.getAttribute('height'))).toBeGreaterThan(300);
    expect(root.getAttribute('viewBox')).toBe(`0 0 760 ${root.getAttribute('height')}`);
  });

  it('uses only what Figma imports faithfully: groups, rectangles, paths and text; no styles, classes, embedded HTML or references', () => {
    const tags = new Set([...doc.querySelectorAll('*')].map((e) => e.tagName));
    expect([...tags].sort()).toEqual(['g', 'path', 'rect', 'svg', 'text']);
    expect(svg).not.toMatch(/<style|class=|foreignObject|<use|<image|<filter|<mask|clipPath|Gradient|href=|style=|var\(/);
    // presentation attributes only
    const attrs = new Set([...doc.querySelectorAll('*')].flatMap((e) => [...e.attributes].map((a) => a.name)));
    expect([...attrs].sort()).toEqual(['d', 'fill', 'font-family', 'font-size', 'font-weight', 'height', 'id', 'rx', 'stroke', 'stroke-dasharray', 'stroke-width', 'text-anchor', 'viewBox', 'width', 'x', 'xmlns', 'y']);
  });

  it('every element has a valid, unique id, which Figma uses as the layer name', () => {
    const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[A-Za-z_][A-Za-z0-9._-]*$/);
    // the layers carry the ISO path, so an analyst finds `GroupHeader`-style names, not "Rectangle 217"
    for (const id of ['Title', 'Identifier', 'MessageIdentification', 'MessageIdentification.label', 'MessageIdentification.input', 'MessageIdentification.input.box', 'MessageIdentification.input.value', 'InitiatingParty', 'InitiatingParty.PostalAddress.TownName.input.value', 'Authorisation.0.Code']) {
      expect(doc.getElementById(id), id).not.toBeNull();
    }
  });

  it('paths become ids: a list entry [0] is .0, and nothing outside letters, digits, dot, dash and underscore remains', () => {
    expect(svgId('Authorisation[0].Code')).toBe('Authorisation.0.Code');
    expect(svgId('A b/c')).toBe('A_b_c');
    expect(svgId('')).toBe('root');
    expect(svgId('1x')).toBe('_1x');
  });

  it('draws every element the screen shows: a group for each, or an include row for an optional section left out', () => {
    const o = opts();
    for (const n of flat(model().children).filter((x) => visible(x, o))) {
      const id = n.status === 'excluded' ? `${svgId(n.path)}.include` : svgId(n.path);
      expect(doc.getElementById(id), `${n.status} ${n.path}`).not.toBeNull();
    }
  });

  it('shows values, the required star, and the error in the one red', () => {
    const text = (id: string) => doc.getElementById(id)?.textContent;
    expect(text('MessageIdentification.input.value')).toBe('MSG-1');
    expect(text('MessageIdentification.label')).toBe('Message Identification');
    expect(text('MessageIdentification.star')).toBe('*');
    expect(text('MessageIdentification.remark')).toBe('(required)');
    expect(text('Authorisation.0.Code.input.value')).toBe('AUTH — PreAuthorisedFile');
    expect(text('NumberOfTransactions.error')).toBe('Error: Invalid format. Expected: 1 to 15 digits.');
    expect(doc.getElementById('NumberOfTransactions.error')!.getAttribute('fill')).toBe('#b91c1c');
    expect(text('ControlSum.remark')).toBe('(optional)');
    expect(doc.getElementById('ControlSum.star')).toBeNull();
  });

  it('an included optional section has a checked box and its elements; one left out has an unchecked box and nothing else', () => {
    const checked = (id: string) => doc.getElementById(id)!.querySelector('path') !== null;
    expect(checked('InitiatingParty.PostalAddress.include.checkbox')).toBe(true);
    expect(doc.getElementById('InitiatingParty.PostalAddress.TownName')).not.toBeNull();
    expect(checked('ForwardingAgent.include.checkbox')).toBe(false);
    expect(doc.getElementById('ForwardingAgent.include.label')!.textContent).toBe('Include Forwarding Agent');
    expect(doc.getElementById('ForwardingAgent')).toBeNull();
  });

  it('a list shows its add button and its entries', () => {
    expect(doc.getElementById('Authorisation.add.label')!.textContent).toBe('+ Add Authorisation');
    expect(doc.getElementById('Authorisation.0')).not.toBeNull();
    expect(doc.getElementById('Authorisation.remark')!.textContent).toBe('(list 0..2, optional)');
  });

  it('a choice shows what was chosen, in a dashed frame, with the chosen alternative below', () => {
    expect(doc.getElementById('Authorisation.0.choice.value')!.textContent).toBe('Code');
    expect(doc.getElementById('Authorisation.0.frame')!.getAttribute('stroke-dasharray')).toBe('4 3');
  });

  it('everything is inside the page, and no two input boxes overlap', () => {
    const w = Number(doc.documentElement.getAttribute('width'));
    const h = Number(doc.documentElement.getAttribute('height'));
    for (const r of doc.querySelectorAll('rect')) {
      const x = Number(r.getAttribute('x') ?? 0);
      const y = Number(r.getAttribute('y') ?? 0);
      expect(x, r.id).toBeGreaterThanOrEqual(0);
      expect(y, r.id).toBeGreaterThanOrEqual(0);
      expect(x + Number(r.getAttribute('width')), r.id).toBeLessThanOrEqual(w);
      expect(y + Number(r.getAttribute('height')), r.id).toBeLessThanOrEqual(h);
    }
    for (const t of doc.querySelectorAll('text')) {
      expect(Number(t.getAttribute('y')), t.id).toBeLessThanOrEqual(h);
      expect(Number(t.getAttribute('x')), t.id).toBeGreaterThanOrEqual(0);
    }
    const boxes = [...doc.querySelectorAll('rect[id$=".box"]')].map((r) => ({ id: r.id, x: +r.getAttribute('x')!, y: +r.getAttribute('y')!, w: +r.getAttribute('width')!, h: +r.getAttribute('height')! }));
    expect(boxes.length).toBeGreaterThan(5);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.id} / ${b.id}`).toBe(false);
      }
  });

  it('is the same every time', () => {
    expect(draw()).toBe(svg);
  });
});

describe('the options', () => {
  it('definitions add lines to the elements and make the drawing taller', () => {
    const plain = draw();
    const withDefs = draw({ definitions: true });
    expect(parse(withDefs).getElementById('MessageIdentification.definition')!.textContent).toMatch(/Point to point reference/i);
    expect(plain).not.toContain('.definition');
    expect(Number(parse(withDefs).documentElement.getAttribute('height'))).toBeGreaterThan(Number(parse(plain).documentElement.getAttribute('height')));
    expect(parse(withDefs).getElementById('Definition')).not.toBeNull(); // the type's own definition under the title
  });

  it('long definitions wrap inside the width', () => {
    const doc = parse(draw({ definitions: true }));
    for (const t of doc.querySelectorAll('text[id*=".definition"]')) expect(estimateText(t.textContent!, 11, false) + Number(t.getAttribute('x'))).toBeLessThanOrEqual(760);
  });

  it('sections left out can be hidden, and so can optional elements left empty', () => {
    const doc = parse(draw({ excluded: false, emptyOptional: false }));
    expect(doc.getElementById('ForwardingAgent.include')).toBeNull();
    expect(doc.getElementById('ControlSum')).toBeNull();
    expect(doc.getElementById('CreationDateTime')).not.toBeNull(); // required: always drawn
  });
});

describe('text safety and language', () => {
  it('values with markup characters survive as text', () => {
    const doc = parse(draw({}, model({ MessageIdentification: '<b>&"x"</b>' }, {})));
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.getElementById('MessageIdentification.input.value')!.textContent).toBe('<b>&"x"</b>');
  });

  it('a value too long for its box is shortened with an ellipsis, and nothing runs out of it', () => {
    const doc = parse(draw({}, model({ MessageIdentification: 'M'.repeat(200) }, {})));
    const text = doc.getElementById('MessageIdentification.input.value')!.textContent!;
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThan(200);
  });

  it('the words follow the language; the ISO ids do not', () => {
    const doc = parse(draw({}, model(values, errors, defsEs), 'es'));
    expect(doc.getElementById('MessageIdentification.label')!.textContent).toBe('Identificación del mensaje');
    expect(doc.getElementById('MessageIdentification.remark')!.textContent).toBe('(obligatorio)');
    expect(doc.getElementById('ForwardingAgent.include.label')!.textContent).toMatch(/^Incluir /);
    expect(doc.getElementById('Authorisation.add.label')!.textContent).toMatch(/^\+ Añadir /);
  });
});
