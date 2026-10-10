import { email, h2, p, route, ul, type Localized, type StaticPageContent } from './model';

const SUPPORT = 'support@globalworldjournal.com';
const CONTACT_PATH = '/contact';

export const CUSTOMER_CENTER: Localized<StaticPageContent> = {
  en: {
    title: 'Customer Center',
    blocks: [
      p(
        'Welcome to the Customer Center. This is the place to manage your subscription, review billing, update your account details, and find answers to the questions readers ask most often.',
      ),
      h2('Manage your subscription'),
      p(
        'You can change your plan, switch between monthly and annual billing, update your payment method, or pause delivery at any time. Changes take effect at the start of your next billing period, and you keep full access until then.',
      ),
      h2('Billing and payments'),
      p(
        'Receipts and invoices are issued by email after every charge. If a payment does not go through, we retry it a few days later and notify you so your access is never interrupted unexpectedly. To update a card or correct a billing address, sign in to your account.',
      ),
      h2('Your account'),
      p(
        'Keep your email address and password current to make sure newsletters arrive and that you can sign in across devices. You control which newsletters you receive and how we contact you from your account settings.',
      ),
      h2('Common questions'),
      ul(
        'How do I reset my password? Use the sign-in page and follow the password recovery link.',
        'Can I share my subscription? Each subscription is for individual use on your own devices.',
        'How do I cancel? You can cancel anytime from your account; access continues until the period ends.',
        'I was charged unexpectedly. Reach out and we will review the charge and resolve it.',
      ),
      h2('Still need help?'),
      p(
        'Our support team is glad to assist. Visit ',
        route(CONTACT_PATH, 'Contact Us'),
        ' for the full list of departments, or write directly to ',
        email(SUPPORT),
        '. We aim to respond within one business day.',
      ),
    ],
  },
  es: {
    title: 'Centro de atención',
    blocks: [
      p(
        'Te damos la bienvenida al Centro de atención. Aquí puedes gestionar tu suscripción, revisar la facturación, actualizar los datos de tu cuenta y encontrar respuestas a las preguntas más frecuentes de nuestros lectores.',
      ),
      h2('Gestiona tu suscripción'),
      p(
        'Puedes cambiar de plan, pasar de la facturación mensual a la anual o viceversa, actualizar tu método de pago o pausar la entrega en cualquier momento. Los cambios se aplican al inicio de tu siguiente periodo de facturación y, hasta entonces, conservas el acceso completo.',
      ),
      h2('Facturación y pagos'),
      p(
        'Después de cada cargo te enviamos por correo electrónico los recibos y las facturas. Si un pago no se completa, volvemos a intentarlo unos días después y te avisamos para que tu acceso nunca se interrumpa de forma inesperada. Para actualizar una tarjeta o corregir una dirección de facturación, inicia sesión en tu cuenta.',
      ),
      h2('Tu cuenta'),
      p(
        'Mantén actualizados tu dirección de correo electrónico y tu contraseña para asegurarte de que recibes los boletines y de que puedes iniciar sesión en todos tus dispositivos. Desde la configuración de tu cuenta decides qué boletines recibes y cómo nos ponemos en contacto contigo.',
      ),
      h2('Preguntas frecuentes'),
      ul(
        '¿Cómo restablezco mi contraseña? Ve a la página de inicio de sesión y sigue el enlace para recuperar la contraseña.',
        '¿Puedo compartir mi suscripción? Cada suscripción es de uso individual en tus propios dispositivos.',
        '¿Cómo cancelo mi suscripción? Puedes cancelarla cuando quieras desde tu cuenta; el acceso se mantiene hasta que termine el periodo.',
        'Me han hecho un cargo inesperado. Ponte en contacto con nosotros y revisaremos el cargo para solucionarlo.',
      ),
      h2('¿Necesitas más ayuda?'),
      p(
        'Nuestro equipo de atención estará encantado de ayudarte. Visita ',
        route(CONTACT_PATH, 'Contáctanos'),
        ' para ver la lista completa de departamentos o escribe directamente a ',
        email(SUPPORT),
        '. Nuestro objetivo es responder en un plazo de un día hábil.',
      ),
    ],
  },
  fr: {
    title: 'Centre d’assistance',
    blocks: [
      p(
        'Bienvenue dans le Centre d’assistance. C’est ici que vous pouvez gérer votre abonnement, consulter votre facturation, mettre à jour les informations de votre compte et trouver des réponses aux questions que nos lecteurs posent le plus souvent.',
      ),
      h2('Gérer votre abonnement'),
      p(
        'Vous pouvez changer de formule, passer d’une facturation mensuelle à annuelle ou inversement, mettre à jour votre moyen de paiement ou suspendre la livraison à tout moment. Les modifications prennent effet au début de votre prochaine période de facturation, et vous conservez un accès complet d’ici là.',
      ),
      h2('Facturation et paiements'),
      p(
        'Les reçus et les factures vous sont envoyés par e-mail après chaque prélèvement. Si un paiement n’aboutit pas, nous renouvelons la tentative quelques jours plus tard et vous en informons, afin que votre accès ne soit jamais interrompu de manière inattendue. Pour mettre à jour une carte ou corriger une adresse de facturation, connectez-vous à votre compte.',
      ),
      h2('Votre compte'),
      p(
        'Tenez à jour votre adresse e-mail et votre mot de passe pour être sûr de recevoir les newsletters et de pouvoir vous connecter sur tous vos appareils. Depuis les paramètres de votre compte, vous choisissez les newsletters que vous recevez et la manière dont nous vous contactons.',
      ),
      h2('Questions fréquentes'),
      ul(
        'Comment réinitialiser mon mot de passe\u00a0? Rendez-vous sur la page de connexion et suivez le lien de récupération du mot de passe.',
        'Puis-je partager mon abonnement\u00a0? Chaque abonnement est destiné à un usage individuel, sur vos propres appareils.',
        'Comment résilier\u00a0? Vous pouvez résilier à tout moment depuis votre compte\u00a0; l’accès reste actif jusqu’à la fin de la période en cours.',
        'J’ai été débité de manière inattendue. Contactez-nous\u00a0: nous examinerons le prélèvement et réglerons le problème.',
      ),
      h2('Besoin d’aide\u00a0?'),
      p(
        'Notre équipe d’assistance se fera un plaisir de vous aider. Consultez la page ',
        route(CONTACT_PATH, 'Nous contacter'),
        ' pour la liste complète des services, ou écrivez directement à ',
        email(SUPPORT),
        '. Nous nous efforçons de répondre sous un jour ouvré.',
      ),
    ],
  },
};
