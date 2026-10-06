import { hydrate, type FieldDescriptor, type TypeDescriptor, type TypeDescriptors } from '@beneficial-strategies/iso20022-validate';
import type { MessageDefinition } from './index.ts';
import { parseXmlDocument, XmlError, type XmlNode } from './xml.ts';

/**
 * Reading ISO 20022 XML and ISO 20022 JSON (the formats `serializeToXml` and `serializeToIsoJson` write) back into
 * form values. The result is shaped like form state (see `hydrate`), so it can be loaded straight into a form.
 *
 * What cannot be read is reported, not guessed: a problem that makes the text unusable returns `{ ok: false }`;
 * anything else (an element that is not part of the type, a repeated element that may occur once, ...) is listed in
 * `issues` and the rest is still loaded. Invalid *values* are not issues here: they load, and validation reports them.
 */

export type ParseIssueCode =
  | 'xml_syntax' // the text is not well-formed XML
  | 'json_syntax' // the text is not valid JSON
  | 'not_json_object' // JSON, but not an object
  | 'wrong_root' // the outermost element/property is not the one expected
  | 'wrong_body' // a Document that does not contain the expected message element
  | 'unknown_element' // an element or property that is not part of the type
  | 'duplicate_element' // an element that may occur once appears again (the first is kept)
  | 'multiple_choices' // a Choice with more than one alternative (the first is kept)
  | 'unexpected_text' // text where only elements are allowed
  | 'unexpected_element'; // elements inside a simple value

export interface ParseIssue {
  code: ParseIssueCode;
  /** Form path of the place the issue is about, like `PaymentInformation[0].Debtor`; empty for the whole text. */
  path: string;
  /** The offending name or the parser's own message. */
  detail?: string;
}

export type ParseResult = { ok: true; values: unknown; issues: ParseIssue[] } | { ok: false; error: ParseIssue };

/** What a piece of text is, without loading it: used to decide where it belongs. */
export interface DocumentInfo {
  format: 'xml' | 'json';
  /** `document`: a whole message inside `Document`. `fragment`: a single component named after its type. */
  kind: 'document' | 'fragment';
  /** document: the message element (for example `CstmrPmtStsRpt`); fragment: the type name. */
  name: string;
  /** XML only: the namespace the `Document` element declares. */
  namespace?: string;
}

const MAX_ISSUES = 200;

interface Ctx {
  types: TypeDescriptors;
  issues: ParseIssue[];
}
const note = (c: Ctx, code: ParseIssueCode, path: string, detail?: string): void => {
  if (c.issues.length < MAX_ISSUES) c.issues.push({ code, path, ...(detail !== undefined ? { detail } : {}) });
};
const join = (base: string, name: string): string => (base === '' ? name : `${base}.${name}`);
const fieldsOf = (t: TypeDescriptor): FieldDescriptor[] => (t.kind === 'choice' ? t.choiceOptions : t.fields) ?? [];

// ------------------------------------------------------------------------------------------------ XML

function xmlValue(c: Ctx, f: FieldDescriptor, node: XmlNode, path: string): unknown {
  const t = c.types[f.type]!;
  switch (t.kind) {
    case 'component':
    case 'choice':
      return xmlChildren(c, t, node, path);
    case 'amount': {
      if (node.children.length > 0) note(c, 'unexpected_element', path, node.children[0]!.name);
      return { Ccy: node.attrs.Ccy ?? '', Value: node.text.trim() };
    }
    case 'any':
      return node.raw; // an xs:any envelope keeps its inner XML exactly
    default:
      if (node.children.length > 0) note(c, 'unexpected_element', path, node.children[0]!.name);
      return node.text.trim();
  }
}

function xmlChildren(c: Ctx, t: TypeDescriptor, node: XmlNode, path: string): Record<string, unknown> {
  const fields = fieldsOf(t);
  const out: Record<string, unknown> = {};
  if (node.text.trim() !== '') note(c, 'unexpected_text', path, node.text.trim().slice(0, 40));
  let chosen: string | undefined;
  for (const child of node.children) {
    const f = fields.find((x) => x.xmlTag === child.name);
    if (!f) {
      note(c, 'unknown_element', join(path, child.name), child.name);
      continue;
    }
    if (t.kind === 'choice') {
      if (chosen !== undefined && chosen !== f.name) {
        note(c, 'multiple_choices', path, `${chosen}, ${f.name}`);
        continue;
      }
      chosen = f.name;
    }
    if (f.repeat) {
      const list = (out[f.name] as unknown[] | undefined) ?? (out[f.name] = []);
      list.push(xmlValue(c, f, child, `${join(path, f.name)}[${list.length}]`));
    } else if (out[f.name] !== undefined) {
      note(c, 'duplicate_element', join(path, f.name), child.name);
    } else {
      out[f.name] = xmlValue(c, f, child, join(path, f.name));
    }
  }
  return out;
}

