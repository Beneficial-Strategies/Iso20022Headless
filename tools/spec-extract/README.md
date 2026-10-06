# spec-extract

Turns the ISO 20022 MCP's `get_spec_snapshot` output into the fixture files the code generator reads. No MCP calls from here.

1. Save every page of the sections `messages`, `components` (8 pages), `choices`, `codesets` (3 pages) and `types` as
   text files in one directory (the MCP spills big results to a file; the saved file is the input).
2. Add the message to `messages.json` (name, repository id, identifier, body tag, output module, fixture directory).
3. `pnpm --filter @beneficial-strategies/iso20022-spec-extract run extract analyze --snapshots <dir>` shows how many types,
   simple types and code sets each message adds; `write` creates `message.json`, `complex-types.tsv`, `snapshot-raw.tsv`,
   `choice-defs.tsv`, `codeset-defs.tsv` and a `needs.json`; `verify` re-derives pain.002 and compares it with the committed fixture.
4. `needs.json` lists what the snapshot cannot give and a lookup must: simple-type facets, code names (`get_code_set_details`),
   and business rules (`universal_lookup`). See `fixtures/PROVENANCE-pain-007-to-018.md` for a worked example.
