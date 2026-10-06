import {
  pruneEmpty,
  type FieldDescriptor,
  type TypeDescriptors,
} from '@beneficial-strategies/iso20022-validate';

export interface MessageDefinition {
  namespace: string;
  rootTag: string;
  bodyTag: string;
  rootType: string;
  typeDescriptors: TypeDescriptors;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function emitField(types: TypeDescriptors, f: FieldDescriptor, value: unknown, indent: string, out: string[]): void {
  if (value === undefined || value === null) return;
  if (f.repeat) {
    for (const item of value as unknown[]) emitOne(types, f, item, indent, out);
  } else {
    emitOne(types, f, value, indent, out);
  }
}

function emitOne(types: TypeDescriptors, f: FieldDescriptor, value: unknown, indent: string, out: string[]): void {
  const t = types[f.type]!;
  const open = `${indent}<${f.xmlTag}`;
  switch (t.kind) {
    case 'component': {
      out.push(`${open}>`);
      emitChildren(types, t.fields ?? [], value as Record<string, unknown>, indent + '  ', out);
      out.push(`${indent}</${f.xmlTag}>`);
      return;
    }
    case 'choice': {
      out.push(`${open}>`);
      emitChildren(types, t.choiceOptions ?? [], value as Record<string, unknown>, indent + '  ', out);
      out.push(`${indent}</${f.xmlTag}>`);
      return;
    }
    case 'amount': {
      const a = value as { Ccy: string; Value: string };
      out.push(`${open} Ccy="${esc(a.Ccy)}">${esc(a.Value)}</${f.xmlTag}>`);
      return;
    }
    case 'any':
      out.push(`${open}>${String(value)}</${f.xmlTag}>`); // raw XML by design (xs:any envelope)
      return;
    default:
      out.push(`${open}>${esc(String(value))}</${f.xmlTag}>`);
  }
}

function emitChildren(
  types: TypeDescriptors,
  fields: FieldDescriptor[],
  value: Record<string, unknown>,
  indent: string,
  out: string[],
): void {
  for (const f of fields) emitField(types, f, value?.[f.name], indent, out);
}

/** Serialize message-body form values (e.g. { GroupHeader, PaymentInformation }) to ISO 20022 XML. */
export function serializeToXml(message: MessageDefinition, values: unknown): string {
  const pruned = (pruneEmpty(values) ?? {}) as Record<string, unknown>;
  const root = message.typeDescriptors[message.rootType]!;
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${message.rootTag} xmlns="${message.namespace}">`,
    `  <${message.bodyTag}>`,
  ];
  emitChildren(message.typeDescriptors, root.fields ?? [], pruned, '    ', out);
  out.push(`  </${message.bodyTag}>`, `</${message.rootTag}>`);
  return out.join('\n') + '\n';
}

export function serializeToJson(values: unknown): string {
  return JSON.stringify(pruneEmpty(values) ?? {}, null, 2);
}

/** Serialize a single component/choice on its own, wrapped in an element named after the type. */
export function serializeFragment(types: TypeDescriptors, typeName: string, values: unknown): string {
  const pruned = pruneEmpty(values);
  const t = types[typeName]!;
  const out: string[] = [];
  const fields = t.kind === 'choice' ? (t.choiceOptions ?? []) : (t.fields ?? []);
  out.push(`<${typeName}>`);
  if (pruned !== undefined) emitChildren(types, fields, pruned as Record<string, unknown>, '  ', out);
  out.push(`</${typeName}>`);
  return out.join('\n') + '\n';
}
