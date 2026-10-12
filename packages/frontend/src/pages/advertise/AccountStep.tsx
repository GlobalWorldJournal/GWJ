import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { loginAdvertiser, registerAdvertiser } from '../../lib/api';
import { setAdvertiserToken } from '../../lib/advertiserSession';
import { LocaleLink } from '../../lib/locale';
import type { AdvertiseCopy } from './copy';
import { BUTTON_CLASS, FIELD_LABEL_CLASS, INPUT_CLASS } from './ui';

const MIN_PASSWORD_LENGTH = 10;

type Mode = 'register' | 'login';

/** The terms checkbox, with the link and the plain-language consequences spelled out. */
export function TermsCheckbox({
  copy,
  checked,
  onChange,
}: {
  copy: AdvertiseCopy;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 font-body text-[0.95rem] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 accent-[var(--color-accent)]"
      />
      <span>
        {copy.acceptTermsLead}{' '}
        <LocaleLink
          to="/advertising-terms"
          target="_blank"
          className="text-accent underline hover:no-underline"
        >
          {copy.acceptTermsLink}
        </LocaleLink>
        {copy.acceptTermsTail}
      </span>
    </label>
  );
}

/** Register or sign in; on success the token is stored and the wizard moves on. */
export function AccountStep({ copy }: { copy: AdvertiseCopy }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('register');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);

  const auth = useMutation({
    mutationFn: () =>
      mode === 'register'
        ? registerAdvertiser({ email, password, companyName: company, acceptTerms: true })
        : loginAdvertiser({ email, password }),
    onSuccess: (response) => {
      queryClient.setQueryData(['advertiser', 'me', response.token], response.advertiser);
      setAdvertiserToken(response.token);
    },
  });

  const canSubmit =
    email.trim() !== '' &&
    password.length >= (mode === 'register' ? MIN_PASSWORD_LENGTH : 1) &&
    (mode === 'login' || (company.trim() !== '' && accepted));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) auth.mutate();
  }

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-6 border-b border-rule">
        {(['register', 'login'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value);
              auth.reset();
            }}
            className={`label -mb-px border-b-2 pb-2 text-[0.75rem] font-bold ${
              mode === value ? 'border-accent text-accent' : 'border-transparent text-ink-soft'
            }`}
          >
            {value === 'register' ? copy.tabRegister : copy.tabLogin}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex max-w-md flex-col gap-4">
        {mode === 'register' ? (
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL_CLASS}>{copy.company}</span>
            <input
              className={INPUT_CLASS}
              value={company}
              maxLength={200}
              autoComplete="organization"
              onChange={(event) => setCompany(event.target.value)}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL_CLASS}>{copy.email}</span>
          <input
            type="email"
            className={INPUT_CLASS}
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL_CLASS}>{copy.password}</span>
          <input
            type="password"
            className={INPUT_CLASS}
            value={password}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === 'register' ? (
            <span className="font-label text-[0.75rem] text-muted">{copy.passwordHint}</span>
          ) : null}
        </label>
        {mode === 'register' ? (
          <TermsCheckbox copy={copy} checked={accepted} onChange={setAccepted} />
        ) : null}
        {auth.isError ? (
          <p role="alert" className="font-label text-[0.85rem] text-accent">
            {copy.authFailed}
          </p>
        ) : null}
        <div>
          <button type="submit" disabled={!canSubmit || auth.isPending} className={BUTTON_CLASS}>
            {auth.isPending ? copy.working : mode === 'register' ? copy.createAccount : copy.signIn}
          </button>
        </div>
      </form>
    </div>
  );
}
