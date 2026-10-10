import { email, h2, p, type Localized, type StaticPageContent } from './model';

const ADDRESS = 'advertising@globalworldjournal.com';

export const ADVERTISE: Localized<StaticPageContent> = {
  en: {
    title: 'Advertise',
    blocks: [
      p(
        'The Global World Journal connects advertisers and partners with an engaged international audience of decision makers, professionals, and curious readers who come to us for serious coverage of business, markets, technology, and world affairs.',
      ),
      h2('Our audience'),
      p(
        'Our readers are global, informed, and influential. They include executives, investors, policymakers, founders, and the kind of people who shape the conversations our journalism covers. They read us across the web on desktop and mobile, and they return because they trust what they find here.',
      ),
      h2('Working with us'),
      p(
        'We offer display advertising, sponsorships, branded partnerships, and bespoke campaigns designed to reach the right readers in a trusted editorial environment. Our advertising is kept clearly separate from our newsroom, and editorial independence is never for sale.',
      ),
      h2('Get in touch'),
      p(
        'To discuss advertising and partnership opportunities, contact our commercial team at ',
        email(ADDRESS),
        '. Tell us about your goals and we will put together a proposal that fits.',
      ),
    ],
  },
  es: {
    title: 'Anúnciate',
    blocks: [
      p(
        'The Global World Journal conecta a anunciantes y socios con un público internacional comprometido, formado por personas con capacidad de decisión, profesionales y lectores curiosos que acuden a nosotros en busca de una cobertura rigurosa de la economía, los mercados, la tecnología y la actualidad internacional.',
      ),
      h2('Nuestro público'),
      p(
        'Nuestros lectores son globales, están bien informados y tienen influencia. Entre ellos hay directivos, inversores, responsables políticos, fundadores de empresas y el tipo de personas que marcan las conversaciones que cubre nuestro periodismo. Nos leen en la web, desde el ordenador y el móvil, y vuelven porque confían en lo que encuentran aquí.',
      ),
      h2('Colabora con nosotros'),
      p(
        'Ofrecemos publicidad gráfica, patrocinios, colaboraciones de marca y campañas a medida, diseñadas para llegar a los lectores adecuados en un entorno editorial de confianza. Nuestra publicidad se mantiene claramente separada de la redacción, y la independencia editorial nunca está en venta.',
      ),
      h2('Contacto'),
      p(
        'Para hablar de oportunidades de publicidad y colaboración, escribe a nuestro equipo comercial a ',
        email(ADDRESS),
        '. Cuéntanos tus objetivos y te prepararemos una propuesta a tu medida.',
      ),
    ],
  },
  fr: {
    title: 'Publicité',
    blocks: [
      p(
        'The Global World Journal met en relation annonceurs et partenaires avec une audience internationale engagée de décideurs, de professionnels et de lecteurs curieux, qui viennent chercher chez nous une couverture exigeante de l’économie, des marchés, de la technologie et de l’actualité internationale.',
      ),
      h2('Notre lectorat'),
      p(
        'Nos lecteurs sont internationaux, informés et influents. On y trouve des dirigeants, des investisseurs, des décideurs publics, des fondateurs d’entreprise et toutes celles et ceux qui façonnent les débats dont rend compte notre journalisme. Ils nous lisent sur le Web, sur ordinateur comme sur mobile, et reviennent parce qu’ils ont confiance en ce qu’ils y trouvent.',
      ),
      h2('Collaborer avec nous'),
      p(
        'Nous proposons de la publicité display, des parrainages, des partenariats de marque et des campagnes sur mesure, conçus pour toucher les bons lecteurs dans un environnement éditorial de confiance. Notre publicité est clairement séparée de notre rédaction, et notre indépendance éditoriale n’est jamais à vendre.',
      ),
      h2('Nous contacter'),
      p(
        'Pour discuter des possibilités de publicité et de partenariat, contactez notre équipe commerciale à l’adresse ',
        email(ADDRESS),
        '. Présentez-nous vos objectifs et nous vous préparerons une proposition adaptée.',
      ),
    ],
  },
};
