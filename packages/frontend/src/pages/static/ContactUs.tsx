export function ContactUs() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Contact Us</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          We want to hear from you. Whether you have a story tip, a question about your account, or
          an advertising inquiry, reach the right team below and we will get back to you as quickly
          as we can.
        </p>

        <h2 className="headline text-2xl text-ink">Newsroom</h2>
        <p>
          Story ideas, corrections, and feedback on our coverage go to our editors. We read every
          message, though we cannot respond to all of them individually.
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            Email:{' '}
            <a href="mailto:news@globalworldjournal.com" className="text-accent hover:underline">
              news@globalworldjournal.com
            </a>
          </li>
        </ul>

        <h2 className="headline text-2xl text-ink">General and subscriber support</h2>
        <p>
          Questions about your subscription, billing, delivery, or account settings are handled by
          our support team.
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            Email:{' '}
            <a href="mailto:support@globalworldjournal.com" className="text-accent hover:underline">
              support@globalworldjournal.com
            </a>
          </li>
        </ul>

        <h2 className="headline text-2xl text-ink">Advertising and partnerships</h2>
        <p>
          For media kits, sponsorship opportunities, and partnership proposals, contact our
          commercial team.
        </p>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            Email:{' '}
            <a
              href="mailto:advertising@globalworldjournal.com"
              className="text-accent hover:underline"
            >
              advertising@globalworldjournal.com
            </a>
          </li>
        </ul>

        <h2 className="headline text-2xl text-ink">Confidential tips and secure contact</h2>
        <p>
          If you have sensitive information for our reporters, write to{' '}
          <a href="mailto:news@globalworldjournal.com" className="text-accent hover:underline">
            news@globalworldjournal.com
          </a>{' '}
          and note that the matter is confidential. For especially sensitive material, ask us to
          arrange a secure, encrypted channel before you send anything, and avoid including
          identifying details in your first message.
        </p>
      </div>
    </div>
  );
}
