import { describe, it, expect, beforeEach } from 'vitest'
import { setupTestDb } from '../__tests__/helpers/testDb.js'
import { getDb, runMigrations } from './connection.js'
import { createLabel, updateLabel, deleteLabel, getLabels, getArticlesByLabel, buildRulesWhere } from './labels.js'
import { insertArticle, updateArticleContent } from './articles.js'

function seedFeed() {
  getDb().prepare("INSERT INTO feeds (id, name, url) VALUES (1, 'Feed', 'https://f.com')").run()
}

let urlSeq = 0
function addArticle(title: string, full_text?: string): number {
  return insertArticle({ feed_id: 1, title, full_text, url: `https://f.com/${urlSeq++}`, published_at: '2026-01-01T00:00:00Z' })
}

function orRule(text: string) {
  return { match_text: text, match_field: 'title' as const, rule_type: 'or' as const }
}

function memberCount(labelId: number): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM article_labels WHERE label_id = ?').get(labelId) as { n: number }).n
}

beforeEach(() => {
  setupTestDb()
  seedFeed()
  urlSeq = 0
})

describe('label membership materialization', () => {
  it('rebuilds membership for existing articles when a label is created', () => {
    addArticle('Apple news')
    addArticle('Banana bread')

    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })

    expect(memberCount(label.id)).toBe(1)
    expect(getArticlesByLabel(label.id, { limit: 20, offset: 0 }).items[0].title).toBe('Apple news')
  })

  it('updates membership incrementally when an article is inserted', () => {
    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })
    addArticle('Apple pie')

    expect(getArticlesByLabel(label.id, { limit: 20, offset: 0 }).total).toBe(1)
  })

  it('updates membership when article content changes', () => {
    const label = createLabel({ name: 'Fruit', rules: [{ ...orRule('apple'), match_field: 'full_text' as const }] })
    const articleId = addArticle('Plain title', 'banana')
    expect(memberCount(label.id)).toBe(0)

    updateArticleContent(articleId, { full_text: 'apple pie' })

    expect(memberCount(label.id)).toBe(1)
  })

  it('treats NULL full text as empty for NOT rules', () => {
    const label = createLabel({
      name: 'Apple without banana',
      rules: [orRule('apple'), { ...orRule('banana'), rule_type: 'not' as const, match_field: 'full_text' as const }],
    })
    addArticle('Apple title')

    expect(getArticlesByLabel(label.id, { limit: 20, offset: 0 }).total).toBe(1)
  })

  it('matches wildcard characters literally', () => {
    const label = createLabel({ name: 'Literal', rules: [orRule('100%_done')] })
    addArticle('100%_done')
    addArticle('100abc_done')

    expect(getArticlesByLabel(label.id, { limit: 20, offset: 0 }).total).toBe(1)
  })

  it('escapes the LIKE pattern and keeps parameters bound', () => {
    const match = buildRulesWhere([orRule(`C:\\100%_done`)], 'a')

    expect(match.clause).toContain('ESCAPE')
    expect(match.clause).not.toContain('C:')
    expect(match.args).toEqual([`C:\\\\100\\%\\_done`])
  })

  it('reflects materialized membership in label counts', () => {
    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })
    const readId = addArticle('Apple tart')
    addArticle('Apple juice')
    getDb().prepare("UPDATE articles SET seen_at = datetime('now') WHERE id = ?").run(readId)

    expect(getLabels().find(l => l.id === label.id)?.article_count).toBe(2)
    expect(getLabels({ unreadOnly: true }).find(l => l.id === label.id)?.article_count).toBe(1)
  })

  it('excludes articles claimed by a higher-priority exclusive label', () => {
    const exclusive = createLabel({ name: 'Breaking', exclusive: true, rules: [orRule('news')] })
    const general = createLabel({ name: 'General', rules: [orRule('news')] })
    addArticle('Tech news')

    expect(getArticlesByLabel(exclusive.id, { limit: 20, offset: 0 }).total).toBe(1)
    expect(getArticlesByLabel(general.id, { limit: 20, offset: 0 }).total).toBe(0)
  })

  it('rebuilds membership when label rules change', () => {
    addArticle('Apple news')
    addArticle('Banana bread')
    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })

    updateLabel(label.id, { rules: [orRule('banana')] })

    expect(getArticlesByLabel(label.id, { limit: 20, offset: 0 }).items[0].title).toBe('Banana bread')
  })

  it('releases the exclusive claim when the exclusive label is deleted', () => {
    const exclusive = createLabel({ name: 'Breaking', exclusive: true, rules: [orRule('news')] })
    const general = createLabel({ name: 'General', rules: [orRule('news')] })
    addArticle('Tech news')
    expect(getArticlesByLabel(general.id, { limit: 20, offset: 0 }).total).toBe(0)

    deleteLabel(exclusive.id)

    expect(getArticlesByLabel(general.id, { limit: 20, offset: 0 }).total).toBe(1)
  })

  it('rebuilds membership when exclusivity or sort order changes', () => {
    const first = createLabel({ name: 'First', rules: [orRule('news')] })
    const second = createLabel({ name: 'Second', rules: [orRule('news')] })
    addArticle('Tech news')

    // Exclusivity is strict priority: the claimant must have a lower sort_order.
    updateLabel(second.id, { exclusive: true, sort_order: -1 })

    expect(getArticlesByLabel(second.id, { limit: 20, offset: 0 }).total).toBe(1)
    expect(getArticlesByLabel(first.id, { limit: 20, offset: 0 }).total).toBe(0)
  })

  it('rolls back label creation if rule insertion fails', () => {
    expect(() => createLabel({
      name: 'Broken',
      rules: [{ match_text: 'x', match_field: 'invalid' as 'title', rule_type: 'or' }],
    })).toThrow()

    expect((getDb().prepare('SELECT COUNT(*) AS n FROM labels').get() as { n: number }).n).toBe(0)
  })
})

describe('label legacy columns', () => {
  it('keeps NOT NULL legacy columns valid for rules-only updates', () => {
    const label = createLabel({ name: 'Fruit', rules: [orRule('apple')] })

    expect(() => updateLabel(label.id, { rules: [{ ...orRule('apple'), rule_type: 'and' as const }] })).not.toThrow()

    const row = getDb().prepare('SELECT match_text, match_field FROM labels WHERE id = ?').get(label.id) as { match_text: string; match_field: string }
    expect(row.match_text).toBe('')
    expect(row.match_field).toBe('both')
  })

  it('does not duplicate legacy rules when migration 0010 is resumed', () => {
    const label = createLabel({ name: 'Legacy', rules: [orRule('legacy')] })
    getDb().prepare('DELETE FROM label_rules WHERE label_id = ?').run(label.id)
    getDb().prepare("DELETE FROM _migrations WHERE name = '0010_label_rules.sql'").run()

    runMigrations()
    runMigrations()

    const count = (getDb().prepare('SELECT COUNT(*) AS n FROM label_rules WHERE label_id = ?').get(label.id) as { n: number }).n
    expect(count).toBe(1)
  })
})
