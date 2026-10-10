export function CookieNotice() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 border-b-3 border-ink pb-4">
        <h1 className="headline text-4xl text-ink">Cookie Notice</h1>
        <p className="label mt-2 text-[0.6875rem] tracking-[0.12em] text-muted">
          The Global World Journal
        </p>
      </header>
      <div className="prose-static flex flex-col gap-4 font-body text-[1.05rem] leading-relaxed text-ink">
        <p>
          Cookies are small text files that a website stores on your device. The Global World
          Journal uses cookies and similar technologies to run the site, remember your choices, and
          understand how readers use our coverage. This notice describes the cookies we use and how
          to control them.
        </p>
        <h2 className="headline text-2xl text-ink mt-4">Cookies we use</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>
            Essential cookies, which are required for the site to function, such as remembering your
            session and your privacy preferences. These cannot be switched off.
          </li>
          <li>
            Analytics cookies, which help us measure traffic and see which stories and sections
            readers value, so we can improve what we publish. These are optional.
          </li>
        </ul>
        <h2 className="headline text-2xl text-ink mt-4">Controlling cookies</h2>
        <p>
          You can accept or decline optional cookies and change your choice at any time. Most
          browsers also let you block or delete cookies through their settings, and you can usually
          choose to be warned before a cookie is stored. Blocking essential cookies may stop parts
          of the site from working as intended.
        </p>
        <p>For more on how we handle personal information, see our Privacy Notice.</p>
        <p className="label text-[0.6875rem] tracking-[0.12em] text-muted mt-4">
          Last updated: June 2026
        </p>
      </div>
    </div>
  );
}
