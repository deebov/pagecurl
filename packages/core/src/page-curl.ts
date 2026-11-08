import { Easing, Tween } from './animation.js';
import { canDrawElements, elementTexture, makeDrawable, paintCopy } from './element-capture.js';
import {
  CurlDriver,
  type CurlInputs,
  type Direction,
  Kind,
  type Point,
  type Rect,
  Spine,
  type TurnState,
} from './geometry/drive.js';
import { buildCurlMesh, type CurlColors, type CurlMesh, type Rgba } from './geometry/mesh.js';
import { Renderer } from './renderer.js';
import { type Snapshotter, snapshot } from './snapshot.js';

export type TurnDirection = 'next' | 'prev';

export interface TurnEvent {
  /** Page shown before the turn (the first page of the spread in spread mode). */
  from: number;
  /** Page shown if the turn completes. */
  to: number;
  direction: TurnDirection;
  /** Started by a drag rather than a tap or an API call. */
  interactive: boolean;
}

export interface TurnEndEvent extends TurnEvent {
  /** False when a drag was released back onto the page it started from. */
  completed: boolean;
}

export interface PageCurlOptions {
  /** Initial page. In spread mode, rounded down to the first page of its spread. */
  page?: number;
  /** Show two pages side by side. */
  spread?: boolean;
  /** Reading direction. `rtl` binds pages on the right and turns them left to right. */
  direction?: 'ltr' | 'rtl';
  /** Paper colour, used to tint the back of a page and its shadows. Defaults to each page's background. */
  pageColor?: string;
  /** Seconds for a turn started by a tap or the API. */
  turnDuration?: number;
  /** Seconds for a drag to catch up with the pointer, and to settle after release. */
  dragDuration?: number;
  /** Turn pages by dragging. */
  drag?: boolean;
  /** Turn pages by tapping near the left or right edge. */
  tap?: boolean;
  /** Width of the tap zones in CSS pixels. Defaults to 110 (82 per page in spread mode). */
  tapZone?: number;
  /**
   * Width, in CSS pixels, of the strips along the book's left and right edges where a mouse drag
   * always turns the page, even when it starts on text. Elsewhere it selects the text. Defaults
   * to 32.
   */
  grabZone?: number;
  /** Elements matching this selector never start a drag or tap. */
  ignore?: string;
  /** CSS pixels around the element the curl may draw into (the page can lift past its edges). */
  overflow?: number;
  /** Device pixels per CSS pixel. Defaults to `devicePixelRatio`. */
  pixelRatio?: number;
  /** Replaces the built-in DOM snapshot, e.g. to use a page's own canvas. */
  snapshot?: Snapshotter;
  /**
   * During a turn, keep the part of the page that hasn't started to bend as the live page and
   * draw only the bending part from its snapshot, so text that isn't moving can't shift.
   */
  liveFlat?: boolean;
  /**
   * Experimental. Where the browser supports HTML-in-Canvas, the browser paints pages for the
   * curl itself, so text doesn't shift when a turn starts. Ignored with a custom `snapshot`.
   */
  htmlInCanvas?: boolean;
  onPageChange?: (page: number) => void;
  onTurnStart?: (event: TurnEvent) => void;
  onTurnEnd?: (event: TurnEndEvent) => void;
}

export interface PageCurl {
  readonly element: HTMLElement;
  /** Current page (the first page of the spread in spread mode). */
  readonly page: number;
  readonly pageCount: number;
  /** A turn is animating or being dragged. */
  readonly turning: boolean;
  /** Animates a turn. Resolves when it finishes; false if there was no page to turn to. */
  turn(direction: TurnDirection): Promise<boolean>;
  next(): Promise<boolean>;
  prev(): Promise<boolean>;
  /** Shows a page immediately, cancelling any turn in progress. */
  goTo(page: number): void;
  canTurn(direction: TurnDirection): boolean;
  /**
   * Starts a drag at (x, y) in the element's CSS pixels, as if a pointer pressed there. Without a
   * direction, a drag on the right half turns towards the next page in `ltr`. Returns false if
   * there is no page to turn to or a drag is already active.
   */
  dragStart(x: number, y: number, direction?: TurnDirection): boolean;
  dragMove(x: number, y: number): void;
  /**
   * Releases the drag. It completes when `complete` is true, or by default when it is released
   * past the middle of the element.
   */
  dragEnd(options?: { complete?: boolean; velocity?: number }): void;
  setOptions(options: PageCurlOptions): void;
  /** Re-reads the pages and discards cached snapshots. */
  refresh(): void;
  destroy(): void;
}

const DEFAULTS = {
  spread: false,
  direction: 'ltr',
  turnDuration: 0.25,
  dragDuration: 0.2,
  drag: true,
  tap: true,
  ignore:
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-pagecurl-ignore]',
} as const;

const INTERACTIVE =
  'a[href], button, input, select, textarea, label, summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="link"]';
const DRAG_THRESHOLD = 8;
const FLICK_VELOCITY = 300;
const VELOCITY_WINDOW = 100;
const TAP_ZONE = 110;
const TAP_ZONE_SPREAD = 82;
const GRAB_ZONE = 32;
const KEYS = ['time', 'radius', 'angle'] as const;
const OWN_ATTRIBUTES = new Set(['style', 'inert', 'aria-hidden']);

interface Layer {
  page: number;
  front: boolean;
  back: boolean;
  flip: boolean;
  colors: CurlColors;
  model: CurlInputs;
  tweens: Partial<Record<keyof CurlInputs, Tween>>;
}

interface Turn {
  state: TurnState;
  animated: boolean;
  forward: boolean;
  from: number;
  to: number;
  frontPage: number;
  frame: Rect;
  front: Layer;
  back: Layer | null;
  ended: boolean;
  completed: boolean;
  finishAt: number | null;
  resolve: ((completed: boolean) => void) | null;
}

interface Drag {
  direction: Direction;
  start: Point;
  last: Point;
  turn: Turn | null;
  ended: boolean;
  complete: boolean;
}

interface Pointer {
  id: number;
  start: Point;
  last: Point;
  target: EventTarget | null;
  samples: { t: number; x: number; y: number }[];
  began: boolean;
  dragging: boolean;
  /** A mouse press on selectable text: dragging selects the text instead of turning. */
  selecting: boolean;
}

