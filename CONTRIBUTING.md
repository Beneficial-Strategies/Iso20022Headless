# Contributing

Thank you for looking. This library is free (MIT) and kept by a small team that is **not expert in every area it touches** (React and TypeScript
library design, accessibility, the payment domains). Help of any size is welcome, and outside review is what we want most: see [REVIEWING.md](REVIEWING.md).

## What kind of contribution

| You have | Do this |
| --- | --- |
| An opinion about the code, the API or the docs | Open the **Review or critique** form. No pull request needed. |
| A bug | Open the **Bug** form. A test that fails today is the best report. |
| A word that reads wrongly in a language | It is not here: use the form in the [language repository](https://github.com/Beneficial-Strategies/iso-20022-text#readme). |
| A small fix (a typo, a doc, a clear bug with a test) | Open a pull request. It needs an issue only if it is more than a typo. |
| A larger change (a new feature, a change to a public type, a refactor) | **Open an issue first** and wait for a reply, so no work is wasted. We are cautious about the public API while the packages are pre-release. |

## Pull requests

- Every pull request is linked to an issue: write `Closes #123` (or `Refs #123` for a tracking issue) in the description. A check enforces it;
  a typo or generated file can take the `no-issue` label from a maintainer.
- A bug fix includes a test that failed before the fix, named in the pull request.
- **Do not edit generated files.** Everything under `packages/*/src/generated/` and `tools/codegen-ts/ir/` is written by `pnpm codegen` from
  the data in `fixtures/` and the generator in `tools/codegen-ts`. To change one, change the fixture or the generator and regenerate.
  [REVIEWING.md](REVIEWING.md) explains the layout.
- Keep a pull request to one subject. Smaller is faster to review.
- Run `pnpm install`, then `pnpm -r run typecheck` and `pnpm -r run test` (Node 24). `pnpm visual` runs the browser checks; CI runs them too.
- The ISO 20022 text (names, definitions, code lists) belongs to ISO. Do not paste text from ISO documents that did not come through the
  repository data.

## Who decides

Maintainers merge. There is no formal review policy or ownership file yet; the README says so openly. When a pull request touches the public API,
a maintainer will ask for a second opinion, often from someone who answered a review issue. Being asked is not a commitment; saying "I cannot
review this" is a fine answer.

## Conduct

Be direct about the code and kind about the person. Critique of the design is the point of the review issues; it is never a reason to be rude.
