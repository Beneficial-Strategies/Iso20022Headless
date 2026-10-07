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

Zoom: give `SchemaForm` (or `Iso20022Form`) an `onZoom(type)` callback and every element that is a component type gets a zoom button after its "i" (hover explains it); clicking calls `onZoom` with the type name. The demos use it to show that type on its own, the same as picking it in the type list. Without `onZoom` there are no zoom buttons.
Everything the demo app adds around them (message picker, settings, XML pane, "Implement!") stays in `apps/demo-shared`.

## Bundle size

Passing a message module's `schemas` and `typeDescriptors` brings in that whole message (about 170 KB gzipped for
pain.001), not just the one type being edited. Trimming a module to one type is a possible follow-up.
