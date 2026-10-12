import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../../lib/i18n';
import { RootRouteError, RouteError } from '../RouteError';

function Boom(): never {
  throw new Error('render failed');
}

describe('RouteError', () => {
  it('shows a translated error with a reload action when a page fails', async () => {
    const router = createMemoryRouter(
      [{ path: '/es/x', element: <Boom />, errorElement: <RouteError /> }],
      { initialEntries: ['/es/x'] },
    );
    render(
      <LanguageProvider lang="es">
        <RouterProvider router={router} />
      </LanguageProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal');
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeInTheDocument();
  });

  it('an unmatched URL renders the not-found page in the edition the URL names', async () => {
    const router = createMemoryRouter(
      [{ path: '/', element: null, errorElement: <RootRouteError />, children: [] }],
      { initialEntries: ['/fr/missing'] },
    );
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page introuvable' }),
    ).toBeInTheDocument();
  });
});
