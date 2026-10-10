import { email, h2, p, type Localized, type StaticPageContent } from './model';

const ADDRESS = 'accessibility@globalworldjournal.com';

export const ACCESSIBILITY: Localized<StaticPageContent> = {
  en: {
    title: 'Accessibility',
    blocks: [
      p(
        'The Global World Journal is committed to making our journalism available to everyone, including readers who use assistive technologies. We want the experience of reading our coverage to be straightforward regardless of how you access the web.',
      ),
      h2('Our standard'),
      p(
        'We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. That means we work toward sufficient color contrast, clear and consistent navigation, descriptive text for images, support for keyboard use, and content that works well with screen readers.',
      ),
      h2('Ongoing work'),
      p(
        'Accessibility is not a one time project. As we add features and publish new kinds of content, we test against our standard and fix issues we find. We treat accessibility as part of the quality of our work, not an afterthought.',
      ),
      h2('Reporting an issue'),
      p(
        'If you encounter a barrier on our site, please let us know so we can address it. Email ',
        email(ADDRESS),
        ' with the page, the problem you experienced, and the device or assistive technology you were using. Your reports help us make the site better for everyone.',
      ),
    ],
  },
  es: {
    title: 'Accesibilidad',
    blocks: [
      p(
        'The Global World Journal se compromete a que su periodismo sea accesible para todos, incluidos los lectores que utilizan tecnologías de apoyo. Queremos que leer nuestra cobertura sea sencillo, sin importar cómo accedas a la web.',
      ),
      h2('Nuestro estándar'),
      p(
        'Aspiramos a cumplir las Pautas de Accesibilidad para el Contenido Web (WCAG) 2.1 en el nivel AA. Esto significa que trabajamos para ofrecer un contraste de color suficiente, una navegación clara y coherente, textos descriptivos para las imágenes, compatibilidad con el uso del teclado y contenidos que funcionen bien con los lectores de pantalla.',
      ),
      h2('Un trabajo continuo'),
      p(
        'La accesibilidad no es un proyecto puntual. A medida que añadimos funciones y publicamos nuevos tipos de contenido, los evaluamos con respecto a nuestro estándar y corregimos los problemas que encontramos. Consideramos la accesibilidad parte de la calidad de nuestro trabajo, no algo secundario.',
      ),
      h2('Cómo informar de un problema'),
      p(
        'Si encuentras alguna barrera en nuestro sitio, avísanos para que podamos solucionarla. Escribe a ',
        email(ADDRESS),
        ' indicando la página, el problema que tuviste y el dispositivo o la tecnología de apoyo que utilizabas. Tus avisos nos ayudan a mejorar el sitio para todos.',
      ),
    ],
  },
  fr: {
    title: 'Accessibilité',
    blocks: [
      p(
        'The Global World Journal s’engage à rendre son journalisme accessible à tous, y compris aux lecteurs qui utilisent des technologies d’assistance. Nous voulons que la lecture de nos articles soit simple, quelle que soit votre façon d’accéder au Web.',
      ),
      h2('Notre référentiel'),
      p(
        'Nous visons la conformité au niveau AA des Règles pour l’accessibilité des contenus Web (WCAG) 2.1. Concrètement, nous nous efforçons d’assurer des contrastes de couleurs suffisants, une navigation claire et cohérente, des textes descriptifs pour les images, la prise en charge de la navigation au clavier et des contenus compatibles avec les lecteurs d’écran.',
      ),
      h2('Un travail continu'),
      p(
        'L’accessibilité n’est pas un projet ponctuel. À mesure que nous ajoutons des fonctionnalités et publions de nouveaux types de contenus, nous les testons au regard de notre référentiel et corrigeons les problèmes que nous relevons. Pour nous, l’accessibilité fait partie intégrante de la qualité de notre travail\u00a0; ce n’est pas une considération secondaire.',
      ),
      h2('Signaler un problème'),
      p(
        'Si vous rencontrez un obstacle sur notre site, faites-le-nous savoir afin que nous puissions y remédier. Écrivez à ',
        email(ADDRESS),
        ' en précisant la page concernée, le problème rencontré et l’appareil ou la technologie d’assistance que vous utilisiez. Vos signalements nous aident à améliorer le site pour tous.',
      ),
    ],
  },
};
