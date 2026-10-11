# Provenance of the Business Application Header fixtures

`head.001.001.04` (BusinessApplicationHeaderV04), the only current message of the `head` area, from the staging ISO 20022 MCP's
**resources**, by the same method as `PROVENANCE-tier1-a.md`.

**One fact is not from the resources.** The repository's `rootElement` attribute says `Document` for this message too, but ISO's
`head.001.001.04.xsd` declares `<xs:element name="AppHdr" type="BusinessApplicationHeaderV04"/>` as the root: the header is
`<AppHdr xmlns="urn:iso:std:iso:20022:tech:xsd:head.001.001.04">` with its fields directly inside, and in ISO JSON `{ "AppHdr": { … } }`.
`tools/spec-extract/messages.json` therefore gives this message an explicit `rootTag: "AppHdr"` (copied to its `message.json`). A message
whose `rootTag` equals its `bodyTag` is its own root; the serializer, the parser and paste detection follow that.

Checks: the order of members and codes from the resources matches ISO's XSD (0 differences), and the opt-in XSD sequence test passes (the
`Signature` field takes elements in the XML signature namespace, so the test's sample for it is a `ds:Signature`).

Also: the older versions `.01` to `.03` and `BusinessFileHeader` (`Xchg`) are not current and not included.
