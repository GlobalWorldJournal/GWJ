import { h2, p, type Localized, type StaticPageContent } from './model';

export const ABOUT_US: Localized<StaticPageContent> = {
  en: {
    title: 'About Us',
    blocks: [
      p(
        'The Global World Journal is an independent international newspaper covering the events, decisions, and ideas that shape the world. We were founded on a straightforward belief: that readers everywhere deserve clear, rigorous reporting that holds power to account and explains why it matters.',
      ),
      p(
        'Our mission is independent global journalism. We are not aligned with any government, party, or commercial interest, and our editorial decisions are made by our newsroom alone. We report from a global vantage point, treating audiences in every region as readers of equal importance rather than as an afterthought to a single national story.',
      ),
      h2('What we cover'),
      p(
        'Our coverage spans World, Business, Markets, Technology, Politics, Opinion, and Arts. Across these sections we pursue accountability reporting, market analysis, and cultural criticism with the same standard of care, because the forces moving capital, policy, and culture rarely stay inside neat boundaries.',
      ),
      h2('How we work'),
      p(
        'Our newsroom is AI-assisted and human-led. We use modern tools to help us gather, organize, and draft at the speed the news demands, but every story is shaped, verified, and approved by editors who answer for its accuracy. Our human editorial standards are not optional features layered on top of automation. They are the foundation, and they govern everything we publish.',
      ),
    ],
  },
  es: {
    title: 'Quiénes somos',
    blocks: [
      p(
        'The Global World Journal es un diario internacional independiente que cubre los acontecimientos, las decisiones y las ideas que dan forma al mundo. Nacimos de una convicción sencilla: que los lectores de todo el mundo merecen un periodismo claro y riguroso, que pida cuentas al poder y explique por qué importa.',
      ),
      p(
        'Nuestra misión es el periodismo global e independiente. No estamos vinculados a ningún gobierno, partido ni interés comercial, y nuestras decisiones editoriales las toma únicamente nuestra redacción. Informamos desde una perspectiva global y tratamos al público de cada región como lectores de igual importancia, no como un añadido a una única historia nacional.',
      ),
      h2('Qué cubrimos'),
      p(
        'Nuestra cobertura abarca Mundo, Negocios, Mercados, Tecnología, Política, Opinión y Cultura. En todas estas secciones practicamos el periodismo de rendición de cuentas, el análisis de mercados y la crítica cultural con el mismo nivel de exigencia, porque las fuerzas que mueven el capital, la política y la cultura rara vez se quedan dentro de fronteras bien delimitadas.',
      ),
      h2('Cómo trabajamos'),
      p(
        'Nuestra redacción se apoya en la inteligencia artificial, pero la dirigen personas. Usamos herramientas modernas que nos ayudan a recopilar, organizar y redactar a la velocidad que exige la actualidad, pero cada noticia la elaboran, verifican y aprueban editores que responden de su exactitud. Nuestros criterios editoriales humanos no son un complemento opcional añadido a la automatización. Son los cimientos y rigen todo lo que publicamos.',
      ),
    ],
  },
  fr: {
    title: 'À propos',
    blocks: [
      p(
        'The Global World Journal est un quotidien international indépendant qui couvre les événements, les décisions et les idées qui façonnent le monde. Nous sommes nés d’une conviction simple\u00a0: partout dans le monde, les lecteurs méritent une information claire et rigoureuse, qui demande des comptes au pouvoir et explique pourquoi elle compte.',
      ),
      p(
        'Notre mission est de faire du journalisme mondial et indépendant. Nous ne sommes liés à aucun gouvernement, aucun parti ni aucun intérêt commercial, et nos choix éditoriaux relèvent de notre seule rédaction. Nous informons depuis un point de vue mondial et considérons les publics de chaque région comme des lecteurs d’égale importance, et non comme un simple complément à un récit national.',
      ),
      h2('Ce que nous couvrons'),
      p(
        'Notre couverture s’étend aux rubriques Monde, Affaires, Marchés, Technologie, Politique, Opinion et Arts. Dans chacune d’elles, nous pratiquons le journalisme d’enquête, l’analyse des marchés et la critique culturelle avec la même exigence, car les forces qui font bouger les capitaux, les politiques publiques et la culture restent rarement enfermées dans des cases bien nettes.',
      ),
      h2('Notre méthode'),
      p(
        'Notre rédaction s’appuie sur l’intelligence artificielle, mais elle est dirigée par des humains. Nous utilisons des outils modernes pour collecter, organiser et rédiger au rythme qu’exige l’actualité, mais chaque article est façonné, vérifié et validé par des responsables éditoriaux qui répondent de son exactitude. Nos normes éditoriales humaines ne sont pas des options ajoutées par-dessus l’automatisation. Elles en sont le fondement et régissent tout ce que nous publions.',
      ),
    ],
  },
};
