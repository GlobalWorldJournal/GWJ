import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Article } from '@gwj/shared-types';
import { ArticleCard } from '../ArticleCard';
import { LanguageProvider } from '../../lib/i18n';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    slug: 'global-equities-climb-again',
    title: 'Global Equities Climb Again',
    deck: 'Markets shrug off rate worries as earnings beat.',
    kicker: 'Markets',
    category: 'Markets',
    language: 'en',
    author: 'Jane Reporter',
    body: 'Stocks rose.',
    status: 'published',
    featured: 0,
    tags: [],
    seo: {},
    publishedAt: '2026-06-23T12:00:00.000Z',
    createdAt: '2026-06-23T10:00:00.000Z',
    updatedAt: '2026-06-23T11:00:00.000Z',
    ...overrides,
  };
}

function renderCard(article: Article) {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ArticleCard article={article} />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('ArticleCard', () => {
  it('renders the kicker, title, deck and byline from props', () => {
    renderCard(makeArticle());

    expect(screen.getByText('Markets')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Global Equities Climb Again' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Markets shrug off rate worries as earnings beat.'),
    ).toBeInTheDocument();
    expect(screen.getByText('By Jane Reporter')).toBeInTheDocument();
  });

  it('links to the article by slug', () => {
    renderCard(makeArticle());
    const links = screen.getAllByRole('link');
    expect(
      links.some((link) => link.getAttribute('href') === '/article/global-equities-climb-again'),
    ).toBe(true);
  });

  it('omits the kicker when absent', () => {
    renderCard(makeArticle({ kicker: undefined }));
    expect(screen.queryByText('Markets')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Global Equities Climb Again' }),
    ).toBeInTheDocument();
  });

  it('a list thumbnail asks for the smallest rendition through srcset/sizes', () => {
    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <ArticleCard
            variant="list"
            showImage
            article={makeArticle({
              heroImage: {
                url: 'https://cdn.test/h.webp',
                alt: 'A trader',
                width: 1600,
                height: 1067,
                variants: [{ width: 400, url: 'https://cdn.test/h.w400.webp' }],
              },
            })}
          />
        </LanguageProvider>
      </MemoryRouter>,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('srcset')).toBe(
      'https://cdn.test/h.w400.webp 400w, https://cdn.test/h.webp 1600w',
    );
    expect(img?.getAttribute('sizes')).toBe('72px');
  });
});
