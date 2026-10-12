/**
 * GWJ's own ads, served into a slot while no direct campaign is booked. Every
 * ad is plain data rendered by the one `HouseAdView` unit, which adapts to the
 * width of whatever slot it lands in (leaderboard, in-feed or rectangle): a new
 * ad is a new object here, never a new layout.
 */

import type { Language } from '@gwj/shared-types';

export interface HouseAdLink {
  href: string;
  /** Opens in a new tab with the paid-link rel when it leaves the site. */
  external?: boolean;
}

/** The advertiser's own picture; without one the unit shows photos from the latest news. */
export interface HouseAdArt {
  src: string;
  alt: Record<Language, string>;
}

/** Everything a reader can read in an ad, in one edition's language. */
export interface HouseAdCopy {
  title: string;
  subtitle: string;
  /** Tighter copy for narrow slots, where the picture is dropped and the text stands alone. */
  compact?: { title: string; subtitle: string };
  primaryLabel: string;
  secondaryLabel?: string;
  /** Short selling points, listed beside the copy when the slot is wide enough. */
  features?: readonly string[];
}

export interface HouseAd {
  id: string;
  primary: HouseAdLink;
  secondary?: HouseAdLink;
  art?: HouseAdArt;
  /** One entry per edition: adding a language to the site makes this fail to compile until translated. */
  copy: Record<Language, HouseAdCopy>;
}

export const HOUSE_ADS: readonly HouseAd[] = [
  {
    id: 'mention',
    primary: { href: 'https://mention.earth/', external: true },
    secondary: { href: 'https://oxy.so/mention', external: true },
    art: {
      src: '/ads/mention.jpg',
      alt: {
        en: 'Friends gathered around the Mention logo under a blue sky',
        es: 'Amigos reunidos alrededor del logo de Mention bajo un cielo azul',
        fr: 'Des amis réunis autour du logo Mention sous un ciel bleu',
      },
    },
    copy: {
      en: {
        title: 'Mention, an open social network',
        subtitle: 'On the fediverse, without engagement-maxxing algorithms or surveillance ads.',
        compact: {
          title: 'Your feed, your rules',
          subtitle: 'Mention is the open social network where nobody sells your attention.',
        },
        primaryLabel: 'Join Mention',
        secondaryLabel: 'Learn more',
        features: [
          'Your posts travel through ActivityPub',
          'No engagement-maxxing algorithms',
          'No surveillance ads',
          'Follow Global World Journal there',
        ],
      },
      es: {
        title: 'Mention, una red social abierta',
        subtitle:
          'En el fediverso, sin algoritmos que maximizan la adicción ni anuncios de vigilancia.',
        compact: {
          title: 'Tu feed, tus reglas',
          subtitle: 'Mention es la red social abierta donde nadie vende tu atención.',
        },
        primaryLabel: 'Únete a Mention',
        secondaryLabel: 'Más información',
        features: [
          'Tus publicaciones viajan por ActivityPub',
          'Sin algoritmos que maximizan la adicción',
          'Sin anuncios de vigilancia',
          'Sigue a Global World Journal allí',
        ],
      },
      fr: {
        title: 'Mention, un réseau social ouvert',
        subtitle: 'Sur le fédiverse, sans algorithmes d’engagement ni publicités de surveillance.',
        compact: {
          title: 'Votre fil, vos règles',
          subtitle: 'Mention est le réseau social ouvert où personne ne vend votre attention.',
        },
        primaryLabel: 'Rejoindre Mention',
        secondaryLabel: 'En savoir plus',
        features: [
          'Vos publications voyagent via ActivityPub',
          'Aucun algorithme d’engagement',
          'Aucune publicité de surveillance',
          'Suivez Global World Journal sur Mention',
        ],
      },
    },
  },
  {
    id: 'advertise',
    primary: { href: '/advertise' },
    secondary: { href: '/about' },
    copy: {
      en: {
        title: 'Advertise with Global World Journal',
        subtitle: 'Reach readers who follow world affairs, markets and technology every day.',
        primaryLabel: 'Advertise with us',
        secondaryLabel: 'Learn more',
        features: [
          'Placement beside our reporting',
          'Leaderboard, rectangle and in-feed slots',
          'Booked directly, no middlemen',
          'Readers in three languages',
          'Clearly labelled, never intrusive',
        ],
      },
      es: {
        title: 'Anúnciate en Global World Journal',
        subtitle:
          'Llega a lectores que siguen cada día la actualidad mundial, los mercados y la tecnología.',
        primaryLabel: 'Anúnciate con nosotros',
        secondaryLabel: 'Más información',
        features: [
          'Junto a nuestro periodismo',
          'Formatos leaderboard, rectángulo e in-feed',
          'Contratación directa, sin intermediarios',
          'Lectores en tres idiomas',
          'Siempre señalizado, nunca intrusivo',
        ],
      },
      fr: {
        title: 'Faites de la publicité sur Global World Journal',
        subtitle:
          'Touchez des lecteurs qui suivent chaque jour l’actualité mondiale, les marchés et la tech.',
        primaryLabel: 'Annoncer chez nous',
        secondaryLabel: 'En savoir plus',
        features: [
          'À côté de nos reportages',
          'Formats bandeau, rectangle et in-feed',
          'Réservation directe, sans intermédiaire',
          'Des lecteurs en trois langues',
          'Toujours signalé, jamais intrusif',
        ],
      },
    },
  },
];
