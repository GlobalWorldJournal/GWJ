import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CATEGORIES, categorySlug, type Category as CategoryName } from '@gwj/shared-types';
import { getArticles } from '../lib/api';
import { useLang } from '../lib/i18n';
import { categoryLabel } from '../lib/dictionary';
import { ArticleCard } from '../components/ArticleCard';
import { AdSlot } from '../components/AdSlot';
import { StatusMessage } from '../components/StatusMessage';
import { ListSkeleton } from '../components/Skeletons';
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
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['articles', 'category', category, lang],
    queryFn: ({ signal }) => getArticles({ category, language: lang, limit: 30 }, signal),
  });

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

      {data.data.length === 0 ? (
        <StatusMessage title={t('noStories')} />
      ) : (
        <div className="grid grid-cols-1 gap-8 divide-y divide-rule sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
          {data.data.map((article) => (
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

      <AdSlot variant="leaderboard" className="mt-10 border-t border-rule pt-8" />
    </section>
  );
}
