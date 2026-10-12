import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminApp } from '../AdminApp';

describe('AdminApp', () => {
  it('an unknown admin URL is the not-found page', async () => {
    const router = createMemoryRouter([{ path: '/admin/*', element: <AdminApp /> }], {
      initialEntries: ['/admin/no-such-page'],
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });
});
