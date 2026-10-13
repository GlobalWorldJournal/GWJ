import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Language } from '@gwj/shared-types';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../../../lib/i18n';
import { CookieNotice } from '../CookieNotice';
import { COPY as COOKIE_COPY } from '../CookieNotice.copy';
import { PRIVACY_CONTACT_EMAIL, COPY as PRIVACY_COPY } from '../PrivacyNotice.copy';
import { PrivacyNotice } from '../PrivacyNotice';
import { TermsOfUse } from '../TermsOfUse';
import { COPY as TERMS_COPY } from '../TermsOfUse.copy';

function renderIn(ui: ReactElement, lang: Language) {
  return render(
    <MemoryRouter>
      <LanguageProvider lang={lang}>{ui}</LanguageProvider>
    </MemoryRouter>,
  );
}

const TRANSLATED: readonly Language[] = ['es', 'fr'];

describe.each([
  ['PrivacyNotice', PrivacyNotice, PRIVACY_COPY],
  ['TermsOfUse', TermsOfUse, TERMS_COPY],
  ['CookieNotice', CookieNotice, COOKIE_COPY],
] as const)('%s', (_name, Page, copy) => {
  it('renders the English heading', () => {
    renderIn(<Page />, 'en');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.en.title);
  });

  it.each(TRANSLATED)('renders a translated heading in %s', (lang) => {
    renderIn(<Page />, lang);
    const heading = screen.getByRole('heading', { level: 1 }).textContent;
    expect(heading).toBe(copy[lang].title);
    expect(heading).not.toBe(copy.en.title);
  });
});

describe('PrivacyNotice contact link', () => {
  it.each(['en', ...TRANSLATED] as const)('keeps the mailto address in %s', (lang) => {
    renderIn(<PrivacyNotice />, lang);
    expect(screen.getByRole('link', { name: PRIVACY_CONTACT_EMAIL }).getAttribute('href')).toBe(
      `mailto:${PRIVACY_CONTACT_EMAIL}`,
    );
  });
});
