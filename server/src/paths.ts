import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

/** Carpetas que sirve el servidor. Se pueden cambiar con variables de entorno. */
export const paths = {
  /** JSON del juego (clases, héroes, habilidades, efectos). */
  data: process.env.MAA_DATA_DIR ?? resolve(root, 'data'),
  /** Sprites y demás arte del juego original. */
  assets: process.env.MAA_ASSETS_DIR ?? resolve(root, 'assets'),
  /** Build de la web (`npm run build`); en producción el servidor la sirve también. */
  web: process.env.MAA_WEB_DIR ?? resolve(root, 'web/dist'),
};
