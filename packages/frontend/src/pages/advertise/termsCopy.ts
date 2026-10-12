import type { Language } from '@gwj/shared-types';

export interface TermsSection {
  heading: string;
  paragraphs: readonly string[];
  /** Bulleted items shown after the paragraphs. */
  items?: readonly string[];
}

export interface TermsCopy {
  title: string;
  kicker: string;
  /** "Effective {date}" — `{date}` is the formatted AD_TERMS_VERSION. */
  effective: string;
  intro: string;
  sections: readonly TermsSection[];
  contactLead: string;
  backToAdvertise: string;
}

const CONTACT = 'advertising@globalworldjournal.com';

const EN: TermsCopy = {
  title: 'Advertising Terms',
  kicker: 'The Global World Journal',
  effective: 'Version {date}',
  intro:
    'These terms govern every advertisement you buy on Global World Journal (the “Site”) through our self-serve system. By creating an account, ticking the acceptance box or paying, you agree to them on behalf of yourself and the business you represent.',
  sections: [
    {
      heading: 'Our right to reject and remove ads',
      paragraphs: [
        'We reserve the right, at our sole discretion and at any time, to reject, remove, pause or replace any advertisement that we consider inappropriate, misleading, unlawful, harmful, low quality or contrary to our editorial standards, with or without notice. We are not required to give a reason.',
        'Acceptance of a booking or a payment is not approval of the ad. We may review an ad before or after it goes live.',
      ],
    },
    {
      heading: 'All payments are final and non-refundable',
      paragraphs: [
        'ALL PAYMENTS ARE FINAL AND NON-REFUNDABLE. This applies in every case, including when we remove, pause, replace or reject your ad, when the ad has not yet run, and when you change your mind or no longer need the slot.',
        'The only exception is a technical failure on our side that prevents your ad from running at all, for example a booking conflict that we caused. In that case we refund the amount you paid for the affected days in full.',
      ],
    },
    {
      heading: 'Slots, dates and payment hold',
      paragraphs: [
        'Each ad slot carries one advertiser per day. When you start a booking, we hold the slot for the dates you chose for about 35 minutes while you pay. If the payment is not completed within that time, the hold is released and the dates become available to others.',
        'A booking is confirmed only when payment succeeds. Your ad then publishes automatically at the start of its first day and ends automatically after its last day. Days are counted in UTC.',
      ],
    },
    {
      heading: 'Your content and what is prohibited',
      paragraphs: [
        'You guarantee that you own or have licensed all rights needed to the ad, including images, text, trademarks and any people shown, and that the page the ad links to is lawful, accurate and safe to visit. You are solely responsible for your ad and for claims made in it.',
        'The following are not allowed, and we may remove them without refund:',
      ],
      items: [
        'illegal products, services or activity;',
        'deceptive, misleading or phishing content, and fake news, cures or offers;',
        'malware, unwanted downloads, or pages that behave differently from what the ad promises;',
        'adult or sexually explicit content;',
        'hate speech, harassment, or content that promotes violence or discrimination;',
        'weapons, explosives and related products;',
        'political disinformation and deceptive election or public-health claims;',
        'content that infringes another person’s copyright, trademark, privacy or other rights.',
      ],
    },
    {
      heading: 'No guarantee of results',
      paragraphs: [
        'We do not guarantee any number of impressions, clicks, sales or any other result. Placement, appearance and traffic can change. Ads are clearly labelled as advertising, and editorial independence is never for sale: buying an ad does not influence our reporting.',
      ],
    },
    {
      heading: 'Prices, taxes and payment processing',
      paragraphs: [
        'Prices are shown in US dollars (USD) and are fixed per slot per day. Any taxes, duties or levies that apply to your purchase are your responsibility. Payments are processed by Stripe. We never see or store your card details.',
      ],
    },
    {
      heading: 'Limitation of liability',
      paragraphs: [
        'To the fullest extent permitted by law, the Site is provided without warranties and we are not liable for any indirect, incidental, special or consequential loss, lost profit or lost business arising from your advertisement, from its removal, or from any interruption of the Site. Our total liability for any claim is limited to the amount you paid for the ad concerned.',
        'You agree to indemnify us against claims brought by third parties because of your ad or its destination.',
      ],
    },
    {
      heading: 'Governing law and contact',
      paragraphs: [
        'These terms are governed by the laws of the jurisdiction where Global World Journal is established, and the courts of that jurisdiction have exclusive authority over any dispute, unless mandatory law says otherwise.',
        `Questions about these terms or your booking: ${CONTACT}.`,
      ],
    },
    {
      heading: 'Changes to these terms',
      paragraphs: [
        'We may update these terms. The version in force is shown at the top of this page, and the version you accept is recorded with your account and each booking. A new version applies to bookings you make after it is published.',
      ],
    },
  ],
  contactLead: 'Contact',
  backToAdvertise: 'Back to Advertise',
};

