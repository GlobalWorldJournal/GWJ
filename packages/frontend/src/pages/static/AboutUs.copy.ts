import type { Language } from '@gwj/shared-types';

export interface AboutUsCopy {
  title: string;
  intro: readonly string[];
  sections: readonly { heading: string; body: string }[];
}

export const ABOUT_US_COPY: Record<Language, AboutUsCopy> = {
  en: {
    title: 'About Us',
    intro: [
      'The Global World Journal is an independent international newspaper covering the events, decisions, and ideas that shape the world. We were founded on a straightforward belief: that readers everywhere deserve clear, rigorous reporting that holds power to account and explains why it matters.',
      'Our mission is independent global journalism. We are not aligned with any government, party, or commercial interest, and our editorial decisions are made by our newsroom alone. We report from a global vantage point, treating audiences in every region as readers of equal importance rather than as an afterthought to a single national story.',
    ],
    sections: [
      {
        heading: 'What we cover',
        body: 'Our coverage spans World, Business, Markets, Technology, Politics, Opinion, and Arts. Across these sections we pursue accountability reporting, market analysis, and cultural criticism with the same standard of care, because the forces moving capital, policy, and culture rarely stay inside neat boundaries.',
      },
      {
        heading: 'How we work',
        body: 'Our newsroom is AI-assisted and human-led. We use modern tools to help us gather, organize, and draft at the speed the news demands, but every story is shaped, verified, and approved by editors who answer for its accuracy. Our human editorial standards are not optional features layered on top of automation. They are the foundation, and they govern everything we publish.',
      },
    ],
  },
  es: {
    title: 'Quiénes somos',
    intro: [
      'The Global World Journal es un periódico internacional independiente que cubre los acontecimientos, las decisiones y las ideas que dan forma al mundo. Nació de una convicción sencilla: los lectores de todas partes merecen un periodismo claro y riguroso, que exija cuentas al poder y explique por qué importa.',
      'Nuestra misión es un periodismo global independiente. No estamos alineados con ningún gobierno, partido ni interés comercial, y las decisiones editoriales las toma únicamente nuestra redacción. Informamos desde una perspectiva global y tratamos a las audiencias de todas las regiones como lectores de igual importancia, no como un añadido a una historia nacional.',
    ],
    sections: [
      {
        heading: 'Qué cubrimos',
        body: 'Nuestra cobertura abarca Mundo, Economía, Mercados, Tecnología, Política, Opinión y Artes. En todas estas secciones practicamos el periodismo de rendición de cuentas, el análisis de mercados y la crítica cultural con el mismo rigor, porque las fuerzas que mueven el capital, las políticas públicas y la cultura rara vez respetan fronteras bien definidas.',
      },
      {
        heading: 'Cómo trabajamos',
        body: 'Nuestra redacción cuenta con asistencia de inteligencia artificial y está dirigida por personas. Usamos herramientas modernas para reunir, organizar y redactar a la velocidad que exige la actualidad, pero cada noticia es elaborada, verificada y aprobada por editores que responden de su exactitud. Nuestros estándares editoriales humanos no son funciones opcionales añadidas a la automatización: son el cimiento y rigen todo lo que publicamos.',
      },
    ],
  },
  fr: {
    title: 'À propos',
    intro: [
      'The Global World Journal est un journal international indépendant qui couvre les événements, les décisions et les idées qui façonnent le monde. Il est né d’une conviction simple : les lecteurs du monde entier méritent un journalisme clair et rigoureux, qui demande des comptes aux pouvoirs et explique pourquoi cela compte.',
      'Notre mission est un journalisme mondial indépendant. Nous ne sommes liés à aucun gouvernement, parti ou intérêt commercial, et les décisions éditoriales sont prises par notre seule rédaction. Nous informons depuis un point de vue mondial et considérons les lecteurs de chaque région comme tout aussi importants, et non comme un complément d’un récit national.',
    ],
    sections: [
      {
        heading: 'Ce que nous couvrons',
        body: 'Notre couverture englobe le Monde, l’Économie, les Marchés, la Technologie, la Politique, les Opinions et les Arts. Dans toutes ces rubriques, nous pratiquons le journalisme de responsabilité, l’analyse des marchés et la critique culturelle avec la même exigence, car les forces qui font bouger les capitaux, les politiques publiques et la culture respectent rarement des frontières nettes.',
      },
      {
        heading: 'Notre façon de travailler',
        body: 'Notre rédaction est assistée par l’IA et dirigée par des humains. Nous utilisons des outils modernes pour collecter, organiser et rédiger à la vitesse qu’exige l’actualité, mais chaque article est façonné, vérifié et approuvé par des rédacteurs qui répondent de son exactitude. Nos standards éditoriaux humains ne sont pas des options superposées à l’automatisation : ils en sont le fondement et gouvernent tout ce que nous publions.',
      },
    ],
  },
};
