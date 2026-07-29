# Oksskolten Spec — Frontend

> [Back to Overview](./01_overview.md)

## Frontend

### Route Definitions

```
/                              → Redirect to /inbox
/inbox                         → Unread articles list
/bookmarks                     → Bookmarked articles list
/likes                         → Liked articles list
/history                       → Read articles list (read_at IS NOT NULL)
/clips                         → Clipped articles list
/feeds/:feedId                 → Articles by feed (clip feeds also use this route)
/categories/:categoryId        → Articles by category
/settings                      → Redirect to /settings/general
/settings/:tab                 → Settings page (general / appearance / ai / security / plugins / viewer / about)
/chat                          → Chat page (new conversation)
/chat/:conversationId          → Chat page (conversation detail)
/*                             → Article detail (catch-all, original article URL with scheme removed)
```

The display URL for an article is the original article URL with the scheme removed:
```
https://blog.cloudflare.com/new-features-2025
→ /blog.cloudflare.com/new-features-2025
```

The frontend prepends `https://` to the splat path to reconstruct the original article URL, then fetches the article data via `GET /api/articles/by-url?url=...`.

Paths ending with `.md` are treated as Markdown source view pages (`ArticleRawPage`).


### Command Palette & Keyboard Shortcuts

The command palette (`Cmd+K`) provides unified access to navigation, actions, feeds, and appearance settings. It uses `cmdk` (shadcn/ui `CommandDialog`).

| Shortcut | Action |
|---|---|
| `Cmd+K` | Open command palette |
| `Cmd+Shift+K` | Open article search |
| `Cmd+N` | Add new feed |
| `Cmd+,` | Open settings |
| `Cmd+1`–`5` | Navigate to Inbox / Bookmarks / Likes / History / Chat |

Command palette groups:
- **Navigation** — Inbox, Bookmarks, Likes, History, Chat, Settings
- **Actions** — Search articles, Add feed, Import/Export OPML
- **Feeds** — Dynamic list from SWR, shown only when search input is non-empty (clip feeds excluded)
- **Appearance** — Theme, layout, and color mode switching

All items include English `keywords` for cross-language matching (e.g., typing "chat" matches the localized label in Japanese locale).

Global shortcuts are managed by `useGlobalShortcuts` hook in `src/hooks/use-global-shortcuts.ts` and registered in `FeedList`.


### Data Fetching

| Item | Approach |
|---|---|
| Library | SWR |
| Pagination | Infinite scroll (`useSWRInfinite`, `limit=20` per page) |
| Display range limit | Smart Floor — For feed/category views, adopts whichever range contains the most articles among three candidates: "last 1 week", "latest 20 articles", and "up to the oldest unread". Skipped if fewer than 20 articles exist. Not applied to Inbox/Bookmarks/Likes/History/Clips |
| Show older articles | When Smart Floor hides articles, a "show older articles (N)" button appears at the end of the list. Clicking it re-fetches with `no_floor=1` to show all articles |
| Scroll stop condition | Stops when response `has_more === false` |
| Loading | Skeleton UI |
| Error | Inline message + retry button |
| Empty state | "No articles" (centered with `text-muted`) |

**Fetch completion toast**: Displays results via `sonner` toast upon completion of manual fetch (refresh button / right-click → Fetch) and pull-to-refresh (individual feed pages only).

| Condition | Toast |
|---|---|
| New articles found | `Fetched {count} new article(s)` (success) |
| No new articles | `No new articles` (default) |
| Error | `Fetch failed` (error) |

Pull-to-refresh calls `startFeedFetch(feedId)` on individual feed pages to fetch from the RSS source. On aggregate pages (Inbox, etc.), it only performs SWR `mutate()` as before.

**Fetch progress sharing**: The `useFetchProgress` hook is shared via `FetchProgressContext`, allowing the sidebar and article list to reference the same progress state.

**Cache invalidation**: After mutations, related caches are revalidated using `mutate()`.

