import type { Language } from '@gwj/shared-types';

export const ACCESSIBILITY_EMAIL = 'accessibility@globalworldjournal.com';

export interface AccessibilityCopy {
  title: string;
  intro: string;
  standard: { heading: string; body: string };
  ongoing: { heading: string; body: string };
  report: { heading: string; before: string; after: string };
}

export const ACCESSIBILITY_COPY: Record<Language, AccessibilityCopy> = {
  en: {
    title: 'Accessibility',
    intro:
      'The Global World Journal is committed to making our journalism available to everyone, including readers who use assistive technologies. We want the experience of reading our coverage to be straightforward regardless of how you access the web.',
    standard: {
      heading: 'Our standard',
      body: 'We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. That means we work toward sufficient color contrast, clear and consistent navigation, descriptive text for images, support for keyboard use, and content that works well with screen readers.',
    },
    ongoing: {
      heading: 'Ongoing work',
      body: 'Accessibility is not a one time project. As we add features and publish new kinds of content, we test against our standard and fix issues we find. We treat accessibility as part of the quality of our work, not an afterthought.',
    },
    report: {
      heading: 'Reporting an issue',
      before:
        'If you encounter a barrier on our site, please let us know so we can address it. Email',
      after:
        'with the page, the problem you experienced, and the device or assistive technology you were using. Your reports help us make the site better for everyone.',
    },
  },
  es: {
    title: 'Accesibilidad',
    intro:
      'The Global World Journal se compromete a que su periodismo esté al alcance de todos, incluidos los lectores que usan tecnologías de asistencia. Queremos que leer nuestra cobertura sea sencillo, sin importar cómo accedas a la web.',
    standard: {
      heading: 'Nuestro estándar',
      body: 'Nuestro objetivo es cumplir las Pautas de Accesibilidad para el Contenido Web (WCAG) 2.1 en el nivel AA. Esto significa que trabajamos para lograr un contraste de color suficiente, una navegación clara y coherente, textos descriptivos para las imágenes, compatibilidad con el uso del teclado y contenido que funcione bien con los lectores de pantalla.',
    },
    ongoing: {
      heading: 'Trabajo continuo',
      body: 'La accesibilidad no es un proyecto puntual. A medida que añadimos funciones y publicamos nuevos tipos de contenido, lo evaluamos según nuestro estándar y corregimos los problemas que detectamos. Consideramos la accesibilidad parte de la calidad de nuestro trabajo, no un detalle secundario.',
    },
    report: {
      heading: 'Cómo informar de un problema',
      before:
        'Si encuentras una barrera en nuestro sitio, avísanos para que podamos resolverla. Escribe a',
      after:
        'indicando la página, el problema que experimentaste y el dispositivo o la tecnología de asistencia que usabas. Tus avisos nos ayudan a mejorar el sitio para todos.',
    },
  },
  fr: {
    title: 'Accessibilité',
    intro:
      'The Global World Journal s’engage à rendre son journalisme accessible à tous, y compris aux lecteurs qui utilisent des technologies d’assistance. Nous voulons que la lecture de nos articles soit simple, quelle que soit la façon dont vous accédez au web.',
    standard: {
      heading: 'Notre référentiel',
      body: 'Nous visons la conformité aux Règles pour l’accessibilité des contenus Web (WCAG) 2.1 au niveau AA. Cela signifie que nous travaillons à obtenir un contraste des couleurs suffisant, une navigation claire et cohérente, des textes descriptifs pour les images, une prise en charge du clavier et des contenus compatibles avec les lecteurs d’écran.',
    },
    ongoing: {
      heading: 'Un travail continu',
      body: 'L’accessibilité n’est pas un projet ponctuel. À mesure que nous ajoutons des fonctionnalités et publions de nouveaux types de contenus, nous les testons selon notre référentiel et corrigeons les problèmes détectés. Nous considérons l’accessibilité comme une composante de la qualité de notre travail, et non comme un détail.',
    },
    report: {
      heading: 'Signaler un problème',
      before:
        'Si vous rencontrez un obstacle sur notre site, signalez-le-nous afin que nous puissions le corriger. Écrivez à',
      after:
        'en indiquant la page, le problème rencontré ainsi que l’appareil ou la technologie d’assistance utilisés. Vos signalements nous aident à améliorer le site pour tous.',
    },
  },
};
