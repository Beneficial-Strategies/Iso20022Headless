import { slimCatalogs } from '../../tools/i18n/src/slimCatalogs.ts';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({ plugins: [slimCatalogs(), react(), tailwindcss()] });
