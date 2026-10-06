# Implementation Plan — Headless ISO 20022 TypeScript Library + Demo App

Captured from planning discussion in `Iso20022MasterControl`, 2026-10-05. Follows on from
`headless-ui-framework.md` (2026-06-08), which scoped the overall direction but was never
started.

---

## Status — revised 2026-10-05 (after the minimal pain.001 slice)

A minimal slice is built and committed on `feat/minimal-pain001-headless`: spec data captured from the
MCP server, a generator, the `validate` / `serialize` / `react` / `types` packages, and two demos. Not
published; nothing here has been run through CI. Decisions and changes versus the plan below:

- **Message and version:** target the latest message version (pain.001.001.13). **Registration status
  is ignored:** it is recorded per node only as metadata, because Provisionally Registered is pervasive
  at element level, even in old versions. Filtering to "Registered" would drop required fields.
- **MCP is the source, but the generator reads committed fixtures.** `fixtures/pain001-v13/` holds the
  captured spec data with provenance (`PROVENANCE.md`). Regenerating TypeScript needs no MCP access; only
  refreshing the fixtures does. The MCP server's source stays in its own repository and is not copied here.
- **Capture today is manual (~300 tool calls), not a bulk export.** No single tool returns a closure.
  Findings and a proposed `export_message_closure` tool are in `mcp-bulk-export-spec.md`. Useful existing
  tools: `get_data_type_members_snapshot(names)` (members, occurs, tags, full definitions),
  `get_code_set_details` (wire values), `universal_lookup(..., forceVerbose=true)` (full definitions).
- **Value model:** every leaf is its wire string; components are objects keyed by ISO element name;
  repeatable elements are arrays; a Choice is an object with exactly one variant key; an Amount is
  `{ Ccy, Value }`. Choices are `z.union` of strict single-key objects (not a tagged discriminant).
- **No recursion in pain.001:** the closure has no cycles, so no `z.lazy` was needed (re-check per message).
- **Descriptors are a graph, not a tree:** `typeDescriptors` keyed by type name; fields reference types by
  name. Avoids duplicating widely reused types.
- **Spec definitions are a separate entry point** (`.../validate/definitions`, about 52 KB for pain.001)
  so validation-only consumers don't pay for prose. Used by the demo's accessible "i" popovers.
- **React hook:** built on TanStack Form for values/touched state; validation is the generated Zod
  schema via `formatIssues` (plain-language messages). Path syntax is TanStack's `A.B[0].C` everywhere.
- **Demos:** two, sharing one schema-driven UI (`apps/demo-shared`): `demo-form` (our hook) and `demo-zod`
  (hand-rolled state, no form library). The XML pane is always live with a valid/draft badge, rather than
  appearing only once valid. A "Now" button appears beside blank date-time fields.

### Localization (decided and built 2026-10-06)
- **The library reports codes, never prose.** `collectIssues` returns `{ code, params }` per field path
  (and rule diagnostics use the same codes). `formatIssues(error, messages)` turns them into text. The
  library ships English and Spanish catalogs (`validate/src/messages.ts`); consumers override any key
  (`createMessages('es', { required: 'Campo obligatorio' })`) or add a language by passing a partial catalog.
  English wording is unchanged from before (a test pins it).
- **ISO ids on every descriptor** (types, elements, code options), and spec definitions are keyed by id
  rather than by version-specific names. `createDefinitions(locale, overrides)` layers: consumer overrides,
  the exact locale, its language, then English, and reports which language each text is actually in, so a UI
  can mark untranslated text. Translated element names use the same catalogs (`labels`, by id).
- **Demo interface text** has English and Spanish catalogs with the same override mechanism
  (`createI18n`, `DemoApp`'s `i18n` prop). A Language group in the Display panel (Automatic / English /
  Español, plus any locale the consumer adds) is kept in the URL and sets `<html lang>`.
