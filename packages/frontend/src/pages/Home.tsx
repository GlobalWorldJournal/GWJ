import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CATEGORIES, categorySlug, type Article, type Category } from '@gwj/shared-types'
import { getArticles } from '../lib/api'
import { ArticleCard } from '../components/ArticleCard'
import { StatusMessage } from '../components/StatusMessage'

function useHomeArticles() {
  return useQuery({
    queryKey: ['articles', 'home'],
    queryFn: ({ signal }) => getArticles({ limit: 50 }, signal),
  })
}

export function Home() {
  const { data, isPending, isError, error } = useHomeArticles()

  if (isPending) {
    return <StatusMessage title="Loading the latest&hellip;" />
  }
  if (isError) {
    return (
      <StatusMessage
        title="We couldn&rsquo;t load the front page."
        detail={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const all = [...data.data].sort((a, b) => b.featured - a.featured)
  if (all.length === 0) {
    return <StatusMessage title="No stories yet." detail="Check back soon." />
  }

  const opinion = all.filter((a) => a.category === 'Opinion')
  const news = all.filter((a) => a.category !== 'Opinion')

  const lead = news[0] ?? all[0]
  if (!lead) {
    return <StatusMessage title="No stories yet." detail="Check back soon." />
  }
  const leftStack = news.filter((a) => a.id !== lead.id).slice(0, 4)
  const leadBullets = news.filter((a) => a.id !== lead.id).slice(4, 8)

  return (
    <div>
      {/* TOP STORIES — WSJ 3-column grid: news stack | lead+image | Opinion rail.
          Uniform gap-8 gutters, no per-column horizontal padding; the vertical
          rules sit in the gutter via border-r so every column aligns. */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[17rem_minmax(0,1fr)_18rem]">
        {/* LEFT — stacked top headlines */}
        <div className="flex flex-col divide-y divide-rule">
          {leftStack.map((article) => (
            <div key={article.id} className="py-4 first:pt-0">
              <ArticleCard article={article} variant="feature" showByline={false} />
            </div>
          ))}
        </div>

        {/* CENTER — lead story with hero image + related bullets */}
        <div className="lg:border-l lg:border-rule lg:pl-8">
          <ArticleCard article={lead} variant="lead" showImage showDeck showByline />
          {leadBullets.length > 0 ? (
            <ul className="mt-4 flex flex-col divide-y divide-rule border-t border-rule">
              {leadBullets.map((article) => (
                <li key={article.id} className="py-2.5">
                  <Link
                    to={`/article/${article.slug}`}
                    className="group flex gap-2 font-body text-[0.95rem] font-semibold leading-snug text-ink transition-colors hover:text-accent"
                  >
                    {article.kicker ? (
                      <span className="label shrink-0 text-accent">{article.kicker}</span>
                    ) : null}
                    <span>{article.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* RIGHT — Opinion rail */}
        <OpinionRail articles={opinion} />
      </section>

      {/* SECTION BANDS — 3-up rows per category, like WSJ's section blocks */}
      <div className="mt-12 flex flex-col gap-10">
        {CATEGORIES.filter((c) => c !== 'Opinion').map((category) => {
          const inCategory = all.filter((a) => a.category === category).slice(0, 3)
          if (inCategory.length === 0) return null
          return <CategorySection key={category} name={category} articles={inCategory} />
        })}
      </div>
    </div>
  )
}

function OpinionRail({ articles }: { articles: Article[] }) {
  if (articles.length === 0) return null
  return (
    <aside className="lg:border-l lg:border-rule lg:pl-8">
      <div className="mb-3 border-t-3 border-ink pt-2">
        <h2 className="headline text-2xl text-ink">Opinion</h2>
      </div>
      <ul className="flex flex-col divide-y divide-rule">
        {articles.slice(0, 6).map((article) => (
          <li key={article.id} className="py-3 first:pt-0">
            <Link to={`/article/${article.slug}`} className="group flex items-start gap-3">
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
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function CategorySection({ name, articles }: { name: Category; articles: Article[] }) {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between border-t-3 border-ink pt-2">
        <h2 className="headline text-2xl text-ink">{name}</h2>
        <Link
          to={`/${categorySlug(name)}`}
          className="label text-[0.6875rem] text-accent transition-colors hover:text-ink"
        >
          More {name}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        {articles.map((article, index) => (
          <div
            key={article.id}
            className={
              index > 0
                ? 'border-t border-rule pt-4 sm:border-t-0 sm:border-l sm:border-rule sm:pl-8 sm:pt-0'
                : ''
            }
          >
            <ArticleCard
              article={article}
              variant="standard"
              showImage={index === 0 && Boolean(article.heroImage)}
              showByline={false}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
