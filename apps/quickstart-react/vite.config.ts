import { slimCatalogs } from '../../tools/i18n/src/slimCatalogs.ts';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [slimCatalogs(), react()] });
