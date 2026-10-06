import { describe, expect, it } from 'vitest';
import { messageIndex } from '@beneficial-strategies/iso20022-validate';
import { serializeToIsoJson, serializeToXml } from '../src/index.ts';

describe.each(messageIndex.map((m) => m.identifier))('%s serialization', (identifier) => {
  it('uses its own namespace and body tag in XML, and wraps ISO JSON the same way', async () => {
    const info = messageIndex.find((m) => m.identifier === identifier)!;
    const { message } = await info.load();
    const xml = serializeToXml(message, {});
    expect(xml).toContain(`<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${identifier}">`);
    expect(xml).toContain(`<${message.bodyTag}>`);
    const json = JSON.parse(serializeToIsoJson(message, {}));
    expect(Object.keys(json)).toEqual(['Document']);
    expect(Object.keys(json.Document)).toEqual([message.bodyTag]);
  });
});