| Operation | Revalidation target |
|---|---|
| Add feed (`POST /api/feeds`) | `/api/feeds` |
| Delete feed (`DELETE /api/feeds/:id`) | `/api/feeds`, `/api/articles` |
| Update feed (`PATCH /api/feeds/:id`) | `/api/feeds` |
| Seen/read update (`PATCH .../seen`, `POST .../read`) | `/api/feeds` (to update unread_count) |


### Feed Metrics

Displays update frequency and activity level for feeds.

**Sidebar (Inactive indicator)**
- When `showFeedActivity === 'on'` and the feed is inactive, an `inactive` label is shown next to the feed name
- Inactive criteria: `latest_published_at` is more than 90 days ago, or the feed has articles but `latest_published_at` is null
- This is a separate concept from `disabled` (automatic deactivation due to fetch errors)
- Display controlled by setting `reading.show_feed_activity` (on/off, default: on)

**Metrics bar (below article list header)**
- Shown only on individual feed views (`/feeds/:feedId`). Hidden on Inbox and category views
- Displayed items: total article count, update frequency (X.X/wk), last updated (relative time), average article length
- Lightweight data (article count, update frequency, last updated) is obtained from the `/api/feeds` SWR cache
- Heavy data (average article length) is fetched on demand from `/api/feeds/:id/metrics`
- Not displayed for clip feeds

### Markdown Rendering

All Markdown-to-HTML rendering goes through `renderMarkdown()` in `src/lib/markdown.ts`. This function applies a preprocessing pipeline before passing the result to `marked` (GFM mode, with `highlight.js` syntax highlighting).

**Pipeline architecture**

```
renderMarkdown(md, [optional preprocessors])
  → [...optional, ...default] preprocessors (reduce)
  → markedInstance.parse()
```

Each preprocessor is a pure function `(md: string) => string`. The pipeline runs optional (caller-specified) preprocessors first, then the default pipeline.

| Preprocessor | Pipeline | Description |
|---|---|---|
| `fixLegacyMarkdown` | Default | Repairs malformed HTML in articles stored before server-side normalization (e.g. `<picture>` → `![](src)`, multi-line link collapsing) |
| `escapeNestedBrackets` | Default | Escapes `[` `]` inside link text so titles like `[AINews] Title` render correctly |
| `rewriteLinksToAppPaths` | Optional (chat) | Rewrites external URLs in links to in-app paths |

**Usage by context**

| Context | Call | Files |
|---|---|---|
| Article body | `renderMarkdown(md)` | `article-detail.tsx` |
| Article summary | `renderMarkdown(summary)` | `use-summarize.ts` |
| Translation preview | `renderMarkdown(text)` | `use-streaming-ai.ts` |
| Chat messages | `renderMarkdown(md, [rewriteLinksToAppPaths])` | `chat-message-bubble.tsx` |

**Shared utilities**

`walkLinks(s, visitor)` provides bracket-aware markdown link scanning (handles nested brackets, skips image links). Used by both `escapeNestedBrackets` and `rewriteLinksToAppPaths` to avoid duplicated link-parsing logic.

**Implementation files**
- `src/lib/markdown.ts` — `renderMarkdown`, `walkLinks`, preprocessors, `markedInstance`


### Article List Display Layouts

Four layout options are available for the article list. Independent from the theme (color), allowing free combination.

| Layout | Key | Description |
|---|---|---|
| List | `list` | Classic single-column list. Shows excerpt, domain, and thumbnail. Default |
| Card | `card` | 2-column grid. Large thumbnail (aspect-video) placed at the top. Visual-oriented |
| Magazine | `magazine` | Mixed layout with the first article as a hero (large card) and the rest as smaller cards |
| Compact | `compact` | High-density list with title and date only. No thumbnails |

- Setting key: `appearance.list_layout` (allowed values: `list` / `card` / `magazine` / `compact`)
- Settings page: Selectable with preview in the layout section of `/settings/appearance`
- Persistence: `localStorage` (instant reflection) + DB sync (500ms debounced PATCH)
- Layout definitions: `src/data/layouts.ts`
- Hook: `src/hooks/useLayout.ts` (based on `createLocalStorageHook`)
- Skeleton UI: Dedicated skeletons corresponding to each layout

