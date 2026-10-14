import { DEFAULT_LANGUAGE, type Category, type Language } from '@gwj/shared-types';

/**
 * Chrome (UI) strings per edition. `en` is the canonical set: every key MUST
 * exist in `en` and the English value MUST match the literal the app shipped
 * before i18n, so the English edition is byte-for-byte unchanged. `es`/`fr` are
 * typed `Record<DictKey, string>`: a key missing from either (or a new language
 * missing from `DICT`) fails to compile. `t()` still falls back to `en`, then to
 * the key itself, for keys looked up dynamically.
 *
 * Interpolation: `{x}` placeholders are filled from the `vars` passed to `t()`.
 */
const EN = {
  notFoundTitle: 'Page not found',
  notFoundDetail: 'The story you’re looking for may have moved or been removed.',
  backToFrontPage: 'Return to the front page',
  errorTitle: 'Something went wrong',
  errorDetail: 'This page could not be displayed. Please try again.',
  reloadPage: 'Reload the page',
  search: 'Search',
  loadMore: 'Load more',
  loadingMore: 'Loading…',
  searchPlaceholder: 'Search articles',
  searchPrompt: 'What are you looking for?',
  searchPromptDetail: 'Search across every section.',
  searching: 'Searching…',
  searchFailed: 'Search failed.',
  noResults: 'No results.',
  noResultsFor: 'Nothing matched “{x}”.',
  authorNotFound: 'Author not found.',
  authorNotFoundDetail: 'No writer matches this page.',
  authorCovers: '{x} covers {y} for The Global World Journal.',
  authorNoStories: '{x} hasn’t published here yet.',
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
  newsletters: 'Newsletters',
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
  advertisingTerms: 'Advertising terms',
  accessibility: 'Accessibility',

  // Not-found, navigation and footer
  error404: 'Error 404',
  whatsNews: 'What’s News',
  language: 'Language',
  homeLink: 'The Global World Journal — home',
  tryAgain: 'Please try again.',
  copyright: '© {x} The Global World Journal. All Rights Reserved.',
  author: 'Author',

  // Page titles' descriptions (the <title> is built from the page name + site name)
  metaHomeDescription:
    'The Global World Journal: breaking news and in-depth reporting across the world economy, markets, technology, politics, opinion and the arts.',
  metaCategoryDescription: 'The latest {x} news and analysis from The Global World Journal.',
  metaAuthorDescription: 'Stories by {x}, {y} at The Global World Journal, covering {z}.',
  metaAuthorFallback: 'Stories by this writer for The Global World Journal.',
  metaSearchDescription: 'Search news and analysis across The Global World Journal.',
  metaTagDescription: 'The latest stories tagged “{x}” from The Global World Journal.',
  metaStaticDescription: '{x} at The Global World Journal, independent global news.',
  metaNotFoundDescription: 'The Global World Journal — independent global news.',
  metaFeedDescription: 'Breaking news and in-depth reporting from The Global World Journal.',
  newsletterHeading: 'The Morning Briefing',
  newsletterPrompt: 'The day’s most important stories in your inbox every morning. Free.',
  newsletterEmailLabel: 'Email address',
  newsletterButton: 'Sign up',
  newsletterSending: 'Sending…',
  newsletterCheckInbox: 'Check your inbox and confirm your address to start receiving it.',
  newsletterError: 'We could not sign you up. Please try again.',
  newsletterPrivacy: 'One email a day. Unsubscribe any time.',
  newsletterConfirming: 'Confirming your subscription…',
  newsletterConfirmedTitle: 'You’re subscribed',
  newsletterConfirmedDetail: 'The Morning Briefing will arrive in your inbox every morning.',
  newsletterInvalidTitle: 'This link is not valid',
  newsletterInvalidDetail:
    'It may have expired or been used already. You can sign up again at any time.',
  newsletterUnsubscribeTitle: 'Unsubscribe',
  newsletterUnsubscribeDetail: 'You will stop receiving the Morning Briefing.',
  newsletterUnsubscribeButton: 'Unsubscribe me',
  newsletterUnsubscribedTitle: 'You’ve been unsubscribed',
  newsletterUnsubscribedDetail: 'You will not receive the Morning Briefing any more.',
} as const;

/** Every chrome key. `es`/`fr` are typed against it, so a missing translation fails to compile. */
export type DictKey = keyof typeof EN;

