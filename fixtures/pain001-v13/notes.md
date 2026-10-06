# pain.001.001.13 dependency crawl (iso20022 MCP only)

Message: CustomerCreditTransferInitiationV13, id faf24cbe-3869-45f3-a382-ffcd8713ffd3, xmlTag CstmrCdtTrfInitn, root Document.

## Message building blocks
- GroupHeader  (4f529681-cc64-42c7-ae7b-39fffcdcad88) -> GroupHeader114 (_yjuzITEyEe6g-ffJsqGiSA), min 1
- PaymentInformation (b6643da8-3a66-4f88-b614-a1d23277da15, PmtInf, minOccurs 1, no maxOccurs => unbounded) -> PaymentInstruction51 (a376f506-35bc-4f88-9925-eceabe35beea)
- SupplementaryData (a3d39e1f-0adb-48a1-955a-24f12678a777, SplmtryData, minOccurs 0) -> SupplementaryData1 (_Qn0zC9p-Ed-ak6NoX_4Aeg_468227563)
- Message constraint SupplementaryDataRule (d3104d39-8b8c-4962-96e5-7f22701d55c7): "The SupplementaryData building block at message level must not be used to provide additional information about a transaction. The SupplementaryData element at transaction level should be used for that purpose."
- SupplementaryData1 also has its own SupplementaryDataRule (_Qn988tp-Ed-ak6NoX_4Aeg_-1492355109), not read.
- PaymentInstruction51 carries ~16 constraints (PaymentTypeInformationRule, ChequeInstructionRule, ChargesAccountRule, ChargesAccountAgentRule, UltimateDebtorGuideline, Cheque*Guideline, ChargeBearerRule, UltimateDebtorRule, Cheque*Rule, NonChequePaymentMethodRule, InstructionForDebtorAgentRule). IDs are in the universal_lookup of a376f506-...; constraint text NOT captured.

## Counts
- Complex types in complex-types.tsv: 97 = 66 MessageComponent + 29 Choice + 2 Amount (ActiveCurrencyAndAmount, ActiveOrHistoricCurrencyAndAmount). Plus 1 ExternalSchema leaf (SupplementaryDataEnvelope1) not in the snapshot.
- MEMBER rows: 362 (303 from snapshot + 59 reconstructed for Choice members, see anomalies).
- Choices: 29 (list below).
- Simple types in simple-types.tsv: 38 rows (31 real simple types + 4 synthetic amount-member names + 2 amount types + SupplementaryDataEnvelope1 row; see anomalies).
- Code sets in codesets.tsv: 41 code sets: 17 enumerated (wire code + enum name), 3 pattern-only (CountryCode, ActiveOrHistoricCurrencyCode, ActiveCurrencyCode), 21 external lists NOT enumerated (one *EXTERNAL* row with approximate code count; counts are repository child counts, approximate).
- MCP calls: roughly 190-200 (about 13 get_data_type_members_snapshot, ~140 universal_lookup, ~25 universal_search, 17+1 get_code_set_details, 4 failed get_simple_type_details).

## Cycles
None. DFS over Component/Choice/Amount edges found no cycle. Notable non-cycles: DocumentLineInformation2.Amount -> RemittanceAmount4 (RemittanceAmount4 does not point back); PartyIdentification272, PostalAddress27, CashAccount40, BranchAndFinancialInstitutionIdentification8 are heavily reused, not recursive.

