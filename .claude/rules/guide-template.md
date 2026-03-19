---
paths:
  - "docs/guides/**"
---

# Guide Naming Rules

Guide filenames must be kebab-case and start with a gerund (verb ending in `-ing`):

```
docs/guides/creating-themes.md     ✓
docs/guides/deploying-to-fly-io.md ✓
docs/guides/setup-guide.md         ✗ (no gerund)
docs/guides/creating_themes.md     ✗ (snake_case)
```

- **Filename**: `{verbing}-{object}.md` (e.g., `creating-themes.md`)
- **H1 first word** must match the filename's first segment (e.g., `creating-themes.md` → `# Creating ...`)
- Validate with `make lint-docs`
