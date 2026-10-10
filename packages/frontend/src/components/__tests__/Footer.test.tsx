import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MENTION_PROFILE_URL, TELEGRAM_CHANNEL_URL } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';
import { Footer } from '../Footer';

function renderFooter(lang: 'en' | 'fr') {
  return render(
    <MemoryRouter>
      <LanguageProvider lang={lang}>
        <Footer />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('Footer social links', () => {
  it('links the Telegram channel and the Mention profile as named icons in a new tab', () => {
    renderFooter('en');
    const telegram = screen.getByRole('link', { name: 'The Global World Journal on Telegram' });
    const mention = screen.getByRole('link', { name: 'The Global World Journal on Mention' });
    expect(telegram.getAttribute('href')).toBe(TELEGRAM_CHANNEL_URL);
    expect(mention.getAttribute('href')).toBe('https://mention.earth/@gwj');
    expect(mention.getAttribute('href')).toBe(MENTION_PROFILE_URL);
    for (const link of [telegram, mention]) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('names the icons in the edition language', () => {
    renderFooter('fr');
    expect(screen.getByRole('link', { name: 'The Global World Journal sur Mention' })).toBeTruthy();
  });
});
