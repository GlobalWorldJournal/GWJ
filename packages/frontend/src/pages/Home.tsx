import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CATEGORIES, categorySlug, type Article, type Category } from '@gwj/shared-types'
import { getArticles } from '../lib/api'
import { ArticleCard } from '../components/ArticleCard'
import { WhatsNews } from '../components/WhatsNews'
import { StatusMessage } from '../components/StatusMessage'

function useHomeArticles() {
  return useQuery({
    queryKey: ['articles', 'home'],
    queryFn: ({ signal }) => getArticles({ limit: 40 }, signal),
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

  const articles = [...data.data].sort((a, b) => b.featured - a.featured)

  if (articles.length === 0) {
    return <StatusMessage title="No stories yet." detail="Check back soon." />
  }

  const [lead, ...rest] = articles
  const secondary = rest.slice(0, 4)
  const briefs = rest.slice(0, 8)

  return (
    <div className="flex flex-col gap-10">
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Lead story */}
        <div className="lg:col-span-7 lg:border-r lg:border-rule lg:pr-8">
          {lead ? <ArticleCard article={lead} variant="lead" showImage showDeck /> : null}
        </div>

        {/* Secondary column */}
        <div className="flex flex-col divide-y divide-rule lg:col-span-3 lg:border-r lg:border-rule lg:pr-8">
          {secondary.map((article) => (
            <div key={article.id} className="py-4 first:pt-0">
              <ArticleCard article={article} variant="feature" />
            </div>
          ))}
        </div>

        {/* What's News rail */}
        <div className="lg:col-span-2">
          <WhatsNews articles={briefs} />
        </div>
      </section>

      {CATEGORIES.map((category) => {
        const inCategory = articles.filter((article) => article.category === category).slice(0, 4)
        if (inCategory.length === 0) {
          return null
        }
        return <CategorySection key={category} name={category} articles={inCategory} />
      })}
    </div>
  )
}

function CategorySection({ name, articles }: { name: Category; articles: Article[] }) {
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between border-t-3 border-ink pt-2">
        <h2 className="headline text-xl text-ink">{name}</h2>
        <Link
          to={`/${categorySlug(name)}`}
          className="label text-[0.6875rem] text-accent transition-colors hover:text-ink"
        >
          More {name}
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 divide-y divide-rule sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        {articles.map((article) => (
          <div key={article.id} className="pt-4 first:pt-0 sm:pt-0">
            <ArticleCard
              article={article}
              variant="standard"
              showImage={Boolean(article.heroImage)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
