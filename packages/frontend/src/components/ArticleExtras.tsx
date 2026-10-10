import { MENTION_HANDLE, type Correction } from '@gwj/shared-types';
import { useLang } from '../lib/i18n';
import { LocaleLink } from '../lib/locale';
import { formatDateTime } from '../lib/format';
import { EmailIcon, LinkedInIcon, MentionIcon, ShareIcon, TelegramIcon, XIcon } from './SocialIcons';

/** Public corrections, dated, below the story (newspaper practice). */
export function CorrectionsNote({ corrections }: { corrections: readonly Correction[] }) {
  const { lang, t } = useLang();
  if (corrections.length === 0) return null;
  return (
    <section className="mt-10 border-t border-rule pt-4" aria-labelledby="corrections-heading">
      <h2 id="corrections-heading" className="label mb-2 text-[0.6875rem] text-ink">
        {t('corrections')}
      </h2>
      <ul className="flex flex-col gap-2 font-body text-[0.95rem] italic text-ink-soft">
        {corrections.map((correction) => (
          <li key={correction.at}>
            <span className="label mr-2 not-italic text-[0.625rem] text-muted">
              {formatDateTime(correction.at, lang)}
            </span>
            {correction.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The story's tags, each a link to every story with that tag. */
export function TopicTags({ tags }: { tags: readonly string[] }) {
  const { t } = useLang();
  if (tags.length === 0) return null;
  return (
    <nav className="mt-8" aria-label={t('topics')}>
      <ul className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li key={tag}>
            <LocaleLink
              to={`/tag/${encodeURIComponent(tag)}`}
              className="label inline-block border border-rule px-2 py-1 text-[0.625rem] text-ink-soft transition-colors hover:border-accent hover:text-accent"
            >
              {tag}
            </LocaleLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface ShareBarProps {
  title: string;
  /** The story's absolute, canonical URL. */
  url: string;
}

const SHARE_TARGETS = [
  {
    name: 'X',
    href: (u: string, t: string) => `https://x.com/intent/post?url=${u}&text=${t}`,
    Icon: XIcon,
  },
  {
    name: 'LinkedIn',
    href: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    Icon: LinkedInIcon,
  },
  {
    name: 'Telegram',
    href: (u: string, t: string) => `https://t.me/share/url?url=${u}&text=${t}`,
    Icon: TelegramIcon,
  },
  {
    // Confirmed against Mention's own docs (packages/frontend/docs/INTENT_URL.md
    // in the Mention repo): mention.earth/compose?text=&url=&via=.
    name: 'Mention',
    href: (u: string, t: string) => `https://mention.earth/compose?text=${t}&url=${u}&via=${MENTION_HANDLE.slice(1)}`,
    Icon: MentionIcon,
  },
] as const;

/**
 * Share the story: the device's own share sheet where the browser has one,
 * plus plain links (they work without JavaScript and never load a third-party
 * script or tracker).
 */
export function ShareBar({ title, url }: ShareBarProps) {
  const { t } = useLang();
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const canShareNatively =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const iconClass = 'h-[18px] w-[18px] text-ink-soft transition-colors group-hover:text-accent';
  const linkClass = 'group inline-flex items-center justify-center';

  return (
    <nav
      className="mt-8 flex flex-wrap items-center gap-4 border-y border-rule py-3"
      aria-label={t('share')}
    >
      <span className="label text-[0.6875rem] text-ink">{t('share')}</span>
      {canShareNatively ? (
        <button
          type="button"
          className={linkClass}
          aria-label={t('shareNative')}
          onClick={() => {
            navigator.share({ title, url }).catch((err: unknown) => {
              // Closing the share sheet rejects with AbortError: nothing to do.
              if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
            });
          }}
        >
          <ShareIcon className={iconClass} />
        </button>
      ) : null}
      {SHARE_TARGETS.map((target) => (
        <a
          key={target.name}
          href={target.href(encodedUrl, encodedTitle)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('shareVia', { x: target.name })}
          className={linkClass}
        >
          <target.Icon className={iconClass} />
        </a>
      ))}
      <a
        href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`}
        aria-label={t('shareByEmail')}
        className={linkClass}
      >
        <EmailIcon className={iconClass} />
      </a>
    </nav>
  );
}
