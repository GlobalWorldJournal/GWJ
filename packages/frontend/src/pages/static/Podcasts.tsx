import type { Language } from '@gwj/shared-types';
import { useLang } from '../../lib/i18n';

interface Show {
  name: string;
  description: string;
}

interface PodcastsCopy {
  title: string;
  intro: string;
  showsHeading: string;
  shows: readonly Show[];
  soonHeading: string;
  soon: string;
}

const KICKER = 'The Global World Journal';

const COPY: Record<Language, PodcastsCopy> = {
  en: {
    title: 'Podcasts',
    intro:
      'We are building a slate of audio shows that carry the reporting and analysis of the Journal into your day, hosted by the journalists who know the stories best. Here is what is coming.',
    showsHeading: 'Shows on the way',
    shows: [
      {
        name: 'The Daily World',
        description: 'a short morning podcast on the one story that matters most today.',
      },
      {
        name: 'The Markets Show',
        description: 'a closing look at the numbers and the forces behind them.',
      },
      {
        name: 'Off the Page',
        description: 'a culture show on the books, film, and ideas our Arts desk is following.',
      },
    ],
    soonHeading: 'Coming soon',
    soon: 'Our podcasts are in production and will be available on the major listening apps and as feeds you can follow here. Subscribe to the Journal to be the first to hear when the first episodes are released.',
  },
  es: {
    title: 'Pódcast',
    intro:
      'Estamos preparando una serie de programas de audio que llevan el reportaje y el análisis del Journal a su día, presentados por los periodistas que mejor conocen las historias. Esto es lo que viene.',
    showsHeading: 'Programas en camino',
    shows: [
      {
        name: 'The Daily World',
        description: 'un pódcast matinal breve sobre la historia que más importa hoy.',
      },
      {
        name: 'The Markets Show',
        description: 'una mirada de cierre a las cifras y a las fuerzas que las mueven.',
      },
      {
        name: 'Off the Page',
        description:
          'un programa de cultura sobre los libros, el cine y las ideas que sigue nuestra sección de Artes.',
      },
    ],
    soonHeading: 'Próximamente',
    soon: 'Nuestros pódcast están en producción y estarán disponibles en las principales aplicaciones de escucha y como canales que podrá seguir aquí. Suscríbase al Journal para ser el primero en enterarse cuando se publiquen los primeros episodios.',
  },
  fr: {
    title: 'Podcasts',
    intro:
      'Nous préparons une série d’émissions audio qui portent les reportages et les analyses du Journal dans votre journée, animées par les journalistes qui connaissent le mieux les sujets. Voici ce qui arrive.',
    showsHeading: 'Émissions à venir',
    shows: [
      {
        name: 'The Daily World',
        description: 'un court podcast du matin sur l’histoire qui compte le plus aujourd’hui.',
      },
      {
        name: 'The Markets Show',
        description: 'un regard de clôture sur les chiffres et les forces qui les animent.',
      },
      {
        name: 'Off the Page',
        description:
          'une émission culturelle sur les livres, le cinéma et les idées que suit notre rubrique Arts.',
      },
    ],
    soonHeading: 'Bientôt disponible',
    soon: 'Nos podcasts sont en production et seront disponibles sur les principales applications d’écoute et sous forme de flux que vous pourrez suivre ici. Abonnez-vous au Journal pour être le premier informé de la sortie des premiers épisodes.',
  },
};

export function Podcasts() {
  const { lang } = useLang();
  const copy = COPY[lang];
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.title}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">{KICKER}</p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>{copy.intro}</p>

        <h2 className="headline text-2xl text-ink">{copy.showsHeading}</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          {copy.shows.map((show) => (
            <li key={show.name}>
              <strong>{show.name}</strong> — {show.description}
            </li>
          ))}
        </ul>

        <h2 className="headline text-2xl text-ink">{copy.soonHeading}</h2>
        <p>{copy.soon}</p>
      </div>
    </div>
  );
}
