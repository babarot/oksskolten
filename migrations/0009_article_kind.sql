ALTER TABLE articles ADD COLUMN article_kind TEXT;

CREATE INDEX IF NOT EXISTS idx_articles_feed_article_kind_published
  ON articles(feed_id, article_kind, published_at DESC);
