# タスク: クリップのフェッチパイプラインを通常フィードと統一する

## 背景

クリップ機能（`POST /api/articles/from-url`）と通常RSSフィードの記事取得は、どちらも `fetchFullText()` を使ってコンテンツを取得しているが、呼び出し方が異なる。

- **通常フィード** (`server/fetcher.ts` の `processArticle()`): `fetchFullText()` の周りにリトライ、FlareSolverr連携、CSS Bridge excerpt フォールバック、bot block検出などの追加ロジックがある
- **クリップ** (`server/routes/articles.ts` L341-377): `fetchFullText(url)` を素で呼んでいるだけ。FlareSolverr の `requiresJsChallenge` オプションも渡していない

この結果、クリップでは FlareSolverr 自動フォールバック（`content.ts` L52 の `needsRetry` 判定）は効くが、フィードレベルの `requires_js_challenge` フラグによる明示的な FlareSolverr 指定や、bot block 検出後の excerpt フォールバックが使えない。

## 目的

`processArticle()` 内のフェッチ＋解析ロジックを共通関数として切り出し、クリップ側もそれを呼ぶようにする。

## 現状のコード構造

### `server/fetcher.ts` — `processArticle()` (L52-129)

```ts
// 非公開関数（export されていない）
async function processArticle(task: ArticleTask): Promise<void> {
  // Step 1: fetchFullText (+ requiresJsChallenge, retry skip)
  // Step 1.5: CSS Bridge excerpt フォールバック + isBotBlockPage 検出
  // Step 2: detectLanguage
  // Step 3: insertArticle or updateArticleContent（DB永続化）
}
```

`ArticleTask` は discriminated union:
```ts
interface NewArticle { kind: 'new'; feed_id; title; url; published_at; requires_js_challenge?; excerpt? }
interface RetryArticle { kind: 'retry'; article: Article }
type ArticleTask = NewArticle | RetryArticle
```

### `server/routes/articles.ts` — クリップ処理 (L341-377)

```ts
// fetchFullText を素で呼び、結果を insertArticle に渡す
const result = await fetchFullText(body.url)     // オプションなし
// ... detectLanguage ...
const articleId = insertArticle({ ... })
const article = getArticleById(articleId)
reply.status(201).send({ article, created: true })
```

### `server/fetcher/content.ts` — `fetchFullText()` (L38-)

コアのフェッチ関数。HTML取得 → Readability解析 → Markdown変換。`requiresJsChallenge` オプションで FlareSolverr を明示指定可能。また、抽出結果が短い/ゴミの場合は自動で FlareSolverr にフォールバックする。

## 実装方針

### 1. `processArticle()` からフェッチ＋解析部分を切り出す

`server/fetcher.ts` に新しい関数を作る（仮名: `fetchArticleContent`）。

```ts
export interface FetchedContent {
  fullText: string | null
  ogImage: string | null
  excerpt: string | null
  lang: string | null
  lastError: string | null
  title: string | null   // fetchFullText が返す title（OGP等から取得）
}

export async function fetchArticleContent(
  url: string,
  options?: {
    requiresJsChallenge?: boolean
    /** CSS Bridge の listing-page excerpt。フォールバック用 */
    listingExcerpt?: string
    /** リトライ時の既存記事データ（full_text があればフェッチをスキップ） */
    existingArticle?: { full_text: string | null; og_image: string | null; lang: string | null }
  }
): Promise<FetchedContent>
```

この関数が担当するのは:
- `fetchFullText()` の呼び出し（`requiresJsChallenge` を渡す）
- リトライ時の既存 `full_text` スキップ
- CSS Bridge excerpt フォールバック + `isBotBlockPage()` 検出
- `detectLanguage()` の呼び出し
- `fetchFullText` が返す `title` のパススルー

この関数が担当**しない**のは:
- DB永続化（`insertArticle` / `updateArticleContent`）— 呼び出し元に委ねる
- タイトル解決ロジック（クリップとRSSで異なるため）

### 2. `processArticle()` をリファクタ

既存の `processArticle()` を `fetchArticleContent()` を呼ぶように書き換える。

```ts
async function processArticle(task: ArticleTask): Promise<void> {
  const articleUrl = task.kind === 'new' ? task.url : task.article.url
  const content = await fetchArticleContent(articleUrl, {
    requiresJsChallenge: task.kind === 'new' ? task.requires_js_challenge : undefined,
    listingExcerpt: task.kind === 'new' ? task.excerpt : undefined,
    existingArticle: task.kind === 'retry' ? task.article : undefined,
  })

  const effectiveLang = content.lang || (task.kind === 'retry' ? task.article.lang : null)

  // DB永続化（既存ロジックそのまま）
  if (task.kind === 'new') {
    insertArticle({ ... })
  } else {
    updateArticleContent(task.article.id, { ... })
  }
}
```

### 3. クリップ側を `fetchArticleContent()` に差し替え

`server/routes/articles.ts` の L341-377 を書き換え:

```ts
const content = await fetchArticleContent(body.url)
const title = body.title || content.title || new URL(body.url).hostname
const articleId = insertArticle({
  feed_id: clipFeed.id,
  title,
  url: body.url,
  published_at: new Date().toISOString(),
  lang: content.lang,
  full_text: content.fullText,
  excerpt: content.excerpt,
  og_image: content.ogImage,
  last_error: content.lastError,
})
```

## テスト

### 既存テストが通ること

- `server/fetcher.test.ts` — 通常フィードのテスト（リファクタ後も挙動が変わらないことを確認）
- `server/routes/clip-articles.test.ts` — クリップのテスト

### 注意点

- `clip-articles.test.ts` は `fetchFullText` を直接モックしている（L41-43）。`fetchArticleContent` を使うようにした場合、モック対象を変更するか、`fetchArticleContent` 内部で呼ばれる `fetchFullText` をモックしたままでも透過的に動くか確認すること
- クリップのテストでは `fetchFullText` が **オプションなし** で呼ばれることを検証している（L114）。統一後は `fetchArticleContent` 経由になるので、このアサーションの調整が必要になる可能性がある

### テスト実行コマンド

```bash
npx vitest run server/fetcher.test.ts
npx vitest run server/routes/clip-articles.test.ts
```

全テスト:
```bash
npx vitest run
```

## スコープ外

- フロントエンドの変更は不要（レスポンス形式は変わらない）
- `fetchFullText()` 自体の変更は不要
- 新しい機能の追加は不要（既存のパイプラインをクリップでも使えるようにするだけ）
