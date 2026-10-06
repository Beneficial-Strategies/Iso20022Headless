# Provenance of the pain.001.001.13 fixtures

The generator (`tools/codegen-ts`) reads only the files in this directory. It does **not** call the
ISO 20022 MCP server. The MCP is needed only to *refresh* these files, so regenerating the TypeScript
needs no server access or subscription.

Captured 2026-10-05 from the ISO 20022 MCP server (separate repository; its source is not copied here).
Server build identifiers: staging, escaping fix commit `95eeda9` ("Escape spec text in Markdown table
cells"). The fix for 200-character truncation of `universal_lookup` property values was **not yet
deployed** at capture time, so no machine-readable constraint `expression` values are captured.

| File | Source (MCP tool and arguments) | How captured |
|---|---|---|
| `snapshot-raw.tsv` | `get_data_type_members_snapshot(names=[97 type names])` | Saved verbatim from the tool's spilled output (79 KB). Parsed by script, never retyped. Choice types return no MEMBER rows. |
| `complex-types.tsv` | `get_data_type_members_snapshot` in batches, plus `universal_lookup` for Choice variants | Agent transcription (definitions truncated to 120 chars; ignore them, use `snapshot-raw.tsv`). Structure, IDs, tags, occurs verified by the generator (no dangling references). |
| `simple-types.tsv` | `universal_search` + `universal_lookup` per simple type | Agent transcription. `get_simple_type_details` errors on every call. |
| `codesets.tsv` | `get_code_set_details(<name>)` per code set | Agent transcription. 21 external lists are **not enumerated** (one `*EXTERNAL*` row each). |
| `choice-defs.tsv` | `universal_lookup(<choice id>, showChildDescriptions=true, forceVerbose=true)` | Two independent agent captures, byte-identical. |
| `constraints-PaymentInstruction51.tsv` | same call on `PaymentInstruction51` | Two independent captures, byte-identical. Only this one component's rules. |
| `notes.md` | crawl agent's report | Counts, anomalies. |

## Refreshing
1. Capture with the staging/production MCP tools above (prefer calls whose output spills to a file,
   so text is parsed by script, not retyped; where retyping is unavoidable, capture twice independently and diff).
2. Update this file's date and server build info.
3. `pnpm codegen`, then `pnpm typecheck` and `pnpm test`, and review the generated diff.

This procedure is manual and expensive (~300 tool calls). `docs/mcp-bulk-export-spec.md` proposes the
server-side export tool that would replace it.
