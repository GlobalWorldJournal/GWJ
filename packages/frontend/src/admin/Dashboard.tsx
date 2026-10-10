import { Link, useSearchParams } from 'react-router-dom';
import type { z } from 'zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArticleStatusSchema,
  CATEGORIES,
  CategorySchema,
  LanguageSchema,
  SUPPORTED_LANGUAGES,
  type Article,
} from '@gwj/shared-types';
import {
  beginMentionAuthorization,
  getAdminArticles,
  publishArticle,
  unpublishArticle,
  deleteArticle,
  type AdminArticlesQuery,
} from '../lib/api';
import { useAuth } from './useAuth';
import { StatusMessage } from '../components/StatusMessage';

const PAGE_SIZE = 25;

/**
 * The dashboard's filters live in the URL (`?status=draft&language=es&q=…&page=2`),
 * so a filtered view survives a reload and can be shared. Unknown values are
 * ignored rather than sent to the API.
 */
function readFilters(params: URLSearchParams): AdminArticlesQuery {
  const read = <T,>(schema: z.ZodType<T>, key: string): T | undefined => {
    const result = schema.safeParse(params.get(key));
    return result.success ? result.data : undefined;
  };
  const page = Number(params.get('page'));
  return {
    status: read(ArticleStatusSchema, 'status'),
    language: read(LanguageSchema, 'language'),
    category: read(CategorySchema, 'category'),
    q: params.get('q')?.trim() || undefined,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

const SELECT_CLASS =
  'label border border-rule bg-paper px-2 py-1.5 text-[0.6875rem] text-ink focus-visible:outline-2 focus-visible:outline-accent';

export function Dashboard() {
  const { token, user, signOut } = useAuth();
  // Deleting stories and running the newsroom are admin work (the API enforces it).
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();

  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);

  const { data, isPending, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['admin', 'articles', filters],
    queryFn: ({ signal }) => {
      if (!token) {
        throw new Error('Not authenticated');
      }
      return getAdminArticles(token, { ...filters, sort: 'latest', limit: PAGE_SIZE }, signal);
    },
    enabled: Boolean(token),
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  /** Change one filter (any change but paging goes back to page 1). */
  function setFilter(key: string, value: string | undefined) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] });
  }

  const publish = useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new Error('Not authenticated');
      return publishArticle(token, id);
    },
    onSuccess: invalidate,
  });

  const unpublish = useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new Error('Not authenticated');
      return unpublishArticle(token, id);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new Error('Not authenticated');
      return deleteArticle(token, id);
    },
    onSuccess: invalidate,
  });

  // One-time (or, after a genuine revocation, occasional) setup: opens
  // Mention's own approval page in a new tab. Nothing is connected until
  // that's approved there, signed in as @gwj — this call alone only starts
  // the request.
  const connectMention = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Not authenticated');
      return beginMentionAuthorization(token);
    },
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between border-b-3 border-ink pb-4">
        <div>
          <p className="kicker">Newsroom</p>
          <h1 className="headline text-3xl text-ink">Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="label text-[0.6875rem] text-muted">{user?.username}</span>
          <Link
            to="/admin/takedown-requests"
            className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
          >
            Takedown Requests
          </Link>
          {isAdmin ? (
            <>
              <Link
                to="/admin/ad-campaigns"
                className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
              >
                Advertising
              </Link>
              <Link
                to="/admin/users"
                className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
              >
                People
              </Link>
              <Link
                to="/admin/tokens"
                className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
              >
                Agent Tokens
              </Link>
            </>
          ) : null}
          <Link
            to="/admin/account"
            className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
          >
            Account
          </Link>
          <Link
            to="/admin/articles/new"
            className="label bg-ink px-4 py-2 text-[0.75rem] text-paper transition-colors hover:bg-accent"
          >
            New Article
          </Link>
          {isAdmin ? (
            <button
              type="button"
              disabled={connectMention.isPending}
              onClick={() => connectMention.mutate()}
              className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
            >
              Connect Mention
            </button>
          ) : null}
          <button
            type="button"
            onClick={signOut}
            className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
          >
            Sign Out
          </button>
        </div>
      </header>

      {connectMention.isError ? (
        <p className="mb-4 text-[0.85rem] text-accent">
          {connectMention.error instanceof Error
            ? connectMention.error.message
            : 'Could not start the Mention authorization.'}
        </p>
      ) : null}

      <search className="mb-6 block">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const q = new FormData(event.currentTarget).get('q');
            setFilter('q', typeof q === 'string' ? q.trim() : undefined);
          }}
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1">
            <span className="label text-[0.625rem] text-muted">Search</span>
            <input
              name="q"
              type="search"
              defaultValue={filters.q ?? ''}
              key={filters.q ?? ''}
              placeholder="Headline, deck or body"
              className="border border-rule bg-paper px-2 py-1.5 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[0.625rem] text-muted">Status</span>
            <select
              className={SELECT_CLASS}
              value={filters.status ?? ''}
              onChange={(event) => setFilter('status', event.target.value)}
            >
              <option value="">All</option>
              {ArticleStatusSchema.options.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[0.625rem] text-muted">Edition</span>
            <select
              className={SELECT_CLASS}
              value={filters.language ?? ''}
              onChange={(event) => setFilter('language', event.target.value)}
            >
              <option value="">All</option>
              {SUPPORTED_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[0.625rem] text-muted">Section</span>
            <select
              className={SELECT_CLASS}
              value={filters.category ?? ''}
              onChange={(event) => setFilter('category', event.target.value)}
            >
              <option value="">All</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="label bg-ink px-4 py-2 text-[0.6875rem] text-paper transition-colors hover:bg-accent"
          >
            Search
          </button>
        </form>
      </search>

      {isPending ? (
        <StatusMessage title="Loading articles&hellip;" />
      ) : isError ? (
        <StatusMessage
          title="Could not load articles."
          detail={error instanceof Error ? error.message : undefined}
        />
      ) : data.data.length === 0 ? (
        <StatusMessage title="No articles match." detail="Change the filters or create a story." />
      ) : (
        <>
          <p className="label mb-2 text-[0.625rem] text-muted" aria-live="polite">
            {data.pagination.total} {data.pagination.total === 1 ? 'article' : 'articles'}
          </p>
          <ul
            className={`flex flex-col divide-y divide-rule border-t border-rule ${isPlaceholderData ? 'opacity-60' : ''}`}
            aria-busy={isPlaceholderData}
          >
            {data.data.map((article) => (
              <ArticleRow
                key={article.id}
                article={article}
                onPublish={() => publish.mutate(article.id)}
                onUnpublish={() => unpublish.mutate(article.id)}
                onDelete={
                  isAdmin
                    ? () => {
                        if (window.confirm(`Delete “${article.title}”? This cannot be undone.`)) {
                          remove.mutate(article.id);
                        }
                      }
                    : undefined
                }
                busy={publish.isPending || unpublish.isPending || remove.isPending}
              />
            ))}
          </ul>
          {data.pagination.totalPages > 1 ? (
            <nav
              aria-label="Pages"
              className="mt-6 flex items-center justify-between border-t border-rule pt-4"
            >
              <button
                type="button"
                disabled={data.pagination.page <= 1}
                onClick={() => setFilter('page', String(data.pagination.page - 1))}
                className="label text-[0.6875rem] text-ink transition-colors hover:text-accent disabled:opacity-40"
              >
                ← Newer
              </button>
              <span className="label text-[0.625rem] text-muted">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => setFilter('page', String(data.pagination.page + 1))}
                className="label text-[0.6875rem] text-ink transition-colors hover:text-accent disabled:opacity-40"
              >
                Older →
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

interface ArticleRowProps {
  article: Article;
  onPublish: () => void;
  onUnpublish: () => void;
  /** Absent for people who may not delete (editors). */
  onDelete?: () => void;
  busy: boolean;
}

function ArticleRow({ article, onPublish, onUnpublish, onDelete, busy }: ArticleRowProps) {
  const isPublished = article.status === 'published';
  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`label text-[0.625rem] ${isPublished ? 'text-accent' : 'text-muted'}`}>
            {article.status}
          </span>
          <span className="label text-[0.625rem] text-muted">{article.category}</span>
          <span className="label text-[0.625rem] text-muted">{article.language}</span>
          {article.scheduledAt ? (
            <span className="label text-[0.625rem] text-ink-soft">
              Scheduled {new Date(article.scheduledAt).toLocaleString()}
            </span>
          ) : null}
        </div>
        <p className="headline truncate text-lg text-ink">{article.title}</p>
        <p className="label text-[0.625rem] text-muted">By {article.author}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link
          to={`/admin/articles/${article.id}`}
          className="label text-[0.6875rem] text-ink transition-colors hover:text-accent"
        >
          Edit
        </Link>
        {isPublished ? (
          <button
            type="button"
            disabled={busy}
            onClick={onUnpublish}
            className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
          >
            Unpublish
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={onPublish}
            className="label text-[0.6875rem] text-accent transition-colors hover:text-ink disabled:opacity-50"
          >
            Publish
          </button>
        )}
        {onDelete ? (
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="label text-[0.6875rem] text-muted transition-colors hover:text-accent disabled:opacity-50"
          >
            Delete
          </button>
        ) : null}
      </div>
    </li>
  );
}
