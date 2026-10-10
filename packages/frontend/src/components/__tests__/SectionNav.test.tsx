import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../../lib/i18n';
import { SectionNav } from '../SectionNav';

function renderNav(path: string, lang: 'en' | 'es') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider lang={lang}>
        <SectionNav />
      </LanguageProvider>
    </MemoryRouter>,
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
