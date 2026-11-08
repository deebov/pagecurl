// Builds a page (the demo or the site) into one self-contained HTML file that opens straight from
// disk: `bun scripts/build-page.ts demo` writes demo/dist/index.html. A folder inside it with an
// index.html of its own (site/play) is built the same way, into dist/play/index.html. Files in the
// page's public/ folder are copied next to it as they are, and a page or folder with a prerender.tsx
// gets its HTML rendered ahead of time by it.
import { cp, exists, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const name = process.argv[2] ?? 'demo';
const root = join(import.meta.dir, '..');
const out = join(root, name, 'dist');
await rm(out, { recursive: true, force: true });

/** Builds `${dir}/index.html` into `${outDir}/index.html`, with its scripts and styles inlined. */
async function build(dir: string, outDir: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(dir, 'index.html')],
    outdir: outDir,
    minify: true,
    target: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  let html = await Bun.file(join(outDir, 'index.html')).text();
  for (const file of (await readdir(outDir)).map((f) => join(outDir, f))) {
    const base = file.slice(outDir.length + 1);
    if (base.endsWith('.js')) {
      const code = (await Bun.file(file).text()).replaceAll('</script', '<\\/script');
      html = html.replace(
        new RegExp(`<script[^>]*src="[^"]*${base}"[^>]*></script>`),
        () => `<script type="module">${code}</script>`,
      );
    } else if (base.endsWith('.css')) {
      const css = await Bun.file(file).text();
      html = html.replace(
        new RegExp(`<link[^>]*href="[^"]*${base}"[^>]*>`),
        () => `<style>${css}</style>`,
      );
    } else continue;
    await rm(file);
  }
  return html;
}

const dir = join(root, name);
let html = await build(dir, out);
const prerender = join(dir, 'prerender.tsx');
if (await exists(prerender)) html = await (await import(prerender)).default(html, out);
await Bun.write(join(out, 'index.html'), html);
console.log(`${name}/dist/index.html: ${(html.length / 1024).toFixed(0)} kB`);

for (const entry of await readdir(dir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'dist' || entry.name === 'public') continue;
  if (!(await exists(join(dir, entry.name, 'index.html')))) continue;
  const sub = join(out, entry.name);
  let page = await build(join(dir, entry.name), sub);
  const own = join(dir, entry.name, 'prerender.tsx');
  if (await exists(own)) page = await (await import(own)).default(page, sub);
  await Bun.write(join(sub, 'index.html'), page);
  console.log(`${name}/dist/${entry.name}/index.html: ${(page.length / 1024).toFixed(0)} kB`);
}

const pub = join(dir, 'public');
if (await exists(pub)) await cp(pub, out, { recursive: true });
