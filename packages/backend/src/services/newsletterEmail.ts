import { articlePublicUrl, localePrefix, type Article, type Language } from '@gwj/shared-types';
import { escapeHtml } from '../activitypub/documents';
import { NEWSLETTER_COPY } from './newsletterCopy';
import type { EmailMessage } from './emailSender';

const INK = '#111111';
const MUTED = '#666666';
const ACCENT = '#b31217';
const RULE = '#cccccc';
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Stories in one issue: a lead and the briefs under it. */
export const DIGEST_MAX_STORIES = 8;

function shell(language: Language, title: string, inner: string, footer: string): string {
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;">
<tr><td style="padding:24px 24px 12px;border-bottom:3px double ${INK};text-align:center;font-family:${SERIF};font-size:26px;font-weight:bold;color:${INK};">The Global World Journal</td></tr>
${inner}
<tr><td style="padding:16px 24px 24px;border-top:1px solid ${RULE};font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED};">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

/** The double opt-in email: one button carrying the signed confirmation link. */
export function renderConfirmationEmail(
  language: Language,
  confirmUrl: string,
  to: string,
): EmailMessage {
  const copy = NEWSLETTER_COPY[language];
  const inner = `<tr><td style="padding:24px;font-family:${SERIF};font-size:17px;line-height:1.5;color:${INK};">
<p style="margin:0 0 20px;">${escapeHtml(copy.confirmIntro)}</p>
<p style="margin:0 0 20px;"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:${INK};color:#ffffff;font-family:${SANS};font-size:13px;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;padding:12px 22px;">${escapeHtml(copy.confirmButton)}</a></p>
<p style="margin:0;font-family:${SANS};font-size:13px;color:${MUTED};">${escapeHtml(copy.confirmIgnore)}</p>
</td></tr>`;
  return {
    to,
    subject: copy.confirmSubject,
    html: shell(language, copy.confirmSubject, inner, escapeHtml(copy.confirmIgnore)),
    text: `${copy.confirmIntro}\n\n${copy.confirmButton}: ${confirmUrl}\n\n${copy.confirmIgnore}\n`,
  };
}

export interface DigestInput {
  language: Language;
  articles: readonly Article[];
  domain: string;
  /** The reader-facing page that confirms an unsubscribe (linked in the body). */
  unsubscribePageUrl: string;
  /** The API endpoint a mail client POSTs to for one-click unsubscribe (RFC 8058). */
  unsubscribeApiUrl: string;
  to: string;
}

/** One issue of the daily newsletter: the lead story with its image, then the briefs. */
export function renderDigestEmail(input: DigestInput): EmailMessage {
  const { language, articles, domain } = input;
  const copy = NEWSLETTER_COPY[language];
  const link = (a: Article) => articlePublicUrl(domain, language, a.slug);
  const lead = articles[0];
  const subject = lead ? `${copy.digestName}: ${lead.title}` : copy.digestName;

  const rows = articles
    .map((article, index) => {
      const url = escapeHtml(link(article));
      const image =
        index === 0 && article.heroImage
          ? `<a href="${url}"><img src="${escapeHtml(article.heroImage.url)}" alt="${escapeHtml(article.heroImage.alt || article.title)}" width="552" style="display:block;width:100%;height:auto;margin:0 0 12px;border:0;"></a>`
          : '';
      const deck = article.deck
        ? `<p style="margin:6px 0 0;font-family:${SERIF};font-size:16px;line-height:1.45;color:${INK};">${escapeHtml(article.deck)}</p>`
        : '';
      const size = index === 0 ? 26 : 20;
      return `<tr><td style="padding:20px 24px;border-bottom:1px solid ${RULE};">
${image}<p style="margin:0 0 4px;font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${ACCENT};">${escapeHtml(article.category)}</p>
<a href="${url}" style="font-family:${SERIF};font-size:${size}px;font-weight:bold;line-height:1.2;color:${INK};text-decoration:none;">${escapeHtml(article.title)}</a>${deck}
</td></tr>`;
    })
    .join('\n');

  const footer = `${escapeHtml(copy.digestFooter)} <a href="${escapeHtml(input.unsubscribePageUrl)}" style="color:${MUTED};">${escapeHtml(copy.unsubscribe)}</a>`;
  const text =
    articles.map((a) => `${a.title}\n${a.deck ? `${a.deck}\n` : ''}${link(a)}\n`).join('\n') +
    `\n${copy.digestFooter}\n${copy.unsubscribe}: ${input.unsubscribePageUrl}\n`;

  return {
    to: input.to,
    subject,
    html: shell(language, subject, rows, footer),
    text,
    headers: {
      'List-Unsubscribe': `<${input.unsubscribeApiUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/** The reader-facing path for an edition's page, e.g. `/es/newsletter/confirm`. */
export function newsletterPageUrl(domain: string, language: Language, page: string): string {
  return `https://${domain}${localePrefix(language)}/newsletter/${page}`;
}
