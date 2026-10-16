/**
 * What readers (and every place GWJ republishes to) are shown of an article's
 * or an ad's images. Two jobs, on every reader-facing path — the public API,
 * the ActivityPub outbox, the distribution channels, the newsletter:
 *
 * 1. HIDE a file Oxy reported taken down, trashed, deleted or made private
 *    (`availability.ts`): the hero image goes, its body image goes, its
 *    `og:image` goes, an ad gives its slot back. Oxy serves none of those, so
 *    what is hidden is a broken image. Nothing is rewritten: when Oxy restores
 *    a file, it shows again; the newsroom's own (admin) view keeps it.
 * 2. COUNT every legacy-bucket URL handed out, the gate for retiring the bucket.
 */
import type { HeroImage, PublicAdCampaign, Seo } from '@gwj/shared-types';
import { hiddenFiles } from './availability';
import type { LegacyMedia } from './legacy';
import { recordLegacyReads } from './legacyReads';
import type { OxyUrls } from './oxyUrls';

/** The image-bearing fields of an article (or of the public view of one). */
export interface ArticleImages {
  heroImage?: HeroImage | null;
  body: string;
  seo?: Seo;
}

/** A Markdown image: `![alt](url)` or `![alt](url "title")`. */
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;

function hide<T extends ArticleImages>(article: T, hidden: ReadonlySet<string>, urls: OxyUrls): T {
  const isHidden = (url: string | undefined): boolean => {
    const fileId = url ? urls.fileIdOf(url) : null;
    return fileId !== null && hidden.has(fileId);
  };
  if (hidden.size === 0) return article;
  const next: T = { ...article };
  if (article.heroImage && isHidden(article.heroImage.url)) next.heroImage = undefined;
  next.body = article.body.replace(MARKDOWN_IMAGE, (image: string, url: string) =>
    isHidden(url) ? '' : image,
  );
  if (article.seo?.ogImage && isHidden(article.seo.ogImage)) {
    const { ogImage: _hidden, ...seo } = article.seo;
    next.seo = seo;
  }
  return next;
}

function legacyUrlsIn(article: ArticleImages, legacy: LegacyMedia): number {
  return legacy.urlsIn(
    `${article.heroImage?.url ?? ''}\n${article.body}\n${article.seo?.ogImage ?? ''}`,
  ).length;
}

/** Shows articles and ads as readers may see them (see the module header). */
export interface MediaPresenter {
  articles<T extends ArticleImages>(list: readonly T[]): Promise<T[]>;
  article<T extends ArticleImages>(article: T): Promise<T>;
  /** A live ad: none (AdSense fills the slot) when its creative is hidden. */
  ad(campaign: PublicAdCampaign | null): Promise<PublicAdCampaign | null>;
}

export function createMediaPresenter(urls: OxyUrls, legacy: LegacyMedia): MediaPresenter {
  async function articles<T extends ArticleImages>(list: readonly T[]): Promise<T[]> {
    const hidden = await hiddenFiles();
    let legacyReads = 0;
    const shown = list.map((article) => {
      const visible = hide(article, hidden, urls);
      legacyReads += legacyUrlsIn(visible, legacy);
      return visible;
    });
    recordLegacyReads('api', legacyReads);
    return shown;
  }
  return {
    articles,
    async article(article) {
      const [shown] = await articles([article]);
      return shown ?? article;
    },
    async ad(campaign) {
      if (!campaign) return null;
      const fileId = urls.fileIdOf(campaign.imageUrl);
      if (fileId && (await hiddenFiles()).has(fileId)) return null;
      if (legacy.keyOf(campaign.imageUrl)) recordLegacyReads('api', 1);
      return campaign;
    },
  };
}
