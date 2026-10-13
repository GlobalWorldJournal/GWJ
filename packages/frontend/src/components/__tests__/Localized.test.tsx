import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Language } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';
import { NotFound } from '../../pages/NotFound';
import { Byline } from '../Byline';
import { Footer } from '../Footer';
import { SectionNav } from '../SectionNav';
import { WhatsNews } from '../WhatsNews';

afterEach(() => {
  cleanup();
  document.title = '';
});

function renderIn(lang: Language, children: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <LanguageProvider lang={lang}>{children}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('reader chrome that used to be English-only', () => {
  it('the not-found page translates its kicker and sets the tab title and description', () => {
    renderIn('fr', <NotFound />);
    expect(screen.getByText('Erreur 404')).toBeTruthy();
    expect(document.title).toBe('Page introuvable — The Global World Journal');
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'The Global World Journal — l’actualité mondiale indépendante.',
    );
  });

  it('the What’s News rail and footer copyright follow the edition', () => {
    const article = {
      id: 'a'.repeat(24),
      slug: 'x',
      title: 'Titre',
    } as unknown as Parameters<typeof WhatsNews>[0]['articles'][number];
    renderIn('es', <WhatsNews articles={[article]} />);
    expect(screen.getByRole('heading', { name: 'Lo esencial' })).toBeTruthy();
    cleanup();
    renderIn('fr', <Footer />);
    expect(screen.getByText(/Tous droits réservés\./)).toBeTruthy();
  });

  it('the section nav names the home link, the language picker and the mega-menu topics', () => {
    renderIn('es', <SectionNav />);
    expect(screen.getByRole('link', { name: 'The Global World Journal — inicio' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toBeTruthy();
    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Tecnología' }).closest('li') as Element);
    expect(screen.getByRole('link', { name: 'Inteligencia artificial' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Artificial Intelligence' })).toBeNull();
  });

  it('a byline gives the writer’s job title in the edition language', () => {
    renderIn('fr', <Byline author="Eleanor Vance" showPortrait />);
    expect(screen.getByText(/Correspondant senior marchés/)).toBeTruthy();
  });
});
