import type { AdVariant, AdvertiserCampaign, Language } from '@gwj/shared-types';
import type { CreativeProblem } from '../../lib/creative';

type CampaignStatus = AdvertiserCampaign['status'];

/**
 * Every word of the self-serve advertising pages, one object per edition.
 * `Record<Language, …>` makes a missing language, or a missing key inside one,
 * fail to compile.
 */
export interface AdvertiseCopy {
  /** Advertise page */
  cta: string;
  ctaDashboard: string;
  pricingTitle: string;
  pricingIntro: string;
  slotColumn: string;
  priceColumn: string;
  perDay: string;
  pricingNote: string;
  termsLink: string;
  slots: Record<AdVariant, { name: string; size: string; description: string }>;

  /** Wizard */
  wizardTitle: string;
  wizardIntro: string;
  stepAccount: string;
  stepSlot: string;
  stepCreative: string;
  stepPay: string;
  signedInAs: string;
  signOut: string;
  tabRegister: string;
  tabLogin: string;
  company: string;
  email: string;
  password: string;
  passwordHint: string;
  createAccount: string;
  signIn: string;
  working: string;
  acceptTerms: string;
  acceptTermsLead: string;
  acceptTermsLink: string;
  acceptTermsTail: string;
  mustAcceptTerms: string;
  authFailed: string;
  chooseSlot: string;
  chooseDates: string;
  dateHint: string;
  prevMonth: string;
  nextMonth: string;
  legendTaken: string;
  legendChosen: string;
  noDates: string;
  rangeBlocked: string;
  availabilityFailed: string;
  daysCount: string;
  uploadImage: string;
  replaceImage: string;
  uploading: string;
  creativeHelp: string;
  creativeProblems: Record<CreativeProblem, string>;
  uploadFailed: string;
  previewTitle: string;
  destinationUrl: string;
  destinationHelp: string;
  httpsOnly: string;
  adName: string;
  adNameHelp: string;
  summaryTitle: string;
  summarySlot: string;
  summaryDates: string;
  summaryDays: string;
  summaryRate: string;
  summaryTotal: string;
  summaryEmpty: string;
  holdNote: string;
  pay: string;
  paying: string;
  bookingConflict: string;
  bookingFailed: string;
  finalNote: string;

  /** Dashboard */
  dashboardTitle: string;
  dashboardIntro: string;
  newAd: string;
  noCampaigns: string;
  signInToSee: string;
  loadFailed: string;
  payNow: string;
  heldUntil: string;
  amount: string;
  statuses: Record<CampaignStatus, string>;
  statusHelp: Record<CampaignStatus, string>;

  /** Success page */
  successTitle: string;
  successWaiting: string;
  successDone: string;
  successSlow: string;
  successScheduled: string;
  successLive: string;
  viewDashboard: string;
}

