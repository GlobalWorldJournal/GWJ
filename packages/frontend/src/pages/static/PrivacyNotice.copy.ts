import type { Language } from '@gwj/shared-types';

export interface PrivacyNoticeCopy {
  title: string;
  kicker: string;
  intro: string;
  collectHeading: string;
  collect: string;
  cookiesHeading: string;
  cookies: string;
  thirdPartiesHeading: string;
  thirdParties: string;
  rightsHeading: string;
  /** Text before the contact email address. */
  rightsBefore: string;
  /** Text after the contact email address. */
  rightsAfter: string;
  updated: string;
}

export const PRIVACY_CONTACT_EMAIL = 'privacy@globalworldjournal.com';

export const COPY: Record<Language, PrivacyNoticeCopy> = {
  en: {
    title: 'Privacy Notice',
    kicker: 'The Global World Journal',
    intro:
      'This notice explains what information The Global World Journal collects when you use our website, how we use it, and the choices you have. We aim to collect only what we need and to be clear about why.',
    collectHeading: 'Information we collect',
    collect:
      'We collect information you give us directly, such as the email address you provide when you contact us or sign up for a newsletter. We also automatically collect limited technical information when you visit, including your device type, browser, approximate location derived from your IP address, and the pages you view.',
    cookiesHeading: 'Cookies and analytics',
    cookies:
      'We use cookies and similar technologies to keep the site working, remember your preferences, and understand how the site is used. We use privacy-conscious analytics to measure traffic and improve our coverage. You can control cookies through your browser settings, and our Cookie Notice explains the categories in more detail.',
    thirdPartiesHeading: 'Third parties',
    thirdParties:
      'We work with a small number of service providers, such as hosting, analytics, and email delivery vendors, who process information on our behalf and only under our instructions. We do not sell your personal information. We may disclose information where required by law or to protect the rights and safety of our readers and our organization.',
    rightsHeading: 'Your rights',
    rightsBefore:
      'Depending on where you live, you may have the right to access the personal information we hold about you, to correct it, or to ask us to delete it. To make a request, or to ask a question about this notice, contact us at',
    rightsAfter: '. We will respond within the time required by applicable law.',
    updated: 'Last updated: June 2026',
  },
  es: {
    title: 'Aviso de privacidad',
    kicker: 'The Global World Journal',
    intro:
      'Este aviso explica qué información recopila The Global World Journal cuando usted utiliza nuestro sitio web, cómo la utilizamos y qué opciones tiene. Nuestro objetivo es recopilar únicamente lo que necesitamos y ser claros sobre el motivo.',
    collectHeading: 'Información que recopilamos',
    collect:
      'Recopilamos la información que usted nos proporciona directamente, como la dirección de correo electrónico que facilita al ponerse en contacto con nosotros o al suscribirse a un boletín. También recopilamos automáticamente información técnica limitada cuando nos visita, incluidos el tipo de dispositivo, el navegador, la ubicación aproximada derivada de su dirección IP y las páginas que consulta.',
    cookiesHeading: 'Cookies y analítica',
    cookies:
      'Utilizamos cookies y tecnologías similares para que el sitio funcione, recordar sus preferencias y comprender cómo se utiliza el sitio. Utilizamos una analítica respetuosa con la privacidad para medir el tráfico y mejorar nuestra cobertura. Usted puede controlar las cookies mediante la configuración de su navegador, y nuestro Aviso de cookies explica las categorías con más detalle.',
    thirdPartiesHeading: 'Terceros',
    thirdParties:
      'Trabajamos con un número reducido de proveedores de servicios, como proveedores de alojamiento, analítica y envío de correo electrónico, que tratan información en nuestro nombre y únicamente siguiendo nuestras instrucciones. No vendemos su información personal. Podemos divulgar información cuando la ley lo exija o para proteger los derechos y la seguridad de nuestros lectores y de nuestra organización.',
    rightsHeading: 'Sus derechos',
    rightsBefore:
      'Según el lugar donde resida, es posible que tenga derecho a acceder a la información personal que conservamos sobre usted, a rectificarla o a solicitar que la eliminemos. Para presentar una solicitud o hacer una pregunta sobre este aviso, escríbanos a',
    rightsAfter: '. Responderemos dentro del plazo exigido por la legislación aplicable.',
    updated: 'Última actualización: junio de 2026',
  },
  fr: {
    title: 'Avis de confidentialité',
    kicker: 'The Global World Journal',
    intro:
      'Le présent avis explique quelles informations The Global World Journal collecte lorsque vous utilisez notre site web, comment nous les utilisons et quels choix s’offrent à vous. Nous nous efforçons de ne collecter que ce dont nous avons besoin et d’en expliquer clairement la raison.',
    collectHeading: 'Informations que nous collectons',
    collect:
      'Nous collectons les informations que vous nous communiquez directement, telles que l’adresse e-mail que vous indiquez lorsque vous nous contactez ou vous inscrivez à une newsletter. Nous collectons également automatiquement des informations techniques limitées lors de votre visite, notamment le type d’appareil, le navigateur, la localisation approximative déduite de votre adresse IP et les pages que vous consultez.',
    cookiesHeading: 'Cookies et mesure d’audience',
    cookies:
      'Nous utilisons des cookies et des technologies similaires pour assurer le fonctionnement du site, mémoriser vos préférences et comprendre comment le site est utilisé. Nous utilisons une mesure d’audience respectueuse de la vie privée pour évaluer la fréquentation et améliorer notre couverture. Vous pouvez gérer les cookies dans les paramètres de votre navigateur, et notre Avis sur les cookies en détaille les catégories.',
    thirdPartiesHeading: 'Tiers',
    thirdParties:
      'Nous travaillons avec un petit nombre de prestataires de services, tels que des fournisseurs d’hébergement, de mesure d’audience et d’envoi d’e-mails, qui traitent des informations pour notre compte et uniquement selon nos instructions. Nous ne vendons pas vos informations personnelles. Nous pouvons divulguer des informations lorsque la loi l’exige ou pour protéger les droits et la sécurité de nos lecteurs et de notre organisation.',
    rightsHeading: 'Vos droits',
    rightsBefore:
      'Selon votre lieu de résidence, vous pouvez avoir le droit d’accéder aux informations personnelles que nous détenons à votre sujet, de les rectifier ou de nous demander de les supprimer. Pour formuler une demande ou poser une question sur cet avis, écrivez-nous à l’adresse',
    rightsAfter: '. Nous répondrons dans le délai prévu par la législation applicable.',
    updated: 'Dernière mise à jour : juin 2026',
  },
};
