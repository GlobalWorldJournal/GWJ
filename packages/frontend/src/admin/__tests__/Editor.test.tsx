import { describe, it, expect, vi, beforeEach, onTestFinished } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Article, ArticleRevisionSummary } from '@gwj/shared-types';
import { AuthContext, type AuthState } from '../useAuth';

const getAdminArticle = vi.fn<(...args: unknown[]) => Promise<Article>>();
const updateArticle = vi.fn<(...args: unknown[]) => Promise<Article>>();
const publishArticle = vi.fn<(...args: unknown[]) => Promise<Article>>();
const unpublishArticle = vi.fn<(...args: unknown[]) => Promise<Article>>();
const createArticle = vi.fn<(...args: unknown[]) => Promise<Article>>();
const getArticleRevisions = vi.fn<(...args: unknown[]) => Promise<ArticleRevisionSummary[]>>();
const restoreArticleRevision = vi.fn<(...args: unknown[]) => Promise<Article>>();
const addArticleCorrection = vi.fn<(...args: unknown[]) => Promise<Article>>();
const uploadImage = vi.fn<(...args: unknown[]) => Promise<{ url: string; variants: [] }>>();

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return {
    ...actual,
    getAdminArticle: (...args: unknown[]) => getAdminArticle(...args),
    updateArticle: (...args: unknown[]) => updateArticle(...args),
    publishArticle: (...args: unknown[]) => publishArticle(...args),
    unpublishArticle: (...args: unknown[]) => unpublishArticle(...args),
    createArticle: (...args: unknown[]) => createArticle(...args),
    getArticleRevisions: (...args: unknown[]) => getArticleRevisions(...args),
    restoreArticleRevision: (...args: unknown[]) => restoreArticleRevision(...args),
    addArticleCorrection: (...args: unknown[]) => addArticleCorrection(...args),
    uploadImage: (...args: unknown[]) => uploadImage(...args),
  };
});

const { Editor } = await import('../Editor');

const ARTICLE_ID = 'a'.repeat(24);

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: ARTICLE_ID,
    slug: 'original-headline',
    title: 'Original headline',
    category: 'World',
    language: 'en',
    author: 'Sofia Marchetti',
    body: 'The story.',
    status: 'published',
    featured: 3,
    tags: ['nato'],
    seo: { metaTitle: 'Agent title', metaDescription: 'Agent description' },
    source: { name: 'Wire', articleUrl: 'https://example.com/original' },
    publishedAt: '2026-06-23T10:00:00.000Z',
    firstPublishedAt: '2026-06-23T10:00:00.000Z',
    createdAt: '2026-06-23T09:00:00.000Z',
    updatedAt: '2026-06-23T10:00:00.000Z',
    ...overrides,
  };
}

