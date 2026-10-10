import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { categorySlug, telegramChannelFor, type Category, type Language } from '@gwj/shared-types';
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
import { AdSlot } from '../components/AdSlot';
import { MostPopular } from '../components/MostPopular';
import { mostPopularRail, usePopularArticles, useReportView } from '../lib/popular';
import { StatusMessage } from '../components/StatusMessage';
import { ArticleSkeleton } from '../components/Skeletons';
import { NotFound } from './NotFound';

// How many cross-link cards each section renders. The "More in {category}" grid
// targets a 4-up row; "More from {author}" stays a short list.
const RELATED_LIMIT = 6;
const POPULAR_LIMIT = 6;
const AUTHOR_LIMIT = 4;
const RAIL_POOL_LIMIT = 50;

/**
 * Edition-aware pool of recent articles used to fill the rail (Most Popular) and
 * the cross-link sections. Fetched with React Query AFTER mount so it never
 * blocks the article render or the LCP hero. Keyed by the active edition so a
 * `/es` article only ever surfaces Spanish-edition stories.
 */
function useEditionArticles(lang: Language) {
  return useQuery({
    queryKey: ['articles', 'edition', lang],
    queryFn: ({ signal }) => getArticles({ language: lang, limit: RAIL_POOL_LIMIT }, signal),
    staleTime: 60_000,
  });
}

/** Same-category, same-edition stories, fetched only once the article resolves. */
function useCategoryArticles(category: Category | undefined, lang: Language) {
  return useQuery({
    queryKey: ['articles', 'related', category, lang],
    queryFn: ({ signal }) =>
      getArticles({ category, language: lang, limit: RAIL_POOL_LIMIT }, signal),
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
  // One more than the rail holds: the story being read is left out of it.
  const popularQuery = usePopularArticles(lang, POPULAR_LIMIT + 1);
  useReportView(data?.id);

  if (isPending) {
    return <ArticleSkeleton />;
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

  // Most Popular: the edition's most read stories, excluding the current article.
  const mostPopular = mostPopularRail(
    popularQuery.data?.data ?? [],
    editionPool,
    POPULAR_LIMIT,
    article.id,
  );

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

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
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
              {article.heroImage.caption || article.heroImage.credit ? (
                <figcaption className="label mt-2 text-[0.6875rem] text-muted">
                  {article.heroImage.caption ? (
                    <span className="text-ink-soft">{article.heroImage.caption}</span>
                  ) : null}
                  {article.heroImage.caption && article.heroImage.credit ? ' ' : null}
                  {article.heroImage.credit ? (
                    <span className="text-muted">{article.heroImage.credit}</span>
                  ) : null}
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

      {/* RIGHT RAIL — Most Popular scrolls away; the ad + follow card pin together
          as one sticky block (so the card never overlaps the ad). Desktop only;
          on mobile it stacks below the article (after the related grid). */}
      <aside className="mt-12 flex flex-col gap-8 lg:mt-0 lg:border-l lg:border-rule lg:pl-8">
        <MostPopular articles={mostPopular} title={t('mostPopular')} />
        <div className="flex flex-col gap-8 lg:sticky lg:top-20">
          <AdSlot variant="mrec" sticky={false} />
          <FollowCard
            href={telegramChannelFor(lang).url}
            title={t('follow')}
            line={t('railFollowLine')}
            ctaLabel={t('followOnTelegram')}
          />
        </div>
      </aside>

      {/* BOTTOM — "More in {category}": same-edition grid of cards. Spans both
          columns so it reads as a full-width footer band like WSJ. */}
      {related.length > 0 ? (
        <section className="mt-12 border-t-3 border-ink pt-6 lg:col-span-2">
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
      ) : null}
    </div>
  );
}

/**
 * Compact "Follow on Telegram" call-to-action for the rail. The audience-follow
 * channel is Telegram (no email); this is a presentational CTA that opens the
 * channel in a new tab. The URL comes from the shared `telegramChannelFor`
 * helper (the edition's own channel) — no new form/endpoint, no over-build.
 */
function FollowCard({
  title,
  line,
  ctaLabel,
  href,
}: {
  title: string;
  line: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    <section className="border border-rule bg-ink/[0.02] p-5 text-center">
      <p className="label mb-2 text-[0.625rem] tracking-[0.16em] text-accent">{title}</p>
      <p className="headline text-lg leading-snug text-ink">{line}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="label mt-4 inline-block border border-ink bg-ink px-5 py-2 text-[0.6875rem] tracking-[0.12em] text-paper transition-colors hover:bg-accent hover:border-accent"
      >
        {ctaLabel}
      </a>
    </section>
  );
}
