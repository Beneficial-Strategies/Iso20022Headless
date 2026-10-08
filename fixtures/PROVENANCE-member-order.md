# Provenance of fixtures/member-order.tsv

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
