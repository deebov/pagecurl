// Maps a finger position to the curl inputs (time, radius, angle), and gives the start and end
// values for animated turns.

const PI = Math.PI;
const HALF_PI = 1.5707963267948966;
const TWO_PI = 6.283185307179586;
const fr = Math.fround;
const sinf = (x: number) => fr(Math.sin(fr(x)));
const cosf = (x: number) => fr(Math.cos(fr(x)));
const tanf = (x: number) => fr(Math.tan(fr(x)));
const powf = (x: number, y: number) => fr(fr(x) ** fr(y));
const atan2f = (y: number, x: number) => fr(Math.atan2(fr(y), fr(x)));

/** Where the pages are bound. Single pages bind at an edge, spreads in the middle. */
export const Spine = {
  /** Single page bound on the left (left-to-right reading). */
  Left: 1,
  /** Single page bound at the top. */
  Top: 2,
  /** Two-page spread bound in the middle. */
  Center: 4,
  /** Two pages stacked vertically, bound in the middle. */
  Middle: 8,
  /** Single page bound on the right (right-to-left reading). */
  Right: 16,
  /** Single page bound at the bottom. */
  Bottom: 32,
} as const;
export type Spine = (typeof Spine)[keyof typeof Spine];

/**
 * Turn kinds. `Drag` follows a pointer, `Turn` animates on its own. The `Back` variants run in
 * reverse: the page comes back down onto the stack instead of curling away from it.
 */
