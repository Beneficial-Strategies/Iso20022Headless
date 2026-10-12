# ISO 20022 text: en-US

The en-US text of the ISO 20022 message explorer and library. This repository holds **only what differs from the ISO English**: anything not written here shows the ISO English text.

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
* `text.lock.json` (and `areas/<area>/text.lock.json`) records the English each entry was written against; the tools keep them. Who changed what and when is the repository's history.
* `glossary.json` lists terms that must be translated one way; `check` warns when an entry does not use them.
* `review/label-conflicts.json` (when present) lists the element names the old catalog had translated more than one way, with the choice made. Settle them, then delete the file.


## Status, license and warranty

This text is provided **free of charge and as is**, under the MIT license (see `LICENSE`), without warranty of any kind. We make our best-faith
effort toward an accurate text, but it is not verified by a professional translator, and until an entry is marked reviewed it is a machine draft.
**Do not rely on it for legal, financial or compliance decisions**: the authoritative text is ISO's English.

**The controls here are lax at present**: there is no formal review process, release gating or ownership policy beyond what you can see in this
repository. We intend to improve them over time (named maintainers per area, required reviews, release checks) should the libraries gain adoption
and sponsorship. Taking over the care of a language, or of an area of one, is welcome.

The English text this repository translates or adapts is ISO's, and ISO's own terms apply to it. The license above covers what is written
in this repository, not ISO's text. This is not legal advice.