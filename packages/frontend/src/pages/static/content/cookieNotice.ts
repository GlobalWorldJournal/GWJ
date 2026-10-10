import { h2, p, ul, type Localized, type StaticPageContent } from './model';
import { ENGLISH_PREVAILS } from './legal';

export const COOKIE_NOTICE: Localized<StaticPageContent> = {
  en: {
    title: 'Cookie Notice',
    blocks: [
      p(
        'Cookies are small text files that a website stores on your device. The Global World Journal uses cookies and similar technologies to run the site, remember your choices, and understand how readers use our coverage. This notice describes the cookies we use and how to control them.',
      ),
      h2('Cookies we use'),
      ul(
        'Essential cookies, which are required for the site to function, such as remembering your session and your privacy preferences. These cannot be switched off.',
        'Analytics cookies, which help us measure traffic and see which stories and sections readers value, so we can improve what we publish. These are optional.',
      ),
      h2('Controlling cookies'),
      p(
        'You can accept or decline optional cookies and change your choice at any time. Most browsers also let you block or delete cookies through their settings, and you can usually choose to be warned before a cookie is stored. Blocking essential cookies may stop parts of the site from working as intended.',
      ),
      p('For more on how we handle personal information, see our Privacy Notice.'),
    ],
  },
  es: {
    title: 'Aviso de cookies',
    blocks: [
      p(
        'Las cookies son pequeños archivos de texto que un sitio web almacena en tu dispositivo. The Global World Journal utiliza cookies y tecnologías similares para hacer funcionar el sitio, recordar tus elecciones y entender cómo usan los lectores nuestra cobertura. Este aviso describe las cookies que utilizamos y cómo puedes controlarlas.',
      ),
      h2('Cookies que utilizamos'),
      ul(
        'Cookies esenciales, necesarias para que el sitio funcione, por ejemplo para recordar tu sesión y tus preferencias de privacidad. No se pueden desactivar.',
        'Cookies analíticas, que nos ayudan a medir el tráfico y a ver qué noticias y secciones valoran los lectores, para poder mejorar lo que publicamos. Son opcionales.',
      ),
      h2('Control de las cookies'),
      p(
        'Puedes aceptar o rechazar las cookies opcionales y cambiar tu elección en cualquier momento. La mayoría de los navegadores también te permiten bloquear o eliminar cookies desde su configuración y, por lo general, puedes optar por recibir un aviso antes de que se almacene una cookie. Bloquear las cookies esenciales puede impedir que algunas partes del sitio funcionen como deberían.',
      ),
      p(
        'Para saber más sobre cómo tratamos la información personal, consulta nuestro Aviso de privacidad.',
      ),
      p(ENGLISH_PREVAILS.es),
    ],
  },
  fr: {
    title: 'Politique relative aux cookies',
    blocks: [
      p(
        'Les cookies sont de petits fichiers texte qu’un site web enregistre sur votre appareil. The Global World Journal utilise des cookies et des technologies similaires pour faire fonctionner le site, mémoriser vos choix et comprendre comment les lecteurs consultent nos contenus. La présente politique décrit les cookies que nous utilisons et la manière de les contrôler.',
      ),
      h2('Les cookies que nous utilisons'),
      ul(
        'Les cookies essentiels, indispensables au fonctionnement du site, qui permettent par exemple de mémoriser votre session et vos préférences de confidentialité. Ils ne peuvent pas être désactivés.',
        'Les cookies analytiques, qui nous aident à mesurer la fréquentation et à identifier les articles et les rubriques que les lecteurs apprécient, afin d’améliorer ce que nous publions. Ils sont facultatifs.',
      ),
      h2('Contrôler les cookies'),
      p(
        'Vous pouvez accepter ou refuser les cookies facultatifs et modifier votre choix à tout moment. La plupart des navigateurs vous permettent également de bloquer ou de supprimer les cookies dans leurs paramètres, et vous pouvez généralement choisir d’être averti avant qu’un cookie ne soit enregistré. Le blocage des cookies essentiels peut empêcher certaines parties du site de fonctionner correctement.',
      ),
      p(
        'Pour en savoir plus sur la manière dont nous traitons les informations personnelles, consultez notre Politique de confidentialité.',
      ),
      p(ENGLISH_PREVAILS.fr),
    ],
  },
};
