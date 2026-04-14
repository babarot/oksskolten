# Oksskolten Spec — API

> [Back to Overview](./01_overview.md)

## API Specification

Domain: Exposed via Cloudflare Tunnel (any domain can be configured)

### Common Error Response

All error responses follow this format:

```json
{ "error": "Error message" }
```

| Status | Meaning |
|---|---|
| 400 | Bad request (validation error) |
| 401 | Unauthorized (login required) |
| 403 | Forbidden (e.g., login attempt when password auth is disabled) |
| 404 | Resource not found |
| 409 | Conflict (duplicate URL) |
| 415 | Invalid Content-Type (not application/json) |
| 429 | Rate limit exceeded |
| 500 | Server error |

### Endpoints

#### Health Check (Public)

**GET /api/health** — Server status check

```json
// Response: 200
{
  "ok": true,
  "searchReady": true,
  "gitCommit": "abc1234",
  "gitTag": "v1.0.0",
  "buildDate": "2026-03-10T00:00:00Z"
}
```

Includes `Cache-Control: no-store` header. `searchReady` indicates whether the Meilisearch index build is complete.

#### Auth Endpoints (Public)

**POST /api/login** — Password login

Rate limit: 5 requests/minute

```json
// Request
{ "email": "user@example.com", "password": "plain-password" }

// Response: 200
{ "ok": true, "token": "eyJhbGciOiJIUzI1NiIs..." }
```

On successful authentication, the response body contains a JWT token. The frontend stores it in `localStorage` and sends it as the `Authorization: Bearer <token>` header on subsequent requests. Returns `403` if the `auth_password_enabled` setting is `'0'`. On failure, returns `401 { "error": "Invalid credentials" }`.

**POST /api/logout** — Logout

The frontend removes the token from `localStorage`. The server returns `{ "ok": true }`.

**GET /api/me** — Check login status

```json
// Logged in → 200
{ "email": "user@example.com" }
// Not logged in → 401
{ "error": "Unauthorized" }
```

Compares the JWT's `token_version` against the DB value; returns `401` on mismatch (automatic logout after password change).

#### Passkey/WebAuthn Endpoints

**GET /api/auth/methods** — Available auth methods (public)

```json
// Response: 200
{
  "password": { "enabled": true },
  "passkey": { "enabled": true, "count": 2 },
  "github": { "enabled": true }
}
```

Includes `Cache-Control: no-store` header.

**GET /api/auth/login/options** — Get Passkey login challenge (public)

Returns WebAuthn authentication options. The challenge is stored in memory (TTL 60 seconds). `rpID` is dynamically derived from the `Origin` / `Referer` headers (Vite proxy compatible).

**POST /api/auth/login/verify** — Verify Passkey login (public, rate limit: 5 requests/minute)

```json
// Response: 200
{ "ok": true, "token": "eyJhbGciOiJIUzI1NiIs..." }
```

On successful verification, updates the credential counter and issues a JWT token.

**GET /api/auth/register/options** — Get Passkey registration challenge (auth required)

Existing credentials are included in the exclude list. `residentKey: 'preferred'`, `userVerification: 'preferred'`.

**POST /api/auth/register/verify** — Verify Passkey registration (auth required)

On successful verification, saves the public key, counter, and device info to the `credentials` table.

**GET /api/auth/passkeys** — List registered Passkeys (auth required)

```json
// Response: 200
[
  {
    "id": 1,
    "credential_id": "abc...",
    "device_type": "multiDevice",
    "backed_up": 1,
    "created_at": "2026-02-28T10:00:00Z"
  }
]
```

**DELETE /api/auth/passkeys/:id** — Delete Passkey (auth required)

Lockout prevention: returns `400` if password auth is disabled, GitHub OAuth is also disabled, and this is the last Passkey.

**POST /api/auth/password/toggle** — Toggle password auth on/off (auth required)

```json
// Request
{ "enabled": false }

// Response: 200
{ "ok": true, "enabled": false }
```

Returns `400` if attempting to disable password auth when no Passkeys are registered and GitHub OAuth is also disabled.

**POST /api/auth/password/change** — Change password (auth required, rate limit: 5 requests/minute)

```json
// Request
{ "currentPassword": "old-password", "newPassword": "new-password" }
```

`newPassword` must be at least 8 characters. If a Passkey or GitHub OAuth is configured, `currentPassword` can be omitted (functions as a password reset). On success, increments `token_version` and returns a new JWT.

```json
// Response: 200
{ "ok": true, "token": "eyJhbGciOiJIUzI1NiIs..." }
```


**POST /api/auth/email/change** — Change email address (auth required, rate limit: 5 requests/minute)

```json
// Request
{ "newEmail": "new@example.com", "currentPassword": "password" }
```

Returns `409` if the email is already in use. Returns `401` on password mismatch.

