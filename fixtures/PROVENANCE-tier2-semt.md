# Provenance of the tier 2 fixtures: Securities Management (`semt`)

44 messages, the current version of every message in the `semt` business area (32 of the first flavour, 12 of flavour `.002`),
except `semt.024.001.01` (see below). Same method as `PROVENANCE-tier1-a.md` (staging ISO 20022 MCP **resources** only). The area
page was pulled with `iso20022://element/<area id>/details?take=2000&includeDefinition=true` in two pages (206 messages including
old versions).

A second flavour of a message family has its own module and fixture directory: `semt002f2` (`semt.002.002.xx`), not `semt002-002`
(a hyphen is not valid in a module name).

**Exclusive groups (new in this batch).** The repository marks members of which only one may be present with an `xors` constraint
("Either X or Y must be present, but not both"). ISO's schema makes such a group an `xs:choice` inside the component. The loader now
reads them: the members of a group of which one must be present (each mandatory in the repository) become optional on their own,
and the group gets rules in the specification's rule language: the repository's own rule says at least one is present, and
`<Name>NotBoth` rules say that if one is present the later ones are not (one rule per member but the last). A group of optional members
gets only the "not both" rules, under the repository's own rule name. All carry the repository's text.

**Left out: `semt.024.001.01`.** Its balance block uses `PortfolioBalance1`, whose two members (`SummaryBalance`, `DetailedBalance`) are
both mandatory in the resources and have no `xors` constraint, while ISO's schema makes them an `xs:choice`. The resources do not
say that, so the message is not generated until they do (reported to the MCP team).

Checks: the opt-in XSD sequence test passes for every message with a published schema (its sample keeps only the first member of an
exclusive group), and the order of members and codes from the resources matches ISO's XSDs.

Rules: 481 (210 with expressions); the rest exist only as prose in the repository. `rulecoverage.test.ts` pins them.

Other changes this batch needed: the pattern description now reads `\n` and `\r` inside a character class (ISO's Latin text pattern),
the en-US rewrite rules gained `reorganis-` and `enquiring`, and the generated registry casts each message definition so that
TypeScript can check a registry of this size.
