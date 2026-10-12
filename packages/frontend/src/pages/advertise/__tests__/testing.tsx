import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Language } from '@gwj/shared-types';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../../../lib/i18n';

export function renderPage(ui: ReactElement, lang: Language = 'en', path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider lang={lang}>{ui}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
