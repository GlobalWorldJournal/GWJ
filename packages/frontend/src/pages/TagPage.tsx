import { useParams } from 'react-router-dom';
import { getArticles } from '../lib/api';
import { useLang } from '../lib/i18n';
import { tagMeta } from '../lib/pageMeta';
import { usePageMeta } from '../lib/usePageMeta';
import { ArticleCard } from '../components/ArticleCard';
import { StatusMessage } from '../components/StatusMessage';
import { ListSkeleton } from '../components/Skeletons';
import { NotFound } from './NotFound';
import { LoadMore } from '../components/LoadMore';
import { LIST_PAGE_SIZE, usePagedArticles } from '../lib/usePagedArticles';

/** Every story in this edition carrying one tag (linked from an article's topics). */
export function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  if (!tag) return <NotFound />;
  return <TagView tag={tag} />;
}

function TagView({ tag }: { tag: string }) {
  const { lang, t } = useLang();
  usePageMeta(tagMeta(tag, lang));
  const { articles, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePagedArticles(['articles', 'tag', tag, lang], (page, signal) =>
      getArticles({ tag, language: lang, limit: LIST_PAGE_SIZE, page }, signal),
    );

  if (isPending) return <ListSkeleton />;
  if (isError) {
    return <StatusMessage title={t('loadingError')} detail={t('tryAgain')} />;
  }

  return (
    <section>
      <h1 className="headline mb-6 border-b-3 border-ink pb-2 text-3xl text-ink">
        {t('taggedTitle', { x: tag })}
      </h1>
      {articles.length === 0 ? (
        <StatusMessage title={t('noStories')} />
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {articles.map((article) => (
            <li key={article.id} className="py-4 first:pt-0">
              <ArticleCard
                article={article}
                variant="list"
                showImage={Boolean(article.heroImage)}
              />
            </li>
          ))}
        </ul>
      )}
      <LoadMore
        hasMore={hasNextPage}
        loading={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
      />
    </section>
  );
}
