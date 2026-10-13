import type { Language } from '@gwj/shared-types';
import { useLang } from '../../lib/i18n';

interface RssCopy {
  title: string;
  intro: string;
  howHeading: string;
  how: string;
  mainHeading: string;
  allArticles: string;
  sectionsHeading: string;
  sections: string;
}

const KICKER = 'The Global World Journal';
const FEED_PATH = '/feed.xml';

const COPY: Record<Language, RssCopy> = {
  en: {
    title: 'RSS Feeds',
    intro:
      'RSS is an open standard that lets you follow the Journal in the reader of your choice. Instead of checking the site, you subscribe to a feed and new articles appear automatically as we publish them, with no account required.',
    howHeading: 'How to use it',
    how: 'Copy the feed address below and paste it into any feed reader. The reader will pull in our latest headlines, summaries, and links back to the full articles on globalworldjournal.com.',
    mainHeading: 'Main feed',
    allArticles: 'All articles:',
    sectionsHeading: 'Per-section feeds',
    sections:
      'Dedicated feeds for World, Business, Markets, Tech, Politics, Opinion, and Arts are planned, so you will be able to follow only the sections you care about. Until then, the main feed covers everything we publish.',
  },
  es: {
    title: 'Canales RSS',
    intro:
      'RSS es un estándar abierto que le permite seguir el Journal en el lector que prefiera. En lugar de visitar el sitio, se suscribe a un canal y los nuevos artículos aparecen automáticamente cuando los publicamos, sin necesidad de crear una cuenta.',
    howHeading: 'Cómo usarlo',
    how: 'Copie la dirección del canal que aparece abajo y péguela en cualquier lector de canales. El lector mostrará nuestros últimos titulares, resúmenes y enlaces a los artículos completos en globalworldjournal.com.',
    mainHeading: 'Canal principal',
    allArticles: 'Todos los artículos:',
    sectionsHeading: 'Canales por sección',
    sections:
      'Está previsto ofrecer canales específicos para Mundo, Negocios, Mercados, Tecnología, Política, Opinión y Artes, para que pueda seguir solo las secciones que le interesan. Hasta entonces, el canal principal incluye todo lo que publicamos.',
  },
  fr: {
    title: 'Flux RSS',
    intro:
      'Le RSS est un standard ouvert qui vous permet de suivre le Journal dans le lecteur de votre choix. Au lieu de consulter le site, vous vous abonnez à un flux et les nouveaux articles apparaissent automatiquement dès leur publication, sans avoir besoin de créer de compte.',
    howHeading: 'Comment l’utiliser',
    how: 'Copiez l’adresse du flux ci-dessous et collez-la dans n’importe quel lecteur de flux. Le lecteur récupérera nos derniers titres, résumés et liens vers les articles complets sur globalworldjournal.com.',
    mainHeading: 'Flux principal',
    allArticles: 'Tous les articles :',
    sectionsHeading: 'Flux par rubrique',
    sections:
      'Des flux dédiés à Monde, Économie, Marchés, Tech, Politique, Opinion et Arts sont prévus, afin que vous puissiez ne suivre que les rubriques qui vous intéressent. D’ici là, le flux principal couvre tout ce que nous publions.',
  },
};

export function RssFeeds() {
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

        <h2 className="headline text-2xl text-ink">{copy.howHeading}</h2>
        <p>{copy.how}</p>

        <h2 className="headline text-2xl text-ink">{copy.mainHeading}</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            {copy.allArticles}{' '}
            <a href={FEED_PATH} className="text-accent hover:underline">
              {FEED_PATH}
            </a>
          </li>
        </ul>

        <h2 className="headline text-2xl text-ink">{copy.sectionsHeading}</h2>
        <p>{copy.sections}</p>
      </div>
    </div>
  );
}
