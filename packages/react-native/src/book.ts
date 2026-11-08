// The turn logic of the web controller, without the DOM: which pages turn, how their curl inputs
// animate, which pages lie flat underneath, and how a touch becomes a drag or a tap. The host
// captures pages, shows the flat ones and draws the curling ones.

import {
  buildCurlMesh,
  type CurlColors,
  CurlDriver,
  type CurlInputs,
  type CurlMesh,
  type Direction,
  Easing,
  Kind,
  type Point,
  type Rect,
  type Rgba,
  Spine,
  type TurnState,
  Tween,
} from '@pagecurl/core';

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

export interface BookOptions {
  /** Show two pages side by side. */
  spread?: boolean;
  /** Reading direction. `rtl` binds pages on the right and turns them left to right. */
  direction?: 'ltr' | 'rtl';
  /** Seconds for a turn started by a tap or the API. */
  turnDuration?: number;
  /** Seconds for a drag to catch up with the finger, and to settle after release. */
  dragDuration?: number;
  /** Turn pages by dragging. */
  drag?: boolean;
  /** Turn pages by tapping near the left or right edge. */
  tap?: boolean;
  /** Width of the tap zones in points. Defaults to 110 (82 per page in spread mode). */
  tapZone?: number;
  onPageChange?: (page: number) => void;
  onTurnStart?: (event: TurnEvent) => void;
  onTurnEnd?: (event: TurnEndEvent) => void;
}

/** Where a layer's mesh goes: the frame of the turning page, in points of the book. */
export interface LayerView {
  frame: Rect;
  /** Device pixels per point the mesh was built for; its texture coordinates are in these. */
  pixelRatio: number;
  /** Sample the page mirrored horizontally (the next page, seen on the back of a spread). */
  flip: boolean;
}

/** What the book needs from the platform. `I` is a captured page. */
export interface BookHost<I> {
  /** Takes a picture of a page. Null if it can't be captured right now. */
  capture(page: number): Promise<I | null>;
  /** Frees a picture that is no longer needed. */
  release(image: I): void;
  /** Paper colour of a page, which tints the back of the page and its shadows. */
  paper(page: number): Rgba;
  /**
   * Draws a frame of the turning pages, in the order given. The mesh is reused for the next
   * layer, so draw it before returning. An empty list clears the drawing.
   */
  draw(layers: (draw: (mesh: CurlMesh, image: I, view: LayerView) => void) => void): void;
  /** The pages lying flat, or whether a turn is running, changed. */
  changed(): void;
}

const DEFAULTS = {
  spread: false,
  direction: 'ltr',
  turnDuration: 0.25,
  dragDuration: 0.2,
} as const;

const DRAG_THRESHOLD = 8;
const FLICK_VELOCITY = 300;
const VELOCITY_WINDOW = 100;
const TAP_ZONE = 110;
const TAP_ZONE_SPREAD = 82;
const KEYS = ['time', 'radius', 'angle'] as const;
/** Pictures of pages further than this from the current one are freed. */
const KEEP = 4;

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

interface Touch {
  start: Point;
  last: Point;
  samples: { t: number; x: number; y: number }[];
  began: boolean;
  dragging: boolean;
}

interface Snap<I> {
  image: I | null;
  /** Bumped when the page may have changed, and its value when the picture was taken. */
  stamp: number;
  taken: number;
  pending: Promise<void> | null;
}

const now = () => performance.now() / 1000;

export class Book<I> {
  #opts: BookOptions;
  #index: number;
  #count: number;
  #width = 0;
  #height = 0;
  #pixelRatio = 1;
  #driver = new CurlDriver(Spine.Left, [0, 0, 1, 1]);
  #turns: Turn[] = [];
  #drag: Drag | null = null;
  #touch: Touch | null = null;
  #raf = 0;
  #idle: ReturnType<typeof setTimeout> | null = null;
  #queue: Promise<void> = Promise.resolve();
  readonly #snaps = new Map<number, Snap<I>>();
  #drawn = false;
  #shown = '';
  #destroyed = false;

  constructor(
    readonly host: BookHost<I>,
    pageCount: number,
    page: number,
    options: BookOptions,
  ) {
    this.#opts = { ...options };
    this.#count = pageCount;
    this.#index = 0;
    this.#index = this.#clampPage(page);
  }

