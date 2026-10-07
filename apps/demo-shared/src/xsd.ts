/**
 * XSD validation of the XML the form produces.
 *
 * The schema of a message is published by ISO (`MessageInfo.xsdUrl`). A browser page usually cannot fetch it
 * (the site sends no cross-origin permission), so the schema can also be loaded from a local file.
 * Validation uses libxml2 compiled to WebAssembly (`xmllint-wasm`), loaded the first time it is needed.
 */

export interface XsdIssue {
  message: string;
  /** Line in the validated XML (the same line as in the XML pane), when the validator gave one. */
  line?: number;
}

export interface XsdResult {
  valid: boolean;
  issues: XsdIssue[];
}

const XS = 'http://www.w3.org/2001/XMLSchema';

/**
 * The index just after the name of the first element's start tag, and whether that tag already declares a default
 * namespace. The prolog (XML declaration, comments, processing instructions, a DOCTYPE) is skipped. Quotes in attribute
 * values are respected, so a `>` inside a value does not end the tag.
 */
function firstStartTag(xml: string): { nameEnd: number; hasDefaultNamespace: boolean } | undefined {
  let i = 0;
  for (;;) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) return undefined;
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) return undefined;
      i = end + 2;
    } else if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end < 0) return undefined;
      i = end + 3;
    } else if (xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt + 2);
      if (end < 0) return undefined;
      i = end + 1;
    } else {
      const name = /^<([A-Za-z_][\w.\-:]*)/.exec(xml.slice(lt));
      if (!name) return undefined;
      const nameEnd = lt + name[0].length;
      let j = nameEnd;
      let quote = '';
      for (; j < xml.length; j++) {
        const c = xml[j]!;
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      // text inside quotes is a value, not a declaration
      const attributes = xml.slice(nameEnd, j).replace(/"[^"]*"|'[^']*'/g, '""');
      return { nameEnd, hasDefaultNamespace: /\sxmlns\s*=/.test(attributes) };
    }
  }
}

/**
 * The XML with `namespace` declared as the default namespace on its root element, as if it had been inherited from a
 * container. Nothing changes when the root already declares one. Only the first line can change, so the line numbers
 * of any validation message still match the text shown.
 */
export function withDefaultNamespace(xml: string, namespace: string): string {
  const tag = firstStartTag(xml);
  if (!tag || tag.hasDefaultNamespace) return xml;
  const escaped = namespace.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `${xml.slice(0, tag.nameEnd)} xmlns="${escaped}"${xml.slice(tag.nameEnd)}`;
}

/** Whether the text is an XML Schema document, and the namespace it defines (`targetNamespace`). */
export function inspectSchema(text: string): { isSchema: boolean; targetNamespace?: string } {
  const m = /<(?:[\w.-]+:)?schema\b([^>]*)>/.exec(text.replace(/<!--[\s\S]*?-->/g, ''));
  if (!m) return { isSchema: false };
  const attrs = m[1]!;
  if (!attrs.includes(XS)) return { isSchema: false };
  const ns = /\btargetNamespace\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attrs);
  return { isSchema: true, ...(ns ? { targetNamespace: ns[1] ?? ns[2] ?? '' } : {}) };
}

/**
 * A schema that includes the message's schema and declares one more top-level element named like `type`, of that type.
 * XSD files declare only the message itself as a top-level element, so a part of a message (a type shown on its own, with
 * the type's name as the root element) cannot be validated without this.
 */
