import { email, h2, p, type Localized, type StaticPageContent } from './model';

const ADDRESS = 'corrections@globalworldjournal.com';

export const CORRECTIONS: Localized<StaticPageContent> = {
  en: {
    title: 'Corrections',
    blocks: [
      p(
        'Accuracy is the foundation of our work. We report carefully, but no newsroom is immune to error, and when we get something wrong we want to put it right quickly and openly.',
      ),
      h2('Our policy'),
      p(
        'When we learn that an article contains a factual mistake, we correct it as soon as we have confirmed the facts. We append a clear correction notice to the affected article describing what was changed and when, so the record is transparent rather than quietly rewritten. For minor matters such as spelling or formatting we may update the article without a formal notice, but anything that affects the substance or meaning of a story is always disclosed.',
      ),
      h2('Reporting an error'),
      p(
        'If you believe one of our articles contains an error, please tell us. Email ',
        email(ADDRESS),
        ' with the headline or link, the specific point you think is wrong, and any source or detail that supports your account. We review every report and respond to those that identify a genuine issue.',
      ),
    ],
  },
  es: {
    title: 'Correcciones',
    blocks: [
      p(
        'La exactitud es la base de nuestro trabajo. Informamos con cuidado, pero ninguna redacción es inmune al error y, cuando nos equivocamos, queremos rectificar con rapidez y transparencia.',
      ),
      h2('Nuestra política'),
      p(
        'Cuando sabemos que un artículo contiene un error factual, lo corregimos en cuanto hemos confirmado los hechos. Añadimos al artículo afectado una nota de corrección clara que describe qué se cambió y cuándo, de modo que el registro sea transparente en lugar de reescribirse discretamente. En cuestiones menores, como la ortografía o el formato, podemos actualizar el artículo sin una nota formal, pero cualquier cambio que afecte al fondo o al sentido de una noticia se indica siempre.',
      ),
      h2('Cómo informar de un error'),
      p(
        'Si crees que uno de nuestros artículos contiene un error, dínoslo. Escribe a ',
        email(ADDRESS),
        ' indicando el titular o el enlace, el punto concreto que consideras erróneo y cualquier fuente o dato que respalde tu versión. Revisamos todos los avisos y respondemos a los que señalan un problema real.',
      ),
    ],
  },
  fr: {
    title: 'Corrections',
    blocks: [
      p(
        'L’exactitude est le fondement de notre travail. Nous informons avec rigueur, mais aucune rédaction n’est à l’abri d’une erreur et, lorsque nous nous trompons, nous tenons à rectifier rapidement et en toute transparence.',
      ),
      h2('Notre politique'),
      p(
        'Lorsque nous apprenons qu’un article contient une erreur factuelle, nous le corrigeons dès que nous avons vérifié les faits. Nous ajoutons à l’article concerné une mention de correction claire précisant ce qui a été modifié et quand, afin que les changements restent visibles au lieu d’être réécrits discrètement. Pour des points mineurs, comme l’orthographe ou la mise en forme, nous pouvons mettre à jour l’article sans mention formelle, mais toute modification touchant au fond ou au sens d’un article est toujours signalée.',
      ),
      h2('Signaler une erreur'),
      p(
        'Si vous pensez que l’un de nos articles contient une erreur, dites-le-nous. Écrivez à ',
        email(ADDRESS),
        ' en indiquant le titre ou le lien, le point précis qui vous semble erroné et toute source ou tout élément qui étaye votre propos. Nous examinons chaque signalement et répondons à ceux qui relèvent un problème réel.',
      ),
    ],
  },
};
