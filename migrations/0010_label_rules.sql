-- Per-label filter rules supporting AND / OR / NOT combinations
CREATE TABLE IF NOT EXISTS label_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label_id    INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  match_text  TEXT NOT NULL,
  match_field TEXT NOT NULL DEFAULT 'both' CHECK (match_field IN ('title', 'full_text', 'both')),
  rule_type   TEXT NOT NULL DEFAULT 'or'  CHECK (rule_type  IN ('and', 'or', 'not'))
);

-- Migrate existing single-rule labels into label_rules (as OR rules)
INSERT INTO label_rules (label_id, match_text, match_field, rule_type)
SELECT id, match_text, match_field, 'or' FROM labels WHERE match_text != '';

-- Auto-summarize flag per label
ALTER TABLE labels ADD COLUMN auto_summarize INTEGER NOT NULL DEFAULT 0;
