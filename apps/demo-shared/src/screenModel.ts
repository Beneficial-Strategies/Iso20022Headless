import { displayName, type FieldDescriptor } from '@beneficial-strategies/iso20022-validate';
import type { Definitions } from '@beneficial-strategies/iso20022-validate/definitions';
import type { FieldExtraContext, FieldMode, FormApi } from '@beneficial-strategies/iso20022-react-ui';

/**
 * What the form shows right now, as data: every element on screen with its path, label, ISO names, whether it is required,
 * what it holds, and whether an optional section is included. Everything the "Copy as" menu produces is made from this, so
 * the formats agree with each other and with the screen. It follows the same rules as `SchemaForm`'s rendering.
 */
export type NodeStatus =
  /** a section (component) that is shown, with its elements below */
  | 'group'
  /** a section that is optional and not included: nothing below */
  | 'excluded'
  /** a repeatable element; its entries are the children */
  | 'list'
  /** a choice: the chosen alternative is the child */
  | 'choice'
  /** a value that is filled in */
  | 'filled'
  /** a value left empty (or a choice with nothing chosen) */
  | 'empty';

export interface ScreenNode {
  /** Where it is in the form, e.g. `GroupHeader.InitiatingParty.Name` or `PaymentInformation[0].DebtorAccount`. */
  path: string;
  /** The ISO 20022 element name, e.g. `InitiatingParty`. */
  name: string;
  /** The label shown on screen (translated when there is a translation). */
  label: string;
  /** The ISO 20022 type, e.g. `PartyIdentification272`. */
  type: string;
  /** `component`, `choice`, or a value kind (`text`, `code`, `amount`, ...). */
  kind: string;
  required: boolean;
  status: NodeStatus;
  /** How the value reads on screen (`CHK — Cheque`, `100.00 EUR`); empty for sections. */
  value: string;
  /** The value as it goes into the message (`CHK`, `EUR 100.00`). */
  raw: string;
  /** For a repeatable element: how many entries are allowed. */
  repeat?: { min: number; max: number | null };
  /** The error the screen shows for it, if any. */
  error?: string;
  /** The ISO 20022 definition (in the page's language when there is one). */
  definition?: string;
  /** How the element is presented (field mode), counting the section it is in: the stronger of the two wins. */
  mode: FieldMode;
  /** The mode set on this very element, when one is (`mode` also covers what it inherits). */
  modeSetHere?: FieldMode;
  children: ScreenNode[];
}

export interface ScreenModel {
  /** What the heading says. */
  title: string;
  /** The type being shown (the whole message, or a part of it). */
  type: string;
  /** The message identifier, e.g. `pain.001.001.13`. */
  identifier: string;
  /** The ISO 20022 definition of the type. */
  definition?: string;
  children: ScreenNode[];
}

/** The definition text with the repository's paragraph marker made into a space. */
const plain = (text: string | undefined): string | undefined => (text ? text.split('|').map((s) => s.trim()).filter(Boolean).join(' ') : undefined);

const str = (v: unknown): string => (v === undefined || v === null ? '' : typeof v === 'string' ? v : String(v));

const RANK: Record<FieldMode, number> = { editable: 0, label: 1, hidden: 2 };
const strongest = (a: FieldMode, b: FieldMode | undefined): FieldMode => (b && RANK[b] > RANK[a] ? b : a);