```json
// Response: 200
{ "ok": true, "token": "eyJhbGciOiJIUzI1NiIs..." }
```

#### GitHub OAuth Endpoints

**POST /api/oauth/github/authorize** — Get GitHub authorization URL (public)

```json
// Request
{ "origin": "http://localhost:5174" }

// Response: 200
{ "url": "https://github.com/login/oauth/authorize?client_id=...&state=...&redirect_uri=..." }
```

The frontend sends `window.location.origin`, and the server uses it to construct the callback URL (prevents mismatch in Vite proxy environments). State is stored in memory (TTL 5 minutes).

**GET /api/oauth/github/callback** — GitHub callback (public, rate limit: 10 requests/minute)

Redirect target from GitHub. State verification → exchange code for access_token → fetch user info via GitHub API → match against allowed users → issue JWT → generate one-time exchange code (60-second TTL) → redirect to `/?oauth_code=<code>`. The JWT is not placed in the URL.

If no allowed users are configured, fetches the OAuth App owner via `GET /applications/{client_id}` (Basic auth) and permits only the owner.

**POST /api/oauth/github/token** — Exchange code for JWT (public, rate limit: 5 requests/minute)

```json
// Request
{ "code": "exchange-code-uuid" }

// Response: 200
{ "ok": true, "token": "eyJhbGciOiJIUzI1NiIs..." }
```

Consumes the one-time exchange code and returns the associated JWT. The code can only be used once (no replay).

**GET /api/oauth/github/config** — Get GitHub OAuth config (auth required)

```json
// Response: 200
{ "enabled": true, "configured": true, "clientId": "Iv1.xxx", "allowedUsers": "your-github-username" }
```

`clientSecret` is never returned.

**POST /api/oauth/github/config** — Update GitHub OAuth config (auth required)

```json
// Request
{ "clientId": "Iv1.xxx", "clientSecret": "xxx", "allowedUsers": "your-github-username" }
```

If `clientSecret` is an empty string, the existing value is preserved (can be omitted). If GitHub OAuth is the only auth method, updates that clear `clientId` or `clientSecret` are blocked.

**POST /api/oauth/github/toggle** — Toggle GitHub OAuth on/off (auth required)

```json
// Request
{ "enabled": true }

// Response: 200
{ "ok": true, "enabled": true }
```

Enabling checks if configured. Disabling checks for lockout prevention (Password or Passkey must be enabled).

GitHub OAuth settings are stored in the `settings` table (zero additional env vars):

| key | Example value |
|---|---|
| `oauth_github_enabled` | `1` / `0` |
| `oauth_github_client_id` | `Iv1.xxxxxxxxxxxx` |
| `oauth_github_client_secret` | `xxxxxxxxxxxxxxxx` |
| `oauth_github_allowed_users` | Comma-separated GitHub usernames (empty means App owner only) |

#### Auth Required (JWT or API Key)

All API endpoints except auth endpoints and public Passkey endpoints require authentication via one of:

1. **JWT**: `Authorization: Bearer <jwt-token>` — full access (used by the web UI)
2. **API Key**: `Authorization: Bearer ok_<hex>` — scoped access (for external scripts/tools)

API keys are identified by the `ok_` prefix. When an API key is used, the server validates the SHA-256 hash against the `api_keys` table and checks scope permissions:
- **`read` scope**: allows `GET` requests only
- **`read,write` scope**: allows all HTTP methods

Non-GET requests with a read-only API key return `403 { "error": "API key does not have write scope" }`. Returns `401 { "error": "Invalid API key" }` for unrecognized keys. Returns `401 { "error": "Unauthorized" }` if not authenticated.


**GET /api/feeds** — List feeds

```json
// Response: 200
{
  "feeds": [
    {
      "id": 1,
      "name": "Cloudflare Blog",
      "url": "https://blog.cloudflare.com",
      "rss_url": "https://blog.cloudflare.com/rss/",
      "rss_bridge_url": null,
      "type": "rss",
      "category_id": 1,
      "category_name": "Tech",
      "article_count": 12,
      "unread_count": 3,
      "articles_per_week": 2.5,
      "latest_published_at": "2026-03-01T12:00:00Z",
      "disabled": 0,
      "last_error": null
    }
  ],
  "clip_feed_id": 42
}
```

`article_count` and `unread_count` are computed via `COUNT` subqueries. `articles_per_week` is the number of articles in the last 28 days / 4.0. `latest_published_at` is `MAX(published_at)`. Feeds with `disabled = 1` are also returned (for displaying warnings in the UI). `category_name` is fetched via a LEFT JOIN with the `categories` table. `clip_feed_id` is the clip feed's ID (`null` if not yet created). The clip feed itself is also included in the `feeds` array (the frontend separates it based on `type`).

**GET /api/opml** — OPML export

