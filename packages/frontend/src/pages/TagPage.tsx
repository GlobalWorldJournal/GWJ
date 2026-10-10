import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getArticles } from '../lib/api';
import { useLang } from '../lib/i18n';
import { ArticleCard } from '../components/ArticleCard';
import { StatusMessage } from '../components/StatusMessage';
import { ListSkeleton } from '../components/Skeletons';
import { NotFound } from './NotFound';

/** Every story in this edition carrying one tag (linked from an article's topics). */
export function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  if (!tag) return <NotFound />;
  return <TagView tag={tag} />;
}

/** How many tagged stories a topic page shows (the API's page size). */
const TAG_PAGE_SIZE = 50;

function TagView({ tag }: { tag: string }) {
  const { lang, t } = useLang();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['articles', 'tag', tag, lang],
    queryFn: ({ signal }) => getArticles({ tag, language: lang, limit: TAG_PAGE_SIZE }, signal),
  });

  if (isPending) return <ListSkeleton />;
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
        {t('taggedTitle', { x: tag })}
      </h1>
      {data.data.length === 0 ? (
        <StatusMessage title={t('noStories')} />
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {data.data.map((article) => (
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
    </section>
  );
}
