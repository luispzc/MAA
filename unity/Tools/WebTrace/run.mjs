// Empaqueta trace.ts con rolldown (viene con vite) y lo ejecuta.
import { build } from 'rolldown';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(tmpdir(), 'maa-web-trace.mjs');
await build({ input: join(here, 'trace.ts'), platform: 'node', output: { file: outFile, format: 'esm' }, logLevel: 'silent' });
process.argv[2] ??= 'web-trace.txt';
await import(pathToFileURL(outFile).href);
