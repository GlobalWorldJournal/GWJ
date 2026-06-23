import { useEffect, useRef, useState } from 'react'
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
  const rest = news.filter((a) => a.id !== lead.id)
  const leftStack = rest.slice(0, 3)
  const leftList = rest.slice(3, 6)
  const leadBullets = rest.slice(6, 10)

  return (
    <div>
      {/* TOP STORIES — WSJ 3-column grid: news stack | lead+image | Opinion rail.
          Uniform gap-8 gutters, no per-column horizontal padding; the vertical
          rules sit in the gutter via border-r so every column aligns. */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[17rem_minmax(0,1fr)_18rem]">
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

      {/* SECTION BANDS — load more on scroll, like WSJ's front page */}
      <SectionBands articles={all} />
    </div>
  )
}

/** Section bands that reveal progressively as the reader scrolls (infinite-scroll feel). */
function SectionBands({ articles }: { articles: Article[] }) {
  const sections = CATEGORIES.filter((c) => c !== 'Opinion').filter((c) =>
    articles.some((a) => a.category === c),
  )
  const STEP = 2
  const [visible, setVisible] = useState(STEP)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || visible >= sections.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + STEP, sections.length))
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible, sections.length])

  return (
    <div className="mt-12 flex flex-col gap-10">
      {sections.slice(0, visible).map((category) => {
        const inCategory = articles.filter((a) => a.category === category).slice(0, 5)
        return <CategorySection key={category} name={category} articles={inCategory} />
      })}
      {visible < sections.length ? <div ref={sentinelRef} aria-hidden className="h-px" /> : null}
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
  // Varied card types per band, like WSJ: a photo-led lead, a text story with a
  // dek, and a thumbnail list of the rest.
  const featured = articles[0]
  const secondary = articles[1]
  const listed = articles.slice(2)

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
          <div className="border-t border-rule pt-4 sm:border-l sm:border-t-0 sm:border-rule sm:pl-8 sm:pt-0">
            <ArticleCard article={secondary} variant="standard" showByline={false} />
          </div>
        ) : null}
        {listed.length > 0 ? (
          <div className="flex flex-col divide-y divide-rule border-t border-rule pt-4 sm:border-l sm:border-t-0 sm:border-rule sm:pl-8 sm:pt-0">
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
  )
}
