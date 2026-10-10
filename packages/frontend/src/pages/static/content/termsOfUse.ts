import { h2, p, type Localized, type StaticPageContent } from './model';
import { ENGLISH_PREVAILS } from './legal';

export const TERMS_OF_USE: Localized<StaticPageContent> = {
  en: {
    title: 'Terms of Use',
    blocks: [
      p(
        'These Terms of Use govern your access to and use of The Global World Journal website and its content. By using the site, you agree to these terms. If you do not agree, please do not use the site.',
      ),
      h2('Acceptance'),
      p(
        'We may update these terms from time to time. When we do, we will revise the date below. Continuing to use the site after changes take effect means you accept the revised terms.',
      ),
      h2('Use of content'),
      p(
        'You may read, share, and link to our articles for personal and noncommercial use. You may not reproduce, republish, distribute, or create derivative works from our content on a systematic or commercial basis without our prior written permission.',
      ),
      h2('Intellectual property'),
      p(
        'All content on this site, including articles, images, graphics, logos, and the design of the site itself, is owned by The Global World Journal or its licensors and is protected by copyright, trademark, and other laws. Nothing in these terms transfers any of those rights to you.',
      ),
      h2('Disclaimers'),
      p(
        'The site and its content are provided on an as is and as available basis. While we work to report accurately, we make no warranties that the content is complete, current, or free of error, and we are not liable for decisions you make based on it.',
      ),
      h2('Limitation of liability'),
      p(
        'To the fullest extent permitted by law, The Global World Journal and its staff and partners will not be liable for any indirect, incidental, special, or consequential damages arising from your use of, or inability to use, the site or its content.',
      ),
      h2('Governing law'),
      p(
        'These terms are governed by the laws applicable at the place of our principal operations, without regard to conflict of law principles. Any dispute arising from these terms or your use of the site will be subject to the exclusive jurisdiction of the competent courts there.',
      ),
    ],
  },
  es: {
    title: 'Términos de uso',
    blocks: [
      p(
        'Estos Términos de uso regulan tu acceso al sitio web de The Global World Journal y a su contenido, así como el uso que hagas de ellos. Al utilizar el sitio, aceptas estos términos. Si no estás de acuerdo con ellos, no utilices el sitio.',
      ),
      h2('Aceptación'),
      p(
        'Podemos actualizar estos términos periódicamente. Cuando lo hagamos, modificaremos la fecha que figura más abajo. Si sigues utilizando el sitio después de que los cambios entren en vigor, aceptas los términos revisados.',
      ),
      h2('Uso del contenido'),
      p(
        'Puedes leer y compartir nuestros artículos, y enlazarlos, para uso personal y no comercial. No puedes reproducir, volver a publicar ni distribuir nuestro contenido, ni crear obras derivadas a partir de él, de forma sistemática o con fines comerciales sin nuestro permiso previo por escrito.',
      ),
      h2('Propiedad intelectual'),
      p(
        'Todo el contenido de este sitio, incluidos los artículos, las imágenes, los gráficos, los logotipos y el diseño del propio sitio, es propiedad de The Global World Journal o de sus licenciantes y está protegido por la legislación sobre derechos de autor, marcas y otras normas. Nada de lo dispuesto en estos términos te transfiere ninguno de esos derechos.',
      ),
      h2('Exención de responsabilidad'),
      p(
        'El sitio y su contenido se ofrecen «tal cual» y «según disponibilidad». Aunque nos esforzamos por informar con exactitud, no garantizamos que el contenido sea completo, actual o esté libre de errores, y no somos responsables de las decisiones que tomes basándote en él.',
      ),
      h2('Limitación de responsabilidad'),
      p(
        'En la máxima medida permitida por la ley, ni The Global World Journal ni su personal ni sus socios serán responsables de ningún daño indirecto, incidental, especial o consecuente derivado del uso del sitio o de su contenido, o de la imposibilidad de utilizarlos.',
      ),
      h2('Legislación aplicable'),
      p(
        'Estos términos se rigen por la legislación aplicable en el lugar donde desarrollamos nuestra actividad principal, sin tener en cuenta sus normas sobre conflictos de leyes. Cualquier controversia derivada de estos términos o del uso que hagas del sitio quedará sometida a la jurisdicción exclusiva de los tribunales competentes de dicho lugar.',
      ),
      p(ENGLISH_PREVAILS.es),
    ],
  },
  fr: {
    title: 'Conditions d’utilisation',
    blocks: [
      p(
        'Les présentes Conditions d’utilisation régissent votre accès au site web The Global World Journal et à son contenu, ainsi que l’utilisation que vous en faites. En utilisant le site, vous acceptez ces conditions. Si vous ne les acceptez pas, veuillez ne pas utiliser le site.',
      ),
      h2('Acceptation'),
      p(
        'Nous pouvons mettre à jour ces conditions de temps à autre. Le cas échéant, nous modifierons la date indiquée ci-dessous. Si vous continuez à utiliser le site après l’entrée en vigueur des modifications, vous acceptez les conditions révisées.',
      ),
      h2('Utilisation du contenu'),
      p(
        'Vous pouvez lire et partager nos articles, et créer des liens vers ceux-ci, pour un usage personnel et non commercial. Vous ne pouvez pas reproduire, republier ou distribuer notre contenu, ni en tirer des œuvres dérivées, de manière systématique ou à des fins commerciales sans notre autorisation écrite préalable.',
      ),
      h2('Propriété intellectuelle'),
      p(
        'L’ensemble du contenu de ce site, y compris les articles, les images, les graphiques, les logos et la conception du site lui-même, appartient à The Global World Journal ou à ses concédants de licence et est protégé par le droit d’auteur, le droit des marques et d’autres législations. Aucune disposition des présentes conditions ne vous transfère l’un quelconque de ces droits.',
      ),
      h2('Exclusion de garanties'),
      p(
        'Le site et son contenu sont fournis «\u00a0en l’état\u00a0» et «\u00a0selon disponibilité\u00a0». Bien que nous nous efforcions d’informer avec exactitude, nous ne garantissons pas que le contenu soit complet, à jour ou exempt d’erreurs, et nous ne sommes pas responsables des décisions que vous prenez sur son fondement.',
      ),
      h2('Limitation de responsabilité'),
      p(
        'Dans toute la mesure permise par la loi, The Global World Journal, son personnel et ses partenaires ne sauraient être tenus responsables de tout dommage indirect, accessoire, spécial ou consécutif résultant de votre utilisation du site ou de son contenu, ou de l’impossibilité de les utiliser.',
      ),
      h2('Droit applicable'),
      p(
        'Les présentes conditions sont régies par le droit applicable au lieu de notre principal établissement, sans égard aux règles de conflit de lois. Tout litige découlant des présentes conditions ou de votre utilisation du site relèvera de la compétence exclusive des tribunaux compétents de ce lieu.',
      ),
      p(ENGLISH_PREVAILS.fr),
    ],
  },
};
