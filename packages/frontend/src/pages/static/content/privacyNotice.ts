import { email, h2, p, type Localized, type StaticPageContent } from './model';
import { ENGLISH_PREVAILS } from './legal';

const ADDRESS = 'privacy@globalworldjournal.com';

export const PRIVACY_NOTICE: Localized<StaticPageContent> = {
  en: {
    title: 'Privacy Notice',
    blocks: [
      p(
        'This notice explains what information The Global World Journal collects when you use our website, how we use it, and the choices you have. We aim to collect only what we need and to be clear about why.',
      ),
      h2('Information we collect'),
      p(
        'We collect information you give us directly, such as the email address you provide when you contact us or sign up for a newsletter. We also automatically collect limited technical information when you visit, including your device type, browser, approximate location derived from your IP address, and the pages you view.',
      ),
      h2('Cookies and analytics'),
      p(
        'We use cookies and similar technologies to keep the site working, remember your preferences, and understand how the site is used. We use privacy-conscious analytics to measure traffic and improve our coverage. You can control cookies through your browser settings, and our Cookie Notice explains the categories in more detail.',
      ),
      h2('Third parties'),
      p(
        'We work with a small number of service providers, such as hosting, analytics, and email delivery vendors, who process information on our behalf and only under our instructions. We do not sell your personal information. We may disclose information where required by law or to protect the rights and safety of our readers and our organization.',
      ),
      h2('Your rights'),
      p(
        'Depending on where you live, you may have the right to access the personal information we hold about you, to correct it, or to ask us to delete it. To make a request, or to ask a question about this notice, contact us at ',
        email(ADDRESS),
        '. We will respond within the time required by applicable law.',
      ),
    ],
  },
  es: {
    title: 'Aviso de privacidad',
    blocks: [
      p(
        'Este aviso explica qué información recopila The Global World Journal cuando utilizas nuestro sitio web, cómo la usamos y qué opciones tienes. Procuramos recopilar solo lo que necesitamos y explicar con claridad por qué.',
      ),
      h2('Información que recopilamos'),
      p(
        'Recopilamos la información que nos facilitas directamente, como la dirección de correo electrónico que indicas cuando te pones en contacto con nosotros o te suscribes a un boletín. También recopilamos automáticamente información técnica limitada cuando nos visitas, como el tipo de dispositivo, el navegador, la ubicación aproximada derivada de tu dirección IP y las páginas que consultas.',
      ),
      h2('Cookies y analítica'),
      p(
        'Utilizamos cookies y tecnologías similares para mantener el sitio en funcionamiento, recordar tus preferencias y entender cómo se usa. Empleamos herramientas de analítica respetuosas con la privacidad para medir el tráfico y mejorar nuestra cobertura. Puedes controlar las cookies desde la configuración de tu navegador, y nuestro Aviso de cookies explica las categorías con más detalle.',
      ),
      h2('Terceros'),
      p(
        'Trabajamos con un número reducido de proveedores de servicios, como los de alojamiento, analítica y envío de correo electrónico, que tratan la información en nuestro nombre y únicamente siguiendo nuestras instrucciones. No vendemos tu información personal. Podemos divulgar información cuando la ley lo exija o para proteger los derechos y la seguridad de nuestros lectores y de nuestra organización.',
      ),
      h2('Tus derechos'),
      p(
        'Según dónde vivas, es posible que tengas derecho a acceder a la información personal que conservamos sobre ti, a rectificarla o a solicitarnos que la eliminemos. Para presentar una solicitud o hacer una pregunta sobre este aviso, escríbenos a ',
        email(ADDRESS),
        '. Responderemos en el plazo que exija la legislación aplicable.',
      ),
      p(ENGLISH_PREVAILS.es),
    ],
  },
  fr: {
    title: 'Politique de confidentialité',
    blocks: [
      p(
        'La présente politique explique quelles informations The Global World Journal collecte lorsque vous utilisez notre site web, comment nous les utilisons et quels choix s’offrent à vous. Nous nous efforçons de ne collecter que ce dont nous avons besoin et d’expliquer clairement pourquoi.',
      ),
      h2('Informations que nous collectons'),
      p(
        'Nous collectons les informations que vous nous fournissez directement, comme l’adresse e-mail que vous indiquez lorsque vous nous contactez ou vous inscrivez à une newsletter. Nous collectons également automatiquement des informations techniques limitées lors de vos visites, notamment le type d’appareil, le navigateur, la localisation approximative déduite de votre adresse IP et les pages que vous consultez.',
      ),
      h2('Cookies et mesure d’audience'),
      p(
        'Nous utilisons des cookies et des technologies similaires pour assurer le fonctionnement du site, mémoriser vos préférences et comprendre comment le site est utilisé. Nous recourons à des outils de mesure d’audience respectueux de la vie privée pour mesurer la fréquentation et améliorer notre couverture. Vous pouvez contrôler les cookies dans les paramètres de votre navigateur, et notre Politique relative aux cookies en détaille les différentes catégories.',
      ),
      h2('Tiers'),
      p(
        'Nous travaillons avec un nombre restreint de prestataires de services, tels que des fournisseurs d’hébergement, de mesure d’audience et d’envoi d’e-mails, qui traitent des informations pour notre compte et uniquement selon nos instructions. Nous ne vendons pas vos informations personnelles. Nous pouvons divulguer des informations lorsque la loi l’exige ou pour protéger les droits et la sécurité de nos lecteurs et de notre organisation.',
      ),
      h2('Vos droits'),
      p(
        'Selon votre lieu de résidence, vous pouvez avoir le droit d’accéder aux informations personnelles que nous détenons à votre sujet, de les rectifier ou de nous demander de les supprimer. Pour formuler une demande ou poser une question sur la présente politique, contactez-nous à l’adresse ',
        email(ADDRESS),
        '. Nous vous répondrons dans les délais prévus par la loi applicable.',
      ),
      p(ENGLISH_PREVAILS.fr),
    ],
  },
};
