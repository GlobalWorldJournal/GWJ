import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TakedownRequestRecord, TakedownStatus } from '@gwj/shared-types';
import { actionTakedownRequest, getAdminTakedownRequests } from '../lib/api';
import { useAuth } from './useAuth';
import { StatusMessage } from '../components/StatusMessage';

const STATUS_FILTERS: { value: TakedownStatus | undefined; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: undefined, label: 'All' },
];

export function Takedowns() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TakedownStatus | undefined>('pending');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'takedown-requests', status],
    queryFn: ({ signal }) => {
      if (!token) throw new Error('Not authenticated');
      return getAdminTakedownRequests(token, { status, limit: 50 }, signal);
    },
    enabled: Boolean(token),
  });

  const act = useMutation({
    mutationFn: (vars: {
      id: string;
      status: 'actioned' | 'dismissed';
      apply: 'unpublish' | 'clear-hero-image' | 'none';
      resolution?: string;
    }) => {
      if (!token) throw new Error('Not authenticated');
      return actionTakedownRequest(token, vars.id, {
        status: vars.status,
        apply: vars.apply,
        resolution: vars.resolution,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'takedown-requests'] }),
  });

  function dismiss(request: TakedownRequestRecord) {
    const resolution = window.prompt('Reason for dismissing this request (optional):') ?? undefined;
    act.mutate({ id: request.id, status: 'dismissed', apply: 'none', resolution });
  }

  function unpublish(request: TakedownRequestRecord) {
    if (!window.confirm('Unpublish the matched article? This takes the whole story down.')) return;
    const resolution = window.prompt('Resolution note for the record (optional):') ?? undefined;
    act.mutate({ id: request.id, status: 'actioned', apply: 'unpublish', resolution });
  }

  function clearImage(request: TakedownRequestRecord) {
    if (
      !window.confirm(
        'Remove the hero image from the matched article? The article stays published.',
      )
    )
      return;
    const resolution = window.prompt('Resolution note for the record (optional):') ?? undefined;
    act.mutate({ id: request.id, status: 'actioned', apply: 'clear-hero-image', resolution });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between border-b-3 border-ink pb-4">
        <div>
          <p className="kicker">Newsroom</p>
          <h1 className="headline text-3xl text-ink">Takedown Requests</h1>
        </div>
        <Link
          to="/admin"
          className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
        >
          Back to Dashboard
        </Link>
      </header>

      <div className="mb-6 flex gap-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setStatus(f.value)}
            className={`label text-[0.7rem] ${status === f.value ? 'text-accent' : 'text-ink-soft'} transition-colors hover:text-accent`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <StatusMessage title="Loading requests…" />
      ) : isError ? (
        <StatusMessage
          title="Could not load requests."
          detail={error instanceof Error ? error.message : undefined}
        />
      ) : data.data.length === 0 ? (
        <StatusMessage title="No requests here." />
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-t border-rule">
          {data.data.map((request) => (
            <li key={request.id} className="flex flex-col gap-2 py-4">
              <div className="flex items-center gap-2">
                <span className="label text-[0.625rem] text-muted">{request.status}</span>
                <span className="label text-[0.625rem] text-muted">{request.claimType}</span>
                <span className="label text-[0.625rem] text-muted">
                  {new Date(request.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="font-body text-ink">
                <span className="font-bold">{request.requesterName}</span> ({request.requesterEmail}
                )
              </p>
              <p className="font-body text-[0.95rem] text-ink-soft">{request.explanation}</p>
              {request.articleUrl ? (
                <p className="label text-[0.7rem] text-muted">Article: {request.articleUrl}</p>
              ) : null}
              {request.imageUrl ? (
                <p className="label text-[0.7rem] text-muted">Image: {request.imageUrl}</p>
              ) : null}
              {request.resolution ? (
                <p className="label text-[0.7rem] text-ink">Resolution: {request.resolution}</p>
              ) : null}
              <div className="flex items-center gap-3">
                {request.articleId ? (
                  <Link
                    to={`/admin/articles/${request.articleId}`}
                    className="label text-[0.6875rem] text-ink transition-colors hover:text-accent"
                  >
                    View matched article
                  </Link>
                ) : (
                  <span className="label text-[0.6875rem] text-muted">
                    No article matched automatically
                  </span>
                )}
                {request.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      disabled={act.isPending}
                      onClick={() => dismiss(request)}
                      className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      disabled={act.isPending || !request.articleId}
                      onClick={() => clearImage(request)}
                      className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
                    >
                      Remove Image Only
                    </button>
                    <button
                      type="button"
                      disabled={act.isPending || !request.articleId}
                      onClick={() => unpublish(request)}
                      className="label text-[0.6875rem] text-accent transition-colors hover:text-ink disabled:opacity-50"
                    >
                      Unpublish Article
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
