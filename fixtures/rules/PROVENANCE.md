# Business-rule fixtures (all pain messages)

`constraints-sweep.tsv` (prose) and `constraint-expressions-sweep.tsv` (machine-readable) hold the rules of every component,
choice and message reachable from any of the twelve pain messages that were **not already captured** in an earlier fixture
(78 rules, 37 with an expression). Scope is the type or message name, as in the generator's other constraint files.

## Method
- The snapshot has no rule data, so each of 182 scopes (125 components, 45 choices, 12 messages) was looked up with
  `universal_lookup`; constraint rows are listed under the scope, and each constraint was looked up for its prose and its
  `expression` property.
- Done in 6 chunks, each captured **twice by independent agents** (A and B), then compared:
  - 29 expressions in chunk 1, and every constraint, expression and scope list in chunks 2 to 6: identical.
  - Three rule texts in chunk 1 differ only in whitespace between paragraphs (one capture wrote one space, the other three);
    whitespace runs are collapsed to one space.
- The merged capture (117 rules, 69 expressions) was compared with the rules already committed for pain.001 and pain.002:
  **71 overlapping rows, 71 identical, 0 different**. Only the rows not already committed are in the sweep files.
- Source typos are kept as published (for example "AddititionalInformation", "Rejceted").
- The agents typed the text into scripts from the lookups (not machine-copied), which is why every chunk was captured twice.
