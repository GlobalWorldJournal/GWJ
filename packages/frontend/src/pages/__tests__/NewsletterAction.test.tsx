import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const confirmNewsletter = vi.fn<(token: string) => Promise<{ status: string; language: string }>>();
const unsubscribeFromNewsletter =
  vi.fn<(token: string) => Promise<{ status: string; language: string }>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    confirmNewsletter: (token: string) => confirmNewsletter(token),
    unsubscribeFromNewsletter: (token: string) => unsubscribeFromNewsletter(token),
  };
});

import { LanguageProvider } from '../../lib/i18n';

const { NewsletterConfirm, NewsletterUnsubscribe } = await import('../NewsletterAction');

function renderAt(url: string, element: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <LanguageProvider lang="en">{element}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NewsletterConfirm', () => {
  it('confirms with the link token and says the reader is subscribed', async () => {
    confirmNewsletter.mockResolvedValue({ status: 'confirmed', language: 'en' });
    renderAt('/newsletter/confirm?token=abc.def', <NewsletterConfirm />);
    expect(await screen.findByText('You’re subscribed')).toBeInTheDocument();
    expect(confirmNewsletter).toHaveBeenCalledWith('abc.def');
  });

  it('explains an invalid link without calling the API when there is no token', () => {
    confirmNewsletter.mockClear();
    renderAt('/newsletter/confirm', <NewsletterConfirm />);
    expect(screen.getByText('This link is not valid')).toBeInTheDocument();
    expect(confirmNewsletter).not.toHaveBeenCalled();
  });
});

describe('NewsletterUnsubscribe', () => {
  it('unsubscribes only after the reader clicks, never on load', async () => {
    unsubscribeFromNewsletter.mockResolvedValue({ status: 'unsubscribed', language: 'en' });
    renderAt('/newsletter/unsubscribe?token=abc.def', <NewsletterUnsubscribe />);
    expect(unsubscribeFromNewsletter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe me' }));
    expect(await screen.findByText('You’ve been unsubscribed')).toBeInTheDocument();
    expect(unsubscribeFromNewsletter).toHaveBeenCalledWith('abc.def');
  });
});
