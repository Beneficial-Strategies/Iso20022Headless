# Security

These packages validate and render payment messages in the browser or in Node. They do not hold credentials or call a network on their own,
but a flaw in how a pasted or loaded message is parsed (the XML and JSON readers in `@beneficial-strategies/iso20022-serialize`, for example)
could still matter to an application that builds on it.

**Report a vulnerability privately**: use [GitHub's private report form](https://github.com/Beneficial-Strategies/Iso20022Headless/security/advisories/new),
or write to [support@beneficialstrategies.com](mailto:support@beneficialstrategies.com). Please do not open a public issue for it.

This is a small team and the packages are pre-release. We will acknowledge a report as soon as we can and credit you if you wish, but we make no
promise of a response time. Only the latest published version is maintained.
