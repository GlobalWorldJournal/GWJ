import { TELEGRAM_CHANNEL_HANDLE, TELEGRAM_CHANNEL_URL } from '@gwj/shared-types';
import { external, h2, p, telegramCta, type Localized, type StaticPageContent } from './model';

const CHANNEL = external(TELEGRAM_CHANNEL_URL, TELEGRAM_CHANNEL_HANDLE);

export const SUBSCRIBE: Localized<StaticPageContent> = {
  en: {
    title: 'Follow Us',
    blocks: [
      p(
        'The Global World Journal brings you independent reporting from every corner of the world, with the depth and clarity you need to make sense of business, markets, technology, politics, and the ideas shaping our time. The fastest way to stay with us is to follow along on Telegram.',
      ),
      h2('Follow on Telegram'),
      p(
        'We publish the day’s essential reading to our Telegram channel ',
        CHANNEL,
        ' — headlines, analysis, and breaking news as it lands. It is the simplest way to read the Journal without missing a story.',
      ),
      telegramCta,
      h2('More ways to follow'),
      p(
        'WhatsApp is coming soon. When it launches, you will be able to follow the Journal there too.',
      ),
    ],
  },
  es: {
    title: 'Síguenos',
    blocks: [
      p(
        'The Global World Journal te ofrece periodismo independiente desde todos los rincones del mundo, con la profundidad y la claridad que necesitas para entender la economía, los mercados, la tecnología, la política y las ideas que definen nuestra época. La forma más rápida de no perderte nada es seguirnos en Telegram.',
      ),
      h2('Síguenos en Telegram'),
      p(
        'Publicamos la lectura esencial del día en nuestro canal de Telegram ',
        CHANNEL,
        ': titulares, análisis y noticias de última hora en cuanto se producen. Es la forma más sencilla de leer el Journal sin perderte ninguna noticia.',
      ),
      telegramCta,
      h2('Más formas de seguirnos'),
      p('WhatsApp llegará pronto. Cuando esté disponible, también podrás seguir al Journal allí.'),
    ],
  },
  fr: {
    title: 'Nous suivre',
    blocks: [
      p(
        'The Global World Journal vous propose un journalisme indépendant venu des quatre coins du monde, avec la profondeur et la clarté nécessaires pour comprendre l’économie, les marchés, la technologie, la politique et les idées qui façonnent notre époque. Le moyen le plus rapide de rester avec nous est de nous suivre sur Telegram.',
      ),
      h2('Suivez-nous sur Telegram'),
      p(
        'Nous publions l’essentiel du jour sur notre chaîne Telegram ',
        CHANNEL,
        '\u00a0: titres, analyses et informations de dernière minute, au fil de l’actualité. C’est le moyen le plus simple de lire le Journal sans manquer aucun article.',
      ),
      telegramCta,
      h2('D’autres façons de nous suivre'),
      p('WhatsApp arrive bientôt. Dès son lancement, vous pourrez également y suivre le Journal.'),
    ],
  },
};
