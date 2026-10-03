import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Servidor de la API (server/). En desarrollo Vite le pasa /api y /assets. */
const API_URL = process.env.MAA_API_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': API_URL, '/assets': API_URL },
  },
  // Phaser pesa ~1.2 MB minificado; evita el aviso de chunk grande.
  // El JS y CSS van en /static: /assets es la carpeta de arte que sirve el servidor.
  build: { outDir: 'dist', assetsDir: 'static', chunkSizeWarningLimit: 1600 },
});
