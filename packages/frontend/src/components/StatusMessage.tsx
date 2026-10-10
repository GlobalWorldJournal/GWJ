interface StatusMessageProps {
  title: string;
  detail?: string;
}

/** Centered message block for loading / empty / error states. */
export function StatusMessage({ title, detail }: StatusMessageProps) {
  return (
    <div className="py-20 text-center" role="status" aria-live="polite">
      <p className="headline text-2xl text-ink">{title}</p>
      {detail ? <p className="mt-2 text-muted">{detail}</p> : null}
    </div>
  );
}
