import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { submitTakedownRequest } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { TakedownClaimTypeSchema, type TakedownClaimType } from '@gwj/shared-types';
import { REPORT_CONTENT } from './content/reportContent';
import { StaticPageHeader } from './StaticPage';

const INPUT_CLASS =
  'border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent';

export function ReportContent() {
  const { lang } = useLang();
  const copy = REPORT_CONTENT[lang];
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [articleUrl, setArticleUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [claimType, setClaimType] = useState<TakedownClaimType>('copyright');
  const [explanation, setExplanation] = useState('');
  const [goodFaithAssertion, setGoodFaithAssertion] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      submitTakedownRequest({
        requesterName,
        requesterEmail,
        articleUrl: articleUrl.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        claimType,
        explanation,
        goodFaithAssertion: true,
      }),
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goodFaithAssertion) return;
    mutation.mutate();
  }

  if (mutation.isSuccess) {
    return (
      <div className="mx-auto max-w-3xl">
        <StaticPageHeader title={copy.receivedTitle} />
        <p className="font-body text-[1.05rem] leading-relaxed text-ink">
          {copy.receivedBefore}
          <span className="font-bold">{mutation.data.id}</span>
          {copy.receivedAfter}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <StaticPageHeader title={copy.title} />

      <div className="mb-8 flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>{copy.intro}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">{copy.nameLabel}</span>
          <input
            type="text"
            value={requesterName}
            onChange={(event) => setRequesterName(event.target.value)}
            required
            maxLength={200}
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">{copy.emailLabel}</span>
          <input
            type="email"
            value={requesterEmail}
            onChange={(event) => setRequesterEmail(event.target.value)}
            required
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">{copy.articleLabel}</span>
          <input
            type="url"
            placeholder={copy.articlePlaceholder}
            value={articleUrl}
            onChange={(event) => setArticleUrl(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">{copy.imageLabel}</span>
          <input
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <span className="label text-[0.6875rem] text-ink-soft">{copy.claimPrompt}</span>
          {TakedownClaimTypeSchema.options.map((value) => (
            <label
              key={value}
              className="flex items-center gap-2 font-body text-[0.95rem] text-ink"
            >
              <input
                type="radio"
                name="claimType"
                value={value}
                checked={claimType === value}
                onChange={() => setClaimType(value)}
              />
              {copy.claims[value]}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">{copy.explanationLabel}</span>
          <textarea
            value={explanation}
            onChange={(event) => setExplanation(event.target.value)}
            required
            minLength={1}
            maxLength={5000}
            rows={6}
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex items-start gap-2 font-body text-[0.9rem] text-ink">
          <input
            type="checkbox"
            checked={goodFaithAssertion}
            onChange={(event) => setGoodFaithAssertion(event.target.checked)}
            required
            className="mt-1"
          />
          <span>{copy.goodFaith}</span>
        </label>

        {mutation.isError ? (
          <p className="text-[0.85rem] text-accent">
            {mutation.error instanceof Error ? mutation.error.message : copy.submitFailed}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={mutation.isPending || !goodFaithAssertion}
          className="label mt-2 self-start bg-ink px-6 py-3 text-[0.75rem] text-paper transition-colors hover:bg-accent disabled:opacity-60"
        >
          {mutation.isPending ? copy.submitting : copy.submit}
        </button>
      </form>
    </div>
  );
}
