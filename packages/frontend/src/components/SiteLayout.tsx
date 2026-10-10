import { Outlet } from 'react-router-dom';
import { Masthead } from './Masthead';
import { SectionNav } from './SectionNav';
import { Footer } from './Footer';

/** Public reader shell: masthead + section nav + routed page + footer. */
export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Masthead />
      <SectionNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
