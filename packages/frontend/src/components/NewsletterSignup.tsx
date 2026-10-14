import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLang } from '../lib/i18n';
import { subscribeToNewsletter } from '../lib/api';

interface NewsletterSignupProps {
  className?: string;
}

/**
 * The email newsletter sign-up: one field, double opt-in (the reader confirms from a
 * link we mail them). The `website` field is a honeypot, hidden from people.
 */
export function NewsletterSignup({ className }: NewsletterSignupProps) {
  const { lang, t } = useLang();
  const inputId = useId();
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const signup = useMutation({
    mutationFn: () => subscribeToNewsletter(email, lang, website),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    signup.mutate();
  }

  return (
    <section className={className} aria-labelledby={`${inputId}-heading`}>
      <h2 id={`${inputId}-heading`} className="headline text-2xl text-ink">
        {t('newsletterHeading')}
      </h2>
      <p className="mt-1 font-body text-[0.95rem] text-ink-soft">{t('newsletterPrompt')}</p>
      {signup.isSuccess ? (
        <p role="status" className="mt-4 font-body text-[0.95rem] font-bold text-ink">
          {t('newsletterCheckInbox')}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">
            {t('newsletterEmailLabel')}
          </label>
          <input
            id={inputId}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('newsletterEmailLabel')}
            className="min-w-0 flex-1 border border-ink bg-paper px-3 py-2 font-body text-[0.95rem] text-ink"
          />
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />
          <button
            type="submit"
            disabled={signup.isPending}
            className="label border border-ink bg-ink px-5 py-2 text-[0.6875rem] tracking-[0.12em] text-paper transition-colors hover:border-accent hover:bg-accent disabled:opacity-60"
          >
            {signup.isPending ? t('newsletterSending') : t('newsletterButton')}
          </button>
        </form>
      )}
      {signup.isError ? (
        <p role="alert" className="mt-2 font-body text-[0.85rem] text-accent">
          {t('newsletterError')}
        </p>
      ) : null}
      <p className="mt-2 font-body text-[0.75rem] text-muted">{t('newsletterPrivacy')}</p>
    </section>
  );
}
