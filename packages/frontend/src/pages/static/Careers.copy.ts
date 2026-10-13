import type { Language } from '@gwj/shared-types';

export const CAREERS_EMAIL = 'careers@globalworldjournal.com';

export interface CareersCopy {
  title: string;
  intro: string;
  hiring: { heading: string; body: string };
  apply: { heading: string; before: string; after: string };
  equal: { heading: string; body: string };
}

export const CAREERS_COPY: Record<Language, CareersCopy> = {
  en: {
    title: 'Careers',
    intro:
      'We are building a newsroom and a company for the next era of international journalism, and we are hiring. If you want your work to reach readers around the world and to be measured by a high editorial standard, we would like to hear from you.',
    hiring: {
      heading: 'Where we are hiring',
      body: 'We have openings across three areas. On the editorial side we are looking for reporters, editors, and visual journalists who can report with precision and write with clarity. On the engineering side we want product and platform engineers who can build the tools a modern newsroom runs on. On the commercial side we are growing our advertising, partnerships, and subscriptions teams.',
    },
    apply: {
      heading: 'How to apply',
      before:
        'Send your resume, a short note about the role you are interested in, and relevant work or a portfolio to',
      after: 'We read every application and reply to candidates we would like to take further.',
    },
    equal: {
      heading: 'Equal opportunity',
      body: 'The Global World Journal is an equal opportunity employer. We consider all qualified applicants without regard to race, color, religion, sex, sexual orientation, gender identity, national origin, age, disability, or any other characteristic protected by applicable law. A newsroom that reports on the whole world is stronger when its own people reflect it.',
    },
  },
  es: {
    title: 'Empleo',
    intro:
      'Estamos construyendo una redacción y una empresa para la próxima era del periodismo internacional, y estamos contratando. Si quieres que tu trabajo llegue a lectores de todo el mundo y se mida con un alto estándar editorial, queremos conocerte.',
    hiring: {
      heading: 'Dónde estamos contratando',
      body: 'Tenemos vacantes en tres áreas. En la parte editorial buscamos reporteros, editores y periodistas visuales capaces de informar con precisión y escribir con claridad. En ingeniería queremos ingenieros de producto y de plataforma que construyan las herramientas sobre las que funciona una redacción moderna. En el área comercial estamos ampliando nuestros equipos de publicidad, alianzas y suscripciones.',
    },
    apply: {
      heading: 'Cómo postular',
      before:
        'Envía tu currículum, una breve nota sobre el puesto que te interesa y trabajos relevantes o un portafolio a',
      after:
        'Leemos todas las solicitudes y respondemos a los candidatos con quienes queremos avanzar.',
    },
    equal: {
      heading: 'Igualdad de oportunidades',
      body: 'The Global World Journal es un empleador que ofrece igualdad de oportunidades. Consideramos a todos los candidatos calificados sin distinción de raza, color, religión, sexo, orientación sexual, identidad de género, origen nacional, edad, discapacidad o cualquier otra característica protegida por la ley aplicable. Una redacción que informa sobre el mundo entero es más sólida cuando su propia gente lo refleja.',
    },
  },
  fr: {
    title: 'Carrières',
    intro:
      'Nous construisons une rédaction et une entreprise pour la prochaine ère du journalisme international, et nous recrutons. Si vous souhaitez que votre travail touche des lecteurs dans le monde entier et soit jugé à l’aune d’un haut niveau d’exigence éditoriale, nous aimerions échanger avec vous.',
    hiring: {
      heading: 'Nos recrutements',
      body: 'Nous avons des postes ouverts dans trois domaines. Côté éditorial, nous recherchons des reporters, des rédacteurs et des journalistes visuels capables d’enquêter avec précision et d’écrire avec clarté. Côté ingénierie, nous voulons des ingénieurs produit et plateforme qui conçoivent les outils dont dépend une rédaction moderne. Côté commercial, nous renforçons nos équipes publicité, partenariats et abonnements.',
    },
    apply: {
      heading: 'Comment postuler',
      before:
        'Envoyez votre CV, un court mot sur le poste qui vous intéresse et des travaux pertinents ou un portfolio à',
      after:
        'Nous lisons chaque candidature et répondons aux candidats que nous souhaitons rencontrer.',
    },
    equal: {
      heading: 'Égalité des chances',
      body: 'The Global World Journal est un employeur garantissant l’égalité des chances. Nous examinons toutes les candidatures qualifiées sans distinction de race, de couleur, de religion, de sexe, d’orientation sexuelle, d’identité de genre, d’origine nationale, d’âge, de handicap ou de toute autre caractéristique protégée par la loi applicable. Une rédaction qui couvre le monde entier est plus forte lorsque ses propres équipes le reflètent.',
    },
  },
};
