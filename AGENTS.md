<!-- agent-dev-bootstrap:agents:start -->
## Agent development

This repository is configured for repeatable agentic development.

### Repository context

- Read `CONTEXT.md` before making domain-level decisions.
- Record hard-to-reverse architectural decisions under `docs/adr/`.
- Put multi-session feature specifications under `docs/specs/`.
- Keep local planning artifacts and local issue files under `.scratch/`.

### Project type

Detected project type: `Generic`.

### Validation

Run the relevant commands before handing work back:

- Add the repository-specific validation commands before relying on this file.

### Working agreements

- Preserve unrelated user changes.
- Prefer small, independently verifiable changes.
- Add a regression test when fixing a reproducible bug.
- Keep generated dependencies, credentials, and local environment files out of Git.
- Start implementation tickets in fresh agent sessions; use a written handoff when context must cross sessions.
<!-- agent-dev-bootstrap:agents:end -->