export function wrapperSchema(namespace: string, type: string, includeFile: string): string {
  const ns = namespace.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="${XS}" xmlns="${ns}" targetNamespace="${ns}" elementFormDefault="qualified">
  <xs:include schemaLocation="${includeFile}"/>
  <xs:element name="${type}" type="${type}"/>
</xs:schema>
`;
}

/** The validator's wording without its noise: no "Schemas validity error" prefix and no `{namespace}` before names. */
export function tidyMessage(raw: string): string {
  return raw
    .replace(/^\s*(?:Schemas validity error|Schemas parser error|parser error|I\/O warning|Schemas validity warning)\s*:\s*/i, '')
    .replace(/\{[^}]*\}/g, '')
    .trim();
}

interface ValidatorError {
  message: string;
  loc?: { lineNumber: number } | null;
}
export type ValidateXml = (options: {
  xml: { fileName: string; contents: string }[];
  schema: { fileName: string; contents: string }[];
  preload?: { fileName: string; contents: string }[];
  initialMemoryPages?: number;
  maxMemoryPages?: number;
}) => Promise<{ valid: boolean; errors: ValidatorError[] }>;

/** The libxml2 build, loaded on first use (about 0.8 MB, kept out of the page's own code). */
let engine: Promise<ValidateXml> | undefined;
const loadEngine = (): Promise<ValidateXml> => (engine ??= import('xmllint-wasm').then((m) => m.validateXML as unknown as ValidateXml));

export interface ValidateRequest {
  /** The XML as shown in the XML pane. */
  xml: string;
  /** The text of the message's XSD. */
  schema: string;
  /** The message's namespace (`urn:iso:std:iso:20022:tech:xsd:pain.001.001.13`). */
  namespace: string;
  /** The type being shown. */
  type: string;
  /** True when `type` is the whole message (its XML root is `Document`), false for a part of it. */
  isMessage: boolean;
}

/** Validate the XML against the schema. A part of a message gets the message's namespace as if inherited, and a wrapper schema. */
export async function validateXsd(req: ValidateRequest, validate?: ValidateXml): Promise<XsdResult> {
  const run = validate ?? (await loadEngine());
  const xml = withDefaultNamespace(req.xml, req.namespace);
  const message = { fileName: 'message.xsd', contents: req.schema };
  const memory = { initialMemoryPages: 512, maxMemoryPages: 4096 }; // ISO's schemas are big: 32 MB is not always enough
  const result = req.isMessage
    ? await run({ xml: [{ fileName: 'input.xml', contents: xml }], schema: [message], ...memory })
    : await run({
        xml: [{ fileName: 'input.xml', contents: xml }],
        schema: [{ fileName: 'part.xsd', contents: wrapperSchema(req.namespace, req.type, 'message.xsd') }],
        preload: [message],
        ...memory,
      });
  const issues: XsdIssue[] = result.errors
    .map((e) => ({ message: tidyMessage(e.message), ...(e.loc ? { line: e.loc.lineNumber } : {}) }))
    .filter((e) => e.message && !/^input\.xml (validates|fails to validate)$/.test(e.message));
  return { valid: result.valid && issues.length === 0, issues };
}

const ISO_XSD_BASE = 'https://www.iso20022.org/sites/default/files/documents/messages/';

/**
 * The address of ISO's schema through the dev server's proxy (`/iso20022-xsd/...`, see the apps' vite.config.ts), which has
 * no cross-origin limit. Only for ISO's own addresses.
 */
export function devProxyUrl(xsdUrl: string): string | undefined {
  return xsdUrl.startsWith(ISO_XSD_BASE) ? `/iso20022-xsd/${xsdUrl.slice(ISO_XSD_BASE.length)}` : undefined;
}

/** Where a message's schema is expected, and what was found there. */
export type SchemaState =
  | { status: 'loading'; url: string }
  | { status: 'ready'; url: string; text: string; source: 'url' | 'file'; fileName?: string }
  | { status: 'unavailable'; url: string };

/** Why a chosen file was not used, or undefined when it is the schema of this message. */
export function checkSchemaFile(text: string, namespace: string, fileName: string): { en: string; params: Record<string, string> } | undefined {
  const s = inspectSchema(text);
  if (!s.isSchema) return { en: 'notSchema', params: { file: fileName } };
  if (s.targetNamespace !== namespace) return { en: 'wrongSchema', params: { file: fileName, found: s.targetNamespace ?? '(none)', expected: namespace } };
  return undefined;
}
