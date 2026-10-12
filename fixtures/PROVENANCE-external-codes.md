# Provenance of `fixtures/external-codes/`: the values of external code sets

2,556 values of 83 external code sets (of the 100 the library uses), taken from the staging ISO 20022 MCP **resources** only: the CodeSet
dictionary (`iso20022://dictionary/CodeSet/details?take=2000&includeDefinition=true`), where an external code set lists its values as
ordinary `code` children (id, name, value, definition) in the order the publisher declares them. `spec-extract external-codes` writes
`codesets.tsv` and `codedefs.tsv` here for the external sets some message's fixtures mark `*EXTERNAL*`.

Checked against the publisher's own lists (`iso20022://element/<code set id>/external`, release `2Q2026 (v3)`, taken 2026-10-11): for 80 of
the 83 sets the codes and their order are identical. For three the repository has extra values the published list lacks
(`ExternalLocalInstrument1Code` 24, `ExternalClearingSystemIdentification1Code` 4, `ExternalCashClearingSystem1Code` 1); they are offered
too. `ExternalLocalInstrument1Code` lists `CTP` twice with two meanings; the first is kept.

The other 17 types the model marks external have no values in the repository: ISO publishes no list for 13, and four (`LanguageCode`,
`NationalityCode`, `UnicodeChartsCode`, `BusinessMessagePriorityCode`) are not external sets in ISO's resources. They stay free text.

Values are options, not a closed list: the schema checks the length only (see `docs/external-codes.md`).
