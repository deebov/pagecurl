import { createPageCurl, type PageCurl } from '@pagecurl/core';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs' with { type: 'file' };
import sampleUrl from './field-guide.pdf' with { type: 'file' };

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const book = $<HTMLDivElement>('book');
const stage = book.parentElement as HTMLElement;
const status = $('status');
const prev = $<HTMLButtonElement>('prev');
const next = $<HTMLButtonElement>('next');

let curl: PageCurl | null = null;
let doc: pdfjs.PDFDocumentProxy | null = null;
let aspect = 1; // width / height of one page
let isSpread = false;
const renders = new Map<number, Promise<HTMLCanvasElement>>();

/** Renders page `i` into its canvas at the book's current size, once per size. */
function render(i: number): Promise<HTMLCanvasElement> | undefined {
  if (!doc || i < 0 || i >= doc.numPages) return;
  const page = book.children[i] as HTMLElement;
  const cached = renders.get(i);
  if (cached) return cached;
  const canvas = page.querySelector('canvas') as HTMLCanvasElement;
  const task = doc.getPage(i + 1).then(async (p) => {
    const cssScale = page.clientWidth / p.getViewport({ scale: 1 }).width;
    const viewport = p.getViewport({ scale: cssScale * devicePixelRatio });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    void renderText(p, page, cssScale);
    await p.render({ canvas, viewport }).promise;
    return canvas;
  });
  renders.set(i, task);
  return task;
}

/** Invisible, selectable text laid over the canvas, the way pdf.js's own viewer does it. */
async function renderText(p: pdfjs.PDFPageProxy, page: HTMLElement, scale: number) {
  const layer = document.createElement('div');
  layer.className = 'textLayer';
  page.style.setProperty('--total-scale-factor', String(scale));
  await new pdfjs.TextLayer({
    textContentSource: p.streamTextContent(),
    container: layer,
    viewport: p.getViewport({ scale }),
  }).render();
  page.querySelector('.textLayer')?.remove();
  page.append(layer);
}

function renderAround(page: number) {
  for (let i = page - 2; i <= page + 3; i++) void render(i);
}

/** Fits the book into the stage, one page or a spread depending on the room. */
function size() {
  const room = stage.getBoundingClientRect();
  const h = room.height - 48;
  const spread = (room.width - 48) / h > aspect * 1.6;
  const pageWidth = Math.min(h * aspect, (room.width - 48) / (spread ? 2 : 1));
  book.style.width = `${Math.floor(pageWidth * (spread ? 2 : 1))}px`;
  book.style.height = `${Math.floor(pageWidth / aspect)}px`;
  return spread;
}

function update(page: number) {
  if (!curl || !doc) return;
  const last = Math.min(page + (isSpread ? 1 : 0), doc.numPages - 1);
  status.textContent = `${page + 1}${last > page ? `–${last + 1}` : ''} of ${doc.numPages}`;
  prev.disabled = !curl.canTurn('prev');
  next.disabled = !curl.canTurn('next');
}

async function open(source: string | ArrayBuffer, name: string) {
  curl?.destroy();
  renders.clear();
  doc = await pdfjs.getDocument(typeof source === 'string' ? { url: source } : { data: source })
    .promise;
  const first = (await doc.getPage(1)).getViewport({ scale: 1 });
  aspect = first.width / first.height;
  $('title').textContent = name;

  // One element per page, each holding a canvas that pdf.js draws into when it's needed.
  book.replaceChildren(
    ...Array.from({ length: doc.numPages }, () => {
      const page = document.createElement('div');
      page.append(document.createElement('canvas'));
      return page;
    }),
  );
  isSpread = size();
  curl = createPageCurl(book, {
    spread: isSpread,
    // The page is already a canvas, so hand it over instead of snapshotting the DOM.
    // Turns wait for this, so a page that isn't rendered yet still curls with its content.
    snapshot: (page) =>
      render([...book.children].indexOf(page)) ??
      (page.querySelector('canvas') as HTMLCanvasElement),
    onPageChange: (page) => {
      renderAround(page);
      update(page);
    },
  });
  renderAround(curl.page);
  update(curl.page);
}

new ResizeObserver(() => {
  if (!curl) return;
  const spread = size();
  renders.clear();
  if (spread !== isSpread) {
    isSpread = spread;
    curl.setOptions({ spread });
  }
  // The canvases were drawn for the old size.
  curl.refresh();
  renderAround(curl.page);
  update(curl.page);
}).observe(stage);

prev.onclick = () => curl?.prev();
next.onclick = () => curl?.next();
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') void curl?.next();
  if (e.key === 'ArrowLeft') void curl?.prev();
});
$<HTMLInputElement>('file').onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await open(await file.arrayBuffer(), file.name);
};

void open(sampleUrl, 'Trees of the Northern Ridge (sample)');