function readXml(text: string): { ok: true; root: XmlNode } | { ok: false; error: ParseIssue } {
  try {
    return { ok: true, root: parseXmlDocument(text) };
  } catch (e) {
    if (e instanceof XmlError) return { ok: false, error: { code: 'xml_syntax', path: '', detail: `${e.message} (at character ${e.offset})` } };
    throw e;
  }
}

/** Read a whole message: `<Document><BodyTag>…</BodyTag></Document>`. The namespace is not checked here (see `inspectXml`). */
export function parseXmlMessage(message: MessageDefinition, text: string): ParseResult {
  const doc = readXml(text);
  if (!doc.ok) return doc;
  if (doc.root.name !== message.rootTag) return { ok: false, error: { code: 'wrong_root', path: '', detail: doc.root.name } };
  const body = doc.root.children.find((x) => x.name === message.bodyTag);
  if (!body) return { ok: false, error: { code: 'wrong_body', path: '', detail: doc.root.children[0]?.name ?? '' } };
  const c: Ctx = { types: message.typeDescriptors, issues: [] };
  for (const extra of doc.root.children.filter((x) => x !== body)) note(c, 'unknown_element', extra.name, extra.name);
  const values = xmlChildren(c, c.types[message.rootType]!, body, '');
  return { ok: true, values: hydrate(c.types, message.rootType, values), issues: c.issues };
}

/** Read a single component or choice written as `<TypeName>…</TypeName>`, the way `serializeFragment` does. */
export function parseXmlFragment(types: TypeDescriptors, typeName: string, text: string): ParseResult {
  const doc = readXml(text);
  if (!doc.ok) return doc;
  if (doc.root.name !== typeName) return { ok: false, error: { code: 'wrong_root', path: '', detail: doc.root.name } };
  const c: Ctx = { types, issues: [] };
  const values = xmlChildren(c, types[typeName]!, doc.root, '');
  return { ok: true, values: hydrate(types, typeName, values), issues: c.issues };
}

/** What XML text is (a whole message and its namespace, or a fragment), without loading it. */
export function inspectXml(text: string): { ok: true; info: DocumentInfo } | { ok: false; error: ParseIssue } {
  const doc = readXml(text);
  if (!doc.ok) return doc;
  if (doc.root.name === 'Document') {
    const body = doc.root.children[0];
    if (!body) return { ok: false, error: { code: 'wrong_body', path: '', detail: '' } };
    return { ok: true, info: { format: 'xml', kind: 'document', name: body.name, ...(doc.root.namespace !== undefined ? { namespace: doc.root.namespace } : {}) } };
  }
  return { ok: true, info: { format: 'xml', kind: 'fragment', name: doc.root.name } };
}

// ------------------------------------------------------------------------------------------------ JSON

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

function jsonValue(c: Ctx, f: FieldDescriptor, v: unknown, path: string): unknown {
  const t = c.types[f.type]!;
  switch (t.kind) {
    case 'component':
    case 'choice':
      if (!isObj(v)) {
        note(c, 'unexpected_text', path, typeof v);
        return {};
      }
      return jsonChildren(c, t, v, path);
    case 'amount':
      return isObj(v) ? { Ccy: String(v.Ccy ?? ''), Value: String(v.amt ?? '') } : { Ccy: '', Value: String(v ?? '') };
    case 'any':
      return typeof v === 'string' ? v : JSON.stringify(v); // the form keeps an envelope as text
    default:
      if (isObj(v) || Array.isArray(v)) {
        note(c, 'unexpected_element', path, Array.isArray(v) ? 'array' : 'object');
        return '';
      }
      return String(v ?? '');
  }
}

