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
| SVG for Figma | the SVG markup as text: paste onto a Figma canvas (see below) |
| SVG file | the same drawing saved as `<identifier>.svg`, to drag into Figma |

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

## Field modes in the copies

When elements have a field mode (editable, label or hidden: `docs/field-mode.md`), the copies carry it: Markdown and the outline say
`(required, hidden)` or `(required, label)` where it is set (not again on what is inside); the spreadsheet and the Word table get a
**Mode** column (only when some element has a mode) with each row's mode, hidden elements included with their default value; the JSON has
`mode` on every element that is not editable. The **Figma drawing** shows what an application would show: hidden elements and
everything inside a hidden section are left out, a label is drawn as its text with no box, a section in label mode has no boxes,
checkboxes or add buttons, and optional sections left out are not drawn.

## For Figma

`screenSvg.ts` draws the screen model as a **wireframe** in plain SVG: groups, rectangles, paths and text only (no styles, classes,
embedded HTML or references, which design tools drop), greys plus one red for errors, so look and feel can be added in Figma.
Every element has an `id` made from its ISO path (`GroupHeader.MessageIdentification.input`, a list entry `[0]` is `.0`), which
Figma uses as the **layer name**. It shows what the screen shows: input boxes with their values, required stars, selects with a
caret, amounts as currency and amount boxes, lists with their add button and entries, choices in a dashed frame, optional
sections as a checked or unchecked "Include …" box, errors in red; the options above apply (definitions wrap under the elements).

Text is measured with the browser's own text engine, so lines and boxes fit; Figma will use its own font (Inter, or a
substitute), so widths can differ a little. There is no auto layout or components in an SVG import: the analyst gets positioned,
named layers. The JSON copy is meant as the input of a later Figma plugin that would build frames with auto layout and components.

Checked here: the SVG is well-formed XML, uses only the elements and attributes above, has unique valid ids, stays inside its
page with no overlapping input boxes, and the browser loads it as a picture of the declared size (`copyas-figma-svg` saves a render
as `tools/visual/out/copyas-figma-svg-render.png`). **Not checked here: importing into Figma itself.**
