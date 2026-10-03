import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  // Phaser pesa ~1.2 MB minificado; evita el aviso de chunk grande.
  build: { outDir: 'dist', assetsDir: 'assets', chunkSizeWarningLimit: 1600 },
});
