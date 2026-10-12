# ISO 20022 text: en-US

The en-US text of the ISO 20022 message explorer and library. This repository holds **only what differs from the ISO English**: anything
not written here shows the ISO English text.

## What to edit

| File | Key | What it is |
|---|---|---|
| `labels.json` | `PostCode` | the form label of an element, the same in every message that has it |
| `members.json` | `PostalAddress27/PostCode` | the definition of an element inside one type |
| `types.json` | `PostalAddress27` | the definition of a type |
| `codes.json`, `code-names.json` | `AddressType2Code/HOME` | a code's definition and the name shown after it in a dropdown |
| `code-sets.json`, `rules.json` | `AddressType2Code`, `Type/RuleName` | a code set's definition; the text of a business rule |

Each file is one entry per line, sorted. Keep placeholders, element names, acronyms (IBAN, BIC, ...) and `|` (a line break) as they are in the English.

## Finding what to change

* `source/*.en.json` (generated, read-only) has the English of every text and a note on where it appears. Search it, then use
  `node tools/i18n/src/textrepo.ts add --repo . --kind members --key PostalAddress27/PostCode` to copy that entry into the file ready to edit.
* `status` lists what is overridden, reviewed, stale (the English changed after the entry was written) and orphaned (no longer in the English).
* `check` lints the files; it runs on every pull request.
* `reviewed.json` lists the entries a person has approved. Anything else is a machine draft and is shown as such.

`text.lock.json` records the English each entry was written against; the tools keep it. Do not edit `source/` by hand.
