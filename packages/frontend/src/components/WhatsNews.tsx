import { Link } from 'react-router-dom'
import type { Article } from '@gwj/shared-types'

interface WhatsNewsProps {
  articles: Article[]
  className?: string
}

/** Compact bulleted "What's News" rail of brief items. */
export function WhatsNews({ articles, className }: WhatsNewsProps) {
  if (articles.length === 0) {
    return null
  }

  return (
    <aside className={`border-t-3 border-ink pt-3 ${className ?? ''}`}>
      <h2 className="label mb-3 text-sm font-bold text-ink">What&rsquo;s News</h2>
      <ul className="flex flex-col">
        {articles.map((article) => (
          <li
            key={article.id}
            className="border-b border-rule py-3 last:border-b-0"
          >
            <Link to={`/article/${article.slug}`} className="group flex gap-2">
              <span aria-hidden className="mt-1 font-bold text-accent">
                &bull;
              </span>
              <div>
                <p className="font-body text-[0.95rem] font-bold leading-snug text-ink transition-colors group-hover:text-accent">
                  {article.title}
                </p>
                {article.deck ? (
                  <p className="mt-1 text-[0.85rem] leading-snug text-muted">{article.deck}</p>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
