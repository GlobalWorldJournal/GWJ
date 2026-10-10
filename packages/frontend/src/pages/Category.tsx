import { useParams } from 'react-router-dom';
import { CATEGORIES, categorySlug, type Category as CategoryName } from '@gwj/shared-types';
import { getArticles } from '../lib/api';
import { useLang } from '../lib/i18n';
import { categoryLabel } from '../lib/dictionary';
import { ArticleCard } from '../components/ArticleCard';
import { AdSlot } from '../components/AdSlot';
import { StatusMessage } from '../components/StatusMessage';
import { ListSkeleton } from '../components/Skeletons';
import { LoadMore } from '../components/LoadMore';
import { LIST_PAGE_SIZE, usePagedArticles } from '../lib/usePagedArticles';
import { NotFound } from './NotFound';

function resolveCategory(slug: string | undefined): CategoryName | null {
  if (!slug) {
    return null;
  }
  return CATEGORIES.find((category) => categorySlug(category) === slug) ?? null;
}

export function Category() {
  const { category: slug } = useParams<{ category: string }>();
  const category = resolveCategory(slug);

  if (!category) {
    return <NotFound />;
  }

  return <CategoryView category={category} />;
}

function CategoryView({ category }: { category: CategoryName }) {
  const { lang, t } = useLang();
  const { articles, isPending, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePagedArticles(['articles', 'category', category, lang], (page, signal) =>
      getArticles({ category, language: lang, limit: LIST_PAGE_SIZE, page }, signal),
    );

  if (isPending) {
    return <ListSkeleton />;
  }

  if (isError) {
    return (
      <StatusMessage
        title={t('loadingError')}
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }

  return (
    <section>
      <h1 className="headline mb-6 border-b-3 border-ink pb-2 text-3xl text-ink">
        {categoryLabel(category, lang)}
      </h1>

      {articles.length === 0 ? (
        <StatusMessage title={t('noStories')} />
      ) : (
        <div className="grid grid-cols-1 gap-8 divide-y divide-rule sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
          {articles.map((article) => (
            <div key={article.id} className="pt-6 first:pt-0 sm:pt-0">
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

      <AdSlot variant="leaderboard" className="mt-10 border-t border-rule pt-8" />
    </section>
  );
}
