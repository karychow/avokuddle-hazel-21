import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import config from './config.js';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Fills {{dotted.path}} placeholders in the HTML from config.js and exposes the
// config as window.SITE_CONFIG for the classic scripts in public/js.
function siteConfig() {
  const lookup = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), config);
  return {
    name: 'site-config',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const filled = html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, path) => {
          const v = lookup(path);
          if (v == null) throw new Error(`config.js has no "${path}"`);
          return esc(v);
        });
        const json = JSON.stringify(config).replace(/</g, '\\u003c');
        return filled.replace('<head>', `<head>\n  <script>window.SITE_CONFIG = ${json};</script>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [siteConfig()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        letters: resolve(import.meta.dirname, 'letters.html'),
      },
    },
  },
});
