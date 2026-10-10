export function PrivacyNotice() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Privacy Notice</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          This notice explains what information The Global World Journal collects when you use our
          website, how we use it, and the choices you have. We aim to collect only what we need and
          to be clear about why.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Information we collect</h2>
        <p>
          We collect information you give us directly, such as the email address you provide when
          you contact us or sign up for a newsletter. We also automatically collect limited
          technical information when you visit, including your device type, browser, approximate
          location derived from your IP address, and the pages you view.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Cookies and analytics</h2>
        <p>
          We use cookies and similar technologies to keep the site working, remember your
          preferences, and understand how the site is used. We use privacy-conscious analytics to
          measure traffic and improve our coverage. You can control cookies through your browser
          settings, and our Cookie Notice explains the categories in more detail.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Third parties</h2>
        <p>
          We work with a small number of service providers, such as hosting, analytics, and email
          delivery vendors, who process information on our behalf and only under our instructions.
          We do not sell your personal information. We may disclose information where required by
          law or to protect the rights and safety of our readers and our organization.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Your rights</h2>
        <p>
          Depending on where you live, you may have the right to access the personal information we
          hold about you, to correct it, or to ask us to delete it. To make a request, or to ask a
          question about this notice, contact us at{' '}
          <a className="text-accent hover:underline" href="mailto:privacy@globalworldjournal.com">
            privacy@globalworldjournal.com
          </a>
          . We will respond within the time required by applicable law.
        </p>
        <p className="label text-[0.6875rem] tracking-[0.12em] text-muted mt-4">
          Last updated: June 2026
        </p>
      </div>
    </div>
  );
}