const EN: AdvertiseCopy = {
  cta: 'Place an ad',
  ctaDashboard: 'My ads',
  pricingTitle: 'Simple, fixed pricing',
  pricingIntro:
    'Pick a slot, pick your dates, upload your ad and pay by card. Your ad goes live by itself on the first day. No contracts, no negotiations.',
  slotColumn: 'Slot',
  priceColumn: 'Price',
  perDay: 'per day',
  pricingNote:
    'One advertiser per slot per day. All prices in US dollars. Payments are final and non-refundable, see the',
  termsLink: 'Advertising Terms',
  slots: {
    leaderboard: {
      name: 'Leaderboard',
      size: '728 × 90',
      description: 'A wide banner across the top of the page and between sections.',
    },
    mrec: {
      name: 'Medium rectangle',
      size: '300 × 250',
      description: 'A rectangle in the sidebar, next to the stories readers are following.',
    },
    inline: {
      name: 'In-feed',
      size: 'Full column width',
      description: 'A wide unit that sits inside the story lists and across articles.',
    },
  },

  wizardTitle: 'Place an ad',
  wizardIntro: 'Four quick steps. Your ad publishes automatically as soon as payment succeeds.',
  stepAccount: 'Your account',
  stepSlot: 'Slot and dates',
  stepCreative: 'Your ad',
  stepPay: 'Review and pay',
  signedInAs: 'Signed in as',
  signOut: 'Sign out',
  tabRegister: 'Create account',
  tabLogin: 'Sign in',
  company: 'Company or brand name',
  email: 'Email',
  password: 'Password',
  passwordHint: 'At least 10 characters.',
  createAccount: 'Create account',
  signIn: 'Sign in',
  working: 'One moment…',
  acceptTerms: 'I accept the Advertising Terms',
  acceptTermsLead: 'I accept the',
  acceptTermsLink: 'Advertising Terms',
  acceptTermsTail:
    ', including that ads may be removed at our discretion without refund and that all payments are final.',
  mustAcceptTerms: 'Please accept the Advertising Terms to continue.',
  authFailed: 'That did not work. Check your email and password and try again.',
  chooseSlot: 'Choose a slot',
  chooseDates: 'Choose your dates',
  dateHint:
    'Click the first day, then the last day. Crossed-out days are already booked. {min} to {max} days, starting within {advance} days.',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  legendTaken: 'Booked',
  legendChosen: 'Your dates',
  noDates: 'Choose at least one day.',
  rangeBlocked: 'That range includes a booked day or is too long. Starting again from this day.',
  availabilityFailed: 'Could not load availability. Please try again.',
  daysCount: '{count} days',
  uploadImage: 'Upload your image',
  replaceImage: 'Replace image',
  uploading: 'Uploading…',
  creativeHelp: 'PNG, JPEG, WebP or GIF, up to 10 MB. Shape for this slot: {shape}.',
  creativeProblems: {
    type: 'Use a PNG, JPEG, WebP or GIF image.',
    size: 'That image is larger than 10 MB.',
    dimensions: 'That image is too small. It must be at least {width} × {height} pixels.',
    shape: 'That image is the wrong shape for this slot. Use one close to {shape}.',
  },
  uploadFailed: 'The upload failed. Please try again.',
  previewTitle: 'Preview in the slot',
  destinationUrl: 'Where should a click go?',
  destinationHelp: 'A secure link starting with https://',
  httpsOnly: 'Enter a link that starts with https://',
  adName: 'Ad name',
  adNameHelp: 'Describes the image for screen readers, for example your brand and offer.',
  summaryTitle: 'Your order',
  summarySlot: 'Slot',
  summaryDates: 'Dates',
  summaryDays: 'Days',
  summaryRate: 'Daily rate',
  summaryTotal: 'Total',
  summaryEmpty: 'Choose a slot and dates to see the price.',
  holdNote: 'Your slot is held for 35 minutes while you pay, then released.',
  pay: 'Pay {amount}',
  paying: 'Redirecting to payment…',
  bookingConflict:
    'Someone just booked some of those days. The calendar has been refreshed. Please choose other dates.',
  bookingFailed: 'We could not start the payment. Please check the details and try again.',
  finalNote: 'Payments are processed by Stripe. We never see your card details.',

  dashboardTitle: 'My ads',
  dashboardIntro: 'Everything you have booked with us, in one place.',
  newAd: 'Place a new ad',
  noCampaigns: 'You have not booked an ad yet.',
  signInToSee: 'Sign in to see your ads.',
  loadFailed: 'Could not load your ads. Please try again.',
  payNow: 'Pay now',
  heldUntil: 'Held until',
  amount: 'Amount',
  statuses: {
    awaiting_payment: 'Awaiting payment',
    scheduled: 'Scheduled',
    live: 'Live',
    ended: 'Ended',
    removed: 'Removed',
    expired: 'Expired',
  },
  statusHelp: {
    awaiting_payment: 'Your slot is held until you pay.',
    scheduled: 'Paid. It goes live on the first day.',
    live: 'Running on the site right now.',
    ended: 'The run is complete.',
    removed: 'Taken down under the Advertising Terms.',
    expired: 'Never paid, so the slot was released.',
  },

  successTitle: 'Thank you',
  successWaiting: 'Confirming your payment…',
  successDone: 'Payment received. Your ad is booked.',
  successSlow:
    'Your payment is being processed. This can take a minute. Your ad will appear in My ads as soon as it is confirmed.',
  successScheduled: 'Your ad is scheduled and will go live by itself on its first day.',
  successLive: 'Your ad is live now.',
  viewDashboard: 'Go to My ads',
};

