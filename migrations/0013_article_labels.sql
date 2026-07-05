-- Materialized label membership.
--
-- Previously label filtering evaluated each label's rules (LIKE '%text%' over
-- title + full_text) on every request — an unindexable full-table scan run
-- per label for sidebar counts and per page for article lists. This table
-- stores the precomputed (article_id, label_id) membership so those queries
-- become a fast indexed JOIN. Membership is maintained incrementally on
-- article ingest/content-change and fully rebuilt on any label change.

CREATE TABLE IF NOT EXISTS article_labels (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  label_id   INTEGER NOT NULL REFERENCES labels(id)   ON DELETE CASCADE,
  PRIMARY KEY (article_id, label_id)
);

-- Reverse lookup: list/count articles for a given label.
CREATE INDEX IF NOT EXISTS idx_article_labels_label ON article_labels(label_id);
