import { getDb, runNamed } from './connection.js'
import type { ArticleListItem, Label, LabelRule, LabelWithCount } from '../../shared/types.js'

// ---------------------------------------------------------------------------
// Rule-based WHERE clause builder
// ---------------------------------------------------------------------------

type MatchExpr = { clause: string; args: string[] }

function buildFieldMatch(text: string, field: string, alias: string): MatchExpr {
  if (field === 'title') {
    return { clause: `${alias}.title LIKE '%' || ? || '%'`, args: [text] }
  }
  if (field === 'full_text') {
    return { clause: `${alias}.full_text LIKE '%' || ? || '%'`, args: [text] }
  }
  return {
    clause: `(${alias}.title LIKE '%' || ? || '%' OR ${alias}.full_text LIKE '%' || ? || '%')`,
    args: [text, text],
  }
}

export function buildRulesWhere(rules: LabelRule[], alias = 'a'): MatchExpr {
  const orExprs: MatchExpr[] = []
  const andExprs: MatchExpr[] = []
  const notExprs: MatchExpr[] = []

  for (const rule of rules) {
    const expr = buildFieldMatch(rule.match_text, rule.match_field, alias)
    if (rule.rule_type === 'or') orExprs.push(expr)
    else if (rule.rule_type === 'and') andExprs.push(expr)
    else notExprs.push(expr)
  }

  if (orExprs.length === 0 && andExprs.length === 0 && notExprs.length === 0) {
    return { clause: '0=1', args: [] }
  }

  const parts: string[] = []
  const args: string[] = []

  if (orExprs.length > 0) {
    parts.push(`(${orExprs.map(e => e.clause).join(' OR ')})`)
    for (const e of orExprs) args.push(...e.args)
  }
  for (const e of andExprs) { parts.push(e.clause); args.push(...e.args) }
  for (const e of notExprs) { parts.push(`NOT ${e.clause}`); args.push(...e.args) }

  return { clause: parts.join(' AND '), args }
}

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

function getLabelRules(labelId: number): LabelRule[] {
  return getDb().prepare(
    'SELECT * FROM label_rules WHERE label_id = ? ORDER BY id ASC',
  ).all(labelId) as LabelRule[]
}

function replaceRules(
  labelId: number,
  rules: Array<{ match_text: string; match_field: 'title' | 'full_text' | 'both'; rule_type: 'and' | 'or' | 'not' }>,
): void {
  const db = getDb()
  db.prepare('DELETE FROM label_rules WHERE label_id = ?').run(labelId)
  const insert = db.prepare(
    'INSERT INTO label_rules (label_id, match_text, match_field, rule_type) VALUES (?, ?, ?, ?)',
  )
  for (const r of rules) {
    insert.run(labelId, r.match_text, r.match_field, r.rule_type)
  }
}

// ---------------------------------------------------------------------------
// Exclusion clause: articles already claimed by higher-priority exclusive labels
// ---------------------------------------------------------------------------

type LabelWithRules = Label & { rules: LabelRule[] }

/**
 * Build a NOT IN clause that excludes articles matched by any exclusive label
 * with higher priority (lower sort_order) than the current label.
 */
function buildExclusionClause(claimers: LabelWithRules[]): MatchExpr | null {
  const active = claimers.filter(l => l.rules.length > 0)
  if (active.length === 0) return null

  const subqueries: string[] = []
  const args: string[] = []
  for (const l of active) {
    const { clause, args: la } = buildRulesWhere(l.rules, 'e')
    subqueries.push(`SELECT e.id FROM active_articles e WHERE (${clause})`)
    args.push(...la)
  }
  return { clause: `a.id NOT IN (${subqueries.join(' UNION ')})`, args }
}

// ---------------------------------------------------------------------------
// Materialized membership (article_labels)
//
// Label rule evaluation (LIKE over title + full_text, plus the exclusive-label
// exclusion) is expensive and unindexable, so we precompute membership into the
// article_labels join table instead of running it on every request. Membership
// is a purely per-article property (an article belongs to a label iff it matches
// the label's rules and is not claimed by a higher-priority exclusive label), so
// it can be maintained incrementally per article on ingest and rebuilt wholesale
// when label rules/order/exclusivity change.
// ---------------------------------------------------------------------------

/**
 * Build the full match clause for a label (rules + exclusion by higher-priority
 * exclusive labels). Returns null for a label with no rules (matches nothing).
 */
function buildLabelMatchClause(
  label: Label,
  rules: LabelRule[],
  exclusiveWithRules: LabelWithRules[],
): MatchExpr | null {
  if (rules.length === 0) return null
  const { clause, args } = buildRulesWhere(rules)
  const claimers = exclusiveWithRules.filter(l => l.sort_order < label.sort_order)
  const excl = buildExclusionClause(claimers)
  return {
    clause: excl ? `(${clause}) AND ${excl.clause}` : clause,
    args: excl ? [...args, ...excl.args] : args,
  }
}

