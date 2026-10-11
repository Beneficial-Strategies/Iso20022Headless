# Provenance of the tier 1, part B fixtures

34 messages, the current version of every message in the Account Management business area (`acmt`). Same method as
`PROVENANCE-tier1-a.md` (staging ISO 20022 MCP **resources** only; the `acmt` area page was pulled with
`iso20022://element/<area id>/details?take=2000&includeDefinition=true`, 158 messages in one page, 34 of them current).

Checks: the opt-in XSD sequence test passes for all 186 messages, and the order of members and codes from the resources matches ISO's
XSDs (`spec-extract order --xsd` only adds six single-member types the resource writer does not list, which the generator does not need).

Rules: 70 (36 with expressions). Twenty are prose only, one more is not checkable (`PaymentInstruction49.ChargesAccountAgentRule`, the
same literal-not-a-code-value case as 50 and 51); `rulecoverage.test.ts` pins them.

Translations: 4,489 new units per language, 1,131 of them reused from identical texts; the rest drafted by language models in
chunks (`tools/i18n` `merge ... assistant`). Texts that localised a protected acronym (US, UK, EU, GDPR, MIFID, UCITS) were put back to
the acronym, as the translation check requires.
