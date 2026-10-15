## What

<!-- What changed and why, in a few lines. -->

## Issue

<!-- Every pull request is linked to an issue. Write "Closes #123" (it closes the issue when this is merged).
     Use "Refs #123" for an issue this only advances, such as a tracking issue.
     A typo or a generated file needs no issue: ask a maintainer to add the `no-issue` label. -->

Closes #

## Tests

<!-- What was run and the result. -->

- [ ] `pnpm -r run typecheck` and `pnpm -r run test` pass
- [ ] This is a bug fix and I added a test that **failed before the fix**: `file > test name`
- [ ] Not a bug fix, or the existing tests already cover it

## Generated files

- [ ] I did not edit anything under `packages/*/src/generated/` or `tools/codegen-ts/ir/` by hand. If those changed, `pnpm codegen` produced them from `fixtures/` or from the generator.

## Public API

- [ ] This changes what a package exports, or the props of a component, or the `Skin` interface (say how in **What**)
