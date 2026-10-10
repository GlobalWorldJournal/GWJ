import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateUserInputSchema,
  UserRoleSchema,
  type UpdateUserInput,
  type User,
} from '@gwj/shared-types';
import { createUser, getUsers, updateUser } from '../lib/api';
import { useAuth } from './useAuth';
import { AdminHeader } from './AdminHeader';
import { StatusMessage } from '../components/StatusMessage';

const USERS_KEY = ['admin', 'users'] as const;

const ROLE_HELP = {
  admin: 'Runs the newsroom: people, agent tokens, deleting stories',
  editor: 'Writes, edits and publishes; handles takedown requests',
} as const;

const FIELD_CLASS =
  'border border-rule bg-paper px-2 py-1.5 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent';

/** The newsroom's people (admins only): add accounts, change roles, deactivate. */
export function Users() {
  const { token, user: me } = useAuth();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: USERS_KEY,
    queryFn: ({ signal }) => {
      if (!token) throw new Error('Not authenticated');
      return getUsers(token, signal);
    },
    enabled: Boolean(token),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: USERS_KEY });

  const create = useMutation({
    mutationFn: (input: Parameters<typeof createUser>[1]) => {
      if (!token) throw new Error('Not authenticated');
      return createUser(token, input);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => {
      if (!token) throw new Error('Not authenticated');
      return updateUser(token, id, input);
    },
    onSuccess: invalidate,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AdminHeader title="People" />

      <form
        className="mb-10 flex flex-col gap-4 border border-rule p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          const parsed = CreateUserInputSchema.safeParse({
            username: form.get('username'),
            password: form.get('password'),
            role: form.get('role'),
          });
          if (!parsed.success) {
            setFormError(parsed.error.issues.map((issue) => issue.message).join('; '));
            return;
          }
          setFormError(null);
          create.mutate(parsed.data, { onSuccess: () => formElement.reset() });
        }}
      >
        <h2 className="headline text-xl text-ink">Add a person</h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="label text-[0.625rem] text-muted">Username</span>
            <input name="username" required maxLength={40} className={FIELD_CLASS} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[0.625rem] text-muted">Initial password</span>
            <input
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              className={FIELD_CLASS}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[0.625rem] text-muted">Role</span>
            <select name="role" defaultValue="editor" className={FIELD_CLASS}>
              {UserRoleSchema.options.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="font-body text-sm text-muted">
          {UserRoleSchema.options.map((role) => (
            <li key={role}>
              <span className="font-mono text-xs text-ink">{role}</span>: {ROLE_HELP[role]}
            </li>
          ))}
        </ul>
        {formError || create.isError ? (
          <p role="alert" className="font-body text-sm text-accent">
            {formError ??
              (create.error instanceof Error ? create.error.message : 'Could not add the account.')}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={create.isPending}
          className="label self-start bg-ink px-4 py-2 text-[0.75rem] text-paper transition-colors hover:bg-accent disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {update.isError ? (
        <p role="alert" className="mb-4 font-body text-sm text-accent">
          {update.error instanceof Error ? update.error.message : 'Could not change the account.'}
        </p>
      ) : null}

      {users.isPending ? (
        <StatusMessage title="Loading people…" />
      ) : users.isError ? (
        <StatusMessage
          title="Could not load people."
          detail={users.error instanceof Error ? users.error.message : undefined}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-t border-rule">
          {users.data.map((person) => (
            <UserRow
              key={person.id}
              person={person}
              isSelf={person.username === me?.username}
              busy={update.isPending}
              onChange={(input) => update.mutate({ id: person.id, input })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UserRow({
  person,
  isSelf,
  busy,
  onChange,
}: {
  person: User;
  isSelf: boolean;
  busy: boolean;
  onChange: (input: UpdateUserInput) => void;
}) {
  const disabled = person.disabledAt !== null;
  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className={disabled ? 'opacity-50' : undefined}>
        <p className="headline text-lg text-ink">
          {person.username}
          {isSelf ? <span className="label ml-2 text-[0.625rem] text-muted">you</span> : null}
          {disabled ? (
            <span className="label ml-2 text-[0.625rem] text-muted">deactivated</span>
          ) : null}
        </p>
        <p className="label text-[0.625rem] text-muted">
          Since {new Date(person.createdAt).toLocaleDateString()}
        </p>
      </div>
      {isSelf ? (
        <span className="label text-[0.6875rem] text-ink-soft">{person.role}</span>
      ) : (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="sr-only">Role of {person.username}</span>
            <select
              value={person.role}
              disabled={busy}
              onChange={(event) => onChange({ role: UserRoleSchema.parse(event.target.value) })}
              className={FIELD_CLASS}
            >
              {UserRoleSchema.options.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                disabled ||
                window.confirm(`Deactivate ${person.username}? They are signed out at once.`)
              ) {
                onChange({ disabled: !disabled });
              }
            }}
            className="label text-[0.6875rem] text-muted transition-colors hover:text-accent disabled:opacity-50"
          >
            {disabled ? 'Reactivate' : 'Deactivate'}
          </button>
        </div>
      )}
    </li>
  );
}
