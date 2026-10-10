import { TELEGRAM_CHANNEL_HANDLE, TELEGRAM_CHANNEL_URL } from '@gwj/shared-types';
import {
  external,
  h2,
  p,
  route,
  strong,
  telegramCta,
  ul,
  type Localized,
  type StaticPageContent,
} from './model';

const SUBSCRIBE_PATH = '/subscribe';
const CHANNEL = external(TELEGRAM_CHANNEL_URL, TELEGRAM_CHANNEL_HANDLE);

/*
 * The channel's recurring editions keep their English names in every edition:
 * they are the titles readers see on the (single) Telegram channel.
 */
export const NEWSLETTERS: Localized<StaticPageContent> = {
  en: {
    title: 'Telegram',
    blocks: [
      p(
        'The Journal goes out on Telegram, not email. Our channel brings the newsroom to your phone, edited by the journalists who cover each beat, so you can read on your own schedule and never miss the stories that matter.',
      ),
      h2('On our channel'),
      ul(
        [strong('Morning Briefing'), ' — the stories and context you need before the day begins.'],
        [
          strong('Markets Close'),
          ' — what moved stocks, bonds, and currencies, explained after the bell.',
        ],
        [strong('World This Week'), ' — a weekend read on the events shaping the global agenda.'],
        [
          strong('Tech Weekly'),
          ' — the companies, products, and policy decisions driving technology.',
        ],
        [
          strong('Opinion Digest'),
          ' — the week in argument, from our columnists and contributors.',
        ],
      ),
      h2('How to follow'),
      p(
        'Join us on Telegram at ',
        CHANNEL,
        ' and you will get every edition as it publishes. You can leave the channel at any time, right from Telegram.',
      ),
      telegramCta,
      p(
        'WhatsApp is planned next. For all the ways to follow the Journal, see ',
        route(SUBSCRIBE_PATH, 'Follow Us'),
        '.',
      ),
    ],
  },
  es: {
    title: 'Telegram',
    blocks: [
      p(
        'El Journal se publica en Telegram, no por correo electrónico. Nuestro canal lleva la redacción a tu móvil, editado por los periodistas que cubren cada área, para que leas cuando quieras y no te pierdas las noticias que importan.',
      ),
      h2('En nuestro canal'),
      ul(
        [
          strong('Morning Briefing'),
          ' — las noticias y el contexto que necesitas antes de empezar el día.',
        ],
        [
          strong('Markets Close'),
          ' — qué movió las acciones, los bonos y las divisas, explicado tras el cierre de la sesión.',
        ],
        [
          strong('World This Week'),
          ' — una lectura de fin de semana sobre los acontecimientos que marcan la agenda mundial.',
        ],
        [
          strong('Tech Weekly'),
          ' — las empresas, los productos y las decisiones políticas que impulsan la tecnología.',
        ],
        [
          strong('Opinion Digest'),
          ' — la semana en debate, de la mano de nuestros columnistas y colaboradores.',
        ],
      ),
      h2('Cómo seguirnos'),
      p(
        'Únete a nosotros en Telegram en ',
        CHANNEL,
        ' y recibirás cada edición en cuanto se publique. Puedes salir del canal cuando quieras, directamente desde Telegram.',
      ),
      telegramCta,
      p(
        'El siguiente paso será WhatsApp. Para ver todas las formas de seguir al Journal, visita ',
        route(SUBSCRIBE_PATH, 'Síguenos'),
        '.',
      ),
    ],
  },
  fr: {
    title: 'Telegram',
    blocks: [
      p(
        'Le Journal est diffusé sur Telegram, et non par e-mail. Notre chaîne apporte la rédaction jusque dans votre téléphone, éditée par les journalistes spécialistes de chaque domaine, pour que vous lisiez à votre rythme sans jamais manquer l’essentiel de l’actualité.',
      ),
      h2('Sur notre chaîne'),
      ul(
        [
          strong('Morning Briefing'),
          ' — l’actualité et le contexte dont vous avez besoin avant de commencer la journée.',
        ],
        [
          strong('Markets Close'),
          ' — ce qui a fait bouger les actions, les obligations et les devises, expliqué après la clôture.',
        ],
        [
          strong('World This Week'),
          ' — une lecture du week-end sur les événements qui façonnent l’agenda mondial.',
        ],
        [
          strong('Tech Weekly'),
          ' — les entreprises, les produits et les décisions politiques qui font avancer la technologie.',
        ],
        [
          strong('Opinion Digest'),
          ' — la semaine des idées et des débats, par nos chroniqueurs et contributeurs.',
        ],
      ),
      h2('Comment nous suivre'),
      p(
        'Rejoignez-nous sur Telegram à l’adresse ',
        CHANNEL,
        ' pour recevoir chaque édition dès sa parution. Vous pouvez quitter la chaîne à tout moment, directement depuis Telegram.',
      ),
      telegramCta,
      p(
        'WhatsApp arrivera ensuite. Pour découvrir toutes les façons de suivre le Journal, consultez la page ',
        route(SUBSCRIBE_PATH, 'Nous suivre'),
        '.',
      ),
    ],
  },
};
