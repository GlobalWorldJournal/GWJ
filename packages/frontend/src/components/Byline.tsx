import { Link } from 'react-router-dom'
import { authorSlug } from '@gwj/shared-types'

interface BylineProps {
  author: string
  category?: string
  publishedAt?: string | null
  className?: string
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Sans-serif byline line: "By Author · Category · Date". */
export function Byline({ author, category, publishedAt, className }: BylineProps) {
  const date = publishedAt ? formatDate(publishedAt) : ''
  return (
    <p className={`label text-[0.6875rem] text-ink-soft ${className ?? ''}`}>
      <Link to={`/author/${authorSlug(author)}`} className="text-ink transition-colors hover:text-accent">
        By {author}
      </Link>
      {category ? <span className="text-muted"> · {category}</span> : null}
      {date ? <span className="text-muted"> · {date}</span> : null}
    </p>
  )
}