const ES: AdvertiseCopy = {
  cta: 'Publicar un anuncio',
  ctaDashboard: 'Mis anuncios',
  pricingTitle: 'Precios simples y fijos',
  pricingIntro:
    'Elige un espacio y tus fechas, sube tu anuncio y paga con tarjeta. Tu anuncio se publica solo el primer día. Sin contratos ni negociaciones.',
  slotColumn: 'Espacio',
  priceColumn: 'Precio',
  perDay: 'por día',
  pricingNote:
    'Un anunciante por espacio y día. Precios en dólares estadounidenses. Los pagos son definitivos y no reembolsables; consulta las',
  termsLink: 'Condiciones de publicidad',
  slots: {
    leaderboard: {
      name: 'Banner superior',
      size: '728 × 90',
      description: 'Un banner ancho en la parte superior de la página y entre secciones.',
    },
    mrec: {
      name: 'Rectángulo mediano',
      size: '300 × 250',
      description:
        'Un rectángulo en la columna lateral, junto a las noticias que siguen los lectores.',
    },
    inline: {
      name: 'En el listado',
      size: 'Ancho completo de la columna',
      description: 'Una unidad ancha dentro de los listados de noticias y de los artículos.',
    },
  },

  wizardTitle: 'Publicar un anuncio',
  wizardIntro:
    'Cuatro pasos rápidos. Tu anuncio se publica automáticamente en cuanto se confirma el pago.',
  stepAccount: 'Tu cuenta',
  stepSlot: 'Espacio y fechas',
  stepCreative: 'Tu anuncio',
  stepPay: 'Revisar y pagar',
  signedInAs: 'Sesión iniciada como',
  signOut: 'Cerrar sesión',
  tabRegister: 'Crear cuenta',
  tabLogin: 'Iniciar sesión',
  company: 'Empresa o marca',
  email: 'Correo electrónico',
  password: 'Contraseña',
  passwordHint: 'Al menos 10 caracteres.',
  createAccount: 'Crear cuenta',
  signIn: 'Iniciar sesión',
  working: 'Un momento…',
  acceptTerms: 'Acepto las Condiciones de publicidad',
  acceptTermsLead: 'Acepto las',
  acceptTermsLink: 'Condiciones de publicidad',
  acceptTermsTail:
    ', incluido que los anuncios pueden retirarse a nuestra discreción sin reembolso y que todos los pagos son definitivos.',
  mustAcceptTerms: 'Acepta las Condiciones de publicidad para continuar.',
  authFailed: 'No funcionó. Revisa tu correo y contraseña e inténtalo de nuevo.',
  chooseSlot: 'Elige un espacio',
  chooseDates: 'Elige tus fechas',
  dateHint:
    'Haz clic en el primer día y luego en el último. Los días tachados ya están reservados. De {min} a {max} días, empezando en un máximo de {advance} días.',
  prevMonth: 'Mes anterior',
  nextMonth: 'Mes siguiente',
  legendTaken: 'Reservado',
  legendChosen: 'Tus fechas',
  noDates: 'Elige al menos un día.',
  rangeBlocked:
    'Ese intervalo incluye un día reservado o es demasiado largo. Empezamos de nuevo desde este día.',
  availabilityFailed: 'No se pudo cargar la disponibilidad. Inténtalo de nuevo.',
  daysCount: '{count} días',
  uploadImage: 'Sube tu imagen',
  replaceImage: 'Cambiar imagen',
  uploading: 'Subiendo…',
  creativeHelp: 'PNG, JPEG, WebP o GIF, hasta 10 MB. Forma para este espacio: {shape}.',
  creativeProblems: {
    type: 'Usa una imagen PNG, JPEG, WebP o GIF.',
    size: 'Esa imagen pesa más de 10 MB.',
    dimensions: 'Esa imagen es demasiado pequeña. Debe medir al menos {width} × {height} píxeles.',
    shape: 'Esa imagen no tiene la forma de este espacio. Usa una cercana a {shape}.',
  },
  uploadFailed: 'La subida falló. Inténtalo de nuevo.',
  previewTitle: 'Vista previa en el espacio',
  destinationUrl: '¿A dónde debe llevar un clic?',
  destinationHelp: 'Un enlace seguro que empiece por https://',
  httpsOnly: 'Introduce un enlace que empiece por https://',
  adName: 'Nombre del anuncio',
  adNameHelp: 'Describe la imagen para lectores de pantalla, por ejemplo tu marca y tu oferta.',
  summaryTitle: 'Tu pedido',
  summarySlot: 'Espacio',
  summaryDates: 'Fechas',
  summaryDays: 'Días',
  summaryRate: 'Tarifa diaria',
  summaryTotal: 'Total',
  summaryEmpty: 'Elige un espacio y fechas para ver el precio.',
  holdNote: 'Tu espacio queda reservado 35 minutos mientras pagas y después se libera.',
  pay: 'Pagar {amount}',
  paying: 'Redirigiendo al pago…',
  bookingConflict:
    'Alguien acaba de reservar algunos de esos días. Hemos actualizado el calendario. Elige otras fechas.',
  bookingFailed: 'No pudimos iniciar el pago. Revisa los datos e inténtalo de nuevo.',
  finalNote: 'Los pagos los procesa Stripe. Nunca vemos los datos de tu tarjeta.',

  dashboardTitle: 'Mis anuncios',
  dashboardIntro: 'Todo lo que has reservado con nosotros, en un solo lugar.',
  newAd: 'Publicar otro anuncio',
  noCampaigns: 'Todavía no has reservado ningún anuncio.',
  signInToSee: 'Inicia sesión para ver tus anuncios.',
  loadFailed: 'No se pudieron cargar tus anuncios. Inténtalo de nuevo.',
  payNow: 'Pagar ahora',
  heldUntil: 'Reservado hasta',
  amount: 'Importe',
  statuses: {
    awaiting_payment: 'Pendiente de pago',
    scheduled: 'Programado',
    live: 'En directo',
    ended: 'Finalizado',
    removed: 'Retirado',
    expired: 'Caducado',
  },
  statusHelp: {
    awaiting_payment: 'Tu espacio está reservado hasta que pagues.',
    scheduled: 'Pagado. Se publica el primer día.',
    live: 'Se está mostrando ahora mismo en el sitio.',
    ended: 'La campaña ha terminado.',
    removed: 'Retirado según las Condiciones de publicidad.',
    expired: 'No se pagó, así que el espacio se liberó.',
  },

  successTitle: 'Gracias',
  successWaiting: 'Confirmando tu pago…',
  successDone: 'Pago recibido. Tu anuncio está reservado.',
  successSlow:
    'Estamos procesando tu pago. Puede tardar un minuto. Tu anuncio aparecerá en Mis anuncios en cuanto se confirme.',
  successScheduled: 'Tu anuncio está programado y se publicará solo el primer día.',
  successLive: 'Tu anuncio ya está en directo.',
  viewDashboard: 'Ir a Mis anuncios',
};

