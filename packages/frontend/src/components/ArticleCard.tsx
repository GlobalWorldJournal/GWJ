import type { Article } from '@gwj/shared-types';
import { LocaleLink } from '../lib/locale';
import { Kicker } from './Kicker';
import { Byline } from './Byline';
import { IMAGE_SIZES, responsiveImage } from '../lib/responsiveImage';

type CardVariant = 'lead' | 'feature' | 'standard' | 'compact' | 'list';

interface ArticleCardProps {
  article: Article;
  variant?: CardVariant;
  showImage?: boolean;
  showDeck?: boolean;
  showByline?: boolean;
  className?: string;
  /**
   * When true, the hero image loads eagerly with high fetch priority — set this
   * only on the single above-the-fold LCP image (the home lead story). Every
   * other card image lazy-loads.
   */
  priority?: boolean;
}

// Sizes mirror WSJ's Escrow scale (lead 40 / feature 28 / standard 22 / compact 18).
const HEADLINE_SIZE: Record<CardVariant, string> = {
  lead: 'text-[2rem] leading-[1.06] sm:text-[2.5rem]',
  feature: 'text-[1.5rem] leading-[1.1]',
  standard: 'text-[1.375rem] leading-[1.12]',
  compact: 'text-[1.05rem] leading-[1.15]',
  list: 'text-[1.05rem] leading-[1.2]',
};

/** How wide each stacked card variant draws its image. */
const CARD_IMAGE_SIZES: Record<Exclude<CardVariant, 'list'>, string> = {
  lead: IMAGE_SIZES.lead,
  feature: IMAGE_SIZES.feature,
  standard: IMAGE_SIZES.standard,
  compact: IMAGE_SIZES.standard,
};

/**
 * A single story teaser. The `list` variant is a horizontal row with a small
 * square thumbnail on the right (WSJ-style headline list); the others stack the
 * image on top. `showImage`/`showDeck` let the home mix card types.
 */
export function ArticleCard({
  article,
  variant = 'standard',
  showImage = false,
  showDeck = true,
  showByline = true,
  className,
  priority = false,
}: ArticleCardProps) {
  const href = `/article/${article.slug}`;

  if (variant === 'list') {
    return (
      <article className={`group flex items-start justify-between gap-3 ${className ?? ''}`}>
        <div className="min-w-0 flex-1">
          {article.kicker ? <Kicker>{article.kicker}</Kicker> : null}
          <LocaleLink to={href}>
            <h3
              className={`headline mt-0.5 text-ink transition-colors group-hover:text-accent ${HEADLINE_SIZE.list}`}
            >
              {article.title}
            </h3>
          </LocaleLink>
          {showDeck && article.deck ? (
            <p className="mt-1 text-[0.85rem] leading-snug text-muted">{article.deck}</p>
          ) : null}
        </div>
        {showImage && article.heroImage ? (
          <LocaleLink
            to={href}
            className="block shrink-0 overflow-hidden"
            tabIndex={-1}
            aria-hidden="true"
          >
            <img
              {...responsiveImage(article.heroImage, IMAGE_SIZES.thumbnail, 72, 72)}
              alt={article.heroImage.alt}
              className="h-[4.5rem] w-[4.5rem] object-cover"
              loading="lazy"
              decoding="async"
            />
          </LocaleLink>
        ) : null}
      </article>
    );
  }

  return (
    <article className={`group flex flex-col gap-2 ${className ?? ''}`}>
      {showImage && article.heroImage ? (
        <figure className="m-0">
          <LocaleLink to={href} className="block overflow-hidden" tabIndex={-1} aria-hidden="true">
            <img
              {...responsiveImage(article.heroImage, CARD_IMAGE_SIZES[variant], 1200, 800)}
              alt={article.heroImage.alt}
              className="aspect-[3/2] w-full object-cover"
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding="async"
            />
          </LocaleLink>
        </figure>
      ) : null}

      {article.kicker ? <Kicker>{article.kicker}</Kicker> : null}

      <LocaleLink to={href}>
        <h3
          className={`headline text-ink transition-colors group-hover:text-accent ${HEADLINE_SIZE[variant]}`}
        >
          {article.title}
        </h3>
      </LocaleLink>

      {showDeck && article.deck ? (
        <p className="text-ink-soft text-[0.95rem] leading-snug">{article.deck}</p>
      ) : null}

      {showByline ? (
        <Byline
          author={article.author}
          category={article.category}
          publishedAt={article.publishedAt}
        />
      ) : null}
    </article>
  );
}