Returns the feed list in OPML 2.0 format. Content-Type is `application/xml`. Includes a `Content-Disposition: attachment; filename="oksskolten.opml"` header for file download. Categories are represented as nested `<outline>` elements. Feeds with `type = 'clip'` are excluded.

**POST /api/opml/preview** — OPML import preview

Accepts a file via `multipart/form-data`, parses it, and returns the feed list with duplicate detection. Does not write to the database.

```json
// Response: 200
{
  "feeds": [
    { "name": "Hacker News", "url": "https://news.ycombinator.com", "rssUrl": "https://news.ycombinator.com/rss", "categoryName": "Tech", "isDuplicate": false }
  ],
  "totalCount": 15,
  "duplicateCount": 3
}
```

**POST /api/opml** — OPML import

Accepts a file via `multipart/form-data` and bulk-registers feeds. An optional `selectedUrls` field (JSON string array) can be included to import only specific feeds; if omitted, all feeds are imported.

```json
// Response: 200
{ "imported": 12, "skipped": 3, "errors": [] }
```

- Only `<outline>` elements with `xmlUrl` are treated as feeds
- Existing feeds (duplicate URLs) are skipped
- Parent `<outline>` elements are treated as categories; created if they don't exist

**GET /api/feeds/:id/metrics** — Feed detail metrics

```json
// Response: 200
{ "avg_content_length": 3245.5 }
```

Heavy aggregation fetched on demand for the individual feed view. `avg_content_length` is `AVG(LENGTH(full_text))` (articles with `full_text` = null are excluded). Returns `404` if the feed does not exist.

**GET /api/articles** — List articles (sorted by `published_at IS NULL, published_at DESC`, NULLs last)

Query parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `feed_id` | number | — | Filter by feed ID |
| `category_id` | number | — | Filter by category ID (returns articles from feeds in the category) |
| `unread` | `"1"` | — | When specified, returns only unread articles (`seen_at IS NULL`). Omitted or other values return all |
| `bookmarked` | `"1"` | — | When specified, returns only bookmarked articles |
| `liked` | `"1"` | — | When specified, returns only liked articles |
| `read` | `"1"` | — | When specified, returns only read articles (`read_at IS NOT NULL`). For the `/history` route |
| `sort` | `"score"` | — | When specified, sorts by score descending. When omitted, uses existing logic (liked→`liked_at DESC`, read→`read_at DESC`, otherwise→`published_at DESC`) |
| `limit` | number | 20 | Number of items to fetch (max 100) |
| `offset` | number | 0 | Offset |

```json
// Response: 200
{
  "articles": [
    {
      "id": 1,
      "feed_id": 1,
      "feed_name": "Cloudflare Blog",
      "title": "Markdown for Agents",
      "url": "https://blog.cloudflare.com/new-features-2025",
      "published_at": "2025-02-26T00:00:00Z",
      "lang": "en",
      "summary": "Markdown features designed for AI agents...",
      "excerpt": "This article explains...",
      "og_image": "https://blog.cloudflare.com/content/images/...",
      "seen_at": null,
      "read_at": null,
      "bookmarked_at": null,
      "liked_at": null
    }
  ],
  "total": 42,
  "has_more": true
}
```

`feed_name` is fetched via a JOIN with the `feeds` table. `has_more` is `true` when `offset + articles.length < total`. The frontend stops infinite scrolling when `has_more === false`.

**Smart Floor (Automatic Display Range Limiting)**

When none of the special filters (`unread`, `bookmarked`, `liked`, `read`) are specified, the display range is automatically limited (Smart Floor). This ensures that even when thousands of articles accumulate in feed/category views, only a practical range is returned.

Floor determination logic:

The **oldest date** among three candidates is chosen as the floor, maximizing the number of displayed items.

1. **Last 7 days**: `now - 7 days`
2. **Latest 20 items**: The `published_at` of the 20th newest article
3. **Oldest unread article**: If there are unread articles, their `MIN(published_at)`

If fewer than 20 articles exist for the given scope, the floor is skipped entirely and all articles are returned.

In other words, `max(7 days worth, 20 items)` is the base, and if unread articles go further back, the range extends to cover them. Conversely, if the unread range is narrower than 7 days or 20 items, the base takes precedence.

`total` and `has_more` are based on the post-floor count. When the floor hides articles, the response includes `total_without_floor` (the unfiltered total count) so the frontend can offer a "show older articles" action. Articles with `published_at IS NULL` are always included regardless of the floor.

The floor is **not applied** in:
- Inbox (`unread=1`), Bookmarks, Likes, History views
- Clip feed views (saved articles should always be visible)
- When `no_floor=1` query parameter is specified (used by the "show older articles" button)


**GET /api/articles/search** — Article search (Meilisearch full-text search)