function jsonChildren(c: Ctx, t: TypeDescriptor, obj: Obj, path: string): Obj {
  const fields = fieldsOf(t);
  const out: Obj = {};
  let chosen: string | undefined;
  for (const [key, v] of Object.entries(obj)) {
    const f = fields.find((x) => x.xmlTag === key);
    if (!f) {
      note(c, 'unknown_element', join(path, key), key);
      continue;
    }
    if (t.kind === 'choice') {
      if (chosen !== undefined && chosen !== f.name) {
        note(c, 'multiple_choices', path, `${chosen}, ${f.name}`);
        continue;
      }
      chosen = f.name;
    }
    if (f.repeat) {
      // the ISO JSON schema also accepts a lone value where a list is allowed
      out[f.name] = (Array.isArray(v) ? v : [v]).map((item, i) => jsonValue(c, f, item, `${join(path, f.name)}[${i}]`));
    } else {
      out[f.name] = jsonValue(c, f, v, join(path, f.name));
    }
  }
  return out;
}

function readJson(text: string): { ok: true; value: Obj } | { ok: false; error: ParseIssue } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: { code: 'json_syntax', path: '', detail: (e as Error).message } };
  }
  return isObj(v) ? { ok: true, value: v } : { ok: false, error: { code: 'not_json_object', path: '' } };
}

/** Read a whole message from ISO 20022 JSON: `{ "Document": { "<BodyTag>": { … } } }`. */
export function parseIsoJsonMessage(message: MessageDefinition, text: string): ParseResult {
  const j = readJson(text);
  if (!j.ok) return j;
  const doc = j.value[message.rootTag];
  if (!isObj(doc)) return { ok: false, error: { code: 'wrong_root', path: '', detail: Object.keys(j.value)[0] ?? '' } };
  const body = doc[message.bodyTag];
  if (!isObj(body)) return { ok: false, error: { code: 'wrong_body', path: '', detail: Object.keys(doc)[0] ?? '' } };
  const c: Ctx = { types: message.typeDescriptors, issues: [] };
  for (const extra of Object.keys(doc).filter((k) => k !== message.bodyTag)) note(c, 'unknown_element', extra, extra);
  const values = jsonChildren(c, c.types[message.rootType]!, body, '');
  return { ok: true, values: hydrate(c.types, message.rootType, values), issues: c.issues };
}

/** Read a single component or choice from ISO JSON written as `{ "<TypeName>": { … } }`, like `serializeFragmentIsoJson`. */
export function parseIsoJsonFragment(types: TypeDescriptors, typeName: string, text: string): ParseResult {
  const j = readJson(text);
  if (!j.ok) return j;
  const body = j.value[typeName];
  if (!isObj(body)) return { ok: false, error: { code: 'wrong_root', path: '', detail: Object.keys(j.value)[0] ?? '' } };
  const c: Ctx = { types, issues: [] };
  for (const extra of Object.keys(j.value).filter((k) => k !== typeName)) note(c, 'unknown_element', extra, extra);
  const values = jsonChildren(c, types[typeName]!, body, '');
  return { ok: true, values: hydrate(types, typeName, values), issues: c.issues };
}

/** What JSON text is (a whole message under `Document`, or a fragment named after a type), without loading it. */
export function inspectJson(text: string): { ok: true; info: DocumentInfo } | { ok: false; error: ParseIssue } {
  const j = readJson(text);
  if (!j.ok) return j;
  const keys = Object.keys(j.value);
  if (keys.length === 1 && keys[0] === 'Document' && isObj(j.value.Document)) {
    const body = Object.keys(j.value.Document)[0];
    if (!body) return { ok: false, error: { code: 'wrong_body', path: '', detail: '' } };
    return { ok: true, info: { format: 'json', kind: 'document', name: body } };
  }
  if (keys.length === 1 && isObj(j.value[keys[0]!])) return { ok: true, info: { format: 'json', kind: 'fragment', name: keys[0]! } };
  return { ok: false, error: { code: 'wrong_root', path: '', detail: keys[0] ?? '' } };
}

// ------------------------------------------------------------------------------------------------ detection

/**
 * Is this text XML or JSON that we could try to read? Cheap: it looks at the first character and does a full
 * syntax check, so it can run on clipboard text. It says nothing about whether the content fits a message.
 */
export function detectFormat(text: string): 'xml' | 'json' | undefined {
  const s = text.replace(/^﻿/, '').trimStart();
  if (s.startsWith('<')) return readXml(s).ok ? 'xml' : undefined;
  if (s.startsWith('{')) return readJson(s).ok ? 'json' : undefined;
  return undefined;
}
