# Chat Scope v2: Implementation Evaluation

## Summary

The list-scoped chat renovation has been implemented in `codex/chat-scope-v2` and merged to main. This document evaluates the implementation against the original proposal and the 8 issues raised during evaluation.

---

## Verification: All 8 Evaluation Issues

### Issue 1: `article_ids` payload size — ✅ Fixed

**Implementation:** `server/chat/scope.ts` defines `MAX_SCOPE_ARTICLES = 500`.

For `loaded_list`, `buildLoadedListScope()` caps the incoming IDs at 500 and then validates them with `getArticlesByIds()` to filter out non-existent or user-inaccessible articles. The actual stored scope contains only valid IDs.

For `filtered_list`, `buildFilteredListScope()` calls `getArticles({ limit: MAX_SCOPE_ARTICLES })` at request time to resolve the filter to a concrete, capped snapshot of article IDs. This means the scope is always a fixed-size snapshot by the time it reaches the database.

Both modes store the resolved `article_ids` array (not raw filter expressions) in `scope_payload_json`. The `count_total` field retains the original full count so the UI can show "200 / 512" when capping occurs.

---

### Issue 2: Centralized scope enforcement — ✅ Fixed

**Implementation:** `server/chat/tools.ts`, `executeTool()` function (at the bottom of the file).

Two centralized guards cover all scope enforcement:

```typescript
// Article-level scope check (6 tools)
const ARTICLE_SCOPED_TOOL_NAMES = new Set([
  'get_article', 'mark_as_read', 'toggle_like',
  'toggle_bookmark', 'summarize_article', 'translate_article',
])

export async function executeTool(name, input, context) {
  const tool = toolMap.get(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)

  if (ARTICLE_SCOPED_TOOL_NAMES.has(name)) {
    assertArticleInScope(input.article_id as number, context?.scope)
  }

  const effectiveInput = name === 'search_articles'
    ? applyScopeToArticleSearch(input, context?.scope)
    : input

  return tool.execute(effectiveInput, context)
}
```

Individual tool `execute()` functions have no scope-awareness. Scope enforcement is entirely the responsibility of `executeTool()`.

---

### Issue 3: Filter merge semantics — ✅ Fixed

**Implementation:** `server/chat/scope.ts` `applyScopeToArticleSearch()` + `server/db/articles.ts` `searchArticles()`.

The scope's `article_ids` array is injected as a hidden `__scope_article_ids` field in the tool input:

```typescript
export function applyScopeToArticleSearch<T>(input: T, scope?: ChatScope) {
  if (!scope || scope.type !== 'list') return input
  return { ...input, __scope_article_ids: scope.article_ids }
}
```

In `searchArticles()`, if `article_ids` is provided, a SQL `IN (...)` clause is added AND'd with all other conditions (feed_id, category_id, unread, etc.). The scope's article list acts as the outermost constraint — the model's own filters can narrow further but cannot escape the scope boundary.

When `article_ids` is an empty array, the query returns `[]` immediately (no results), rather than bypassing the constraint. This handles the edge case where a user's loaded list has been entirely purged.

---

### Issue 4: Don't expose `article_ids` to model — ✅ Fixed

**Implementation:** `server/chat/tools.ts`, `searchArticlesTool.inputSchema`.

The `__scope_article_ids` field is not declared in the tool's `inputSchema`. It is never visible to the model. The model's only new parameters in `search_articles` are `read` (boolean) and `article_kind` (enum), both of which are legitimate user-visible filters independent of scope.

The `__` prefix convention makes the internal nature explicit at the code level.

---

### Issue 5: Scope as immutable snapshot — ✅ Fixed

**Implementation:** `server/chat/scope.ts` `buildFilteredListScope()`.

For `filtered_list`, the scope is resolved to a concrete list of article IDs at conversation creation time (`normalizeChatScope()` → `buildFilteredListScope()`). These IDs are stored in `scope_payload_json`. Subsequent messages in the same conversation use `parseStoredChatScope()` which reads the stored snapshot — it does not re-execute the filter query.

This means:
- Articles added to a feed after the conversation was created are NOT in scope.
- Articles marked as read during the conversation remain in scope.
- The scope is semantically "this list as it appeared when you started chatting."

The `count_total` field in the stored scope is the total matching articles at snapshot time, used to inform the system prompt ("Scoped: 42 / Total: 128").

---

### Issue 6: Enriched system prompt for list scope — ✅ Fixed

**Implementation:** `server/chat/system-prompt.ts` `buildListScopePrompt()`.

```
## Current list scope
The user is chatting about a specific article list snapshot.
- **List**: ${scope.label}
- **Scope mode**: ${scope.mode}
- **Scoped articles**: ${scope.count_scoped}
- **Total matching articles**: ${scope.count_total}

All article searches and article actions are restricted to this list snapshot.
If a tool reports that an article is outside the current scope, explain the current scope
and suggest switching to global chat if the user wants to go broader.
When answering questions like "what's in this list?" or "compare the articles here",
stay within this list snapshot.
```

