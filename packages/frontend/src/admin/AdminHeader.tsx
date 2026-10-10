import { Link } from 'react-router-dom';

/** The heading of a secondary admin page, with the way back to the dashboard. */
export function AdminHeader({ title }: { title: string }) {
  return (
    <header className="mb-8 flex items-center justify-between border-b-3 border-ink pb-4">
      <div>
        <p className="kicker">Newsroom</p>
        <h1 className="headline text-3xl text-ink">{title}</h1>
      </div>
      <Link
        to="/admin"
        className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
      >
        ← Dashboard
      </Link>
    </header>
  );
}
