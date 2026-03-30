-- Multi-user foundation:
-- - user metadata / roles / invitations
-- - instance_settings + user_settings split
-- - user_id scoping on private resources
-- - composite uniqueness for per-user feeds/articles

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN github_login TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN invited_at TEXT;

UPDATE users
SET role = 'owner', status = 'active'
WHERE id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'owner');

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_login_unique
  ON users(github_login) WHERE github_login IS NOT NULL;

CREATE TABLE IF NOT EXISTS instance_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS invitations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invitations_user_id ON invitations(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token_unused ON invitations(token) WHERE used_at IS NULL;

INSERT INTO instance_settings (key, value)
SELECT key, value
FROM settings
WHERE key LIKE 'auth.%'
   OR key LIKE 'system.%'
   OR key LIKE 'images.%'
ON CONFLICT(key) DO UPDATE SET value = excluded.value;

INSERT INTO user_settings (user_id, key, value)
SELECT owner.id, s.key, s.value
FROM settings s
JOIN (SELECT id FROM users ORDER BY id ASC LIMIT 1) owner
WHERE s.key NOT LIKE 'auth.%'
  AND s.key NOT LIKE 'system.%'
  AND s.key NOT LIKE 'images.%'
ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now');

ALTER TABLE categories ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE categories
SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_user_sort ON categories(user_id, sort_order, name);

ALTER TABLE credentials ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE credentials
SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);

ALTER TABLE api_keys ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
UPDATE api_keys
SET user_id = (SELECT id FROM users ORDER BY id ASC LIMIT 1)
WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_user_created_at ON api_keys(user_id, created_at DESC);

ALTER TABLE feeds ADD COLUMN icon_url TEXT;
ALTER TABLE articles ADD COLUMN article_kind TEXT;

DROP VIEW IF EXISTS active_articles;

ALTER TABLE chat_messages RENAME TO chat_messages_legacy;
ALTER TABLE conversations RENAME TO conversations_legacy;
ALTER TABLE article_similarities RENAME TO article_similarities_legacy;
ALTER TABLE articles RENAME TO articles_legacy;
ALTER TABLE feeds RENAME TO feeds_legacy;

CREATE TABLE feeds (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  url                   TEXT NOT NULL,
  icon_url              TEXT,
  rss_url               TEXT,
  rss_bridge_url        TEXT,
  type                  TEXT NOT NULL DEFAULT 'rss',
  category_id           INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  disabled              INTEGER NOT NULL DEFAULT 0,
  requires_js_challenge INTEGER NOT NULL DEFAULT 0,
  last_error            TEXT,
  error_count           INTEGER NOT NULL DEFAULT 0,
  etag                  TEXT,
  last_modified         TEXT,
  last_content_hash     TEXT,
  next_check_at         TEXT,
  check_interval        INTEGER,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, url)
);

INSERT INTO feeds (
  id, user_id, name, url, icon_url, rss_url, rss_bridge_url, type, category_id, disabled,
  requires_js_challenge, last_error, error_count, etag, last_modified,
  last_content_hash, next_check_at, check_interval, created_at
)
SELECT
  id,
  (SELECT id FROM users ORDER BY id ASC LIMIT 1),
  name, url, icon_url, rss_url, rss_bridge_url, type, category_id, disabled,
  requires_js_challenge, last_error, error_count, etag, last_modified,
  last_content_hash, next_check_at, check_interval, created_at
FROM feeds_legacy;

CREATE INDEX idx_feeds_user_category_id ON feeds(user_id, category_id);
CREATE INDEX idx_feeds_user_type ON feeds(user_id, type);
CREATE UNIQUE INDEX idx_feeds_clip_per_user ON feeds(user_id) WHERE type = 'clip';

CREATE TABLE articles (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER REFERENCES users(id) ON DELETE CASCADE,
  feed_id              INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  category_id          INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  url                  TEXT NOT NULL,
  article_kind         TEXT,
  lang                 TEXT,
  full_text            TEXT,
  full_text_translated TEXT,
  translated_lang      TEXT,
  summary              TEXT,
  excerpt              TEXT,
  og_image             TEXT,
  score                REAL NOT NULL DEFAULT 0,
  last_error           TEXT,
  seen_at              TEXT,
  read_at              TEXT,
  bookmarked_at        TEXT,
  liked_at             TEXT,
  images_archived_at   TEXT,
  published_at         TEXT,
  fetched_at           TEXT NOT NULL DEFAULT (datetime('now')),
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  retry_count          INTEGER NOT NULL DEFAULT 0,
  last_retry_at        TEXT,
  purged_at            TEXT,
  UNIQUE(user_id, url)
);

