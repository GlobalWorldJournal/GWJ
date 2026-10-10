import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { submitTakedownRequest } from '../../lib/api';
import type { TakedownClaimType } from '@gwj/shared-types';

const INPUT_CLASS =
  'border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent';

const CLAIM_LABELS: Record<TakedownClaimType, string> = {
  copyright: 'I hold the copyright to this image or text',
  'subject-rights': 'I am the subject of this content and it violates my rights',
  other: 'Other',
};

export function ReportContent() {
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
        <header className="mb-8 border-b-3 border-ink pb-4">
          <h1 className="headline text-4xl text-ink">Request Received</h1>
          <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
            The Global World Journal
          </p>
        </header>
        <p className="font-body text-[1.05rem] leading-relaxed text-ink">
          Thank you. Your request (reference <span className="font-bold">{mutation.data.id}</span>)
          has been logged for review. We take these reports seriously and will act on genuine
          claims; we may contact you at the email address you provided if we need more detail.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Report Content</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>

      <div className="mb-8 flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          Our newsroom credits every photograph to its original source, but attribution is not the
          same as a license. If you hold the rights to an image or article of yours that appears
          here without permission, or if something we published about you violates your rights, tell
          us below and we will review it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">Your name</span>
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
          <span className="label text-[0.6875rem] text-ink-soft">
            Your email (so we can follow up)
          </span>
          <input
            type="email"
            value={requesterEmail}
            onChange={(event) => setRequesterEmail(event.target.value)}
            required
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">
            Link to the article (if applicable)
          </span>
          <input
            type="url"
            placeholder="https://globalworldjournal.com/article/…"
            value={articleUrl}
            onChange={(event) => setArticleUrl(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">
            Link to the specific image (if applicable)
          </span>
          <input
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <span className="label text-[0.6875rem] text-ink-soft">What are you reporting?</span>
          {(Object.keys(CLAIM_LABELS) as TakedownClaimType[]).map((value) => (
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
              {CLAIM_LABELS[value]}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="label text-[0.6875rem] text-ink-soft">
            Tell us what happened (how you hold the rights, or how this affects you)
          </span>
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
          <span>
            I state, in good faith, that the information above is accurate and that I am the rights
            holder or am authorized to act on their behalf.
          </span>
        </label>

        {mutation.isError ? (
          <p className="text-[0.85rem] text-accent">
            {mutation.error instanceof Error
              ? mutation.error.message
              : 'Could not submit this report.'}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={mutation.isPending || !goodFaithAssertion}
          className="label mt-2 self-start bg-ink px-6 py-3 text-[0.75rem] text-paper transition-colors hover:bg-accent disabled:opacity-60"
        >
          {mutation.isPending ? 'Submitting…' : 'Submit Report'}
        </button>
      </form>
    </div>
  );
}