const FR: AdvertiseCopy = {
  cta: 'Publier une annonce',
  ctaDashboard: 'Mes annonces',
  pricingTitle: 'Des tarifs simples et fixes',
  pricingIntro:
    'Choisissez un emplacement et vos dates, envoyez votre annonce et payez par carte. Votre annonce est publiée toute seule le premier jour. Sans contrat ni négociation.',
  slotColumn: 'Emplacement',
  priceColumn: 'Tarif',
  perDay: 'par jour',
  pricingNote:
    'Un annonceur par emplacement et par jour. Prix en dollars américains. Les paiements sont définitifs et non remboursables, voir les',
  termsLink: 'Conditions de publicité',
  slots: {
    leaderboard: {
      name: 'Bandeau',
      size: '728 × 90',
      description: 'Une bannière large en haut de la page et entre les rubriques.',
    },
    mrec: {
      name: 'Rectangle moyen',
      size: '300 × 250',
      description:
        'Un rectangle dans la colonne latérale, à côté des articles que suivent les lecteurs.',
    },
    inline: {
      name: 'Dans le fil',
      size: 'Pleine largeur de colonne',
      description: 'Un format large placé dans les listes d’articles et au fil des articles.',
    },
  },

  wizardTitle: 'Publier une annonce',
  wizardIntro:
    'Quatre étapes rapides. Votre annonce est publiée automatiquement dès que le paiement est confirmé.',
  stepAccount: 'Votre compte',
  stepSlot: 'Emplacement et dates',
  stepCreative: 'Votre annonce',
  stepPay: 'Vérifier et payer',
  signedInAs: 'Connecté en tant que',
  signOut: 'Se déconnecter',
  tabRegister: 'Créer un compte',
  tabLogin: 'Se connecter',
  company: 'Société ou marque',
  email: 'E-mail',
  password: 'Mot de passe',
  passwordHint: 'Au moins 10 caractères.',
  createAccount: 'Créer le compte',
  signIn: 'Se connecter',
  working: 'Un instant…',
  acceptTerms: 'J’accepte les Conditions de publicité',
  acceptTermsLead: 'J’accepte les',
  acceptTermsLink: 'Conditions de publicité',
  acceptTermsTail:
    ', y compris le fait que les annonces peuvent être retirées à notre discrétion sans remboursement et que tous les paiements sont définitifs.',
  mustAcceptTerms: 'Veuillez accepter les Conditions de publicité pour continuer.',
  authFailed: 'Cela n’a pas fonctionné. Vérifiez votre e-mail et votre mot de passe.',
  chooseSlot: 'Choisissez un emplacement',
  chooseDates: 'Choisissez vos dates',
  dateHint:
    'Cliquez sur le premier jour, puis sur le dernier. Les jours barrés sont déjà réservés. De {min} à {max} jours, à démarrer dans les {advance} jours.',
  prevMonth: 'Mois précédent',
  nextMonth: 'Mois suivant',
  legendTaken: 'Réservé',
  legendChosen: 'Vos dates',
  noDates: 'Choisissez au moins un jour.',
  rangeBlocked:
    'Cette période comprend un jour réservé ou est trop longue. Nous repartons de ce jour.',
  availabilityFailed: 'Impossible de charger les disponibilités. Réessayez.',
  daysCount: '{count} jours',
  uploadImage: 'Envoyer votre image',
  replaceImage: 'Remplacer l’image',
  uploading: 'Envoi en cours…',
  creativeHelp: 'PNG, JPEG, WebP ou GIF, jusqu’à 10 Mo. Format de cet emplacement : {shape}.',
  creativeProblems: {
    type: 'Utilisez une image PNG, JPEG, WebP ou GIF.',
    size: 'Cette image dépasse 10 Mo.',
    dimensions: 'Cette image est trop petite. Elle doit faire au moins {width} × {height} pixels.',
    shape:
      'Cette image n’a pas le bon format pour cet emplacement. Utilisez-en une proche de {shape}.',
  },
  uploadFailed: 'L’envoi a échoué. Réessayez.',
  previewTitle: 'Aperçu dans l’emplacement',
  destinationUrl: 'Où doit mener un clic ?',
  destinationHelp: 'Un lien sécurisé commençant par https://',
  httpsOnly: 'Saisissez un lien commençant par https://',
  adName: 'Nom de l’annonce',
  adNameHelp: 'Décrit l’image pour les lecteurs d’écran, par exemple votre marque et votre offre.',
  summaryTitle: 'Votre commande',
  summarySlot: 'Emplacement',
  summaryDates: 'Dates',
  summaryDays: 'Jours',
  summaryRate: 'Tarif journalier',
  summaryTotal: 'Total',
  summaryEmpty: 'Choisissez un emplacement et des dates pour voir le prix.',
  holdNote: 'Votre emplacement est réservé 35 minutes pendant le paiement, puis libéré.',
  pay: 'Payer {amount}',
  paying: 'Redirection vers le paiement…',
  bookingConflict:
    'Quelqu’un vient de réserver certains de ces jours. Le calendrier a été actualisé. Choisissez d’autres dates.',
  bookingFailed: 'Impossible de lancer le paiement. Vérifiez les informations et réessayez.',
  finalNote: 'Les paiements sont traités par Stripe. Nous ne voyons jamais vos données de carte.',

  dashboardTitle: 'Mes annonces',
  dashboardIntro: 'Tout ce que vous avez réservé chez nous, au même endroit.',
  newAd: 'Publier une nouvelle annonce',
  noCampaigns: 'Vous n’avez pas encore réservé d’annonce.',
  signInToSee: 'Connectez-vous pour voir vos annonces.',
  loadFailed: 'Impossible de charger vos annonces. Réessayez.',
  payNow: 'Payer maintenant',
  heldUntil: 'Réservé jusqu’à',
  amount: 'Montant',
  statuses: {
    awaiting_payment: 'En attente de paiement',
    scheduled: 'Programmée',
    live: 'En ligne',
    ended: 'Terminée',
    removed: 'Retirée',
    expired: 'Expirée',
  },
  statusHelp: {
    awaiting_payment: 'Votre emplacement est réservé jusqu’au paiement.',
    scheduled: 'Payée. Elle sera en ligne le premier jour.',
    live: 'Affichée sur le site en ce moment.',
    ended: 'La diffusion est terminée.',
    removed: 'Retirée conformément aux Conditions de publicité.',
    expired: 'Jamais payée : l’emplacement a été libéré.',
  },

  successTitle: 'Merci',
  successWaiting: 'Confirmation de votre paiement…',
  successDone: 'Paiement reçu. Votre annonce est réservée.',
  successSlow:
    'Votre paiement est en cours de traitement. Cela peut prendre une minute. Votre annonce apparaîtra dans Mes annonces dès confirmation.',
  successScheduled: 'Votre annonce est programmée et sera en ligne toute seule le premier jour.',
  successLive: 'Votre annonce est en ligne.',
  viewDashboard: 'Aller à Mes annonces',
};

export const ADVERTISE_COPY: Record<Language, AdvertiseCopy> = { en: EN, es: ES, fr: FR };

/** Fill `{name}` placeholders in a copy string. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match: string, name: string): string => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}
