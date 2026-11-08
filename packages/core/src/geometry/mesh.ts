// Page-curl mesh. The page is wrapped around a cylinder whose axis sweeps across it as `time`
// goes from 0 to 1. The page is cut into strips perpendicular to the curl direction: the arc is
// sampled every 7.5° and at the page corners, and each sample is displaced along the curl
// direction. On top of the textured front and back faces the mesh carries 0.45 px anti-aliased
// fringes, a soft shadow cast on the page underneath and a three-step shadow around the rim of
// the curled-over back face.

import {
  copySign,
  expf,
  f16,
  fma,
  fma32,
  fms,
  fnma,
  fround,
  maxNum,
  minNum,
  negCosPoly,
  negSinPoly,
  oneMinusCosPoly,
  sinPoly,
} from './float.js';

export type Rgba = readonly [number, number, number, number];
export type Rect = readonly [x: number, y: number, width: number, height: number];

/** Vertex colour only. */
export const MODE_COLOR = 0;
/** Texture multiplied by the vertex colour. */
export const MODE_TEXTURE = 1;
/** Vertex colour multiplied by the texture's alpha. */
export const MODE_TINT = 2;
export type DrawMode = typeof MODE_COLOR | typeof MODE_TEXTURE | typeof MODE_TINT;

export interface CurlColors {
  /** Front face tint (straight RGBA, 0–1). */
  front: Rgba;
  /** Back face colour where it faces the viewer. */
  backNear: Rgba;
  /** Back face colour where it turns away, near the fold. */
  backFar: Rgba;
  /** Colour of the shadows. */
  shadow: Rgba;
}

export interface CurlMeshInput {
  /** Page size in CSS pixels. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel; the anti-aliased edges are sized in device pixels. */
  pixelRatio: number;
  /** Progress of the curl axis across the page, 0–1. */
  time: number;
  /** Direction the curl travels in, radians. */
  angle: number;
  /** Cylinder radius in CSS pixels. */
  radius: number;
  /** Arc range wrapped around the cylinder, radians (default 0 to π). */
  startAngle?: number;
  endAngle?: number;
  /** Draw the front face and the shadow it casts on the page underneath. */
  front: boolean;
  /** Draw the curled-over back face and its rim shadow. */
  back: boolean;
  colors: CurlColors;
  /** Area that receives shadows, in page coordinates (default: the page inset by 1 px). */
  shadowBounds?: Rect;
}

export interface MeshDraw {
  mode: DrawMode;
  /** First vertex and vertex count in `CurlMesh.vertices` (triangle strip). */
  first: number;
  count: number;
}

export interface CurlMesh {
  /**
   * Interleaved vertices, 8 floats each: x, y (CSS px), u, v (device px within the page),
   * r, g, b, a (premultiplied). Reused by the next call.
   */
  vertices: Float32Array;
  draws: MeshDraw[];
  /**
   * The part of the page still lying flat and untouched: the points (x, y), in CSS px, where
   * `x * flat[0] + y * flat[1] >= flat[2]`.
   */
  flat: readonly [number, number, number];
}

export const VERTEX_FLOATS = 8;

const HALF_PI = 1.5707963267948966;
const FRINGE = 0.44999998807907104; // 0.45 px as float32
const RIM_ALPHA = [0.5, 0.13500000536441803, 0] as const;
const RIM_STEP = [0.33000001311302185, 0.6600000262260437, 1] as const;
const RIM_PASS = 132; // vertex stride between the rim shadow's passes
const FAN_STEPS = 30;
const CLEAR: Rgba = [0, 0, 0, 0];
const WHITE: Rgba = [1, 1, 1, 1];

type Color = [number, number, number, number];

const toHalf = (c: Rgba): Color => [f16(c[0]), f16(c[1]), f16(c[2]), f16(c[3])];
const scaleColor = (c: Rgba, s: number): Color => [
  fround(c[0] * s),
  fround(c[1] * s),
  fround(c[2] * s),
  fround(c[3] * s),
];

/** Straight RGBA → premultiplied, quantised to 8 bits per channel. */
export function premultiply(c: Rgba): Color {
  const a = c[3];
  const q = (v: number) => fround(Math.round(v * 255) / 255);
  return [q(c[0] * a), q(c[1] * a), q(c[2] * a), q(a)];
}

/** sin/cos in float32, snapped to exact axis values within 0.001. */
function sinCos(angle: number): [number, number] {
  let s = fround(Math.sin(angle));
  let c = fround(Math.cos(angle));
  if (Math.abs(s) < 0.001 || Math.abs(c) < 0.001) {
    s = fround(Math.round(s));
    c = fround(Math.round(c));
  }
  return [s, c];
}

/**
 * Displacement along the curl direction of the point at distance `d`, for a fold line at
 * `fold`, radius `r` and arc range [lo, hi]. Also returns sin of the clamped arc angle, which
 * drives the back face shading.
 */
export function curlDisplace(
  d: number,
  fold: number,
  r: number,
  lo: number,
  hi: number,
): [displacement: number, sin: number] {
  const diff = fold - d;
  const theta = diff / r + HALF_PI;
  let clamped = theta > hi ? hi : theta;
  clamped = clamped < lo ? lo : clamped;
  const sin = sinPoly(clamped);
  if (theta < lo) return [0, sin];
  let v: number;
  if (theta < hi) {
    v = fround((theta - sin) * r);
  } else {
    v = fround((hi + negSinPoly(hi)) * r);
    v = fma(fma(HALF_PI - hi, r, diff), oneMinusCosPoly(hi), v);
  }
  return [fround(v + fround((sinPoly(lo) - lo) * r)), sin];
}

