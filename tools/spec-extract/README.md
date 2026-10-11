# spec-extract

Turns the ISO 20022 MCP's data into the fixture files the code generator reads. No MCP calls from here. There are two inputs: the **resources** (`resources`, current) and the older `get_spec_snapshot` output (`analyze|write|verify`).

## From the resources (current)
1. Pull every page of `iso20022://dictionary/<Kind>/details?take=2000&includeDefinition=true` for the kinds `MessageComponent`, `ChoiceComponent`, `CodeSet`, `Amount`, `Text`, `Binary`, `Date`, `DateTime`, `IdentifierSet`, `Indicator`, `Quantity`, `Rate`, `Time`, `Year`, `YearMonth`, `Month`, `ExternalSchema`, and the business area's `iso20022://element/<area id>/details?take=2000&includeDefinition=true` (follow `page.nextUri` until `page.complete`). Save each page as `<dir>/<Kind>/001.json, 002.json, ...`; the area under a directory ending in `Area`.
2. `node src/cli.ts resources analyze --pages <dir> --messages <messages.json>` shows how many types each message adds; `resources write ... --rules-tag <name>` writes the whole fixture directory of each message, the rule files and the order files. It stops if a kind has fewer saved entries than its `page.total`, if a message's identifier or body tag differs from the list, and if a member or code order differs from what `fixtures/member-order.tsv` / `code-order.tsv` already hold. Running it again writes the same files.
3. `node tools/codegen-ts/src/generate.ts`. See `fixtures/PROVENANCE-camt-batch2.md` for how it was checked against the XSD-derived data.

## From the snapshot (how batches up to camt batch 1 were made)

1. Save every page of the sections `messages`, `components` (8 pages), `choices`, `codesets` (3 pages) and `types` as
   text files in one directory (the MCP spills big results to a file; the saved file is the input).
2. Add the message to `messages.json` (name, repository id, identifier, body tag, output module, fixture directory).
3. `pnpm --filter @beneficial-strategies/iso20022-spec-extract run extract analyze --snapshots <dir>` shows how many types,
   simple types and code sets each message adds; `write` creates `message.json`, `complex-types.tsv`, `snapshot-raw.tsv`,
   `choice-defs.tsv`, `codeset-defs.tsv` and a `needs.json`; `verify` re-derives pain.002 and compares it with the committed fixture.
3b. **Member order** is not in the snapshot (it lists members alphabetically): download the message's XSD and run
   `node src/cli.ts order --xsd <folder of XSDs>` to add its types to `fixtures/member-order.tsv`; the generator refuses a multi-member type without an order. See `fixtures/PROVENANCE-member-order.md`.
4. `needs.json` lists what the snapshot cannot give and a lookup must: simple-type facets, code names (`get_code_set_details`),
   and business rules (`universal_lookup`). See `fixtures/PROVENANCE-pain-007-to-018.md` for a worked example.
