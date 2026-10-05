# Implementation Plan — Headless ISO 20022 TypeScript Library + Demo App

Captured from planning discussion in `Iso20022MasterControl`, 2026-10-05. Follows on from
`headless-ui-framework.md` (2026-06-08), which scoped the overall direction but was never
started.

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

1. **Phase 0** — repo scaffold (this doc, package layout, CI skeleton without publish). Design
   the MCP bulk-export path. Pick **pain.001** as pilot (matches the original doc's own example
   and `Iso20022Library`'s existing Blazor demo). Hand-map a few types including one Choice to
   validate the discriminated-union approach before templating codegen output.
2. **Phase 1** — fully automated codegen for pain.001's dependency closure only. Publish
   `types` + `validate` as `0.1.0-alpha`. Exercise the full OIDC/provenance publish pipeline
   here, early, at small scope.
3. **Phase 2** — `serialize` + `react` for pain.001 + first working demo (single message type)
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
