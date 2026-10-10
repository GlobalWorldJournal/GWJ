import type { TakedownClaimType } from '@gwj/shared-types';
import type { Localized } from './model';

/** Every visible string of the Report Content (takedown request) form. */
export interface ReportContentCopy {
  readonly title: string;
  readonly intro: string;
  readonly nameLabel: string;
  readonly emailLabel: string;
  readonly articleLabel: string;
  readonly articlePlaceholder: string;
  readonly imageLabel: string;
  readonly claimPrompt: string;
  readonly claims: Readonly<Record<TakedownClaimType, string>>;
  readonly explanationLabel: string;
  readonly goodFaith: string;
  /** Shown when the failure carries no message of its own. */
  readonly submitFailed: string;
  readonly submitting: string;
  readonly submit: string;
  readonly receivedTitle: string;
  /** The confirmation reads `{receivedBefore}<reference id>{receivedAfter}`. */
  readonly receivedBefore: string;
  readonly receivedAfter: string;
}

export const REPORT_CONTENT: Localized<ReportContentCopy> = {
  en: {
    title: 'Report Content',
    intro:
      'Our newsroom credits every photograph to its original source, but attribution is not the same as a license. If you hold the rights to an image or article of yours that appears here without permission, or if something we published about you violates your rights, tell us below and we will review it.',
    nameLabel: 'Your name',
    emailLabel: 'Your email (so we can follow up)',
    articleLabel: 'Link to the article (if applicable)',
    articlePlaceholder: 'https://globalworldjournal.com/article/…',
    imageLabel: 'Link to the specific image (if applicable)',
    claimPrompt: 'What are you reporting?',
    claims: {
      copyright: 'I hold the copyright to this image or text',
      'subject-rights': 'I am the subject of this content and it violates my rights',
      other: 'Other',
    },
    explanationLabel: 'Tell us what happened (how you hold the rights, or how this affects you)',
    goodFaith:
      'I state, in good faith, that the information above is accurate and that I am the rights holder or am authorized to act on their behalf.',
    submitFailed: 'Could not submit this report.',
    submitting: 'Submitting…',
    submit: 'Submit Report',
    receivedTitle: 'Request Received',
    receivedBefore: 'Thank you. Your request (reference ',
    receivedAfter:
      ') has been logged for review. We take these reports seriously and will act on genuine claims; we may contact you at the email address you provided if we need more detail.',
  },
  es: {
    title: 'Denunciar contenido',
    intro:
      'Nuestra redacción atribuye cada fotografía a su fuente original, pero atribuir no equivale a tener una licencia. Si eres titular de los derechos de una imagen o un artículo tuyo que aparece aquí sin permiso, o si algo que hemos publicado sobre ti vulnera tus derechos, cuéntanoslo a continuación y lo revisaremos.',
    nameLabel: 'Tu nombre',
    emailLabel: 'Tu correo electrónico (para poder responderte)',
    articleLabel: 'Enlace al artículo (si procede)',
    articlePlaceholder: 'https://globalworldjournal.com/es/article/…',
    imageLabel: 'Enlace a la imagen concreta (si procede)',
    claimPrompt: '¿Qué quieres denunciar?',
    claims: {
      copyright: 'Soy titular de los derechos de autor de esta imagen o texto',
      'subject-rights': 'Aparezco en este contenido y vulnera mis derechos',
      other: 'Otro motivo',
    },
    explanationLabel:
      'Cuéntanos qué ha ocurrido (cómo acreditas tus derechos o de qué manera te afecta)',
    goodFaith:
      'Declaro de buena fe que la información anterior es exacta y que soy titular de los derechos o tengo autorización para actuar en su nombre.',
    submitFailed: 'No se pudo enviar la denuncia.',
    submitting: 'Enviando…',
    submit: 'Enviar denuncia',
    receivedTitle: 'Solicitud recibida',
    receivedBefore: 'Gracias. Tu solicitud (referencia ',
    receivedAfter:
      ') ha quedado registrada para su revisión. Nos tomamos muy en serio estos avisos y actuaremos ante las reclamaciones fundadas; es posible que te escribamos a la dirección de correo electrónico que nos has facilitado si necesitamos más información.',
  },
  fr: {
    title: 'Signaler un contenu',
    intro:
      'Notre rédaction crédite chaque photographie à sa source d’origine, mais créditer n’équivaut pas à détenir une licence. Si vous détenez les droits d’une image ou d’un article qui vous appartient et qui figure ici sans autorisation, ou si un contenu que nous avons publié à votre sujet porte atteinte à vos droits, signalez-le-nous ci-dessous et nous l’examinerons.',
    nameLabel: 'Votre nom',
    emailLabel: 'Votre e-mail (pour que nous puissions vous recontacter)',
    articleLabel: 'Lien vers l’article (le cas échéant)',
    articlePlaceholder: 'https://globalworldjournal.com/fr/article/…',
    imageLabel: 'Lien vers l’image concernée (le cas échéant)',
    claimPrompt: 'Que souhaitez-vous signaler\u00a0?',
    claims: {
      copyright: 'Je suis titulaire des droits d’auteur sur cette image ou ce texte',
      'subject-rights':
        'Je suis la personne visée par ce contenu et il porte atteinte à mes droits',
      other: 'Autre',
    },
    explanationLabel:
      'Expliquez-nous ce qui s’est passé (comment vous détenez les droits, ou en quoi ce contenu vous affecte)',
    goodFaith:
      'Je déclare de bonne foi que les informations ci-dessus sont exactes et que je suis titulaire des droits ou autorisé(e) à agir en son nom.',
    submitFailed: 'Impossible d’envoyer ce signalement.',
    submitting: 'Envoi en cours…',
    submit: 'Envoyer le signalement',
    receivedTitle: 'Demande reçue',
    receivedBefore: 'Merci. Votre demande (référence ',
    receivedAfter:
      ') a bien été enregistrée et sera examinée. Nous prenons ces signalements au sérieux et donnerons suite aux réclamations fondées\u00a0; nous pourrons vous contacter à l’adresse e-mail que vous avez indiquée si nous avons besoin de précisions.',
  },
};
