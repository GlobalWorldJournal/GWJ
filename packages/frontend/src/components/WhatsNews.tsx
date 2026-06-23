import type { Article } from '@gwj/shared-types'
import { LocaleLink } from '../lib/locale'

interface WhatsNewsProps {
  articles: Article[]
  className?: string
}

/**
 * "What's News" rail — a bordered box in the 300px right column, mirroring WSJ.
 * Heavy top rule, boxed, bulleted brief items.
 */
export function WhatsNews({ articles, className }: WhatsNewsProps) {
  if (articles.length === 0) {
    return null
  }

  return (
    <aside className={`border border-rule ${className ?? ''}`}>
      <div className="border-t-3 border-ink px-4 pt-3 pb-2">
        <h2 className="headline text-2xl text-ink">What&rsquo;s News</h2>
      </div>
      <ul className="flex flex-col px-4 pb-2">
        {articles.map((article) => (
          <li key={article.id} className="border-t border-rule py-3">
            <LocaleLink to={`/article/${article.slug}`} className="group flex gap-2">
              <span aria-hidden className="mt-[0.15rem] font-bold text-accent">
                &bull;
              </span>
              <p className="font-body text-[0.95rem] font-semibold leading-snug text-ink transition-colors group-hover:text-accent">
                {article.title}
              </p>
            </LocaleLink>
          </li>
        ))}
      </ul>
    </aside>
  )
}