export function buildScreenModel(form: FormApi, defs: Definitions, meta: { identifier: string }, fieldMode?: (element: FieldExtraContext) => FieldMode | undefined): ScreenModel {
  const labelOf = (f: FieldDescriptor): string => defs.label(f, f.displayName).text;
  const errorsAt = (path: string, kind: string): string | undefined => {
    const own = form.errors[path];
    if (own) return own;
    if (kind === 'amount') return form.errors[`${path}.Ccy`] ?? form.errors[`${path}.Value`];
    return undefined;
  };

  function base(field: FieldDescriptor, path: string, label: string, required: boolean, inherited: FieldMode): Omit<ScreenNode, 'status' | 'value' | 'raw' | 'children'> {
    const type = form.typeDescriptors[field.type];
    const own = fieldMode?.({ type: field.type, kind: type?.kind ?? field.kind, name: field.name, label, path });
    const definition = plain(defs.field(field, type)?.text);
    const error = errorsAt(path, type?.kind ?? field.kind);
    return {
      path,
      name: field.name,
      label,
      type: field.type,
      kind: type?.kind ?? field.kind,
      required,
      mode: strongest(inherited, own),
      ...(own && own !== 'editable' ? { modeSetHere: own } : {}),
      ...(definition ? { definition } : {}),
      ...(error ? { error } : {}),
    };
  }

  /** An element's value or section, as `ValueNode` would render it. */
  function valueNode(field: FieldDescriptor, path: string, label: string, required: boolean, inherited: FieldMode, asked?: ReturnType<typeof base>): ScreenNode {
    const type = form.typeDescriptors[field.type]!;
    const b = asked ?? base(field, path, label, required, inherited);
    if (type.kind === 'component') {
      return { ...b, status: 'group', value: '', raw: '', children: (type.fields ?? []).map((f) => fieldNode(f, `${path}.${f.name}`, labelOf(f), b.mode)) };
    }
    if (type.kind === 'choice') {
      const selected = form.getChoice(path);
      const option = type.choiceOptions?.find((o) => o.name === selected);
      const chosen = option ? labelOf(option) : '';
      return {
        ...b,
        status: option ? 'choice' : 'empty',
        value: chosen,
        raw: option?.name ?? '',
        children: option ? [valueNode(option, `${path}.${option.name}`, labelOf(option), true, b.mode)] : [],
      };
    }
    if (type.kind === 'amount') {
      const v = (form.getValue(path) ?? {}) as { Ccy?: unknown; Value?: unknown };
      const ccy = str(v.Ccy);
      const amount = str(v.Value);
      const filled = ccy !== '' || amount !== '';
      return { ...b, status: filled ? 'filled' : 'empty', value: [amount, ccy].filter(Boolean).join(' '), raw: [ccy, amount].filter(Boolean).join(' '), children: [] };
    }
    const raw = str(form.getValue(path));
    let value = raw;
    if (type.kind === 'code' && raw) {
      const option = type.options?.find((o) => o.value === raw);
      value = option ? `${raw} — ${defs.codeName(option, option.name).text}` : raw;
    }
    return { ...b, status: raw === '' ? 'empty' : 'filled', value, raw, children: [] };
  }

  /** An element of a section, as `FieldNode` would render it: a list, an optional section that may be left out, or a plain element. */
  function fieldNode(field: FieldDescriptor, path: string, label: string, inherited: FieldMode): ScreenNode {
    const type = form.typeDescriptors[field.type]!;
    const own = base(field, path, label, field.required, inherited);
    if (field.repeat) {
      const items = (form.getValue(path) as unknown[] | undefined) ?? [];
      return {
        ...own,
        status: 'list',
        value: '',
        raw: '',
        repeat: { min: field.repeat.min, max: field.repeat.max },
        children: items.map((_, i) => valueNode(field, `${path}[${i}]`, `${label} ${i + 1}`, true, own.mode)),
      };
    }
    const container = type.kind === 'component' || type.kind === 'choice';
    if (!field.required && container) {
      if (!form.isPresent(path)) return { ...own, status: 'excluded', value: '', raw: '', children: [] };
      // included: the section itself, still marked optional
      return { ...valueNode(field, path, label, true, inherited, own), required: false };
    }
    return valueNode(field, path, label, field.required, inherited, own);
  }

  const root = form.typeDescriptors[form.rootType]!;
  const rootField = (name: string): FieldDescriptor => ({ name, xmlTag: '', displayName: name, kind: 'choice', type: root.name, required: true }) as FieldDescriptor;
  const children =
    root.kind === 'choice'
      ? [valueNode(rootField(root.name), '', displayName(root.name), true, 'editable')]
      : (root.fields ?? []).map((f) => fieldNode(f, f.name, labelOf(f), 'editable'));
  const definition = plain(defs.type(root)?.text);
  return { title: displayName(root.name), type: root.name, identifier: meta.identifier, ...(definition ? { definition } : {}), children };
}
