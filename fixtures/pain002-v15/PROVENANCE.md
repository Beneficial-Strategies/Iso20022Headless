# Provenance of the pain.002.001.15 fixtures

Same rules as `../pain001-v13/PROVENANCE.md`: the generator reads only these files and never calls the
ISO 20022 MCP server; the MCP is needed only to refresh them. Captured 2026-10-06 from the **staging** MCP only.

Types already captured for pain.001 (shared types such as `PartyIdentification272`, `PostalAddress27`,
`SupplementaryData1`) are not repeated here: the generator merges all `fixtures/*/message.json` pools, so only
types new to pain.002 are listed. About 79% of pain.002's types are reused from pain.001.

| File | Source | How captured |
|---|---|---|
| `snapshot-raw.tsv` | `get_data_type_members_snapshot` with padded names so the output spills to a file | Parsed by script, never retyped. Choice types return no MEMBER rows. |
| `complex-types.tsv` | snapshot output plus `universal_lookup` per Choice variant | Built by script from the captures; every reference verified by the generator (no dangling types). |
| `simple-types.tsv`, `codesets.tsv` | `universal_lookup`, `get_code_set_details` | Agent captures. External code lists are not enumerated (one `*EXTERNAL*` row each). |
| `choice-defs.tsv`, `codedefs.tsv`, `codeset-defs.tsv` | `universal_lookup` / `get_code_set_details` | Two independent agent captures, diffed. |
| `constraints-new.tsv`, `constraint-expressions-new.tsv` | `universal_lookup` on each constraint, `expression` property | Two independent captures, diffed. Scoped format (`scope id name text`); the message-level scope is the message name. Operand paths use `[*]` and 1-based `[n]` (XPath-style; the evaluator documents this reading). |
| `rule-codelists.tsv` | `get_code_set_details` for lists referenced by rules | Cross-checked against rule prose. |

Counts of codes in the external lists are approximate where the server reports them. Refresh: recapture, update
the date, then `pnpm codegen`, `pnpm typecheck`, `pnpm test`, and review the generated diff.