function loadLabelsWithExclusive(): { labels: Label[]; exclusiveWithRules: LabelWithRules[] } {
  const labels = getDb().prepare(
    'SELECT * FROM labels ORDER BY sort_order ASC',
  ).all() as Label[]
  const exclusiveWithRules = labels
    .filter(l => l.exclusive === 1)
    .map(l => ({ ...l, rules: getLabelRules(l.id) }))
  return { labels, exclusiveWithRules }
}

/** Recompute the label membership of a single article (used on ingest/content change). */
export function updateArticleLabels(articleId: number): void {
  const db = getDb()
  const { labels, exclusiveWithRules } = loadLabelsWithExclusive()

  const matched: number[] = []
  for (const label of labels) {
    const match = buildLabelMatchClause(label, getLabelRules(label.id), exclusiveWithRules)
    if (!match) continue
    const hit = db.prepare(
      `SELECT 1 FROM active_articles a WHERE a.id = ? AND (${match.clause}) LIMIT 1`,
    ).get(articleId, ...match.args)
    if (hit) matched.push(label.id)
  }

  db.transaction(() => {
    db.prepare('DELETE FROM article_labels WHERE article_id = ?').run(articleId)
    const ins = db.prepare('INSERT OR IGNORE INTO article_labels (article_id, label_id) VALUES (?, ?)')
    for (const labelId of matched) ins.run(articleId, labelId)
  })()
}

/** Rebuild the entire article_labels table from current label rules. */
export function rebuildAllLabelMemberships(): void {
  const db = getDb()
  const { labels, exclusiveWithRules } = loadLabelsWithExclusive()

  db.transaction(() => {
    db.prepare('DELETE FROM article_labels').run()
    for (const label of labels) {
      const match = buildLabelMatchClause(label, getLabelRules(label.id), exclusiveWithRules)
      if (!match) continue
      db.prepare(
        `INSERT OR IGNORE INTO article_labels (article_id, label_id)
         SELECT a.id, ? FROM active_articles a WHERE (${match.clause})`,
      ).run(label.id, ...match.args)
    }
  })()
}

// ---------------------------------------------------------------------------
// Label CRUD
// ---------------------------------------------------------------------------

export function getLabels(opts: { unreadOnly?: boolean } = {}): LabelWithCount[] {
  const rows = getDb().prepare(
    'SELECT * FROM labels ORDER BY sort_order ASC, name COLLATE NOCASE ASC',
  ).all() as Label[]

  // Counts come from the materialized membership table — one grouped query for
  // all labels instead of a per-label full-text scan.
  const unreadClause = opts.unreadOnly ? ' AND a.seen_at IS NULL' : ''
  const countRows = getDb().prepare(`
    SELECT al.label_id AS label_id, COUNT(*) AS n
    FROM article_labels al
    JOIN active_articles a ON a.id = al.article_id
    WHERE 1=1${unreadClause}
    GROUP BY al.label_id
  `).all() as { label_id: number; n: number }[]
  const countMap = new Map(countRows.map(r => [r.label_id, r.n]))

  return rows.map(label => ({
    ...label,
    rules: getLabelRules(label.id),
    article_count: countMap.get(label.id) ?? 0,
  }))
}

export function getLabelById(id: number): Label | undefined {
  const row = getDb().prepare('SELECT * FROM labels WHERE id = ?').get(id) as Label | undefined
  if (!row) return undefined
  return { ...row, rules: getLabelRules(id) }
}

