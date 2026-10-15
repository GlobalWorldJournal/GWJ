import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { ArticleSkeleton } from './Skeletons';
import { SiteRail } from './SiteRail';

interface PageWithRailProps {
  children: ReactNode;
  /** Leaves this story out of the rail's Most Popular ranking. */
  exclude?: string;
  /** A band under both columns, full width (e.g. "More in {category}"). */
  bottom?: ReactNode;
}

/** The reader layout: the page in the main column, the shared rail on its right. */
export function PageWithRail({ children, exclude, bottom }: PageWithRailProps) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
      <div className="min-w-0">{children}</div>
      <SiteRail exclude={exclude} />
      {bottom}
    </div>
  );
}

/**
 * Layout route for the pages that share the rail. The rail belongs to the layout,
 * not to each page, so it stays put while a page's content loads or changes.
 */
export function RailLayout() {
  return (
    <PageWithRail>
      <Outlet />
    </PageWithRail>
  );
}

/** A story loading: its skeleton already sits beside the real rail. */
export function ArticleLoading() {
  return (
    <PageWithRail>
      <ArticleSkeleton />
    </PageWithRail>
  );
}
