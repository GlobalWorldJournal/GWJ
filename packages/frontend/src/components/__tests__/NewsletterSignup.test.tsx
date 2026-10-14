import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const subscribeToNewsletter =
  vi.fn<(email: string, language: string, website: string) => Promise<{ status: string }>>();

const getNewsletterStatus = vi.fn<() => Promise<{ accepting: boolean }>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getNewsletterStatus: () => getNewsletterStatus(),
    subscribeToNewsletter: (email: string, language: string, website: string) =>
      subscribeToNewsletter(email, language, website),
  };
});

import { LanguageProvider } from '../../lib/i18n';

const { NewsletterSignup } = await import('../NewsletterSignup');

function renderSignup(lang: 'en' | 'es' = 'en') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LanguageProvider lang={lang}>
        <NewsletterSignup />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe('NewsletterSignup', () => {
  it('shows nothing while the backend is not taking sign-ups', async () => {
    getNewsletterStatus.mockResolvedValue({ accepting: false });
    const { container } = renderSignup();
    await waitFor(() => expect(getNewsletterStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('subscribes in the edition language and asks the reader to check their inbox', async () => {
    getNewsletterStatus.mockResolvedValue({ accepting: true });
    subscribeToNewsletter.mockResolvedValue({ status: 'pending_confirmation' });
    renderSignup('es');
    fireEvent.change(await screen.findByLabelText('Correo electrónico'), {
      target: { value: 'lector@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suscribirme' }));
    await waitFor(() =>
      expect(subscribeToNewsletter).toHaveBeenCalledWith('lector@example.com', 'es', ''),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/confirma tu correo/i);
  });

  it('shows an error and keeps the form when the sign-up fails', async () => {
    getNewsletterStatus.mockResolvedValue({ accepting: true });
    subscribeToNewsletter.mockRejectedValue(new Error('down'));
    renderSignup();
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not sign you up/i);
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeEnabled();
  });
});
