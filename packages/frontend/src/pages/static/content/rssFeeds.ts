import type { Language } from '@gwj/shared-types';
import { localizePath } from '../../../lib/locale';
import { h2, p, resource, ul, type Inline, type Localized, type StaticPageContent } from './model';

/** Each edition has its own feed, served by the edge worker (`/feed.xml`, `/es/feed.xml`, …). */
function editionFeed(lang: Language): Inline {
  const path = localizePath(lang, '/feed.xml');
  return resource(path, path);
}

export const RSS_FEEDS: Localized<StaticPageContent> = {
  en: {
    title: 'RSS Feeds',
    blocks: [
      p(
        'RSS is an open standard that lets you follow the Journal in the reader of your choice. Instead of checking the site, you subscribe to a feed and new articles appear automatically as we publish them, with no account required.',
      ),
      h2('How to use it'),
      p(
        'Copy the feed address below and paste it into any feed reader. The reader will pull in our latest headlines, summaries, and links back to the full articles on globalworldjournal.com.',
      ),
      h2('Main feed'),
      ul(['All articles: ', editionFeed('en')]),
      h2('Per-section feeds'),
      p(
        'Dedicated feeds for World, Business, Markets, Tech, Politics, Opinion, and Arts are planned, so you will be able to follow only the sections you care about. Until then, the main feed covers everything we publish.',
      ),
    ],
  },
  es: {
    title: 'Fuentes RSS',
    blocks: [
      p(
        'RSS es un estándar abierto que te permite seguir el Journal en el lector que prefieras. En lugar de consultar el sitio, te suscribes a una fuente y los nuevos artículos aparecen automáticamente a medida que los publicamos, sin necesidad de crear una cuenta.',
      ),
      h2('Cómo usarlo'),
      p(
        'Copia la dirección de la fuente que aparece a continuación y pégala en cualquier lector de RSS. El lector recogerá nuestros últimos titulares, resúmenes y enlaces a los artículos completos en globalworldjournal.com.',
      ),
      h2('Fuente principal'),
      ul(['Todos los artículos: ', editionFeed('es')]),
      h2('Fuentes por sección'),
      p(
        'Están previstas fuentes específicas para Mundo, Negocios, Mercados, Tecnología, Política, Opinión y Cultura, para que puedas seguir solo las secciones que te interesan. Mientras tanto, la fuente principal incluye todo lo que publicamos.',
      ),
    ],
  },
  fr: {
    title: 'Flux RSS',
    blocks: [
      p(
        'Le RSS est un standard ouvert qui vous permet de suivre le Journal dans le lecteur de votre choix. Au lieu de consulter le site, vous vous abonnez à un flux et les nouveaux articles apparaissent automatiquement dès leur publication, sans qu’il soit nécessaire de créer un compte.',
      ),
      h2('Mode d’emploi'),
      p(
        'Copiez l’adresse du flux ci-dessous et collez-la dans n’importe quel lecteur de flux. Celui-ci récupérera nos derniers titres, nos résumés et des liens vers les articles complets sur globalworldjournal.com.',
      ),
      h2('Flux principal'),
      ul(['Tous les articles\u00a0: ', editionFeed('fr')]),
      h2('Flux par rubrique'),
      p(
        'Des flux dédiés aux rubriques Monde, Affaires, Marchés, Tech, Politique, Opinion et Arts sont prévus, afin que vous puissiez suivre uniquement celles qui vous intéressent. En attendant, le flux principal couvre tout ce que nous publions.',
      ),
    ],
  },
};
