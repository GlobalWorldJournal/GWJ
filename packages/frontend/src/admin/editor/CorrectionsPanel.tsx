import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Article } from '@gwj/shared-types';
import { addArticleCorrection } from '../../lib/api';
import { useAuth } from '../useAuth';

interface CorrectionsPanelProps {
  article: Article;
  onCorrected: (article: Article) => void;
}

/**
 * Public, dated corrections shown to readers below the story. Append-only: a
 * correction is never edited or removed. Fix the text itself first, then
 * record what was wrong here.
 */
export function CorrectionsPanel({ article, onCorrected }: CorrectionsPanelProps) {
  const { token } = useAuth();
  const [text, setText] = useState('');

  const add = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Not authenticated');
      return addArticleCorrection(token, article.id, text.trim());
    },
    onSuccess: (next) => {
      setText('');
      onCorrected(next);
    },
  });

  const corrections = article.corrections ?? [];

  return (
    <fieldset className="border border-rule p-4">
      <legend className="label px-2 text-[0.625rem] text-ink-soft">Corrections (public)</legend>
      {corrections.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-2">
          {corrections.map((correction) => (
            <li key={correction.at} className="text-[0.85rem] text-ink">
              <span className="label mr-2 text-[0.625rem] text-muted">
                {new Date(correction.at).toLocaleString()}
              </span>
              {correction.text}
            </li>
          ))}
        </ul>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="label text-[0.625rem] text-ink-soft">New correction</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder="An earlier version of this article misstated…"
          className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
        />
      </label>
      {add.error ? (
        <p className="mt-2 text-[0.85rem] text-accent">
          {add.error instanceof Error ? add.error.message : 'Could not add the correction.'}
        </p>
      ) : null}
      <button
        type="button"
        disabled={add.isPending || text.trim().length === 0}
        onClick={() => add.mutate()}
        className="label mt-3 border border-ink px-3 py-2 text-[0.6875rem] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {add.isPending ? 'Adding…' : 'Add correction'}
      </button>
    </fieldset>
  );
}
