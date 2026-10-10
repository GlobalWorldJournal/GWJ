/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the public API (`https://api.globalworldjournal.com`). */
  readonly VITE_API_BASE_URL?: string;
  /** Origin of the media CDN (`https://cdn.globalworldjournal.com`). */
  readonly VITE_CDN_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
