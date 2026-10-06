# Translations of the ISO 20022 text

The ISO 20022 repository is English only. This directory and `tools/i18n` hold the process for translating
the spec text the UI shows (element names, definitions, code names, business rules) and for handing it to a
person to correct. Interface wording and validation messages are separate: they live in
`packages/react-ui/src/i18n/messages.ts` and `packages/validate/src/messages.ts`.

## What is where

| Path | What |
|---|---|
| `i18n/source.en.json` | Every English unit (generated: `pnpm i18n extract`). Key = `kind:isoId`. |
| `packages/validate/src/locales/<lang>.catalog.json` | The translations. **The source of truth.** One entry per unit: text, status, and a hash of the English it came from. |
| `i18n/glossary.<lang>.json` | Terms that must be translated one way (Debtor → ordenante, …). |
| `i18n/xliff/<lang>.xlf` | An XLIFF 2.0 export for a translator or translation platform (generated). |

Units: `label` (form label), `field` (element definition), `type`, `code` (code definition), `codeName`
(name shown after the code in a dropdown), `codeSet`, `rule` (business rule prose). Keys use the ISO 20022
repository id, so they are unambiguous, but ids are per message version: a new version of a message needs a
new pass.

## Status of an entry

* **machine**: drafted by a machine or an assistant. Used by the UI, and marked "machine translated, not yet reviewed".
* **reviewed**: a person approved or edited it. Never overwritten by a machine pass.
* **stale**: the English changed after the translation was made. Shown as untranslated again until redone.

## Handing off for review

1. `pnpm i18n export-xliff es` writes `i18n/xliff/es.xlf`.
2. Send that file to the reviewer, or upload it to a translation platform (Crowdin, Lokalise, Phrase, Weblate, …;
   all read XLIFF 2.0). They see the English, the current Spanish, a note with the context, and the state
   (`translated` = machine draft, `final` = reviewed, `initial` = nothing yet).
3. They correct the targets (and may set `state="final"` on ones they approve unchanged).
4. `pnpm i18n import-xliff es <edited.xlf> "Reviewer Name"` applies the file:
   any entry whose text was edited, or whose state is `reviewed`/`final`, becomes **reviewed**, with the reviewer
   and date recorded. Units translated against English that has since changed are skipped.
5. Commit the catalog. Reviewed text now wins over any later machine pass.

A reviewer can also edit `<lang>.catalog.json` directly: change `text` and set `"status": "reviewed"`.

## Machine drafts

`pnpm i18n merge es <draft.json> <engine-name>` adds machine entries from a JSON object whose keys are unit keys
or English texts (an English key applies to every unit with that text, so a repeated label is translated once).
Drafts are checked first (`pnpm i18n lint es <draft.json>`): codes, identifiers, paths and the `|` paragraph
markers must survive, and glossary terms are flagged. Broken drafts are rejected. The engine can be anything
(a translation service, an assistant, a person): the tool only needs the JSON.

## Keeping it current

`pnpm i18n check es` reports missing, stale and orphaned entries and exits 1 on stale or orphaned ones (use it in
CI). When the generated English changes, re-run `extract`, then `merge` drafts for the stale units.

## Overriding at runtime, without touching the catalog

An application can correct or add text per locale; its text wins and is not flagged as machine-translated:

```tsx
<DemoApp i18n={{ definitions: { es: { labels: { [isoId]: 'Medio de pago' } } } }} />
createDefinitions('es', { fields: { [isoId]: 'Texto corregido.' } }, { es })
```

## Caveats

* Machine drafts of payment terminology need a banker's review. The glossary fixes the core terms, but the
  choices (for example *ordenante* for Debtor) are a starting point.
* Check ISO's terms for translating and republishing their text (tracked in issue #1), and your translation service's terms for the
  text you send it, before shipping translations.
* Element labels are translated once per English name and shared by every element with that name; a reviewer can
  override a single element by its id.