export function createLabel(data: {
  name: string
  auto_summarize?: boolean
  exclusive?: boolean
  rules: Array<{ match_text: string; match_field: 'title' | 'full_text' | 'both'; rule_type: 'and' | 'or' | 'not' }>
}): Label {
  const maxOrder = getDb().prepare(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM labels',
  ).get() as { next: number }

  // Legacy columns: store first OR rule text for backward compat; empty otherwise
  const firstOr = data.rules.find(r => r.rule_type === 'or')
  const legacyText = firstOr?.match_text ?? ''
  const legacyField = firstOr?.match_field ?? 'both'

  const info = getDb().prepare(
    'INSERT INTO labels (name, match_text, match_field, sort_order, auto_summarize, exclusive) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(data.name, legacyText, legacyField, maxOrder.next, data.auto_summarize ? 1 : 0, data.exclusive ? 1 : 0)

  const id = Number(info.lastInsertRowid)
  replaceRules(id, data.rules)

  rebuildAllLabelMemberships()
  return getLabelById(id)!
}

export function updateLabel(
  id: number,
  data: {
    name?: string
    sort_order?: number
    auto_summarize?: boolean
    exclusive?: boolean
    rules?: Array<{ match_text: string; match_field: 'title' | 'full_text' | 'both'; rule_type: 'and' | 'or' | 'not' }>
  },
): Label | undefined {
  if (!getLabelById(id)) return undefined

  const fields: string[] = []
  const params: Record<string, unknown> = { id }

  if (data.name !== undefined) { fields.push('name = @name'); params.name = data.name }
  if (data.sort_order !== undefined) { fields.push('sort_order = @sort_order'); params.sort_order = data.sort_order }
  if (data.auto_summarize !== undefined) {
    fields.push('auto_summarize = @auto_summarize')
    params.auto_summarize = data.auto_summarize ? 1 : 0
  }
  if (data.exclusive !== undefined) {
    fields.push('exclusive = @exclusive')
    params.exclusive = data.exclusive ? 1 : 0
  }

  if (fields.length > 0) {
    runNamed(`UPDATE labels SET ${fields.join(', ')} WHERE id = @id`, params)
  }

  if (data.rules !== undefined) {
    replaceRules(id, data.rules)
    // Sync legacy columns — fall back to '' / 'both' when no or-rules remain, since
    // match_text / match_field are NOT NULL (mirrors createLabel's handling)
    const firstOr = data.rules.find(r => r.rule_type === 'or')
    getDb().prepare('UPDATE labels SET match_text = ?, match_field = ? WHERE id = ?')
      .run(firstOr?.match_text ?? '', firstOr?.match_field ?? 'both', id)
  }

  // Rules, sort_order, and exclusivity all affect membership (the latter two via
  // the exclusive-label exclusion), so rebuild whenever anything changed.
  rebuildAllLabelMemberships()
  return getLabelById(id)
}

export function deleteLabel(id: number): boolean {
  const result = getDb().prepare('DELETE FROM labels WHERE id = ?').run(id)
  // Deleting an exclusive label releases its claim on lower-priority labels'
  // articles, so membership must be recomputed. (The deleted label's own rows
  // are removed by ON DELETE CASCADE.)
  if (result.changes > 0) rebuildAllLabelMemberships()
  return result.changes > 0
}

// ---------------------------------------------------------------------------
// Article queries
// ---------------------------------------------------------------------------

export function getArticlesByLabel(
  labelId: number,
  opts: { limit: number; offset: number; unreadOnly?: boolean },
): { items: ArticleListItem[]; total: number; hasMore: boolean } {
  // Membership (including the exclusive-label exclusion) is precomputed in
  // article_labels, so this is a fast indexed JOIN rather than a full-text scan.
  const unreadClause = opts.unreadOnly ? ' AND a.seen_at IS NULL' : ''

  const total = (getDb().prepare(`
    SELECT COUNT(*) AS n
    FROM article_labels al
    JOIN active_articles a ON a.id = al.article_id
    WHERE al.label_id = ?${unreadClause}
  `).get(labelId) as { n: number }).n

  const itemsWithExtra = getDb().prepare(`
    SELECT a.id, a.feed_id, f.name AS feed_name, a.title, a.url,
           a.published_at, a.lang, a.summary, a.excerpt, a.og_image,
           a.seen_at, a.read_at, a.bookmarked_at, a.liked_at, a.score
    FROM article_labels al
    JOIN active_articles a ON a.id = al.article_id
    JOIN feeds f ON f.id = a.feed_id
    WHERE al.label_id = ?${unreadClause}
    ORDER BY a.published_at DESC
    LIMIT ? OFFSET ?
  `).all(labelId, opts.limit + 1, opts.offset) as ArticleListItem[]

  const hasMore = itemsWithExtra.length > opts.limit
  const items = hasMore ? itemsWithExtra.slice(0, opts.limit) : itemsWithExtra
  return { items, total, hasMore }
}

/** Returns true if the article matches any label with auto_summarize=1 and has no summary yet. */
export function getAutoSummarizeCandidates(articleId: number): boolean {
  const alreadySummarized = getDb().prepare(
    'SELECT 1 FROM articles WHERE id = ? AND summary IS NOT NULL AND summary != \'\'',
  ).get(articleId)
  if (alreadySummarized) return false

  // Membership — including exclusive-label claiming — is materialized in
  // article_labels by updateArticleLabels during ingest, which runs before this
  // is called. Querying it keeps auto-summarize consistent with actual label
  // membership (and avoids re-evaluating rule clauses).
  const member = getDb().prepare(
    `SELECT 1 FROM article_labels al
       JOIN labels l ON l.id = al.label_id
       JOIN active_articles a ON a.id = al.article_id
      WHERE al.article_id = ? AND l.auto_summarize = 1
      LIMIT 1`,
  ).get(articleId)
  return !!member
}
