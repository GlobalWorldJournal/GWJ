/**
 * Loading skeletons that mirror the real layout, so the page never flashes a
 * crude "Loading…" line — it shows a quiet, grey placeholder of the content.
 */

export function Bar({ className = '' }: { className?: string }) {
  return <div className={`rounded-sm bg-ink/10 ${className}`} />;
}

function HeadlineLines({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Bar key={i} className={`h-4 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

function StoryStub({ withImage = false }: { withImage?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {withImage ? <Bar className="aspect-[3/2] w-full" /> : null}
      <Bar className="h-2.5 w-16" />
      <HeadlineLines lines={2} />
    </div>
  );
}

/** Front-page skeleton: the WSJ 3-column grid in grey. */
export function HomeSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <StoryStub key={i} withImage={i === 0} />
          ))}
        </div>
        <div className="flex flex-col gap-3 lg:border-l lg:border-rule lg:pl-6">
          <Bar className="aspect-[16/9] w-full" />
          <Bar className="h-8 w-full" />
          <Bar className="h-8 w-5/6" />
          <HeadlineLines lines={2} className="mt-2" />
        </div>
        <div className="flex flex-col gap-4 lg:border-l lg:border-rule lg:pl-6">
          <Bar className="h-6 w-24" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Bar className="h-9 w-9 shrink-0 rounded-full" />
              <HeadlineLines lines={2} className="flex-1" />
            </div>
          ))}
        </div>
      </section>
      <div className="mt-12 flex flex-col gap-10">
        {Array.from({ length: 2 }).map((_, b) => (
          <div key={b}>
            <Bar className="mb-4 h-7 w-40" />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <StoryStub key={i} withImage={i === 0} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const LIST_ROWS = Array.from({ length: 6 }, (_, i) => i);
const TEXT_LINES = Array.from({ length: 10 }, (_, i) => i);

/** The section/list heading: a heavy rule under the title, like the real pages. */
function HeadingStub() {
  return (
    <div className="mb-6 border-b-3 border-ink pb-2">
      <Bar className="h-9 w-48" />
    </div>
  );
}

/**
 * Story stubs for the section, author, tag and search pages: a card grid
 * (sections) or a vertical list (the others), at the width the real page has.
 */
export function ListSkeleton({ grid = false }: { grid?: boolean }) {
  return (
    <div className="animate-pulse" aria-hidden>
      <HeadingStub />
      <div className={grid ? 'grid grid-cols-1 gap-8 sm:grid-cols-2' : 'flex flex-col gap-6'}>
        {LIST_ROWS.map((row) => (
          <StoryStub key={row} withImage={grid || row % 3 === 0} />
        ))}
      </div>
    </div>
  );
}

/** A static text page (About, Privacy, Terms…): title, then paragraphs. */
export function TextSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse" aria-hidden>
      <div className="mb-8 border-b-3 border-ink pb-4">
        <Bar className="h-10 w-64" />
        <Bar className="mt-3 h-3 w-40" />
      </div>
      <div className="flex flex-col gap-3">
        {TEXT_LINES.map((line) => (
          <Bar key={line} className={`h-4 ${line % 4 === 3 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

/** Single-article reading-column skeleton. */
export function ArticleSkeleton() {
  return (
    <div className="mx-auto max-w-[680px] animate-pulse" aria-hidden>
      <Bar className="h-3 w-20" />
      <Bar className="mt-3 h-9 w-full" />
      <Bar className="mt-2 h-9 w-4/5" />
      <Bar className="mt-4 h-4 w-48" />
      <Bar className="mt-6 aspect-[3/2] w-full" />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Bar key={i} className={`h-4 ${i % 4 === 3 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}