class VertexBuffer {
  readonly pos: Float32Array;
  readonly tex: Float32Array;
  readonly col: Float32Array;

  constructor(readonly size: number) {
    this.pos = new Float32Array(2 * size);
    this.tex = new Float32Array(2 * size);
    this.col = new Float32Array(4 * size);
  }

  clear(): void {
    this.pos.fill(0);
    this.tex.fill(0);
    this.col.fill(0);
  }

  set(i: number, x: number, y: number, u: number, v: number, c: Rgba): void {
    this.pos[2 * i] = x;
    this.pos[2 * i + 1] = y;
    this.tex[2 * i] = u;
    this.tex[2 * i + 1] = v;
    this.setColor(i, c);
  }

  setColor(i: number, c: Rgba): void {
    this.col.set(c, 4 * i);
  }

  x(i: number): number {
    return this.pos[2 * i] as number;
  }

  y(i: number): number {
    return this.pos[2 * i + 1] as number;
  }

  point(i: number): [number, number] {
    return [this.x(i), this.y(i)];
  }

  color(i: number): Color {
    const o = 4 * i;
    const c = this.col;
    return [c[o] as number, c[o + 1] as number, c[o + 2] as number, c[o + 3] as number];
  }

  copy(dst: number, src: VertexBuffer, from: number, n: number): void {
    this.pos.set(src.pos.subarray(2 * from, 2 * (from + n)), 2 * dst);
    this.tex.set(src.tex.subarray(2 * from, 2 * (from + n)), 2 * dst);
    this.col.set(src.col.subarray(4 * from, 4 * (from + n)), 4 * dst);
  }
}

interface Buffers {
  /** Main strip, its leading and trailing fringes. */
  main: VertexBuffer;
  lead: VertexBuffer;
  trail: VertexBuffer;
  /** Back face texture pass and, for a transparent back, its fringes. */
  backMain: VertexBuffer;
  backLead: VertexBuffer;
  backTrail: VertexBuffer;
  /** Rim shadow on either side of the back face, and its corners. */
  rimA: VertexBuffer;
  rimB: VertexBuffer;
  rimCap: VertexBuffer;
  fans: VertexBuffer;
  /** Shadow cast on the page underneath. */
  under: VertexBuffer;
  underLead: VertexBuffer;
  underTrail: VertexBuffer;
}

let shared: Buffers | null = null;

function buffers(): Buffers {
  if (!shared) {
    shared = {
      main: new VertexBuffer(68),
      lead: new VertexBuffer(68),
      trail: new VertexBuffer(68),
      backMain: new VertexBuffer(68),
      backLead: new VertexBuffer(68),
      backTrail: new VertexBuffer(68),
      rimA: new VertexBuffer(396),
      rimB: new VertexBuffer(396),
      rimCap: new VertexBuffer(12),
      fans: new VertexBuffer(720),
      under: new VertexBuffer(206),
      underLead: new VertexBuffer(206),
      underTrail: new VertexBuffer(206),
    };
  }
  for (const b of Object.values(shared)) b.clear();
  return shared;
}

/**
 * One sample of a strip: two vertices of the main strip at `inner0` and `inner1` along the
 * perpendicular, plus the anti-aliased fringes out to `outer0` / `outer1`, which fade to clear.
 */
function emitStrip(
  main: VertexBuffer,
  lead: VertexBuffer,
  trail: VertexBuffer,
  i: number,
  color: Rgba,
  baseX: number,
  baseY: number,
  texX: number,
  texY: number,
  perpX: number,
  perpY: number,
  perpTexX: number,
  perpTexY: number,
  outer0: number,
  outer1: number,
  inner0: number,
  inner1: number,
): void {
  const s0 = fround(inner0);
  const s1 = fround(inner1);
  const o0 = fround(outer0);
  const o1 = fround(outer1);
  const u0 = fround(fma(perpTexX, s0, texX));
  const v0 = fround(fma(perpTexY, s0, texY));
  const u1 = fround(fma(perpTexX, s1, texX));
  const v1 = fround(fma(perpTexY, s1, texY));
  const x0 = fround(fma(perpX, s0, baseX));
  const y0 = fround(fma(perpY, s0, baseY));
  const x1 = fround(fma(perpX, s1, baseX));
  const y1 = fround(fma(perpY, s1, baseY));
  lead.set(2 * i, fround(fma(perpX, o0, baseX)), fround(fma(perpY, o0, baseY)), u0, v0, CLEAR);
  lead.set(2 * i + 1, x0, y0, u0, v0, color);
  main.set(2 * i, x0, y0, u0, v0, color);
  main.set(2 * i + 1, x1, y1, u1, v1, color);
  trail.set(2 * i, x1, y1, u1, v1, color);
  trail.set(2 * i + 1, fround(fma(perpX, o1, baseX)), fround(fma(perpY, o1, baseY)), u1, v1, CLEAR);
}