## Anomalies / things to know
1. get_data_type_members_snapshot returns the DATATYPE row but ZERO MEMBER rows for every Choice type (e.g. Authorisation1Choice, Party52Choice). Choice members were reconstructed: universal_lookup of the choice for child ids, then universal_lookup of each child for min/max, xmlTag, simpleType/complexType/type id, then resolve the id to a name. Those 59 rows are appended at the END of complex-types.tsv; memberIds/xmlTags/definitions (truncated to 120) come from lookup, minOccurs/maxOccurs are what the lookup reported (always 1/1; choice semantics mean exactly one). Their kind (Attribute/Codeset/Component/Amount) was inferred from the target type kind.
2. SupplementaryDataEnvelope1 is absent from the snapshot; universal_search shows it is an `ExternalSchema` (_Kz9KwJDrEeSLQ8ob-qtemg), i.e. an xs:any wrapper. SupplementaryData1.Envelope is reported with kind "Attribute" in the snapshot.
3. Amount types: MEMBER rows of ActiveCurrencyAndAmount / ActiveOrHistoricCurrencyAndAmount are synthetic (memberName e.g. ActiveOrHistoricCurrencyAndAmount_Currency, kind Attribute, dataTypeName same). Those ids/names do not exist in the repository (lookup fails). Real constraints: minInclusive 0, totalDigits 18, fractionDigits 5, currencyIdentifierSet = the matching *CurrencyCode code set.
4. get_simple_type_details errored ("An error occurred invoking") for every call tried (PhoneNumber, Number, amount member names); not used. All simple types were resolved via universal_search + universal_lookup.
5. Several Choice children are not simple: Frequency36Choice.Period is an Attribute whose complexType is FrequencyPeriod1; Frequency36Choice.PointInTime -> FrequencyAndMoment1; AmountType4Choice.EquivalentAmount -> EquivalentAmount2; AccountIdentification4Choice.Other -> GenericAccountIdentification1; AddressType3Choice.Proprietary -> GenericIdentification30 (not a plain Max35Text); Party52Choice -> OrganisationIdentification39 / PersonIdentification18.
6. GenericIdentification30.Identification is Exact4AlphaNumericText.
7. Definition column truncation: rows were hand-transcribed with definitions cut at <=120 chars (sometimes shorter, mid-word); DATATYPE/MEMBER ids, names, kinds, types and occurrences are verbatim. A few definitions (e.g. Authorisation1Choice) are cut slightly short of 120. Treat definitions as informational only.
8. complex-types.tsv line 1 is a mixed header; line 2 is a comment describing both row layouts. DATATYPE row: DATATYPE name isoId kind status checksum definition. MEMBER row: MEMBER parentName memberId memberName xmlTag kind dataTypeName minOccurs maxOccurs definition.
9. Code sets: for versioned restrictions (e.g. PaymentMethod3Code restrictionOf PaymentMethodCode) get_code_set_details already returned usable wire values in the Code column; the "restrictionOf" column lists the base set (base sets not separately fetched). CountryCode and the currency code sets have no code list in the repository (pattern only).
10. External code set ids: all 21 recorded in codesets.tsv with isoId. Largest: ExternalPurpose1Code (~366), ExternalClearingSystemIdentification1Code (~172), ExternalLocalInstrument1Code (~115).
11. Optionality/cardinality of PaymentInformation: maxOccurs not stated on the building block, treat as unbounded (*). SupplementaryData block likewise.
12. Names with typos preserved from source: ExternalPurpose1Code has entries like "BonusPayment." and "AlgeriaAcсountIdentificationCode" (Cyrillic char) in the repository (not captured in files).
13. ExternalFinancialInstitutionIdentification1Code and ExternalMandateSetupReason1Code have no codes in the repository.
14. Unrelated: git status showed an existing fixtures/pain001-v13-sample.ir.json in the fixtures dir (not touched).

## Choice types (29)
AccountIdentification4Choice, AccountSchemeName1Choice, AddressType3Choice, AdviceType1Choice, AmountType4Choice, Authorisation1Choice, CashAccountType2Choice, CategoryPurpose1Choice, ChequeDeliveryMethod1Choice, ClearingSystemIdentification2Choice, CreditorReferenceType2Choice, DateAndDateTime2Choice, DateType2Choice, DocumentAmountType1Choice, DocumentLineType1Choice, DocumentType2Choice, FinancialIdentificationSchemeName1Choice, Frequency36Choice, GarnishmentType1Choice, LocalInstrument2Choice, MandateClassification1Choice, MandateSetupReason1Choice, OrganisationIdentificationSchemeName1Choice, Party52Choice, PersonIdentificationSchemeName1Choice, ProxyAccountType1Choice, Purpose2Choice, RegulatoryReportingType1Choice, ServiceLevel8Choice
