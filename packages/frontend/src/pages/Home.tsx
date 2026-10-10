import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CATEGORIES,
  categorySlug,
  type Article,
  type Category,
  type Language,
} from '@gwj/shared-types';
import { getArticles } from '../lib/api';
import { useLang } from '../lib/i18n';
import { LocaleLink } from '../lib/locale';
import { categoryLabel } from '../lib/dictionary';
import { ArticleCard } from '../components/ArticleCard';
import { AdSlot } from '../components/AdSlot';
import { MostPopular } from '../components/MostPopular';
import { mostPopularRail, usePopularArticles } from '../lib/popular';
import { StatusMessage } from '../components/StatusMessage';
import { HomeSkeleton } from '../components/Skeletons';

/** Refetch while the tab is open: the newsroom publishes every few minutes, and the
 * global query client's refetchOnWindowFocus is off, so without this the front page
 * never changes until the reader manually reloads. */
const HOME_REFETCH_MS = 3 * 60_000;

/** Stories in the Most Popular rail. */
const POPULAR_SIZE = 6;

function useHomeArticles(lang: Language) {
  return useQuery({
    queryKey: ['articles', 'home', lang],
    // 'latest' (date order), not the API's default 'editorial' (featured first):
    // the default let old, highly-featured seed articles dominate the fetched
    // page, especially in English (169 articles total, most of them old seed
    // data) — isFresh/sortForHome below can't surface what was never fetched.
    queryFn: ({ signal }) => getArticles({ language: lang, limit: 50, sort: 'latest' }, signal),
    refetchInterval: HOME_REFETCH_MS,
  });
}

/**
 * Newest first, `featured` only as a tiebreak: sorting by `featured` alone
 * let old seed stories with a high manual rank bury every new story (which
 * defaults to 0) forever — the front page never looked like it updated.
 */
export function sortForHome(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    const dateDiff =
      Date.parse(b.publishedAt ?? b.createdAt) - Date.parse(a.publishedAt ?? a.createdAt);
    return dateDiff !== 0 ? dateDiff : b.featured - a.featured;
  });
}

/** A section's sparse old stories read as a neglected paper, not "more of the best":
 * a rail or band only shows what's genuinely current, even if that means showing
 * fewer than its usual count, or nothing at all. */
const FRONT_PAGE_WINDOW_MS = 7 * 86_400_000;

export function isFresh(article: Article, now: number): boolean {
  return now - Date.parse(article.publishedAt ?? article.createdAt) <= FRONT_PAGE_WINDOW_MS;
}

export function Home() {
  const { lang, t } = useLang();
  const { data, isPending, isError, error } = useHomeArticles(lang);
  const popular = usePopularArticles(lang, POPULAR_SIZE);

  if (isPending) {
    return <HomeSkeleton />;
  }
  if (isError) {
    return (
      <StatusMessage
        title={t('loadingError')}
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }

  const all = sortForHome(data.data);
  if (all.length === 0) {
    return <StatusMessage title={t('noStories')} />;
  }

  const now = Date.now();
  const opinion = all.filter((a) => a.category === 'Opinion' && isFresh(a, now));
  const news = all.filter((a) => a.category !== 'Opinion');

  const lead = news[0] ?? all[0];
  if (!lead) {
    return <StatusMessage title={t('noStories')} />;
  }
  const rest = news.filter((a) => a.id !== lead.id);
  const leftStack = rest.slice(0, 3);
  const leftList = rest.slice(3, 6);
  const leadBullets = rest.slice(6, 10);
  const centerMore = rest.slice(10, 14); // fills the center column below the lead
  // The most read stories, topped up with current ones only (like every rail).
  const mostPopular = mostPopularRail(
    popular.data?.data ?? [],
    all.filter((a) => isFresh(a, now)),
    POPULAR_SIZE,
  );

  return (
    <div>
      {/* TOP STORIES — WSJ 3-column grid: news stack | lead+image | Opinion rail.
          Uniform gap-6 gutters, no per-column horizontal padding; the vertical
          rules sit in the gutter via border-r so every column aligns. */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_18rem]">
        {/* LEFT — mixed stack: a feature with photo, text headlines, then a
            thumbnail list (varied card types like WSJ). */}
        <div className="flex flex-col divide-y divide-rule">
          {leftStack.map((article, i) => (
            <div key={article.id} className="py-4 first:pt-0">
              <ArticleCard
                article={article}
                variant="feature"
                showImage={i === 0 && Boolean(article.heroImage)}
                showDeck={i === 0}
                showByline={false}
              />
            </div>
          ))}
          {leftList.map((article) => (
            <div key={article.id} className="py-3">
              <ArticleCard
                article={article}
                variant="list"
                showImage={Boolean(article.heroImage)}
                showDeck={false}
                showByline={false}
              />
            </div>
          ))}
          <AdSlot variant="inline" className="pt-5" />
        </div>

        {/* CENTER — lead story with hero image + related bullets */}
        <div className="lg:border-l lg:border-rule lg:pl-6">
          <ArticleCard article={lead} variant="lead" showImage showDeck showByline priority />
          {leadBullets.length > 0 ? (
            <ul className="mt-4 flex flex-col divide-y divide-rule border-t border-rule">
              {leadBullets.map((article) => (
                <li key={article.id} className="py-2.5">
                  <LocaleLink
                    to={`/article/${article.slug}`}
                    className="group flex items-start gap-2 font-body text-[0.95rem] font-semibold leading-snug text-ink transition-colors hover:text-accent"
                  >
                    {/* Fixed width, not just shrink-0: a kicker's own text length
                        ("Tech" vs. "Commentary") otherwise pushes each row's title
                        to a different start position, breaking the column's
                        alignment. Wide enough that real kickers ("Commentary",
                        "World Cup", ~10-11 chars) fit on one line; a longer one
                        still wraps onto a second rather than being cut off. */}
                    <span className="label w-28 shrink-0 text-accent">{article.kicker}</span>
                    <span>{article.title}</span>
                  </LocaleLink>
                </li>
              ))}
            </ul>
          ) : null}
          {centerMore.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-6 border-t border-rule pt-6 sm:grid-cols-2">
              {centerMore.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  variant="standard"
                  showImage={Boolean(article.heroImage)}
                  showByline={false}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* RIGHT — Opinion rail + Most Popular + ad (fills the column) */}
        <div className="flex flex-col gap-8 lg:border-l lg:border-rule lg:pl-6">
          <OpinionRail articles={opinion} title={t('opinion')} />
          <MostPopular articles={mostPopular} title={t('mostPopular')} />
          <AdSlot variant="mrec" sticky />
        </div>
      </section>

      {/* SECTION BANDS — load more on scroll, like WSJ's front page */}
      <SectionBands articles={all} lang={lang} t={t} />
    </div>
  );
}

type Translate = (key: string, vars?: Record<string, string>) => string;

/** Section bands that reveal progressively as the reader scrolls (infinite-scroll feel). */
function SectionBands({
  articles,
  lang,
  t,
}: {
  articles: Article[];
  lang: Language;
  t: Translate;
}) {
  const now = Date.now();
  const fresh = articles.filter((a) => isFresh(a, now));
  const sections = CATEGORIES.filter((c) => c !== 'Opinion').filter((c) =>
    fresh.some((a) => a.category === c),
  );
  const STEP = 2;
  const [visible, setVisible] = useState(STEP);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || visible >= sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + STEP, sections.length));
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, sections.length]);

  return (
    <div className="mt-12 flex flex-col gap-10">
      {sections.slice(0, visible).map((category, idx) => {
        const inCategory = fresh.filter((a) => a.category === category).slice(0, 5);
        return (
          <Fragment key={category}>
            <CategorySection name={category} articles={inCategory} lang={lang} t={t} />
            {/* Bounded wrapper: the leaderboard keeps the sticky property but has
                no taller container to travel within, so it can't float over the
                following sections. */}
            {idx % 2 === 1 ? (
              <div className="my-2">
                <AdSlot variant="leaderboard" />
              </div>
            ) : null}
          </Fragment>
        );
      })}
      {visible < sections.length ? <div ref={sentinelRef} aria-hidden className="h-px" /> : null}
    </div>
  );
}

