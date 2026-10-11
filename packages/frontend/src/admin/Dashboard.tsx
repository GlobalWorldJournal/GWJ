import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Article } from '@gwj/shared-types';
import {
  beginMentionAuthorization,
  getAdminArticles,
  publishArticle,
  unpublishArticle,
  deleteArticle,
} from '../lib/api';
import { useAuth } from './useAuth';
import { StatusMessage } from '../components/StatusMessage';

export function Dashboard() {
  const { token, user, signOut } = useAuth();
  const queryClient = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'articles'],
    queryFn: ({ signal }) => {
      if (!token) {
        throw new Error('Not authenticated');
      }
      return getAdminArticles(token, { limit: 50 }, signal);
    },
    enabled: Boolean(token),
  });

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
            to="/admin/ad-campaigns"
            className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
          >
            Advertising
          </Link>
          <Link
            to="/admin/takedown-requests"
            className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
          >
            Takedown Requests
          </Link>
          <Link
            to="/admin/articles/new"
            className="label bg-ink px-4 py-2 text-[0.75rem] text-paper transition-colors hover:bg-accent"
          >
            New Article
          </Link>
          <button
            type="button"
            disabled={connectMention.isPending}
            onClick={() => connectMention.mutate()}
            className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
          >
            Connect Mention
          </button>
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

      {isPending ? (
        <StatusMessage title="Loading articles&hellip;" />
      ) : isError ? (
        <StatusMessage
          title="Could not load articles."
          detail={error instanceof Error ? error.message : undefined}
        />
      ) : data.data.length === 0 ? (
        <StatusMessage title="No articles yet." detail="Create your first story." />
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-t border-rule">
          {data.data.map((article) => (
            <ArticleRow
              key={article.id}
              article={article}
              onPublish={() => publish.mutate(article.id)}
              onUnpublish={() => unpublish.mutate(article.id)}
              onDelete={() => {
                if (window.confirm(`Delete “${article.title}”? This cannot be undone.`)) {
                  remove.mutate(article.id);
                }
              }}
              busy={publish.isPending || unpublish.isPending || remove.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface ArticleRowProps {
  article: Article;
  onPublish: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
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
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="label text-[0.6875rem] text-muted transition-colors hover:text-accent disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
