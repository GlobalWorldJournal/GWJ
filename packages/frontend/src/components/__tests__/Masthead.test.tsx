import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Language } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';
import { Masthead } from '../Masthead';

function renderMasthead(lang: Language) {
  return render(
    <MemoryRouter>
      <LanguageProvider lang={lang}>
        <Masthead isFrontPage />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('Masthead edition label', () => {
  it('carries no edition label on the default (English) edition', () => {
    renderMasthead('en');
    expect(screen.queryByText('ESPAÑOL')).toBeNull();
    expect(screen.queryByText('FRANÇAIS')).toBeNull();
  });

  it("labels the Spanish edition with the language's own native name", () => {
    renderMasthead('es');
    expect(screen.getByText('ESPAÑOL')).toBeTruthy();
  });

  it("labels the French edition with the language's own native name", () => {
    renderMasthead('fr');
    expect(screen.getByText('FRANÇAIS')).toBeTruthy();
  });
});
