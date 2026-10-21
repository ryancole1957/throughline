import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  entry: [path.join(root, 'apps/server/src/index.ts')],
  outDir: path.join(root, 'apps/server/dist'),
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  bundle: true,
  skipNodeModulesBundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  noExternal: ['@throughline/shared'],
});
