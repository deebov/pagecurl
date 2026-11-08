// Prints a page of the demo book into a canvas at the screen's resolution and returns where its
// words are, for the text layer.

import { CHAPTER, HEIGHT, PAGES, WIDTH } from './pages';
import { Plate, type Run } from './plate';
import { press } from './press';

export type { Run };
export { CHAPTER, HEIGHT, PAGES, WIDTH };

let fonts: Promise<unknown> | undefined;
function loadFonts(): Promise<unknown> {
  fonts ??= Promise.all(
    [
      '400 16px "EB Garamond"',
      'italic 400 16px "EB Garamond"',
      '500 16px "EB Garamond"',
      '16px "UnifrakturMaguntia"',
    ].map((f) => document.fonts.load(f, 'AaPé’')),
  ).catch(() => undefined);
  return fonts;
}

/** The paper as printed, on average. */
const PAPER = '#efe9dc';

/** The colour of a page's paper or cloth, which the curl tints the back of a turning page with. */
export function pageColor(index: number): string {
  const page = PAGES[index];
  return page?.material === 'cloth' ? (page.cloth ?? '#1c2742') : PAPER;
}

/** The colour along a page's top edge: cloth on the boards and on the endpapers' turn-ins. */
export function edgeColor(index: number): string {
  const page = PAGES[index];
  return page?.material === 'paper' ? PAPER : (page?.cloth ?? '#1c2742');
}

const plates = new Map<string, Plate>();
function plateOf(index: number, width: number, height: number): Plate {
  const key = `${index}:${width}x${height}`;
  let plate = plates.get(key);
  if (!plate) {
    plate = new Plate(width, height, width / WIDTH);
    (PAGES[index] as (typeof PAGES)[number]).draw(plate);
    plates.set(key, plate);
  }
  return plate;
}

/**
 * Prints page `index` into `canvas`, `width` × `height` pixels. `spine` is where the spine is:
 * -1 on the left, 1 on the right.
 */
export async function printPage(
  index: number,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  spine: number,
): Promise<Run[]> {
  await loadFonts();
  const page = PAGES[index] as (typeof PAGES)[number];
  const plate = plateOf(index, width, height);
  // the other side of the same leaf: pages pair up as front and back, the cover first
  const other = index % 2 === 0 ? index + 1 : index - 1;
  const back =
    page.material === 'paper' && PAGES[other]?.material === 'paper'
      ? plateOf(other, width, height).coverage()
      : null;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const options = { ...page, spine, back, seed: index * 7 + 3, units: WIDTH };
  const printer = press();
  if (printer) printer.print(plate.coverage(), ctx, options);
  else flat(ctx, plate, page);
  return plate.runs;
}

/** Without WebGL2: the inks laid flat on a plain sheet. */
function flat(ctx: CanvasRenderingContext2D, plate: Plate, page: (typeof PAGES)[number]): void {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = page.material === 'cloth' ? (page.cloth ?? '#1c2742') : '#f3ecdc';
  ctx.fillRect(0, 0, width, height);
  const inks =
    page.material === 'cloth'
      ? ['#c9a55a', null, null]
      : page.material === 'endpaper'
        ? [null, null, null]
        : [page.ink ?? '#1c1a18', page.ink2 ?? '#b2381f', null];
  const tint = document.createElement('canvas');
  tint.width = width;
  tint.height = height;
  const t = tint.getContext('2d') as CanvasRenderingContext2D;
  inks.forEach((color, i) => {
    if (!color) return;
    t.globalCompositeOperation = 'copy';
    t.drawImage((plate.layers[i] as CanvasRenderingContext2D).canvas, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = color;
    t.fillRect(0, 0, width, height);
    ctx.drawImage(tint, 0, 0);
  });
}
