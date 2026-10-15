import { useQuery } from '@tanstack/react-query';
import { telegramChannelFor, type Language } from '@gwj/shared-types';
import { getArticles } from '../lib/api';
import { useLang } from '../lib/i18n';
import { mostPopularRail, usePopularArticles } from '../lib/popular';
import { AdSlot } from './AdSlot';
import { MostPopular } from './MostPopular';
import { Bar } from './Skeletons';

const POPULAR_LIMIT = 6;
const RAIL_POOL_LIMIT = 50;
const POPULAR_RANKS = Array.from({ length: POPULAR_LIMIT }, (_, i) => i + 1);

/**
 * Edition-aware pool of recent articles used to fill the rail (Most Popular) and
 * the article page's cross-link sections. Fetched with React Query AFTER mount so
 * it never blocks a page render or the LCP hero. Keyed by the active edition so a
 * `/es` page only ever surfaces Spanish-edition stories.
 */
export function useEditionArticles(lang: Language) {
  return useQuery({
    queryKey: ['articles', 'edition', lang],
    queryFn: ({ signal }) => getArticles({ language: lang, limit: RAIL_POOL_LIMIT }, signal),
    staleTime: 60_000,
  });
}

/** Grey placeholder with the real module's footprint, so the rail never jumps. */
function PopularSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mb-3 border-t-3 border-ink pt-2">
        <Bar className="h-7 w-32" />
      </div>
      <div className="flex flex-col divide-y divide-rule">
        {POPULAR_RANKS.map((rank) => (
          <div key={rank} className="flex items-start gap-3 py-3 first:pt-0">
            <Bar className="h-6 w-4 shrink-0" />
            <div className="flex flex-1 flex-col gap-2">
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The reader pages' right column: Most Popular scrolls away; the ad and the follow
 * card pin together as one sticky block (so the card never overlaps the ad).
 * `exclude` leaves the story being read out of the ranking.
 */
export function SiteRail({ exclude }: { exclude?: string }) {
  const { lang, t } = useLang();
  const popular = usePopularArticles(lang, POPULAR_LIMIT + 1);
  const edition = useEditionArticles(lang);
  const loading = popular.isPending || edition.isPending;
  const mostPopular = mostPopularRail(
    popular.data?.data ?? [],
    edition.data?.data ?? [],
    POPULAR_LIMIT,
    exclude,
  );

  return (
    <aside className="mt-12 flex flex-col gap-8 lg:mt-0 lg:border-l lg:border-rule lg:pl-8">
      {loading ? (
        <PopularSkeleton />
      ) : (
        <MostPopular articles={mostPopular} title={t('mostPopular')} />
      )}
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
  );
}

/**
 * Compact "Follow on Telegram" call-to-action for the rail. The audience-follow
 * channel is Telegram; this opens the edition's own channel in a new tab.
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
