import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { categorySlug, type Category, type Language } from '@gwj/shared-types';
import { getArticle, getArticles, ApiRequestError } from '../lib/api';
import { useLang } from '../lib/i18n';
import { LocaleLink, localizePath } from '../lib/locale';
import { categoryLabel } from '../lib/dictionary';
import { articleMeta } from '../lib/pageMeta';
import { usePageMeta } from '../lib/usePageMeta';
import { Kicker } from '../components/Kicker';
import { Byline } from '../components/Byline';
import { ArticleBody } from '../components/ArticleBody';
import { CorrectionsNote, ShareBar, TopicTags } from '../components/ArticleExtras';
import { readingMinutes } from '../lib/format';
import { IMAGE_SIZES, responsiveImage } from '../lib/responsiveImage';
import { ArticleCard } from '../components/ArticleCard';
import { NewsletterSignup } from '../components/NewsletterSignup';
import { PageWithRail } from '../components/PageWithRail';
import { useEditionArticles } from '../components/SiteRail';
import { useReportView } from '../lib/popular';
import { ArticleSkeleton } from '../components/Skeletons';
import { StatusMessage } from '../components/StatusMessage';
import { NotFound } from './NotFound';

// How many cross-link cards each section renders. The "More in {category}" grid
// targets a 4-up row; "More from {author}" stays a short list.
const RELATED_LIMIT = 6;
const AUTHOR_LIMIT = 4;
const POOL_LIMIT = 50;

/** Same-category, same-edition stories, fetched only once the article resolves. */
function useCategoryArticles(category: Category | undefined, lang: Language) {
  return useQuery({
    queryKey: ['articles', 'related', category, lang],
    queryFn: ({ signal }) => getArticles({ category, language: lang, limit: POOL_LIMIT }, signal),
    enabled: Boolean(category),
    staleTime: 60_000,
  });
}

export function ArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { lang, t } = useLang();

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['article', slug],
    queryFn: ({ signal }) => {
      if (!slug) {
        throw new Error('Missing article slug');
      }
      return getArticle(slug, signal);
    },
    enabled: Boolean(slug),
  });

  // These run in parallel with (and never block) the article query. The hooks
  // are always called; the queries self-gate via `enabled`/derived inputs.
  usePageMeta(data ? articleMeta(data) : null);
  const editionQuery = useEditionArticles(lang);
  const categoryQuery = useCategoryArticles(data?.category, lang);
  useReportView(data?.id);

  if (isPending) {
    // Same root as the loaded page, so the rail keeps its place while the story loads.
    return (
      <PageWithRail>
        <ArticleSkeleton />
      </PageWithRail>
    );
  }

  if (isError) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return <NotFound />;
    }
    return <StatusMessage title={t('loadingError')} detail={t('tryAgain')} />;
  }

  const article = data;
  // An old slug resolves (via the API's 301) to the story's current one: move the
  // address bar to the canonical URL instead of serving the story at a stale path.
  if (article.slug !== slug) {
    return <Navigate to={localizePath(article.language, `/article/${article.slug}`)} replace />;
  }
  const editionPool = editionQuery.data?.data ?? [];
  const categoryPool = categoryQuery.data?.data ?? [];

  // "More in {category}": same category + edition, current article excluded. If
  // the category is thin, top up with other recent edition stories so the row
  // never looks broken — without ever duplicating an article.
  const sameCategory = categoryPool.filter((a) => a.id !== article.id);
  const usedIds = new Set([article.id, ...sameCategory.map((a) => a.id)]);
  const fallback = editionPool.filter((a) => !usedIds.has(a.id));
  const related = [...sameCategory, ...fallback].slice(0, RELATED_LIMIT);

  // "More from {author}" — other stories by the same writer in this edition.
  const byAuthor = editionPool
    .filter((a) => a.id !== article.id && a.author === article.author)
    .slice(0, AUTHOR_LIMIT);

  const categoryName = categoryLabel(article.category, lang);

  // "More in {category}": a full-width band under both columns, like WSJ.
  const moreInCategory =
    related.length > 0 ? (
      <section className="mt-12 border-t-3 border-ink pt-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="headline text-2xl text-ink">{t('moreIn', { x: categoryName })}</h2>
          <LocaleLink
            to={`/${categorySlug(article.category)}`}
            className="label text-[0.6875rem] text-accent transition-colors hover:text-ink"
          >
            {t('more', { x: categoryName })}
          </LocaleLink>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              variant="standard"
              showImage={Boolean(a.heroImage)}
              showByline={false}
            />
          ))}
        </div>
      </section>
    ) : null;

  return (
    <PageWithRail exclude={article.id} bottom={moreInCategory}>
      {/* MAIN COLUMN — the article, capped at a comfortable reading measure. */}
      <article className="min-w-0">
        <div className="mx-auto max-w-[680px]">
          <header className="border-b border-rule pb-6">
            {article.kicker ? <Kicker className="mb-2 block">{article.kicker}</Kicker> : null}
            <h1 className="headline text-3xl text-ink sm:text-4xl md:text-5xl">{article.title}</h1>
            {article.deck ? (
              <p className="mt-4 font-body text-xl leading-snug text-ink-soft">{article.deck}</p>
            ) : null}
            <Byline
              className="mt-4"
              author={article.author}
              category={article.category}
              publishedAt={article.publishedAt}
              updatedAt={article.updatedAt}
              readingMinutes={readingMinutes(article.body)}
              showPortrait
            />
          </header>

          {article.heroImage ? (
            <figure className="my-8">
              <img
                {...responsiveImage(article.heroImage, IMAGE_SIZES.articleHero, 1200, 800)}
                alt={article.heroImage.alt}
                className="aspect-[3/2] w-full object-cover"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
              {article.heroImage.caption ? (
                <figcaption className="label mt-2 text-[0.6875rem] text-ink-soft">
                  {article.heroImage.caption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          <div className="mt-6">
            <ArticleBody markdown={article.body} />
          </div>

          <CorrectionsNote corrections={article.corrections ?? []} />
          <TopicTags tags={article.tags} />
          <ShareBar
            title={article.title}
            url={new URL(
              localizePath(article.language, `/article/${article.slug}`),
              window.location.origin,
            ).toString()}
          />

          <NewsletterSignup className="mt-10 border-y border-ink py-6" />

          {byAuthor.length > 0 ? (
            <section className="mt-10 border-t border-rule pt-6">
              <h2 className="headline mb-3 text-lg text-ink">
                {t('moreFrom', { x: article.author })}
              </h2>
              <ul className="flex flex-col divide-y divide-rule">
                {byAuthor.map((a) => (
                  <li key={a.id} className="py-3 first:pt-0">
                    <ArticleCard
                      article={a}
                      variant="list"
                      showImage={Boolean(a.heroImage)}
                      showDeck={false}
                      showByline={false}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </article>
    </PageWithRail>
  );
}