### Article Open Mode

Three ways to open an article from the list. Independent from list layout.

| Mode | Key | Description |
|---|---|---|
| Full page | `page` | Navigates to the article detail route. Default |
| Overlay | `overlay` | Opens the article in a right-hand overlay without leaving the list |
| Split view | `split` | Desktop three-column layout: sidebar \| article list \| detail panel. Below the `md` breakpoint (768px) — phones and narrow windows — the preference is kept but the UI falls back to **full-page** navigation (same as `page`): no side-by-side detail panel, list clicks navigate to the detail route |

- Setting key: `reading.article_open_mode` (allowed values: `page` / `overlay` / `split`)
- Settings page: Selectable with preview cards under Reading
- Persistence: `localStorage` (instant) + DB sync via preferences PATCH
- Hook: `src/hooks/use-article-open-mode.ts`
- Split view extras:
  - List panel width is draggable (200–640px, default 360px), stored as `split-panel-width` in `localStorage`
  - Detail panel can be collapsed; state stored as `split-detail-collapsed`
  - Clicking a list item (or j/k focus move) loads the article in the detail panel without a route change
  - Selected row is highlighted; switching feed/section clears the selection

### PWA Support

Progressive Web App support via `vite-plugin-pwa`.

| Item | Configuration |
|---|---|
| Registration method | `autoUpdate` |
| Display mode | `standalone` |
| Start URL | `/inbox` |
| Cache strategy (Favicon) | CacheFirst (30 days) |
| Cache strategy (Article detail API) | StaleWhileRevalidate (7 days) |
| Cache strategy (General API) | NetworkFirst (24 hours, 5s timeout) |
| Cache strategy (Images) | CacheFirst (30 days) |
| Offline queue | Accumulates unsynced read IDs in IndexedDB (`reader-offline` DB) and batch-syncs via `POST /api/articles/batch-seen` when back online |
| Update notification | When a new service worker is available, a persistent toast ("New version available") with a reload button is displayed via `sonner`. Clicking reload activates the new worker and refreshes the page |

### Custom Theme Import

Users can import custom color themes via JSON in `/settings/appearance`.

| Item | Detail |
|---|---|
| Import method | Paste JSON into syntax-highlighted editor dialog, or load from file |
| Sample theme | "Sample" button loads an Everforest theme as a starting point |
| Edit | Previously imported custom themes can be edited via the same dialog |
| Validation | Theme name must match `[a-z0-9_-]+`, cannot override builtin names, must include both `light` and `dark` variants with all required color keys |
| Max custom themes | 20 |
| Persistence | localStorage + DB sync |
| Required color keys | `background`, `background.sidebar`, `background.subtle`, `background.avatar`, `text`, `text.muted`, `accent`, `accent.text`, `error`, `border`, `hover`, `overlay` |
| Optional fields | `indicatorStyle` (`'line'` / `'dot'`), `highlight` (code block theme, default: `'github'`) |

### Feed Multi-Select and Bulk Actions

Multiple feeds can be selected in the sidebar for bulk operations.

| Item | Detail |
|---|---|
| Select | Cmd/Ctrl + Click to toggle individual feed, Shift + Click for range selection |
| Deselect | Escape key clears selection |
| Exclusion | Clip feeds are excluded from multi-select |
| Context menu | Right-click on selection to open bulk action menu |

Supported bulk actions:

| Action | Behavior |
|---|---|
| Move to Category | `POST /api/feeds/bulk-move` — moves selected feeds to a category |
| Mark All Read | Calls `POST /api/feeds/:id/mark-all-seen` for each feed |
| Fetch | Fetches each selected enabled feed sequentially |
| Delete | Requires confirmation dialog. Deletes each feed via `DELETE /api/feeds/:id` |