  // Public API

  get page(): number {
    return this.#index;
  }

  get pageCount(): number {
    return this.#count;
  }

  /** A turn is animating or being dragged. */
  get turning(): boolean {
    return this.#turns.length > 0 || this.#drag !== null;
  }

  /** The finger on the book is dragging a page. */
  get dragging(): boolean {
    return this.#touch?.dragging ?? false;
  }

  /** Whether the book has been laid out and can turn. */
  get ready(): boolean {
    return this.#width > 0 && this.#height > 0;
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
    this.#endDrag(complete);
  }

  setOptions(options: BookOptions): void {
    const before = this.#opts;
    this.#opts = { ...before, ...options };
    const relayout =
      (this.#opts.spread ?? false) !== (before.spread ?? false) ||
      (this.#opts.direction ?? 'ltr') !== (before.direction ?? 'ltr');
    if (!relayout) return;
    this.#settleAll();
    this.#setIndex(this.#clampPage(this.#index));
    // Pages change size between single and spread, so their pictures do too.
    this.invalidate();
    this.#layout();
    this.#prewarm();
  }

  /** Sets the size of the book, in points, and the screen's pixels per point. */
  setSize(width: number, height: number, pixelRatio: number): void {
    if (width === this.#width && height === this.#height && pixelRatio === this.#pixelRatio) return;
    this.#settleAll();
    this.#width = width;
    this.#height = height;
    this.#pixelRatio = pixelRatio;
    this.invalidate();
    this.#layout();
    this.#prewarm();
  }

  setPageCount(count: number): void {
    if (count === this.#count) return;
    this.#settleAll();
    this.#count = count;
    for (const page of [...this.#snaps.keys()]) if (page >= count) this.#dropSnap(page);
    this.#setIndex(this.#clampPage(this.#index));
    this.#render();
    this.#prewarm();
  }

  /** Marks pictures of pages as stale (all of them without `page`), to be taken again. */
  invalidate(page?: number): void {
    if (page === undefined) for (const snap of this.#snaps.values()) snap.stamp++;
    else if (this.#snaps.has(page)) (this.#snaps.get(page) as Snap<I>).stamp++;
  }

  /** Takes pictures of the pages the next and previous turns need, ahead of time. */
  prewarm(): void {
    this.#prewarm();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#settleAll();
    this.#destroyed = true;
    cancelAnimationFrame(this.#raf);
    this.#cancelIdle();
    for (const page of [...this.#snaps.keys()]) this.#dropSnap(page);
  }

  /** Rectangle of a page within the book, in points. */
  pageRect(i: number): Rect {
    if (!this.#spread) return [0, 0, this.#width, this.#height];
    const half = this.#width / 2;
    const left = (i % 2 === 0) !== this.#rtl;
    return [left ? 0 : half, 0, half, this.#height];
  }

  /** Pages lying flat, shown live while the turning ones are drawn over them. */
  restingPages(): number[] {
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

  // Touches, in points of the book. `t` is the event's timestamp in milliseconds.

  /** A finger went down. Pictures of the pages it may turn are taken now, while it moves. */
  touchStart(x: number, y: number, t: number): void {
    if (this.#destroyed || this.#touch) return;
    if (this.#opts.drag === false && this.#opts.tap === false) return;
    if (x < 0 || y < 0 || x > this.#width || y > this.#height) return;
    const p: Point = [x, y];
    this.#touch = { start: p, last: p, samples: [{ t, x, y }], began: false, dragging: false };
    if (this.#opts.drag !== false && !this.turning) {
      void this.#prepare(this.#pagesFor(true)).catch(() => {});
      void this.#prepare(this.#pagesFor(false)).catch(() => {});
    }
  }

  /** The finger moved. Returns true once it is dragging a page. */
  touchMove(x: number, y: number, t: number): boolean {
    const touch = this.#touch;
    if (!touch) return false;
    const p: Point = [x, y];
    touch.last = p;
    touch.samples.push({ t, x, y });
    if (touch.dragging) {
      this.#moveDrag(p);
      return true;
    }
    if (touch.began) return false;
    const tx = x - touch.start[0];
    const ty = y - touch.start[1];
    if (Math.hypot(tx, ty) < DRAG_THRESHOLD) return false;
    touch.began = true;
    if (this.#opts.drag === false) return false;
    const vx = this.#velocity();
    let dir: Direction;
    if (Math.abs(vx) > FLICK_VELOCITY) dir = vx >= 0 ? 1 : 0;
    else if (Math.abs(tx) > Math.abs(ty)) dir = tx >= 0 ? 1 : 0;
    // A drag that is mostly up or down turns the page it started on: forward on the right half,
    // back on the left.
    else dir = touch.start[0] > this.#width / 2 ? 0 : 1;
    touch.dragging = this.#beginDrag(p, dir);
    return touch.dragging;
  }

  /** The finger lifted: ends a drag, or turns the page if it tapped near an edge. */
  touchEnd(): void {
    const touch = this.#touch;
    if (!touch) return;
    this.#touch = null;
    if (touch.dragging) {
      const vx = this.#velocity(touch);
      const flick = Math.abs(vx) > FLICK_VELOCITY;
      const end: Direction = flick ? (vx >= 0 ? 1 : 0) : touch.last[0] > this.#width / 2 ? 1 : 0;
      const drag = this.#drag;
      if (drag) this.#endDrag(end === drag.direction);
    } else if (!touch.began && this.#opts.tap !== false) {
      const dir = this.#tapDirection(touch.last);
      if (dir !== null) void this.#animate(dir);
    }
  }

  /** The touch was taken away (by a scroll view, say): a drag falls back. */
  touchCancel(): void {
    const touch = this.#touch;
    if (!touch) return;
    this.#touch = null;
    if (touch.dragging) this.#endDrag(false);
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

  /** Geometric direction (0: the page curls leftwards) of a turn to the next or previous page. */
  #toGeometric(forward: boolean): Direction {
    return forward !== this.#rtl ? 0 : 1;
  }

  #isForward(direction: Direction): boolean {
    return (direction === 0) !== this.#rtl;
  }

  #clampPage(page: number): number {
    let p = Math.max(0, Math.min(Math.floor(page), this.#count - 1));
    if (this.#spread) p -= p % 2;
    return Math.max(0, p);
  }

  #canGo(forward: boolean): boolean {
    return forward ? this.#index + this.#step < this.#count : this.#index - 1 >= 0;
  }

  #layout(): void {
    const spine = this.#spread ? Spine.Center : this.#rtl ? Spine.Right : Spine.Left;
    this.#driver = new CurlDriver(spine, [0, 0, this.#width, this.#height]);
    this.#render();
  }

  #setIndex(page: number): void {
    if (page === this.#index) return;
    this.#index = page;
    this.#opts.onPageChange?.(page);
  }

  // Pictures

  #snapOf(page: number): Snap<I> {
    let snap = this.#snaps.get(page);
    if (!snap) {
      snap = { image: null, stamp: 0, taken: -1, pending: null };
      this.#snaps.set(page, snap);
    }
    return snap;
  }

  #dropSnap(page: number): void {
    const snap = this.#snaps.get(page);
    if (snap && snap.image !== null) this.host.release(snap.image);
    this.#snaps.delete(page);
  }

  /** Takes pictures of the pages a turn needs, unless their pictures are current. */
  async #prepare(pages: number[]): Promise<void> {
    await Promise.all(pages.filter((p) => p >= 0 && p < this.#count).map((p) => this.#capture(p)));
  }

  #capture(page: number): Promise<void> {
    const snap = this.#snapOf(page);
    if (snap.image !== null && snap.taken === snap.stamp) return Promise.resolve();
    if (snap.pending) return snap.pending;
    const stamp = snap.stamp;
    snap.pending = (async () => {
      try {
        const image = await this.host.capture(page);
        if (this.#destroyed || this.#snaps.get(page) !== snap) {
          if (image !== null) this.host.release(image);
          return;
        }
        if (image === null) return;
        if (snap.image !== null) this.host.release(snap.image);
        snap.image = image;
        snap.taken = stamp;
      } finally {
        snap.pending = null;
      }
    })();
    return snap.pending;
  }

  #pagesFor(forward: boolean, index = this.#index): number[] {
    if (!this.#spread) return [forward ? index : index - 1];
    return forward ? [index + 1, index + 2] : [index, index - 1];
  }

  /** Takes pictures of the pages the next and previous turns need, once things are quiet. */
  #prewarm(): void {
    this.#cancelIdle();
    if (this.#destroyed || !this.ready) return;
    this.#idle = setTimeout(async () => {
      this.#idle = null;
      if (this.#destroyed || this.turning) return;
      try {
        await this.#prepare(this.#pagesFor(true));
        await this.#prepare(this.#pagesFor(false));
      } catch {
        // Retried when a turn needs the page.
      }
      this.#evict();
    }, 120);
  }

  #cancelIdle(): void {
    if (this.#idle === null) return;
    clearTimeout(this.#idle);
    this.#idle = null;
  }

  /** Frees pictures of pages far from the current one. */
  #evict(): void {
    for (const [page, snap] of this.#snaps) {
      if (Math.abs(page - this.#index) > KEEP && !snap.pending) this.#dropSnap(page);
    }
  }

  #colors(page: number): CurlColors {
    const [r, g, b, a] = this.host.paper(page);
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
          if (this.#destroyed || !this.ready || !this.#canGo(forward)) return resolve(false);
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
    const forward = this.#isForward(direction);
    const animated = kind === Kind.Turn;
    if (!animated && this.#turns.some((t) => !t.animated && !t.ended)) return null;
    const state = this.#driver.begin(kind, location, direction);
    const from = this.#index;
    const to = forward ? from + this.#step : from - this.#step;
    const [frontPage, backPage] = this.#pagesFor(forward, from) as [number, number?];
    const colors = this.#colors(frontPage);
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
    if (this.#touch) this.#touch.dragging = false;
    for (const turn of turns) {
      const completed = turn.animated || (turn.ended && turn.completed);
      turn.resolve?.(completed);
      this.#opts.onTurnEnd?.({ ...this.#describe(turn), completed });
    }
    if (turns.length) this.#render();
  }

  // Drags

  #beginDrag(location: Point, direction: Direction): boolean {
    const forward = this.#isForward(direction);
    if (!this.ready || this.#drag || !this.#canGo(forward)) return false;
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

  #endDrag(complete: boolean): void {
    const drag = this.#drag;
    if (!drag) return;
    drag.ended = true;
    drag.complete = complete;
    this.#drag = null;
    if (drag.turn) this.#endTurn(drag.turn, complete);
  }

  #velocity(touch = this.#touch): number {
    if (!touch) return 0;
    const s = touch.samples;
    const last = s[s.length - 1];
    while (s.length > 2 && last && last.t - (s[0] as { t: number }).t > VELOCITY_WINDOW) s.shift();
    const a = s[0];
    const b = s[s.length - 1];
    if (!a || !b || s.length < 2) return 0;
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.x - a.x) / dt : 0;
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

  #schedule(): void {
    if (!this.#raf && !this.#destroyed) this.#raf = requestAnimationFrame(this.#frame);
  }

  #frame = (): void => {
    this.#raf = 0;
    const t = now();
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

  /** Draws the turning pages, and tells the host when the pages lying flat change. */
  #render(t = now()): void {
    const drawing = this.#turns.length > 0;
    if (drawing || this.#drawn) {
      this.#drawn = drawing;
      this.host.draw((draw) => {
        for (const turn of this.#turns) {
          for (const l of layers(turn)) this.#drawLayer(draw, turn, l, t);
        }
      });
    }
    const shown = `${this.restingPages().join()}/${drawing}`;
    if (shown !== this.#shown) {
      this.#shown = shown;
      this.host.changed();
    }
  }

  #drawLayer(
    draw: (mesh: CurlMesh, image: I, view: LayerView) => void,
    turn: Turn,
    layer: Layer,
    t: number,
  ): void {
    const image = this.#snaps.get(layer.page)?.image;
    if (image === undefined || image === null) return;
    const p = presentation(layer, t);
    const [, , fw, fh] = turn.frame;
    const mesh = buildCurlMesh({
      width: fw,
      height: fh,
      pixelRatio: this.#pixelRatio,
      time: p.time,
      angle: p.angle,
      radius: p.radius,
      front: layer.front,
      back: layer.back,
      colors: layer.colors,
    });
    draw(mesh, image, { frame: turn.frame, pixelRatio: this.#pixelRatio, flip: layer.flip });
  }
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