const authValue: AuthState = {
  token: 'test-token',
  user: { username: 'nate', role: 'admin' },
  isAuthenticated: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

function renderEditor(path = `/admin/articles/${ARTICLE_ID}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // A data router, as in the app: the editor guards unsaved work with useBlocker.
  const router = createMemoryRouter(
    [
      { path: '/admin/articles/:id', element: <Editor /> },
      { path: '/admin', element: <p>Dashboard</p> },
    ],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={authValue}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getAdminArticle.mockReset();
  updateArticle.mockReset();
  publishArticle.mockReset();
  unpublishArticle.mockReset();
  createArticle.mockReset();
  restoreArticleRevision.mockReset();
  addArticleCorrection.mockReset();
  getArticleRevisions.mockReset();
  getArticleRevisions.mockResolvedValue([]);
});

describe('Editor', () => {
  it('loads the article by id (not from a first-page listing)', async () => {
    getAdminArticle.mockResolvedValueOnce(article());
    renderEditor();
    await waitFor(() => expect(screen.getByDisplayValue('Original headline')).toBeInTheDocument());
    expect(getAdminArticle).toHaveBeenCalledWith('test-token', ARTICLE_ID, expect.anything());
    expect(screen.getByText('https://example.com/original')).toBeInTheDocument();
  });

  it('updating a live story never sends a status and keeps its SEO fields', async () => {
    getAdminArticle.mockResolvedValueOnce(article());
    updateArticle.mockImplementation(async () => article({ title: 'Sharper headline' }));
    renderEditor();
    await waitFor(() => expect(screen.getByDisplayValue('Original headline')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Original headline'), {
      target: { value: 'Sharper headline' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(updateArticle).toHaveBeenCalledTimes(1));
    const [, id, patch] = updateArticle.mock.calls[0] ?? [];
    expect(id).toBe(ARTICLE_ID);
    expect(patch).not.toHaveProperty('status');
    expect(patch).toMatchObject({
      title: 'Sharper headline',
      seo: { metaTitle: 'Agent title', metaDescription: 'Agent description', ogImage: '' },
      slug: undefined,
    });
    expect(publishArticle).not.toHaveBeenCalled();
  });

  it('a draft offers Publish; a live story offers Unpublish', async () => {
    getAdminArticle.mockResolvedValueOnce(
      article({ status: 'draft', publishedAt: null, firstPublishedAt: null }),
    );
    renderEditor();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unpublish' })).not.toBeInTheDocument();
  });
});

describe('Editor workflow', () => {
  it('picks the byline from the writer roster', async () => {
    getAdminArticle.mockResolvedValueOnce(article());
    renderEditor();
    const select = await screen.findByDisplayValue('Sofia Marchetti — World, Politics');
    expect(select.tagName).toBe('SELECT');
  });

  it('sends a draft\u2019s schedule as an ISO instant', async () => {
    getAdminArticle.mockResolvedValueOnce(
      article({ status: 'draft', publishedAt: null, firstPublishedAt: null }),
    );
    updateArticle.mockImplementation(async () => article({ status: 'draft', publishedAt: null }));
    const { container } = renderEditor();
    await screen.findByDisplayValue('Original headline');
    const when = container.querySelector('input[type="datetime-local"]');
    if (!when) throw new Error('schedule field missing');
    fireEvent.change(when, { target: { value: '2026-10-11T09:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(updateArticle).toHaveBeenCalledTimes(1));
    const [, , patch] = updateArticle.mock.calls[0] ?? [];
    expect(patch).toMatchObject({ scheduledAt: new Date('2026-10-11T09:30').toISOString() });
  });

  it('restores a revision from the history and shows the restored content', async () => {
    // Restoring refreshes the admin queries, so the article is fetched again.
    getAdminArticle.mockResolvedValue(article());
    getArticleRevisions.mockResolvedValue([
      {
        id: 9,
        createdAt: '2026-06-23T11:00:00.000Z',
        actor: 'nate',
        title: 'Earlier headline',
        status: 'published',
      },
    ]);
    restoreArticleRevision.mockResolvedValueOnce(article({ title: 'Earlier headline' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(restoreArticleRevision).toHaveBeenCalledWith('test-token', ARTICLE_ID, 9),
    );
    expect(await screen.findByDisplayValue('Earlier headline')).toBeInTheDocument();
  });

  it('adds a public correction', async () => {
    getAdminArticle.mockResolvedValueOnce(article());
    addArticleCorrection.mockResolvedValueOnce(
      article({ corrections: [{ at: '2026-06-24T10:00:00.000Z', text: 'Fixed the date.' }] }),
    );
    renderEditor();
    fireEvent.change(await screen.findByPlaceholderText(/An earlier version/), {
      target: { value: 'Fixed the date.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add correction' }));
    await waitFor(() =>
      expect(addArticleCorrection).toHaveBeenCalledWith(
        'test-token',
        ARTICLE_ID,
        'Fixed the date.',
      ),
    );
    expect(await screen.findByText('Fixed the date.')).toBeInTheDocument();
  });

  it('a new edition started from a story is created linked to it, in that language', async () => {
    createArticle.mockImplementation(async () => article({ id: 'b'.repeat(24), status: 'draft' }));
    renderEditor(`/admin/articles/new?translationOf=${ARTICLE_ID}&language=es`);
    expect(screen.getByDisplayValue('Español')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(createArticle).toHaveBeenCalledTimes(1));
    expect(createArticle.mock.calls[0]?.[1]).toMatchObject({
      translationOf: ARTICLE_ID,
      language: 'es',
    });
  });
});

describe('Editor publishing rules', () => {
  it('will not publish a story whose hero image has no alt text', async () => {
    getAdminArticle.mockResolvedValueOnce(
      article({
        status: 'draft',
        publishedAt: null,
        firstPublishedAt: null,
        heroImage: { url: 'https://cdn.example.test/a.webp', alt: '' },
      }),
    );
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(
      await screen.findByText('Describe the hero image (alt text) before publishing.'),
    ).toBeInTheDocument();
    expect(updateArticle).not.toHaveBeenCalled();
    expect(publishArticle).not.toHaveBeenCalled();
  });

  it('asks before leaving with unsaved changes, and stops guarding once they are saved', async () => {
    // Saving refetches the article: answer every load.
    getAdminArticle.mockResolvedValue(article());
    updateArticle.mockImplementation(async () => article({ title: 'Edited' }));
    const listeners = { added: 0, removed: 0 };
    const added = vi.spyOn(window, 'addEventListener').mockImplementation((type) => {
      if (type === 'beforeunload') listeners.added += 1;
    });
    const removed = vi.spyOn(window, 'removeEventListener').mockImplementation((type) => {
      if (type === 'beforeunload') listeners.removed += 1;
    });
    onTestFinished(() => {
      added.mockRestore();
      removed.mockRestore();
    });
    renderEditor();
    const title = await screen.findByDisplayValue('Original headline');
    expect(listeners.added).toBe(0);

    fireEvent.change(title, { target: { value: 'Edited' } });
    expect(listeners.added).toBe(1); // closing the tab now asks first
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Unsaved changes' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Edited')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(updateArticle).toHaveBeenCalledTimes(1));
    // Saved: nothing left to lose, so the guard is released.
    await waitFor(() => expect(listeners.removed).toBe(1));
  });

  it('formats the selection and places an uploaded image at the cursor', async () => {
    getAdminArticle.mockResolvedValueOnce(article({ body: 'Hello world' }));
    uploadImage.mockResolvedValue({ url: 'https://cdn.test/inline.webp', variants: [] });
    renderEditor();
    const body = await screen.findByLabelText<HTMLTextAreaElement>('Article body (Markdown)');

    body.setSelectionRange(6, 11);
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    expect(body.value).toBe('Hello **world**');

    body.setSelectionRange(body.value.length, body.value.length);
    const file = new File(['x'], 'inline.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Image'), { target: { files: [file] } });
    await waitFor(() =>
      expect(body.value).toBe(
        'Hello **world**\n\n![Describe the image](https://cdn.test/inline.webp)\n\n',
      ),
    );
    expect(uploadImage).toHaveBeenCalledWith('test-token', file);
  });
});
