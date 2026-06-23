interface KickerProps {
  children: React.ReactNode
  className?: string
}

/** Red uppercase eyebrow label that sits above a headline. */
export function Kicker({ children, className }: KickerProps) {
  return <span className={`kicker ${className ?? ''}`}>{children}</span>
}
