import { useParams } from 'react-router-dom';
import { findWriterBySlug, type Writer } from '@gwj/shared-types';
import { getArticles } from '../lib/api';
import { useLang } from '../lib/i18n';
import { categoryLabel, writerTitle } from '../lib/dictionary';
import { authorMeta } from '../lib/pageMeta';
import { usePageMeta } from '../lib/usePageMeta';
import { writerPortraitUrl } from '../lib/format';
import { LIST_PAGE_SIZE, usePagedArticles } from '../lib/usePagedArticles';
import { ArticleCard } from '../components/ArticleCard';
import { AdSlot } from '../components/AdSlot';
import { LoadMore } from '../components/LoadMore';
import { StatusMessage } from '../components/StatusMessage';
import { ListSkeleton } from '../components/Skeletons';

export function AuthorPage() {
  const { slug = '' } = useParams();
  const { lang, t } = useLang();
  const writer = findWriterBySlug(slug);
  usePageMeta(authorMeta(writer, lang));
  if (!writer) {
    return <StatusMessage title={t('authorNotFound')} detail={t('authorNotFoundDetail')} />;
  }
  return <AuthorView writer={writer} />;
}

/** A writer's profile and every story they wrote in this edition, newest first. */
function AuthorView({ writer }: { writer: Writer }) {
  const { lang, t } = useLang();
  const { articles, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePagedArticles(['articles', 'author', writer.name, lang], (page, signal) =>
      getArticles(
        { author: writer.name, language: lang, sort: 'latest', limit: LIST_PAGE_SIZE, page },
        signal,
      ),
    );

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-6 text-center">
        <img
          src={writerPortraitUrl(writer.name)}
          alt=""
          width={96}
          height={96}
          className="mx-auto mb-3 h-24 w-24 rounded-full object-cover"
        />
        <h1 className="headline text-4xl text-ink">{writer.name}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-accent">
          {writerTitle(writer.title, lang)}
        </p>
        <p className="mt-3 font-body text-[0.95rem] leading-relaxed text-ink-soft">
          {t('authorCovers', {
            x: writer.name,
            y: writer.beats.map((beat) => categoryLabel(beat, lang)).join(', '),
          })}
        </p>
      </header>

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <StatusMessage title={t('loadingError')} detail={t('tryAgain')} />
      ) : articles.length === 0 ? (
        <StatusMessage title={t('noStories')} detail={t('authorNoStories', { x: writer.name })} />
      ) : (
        <div className="flex flex-col divide-y divide-rule">
          {articles.map((article) => (
            <div key={article.id} className="py-6 first:pt-0">
              <ArticleCard
                article={article}
                variant="feature"
                showImage={Boolean(article.heroImage)}
                showByline={false}
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
    </div>
  );
}