- `q`: Required. Full-text search via Meilisearch (with typo tolerance and relevance ranking). Search targets are `title`, `full_text`, `full_text_ja`
- `feed_id`: Optional. Filter by feed ID (Meilisearch filter)
- `category_id`: Optional. Filter by category ID (Meilisearch filter)
- `since`: Optional. Start datetime ISO 8601 (Meilisearch filter)
- `until`: Optional. End datetime ISO 8601 (Meilisearch filter)
- `unread`: Optional. `1` for unread only, `0` for read only (SQLite post-filter)
- `liked`: Optional. `1` for liked only (SQLite post-filter)
- `bookmarked`: Optional. `1` for bookmarked only (SQLite post-filter)
- `limit`: Optional (default 20, max 50)
- Returns `503` when the search index is not yet built

```json
// Response: 200
{ "articles": [{ "id": 1, "title": "...", "url": "...", "feed_name": "...", "published_at": "..." }, ...] }
```


**GET /api/articles/by-url?url=...** — Article detail (fetch by URL)

```json
// Response: 200
{
  "id": 1,
  "feed_id": 1,
  "feed_name": "Cloudflare Blog",
  "title": "Markdown for Agents",
  "url": "https://blog.cloudflare.com/new-features-2025",
  "published_at": "2025-02-26T00:00:00Z",
  "lang": "en",
  "summary": "Markdown features designed for AI agents...",
  "og_image": "https://blog.cloudflare.com/content/images/...",
  "full_text": "# Markdown for Agents\n\n...",
  "full_text_ja": "# Markdown for Agents (translated)\n\n...",
  "seen_at": null,
  "read_at": null,
  "bookmarked_at": null,
  "liked_at": null
}
```

Returns `404 { "error": "Article not found" }` if the article does not exist.


**POST /api/articles/check-urls** — Bulk URL existence check

```json
// Request
{ "urls": ["https://example.com/1", "https://example.com/2"] }

// Response: 200
{ "existing": ["https://example.com/1"] }
```

Maximum 200 URLs. Returns a list of URLs that already exist in the DB.


**PATCH /api/articles/:id/seen** — Change awareness state

```json
// Request
{ "seen": true }
```

`seen` is `true` (mark as seen) or `false` (revert to unseen). When `false`, both `seen_at` and `read_at` are set to `NULL`.

```json
// Response: 200
{ "seen_at": "2025-06-01T12:00:00", "read_at": null }
```

Returns `404` if the article does not exist.


**POST /api/articles/:id/read** — Record that an article has been read

No request body. Overwrites `read_at` with the current datetime, and simultaneously sets `seen_at` if it was not already set (`COALESCE`). Called each time an article is opened.

```json
// Response: 200
{ "seen_at": "2025-06-01T12:00:00", "read_at": "2025-06-01T14:30:00" }
```

Returns `404` if the article does not exist.


**PATCH /api/articles/:id/bookmark** — Toggle bookmark

```json
// Request
{ "bookmarked": true }
```

`bookmarked` is `true` (bookmark) or `false` (remove bookmark).

```json
// Response: 200
{ "bookmarked_at": "2025-06-01T12:00:00" }
```

Returns `404` if the article does not exist.


**PATCH /api/articles/:id/like** — Toggle like

```json
// Request
{ "liked": true }
```

`liked` is `true` (like) or `false` (unlike).

```json
// Response: 200
{ "liked_at": "2025-06-01T12:00:00" }
```

When `liked` is `false`, returns `{ "liked_at": null }`. Returns `404` if the article does not exist.


**POST /api/articles/batch-seen** — Batch mark as seen

```json
// Request
{ "ids": [1, 2, 3] }

// Response: 200
{ "updated": 3 }
```

Maximum 100 items. Only updates articles where `seen_at IS NULL`.


**POST /api/articles/:id/summarize** — Article summary (on-demand)

Returns the cached summary if one already exists. Returns `400` if `full_text` is NULL.

Query parameter `stream=1` for SSE streaming response:

```
data: {"type":"delta","text":"Markdown features"}
data: {"type":"delta","text":" designed for AI agents..."}
data: {"type":"done","summary":"...", "usage":{"input_tokens":1234,"output_tokens":456}}
```

Batch response (without `stream` parameter):

```json
// Response: 200
{ "text": "Markdown features designed for AI agents...", "usage": { "input_tokens": 1234, "output_tokens": 456 } }
```


**POST /api/articles/:id/translate** — Article translation (on-demand)

Translates the article into the user's configured language (`general.language` setting). Returns the cached translation if `full_text_translated` exists and `translated_lang` matches the current language. If the language setting changes, stale translations are treated as absent and re-translated on next request.

Returns `400` if `full_text` is NULL. Returns `400` if the article is already in the user's language.

Query parameter `stream=1` for SSE streaming response (same format as summarize).


**POST /api/articles/from-url** — Clip and save an article from URL

```json
// Request
{ "url": "https://example.com/article", "title": "Optional title", "force": true }

// Response: 201
{ "article": { ... }, "created": true }
```

