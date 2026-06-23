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

const HEADLINE_SIZE: Record<CardVariant, string> = {
  lead: 'text-4xl md:text-5xl lg:text-6xl',
  feature: 'text-2xl md:text-3xl',
  standard: 'text-xl md:text-2xl',
  compact: 'text-base md:text-lg',
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
        <Link to={href} className="block overflow-hidden">
          <img
            src={article.heroImage.url}
            alt={article.heroImage.alt}
            className="aspect-[3/2] w-full object-cover"
            loading="lazy"
          />
        </Link>
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
