# Languages

The library carries **English only**: the ISO English text, the library's own control text and its validation messages. No other language is bundled, so a
language is never a change to this repository. Every other language is **text**, served by a text host.

## Where the languages live

The text is kept in separate repositories and published as static hosts (the convention is the hub's `SPECIFICATION.md`):

| Repository | Host | What it holds |
| --- | --- | --- |
| `iso-20022-text` (the hub) | `https://iso-20022-text-en.beneficialstrategies.com` | the ISO English, word for word, plus the text our tools generate (`format`) |
| `iso-20022-text-en-US`, `-fr`, `-de`, `-es`, `-pt` | `https://iso-20022-text-{lang}.beneficialstrategies.com` | only what differs from the hub: a `glossary.json` and sparse exceptions |

A host serves one small resource per type (`/{TypeName}`), the messages and areas (`/messages`, `/areas`), and the text of the tools that use it
(`/tools/explorer/*` for this Explorer, `/tools/headless/*` for the library's controls and validation messages). The same text serves a UI, a C# API or any other
consumer, so an error message for a malformed BIC reads the same everywhere.

## How an application gets a language

The library takes text through `I18nOverrides`, keyed by locale tag: `{ ui, validation, definitions }`. An application fetches what a host serves and passes it in.
The Explorer does this for you: `apps/demo-shared/src/textHost.ts` reads the host for the chosen language (configured by `VITE_TEXT_HOST` and `VITE_TEXT_LANGS`,
or `?textHost=` and `?textLangs=` in the address; see the comments there), requests `/{TypeName}` for the types of the message it shows, and builds the overrides.
Without a host, or if a host is down, the page is English.

## Fallback

Text is looked up from the most specific tag to the least, and the last stop is always English:

    es-MX -> es -> en          en-US -> en          pt-BR -> pt -> en

`en` is the ISO repository's wording exactly ("Organisation", "Cheque"), so it is the right choice when quoting the standard. `en-US` is the `iso-20022-text-en-US`
host: the ISO English passed through that repository's glossary (spelling and terms such as `Town Name` to `City Name`). The library has no rewrite rules of its own.

## Adding a language

Create `iso-20022-text-{tag}` from an existing language repository (see the hub's README): list the words of the names in `glossary.json`, add explicit entries under
`types/` for the definitions you translate, and add a `wrangler.jsonc` for its host. Then add the tag to `VITE_TEXT_LANGS` and, for its name in the dropdown, to
`LANGUAGE_NAMES` in `packages/react-ui`. Nothing in this repository carries the text.

## Reporting a wording problem

The demos' language menu links to a prefilled GitHub issue that names the language and page. The tool is free; wording fixes land when they can.
All translations so far are machine-drafted. **Translations.** Translated versions are machine translated, may contain errors, and are provided for convenience only. They are not binding. All matters are to be resolved on the untranslated English (US) version, under United States law.
