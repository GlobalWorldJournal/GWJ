import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts (bundled & fingerprinted by Vite, served from /assets/* with
// the immutable cache header). Only the weights/styles the design actually uses
// are imported: the headline/label variable families carry the full 400–900
// weight axis in one file (normal axis only — no italic is used for them), and
// the body serif ships 400/700 plus italics (used for pull quotes & emphasis).
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/libre-franklin/wght.css';
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-serif/400-italic.css';
import '@fontsource/pt-serif/700-italic.css';
import { App } from './App';
import { queryClient } from './lib/queryClient';
import { readServerArticle } from './lib/serverData';
import { installStaleReleaseRecovery } from './lib/staleRelease';
import './index.css';

// An article page arrives with the article already in it (see serverData): seed
// the query the article page uses, so it renders immediately with no refetch.
const serverArticle = readServerArticle(document);
if (serverArticle) {
  queryClient.setQueryData(['article', serverArticle.slug], serverArticle);
}

// A tab left open across a deploy reloads onto the new release instead of
// failing to load the next page's code.
installStaleReleaseRecovery();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
