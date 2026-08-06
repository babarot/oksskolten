CREATE TABLE IF NOT EXISTS labels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  match_text  TEXT NOT NULL,
  match_field TEXT NOT NULL DEFAULT 'both' CHECK (match_field IN ('title', 'full_text', 'both')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
