import type { Language } from '@gwj/shared-types';

export interface CookieNoticeCopy {
  title: string;
  kicker: string;
  intro: string;
  usedHeading: string;
  essential: string;
  analytics: string;
  controlHeading: string;
  control: string;
  privacyPointer: string;
  updated: string;
}

export const COPY: Record<Language, CookieNoticeCopy> = {
  en: {
    title: 'Cookie Notice',
    kicker: 'The Global World Journal',
    intro:
      'Cookies are small text files that a website stores on your device. The Global World Journal uses cookies and similar technologies to run the site, remember your choices, and understand how readers use our coverage. This notice describes the cookies we use and how to control them.',
    usedHeading: 'Cookies we use',
    essential:
      'Essential cookies, which are required for the site to function, such as remembering your session and your privacy preferences. These cannot be switched off.',
    analytics:
      'Analytics cookies, which help us measure traffic and see which stories and sections readers value, so we can improve what we publish. These are optional.',
    controlHeading: 'Controlling cookies',
    control:
      'You can accept or decline optional cookies and change your choice at any time. Most browsers also let you block or delete cookies through their settings, and you can usually choose to be warned before a cookie is stored. Blocking essential cookies may stop parts of the site from working as intended.',
    privacyPointer: 'For more on how we handle personal information, see our Privacy Notice.',
    updated: 'Last updated: June 2026',
  },
  es: {
    title: 'Aviso de cookies',
    kicker: 'The Global World Journal',
    intro:
      'Las cookies son pequeños archivos de texto que un sitio web almacena en su dispositivo. The Global World Journal utiliza cookies y tecnologías similares para hacer funcionar el sitio, recordar sus elecciones y comprender cómo usan los lectores nuestra cobertura. Este aviso describe las cookies que utilizamos y cómo controlarlas.',
    usedHeading: 'Cookies que utilizamos',
    essential:
      'Cookies esenciales, necesarias para que el sitio funcione, como las que recuerdan su sesión y sus preferencias de privacidad. No se pueden desactivar.',
    analytics:
      'Cookies de analítica, que nos ayudan a medir el tráfico y a ver qué noticias y secciones valoran los lectores, para poder mejorar lo que publicamos. Son opcionales.',
    controlHeading: 'Control de las cookies',
    control:
      'Usted puede aceptar o rechazar las cookies opcionales y cambiar su elección en cualquier momento. La mayoría de los navegadores también permiten bloquear o eliminar cookies desde su configuración, y normalmente se puede elegir recibir una advertencia antes de que se almacene una cookie. Bloquear las cookies esenciales puede impedir que algunas partes del sitio funcionen como está previsto.',
    privacyPointer:
      'Para más información sobre cómo tratamos los datos personales, consulte nuestro Aviso de privacidad.',
    updated: 'Última actualización: junio de 2026',
  },
  fr: {
    title: 'Avis sur les cookies',
    kicker: 'The Global World Journal',
    intro:
      'Les cookies sont de petits fichiers texte qu’un site web enregistre sur votre appareil. The Global World Journal utilise des cookies et des technologies similaires pour faire fonctionner le site, mémoriser vos choix et comprendre comment les lecteurs utilisent notre couverture. Cet avis décrit les cookies que nous utilisons et la manière de les gérer.',
    usedHeading: 'Cookies que nous utilisons',
    essential:
      'Les cookies essentiels, nécessaires au fonctionnement du site, par exemple pour mémoriser votre session et vos préférences de confidentialité. Ils ne peuvent pas être désactivés.',
    analytics:
      'Les cookies de mesure d’audience, qui nous aident à évaluer la fréquentation et à voir quels articles et rubriques les lecteurs apprécient, afin d’améliorer ce que nous publions. Ils sont facultatifs.',
    controlHeading: 'Gestion des cookies',
    control:
      'Vous pouvez accepter ou refuser les cookies facultatifs et modifier votre choix à tout moment. La plupart des navigateurs permettent aussi de bloquer ou de supprimer les cookies dans leurs paramètres, et vous pouvez généralement choisir d’être averti avant l’enregistrement d’un cookie. Le blocage des cookies essentiels peut empêcher certaines parties du site de fonctionner comme prévu.',
    privacyPointer:
      'Pour en savoir plus sur la manière dont nous traitons les informations personnelles, consultez notre Avis de confidentialité.',
    updated: 'Dernière mise à jour : juin 2026',
  },
};
