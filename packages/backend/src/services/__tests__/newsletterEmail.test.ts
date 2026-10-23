import { describe, expect, it } from 'bun:test';
import type { Article } from '@gwj/shared-types';
import { renderConfirmationEmail, renderDigestEmail } from '../newsletterEmail';

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    slug: 'markets-rally',
    title: 'Markets <Rally> & More',
    deck: 'Stocks "surged".',
    category: 'Markets',
    language: 'en',
    author: 'Eleanor Vance',
    body: 'Body',
    heroImage: { url: 'https://cdn.example.test/hero.webp', alt: '' },
    ...overrides,
  } as Article;
}

describe('confirmation email', () => {
  it('carries the link in both bodies, in the reader’s language', () => {
    const mail = renderConfirmationEmail(
      'es',
      'https://x.test/es/newsletter/confirm?token=t',
      'a@b.co',
    );
    expect(mail.to).toBe('a@b.co');
    expect(mail.subject).toBe('Confirma tu suscripción a The Global World Journal');
    expect(mail.html).toContain('href="https://x.test/es/newsletter/confirm?token=t"');
    expect(mail.text).toContain('https://x.test/es/newsletter/confirm?token=t');
    expect(mail.html).toContain('lang="es"');
  });
});

describe('digest email', () => {
  const base = {
    language: 'fr' as const,
    domain: 'globalworldjournal.com',
    to: 'r@x.co',
    unsubscribePageUrl: 'https://globalworldjournal.com/fr/newsletter/unsubscribe?token=T',
    unsubscribeApiUrl: 'https://api.globalworldjournal.com/api/newsletter/unsubscribe?token=T',
  };

  it('leads with the top story, links each article in its edition and escapes content', () => {
    const mail = renderDigestEmail({
      ...base,
      articles: [article(), article({ slug: 'two', title: 'Two' })],
    });
    expect(mail.subject).toBe('Le point du matin: Markets <Rally> & More');
    expect(mail.html).toContain('Markets &lt;Rally&gt; &amp; More');
    expect(mail.html).not.toContain('<Rally>');
    expect(mail.html).toContain('href="https://globalworldjournal.com/fr/article/markets-rally"');
    expect(mail.html).toContain('href="https://globalworldjournal.com/fr/article/two"');
    expect(mail.html).toContain('alt="Markets &lt;Rally&gt; &amp; More"');
    expect(mail.text).toContain('https://globalworldjournal.com/fr/article/two');
  });

  it('offers RFC 8058 one-click unsubscribe and a visible unsubscribe link', () => {
    const mail = renderDigestEmail({ ...base, articles: [article()] });
    expect(mail.headers).toEqual({
      'List-Unsubscribe': `<${base.unsubscribeApiUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(mail.html).toContain(`href="${base.unsubscribePageUrl}"`);
    expect(mail.text).toContain(base.unsubscribePageUrl);
  });
});
