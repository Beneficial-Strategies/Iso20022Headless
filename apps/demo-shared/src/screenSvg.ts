import type { DemoText } from './demoText.ts';
import { visible, type ExportOptions } from './screenExport.ts';
import type { ScreenModel, ScreenNode } from './screenModel.ts';

/**
 * The screen as a wireframe drawing in SVG, for pasting or dropping onto a Figma canvas.
 *
 * Plain SVG only (rectangles, paths, text, groups): no styles or classes, no embedded HTML, no references: those are what
 * design tools drop. Every element has an `id` made from its ISO path, which Figma uses as the layer name, so the analyst gets
 * layers named `GroupHeader.MessageIdentification.input` and not "Rectangle 217". The look is deliberately neutral (greys,
 * one red for errors) so that look and feel can be added in Figma.
 */
export type MeasureText = (text: string, size: number, bold: boolean) => number;

/** Without a browser to measure with: an average width per character. */
export const estimateText: MeasureText = (text, size, bold) => text.length * size * (bold ? 0.6 : 0.55);

/** Measure with the browser's own text engine (the same system font the drawing names). */
export function browserMeasure(): MeasureText {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return estimateText;
  return (text, size, bold) => {
    ctx.font = `${bold ? 600 : 400} ${size}px ${FONT}`;
    return ctx.measureText(text).width;
  };
}

const FONT = 'Inter, Arial, sans-serif';
const MONO = 'Consolas, Menlo, monospace';
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#9ca3af';
const FRAME = '#f6f7f9';
const DANGER = '#b91c1c';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number): string => String(Math.round(n * 100) / 100);

/** A path as an element id: letters, digits, dots, dashes and underscores only (a list entry `[0]` becomes `.0`). */
export const svgId = (path: string): string => path.replace(/\[(\d+)\]/g, '.$1').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[^A-Za-z_]/, '_$&') || 'root';

interface Piece {
  svg: string;
  height: number;
}

interface Layout {
  measure: MeasureText;
  t: DemoText;
  opts: ExportOptions;
  ids: Set<string>;
}

/** Unique ids even when two nodes share a path (the root of a choice has an empty one). */
function uid(l: Layout, base: string): string {
  let id = base;
  for (let n = 2; l.ids.has(id); n++) id = `${base}_${n}`;
  l.ids.add(id);
  return id;
}

const text = (x: number, y: number, s: string, o: { size?: number; bold?: boolean; fill?: string; mono?: boolean; anchor?: 'end' | 'middle'; id?: string } = {}): string =>
  `<text${o.id ? ` id="${o.id}"` : ''} x="${num(x)}" y="${num(y)}" font-family="${o.mono ? MONO : FONT}" font-size="${o.size ?? 13}"${o.bold ? ' font-weight="600"' : ''} fill="${o.fill ?? INK}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(s)}</text>`;

/** The text shortened with an ellipsis to fit a width. */
function fit(l: Layout, s: string, size: number, width: number): string {
  if (l.measure(s, size, false) <= width) return s;
  let end = s.length;
  while (end > 1 && l.measure(`${s.slice(0, end)}…`, size, false) > width) end--;
  return `${s.slice(0, end)}…`;
}

