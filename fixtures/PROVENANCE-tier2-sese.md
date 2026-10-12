# Provenance of the tier 2 fixtures: Securities Settlement (`sese`)

61 messages, the current version of every message in the `sese` business area (including the flavour `.002` messages, named
`sese020f2` and so on). Same method as `PROVENANCE-tier2-semt.md` (staging ISO 20022 MCP **resources** only). The area page was pulled
with `iso20022://element/<area id>/details?take=2000&includeDefinition=true` in five pages (472 messages including old versions).

Nothing was left out: no component needed an exclusive-group (`xors`) constraint that the resources lack.

Checks: the opt-in XSD sequence test passes (363 of 363 messages in the library). ISO's schemas were fetched only to test. Four of the
61 are not published at ISO's usual address, so they were not checked against an XSD: `sese.020.001.09`, `sese.021.001.08`,
`sese.022.001.08`, `sese.023.001.13`.

Rules: 680 (315 with expressions); the rest exist only as prose in the repository. `rulecoverage.test.ts` pins them. Six rules compare
with a literal that is not a code value (`rule_literal_not_code_value`), which the evaluator cannot check.
