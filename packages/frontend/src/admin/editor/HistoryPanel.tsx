import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Article } from '@gwj/shared-types';
import { getArticleRevisions, restoreArticleRevision } from '../../lib/api';
import { useAuth } from '../useAuth';

interface HistoryPanelProps {
  articleId: string;
  /** Called with the article as restored, so the editor can show it. */
  onRestored: (article: Article) => void;
}

/**
 * The article's history (newest first). Each entry is the state BEFORE one
 * change; restoring it brings that content back (status and URL stay), and is
 * itself recorded, so a restore can be undone from this same list.
 */
export function HistoryPanel({ articleId, onRestored }: HistoryPanelProps) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['admin', 'revisions', articleId];

  const history = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      if (!token) throw new Error('Not authenticated');
      return getArticleRevisions(token, articleId, signal);
    },
    enabled: Boolean(token),
  });

  const restore = useMutation({
    mutationFn: (revisionId: number) => {
      if (!token) throw new Error('Not authenticated');
      return restoreArticleRevision(token, articleId, revisionId);
    },
    onSuccess: async (article) => {
      onRestored(article);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  return (
    <fieldset className="border border-rule p-4">
      <legend className="label px-2 text-[0.625rem] text-ink-soft">History</legend>
      {history.isPending ? <p className="text-[0.85rem] text-muted">Loading history…</p> : null}
      {history.isError ? (
        <p className="text-[0.85rem] text-accent">Could not load the history.</p>
      ) : null}
      {history.data?.length === 0 ? (
        <p className="text-[0.85rem] text-muted">No changes yet.</p>
      ) : null}
      {restore.error ? (
        <p className="mb-2 text-[0.85rem] text-accent">
          {restore.error instanceof Error ? restore.error.message : 'Could not restore.'}
        </p>
      ) : null}
      <ol className="flex flex-col divide-y divide-rule">
        {history.data?.map((revision) => (
          <li key={revision.id} className="flex items-center justify-between gap-4 py-2">
            <div className="min-w-0 text-[0.85rem]">
              <p className="truncate text-ink">{revision.title}</p>
              <p className="label text-[0.625rem] text-muted">
                Before a change by {revision.actor} ·{' '}
                {new Date(revision.createdAt).toLocaleString()} · {revision.status}
              </p>
            </div>
            <button
              type="button"
              disabled={restore.isPending}
              onClick={() => {
                if (
                  window.confirm(`Restore the content as it was before ${revision.actor}'s change?`)
                ) {
                  restore.mutate(revision.id);
                }
              }}
              className="label shrink-0 text-[0.6875rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
            >
              Restore
            </button>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