/** Words wrapped to a width, as lines. */
function wrap(l: Layout, s: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && l.measure(next, size, false) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** "Label *  (required)": the label, a red star when required, and the grey remark; returns the markup and where it ends. */
function labelLine(l: Layout, id: string, x: number, y: number, node: ScreenNode, o: { bold?: boolean; size?: number }): { svg: string; end: number } {
  const size = o.size ?? 12;
  const parts: string[] = [text(x, y, node.label, { size, bold: o.bold ?? true, id: `${id}.label` })];
  let end = x + l.measure(node.label, size, o.bold ?? true);
  if (node.required && node.status !== 'list') {
    parts.push(text(end + 3, y, '*', { size, fill: DANGER, id: `${id}.star` }));
    end += 3 + l.measure('*', size, false);
  }
  const remark = flagsText(l, node);
  parts.push(text(end + 6, y, `(${remark})`, { size: size - 1, fill: MUTED, id: `${id}.remark` }));
  end += 6 + l.measure(`(${remark})`, size - 1, false);
  return { svg: parts.join(''), end };
}

function flagsText(l: Layout, node: ScreenNode): string {
  const parts = [node.required ? l.t('required') : l.t('optional')];
  if (node.repeat) parts.unshift(`${l.t('list')} ${node.repeat.min}..${node.repeat.max ?? '∞'}`);
  return parts.join(', ');
}

const caret = (x: number, y: number): string => `<path d="M${num(x)} ${num(y)} l6 0 l-3 4 z" fill="${MUTED}"/>`;

/** An input box with its value (or nothing, when empty). */
function inputBox(l: Layout, id: string, x: number, y: number, w: number, value: string, o: { select?: boolean } = {}): string {
  const h = 28;
  const room = w - 16 - (o.select ? 16 : 0);
  return (
    `<g id="${id}"><rect id="${id}.box" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${h}" rx="4" fill="#ffffff" stroke="${LINE}"/>` +
    (value ? text(x + 8, y + 18, fit(l, value, 13, room), { id: `${id}.value` }) : '') +
    (o.select ? caret(x + w - 14, y + 12) : '') +
    `</g>`
  );
}

function definitionLines(l: Layout, id: string, x: number, y: number, w: number, node: ScreenNode): { svg: string; height: number } {
  if (!l.opts.definitions || !node.definition) return { svg: '', height: 0 };
  const lines = wrap(l, node.definition, 11, w);
  return { svg: lines.map((line, i) => text(x, y + 11 + i * 14, line, { size: 11, fill: MUTED, id: `${id}.definition${i ? `.${i + 1}` : ''}` })).join(''), height: lines.length * 14 + 2 };
}

function errorLine(l: Layout, id: string, x: number, y: number, w: number, node: ScreenNode): { svg: string; height: number } {
  if (!node.error) return { svg: '', height: 0 };
  return { svg: text(x, y + 11, fit(l, `${l.t('error')}: ${node.error}`, 11, w), { size: 11, fill: DANGER, id: `${id}.error` }), height: 16 };
}

/** A value element: label, optional definition, the input box (two for an amount), the error. */
function valuePiece(l: Layout, node: ScreenNode, x: number, y: number, w: number): Piece {
  const id = uid(l, svgId(node.path));
  let cy = y;
  const parts: string[] = [];
  const label = labelLine(l, id, x, cy + 11, node, {});
  parts.push(label.svg);
  cy += 16;
  const def = definitionLines(l, id, x, cy, w, node);
  parts.push(def.svg);
  cy += def.height + 2;
  if (node.kind === 'amount') {
    const [amount = '', ccy = ''] = node.value.split(' ');
    parts.push(inputBox(l, `${id}.currency`, x, cy, 72, ccy), inputBox(l, `${id}.amount`, x + 80, cy, w - 80, amount));
  } else {
    const select = node.kind === 'code' || node.kind === 'boolean' || node.kind === 'choice';
    parts.push(inputBox(l, `${id}.input`, x, cy, w, node.status === 'empty' ? '' : node.value, { select }));
  }
  cy += 28 + 2;
  const err = errorLine(l, id, x, cy, w, node);
  parts.push(err.svg);
  cy += err.height;
  return { svg: `<g id="${id}">${parts.join('')}</g>`, height: cy - y + 8 };
}

const checkbox = (id: string, x: number, y: number, checked: boolean): string =>
  `<g id="${id}"><rect x="${num(x)}" y="${num(y)}" width="14" height="14" rx="2" fill="#ffffff" stroke="${LINE}"/>` +
  (checked ? `<path d="M${num(x + 3)} ${num(y + 7.5)} l3 3 l5 -6" fill="none" stroke="${INK}" stroke-width="1.6"/>` : '') +
  `</g>`;

/** An optional section: the "Include X (optional)" line with its checkbox. */
function includeRow(l: Layout, node: ScreenNode, x: number, y: number, checked: boolean): Piece {
  const id = uid(l, `${svgId(node.path)}.include`);
  const label = `${l.t('include')} ${node.label}`;
  const end = x + 22 + l.measure(label, 13, false);
  return {
    svg: `<g id="${id}">${checkbox(`${id}.checkbox`, x, y + 3, checked)}${text(x + 22, y + 15, label, { id: `${id}.label` })}${text(end + 6, y + 15, `(${l.t('optional')})`, { size: 11, fill: MUTED, id: `${id}.remark` })}</g>`,
    height: 24,
  };
}

/** Children one under the other. */
function stack(l: Layout, nodes: ScreenNode[], x: number, y: number, w: number, gap = 4): Piece {
  let cy = y;
  const parts: string[] = [];
  for (const node of nodes) {
    if (!visible(node, l.opts)) continue;
    const p = nodePiece(l, node, x, cy, w);
    parts.push(p.svg);
    cy += p.height + gap;
  }
  return { svg: parts.join(''), height: Math.max(0, cy - y - (parts.length ? gap : 0)) };
}

/** A framed section: the title line, then the children inside. */
function framePiece(l: Layout, node: ScreenNode, x: number, y: number, w: number, o: { dashed?: boolean; title?: string; extra?: (x: number, y: number, w: number) => Piece } = {}): Piece {
  const id = uid(l, svgId(node.path));
  const pad = 12;
  const head = labelLine(l, id, x + pad, y + pad + 11, o.title ? { ...node, label: o.title } : node, { bold: true, size: 13 });
  let cy = y + pad + 20;
  const def = definitionLines(l, id, x + pad, cy - 4, w - 2 * pad, node);
  cy += def.height;
  const inner: string[] = [];
  if (o.extra) {
    const e = o.extra(x + pad, cy, w - 2 * pad);
    inner.push(e.svg);
    cy += e.height + 6;
  }
  const kids = stack(l, node.children, x + pad, cy, w - 2 * pad);
  inner.push(kids.svg);
  cy += kids.height;
  const err = errorLine(l, id, x + pad, cy + 2, w - 2 * pad, node);
  inner.push(err.svg);
  cy += err.height;
  const height = cy - y + pad;
  return {
    svg:
      `<g id="${id}"><rect id="${id}.frame" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(height)}" rx="6" fill="${FRAME}" stroke="${LINE}"${o.dashed ? ' stroke-dasharray="4 3"' : ''}/>` +
      head.svg +
      def.svg +
      inner.join('') +
      `</g>`,
    height,
  };
}

function listPiece(l: Layout, node: ScreenNode, x: number, y: number, w: number): Piece {
  const id = uid(l, svgId(node.path));
  const head = labelLine(l, id, x, y + 13, node, { bold: true, size: 13 });
  const add = `+ ${l.t('add')} ${node.label}`;
  const bw = l.measure(add, 11, false) + 20;
  const button = `<g id="${id}.add"><rect x="${num(x + w - bw)}" y="${num(y)}" width="${num(bw)}" height="22" rx="4" fill="#e5e7eb" stroke="${LINE}"/>${text(x + w - bw / 2, y + 15, add, { size: 11, anchor: 'middle', id: `${id}.add.label` })}</g>`;
  const def = definitionLines(l, id, x, y + 20, w, node);
  const items = stack(l, node.children, x, y + 28 + def.height, w);
  const err = errorLine(l, id, x, y + 28 + def.height + items.height, w, node);
  return { svg: `<g id="${id}">${head.svg}${button}${def.svg}${items.svg}${err.svg}</g>`, height: 28 + def.height + items.height + err.height + 4 };
}

function nodePiece(l: Layout, node: ScreenNode, x: number, y: number, w: number): Piece {
  if (node.status === 'excluded') return includeRow(l, node, x, y, false);
  if (node.status === 'list') return listPiece(l, node, x, y, w);
  if (node.status === 'group') {
    if (!node.required) {
      // included optional section: its checked box, then the section
      const row = includeRow(l, node, x, y, true);
      const frame = framePiece(l, node, x, y + row.height + 2, w);
      return { svg: row.svg + frame.svg, height: row.height + 2 + frame.height };
    }
    return framePiece(l, node, x, y, w);
  }
  if (node.kind === 'choice') {
    const optionalOff = !node.required;
    const selectRow = (cx: number, cy: number, cw: number): Piece => {
      const id = uid(l, `${svgId(node.path)}.choice`);
      return { svg: inputBox(l, id, cx, cy, cw, node.status === 'empty' ? '' : node.value, { select: true }), height: 30 };
    };
    const body = framePiece(l, node, x, y + (optionalOff ? 26 : 0), w, { dashed: true, extra: selectRow });
    if (optionalOff) {
      const row = includeRow(l, node, x, y, true);
      return { svg: row.svg + body.svg, height: row.height + 2 + body.height };
    }
    return body;
  }
  return valuePiece(l, node, x, y, w);
}

/** The whole drawing. */
export function toFigmaSvg(model: ScreenModel, t: DemoText, opts: ExportOptions, measure: MeasureText = estimateText): string {
  const l: Layout = { measure, t, opts, ids: new Set() };
  const width = 760;
  const margin = 24;
  const inner = width - 2 * margin;
  const header: string[] = [text(margin, margin + 20, model.title, { size: 22, bold: true, id: 'Title' }), text(margin, margin + 40, `${model.identifier} · ${model.type}`, { size: 12, fill: MUTED, mono: true, id: 'Identifier' })];
  let y = margin + 56;
  if (opts.definitions && model.definition) {
    const lines = wrap(l, model.definition, 11, inner);
    header.push(...lines.map((line, i) => text(margin, y + 11 + i * 14, line, { size: 11, fill: MUTED, id: `Definition${i ? `.${i + 1}` : ''}` })));
    y += lines.length * 14 + 6;
  }
  y += 8;
  const body = stack(l, model.children, margin, y, inner, 10);
  const height = Math.ceil(y + body.height + margin);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
    `<rect id="Background" width="${width}" height="${height}" fill="#ffffff"/>\n` +
    `<g id="Screen">${header.join('')}${body.svg}</g>\n` +
    `</svg>\n`
  );
}
