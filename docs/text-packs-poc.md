# Text packs: proof of concept

The spec text of a language (labels, definitions, code names, rules) served as static files by a text host, instead of the catalogs
bundled with the library. Scope of the proof: languages `fr`, `de` and `en-US`; messages `pain.001.001.13`, `pain.002.001.15` and
`head.001.001.04` (the application header every message can include). Interface wording and validation messages are still bundled.

## Try it

```sh
cd tools/i18n
pnpm packs build --out /tmp/text-host --langs fr,de      # writes /tmp/text-host/v1/<lang>/...
pnpm packs serve --dir /tmp/text-host --port 5200        # a development text host (any origin may read it)
# the demo (pnpm --filter demo-form dev), then
#   http://localhost:5173/?lang=fr&message=pain.001.001.13&textHost=http://localhost:5200
```

Without `textHost` the demo works as before. With it, French spec text comes only from the host (stop the host and the spec text is
English while the interface stays French).

## Layout

| File | Holds |
|---|---|
| `v1/<lang>/labels.json` | `{ "BatchHeader": "…" }`: one label per element **name**, the same in every message |
| `v1/<lang>/labels.conflicts.json` | the names the catalog had translated more than one way, with the choice made (for a reviewer) |
| `v1/<lang>/messages/<identifier>.json` | one message: `types`, `members` (`Type/Member`), `codeSets`, `codes` and `codeNames` (`CodeSet/VALUE`), `rules` (`Type/Rule`) |
| `v1/<lang>/manifest.json` | the files of the language (unused by the library so far) |

`packages/validate/src/text-pack.ts` turns a pack into the id-keyed catalog the form already reads (`expandTextPack`), using the
message's own type descriptors; `loadTextPack` fetches the files (one request per file, however many forms ask). `useCreateI18n`
takes an optional `TextSource`. The pack builder is `tools/i18n/src/packs.ts` (library: `packsLib.ts`).

## What the proof showed

* A French `pain.001` form needs 3 requests, about 108 KB gzipped (labels 43, message 54, header 11), instead of the 1.4 MB gzipped
  language chunk.
* 4,107 distinct element names; the catalog translated 73 of them (fr) and 150 (de) more than one way. In the form 78 of 79 visible
  labels were identical to the bundled ones; the other is such a name ("Banque du compte de frais" / "des frais").

## Not done

Interface and validation messages (functions today; need a data format such as ICU MessageFormat), per-type label overrides for names
that need different words in different places, the manifest and versioned release paths, the hub that gathers language repositories,
caching headers on a real host, and `en-US`.

## The language repository (en-US first)

What the people who own a language edit. `tools/i18n/src/textrepo.ts`:

```sh
pnpm --filter ./tools/i18n text init   --repo ../iso-20022-text-en-US --lang en-US   # seed from what the library does today
pnpm --filter ./tools/i18n text status --repo ../iso-20022-text-en-US                # overridden, reviewed, stale, orphaned
pnpm --filter ./tools/i18n text add    --repo ../iso-20022-text-en-US --kind labels --key PostCode   # copy the English in, ready to edit
pnpm --filter ./tools/i18n text check  --repo ../iso-20022-text-en-US                # lint (exit 1 on errors)
pnpm --filter ./tools/i18n text build  --repo ../iso-20022-text-en-US --out /tmp/text-host   # the files the host serves
```

A repository holds only what differs from the ISO English (en-US: 1,824 entries of 72,890 texts); the rest falls back to English.
`labels.json`, `members.json`, `types.json`, `codes.json`, `code-names.json`, `code-sets.json`, `rules.json` are one entry per line,
sorted, keyed by name (`PostCode`, `PostalAddress27/PostCode`). `source/*.en.json` is generated and read-only: the English of every
text with a note on what it is and where it appears (JSON cannot hold comments, so the notes live beside the files).
`text.lock.json` records the English each entry was written against, so `status` can say when the English moved; `reviewed.json`
lists approved entries. The README of each repository explains this to its editors.

Finding from building it: the en-US spelling rules were also rewriting element and message names inside rule and definition text
(`CreditTransferTransactionInformation/CheckInstruction` for the real `ChequeInstruction`). `check` caught it; element names in prose
are now left alone (code names are still rewritten), in the seed and in the library's runtime rule.
