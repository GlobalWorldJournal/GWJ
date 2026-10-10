import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type Article } from '@gwj/shared-types';
import { getAdminArticle, updateArticle } from '../../lib/api';
import { useAuth } from '../useAuth';

interface TranslationsPanelProps {
  article: Article;
  onLinked: (article: Article) => void;
}

/**
 * The story's other language editions: open one, start the missing ones (the
 * new article is created already linked), or link an article that exists.
 */
export function TranslationsPanel({ article, onLinked }: TranslationsPanelProps) {
  const { token } = useAuth();
  const [otherId, setOtherId] = useState('');
  const editions = article.translations ?? [];
  const missing = SUPPORTED_LANGUAGES.filter(
    (language) => language !== article.language && !editions.some((e) => e.language === language),
  );

  const link = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Not authenticated');
      await updateArticle(token, otherId.trim(), { translationOf: article.id });
      return getAdminArticle(token, article.id);
    },
    onSuccess: (next) => {
      setOtherId('');
      onLinked(next);
    },
  });

  return (
    <fieldset className="border border-rule p-4">
      <legend className="label px-2 text-[0.625rem] text-ink-soft">Editions</legend>
      <ul className="mb-3 flex flex-col gap-1 text-[0.85rem]">
        {editions.map((edition) => (
          <li key={edition.id}>
            <Link
              to={`/admin/articles/${edition.id}`}
              className="text-ink underline hover:text-accent"
            >
              {LANGUAGE_NAMES[edition.language]}
            </Link>{' '}
            <span className="label text-[0.625rem] text-muted">{edition.status}</span>
          </li>
        ))}
        {missing.map((language) => (
          <li key={language}>
            <Link
              to={`/admin/articles/new?translationOf=${article.id}&language=${language}`}
              className="text-ink-soft hover:text-accent"
            >
              Write the {LANGUAGE_NAMES[language]} edition
            </Link>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1">
        <span className="label text-[0.625rem] text-ink-soft">
          Link an existing article as an edition (its id)
        </span>
        <input
          type="text"
          value={otherId}
          onChange={(event) => setOtherId(event.target.value)}
          className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
        />
      </label>
      {link.error ? (
        <p className="mt-2 text-[0.85rem] text-accent">
          {link.error instanceof Error ? link.error.message : 'Could not link the article.'}
        </p>
      ) : null}
      <button
        type="button"
        disabled={link.isPending || otherId.trim().length === 0}
        onClick={() => link.mutate()}
        className="label mt-3 border border-ink px-3 py-2 text-[0.6875rem] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {link.isPending ? 'Linking…' : 'Link edition'}
      </button>
    </fieldset>
  );
}
