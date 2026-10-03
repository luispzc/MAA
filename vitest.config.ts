import { defineConfig } from 'vitest/config';

// Un solo `npm test` en la raíz corre las pruebas de los tres paquetes.
export default defineConfig({
  test: {
    projects: ['shared', 'server', 'web'],
  },
});
