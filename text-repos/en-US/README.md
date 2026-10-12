# ISO 20022 text: en-US

The en-US text of the ISO 20022 message explorer and library. This repository holds **only what differs from the ISO English**: anything
not written here shows the ISO English text.

## What to edit

`labels.json` has the form label of every element, one per element name, the same in every message that has it. Everything else is
under `areas/<area>/`, where `<area>` is a business area (`pain`, `camt`, `seev`, ...) or `shared` for types that messages of two or
more areas use. In each area folder:

| File | Key | What it is |
|---|---|---|
| `members.json` | `PostalAddress27/PostCode` | the definition of an element inside one type |
| `types.json` | `PostalAddress27` | the definition of a type |
| `codes.json`, `code-names.json` | `AddressType2Code/HOME` | a code's definition and the name shown after it in a dropdown |
| `code-sets.json`, `rules.json` | `AddressType2Code`, `Type/RuleName` | a code set's definition; the text of a business rule |

Each file is one entry per line, sorted. Keep placeholders, element names, acronyms (IBAN, BIC, ...) and `|` (a line break) as they are in the English.
You do not decide which area folder an entry goes in: `add` puts it in the right one, and `check` says if one is in the wrong place.

## Finding what to change

* `source/` is the English of every text with a note on where it appears (the *source artifact* of the library's release; `sync --from <folder>`
  fetches it; it is not committed). Search it, then `add --kind members --key PostalAddress27/PostCode` copies that entry in, ready to edit.
* `status` lists what is overridden, reviewed, stale (the English changed after the entry was written) and orphaned (no longer in the English).
* `check` lints the files; it runs on every pull request.
* `reviewed.json` lists the entries a person has approved. Anything else is a machine draft and is shown as such.
* `text.lock.json` records the English each entry was written against; the tools keep it. Who changed what and when is the repository's history.
