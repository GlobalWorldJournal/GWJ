import type { ImageVariant } from '@gwj/shared-types';

/**
 * Oxy's image rendition ladder (`@oxy.so/utils` `IMAGE_VARIANTS`): WebP, never
 * enlarged, made on first request. Only the width-only rungs make `srcset`
 * candidates; `w96`/`w128`/`thumb` are square crops.
 */
export const OXY_CONTENT_RUNGS = [
  { name: 'w320', width: 320 },
  { name: 'w640', width: 640 },
  { name: 'w1280', width: 1280 },
  { name: 'w2048', width: 2048 },
] as const;
export type OxyContentRung = (typeof OXY_CONTENT_RUNGS)[number]['name'];

/** An Oxy file id as it appears in a URL path segment. */
const FILE_ID_PATTERN = '[A-Za-z0-9_-]{8,64}';
const FILE_ID_REGEX = new RegExp(`^${FILE_ID_PATTERN}$`);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Where GWJ's Oxy files are read from, as pure string functions: the public
 * URL of a file (and of each rendition), and the reverse — the file a URL in
 * GWJ's content names. The URL form is the SDK's `assets.publicUrl` exactly
 * (`<cloudURL>/<id>[?variant=<name>]`); a test holds the two equal.
 */
export interface OxyUrls {
  readonly cloudUrl: string;
  /** The public URL of a file, or of one of its renditions. */
  url(fileId: string, variant?: OxyContentRung): string;
  /** The file a URL names, or null when it is not an Oxy file URL. */
  fileIdOf(url: string): string | null;
  /** Every Oxy file named anywhere in `text` (Markdown, JSON), each once, in order. */
  fileIdsIn(text: string): string[];
  /**
   * The `srcset` renditions of an image `width` pixels wide: each Oxy rung
   * narrower than the image (a rung is never an enlargement, so a wider one
   * would just repeat the image under a false width). None for a GIF, whose
   * renditions would drop its animation.
   */
  variantsFor(fileId: string, width: number | null | undefined, mime: string): ImageVariant[];
  /** The narrowest rung at least `width` wide (the widest when none is): a legacy rendition's stand-in. */
  rungFor(width: number): OxyContentRung;
}

export function createOxyUrls(cloudUrl: string): OxyUrls {
  const base = cloudUrl.replace(/\/+$/, '');
  const prefix = `${base}/`;
  const inText = new RegExp(`${escapeRegExp(prefix)}(${FILE_ID_PATTERN})(?![A-Za-z0-9_-])`, 'g');

  function url(fileId: string, variant?: OxyContentRung): string {
    const query = variant ? `?variant=${encodeURIComponent(variant)}` : '';
    return `${base}/${encodeURIComponent(fileId)}${query}`;
  }

  return {
    cloudUrl: base,
    url,
    fileIdOf(candidate) {
      if (!candidate.startsWith(prefix)) return null;
      const path = candidate.slice(prefix.length).split(/[?#]/)[0] ?? '';
      return FILE_ID_REGEX.test(path) ? path : null;
    },
    fileIdsIn(text) {
      const ids = new Set<string>();
      for (const match of text.matchAll(inText)) {
        if (match[1]) ids.add(match[1]);
      }
      return [...ids];
    },
    variantsFor(fileId, width, mime) {
      if (!width || mime === 'image/gif') return [];
      return OXY_CONTENT_RUNGS.filter((rung) => rung.width < width).map((rung) => ({
        width: rung.width,
        url: url(fileId, rung.name),
      }));
    },
    rungFor(width) {
      return OXY_CONTENT_RUNGS.find((candidate) => candidate.width >= width)?.name ?? 'w2048';
    },
  };
}
