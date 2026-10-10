import { email, h2, p, type Localized, type StaticPageContent } from './model';

const ADDRESS = 'careers@globalworldjournal.com';

export const CAREERS: Localized<StaticPageContent> = {
  en: {
    title: 'Careers',
    blocks: [
      p(
        'We are building a newsroom and a company for the next era of international journalism, and we are hiring. If you want your work to reach readers around the world and to be measured by a high editorial standard, we would like to hear from you.',
      ),
      h2('Where we are hiring'),
      p(
        'We have openings across three areas. On the editorial side we are looking for reporters, editors, and visual journalists who can report with precision and write with clarity. On the engineering side we want product and platform engineers who can build the tools a modern newsroom runs on. On the commercial side we are growing our advertising, partnerships, and subscriptions teams.',
      ),
      h2('How to apply'),
      p(
        'Send your resume, a short note about the role you are interested in, and relevant work or a portfolio to ',
        email(ADDRESS),
        '. We read every application and reply to candidates we would like to take further.',
      ),
      h2('Equal opportunity'),
      p(
        'The Global World Journal is an equal opportunity employer. We consider all qualified applicants without regard to race, color, religion, sex, sexual orientation, gender identity, national origin, age, disability, or any other characteristic protected by applicable law. A newsroom that reports on the whole world is stronger when its own people reflect it.',
      ),
    ],
  },
  es: {
    title: 'Empleo',
    blocks: [
      p(
        'Estamos construyendo una redacción y una empresa para la nueva era del periodismo internacional, y estamos contratando. Si quieres que tu trabajo llegue a lectores de todo el mundo y se mida con un alto nivel de exigencia editorial, nos encantará saber de ti.',
      ),
      h2('Dónde buscamos talento'),
      p(
        'Tenemos vacantes en tres áreas. En el ámbito editorial buscamos reporteros, editores y periodistas visuales capaces de informar con precisión y escribir con claridad. En ingeniería buscamos ingenieros de producto y de plataforma que sepan crear las herramientas con las que funciona una redacción moderna. En el área comercial estamos ampliando nuestros equipos de publicidad, alianzas y suscripciones.',
      ),
      h2('Cómo presentar tu candidatura'),
      p(
        'Envía tu currículum, una breve nota sobre el puesto que te interesa y trabajos relevantes o un portafolio a ',
        email(ADDRESS),
        '. Leemos todas las candidaturas y respondemos a las personas con las que nos gustaría seguir adelante en el proceso.',
      ),
      h2('Igualdad de oportunidades'),
      p(
        'The Global World Journal es una empresa comprometida con la igualdad de oportunidades. Tenemos en cuenta a todas las personas candidatas cualificadas sin distinción de raza, color, religión, sexo, orientación sexual, identidad de género, origen nacional, edad, discapacidad o cualquier otra característica protegida por la legislación aplicable. Una redacción que informa sobre el mundo entero es más sólida cuando su propio equipo lo refleja.',
      ),
    ],
  },
  fr: {
    title: 'Carrières',
    blocks: [
      p(
        'Nous construisons une rédaction et une entreprise pour la nouvelle ère du journalisme international, et nous recrutons. Si vous souhaitez que votre travail touche des lecteurs du monde entier et soit jugé à l’aune d’une haute exigence éditoriale, nous serions ravis d’avoir de vos nouvelles.',
      ),
      h2('Nos recrutements'),
      p(
        'Nous avons des postes à pourvoir dans trois domaines. Côté rédaction, nous recherchons des reporters, des éditeurs et des journalistes visuels capables d’informer avec précision et d’écrire avec clarté. Côté technique, nous voulons des ingénieurs produit et plateforme capables de concevoir les outils sur lesquels repose une rédaction moderne. Côté commercial, nous étoffons nos équipes publicité, partenariats et abonnements.',
      ),
      h2('Comment postuler'),
      p(
        'Envoyez votre CV, quelques lignes sur le poste qui vous intéresse et des travaux pertinents ou un portfolio à ',
        email(ADDRESS),
        '. Nous lisons toutes les candidatures et répondons aux candidats avec lesquels nous souhaitons aller plus loin.',
      ),
      h2('Égalité des chances'),
      p(
        'The Global World Journal applique une politique d’égalité des chances en matière d’emploi. Nous examinons toutes les candidatures qualifiées sans distinction de race, de couleur, de religion, de sexe, d’orientation sexuelle, d’identité de genre, d’origine nationale, d’âge, de handicap ou de toute autre caractéristique protégée par la loi applicable. Une rédaction qui couvre le monde entier est plus forte lorsque ses propres équipes en sont le reflet.',
      ),
    ],
  },
};
