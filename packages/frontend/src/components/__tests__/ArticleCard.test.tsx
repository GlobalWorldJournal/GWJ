import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Article } from '@gwj/shared-types'
import { ArticleCard } from '../ArticleCard'

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    slug: 'global-equities-climb-again',
    title: 'Global Equities Climb Again',
    deck: 'Markets shrug off rate worries as earnings beat.',
    kicker: 'Markets',
    category: 'Markets',
    author: 'Jane Reporter',
    body: [{ type: 'paragraph', text: 'Stocks rose.' }],
    status: 'published',
    featured: 0,
    tags: [],
    seo: {},
    publishedAt: '2026-06-23T12:00:00.000Z',
    createdAt: '2026-06-23T10:00:00.000Z',
    updatedAt: '2026-06-23T11:00:00.000Z',
    ...overrides,
  }
}

function renderCard(article: Article) {
  return render(
    <MemoryRouter>
      <ArticleCard article={article} />
    </MemoryRouter>,
  )
}

describe('ArticleCard', () => {
  it('renders the kicker, title, deck and byline from props', () => {
    renderCard(makeArticle())

    expect(screen.getByText('Markets')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Global Equities Climb Again' })).toBeInTheDocument()
    expect(screen.getByText('Markets shrug off rate worries as earnings beat.')).toBeInTheDocument()
    expect(screen.getByText('By Jane Reporter')).toBeInTheDocument()
  })

  it('links to the article by slug', () => {
    renderCard(makeArticle())
    const links = screen.getAllByRole('link')
    expect(links.some((link) => link.getAttribute('href') === '/article/global-equities-climb-again')).toBe(
      true,
    )
  })

  it('omits the kicker when absent', () => {
    renderCard(makeArticle({ kicker: undefined }))
    expect(screen.queryByText('Markets')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Global Equities Climb Again' })).toBeInTheDocument()
  })
})
