import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { ApiError, GameData, HeroDetail } from '@maa/shared';

export interface AppOptions {
  /** Devuelve los datos vigentes (ver createDataSource). */
  data: () => GameData;
  /** Carpeta del arte, servida en /assets. */
  assetsDir: string;
  /** Build de la web; si existe, se sirve en / (producción). */
  webDir?: string;
  logger?: boolean;
}

/** Crea el servidor con todas las rutas, sin ponerlo a escuchar (las pruebas usan app.inject). */
export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const notFound = (message: string): ApiError => ({ error: message });

  app.get('/api/health', async () => ({ ok: true }));

  // Todo junto: es lo que pide la web al arrancar.
  app.get('/api/game-data', async (): Promise<GameData> => opts.data());

  app.get('/api/classes', async () => opts.data().classes);

  app.get('/api/heroes', async () => ({ heroes: opts.data().heroes }));

  app.get<{ Params: { id: string } }>('/api/heroes/:id', async (req, reply) => {
    const data = opts.data();
    const hero = data.heroes.find((h) => h.id === req.params.id);
    if (!hero) return reply.code(404).send(notFound(`No existe el héroe ${req.params.id}`));
    const abilityById = new Map(data.abilities.map((a) => [a.id, a]));
    const detail: HeroDetail = { ...hero, abilities: hero.abilityIds.flatMap((id) => abilityById.get(id) ?? []) };
    return detail;
  });

  app.get<{ Querystring: { heroId?: string } }>('/api/abilities', async (req) => {
    const { abilities } = opts.data();
    const { heroId } = req.query;
    return { abilities: heroId ? abilities.filter((a) => a.heroId === heroId) : abilities };
  });

  app.get('/api/statuses', async () => ({ statuses: opts.data().statuses }));

  app.register(fastifyStatic, { root: opts.assetsDir, prefix: '/assets/' });

  const webDir = opts.webDir && existsSync(opts.webDir) ? opts.webDir : null;
  if (webDir) {
    app.register(fastifyStatic, { root: webDir, prefix: '/', decorateReply: false, wildcard: false });
  }

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/assets/') || !webDir) {
      return reply.code(404).send(notFound(`No existe ${req.method} ${req.url}`));
    }
    // La web es una sola página: cualquier otra ruta devuelve index.html.
    return reply.sendFile('index.html', webDir);
  });

  return app;
}
