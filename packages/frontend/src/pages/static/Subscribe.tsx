import { type Language, telegramChannelFor } from '@gwj/shared-types';
import { useLang } from '../../lib/i18n';

interface SubscribeCopy {
  title: string;
  intro: string;
  telegramHeading: string;
  telegramLead: string;
  telegramTail: string;
  button: string;
  moreHeading: string;
  more: string;
}

const KICKER = 'The Global World Journal';

const COPY: Record<Language, SubscribeCopy> = {
  en: {
    title: 'Follow Us',
    intro:
      'The Global World Journal brings you independent reporting from every corner of the world, with the depth and clarity you need to make sense of business, markets, technology, politics, and the ideas shaping our time. The fastest way to stay with us is to follow along on Telegram.',
    telegramHeading: 'Follow on Telegram',
    telegramLead: 'We publish the day’s essential reading to our Telegram channel',
    telegramTail:
      '— headlines, analysis, and breaking news as it lands. It is the simplest way to read the Journal without missing a story.',
    button: 'Follow on Telegram',
    moreHeading: 'More ways to follow',
    more: 'WhatsApp is coming soon. When it launches, you will be able to follow the Journal there too.',
  },
  es: {
    title: 'Síganos',
    intro:
      'The Global World Journal le ofrece periodismo independiente desde todos los rincones del mundo, con la profundidad y la claridad que necesita para entender la economía, los mercados, la tecnología, la política y las ideas que moldean nuestro tiempo. La forma más rápida de estar con nosotros es seguirnos en Telegram.',
    telegramHeading: 'Síganos en Telegram',
    telegramLead: 'Publicamos las lecturas esenciales del día en nuestro canal de Telegram',
    telegramTail:
      '— titulares, análisis y noticias de última hora en cuanto se producen. Es la forma más sencilla de leer el Journal sin perderse ninguna historia.',
    button: 'Síganos en Telegram',
    moreHeading: 'Más formas de seguirnos',
    more: 'WhatsApp llegará pronto. Cuando se lance, también podrá seguir el Journal allí.',
  },
  fr: {
    title: 'Suivez-nous',
    intro:
      'The Global World Journal vous propose un journalisme indépendant venu de tous les coins du monde, avec la profondeur et la clarté nécessaires pour comprendre l’économie, les marchés, la technologie, la politique et les idées qui façonnent notre époque. Le moyen le plus rapide de rester avec nous est de nous suivre sur Telegram.',
    telegramHeading: 'Suivez-nous sur Telegram',
    telegramLead: 'Nous publions les lectures essentielles du jour sur notre chaîne Telegram',
    telegramTail:
      '— titres, analyses et dernières nouvelles dès qu’elles tombent. C’est le moyen le plus simple de lire le Journal sans manquer un seul article.',
    button: 'Suivez-nous sur Telegram',
    moreHeading: 'Autres façons de nous suivre',
    more: 'WhatsApp arrive bientôt. Dès son lancement, vous pourrez aussi y suivre le Journal.',
  },
};

export function Subscribe() {
  const { lang } = useLang();
  const telegram = telegramChannelFor(lang);
  const copy = COPY[lang];
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">{copy.title}</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">{KICKER}</p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>{copy.intro}</p>

        <h2 className="headline text-2xl text-ink">{copy.telegramHeading}</h2>
        <p>
          {copy.telegramLead}{' '}
          <a
            href={telegram.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {telegram.handle}
          </a>{' '}
          {copy.telegramTail}
        </p>
        <p>
          <a
            href={telegram.url}
            target="_blank"
            rel="noopener noreferrer"
            className="label inline-block border border-ink bg-ink px-5 py-2 text-[0.6875rem] tracking-[0.12em] text-paper transition-colors hover:border-accent hover:bg-accent"
          >
            {copy.button}
          </a>
        </p>

        <h2 className="headline text-2xl text-ink">{copy.moreHeading}</h2>
        <p>{copy.more}</p>
      </div>
    </div>
  );
}
