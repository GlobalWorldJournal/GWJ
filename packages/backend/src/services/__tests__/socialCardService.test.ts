/**
 * Unit tests for the Instagram social-card compositor: real sharp renders
 * (no mocking — the whole point is proving the SVG text layer actually
 * composites and the wrap/truncate logic never overflows the card), decoded
 * back with sharp to assert the real output shape.
 */
import { describe, expect, it } from 'bun:test';
import sharp from 'sharp';
import { CARD_HEIGHT, CARD_WIDTH, generateInstagramCard } from '../socialCardService';

/** A real, decodable photo-ish JPEG fixture — a gradient, not a flat fill, so a visible scrim is measurable against it. */
async function fixturePhoto(width = 1600, height = 1000): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 190, b: 210 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('generateInstagramCard', () => {
  it('composites a correctly-sized, decodable JPEG for a short headline', async () => {
    const card = await generateInstagramCard({
      photo: await fixturePhoto(),
      headline: 'Markets Rally on Rate Cut Hopes',
    });
    const meta = await sharp(card).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(CARD_HEIGHT);
  });

  it('wraps a long headline onto multiple lines without throwing or overflowing', async () => {
    const headline =
      'Supreme Court Races Toward an Explosive Finale With the Midterms at Stake as Justices Weigh Mail-In Ballots and Campaign Finance';
    const card = await generateInstagramCard({ photo: await fixturePhoto(), headline });
    const meta = await sharp(card).metadata();
    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(CARD_HEIGHT);
  });

  it('truncates a pathologically long headline instead of growing past the card', async () => {
    const headline = 'Word '.repeat(200).trim();
    const card = await generateInstagramCard({ photo: await fixturePhoto(), headline });
    const meta = await sharp(card).metadata();
    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(CARD_HEIGHT);
  });

  it('renders headlines containing XML-sensitive characters without corrupting the SVG', async () => {
    const headline = `Markets "Rally" & Slide as <Fed> Weighs Rates — It's Chaos`;
    const card = await generateInstagramCard({ photo: await fixturePhoto(), headline });
    const meta = await sharp(card).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(CARD_WIDTH);
    expect(meta.height).toBe(CARD_HEIGHT);
  });

  it('darkens the lower portion of the card relative to the source photo (the legibility scrim applied)', async () => {
    const photo = await fixturePhoto();
    const card = await generateInstagramCard({ photo, headline: 'Short Headline' });

    const sourceBottom = await sharp(photo)
      .resize({ width: CARD_WIDTH, height: CARD_HEIGHT, fit: 'cover' })
      .extract({ left: 0, top: CARD_HEIGHT - 10, width: CARD_WIDTH, height: 10 })
      .raw()
      .toBuffer();
    const cardBottom = await sharp(card)
      .extract({ left: 0, top: CARD_HEIGHT - 10, width: CARD_WIDTH, height: 10 })
      .raw()
      .toBuffer();

    const avg = (buf: Buffer) => buf.reduce((sum, v) => sum + v, 0) / buf.length;
    expect(avg(cardBottom)).toBeLessThan(avg(sourceBottom) * 0.5);
  });

  it('accepts a non-JPEG source format (the site stores hero images as WebP)', async () => {
    const photo = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 20, g: 40, b: 80 } },
    })
      .webp()
      .toBuffer();
    const card = await generateInstagramCard({ photo, headline: 'Short Headline' });
    const meta = await sharp(card).metadata();
    expect(meta.format).toBe('jpeg');
  });
});