function OpinionRail({ articles, title }: { articles: Article[]; title: string }) {
  if (articles.length === 0) return null;
  return (
    <section>
      <div className="mb-3 border-t-3 border-ink pt-2">
        <h2 className="headline text-2xl text-ink">{title}</h2>
      </div>
      <ul className="flex flex-col divide-y divide-rule">
        {articles.slice(0, 6).map((article) => (
          <li key={article.id} className="py-3 first:pt-0">
            <LocaleLink to={`/article/${article.slug}`} className="group flex items-start gap-3">
              <span
                aria-hidden
                className="headline mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/5 text-sm text-ink"
              >
                {article.author.charAt(0)}
              </span>
              <div>
                <p className="label text-[0.625rem] text-muted">{article.author}</p>
                <p className="font-body text-[0.95rem] font-semibold italic leading-snug text-ink transition-colors group-hover:text-accent">
                  {article.title}
                </p>
              </div>
            </LocaleLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategorySection({
  name,
  articles,
  lang,
  t,
}: {
  name: Category;
  articles: Article[];
  lang: Language;
  t: Translate;
}) {
  // Varied card types per band, like WSJ: a photo-led lead, a text story with a
  // dek, and a thumbnail list of the rest.
  const label = categoryLabel(name, lang);
  const featured = articles[0];
  const secondary = articles[1];
  const listed = articles.slice(2);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between border-t-3 border-ink pt-2">
        <h2 className="headline text-2xl text-ink">{label}</h2>
        <LocaleLink
          to={`/${categorySlug(name)}`}
          className="label text-[0.6875rem] text-accent transition-colors hover:text-ink"
        >
          {t('more', { x: label })}
        </LocaleLink>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {featured ? (
          <div>
            <ArticleCard
              article={featured}
              variant="standard"
              showImage={Boolean(featured.heroImage)}
              showByline={false}
            />
          </div>
        ) : null}
        {secondary ? (
          <div className="border-t border-rule pt-4 sm:border-l sm:border-t-0 sm:border-rule sm:pl-6 sm:pt-0">
            <ArticleCard article={secondary} variant="standard" showByline={false} />
          </div>
        ) : null}
        {listed.length > 0 ? (
          <div className="flex flex-col divide-y divide-rule border-t border-rule pt-4 sm:border-l sm:border-t-0 sm:border-rule sm:pl-6 sm:pt-0">
            {listed.map((article) => (
              <div key={article.id} className="py-3 first:pt-0">
                <ArticleCard
                  article={article}
                  variant="list"
                  showImage={Boolean(article.heroImage)}
                  showDeck={false}
                  showByline={false}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
