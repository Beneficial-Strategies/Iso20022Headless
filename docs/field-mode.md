# Field mode: editable, label or hidden, per element

Every element can be presented in one of three modes, chosen by whoever designs the screen:

| Mode | In an application using the library | In the explorer's editing screen |
|---|---|---|
| **Editable** | the usual control | the usual control |
| **Label** | the value as text, not editable | the control stays editable, shaded with a tint and a dashed outline |
| **Hidden** | not shown at all; its value stays in the message | the control stays editable, hatched with a dashed outline |

The default value of a label or hidden element is simply what is typed into its control on the editing screen: the value is in
the form state and so in the XML, whichever mode shows it. A section's mode applies to everything inside it; where two modes meet,
hidden beats label beats editable.

## In the explorer

A small round button after the "i" and the zoom button of every element shows its mode (a pencil, lines of text, or a crossed eye)
and opens a menu to change it. **Preview as designed** (next to **Copy as**) switches the form to presenting the modes for real:
labels as text, hidden elements gone, everything else unchanged; the XML is the same either way. Modes are kept per message and
type (zooming into a part of a message starts that view afresh) and are not saved with the message.

## The line with design tools

The explorer records the *data* decision (is this element shown, as text, or editable, and with what default) in terms of the
message; colors, fonts, spacing and layout are left to Figma and the like. The Figma export follows the modes (hidden elements are
not drawn, labels have no box) and the other copies carry them (Markdown and outline remarks, a Mode column in the spreadsheet and
Word table, `mode` in the JSON; hidden elements are listed there with their default): see `docs/copy-as.md`.

## How it is built

* Library (`packages/react-ui`): `SchemaForm` / `Iso20022Form` take `fieldMode(element)` and `fieldModeView`; skins add `Value` and
  `ModeMark`. Tests: `apps/demo-zod/test/fieldmode.test.tsx`.
* Demo (`apps/demo-shared`): `FieldModeSwitch.tsx` (the control, imposed through `fieldExtra`), the state and preview toggle in
  `DemoApp.tsx`, wording in `demoText.ts` (English and Spanish). Browser checks: `tools/visual` states `fieldmode-*`.
