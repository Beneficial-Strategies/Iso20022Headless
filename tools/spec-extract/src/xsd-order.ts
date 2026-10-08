/**
 * The order of a type's members on the wire is the order of its XSD `xs:sequence` (an XML message that lists them in another
 * order is not valid). The MCP snapshot lists a component's members alphabetically and has no sequence number, so the order is
 * taken from the XSDs ISO publishes, one line per type: `Type<TAB>Tag1,Tag2,...`. Choices are listed in the XSD's own order too.
 */

export interface TypeOrder {
  type: string;
  tags: string[];
}

/** Every named complex type of an XSD with its element names in document order (the message's `Document` wrapper is skipped). */
export function typeOrders(xsd: string): TypeOrder[] {
  const out: TypeOrder[] = [];
  for (const m of xsd.matchAll(/<xs:complexType name="(\w+)">([\s\S]*?)<\/xs:complexType>/g)) {
    if (m[1] === 'Document') continue;
    // optional elements carry minOccurs/maxOccurs before the name, so match the name anywhere in the tag
    const tags = [...m[2]!.matchAll(/<xs:element\b[^>]*?\bname="(\w+)"/g)].map((e) => e[1]!);
    if (tags.length) out.push({ type: m[1]!, tags });
  }
  return out;
}

/** Merge the orders of several XSDs. A type that two XSDs list differently is a conflict (it should not happen: type names are unique). */
export function mergeOrders(files: Map<string, TypeOrder[]>): { orders: Map<string, string[]>; conflicts: string[] } {
  const orders = new Map<string, string[]>();
  const conflicts: string[] = [];
  for (const [file, list] of files) {
    for (const { type, tags } of list) {
      const have = orders.get(type);
      if (have && have.join() !== tags.join()) conflicts.push(`${type} is ordered differently in ${file}`);
      else orders.set(type, tags);
    }
  }
  return { orders, conflicts };
}

export const orderFileText = (orders: Map<string, string[]>): string =>
  ['type\ttags', ...[...orders].sort(([a], [b]) => a.localeCompare(b)).map(([t, tags]) => `${t}\t${tags.join(',')}`)].join('\n') + '\n';

export function parseOrderFile(text: string): Map<string, string[]> {
  return new Map(
    text
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map((l) => {
        const [type, tags] = l.split('\t');
        return [type!, tags!.split(',')] as [string, string[]];
      }),
  );
}
