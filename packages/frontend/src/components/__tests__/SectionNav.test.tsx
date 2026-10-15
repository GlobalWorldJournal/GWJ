import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '../../lib/i18n';
const getNewsletterStatus = vi.fn<() => Promise<{ accepting: boolean }>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, getNewsletterStatus: () => getNewsletterStatus() };
});

const { SectionNav } = await import('../SectionNav');

beforeEach(() => {
  getNewsletterStatus.mockResolvedValue({ accepting: false });
});

function renderNav(path: string, lang: 'en' | 'es') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider lang={lang}>
          <SectionNav />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SectionNav search', () => {
  it('is an icon link named for screen readers in the edition language, with no visible text', () => {
    renderNav('/', 'en');
    const link = screen.getByRole('link', { name: 'Search' });
    expect(link.getAttribute('href')).toBe('/search');
    expect(link.textContent).toBe('');
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('localizes the name and the target in another edition', () => {
    renderNav('/es', 'es');
    const link = screen.getByRole('link', { name: 'Buscar' });
    expect(link.getAttribute('href')).toBe('/es/search');
  });
});

describe('SectionNav newsletter link', () => {
  it('points to the newsletter page, in the edition language, once sign-ups are open', async () => {
    getNewsletterStatus.mockResolvedValue({ accepting: true });
    renderNav('/es', 'es');
    const links = await screen.findAllByRole('link', { name: 'Recibe el boletín' });
    expect(links[0]?.getAttribute('href')).toBe('/es/newsletters');
  });

  it('is absent while sign-ups are closed', async () => {
    renderNav('/', 'en');
    await vi.waitFor(() => expect(getNewsletterStatus).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Get the newsletter' })).toBeNull();
  });
});