export const Kind = { Drag: 0, Turn: 1, DragBack: 3, TurnBack: 4 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

/** 0 = the page curls away towards the spine; 1 = the other way. */
export type Direction = 0 | 1;

export type Point = readonly [x: number, y: number];
export type Rect = readonly [x: number, y: number, width: number, height: number];

export interface CurlInputs {
  time: number;
  radius: number;
  angle: number;
}

export interface TurnState {
  kind: Kind;
  direction: Direction;
  initialLocation: Point;
  referenceLocation: Point;
}

const isAnimated = (k: Kind) => k === Kind.Turn || k === Kind.TurnBack;
const isVertical = (s: Spine) => s === Spine.Top || s === Spine.Middle || s === Spine.Bottom;
const isSpread = (s: Spine) => s === Spine.Center || s === Spine.Middle;

// Radius as a fraction of the page breadth.
const RADIUS_SMALL = 0.04065040650406504;
const RADIUS_MID = 0.1524390243902439;
const RADIUS_LARGE = 0.3048780487804878;
const SPREAD_RADIUS_START = 0.02032520325203252;
const SPREAD_RADIUS_END = 0.0010162601626016261;
const MIN_RADIUS = 0.08791208791208792;
const TILT = 0.17453292519943295; // 10°

/** Curl geometry for one page layout: maps pointer positions to curl inputs. */
export class CurlDriver {
  readonly spine: Spine;
  readonly rect: Rect;
  /** Largest tilt of the curl away from its base direction while dragging. */
  readonly maxTilt: number;
  #diagonalAngle = 0;
  #diagonalLength = 0;

  /** `rect` is the area of all visible pages (both pages of a spread). */
  constructor(spine: Spine, rect: Rect) {
    this.spine = spine;
    this.rect = [...rect];
    const [, , w, h] = rect;
    switch (spine) {
      case Spine.Left:
      case Spine.Right:
        this.maxTilt = atan2f(w, h * 0.5);
        break;
      case Spine.Center:
        this.maxTilt = atan2f(w * 0.5, h * 0.5);
        break;
      case Spine.Top:
      case Spine.Bottom:
        this.maxTilt = atan2f(h, w * 0.5);
        break;
      default:
        this.maxTilt = atan2f(h * 0.5, w * 0.5);
    }
  }

  get minX(): number {
    return this.rect[0];
  }
  get minY(): number {
    return this.rect[1];
  }
  get maxX(): number {
    return this.rect[0] + this.rect[2];
  }
  get maxY(): number {
    return this.rect[1] + this.rect[3];
  }
  get width(): number {
    return this.rect[2];
  }
  get height(): number {
    return this.rect[3];
  }

  /** Frame of the page that curls; in a spread it is one half of the rect. */
  pageFrame(direction: Direction): Rect {
    let [x, y, w, h] = this.rect;
    if (this.spine === Spine.Middle) {
      h = h * 0.5;
      if (direction === 0) y = this.rect[1] + this.rect[3] / 2;
    } else if (this.spine === Spine.Center) {
      w = w * 0.5;
      if (direction === 0) x = this.rect[0] + this.rect[2] / 2;
    }
    return [x, y, w, h];
  }

  /** Starts a turn. Drags are measured against the edge the page is lifted from. */
  begin(
    kind: typeof Kind.Drag | typeof Kind.Turn,
    location: Point,
    direction: Direction,
  ): TurnState {
    const s = this.spine;
    const reverse =
      (direction === 0 && (s === Spine.Bottom || s === Spine.Right)) ||
      (direction === 1 && (s === Spine.Left || s === Spine.Top));
    const k: Kind = !reverse ? kind : kind === Kind.Turn ? Kind.TurnBack : Kind.DragBack;
    const state: TurnState = {
      kind: k,
      direction,
      initialLocation: [...location],
      referenceLocation: isAnimated(k)
        ? [...location]
        : this.#referenceLocation(location, direction),
    };
    if (!isAnimated(k)) {
      const [, , w, h] = this.pageFrame(direction);
      const wide = s === Spine.Center || s === Spine.Left || s === Spine.Right;
      this.#diagonalAngle = wide ? Math.atan2(h, w) : Math.atan2(w, h);
      this.#diagonalLength = Math.hypot(w, h);
    }
    return state;
  }

  #referenceLocation([x, y]: Point, direction: Direction): Point {
    const s = this.spine;
    if (s === Spine.Left || (s === Spine.Center && direction === 0)) return [this.maxX, y];
    if (s === Spine.Right || (s === Spine.Center && direction === 1)) return [this.minX, y];
    if (s === Spine.Top || (s === Spine.Middle && direction === 0)) return [x, this.maxY];
    if (s === Spine.Bottom || (s === Spine.Middle && direction === 1)) return [x, this.minY];
    return [x, y];
  }

  /** Distance a pointer travels for a full turn. */
  distanceToTravel(): number {
    switch (this.spine) {
      case Spine.Left:
      case Spine.Right:
        return this.width + this.width;
      case Spine.Top:
      case Spine.Bottom:
        return this.height + this.height;
      case Spine.Center:
        return this.width;
      default:
        return this.height;
    }
  }

  #baseAngle(state: TurnState): number {
    const s = this.spine;
    const d = state.direction;
    if (s === Spine.Left || (s === Spine.Center && d === 0)) return PI;
    if (s === Spine.Right || (s === Spine.Center && d === 1)) return 0;
    if (s === Spine.Top || (s === Spine.Middle && d === 0)) return 4.71238898038469;
    if (s === Spine.Bottom || (s === Spine.Middle && d === 1)) return HALF_PI;
    return 0;
  }

  /** [start, end] of an input over a turn (a reverse turn runs from end to start). */
  range(state: TurnState, key: keyof CurlInputs): [number, number] {
    const s = this.spine;
    const kind = state.kind;
    if (key === 'time') return kind < Kind.DragBack ? [0, 1] : [1, 0];
    if (key === 'radius') {
      const dim = isVertical(s) ? this.height : this.width;
      if (isSpread(s)) {
        const from = isAnimated(kind) ? 150 : dim * SPREAD_RADIUS_START;
        const to = isAnimated(kind) ? 1 : dim * SPREAD_RADIUS_END;
        return [from, to];
      }
      return [isAnimated(kind) ? dim * RADIUS_MID : dim * RADIUS_SMALL, dim * RADIUS_LARGE];
    }
    const base = this.#baseAngle(state);
    const tilt = isAnimated(kind) && base > HALF_PI ? TILT : -TILT;
    return [base + tilt, base];
  }

  /** Inputs at the end of a turn, or at its start for a reverse one. */
  target(state: TurnState): CurlInputs {
    return {
      time: this.range(state, 'time')[1],
      radius: this.range(state, 'radius')[1],
      angle: this.range(state, 'angle')[1],
    };
  }

  /** Duration of the settle animation after a drag is released. */
  releaseDuration(
    state: TurnState,
    velocity: number,
    complete: boolean,
    time: number,
    limits: { rest: number; minVelocity: number; maxVelocity: number },
  ): number {
    if (velocity === 0) return limits.rest;
    const v = Math.min(Math.max(Math.abs(velocity), limits.minVelocity), limits.maxVelocity);
    let remaining = complete ? 1 - time : time;
    if (state.kind >= Kind.DragBack) remaining = 1 - remaining;
    return (this.distanceToTravel() * remaining) / v;
  }

  /** Curl inputs for a drag at `location`. */
  inputsAt(state: TurnState, [lx, ly]: Point): CurlInputs {
    const s = this.spine;
    const kind = state.kind;
    const dir = state.direction;
    const { minX, maxX, minY, maxY } = this;
    let x = minX < lx ? lx : minX;
    x = maxX > x ? x : maxX;
    let y = minY < ly ? ly : minY;
    y = maxY > y ? y : maxY;
    const ref = state.referenceLocation;
    let ax = ref[0];
    let ay = ref[1];
    if (s === Spine.Left) ax = minX - this.width;
    else if (s === Spine.Center) ax = dir === 0 ? minX : maxX;
    else if (s === Spine.Right) ax = maxX + this.width;
    else if (s === Spine.Top) ay = minY - this.height;
    else if (s === Spine.Middle) ay = dir === 0 ? minY : maxY;
    else ay = maxY + this.height;
    const D = this.distanceToTravel();
    const horizontal = !isVertical(s);
    const d0 = horizontal ? x - ax : y - ay;
    let p = (d0 < 0 ? -d0 : d0) / D;
    p = Math.min(Math.max(p, 0), 1);
    const minTime = kind === Kind.Turn || kind === Kind.TurnBack ? 0 : 0.1;
    const q = 1 - p;
    let maxTime = 1;
    if (!isAnimated(kind) && s !== Spine.Center) maxTime = s === Spine.Middle ? 1 : 0.9;

    let angle: number;
    if (s === Spine.Left || (s === Spine.Center && dir === 0)) {
      const xlim = maxX - D * minTime;
      angle = Math.atan2(ref[1] - y, ref[0] - (x > xlim ? xlim : x)) + PI;
    } else if (s === Spine.Right || (s === Spine.Center && dir === 1)) {
      const xlim = minX + D * minTime;
      angle = Math.atan2(y - ref[1], (x < xlim ? xlim : x) - ref[0]);
    } else if (s === Spine.Top || (s === Spine.Middle && dir === 0)) {
      const ylim = maxY - D * minTime;
      angle = Math.atan2(ref[0] - x, (y > ylim ? ylim : y) - ref[1]) + HALF_PI;
      if (angle < 0) angle = angle + TWO_PI;
    } else {
      const ylim = minY + D * minTime;
      angle = Math.atan2(x - ref[0], ref[1] - (y < ylim ? ylim : y)) + 4.71238898038469;
      const wrapped = angle + -TWO_PI;
      if (wrapped > 0) angle = wrapped;
    }
    const base = this.#baseAngle(state);
    let tilt = angle - base;
    tilt = tilt > -this.maxTilt ? tilt : -this.maxTilt;
    tilt = this.maxTilt > tilt ? tilt : this.maxTilt;

    const [rFrom, rTo] = this.range(state, 'radius');
    const r0 = D * RADIUS_MID;
    const kq = isSpread(s) ? 0.5 : 0.25;
    let radius: number;
    if (q < kq) radius = rFrom + (q / kq) * (r0 - rFrom);
    else {
      const end = D * (isSpread(s) ? SPREAD_RADIUS_END : RADIUS_LARGE);
      radius = r0 + ((q - kq) / (1 - kq)) * (end - r0);
    }
    let minR: number;
    if (isAnimated(kind)) minR = rTo > rFrom ? rFrom : rTo;
    else {
      let dim = isVertical(s) ? this.height : this.width;
      if (isSpread(s)) dim = dim * 0.5;
      minR = dim * MIN_RADIUS;
    }
    const outAngle = base + tilt;
    if (isSpread(s)) {
      const dd = Math.sqrt((ax - x) * (ax - x) + (ay - y) * (ay - y)) / D;
      const scaled = ((0.25 - dd) * -4 + 1) * minR;
      minR = dd > 0.25 ? minR : scaled;
    }
    let rad = rFrom > rTo ? rTo : rFrom;
    rad = rad > minR ? minR : rad;
    rad = rad < radius ? radius : rad;
    const cap = D * 0.2;
    rad = cap > rad ? rad : cap;
    const radiusRef = { value: rad };
    let t = this.#timeForProgress(q, D, radiusRef, minR, outAngle, tilt, [x, y], state);
    t = minTime < t ? t : minTime;
    t = maxTime > t ? t : maxTime;
    return { time: t, radius: radiusRef.value, angle: outAngle };
  }

  /**
   * Time that keeps the curl under the finger. Works in a frame where the spine is on the left
   * and the page curls leftwards; may shrink the radius (down to `minRadius`) when the curl would
   * otherwise overshoot the page.
   */
  #timeForProgress(
    progress: number,
    D: number,
    radiusRef: { value: number },
    minRadius: number,
    angle: number,
    tilt: number,
    [tx, ty]: Point,
    state: TurnState,
  ): number {
    const kind = state.kind;
    const s = this.spine;
    const dir = state.direction;
    let r = radiusRef.value;
    // Quarter turns that map the page into the canonical frame.
    let k = kind < Kind.DragBack ? 0 : -2;
    const toward =
      s === Spine.Left ? dir === 0 : dir === 0 && (s === Spine.Center || s === Spine.Right);
    if (toward) k = kind < Kind.DragBack ? -2 : 0;
    else if (isVertical(s)) k = kind < Kind.DragBack !== (dir === 0) ? -1 : -3;

    const [rx, ry, , rh] = this.rect;
    let rw = this.rect[2];
    let M: Affine = [1, 0, 0, 1, 0, 0];
    if (k & 1) {
      const M1 = concat(translate(rx - (rx + rw * 0.5), ry - (ry + rh * 0.5)), rotation(-HALF_PI));
      const rr = applyRect([rx, ry, rw, rh], M1);
      M = concat(M1, translate(rr[0] + rr[2] * 0.5 - rr[0], rr[1] + rr[3] * 0.5 - rr[1]));
      rw = rr[2];
    }
    if (k <= -2) M = concat(concat(M, translate(-rw, 0)), [-1, 0, 0, 1, 0, 0]);
    const [a, b, c, d, mtx, mty] = M;
    let ang2 = 0;
    if (tilt !== 0) {
      const v = k * HALF_PI + angle;
      ang2 = v < 0 ? -v : v;
    }
    const px0 = tx * a + ty * c;
    let py = mty + (tx * b + ty * d);
    const rr = applyRect(this.rect, M);
    const ref = state.referenceLocation;
    const refY = mty + (ref[0] * b + ref[1] * d);
    if (py < refY) py = rr[1] + (rr[1] + rr[3] - py);
    const px = mtx + px0;
    let t12: number;
    let z14 = 0;
    let z13 = 0;
    let z9 = 0;
    if (tilt !== 0) {
      const sn = sinf(ang2);
      const cs = cosf(ang2);
      const sec2 = fr(fr(1 / cs) * fr(1 / cs));
      const cp1 = cs + 1;
      const csc2x2 = fr(fr(1 / sn) * fr(1 / sn)) * 2;
      const p6 = powf(sinf(ang2 * 0.5), 6);
      let v = r * TWO_PI * (cp1 + csc2x2 * p6);
      v = v + py * 8 * fr(cs * cs) * sn;
      const v8 = v - r * 8 * fr(sn * sn);
      t12 = ((px / sn) * sinf(ang2 * 4) + v8) * sec2 * 0.125;
    } else {
      const pd = progress * D;
      z14 = D * 0.5;
      z13 = pd - z14;
      const absd = z13 < 0 ? -z13 : z13;
      const q = (z14 - absd + r * -PI) * 0.5;
      t12 = (z13 < 0 ? pd : z14) - q;
      z9 = pd + pd;
    }
    const half = isSpread(s) ? rr[2] * 0.5 : rr[2];
    const angAbs = ang2 < 0 ? -ang2 : ang2;
    const s10 = fr(angAbs);
    const reach = t12 * fr(Math.cos(s10)) + t12 * fr(Math.sin(s10)) * tanf(s10);
    if (reach > half) {
      t12 = half * fr(Math.cos(s10));
      let rNew: number;
      if (tilt !== 0) {
        const s4 = sinf(ang2 * 4);
        const sA = sinf(ang2);
        const cA = cosf(ang2);
        const w15 = (1 / sA) * (px * s4);
        const sec = 1 / cA;
        const secF = fr(sec);
        const w14 = py * 8 * sA;
        const tn = tanf(ang2);
        const sec2 = fr(secF * secF);
        const tn2 = fr(tn * tn);
        const w8 = t12 * 8 - w15 * sec2 - w14;
        const w13 = sec * PI + (sec2 * PI - tn2 * 4);
        let den = powf(sinf(ang2 * 0.5), 6) * TWO_PI;
        den = den * fr(fr(1 / sA) * fr(1 / sA));
        den = den * fr(fr(1 / cA) * fr(1 / cA));
        den = den + w13;
        den = den + den;
        rNew = w8 / den;
      } else {
        const tt = t12 + t12;
        rNew = (z13 >= 0 ? tt - z14 - z13 : z13 + (z14 + (tt - z9))) / PI;
      }
      if (rNew < minRadius) rNew = minRadius;
      r = rNew;
      radiusRef.value = rNew;
    }
    const proj = this.#diagonalLength * cosf(angAbs - this.#diagonalAngle);
    return t12 / (r + (proj < 0 ? -proj : proj));
  }
}

type Affine = [a: number, b: number, c: number, d: number, tx: number, ty: number];

const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];

function rotation(a: number): Affine {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, -s, c, 0, 0];
}

/** `t1` followed by `t2`. */
function concat(t1: Affine, t2: Affine): Affine {
  return [
    t1[0] * t2[0] + t1[1] * t2[2],
    t1[0] * t2[1] + t1[1] * t2[3],
    t1[2] * t2[0] + t1[3] * t2[2],
    t1[2] * t2[1] + t1[3] * t2[3],
    t1[4] * t2[0] + t1[5] * t2[2] + t2[4],
    t1[4] * t2[1] + t1[5] * t2[3] + t2[5],
  ];
}

function applyRect([x, y, w, h]: Rect, m: Affine): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ] as const) {
    xs.push(m[0] * px + m[2] * py + m[4]);
    ys.push(m[1] * px + m[3] * py + m[5]);
  }
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0];
}
