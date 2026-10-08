# Provenance of fixtures/member-order.tsv and fixtures/code-order.tsv

**What:** for every component and choice type of the generated messages, the order of its members as the XSD lists them
(`Type<TAB>Tag1,Tag2,...`; 507 types). The generator orders each type's fields by it, and reports a problem for any type with
two or more members that has no entry, or whose members differ from the XSD's.

**Why:** the order of a type's members on the wire is the XSD's `xs:sequence`; an XML message that lists them in another order
is not valid. The MCP `get_spec_snapshot('components')` lists members alphabetically and has no sequence number, so everything
generated from it came out alphabetical. Found 2026-10-08 on camt.029, where the assignment's `Id` came last. Measured the same day
against the XSDs of all 43 messages: **275 of 427 component types (64%) were in the wrong order** (pain.001 and pain.002, captured by
another route, were mostly right). Nothing had pinned the order, which is why the tests did not notice.

**Source:** the XSD of each generated message, fetched 2026-10-08 from the published location
(`https://www.iso20022.org/sites/default/files/documents/messages/<area>/schemas/<id>.xsd`, through the Cloudflare pass-through).
The XSDs themselves are not committed. 513 types appear in more than one XSD; all of them have the same order in every XSD
(no conflicts). Elements whose `minOccurs`/`maxOccurs` come before the name are read too (an early version of the reader missed
them and overstated the problem).

**How to refresh:** download the XSDs of any new messages into a folder and run
`node tools/spec-extract/src/cli.ts order --xsd <folder>`; it adds the new types and fails on a conflict. Then `pnpm codegen`.

**Tests:** `packages/validate/test/member-order.test.ts` ties the generated descriptors to this file;
`packages/serialize/test/wire-order.test.ts` checks element order in the XML; `tools/spec-extract/test/xsd-order.test.ts` the reader.

**Feedback for the MCP team:** a `position` column on MSGELEMENT and VARIANT rows would remove the need for the XSDs here.

## Update 2026-10-08 (later): the MCP snapshot is fixed, and this file became the check
The MCP team fixed the alphabetical sorting on staging (child rows now in spec order). Re-pulled `components` (8 pages), `choices`,
`codesets` (3) and `messages` and compared with the XSDs (never sorting or set-comparing rows):
**component elements 384 types, choice variants 80, message building blocks 43, codes 114 code sets: 0 differences.** The new pull has
the same rows as the old one (same lines as a set, in every file); only the order changed. `universal_lookup` agrees too (checked
`GroupHeader114` and `CreditTransferTransaction76`: identical to the XSD order).

What changed here:
- **Fixtures re-ordered, nothing else:** 84 `complex-types.tsv`, `snapshot-raw.tsv` and `choice-defs.tsv` files regenerated, and 3 more
  re-ordered in place (caam001 and caam009, which carry hand-added rows), all verified as the same rows in a new order; 32
  `message.json` files with their building blocks in spec order.
- **The generator no longer sorts anything.** It verifies instead: a type whose data order differs from `member-order.tsv`, or a code
  set whose codes differ from `code-order.tsv`, is a problem. (It re-sorted members until the snapshot was fixed.) Code options come
  out in the spec's order, not alphabetical; because the codes of one set can sit in several fixtures, they are placed by `code-order.tsv`
  and the set of codes is checked against it.
- `code-order.tsv`: 114 enumerated code sets, from the XSD enumerations, written by the same `spec-extract order` command.
- **Opt-in XSD structure test** (`apps/demo-shared/test/xsd-sequence.test.ts`, `XSD_DIR=<folder of XSDs>`): for all 43 messages, a
  document with every field present validates against the real XSD with no element out of sequence, missing or unexpected (checked that
  the filter catches the original bug: `CreDtTm: This element is not expected. Expected is ( Id )`). Values are not realistic, so value errors are ignored.
