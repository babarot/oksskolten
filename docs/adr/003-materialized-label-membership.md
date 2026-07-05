# ADR-003: Materialized label membership

## Status

Accepted

## Context

Labels classify articles via rules that match text with `LIKE '%text%'` over an
article's `title` and `full_text`, combined with `and`/`or`/`not` logic and an
exclusive-label priority scheme (a higher-priority exclusive label "claims" an
article, excluding it from lower-priority labels).

Originally this matching was evaluated on every request:

- `getArticlesByLabel()` ran the rule clause (plus a `UNION` of exclusion
  subqueries) for each page of a label's article list.
- `getLabels()` ran a separate `COUNT(*)` with the full rule clause for **every**
  label on every `/api/labels` call (sidebar counts).

`LIKE '%text%'` cannot use an index and scans the large `full_text` column, so
these queries were full-table scans — one per label for counts, one per page for
lists. On a sizeable database this made the labels UI slow and contributed to the
general "loading is janky / articles don't load" experience.

Label membership is a **purely per-article property**: an article belongs to a
label iff it matches the label's rules and is not claimed by a higher-priority
exclusive label. Nothing about that decision depends on other articles, so it can
be precomputed and stored rather than recomputed on read.

## Decision

Membership is **materialized** into an `article_labels(article_id, label_id)`
join table (`migrations/0013_article_labels.sql`) and maintained instead of being
evaluated at read time.

### Maintenance

- **Per-article, incremental** — on article ingest (`insertArticle`) and whenever
  `full_text` changes (`updateArticleContent`), `updateArticleLabels(articleId)`
  recomputes that single article's memberships (rules + exclusion evaluated
  against just that row). This is a bounded single-row check, not a table scan.
- **Full rebuild on label change** — `createLabel` / `updateLabel` / `deleteLabel`
  call `rebuildAllLabelMemberships()`. A rule, `sort_order`, or `exclusive` change
  can affect many articles (and, via exclusion, other labels), so the whole table
  is recomputed. The expensive `LIKE` scan now runs once per label edit instead of
  on every page load.
- **Backfill** — on startup, a one-time `rebuildAllLabelMemberships()` runs guarded
  by the `article_labels.built` setting flag, so existing databases populate the
  table when migration 0013 is first applied.

### Read queries

- `getArticlesByLabel()` and `getLabels()` counts become indexed JOINs against
  `article_labels` (with `idx_article_labels_label` for reverse lookups). Sidebar
  counts are a single grouped query instead of N per-label scans.
- Reads still join `active_articles`, so soft-deleted (purged) articles are
  excluded even though their membership rows linger; hard deletes remove rows via
  `ON DELETE CASCADE`.

## Consequences

### Benefits

- Label article lists and sidebar counts are indexed lookups — no full-text scans
  on the read path.
- The `LIKE` cost is paid at write time (ingest / label edit), which is far less
  frequent than reads.
- Membership logic (including exclusion) stays in one place (`buildLabelMatchClause`),
  reused by both the incremental and full-rebuild paths.

### Drawbacks

- Write amplification on ingest: each new/updated article runs a per-label
  single-row match. Bounded by the number of labels, which is small.
- A label edit triggers a full rebuild (one `LIKE` scan per label). Acceptable
  because label edits are rare and user-initiated.
- Membership rows for purged articles remain until the article is hard-deleted;
  reads filter them out via `active_articles`, so this is invisible but leaves
  some dead rows until retention hard-deletes them.
- `getAutoSummarizeCandidates()` intentionally still evaluates rules directly (it
  runs once per new article and is independent of read-path performance).
