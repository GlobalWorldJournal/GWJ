import { Link } from 'react-router-dom'
import type { Article } from '@gwj/shared-types'
import { Kicker } from './Kicker'
import { Byline } from './Byline'

type CardVariant = 'lead' | 'feature' | 'standard' | 'compact'

interface ArticleCardProps {
  article: Article
  variant?: CardVariant
  showImage?: boolean
  showDeck?: boolean
  showByline?: boolean
  className?: string
}

// Sizes mirror WSJ's Escrow scale (lead 40 / feature 28 / standard 22 / compact 18).
const HEADLINE_SIZE: Record<CardVariant, string> = {
  lead: 'text-[2rem] leading-[1.06] sm:text-[2.5rem]',
  feature: 'text-[1.5rem] leading-[1.1]',
  standard: 'text-[1.375rem] leading-[1.12]',
  compact: 'text-[1.05rem] leading-[1.15]',
}

/** A single story teaser used across the home page, category pages and search. */
export function ArticleCard({
  article,
  variant = 'standard',
  showImage = false,
  showDeck = true,
  showByline = true,
  className,
}: ArticleCardProps) {
  const href = `/article/${article.slug}`

  return (
    <article className={`group flex flex-col gap-2 ${className ?? ''}`}>
      {showImage && article.heroImage ? (
        <figure className="m-0">
          <Link to={href} className="block overflow-hidden">
            <img
              src={article.heroImage.url}
              alt={article.heroImage.alt}
              className="aspect-[3/2] w-full object-cover"
              loading="lazy"
            />
          </Link>
          {article.heroImage.credit ? (
            <figcaption className="mt-1 text-[0.6875rem] leading-tight text-muted">
              {article.heroImage.credit}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {article.kicker ? <Kicker>{article.kicker}</Kicker> : null}

      <Link to={href}>
        <h3
          className={`headline text-ink transition-colors group-hover:text-accent ${HEADLINE_SIZE[variant]}`}
        >
          {article.title}
        </h3>
      </Link>

      {showDeck && article.deck ? (
        <p className="text-ink-soft text-[0.95rem] leading-snug">{article.deck}</p>
      ) : null}

      {showByline ? (
        <Byline author={article.author} category={article.category} publishedAt={article.publishedAt} />
      ) : null}
    </article>
  )
}
