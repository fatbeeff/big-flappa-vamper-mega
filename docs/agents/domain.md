# Domain Docs

This is a single-context repository. Engineering skills should consume its domain documentation as follows.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant decisions under `docs/adr/`.

If either is absent, proceed silently. Domain documents are created lazily when terminology or decisions are resolved.

## Use the glossary's vocabulary

Use canonical terms from `CONTEXT.md` in issue titles, specifications, implementation plans, APIs, and tests. Avoid synonyms that the glossary explicitly rejects.

If a necessary concept is missing, reconsider whether it belongs to the domain or note the gap for domain modeling.

## Flag ADR conflicts

Surface any conflict with an existing ADR explicitly rather than silently overriding it.