const ES: Record<DictKey, string> = {
  notFoundTitle: 'Página no encontrada',
  notFoundDetail: 'La noticia que busca puede haberse movido o eliminado.',
  backToFrontPage: 'Volver a la portada',
  errorTitle: 'Algo salió mal',
  errorDetail: 'No se pudo mostrar esta página. Inténtelo de nuevo.',
  reloadPage: 'Recargar la página',
  search: 'Buscar',
  loadMore: 'Cargar más',
  loadingMore: 'Cargando…',
  searchPlaceholder: 'Buscar artículos',
  searchPrompt: '¿Qué estás buscando?',
  searchPromptDetail: 'Busca en todas las secciones.',
  searching: 'Buscando…',
  searchFailed: 'La búsqueda falló.',
  noResults: 'Sin resultados.',
  noResultsFor: 'Nada coincide con «{x}».',
  authorNotFound: 'Autor no encontrado.',
  authorNotFoundDetail: 'Ningún redactor corresponde a esta página.',
  authorCovers: '{x} cubre {y} para The Global World Journal.',
  authorNoStories: '{x} todavía no ha publicado en esta edición.',
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
  newsletters: 'Boletines',
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
  advertisingTerms: 'Condiciones de publicidad',
  accessibility: 'Accesibilidad',

  error404: 'Error 404',
  whatsNews: 'Lo esencial',
  language: 'Idioma',
  homeLink: 'The Global World Journal — inicio',
  tryAgain: 'Inténtelo de nuevo.',
  copyright: '© {x} The Global World Journal. Todos los derechos reservados.',
  author: 'Autor',

  metaHomeDescription:
    'The Global World Journal: noticias de última hora y periodismo en profundidad sobre la economía mundial, los mercados, la tecnología, la política, la opinión y la cultura.',
  metaCategoryDescription: 'Las últimas noticias y análisis de {x} de The Global World Journal.',
  metaAuthorDescription: 'Artículos de {x}, {y} en The Global World Journal, sobre {z}.',
  metaAuthorFallback: 'Artículos de este redactor para The Global World Journal.',
  metaSearchDescription: 'Busca noticias y análisis en The Global World Journal.',
  metaTagDescription: 'Las últimas noticias sobre «{x}» en The Global World Journal.',
  metaStaticDescription: '{x} en The Global World Journal, noticias globales independientes.',
  metaNotFoundDescription: 'The Global World Journal — noticias globales independientes.',
  metaFeedDescription:
    'Noticias de última hora y periodismo en profundidad de The Global World Journal.',
  newsletterHeading: 'El resumen de la mañana',
  newsletterPrompt: 'Las noticias más importantes del día en tu correo cada mañana. Gratis.',
  newsletterEmailLabel: 'Correo electrónico',
  newsletterButton: 'Suscribirme',
  newsletterSending: 'Enviando…',
  newsletterCheckInbox:
    'Revisa tu bandeja de entrada y confirma tu correo para empezar a recibirlo.',
  newsletterError: 'No hemos podido suscribirte. Inténtalo de nuevo.',
  newsletterPrivacy: 'Un correo al día. Puedes darte de baja cuando quieras.',
  newsletterConfirming: 'Confirmando tu suscripción…',
  newsletterConfirmedTitle: 'Ya estás suscrito',
  newsletterConfirmedDetail: 'El resumen de la mañana llegará a tu correo cada mañana.',
  newsletterInvalidTitle: 'Este enlace no es válido',
  newsletterInvalidDetail:
    'Puede haber caducado o haberse usado ya. Puedes volver a suscribirte cuando quieras.',
  newsletterUnsubscribeTitle: 'Darse de baja',
  newsletterUnsubscribeDetail: 'Dejarás de recibir el resumen de la mañana.',
  newsletterUnsubscribeButton: 'Darme de baja',
  newsletterUnsubscribedTitle: 'Te has dado de baja',
  newsletterUnsubscribedDetail: 'Ya no recibirás el resumen de la mañana.',
};

