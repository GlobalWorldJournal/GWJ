import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchArticles } from '../lib/api';
import { useLang } from '../lib/i18n';
import { searchMeta } from '../lib/pageMeta';
import { usePageMeta } from '../lib/usePageMeta';
import { usePagedArticles } from '../lib/usePagedArticles';
import { ArticleCard } from '../components/ArticleCard';
import { LoadMore } from '../components/LoadMore';
import { StatusMessage } from '../components/StatusMessage';

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { lang, t } = useLang();
  usePageMeta(searchMeta(lang));
  const query = searchParams.get('q') ?? '';
  const hasQuery = query.trim().length > 0;

  const { articles, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePagedArticles(
      ['search', query, lang],
      (page, signal) => searchArticles(query, page, lang, signal),
      hasQuery,
    );

  function submit(next: string) {
    setSearchParams((params) => {
      const updated = new URLSearchParams(params);
      if (next) {
        updated.set('q', next);
      } else {
        updated.delete('q');
      }
      return updated;
    });
  }

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="headline mb-4 text-3xl text-ink">{t('search')}</h1>

      {/* Keyed by the URL's query: following a topic link while already on this
          page shows that query in the box, without syncing state in an effect. */}
      <SearchForm key={query} initial={query} onSubmit={submit} />

      {!hasQuery ? (
        <StatusMessage title={t('searchPrompt')} detail={t('searchPromptDetail')} />
      ) : isPending ? (
        <StatusMessage title={t('searching')} />
      ) : isError ? (
        <StatusMessage title={t('searchFailed')} detail={t('tryAgain')} />
      ) : articles.length === 0 ? (
        <StatusMessage title={t('noResults')} detail={t('noResultsFor', { x: query })} />
      ) : (
        <div className="flex flex-col divide-y divide-rule">
          {articles.map((article) => (
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
      <LoadMore
        hasMore={hasNextPage}
        loading={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
      />
    </section>
  );
}

function SearchForm({ initial, onSubmit }: { initial: string; onSubmit: (query: string) => void }) {
  const { t } = useLang();
  const [draft, setDraft] = useState(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(draft.trim());
      }}
      className="mb-8 flex gap-2 border-b-2 border-ink pb-2"
    >
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        className="w-full bg-transparent font-body text-lg text-ink placeholder:text-muted"
      />
      <button type="submit" className="label text-[0.75rem] text-accent">
        {t('search')}
      </button>
    </form>
  );
}
