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

/** The form's own value model as JSON (element names as keys). Not the ISO 20022 JSON syntax: see `serializeToIsoJson`. */
export function serializeToJson(values: unknown): string {
  return JSON.stringify(pruneEmpty(values) ?? {}, null, 2);
}

// ---------------------------------------------------------------------------------------------
// ISO 20022 JSON syntax: "Generation of JSON Schema Draft 2020-12 for ISO 20022:2013" (ISO 20022 TSG, June 2025),
// section 4 (structure), 5-7 (data types) and Annex A (XML to JSON). Summary of what is implemented:
//   * the root is { "Document": { "<message element>": { ... } } }; there are no namespaces or prefixes
//   * properties are the abbreviated XML tag names, in message order
//   * an element that may occur more than once is an array (the schema also accepts a lone value; we always
//     emit the array so the shape does not depend on how many items there happen to be)
//   * a component is an object; a Choice is an object holding only the chosen alternative
//   * an amount is { "amt": "<decimal string>", "Ccy": "<code>" }
//   * every leaf is a JSON string: decimals ("string used to represent decimal values"), indicators and
//     booleans ("true"/"false"/"1"/"0"), dates, date-times and codes
//   * an xs:any envelope may hold any JSON: if the raw text is valid JSON it is embedded as that value, otherwise as a string
// ---------------------------------------------------------------------------------------------

type Json = string | Json[] | { [k: string]: Json };

function jsonField(types: TypeDescriptors, f: FieldDescriptor, value: unknown): Json | undefined {
  if (value === undefined || value === null) return undefined;
  if (f.repeat) return (Array.isArray(value) ? value : [value]).map((v) => jsonOne(types, f, v));
  return jsonOne(types, f, value);
}

function jsonChildren(types: TypeDescriptors, fields: FieldDescriptor[], value: Record<string, unknown>): { [k: string]: Json } {
  const out: { [k: string]: Json } = {};
  for (const f of fields) {
    const v = jsonField(types, f, value?.[f.name]);
    if (v !== undefined) out[f.xmlTag] = v;
  }
  return out;
}

function jsonOne(types: TypeDescriptors, f: FieldDescriptor, value: unknown): Json {
  const t = types[f.type]!;
  switch (t.kind) {
    case 'component':
      return jsonChildren(types, t.fields ?? [], value as Record<string, unknown>);
    case 'choice':
      return jsonChildren(types, t.choiceOptions ?? [], value as Record<string, unknown>);
    case 'amount': {
      const a = value as { Ccy?: string; Value?: string };
      return { amt: a.Value ?? '', Ccy: a.Ccy ?? '' };
    }
    case 'any': {
      try {
        return JSON.parse(String(value)) as Json;
      } catch {
        return String(value);
      }
    }
    default:
      return String(value);
  }
}

/** Serialize message-body form values to ISO 20022 JSON (see the notes above). */
export function serializeToIsoJson(message: MessageDefinition, values: unknown): string {
  const pruned = (pruneEmpty(values) ?? {}) as Record<string, unknown>;
  const root = message.typeDescriptors[message.rootType]!;
  const body = jsonChildren(message.typeDescriptors, root.fields ?? [], pruned);
  return JSON.stringify({ [message.rootTag]: { [message.bodyTag]: body } }, null, 2) + '\n';
}

/** A single component/choice as ISO JSON, wrapped in a property named after the type. */
export function serializeFragmentIsoJson(types: TypeDescriptors, typeName: string, values: unknown): string {
  const pruned = pruneEmpty(values);
  const t = types[typeName]!;
  const fields = t.kind === 'choice' ? (t.choiceOptions ?? []) : (t.fields ?? []);
  return JSON.stringify({ [typeName]: pruned === undefined ? {} : jsonChildren(types, fields, pruned as Record<string, unknown>) }, null, 2) + '\n';
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
export * from './parse.ts';
export { parseXmlDocument, XmlError, type XmlNode } from './xml.ts';
