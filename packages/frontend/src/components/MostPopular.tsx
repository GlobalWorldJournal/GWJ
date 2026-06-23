import type { Article } from '@gwj/shared-types'
import { LocaleLink } from '../lib/locale'

interface MostPopularProps {
  articles: Article[]
  title: string
}

/**
 * "Most Popular" numbered list — a rail module that fills a right column.
 * Shared by the home front page and the article page rail so the ranking logic
 * lives in exactly one place. Renders nothing when there are no articles.
 */
export function MostPopular({ articles, title }: MostPopularProps) {
  if (articles.length === 0) {
    return null
  }
  return (
    <section>
      <div className="mb-3 border-t-3 border-ink pt-2">
        <h2 className="headline text-2xl text-ink">{title}</h2>
      </div>
      <ol className="flex flex-col divide-y divide-rule">
        {articles.map((article, i) => (
          <li key={article.id} className="py-3 first:pt-0">
            <LocaleLink to={`/article/${article.slug}`} className="group flex items-start gap-3">
              <span aria-hidden className="headline text-2xl leading-none text-muted/60">
                {i + 1}
              </span>
              <p className="font-body text-[0.95rem] font-semibold leading-snug text-ink transition-colors group-hover:text-accent">
                {article.title}
              </p>
            </LocaleLink>
          </li>
        ))}
      </ol>
    </section>
  )
}
