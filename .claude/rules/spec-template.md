---
paths:
  - "docs/spec/*_feature_*.md"
  - "docs/spec/*_perf_*.md"
---

# Feature & Perf Spec H2 Structure

Feature specs (`8x_feature_*.md`) and perf specs (`9x_perf_*.md`) share the same H2 template:

```
# Oksskolten Spec — {Title}
> [Back to Overview](./01_overview.md)
## Overview          ← What (1-2 sentences)
## Motivation        ← Why (problem, context)
## Scope             ← Optional (between Motivation and Design)
## Design            ← How (free-form H3/H4 subsections)
```

Rules:
- **Required H2s**: Overview, Motivation, Design — in that order
- **Optional H2**: Scope — must appear between Motivation and Design
- **No other H2s are allowed**. Use H3 under Design for subsections (API, Frontend, DB Schema, etc.)
- **No redundant feature-name H2** (e.g., `## Clip` is wrong — the H1 already contains the name)
- **Max heading depth**: H4
- When creating a new spec, also add it to the index in `docs/spec/01_overview.md`
- Validate with `make lint-docs`
