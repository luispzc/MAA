import { buildApp } from './app';
import { createDataSource } from './data';
import { paths } from './paths';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';

const data = createDataSource(paths.data, (err) => console.error(`[datos] Se ignora el cambio: ${err.message}`));
const app = await buildApp({
  data,
  assetsDir: paths.assets,
  webDir: process.env.NODE_ENV === 'production' ? paths.web : undefined,
  logger: true,
});

await app.listen({ port, host });
