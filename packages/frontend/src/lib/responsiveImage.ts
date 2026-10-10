import type { HeroImage } from '@gwj/shared-types';

/** The `<img>` attributes that let the browser pick the smallest rendition that fits. */
export interface ResponsiveImageProps {
  src: string;
  srcSet?: string;
  sizes?: string;
  width: number;
  height: number;
}

/**
 * Responsive attributes for a stored image. `sizes` says how wide the image is
 * drawn in its slot; with the renditions the upload made (`variants`), a card
 * thumbnail or a phone downloads a 400–800 px file instead of the full image.
 * An image without renditions (a GIF, an older upload) keeps a plain `src`.
 * `fallbackWidth`/`fallbackHeight` give the slot's ratio when the size is unknown.
 */
export function responsiveImage(
  image: HeroImage,
  sizes: string,
  fallbackWidth: number,
  fallbackHeight: number,
): ResponsiveImageProps {
  const width = image.width ?? fallbackWidth;
  const height = image.height ?? fallbackHeight;
  const variants = image.variants ?? [];
  if (variants.length === 0 || !image.width) return { src: image.url, width, height };
  const candidates = [
    ...variants.map((variant) => `${variant.url} ${variant.width}w`),
    `${image.url} ${image.width}w`,
  ];
  return { src: image.url, srcSet: candidates.join(', '), sizes, width, height };
}

/**
 * How wide each layout slot draws its image (CSS pixels), for `sizes`. The
 * grid breakpoints match Tailwind's `sm` (640px) and `lg` (1024px).
 */
export const IMAGE_SIZES = {
  /** The front page's lead story: the wide center column. */
  lead: '(min-width: 1024px) 640px, 100vw',
  /** The article page's hero image (the reading column). */
  articleHero: '(min-width: 1024px) 760px, 100vw',
  /** A feature in the home's narrow left column. */
  feature: '(min-width: 1024px) 272px, 100vw',
  /** A card in a two- or three-column grid. */
  standard: '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
  /** A square list thumbnail. */
  thumbnail: '72px',
} as const;
