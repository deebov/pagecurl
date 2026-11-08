// Builds the packages into their dist folders: minified ESM and CommonJS bundles, plus type
// declarations. The React and React Native packages carry their own copy of the core, so they
// depend on nothing but their framework.

import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const root = join(import.meta.dir, '..');

async function bundle(name: string, entry: string, external: string[]): Promise<void> {
  const dir = join(root, 'packages', name);
  await rm(join(dir, 'dist'), { recursive: true, force: true });
  for (const format of ['esm', 'cjs'] as const) {
    const result = await Bun.build({
      entrypoints: [join(dir, entry)],
      outdir: join(dir, 'dist'),
      naming: format === 'esm' ? 'index.js' : 'index.cjs',
      format,
      target: 'browser',
      minify: true,
      sourcemap: 'linked',
      external,
      jsx: { runtime: 'automatic', development: false },
    });
    if (!result.success) {
      for (const log of result.logs) console.error(log);
      process.exit(1);
    }
  }
  await $`${join(root, 'node_modules/.bin/tsc')} -p ${join(dir, 'tsconfig.build.json')}`;
}

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

await bundle('core', 'src/index.ts', []);
await bundle('react', 'src/index.tsx', ['react', 'react/jsx-runtime']);
await bundle('react-native', 'src/index.tsx', [
  'react',
  'react/jsx-runtime',
  'react-native',
  '@shopify/react-native-skia',
]);

// Point the declarations at a bundled copy of the core's, instead of the package.
for (const name of ['react', 'react-native']) {
  const types = join(root, 'packages', name, 'dist/types');
  await cp(join(root, 'packages/core/dist/types'), join(types, 'core'), { recursive: true });
  for (const file of await files(types)) {
    if (file.startsWith(join(types, 'core'))) continue;
    const text = await readFile(file, 'utf8');
    await writeFile(file, text.replaceAll("'@pagecurl/core'", "'./core/index.js'"));
  }
}

for (const name of ['core', 'react', 'react-native']) {
  const code = await Bun.file(join(root, 'packages', name, 'dist/index.js')).bytes();
  const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
  console.log(
    `@pagecurl/${name}: ${kb(code.length)} minified, ${kb(Bun.gzipSync(code).length)} gzipped`,
  );
}
