import type { Language } from '@gwj/shared-types';

export interface AdvertisePageCopy {
  title: string;
  intro: string;
  audienceTitle: string;
  audienceBody: string;
  workingTitle: string;
  workingBody: string;
  contactTitle: string;
  contactBefore: string;
  contactAfter: string;
}

const EN: AdvertisePageCopy = {
  title: 'Advertise',
  intro:
    'The Global World Journal connects advertisers and partners with an engaged international audience of decision makers, professionals, and curious readers who come to us for serious coverage of business, markets, technology, and world affairs.',
  audienceTitle: 'Our audience',
  audienceBody:
    'Our readers are global, informed, and influential. They include executives, investors, policymakers, founders, and the kind of people who shape the conversations our journalism covers. They read us across the web on desktop and mobile, and they return because they trust what they find here.',
  workingTitle: 'Working with us',
  workingBody:
    'We offer display advertising, sponsorships, branded partnerships, and bespoke campaigns designed to reach the right readers in a trusted editorial environment. Our advertising is kept clearly separate from our newsroom, and editorial independence is never for sale.',
  contactTitle: 'Get in touch',
  contactBefore:
    'To discuss advertising and partnership opportunities, contact our commercial team at',
  contactAfter: 'Tell us about your goals and we will put together a proposal that fits.',
};

const ES: AdvertisePageCopy = {
  title: 'Publicidad',
  intro:
    'The Global World Journal conecta a anunciantes y socios con una audiencia internacional comprometida, formada por personas que toman decisiones, profesionales y lectores curiosos que acuden a nosotros para informarse con rigor sobre negocios, mercados, tecnología y actualidad mundial.',
  audienceTitle: 'Nuestra audiencia',
  audienceBody:
    'Nuestros lectores son globales, bien informados e influyentes. Entre ellos hay directivos, inversores, responsables políticos, fundadores y el tipo de personas que dan forma a los debates que cubre nuestro periodismo. Nos leen en la web, tanto en ordenador como en el móvil, y regresan porque confían en lo que encuentran aquí.',
  workingTitle: 'Trabaje con nosotros',
  workingBody:
    'Ofrecemos publicidad gráfica, patrocinios, alianzas de marca y campañas a medida pensadas para llegar a los lectores adecuados en un entorno editorial de confianza. Nuestra publicidad se mantiene claramente separada de la redacción, y la independencia editorial nunca está en venta.',
  contactTitle: 'Póngase en contacto',
  contactBefore:
    'Para hablar sobre oportunidades de publicidad y colaboración, escriba a nuestro equipo comercial a',
  contactAfter: 'Cuéntenos sus objetivos y prepararemos una propuesta a su medida.',
};

const FR: AdvertisePageCopy = {
  title: 'Publicité',
  intro:
    'The Global World Journal met annonceurs et partenaires en relation avec un public international engagé, composé de décideurs, de professionnels et de lecteurs curieux qui viennent chez nous pour une couverture rigoureuse de l’économie, des marchés, de la technologie et de l’actualité mondiale.',
  audienceTitle: 'Notre audience',
  audienceBody:
    'Nos lecteurs sont internationaux, informés et influents. Ce sont des dirigeants, des investisseurs, des responsables politiques, des fondateurs d’entreprise, et le genre de personnes qui font les débats que couvre notre journalisme. Ils nous lisent sur le web, sur ordinateur comme sur mobile, et reviennent parce qu’ils ont confiance en ce qu’ils trouvent ici.',
  workingTitle: 'Travailler avec nous',
  workingBody:
    'Nous proposons de la publicité display, du parrainage, des partenariats de marque et des campagnes sur mesure conçues pour atteindre les bons lecteurs dans un environnement éditorial de confiance. Notre publicité est clairement séparée de la rédaction, et l’indépendance éditoriale n’est jamais à vendre.',
  contactTitle: 'Nous contacter',
  contactBefore:
    'Pour discuter des possibilités de publicité et de partenariat, écrivez à notre équipe commerciale à l’adresse',
  contactAfter: 'Parlez-nous de vos objectifs et nous vous préparerons une proposition adaptée.',
};

export const ADVERTISE_PAGE_COPY: Record<Language, AdvertisePageCopy> = { en: EN, es: ES, fr: FR };
