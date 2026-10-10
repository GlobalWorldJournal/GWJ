import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  API_SCOPES,
  CreateApiTokenInputSchema,
  type ApiScope,
  type ApiToken,
  type CreatedApiToken,
} from '@gwj/shared-types';
import { createApiToken, getApiTokens, revokeApiToken } from '../lib/api';
import { useAuth } from './useAuth';
import { StatusMessage } from '../components/StatusMessage';

const TOKENS_KEY = ['admin', 'tokens'] as const;

/** What each scope lets an agent do (reading is always allowed). */
const SCOPE_HELP: Record<ApiScope, string> = {
  'articles:write': 'Create drafts and edit articles',
  'articles:publish': 'Publish and unpublish',
  'articles:delete': 'Delete articles',
  'media:upload': 'Upload images',
  takedowns: 'Review takedown requests',
};

/** The scopes a newsroom agent usually needs: everything but deleting. */
const DEFAULT_SCOPES: readonly ApiScope[] = ['articles:write', 'articles:publish', 'media:upload'];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

/**
 * Agent credentials: each AI agent (the MCP server, the newsroom automation)
 * gets its own token with only the scopes it needs, shown in the article
 * history as `agent:<name>` and revocable on its own.
 */
export function Tokens() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const tokens = useQuery({
    queryKey: TOKENS_KEY,
    queryFn: ({ signal }) => {
      if (!token) throw new Error('Not authenticated');
      return getApiTokens(token, signal);
    },
    enabled: Boolean(token),
  });

  const create = useMutation({
    mutationFn: (input: { name: string; scopes: ApiScope[] }) => {
      if (!token) throw new Error('Not authenticated');
      return createApiToken(token, input);
    },
    onSuccess: (result) => {
      setCreated(result);
      return queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new Error('Not authenticated');
      return revokeApiToken(token, id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TOKENS_KEY }),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between border-b-3 border-ink pb-4">
        <div>
          <p className="kicker">Newsroom</p>
          <h1 className="headline text-3xl text-ink">Agent Tokens</h1>
        </div>
        <Link
          to="/admin"
          className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
        >
          ← Dashboard
        </Link>
      </header>

      {created ? (
        <section role="status" className="mb-8 border border-accent p-4">
          <h2 className="headline text-xl text-ink">Token for {created.name}</h2>
          <p className="mt-1 font-body text-sm text-ink-soft">
            Copy it now: it is shown this once and cannot be retrieved later.
          </p>
          <code className="mt-3 block break-all bg-ink px-3 py-2 font-mono text-sm text-paper">
            {created.token}
          </code>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="label mt-3 text-[0.6875rem] text-ink transition-colors hover:text-accent"
          >
            Done
          </button>
        </section>
      ) : null}

      <form
        className="mb-10 flex flex-col gap-4 border border-rule p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          const parsed = CreateApiTokenInputSchema.safeParse({
            name: form.get('name'),
            scopes: form.getAll('scopes'),
          });
          if (!parsed.success) {
            setFormError(parsed.error.issues.map((issue) => issue.message).join('; '));
            return;
          }
          setFormError(null);
          create.mutate(parsed.data, { onSuccess: () => formElement.reset() });
        }}
      >
        <h2 className="headline text-xl text-ink">New token</h2>
        <label className="flex flex-col gap-1">
          <span className="label text-[0.625rem] text-muted">Agent name</span>
          <input
            name="name"
            required
            maxLength={40}
            placeholder="newsroom-agent"
            className="border border-rule bg-paper px-2 py-1.5 font-mono text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="label mb-1 text-[0.625rem] text-muted">Scopes</legend>
          {API_SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-2 font-body text-sm text-ink">
              <input
                type="checkbox"
                name="scopes"
                value={scope}
                defaultChecked={DEFAULT_SCOPES.includes(scope)}
              />
              <span className="font-mono text-xs">{scope}</span>
              <span className="text-muted">{SCOPE_HELP[scope]}</span>
            </label>
          ))}
        </fieldset>
        {formError || create.isError ? (
          <p role="alert" className="font-body text-sm text-accent">
            {formError ??
              (create.error instanceof Error
                ? create.error.message
                : 'Could not create the token.')}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={create.isPending}
          className="label self-start bg-ink px-4 py-2 text-[0.75rem] text-paper transition-colors hover:bg-accent disabled:opacity-50"
        >
          Create token
        </button>
      </form>

      {tokens.isPending ? (
        <StatusMessage title="Loading tokens…" />
      ) : tokens.isError ? (
        <StatusMessage
          title="Could not load tokens."
          detail={tokens.error instanceof Error ? tokens.error.message : undefined}
        />
      ) : tokens.data.length === 0 ? (
        <StatusMessage title="No agent tokens yet." />
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-t border-rule">
          {tokens.data.map((item) => (
            <TokenRow
              key={item.id}
              item={item}
              busy={revoke.isPending}
              onRevoke={() => {
                if (
                  window.confirm(`Revoke “${item.name}”? Agents using it stop working at once.`)
                ) {
                  revoke.mutate(item.id);
                }
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TokenRow({
  item,
  busy,
  onRevoke,
}: {
  item: ApiToken;
  busy: boolean;
  onRevoke: () => void;
}) {
  const revoked = item.revokedAt !== null;
  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className={revoked ? 'opacity-50' : undefined}>
        <p className="headline text-lg text-ink">
          {item.name}
          {revoked ? <span className="label ml-2 text-[0.625rem] text-muted">revoked</span> : null}
        </p>
        <p className="font-mono text-xs text-ink-soft">{item.scopes.join(' · ')}</p>
        <p className="label text-[0.625rem] text-muted">
          Created {formatDate(item.createdAt)} · Last used {formatDate(item.lastUsedAt)}
          {revoked ? ` · Revoked ${formatDate(item.revokedAt)}` : ''}
        </p>
      </div>
      {revoked ? null : (
        <button
          type="button"
          disabled={busy}
          onClick={onRevoke}
          className="label shrink-0 text-[0.6875rem] text-muted transition-colors hover:text-accent disabled:opacity-50"
        >
          Revoke
        </button>
      )}
    </li>
  );
}
