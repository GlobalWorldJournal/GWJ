import { useQuery } from '@tanstack/react-query';
import { getArticles } from '../../lib/api';
import { useLang } from '../../lib/i18n';
import { LocaleLink } from '../../lib/locale';
import type { HouseAd, HouseAdArt, HouseAdLink } from './houseAds';

const NEWS_PHOTO_COUNT = 5;

const BUTTON_BASE =
  'label inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-[0.6875rem] font-bold tracking-[0.08em]';

interface NewsPhoto {
  id: string;
  imageUrl: string;
}

/** The newest stories that have a photo, for ads that bring no picture of their own. */
function useNewsPhotos(enabled: boolean): NewsPhoto[] {
  const { lang } = useLang();
  const { data } = useQuery({
    queryKey: ['house-ad', 'news-photos', lang],
    queryFn: ({ signal }) => getArticles({ language: lang, sort: 'latest', limit: 20 }, signal),
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  });
  const photos: NewsPhoto[] = [];
  for (const article of data?.data ?? []) {
    if (article.heroImage && photos.length < NEWS_PHOTO_COUNT) {
      photos.push({ id: article.id, imageUrl: article.heroImage.url });
    }
  }
  return photos;
}

function AdLinkButton({
  link,
  label,
  className,
}: {
  link: HouseAdLink;
  label: string;
  className: string;
}) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="sponsored noopener noreferrer" className={className}>
        {label}
      </a>
    );
  }
  return (
    <LocaleLink to={link.href} className={className}>
      {label}
    </LocaleLink>
  );
}

/** Overlapping news photos: a strip above the copy in narrow slots, a cluster beside it in wide ones. */
function PhotoStrip({ photos }: { photos: readonly NewsPhoto[] }) {
  if (photos.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      className="order-first flex w-full items-center -space-x-4 px-4 pt-5 @[560px]:order-none @[560px]:w-[34%] @[560px]:shrink-0 @[560px]:justify-center @[560px]:-space-x-6 @[560px]:p-0"
    >
      {photos.map((photo) => (
        <img
          key={photo.id}
          src={photo.imageUrl}
          alt=""
          loading="lazy"
          draggable={false}
          className="size-14 rounded-full object-cover ring-2 ring-white @[560px]:size-20"
        />
      ))}
    </div>
  );
}

/** The ad's own picture: a banner above the copy in narrow slots, a full-height panel beside it in wide ones. */
function Art({ art }: { art: HouseAdArt }) {
  const { lang } = useLang();
  return (
    <img
      src={art.src}
      alt={art.alt[lang]}
      loading="lazy"
      draggable={false}
      className="order-first h-28 w-full object-cover @[560px]:order-none @[560px]:h-auto @[560px]:w-[34%] @[560px]:shrink-0"
    />
  );
}

/**
 * The one house-ad unit. Every ad fills it the same way: a picture, the copy
 * with up to two buttons, and, once the slot is wide, the selling points on the
 * left. The layout follows the slot's own width, so any ad drops into any slot.
 */
export function HouseAdView({ ad }: { ad: HouseAd }) {
  const { lang } = useLang();
  const copy = ad.copy[lang];
  const photos = useNewsPhotos(!ad.art);
  return (
    <div className="@container w-full">
      <div className="flex min-h-[191px] w-full flex-col items-stretch overflow-hidden border border-rule bg-white @[560px]:flex-row @[560px]:items-center">
        {copy.features ? (
          <ul className="hidden w-1/4 shrink-0 flex-col justify-center gap-2 pl-[34px] text-left font-label text-[0.6875rem] text-muted @[920px]:flex">
            {copy.features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span aria-hidden="true" className="text-accent">
                  ▪
                </span>
                {feature}
              </li>
            ))}
          </ul>
        ) : null}
        {ad.art ? null : <PhotoStrip photos={photos} />}
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center gap-3 px-4 py-5 @[560px]:px-6 @[920px]:items-center @[920px]:text-center">
          <div>
            <h3 className="headline text-xl text-ink @[560px]:text-2xl">
              {copy.compact ? <span className="@[560px]:hidden">{copy.compact.title}</span> : null}
              <span className={copy.compact ? 'hidden @[560px]:inline' : undefined}>
                {copy.title}
              </span>
            </h3>
            <p className="mt-1 font-label text-sm text-muted">
              {copy.compact ? (
                <span className="@[560px]:hidden">{copy.compact.subtitle}</span>
              ) : null}
              <span className={copy.compact ? 'hidden @[560px]:inline' : undefined}>
                {copy.subtitle}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <AdLinkButton
              link={ad.primary}
              label={copy.primaryLabel}
              className={`${BUTTON_BASE} bg-ink text-white hover:bg-accent`}
            />
            {ad.secondary && copy.secondaryLabel ? (
              <AdLinkButton
                link={ad.secondary}
                label={copy.secondaryLabel}
                className={`${BUTTON_BASE} !px-2 text-ink hover:text-accent`}
              />
            ) : null}
          </div>
        </div>
        {ad.art ? <Art art={ad.art} /> : null}
      </div>
    </div>
  );
}
