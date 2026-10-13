import type { Language } from '@gwj/shared-types';

export interface TermsOfUseSection {
  heading: string;
  body: string;
}

export interface TermsOfUseCopy {
  title: string;
  kicker: string;
  intro: string;
  sections: readonly TermsOfUseSection[];
  updated: string;
}

export const COPY: Record<Language, TermsOfUseCopy> = {
  en: {
    title: 'Terms of Use',
    kicker: 'The Global World Journal',
    intro:
      'These Terms of Use govern your access to and use of The Global World Journal website and its content. By using the site, you agree to these terms. If you do not agree, please do not use the site.',
    sections: [
      {
        heading: 'Acceptance',
        body: 'We may update these terms from time to time. When we do, we will revise the date below. Continuing to use the site after changes take effect means you accept the revised terms.',
      },
      {
        heading: 'Use of content',
        body: 'You may read, share, and link to our articles for personal and noncommercial use. You may not reproduce, republish, distribute, or create derivative works from our content on a systematic or commercial basis without our prior written permission.',
      },
      {
        heading: 'Intellectual property',
        body: 'All content on this site, including articles, images, graphics, logos, and the design of the site itself, is owned by The Global World Journal or its licensors and is protected by copyright, trademark, and other laws. Nothing in these terms transfers any of those rights to you.',
      },
      {
        heading: 'Disclaimers',
        body: 'The site and its content are provided on an as is and as available basis. While we work to report accurately, we make no warranties that the content is complete, current, or free of error, and we are not liable for decisions you make based on it.',
      },
      {
        heading: 'Limitation of liability',
        body: 'To the fullest extent permitted by law, The Global World Journal and its staff and partners will not be liable for any indirect, incidental, special, or consequential damages arising from your use of, or inability to use, the site or its content.',
      },
      {
        heading: 'Governing law',
        body: 'These terms are governed by the laws applicable at the place of our principal operations, without regard to conflict of law principles. Any dispute arising from these terms or your use of the site will be subject to the exclusive jurisdiction of the competent courts there.',
      },
    ],
    updated: 'Last updated: June 2026',
  },
  es: {
    title: 'Condiciones de uso',
    kicker: 'The Global World Journal',
    intro:
      'Estas Condiciones de uso regulan su acceso y uso del sitio web de The Global World Journal y de sus contenidos. Al utilizar el sitio, usted acepta estas condiciones. Si no está de acuerdo, le rogamos que no utilice el sitio.',
    sections: [
      {
        heading: 'Aceptación',
        body: 'Podemos actualizar estas condiciones en cualquier momento. Cuando lo hagamos, modificaremos la fecha que figura más abajo. Si continúa utilizando el sitio después de que los cambios entren en vigor, se entiende que acepta las condiciones revisadas.',
      },
      {
        heading: 'Uso del contenido',
        body: 'Usted puede leer, compartir y enlazar nuestros artículos para uso personal y no comercial. No puede reproducir, volver a publicar, distribuir ni crear obras derivadas a partir de nuestro contenido de forma sistemática o comercial sin nuestro permiso previo por escrito.',
      },
      {
        heading: 'Propiedad intelectual',
        body: 'Todo el contenido de este sitio, incluidos los artículos, las imágenes, los gráficos, los logotipos y el propio diseño del sitio, es propiedad de The Global World Journal o de sus licenciantes y está protegido por derechos de autor, marcas y otras leyes. Nada de lo dispuesto en estas condiciones le transfiere ninguno de esos derechos.',
      },
      {
        heading: 'Exenciones de responsabilidad',
        body: 'El sitio y su contenido se ofrecen «tal cual» y «según disponibilidad». Aunque nos esforzamos por informar con exactitud, no garantizamos que el contenido sea completo, actual o esté libre de errores, y no somos responsables de las decisiones que usted adopte basándose en él.',
      },
      {
        heading: 'Limitación de responsabilidad',
        body: 'En la máxima medida permitida por la ley, The Global World Journal, su personal y sus socios no serán responsables de ningún daño indirecto, incidental, especial o consecuente derivado de su uso del sitio o de su contenido, o de la imposibilidad de usarlos.',
      },
      {
        heading: 'Legislación aplicable',
        body: 'Estas condiciones se rigen por las leyes aplicables en el lugar de nuestras operaciones principales, sin tener en cuenta sus normas sobre conflicto de leyes. Cualquier controversia derivada de estas condiciones o de su uso del sitio quedará sometida a la jurisdicción exclusiva de los tribunales competentes de ese lugar.',
      },
    ],
    updated: 'Última actualización: junio de 2026',
  },
  fr: {
    title: 'Conditions d’utilisation',
    kicker: 'The Global World Journal',
    intro:
      'Les présentes Conditions d’utilisation régissent votre accès au site web de The Global World Journal et à son contenu, ainsi que votre utilisation de ceux-ci. En utilisant le site, vous acceptez ces conditions. Si vous ne les acceptez pas, veuillez ne pas utiliser le site.',
    sections: [
      {
        heading: 'Acceptation',
        body: 'Nous pouvons modifier ces conditions de temps à autre. Dans ce cas, nous mettrons à jour la date indiquée ci-dessous. Si vous continuez à utiliser le site après l’entrée en vigueur des modifications, vous êtes réputé accepter les conditions révisées.',
      },
      {
        heading: 'Utilisation du contenu',
        body: 'Vous pouvez lire, partager et créer des liens vers nos articles pour un usage personnel et non commercial. Vous ne pouvez pas reproduire, republier, distribuer ni créer des œuvres dérivées à partir de notre contenu de manière systématique ou commerciale sans notre autorisation écrite préalable.',
      },
      {
        heading: 'Propriété intellectuelle',
        body: 'L’ensemble du contenu de ce site, y compris les articles, les images, les graphiques, les logos et la conception du site lui-même, appartient à The Global World Journal ou à ses concédants de licence et est protégé par le droit d’auteur, le droit des marques et d’autres lois. Aucune disposition des présentes conditions ne vous transfère de tels droits.',
      },
      {
        heading: 'Exclusions de garantie',
        body: 'Le site et son contenu sont fournis « en l’état » et « selon les disponibilités ». Bien que nous nous efforcions d’informer avec exactitude, nous ne garantissons pas que le contenu soit complet, à jour ou exempt d’erreurs, et nous ne sommes pas responsables des décisions que vous prenez sur la base de celui-ci.',
      },
      {
        heading: 'Limitation de responsabilité',
        body: 'Dans toute la mesure permise par la loi, The Global World Journal, son personnel et ses partenaires ne seront pas responsables des dommages indirects, accessoires, spéciaux ou consécutifs découlant de votre utilisation du site ou de son contenu, ou de l’impossibilité de les utiliser.',
      },
      {
        heading: 'Droit applicable',
        body: 'Les présentes conditions sont régies par les lois applicables au lieu de nos principales activités, sans égard aux principes de conflit de lois. Tout litige découlant de ces conditions ou de votre utilisation du site relèvera de la compétence exclusive des tribunaux compétents de ce lieu.',
      },
    ],
    updated: 'Dernière mise à jour : juin 2026',
  },
};
