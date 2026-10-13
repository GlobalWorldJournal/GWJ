import type { Language } from '@gwj/shared-types';

export interface NewslettersCopy {
  title: string;
  intro: string;
  channelTitle: string;
  items: readonly { name: string; description: string }[];
  followTitle: string;
  followBefore: string;
  followAfter: string;
  followButton: string;
  whatsappBefore: string;
  followUsLink: string;
}

const EN: NewslettersCopy = {
  title: 'Telegram',
  intro:
    'The Journal goes out on Telegram, not email. Our channel brings the newsroom to your phone, edited by the journalists who cover each beat, so you can read on your own schedule and never miss the stories that matter.',
  channelTitle: 'On our channel',
  items: [
    {
      name: 'Morning Briefing',
      description: 'the stories and context you need before the day begins.',
    },
    {
      name: 'Markets Close',
      description: 'what moved stocks, bonds, and currencies, explained after the bell.',
    },
    {
      name: 'World This Week',
      description: 'a weekend read on the events shaping the global agenda.',
    },
    {
      name: 'Tech Weekly',
      description: 'the companies, products, and policy decisions driving technology.',
    },
    {
      name: 'Opinion Digest',
      description: 'the week in argument, from our columnists and contributors.',
    },
  ],
  followTitle: 'How to follow',
  followBefore: 'Join us on Telegram at',
  followAfter:
    'and you will get every edition as it publishes. You can leave the channel at any time, right from Telegram.',
  followButton: 'Follow on Telegram',
  whatsappBefore: 'WhatsApp is planned next. For all the ways to follow the Journal, see',
  followUsLink: 'Follow Us',
};

const ES: NewslettersCopy = {
  title: 'Telegram',
  intro:
    'El Journal se distribuye por Telegram, no por correo electrónico. Nuestro canal lleva la redacción a su teléfono, editado por los periodistas que cubren cada área, para que pueda leer a su propio ritmo y no se pierda las noticias que importan.',
  channelTitle: 'En nuestro canal',
  items: [
    {
      name: 'Morning Briefing',
      description: 'las noticias y el contexto que necesita antes de que empiece el día.',
    },
    {
      name: 'Markets Close',
      description: 'qué movió las acciones, los bonos y las divisas, explicado después del cierre.',
    },
    {
      name: 'World This Week',
      description: 'una lectura de fin de semana sobre los hechos que marcan la agenda global.',
    },
    {
      name: 'Tech Weekly',
      description:
        'las empresas, los productos y las decisiones de política que impulsan la tecnología.',
    },
    {
      name: 'Opinion Digest',
      description: 'la semana en clave de debate, con nuestros columnistas y colaboradores.',
    },
  ],
  followTitle: 'Cómo seguirnos',
  followBefore: 'Súmese a nosotros en Telegram en',
  followAfter:
    'y recibirá cada edición en cuanto se publique. Puede abandonar el canal en cualquier momento, directamente desde Telegram.',
  followButton: 'Seguir en Telegram',
  whatsappBefore:
    'WhatsApp es el siguiente paso previsto. Para conocer todas las formas de seguir el Journal, consulte',
  followUsLink: 'Síganos',
};

const FR: NewslettersCopy = {
  title: 'Telegram',
  intro:
    'Le Journal est diffusé sur Telegram, et non par e-mail. Notre chaîne apporte la rédaction sur votre téléphone, éditée par les journalistes qui couvrent chaque domaine, pour que vous lisiez à votre rythme sans jamais manquer les sujets qui comptent.',
  channelTitle: 'Sur notre chaîne',
  items: [
    {
      name: 'Morning Briefing',
      description:
        'les informations et le contexte dont vous avez besoin avant le début de la journée.',
    },
    {
      name: 'Markets Close',
      description:
        'ce qui a fait bouger les actions, les obligations et les devises, expliqué après la clôture.',
    },
    {
      name: 'World This Week',
      description: 'une lecture du week-end sur les événements qui façonnent l’agenda mondial.',
    },
    {
      name: 'Tech Weekly',
      description:
        'les entreprises, les produits et les décisions politiques qui font avancer la technologie.',
    },
    {
      name: 'Opinion Digest',
      description: 'la semaine en débats, avec nos chroniqueurs et nos contributeurs.',
    },
  ],
  followTitle: 'Comment nous suivre',
  followBefore: 'Rejoignez-nous sur Telegram à l’adresse',
  followAfter:
    'et recevez chaque édition dès sa publication. Vous pouvez quitter la chaîne à tout moment, directement depuis Telegram.',
  followButton: 'Suivre sur Telegram',
  whatsappBefore:
    'WhatsApp est prévu prochainement. Pour découvrir toutes les façons de suivre le Journal, consultez',
  followUsLink: 'Suivez-nous',
};

export const NEWSLETTERS_COPY: Record<Language, NewslettersCopy> = { en: EN, es: ES, fr: FR };
