# "Copy as": the screen for documents and tools

The **Copy as ▾** menu above the form copies what the form shows *right now* in a format for an analyst's document or tool. It
belongs to the demo app (`apps/demo-shared`), not to the form library, and it is not affected by the XML/JSON output setting.

| Item | Clipboard |
|---|---|
| Word / rich text | HTML (a table, inline styles only) plus a plain-text outline: pastes as a table into Word, Outlook, Google Docs |
| Markdown | an outline: `- **Label** (required): value`, with what is not included in italics |
| Spreadsheet | tab-separated rows (a data dictionary of the screen): level, path, element, ISO element, ISO type, kind, required, status, value, error |
| Plain-text outline | an indented tree |
| JSON | the same structure, for tools |
| Image (PNG) | the whole form, scrolled or not, at twice the pixels with a margin; a browser that cannot put an image on the clipboard saves a file |

Options (kept while only the type changes): **include the ISO 20022 definitions** (off), **show optional sections that are not
included** (on; one line each, so the reader sees what was chosen), **show optional elements left empty** (on; required elements
left empty always show). Zoomed into a part of a message, only that part is copied. Words in the copy (required, not included,
column headings) follow the page language; ISO names do not. Nothing leaves the browser.

## How it is built

* `screenModel.ts` turns the form state into a tree (`ScreenNode`: path, label, ISO element and type, required, status, value,
  error, definition) following the same rules as `SchemaForm`'s rendering (lists, optional sections, choices, amounts, codes).
* `screenExport.ts` has one pure function per format over that tree; `demoText.ts` holds the demo's own wording (English and
  Spanish), outside the form library's catalog.
* `copyOut.ts` puts things on the clipboard with fallbacks (older copy route for text; a download for an image).
* `CopyAsMenu.tsx` is the menu (keyboard: arrows, Home/End, Escape, Enter).
* Tests: `apps/demo-shared/test/screen.test.ts` (model and every format, including escaping) and `tools/visual` states `copyas-*`
  (each format read back from the real clipboard, the options, keyboard, Spanish, zoomed part, narrow screen). The picture the
  image check reads from the clipboard is saved as `tools/visual/out/copyas-image-clipboard.png`.

## Toward Figma

The JSON is meant as the input of a later Figma plugin (it reads the screen description and builds frames); an SVG export in a
wireframe style, which Figma imports by drag and drop, is the other planned step.
