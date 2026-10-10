import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChangePasswordInputSchema } from '@gwj/shared-types';
import { changePassword } from '../lib/api';
import { useAuth } from './useAuth';
import { AdminHeader } from './AdminHeader';

const FIELD_CLASS =
  'border border-rule bg-paper px-2 py-1.5 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent';

/** The signed-in person's account: who they are, and changing their password. */
export function Account() {
  const { token, user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: (input: Parameters<typeof changePassword>[1]) => {
      if (!token) throw new Error('Not authenticated');
      return changePassword(token, input);
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <AdminHeader title="Account" />
      <p className="mb-8 font-body text-ink">
        Signed in as <strong>{user?.username}</strong> ({user?.role}).
      </p>
      <form
        className="flex max-w-md flex-col gap-4 border border-rule p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          if (form.get('newPassword') !== form.get('confirmPassword')) {
            setFormError('The new passwords do not match');
            return;
          }
          const parsed = ChangePasswordInputSchema.safeParse({
            currentPassword: form.get('currentPassword'),
            newPassword: form.get('newPassword'),
          });
          if (!parsed.success) {
            setFormError(parsed.error.issues.map((issue) => issue.message).join('; '));
            return;
          }
          setFormError(null);
          change.mutate(parsed.data, { onSuccess: () => formElement.reset() });
        }}
      >
        <h2 className="headline text-xl text-ink">Change password</h2>
        <label className="flex flex-col gap-1">
          <span className="label text-[0.625rem] text-muted">Current password</span>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label text-[0.625rem] text-muted">New password (12+ characters)</span>
          <input
            name="newPassword"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label text-[0.625rem] text-muted">New password, again</span>
          <input
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className={FIELD_CLASS}
          />
        </label>
        {formError || change.isError ? (
          <p role="alert" className="font-body text-sm text-accent">
            {formError ??
              (change.error instanceof Error ? change.error.message : 'Could not change it.')}
          </p>
        ) : null}
        {change.isSuccess ? (
          <p role="status" className="font-body text-sm text-ink">
            Password changed.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={change.isPending}
          className="label self-start bg-ink px-4 py-2 text-[0.75rem] text-paper transition-colors hover:bg-accent disabled:opacity-50"
        >
          Change password
        </button>
      </form>
    </div>
  );
}
