import { h2, p, strong, ul, type Localized, type StaticPageContent } from './model';

/* Show titles are proper names and stay in English in every edition. */
export const PODCASTS: Localized<StaticPageContent> = {
  en: {
    title: 'Podcasts',
    blocks: [
      p(
        'We are building a slate of audio shows that carry the reporting and analysis of the Journal into your day, hosted by the journalists who know the stories best. Here is what is coming.',
      ),
      h2('Shows on the way'),
      ul(
        [
          strong('The Daily World'),
          ' — a short morning podcast on the one story that matters most today.',
        ],
        [
          strong('The Markets Show'),
          ' — a closing look at the numbers and the forces behind them.',
        ],
        [
          strong('Off the Page'),
          ' — a culture show on the books, film, and ideas our Arts desk is following.',
        ],
      ),
      h2('Coming soon'),
      p(
        'Our podcasts are in production and will be available on the major listening apps and as feeds you can follow here. Subscribe to the Journal to be the first to hear when the first episodes are released.',
      ),
    ],
  },
  es: {
    title: 'Pódcasts',
    blocks: [
      p(
        'Estamos preparando una serie de programas de audio que llevarán la información y el análisis del Journal a tu día a día, presentados por los periodistas que mejor conocen cada historia. Esto es lo que viene.',
      ),
      h2('Próximos programas'),
      ul(
        [
          strong('The Daily World'),
          ' — un breve pódcast matinal sobre la noticia más importante del día.',
        ],
        [
          strong('The Markets Show'),
          ' — un repaso, al cierre, a las cifras y a las fuerzas que hay detrás de ellas.',
        ],
        [
          strong('Off the Page'),
          ' — un programa cultural sobre los libros, el cine y las ideas que sigue nuestra sección de Cultura.',
        ],
      ),
      h2('Muy pronto'),
      p(
        'Nuestros pódcasts están en producción y estarán disponibles en las principales aplicaciones de audio y como fuentes que podrás seguir aquí. Suscríbete al Journal para ser de los primeros en enterarte cuando se publiquen los primeros episodios.',
      ),
    ],
  },
  fr: {
    title: 'Podcasts',
    blocks: [
      p(
        'Nous préparons une série d’émissions audio qui feront entrer les reportages et les analyses du Journal dans votre quotidien, animées par les journalistes qui connaissent le mieux leurs sujets. Voici ce qui se prépare.',
      ),
      h2('Émissions à venir'),
      ul(
        [
          strong('The Daily World'),
          ' — un court podcast matinal consacré à l’information la plus importante du jour.',
        ],
        [
          strong('The Markets Show'),
          ' — un regard, en fin de séance, sur les chiffres et les forces qui les sous-tendent.',
        ],
        [
          strong('Off the Page'),
          ' — une émission culturelle consacrée aux livres, au cinéma et aux idées que suit notre rubrique Arts.',
        ],
      ),
      h2('Bientôt disponible'),
      p(
        'Nos podcasts sont en cours de production et seront disponibles sur les principales applications d’écoute, ainsi que sous forme de flux que vous pourrez suivre ici. Abonnez-vous au Journal pour être parmi les premiers informés de la sortie des premiers épisodes.',
      ),
    ],
  },
};