const ES: TermsCopy = {
  title: 'Condiciones de publicidad',
  kicker: 'The Global World Journal',
  effective: 'Versión {date}',
  intro:
    'Estas condiciones regulan todos los anuncios que compres en Global World Journal (el «Sitio») mediante nuestro sistema de autoservicio. Al crear una cuenta, marcar la casilla de aceptación o pagar, las aceptas en tu nombre y en el de la empresa que representas.',
  sections: [
    {
      heading: 'Nuestro derecho a rechazar y retirar anuncios',
      paragraphs: [
        'Nos reservamos el derecho, a nuestra entera discreción y en cualquier momento, de rechazar, retirar, pausar o sustituir cualquier anuncio que consideremos inapropiado, engañoso, ilícito, dañino, de baja calidad o contrario a nuestros estándares editoriales, con o sin previo aviso. No estamos obligados a dar una razón.',
        'La aceptación de una reserva o de un pago no equivale a la aprobación del anuncio. Podemos revisar un anuncio antes o después de su publicación.',
      ],
    },
    {
      heading: 'Todos los pagos son definitivos y no reembolsables',
      paragraphs: [
        'TODOS LOS PAGOS SON DEFINITIVOS Y NO REEMBOLSABLES. Esto se aplica en todos los casos, incluso cuando retiramos, pausamos, sustituimos o rechazamos tu anuncio, cuando el anuncio aún no se ha publicado y cuando cambias de opinión o ya no necesitas el espacio.',
        'La única excepción es un fallo técnico por nuestra parte que impida por completo que tu anuncio se publique, por ejemplo un conflicto de reservas causado por nosotros. En ese caso reembolsamos íntegramente el importe pagado por los días afectados.',
      ],
    },
    {
      heading: 'Espacios, fechas y reserva durante el pago',
      paragraphs: [
        'Cada espacio publicitario admite un anunciante por día. Cuando inicias una reserva, mantenemos el espacio para las fechas elegidas durante unos 35 minutos mientras pagas. Si el pago no se completa en ese tiempo, la reserva se libera y las fechas quedan disponibles para otros.',
        'Una reserva solo se confirma cuando el pago se realiza con éxito. Entonces tu anuncio se publica automáticamente al comenzar su primer día y termina automáticamente después del último. Los días se cuentan en UTC.',
      ],
    },
    {
      heading: 'Tu contenido y lo que está prohibido',
      paragraphs: [
        'Garantizas que eres titular o tienes licencia de todos los derechos necesarios sobre el anuncio, incluidas imágenes, textos, marcas y las personas que aparezcan, y que la página a la que enlaza es lícita, veraz y segura. Eres el único responsable de tu anuncio y de lo que afirma.',
        'No se permite lo siguiente, y podemos retirarlo sin reembolso:',
      ],
      items: [
        'productos, servicios o actividades ilegales;',
        'contenido engañoso, fraudulento o de phishing, y noticias, curas u ofertas falsas;',
        'malware, descargas no deseadas o páginas que se comportan de forma distinta a lo que promete el anuncio;',
        'contenido para adultos o sexualmente explícito;',
        'discurso de odio, acoso o contenido que promueva la violencia o la discriminación;',
        'armas, explosivos y productos relacionados;',
        'desinformación política y afirmaciones engañosas sobre elecciones o salud pública;',
        'contenido que infrinja derechos de autor, marcas, privacidad u otros derechos de terceros.',
      ],
    },
    {
      heading: 'Sin garantía de resultados',
      paragraphs: [
        'No garantizamos ningún número de impresiones, clics, ventas ni otro resultado. La ubicación, el aspecto y el tráfico pueden cambiar. Los anuncios se identifican claramente como publicidad, y la independencia editorial nunca está en venta: comprar un anuncio no influye en nuestro periodismo.',
      ],
    },
    {
      heading: 'Precios, impuestos y procesamiento de pagos',
      paragraphs: [
        'Los precios se muestran en dólares estadounidenses (USD) y son fijos por espacio y día. Los impuestos, tasas o gravámenes aplicables a tu compra son responsabilidad tuya. Los pagos los procesa Stripe. Nunca vemos ni guardamos los datos de tu tarjeta.',
      ],
    },
    {
      heading: 'Limitación de responsabilidad',
      paragraphs: [
        'En la máxima medida permitida por la ley, el Sitio se ofrece sin garantías y no respondemos de pérdidas indirectas, incidentales, especiales o consecuentes, de lucro cesante ni de pérdida de negocio derivados de tu anuncio, de su retirada o de cualquier interrupción del Sitio. Nuestra responsabilidad total por cualquier reclamación se limita al importe que pagaste por el anuncio en cuestión.',
        'Aceptas mantenernos indemnes frente a reclamaciones de terceros motivadas por tu anuncio o por su destino.',
      ],
    },
    {
      heading: 'Ley aplicable y contacto',
      paragraphs: [
        'Estas condiciones se rigen por las leyes de la jurisdicción en la que está establecido Global World Journal, y los tribunales de esa jurisdicción tienen competencia exclusiva sobre cualquier disputa, salvo que una norma imperativa disponga otra cosa.',
        `Preguntas sobre estas condiciones o sobre tu reserva: ${CONTACT}.`,
      ],
    },
    {
      heading: 'Cambios en estas condiciones',
      paragraphs: [
        'Podemos actualizar estas condiciones. La versión vigente figura al principio de esta página, y la versión que aceptas queda registrada junto a tu cuenta y a cada reserva. Una nueva versión se aplica a las reservas que hagas después de su publicación.',
      ],
    },
  ],
  contactLead: 'Contacto',
  backToAdvertise: 'Volver a Anúnciate',
};

