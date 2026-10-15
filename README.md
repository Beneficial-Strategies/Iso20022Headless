# Beneficial Strategies ISO 20022 Message Explorer

**Try it, free: https://iso20022-explorer.beneficialstrategies.com/**

A free, browser-based way to see what is really inside ISO 20022 payment messages, build your own, check them
against the official schema, and lift illustrations into your analysis documents. Under it is an open-source
TypeScript library that puts the same behavior into your own application.

> **Status: early pre-release.** The Message Explorer is live and free to use. The npm packages are published as
> **pre-releases** (`0.1.x-alpha`, dist-tag `alpha`): the API may still change. We are considering asking for voluntary
> funding to support the work, even though the source is public. If this is useful to you, tell us by opening a GitHub issue.

## The Message Explorer

Pick an area and a message and the form shows every element it can hold:

- **Explore.** Each element's official definition (hover the **i**), its allowed values and code lists, which
  elements are required or repeat, and the business rules that tie fields together. One click opens the
  official ISO 20022 page for a type.
- **Create.** Fill in the form to build a message. Your entries are checked as you type, and the finished
  message appears beside the form as ISO 20022 XML or the ISO 20022 JSON syntax.
- **Check against the schema.** *XSD Validate* checks the XML against the official XSD and lists each error by line.
- **Save, load and paste.** Save to a file, load it again, or paste a message you already have to see it laid
  out as a form. Everything stays in your browser.
- **Illustrate.** *Copy as* puts the screen on your clipboard as a Word-ready table, Markdown, an outline, a
  spreadsheet, JSON, HTML, or a Figma-ready wireframe, so analysts can lift a form into a requirements document.
  *Field mode* lets you mark which values are fixed, defaulted or left open, for design discussions.
- **Zoom** into any part of a message, such as a single Debtor Agent, and work on just that piece.

Currently covers **363 messages** across Payments Initiation (`pain`), Payments Clearing and Settlement (`pacs`),
ATM Management (`caam`), Cash Management (`camt`: account reports, statements and notifications, payment
cancellation requests and investigations, cash management and charges messages), Administration (`admi`), Payments
Remittance Advice (`remt`), Transaction Tracker (`trck`), Account Management (`acmt`), Securities Management (`semt`), Securities Events (`seev`), Securities Settlement (`sese`) and the Business Application Header (`head`, which is its own root: `<AppHdr>`, not `<Document>`). Spec data comes from the ISO 20022 repository.

## The library

The same engine is built to be embedded. It is **headless**, which matters if the term is new to you.

### Why headless

A headless UI library supplies the *behavior* (state, validation, which fields exist, what is required, what
the messages say) without dictating the *look*. Instead of a widget with its own styling that you fight to
match your design system, you get the logic and render it with your own components. You keep your styling,
accessibility conventions and framework; you do not inherit someone else's CSS; and the logic is the same
whichever skin sits on top. Here that means:

- **Your design, your stack.** Use the ready-made React renderer, switch its skin (Tailwind, or plain
  semantic HTML), or drive your own inputs from the core packages.
- **Small and swappable.** Validation and serialization carry no UI. Spec definitions are a separate entry
  point, so validation-only consumers do not bundle the prose.
- **Testable.** The rules run without a browser.

### What is burned in

You do not write the ISO 20022 rules; they ship with the library, generated from the spec:

- **Validation.** Types, lengths, patterns, code lists, required and repeating elements, choices, and the
  message's **business rules** are enforced as the user types. A bad IBAN, a missing mandatory field, or a
  violated rule is reported at the field with a clear message. This is the part that is expensive to get
  right by hand and easy to get subtly wrong.
- **Internationalization.** Language is built in, not bolted on. Interface text, validation messages,
  pattern hints and the spec text itself (element names, definitions, code names, rules) are
  all included. Shipped: **ISO English, American English, Spanish, French, German and Portuguese.** ISO's own
  wording is British-style English ("Organisation", "Cheque"); American English rewrites the spelling and a
  few terms at display time and never touches what is sent. See [docs/languages.md](docs/languages.md) for
  exactly what each language covers. Translations are machine-drafted and welcome corrections.
- **Serialization.** Round-trips ISO 20022 XML and the ISO JSON syntax, and reads a pasted message back into
  the form, reporting anything it could not place.

### Good for snippets, not only whole messages

