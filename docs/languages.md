# Languages

The library ships these language tags: `en` (ISO English), `en-US` (American English), `es`, `fr`, `de`, `pt`.
Anything else a host registers (`I18nOverrides`) works the same way.

## What a language covers

| Layer | Where it lives | `en-US` | `es` | `fr`, `de`, `pt` |
| --- | --- | --- | --- | --- |
| Text of the library's own controls (required, optional, Add, Remove, the help popups) | `packages/react-ui/src/i18n` | ISO English | translated | translated |
| Validation messages and pattern hints | `packages/validate/src/messages.ts`, `patterns.ts` | ISO English | translated | translated |
| ISO spec text: element labels, definitions, code names, rules | `packages/validate/src/locales/<lang>.catalog.json` | ISO text rewritten (below) | translated | translated |

All translations are machine-drafted until a person reviews them. Spec-text entries carry that status and the interface says so. Each spec-text catalog holds the 6,309 units of all 37 messages and loads on demand, so a language costs nothing until it is used. The core payment terms (Debtor, Creditor, Agent, ...) are fixed per language in `i18n/glossary.<lang>.json`.

The demos' page text (banner, dialogs, buttons, Copy as, field modes) is separate: it lives in `apps/demo-shared`
(`src/text/` and `src/demoText.ts`) and is not part of the library. A host that embeds the controls writes its own page
text; the library never imposes any. The demos ship the same six languages.

## Fallback

Text is looked up from the most specific tag to the least, and the last stop is always the ISO English text:

    es-MX -> es -> en (ISO)          en-US -> en (ISO)          pt-BR -> pt -> en (ISO)

`en` is the ISO repository's wording exactly ("Organisation", "Cheque"), so it is the right choice when quoting the standard.
The demos keep their own text separate from the library's, so their fallback is the demo's own English, not the ISO text: `es-MX -> es -> demo English`. A test fails if a shipped language is missing any demo string.

## American English

`en-US` is not a second copy of the text. It is the ISO English passed through a small set of rewrite rules
(`packages/validate/src/variants.ts`) at display time:

1. **Spelling:** `Organisation` to `Organization`, `Authorisation`, `Initialisation`, `Cheque` to `Check`, `Cypher`, and so on.
2. **Terms:** `Town Name` to `City Name`, `Post Code` to `Postal Code`, `Country Sub Division` to `State or Province`.

The rules touch only text a person reads. XML tags, ISO paths, code values and the XSD are never changed.
Text that a catalog wrote for `en-US` itself is left exactly as written, so a hand-made correction always wins.
A test scans every label, definition, code name and rule for spellings the rules should have caught.

To add another English variant, pass your own rules: `createDefinitions('en-AU', {}, locales, { 'en-AU': myRules })`.

## Adding a language

1. Control text: copy `packages/react-ui/src/i18n/ui.fr.ts` (21 short strings), translate, and register it in `uiLocales`
   (a test checks that every key and placeholder matches English).
2. Demo page text, if you use the demo shell: `apps/demo-shared/src/text/page.fr.ts` and `src/demoText.fr.ts`.
3. Validation messages and pattern hints: add a catalog in `messages.ts` and the pattern words in `patterns.ts`.
4. Spec text (optional, large): `tools/i18n` extracts the units, merges drafts and tracks review; see `i18n/README.md`.

A host that only needs a few words changed passes `I18nOverrides` instead and ships no catalog.

## Reporting a wording problem

The demos' language menu links to a prefilled GitHub issue that names the language and page.
The tool is free; wording fixes land when they can.