/** Merges two descending lists. */
function mergeDescending(a: readonly number[], b: readonly number[], out: number[] = []): number[] {
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j === b.length) out.push(a[i++] as number);
    else if (i < a.length && (a[i] as number) > (b[j] as number)) out.push(a[i++] as number);
    else out.push(b[j++] as number);
  }
  return out;
}

interface Fan {
  center: [number, number];
  color: Rgba;
  start: [number, number];
  end: [number, number];
}

/** A rounded corner of the rim shadow: 30 steps from `start` to `end` around `center`. */
function emitFan(buf: VertexBuffer, index: number, { center, color, start, end }: Fan): void {
  let ax = start[0] - center[0];
  let ay = start[1] - center[1];
  const bx = end[0] - center[0];
  const by = end[1] - center[1];
  const la = Math.sqrt(fma(ay, ay, ax * ax));
  const lb = Math.sqrt(fma(by, by, bx * bx));
  const dot = fma(ax, bx, by * ay);
  const step = fround(Math.acos(fround(dot / (la * lb)))) * 0.034482758620689655; // ÷ 29
  const c = Math.cos(step);
  const s = Math.sin(step);
  for (let k = 0; k < FAN_STEPS; k++) {
    let ix = center[0];
    let iy = center[1];
    let prev: Rgba = color;
    for (let p = 0; p < 3; p++) {
      const base = index * 180 + p * 60 + 2 * k;
      const ox = fma(RIM_STEP[p], ax, center[0]);
      const oy = fma(RIM_STEP[p], ay, center[1]);
      const next = toHalf(scaleColor(color, fround(RIM_ALPHA[p])));
      buf.set(base, fround(ix), fround(iy), 0, 0, prev);
      buf.set(base + 1, fround(ox), fround(oy), 0, 0, next);
      prev = next;
      ix = ox;
      iy = oy;
    }
    const nx = fma(-s, ay, fma(c, ax, 0));
    const ny = fma(c, ay, fma(s, ax, 0));
    ax = nx;
    ay = ny;
  }
}

let output = new Float32Array(4096 * VERTEX_FLOATS);