This gives the model: the list label, the mode (loaded vs. filtered), scoped vs. total counts, and explicit instructions on how to handle out-of-scope rejections.

---

### Issue 7: Resume behavior — ✅ Fixed

**Implementation:** `server/chat/scope.ts` `parseStoredChatScope()` + `server/chatRoutes.ts`.

On every message to an existing conversation, the server reads the stored scope from `scope_payload_json` (not from the client request). The client-sent scope is only used at conversation creation time.

If the client sends a `scope` field on a message to an existing conversation AND it doesn't match the stored scope, the server returns `409 Conflict` with `{ error: 'Conversation scope mismatch' }`. This prevents accidental scope drift while still allowing clients to omit the scope field for continuation.

Legacy conversations (no `scope_type` column) fall back to:
- `article_id != null` → `article` scope
- Otherwise → `global` scope

---

### Issue 8: `article_kind` enum values — ✅ Confirmed

Values `'original' | 'repost' | 'quote'` match `shared/article-kind.ts` exactly.

---

## Test Results

```
Test Files  139 passed (139)
      Tests  2174 passed (2174)
TypeScript  0 errors
```

New test coverage added:
- `server/chat/scope.test.ts` (94 lines): normalizeChatScope, assertArticleInScope, applyScopeToArticleSearch, legacy mapping, filtered_list cap behavior
- `server/chat/tools.test.ts` (additions): `read` filter, `article_kind` filter, list scope constraint enforcement
- `server/chatRoutes.test.ts` (additions): scope persistence, filtered_list snapshot resolution, legacy article_id mapping, 409 mismatch detection
- `server/db/conversations.test.ts` (additions): scope_type and scope_payload_json persistence

---

## Files Changed (36 total)

| Category | Files |
|----------|-------|
| Core types | `shared/types.ts` — 4 new interfaces: `GlobalChatScope`, `ArticleChatScope`, `ListChatScope`, `ChatScope`, `ScopeSummary`, `ListChatScopeFilters` |
| Server scope logic | `server/chat/scope.ts` (new, 202 lines) |
| API endpoint | `server/chatRoutes.ts` — scope validation, normalization, persistence, mismatch detection |
| Tool enforcement | `server/chat/tools.ts` — centralized guard in `executeTool()`, new `read`/`article_kind` params |
| Tool loop | `server/chat/tool-loop.ts` — thread `scope` through to `executeTool()` |
| System prompt | `server/chat/system-prompt.ts` — `buildListScopePrompt()`, `buildSystemPrompt(scope)` |
| DB layer | `server/db/articles.ts` — `read`, `article_kind`, `article_ids` in `searchArticles()` |
| DB conversations | `server/db/conversations.ts` — `scope_type`, `scope_payload_json` in `createConversation()` |
| Migration | `migrations/0013_conversation_scope.sql` |
| Frontend utilities | `src/lib/chat-scope.ts` (new) — scope builders and summarizer |
| Frontend hook | `src/hooks/use-chat.ts` — `useChat(scope?)` replaces `useChat(articleId?, context?)` |
| Chat panel | `src/components/chat/chat-panel.tsx` — `scope` + `scopeSummary` props, badge display |
| Scope badge | `src/components/chat/chat-scope-badge.tsx` (new) |
| Article integration | `article-detail.tsx`, `chat-fab.tsx`, `chat-inline.tsx` — pass article scope |
| List entry point | `src/components/article/article-list.tsx` — "Chat this list" chip with loaded/filtered scope |
| Chat page | `src/pages/chat-page.tsx` — scope switcher (loaded / filtered / global), badge in detail view |
| Home page | `src/pages/home-page.tsx` — explicit global scope |
| i18n | `src/lib/i18n.ts` — scope-related UI strings |

---

## Outstanding Observations

### Minor: `ChatInline` missing `scopeSummary`

`src/components/chat/chat-inline.tsx` — the `ChatInline` component (used via `ArticleToolbar`) does not pass `scopeSummary` to `ChatPanel`. `ChatInlinePanel` and `ChatFab` do pass it correctly. Since `ChatInline` is only used in the inline trigger flow and the article scope badge is low-priority in that context, this is acceptable but worth noting for future cleanup.

### Minor: Meilisearch bypassed for list-scoped searches

When `__scope_article_ids` is present, `useMeili` is false — all list-scoped keyword searches fall through to the SQLite path. For lists capped at 500 articles, SQLite LIKE search is fast enough (tested in practice). If Meilisearch adds native `id IN [...]` filter support with good performance, this path could be revisited.

### Design decision: `__scope_article_ids` injection technique

The scope constraint is passed through the tool input using a `__`-prefixed internal field. This keeps `ToolContext` relatively clean and avoids threading the scope all the way into individual tool `execute()` functions. The trade-off is a minor coupling between `applyScopeToArticleSearch` and the `searchArticles` tool's internal implementation. The alternative — threading `scope` through every `execute()` signature — would touch more code for no practical benefit.
