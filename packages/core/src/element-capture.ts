// Experimental capture through HTML-in-Canvas (https://github.com/WICG/html-in-canvas), behind a
// flag in Chromium. A copy of the page goes inside the WebGL canvas, where the browser lays it out
// with the page's own stylesheets and fonts and paints it into a texture itself. Unlike the SVG
// snapshot, nothing is re-rendered in a separate document, so text lands on the same pixels as
// on screen.

import type { Gl } from './renderer.js';

interface DrawableCanvas extends HTMLCanvasElement {
  requestPaint(): void;
}

interface ElementGl {
  texElementSubImage2D(target: number, level: number, x: number, y: number, el: Element): void;
}

export function canDrawElements(gl: Gl): boolean {
  return 'texElementSubImage2D' in gl && 'requestPaint' in HTMLCanvasElement.prototype;
}

/** Lets the canvas lay out and paint its children. Both spellings the API has used. */
export function makeDrawable(canvas: HTMLCanvasElement): void {
  canvas.setAttribute('layoutsubtree', '');
  canvas.setAttribute('content', 'drawable');
}

/** Uploads the browser's painting of a drawable child into a new texture. */
export function elementTexture(gl: Gl, el: Element, width: number, height: number): WebGLTexture {
  const texture = gl.createTexture() as WebGLTexture;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  (gl as unknown as ElementGl).texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, el);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

/**
 * Puts a still copy of `page` in the canvas and resolves once the browser has painted it. The
 * copy stays there, out of sight and out of reach, until the caller removes it.
 */
export async function paintCopy(
  canvas: HTMLCanvasElement,
  page: HTMLElement,
  { width, height, background }: { width: number; height: number; background: string },
): Promise<HTMLElement> {
  const copy = page.cloneNode(true) as HTMLElement;
  copyState(page, copy);
  copy.setAttribute('drawable', '');
  copy.removeAttribute('aria-hidden');
  copy.inert = true;
  // Undo how the book positions and hides its pages: the copy is drawn where it's needed.
  const s = copy.style;
  s.position = 'static';
  s.left = '';
  s.top = '';
  s.margin = '0';
  s.width = `${width}px`;
  s.height = `${height}px`;
  s.boxSizing = 'border-box';
  s.opacity = '';
  s.clipPath = '';
  s.translate = '';
  s.zIndex = '';
  s.pointerEvents = 'none';
  if (isTransparent(getComputedStyle(page).backgroundColor)) s.backgroundColor = background;
  canvas.appendChild(copy);
  await Promise.all(
    Array.from(copy.querySelectorAll('img'), (img) => img.decode().catch(() => undefined)),
  );
  await nextPaint(canvas as DrawableCanvas);
  return copy;
}

function nextPaint(canvas: DrawableCanvas): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      canvas.removeEventListener('paint', done);
      resolve();
    };
    // A canvas that isn't rendered never paints. The upload then fails and the turn goes on
    // without this page, as it would if any other snapshot failed.
    const timer = setTimeout(done, 1000);
    canvas.addEventListener('paint', done);
    canvas.requestPaint();
  });
}

/** Copies what `cloneNode` leaves behind: form values and canvas pixels. */
function copyState(from: HTMLElement, to: HTMLElement): void {
  const a = from.querySelectorAll('input, textarea, select, canvas');
  const b = to.querySelectorAll('input, textarea, select, canvas');
  a.forEach((src, i) => {
    const dst = b[i];
    if (src instanceof HTMLInputElement && dst instanceof HTMLInputElement) {
      dst.value = src.value;
      dst.checked = src.checked;
    } else if (src instanceof HTMLTextAreaElement && dst instanceof HTMLTextAreaElement) {
      dst.value = src.value;
    } else if (src instanceof HTMLSelectElement && dst instanceof HTMLSelectElement) {
      dst.selectedIndex = src.selectedIndex;
    } else if (src instanceof HTMLCanvasElement && dst instanceof HTMLCanvasElement) {
      try {
        dst.getContext('2d')?.drawImage(src, 0, 0);
      } catch {
        // A WebGL canvas without a preserved buffer, or a tainted one: left blank.
      }
    }
  });
}

function isTransparent(color: string): boolean {
  return color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color);
}
