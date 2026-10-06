# ISO 20022 JSON output

The demos can show the generated message as XML or as ISO 20022 JSON (Display → Output format, `?format=json`).
`serializeToIsoJson` / `serializeFragmentIsoJson` in `packages/serialize` implement the rules below.

## Source

**ISO 20022 Technical Support Group, "Generation of JSON Schema Draft 2020-12 for ISO 20022:2013", 10 June 2025**
(https://www.iso20022.org/sites/default/files/media/file/ISO_20022_Generation_of_JSON_Schema_Draft_2020_12_for_ISO_20022_2013_10June2025.pdf),
sections 4 to 7 (structure and data types) and Annex A (informative, XML to JSON). It is the document that "ISO 20022 and
Web APIs: An Implementation Best Practices White Paper" (10 June 2025) defers to for the mapping ("The syntax
transformation adheres to the XML - JSON mapping rules specified in the Generation of JSON schema"; its section 9 is a
pointer only).

## Rules implemented

| Topic | Rule |
|---|---|
| Root | `{ "Document": { "<message element>": { ... } } }`. No namespaces or prefixes (JSON Schema has none). |
| Names | Abbreviated XML tag names (`GrpHdr`, `MsgId`), in message order. |
| Repeating elements | The schema accepts a single value or an array (`anyOf`, `minItems` of at least 1). We always emit an array so the shape does not depend on the item count. |
| Component | An object; absent optional elements are omitted. |
| Choice | An object holding only the chosen alternative. |
| Amount | `{ "amt": "<decimal string>", "Ccy": "<code>" }`. |
| Leaves | All JSON strings: decimals ("strings have to be used to represent decimal values"), indicators/booleans (`"true"`, `"false"`, `"1"`, `"0"`), dates, date-times, codes. |
| `xs:any` envelope (`Envlp`) | The schema places no constraint on it. If the raw text is valid JSON it is embedded as that value, otherwise as a string (our choice, not in the spec). |

## Verification

`packages/serialize/test/iso-json.test.ts` checks each rule, and cross-checks the output against an independent
implementation of the Annex A algorithm applied to our XML (single-item arrays collapsed, as Annex A does).
Not verified against a generated pain.001.001.13 JSON Schema: the repository's schema is not part of this project.

## Discrepancy with the MCP

The MCP tool `conversion_to_json_instructions` is described as the "ISO 20022 JSON whitepaper Annex A" and summarises
attributes as `@`-prefixed. That matches the **2018** whitepaper (`ISO20022_API_JSON_Whitepaper_Final_20180129.pdf`: draft-04
schemas, `@xmlns`, snake_case), not the 2025 document above, which supersedes it (no namespaces, `amt`/`Ccy`). The tool could
not be read during this work: it refuses Support-tier calls (`conversion_to_j_s_o_n_instructions` is not available for
Support tier; the mangled name suggests the gating lookup uses a differently spelled key) and `simulate_tier` errors.
