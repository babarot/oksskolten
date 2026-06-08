-- Track when we last attempted to refresh a stale (garbage-extracted) article
-- from its RSS excerpt. Without this, articles that can never be repaired
-- (no RSS description, legitimately short blog posts, etc.) would force
-- the RSS HTTP cache to be bypassed on every fetch tick forever, since the
-- "stale article exists for this feed" condition would never clear.
--
-- The fetcher only re-runs the refresh path for articles where this column
-- is NULL or older than one day, so unfixable articles back off naturally.
ALTER TABLE articles ADD COLUMN last_refresh_attempt_at TEXT DEFAULT NULL;
