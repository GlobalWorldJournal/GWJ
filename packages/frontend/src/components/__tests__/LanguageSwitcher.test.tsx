import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PublicArticle } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';
import { LanguageSwitcher } from '../LanguageSwitcher';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const SPANISH: PublicArticle = {
  id: 'a'.repeat(24),
  slug: 'hola-mundo',
  title: 'Hola Mundo',
  category: 'World',
  language: 'es',
  author: 'Ana',
  body: 'Texto.',
  status: 'published',
  featured: 0,
  tags: [],
  seo: {},
  publishedAt: '2026-06-23T00:00:00.000Z',
  createdAt: '2026-06-23T00:00:00.000Z',
  updatedAt: '2026-06-23T00:00:00.000Z',
  translations: [
    { id: 'b'.repeat(24), language: 'en', slug: 'hello-world', status: 'published' },
    { id: 'c'.repeat(24), language: 'fr', slug: 'bonjour', status: 'draft' },
  ],
};

function renderOnSpanishArticle() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // The article page has already loaded the story: the switcher reads the cache.
  client.setQueryData(['article', 'hola-mundo'], SPANISH);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/es/article/hola-mundo']}>
        <LanguageProvider lang="es">
          <LanguageSwitcher />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LanguageSwitcher on an article', () => {
  it('goes to the same story in the edition that has it', () => {
    renderOnSpanishArticle();
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'en' },
    });
    expect(screen.getByTestId('where').textContent).toBe('/article/hello-world');
  });

  it('goes to the edition front page when the story has no published edition there', () => {
    renderOnSpanishArticle();
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'fr' },
    });
    expect(screen.getByTestId('where').textContent).toBe('/fr');
  });
});
