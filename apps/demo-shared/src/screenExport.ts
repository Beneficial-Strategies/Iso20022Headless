import type { DemoText } from './demoText.ts';
import type { ScreenModel, ScreenNode } from './screenModel.ts';

/** What goes into a copy. */
export interface ExportOptions {
  /** Add the ISO 20022 definition of each element. */
  definitions: boolean;
  /** Show optional sections that are not included (one line each); otherwise leave them out. */
  excluded: boolean;
  /** Show optional elements that are left empty (and optional lists with no entries); otherwise leave them out. Required ones always show. */
  emptyOptional: boolean;
}

export const DEFAULT_OPTIONS: ExportOptions = { definitions: false, excluded: true, emptyOptional: true };

/** Whether the options show this node. */
export function visible(node: ScreenNode, opts: ExportOptions): boolean {
  if (node.status === 'excluded') return opts.excluded;
  if (!opts.emptyOptional && !node.required) {
    if (node.status === 'empty') return false;
    if (node.status === 'list' && node.children.length === 0) return false;
  }
  return true;
}

interface Row {
  depth: number;
  node: ScreenNode;
}

/** The nodes in screen order, with their depth, leaving out what the options hide. */
function rows(nodes: ScreenNode[], opts: ExportOptions, depth = 0, out: Row[] = []): Row[] {
  for (const node of nodes) {
    if (!visible(node, opts)) continue;
    out.push({ depth, node });
    rows(node.children, opts, depth + 1, out);
  }
  return out;
}

/** "Label (required)" parts: required or optional, and for a list how many entries are allowed. */
function flags(node: ScreenNode, t: DemoText): string {
  const parts: string[] = [node.required ? t('required') : t('optional')];
  if (node.repeat) parts.unshift(`${t('list')} ${node.repeat.min}..${node.repeat.max ?? '∞'}`);
  return parts.join(', ');
}

/** What the screen holds for the node, in words. */
function valueText(node: ScreenNode, t: DemoText): string {
  switch (node.status) {
    case 'excluded':
      return t('notIncluded');
    case 'list':
      return node.children.length === 1 ? t('oneItem') : t('items', { n: node.children.length });
    case 'group':
      return '';
    case 'empty':
      return node.kind === 'choice' ? t('noneChosen') : t('empty');
    default:
      return node.value;
  }
}

const statusWord = (node: ScreenNode, t: DemoText): string =>
  ({ group: t('statusGroup'), excluded: t('statusExcluded'), list: t('statusList'), choice: t('statusChoice'), filled: t('statusFilled'), empty: t('statusEmpty') })[node.status];

// ------------------------------------------------------------------------------------------------ plain-text outline

