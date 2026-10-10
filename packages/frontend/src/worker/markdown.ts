/**
 * Markdown → HTML for the article text the SEO worker server-renders into the
 * shell, so crawlers (Google News in particular) read the full story without
 * running JavaScript. Covers the subset the newsroom writes: paragraphs, `##`–
 * `####` subheads, quotes, bulleted and numbered lists, images, bold, italics
 * and links. Everything is escaped first; raw HTML is never passed through.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline markup over ALREADY-ESCAPED text. */
function inline(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

type ListKind = 'ul' | 'ol';

export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { kind: ListKind; items: string[] } | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      out.push(`<p>${inline(escapeHtml(paragraph.join(' ')))}</p>`);
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (list) {
      const items = list.items.map((item) => `<li>${inline(escapeHtml(item))}</li>`).join('');
      out.push(`<${list.kind}>${items}</${list.kind}>`);
      list = null;
    }
  };
  const flushBlocks = (): void => {
    flushParagraph();
    flushList();
  };
  const addListItem = (kind: ListKind, text: string): void => {
    flushParagraph();
    if (list?.kind !== kind) {
      flushList();
      list = { kind, items: [] };
    }
    list.items.push(text);
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const heading = /^(#{2,4})\s+(.*)/.exec(line);
    const quote = /^>\s?(.*)/.exec(line);
    const bullet = /^[-*]\s+(.*)/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)/.exec(line);
    const image = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/.exec(line);

    if (!line) {
      flushBlocks();
    } else if (heading?.[1] && heading[2] !== undefined) {
      flushBlocks();
      // `##` is the article's top subhead level (the headline is the page's h1).
      const level = heading[1].length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`);
    } else if (quote?.[1] !== undefined) {
      flushBlocks();
      out.push(`<blockquote><p>${inline(escapeHtml(quote[1]))}</p></blockquote>`);
    } else if (bullet?.[1] !== undefined) {
      addListItem('ul', bullet[1]);
    } else if (numbered?.[1] !== undefined) {
      addListItem('ol', numbered[1]);
    } else if (image?.[2] !== undefined) {
      flushBlocks();
      out.push(
        `<figure><img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1] ?? '')}" /></figure>`,
      );
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushBlocks();
  return out.join('\n');
}

/**
 * The first paragraph of a Markdown body as plain text (markup stripped), for a
 * meta description when the article has neither an SEO description nor a deck.
 */
export function firstParagraphText(markdown: string): string {
  const block = markdown
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !/^(#|>|[-*]\s|\d+[.)]\s|!\[)/.test(part));
  if (!block) return '';
  return block
    .replace(/\s+/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