- **Spec text is English only.** The ISO repository has no translations. Spanish *interface* text and
  validation messages are shipped; Spanish element names, definitions, code names and rule text are not.
  English fallbacks are labelled in the UI. Translating them is a separate, reviewable piece of work
  (about 460 definitions plus ~230 element names); check licensing of ISO text before shipping translations.
- **Translation workflow (built 2026-10-06).** Spec text is translated through catalogs in
  `packages/validate/src/locales/<lang>.catalog.json` (entry = text + status `machine`/`reviewed` + hash of the
  English). `tools/i18n` extracts units, lints and merges machine drafts (never overwriting reviewed entries),
  exports/imports **XLIFF 2.0** for a human reviewer or a translation platform, and flags stale entries
  (`pnpm i18n check es`, for CI). Spanish was machine-drafted in full (1035 units) with a glossary; it loads lazily
  (about 38 KB gzipped) and the UI marks it "machine translated, not yet reviewed" until reviewed. See
  `i18n/README.md` for the hand-off process.
- **Ids are per message version.** Catalogs keyed by element id do not carry over to the next version of a
  message. The stable business-layer link (`businessElementTrace` / `trace` in the MCP) is not captured yet;
  capturing it would let a translation be written once per business element.
- Fixed along the way: a pristine form validated to a single root-level "Required" instead of per-field
  errors, so tabbing out of an empty required field showed nothing.

### Visual and layout checks (built 2026-10-06)
`tools/visual` drives both demos in a locally installed Chrome (`pnpm visual shots | check | selftest`; see its
README). `check` measures layout problems that have shipped before (popups clipped by the scroll panel, invisible
controls, wrapping header buttons, overflow, console/HTML errors) across 19 states (themes, sizes, languages, skins,
narrow and short windows, each popup open). A self-test injects known defects to prove the checks fire. Not wired into
CI and does no image comparison (renders differ across machines). First run found a real bug that the jsdom tests
missed: a required field inside a fully-empty group reported "Required" on the group, not on the field. Fixed with
`pruneForValidation` (required components stay in place when validating; included optional ones stay; absent ones
stay absent).

### Known gaps in the slice
- Business rules: only `PaymentInstruction51`'s 17 constraints are captured. 11 are enforced by a small
  evaluator (`validate/src/rules.ts`, Presence/Absence/EqualToValue/DifferentFromValue/WithInList/NotWithInList,
  `[*]` ranges, code NAME to wire value mapping); 1 is reported unsupported (pseudo-literal comparison);
  5 are prose-only guidelines. Other types' constraints are not captured yet. The server's 200-character
  truncation of property values was fixed on staging 2026-10-06.
- 21 external code sets (purpose, clearing system, local instrument, ...) are plain strings, not enumerated.
- Code values carry no definitions in the UI yet.
- Free-tier layout and escaped-pipe handling of the server fix are untested; `simulate_tier` and
  `get_simple_type_details` error on staging.
- The React UI has no automated tests (schema, serializer and helpers do, 10 tests); the demos were
  built but not viewed through browser automation.

### Packaging decision (replaces "single set of packages" for generated content)
Measured for pain.001.001.13: generated validate+descriptors 122 KB source / 15 KB gzip, types 17 KB / 3.5 KB.
Extrapolating naively to 1000+ messages is unreliable (components are shared). Plan: one repo; **core
packages published once** (`validate` runtime, `serialize`, `react`); **generated content in per-business-area
packages** (`pain`, `pacs`, `camt`, ...) with **per-message subpath exports** and `sideEffects: false`;
browser lazy-loads a message via dynamic `import()`. First generator change before scaling: **emit shared
types once across messages**. Generate 2-3 more messages (pain.002 plus a pacs/camt one) to measure real
sharing before locking this in. Verify npm's current package size limits before publishing.

---

## Context

The C# ISO 20022 library (`Iso20022Library`) is mature, published to NuGet, and in active use.
This repo resumes the companion browser-side effort scoped in `headless-ui-framework.md`: a
pure-TypeScript, **headless** (no markup/CSS) validation/serialization layer built on Zod,
meant to let any consumer — a bank's own design system, a fintech startup, this repo's own demo
app — build ISO 20022 data-entry UI without re-deriving field constraints, choice handling, or
XML serialization themselves.

