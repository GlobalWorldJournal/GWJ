import type { Language } from '@gwj/shared-types';

/** Every string of the newsletter emails, per edition. */
export interface NewsletterCopy {
  confirmSubject: string;
  confirmIntro: string;
  confirmButton: string;
  confirmIgnore: string;
  digestName: string;
  digestFooter: string;
  unsubscribe: string;
  readMore: string;
}

export const NEWSLETTER_COPY: Record<Language, NewsletterCopy> = {
  en: {
    confirmSubject: 'Confirm your subscription to The Global World Journal',
    confirmIntro:
      'Confirm your email address to receive The Global World Journal’s morning briefing: the day’s most important stories, every morning.',
    confirmButton: 'Confirm subscription',
    confirmIgnore: 'If you did not ask for this, ignore this email and nothing will be sent.',
    digestName: 'Morning Briefing',
    digestFooter: 'You receive this because you subscribed to The Global World Journal.',
    unsubscribe: 'Unsubscribe',
    readMore: 'Read the story',
  },
  es: {
    confirmSubject: 'Confirma tu suscripción a The Global World Journal',
    confirmIntro:
      'Confirma tu correo para recibir el resumen de la mañana de The Global World Journal: las noticias más importantes del día, cada mañana.',
    confirmButton: 'Confirmar suscripción',
    confirmIgnore: 'Si no lo has pedido tú, ignora este correo y no se enviará nada.',
    digestName: 'Resumen de la mañana',
    digestFooter: 'Recibes este correo porque te suscribiste a The Global World Journal.',
    unsubscribe: 'Darse de baja',
    readMore: 'Leer la noticia',
  },
  fr: {
    confirmSubject: 'Confirmez votre abonnement à The Global World Journal',
    confirmIntro:
      'Confirmez votre adresse e-mail pour recevoir le point du matin de The Global World Journal : les informations les plus importantes du jour, chaque matin.',
    confirmButton: 'Confirmer l’abonnement',
    confirmIgnore:
      'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : rien ne sera envoyé.',
    digestName: 'Le point du matin',
    digestFooter: 'Vous recevez ce message car vous êtes abonné à The Global World Journal.',
    unsubscribe: 'Se désabonner',
    readMore: 'Lire l’article',
  },
};
