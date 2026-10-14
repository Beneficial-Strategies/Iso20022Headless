# @beneficial-strategies/iso20022-validate

Zod schemas, field rules and English validation text for 363 ISO 20022 messages. Logic only: no UI, no translations (other languages come from the text hosts, see below).

```ts
import { schemas } from '@beneficial-strategies/iso20022-validate/pain001';
schemas.GroupHeader114.safeParse(value);
```

Part of the [ISO 20022 Headless](https://github.com/Beneficial-Strategies/Iso20022Headless) project: the Explorer, the demos and the documentation are there. MIT licensed.

Status: pre-release. Text in other languages is not in this package: a text host serves it (`iso-20022-text-<language>`), and the application passes it in through `I18nOverrides` (see `docs/languages.md` in the repository).
