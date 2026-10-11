/**
 * Generates the branded headline-card image posted to Instagram: the
 * article's hero photo, cropped to a 4:5 portrait, with a legibility scrim
 * and the headline (plus a small masthead-style brand lockup) overlaid —
 * the way most news accounts post to Instagram, rather than the bare photo.
 *
 * Text is rendered via an SVG layer composited onto the photo with sharp.
 * `sharp`/libvips renders SVG text through a bundled fontconfig + pango, which
 * needs an actual fontconfig config + real font files to resolve a family
 * name — it does NOT ship any fonts itself, and a bare Alpine/Debian base
 * image has no usable default (sharp's own FAQ: "fontconfig error: cannot
 * load default config file" without one). Rather than depend on the
 * container image installing fonts system-wide, this module points
 * fontconfig at its OWN config + the two TTFs committed under
 * `packages/backend/assets/` ({@link ensureFontsRegistered}), so card
 * generation works identically in a test run and in production without any
 * Dockerfile step.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/** This package's own `assets/` directory (`packages/backend/assets/`). */
const ASSETS_DIR = fileURLToPath(new URL('../../assets', import.meta.url));

/** Instagram's own maximum portrait aspect ratio (4:5) — the most feed real estate a single-image post can use. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const HEADLINE_FONT = 'Playfair Display';
const BRAND_FONT = 'Libre Franklin';

const SIDE_MARGIN = 72;
const BOTTOM_MARGIN = 88;
const CONTENT_WIDTH = CARD_WIDTH - SIDE_MARGIN * 2;

const BRAND_LABEL = 'GLOBAL WORLD JOURNAL';
const BRAND_FONT_SIZE = 26;
const BRAND_ICON_HEIGHT = 36;
const BRAND_ICON_GAP = 14;
const BRAND_TO_HEADLINE_GAP = 28;

/** Headline font sizes tried largest-first until the wrapped text fits within {@link MAX_HEADLINE_LINES}. */
const HEADLINE_FONT_SIZES = [72, 64, 56, 48, 42] as const;
const MAX_HEADLINE_LINES = 5;
const HEADLINE_LINE_HEIGHT_EM = 1.14;
/**
 * Average glyph-advance width for Playfair Display Black, as a fraction of
 * font-size. There's no shaping library in this pipeline to measure exactly,
 * so this is an empirically-tuned estimate (see manual verification renders
 * in the commit that introduced this) — deliberately generous (wide) so
 * wrapped lines undershoot the box rather than ever overflow it.
 */
const HEADLINE_AVG_CHAR_WIDTH_EM = 0.58;

let fontsRegisteredPath: string | null = null;

/**
 * Point fontconfig at a private config (own cache dir, own `<dir>` pointing
 * at this package's bundled fonts) so SVG text rendering resolves
 * "Playfair Display"/"Libre Franklin" by name without any system-wide font
 * installation. Idempotent and safe to call on every `generateInstagramCard`
 * — fontconfig only actually reads `FONTCONFIG_FILE` on its own first use
 * within the process, so this just needs to run before that, not repeatedly.
 */
