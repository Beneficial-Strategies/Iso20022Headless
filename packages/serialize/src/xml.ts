/**
 * A small, strict XML reader for ISO 20022 documents: elements, attributes, text, CDATA and comments.
 * It keeps the exact inner text of every element (`raw`), which is how an `xs:any` envelope round-trips.
 *
 * Deliberately not supported: DOCTYPE declarations (no entity tricks), external entities, and processing
 * instructions other than the XML declaration, which is skipped. Namespace prefixes are dropped from names.
 */

export interface XmlNode {
  /** Local name (prefix removed). */
  name: string;
  /** Attributes by their written name (`Ccy`, `xmlns`, `xmlns:ns`). */
  attrs: Record<string, string>;
  children: XmlNode[];
  /** The element's own text (entities decoded, CDATA included), with child elements left out. */
  text: string;
  /** The exact source text between the start tag and the end tag. */
  raw: string;
  /** The namespace URI the element is in, from the nearest `xmlns` declaration, if any. */
  namespace?: string;
}

export class XmlError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

const MAX_DEPTH = 256;
const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[A-Za-z0-9_:.-]/;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string, at: number): string {
  return s.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) throw new XmlError(`invalid character reference ${whole}`, at);
      return String.fromCodePoint(code);
    }
    const e = ENTITIES[body];
    if (e === undefined) throw new XmlError(`unknown entity ${whole}`, at);
    return e;
  });
}

/** Parse a document and return its root element. Throws `XmlError`. */
export function parseXmlDocument(source: string): XmlNode {
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const fail = (msg: string, at = i): never => {
    throw new XmlError(msg, at);
  };
  const skipSpace = (): void => {
    while (i < source.length && /\s/.test(source[i]!)) i++;
  };
  /** Skip comments and processing instructions (including the XML declaration). */
  const skipMisc = (): void => {
    for (;;) {
      skipSpace();
      if (source.startsWith('<!--', i)) {
        const end = source.indexOf('-->', i + 4);
        if (end < 0) fail('unterminated comment');
        i = end + 3;
      } else if (source.startsWith('<?', i)) {
        const end = source.indexOf('?>', i + 2);
        if (end < 0) fail('unterminated processing instruction');
        i = end + 2;
      } else if (source.startsWith('<!DOCTYPE', i) || source.startsWith('<!ENTITY', i)) {
        fail('DOCTYPE declarations are not allowed');
      } else return;
    }
  };
  const readName = (): string => {
    const start = i;
    if (!NAME_START.test(source[i] ?? '')) fail('expected a name');
    while (i < source.length && NAME_CHAR.test(source[i]!)) i++;
    return source.slice(start, i);
  };

  const readElement = (depth: number, inherited: Record<string, string>): XmlNode => {
    if (depth > MAX_DEPTH) fail('elements are nested too deeply');
    const open = i;
    i++; // <
    const qname = readName();
    const attrs: Record<string, string> = {};
    for (;;) {
      skipSpace();
      const c = source[i];
      if (c === '/' || c === '>') break;
      const an = readName();
      skipSpace();
      if (source[i] !== '=') fail(`attribute ${an} has no value`);
      i++;
      skipSpace();
      const quote = source[i];
      if (quote !== '"' && quote !== "'") fail(`attribute ${an} value must be quoted`);
      const end = source.indexOf(quote!, i + 1);
      if (end < 0) fail('unterminated attribute value');
      if (an in attrs) fail(`duplicate attribute ${an}`, open);
      attrs[an] = decode(source.slice(i + 1, end), i);
      i = end + 1;
    }
    const colon = qname.lastIndexOf(':');
    const prefix = colon >= 0 ? qname.slice(0, colon) : '';
    const local = colon >= 0 ? qname.slice(colon + 1) : qname;
    const scope = { ...inherited };
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'xmlns') scope[''] = v;
      else if (k.startsWith('xmlns:')) scope[k.slice(6)] = v;
    }
    const node: XmlNode = { name: local, attrs, children: [], text: '', raw: '' };
    const ns = scope[prefix];
    if (ns !== undefined) node.namespace = ns;

    if (source[i] === '/') {
      if (source[i + 1] !== '>') fail('expected ">" after "/"');
      i += 2;
      return node;
    }
    i++; // >
    const innerStart = i;
    let innerEnd = i;
    for (;;) {
      if (i >= source.length) fail(`<${qname}> is never closed`, open);
      if (source[i] !== '<') {
        const next = source.indexOf('<', i);
        if (next < 0) fail(`<${qname}> is never closed`, open);
        node.text += decode(source.slice(i, next), i);
        i = next;
      } else if (source.startsWith('<!--', i)) {
        const end = source.indexOf('-->', i + 4);
        if (end < 0) fail('unterminated comment');
        i = end + 3;
      } else if (source.startsWith('<![CDATA[', i)) {
        const end = source.indexOf(']]>', i + 9);
        if (end < 0) fail('unterminated CDATA section');
        node.text += source.slice(i + 9, end);
        i = end + 3;
      } else if (source.startsWith('<?', i)) {
        const end = source.indexOf('?>', i + 2);
        if (end < 0) fail('unterminated processing instruction');
        i = end + 2;
      } else if (source.startsWith('<!', i)) {
        fail('unsupported declaration');
      } else if (source[i + 1] === '/') {
        innerEnd = i;
        i += 2;
        const closing = readName();
        if (closing !== qname) fail(`</${closing}> does not match <${qname}>`);
        skipSpace();
        if (source[i] !== '>') fail('expected ">"');
        i++;
        break;
      } else {
        node.children.push(readElement(depth + 1, scope));
      }
    }
    node.raw = source.slice(innerStart, innerEnd);
    return node;
  };

  skipMisc();
  if (source[i] !== '<') fail('this is not XML: no root element');
  const root = readElement(0, {});
  skipMisc();
  if (i < source.length) fail('unexpected content after the root element');
  return root;
}