`force` is optional. Specify `true` when moving an existing RSS article to clips.

| Status | Condition |
|---|---|
| 201 | Article created successfully |
| 200 | Existing RSS article moved to clips with `force=true` (`{ "article": {...}, "moved": true }`) |
| 400 | `url` not provided |
| 409 | Article with the same URL already exists (for clip articles). For RSS feed articles, includes `can_force: true` |
| 500 | Clip feed not created (should not normally occur) |

Processing flow:
1. Get the clip feed via `getClipFeed()`
2. Check for existing article: `409` if already in clips, move or `409` (`can_force: true`) if in an RSS feed depending on `force`
3. Fetch content via `fetchFullText(url)` (on failure, record in `last_error` and create the article with `full_text = NULL`)
4. Detect language via `detectLanguage()`
5. Title priority: request `title` > page `og:title` > URL hostname
6. Add the article to the clip feed via `insertArticle()`


**DELETE /api/articles/:id** — Delete a clip article

```json
// Response: 204 (No Content)
```

| Status | Condition |
|---|---|
| 204 | Deleted successfully |
| 403 | Deleting RSS feed articles is forbidden (`feed_type !== 'clip'`) |
| 404 | Article not found |

If `images_archived_at` is set, locally archived image files are also deleted.


**POST /api/articles/:id/archive-images** — Archive images in an article

```json
// Response: 202
{ "status": "accepted" }
```

| Status | Condition |
|---|---|
| 202 | Background processing started |
| 400 | No `full_text`, or image archiving is disabled |
| 404 | Article not found |
| 409 | Already archived |

After returning 202, images are downloaded in the background and Markdown image URLs are rewritten to local/remote URLs. See [81_feature_images.md](./81_feature_images.md) for details.


**GET /api/articles/images/:filename** — Serve archived images

Serves locally stored images. Performs path traversal checks on the filename (`path.basename` + `..` detection).

Response headers:
- `Content-Type`: MIME type based on extension (`.jpg`, `.png`, `.gif`, `.webp`, `.svg`, `.avif`)
- `Cache-Control: public, max-age=31536000, immutable`


**POST /api/feeds** — Add feed

```json
// Request
{
  "name": "Cloudflare Blog",
  "url": "https://blog.cloudflare.com",
  "rss_bridge_url": null,
  "category_id": 1
}
```

| Field | Required | Description |
|---|---|---|
| `url` | Yes | Blog top URL |
| `name` | No | Display name (auto-uses RSS feed title or hostname if omitted) |
| `rss_bridge_url` | No | URL when using RSSBridge |
| `category_id` | No | Category ID |
| `discovered_rss_url` | No | HTTPS URL of a previously discovered RSS feed. When set, skip discovery and use this URL directly (Phase 2: user chose "whole site"). |
| `discovered_rss_title` | No | Title of the discovered RSS feed. Used for auto-naming when `name` is omitted. |
| `force_page_selector` | No | If `true`, skip Steps 1–2 and go straight to LLM CSS selector inference (Phase 2: user chose "this page only"). Mutually exclusive with `discovered_rss_url`. |

Processing flow:
1. Check `url` for duplicates → `409 { "error": "Feed URL already exists" }` on duplicate
2. If `rss_bridge_url` is specified, use it as-is
3. If not specified, resolve the RSS URL through a 3-step fallback chain:
   - **Step 1: RSS auto-discovery** — Fetch the URL; if Content-Type is `xml`/`atom`/`rss`, adopt it directly as a feed. Otherwise, parse as HTML and look for `<link rel="alternate">` → try candidate paths (`/feed`, `/feed.xml`, `/rss`, `/rss.xml`, `/atom.xml`, `/index.xml`) → save to `rss_url` if found
     - **Bot auth fallback**: If the normal fetch returns 403, retry via FlareSolverr. When FlareSolverr is used, automatically set `requires_js_challenge = 1`, and all subsequent RSS fetching and article full-text fetching also go through FlareSolverr
   - **Step 2: RSS Bridge findfeed** — If `RSS_BRIDGE_URL` is set, query with `?action=findfeed` → save to `rss_bridge_url` if found
   - **Step 3: CssSelectorBridge auto-estimation** — Use an LLM to analyze the page HTML and estimate the article list CSS selector → generate and validate a CssSelectorBridge URL → save to `rss_bridge_url` (see the "CssSelectorBridge Auto-Estimation" section for details)
   - All failed → return `201` with `rss_url = null`, `rss_bridge_url = null`. The frontend prompts the user to enter `rss_bridge_url`
4. Once the RSS URL is determined, execute `fetchSingleFeed` in the background (fire-and-forget)

The response is `text/event-stream` (SSE), notifying progress for each step in real time:

