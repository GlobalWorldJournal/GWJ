import { authorSlug, findWriterByName, type Category } from '@gwj/shared-types';
import { useLang } from '../lib/i18n';
import { LocaleLink } from '../lib/locale';
import { categoryLabel, writerTitle } from '../lib/dictionary';
import { formatDate, formatDateTime, wasUpdated, writerPortraitUrl } from '../lib/format';

interface BylineProps {
  author: string;
  category?: Category;
  publishedAt?: string | null;
  /** When given and later than publication, "Updated <when>" is shown. */
  updatedAt?: string;
  /** Minutes to read, shown as "N min read". */
  readingMinutes?: number;
  /** The writer's portrait (article pages; roster writers only). */
  showPortrait?: boolean;
  className?: string;
}

/** Sans-serif byline line: "By Author · Section · Date · N min read". */
export function Byline({
  author,
  category,
  publishedAt,
  updatedAt,
  readingMinutes,
  showPortrait = false,
  className,
}: BylineProps) {
  const { lang, t } = useLang();
  const date = publishedAt ? formatDate(publishedAt, lang) : '';
  const section = category ? categoryLabel(category, lang) : '';
  const writer = showPortrait ? findWriterByName(author) : undefined;
  const portrait = writer ? writerPortraitUrl(writer.name) : null;
  const updated =
    updatedAt && wasUpdated(publishedAt, updatedAt) ? formatDateTime(updatedAt, lang) : '';

  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      {portrait ? (
        <img
          src={portrait}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : null}
      <p className="label text-[0.6875rem] text-ink-soft">
        <LocaleLink
          to={`/author/${authorSlug(author)}`}
          className="text-ink transition-colors hover:text-accent"
        >
          {t('by')} {author}
        </LocaleLink>
        {writer ? <span className="text-muted">, {writerTitle(writer.title, lang)}</span> : null}
        {section ? <span className="text-muted"> · {section}</span> : null}
        {date ? <span className="text-muted"> · {date}</span> : null}
        {readingMinutes ? (
          <span className="text-muted"> · {t('minRead', { x: String(readingMinutes) })}</span>
        ) : null}
        {updated ? <span className="block text-muted">{t('updated', { x: updated })}</span> : null}
      </p>
    </div>
  );
}
