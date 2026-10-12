# Provenance of the tier 2 fixtures: Securities Events (`seev`)

71 messages, the current version of every message in the `seev` business area, except `seev.017.001.01` and `seev.021.001.01` (see
below). Same method as `PROVENANCE-tier2-semt.md` (staging ISO 20022 MCP **resources** only). The area page was pulled with
`iso20022://element/<area id>/details?take=2000&includeDefinition=true` in five pages (432 messages including old versions; 73 current).

**Exclusive groups, now also between message building blocks.** The semt batch read `xors` constraints on components
(`impactedElements`). In `seev` some messages also carry them between top-level blocks (`impactedMessageBuildingBlocks`); the loader
reads those the same way: the blocks of a required-one group become optional on their own and the group gets an at-least-one rule
plus `<Name>NotBoth` rules.

**Left out: `seev.017.001.01` and `seev.021.001.01`.** Both use `CashBalanceType1FormatType`, whose members are all mandatory in the
resources with no `xors` constraint, while ISO's schema makes them an `xs:choice`. The resources do not say that, so the messages are
not generated until they do (reported to the MCP team together with `PortfolioBalance1`, which blocks `semt.024.001.01`).

**Rule engine change.** Nine rules (`DissenterRights1` and `DissenterRights2` on `CorporateAction88`/`87`/`94` and
`CorporateActionOption245`/`247`/`252`) say that when one occurrence of a list has a value, every occurrence of the same list must have
another. The engine evaluated condition and consequence per occurrence, so they could never fail. When the condition and the
consequence share a `[*]` path, the condition now holds if some occurrence satisfies it and the consequence must hold for every
occurrence. `rules-seev.test.ts` pins this; `rule-satisfiability.test.ts` allows these rules to need two list items.

Checks: the opt-in XSD sequence test passes for every message with a published schema (302 of 302), and the order of members and codes
from the resources matches ISO's XSDs.

Rules: 2088 in all 302 messages, 1041 of them checkable by expression; `rulecoverage.test.ts` pins them (nine new
`rule_literal_not_code_value` entries in the unsupported map).