```
data: {"type":"step","step":"rss-discovery","status":"running"}
data: {"type":"step","step":"flaresolverr","status":"running"}       // Only appears when bot auth is needed
data: {"type":"step","step":"flaresolverr","status":"done","found":true}
data: {"type":"step","step":"rss-discovery","status":"done","found":true}
data: {"type":"step","step":"rss-bridge","status":"skipped"}
data: {"type":"step","step":"css-selector","status":"skipped"}
data: {"type":"done","feed":{"id":1,"name":"...","rss_url":"...","rss_bridge_url":null}}
```

Step names: `rss-discovery`, `flaresolverr` (conditional), `rss-bridge`, `css-selector`
Statuses: `pending`, `running`, `done`, `skipped`
The `flaresolverr` step is a child step of RSS discovery and is displayed hierarchically in the UI. It does not appear under normal conditions (when bot auth is not needed).

**Two-phase choice flow**: When Step 1 finds an RSS feed, the server sends a `choice_needed` event and ends the SSE stream without creating a feed:
```
data: {"type":"choice_needed","rss_url":"https://example.com/rss","rss_title":"Example Feed"}
```
The frontend then presents the user with a choice: "Subscribe to the whole site" or "Subscribe to this page only". The user's choice triggers a second `POST /api/feeds` with either `discovered_rss_url`/`discovered_rss_title` or `force_page_selector: true`.

```json
// Response (feed object from the final event):
{
  "id": 1,
  "name": "Cloudflare Blog",
  "url": "https://blog.cloudflare.com",
  "rss_url": "https://blog.cloudflare.com/rss/",
  "rss_bridge_url": null,
  "category_id": 1,
  "requires_js_challenge": 0
}
```


**PATCH /api/feeds/:id** — Update feed

```json
// Request (all optional, only specified fields are updated)
{
  "name": "New Name",
  "rss_bridge_url": "http://rss-bridge/?...",
  "disabled": 0,
  "category_id": 2
}
```

Updatable fields: `name`, `rss_bridge_url`, `disabled` (`0` or `1`), `category_id`. `url` and `rss_url` cannot be changed (ignored even if included in the request). Setting `disabled: 0` also resets `error_count` to `0` and `last_error` to `NULL`.

```json
// Response: 200 (returns all feed fields)
{
  "id": 1,
  "name": "New Name",
  "url": "https://blog.cloudflare.com",
  "rss_url": "https://blog.cloudflare.com/rss/",
  "rss_bridge_url": null,
  "category_id": 2,
  "category_name": "Tech",
  "disabled": 0,
  "last_error": null,
  "article_count": 12,
  "unread_count": 3
}
```

Returns `404` if the feed does not exist.


**DELETE /api/feeds/:id** — Delete feed

Associated articles are automatically deleted via `ON DELETE CASCADE`. Deleting a clip feed (`type = 'clip'`) is rejected with `403`.

```json
// Response: 204 (No Content)
```

Returns `404` if the feed does not exist.


**POST /api/feeds/:id/mark-all-seen** — Mark all articles in a feed as seen

```json
// Response: 200
{ "updated": 5 }
```


**GET /api/feeds/:id/fetch-progress** — Feed fetch progress (SSE)

Returns article fetch progress as an SSE stream after feed addition. Supports late connections (replays current state).

```
data: {"type":"feed-articles-found","feed_id":1,"total":10}
data: {"type":"article-done","feed_id":1,"fetched":1,"total":10}
data: {"type":"article-done","feed_id":1,"fetched":2,"total":10}
...
data: {"type":"feed-complete","feed_id":1}
```


**GET /api/discover-title?url=...** — Auto-fetch blog title

```json
// Response: 200
{ "title": "Cloudflare Blog" }
```

Runs RSS auto-discovery and returns the feed title or page title. Returns `{ "title": null }` if not found.


#### Category Endpoints

**GET /api/categories** — List categories

```json
// Response: 200
{
  "categories": [
    { "id": 1, "name": "Tech", "sort_order": 0, "collapsed": 0, "created_at": "..." }
  ]
}
```

Sorted by `sort_order ASC, name COLLATE NOCASE ASC`.

**POST /api/categories** — Create category

```json
// Request
{ "name": "Tech" }

// Response: 201
{ "id": 1, "name": "Tech", "sort_order": 0, "collapsed": 0, "created_at": "..." }
```

`sort_order` is automatically set to the current maximum + 1.

**PATCH /api/categories/:id** — Update category

```json
// Request (all optional)
{ "name": "Technology", "sort_order": 1, "collapsed": 0 }
```

Returns `404` if the category does not exist.

**DELETE /api/categories/:id** — Delete category

The `category_id` of associated feeds is set to `NULL` (feeds themselves are not deleted).

```json
// Response: 204 (No Content)
```

**POST /api/categories/:id/mark-all-seen** — Mark all articles in a category as seen

```json
// Response: 200
{ "updated": 15 }
```


