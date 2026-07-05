-- Partial indexes for active_articles view (WHERE purged_at IS NULL).
-- These are smaller than full-table indexes because they exclude purged rows,
-- and SQLite can use them directly for queries through the active_articles view.

-- Replaces idx_articles_published_at for the common unfiltered timeline query
CREATE INDEX IF NOT EXISTS idx_articles_active_published ON articles(published_at DESC) WHERE purged_at IS NULL;

-- Replaces idx_articles_feed_id + sort for per-feed timeline queries
CREATE INDEX IF NOT EXISTS idx_articles_active_feed_published ON articles(feed_id, published_at DESC) WHERE purged_at IS NULL;

-- Replaces idx_articles_category_published for per-category timeline queries
CREATE INDEX IF NOT EXISTS idx_articles_active_category_published ON articles(category_id, published_at DESC) WHERE purged_at IS NULL;

-- Replaces idx_articles_seen_at for unread filter queries
CREATE INDEX IF NOT EXISTS idx_articles_active_seen_at ON articles(seen_at) WHERE purged_at IS NULL;

-- Composite for unread-per-feed (used in smartFloor unread candidate query)
CREATE INDEX IF NOT EXISTS idx_articles_active_feed_seen ON articles(feed_id, seen_at) WHERE purged_at IS NULL;
