import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LocaleContext } from '../../lib/i18n'
import { ArticleCard } from './article-card'
import type { ArticleListItem } from '../../../shared/types'

function makeArticle(overrides: Partial<ArticleListItem> = {}): ArticleListItem {
  return {
    id: 1,
    feed_id: 1,
    feed_name: 'Example Feed',
    feed_icon_url: null,
    article_kind: null,
    title: 'Example Article',
    url: 'https://example.com/posts/1',
    published_at: '2026-03-30T00:00:00.000Z',
    lang: 'en',
    summary: null,
    excerpt: 'Example excerpt',
    og_image: null,
    has_video: false,
    seen_at: null,
    read_at: null,
    bookmarked_at: null,
    liked_at: null,
    ...overrides,
  }
}

function renderArticleCard(article: ArticleListItem) {
  return render(
    <MemoryRouter>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: () => {} }}>
        <ArticleCard
          article={article}
          layout="list"
          dateMode="relative"
          indicatorStyle="dot"
          showUnreadIndicator
          showThumbnails={false}
        />
      </LocaleContext.Provider>
    </MemoryRouter>,
  )
}

describe('ArticleCard icon rendering', () => {
  it('uses feed_icon_url when available', () => {
    const { container } = renderArticleCard(makeArticle({
      feed_icon_url: 'https://cdn.example.com/feed-icon.png',
    }))

    const icon = container.querySelector('img')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('src')).toBe('https://cdn.example.com/feed-icon.png')
  })

  it('falls back to Google favicon when feed_icon_url is missing', () => {
    const { container } = renderArticleCard(makeArticle())

    const icon = container.querySelector('img')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('src')).toContain('https://www.google.com/s2/favicons?sz=16&domain=example.com')
  })

  it('renders article kind badge when present', () => {
    const { getByText } = renderArticleCard(makeArticle({
      article_kind: 'repost',
    }))

    expect(getByText('Repost')).toBeTruthy()
  })

  it('renders fallback title for video-only posts', () => {
    const { getByText } = renderArticleCard(makeArticle({
      title: '',
      has_video: true,
    }))

    expect(getByText('Video post')).toBeTruthy()
  })
})
