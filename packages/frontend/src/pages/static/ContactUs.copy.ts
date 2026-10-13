import type { Language } from '@gwj/shared-types';

export const CONTACT_EMAILS = {
  news: 'news@globalworldjournal.com',
  support: 'support@globalworldjournal.com',
  advertising: 'advertising@globalworldjournal.com',
} as const;

export interface ContactSection {
  heading: string;
  body: string;
  email: string;
}

export interface ContactUsCopy {
  title: string;
  intro: string;
  emailLabel: string;
  newsroom: ContactSection;
  support: ContactSection;
  advertising: ContactSection;
  confidential: { heading: string; before: string; after: string };
}

export const CONTACT_US_COPY: Record<Language, ContactUsCopy> = {
  en: {
    title: 'Contact Us',
    intro:
      'We want to hear from you. Whether you have a story tip, a question about your account, or an advertising inquiry, reach the right team below and we will get back to you as quickly as we can.',
    emailLabel: 'Email',
    newsroom: {
      heading: 'Newsroom',
      body: 'Story ideas, corrections, and feedback on our coverage go to our editors. We read every message, though we cannot respond to all of them individually.',
      email: CONTACT_EMAILS.news,
    },
    support: {
      heading: 'General and subscriber support',
      body: 'Questions about your subscription, billing, delivery, or account settings are handled by our support team.',
      email: CONTACT_EMAILS.support,
    },
    advertising: {
      heading: 'Advertising and partnerships',
      body: 'For media kits, sponsorship opportunities, and partnership proposals, contact our commercial team.',
      email: CONTACT_EMAILS.advertising,
    },
    confidential: {
      heading: 'Confidential tips and secure contact',
      before: 'If you have sensitive information for our reporters, write to',
      after:
        'and note that the matter is confidential. For especially sensitive material, ask us to arrange a secure, encrypted channel before you send anything, and avoid including identifying details in your first message.',
    },
  },
  es: {
    title: 'Contacto',
    intro:
      'Queremos saber de ti. Ya sea una pista para una noticia, una duda sobre tu cuenta o una consulta publicitaria, escribe al equipo adecuado a continuación y te responderemos lo antes posible.',
    emailLabel: 'Correo electrónico',
    newsroom: {
      heading: 'Redacción',
      body: 'Las ideas de reportajes, las correcciones y los comentarios sobre nuestra cobertura llegan a nuestros editores. Leemos todos los mensajes, aunque no podemos responder a cada uno de forma individual.',
      email: CONTACT_EMAILS.news,
    },
    support: {
      heading: 'Atención general y a suscriptores',
      body: 'Las preguntas sobre tu suscripción, la facturación, la entrega o los ajustes de tu cuenta las atiende nuestro equipo de soporte.',
      email: CONTACT_EMAILS.support,
    },
    advertising: {
      heading: 'Publicidad y alianzas',
      body: 'Para kits de medios, oportunidades de patrocinio y propuestas de alianza, contacta con nuestro equipo comercial.',
      email: CONTACT_EMAILS.advertising,
    },
    confidential: {
      heading: 'Pistas confidenciales y contacto seguro',
      before: 'Si tienes información sensible para nuestros reporteros, escribe a',
      after:
        'e indica que el asunto es confidencial. Si el material es especialmente delicado, pídenos que habilitemos un canal seguro y cifrado antes de enviar nada, y evita incluir datos identificativos en tu primer mensaje.',
    },
  },
  fr: {
    title: 'Nous contacter',
    intro:
      'Nous voulons avoir de vos nouvelles. Qu’il s’agisse d’une piste d’article, d’une question sur votre compte ou d’une demande publicitaire, écrivez à l’équipe concernée ci-dessous et nous vous répondrons dès que possible.',
    emailLabel: 'E-mail',
    newsroom: {
      heading: 'Rédaction',
      body: 'Les idées de sujets, les corrections et les retours sur notre couverture sont adressés à nos rédacteurs. Nous lisons chaque message, même si nous ne pouvons pas répondre à tous individuellement.',
      email: CONTACT_EMAILS.news,
    },
    support: {
      heading: 'Assistance générale et abonnés',
      body: 'Les questions concernant votre abonnement, la facturation, la livraison ou les paramètres de votre compte sont traitées par notre équipe d’assistance.',
      email: CONTACT_EMAILS.support,
    },
    advertising: {
      heading: 'Publicité et partenariats',
      body: 'Pour les kits média, les opportunités de parrainage et les propositions de partenariat, contactez notre équipe commerciale.',
      email: CONTACT_EMAILS.advertising,
    },
    confidential: {
      heading: 'Informations confidentielles et contact sécurisé',
      before: 'Si vous détenez des informations sensibles pour nos journalistes, écrivez à',
      after:
        'en précisant que le sujet est confidentiel. Pour les éléments particulièrement sensibles, demandez-nous de mettre en place un canal chiffré et sécurisé avant d’envoyer quoi que ce soit, et évitez d’inclure des éléments d’identification dans votre premier message.',
    },
  },
};
