import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const submitTakedownRequest = vi.fn<(input: unknown) => Promise<{ id: string; status: string }>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, submitTakedownRequest: (input: unknown) => submitTakedownRequest(input) };
});

import { LanguageProvider } from '../../lib/i18n';

const { ReportContent } = await import('../static/ReportContent');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LanguageProvider lang="en">
        <ReportContent />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/your name/i), {
    target: { value: 'Jamie Rights-Holder' },
  });
  fireEvent.change(screen.getByLabelText(/your email/i), {
    target: { value: 'jamie@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/tell us what happened/i), {
    target: { value: 'That photograph is mine and was used without a license.' },
  });
  fireEvent.click(screen.getByText(/state, in good faith/i));
}

describe('ReportContent', () => {
  it('disables submit until the good-faith checkbox is checked', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /submit report/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Jamie' } });
    fireEvent.change(screen.getByLabelText(/your email/i), {
      target: { value: 'jamie@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/tell us what happened/i), {
      target: { value: 'My photo.' },
    });
    expect(screen.getByRole('button', { name: /submit report/i })).toBeDisabled();
  });

  it('submits the form and shows the confirmation with the reference id', async () => {
    submitTakedownRequest.mockResolvedValueOnce({ id: 'req-123', status: 'pending' });
    renderPage();
    fillRequiredFields();
    expect(screen.getByRole('button', { name: /submit report/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => expect(screen.getByText(/request received/i)).toBeInTheDocument());
    expect(screen.getByText('req-123')).toBeInTheDocument();
    expect(submitTakedownRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterName: 'Jamie Rights-Holder',
        requesterEmail: 'jamie@example.com',
        claimType: 'copyright',
        goodFaithAssertion: true,
      }),
    );
  });

  it('shows an error message if the submission fails', async () => {
    submitTakedownRequest.mockRejectedValueOnce(new Error('Validation failed'));
    renderPage();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }));
    await waitFor(() => expect(screen.getByText('Validation failed')).toBeInTheDocument());
  });
});
