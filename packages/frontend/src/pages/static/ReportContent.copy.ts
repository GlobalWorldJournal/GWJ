import type { Language, TakedownClaimType } from '@gwj/shared-types';

export interface ReportContentCopy {
  title: string;
  receivedTitle: string;
  /** Text before the bold reference id. */
  receivedBefore: string;
  /** Text after the bold reference id. */
  receivedAfter: string;
  intro: string;
  nameLabel: string;
  emailLabel: string;
  articleLabel: string;
  imageLabel: string;
  claimLegend: string;
  claimLabels: Record<TakedownClaimType, string>;
  explanationLabel: string;
  goodFaith: string;
  submitError: string;
  submitting: string;
  submit: string;
}

export const REPORT_KICKER = 'The Global World Journal';

export const REPORT_COPY: Record<Language, ReportContentCopy> = {
  en: {
    title: 'Report Content',
    receivedTitle: 'Request Received',
    receivedBefore: 'Thank you. Your request (reference',
    receivedAfter:
      ') has been logged for review. We take these reports seriously and will act on genuine claims; we may contact you at the email address you provided if we need more detail.',
    intro:
      'We take the rights of photographers, writers and the people we cover seriously. If you believe something we published infringes your copyright, or that something we published about you violates your rights, tell us below and we will review it.',
    nameLabel: 'Your name',
    emailLabel: 'Your email (so we can follow up)',
    articleLabel: 'Link to the article (if applicable)',
    imageLabel: 'Link to the specific image (if applicable)',
    claimLegend: 'What are you reporting?',
    claimLabels: {
      copyright: 'I hold the copyright to this image or text',
      'subject-rights': 'I am the subject of this content and it violates my rights',
      other: 'Other',
    },
    explanationLabel: 'Tell us what happened (how you hold the rights, or how this affects you)',
    goodFaith:
      'I state, in good faith, that the information above is accurate and that I am the rights holder or am authorized to act on their behalf.',
    submitError: 'Could not submit this report.',
    submitting: 'Submitting…',
    submit: 'Submit Report',
  },
  es: {
    title: 'Denunciar contenido',
    receivedTitle: 'Solicitud recibida',
    receivedBefore: 'Gracias. Su solicitud (referencia',
    receivedAfter:
      ') ha quedado registrada para su revisión. Nos tomamos estas denuncias en serio y actuaremos ante las reclamaciones legítimas; es posible que nos pongamos en contacto con usted en el correo electrónico que indicó si necesitamos más detalles.',
    intro:
      'Nos tomamos en serio los derechos de fotógrafos, autores y de las personas sobre las que informamos. Si cree que algo que hemos publicado infringe sus derechos de autor, o que algo que publicamos sobre usted vulnera sus derechos, cuéntenoslo a continuación y lo revisaremos.',
    nameLabel: 'Su nombre',
    emailLabel: 'Su correo electrónico (para poder responderle)',
    articleLabel: 'Enlace al artículo (si corresponde)',
    imageLabel: 'Enlace a la imagen concreta (si corresponde)',
    claimLegend: '¿Qué desea denunciar?',
    claimLabels: {
      copyright: 'Soy titular de los derechos de autor de esta imagen o texto',
      'subject-rights': 'Soy la persona retratada en este contenido y vulnera mis derechos',
      other: 'Otro',
    },
    explanationLabel:
      'Cuéntenos qué ha ocurrido (cómo posee los derechos o de qué manera le afecta)',
    goodFaith:
      'Declaro, de buena fe, que la información anterior es exacta y que soy el titular de los derechos o estoy autorizado para actuar en su nombre.',
    submitError: 'No se pudo enviar esta denuncia.',
    submitting: 'Enviando…',
    submit: 'Enviar denuncia',
  },
  fr: {
    title: 'Signaler un contenu',
    receivedTitle: 'Demande reçue',
    receivedBefore: 'Merci. Votre demande (référence',
    receivedAfter:
      ') a été enregistrée pour examen. Nous prenons ces signalements au sérieux et donnerons suite aux réclamations légitimes ; nous pourrons vous contacter à l’adresse e-mail indiquée si nous avons besoin de précisions.',
    intro:
      'Nous prenons au sérieux les droits des photographes, des auteurs et des personnes dont nous parlons. Si vous estimez qu’un contenu que nous avons publié porte atteinte à vos droits d’auteur, ou qu’un contenu publié à votre sujet porte atteinte à vos droits, dites-le-nous ci-dessous et nous l’examinerons.',
    nameLabel: 'Votre nom',
    emailLabel: 'Votre adresse e-mail (pour que nous puissions vous répondre)',
    articleLabel: 'Lien vers l’article (le cas échéant)',
    imageLabel: 'Lien vers l’image concernée (le cas échéant)',
    claimLegend: 'Que souhaitez-vous signaler ?',
    claimLabels: {
      copyright: 'Je détiens les droits d’auteur de cette image ou de ce texte',
      'subject-rights':
        'Je suis la personne concernée par ce contenu et il porte atteinte à mes droits',
      other: 'Autre',
    },
    explanationLabel:
      'Expliquez-nous ce qui s’est passé (comment vous détenez les droits, ou en quoi cela vous touche)',
    goodFaith:
      'Je déclare, de bonne foi, que les informations ci-dessus sont exactes et que je suis le titulaire des droits ou que je suis autorisé à agir en son nom.',
    submitError: 'Impossible d’envoyer ce signalement.',
    submitting: 'Envoi en cours…',
    submit: 'Envoyer le signalement',
  },
};