interface Snap {
  source: TexImageSource | null;
  /** With `htmlInCanvas`: the painted copy of the page inside the canvas, used instead. */
  copy: HTMLElement | null;
  texture: WebGLTexture | null;
  /** Size the snapshot was taken at. */
  size: string;
  /** Mutation counter of the page, and its value when the snapshot was taken. */
  stamp: number;
  taken: number;
  pending: Promise<void> | null;
}

const now = () => performance.now() / 1000;

/** Makes the element's children turnable pages. */
export function createPageCurl(element: HTMLElement, options: PageCurlOptions = {}): PageCurl {
  return new PageCurlController(element, options);
}

class PageCurlController implements PageCurl {
  #opts: PageCurlOptions;
  #index = 0;
  #pages: HTMLElement[] = [];
  #width = 0;
  #height = 0;
  #pixelRatio = 1;
  #bleed = 0;
  /** Sub-pixel nudge that puts the pages on whole pixels, where snapshots line up with them. */
  #nudge: Point = [0, 0];
  #driver: CurlDriver = new CurlDriver(Spine.Left, [0, 0, 1, 1]);
  readonly #canvas: HTMLCanvasElement;
  #renderer: Renderer | null = null;
  #turns: Turn[] = [];
  #drag: Drag | null = null;
  #pointer: Pointer | null = null;
  #suppressClick = false;
  #raf = 0;
  #idle = 0;
  #queue: Promise<void> = Promise.resolve();
  readonly #snaps = new Map<HTMLElement, Snap>();
  readonly #savedStyles = new Map<HTMLElement, string | null>();
  /** How each page is shown: 'on', 'off', or the clip-path of its flat part mid-turn. */
  readonly #shown = new Map<HTMLElement, string>();
  readonly #resizeObserver: ResizeObserver;
  readonly #mutationObserver: MutationObserver;
  readonly #documentObserver: MutationObserver;
  readonly #darkMode: MediaQueryList;
  #ownStyle: string | null = null;
  #savedSelect: [string, string] | null = null;
  readonly #containerStyle: string | null;
  #destroyed = false;
  #noWebGL = false;

