import type { Language } from '@gwj/shared-types';

export const CORRECTIONS_EMAIL = 'corrections@globalworldjournal.com';

export interface CorrectionsCopy {
  title: string;
  intro: string;
  policy: { heading: string; body: string };
  report: { heading: string; before: string; after: string };
}

export const CORRECTIONS_COPY: Record<Language, CorrectionsCopy> = {
  en: {
    title: 'Corrections',
    intro:
      'Accuracy is the foundation of our work. We report carefully, but no newsroom is immune to error, and when we get something wrong we want to put it right quickly and openly.',
    policy: {
      heading: 'Our policy',
      body: 'When we learn that an article contains a factual mistake, we correct it as soon as we have confirmed the facts. We append a clear correction notice to the affected article describing what was changed and when, so the record is transparent rather than quietly rewritten. For minor matters such as spelling or formatting we may update the article without a formal notice, but anything that affects the substance or meaning of a story is always disclosed.',
    },
    report: {
      heading: 'Reporting an error',
      before: 'If you believe one of our articles contains an error, please tell us. Email',
      after:
        'with the headline or link, the specific point you think is wrong, and any source or detail that supports your account. We review every report and respond to those that identify a genuine issue.',
    },
  },
  es: {
    title: 'Correcciones',
    intro:
      'La exactitud es el cimiento de nuestro trabajo. Informamos con cuidado, pero ninguna redacción está a salvo de los errores, y cuando nos equivocamos queremos corregirlo con rapidez y de forma transparente.',
    policy: {
      heading: 'Nuestra política',
      body: 'Cuando detectamos que un artículo contiene un error factual, lo corregimos en cuanto hemos confirmado los hechos. Añadimos al artículo afectado un aviso de corrección claro que indica qué se modificó y cuándo, de modo que el registro sea transparente y no se reescriba en silencio. En asuntos menores, como la ortografía o el formato, podemos actualizar el artículo sin un aviso formal, pero todo lo que afecte al fondo o al sentido de una noticia se hace público siempre.',
    },
    report: {
      heading: 'Cómo informar de un error',
      before: 'Si crees que uno de nuestros artículos contiene un error, avísanos. Escribe a',
      after:
        'con el titular o el enlace, el punto concreto que consideras erróneo y cualquier fuente o dato que respalde tu versión. Revisamos cada aviso y respondemos a los que señalan un problema real.',
    },
  },
  fr: {
    title: 'Rectificatifs',
    intro:
      'L’exactitude est le fondement de notre travail. Nous enquêtons avec soin, mais aucune rédaction n’est à l’abri de l’erreur, et lorsque nous nous trompons, nous voulons rectifier rapidement et ouvertement.',
    policy: {
      heading: 'Notre politique',
      body: 'Lorsque nous apprenons qu’un article contient une erreur factuelle, nous la corrigeons dès que les faits sont confirmés. Nous ajoutons à l’article concerné un avis de correction clair indiquant ce qui a été modifié et quand, afin que le suivi soit transparent et non réécrit en silence. Pour les points mineurs, comme l’orthographe ou la mise en forme, nous pouvons mettre à jour l’article sans avis formel, mais tout ce qui touche au fond ou au sens d’un article est toujours signalé.',
    },
    report: {
      heading: 'Signaler une erreur',
      before: 'Si vous pensez qu’un de nos articles contient une erreur, dites-le-nous. Écrivez à',
      after:
        'en indiquant le titre ou le lien, le point précis que vous jugez erroné et toute source ou précision étayant votre version. Nous examinons chaque signalement et répondons à ceux qui identifient un véritable problème.',
    },
  },
};
