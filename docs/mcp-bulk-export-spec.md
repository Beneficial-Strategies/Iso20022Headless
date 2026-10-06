# MCP Bulk Export — Findings and Tool Spec

From a hand crawl of pain.001.001.13 via `universal_lookup`, 2026-10-05.
Sample IR: `fixtures/pain001-v13-sample.ir.json`.

## What the MCP gives us today
- Message -> building blocks -> component -> elements -> simple type, all linked by ID.
- Per element: `minOccurs`, `maxOccurs`, `xmlTag`, `registrationStatus`, link to type.
- Simple types: `minLength`, `maxLength`, `pattern` (e.g. IBAN2007Identifier, Max15NumericText).
- Choice components list variants as MessageAssociationEnd children with `xmlTag`.

## Gaps found
1. ~~Code wire values are missing.~~ **Resolved:** `universal_lookup` omits them, but
   `get_code_set_details` returns them (`CHK`/`TRF`/`TRA` for PaymentMethod3Code). Note
   versioned code sets may be a "Restriction Of" a base set; wire values resolve from the base.
2. **DECISION (2026-10-05): ignore Provisional status; target the latest message version
   (pain.001.001.13).** Status stays in the IR as metadata only. Observation: it is per node and mostly Provisional at element level, even in older
   versions (the `Cheque` code and `MessageIdentification` are Provisionally Registered).
   Filtering a closure to "Registered only" would likely drop required fields. Treat status as
   metadata, not a filter.
3. **`universal_lookup` is one node per call, markdown output.** Better: `get_data_type_members_snapshot(names=[...])`
   returns a whole complex type's members (xmlTag, kind, dataTypeName, min/maxOccurs) in one TSV call,
   so a closure is a BFS of batched calls. Full snapshot (no names) is tens of MB.
4. **Constraint nodes carry prose only** (e.g. the IBAN rule), no machine-readable form.
5. Search definition text for a ChoiceComponent can be wrong/stale (Party38Choice: "Nature or
   use of the account"). Do not use definitions for labels without review.
6. Element IDs for a type's children appear only after drilling into that type; the message
   -> block -> `complexType` hop must be followed explicitly.

## Update 2026-10-06: `get_spec_snapshot` now exists
The staging MCP has a bulk tool, `get_spec_snapshot(artifactType, page)`, which returns the whole repository as TSV (messages,
components with their elements, choices with their variants, code sets with codes, simple types). Saved to files, it replaces most of the
hand crawl: `tools/spec-extract` builds a message's structure from it (verified against the hand-captured pain.002), and ten more
pain messages were added with a handful of targeted lookups instead of hundreds.

Still missing from it, so still looked up one by one:
- **Simple-type facets**: `SIMPLETYPE` rows have a name, id and definition but no min/max length, pattern, digits or bounds.
- **Code names**: `CODE` rows give the wire value and definition but not the enum name (`Cheque`), which rules and UIs use.
- **Business rules**: no constraint records at all, neither prose nor machine-readable expressions.
- Which messages supersede which (`nextVersions`) is not in the message list; it is on the message node.
Adding these three to the snapshot would make a message a pure script run.

## Proposed tool: `export_message_closure`
Input: `messageDefinitionId` (or identifier like `pain.001.001.13`).
Output: JSON, shaped like the sample IR:
- `message`: id, name, identifier, xmlTag, status, blocks[]
- `types`: map by ID of component | choice | text | identifier | codeset | amount | date ...
  - component: elements[{name, xmlTag, minOccurs, maxOccurs, status, typeRef, definition}]
  - choice: variants[{name, xmlTag, typeRef}]
  - text/identifier: minLength, maxLength, pattern, totalDigits, fractionDigits, min/maxInclusive
  - codeset: codes[{name, wireValue, status}]
  - constraints[{name, definition}] (prose, passthrough)
- Every node carries `registrationStatus`, `isoId`, and `previousVersion`.
- Recursive types appear once; references are by ID (emitter handles `z.lazy`).
