import { h2, p, strong, ul, type Localized, type StaticPageContent } from './model';

export const VIDEO: Localized<StaticPageContent> = {
  en: {
    title: 'Video',
    blocks: [
      p(
        'Some stories are best told on screen. We are developing a video desk to bring you reporting from the field, interviews with the people in the news, and explainers that make complex subjects clear in a few minutes.',
      ),
      h2('What to expect'),
      ul(
        [
          strong('Field reports'),
          ' — our correspondents on the ground where events are unfolding.',
        ],
        [strong('Explainers'), ' — short, visual breakdowns of the issues driving the headlines.'],
        [
          strong('Conversations'),
          ' — interviews with the newsmakers, analysts, and thinkers we cover.',
        ],
      ),
      h2('Coming soon'),
      p(
        'Our video coverage is in production and will live here alongside the rest of the Journal. Subscribe to be notified when the first films and explainers go live.',
      ),
    ],
  },
  es: {
    title: 'Vídeo',
    blocks: [
      p(
        'Algunas historias se cuentan mejor en pantalla. Estamos creando una sección de vídeo para ofrecerte reportajes sobre el terreno, entrevistas con los protagonistas de la actualidad y piezas explicativas que aclaran temas complejos en pocos minutos.',
      ),
      h2('Qué puedes esperar'),
      ul(
        [
          strong('Reportajes sobre el terreno'),
          ' — nuestros corresponsales, allí donde se desarrollan los acontecimientos.',
        ],
        [
          strong('Piezas explicativas'),
          ' — análisis breves y visuales de los temas que protagonizan los titulares.',
        ],
        [
          strong('Conversaciones'),
          ' — entrevistas con los protagonistas, analistas y pensadores sobre los que informamos.',
        ],
      ),
      h2('Muy pronto'),
      p(
        'Nuestra cobertura en vídeo está en producción y estará disponible aquí, junto al resto del Journal. Suscríbete para recibir un aviso cuando se publiquen los primeros reportajes y piezas explicativas.',
      ),
    ],
  },
  fr: {
    title: 'Vidéo',
    blocks: [
      p(
        'Certaines histoires se racontent mieux à l’écran. Nous mettons sur pied un service vidéo pour vous proposer des reportages sur le terrain, des entretiens avec celles et ceux qui font l’actualité, et des formats explicatifs qui éclairent des sujets complexes en quelques minutes.',
      ),
      h2('Au programme'),
      ul(
        [strong('Reportages'), ' — nos correspondants sur le terrain, au cœur des événements.'],
        [
          strong('Décryptages'),
          ' — des explications courtes et visuelles des enjeux qui font l’actualité.',
        ],
        [
          strong('Entretiens'),
          ' — des conversations avec les acteurs de l’actualité, les analystes et les penseurs que nous couvrons.',
        ],
      ),
      h2('Bientôt disponible'),
      p(
        'Notre offre vidéo est en cours de production et trouvera sa place ici, aux côtés du reste du Journal. Abonnez-vous pour être averti de la mise en ligne des premiers films et décryptages.',
      ),
    ],
  },
};
