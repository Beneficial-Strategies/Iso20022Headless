import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateXML } from 'xmllint-wasm';
import { messageIndex, type FieldDescriptor, type TypeDescriptors } from '@beneficial-strategies/iso20022-validate';
import { serializeToXml } from '@beneficial-strategies/iso20022-serialize';

/**
 * Opt-in: needs ISO's XSDs (not in the repository). `XSD_DIR=<folder with camt.053.001.14.xsd, pain.001.001.13.xsd, ...> pnpm test`.
 * For every message, serialize a document with every field present, validate it against the message's XSD, and require that the
 * STRUCTURE is right: no element out of sequence, none missing, none unexpected. The values are not realistic (patterns and lengths
 * are the validators' business, tested elsewhere), so errors about values are ignored here.
 */
const dir = process.env.XSD_DIR;

/** A value for every field: all fields present, two items in a list near the top, the first alternative of a choice. */
function sample(types: TypeDescriptors, typeName: string, depth = 0): unknown {
  const t = types[typeName]!;
  const leaf = (f: FieldDescriptor, n: number): unknown => {
    const lt = types[f.type]!;
    switch (lt.kind) {
      case 'amount': return { Ccy: 'EUR', Value: `${n}.50` };
      case 'boolean': return 'true';
      case 'date': return '2026-01-02';
      case 'datetime': return '2026-01-02T03:04:05Z';
      case 'time': return '03:04:05.5+02:00';
      case 'any': return '<Envlp/>';
      case 'code': return lt.options?.[0]?.value ?? 'ABCD';
      case 'number': return `${n}`;
      default: return `v${n}`;
    }
  };
  const one = (f: FieldDescriptor, n: number): unknown => {
    const ft = types[f.type]!;
    return ft.kind === 'component' || ft.kind === 'choice' ? sample(types, f.type, depth + 1) : leaf(f, n);
  };
  if (t.kind === 'choice') {
    const f = t.choiceOptions![0]!;
    return { [f.name]: one(f, 1) };
  }
  const out: Record<string, unknown> = {};
  for (const f of t.fields ?? []) out[f.name] = f.repeat ? Array.from({ length: depth < 2 ? 2 : 1 }, (_, i) => one(f, i + 1)) : one(f, 1);
  return out;
}

const STRUCTURE = /This element is not expected|Missing child element|Expected is|not allowed|unexpected/i;

describe.skipIf(!dir)('XML structure against the published XSD', () => {
  it.each(messageIndex.map((m) => m.identifier))('%s', async (identifier) => {
    const file = resolve(dir!, `${identifier}.xsd`);
    if (!existsSync(file)) return; // no XSD published for it
    const { message } = await messageIndex.find((m) => m.identifier === identifier)!.load();
    const xml = serializeToXml(message, sample(message.typeDescriptors, message.rootType));
    const r = await validateXML({ xml: [{ fileName: 'm.xml', contents: xml }], schema: [{ fileName: `${identifier}.xsd`, contents: readFileSync(file, 'utf8') }], initialMemoryPages: 256 });
    const structural = r.errors.map((e) => e.message).filter((m) => STRUCTURE.test(m) && !/value|pattern|length|facet|valid/i.test(m.split(':').slice(-1)[0] ?? ''));
    expect(structural.slice(0, 3)).toEqual([]);
  }, 120000);
});