const FR: Record<DictKey, string> = {
  notFoundTitle: 'Page introuvable',
  notFoundDetail: 'L’article que vous cherchez a peut-être été déplacé ou supprimé.',
  backToFrontPage: 'Retour à la une',
  errorTitle: 'Une erreur est survenue',
  errorDetail: 'Cette page n’a pas pu s’afficher. Veuillez réessayer.',
  reloadPage: 'Recharger la page',
  search: 'Rechercher',
  loadMore: 'Afficher plus',
  loadingMore: 'Chargement…',
  searchPlaceholder: 'Rechercher des articles',
  searchPrompt: 'Que cherchez-vous ?',
  searchPromptDetail: 'Recherchez dans toutes les rubriques.',
  searching: 'Recherche…',
  searchFailed: 'La recherche a échoué.',
  noResults: 'Aucun résultat.',
  noResultsFor: 'Rien ne correspond à « {x} ».',
  authorNotFound: 'Auteur introuvable.',
  authorNotFoundDetail: 'Aucun journaliste ne correspond à cette page.',
  authorCovers: '{x} couvre {y} pour The Global World Journal.',
  authorNoStories: '{x} n’a encore rien publié dans cette édition.',
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
  newsletters: 'Newsletters',
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
  advertisingTerms: 'Conditions de publicité',
  accessibility: 'Accessibilité',

  error404: 'Erreur 404',
  whatsNews: 'L’essentiel',
  language: 'Langue',
  homeLink: 'The Global World Journal — accueil',
  tryAgain: 'Veuillez réessayer.',
  copyright: '© {x} The Global World Journal. Tous droits réservés.',
  author: 'Auteur',

  metaHomeDescription:
    'The Global World Journal : l’actualité en direct et des enquêtes approfondies sur l’économie mondiale, les marchés, la tech, la politique, les opinions et les arts.',
  metaCategoryDescription:
    'Les dernières informations et analyses de la rubrique {x} de The Global World Journal.',
  metaAuthorDescription: 'Articles de {x}, {y} à The Global World Journal, sur {z}.',
  metaAuthorFallback: 'Articles de ce journaliste pour The Global World Journal.',
  metaSearchDescription: 'Recherchez actualités et analyses dans The Global World Journal.',
  metaTagDescription: 'Les derniers articles sur « {x} » dans The Global World Journal.',
  metaStaticDescription: '{x} sur The Global World Journal, l’actualité mondiale indépendante.',
  metaNotFoundDescription: 'The Global World Journal — l’actualité mondiale indépendante.',
  metaFeedDescription:
    'L’actualité en direct et des enquêtes approfondies de The Global World Journal.',
  newsletterHeading: 'Le point du matin',
  newsletterPrompt:
    'Les informations les plus importantes du jour dans votre boîte mail, chaque matin. Gratuit.',
  newsletterEmailLabel: 'Adresse e-mail',
  newsletterButton: 'S’inscrire',
  newsletterSending: 'Envoi…',
  newsletterCheckInbox:
    'Consultez votre boîte mail et confirmez votre adresse pour commencer à le recevoir.',
  newsletterError: 'Nous n’avons pas pu vous inscrire. Veuillez réessayer.',
  newsletterPrivacy: 'Un e-mail par jour. Désabonnement possible à tout moment.',
  newsletterConfirming: 'Confirmation de votre inscription…',
  newsletterConfirmedTitle: 'Vous êtes inscrit',
  newsletterConfirmedDetail: 'Le point du matin arrivera dans votre boîte mail chaque matin.',
  newsletterInvalidTitle: 'Ce lien n’est pas valide',
  newsletterInvalidDetail:
    'Il a peut-être expiré ou déjà été utilisé. Vous pouvez vous réinscrire à tout moment.',
  newsletterUnsubscribeTitle: 'Se désabonner',
  newsletterUnsubscribeDetail: 'Vous ne recevrez plus le point du matin.',
  newsletterUnsubscribeButton: 'Me désabonner',
  newsletterUnsubscribedTitle: 'Vous êtes désabonné',
  newsletterUnsubscribedDetail: 'Vous ne recevrez plus le point du matin.',
};

export const DICT: Record<Language, Record<DictKey, string>> = { en: EN, es: ES, fr: FR };

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

function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match: string, name: string): string => {
    const value = vars[name];
    return value === undefined ? match : value;
  });
}

/**
 * Translate a chrome key outside React (the SEO worker, tests): the edition's
 * string, else English, else the key itself, with `{x}` placeholders filled.
 */
export function translate(lang: Language, key: string, vars?: Record<string, string>): string {
  const table: Record<string, string | undefined> = DICT[lang];
  const fallback: Record<string, string | undefined> = DICT[DEFAULT_LANGUAGE];
  return interpolate(table[key] ?? fallback[key] ?? key, vars);
}