export function toOutline(model: ScreenModel, t: DemoText, opts: ExportOptions): string {
  const lines = [`${model.title} (${model.identifier})`];
  if (opts.definitions && model.definition) lines.push(`  ${model.definition}`);
  for (const { depth, node } of rows(model.children, opts)) {
    const value = valueText(node, t);
    const pad = '  '.repeat(depth + 1);
    lines.push(`${pad}${node.label} (${flags(node, t)})${value ? `: ${value}` : ''}${node.error ? `  [${t('error')}: ${node.error}]` : ''}`);
    if (opts.definitions && node.definition) lines.push(`${pad}  ${node.definition}`);
  }
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------------------------------------------ Markdown

const md = (s: string): string => s.replace(/([\\`*_[\]<>|])/g, '\\$1');

export function toMarkdown(model: ScreenModel, t: DemoText, opts: ExportOptions): string {
  const lines = [`# ${md(model.title)}`, '', `\`${model.identifier}\` · ${md(model.type)}`, ''];
  if (opts.definitions && model.definition) lines.push(`> ${md(model.definition)}`, '');
  for (const { depth, node } of rows(model.children, opts)) {
    const pad = '  '.repeat(depth);
    const value = valueText(node, t);
    const shown = node.status === 'excluded' || node.status === 'empty' || node.status === 'list' ? `*${md(value)}*` : md(value);
    lines.push(`${pad}- **${md(node.label)}** (${flags(node, t)})${value ? `: ${shown}` : ''}${node.error ? ` ⚠ ${md(node.error)}` : ''}`);
    if (opts.definitions && node.definition) lines.push(`${pad}  - _${md(node.definition)}_`);
  }
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------------------------------------------ spreadsheet (tab-separated)

/** One cell: quoted when it holds a tab, a new line or a quote, so that a spreadsheet keeps it in one cell. */
const cell = (s: string): string => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toTsv(model: ScreenModel, t: DemoText, opts: ExportOptions): string {
  const header = [t('colLevel'), t('colPath'), t('colElement'), t('colIso'), t('colType'), t('colKind'), t('colRequired'), t('colStatus'), t('colValue'), t('colError')];
  if (opts.definitions) header.push(t('colDefinition'));
  const out = [header.map(cell).join('\t')];
  for (const { depth, node } of rows(model.children, opts)) {
    const row = [String(depth + 1), node.path, node.label, node.name, node.type, node.kind, node.required ? t('yes') : t('no'), statusWord(node, t), node.status === 'filled' || node.status === 'choice' ? node.value : '', node.error ?? ''];
    if (opts.definitions) row.push(node.definition ?? '');
    out.push(row.map(cell).join('\t'));
  }
  return out.join('\n') + '\n';
}

// ------------------------------------------------------------------------------------------------ JSON

export function toJson(model: ScreenModel, opts: ExportOptions): string {
  const clean = (node: ScreenNode): unknown => ({
    path: node.path,
    name: node.name,
    label: node.label,
    type: node.type,
    kind: node.kind,
    required: node.required,
    status: node.status,
    ...(node.status === 'filled' || node.status === 'choice' ? { value: node.value, raw: node.raw } : {}),
    ...(node.repeat ? { repeat: node.repeat } : {}),
    ...(node.error ? { error: node.error } : {}),
    ...(opts.definitions && node.definition ? { definition: node.definition } : {}),
    ...(node.children.length ? { children: node.children.filter((c) => visible(c, opts)).map(clean) } : {}),
  });
  const root = {
    title: model.title,
    type: model.type,
    identifier: model.identifier,
    ...(opts.definitions && model.definition ? { definition: model.definition } : {}),
    elements: model.children.filter((c) => visible(c, opts)).map(clean),
  };
  return JSON.stringify(root, null, 2) + '\n';
}

// ------------------------------------------------------------------------------------------------ Word / rich text (HTML)

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A table for pasting into Word, Outlook or Google Docs. Inline styles and old-fashioned table attributes only: those survive
 * the trip into word processors, classes and external CSS do not. The indentation is cell padding, one step per level.
 */
export function toHtml(model: ScreenModel, t: DemoText, opts: ExportOptions): string {
  const th = (s: string) => `<th align="left" style="border:1px solid #999999;background-color:#e8e8e8;padding:3px 6px;text-align:left">${esc(s)}</th>`;
  const td = (s: string, extra = '') => `<td valign="top" style="border:1px solid #999999;padding:3px 6px;${extra}">${s}</td>`;
  const head = [th(t('colElement')), th(t('colRequired')), th(t('colValue'))];
  if (opts.definitions) head.push(th(t('colDefinition')));
  head.push(th(t('colPath')));
  const body = rows(model.children, opts).map(({ depth, node }) => {
    const group = node.status === 'group' || node.status === 'list' || node.status === 'excluded' || node.status === 'choice';
    const label = group ? `<b>${esc(node.label)}</b>` : esc(node.label);
    const value = valueText(node, t);
    const shown = node.status === 'excluded' || node.status === 'empty' || node.status === 'list' ? `<i>${esc(value)}</i>` : esc(value);
    const err = node.error ? `<br><span style="color:#b00020">${esc(t('error'))}: ${esc(node.error)}</span>` : '';
    const cells = [td(label, `padding-left:${6 + depth * 18}px`), td(esc(flags(node, t))), td(shown + err)];
    if (opts.definitions) cells.push(td(esc(node.definition ?? ''), 'color:#555555'));
    cells.push(td(`<span style="font-family:Consolas,monospace;font-size:9pt;color:#555555">${esc(node.path)}</span>`));
    return `<tr>${cells.join('')}</tr>`;
  });
  const definition = opts.definitions && model.definition ? `<p style="color:#555555">${esc(model.definition)}</p>` : '';
  return (
    `<h2>${esc(model.title)}</h2>` +
    `<p><span style="font-family:Consolas,monospace;font-size:9pt">${esc(model.identifier)}</span> · ${esc(model.type)}</p>` +
    definition +
    `<table cellspacing="0" cellpadding="0" border="1" style="border-collapse:collapse;border:1px solid #999999;font-family:Calibri,Arial,sans-serif;font-size:10pt"><thead><tr>${head.join('')}</tr></thead><tbody>${body.join('')}</tbody></table>`
  );
}
