# A reviewer's guide

You are being asked to read code written by people who are not specialists in what you know. This page says where the code is, which parts deserve
your time, and what we are unsure about. You do not need to read it all, and you do not need to read ISO 20022.

Report what you find with the **Review or critique** form ([new issue](https://github.com/Beneficial-Strategies/Iso20022Headless/issues/new/choose)).
One point per issue. A comment on a pull request or a link to your own write-up is just as welcome.

## Who wrote it

Most of this code was written with an AI coding assistant, under the direction of an owner who is a payments and .NET engineer rather than a
React or TypeScript specialist. It has tests and runs in production at the [Message Explorer](https://iso20022-explorer.beneficialstrategies.com/),
but nobody who writes TypeScript libraries for a living has reviewed it yet. Please read it with that in mind: idioms we missed are exactly what we
hope you will find.

## What it is, in a paragraph

ISO 20022 messages (payments, statements, securities) are large nested structures with strict rules. Given a message identifier, the library gives
a Zod schema that validates a value, a descriptor that says what every field is (type, length, code list, repeating, required), the spec's
business rules evaluated against the value, and a React renderer that draws a form from the descriptors. The renderer is *headless*: it produces
no markup of its own except through a `Skin` the application supplies.

## Where the code is, and how much of it is generated

| Path | What | Lines (about) | Worth your time |
| --- | --- | --- | --- |
| `packages/validate/src/generated/` | One file per message: schemas and descriptors, plus the spec's definitions | 248,000 | **No.** Generated. Review the *generator* and a sample file instead. |
| `packages/types/src/generated/` | Interfaces per message | 37,000 | **No.** Generated. |
| `tools/codegen-ts/src/generate.ts` and `ir/` | The generator and its intermediate form | 800 | **Yes.** Everything generated hangs on it. |
| `packages/validate/src/` (not `generated/`) | `runtime.ts` (field model), `rules.ts` (business-rule evaluator), `paths.ts`, `messages.ts` (issue catalog), `patterns.ts`, `variants.ts`, `definitions.ts`, `withHeader.ts` | 1,500 | **Yes.** The engine. |
| `packages/react-ui/src/` | `Iso20022Form.tsx`, `SchemaForm.tsx`, `skin/` (the interface and two skins), `i18n/` | 1,700 | **Yes.** The part users touch. |
| `packages/serialize/src/` | XML and ISO JSON in and out | 700 | **Yes.** Reads untrusted input. |
| `packages/react/src/` | A hook over TanStack Form | 170 | Short. |
| `fixtures/` | Data captured from the ISO 20022 repository, one folder per message, with `PROVENANCE-*.md` saying how | data | Only if you doubt the data. |

So the hand-written code is about 4,600 lines in five packages, plus the generator. That is the review.

## Questions we would most like answered

1. **The `Skin` interface** (`packages/react-ui/src/skin/types.ts`, about 20 slots). Is this the right size and shape for a headless renderer? Would
   you split it, make it a render-prop or slot API, or lean on something like Radix or React Aria instead of owning it?
2. **Accessibility.** Labels, errors, required marks, the info bubbles and the choice boxes. We have not had an accessibility specialist look at them.
3. **Package layout.** `validate` has one export per message (`/pain001`, `/camt053`, and so on) so a bundle carries only what it uses, and a
   separate `definitions` entry for the prose. Is that the right way to ship a 250,000-line generated surface? In the repository the package
   `exports` point at `src/*.ts` and `publishConfig.exports` point at `dist/` when published; is that safe?
4. **Zod 4 and TanStack Form as the base.** Would you build on them, or keep the core free of both?
5. **Generated code.** Is checking generated files into git (so a diff shows what a spec change did) the right call here?
6. **The business-rule evaluator** (`packages/validate/src/rules.ts`). The spec ships rules as expressions; the evaluator interprets them. Any
   correctness, performance or readability concern.
7. **Languages.** The packages carry English only. Other languages are served by "text hosts" and passed in as `I18nOverrides`
   (see [docs/languages.md](docs/languages.md)). Is that an API you would want to use?
8. **Serialization safety.** The XML reader takes pasted input. Anything that worries you about how it is parsed.
9. **Tests.** What would you add before trusting this in an application?

## How to run it

```sh
pnpm install                     # Node 24
pnpm -r run typecheck && pnpm -r run test
pnpm --filter @beneficial-strategies/iso20022-demo-form run dev   # the form, locally
```

Or install the pre-release from npm and try it in your own project:

```sh
npm install @beneficial-strategies/iso20022-react-ui@alpha @beneficial-strategies/iso20022-validate@alpha zod react
```

The [quickstart apps](apps/quickstart-react) show the smallest working use. [docs/](docs/) has the rest.

## What you will not find

A review process, named owners, or release gating beyond what is in the repository. The README says so. If you have a view on what a
project this size should put in place first, that is a welcome review issue too.