  constructor(
    readonly element: HTMLElement,
    options: PageCurlOptions,
  ) {
    this.#opts = { ...options };
    this.#containerStyle = element.getAttribute('style');
    if (getComputedStyle(element).position === 'static') {
      this.#styleContainer({ position: 'relative' });
    }
    this.#canvas = document.createElement('canvas');
    this.#canvas.setAttribute('aria-hidden', 'true');
    this.#canvas.dataset.pagecurlCanvas = '';
    this.#canvas.style.cssText = 'position:absolute;display:none;pointer-events:none;z-index:3';
    element.appendChild(this.#canvas);
    this.#readPages();
    this.#index = this.#clampPage(options.page ?? 0);
    this.#layout();

    element.addEventListener('pointerdown', this.#onPointerDown);
    element.addEventListener('pointermove', this.#onPointerMove);
    element.addEventListener('pointerup', this.#onPointerUp);
    element.addEventListener('pointercancel', this.#onPointerCancel);
    element.addEventListener('touchmove', this.#onTouchMove, { passive: false });
    element.addEventListener('click', this.#onClick, true);
    element.addEventListener('dragstart', this.#onDragStart);
    element.addEventListener('input', this.#onEdit, true);
    element.addEventListener('change', this.#onEdit, true);
    this.#resizeObserver = new ResizeObserver(() => this.#onResize());
    this.#resizeObserver.observe(element);
    // The book can also move without resizing when the content around it changes.
    this.#resizeObserver.observe(document.documentElement);
    // Themes usually live outside the pages: a class on an ancestor, a stylesheet swap or the
    // system's dark mode. Any of those makes the cached snapshots stale.
    this.#documentObserver = new MutationObserver(this.#onDocumentMutations);
    this.#documentObserver.observe(document.documentElement, { attributes: true, subtree: true });
    this.#documentObserver.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.#darkMode = window.matchMedia('(prefers-color-scheme: dark)');
    this.#darkMode.addEventListener('change', this.#onThemeChange);
    this.#mutationObserver = new MutationObserver(this.#onMutations);
    this.#mutationObserver.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    this.#prewarm();
  }

  // Public API

  get page(): number {
    return this.#index;
  }

  get pageCount(): number {
    return this.#pages.length;
  }

  get turning(): boolean {
    return this.#turns.length > 0 || this.#drag !== null;
  }

  canTurn(direction: TurnDirection): boolean {
    return this.#canGo(direction === 'next');
  }

  next(): Promise<boolean> {
    return this.turn('next');
  }

  prev(): Promise<boolean> {
    return this.turn('prev');
  }

  turn(direction: TurnDirection): Promise<boolean> {
    return this.#animate(this.#toGeometric(direction === 'next'));
  }

  goTo(page: number): void {
    this.#settleAll();
    this.#setIndex(this.#clampPage(page));
    this.#render();
    this.#prewarm();
  }

  dragStart(x: number, y: number, direction?: TurnDirection): boolean {
    const dir = direction ? this.#toGeometric(direction === 'next') : x > this.#width / 2 ? 0 : 1;
    return this.#beginDrag([x, y], dir);
  }

  dragMove(x: number, y: number): void {
    this.#moveDrag([x, y]);
  }

  dragEnd(options: { complete?: boolean; velocity?: number } = {}): void {
    const drag = this.#drag;
    if (!drag) return;
    const complete =
      options.complete ?? (drag.last[0] > this.#width / 2 ? 1 : 0) === drag.direction;
    this.#endDrag(complete, options.velocity ?? 0);
  }

  setOptions(options: PageCurlOptions): void {
    const before = this.#opts;
    this.#opts = { ...before, ...options };
    const relayout =
      (this.#opts.spread ?? false) !== (before.spread ?? false) ||
      (this.#opts.direction ?? 'ltr') !== (before.direction ?? 'ltr') ||
      this.#opts.pixelRatio !== before.pixelRatio ||
      this.#opts.overflow !== before.overflow;
    if (relayout) {
      this.#settleAll();
      this.#setIndex(this.#clampPage(this.#index));
      this.#layout();
      this.#render();
    }
    if (this.#opts.htmlInCanvas !== before.htmlInCanvas) {
      for (const page of [...this.#snaps.keys()]) this.#dropSnap(page);
      this.#render();
    }
    if (this.#opts.snapshot !== before.snapshot || this.#opts.pageColor !== before.pageColor) {
      this.#invalidate();
    }
    if (relayout) this.#prewarm();
  }

  refresh(): void {
    this.#readPages();
    this.#invalidate();
    this.#setIndex(this.#clampPage(this.#index));
    this.#layout();
    this.#render();
    this.#prewarm();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#settleAll();
    this.#releaseSelection();
    this.#destroyed = true;
    cancelAnimationFrame(this.#raf);
    this.#cancelIdle();
    const el = this.element;
    el.removeEventListener('pointerdown', this.#onPointerDown);
    el.removeEventListener('pointermove', this.#onPointerMove);
    el.removeEventListener('pointerup', this.#onPointerUp);
    el.removeEventListener('pointercancel', this.#onPointerCancel);
    el.removeEventListener('touchmove', this.#onTouchMove);
    el.removeEventListener('click', this.#onClick, true);
    el.removeEventListener('dragstart', this.#onDragStart);
    el.removeEventListener('input', this.#onEdit, true);
    el.removeEventListener('change', this.#onEdit, true);
    this.#resizeObserver.disconnect();
    this.#mutationObserver.disconnect();
    this.#documentObserver.disconnect();
    this.#darkMode.removeEventListener('change', this.#onThemeChange);
    for (const [page, style] of this.#savedStyles) {
      restoreAttribute(page, 'style', style);
      page.removeAttribute('inert');
      page.removeAttribute('aria-hidden');
    }
    restoreAttribute(el, 'style', this.#containerStyle);
    this.#renderer?.destroy();
    this.#canvas.remove();
    this.#snaps.clear();
  }

  // Pages and layout

  get #spread(): boolean {
    return this.#opts.spread ?? DEFAULTS.spread;
  }

  get #rtl(): boolean {
    return (this.#opts.direction ?? DEFAULTS.direction) === 'rtl';
  }

  get #step(): number {
    return this.#spread ? 2 : 1;
  }

  /** Pages are painted by the browser into the canvas instead of snapshotted. */
  get #drawable(): boolean {
    const r = this.#renderer;
    return Boolean(this.#opts.htmlInCanvas && !this.#opts.snapshot && r && canDrawElements(r.gl));
  }

  /** Geometric direction (0: the page curls leftwards) of a turn to the next or previous page. */
  #toGeometric(forward: boolean): Direction {
    return forward !== this.#rtl ? 0 : 1;
  }

  #isForward(direction: Direction): boolean {
    return (direction === 0) !== this.#rtl;
  }

  #clampPage(page: number): number {
    let p = Math.max(0, Math.min(Math.floor(page), this.#pages.length - 1));
    if (this.#spread) p -= p % 2;
    return Math.max(0, p);
  }

  #canGo(forward: boolean): boolean {
    return forward ? this.#index + this.#step < this.#pages.length : this.#index - 1 >= 0;
  }

  #readPages(): void {
    const pages = Array.from(this.element.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && c !== this.#canvas,
    );
    for (const [page, style] of this.#savedStyles) {
      if (!pages.includes(page)) {
        restoreAttribute(page, 'style', style);
        page.removeAttribute('inert');
        page.removeAttribute('aria-hidden');
        this.#savedStyles.delete(page);
        this.#shown.delete(page);
        this.#dropSnap(page);
      }
    }
    for (const page of pages) {
      if (!this.#savedStyles.has(page)) this.#savedStyles.set(page, page.getAttribute('style'));
    }
    this.#pages = pages;
  }

  #pageRect(i: number): Rect {
    if (!this.#spread) return [0, 0, this.#width, this.#height];
    const half = this.#width / 2;
    const left = (i % 2 === 0) !== this.#rtl;
    return [left ? 0 : half, 0, half, this.#height];
  }

  #layout(): void {
    [this.#width, this.#height] = this.#size();
    this.#pixelRatio = this.#opts.pixelRatio ?? (window.devicePixelRatio || 1);
    const spine = this.#spread ? Spine.Center : this.#rtl ? Spine.Right : Spine.Left;
    this.#driver = new CurlDriver(spine, [0, 0, this.#width, this.#height]);
    this.#pages.forEach((page, i) => {
      const [, , w, h] = this.#pageRect(i);
      const s = page.style;
      s.position = 'absolute';
      s.width = `${w}px`;
      s.height = `${h}px`;
      s.boxSizing = 'border-box';
      s.margin = '0';
    });
    // The canvas extends this far around the book, kept to whole screen pixels so the pages are
    // drawn on the same pixel grid as the live ones.
    const grid = this.#grid;
    const bleed = this.#opts.overflow ?? Math.max(this.#width, this.#height) * 0.25;
    this.#bleed = Math.ceil(bleed / grid) * grid;
    const b = this.#bleed;
    const cs = this.#canvas.style;
    cs.width = `${this.#width + 2 * b}px`;
    cs.height = `${this.#height + 2 * b}px`;
    this.#nudge = this.#pixelNudge();
    this.#place();
    // A finger on the book turns its pages, like in a reading app: the browser doesn't get to
    // scroll or zoom with it, or it would cancel the curl as soon as the drag strayed vertically.
    this.#styleContainer({ touchAction: this.#opts.drag === false ? '' : 'none' });
    this.#render();
  }

  /**
   * The area the pages fill. A spread is kept to an even width so the right page starts on a
   * whole pixel too; on a fractional one its text would land differently from its snapshot.
   */
  #size(): [number, number] {
    const w = this.element.clientWidth;
    return [this.#spread ? w - (w % 2) : w, this.element.clientHeight];
  }

  /**
   * How far the pages must move to start on a whole CSS pixel. On a fractional position the
   * browser rounds each line of live text differently than the snapshot does, and text would
   * jump by a pixel as a turn starts. At a fractional pixel ratio (125% zoom, say) a whole CSS
   * pixel isn't a whole screen pixel, so the pages snap to screen pixels instead, where the
   * canvas draws them.
   */
  #pixelNudge(): Point {
    const r = this.element.getBoundingClientRect();
    const x = r.left + this.element.clientLeft;
    const y = r.top + this.element.clientTop;
    const pr = this.#pixelRatio;
    const snap = (v: number) => (Number.isInteger(pr) ? Math.round(v) : Math.round(v * pr) / pr);
    return [snap(x) - x, snap(y) - y];
  }

  /**
   * The smallest whole number of CSS pixels that is also a whole number of screen pixels: 1 at
   * 1x, 2x or 3x, 4 at 125% zoom (4 CSS pixels make 5 screen pixels).
   */
  get #grid(): number {
    const pr = this.#pixelRatio;
    for (let n = 1; n <= 20; n++) if (Math.abs(n * pr - Math.round(n * pr)) < 0.001) return n;
    return 1;
  }

  #place(): void {
    const [dx, dy] = this.#nudge;
    // At a fractional pixel ratio the nudge is a fraction like 1/3 px, which layout would round to
    // its 1/64 px units. A translate keeps it exact.
    const exact = !Number.isInteger(this.#pixelRatio);
    const [lx, ly] = exact ? [0, 0] : [dx, dy];
    const shift = exact ? `${dx}px ${dy}px` : '';
    this.#pages.forEach((page, i) => {
      const [x, y] = this.#pageRect(i);
      page.style.left = `${x + lx}px`;
      page.style.top = `${y + ly}px`;
      page.style.translate = shift;
    });
    const cs = this.#canvas.style;
    cs.left = `${lx - this.#bleed}px`;
    cs.top = `${ly - this.#bleed}px`;
    cs.translate = shift;
  }

  /** Re-snaps the pages to whole pixels if the book has moved. Never mid-turn. */
  #align(): void {
    if (this.#turns.length) return;
    const nudge = this.#pixelNudge();
    const [dx, dy] = this.#nudge;
    if (Math.abs(nudge[0] - dx) < 0.01 && Math.abs(nudge[1] - dy) < 0.01) return;
    this.#nudge = nudge;
    this.#place();
  }

  #onResize(): void {
    if (this.#destroyed) return;
    this.#align();
    const [w, h] = this.#size();
    const pr = this.#opts.pixelRatio ?? (window.devicePixelRatio || 1);
    if (w === this.#width && h === this.#height && pr === this.#pixelRatio) return;
    this.#settleAll();
    this.#layout();
    this.#prewarm();
  }

  /** Sets styles on the element, remembering them so the change isn't mistaken for a theme change. */
  #styleContainer(styles: Partial<CSSStyleDeclaration>): void {
    Object.assign(this.element.style, styles);
    this.#ownStyle = this.element.getAttribute('style');
  }

  #onDocumentMutations = (records: MutationRecord[]): void => {
    for (const r of records) {
      const target = r.target;
      if (r.type === 'attributes') {
        if (!(target instanceof Element) || !target.contains(this.element)) continue;
        if (
          target === this.element &&
          r.attributeName === 'style' &&
          this.element.getAttribute('style') === this.#ownStyle
        ) {
          continue;
        }
      }
      this.#onThemeChange();
      return;
    }
  };

  #onThemeChange = (): void => {
    this.#invalidate();
    this.#prewarm();
  };

  // Typing into a field changes its value without touching the DOM, so watch for edits too.
  #onEdit = (e: Event): void => {
    const page = e.target instanceof Node ? this.#pageOf(e.target) : null;
    const snap = page && this.#snaps.get(page);
    if (snap) snap.stamp++;
  };

  #onMutations = (records: MutationRecord[]): void => {
    let pagesChanged = false;
    for (const r of records) {
      if (r.target === this.element) {
        if (r.type === 'childList') pagesChanged = true;
        continue;
      }
      const page = this.#pageOf(r.target);
      if (!page) continue;
      if (
        r.target === page &&
        r.type === 'attributes' &&
        OWN_ATTRIBUTES.has(r.attributeName ?? '')
      ) {
        continue;
      }
      const snap = this.#snaps.get(page);
      if (snap) snap.stamp++;
    }
    if (pagesChanged) {
      const before = this.#pages;
      this.#readPages();
      if (before.length !== this.#pages.length || before.some((p, i) => p !== this.#pages[i])) {
        this.#setIndex(this.#clampPage(this.#index));
        this.#layout();
        this.#prewarm();
      }
    }
  };

  #pageOf(node: Node): HTMLElement | null {
    let n: Node | null = node;
    while (n && n.parentNode !== this.element) n = n.parentNode;
    return n instanceof HTMLElement && n !== this.#canvas ? n : null;
  }

  #setIndex(page: number): void {
    if (page === this.#index) return;
    this.#index = page;
    this.#opts.onPageChange?.(page);
  }

  // Snapshots

  #snapOf(page: HTMLElement): Snap {
    let snap = this.#snaps.get(page);
    if (!snap) {
      snap = {
        source: null,
        copy: null,
        texture: null,
        size: '',
        stamp: 0,
        taken: -1,
        pending: null,
      };
      this.#snaps.set(page, snap);
    }
    return snap;
  }

  #dropSnap(page: HTMLElement): void {
    const snap = this.#snaps.get(page);
    if (snap?.texture) this.#renderer?.deleteTexture(snap.texture);
    snap?.copy?.remove();
    this.#snaps.delete(page);
  }

  #invalidate(): void {
    for (const snap of this.#snaps.values()) snap.stamp++;
  }

  #textureRatio(w: number, h: number): number {
    const max = this.#renderer?.maxTextureSize ?? 4096;
    return Math.min(this.#pixelRatio, max / Math.max(w, h, 1));
  }

  /** Snapshots the pages a turn needs, unless their snapshots are current. */
  async #prepare(pages: number[]): Promise<void> {
    await Promise.all(
      pages
        .map((i) => this.#pages[i])
        .filter(Boolean)
        .map((p) => this.#capture(p as HTMLElement)),
    );
  }

  #capture(page: HTMLElement): Promise<void> {
    const snap = this.#snapOf(page);
    const [, , w, h] = this.#pageRect(this.#pages.indexOf(page));
    const ratio = this.#textureRatio(w, h);
    const size = `${w}x${h}@${ratio}`;
    const taken = snap.source || snap.copy;
    if (taken && snap.size === size && snap.taken === snap.stamp) return Promise.resolve();
    if (snap.pending) return snap.pending;
    const stamp = snap.stamp;
    const shoot = this.#opts.snapshot ?? snapshot;
    if (this.#opts.htmlInCanvas) this.#ensureRenderer();
    // Element painting can't scale down, so very large pages fall back to a snapshot.
    const drawable = this.#drawable && ratio === this.#pixelRatio;
    if (drawable) this.#canvas.style.display = 'block';
    snap.pending = (async () => {
      try {
        const options = { width: w, height: h, background: cssColor(this.#paperColor(page)) };
        const copy = drawable ? await paintCopy(this.#canvas, page, options) : null;
        const source = copy ? null : await shoot(page, { ...options, pixelRatio: ratio });
        if (this.#destroyed || this.#snaps.get(page) !== snap) {
          copy?.remove();
          return;
        }
        if (snap.texture) this.#renderer?.deleteTexture(snap.texture);
        snap.copy?.remove();
        snap.texture = null;
        snap.source = source;
        snap.copy = copy;
        snap.size = size;
        snap.taken = stamp;
      } finally {
        snap.pending = null;
      }
    })();
    return snap.pending;
  }

  #texture(page: number): WebGLTexture | null {
    const el = this.#pages[page];
    const snap = el && this.#snaps.get(el);
    const renderer = this.#renderer;
    if (!snap || !renderer) return null;
    if (!snap.texture && snap.copy) {
      const [, , w, h] = this.#pageRect(page);
      const pr = this.#pixelRatio;
      try {
        snap.texture = elementTexture(renderer.gl, snap.copy, Math.ceil(w * pr), Math.ceil(h * pr));
      } catch (error) {
        // Not painted yet, or the API changed under us: snapshot it next time instead.
        console.warn(error);
        this.#dropSnap(el);
        return null;
      }
    }
    if (!snap.texture && snap.source) snap.texture = renderer.createTexture(snap.source);
    return snap.texture;
  }

  #pagesFor(forward: boolean, index = this.#index): number[] {
    if (!this.#spread) return [forward ? index : index - 1];
    return forward ? [index + 1, index + 2] : [index, index - 1];
  }

  /** Snapshots the pages the next and previous turns need while the browser is idle. */
  #prewarm(): void {
    this.#cancelIdle();
    const run = async () => {
      this.#idle = 0;
      if (this.#destroyed || this.turning) return;
      try {
        await this.#prepare(this.#pagesFor(true));
        await this.#prepare(this.#pagesFor(false));
      } catch {
        // Retried when a turn needs the page.
      }
      this.#evict();
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    this.#idle = w.requestIdleCallback ? w.requestIdleCallback(run) : window.setTimeout(run, 120);
  }

  #cancelIdle(): void {
    if (!this.#idle) return;
    const w = window as Window & { cancelIdleCallback?: (id: number) => void };
    if (w.cancelIdleCallback) w.cancelIdleCallback(this.#idle);
    else clearTimeout(this.#idle);
    this.#idle = 0;
  }

  /** Frees snapshots of pages far from the current one. */
  #evict(): void {
    for (const [page, snap] of this.#snaps) {
      const i = this.#pages.indexOf(page);
      if (Math.abs(i - this.#index) > 4 && !snap.pending) this.#dropSnap(page);
    }
  }

  // Colours

  #paperColor(page: HTMLElement): Rgba {
    if (this.#opts.pageColor) return parseColor(this.#opts.pageColor);
    // A transparent page often wraps the element that paints it, so look one level down first.
    for (const el of [page, page.firstElementChild, this.element]) {
      if (!el) continue;
      const c = parseColor(getComputedStyle(el).backgroundColor);
      if (c[3] > 0) return c;
    }
    return [1, 1, 1, 1];
  }

  #colors(page: HTMLElement): CurlColors {
    const [r, g, b, a] = this.#paperColor(page);
    return {
      front: [1, 1, 1, 1],
      backNear: [r, g, b, a * 0.75],
      backFar: [r * 0.96, g * 0.96, b * 0.96, a * 0.85],
      shadow: [r * 0.2, g * 0.2, b * 0.2, a * 0.4],
    };
  }

  // Turns

  #animate(direction: Direction): Promise<boolean> {
    const forward = this.#isForward(direction);
    return new Promise<boolean>((resolve) => {
      this.#queue = this.#queue
        .then(async () => {
          if (this.#destroyed || !this.#canGo(forward)) return resolve(false);
          if (!this.#ensureRenderer()) {
            // Without WebGL the page still turns, just without the curl.
            this.#setIndex(this.#index + (forward ? this.#step : -this.#step));
            this.#render();
            return resolve(true);
          }
          await this.#prepare(this.#pagesFor(forward));
          if (this.#destroyed || !this.#canGo(forward)) return resolve(false);
          if (!this.#beginTurn(Kind.Turn, [0, 0], direction, resolve)) resolve(false);
        })
        .catch((error: unknown) => {
          console.error(error);
          resolve(false);
        });
    });
  }

  #beginTurn(
    kind: typeof Kind.Drag | typeof Kind.Turn,
    location: Point,
    direction: Direction,
    resolve: ((completed: boolean) => void) | null = null,
  ): Turn | null {
    if (!this.#ensureRenderer()) return null;
    this.#align();
    const forward = this.#isForward(direction);
    const animated = kind === Kind.Turn;
    if (!animated && this.#turns.some((t) => !t.animated && !t.ended)) return null;
    const state = this.#driver.begin(kind, location, direction);
    const from = this.#index;
    const to = forward ? from + this.#step : from - this.#step;
    const [frontPage, backPage] = this.#pagesFor(forward, from) as [number, number?];
    const frontEl = this.#pages[frontPage] as HTMLElement;
    const colors = this.#colors(frontEl);
    const layer = (
      page: number,
      front: boolean,
      back: boolean,
      flip: boolean,
      c: CurlColors,
    ): Layer => ({
      page,
      front,
      back,
      flip,
      colors: c,
      model: { time: 0, radius: 0, angle: 0 },
      tweens: {},
    });
    const turn: Turn = {
      state,
      animated,
      forward,
      from,
      to,
      frontPage,
      frame: this.#driver.pageFrame(direction),
      // A single page shows its own reverse side; a spread shows the next page on the back.
      front: layer(frontPage, true, !this.#spread, false, colors),
      back:
        this.#spread && backPage !== undefined
          ? layer(backPage, false, true, true, { ...colors, backNear: [1, 1, 1, 0] })
          : null,
      ended: false,
      completed: false,
      finishAt: null,
      resolve,
    };
    // Animated turns switch pages right away; drags when they are released.
    if (animated) this.#setIndex(to);
    const duration = animated
      ? (this.#opts.turnDuration ?? DEFAULTS.turnDuration)
      : (this.#opts.dragDuration ?? DEFAULTS.dragDuration);
    const target = animated
      ? this.#driver.target(state)
      : this.#driver.inputsAt(state, state.initialLocation);
    const t = now();
    for (const l of layers(turn)) {
      for (const key of KEYS) {
        const [start] = this.#driver.range(state, key);
        const timing =
          key !== 'angle'
            ? Easing.inOut
            : state.kind < Kind.DragBack
              ? Easing.curlOut
              : Easing.curlIn;
        const value = Math.fround(target[key]);
        l.tweens[key] = new Tween(
          Math.fround(start),
          animated ? value : undefined,
          duration,
          timing,
          t,
        );
        l.model[key] = value;
      }
    }
    turn.finishAt = animated ? t + duration : null;
    // Turns towards the spine slide under earlier ones; turns coming back go on top.
    if (state.kind < Kind.DragBack) this.#turns.unshift(turn);
    else this.#turns.push(turn);
    this.#opts.onTurnStart?.(this.#describe(turn));
    this.#schedule();
    return turn;
  }

  #updateTurn(turn: Turn, location: Point): void {
    if (turn.ended) return;
    const inputs = this.#driver.inputsAt(turn.state, location);
    for (const l of layers(turn)) {
      for (const key of KEYS) l.model[key] = Math.fround(inputs[key]);
    }
    this.#schedule();
  }

  #endTurn(turn: Turn, complete: boolean): void {
    if (turn.ended) return;
    turn.ended = true;
    turn.completed = complete;
    const duration = this.#opts.dragDuration ?? DEFAULTS.dragDuration;
    const t = now();
    for (const l of layers(turn)) {
      const p = presentation(l, t);
      for (const key of KEYS) {
        const [start, end] = this.#driver.range(turn.state, key);
        const value = Math.fround(complete ? end : start);
        const timing = key === 'angle' ? Easing.ease : Easing.inOut;
        l.tweens[key] = new Tween(p[key], value, duration, timing, t);
        l.model[key] = value;
      }
    }
    turn.finishAt = t + duration;
    if (complete) this.#setIndex(turn.to);
    this.#schedule();
  }

  #describe(turn: Turn): TurnEvent {
    return {
      from: turn.from,
      to: turn.to,
      direction: turn.forward ? 'next' : 'prev',
      interactive: !turn.animated,
    };
  }

  /** Ends every turn immediately at its destination. */
  #settleAll(): void {
    const turns = this.#turns;
    this.#turns = [];
    this.#drag = null;
    for (const turn of turns) {
      const completed = turn.animated || (turn.ended && turn.completed);
      turn.resolve?.(completed);
      this.#opts.onTurnEnd?.({ ...this.#describe(turn), completed });
    }
  }

  // Drags

  #beginDrag(location: Point, direction: Direction): boolean {
    const forward = this.#isForward(direction);
    if (this.#drag || !this.#canGo(forward)) return false;
    if (this.#turns.some((t) => !t.animated && !t.ended)) return false;
    const drag: Drag = {
      direction,
      start: location,
      last: location,
      turn: null,
      ended: false,
      complete: false,
    };
    this.#drag = drag;
    this.#prepare(this.#pagesFor(forward))
      .then(() => {
        if (this.#destroyed) return;
        if (drag.ended) {
          // Released before the page was ready: finish the gesture as a plain turn.
          if (drag.complete) void this.#animate(direction);
          return;
        }
        if (this.#drag !== drag) return;
        drag.turn = this.#canGo(forward) ? this.#beginTurn(Kind.Drag, drag.start, direction) : null;
        if (!drag.turn) this.#drag = null;
        else if (drag.last !== drag.start) this.#updateTurn(drag.turn, drag.last);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (this.#drag === drag) this.#drag = null;
      });
    return true;
  }

  #moveDrag(location: Point): void {
    const drag = this.#drag;
    if (!drag) return;
    drag.last = location;
    if (drag.turn) this.#updateTurn(drag.turn, location);
  }

  #endDrag(complete: boolean, _velocity: number): void {
    const drag = this.#drag;
    if (!drag) return;
    drag.ended = true;
    drag.complete = complete;
    this.#drag = null;
    if (drag.turn) this.#endTurn(drag.turn, complete);
  }

  // Pointer input

  #local(e: PointerEvent | MouseEvent): Point {
    const r = this.element.getBoundingClientRect();
    const sx = this.#width ? r.width / this.#width : 1;
    const sy = this.#height ? r.height / this.#height : 1;
    return [(e.clientX - r.left) / (sx || 1), (e.clientY - r.top) / (sy || 1)];
  }

  #velocity(): number {
    const p = this.#pointer;
    if (!p) return 0;
    const s = p.samples;
    const last = s[s.length - 1];
    while (s.length > 2 && last && last.t - (s[0] as { t: number }).t > VELOCITY_WINDOW) s.shift();
    const a = s[0];
    const b = s[s.length - 1];
    if (!a || !b || s.length < 2) return 0;
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.x - a.x) / dt : 0;
  }

  #ignored(target: EventTarget | null, selector: string): boolean {
    return (
      target instanceof Element &&
      this.element.contains(target) &&
      target.closest(selector) !== null
    );
  }

  #onPointerDown = (e: PointerEvent): void => {
    if (this.#destroyed || this.#pointer || !e.isPrimary || e.button !== 0) return;
    if (this.#opts.drag === false && this.#opts.tap === false) return;
    if (this.#ignored(e.target, this.#opts.ignore ?? DEFAULTS.ignore)) return;
    const p = this.#local(e);
    if (p[0] < 0 || p[1] < 0 || p[0] > this.#width || p[1] > this.#height) return;
    this.#pointer = {
      id: e.pointerId,
      start: p,
      last: p,
      target: e.target,
      samples: [{ t: e.timeStamp, x: p[0], y: p[1] }],
      began: false,
      dragging: false,
      selecting:
        e.pointerType === 'mouse' && !this.#inGrabZone(p) && this.#onText(e.clientX, e.clientY),
    };
  };

  /** Whether a point is close enough to the book's left or right edge to grab the page there. */
  #inGrabZone([x]: Point): boolean {
    const zone = Math.min(this.#opts.grabZone ?? GRAB_ZONE, this.#width / 2);
    return x <= zone || x >= this.#width - zone;
  }

  /** Whether a point is over the glyphs of selectable text on a page. */
  #onText(x: number, y: number): boolean {
    let node: Node | null | undefined;
    if (document.caretPositionFromPoint) node = document.caretPositionFromPoint(x, y)?.offsetNode;
    else node = document.caretRangeFromPoint?.(x, y)?.startContainer;
    const parent = node?.parentElement;
    if (node?.nodeType !== Node.TEXT_NODE || !parent || !this.element.contains(parent)) {
      return false;
    }
    if (getComputedStyle(parent).userSelect === 'none') return false;
    // The caret snaps to the nearest text, so check the point is on the text itself.
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }

  #onPointerMove = (e: PointerEvent): void => {
    const ptr = this.#pointer;
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = this.#local(e);
    ptr.last = p;
    ptr.samples.push({ t: e.timeStamp, x: p[0], y: p[1] });
    if (ptr.dragging) {
      this.#moveDrag(p);
      return;
    }
    if (ptr.began) return;
    const tx = p[0] - ptr.start[0];
    const ty = p[1] - ptr.start[1];
    if (Math.hypot(tx, ty) < DRAG_THRESHOLD) return;
    ptr.began = true;
    if (this.#opts.drag === false || ptr.selecting) return;
    const vx = this.#velocity();
    let dir: Direction;
    if (Math.abs(vx) > FLICK_VELOCITY) dir = vx >= 0 ? 1 : 0;
    else if (Math.abs(tx) > Math.abs(ty)) dir = tx >= 0 ? 1 : 0;
    // A drag that is mostly up or down turns the page it started on: forward on the right half,
    // back on the left.
    else dir = ptr.start[0] > this.#width / 2 ? 0 : 1;
    if (!this.#beginDrag(p, dir)) return;
    ptr.dragging = true;
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      // The pointer may already be gone.
    }
    // A mouse drag also starts a text selection, which would follow the pointer across the whole
    // document. Clear it and keep it from coming back until the drag ends.
    document.getSelection()?.removeAllRanges();
    const root = document.documentElement.style;
    this.#savedSelect = [root.userSelect, root.webkitUserSelect];
    root.userSelect = 'none';
    root.webkitUserSelect = 'none';
    document.addEventListener('selectstart', preventDefault, true);
  };

  #onPointerUp = (e: PointerEvent): void => {
    const ptr = this.#pointer;
    if (!ptr || e.pointerId !== ptr.id) return;
    this.#pointer = null;
    if (ptr.dragging) {
      this.#releaseSelection();
      const vx = this.#velocity();
      const flick = Math.abs(vx) > FLICK_VELOCITY;
      const end: Direction = flick ? (vx >= 0 ? 1 : 0) : ptr.last[0] > this.#width / 2 ? 1 : 0;
      const drag = this.#drag;
      if (drag) this.#endDrag(end === drag.direction, flick ? vx : 0);
      this.#suppressClick = true;
      setTimeout(() => {
        this.#suppressClick = false;
      });
    } else if (!ptr.began && this.#opts.tap !== false && !this.#ignored(ptr.target, INTERACTIVE)) {
      const dir = this.#tapDirection(ptr.last);
      if (dir !== null) void this.#animate(dir);
    }
  };

  /** Once a page is curling, nothing scrolls, not even where `touch-action` isn't honoured. */
  #onTouchMove = (e: TouchEvent): void => {
    if (this.#pointer?.dragging) e.preventDefault();
  };

  #onPointerCancel = (e: PointerEvent): void => {
    const ptr = this.#pointer;
    if (!ptr || e.pointerId !== ptr.id) return;
    this.#pointer = null;
    if (ptr.dragging) {
      this.#releaseSelection();
      this.#endDrag(false, 0);
    }
  };

  #onClick = (e: MouseEvent): void => {
    if (!this.#suppressClick) return;
    this.#suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  #onDragStart = (e: DragEvent): void => {
    if (this.#pointer && this.#opts.drag !== false) e.preventDefault();
  };

  #releaseSelection(): void {
    if (!this.#savedSelect) return;
    const root = document.documentElement.style;
    [root.userSelect, root.webkitUserSelect] = this.#savedSelect;
    this.#savedSelect = null;
    document.removeEventListener('selectstart', preventDefault, true);
  }

  #tapDirection([x, y]: Point): Direction | null {
    const w = this.#width;
    if (y < 0 || y > this.#height) return null;
    const zone = Math.min(this.#opts.tapZone ?? (this.#spread ? TAP_ZONE_SPREAD : TAP_ZONE), w / 2);
    if (x >= 0 && x <= zone) return 1;
    if (x >= w - zone && x <= w) return 0;
    return null;
  }

  // Rendering

  #ensureRenderer(): boolean {
    if (this.#renderer && !this.#renderer.lost) return true;
    if (this.#noWebGL) return false;
    try {
      this.#renderer = new Renderer(this.#canvas);
      for (const snap of this.#snaps.values()) snap.texture = null;
      if (canDrawElements(this.#renderer.gl)) makeDrawable(this.#canvas);
      return true;
    } catch (error) {
      console.warn(error);
      this.#noWebGL = true;
      return false;
    }
  }

  #schedule(): void {
    if (!this.#raf && !this.#destroyed) this.#raf = requestAnimationFrame(this.#frame);
  }

  #frame = (ms: number): void => {
    this.#raf = 0;
    const t = ms / 1000;
    for (const turn of this.#turns) {
      for (const l of layers(turn)) {
        for (const key of KEYS) if (l.tweens[key]?.done(t)) delete l.tweens[key];
      }
    }
    const finished = this.#turns.filter(
      (turn) => turn.finishAt !== null && t >= turn.finishAt && (turn.animated || turn.ended),
    );
    if (finished.length) {
      this.#turns = this.#turns.filter((turn) => !finished.includes(turn));
      for (const turn of finished) {
        const completed = turn.animated || turn.completed;
        turn.resolve?.(completed);
        this.#opts.onTurnEnd?.({ ...this.#describe(turn), completed });
      }
    }
    this.#render(t);
    if (this.#turns.length) this.#schedule();
    else if (finished.length) this.#prewarm();
  };

  /**
   * Shows the pages that are flat on the stack and draws the turning ones. With `liveFlat`, while
   * a single turn is in progress, the part of the turning page that hasn't started to bend stays
   * live DOM, clipped along the fold, and only the bending part is drawn from its snapshot. Text
   * that isn't moving then never switches to the snapshot, which can't match it to the pixel.
   */
  #render(t = now()): void {
    const renderer = this.#renderer;
    const drawing = this.#turns.length > 0 && renderer !== null;
    const single =
      this.#opts.liveFlat && this.#turns.length === 1 ? (this.#turns[0] as Turn) : null;
    let clip: string | null = null;
    if (drawing) {
      const pr = this.#pixelRatio;
      renderer.resize(
        Math.round((this.#width + 2 * this.#bleed) * pr),
        Math.round((this.#height + 2 * this.#bleed) * pr),
      );
      renderer.clear();
      for (const turn of this.#turns) {
        for (const l of layers(turn)) {
          const flat = this.#drawLayer(renderer, turn, l, t, turn === single && l === turn.front);
          if (flat && single) clip = this.#flatClip(single, flat);
        }
      }
    }

    const visible = new Set(this.#restingPages());
    const turning = clip !== null && single ? single.frontPage : -1;
    this.#pages.forEach((page, i) => {
      const on = visible.has(i);
      const state = on ? 'on' : i === turning ? (clip as string) : 'off';
      if (this.#shown.get(page) === state) return;
      this.#shown.set(page, state);
      const s = page.style;
      s.opacity = state === 'off' ? '0' : '';
      s.clipPath = on || state === 'off' ? '' : state;
      // The flat part of a turning page lies on the pages under it, and under the canvas.
      s.zIndex = on ? '1' : state === 'off' ? '0' : '2';
      s.pointerEvents = on ? '' : 'none';
      page.toggleAttribute('inert', !on);
      if (on) page.removeAttribute('aria-hidden');
      else page.setAttribute('aria-hidden', 'true');
    });

    if (!drawing) {
      // A drawable canvas stays rendered, or the page copies inside it would never be painted.
      if (renderer && this.#drawable) {
        renderer.clear();
        this.#canvas.style.display = 'block';
      } else this.#canvas.style.display = 'none';
      return;
    }
    this.#canvas.style.display = 'block';
  }

  /**
   * Draws one layer of a turn. With `cut`, the flat part of the page is left out and its
   * half-plane returned, for the live page to show instead.
   */
  #drawLayer(
    renderer: Renderer,
    turn: Turn,
    layer: Layer,
    t: number,
    cut: boolean,
  ): CurlMesh['flat'] | null {
    const texture = this.#texture(layer.page);
    if (!texture) return null;
    const p = presentation(layer, t);
    const [fx, fy, fw, fh] = turn.frame;
    const pr = this.#pixelRatio;
    const mesh = buildCurlMesh({
      width: fw,
      height: fh,
      pixelRatio: pr,
      time: p.time,
      angle: p.angle,
      radius: p.radius,
      front: layer.front,
      back: layer.back,
      colors: layer.colors,
    });
    renderer.draw(mesh, texture, {
      x: (this.#bleed + fx) * pr,
      y: (this.#bleed + fy) * pr,
      scale: pr,
      textureWidth: fw * pr,
      textureHeight: fh * pr,
      flip: layer.flip,
      cut: cut ? mesh.flat : undefined,
    });
    return cut ? mesh.flat : null;
  }

  /**
   * The clip-path that shows only the flat part of a turning page, overlapping the bend by a
   * pixel so no gap opens along the fold (the canvas draws over the overlap).
   */
  #flatClip(turn: Turn, [a, b, c]: CurlMesh['flat']): string {
    const [fx, fy] = turn.frame;
    const [x, y, w, h] = this.#pageRect(turn.frontPage);
    // Mesh coordinates are relative to the turn's frame; the clip to the page element.
    const k = c + a * (x - fx) + b * (y - fy) - 1;
    const corners: Point[] = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ];
    const inside = ([px, py]: Point) => a * px + b * py >= k;
    const points: Point[] = [];
    corners.forEach((p, i) => {
      const q = corners[(i + 1) % 4] as Point;
      if (inside(p)) points.push(p);
      if (inside(p) !== inside(q)) {
        const s = (k - a * p[0] - b * p[1]) / (a * (q[0] - p[0]) + b * (q[1] - p[1]));
        points.push([p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1])]);
      }
    });
    if (points.length < 3) return 'inset(50%)';
    return `polygon(${points.map(([px, py]) => `${px.toFixed(2)}px ${py.toFixed(2)}px`).join(',')})`;
  }

  /** Pages lying flat (shown as live DOM) while the turning pages are drawn over them. */
  #restingPages(): number[] {
    const turns = this.#turns;
    if (!turns.length) return this.#spread ? [this.#index, this.#index + 1] : [this.#index];
    if (!this.#spread) {
      let under = this.#index;
      const fwd = turns.filter((t) => t.forward);
      const back = turns.filter((t) => !t.forward);
      if (fwd.length) under = Math.max(...fwd.map((t) => t.frontPage)) + 1;
      if (back.length) under = Math.max(under, ...back.map((t) => t.frontPage + 1));
      return [under];
    }
    if (turns.every((t) => t.forward)) {
      const froms = turns.map((t) => t.from);
      return [Math.min(...froms), Math.max(...froms) + 3];
    }
    if (turns.every((t) => !t.forward)) {
      const froms = turns.map((t) => t.from);
      return [Math.min(...froms) - 2, Math.max(...froms) + 1];
    }
    const last = turns[turns.length - 1] as Turn;
    return last.forward ? [last.from, last.from + 3] : [last.from - 2, last.from + 1];
  }
}

function preventDefault(e: Event): void {
  e.preventDefault();
}

function layers(turn: Turn): Layer[] {
  return turn.back ? [turn.front, turn.back] : [turn.front];
}

function presentation(layer: Layer, t: number): CurlInputs {
  const out = { time: 0, radius: 0, angle: 0 };
  for (const key of KEYS) {
    const tween = layer.tweens[key];
    out[key] = tween ? tween.value(t, layer.model[key]) : layer.model[key];
  }
  return out;
}

function restoreAttribute(el: Element, name: string, value: string | null): void {
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

let colorProbe: CanvasRenderingContext2D | null = null;
const parsedColors = new Map<string, Rgba>();

/** Any CSS colour → straight sRGB RGBA in 0–1. */
function parseColor(css: string): Rgba {
  let c = parsedColors.get(css);
  if (c) return c;
  if (!colorProbe) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    colorProbe = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!colorProbe) return [1, 1, 1, 1];
  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillStyle = '#0000';
  colorProbe.fillStyle = css;
  colorProbe.fillRect(0, 0, 1, 1);
  const d = colorProbe.getImageData(0, 0, 1, 1).data;
  c = [
    (d[0] as number) / 255,
    (d[1] as number) / 255,
    (d[2] as number) / 255,
    (d[3] as number) / 255,
  ];
  parsedColors.set(css, c);
  return c;
}

function cssColor([r, g, b, a]: Rgba): string {
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}
