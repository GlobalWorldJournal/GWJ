import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchArticles } from '../lib/api';
import { useLang } from '../lib/i18n';
import { ArticleCard } from '../components/ArticleCard';
import { StatusMessage } from '../components/StatusMessage';

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { lang, t } = useLang();
  const query = searchParams.get('q') ?? '';
  const [draft, setDraft] = useState(query);

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ['search', query, lang],
    queryFn: ({ signal }) => searchArticles(query, 1, lang, signal),
    enabled: query.trim().length > 0,
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    setSearchParams((params) => {
      const updated = new URLSearchParams(params);
      if (trimmed) {
        updated.set('q', trimmed);
      } else {
        updated.delete('q');
      }
      return updated;
    });
  }

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="headline mb-4 text-3xl text-ink">{t('search')}</h1>

      <form onSubmit={handleSubmit} className="mb-8 flex gap-2 border-b-2 border-ink pb-2">
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search articles"
          aria-label="Search articles"
          className="w-full bg-transparent font-body text-lg text-ink outline-none placeholder:text-muted"
        />
        <button type="submit" className="label text-[0.75rem] text-accent">
          {t('search')}
        </button>
      </form>

      {query.trim().length === 0 ? (
        <StatusMessage title="What are you looking for?" detail="Search across every section." />
      ) : isPending || isFetching ? (
        <StatusMessage title="Searching&hellip;" />
      ) : isError ? (
        <StatusMessage
          title="Search failed."
          detail={error instanceof Error ? error.message : undefined}
        />
      ) : data.data.length === 0 ? (
        <StatusMessage title="No results." detail={`Nothing matched “${query}”.`} />
      ) : (
        <div className="flex flex-col divide-y divide-rule">
          {data.data.map((article) => (
            <div key={article.id} className="py-6 first:pt-0">
              <ArticleCard
                article={article}
                variant="feature"
                showImage={Boolean(article.heroImage)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