const FR: TermsCopy = {
  title: 'Conditions de publicité',
  kicker: 'The Global World Journal',
  effective: 'Version {date}',
  intro:
    'Les présentes conditions régissent toute annonce achetée sur Global World Journal (le « Site ») via notre système en libre-service. En créant un compte, en cochant la case d’acceptation ou en payant, vous les acceptez en votre nom et au nom de l’entreprise que vous représentez.',
  sections: [
    {
      heading: 'Notre droit de refuser et de retirer des annonces',
      paragraphs: [
        'Nous nous réservons le droit, à notre seule discrétion et à tout moment, de refuser, retirer, suspendre ou remplacer toute annonce que nous jugeons inappropriée, trompeuse, illicite, nuisible, de faible qualité ou contraire à nos standards éditoriaux, avec ou sans préavis. Nous ne sommes pas tenus d’en donner la raison.',
        'L’acceptation d’une réservation ou d’un paiement ne vaut pas approbation de l’annonce. Nous pouvons examiner une annonce avant ou après sa mise en ligne.',
      ],
    },
    {
      heading: 'Tous les paiements sont définitifs et non remboursables',
      paragraphs: [
        'TOUS LES PAIEMENTS SONT DÉFINITIFS ET NON REMBOURSABLES. Cela s’applique dans tous les cas, y compris lorsque nous retirons, suspendons, remplaçons ou refusons votre annonce, lorsque l’annonce n’a pas encore été diffusée, et lorsque vous changez d’avis ou n’avez plus besoin de l’emplacement.',
        'La seule exception est une défaillance technique de notre côté qui empêche totalement la diffusion de votre annonce, par exemple un conflit de réservation que nous avons causé. Dans ce cas, nous remboursons intégralement le montant payé pour les jours concernés.',
      ],
    },
    {
      heading: 'Emplacements, dates et réservation pendant le paiement',
      paragraphs: [
        'Chaque emplacement publicitaire accueille un seul annonceur par jour. Lorsque vous démarrez une réservation, nous bloquons l’emplacement pour les dates choisies pendant environ 35 minutes, le temps de payer. Si le paiement n’est pas finalisé dans ce délai, la réservation est libérée et les dates redeviennent disponibles.',
        'Une réservation n’est confirmée que lorsque le paiement aboutit. Votre annonce est alors publiée automatiquement au début de son premier jour et s’arrête automatiquement après son dernier jour. Les jours sont comptés en UTC.',
      ],
    },
    {
      heading: 'Votre contenu et ce qui est interdit',
      paragraphs: [
        'Vous garantissez détenir ou avoir obtenu sous licence tous les droits nécessaires sur l’annonce, y compris les images, textes, marques et personnes représentées, et que la page vers laquelle elle renvoie est licite, exacte et sûre. Vous êtes seul responsable de votre annonce et de ses affirmations.',
        'Les contenus suivants sont interdits et nous pouvons les retirer sans remboursement :',
      ],
      items: [
        'produits, services ou activités illégaux ;',
        'contenus trompeurs, frauduleux ou d’hameçonnage, fausses informations, faux remèdes ou fausses offres ;',
        'logiciels malveillants, téléchargements non sollicités ou pages qui ne correspondent pas à ce que promet l’annonce ;',
        'contenus pour adultes ou sexuellement explicites ;',
        'discours de haine, harcèlement ou contenus qui encouragent la violence ou la discrimination ;',
        'armes, explosifs et produits associés ;',
        'désinformation politique et affirmations trompeuses sur les élections ou la santé publique ;',
        'contenus portant atteinte au droit d’auteur, aux marques, à la vie privée ou à d’autres droits de tiers.',
      ],
    },
    {
      heading: 'Aucune garantie de résultats',
      paragraphs: [
        'Nous ne garantissons aucun nombre d’impressions, de clics, de ventes ni aucun autre résultat. L’emplacement, l’apparence et la fréquentation peuvent évoluer. Les annonces sont clairement signalées comme de la publicité, et l’indépendance éditoriale n’est jamais à vendre : acheter une annonce n’influence pas nos reportages.',
      ],
    },
    {
      heading: 'Prix, taxes et traitement des paiements',
      paragraphs: [
        'Les prix sont indiqués en dollars américains (USD) et sont fixes par emplacement et par jour. Les taxes, droits ou prélèvements applicables à votre achat sont à votre charge. Les paiements sont traités par Stripe. Nous ne voyons ni ne conservons jamais vos données de carte.',
      ],
    },
    {
      heading: 'Limitation de responsabilité',
      paragraphs: [
        'Dans toute la mesure permise par la loi, le Site est fourni sans garantie et nous ne sommes pas responsables des pertes indirectes, accessoires, spéciales ou consécutives, du manque à gagner ou de la perte d’activité découlant de votre annonce, de son retrait ou de toute interruption du Site. Notre responsabilité totale pour toute réclamation est limitée au montant que vous avez payé pour l’annonce concernée.',
        'Vous vous engagez à nous garantir contre les réclamations de tiers liées à votre annonce ou à sa destination.',
      ],
    },
    {
      heading: 'Droit applicable et contact',
      paragraphs: [
        'Les présentes conditions sont régies par le droit de la juridiction dans laquelle Global World Journal est établi, dont les tribunaux sont seuls compétents pour tout litige, sauf disposition légale impérative contraire.',
        `Questions sur ces conditions ou sur votre réservation : ${CONTACT}.`,
      ],
    },
    {
      heading: 'Modification des conditions',
      paragraphs: [
        'Nous pouvons mettre à jour ces conditions. La version en vigueur figure en haut de cette page, et la version que vous acceptez est enregistrée avec votre compte et chaque réservation. Une nouvelle version s’applique aux réservations effectuées après sa publication.',
      ],
    },
  ],
  contactLead: 'Contact',
  backToAdvertise: 'Retour à Annoncer',
};

export const TERMS_COPY: Record<Language, TermsCopy> = { en: EN, es: ES, fr: FR };
export const TERMS_CONTACT_EMAIL = CONTACT;
