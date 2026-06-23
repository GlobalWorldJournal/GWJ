import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getArticle, ApiRequestError } from '../lib/api'
import { Kicker } from '../components/Kicker'
import { Byline } from '../components/Byline'
import { ArticleBody } from '../components/ArticleBody'
import { AdSlot } from '../components/AdSlot'
import { StatusMessage } from '../components/StatusMessage'
import { ArticleSkeleton } from '../components/Skeletons'
import { NotFound } from './NotFound'

export function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['article', slug],
    queryFn: ({ signal }) => {
      if (!slug) {
        throw new Error('Missing article slug')
      }
      return getArticle(slug, signal)
    },
    enabled: Boolean(slug),
  })

  if (isPending) {
    return <ArticleSkeleton />
  }

  if (isError) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return <NotFound />
    }
    return (
      <StatusMessage
        title="We couldn&rsquo;t load this article."
        detail={error instanceof Error ? error.message : undefined}
      />
    )
  }

  return (
    <article className="mx-auto max-w-[680px]">
      <header className="border-b border-rule pb-6">
        {data.kicker ? <Kicker className="mb-2 block">{data.kicker}</Kicker> : null}
        <h1 className="headline text-3xl text-ink sm:text-4xl md:text-5xl">{data.title}</h1>
        {data.deck ? (
          <p className="mt-4 font-body text-xl leading-snug text-ink-soft">{data.deck}</p>
        ) : null}
        <Byline
          className="mt-4"
          author={data.author}
          category={data.category}
          publishedAt={data.publishedAt}
        />
      </header>

      {data.heroImage ? (
        <figure className="my-8">
          <img
            src={data.heroImage.url}
            alt={data.heroImage.alt}
            className="w-full object-cover"
          />
          {data.heroImage.caption || data.heroImage.credit ? (
            <figcaption className="label mt-2 text-[0.6875rem] text-muted">
              {data.heroImage.caption ? (
                <span className="text-ink-soft">{data.heroImage.caption}</span>
              ) : null}
              {data.heroImage.caption && data.heroImage.credit ? ' ' : null}
              {data.heroImage.credit ? <span className="text-muted">{data.heroImage.credit}</span> : null}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      <div className="mt-6">
        <ArticleBody markdown={data.body} />
      </div>

      <AdSlot variant="leaderboard" className="mt-10 border-t border-rule pt-8" />
    </article>
  )
}
