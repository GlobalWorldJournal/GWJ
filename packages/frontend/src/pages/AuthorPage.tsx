import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authorSlug, findWriterBySlug } from '@gwj/shared-types'
import { getArticles } from '../lib/api'
import { ArticleCard } from '../components/ArticleCard'
import { StatusMessage } from '../components/StatusMessage'

export function AuthorPage() {
  const { slug = '' } = useParams()
  const writer = findWriterBySlug(slug)

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['articles', 'author', slug],
    queryFn: ({ signal }) => getArticles({ limit: 50 }, signal),
  })

  if (isPending) {
    return <StatusMessage title="Loading&hellip;" />
  }
  if (isError) {
    return (
      <StatusMessage
        title="We couldn&rsquo;t load this author."
        detail={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const articles = data.data.filter((a) => authorSlug(a.author) === slug)
  const name = writer?.name ?? articles[0]?.author

  if (!name) {
    return <StatusMessage title="Author not found." detail="No writer matches this page." />
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-6 text-center">
        <span
          aria-hidden
          className="headline mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-ink/5 text-2xl text-ink"
        >
          {name.charAt(0)}
        </span>
        <h1 className="headline text-4xl text-ink">{name}</h1>
        {writer ? (
          <>
            <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-accent">
              {writer.title}
            </p>
            <p className="mt-3 font-body text-[0.95rem] leading-relaxed text-ink-soft">
              {name} covers {writer.beats.join(', ')} for The Global World Journal.
            </p>
          </>
        ) : null}
      </header>

      {articles.length === 0 ? (
        <StatusMessage title="No stories yet." detail={`${name} hasn’t published here yet.`} />
      ) : (
        <div className="flex flex-col divide-y divide-rule">
          {articles.map((article) => (
            <div key={article.id} className="py-6 first:pt-0">
              <ArticleCard
                article={article}
                variant="feature"
                showImage={Boolean(article.heroImage)}
                showByline={false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