Confirmed directly against npm's search API before starting: no existing open-source
"ISO 20022 + Zod" library is worth adopting instead. This is new-build, not integration.

## Repo & packaging

Single **pnpm workspace + Turborepo** monorepo — not separate repos per package — since all
packages are tightly interdependent and release together, mirroring how `Iso20022Library`
keeps `Common`/`FluentValidation`/`MassTransit.Sagas` in one repo with one lockstep version
(`Directory.Build.props`). **Changesets in "linked" mode** is the npm-ecosystem equivalent of
that single-version file.

**npm scope: `@beneficial-strategies/iso20022-*`** (e.g. `@beneficial-strategies/iso20022-validate`),
not bare `@iso20022/*` — matches the existing `BeneficialStrategies.Iso20022.*` NuGet naming
precedent and avoids implying official ISO 20022 standards-body endorsement.

```
Iso20022Headless/
  packages/
    types/      @beneficial-strategies/iso20022-types      (generated TS interfaces, no logic)
    validate/   @beneficial-strategies/iso20022-validate   (generated Zod schemas + field-descriptor IR + IBAN/BIC)
    serialize/  @beneficial-strategies/iso20022-serialize  (XML/JSON, hand-written)
    react/      @beneficial-strategies/iso20022-react      (TanStack Form hooks, hand-written)
    vue/        @beneficial-strategies/iso20022-vue        (phase 4)
    elements/   @beneficial-strategies/iso20022-elements   (phase 4, Lit)
  apps/
    demo/       private, not published — Vite + React + Tailwind + shadcn/ui + CodeMirror
  tools/
    codegen-ts/ MCP export -> JSON IR -> .ts interfaces + Zod schema emitter
  .changeset/
  .github/workflows/ci.yml, publish.yml
  pnpm-workspace.yaml, turbo.json
```

## Codegen architecture: first-class, direct from the ISO 20022 spec via the MCP server

This sticks with the original doc's design intent — generate `@beneficial-strategies/iso20022-types`
and `@beneficial-strategies/iso20022-validate` directly from ISO 20022 spec metadata via the MCP
server. (An earlier draft of this plan proposed instead reflecting over the compiled
`BeneficialStrategies.Iso20022.Common` NuGet package as a workaround for an MCP access
limitation in that planning session — correctly rejected: that was a fixable gap in our own
server, not a reason to abandon the MCP-first design.)

As of this repo's creation, the two currently-active MCP tools (`UniversalLookup`,
`GetSpecSnapshot`) aren't well-suited to bulk structured export as-is — `UniversalLookup` is a
cursor-based drill-down navigator, not a bulk feed, and `GetSpecSnapshot`'s TSV has no
pattern/maxLength columns. A third tool (`VerboseGenerationTool`, which backed the now-removed
`ShowItemDetails`) is currently disabled in the MCP server but had a richer shape.

**First concrete task, now that this session has first-class MCP access:** design whichever is
the better fit — reviving/adapting `VerboseGenerationTool`'s shape, or building a new tool
purpose-built for bulk codegen export (a mode returning a complete, structured per-type
payload: fields, XML tags, min/maxOccurs, pattern/length constraints, choice variants) — and
confirm it directly against real server data before locking in the generator's input format.

Once that export path exists, the generator follows a two-stage shape: MCP export → JSON
intermediate representation (IR) → a pure-TS emitter producing `.ts` interfaces and Zod schema
modules, one per ISO type. For modeling Choice types as Zod discriminated unions, the C#
library's resolved shape remains a useful **cross-check reference** (not the generation
source) — `Iso20022Library/src/BeneficialStrategies.Iso20022.Common/Choices/RateType67Choice_.cs`
shows the concrete-alternative-per-type pattern, each with its own `IsoXmlTag`, which is the
natural discriminant — worth prototyping against 2-3 real Choice types once real spec data is
flowing through the new export path.

