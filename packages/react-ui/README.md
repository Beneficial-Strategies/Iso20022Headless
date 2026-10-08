# @beneficial-strategies/iso20022-react-ui

A ready-made React form for any ISO 20022 type in the generated messages, with validation, prompts
(spec definitions) and localized messages working. Not published to npm yet.

```tsx
import { Iso20022Form } from '@beneficial-strategies/iso20022-react-ui';
import { schemas, typeDescriptors } from '@beneficial-strategies/iso20022-validate/pain001';

<Iso20022Form
  type="BranchAndFinancialInstitutionIdentification8"
  schemas={schemas}
  typeDescriptors={typeDescriptors}
  onChange={(value, { valid, errors }) => { /* save, send, transform */ }}
/>
```

- **Looks:** the default `plainSkin` is ordinary HTML controls and needs no CSS. For the Tailwind look pass
  `skin={tailwindSkin}` and add three lines to your stylesheet (see the "Implement!" dialog in the demos).
  To match your own design system, write a `Skin` (see `src/skin/types.ts`): it is a set of small components.
- **Language:** `locale="es"`. English and Spanish are included; the spec text for a language loads on first use.
- **More control:** use `useIso20022Form` (from `@beneficial-strategies/iso20022-react`) and `<SchemaForm form={form} />` directly.

The package also holds the pieces the demos use: `SchemaForm`, the skins, `I18nProvider`, `DescribedSelect`, `Info`, `Popup`.

Help on an element: hovering (or keyboard-focusing) the "i" button shows the definition in a popup that ends with a hint to click; clicking it shows the same text inline under the label. A skin supplies `Info` (the button, given `open`/`onToggle`/`noteId`) and `InfoNote` (the inline text), and places the `note` it is passed under the label in `Field`, `Group`, `Toggle`, `ListHeader` and `Title`; the plain skin keeps a native `<details>`.

Field widths: each control is as wide as its type needs, with room to spare, not as wide as its panel: a country code is short, a 35-character identifier a good part of the panel, a name that can be 140 characters the full width. The size comes from what the type allows (its length limit, or the longest value its pattern can match, its digits, the longest of a dropdown's options in the page's language) and is a maximum, so a narrow panel still wins; a date-time box is the same width with or without its Now button. `fieldSizing="full"` on `SchemaForm` / `Iso20022Form` gives every control the full width again. The plain skin uses the native `size` of a text box. `controlChars(type, optionLabels?)` is the rule, and `patternMaxLength(pattern)` (in the validate package) reads a text pattern's longest value.

The official documentation button: after every "i" (and the form title's) a small document-icon button opens ISO's repository page for the element's type (`https://www.iso20022.org/standardsrepository/type/<Type>`, for example `CashAccount24`) in a new window; hovering says "View ISO 20022 official documentation for <Type>". It is a real link (new tab, copy address, middle-click). `specLink` on `SchemaForm` / `Iso20022Form` controls it: leave it out for ISO's address, `specLink={false}` to show no such buttons, or give a function `(type) => url | undefined` for another registry (or to leave out some types). `isoTypeUrl(type)` is the default.

Adding your own control beside the "i": give `SchemaForm` (or `Iso20022Form`) a `fieldExtra(element)` function. It is called for every element that has an "i" with `{ type, kind, name, label, path }` and may return a button, an icon or a link, which is shown right after the "i". The library puts nothing there itself: what it is, what it says and what it does belong to your application. `useHoverTip`, `Popup` and `INFO_BUTTON_CLASS` are exported so that such a control can hover and look like the "i". The demos use it for their own zoom button (`apps/demo-shared/src/ZoomButton.tsx`), which shows a component type on its own.

Field mode: give `SchemaForm` (or `Iso20022Form`) a `fieldMode(element)` function that answers `'editable'` (the default), `'label'` or `'hidden'` for an element (it gets the same `{ type, kind, name, label, path }` as `fieldExtra`). A **label** shows the value as text and is not editable (lists have no add or remove buttons; an optional section left out is simply absent); **hidden** leaves the element out, and its value stays in the form, so a default set before hiding is still in the message. A section's mode applies to everything inside it, and the stronger mode wins (hidden over label over editable). `fieldModeView` is `'apply'` (the default: present them as they say, as an application would) or `'mark'` (keep everything editable and have the skin shade the others, so whoever designs the form can still reach them). Skins supply two small pieces: `Value` (a value as text) and `ModeMark` (the shading; the plain skin only adds a `data-field-mode` attribute). The demos' field-mode switch is the demo's own control for choosing (`apps/demo-shared/src/FieldModeSwitch.tsx`).
Everything the demo app adds around them (message picker, settings, XML pane, "Implement!") stays in `apps/demo-shared`.

## Bundle size

Passing a message module's `schemas` and `typeDescriptors` brings in that whole message (about 170 KB gzipped for
pain.001), not just the one type being edited. Trimming a module to one type is a possible follow-up.
