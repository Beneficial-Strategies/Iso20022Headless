# @beneficial-strategies/iso20022-serialize

Writes form values as ISO 20022 XML or ISO 20022 JSON, and reads both back. Not published to npm yet.

```ts
import { serializeToXml, serializeToIsoJson, parseXmlMessage, parseIsoJsonMessage, inspectXml } from '@beneficial-strategies/iso20022-serialize';
import { pain002Message } from '@beneficial-strategies/iso20022-validate/pain002';

const xml = serializeToXml(pain002Message, values);

const result = parseXmlMessage(pain002Message, xml);
if (result.ok) {
  result.values;  // shaped like form state (see `hydrate` in the validate package); load it straight into a form
  result.issues;  // what could not be placed, with form paths: unknown or repeated elements, extra Choice alternatives, ...
} else {
  result.error;   // why the text is unusable: not well-formed, wrong root, wrong message element, ...
}
```

- **Writing:** `serializeToXml`, `serializeToIsoJson` for a whole message; `serializeFragment`, `serializeFragmentIsoJson` for one component.
- **Reading:** `parseXmlMessage`, `parseIsoJsonMessage`, `parseXmlFragment`, `parseIsoJsonFragment`. Invalid *values* (a bad date, a wrong code) are loaded as written: validation reports them. Unusable text, and anything that cannot be placed, is reported; nothing is guessed.
- **Deciding where text belongs:** `detectFormat(text)` says whether text is XML or JSON that can be read. `inspectXml(text)` / `inspectJson(text)` say whether it is a whole message or a single component, and give a `Document`'s namespace (the XML namespace names the message and its version, so it can be matched to the right message module).
- **The XML reader** (`parseXmlDocument`) is small and strict: no DOCTYPE or entity declarations, bounded nesting, namespace prefixes dropped, and the exact inner text of an `xs:any` envelope is kept so it round-trips.
- Every message round-trips: a test fills every field of every message, writes it in both formats, and requires the same values back.