INSERT INTO articles (
  id, user_id, feed_id, category_id, title, url, article_kind, lang, full_text, full_text_translated,
  translated_lang, summary, excerpt, og_image, score, last_error, seen_at, read_at,
  bookmarked_at, liked_at, images_archived_at, published_at, fetched_at, created_at,
  retry_count, last_retry_at, purged_at
)
SELECT
  a.id,
  f.user_id,
  a.feed_id,
  a.category_id,
  a.title,
  a.url,
  a.article_kind,
  a.lang,
  a.full_text,
  a.full_text_translated,
  a.translated_lang,
  a.summary,
  a.excerpt,
  a.og_image,
  a.score,
  a.last_error,
  a.seen_at,
  a.read_at,
  a.bookmarked_at,
  a.liked_at,
  a.images_archived_at,
  a.published_at,
  a.fetched_at,
  a.created_at,
  a.retry_count,
  a.last_retry_at,
  a.purged_at
FROM articles_legacy a
LEFT JOIN feeds f ON f.id = a.feed_id;

CREATE INDEX idx_articles_user_feed_id ON articles(user_id, feed_id);
CREATE INDEX idx_articles_user_published_at ON articles(user_id, published_at DESC);
CREATE INDEX idx_articles_user_bookmarked_at ON articles(user_id, bookmarked_at);
CREATE INDEX idx_articles_user_feed_seen_at ON articles(user_id, feed_id, seen_at);
CREATE INDEX idx_articles_user_seen_at ON articles(user_id, seen_at);
CREATE INDEX idx_articles_user_read_at ON articles(user_id, read_at);
CREATE INDEX idx_articles_user_score ON articles(user_id, score DESC);
CREATE INDEX idx_articles_user_liked_at ON articles(user_id, liked_at);
CREATE INDEX idx_articles_user_category_published ON articles(user_id, category_id, published_at DESC);
CREATE INDEX idx_articles_user_feed_score ON articles(user_id, feed_id, score DESC);
CREATE INDEX idx_articles_user_category_score ON articles(user_id, category_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_articles_feed_article_kind_published
  ON articles(feed_id, article_kind, published_at DESC);
CREATE INDEX idx_articles_user_last_error ON articles(user_id, last_error) WHERE last_error IS NOT NULL;
CREATE INDEX idx_articles_user_purged_at ON articles(user_id, purged_at);

CREATE TABLE article_similarities (
  article_id    INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  similar_to_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  score         REAL NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (article_id, similar_to_id)
);

INSERT INTO article_similarities (article_id, similar_to_id, score, created_at)
SELECT article_id, similar_to_id, score, created_at
FROM article_similarities_legacy;

DROP INDEX IF EXISTS idx_similarities_similar_to;
CREATE INDEX idx_similarities_similar_to ON article_similarities(similar_to_id);

CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO conversations (id, user_id, title, article_id, created_at, updated_at)
SELECT
  c.id,
  COALESCE(a.user_id, (SELECT id FROM users ORDER BY id ASC LIMIT 1)),
  c.title,
  c.article_id,
  c.created_at,
  c.updated_at
FROM conversations_legacy c
LEFT JOIN articles a ON a.id = c.article_id;

CREATE INDEX idx_conversations_user_updated_at ON conversations(user_id, updated_at DESC);

CREATE TABLE chat_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO chat_messages (id, user_id, conversation_id, role, content, created_at)
SELECT
  m.id,
  c.user_id,
  m.conversation_id,
  m.role,
  m.content,
  m.created_at
FROM chat_messages_legacy m
JOIN conversations c ON c.id = m.conversation_id;

CREATE INDEX idx_chat_messages_user_conversation ON chat_messages(user_id, conversation_id, id);

DROP TABLE feeds_legacy;
DROP TABLE articles_legacy;
DROP TABLE article_similarities_legacy;
DROP TABLE conversations_legacy;
DROP TABLE chat_messages_legacy;

CREATE VIEW active_articles AS
SELECT * FROM articles WHERE purged_at IS NULL;