#### Settings Endpoints

**GET /api/settings/profile** — Get profile

```json
// Response: 200
{
  "account_name": "user@example.com",
  "avatar_seed": "abc123",
  "language": "ja",
  "email": "user@example.com"
}
```

If `account_name` is not set, the auth email address is saved as the initial value.

**PATCH /api/settings/profile** — Update profile

```json
// Request (all optional)
{ "account_name": "My Name", "avatar_seed": "xyz", "language": "ja" }
```

`language` must be `"ja"` or `"en"`.

**GET /api/settings/preferences** — Get display preferences

```json
// Response: 200
{
  "appearance.color_theme": "nord",
  "reading.date_mode": "relative",
  "reading.auto_mark_read": "on",
  "reading.unread_indicator": "on",
  "reading.internal_links": "off",
  "reading.show_thumbnails": "on",
  "reading.show_feed_activity": "on",
  "reading.chat_position": "fab",
  "reading.article_open_mode": "page",
  "appearance.highlight_theme": "github-dark",
  "appearance.font_family": null,
  "appearance.list_layout": "list",
  "appearance.mascot": "off"
}
```

Unset items are `null`.

**PATCH / POST /api/settings/preferences** — Update display preferences

```json
// Request (all optional)
{ "appearance.color_theme": "nord", "reading.date_mode": "absolute" }
```

| Key | Allowed values |
|---|---|
| `appearance.color_theme` | Any string (theme name) |
| `reading.date_mode` | `"relative"` / `"absolute"` |
| `reading.auto_mark_read` | `"on"` / `"off"` |
| `reading.unread_indicator` | `"on"` / `"off"` |
| `reading.internal_links` | `"on"` / `"off"` |
| `reading.show_thumbnails` | `"on"` / `"off"` |
| `reading.show_feed_activity` | `"on"` / `"off"` |
| `reading.chat_position` | `"fab"` / `"inline"` |
| `reading.article_open_mode` | `"page"` / `"overlay"` |
| `appearance.highlight_theme` | Any string (theme name). Empty string to delete |
| `appearance.font_family` | Any string (font name). Empty string to delete |
| `appearance.list_layout` | `"list"` / `"card"` / `"magazine"` / `"compact"` |
| `appearance.mascot` | `"off"` / `"dream-puff"` / `"sleepy-giant"` |
| `chat.provider` | `"anthropic"` / `"gemini"` / `"openai"` / `"claude-code"` |
| `chat.model` | Model ID depending on the provider |
| `summary.provider` | `"anthropic"` / `"gemini"` / `"openai"` / `"claude-code"` |
| `summary.model` | Model ID depending on the provider |
| `translate.provider` | `"anthropic"` / `"gemini"` / `"openai"` / `"claude-code"` / `"google-translate"` / `"deepl"` |
| `translate.model` | Model ID depending on the provider (not needed for google-translate / deepl) |


**GET /api/settings/api-keys/:provider** — Check API key configuration status (auth required)

`provider` must be one of `anthropic`, `gemini`, `openai`, `google-translate`, `deepl`.

```json
// Response: 200
{ "configured": true }
```

Returns `400` for unknown providers.

**POST /api/settings/api-keys/:provider** — Save/delete API key (auth required)

```json
// Request
{ "apiKey": "sk-..." }
```

If `apiKey` is an empty string or omitted, the key is deleted.

```json
// Response: 200
{ "ok": true, "configured": true }
```


**GET /api/settings/google-translate/usage** — Google Translate monthly usage (auth required)

```json
// Response: 200
{ "monthlyChars": 12345, "freeTierRemaining": 487655 }
```

**GET /api/settings/deepl/usage** — DeepL monthly usage (auth required)

```json
// Response: 200
{ "monthlyChars": 12345, "freeTierRemaining": 487655 }
```


#### Image Storage Settings Endpoints

**GET /api/settings/image-storage** — Get image storage settings

```json
// Response: 200
{
  "images.enabled": "1",
  "mode": "local",
  "url": "",
  "headersConfigured": false,
  "fieldName": "image",
  "respPath": "",
  "images.storage_path": null,
  "images.max_size_mb": null
}
```

**PATCH /api/settings/image-storage** — Update image storage settings

```json
// Request (all optional)
{
  "images.enabled": "1",
  "images.storage_path": "/custom/path",
  "images.max_size_mb": "20",
  "mode": "local",
  "url": "https://upload.example.com/api",
  "headers": "{\"Authorization\":\"Bearer token\"}",
  "fieldName": "file",
  "respPath": "data.url"
}
```

| Field | Validation |
|---|---|
| `images.max_size_mb` | Number between 1 and 100. Empty string to delete |
| `mode` | `"local"` / `"remote"` |
| `url` | SSRF check (`assertSafeUrl`). Empty string to delete |
| `headers` | Valid JSON object (arrays and non-JSON are rejected). Empty string to delete |

