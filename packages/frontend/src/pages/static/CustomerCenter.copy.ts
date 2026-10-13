import type { Language } from '@gwj/shared-types';

export interface CustomerCenterCopy {
  title: string;
  intro: string;
  manageTitle: string;
  manageBody: string;
  billingTitle: string;
  billingBody: string;
  accountTitle: string;
  accountBody: string;
  faqTitle: string;
  faq: readonly string[];
  helpTitle: string;
  helpBefore: string;
  contactLink: string;
  helpMiddle: string;
  helpAfter: string;
}

const EN: CustomerCenterCopy = {
  title: 'Customer Center',
  intro:
    'Welcome to the Customer Center. This is the place to manage your subscription, review billing, update your account details, and find answers to the questions readers ask most often.',
  manageTitle: 'Manage your subscription',
  manageBody:
    'You can change your plan, switch between monthly and annual billing, update your payment method, or pause delivery at any time. Changes take effect at the start of your next billing period, and you keep full access until then.',
  billingTitle: 'Billing and payments',
  billingBody:
    'Receipts and invoices are issued by email after every charge. If a payment does not go through, we retry it a few days later and notify you so your access is never interrupted unexpectedly. To update a card or correct a billing address, sign in to your account.',
  accountTitle: 'Your account',
  accountBody:
    'Keep your email address and password current to make sure newsletters arrive and that you can sign in across devices. You control which newsletters you receive and how we contact you from your account settings.',
  faqTitle: 'Common questions',
  faq: [
    'How do I reset my password? Use the sign-in page and follow the password recovery link.',
    'Can I share my subscription? Each subscription is for individual use on your own devices.',
    'How do I cancel? You can cancel anytime from your account; access continues until the period ends.',
    'I was charged unexpectedly. Reach out and we will review the charge and resolve it.',
  ],
  helpTitle: 'Still need help?',
  helpBefore: 'Our support team is glad to assist. Visit',
  contactLink: 'Contact Us',
  helpMiddle: 'for the full list of departments, or write directly to',
  helpAfter: 'We aim to respond within one business day.',
};

const ES: CustomerCenterCopy = {
  title: 'Centro de atención al cliente',
  intro:
    'Le damos la bienvenida al Centro de atención al cliente. Aquí puede gestionar su suscripción, revisar la facturación, actualizar los datos de su cuenta y encontrar respuesta a las preguntas que más nos hacen los lectores.',
  manageTitle: 'Gestione su suscripción',
  manageBody:
    'Puede cambiar de plan, alternar entre facturación mensual y anual, actualizar su método de pago o pausar la entrega en cualquier momento. Los cambios se aplican al comienzo de su próximo período de facturación y usted conserva el acceso completo hasta entonces.',
  billingTitle: 'Facturación y pagos',
  billingBody:
    'Los recibos y las facturas se envían por correo electrónico después de cada cargo. Si un pago no se procesa, lo reintentamos unos días después y le avisamos para que su acceso nunca se interrumpa de forma inesperada. Para actualizar una tarjeta o corregir una dirección de facturación, inicie sesión en su cuenta.',
  accountTitle: 'Su cuenta',
  accountBody:
    'Mantenga actualizados su correo electrónico y su contraseña para asegurarse de que los boletines lleguen y de que pueda iniciar sesión desde distintos dispositivos. Desde la configuración de su cuenta usted decide qué boletines recibe y cómo nos ponemos en contacto con usted.',
  faqTitle: 'Preguntas frecuentes',
  faq: [
    '¿Cómo restablezco mi contraseña? Vaya a la página de inicio de sesión y siga el enlace de recuperación de contraseña.',
    '¿Puedo compartir mi suscripción? Cada suscripción es de uso personal en sus propios dispositivos.',
    '¿Cómo la cancelo? Puede cancelarla en cualquier momento desde su cuenta; el acceso continúa hasta que termine el período.',
    'Me cobraron algo inesperado. Escríbanos y revisaremos el cargo y lo resolveremos.',
  ],
  helpTitle: '¿Necesita más ayuda?',
  helpBefore: 'Nuestro equipo de atención estará encantado de ayudarle. Visite',
  contactLink: 'Contacto',
  helpMiddle: 'para consultar la lista completa de departamentos, o escriba directamente a',
  helpAfter: 'Procuramos responder en un plazo de un día hábil.',
};

const FR: CustomerCenterCopy = {
  title: 'Service client',
  intro:
    'Bienvenue dans le Service client. C’est ici que vous pouvez gérer votre abonnement, consulter votre facturation, mettre à jour les informations de votre compte et trouver des réponses aux questions que les lecteurs nous posent le plus souvent.',
  manageTitle: 'Gérer votre abonnement',
  manageBody:
    'Vous pouvez changer de formule, passer de la facturation mensuelle à la facturation annuelle, modifier votre moyen de paiement ou suspendre la livraison à tout moment. Les modifications prennent effet au début de votre prochaine période de facturation, et vous conservez un accès complet jusque-là.',
  billingTitle: 'Facturation et paiements',
  billingBody:
    'Les reçus et les factures sont envoyés par e-mail après chaque prélèvement. Si un paiement n’aboutit pas, nous le relançons quelques jours plus tard et nous vous prévenons afin que votre accès ne soit jamais interrompu de manière inattendue. Pour mettre à jour une carte ou corriger une adresse de facturation, connectez-vous à votre compte.',
  accountTitle: 'Votre compte',
  accountBody:
    'Gardez votre adresse e-mail et votre mot de passe à jour pour que les newsletters vous parviennent et que vous puissiez vous connecter depuis plusieurs appareils. Depuis les paramètres de votre compte, vous choisissez les newsletters que vous recevez et la manière dont nous vous contactons.',
  faqTitle: 'Questions fréquentes',
  faq: [
    'Comment réinitialiser mon mot de passe ? Rendez-vous sur la page de connexion et suivez le lien de récupération du mot de passe.',
    'Puis-je partager mon abonnement ? Chaque abonnement est à usage individuel, sur vos propres appareils.',
    'Comment résilier ? Vous pouvez résilier à tout moment depuis votre compte ; l’accès se poursuit jusqu’à la fin de la période.',
    'J’ai été débité à tort. Contactez-nous : nous examinerons le prélèvement et réglerons la situation.',
  ],
  helpTitle: 'Besoin d’aide ?',
  helpBefore: 'Notre équipe d’assistance se fera un plaisir de vous aider. Consultez la page',
  contactLink: 'Nous contacter',
  helpMiddle: 'pour la liste complète des services, ou écrivez directement à',
  helpAfter: 'Nous nous efforçons de répondre sous un jour ouvré.',
};

export const CUSTOMER_CENTER_COPY: Record<Language, CustomerCenterCopy> = {
  en: EN,
  es: ES,
  fr: FR,
};
