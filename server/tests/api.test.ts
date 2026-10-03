import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { GameData, HeroDetail } from '@maa/shared';
import { buildApp } from '../src/app';
import { loadValidGameData } from '../src/data';
import { paths } from '../src/paths';

const data = loadValidGameData(paths.data);
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ data: () => data, assetsDir: paths.assets });
});
afterAll(() => app.close());

describe('API', () => {
  it('GET /api/game-data devuelve todos los datos', async () => {
    const res = await app.inject('/api/game-data');
    expect(res.statusCode).toBe(200);
    const body = res.json<GameData>();
    expect(body.heroes.length).toBe(data.heroes.length);
    expect(body.abilities.length).toBe(data.abilities.length);
    expect(body.statuses.length).toBe(data.statuses.length);
    expect(body.classes.classes.length).toBe(6);
  });

  it('GET /api/heroes/:id trae las habilidades resueltas', async () => {
    const res = await app.inject('/api/heroes/thor');
    expect(res.statusCode).toBe(200);
    const hero = res.json<HeroDetail>();
    expect(hero.name).toBe('Thor');
    expect(hero.abilities.map((a) => a.id)).toEqual(hero.abilityIds);
  });

  it('un héroe que no existe da 404 con mensaje', async () => {
    const res = await app.inject('/api/heroes/nadie');
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain('nadie');
  });

  it('GET /api/abilities filtra por héroe', async () => {
    const res = await app.inject('/api/abilities?heroId=hulk');
    const { abilities } = res.json<{ abilities: { heroId: string }[] }>();
    expect(abilities.length).toBe(4);
    expect(abilities.every((a) => a.heroId === 'hulk')).toBe(true);
  });

  it('sirve el arte en /assets', async () => {
    const res = await app.inject(`/assets/${data.heroes[0].art!.figure}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
  });

  it('una ruta de la API que no existe da 404', async () => {
    expect((await app.inject('/api/nada')).statusCode).toBe(404);
  });
});

describe('fuente de datos', () => {
  it('recarga al editar un JSON y conserva la última versión buena si se rompe', async () => {
    const { cpSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createDataSource } = await import('../src/data');
    const dir = mkdtempSync(join(tmpdir(), 'maa-data-'));
    cpSync(paths.data, dir, { recursive: true });
    const errors: Error[] = [];
    const source = createDataSource(dir, (e) => errors.push(e));
    const file = join(dir, 'heroes.json');
    const touch = (content: string, t: number) => {
      writeFileSync(file, content);
      utimesSync(file, t, t);
    };

    const heroes = JSON.parse(readFileSync(file, 'utf8'));
    heroes.heroes[0].name = 'Hulk Gris';
    touch(JSON.stringify(heroes), Date.now() / 1000 + 10);
    expect(source().heroes[0].name).toBe('Hulk Gris');

    touch('{ roto', Date.now() / 1000 + 20);
    expect(source().heroes[0].name).toBe('Hulk Gris');
    expect(errors.length).toBe(1);
  });
});