Generated `.ts`/Zod output is **committed to the repo**, regenerated only when the pinned spec
snapshot changes (a new `sync-ts-from-spec` skill, mirroring `Iso20022MasterControl`'s
`upgrade-iso-repo` shape — calling the MCP server rather than a local file, since this repo
won't carry its own copy of the eRepository data). CI's job on ordinary PRs is a **freshness
check**: rerun the generator against the pinned snapshot and fail if committed output differs —
the TS analogue of the zero-warnings gate used elsewhere in this project.

## Demo UI: Tailwind + shadcn/ui (Radix) + cmdk + CodeMirror 6

**Tailwind CSS v4 + shadcn/ui** (copy-in Radix primitives, never a runtime dependency of the
published packages) for the demo's interactive chrome — this makes the demo a live example of
the library's own headless thesis: Radix/shadcn supplies generic UI headlessness, this library
supplies ISO 20022-specific headlessness on top. **cmdk** (shadcn's "Command" component) for
the fuzzy-searchable component-name lookup. **CodeMirror 6** (not Monaco — lighter, mature XML
mode) for the read-only, syntax-highlighted XML output pane.

Flow:
1. **Lookup** (cmdk combobox) → selects a generated schema module.
2. **`@beneficial-strategies/iso20022-validate` exports a field-descriptor tree alongside each
   Zod schema** (a Zod schema alone can't drive form rendering — it validates but doesn't
   expose ordered, labeled field metadata). Shape: `{ name, xmlTag, displayName, kind,
   required, maxLength, pattern, choiceOptions? }`.
3. **`@beneficial-strategies/iso20022-react`** exposes `useIso20022Form(schemaName)` returning
   `fields`, `getFieldProps(name)` (value/onChange/onBlur/aria-invalid/aria-describedby/
   aria-required — per the original doc's API sketch), `values`, `errors`, `isValid`,
   `addListItem`/`removeListItem` (repeatable fields), `selectChoice(name, concreteType)`.
4. **Demo-app-only** (not published, keeps the library itself rendering-opinion-free) generic
   recursive `SchemaForm` walks `fields`: plain inputs for scalars, recursion for nested
   components, add/remove controls for lists, and for `choice` fields — nothing rendered until
   a `<Select>` of `choiceOptions` is picked, then recurses into that alternative's own fields.
5. **Required-field marking**: visible `*` plus non-color-dependent "(required)" text, driven
   directly by `aria-required` from `getFieldProps`.
6. **XML pane is a continuous live preview** — re-serializes via `serializeToXml(values)` on
   every change once the schema validates. Submit is a decorative "done editing" affirmation,
   not a technical gate. **Copy XML** (`navigator.clipboard.writeText`) works any time the pane
   has content.

## CI/CD

- **`ci.yml`**: `pnpm install --frozen-lockfile`, `turbo run lint typecheck test build`
  (ESLint `--max-warnings=0`, the TS analogue of `TreatWarningsAsErrors`), plus a separate
  codegen-freshness job.
- **`publish.yml`**: triggers only on `push: tags: ['v*']` — mirrors `Iso20022Library` exactly,
  not Changesets' idiomatic bot-PR flow (a deliberate choice, for consistency with every other
  release process across this project). A new `bump-and-release-ts` skill: `changeset version`,
  update docs, commit, tag, push tag to trigger publish. Use npm's GitHub-OIDC Trusted
  Publishing (`permissions: id-token: write`, no stored `NPM_TOKEN`) the same way
  `NuGet/login@v1` is used in `Iso20022Library/.github/workflows/publish.yml` — verify exact
  current npm CLI/registration requirements when this workflow is actually written, since this
  npm feature is still fairly new. Enable `--provenance` regardless.
- **Demo app stays local-only for now** (`pnpm dev`) — no deploy step yet.

## Phasing

1. **Phase 0** — *(done in minimal form, see Status)* repo scaffold (this doc, package layout, CI skeleton without publish). Design
   the MCP bulk-export path. Pick **pain.001** as pilot (matches the original doc's own example
   and `Iso20022Library`'s existing Blazor demo). Hand-map a few types including one Choice to
   validate the discriminated-union approach before templating codegen output.
2. **Phase 1** — *(partly done: generator exists but reads manually captured fixtures)* fully automated codegen for pain.001's dependency closure only. Publish
   `types` + `validate` as `0.1.0-alpha`. Exercise the full OIDC/provenance publish pipeline
   here, early, at small scope.
3. **Phase 2** — *(done for pain.001: `serialize`, `react`, two demos)* `serialize` + `react` for pain.001 + first working demo (single message type)
   proving the full interaction loop before generalizing.
4. **Phase 3** — expand codegen to the full spec; address bundle size via per-business-area
   subpath exports (e.g. `@beneficial-strategies/iso20022-types/pain`) given the scale mirrors
   Common's ~24K generated files; demo's lookup becomes real fuzzy search, likely lazy-chunked.
5. **Phase 4** — `vue` and `elements` (Lit) packages, deliberately last.
6. **Phase 5** — accessibility audit of the demo, docs site, README parity with sibling repo.

## Verification

- **Phase 0/1**: run the codegen tool against real MCP data, diff output against hand-mapped
  reference types for a component and a Choice; `pnpm turbo run test build` green; publish
  `0.1.0-alpha` to npm and `npm install` it in a scratch project to confirm it resolves and
  type-checks.
- **Contract parity**: a small test suite parses fixture XML with both the C# library and this
  TS library and asserts field-level values/validation results agree, keyed by the shared
  `IsoId` (stable across both, unlike names).
- **Phase 2 demo**: `pnpm dev`, manually drive pain.001 end-to-end — lookup, fill required
  fields, watch Submit/validity state, confirm live XML pane updates, confirm Copy XML places
  valid XML on the clipboard, confirm a Choice field renders its dropdown then the correct
  sub-fields once picked.
- **CI freshness gate**: deliberately hand-edit a generated file in a branch and confirm CI
  fails the freshness check, then revert and confirm it passes.

## Still Open (prototype before locking in)

- **Bulk export tool:** now has a concrete spec (`mcp-bulk-export-spec.md`) and a first customer (constraints
  as parsed fields). Decide: new server tool vs. keep manual capture. Server-side fixes pending: untruncated
  property values in `universal_lookup`, `get_simple_type_details` errors, `simulate_tier` errors.
- **Constraint enforcement:** machine-readable expressions (needs the truncation fix) vs hand-written rules.
  Cross-component rules need the whole message tree, not one type's schema.
- **Code definitions in the UI** and enumerating external code sets (needs the escaping fix verified at scale).
- **Shared-type emission and per-area package layout:** decide after generating more messages.

- Whether to revive `VerboseGenerationTool` or build a new MCP tool for bulk codegen export —
  decide against real server access, not secondhand.
- Exact Zod discriminated-union shape for Choice types — needs 2-3 real examples prototyped.
- Exact current npm OIDC Trusted Publishing mechanics — verify against npm's docs when
  `publish.yml` is actually written.

## Reference files in sibling repos

- `../Iso20022Library/docs/headless-ui-framework.md` (moved here as `headless-ui-framework.md`
  alongside this doc) — original scoping doc, 2026-06-08
- `../Iso20022Library/src/BeneficialStrategies.Iso20022.Common/Components/GroupHeader1.cs` —
  verified reference shape for required/optional + length-constraint reflection
- `../Iso20022Library/src/BeneficialStrategies.Iso20022.Common/Choices/RateType67Choice_.cs` —
  Choice shape reference
- `../Iso20022Library/src/Directory.Build.props` — lockstep versioning precedent
- `../Iso20022Library/.github/workflows/publish.yml` — OIDC trusted-publish precedent to mirror
- `../Iso20022Library/.claude/skills/bump-and-release/SKILL.md` — release-skill precedent to
  adapt as `bump-and-release-ts`