/** Builds the curl mesh for one page. The returned vertex array is reused by the next call. */
export function buildCurlMesh(input: CurlMeshInput): CurlMesh {
  const { width: W, height: H, front: frontOn, back: backOn } = input;
  const scale = input.pixelRatio;
  const t = fround(input.time);
  const T = Number.isNaN(t) ? 0 : t < 0 ? 0 : t > 1 ? 1 : t;
  const R = fround(input.radius);
  const S0 = fround(input.startAngle ?? 0);
  const E = Math.max(fround(input.endAngle ?? Math.PI), S0);
  const [sinA, cosA] = sinCos(fround(input.angle));
  const sb = input.shadowBounds ?? (Math.min(W, H) > 0 ? [1, 1, W - 2, H - 2] : [0, 0, W, H]);
  const k = 1 / scale;

  const frontColor = toHalf(premultiply(input.colors.front));
  const white = toHalf(WHITE);
  const backFar = toHalf(premultiply(input.colors.backFar));
  const backNear = toHalf(premultiply(input.colors.backNear));
  const shadowColor = toHalf(premultiply(input.colors.shadow));

  const b = buffers();

  // Perpendicular to the curl direction, in CSS px (px, py) and device px (pdX, pdY).
  const px = -sinA;
  const py = cosA;
  const pdX = -sinA * scale;
  const pdY = cosA * scale;
  const dirX = cosA * scale;
  const dirY = sinA * scale;
  const srcW = W * scale;
  const srcH = H * scale;

  const theta1 = maxNum(S0, HALF_PI);
  let aaY = pdY !== 0 ? FRINGE : pdY;
  if (pdY <= 0) aaY = -aaY;
  let aaX = pdX !== 0 ? FRINGE : pdX;
  if (!(pdX >= 0)) aaX = -aaX;
  // The page corner the sample distances are measured from, and the opposite one (device px).
  const originX = pdY <= 0 ? srcW : 0;
  const oppX = pdY <= 0 ? 0 : srcW;
  const originY = pdX >= 0 ? srcH : 0;
  const oppY = pdX >= 0 ? 0 : srcH;
  const xB = pdX < 0 ? srcW : 0;
  const xA = pdX < 0 ? 0 : srcW;
  const yB = pdY <= 0 ? srcH : 0;
  const yA = pdY <= 0 ? 0 : srcH;
  const bX1 = py <= 0 ? W : 0;
  const bX2 = py <= 0 ? 0 : W;
  const bY1 = px >= 0 ? H : 0;
  const bY2 = px >= 0 ? 0 : H;
  const Px = k * originX;
  const Py = k * originY;

  // Fold line at time 0 and time 1.
  const arcLen = (HALF_PI - S0) * R;
  const fold0 = fma(bY1 - Py, sinA, -fma(Px - bX1, cosA, arcLen));
  const fold1 = fma(
    bY2 - Py,
    sinA,
    fma(bX2 - Px, cosA, (S0 + sinPoly(theta1) - (sinPoly(S0) + HALF_PI)) * R),
  );

  // Distances of the page corners (± the fringe) along the curl direction, sorted descending.
  const dW = oppX - originX;
  const dH = oppY - originY;
  const ax = copySign(fround(aaX), fround(dW));
  const ay = copySign(fround(aaY), fround(dH));
  const cornerOffsets: [number, number][] = [
    [dW + ax, dH + ay],
    [dW - ax, dH - ay],
    [-ax, dH + ay],
    [ax, dH - ay],
    [dW + ax, -ay],
    [dW - ax, ay],
    [ax, ay],
    [-ax, -ay],
  ];
  const kc = k * cosA;
  const ks = k * sinA;
  const corners = cornerOffsets.map(([x, y]) => fma(ks, y, x * kc));
  const nearest = corners[6] as number; // innermost corner distance (start of the page)
  const farthest = corners[1] as number; // innermost far corner distance (end of the page)
  corners.sort((p, q) => q - p);

  const fold = (fold1 - fold0) * T + fold0;
  const foldTop = fma(HALF_PI - theta1, R, fold);
  const g1 = theta1 - S0;
  const g2 = E - theta1;
  const step = R * 0.08333333333333333 * (g1 > g2 ? g1 : g2);

  // Arc samples every `step` (7.5° for the default range) around the cylinder.
  const arc: number[] = [];
  if (step === 0) {
    arc.push(foldTop, foldTop);
  } else {
    let hi = fold + arcLen;
    hi = farthest < hi ? farthest : hi;
    let lo = fma(HALF_PI - E, R, fold);
    lo = nearest > lo ? nearest : lo;
    const k0 = Math.trunc(maxNum(Math.floor(fround((foldTop - hi) / step)), -12));
    const k1 = Math.trunc(minNum(Math.ceil(fround((foldTop - lo) / step)), 12));
    for (let i = k0; i <= k1; i++) {
      let v = fms(step, i, foldTop);
      v = hi < v ? hi : v;
      v = lo > v ? lo : v;
      if (i <= 0) arc.push(v);
      if (i >= 0) arc.push(v);
    }
  }
  const samples = mergeDescending(arc, corners);
  const n = samples.length;

  // First sample on the back face (at or past the top of the cylinder).
  let backStart = 0;
  for (let v: number; ;) {
    v = samples[backStart++] as number;
    if (!(v > foldTop && backStart < n)) break;
  }
  // First sample inside the page, and last sample of the run that stays inside it.
  let first = 0;
  while ((samples[first] as number) > farthest) first++;
  let last = Math.max(first, n - 1);
  for (let i = first + 1; i <= Math.max(first, n - 1); i++) {
    if (!((samples[i] as number) >= nearest)) {
      last = i - 1;
      break;
    }
  }
  const backSpan = last - backStart;
  const backCount = (backSpan >= 0 ? backSpan : -1) + 1;

  // Strips across the page, for both faces.
  if (n >= 1) {
    const invPdX = 1 / pdX;
    const invPdY = 1 / pdY;
    const xBaa = xB + aaX;
    const xAaa = xA + aaX;
    const yBaa = yB + aaY;
    const yAaa = yA + aaY;
    const invAA = 1 / (Math.abs(dirX / dirY) + 1);
    const finX = Math.abs(invPdX) < Number.POSITIVE_INFINITY;
    const yZero = Math.abs(invPdY) > Number.MAX_VALUE;
    const pick = (cond: boolean, a: number, c: number) => (finX && (cond ? yZero : true) ? a : c);
    for (let i = 0; i < n; i++) {
      const d = samples[i] as number;
      const x = fma(d, dirX, originX);
      const y = fma(d, dirY, originY);
      // Where the perpendicular through this sample crosses the page edges: the strip itself
      // (strip0..strip1) and its anti-aliased fringe (fringe0..fringe1).
      const ta = (xBaa - x) * invPdX;
      const xa = aaX + x;
      const tb = (xA - xa) * invPdX;
      const tc = (yBaa - y) * invPdY;
      const strip0 = pick(tc > ta, ta, tc);
      const ya = aaY + y;
      const td = (yA - ya) * invPdY;
      const strip1 = pick(td < tb, tb, td);
      const te = (xB - xa) * invPdX;
      const tf = (xAaa - x) * invPdX;
      const tg = (yB - ya) * invPdY;
      const fringe0 = pick(tg > te, te, tg);
      const th = (yAaa - y) * invPdY;
      const fringe1 = pick(th < tf, tf, th);

      const [disp, sin] = curlDisplace(d, fold, R, S0, E);
      // Back face shading: mix from the near to the far colour as the surface turns away.
      let s = fma(sin, 2.5, -1.5000000596046448);
      s = s > 1 ? 1 : s < 0 ? 0 : s;
      let shade: number;
      if (s > 0.7549999952316284) {
        const q = s + -0.8199999928474426;
        shade = fma(q * q, 15, 0.4000000059604645);
      } else {
        shade = fma(s, 0.375, 0.3499999940395355) * s;
      }
      const sh = fround(shade);
      const om = fround(1 - sh);
      const backColor = toHalf([
        fma32(backFar[0], sh, fround(backNear[0] * om)),
        fma32(backFar[1], sh, fround(backNear[1] * om)),
        fma32(backFar[2], sh, fround(backNear[2] * om)),
        fma32(backFar[3], sh, fround(backNear[3] * om)),
      ]);

      const dd = d + disp;
      const baseX = fma(cosA, dd, Px);
      const baseY = fma(sinA, dd, Py);
      const outside = i < first || i > last;
      const mid = fma(fringe1 - fringe0, invAA, fringe0);
      const isEnd = i === 0 || i === n - 1;
      const color = isEnd ? CLEAR : i < backStart ? frontColor : backColor;
      emitStrip(
        b.main,
        b.lead,
        b.trail,
        i,
        color,
        baseX,
        baseY,
        x,
        y,
        px,
        py,
        pdX,
        pdY,
        fringe0,
        fringe1,
        outside ? mid : strip0,
        outside ? mid : strip1,
      );
    }
  }

  // The back reuses the strips with a white tint, so the texture shows through.
  const transparentBack = backNear[3] === 0;
  if (backOn) {
    b.backMain.copy(2 * backStart, b.main, 2 * backStart, 2 * backCount);
    if (backSpan >= 0) {
      for (let i = 0; i < Math.max(backSpan, -1) + 1; i++) {
        b.backMain.setColor(2 * (backStart + i), white);
        b.backMain.setColor(2 * (backStart + i) + 1, white);
      }
    }
    if (transparentBack) {
      const count = (n - backStart) * 2;
      b.backLead.copy(2 * backStart, b.lead, 2 * backStart, count);
      b.backTrail.copy(2 * backStart, b.trail, 2 * backStart, count);
      for (let i = backStart; i < n; i++) {
        b.backLead.setColor(2 * i + 1, white);
        b.backTrail.setColor(2 * i, white);
      }
    }
  }

  // Shadow bounds corners, picked by the curl direction.
  const [sbx, sby, sbw, sbh] = sb;
  const sbXmax = sbw + sbx;
  const sbYmax = sbh + sby;
  const sbYp = px >= 0 ? sbYmax : sby;
  const sbY6 = px >= 0 ? sby : sbYmax;
  const sbXA = px < 0 ? sbXmax : sbx;
  const sbXB = px < 0 ? sbx : sbXmax;
  const sbXq = py <= 0 ? sbXmax : sbx;
  const sbX7 = py <= 0 ? sbx : sbXmax;
  const sbYA = py <= 0 ? sbYmax : sby;
  const sbYB = py <= 0 ? sby : sbYmax;
  const cdx = sbXq - Px;
  const cdy = sbYp - Py;
  const edge1 = fma(sbYA - Py, sinA, (sbXA - Px) * cosA);
  const edge2 = fma(sbYB - Py, sinA, (sbXB - Px) * cosA);
  const invPx = 1 / px;
  const invPy = 1 / py;
  const pxFinite = Math.abs(invPx) < Number.POSITIVE_INFINITY;
  const pyZero = Math.abs(invPy) > Number.MAX_VALUE;
  const pickPerp = (cond: boolean, a: number, c: number) =>
    pxFinite && (cond ? pyZero : true) ? a : c;

  // The shadow around the rim of the curled-over back.
  let segments: number[] = [];
  let fanCount = 0;
  let axisAligned = false;
  let rimCount = 0;
  if (backOn) {
    const dFar = fma(cdy, sinA, cdx * cosA);
    if (fold > dFar) {
      const lowEnd = fma(HALF_PI - E, R, fold);
      const lowLimit = dFar > lowEnd ? dFar : lowEnd;
      // Samples from the top of the cylinder down to the far edge of the shadow bounds.
      const step2 = R * 0.02 * g2;
      const rim: number[] = [];
      let lastV: number;
      {
        let i = 0;
        let v = 0;
        for (; i < 50; i++) {
          v = fms(step2, i, foldTop);
          if (v <= lowLimit) break;
          rim.push(v);
        }
        if (i < 50) {
          rim.push(lowLimit);
          lastV = lowLimit;
        } else lastV = v;
      }
      let endV: number;
      const tailStep = (lastV - dFar) * 0.1;
      if (tailStep > 0) {
        endV = lastV;
        for (let j = 1; j <= 10; j++) {
          const v = fms(tailStep, j, lastV);
          if (v <= dFar) {
            rim.push(dFar);
            endV = dFar;
            break;
          }
          rim.push(v);
          endV = v;
        }
      } else endV = lastV;
      const rimN = rim.length;
      rim.push(endV);

      // The shadow bounds' corners split the rim into segments.
      const extra: number[] = [];
      const inc1 = edge1 > dFar && !(edge1 >= foldTop);
      if (inc1) extra.push(edge1);
      let doMerge = true;
      if (edge2 > dFar && edge2 < foldTop) {
        extra.push(edge2);
        if (extra.length === 2 && (extra[1] as number) > (extra[0] as number)) extra.reverse();
      } else if (rimN < 0) doMerge = inc1;
      const merged = doMerge ? mergeDescending(rim, extra) : [];
      const nX = doMerge ? extra.length : 0;
      const list: number[] = [];
      const splitAt: number[] = [];
      {
        let i = 0;
        let j = 0;
        while (i < merged.length || j < nX) {
          if (j === nX) list.push(merged[i++] as number);
          else if (i < merged.length && (merged[i] as number) > (extra[j] as number))
            list.push(merged[i++] as number);
          else {
            splitAt[j] = list.length;
            list.push(extra[j++] as number);
          }
        }
      }
      const cnt = list.length;
      splitAt[nX] = cnt - 2;
      // Corner kinds: 0 = first bounds corner, 2 = second, 1 = end of the rim, 4 = none.
      const kinds: number[] = [];
      for (let i = 0; i <= nX; i++) {
        const v = list[splitAt[i] as number];
        kinds[i] = v === endV ? 1 : v === edge1 ? 0 : v === edge2 ? 2 : 4;
      }
      fanCount = nX + 1;

      const t135 = T * 1.350000023841858;
      const lt04 = t135 < 0.4000000059604645;
      const le1 = t135 <= 1;
      const clampSel = !le1 || lt04;
      const small = lt04 && le1;
      const size1 = clampSel ? (small ? 68.00000101327896 : 170.0) : T * 229.50000405311584;
      if (cnt > 0) {
        const { rimA, rimB, rimCap, fans: fanBuf } = b;
        const shadowR = (fma(R, 0.30000001192092896, 30.0) * R) / (R + 50);
        const size2 = clampSel ? (small ? 72.0000010728836 : 180.0) : T * 243.00000429153442;
        const dSize = size2 - size1;
        const invR = 1 / R;
        const invSR = 1 / shadowR;
        const heights: number[] = [];
        for (let i = 0; i < cnt; i++) {
          const d = list[i] as number;
          const x = fma(d, cosA, Px);
          const y = fma(d, sinA, Py);
          const [disp] = curlDisplace(d, fold, R, S0, E);
          const t1 = (sbXA - x) * invPx;
          const t2 = (sbXB - x) * invPx;
          const t3 = (sbYA - y) * invPy;
          const tl = pickPerp(t3 > t1, t1, t3);
          const t4 = (sbYB - y) * invPy;
          const tr = pickPerp(t4 < t2, t2, t4);
          let th = (fold - d) * invR;
          th = th > HALF_PI ? HALF_PI : th;
          const h = sinPoly(th) * shadowR;
          const xd = fma(cosA, disp, x);
          const yd = fma(sinA, disp, y);
          const a255 = fms(fma(h, invSR, -1), dSize, size1);
          heights.push(h);
          const c = toHalf(scaleColor(shadowColor, fround(a255 * 0.00392156862745098)));
          rimA.set(2 * i + 1, fround(fma(tl, px, xd)), fround(fma(tl, py, yd)), 0, 0, c);
          rimB.set(2 * i, fround(fma(tr, px, xd)), fround(fma(tr, py, yd)), 0, 0, c);
        }

        // Edge normals, segments and the three passes of the falloff.
        segments = [0];
        let seg = 1;
        let n1x = 0;
        let n1y = 0;
        let n2x = 0;
        let n2y = 0;
        for (let i = 0; i < cnt; i++) {
          segments[seg - 1] = (segments[seg - 1] as number) + 1;
          let found: boolean;
          let kind: number;
          if (i === splitAt[0]) {
            found = true;
            kind = kinds[0] as number;
            segments[seg++] = 0;
          } else {
            let hit = -1;
            for (let j = 0; j !== nX;) {
              const v = splitAt[j + 1];
              j++;
              if (i === v) {
                hit = j;
                break;
              }
            }
            if (hit >= 0) {
              found = hit - 1 < nX;
              kind = kinds[hit] as number;
              segments[seg++] = 0;
            } else {
              found = false;
              kind = 4;
            }
          }
          if (i < cnt - 1) {
            if (!found || kind === 2) {
              const skip = (kind === 2 ? found : false) && i < cnt - 2;
              const j = (skip ? 5 : 3) + 2 * i;
              const a = rimA.y(j) - rimA.y(2 * i + 1);
              const c = rimA.x(2 * i + 1) - rimA.x(j);
              const inv = 1 / Math.sqrt(fma(c, c, a * a));
              const ux = inv * a;
              const uy = inv * c;
              if (
                Math.abs(ux) < Number.POSITIVE_INFINITY &&
                Math.abs(uy) < Number.POSITIVE_INFINITY
              ) {
                n1x = ux;
                n1y = uy;
              }
            }
            if (kind === 0 || !found) {
              const skip = (kind === 0 ? found : false) && i < cnt - 2;
              const j = (skip ? 4 : 2) + 2 * i;
              const c = rimB.x(j) - rimB.x(2 * i);
              const a = rimB.y(2 * i) - rimB.y(j);
              const inv = 1 / Math.sqrt(fma(c, c, a * a));
              const ux = inv * a;
              const uy = inv * c;
              if (
                Math.abs(ux) < Number.POSITIVE_INFINITY &&
                Math.abs(uy) < Number.POSITIVE_INFINITY
              ) {
                n2x = ux;
                n2y = uy;
              }
            }
          }
          const h = heights[i] as number;
          emitRimPasses(rimA, 2 * i + 1, 2 * i, n1x * h, n1y * h);
          emitRimPasses(rimB, 2 * i, 2 * i + 1, n2x * h, n2y * h);
        }

        // Rounded corners where the rim turns.
        axisAligned = Math.abs(cosA) === 1 || cosA === 0;
        const fans: Fan[] = [];
        if (axisAligned) {
          const h = heights[cnt - 1] as number;
          const ia = 2 * cnt - 1;
          const ib = 2 * cnt - 2;
          const pa = rimA.point(ia);
          const pb = rimB.point(ib);
          const colA = rimA.color(ia);
          const colB = rimB.color(ib);
          let ca: Rgba = colA;
          let cb: Rgba = colB;
          let ia0 = pa[0];
          let ia1 = pa[1];
          let ib0 = pb[0];
          let ib1 = pb[1];
          for (let p = 0; p < 3; p++) {
            const o = 4 * p;
            const s = fround(RIM_ALPHA[p]);
            const off = RIM_STEP[p] * h;
            rimCap.set(o, fround(ia0), fround(ia1), 0, 0, ca);
            ca = toHalf(scaleColor(colA, s));
            ia0 = fma(cosA, off, pa[0]);
            ia1 = fma(sinA, off, pa[1]);
            rimCap.set(o + 1, fround(ia0), fround(ia1), 0, 0, ca);
            rimCap.set(o + 2, fround(ib0), fround(ib1), 0, 0, cb);
            cb = toHalf(scaleColor(colB, s));
            ib0 = fma(cosA, off, pb[0]);
            ib1 = fma(sinA, off, pb[1]);
            rimCap.set(o + 3, fround(ib0), fround(ib1), 0, 0, cb);
          }
          fans.push({
            center: pa,
            color: rimA.color(ia),
            start: rimA.point(2 * RIM_PASS + 2 * cnt - 2),
            end: rimCap.point(9),
          });
          fans.push({
            center: pb,
            color: rimB.color(ib),
            start: rimCap.point(11),
            end: rimB.point(2 * RIM_PASS + 2 * cnt - 1),
          });
          fanCount = 2;
        } else {
          const P2 = 2 * RIM_PASS;
          for (let e = 0; e < nX + 1; e++) {
            const w = splitAt[e] as number;
            const kind = kinds[e];
            if (kind === 0 && w >= 1 && w < cnt - 2) {
              fans.push({
                center: rimA.point(2 * w + 1),
                color: rimA.color(2 * w + 1),
                start: rimA.point(P2 + 2 * w),
                end: rimA.point(P2 + 2 * w + 2),
              });
            } else if (kind === 2 && w >= 1 && w < cnt - 2) {
              fans.push({
                center: rimB.point(2 * w),
                color: rimB.color(2 * w),
                start: rimB.point(P2 + 2 * w + 3),
                end: rimB.point(P2 + 2 * w + 1),
              });
            } else if (kind === 1) {
              fans.push({
                center: rimA.point(2 * w + 1),
                color: rimA.color(2 * w + 1),
                start: rimA.point(P2 + 2 * w),
                end: rimB.point(P2 + 2 * w + 1),
              });
            } else {
              fans.push({ center: [0, 0], color: CLEAR, start: [0, 0], end: [0, 0] });
            }
          }
        }
        for (let i = 0; i < fans.length; i++) emitFan(fanBuf, i, fans[i] as Fan);
      } else {
        segments = [0];
      }
      rimCount = cnt;
    }
  }

  // The shadow the page casts on the one underneath.
  let underCount = 0;
  if (frontOn) {
    const hiLim = fold + arcLen;
    const proj1 = fma(cdy, sinA, cdx * cosA);
    const proj2 = fma(sbY6 - Py, sinA, (sbX7 - Px) * cosA);
    const r01 = R * 0.01;
    const lowU = proj1 > fold ? proj1 : fold;
    const hiU = proj2 < hiLim ? proj2 : hiLim;
    const k0 = Math.trunc(maxNum(Math.floor(fround(maxNum(hiU - fold, 0) / -(r01 * g1))), -100));
    const u: number[] = [];
    if (!(k0 > 0)) {
      const st = r01 * g1;
      for (let i = k0; i <= 0; i++) {
        let v = fms(fround(i), st, fold);
        v = v > hiU ? hiU : v;
        u.push(lowU > v ? lowU : v);
      }
    }
    const ext: number[] = [];
    if (edge1 > lowU && !(edge1 >= hiU)) ext.push(edge1);
    let go = true;
    if (edge2 > lowU && edge2 < hiU) {
      ext.push(edge2);
      if (ext.length === 2 && (ext[1] as number) > (ext[0] as number)) ext.reverse();
    } else if (!(u.length > 0) && ext.length === 0) go = false;
    const list = go ? mergeDescending(u, ext) : [];
    const [disp0] = curlDisplace(fold, fold, R, S0, E);
    if (list.length >= 1) {
      const r04 = R * 0.4000000059604645;
      const invR = 1 / R;
      const falloff = (q: number) => {
        const m = maxNum(fma(q, invR, -0.949999988079071), 0);
        return expf(fround(m * m * -9));
      };
      const e0 = falloff(fma(R, 0.3997459863740352, arcLen) - disp0);
      const e0sq = e0 * e0;
      const baseVal = fnma(e0sq, e0sq, e0);
      const amp = minNum(T * 15, 1) * 76.5;
      const hiFold = fold + arcLen;
      for (let i = 0; i < list.length; i++) {
        const d = list[i] as number;
        const x = fma(d, cosA, Px);
        const y = fma(d, sinA, Py);
        const [disp] = curlDisplace(d, fold, R, S0, E);
        const t1 = (sbXA - x) * invPx;
        const t2 = (sbXB - x) * invPx;
        const t3 = (sbYA - y) * invPy;
        const tl = pickPerp(t3 > t1, t1, t3);
        const t4 = (sbYB - y) * invPy;
        const tr = pickPerp(t4 < t2, t2, t4);
        const lift = negCosPoly(fma(fold - d, invR, HALF_PI)) + 1;
        const h = r04 * lift;
        const off = fms(r04, lift, disp);
        const bx = fma(off, cosA, x);
        const by = fma(off, sinA, y);
        const e = falloff(fma(r04, lift, hiFold - (d + disp)));
        let alpha = amp * fma(e * e, e * e, baseVal + e);
        const span = tr - tl;
        const half = span * 0.5;
        if (!(half >= h)) alpha = alpha * ((span * 0.25) / h + 0.5);
        const hh = h < half ? h : half;
        const c = toHalf(scaleColor(shadowColor, fround(alpha * 0.00392156862745098)));
        emitStrip(
          b.under,
          b.underLead,
          b.underTrail,
          i,
          c,
          bx,
          by,
          0,
          0,
          px,
          py,
          0,
          0,
          fms(r04, lift, tl),
          fma(r04, lift, tr),
          hh + tl,
          tr - hh,
        );
      }
      underCount = list.length;
    }
  }

  // Everything goes into one vertex array, in drawing order.
  const draws: MeshDraw[] = [];
  let used = 0;
  const push = (mode: DrawMode, buf: VertexBuffer, start: number, count: number) => {
    if (count <= 0) return;
    if ((used + count) * VERTEX_FLOATS > output.length) {
      const grown = new Float32Array(Math.max(output.length * 2, (used + count) * VERTEX_FLOATS));
      grown.set(output.subarray(0, used * VERTEX_FLOATS));
      output = grown;
    }
    for (let i = 0; i < count; i++) {
      const s = start + i;
      const o = (used + i) * VERTEX_FLOATS;
      output[o] = buf.pos[2 * s] as number;
      output[o + 1] = buf.pos[2 * s + 1] as number;
      output[o + 2] = buf.tex[2 * s] as number;
      output[o + 3] = buf.tex[2 * s + 1] as number;
      output[o + 4] = buf.col[4 * s] as number;
      output[o + 5] = buf.col[4 * s + 1] as number;
      output[o + 6] = buf.col[4 * s + 2] as number;
      output[o + 7] = buf.col[4 * s + 3] as number;
    }
    draws.push({ mode, first: used, count });
    used += count;
  };
  const frontCount = Math.max(backStart - first, 0);
  if (frontOn) {
    push(MODE_COLOR, b.under, 0, 2 * underCount);
    push(MODE_COLOR, b.underLead, 0, 2 * underCount);
    push(MODE_COLOR, b.underTrail, 0, 2 * underCount);
    push(MODE_TEXTURE, b.main, 2 * first, 2 * frontCount);
    push(MODE_TEXTURE, b.lead, 0, 2 * backStart);
    push(MODE_TEXTURE, b.trail, 0, 2 * backStart);
  }
  if (backOn) {
    if (rimCount !== 0) {
      for (let p = 0; p < 3; p++) {
        let o = 0;
        for (const count of segments) {
          push(MODE_COLOR, b.rimA, RIM_PASS * p + o, 2 * count);
          push(MODE_COLOR, b.rimB, RIM_PASS * p + o, 2 * count);
          o += 2 * count;
        }
        if (axisAligned) push(MODE_COLOR, b.rimCap, 4 * p, 4);
        for (let e = 0; e < fanCount; e++) push(MODE_COLOR, b.fans, e * 180 + p * 60, 60);
      }
    }
    const tail = 2 * (n - backStart);
    push(MODE_TEXTURE, b.backMain, 2 * backStart, 2 * backCount);
    if (transparentBack) {
      push(MODE_TEXTURE, b.backLead, 2 * backStart, tail);
      push(MODE_TEXTURE, b.backTrail, 2 * backStart, tail);
    }
    push(MODE_TINT, b.main, 2 * backStart, 2 * backCount);
    push(MODE_TINT, b.lead, 2 * backStart, tail);
    push(MODE_TINT, b.trail, 2 * backStart, tail);
  }
  // Points past the start of the cylinder aren't displaced at all (see curlDisplace).
  const flatFrom = fold + arcLen + Px * cosA + Py * sinA;
  return {
    vertices: output.subarray(0, used * VERTEX_FLOATS),
    draws,
    flat: [cosA, sinA, flatFrom],
  };
}

/**
 * The rim shadow's three falloff passes: each pass is a strip from the previous pass's outer edge
 * out to the next step along (ox, oy). `edge` is the vertex on the back face's edge and `outer`
 * the slot that holds each pass's outer vertex.
 */
function emitRimPasses(
  buf: VertexBuffer,
  edge: number,
  outer: number,
  ox: number,
  oy: number,
): void {
  const bx = buf.x(edge);
  const by = buf.y(edge);
  const color = buf.color(edge);
  let prevX = 0;
  let prevY = 0;
  let prevC: Rgba = CLEAR;
  for (let p = 0; p < 3; p++) {
    if (p > 0) buf.set(p * RIM_PASS + edge, fround(prevX), fround(prevY), 0, 0, prevC);
    prevX = fma(RIM_STEP[p], ox, bx);
    prevY = fma(RIM_STEP[p], oy, by);
    const c = toHalf(scaleColor(color, fround(RIM_ALPHA[p])));
    buf.set(p * RIM_PASS + outer, fround(prevX), fround(prevY), 0, 0, c);
    prevC = c;
  }
}