Real applications rarely need an entire `pain.001`. They need to edit *one piece*: the Debtor Agent a user just
chose, a postal address, a remittance block. Every type in a message is available on its own, with its own
rules, so you can embed a small, correct editor for just that fragment and get back valid XML or JSON for it.

## Packages

| Package | Role |
| --- | --- |
| `@beneficial-strategies/iso20022-types` | TypeScript types for each message |
| `@beneficial-strategies/iso20022-validate` | Validation, business rules, messages, spec definitions, languages |
| `@beneficial-strategies/iso20022-serialize` | XML and ISO JSON in and out |
| `@beneficial-strategies/iso20022-react` | Form state hook (TanStack Form) |
| `@beneficial-strategies/iso20022-react-ui` | React renderer, skins, language support |

Published to npm as pre-releases: `npm install @beneficial-strategies/iso20022-react-ui@alpha` (see [docs/publishing.md](docs/publishing.md)).

## Demos for programmers

Two small apps show how the library is used. They are for reference, so you can read how little code the
integration takes:

- **With the form hook (TanStack Form):** https://beneficial-strategies.github.io/Iso20022Headless/form/
- **Zod only, no form library:** https://beneficial-strategies.github.io/Iso20022Headless/zod/

Both are hosted on GitHub Pages. If you want to *use* the tool rather than study the code, use the more
capable free version at **https://iso20022-explorer.beneficialstrategies.com/** (served from Cloudflare, with
the schema checker and the copy and export features).

## Working in this repository

```sh
pnpm install
pnpm -r run typecheck && pnpm -r run test
pnpm --filter @beneficial-strategies/iso20022-demo-form run dev   # the demo, locally
pnpm visual                                                         # browser layout and behavior checks
```

Requires Node 24. More detail in [docs/](docs/): [languages](docs/languages.md),
[XSD validation](docs/xsd-validation.md), [copy as](docs/copy-as.md), [field mode](docs/field-mode.md),
and the original [implementation plan](docs/implementation-plan.md).

## Help wanted, and reviews

We are not specialists in every part of this: React and TypeScript library design, accessibility, or the payment domains it covers. **We are
asking for outside review**, and welcome contributions of any size.

- **Read the code and tell us what is wrong with it.** [REVIEWING.md](REVIEWING.md) says where the hand-written code is (about 4,600 lines; the rest is
  generated), and lists the questions we most want answered. Use the **Review or critique** form: [new issue](https://github.com/Beneficial-Strategies/Iso20022Headless/issues/new/choose).
- **Report precisely.** A bug with a failing test is usually fixed fastest. See [CONTRIBUTING.md](CONTRIBUTING.md).
- **Pick up an issue.** [`help wanted`](https://github.com/Beneficial-Strategies/Iso20022Headless/labels/help%20wanted) and
  [`good first issue`](https://github.com/Beneficial-Strategies/Iso20022Headless/labels/good%20first%20issue).
- **Your language.** Wording lives in the [language repositories](https://github.com/Beneficial-Strategies/iso-20022-text#readme), one per language.
  A word that reads wrongly is a glossary form there, not an issue here.
- **Fund or co-maintain.** Write to [support@beneficialstrategies.com](mailto:support@beneficialstrategies.com).

Security problems go through [SECURITY.md](SECURITY.md), not a public issue.

## Feedback

This is a free tool. If a label reads wrongly in your language, a rule misfires, or you want something it does
not do, open a GitHub issue. The language menu has a *Report a wording problem* link that prefills one.

## Status, license and warranty

This library, the demos and the text they show are provided **free of charge and as is**, under the MIT license (see [LICENSE](LICENSE)),
without warranty of any kind. We make our best-faith effort toward faithful conformance with ISO 20022, and toward accurate translation, but
the checks are incomplete (some business rules exist only as prose, and the rules documentation says which), and the translations are machine
drafts until an entry is marked reviewed. **Do not rely on it for legal, financial or compliance decisions**: validate against ISO's own
schemas and your counterparty's rules.

**The controls here are lax at present**: there is no formal review process, release gating or ownership policy beyond what you can see in this
repository. We intend to improve them over time (named maintainers, required reviews, release checks) should the libraries gain adoption and
sponsorship. Taking over the care of a part of it, a language for example, is welcome.

ISO 20022 and its text and schemas belong to ISO, and ISO's own terms apply to them. The license above covers what is written in this
repository, not ISO's material. This is not legal advice.
