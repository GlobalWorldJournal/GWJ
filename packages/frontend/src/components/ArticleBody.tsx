import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ArticleBodyProps {
  /** Article body as GitHub-flavored Markdown. */
  markdown: string
}

/**
 * Renders an article body from a GitHub-flavored Markdown string, styled to
 * match the WSJ-style serif reading column (PT Serif body, serif subheads,
 * left-ruled blockquotes, accent links, full-width images with captions).
 *
 * Uses react-markdown's default safe rendering — raw HTML is NOT enabled
 * (no rehype-raw), so author-supplied HTML is treated as text.
 */
export function ArticleBody({ markdown }: ArticleBodyProps) {
  return (
    <div className="prose-article font-body text-[1.125rem] leading-[1.7] text-ink">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={MARKDOWN_COMPONENTS}>
        {markdown}
      </Markdown>
    </div>
  )
}

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h2 className="headline mt-10 mb-3 text-3xl text-ink">{children}</h2>
  ),
  h2: ({ children }) => (
    <h2 className="headline mt-10 mb-3 text-2xl text-ink">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="headline mt-8 mb-2 text-xl text-ink">{children}</h3>
  ),
  p: ({ children }) => <p>{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
      target={href && /^https?:\/\//.test(href) ? '_blank' : undefined}
      rel={href && /^https?:\/\//.test(href) ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-8 border-l-3 border-accent pl-5 text-ink-soft italic">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="my-4 ml-5 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 ml-5 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  hr: () => <hr className="my-10 border-0 border-t border-rule" />,
  code: ({ children }) => (
    <code className="rounded-sm bg-rule-soft px-1 py-0.5 font-mono text-[0.875em] text-ink">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-6 overflow-x-auto border border-rule bg-rule-soft p-4 font-mono text-[0.875rem] leading-relaxed text-ink">
      {children}
    </pre>
  ),
  img: ({ src, alt, title }) => (
    <figure className="my-8">
      <img
        src={typeof src === 'string' ? src : undefined}
        alt={alt ?? ''}
        className="w-full object-cover"
        loading="lazy"
      />
      {title ? (
        <figcaption className="label mt-2 text-[0.6875rem] text-muted">
          <span className="text-ink-soft">{title}</span>
        </figcaption>
      ) : null}
    </figure>
  ),
}