Settings table keys:

| key | Description |
|---|---|
| `images.enabled` | `'1'` / `'true'` to enable |
| `images.storage` | `'local'` / `'remote'` |
| `images.storage_path` | Local storage path (default: `data/articles/images`) |
| `images.max_size_mb` | Max file size in MB (default: 10) |
| `images.upload_url` | Remote upload destination URL |
| `images.upload_headers` | HTTP headers for remote upload (JSON string) |
| `images.upload_field` | Form field name (default: `'image'`) |
| `images.upload_resp_path` | Dot path to extract URL from response (e.g., `'data.url'`) |


**POST /api/settings/image-storage/test** — Test remote upload

Uploads a 1x1 transparent PNG to the remote server and verifies that a URL can be extracted from the response.

```json
// Response: 200
{ "success": true, "url": "https://cdn.example.com/test.png" }
```

| Status | Condition |
|---|---|
| 200 | Test succeeded |
| 400 | `mode` is not `remote` / incomplete settings / upload failed / URL extraction failed |


**POST /api/settings/image-storage/healthcheck** — Remote storage connectivity check

Sends a GET request to the URL configured in `images.healthcheck_url` to verify connectivity. Timeout: 10 seconds.

```json
// Response: 200
{ "ok": true, "status": 200 }
```

| Status | Condition |
|---|---|
| 200 | Connectivity check succeeded |
| 400 | `images.healthcheck_url` not set / SSRF blocked / connectivity failure |


#### Similar Articles Endpoint

**GET /api/articles/:id/similar** — Get similar articles from other sources (auth required)

```json
// Response: 200
{
  "similar": [
    {
      "id": 123,
      "feed_name": "TechCrunch",
      "title": "Apple announces iPhone 17",
      "url": "https://techcrunch.com/...",
      "published_at": "2026-03-18T10:00:00Z",
      "read_at": "2026-03-18T11:05:00Z",
      "score": 0.82
    }
  ]
}
```

Returns similar articles detected via title similarity (bigram Dice coefficient >= 0.4) from different feeds. Sorted by similarity score descending. See [83_feature_similarity.md](./83_feature_similarity.md) for detection algorithm details.

Article list and detail responses include `similar_count` (integer) — the number of similar articles from other sources.


#### API Token Endpoints

**GET /api/settings/tokens** — List API tokens (auth required)

```json
// Response: 200
[
  {
    "id": 1,
    "name": "Monitoring script",
    "key_prefix": "ok_a1b2c3d4",
    "scopes": "read",
    "last_used_at": "2026-03-17 12:00:00",
    "created_at": "2026-03-15 10:00:00"
  }
]
```

Never returns the full key or key hash.

**POST /api/settings/tokens** — Create API token (auth required)

```json
// Request
{ "name": "Monitoring script", "scopes": "read" }

// Response: 201
{
  "id": 1,
  "name": "Monitoring script",
  "key": "ok_6ed6d44c17a82e3af429d384ef7baa04d6268917",
  "key_prefix": "ok_6ed6d44c",
  "scopes": "read",
  "last_used_at": null,
  "created_at": "2026-03-15T10:00:00Z"
}
```

The full `key` is returned **only once** at creation time. The key has a `ok_` prefix followed by 40 hex characters. Only the SHA-256 hash is stored in the database.

| Field | Required | Validation |
|---|---|---|
| `name` | Yes | 1–100 characters |
| `scopes` | No | `"read"` (default) or `"read,write"` |

**DELETE /api/settings/tokens/:id** — Delete API token (auth required)

```json
// Response: 200
{ "ok": true }
```

Returns `404` if the token does not exist.


#### Stats Endpoint

**GET /api/stats** — Aggregate statistics (auth required)

```json
// Response: 200
{
  "total_articles": 6184,
  "unread_articles": 1105,
  "read_articles": 5079,
  "bookmarked_articles": 46,
  "liked_articles": 4,
  "total_feeds": 77,
  "total_categories": 7,
  "by_feed": [
    { "feed_id": 1, "feed_name": "Example Blog", "total": 100, "read": 80, "unread": 20 }
  ]
}
```

Optional query parameters:
- `since`: Start datetime ISO 8601 (filter articles by `published_at`)
- `until`: End datetime ISO 8601 (filter articles by `published_at`)


#### Admin Endpoints

**POST /api/admin/fetch-all** — Immediately fetch all feeds (SSE)

Fetches articles from all feeds and returns progress as an SSE stream.

```
data: {"type":"feed-articles-found","feed_id":1,"total":5}
data: {"type":"article-done","feed_id":1,"fetched":1,"total":5}
...
data: {"type":"feed-complete","feed_id":1}
data: {"type":"feed-articles-found","feed_id":2,"total":3}
...
data: {"type":"feed-complete","feed_id":2}
```
