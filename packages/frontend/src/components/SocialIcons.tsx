/**
 * Brand glyphs for the paper's social profiles, drawn with `currentColor` so
 * they follow the surrounding link colour. Decorative: the link carrying each
 * icon provides the accessible name.
 */
interface IconProps {
  className?: string;
}

/** Telegram's paper plane in a circle. */
export function TelegramIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

/** Mention's stylized "M" mark (the glyph the Mention app itself uses). */
export function MentionIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 67.65 74.16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M60.31,69.05c-.38,1.28-.28,3.27,1.23,4.4,1.25,.94,2.94,.89,4.15,.2,2.17-1.23,1.95-4.01,1.93-4.2-.12-1.2-.79-3.05-2.38-3.57-1.99-.65-4.32,1.12-4.93,3.17Zm-25.68-15.26c-.55-2.36,.03-3.77,.36-5.19,1.9-8.07,3.99-16.1,5.7-24.21,1.3-6.17,3.27-12.26,2.95-18.69-.1-2.04-.31-4.09-2.44-5.07-2.19-1.02-4.42-.79-6.38,.64-.89,.65-1.74,1.46-2.35,2.37-3.65,5.43-7.57,10.72-10.77,16.4C13.26,35.01,6.84,50.89,.74,66.91c-1.42,3.74-.85,5.88,2.18,6.94,2.72,.95,5.21-.38,6.16-3.74,4.57-16.2,11.72-31.29,19.67-46.06,1.02-1.9,1.97-3.83,4.61-5.66-.42,2.24-.67,3.66-.96,5.07-2.65,12.88-6.49,25.49-8.48,38.52-.52,3.43,.15,6.29,3.47,7.82,3.48,1.6,6.02-.21,8.02-2.9,3.7-4.96,7.34-9.96,10.96-14.98,2.77-3.84,5.71-7.53,9.2-10.75,.78-.72,1.54-2.01,2.77-1.45,1.12,.51,1.02,1.92,1.04,3.01,.09,4.71,.06,9.43,.18,14.14,.06,2.24,.12,4.9,3.14,5.09,3.03,.19,3.79-2.12,4.17-4.69,.89-6.05,.87-12.13,.6-18.2-.3-6.7-4.95-9.74-11.34-7.69-5.82,1.87-9.12,6.72-12.82,11.01-2.97,3.45-5.54,7.24-8.69,11.4Z" />
    </svg>
  );
}

/** X's mark. */
export function XIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** LinkedIn's "in" mark. */
export function LinkedInIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.556V9h3.563zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />
    </svg>
  );
}

/** A plain envelope. */
export function EmailIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="2.5" y="4.5" width="19" height="15" rx="1.5" />
      <path d="m3 6 9 7 9-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Generic "share" glyph (an arrow breaking out of a box) for the device's own share sheet. */
export function ShareIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="M12 16V4m0 0 4 4m-4-4-4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
