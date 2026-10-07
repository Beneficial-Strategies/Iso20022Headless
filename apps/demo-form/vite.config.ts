import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// xmllint-wasm starts a worker from a file next to itself: Vite must not pre-bundle it
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: { exclude: ['xmllint-wasm'] },
  server: {
    proxy: {
      // ISO's server sends no cross-origin permission, so the page cannot read its XSD files directly. While developing, the dev
      // server fetches them for the page (docs/xsd-validation.md). Not available in a built or deployed page.
      '/iso20022-xsd': {
        target: 'https://www.iso20022.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/iso20022-xsd/, '/sites/default/files/documents/messages'),
      },
    },
  },
});