function ensureFontsRegistered(): void {
  if (fontsRegisteredPath) return;
  const fontsDir = join(ASSETS_DIR, 'fonts');
  const confDir = join(tmpdir(), `gwj-fontconfig-${randomBytes(6).toString('hex')}`);
  const cacheDir = join(confDir, 'cache');
  mkdirSync(cacheDir, { recursive: true });
  const confPath = join(confDir, 'fonts.conf');
  writeFileSync(
    confPath,
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${fontsDir}</dir>\n  <cachedir>${cacheDir}</cachedir>\n</fontconfig>\n`,
  );
  process.env.FONTCONFIG_FILE = confPath;
  fontsRegisteredPath = confPath;
}

/** Escape text for safe embedding inside SVG/XML element content. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Greedy word-wrap `text` into lines no wider than `maxWidthPx` at `fontSizePx`,
 * using the fixed {@link HEADLINE_AVG_CHAR_WIDTH_EM} glyph-width estimate (no
 * shaping library available to measure exactly — see its own doc comment).
 */
function wrapHeadline(text: string, fontSizePx: number): string[] {
  const maxChars = Math.max(
    1,
    Math.floor(CONTENT_WIDTH / (fontSizePx * HEADLINE_AVG_CHAR_WIDTH_EM)),
  );
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

interface HeadlineLayout {
  lines: string[];
  fontSizePx: number;
}

/**
 * Pick the largest font size (from {@link HEADLINE_FONT_SIZES}) that wraps the
 * headline into at most {@link MAX_HEADLINE_LINES} lines. Falls back to the
 * smallest size with the overflow lines collapsed into the last one (defensive —
 * article titles have no enforced max length) rather than ever growing past the
 * card.
 */
function layoutHeadline(headline: string): HeadlineLayout {
  for (const fontSizePx of HEADLINE_FONT_SIZES) {
    const lines = wrapHeadline(headline, fontSizePx);
    if (lines.length <= MAX_HEADLINE_LINES) return { lines, fontSizePx };
  }
  const fontSizePx = HEADLINE_FONT_SIZES[HEADLINE_FONT_SIZES.length - 1] ?? 42;
  const lines = wrapHeadline(headline, fontSizePx);
  const kept = lines.slice(0, MAX_HEADLINE_LINES);
  const last = kept[MAX_HEADLINE_LINES - 1];
  if (lines.length > MAX_HEADLINE_LINES && last !== undefined) {
    kept[MAX_HEADLINE_LINES - 1] = `${last.replace(/\s+\S*$/, '')}…`;
  }
  return { lines: kept, fontSizePx };
}

/** The brand mark's own viewBox dimensions (`packages/backend/assets/brand/logo-mark.svg`). */
const BRAND_MARK_VIEWBOX = { width: 276.75, height: 123.750003 };

let brandMarkInner: string | null = null;

/** The brand mark's inner SVG markup (no outer `<svg>` tag), recolored to white for use over a photo. */
function loadBrandMarkInner(): string {
  if (brandMarkInner) return brandMarkInner;
  const raw = readFileSync(join(ASSETS_DIR, 'brand', 'logo-mark.svg'), 'utf8');
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  brandMarkInner = inner.replaceAll('#191919', '#ffffff');
  return brandMarkInner;
}

/** Build the full overlay SVG (scrim + brand lockup + wrapped headline) as a {@link CARD_WIDTH}x{@link CARD_HEIGHT} layer. */
function buildOverlaySvg(headline: string): string {
  const { lines, fontSizePx } = layoutHeadline(headline);
  const lineHeight = fontSizePx * HEADLINE_LINE_HEIGHT_EM;
  const headlineBlockHeight = lines.length * lineHeight;
  const headlineBottomY = CARD_HEIGHT - BOTTOM_MARGIN;
  const headlineTopY = headlineBottomY - headlineBlockHeight;
  const brandRowY = headlineTopY - BRAND_TO_HEADLINE_GAP;
  const scrimTopY = Math.min(CARD_HEIGHT * 0.45, brandRowY - BRAND_ICON_HEIGHT - 48);

  const headlineTspans = lines
    .map((line, i) => {
      // First tspan's y is set directly (dy would be relative to the <text> element's
      // own y, which is unused here); subsequent lines advance by one line-height.
      const dy = i === 0 ? 0 : lineHeight;
      return `<tspan x="${SIDE_MARGIN}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join('');

  const brandIconScale = BRAND_ICON_HEIGHT / BRAND_MARK_VIEWBOX.height;
  const brandIconWidth = BRAND_MARK_VIEWBOX.width * brandIconScale;
  const brandTextX = SIDE_MARGIN + brandIconWidth + BRAND_ICON_GAP;
  // Nudges the icon's top up from the text baseline so its visual center
  // roughly lines up with the all-caps label next to it (tuned against real
  // renders, see verification).
  const brandIconTopY = brandRowY - BRAND_ICON_HEIGHT * 0.78;

  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0" />
      <stop offset="55%" stop-color="#000000" stop-opacity="0.55" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.92" />
    </linearGradient>
  </defs>
  <rect x="0" y="${scrimTopY}" width="${CARD_WIDTH}" height="${CARD_HEIGHT - scrimTopY}" fill="url(#scrim)" />
  <g transform="translate(${SIDE_MARGIN}, ${brandIconTopY}) scale(${brandIconScale})">
    ${loadBrandMarkInner()}
  </g>
  <text x="${brandTextX}" y="${brandRowY}" font-family="${BRAND_FONT}" font-weight="700" font-size="${BRAND_FONT_SIZE}" letter-spacing="2" fill="#ffffff">${escapeXml(BRAND_LABEL)}</text>
  <text x="${SIDE_MARGIN}" y="${headlineTopY + fontSizePx}" font-family="${HEADLINE_FONT}" font-weight="800" font-size="${fontSizePx}" fill="#ffffff">${headlineTspans}</text>
</svg>`;
}

export interface SocialCardOptions {
  /** The hero photo's bytes, any format sharp can decode. */
  photo: Buffer;
  /** The headline to overlay, already in the article's own language. */
  headline: string;
}

/**
 * Composite a branded Instagram headline card: the hero photo cover-cropped
 * to {@link CARD_WIDTH}x{@link CARD_HEIGHT}, a bottom scrim, the GWJ brand
 * lockup, and the wrapped headline. Returns JPEG bytes — Instagram's Content
 * Publishing API requires JPEG, unlike the WebP the rest of the site stores.
 */
export async function generateInstagramCard(options: SocialCardOptions): Promise<Buffer> {
  ensureFontsRegistered();
  const overlay = buildOverlaySvg(options.headline);
  return sharp(options.photo)
    .rotate()
    .resize({
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
}
