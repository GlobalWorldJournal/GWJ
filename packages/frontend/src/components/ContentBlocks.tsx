import type { ContentBlock } from '@gwj/shared-types'

interface ContentBlocksProps {
  blocks: ContentBlock[]
}

/** Renders an article body — an ordered list of typed content blocks. */
export function ContentBlocks({ blocks }: ContentBlocksProps) {
  return (
    <div className="prose-article font-body text-[1.0625rem] leading-relaxed text-ink">
      {blocks.map((block, index) => (
        <ContentBlockView key={index} block={block} />
      ))}
    </div>
  )
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p>{block.text}</p>
    case 'heading':
      return (
        <h2 className="headline mt-8 mb-3 text-2xl text-ink">{block.text}</h2>
      )
    case 'image':
      return (
        <figure className="my-8">
          <img src={block.url} alt={block.alt} className="w-full object-cover" loading="lazy" />
          {block.caption || block.credit ? (
            <figcaption className="label mt-2 text-[0.6875rem] text-muted">
              {block.caption ? <span className="text-ink-soft">{block.caption}</span> : null}
              {block.caption && block.credit ? ' ' : null}
              {block.credit ? <span className="text-muted">{block.credit}</span> : null}
            </figcaption>
          ) : null}
        </figure>
      )
    case 'quote':
      return (
        <blockquote className="my-8 border-l-3 border-accent pl-5">
          <p className="headline text-xl italic leading-snug text-ink">&ldquo;{block.text}&rdquo;</p>
          {block.attribution ? (
            <cite className="label mt-2 block text-[0.6875rem] not-italic text-muted">
              &mdash; {block.attribution}
            </cite>
          ) : null}
        </blockquote>
      )
    case 'list':
      return block.ordered ? (
        <ol className="my-4 ml-5 list-decimal space-y-1">
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul className="my-4 ml-5 list-disc space-y-1">
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}
