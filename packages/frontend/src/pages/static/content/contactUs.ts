import { email, h2, p, ul, type Localized, type StaticPageContent } from './model';

const NEWS = 'news@globalworldjournal.com';
const SUPPORT = 'support@globalworldjournal.com';
const ADVERTISING = 'advertising@globalworldjournal.com';

export const CONTACT_US: Localized<StaticPageContent> = {
  en: {
    title: 'Contact Us',
    blocks: [
      p(
        'We want to hear from you. Whether you have a story tip, a question about your account, or an advertising inquiry, reach the right team below and we will get back to you as quickly as we can.',
      ),
      h2('Newsroom'),
      p(
        'Story ideas, corrections, and feedback on our coverage go to our editors. We read every message, though we cannot respond to all of them individually.',
      ),
      ul(['Email: ', email(NEWS)]),
      h2('General and subscriber support'),
      p(
        'Questions about your subscription, billing, delivery, or account settings are handled by our support team.',
      ),
      ul(['Email: ', email(SUPPORT)]),
      h2('Advertising and partnerships'),
      p(
        'For media kits, sponsorship opportunities, and partnership proposals, contact our commercial team.',
      ),
      ul(['Email: ', email(ADVERTISING)]),
      h2('Confidential tips and secure contact'),
      p(
        'If you have sensitive information for our reporters, write to ',
        email(NEWS),
        ' and note that the matter is confidential. For especially sensitive material, ask us to arrange a secure, encrypted channel before you send anything, and avoid including identifying details in your first message.',
      ),
    ],
  },
  es: {
    title: 'Contáctanos',
    blocks: [
      p(
        'Queremos saber de ti. Tanto si tienes una pista para una noticia como una pregunta sobre tu cuenta o una consulta sobre publicidad, ponte en contacto con el equipo adecuado y te responderemos lo antes posible.',
      ),
      h2('Redacción'),
      p(
        'Las propuestas de temas, las correcciones y los comentarios sobre nuestra cobertura llegan a nuestros editores. Leemos todos los mensajes, aunque no podemos responder a cada uno de forma individual.',
      ),
      ul(['Correo electrónico: ', email(NEWS)]),
      h2('Atención general y a suscriptores'),
      p(
        'Nuestro equipo de atención al cliente gestiona las preguntas sobre tu suscripción, la facturación, la entrega o la configuración de tu cuenta.',
      ),
      ul(['Correo electrónico: ', email(SUPPORT)]),
      h2('Publicidad y colaboraciones'),
      p(
        'Para solicitar nuestro media kit, conocer las oportunidades de patrocinio o enviar propuestas de colaboración, ponte en contacto con nuestro equipo comercial.',
      ),
      ul(['Correo electrónico: ', email(ADVERTISING)]),
      h2('Pistas confidenciales y contacto seguro'),
      p(
        'Si tienes información delicada para nuestros periodistas, escribe a ',
        email(NEWS),
        ' e indica que el asunto es confidencial. Si se trata de material especialmente sensible, pídenos que habilitemos un canal seguro y cifrado antes de enviar nada, y evita incluir datos que permitan identificarte en tu primer mensaje.',
      ),
    ],
  },
  fr: {
    title: 'Nous contacter',
    blocks: [
      p(
        'Votre avis nous intéresse. Que vous ayez une information à nous transmettre, une question sur votre compte ou une demande concernant la publicité, adressez-vous ci-dessous à l’équipe concernée et nous vous répondrons dans les meilleurs délais.',
      ),
      h2('Rédaction'),
      p(
        'Les idées de sujets, les demandes de correction et les remarques sur notre couverture sont transmises à nos éditeurs. Nous lisons tous les messages, mais nous ne pouvons pas répondre à chacun individuellement.',
      ),
      ul(['E-mail\u00a0: ', email(NEWS)]),
      h2('Assistance générale et abonnés'),
      p(
        'Notre équipe d’assistance traite les questions relatives à votre abonnement, à la facturation, à la livraison ou aux paramètres de votre compte.',
      ),
      ul(['E-mail\u00a0: ', email(SUPPORT)]),
      h2('Publicité et partenariats'),
      p(
        'Pour obtenir nos kits médias, connaître les possibilités de parrainage ou soumettre une proposition de partenariat, contactez notre équipe commerciale.',
      ),
      ul(['E-mail\u00a0: ', email(ADVERTISING)]),
      h2('Informations confidentielles et contact sécurisé'),
      p(
        'Si vous détenez des informations sensibles pour nos journalistes, écrivez à ',
        email(NEWS),
        ' en précisant que l’affaire est confidentielle. Pour des documents particulièrement sensibles, demandez-nous de mettre en place un canal sécurisé et chiffré avant tout envoi, et évitez d’inclure des éléments permettant de vous identifier dans votre premier message.',
      ),
    ],
  },
};
