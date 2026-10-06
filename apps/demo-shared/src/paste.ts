import { messageIndex, type MessageBundle } from '@beneficial-strategies/iso20022-validate';
import {
  detectFormat,
  inspectJson,
  inspectXml,
  parseIsoJsonFragment,
  parseIsoJsonMessage,
  parseXmlFragment,
  parseXmlMessage,
  type DocumentInfo,
  type ParseIssue,
} from '@beneficial-strategies/iso20022-serialize';

/**
 * Decide what to do with XML or JSON from the clipboard. Pure apart from loading a message on demand.
 *
 * The text is loaded into the object being edited. The one exception: XML that is a whole message and declares a
 * namespace (`<Document xmlns="...">`) must match the selected message; if it names another message we have, that
 * message is loaded instead, and if we have none the paste is refused with an error and nothing changes.
 */

export interface PasteCurrent {
  /** The selected message, e.g. `pain.002.001.15`. */
  identifier: string;
  bundle: MessageBundle;
  /** The selected object: the message's root type (the whole message) or one of its components. */
  typeName: string;
}

export type PasteError =
  | { code: 'empty' }
  | { code: 'not_xml_or_json' }
  /** The `Document` declares a namespace that no message here uses. */
  | { code: 'unknown_namespace'; namespace: string }
  /** The text is XML/JSON but cannot be read as this message or component (syntax, wrong root, wrong body). */
  | { code: 'parse'; issue: ParseIssue; expected?: string }
  /** A whole message without a namespace cannot be placed into a single component. */
  | { code: 'whole_message_for_part'; typeName: string }
  /** A single component other than the one being edited. */
  | { code: 'fragment_mismatch'; found: string; typeName: string }
  | { code: 'clipboard_unreadable' };

export type PastePlan =
  | {
      ok: true;
      format: 'xml' | 'json';
      /** Form state to load into the form of `target`. */
      values: unknown;
      /** Things that could not be placed; the rest is loaded. */
      issues: ParseIssue[];
      target: { identifier: string; typeName: string };
      /** Set when `target` is not what was selected: the message (or its whole-message view) must be selected first. */
      switched: boolean;
    }
  | { ok: false; error: PasteError };

/** The XML namespace a message of this library uses. */
export const namespaceOf = (identifier: string): string => `urn:iso:std:iso:20022:tech:xsd:${identifier}`;

const fail = (error: PasteError): PastePlan => ({ ok: false, error });

export async function planPaste(text: string, current: PasteCurrent, loadBundle: (identifier: string) => Promise<MessageBundle>): Promise<PastePlan> {
  const trimmed = text.trim();
  if (trimmed === '') return fail({ code: 'empty' });

  // Looks like XML or JSON? Say why when it does not read.
  const format = detectFormat(trimmed);
  const head = trimmed.replace(/^﻿/, '')[0];
  const inspected: ReturnType<typeof inspectXml> =
    head === '<' ? inspectXml(trimmed) : head === '{' ? inspectJson(trimmed) : { ok: false, error: { code: 'xml_syntax', path: '' } };
  if (!format && (head === '<' || head === '{')) {
    // syntax error: report the parser's own message
    return inspected.ok ? fail({ code: 'not_xml_or_json' }) : fail({ code: 'parse', issue: inspected.error });
  }
  if (!format) return fail({ code: 'not_xml_or_json' });
  if (!inspected.ok) return fail({ code: 'parse', issue: inspected.error });
  const info: DocumentInfo = inspected.info;

  const rootType = current.bundle.message.rootType;

  if (info.kind === 'fragment') {
    if (info.name !== current.typeName) return fail({ code: 'fragment_mismatch', found: info.name, typeName: current.typeName });
    const r =
      format === 'xml'
        ? parseXmlFragment(current.bundle.typeDescriptors, current.typeName, trimmed)
        : parseIsoJsonFragment(current.bundle.typeDescriptors, current.typeName, trimmed);
    if (!r.ok) return fail({ code: 'parse', issue: r.error, expected: current.typeName });
    return { ok: true, format, values: r.values, issues: r.issues, target: { identifier: current.identifier, typeName: current.typeName }, switched: false };
  }

  // a whole message
  let identifier = current.identifier;
  if (format === 'xml' && info.namespace !== undefined) {
    const hit = messageIndex.find((m) => namespaceOf(m.identifier) === info.namespace);
    if (!hit) return fail({ code: 'unknown_namespace', namespace: info.namespace });
    identifier = hit.identifier; // may be the selected message, or another one we switch to
  } else if (current.typeName !== rootType) {
    return fail({ code: 'whole_message_for_part', typeName: current.typeName });
  }

  const bundle = identifier === current.identifier ? current.bundle : await loadBundle(identifier);
  const r = format === 'xml' ? parseXmlMessage(bundle.message, trimmed) : parseIsoJsonMessage(bundle.message, trimmed);
  if (!r.ok) {
    const expected = r.error.code === 'wrong_body' ? bundle.message.bodyTag : r.error.code === 'wrong_root' ? bundle.message.rootTag : undefined;
    return fail({ code: 'parse', issue: r.error, ...(expected !== undefined ? { expected } : {}) });
  }
  const target = { identifier, typeName: bundle.message.rootType };
  return {
    ok: true,
    format,
    values: r.values,
    issues: r.issues,
    target,
    // the selection must change if another message was named, or if a component was selected and a whole message arrived
    switched: identifier !== current.identifier || current.typeName !== rootType,
  };
}
