---
paths:
  - "docs/adr/**"
---

# ADR Structure

ADRs (Architecture Decision Records) follow this template:

```
# ADR-NNN: {Title}

## Status

Accepted | Deprecated | Superseded

## Context
## Decision
## Consequences
```

Rules:
- **Filename**: `{NNN}-{kebab-case}.md` (e.g., `001-settings-dual-storage.md`)
- **H1**: Must start with `ADR-NNN:` and the number must match the filename prefix
- **Required H2s**: Status, Context, Decision, Consequences
- **Status value**: Must be exactly `Accepted`, `Deprecated`, or `Superseded`
- Additional H2s (e.g., `## History`) are allowed
