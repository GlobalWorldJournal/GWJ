import type { ReactNode } from 'react';
import { TELEGRAM_CHANNEL_URL } from '@gwj/shared-types';
import { formatMonthYear } from '../../lib/format';
import { useLang } from '../../lib/i18n';
import { LocaleLink } from '../../lib/locale';
import type { Block, Inline, RichText, StaticPageContent } from './content/model';

const LINK_CLASS = 'text-accent hover:underline';
const CTA_CLASS =
  'label inline-block border border-ink bg-ink px-5 py-2 text-[0.6875rem] tracking-[0.12em] text-paper transition-colors hover:border-accent hover:bg-accent';
const BODY_CLASS = 'flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink';
const LIST_CLASS = 'list-disc pl-5 flex flex-col gap-1';

/**
 * `prose` is the long-form treatment (policies, About): extra space above each
 * section heading. `plain` is the denser help-page treatment.
 */
export type StaticPageVariant = 'prose' | 'plain';

const VARIANT_CLASSES: Record<StaticPageVariant, { body: string; heading: string }> = {
  prose: {
    body: `prose-static ${BODY_CLASS}`,
    heading: 'headline text-2xl text-ink mt-4',
  },
  plain: {
    body: BODY_CLASS,
    heading: 'headline text-2xl text-ink',
  },
};

/** The page title block shared by every static page. */
export function StaticPageHeader({ title }: { title: string }) {
  return (
    <header className="mb-8 border-b-3 border-ink pb-4">
      <h1 className="headline text-4xl text-ink">{title}</h1>
      <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
        The Global World Journal
      </p>
    </header>
  );
}

function inlineText(inline: Inline): string {
  if (typeof inline === 'string') return inline;
  return inline.kind === 'email' ? inline.address : inline.text;
}

/** Content-derived key: the content is static, so its text identifies each node. */
function richTextKey(text: RichText): string {
  return text.map(inlineText).join('');
}

function blockKey(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
      return `p:${richTextKey(block.text)}`;
    case 'heading':
      return `h:${block.text}`;
    case 'list':
      return `ul:${block.items.map(richTextKey).join('|')}`;
    case 'telegramCta':
      return 'telegram-cta';
  }
}

function renderInline(inline: Inline): ReactNode {
  if (typeof inline === 'string') return inline;
  switch (inline.kind) {
    case 'strong':
      return <strong key={`strong:${inline.text}`}>{inline.text}</strong>;
    case 'email':
      return (
        <a key={`email:${inline.address}`} className={LINK_CLASS} href={`mailto:${inline.address}`}>
          {inline.address}
        </a>
      );
    case 'route':
      return (
        <LocaleLink key={`route:${inline.to}`} to={inline.to} className={LINK_CLASS}>
          {inline.text}
        </LocaleLink>
      );
    case 'resource':
      return (
        <a key={`resource:${inline.href}`} href={inline.href} className={LINK_CLASS}>
          {inline.text}
        </a>
      );
    case 'external':
      return (
        <a
          key={`external:${inline.href}`}
          href={inline.href}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          {inline.text}
        </a>
      );
  }
}

function renderRichText(text: RichText): ReactNode {
  return text.map(renderInline);
}

function StaticBlock({
  block,
  headingClass,
  ctaLabel,
}: {
  block: Block;
  headingClass: string;
  ctaLabel: string;
}) {
  switch (block.kind) {
    case 'paragraph':
      return <p>{renderRichText(block.text)}</p>;
    case 'heading':
      return <h2 className={headingClass}>{block.text}</h2>;
    case 'list':
      return (
        <ul className={LIST_CLASS}>
          {block.items.map((item) => (
            <li key={richTextKey(item)}>{renderRichText(item)}</li>
          ))}
        </ul>
      );
    case 'telegramCta':
      return (
        <p>
          <a
            href={TELEGRAM_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={CTA_CLASS}
          >
            {ctaLabel}
          </a>
        </p>
      );
  }
}

/**
 * Renders one edition's content for a static page. Pages pass the content the
 * active edition selects (`CONTENT[lang]`); the markup and classes are the same
 * in every edition.
 */
export function StaticPage({
  content,
  variant,
  lastUpdated,
}: {
  content: StaticPageContent;
  variant: StaticPageVariant;
  /** ISO date (`YYYY-MM-DD`) of the last revision, shown as month and year. */
  lastUpdated?: string;
}) {
  const { lang, t } = useLang();
  const classes = VARIANT_CLASSES[variant];
  return (
    <div className="mx-auto max-w-3xl">
      <StaticPageHeader title={content.title} />
      <div className={classes.body}>
        {content.blocks.map((block) => (
          <StaticBlock
            key={blockKey(block)}
            block={block}
            headingClass={classes.heading}
            ctaLabel={t('followOnTelegram')}
          />
        ))}
        {lastUpdated ? (
          <p className="label text-[0.6875rem] tracking-[0.12em] text-muted mt-4">
            {t('lastUpdated', { x: formatMonthYear(lastUpdated, lang) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
