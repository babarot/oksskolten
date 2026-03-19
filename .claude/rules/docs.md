---
paths:
  - "src/**"
  - "server/**"
  - "migrations/**"
---

# Documentation Update Rules

- When adding/changing features or modifying schemas, update `docs/spec/*.md` (English only)
- If the change affects user-facing features or setup, also update `README.md` (English, brief summary — detailed spec lives in `docs/spec/`)
- When making a significant architectural decision, record it as an ADR in `docs/adr/`
- Lint all docs with `make lint-docs` (runs conftest policies for spec, guides, and ADR)
