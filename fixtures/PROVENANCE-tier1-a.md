# Provenance of the tier 1, part A fixtures

15 messages, the current version of every message in three business areas: Administration (`admi`, 10), Payments Remittance Advice
(`remt`, 2) and Transaction Tracker (`trck`, 3). The list is in `tools/spec-extract/messages.json`. Captured 2026-10-11 from the
**staging** ISO 20022 MCP's **resources** (commit 4f1e13e: `current=true` also requires the highest registered version of the
identifier family), by the same method as `PROVENANCE-camt-batch2.md`: the dictionary kinds are shared with that batch, the three
areas' `iso20022://element/<area id>/details?take=2000&includeDefinition=true` pages are new. No tool calls.

Checks: the order of members and codes taken from the resources equals the order in ISO's XSDs for all 15 messages (0 differences;
`spec-extract order --xsd` rewrote `member-order.tsv` and `code-order.tsv` unchanged), and the opt-in XSD sequence test passes for
all 152 messages.

Not here: `head.001.001.04` (Business Application Header, 1 current message). Its root element is `AppHdr`, not `Document`, which the
serializer does not support yet. `acmt` (34) follows in part B.

Notes:
- `admi.002.001.01` has the body tag `admi.002.001.01` (ISO names the element after the identifier).
- The repository gives no description for the `trck` business area; `fixtures/areas.json` holds an empty one and the demo shows the name only.
- 28 rules (25 with expressions). Five reach through a list inside a list (`rules-tier1.test.ts`).
