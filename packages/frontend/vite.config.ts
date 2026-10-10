import { defineConfig, type Plugin, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { InlineConfig } from 'vitest/node';

const test: InlineConfig = {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test/setup.ts'],
  css: true,
};

/**
 * The fonts the first paint needs — headlines (Playfair Display) and body text
 * (PT Serif regular), Latin subset, which every edition uses. Preloaded so the
 * browser fetches them with the HTML instead of after the stylesheet.
 */
const FIRST_PAINT_FONTS = [
  /^assets\/playfair-display-latin-wght-normal-[\w-]+\.woff2$/,
  /^assets\/pt-serif-latin-400-normal-[\w-]+\.woff2$/,
];

/** Add `<link rel="preload">` for built assets matching `patterns` (names are hashed). */
function preloadAssets(patterns: readonly RegExp[]): Plugin {
  return {
    name: 'gwj-preload-assets',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        const files = Object.keys(context.bundle ?? {}).filter((file) =>
          patterns.some((pattern) => pattern.test(file)),
        );
        return files.map((file) => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: `/${file}`,
            as: 'font',
            type: 'font/woff2',
            crossorigin: '',
          },
          injectTo: 'head',
        }));
      },
    },
  };
}

const config: UserConfig & { test: InlineConfig } = {
  plugins: [react(), tailwindcss(), preloadAssets(FIRST_PAINT_FONTS)],
  build: {
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into its own long-lived chunks so a
        // change to app code doesn't bust the whole bundle's cache. react +
        // react-dom + react-router share a chunk (router depends on react); the
        // data layer and the markdown renderer (only needed on article pages)
        // are separate so they cache and load independently.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  test,
};

export default defineConfig(config);
