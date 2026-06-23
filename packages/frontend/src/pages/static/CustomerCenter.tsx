import { LocaleLink } from '../../lib/locale'

export function CustomerCenter() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Customer Center</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">The Global World Journal</p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          Welcome to the Customer Center. This is the place to manage your subscription, review billing, update your
          account details, and find answers to the questions readers ask most often.
        </p>

        <h2 className="headline text-2xl text-ink">Manage your subscription</h2>
        <p>
          You can change your plan, switch between monthly and annual billing, update your payment method, or pause
          delivery at any time. Changes take effect at the start of your next billing period, and you keep full access
          until then.
        </p>

        <h2 className="headline text-2xl text-ink">Billing and payments</h2>
        <p>
          Receipts and invoices are issued by email after every charge. If a payment does not go through, we retry it a
          few days later and notify you so your access is never interrupted unexpectedly. To update a card or correct a
          billing address, sign in to your account.
        </p>

        <h2 className="headline text-2xl text-ink">Your account</h2>
        <p>
          Keep your email address and password current to make sure newsletters arrive and that you can sign in across
          devices. You control which newsletters you receive and how we contact you from your account settings.
        </p>

        <h2 className="headline text-2xl text-ink">Common questions</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>How do I reset my password? Use the sign-in page and follow the password recovery link.</li>
          <li>Can I share my subscription? Each subscription is for individual use on your own devices.</li>
          <li>How do I cancel? You can cancel anytime from your account; access continues until the period ends.</li>
          <li>I was charged unexpectedly. Reach out and we will review the charge and resolve it.</li>
        </ul>

        <h2 className="headline text-2xl text-ink">Still need help?</h2>
        <p>
          Our support team is glad to assist. Visit <LocaleLink to="/contact" className="text-accent hover:underline">Contact Us</LocaleLink>{' '}
          for the full list of departments, or write directly to{' '}
          <a href="mailto:support@globalworldjournal.com" className="text-accent hover:underline">
            support@globalworldjournal.com
          </a>
          . We aim to respond within one business day.
        </p>
      </div>
    </div>
  )
}
