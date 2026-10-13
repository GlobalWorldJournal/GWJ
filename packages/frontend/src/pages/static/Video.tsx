import type { Language } from '@gwj/shared-types';
import { useLang } from '../../lib/i18n';

interface VideoItem {
  name: string;
  description: string;
}

interface VideoCopy {
  title: string;
  intro: string;
  expectHeading: string;
  items: readonly VideoItem[];
  soonHeading: string;
  soon: string;
}

const KICKER = 'The Global World Journal';

const COPY: Record<Language, VideoCopy> = {
  en: {
    title: 'Video',
    intro:
      'Some stories are best told on screen. We are developing a video desk to bring you reporting from the field, interviews with the people in the news, and explainers that make complex subjects clear in a few minutes.',
    expectHeading: 'What to expect',
    items: [
      {
        name: 'Field reports',
        description: 'our correspondents on the ground where events are unfolding.',
      },
      {
        name: 'Explainers',
        description: 'short, visual breakdowns of the issues driving the headlines.',
      },
      {
        name: 'Conversations',
        description: 'interviews with the newsmakers, analysts, and thinkers we cover.',
      },
    ],
    soonHeading: 'Coming soon',
    soon: 'Our video coverage is in production and will live here alongside the rest of the Journal. Subscribe to be notified when the first films and explainers go live.',
  },
  es: {
    title: 'Video',
    intro:
      'Algunas historias se cuentan mejor en pantalla. Estamos creando una redacción de video para ofrecerle reportajes desde el terreno, entrevistas con los protagonistas de la actualidad y explicaciones que aclaran temas complejos en pocos minutos.',
    expectHeading: 'Qué esperar',
    items: [
      {
        name: 'Reportajes de campo',
        description: 'nuestros corresponsales sobre el terreno, allí donde ocurren los hechos.',
      },
      {
        name: 'Explicativos',
        description: 'análisis breves y visuales de los temas que marcan los titulares.',
      },
      {
        name: 'Conversaciones',
        description:
          'entrevistas con los protagonistas, analistas y pensadores sobre los que informamos.',
      },
    ],
    soonHeading: 'Próximamente',
    soon: 'Nuestra cobertura en video está en producción y vivirá aquí junto al resto del Journal. Suscríbase para recibir un aviso cuando se publiquen los primeros documentales y explicativos.',
  },
  fr: {
    title: 'Vidéo',
    intro:
      'Certaines histoires se racontent mieux à l’écran. Nous mettons en place une rédaction vidéo pour vous proposer des reportages de terrain, des entretiens avec les acteurs de l’actualité et des explications qui éclairent en quelques minutes des sujets complexes.',
    expectHeading: 'À quoi s’attendre',
    items: [
      {
        name: 'Reportages de terrain',
        description: 'nos correspondants sur place, là où les événements se déroulent.',
      },
      {
        name: 'Décryptages',
        description: 'de courtes analyses visuelles des enjeux qui font l’actualité.',
      },
      {
        name: 'Conversations',
        description:
          'des entretiens avec les acteurs de l’actualité, les analystes et les penseurs que nous couvrons.',
      },
    ],
    soonHeading: 'Bientôt disponible',
    soon: 'Notre couverture vidéo est en production et vivra ici aux côtés du reste du Journal. Abonnez-vous pour être averti de la mise en ligne des premiers films et décryptages.',
  },
};

export function Video() {
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

        <h2 className="headline text-2xl text-ink">{copy.expectHeading}</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          {copy.items.map((item) => (
            <li key={item.name}>
              <strong>{item.name}</strong> — {item.description}
            </li>
          ))}
        </ul>

        <h2 className="headline text-2xl text-ink">{copy.soonHeading}</h2>
        <p>{copy.soon}</p>
      </div>
    </div>
  );
}
