# External code sets

Some ISO 20022 fields (a payment's purpose, a clearing system, a local instrument, ...) have a type whose values an outside body
maintains. The model marks those types `external: true`. ISO's repository still lists the values it knows, in the publisher's declared
order, with a name and a definition each, so the library treats such a set **like any other code set that has values**:

- a form shows it as a dropdown of `value — name`, with the definition as the description, in that order;
- the names and definitions are translated with the rest of the spec text (all shipped languages) and can be overridden the same way;
- unlike an enumerated set, an external one **accepts any value of the right length** (the list is not closed: ISO adds codes between
  releases and banks use their own). A value that is not listed, typed into XML or pasted, is shown as it is and stays valid.

83 of the 100 external code sets in the library have values (2,556 in all; release `2Q2026 (v3)` of ISO's external code lists). For the
other 17 the field stays a text box: ISO publishes no list for 13 of them, and four (`LanguageCode`, `NationalityCode`,
`UnicodeChartsCode`, `BusinessMessagePriorityCode`) are not external sets in ISO's resources and are not enumerated here yet.

The repository lists one value twice with two meanings (`CTP` in `ExternalLocalInstrument1Code`); it is offered once.

## Changing the values

The options are part of the type descriptor, so a host that wants its own values passes its own copy of the descriptors:

```tsx
import { Iso20022Form } from '@beneficial-strategies/iso20022-react-ui';
import { schemas, typeDescriptors } from '@beneficial-strategies/iso20022-validate/pain001';

// defined once, outside the component
const myDescriptors = {
  ...typeDescriptors,
  ExternalPurpose1Code: {
    ...typeDescriptors.ExternalPurpose1Code!,
    options: [
      { value: 'ACME', name: 'AcmeInternal' },                                                  // add
      ...typeDescriptors.ExternalPurpose1Code!.options!.filter((o) => o.value !== 'SALA'),        // delete
    ],
  },
};
const myText = { definitions: { en: { codeNames: { ACME: 'Our own purpose' } } } };           // names and definitions: see I18nOverrides

<Iso20022Form type="..." schemas={schemas} typeDescriptors={myDescriptors} overrides={myText} />
```

A value without an `isoId` takes its label from `codeNames` under its `value` (or the humanized `name`), and its description from `codes`.

## Where the values come from

`spec-extract external-codes --pages <saved resource pages>` writes `fixtures/external-codes/` (`codesets.tsv`, `codedefs.tsv`) from the
CodeSet dictionary of the MCP resources; the generator reads it for every external code set a message uses. The published lists
(`iso20022://element/<code set id>/external`) agree with the repository's codes for 80 of the 83 sets; for three the repository has
extra values the publisher's list does not (24 for `ExternalLocalInstrument1Code`, 4 for `ExternalClearingSystemIdentification1Code`,
1 for `ExternalCashClearingSystem1Code`), and those are offered too.
