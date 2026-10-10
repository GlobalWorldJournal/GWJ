import type { Category, Language } from '@gwj/shared-types';

/**
 * Chrome (UI) strings per edition. `en` is the canonical set: every key MUST
 * exist in `en` and the English value MUST match the literal the app shipped
 * before i18n, so the English edition is byte-for-byte unchanged. `es`/`fr`
 * may omit a key; `t()` falls back to `en`, then to the key itself.
 *
 * Interpolation: `{x}` placeholders are filled from the `vars` passed to `t()`.
 */
export const DICT: Record<Language, Record<string, string>> = {
  en: {
    search: 'Search',
    skipToContent: 'Skip to content',
    onTelegram: 'The Global World Journal on Telegram',
    onMention: 'The Global World Journal on Mention',
    sections: 'Sections',
    close: 'Close',
    opinion: 'Opinion',
    mostPopular: 'Most Popular',
    advertisement: 'Advertisement',
    by: 'By',
    updated: 'Updated {x}',
    minRead: '{x} min read',
    topics: 'Topics',
    share: 'Share',
    shareVia: 'Share on {x}',
    shareByEmail: 'Share by email',
    shareNative: 'Share…',
    taggedTitle: 'Stories tagged “{x}”',
    more: 'More {x}',
    moreIn: 'More in {x}',
    moreFrom: 'More from {x}',
    allOf: 'All {x}',

    loadingError: 'We couldn’t load this page.',
    noStories: 'No stories yet.',

    // Follow / distribution (Telegram now; WhatsApp planned)
    follow: 'Follow',
    followOnTelegram: 'Follow on Telegram',
    railFollowLine: 'The day’s essential reading, on Telegram.',

    // Footer column titles
    sectionsTitle: 'Sections',
    customerService: 'Customer Service',
    tools: 'Tools & Features',
    company: 'Company',
    moreTitle: 'More',

    // Footer link labels
    customerCenter: 'Customer Center',
    contactUs: 'Contact Us',
    subscribe: 'Follow Us',
    newsletters: 'Telegram',
    rssFeeds: 'RSS Feeds',
    podcasts: 'Podcasts',
    video: 'Video',
    aboutUs: 'About Us',
    careers: 'Careers',
    advertise: 'Advertise',
    corrections: 'Corrections',
    reportContent: 'Report Content',
    privacy: 'Privacy Notice',
    cookieNotice: 'Cookie Notice',
    terms: 'Terms of Use',
    accessibility: 'Accessibility',
  },
  es: {
    search: 'Buscar',
    skipToContent: 'Saltar al contenido',
    onTelegram: 'The Global World Journal en Telegram',
    onMention: 'The Global World Journal en Mention',
    sections: 'Secciones',
    close: 'Cerrar',
    opinion: 'Opinión',
    mostPopular: 'Lo más leído',
    advertisement: 'Publicidad',
    by: 'Por',
    updated: 'Actualizado {x}',
    minRead: '{x} min de lectura',
    topics: 'Temas',
    share: 'Compartir',
    shareVia: 'Compartir en {x}',
    shareByEmail: 'Compartir por correo',
    shareNative: 'Compartir…',
    taggedTitle: 'Noticias sobre «{x}»',
    more: 'Más {x}',
    moreIn: 'Más en {x}',
    moreFrom: 'Más de {x}',
    allOf: 'Todo {x}',

    loadingError: 'No pudimos cargar esta página.',
    noStories: 'Aún no hay artículos.',

    follow: 'Seguir',
    followOnTelegram: 'Síguenos en Telegram',
    railFollowLine: 'La lectura esencial del día, en Telegram.',

    sectionsTitle: 'Secciones',
    customerService: 'Atención al cliente',
    tools: 'Herramientas',
    company: 'Empresa',
    moreTitle: 'Más',

    customerCenter: 'Centro de atención',
    contactUs: 'Contáctanos',
    subscribe: 'Síguenos',
    newsletters: 'Telegram',
    rssFeeds: 'Fuentes RSS',
    podcasts: 'Pódcasts',
    video: 'Vídeo',
    aboutUs: 'Quiénes somos',
    careers: 'Empleo',
    advertise: 'Anúnciate',
    corrections: 'Correcciones',
    reportContent: 'Denunciar contenido',
    privacy: 'Aviso de privacidad',
    cookieNotice: 'Aviso de cookies',
    terms: 'Términos de uso',
    accessibility: 'Accesibilidad',
  },
  fr: {
    search: 'Rechercher',
    skipToContent: 'Aller au contenu',
    onTelegram: 'The Global World Journal sur Telegram',
    onMention: 'The Global World Journal sur Mention',
    sections: 'Rubriques',
    close: 'Fermer',
    opinion: 'Opinion',
    mostPopular: 'Les plus lus',
    advertisement: 'Publicité',
    by: 'Par',
    updated: 'Mis à jour {x}',
    minRead: '{x} min de lecture',
    topics: 'Sujets',
    share: 'Partager',
    shareVia: 'Partager sur {x}',
    shareByEmail: 'Partager par e-mail',
    shareNative: 'Partager…',
    taggedTitle: 'Articles sur « {x} »',
    more: 'Plus de {x}',
    moreIn: 'Plus dans {x}',
    moreFrom: 'Plus de {x}',
    allOf: 'Tout {x}',

    loadingError: 'Impossible de charger cette page.',
    noStories: 'Aucun article pour l’instant.',

    follow: 'Suivre',
    followOnTelegram: 'Suivez-nous sur Telegram',
    railFollowLine: 'L’essentiel du jour, sur Telegram.',

    sectionsTitle: 'Rubriques',
    customerService: 'Service client',
    tools: 'Outils',
    company: 'Société',
    moreTitle: 'Plus',

    customerCenter: 'Centre d’assistance',
    contactUs: 'Nous contacter',
    subscribe: 'Nous suivre',
    newsletters: 'Telegram',
    rssFeeds: 'Flux RSS',
    podcasts: 'Podcasts',
    video: 'Vidéo',
    aboutUs: 'À propos',
    careers: 'Carrières',
    advertise: 'Annoncer',
    corrections: 'Corrections',
    reportContent: 'Signaler un contenu',
    privacy: 'Politique de confidentialité',
    cookieNotice: 'Notice sur les cookies',
    terms: 'Conditions d’utilisation',
    accessibility: 'Accessibilité',
  },
};

/**
 * Localized section names. English IS the canonical `Category` value, so the
 * `en` edition simply returns it; `es`/`fr` provide a translation per category.
 */
const CATEGORY_LABELS: Record<Exclude<Language, 'en'>, Record<Category, string>> = {
  es: {
    World: 'Mundo',
    Business: 'Negocios',
    Markets: 'Mercados',
    Tech: 'Tecnología',
    Politics: 'Política',
    Opinion: 'Opinión',
    Arts: 'Cultura',
  },
  fr: {
    World: 'Monde',
    Business: 'Affaires',
    Markets: 'Marchés',
    Tech: 'Tech',
    Politics: 'Politique',
    Opinion: 'Opinion',
    Arts: 'Arts',
  },
};

/** The localized label for a section. English returns the category value itself. */
export function categoryLabel(category: Category, lang: Language): string {
  if (lang === 'en') {
    return category;
  }
  return CATEGORY_LABELS[lang][category];
}
