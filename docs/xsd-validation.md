# XSD validation in the demos

The **XSD Validate** button (left of "Load file…") checks the XML the form produces against ISO's XSD schema of the message.

## Where the schema comes from

* **Address.** ISO publishes every message's schema at
  `https://www.iso20022.org/sites/default/files/documents/messages/<area>/schemas/<identifier>.xsd`
  (for example `.../pain/schemas/pain.001.001.13.xsd`). The ISO 20022 repository gives this as the `XSD Schema` of a message
  (staging MCP, `universal_lookup`); it was the same pattern for pain, pacs and caam messages. The generated registry carries it
  as `MessageInfo.xsdUrl`. The files download without a login.
* **Cross-origin.** ISO's server sends no `Access-Control-Allow-Origin`, so a page on another site (GitHub Pages, `localhost`)
  is not allowed to read the file. The page still tries, once, when a message is chosen. If the browser refuses (or the file
  is not found, or is not that message's schema) the button is disabled and its hover text says
  *Could not load schema from … Right-click to load from local file.*
* **While developing (`vite` / `pnpm dev`)** the dev server fetches ISO's file for the page (a proxy at `/iso20022-xsd/...` in each
  app's `vite.config.ts`), so the schema loads by itself and the button is enabled. The hover text still names ISO's address.
  A built or deployed page has no proxy and is in the situation above. `VITE_XSD_PROXY=off` turns the proxy off (the browser
  checks do, so that they behave like a deployed page and do not need the network). **Restart the dev server after pulling a
  change to `vite.config.ts`.**
* **Local file.** Right-click the button (or press the menu key on it) to choose the downloaded `.xsd`, or use "Load a
  different schema file…" in the validation window. The file must be the schema of the chosen message (its `targetNamespace`
  is checked); otherwise a message says why and nothing changes.
* **How long it is kept.** The loaded schema stays while only the *type* changes (zooming, the type list) and is dropped, with
  the validation window, when another *message* is chosen.
* ISO's schemas are not part of this repository.

## What is validated

The XML as shown. A whole message is validated as it is. A part of a message (a type chosen in the type list, or reached by
Zoom) has the message's namespace added **on the fly**, as if inherited from its container (the XML shown is not changed), and
is validated against a small generated wrapper schema that includes the message's schema and declares the part as a top-level
element (ISO's files declare only `Document`). Output set to JSON disables the button.

Errors appear in the **Validation Errors** window under the XML, with line numbers, and are recomputed shortly after every
change while the window is open: correcting a value removes its error. The validator's wording is English.

## How

`xmllint-wasm` (libxml2 compiled to WebAssembly, in a worker). It is loaded the first time a validation runs, so pages that
never validate do not download it (about 0.8 MB). Vite must not pre-bundle it (`optimizeDeps.exclude` in both demos).

## Tests

* Unit: `apps/demo-shared/test/xsd.test.ts` (namespace insertion, schema checks, wrapper schema, the request given to the
  validator) and `useXsd.test.tsx` (fetching, refusal, wrong schema, files, reset on another message, late answers).
* Browser: `tools/visual` states `xsd-*` use `tools/visual/xsd/pain.001.001.13.test.xsd`, a **reduced stand-in** (real namespace
  and type names, only the group header defined). To also run against ISO's own file, download it and run
  `VISUAL_ISO_XSD=/path/to/pain.001.001.13.xsd pnpm visual check --only xsd-real-iso-schema`.
* The expected, blocked request for ISO's file is ignored by the visual runner's console check; nothing else is.
