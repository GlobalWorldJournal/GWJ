import { describe, it, expect } from 'bun:test';
import {
  ArticleInputSchema,
  otherLanguageOf,
  stripPhotoCredit,
  wrongLanguageFields,
  ArticleUpdateSchema,
  ContentBlockSchema,
  ArticleListQuerySchema,
  PublicArticleListQuerySchema,
  slugify,
  CATEGORIES,
} from '../index';

describe('slugify', () => {
  it('slugifies titles', () => {
    expect(slugify('Global Equities Climb, Again!')).toBe('global-equities-climb-again');
  });
  it('strips diacritics', () => {
    expect(slugify('Crónica del Mercado')).toBe('cronica-del-mercado');
  });
  it('collapses whitespace and dashes', () => {
    expect(slugify('  a   --  b ')).toBe('a-b');
  });
});

describe('ArticleInputSchema', () => {
  it('rejects unknown category', () => {
    const r = ArticleInputSchema.safeParse({
      title: 'X',
      category: 'Sports',
      author: 'n',
      body: [],
    });
    expect(r.success).toBe(false);
  });
  it('accepts a valid article input and applies defaults', () => {
    const r = ArticleInputSchema.safeParse({
      title: 'X',
      category: CATEGORIES[0],
      author: 'n',
      body: '# Heading\n\nA markdown paragraph.',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('draft');
      expect(r.data.featured).toBe(0);
      expect(r.data.tags).toEqual([]);
    }
  });
  it('rejects empty title', () => {
    const r = ArticleInputSchema.safeParse({ title: '', category: CATEGORIES[0], author: 'n' });
    expect(r.success).toBe(false);
  });
});

describe('ContentBlockSchema', () => {
  it('validates an image block url', () => {
    const bad = ContentBlockSchema.safeParse({ type: 'image', url: 'not-a-url' });
    expect(bad.success).toBe(false);
    const ok = ContentBlockSchema.safeParse({ type: 'image', url: 'https://cdn.x/y.jpg' });
    expect(ok.success).toBe(true);
  });
  it('requires at least one list item', () => {
    const r = ContentBlockSchema.safeParse({ type: 'list', items: [] });
    expect(r.success).toBe(false);
  });
});

describe('ArticleUpdateSchema', () => {
  it('allows partial updates', () => {
    const r = ArticleUpdateSchema.safeParse({ title: 'New title only' });
    expect(r.success).toBe(true);
  });
});

describe('ArticleListQuerySchema', () => {
  it('coerces page/limit from strings and applies defaults', () => {
    const r = ArticleListQuerySchema.safeParse({ page: '2' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(2);
      expect(r.data.limit).toBe(20);
    }
  });
  it('caps limit at 50', () => {
    const r = ArticleListQuerySchema.safeParse({ limit: '500' });
    expect(r.success).toBe(false);
  });
  it('reads featured "false" as false and "true" as true (not truthy-string coercion)', () => {
    expect(ArticleListQuerySchema.parse({ featured: 'false' }).featured).toBe(false);
    expect(ArticleListQuerySchema.parse({ featured: 'true' }).featured).toBe(true);
    expect(ArticleListQuerySchema.parse({ featured: false }).featured).toBe(false);
    expect(ArticleListQuerySchema.safeParse({ featured: 'yes' }).success).toBe(false);
  });
});

describe('PublicArticleListQuerySchema', () => {
  it('drops a requested status so readers can never ask for drafts', () => {
    const r = PublicArticleListQuerySchema.parse({ status: 'draft', q: 'merger' });
    expect(r).not.toHaveProperty('status');
    expect(r.q).toBe('merger');
  });
});

describe('ArticleInputSchema — no provenance', () => {
  it('drops outlet provenance and photo credits a client still sends', () => {
    const r = ArticleInputSchema.parse({
      title: 'A story',
      category: 'World',
      author: 'Nate',
      body: 'Body',
      heroImage: {
        url: 'https://cdn.example.test/a.webp',
        alt: 'A',
        credit: 'Source: wire.example',
      },
      source: { name: 'Wire', articleUrl: 'https://example.com/a' },
      sources: [{ name: 'Wire', articleUrl: 'https://example.com/a' }],
    });
    expect(r).not.toHaveProperty('source');
    expect(r).not.toHaveProperty('sources');
    expect(r.heroImage).not.toHaveProperty('credit');
  });
});

describe('photo credits', () => {
  it('strips the credit an outlet appended to a caption, in any edition', () => {
    for (const [caption, clean] of [
      ['Pedro Sánchez en Bruselas. Foto: Europa Press', 'Pedro Sánchez en Bruselas.'],
      [
        'Des manifestants à Paris. (Crédit : Sarah Meyssonnier / REUTERS)',
        'Des manifestants à Paris.',
      ],
      ['Leaders in Berlin. Photograph: Tobias Schwarz/AFP/Getty Images', 'Leaders in Berlin.'],
      ['El alcalde. (crédito de la foto: MARC ISRAEL SELLEM)', 'El alcalde.'],
      ['Le maire adjoint. (crédit photo : MARC ISRAEL SELLEM)', 'Le maire adjoint.'],
      ['Madrid, el 14 de octubre. | Foto: Europa Press', 'Madrid, el 14 de octubre.'],
      ['A photo of the protest: thousands marched.', 'A photo of the protest: thousands marched.'],
      [
        'Gendarmes à Paris, le 20 octobre 2026. © Abdul Saboor, Reuters',
        'Gendarmes à Paris, le 20 octobre 2026.',
      ],
      [
        'Damage in Baghdad on March 14, 2026. (AP Photo/Hadi Mizban)',
        'Damage in Baghdad on March 14, 2026.',
      ],
      ['Daños en Bagdad. (Foto de la AP / Hadi Mizban)', 'Daños en Bagdad.'],
      ['Traders on Sept. 28, 2026. Brendan McDermid | Reuters', 'Traders on Sept. 28, 2026.'],
      [
        'Troy Jackson in South Portland. Photo by Robert F. Bukaty/AP.',
        'Troy Jackson in South Portland.',
      ],
      ['Felipe VI y Letizia en Ceuta. EFE', 'Felipe VI y Letizia en Ceuta.'],
      ['Traders at the NYSE. Atta Kenare | Afp | Getty Images', 'Traders at the NYSE.'],
      [
        'A voter with a sticker. Jeff Taylor—The Winchester Star via AP.',
        'A voter with a sticker.',
      ],
      ['The MOAB bomb. [Getty]', 'The MOAB bomb.'],
      ['Urnas. (Europa Press)', 'Urnas.'],
      ['FILE PHOTO: A trader works. REUTERS/Jeenah Moon/File Photo', 'A trader works.'],
      ['Kevin Dietsch, Getty Images file', ''],
      [
        'Le spread a atteint un sommet, selon les données de Bloomberg.',
        'Le spread a atteint un sommet, selon les données de Bloomberg.',
      ],
      [
        'Christopher Waller speaks before a Reuters NEXT Newsmaker interview in Washington.',
        'Christopher Waller speaks before a Reuters NEXT Newsmaker interview in Washington.',
      ],
      [
        "Photo d'illustration montrant une employée de l'usine Duralex.",
        "Photo d'illustration montrant une employée de l'usine Duralex.",
      ],
      ['Pedro Sánchez, en una imagen de archivo.', 'Pedro Sánchez, en una imagen de archivo.'],
    ]) {
      expect(stripPhotoCredit(caption ?? '')).toBe(clean ?? '');
    }
  });

  it('applies on input: caption credits and credit-only body lines are dropped', () => {
    const r = ArticleInputSchema.parse({
      title: 'A story',
      category: 'World',
      author: 'Nate',
      body: 'Lede.\n\n![Heat](https://cdn.example.test/a.webp)\n\n_Source: Reuters_\n\n*(AP Photo/Hadi Mizban)*\n\nThe source of the leak: unknown.\n\nReuters',
      heroImage: {
        url: 'https://cdn.example.test/a.webp',
        caption: 'Heat in Rome. Photo: Reuters',
      },
    });
    expect(r.heroImage?.caption).toBe('Heat in Rome.');
    expect(r.body).toBe(
      'Lede.\n\n![Heat](https://cdn.example.test/a.webp)\n\nThe source of the leak: unknown.',
    );
  });
});

describe('edition language', () => {
  it('names each field written in another language than the edition', () => {
    expect(
      wrongLanguageFields(
        {
          title: 'Collision ferroviaire en Espagne : au moins 68 morts et plus de 100 blessés',
          deck: 'Two high-speed trains collided south of Madrid, killing at least 68 people.',
          'heroImage.caption':
            'El presidente estadounidense Donald Trump se dirige a la prensa desde la base de Andrews.',
        },
        'en',
      ),
    ).toEqual([
      { field: 'title', language: 'fr' },
      { field: 'heroImage.caption', language: 'es' },
    ]);
  });

  it('leaves names, short labels and a quoted foreign phrase alone', () => {
    for (const [text, edition] of [
      ['Le Pen', 'en'],
      ['Liga MX', 'fr'],
      ['Macron says "liberté, égalité, fraternité" still binds the Republic', 'en'],
      ['Andrew Garfield, Sam Altman, OpenAI', 'es'],
      ['Ataques rusos matan a 10 en Ucrania mientras Trump urge a Zelenski a negociar', 'es'],
    ] as const) {
      expect(otherLanguageOf(text, edition)).toBeNull();
    }
  });
});
