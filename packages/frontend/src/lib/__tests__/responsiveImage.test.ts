import { describe, expect, it } from 'vitest';
import { responsiveImage } from '../responsiveImage';

describe('responsiveImage', () => {
  it('lists every rendition and the main image as width candidates', () => {
    const props = responsiveImage(
      {
        url: 'https://cdn.test/a.webp',
        alt: '',
        width: 1600,
        height: 1067,
        variants: [
          { width: 400, url: 'https://cdn.test/a.w400.webp' },
          { width: 800, url: 'https://cdn.test/a.w800.webp' },
        ],
      },
      '72px',
      72,
      72,
    );
    expect(props).toEqual({
      src: 'https://cdn.test/a.webp',
      srcSet:
        'https://cdn.test/a.w400.webp 400w, https://cdn.test/a.w800.webp 800w, https://cdn.test/a.webp 1600w',
      sizes: '72px',
      width: 1600,
      height: 1067,
    });
  });

  it('an image without renditions keeps a plain src and the slot ratio', () => {
    expect(
      responsiveImage({ url: 'https://cdn.test/old.jpg', alt: '' }, '100vw', 1200, 800),
    ).toEqual({ src: 'https://cdn.test/old.jpg', width: 1200, height: 800 });
  });
});