/** The sub-topics in each section's mega-menu (each links to a search for that topic). */
const SUBTOPICS: Record<Language, Record<Category, readonly string[]>> = {
  en: {
    World: ['Americas', 'Europe', 'Asia', 'Middle East', 'Africa', 'China'],
    Business: ['Technology', 'Media', 'Energy', 'Autos', 'Retail', 'Management'],
    Markets: ['Stocks', 'Bonds', 'Commodities', 'Currencies', 'Funds', 'Rates'],
    Tech: ['Artificial Intelligence', 'Cybersecurity', 'Personal Tech', 'Startups', 'Big Tech'],
    Politics: ['Elections', 'Policy', 'National Security', 'Courts', 'Economy'],
    Opinion: ['Editorials', 'Commentary', 'Columnists', 'Letters'],
    Arts: ['Books', 'Film', 'Music', 'Television', 'Theater', 'Design'],
  },
  es: {
    World: ['América', 'Europa', 'Asia', 'Oriente Medio', 'África', 'China'],
    Business: ['Tecnología', 'Medios', 'Energía', 'Automoción', 'Comercio minorista', 'Gestión'],
    Markets: ['Bolsa', 'Bonos', 'Materias primas', 'Divisas', 'Fondos', 'Tipos de interés'],
    Tech: [
      'Inteligencia artificial',
      'Ciberseguridad',
      'Tecnología personal',
      'Startups',
      'Gigantes tecnológicos',
    ],
    Politics: ['Elecciones', 'Políticas públicas', 'Seguridad nacional', 'Tribunales', 'Economía'],
    Opinion: ['Editoriales', 'Comentario', 'Columnistas', 'Cartas'],
    Arts: ['Libros', 'Cine', 'Música', 'Televisión', 'Teatro', 'Diseño'],
  },
  fr: {
    World: ['Amériques', 'Europe', 'Asie', 'Moyen-Orient', 'Afrique', 'Chine'],
    Business: ['Technologie', 'Médias', 'Énergie', 'Automobile', 'Distribution', 'Management'],
    Markets: ['Actions', 'Obligations', 'Matières premières', 'Devises', 'Fonds', 'Taux'],
    Tech: [
      'Intelligence artificielle',
      'Cybersécurité',
      'Tech grand public',
      'Startups',
      'Géants de la tech',
    ],
    Politics: ['Élections', 'Politiques publiques', 'Sécurité nationale', 'Tribunaux', 'Économie'],
    Opinion: ['Éditoriaux', 'Analyses', 'Chroniqueurs', 'Courrier des lecteurs'],
    Arts: ['Livres', 'Cinéma', 'Musique', 'Télévision', 'Théâtre', 'Design'],
  },
};

/** The mega-menu topics of a section, in the edition's language. */
export function subtopics(category: Category, lang: Language): readonly string[] {
  return SUBTOPICS[lang][category];
}

/**
 * Writers' job titles, keyed by the roster's English title (which is the
 * canonical value). A test asserts every roster title has a translation.
 */
const WRITER_TITLES: Record<string, Record<Exclude<Language, 'en'>, string>> = {
  'Senior Markets Correspondent': {
    es: 'Corresponsal sénior de mercados',
    fr: 'Correspondant senior marchés',
  },
  'Asia Markets & Tech Reporter': {
    es: 'Reportero de mercados y tecnología en Asia',
    fr: 'Reporter marchés et tech en Asie',
  },
  'Business Editor': { es: 'Editor de negocios', fr: 'Rédacteur en chef affaires' },
  'Global Business Correspondent': {
    es: 'Corresponsal global de negocios',
    fr: 'Correspondant affaires internationales',
  },
  'Technology Correspondent': { es: 'Corresponsal de tecnología', fr: 'Correspondant tech' },
  'AI & Semiconductors Reporter': {
    es: 'Reportero de IA y semiconductores',
    fr: 'Reporter IA et semi-conducteurs',
  },
  'Foreign Correspondent': {
    es: 'Corresponsal en el extranjero',
    fr: 'Correspondant à l’étranger',
  },
  'Diplomatic Correspondent': { es: 'Corresponsal diplomático', fr: 'Correspondant diplomatique' },
  'National Politics Reporter': {
    es: 'Reportero de política nacional',
    fr: 'Reporter politique nationale',
  },
  'Legal & Policy Reporter': {
    es: 'Reportero de justicia y políticas públicas',
    fr: 'Reporter justice et politiques publiques',
  },
  Columnist: { es: 'Columnista', fr: 'Chroniqueur' },
  'Editorial Board': { es: 'Consejo editorial', fr: 'Comité éditorial' },
  'Culture Critic': { es: 'Crítico cultural', fr: 'Critique culturel' },
  'Books & Film Reporter': { es: 'Reportero de libros y cine', fr: 'Reporter livres et cinéma' },
  'Senior Writer at Large': { es: 'Redactor sénior', fr: 'Grand reporter' },
  'Global Technology Correspondent': {
    es: 'Corresponsal global de tecnología',
    fr: 'Correspondant tech international',
  },
  'Features Correspondent': { es: 'Corresponsal de reportajes', fr: 'Correspondant reportages' },
  'Economics Correspondent': { es: 'Corresponsal de economía', fr: 'Correspondant économique' },
};

/** A roster writer's job title in the edition's language (English is the roster's own). */
export function writerTitle(englishTitle: string, lang: Language): string {
  if (lang === 'en') {
    return englishTitle;
  }
  return WRITER_TITLES[englishTitle]?.[lang] ?? englishTitle;
}

/** Whether every English writer title has an es/fr translation (asserted by a test). */
export function hasWriterTitle(englishTitle: string): boolean {
  return englishTitle in WRITER_TITLES;
}
