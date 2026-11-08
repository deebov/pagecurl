// Deterministic float helpers. The mesh is computed with float32 rounding, fused multiply-adds
// and float16 colours, so it comes out identical on every engine.

export const fround = Math.fround;

const scratch = new Float64Array(1);
const words = new Uint32Array(scratch.buffer); // little-endian: [low, high]

/** The adjacent double to `x` in the direction of `sign`. */
function nextAfter(x: number, sign: number): number {
  if (sign === 0 || !Number.isFinite(x)) return x;
  if (x === 0) return sign > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  scratch[0] = x;
  if (x > 0 === sign > 0) {
    words[0] = (words[0] as number) + 1;
    if (words[0] === 0) words[1] = (words[1] as number) + 1;
  } else {
    if (words[0] === 0) words[1] = (words[1] as number) - 1;
    words[0] = (words[0] as number) - 1;
  }
  return scratch[0] as number;
}

/** float32 `a * b + c` with a single rounding (a and b are float32, so a * b is exact). */
export function fma32(a: number, b: number, c: number): number {
  const p = a * b;
  const s = p + c;
  const v = s - p;
  const err = p - (s - v) + (c - v);
  const r = fround(s);
  if (err === 0 || !Number.isFinite(s) || r === s) return r;
  return fround(nextAfter(s, err));
}

const SPLIT = 134217729; // 2^27 + 1

/** float64 `a * b + c` with a single rounding. */
export function fma(a: number, b: number, c: number): number {
  const p = a * b;
  if (!Number.isFinite(p)) return p + c;
  let t = SPLIT * a;
  const ah = t - (t - a);
  const al = a - ah;
  t = SPLIT * b;
  const bh = t - (t - b);
  const bl = b - bh;
  const pe = ah * bh - p + ah * bl + al * bh + al * bl;
  if (pe === 0 || !Number.isFinite(c)) return p + c;
  const s = p + c;
  const v = s - p;
  return s + (p - (s - v) + (c - v) + pe);
}

/** `c - a * b` with a single rounding. */
export const fms = (a: number, b: number, c: number): number => fma(-a, b, c);
/** `-(a * b) - c` with a single rounding. */
export const fnma = (a: number, b: number, c: number): number => -fma(a, b, c);
/** max/min that ignore NaN operands. */
export const maxNum = (a: number, b: number): number =>
  Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b);
export const minNum = (a: number, b: number): number =>
  Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b);
export const copySign = (magnitude: number, sign: number): number => {
  const m = Math.abs(magnitude);
  return sign < 0 || Object.is(sign, -0) ? -m : m;
};
export const expf = (x: number): number => fround(Math.exp(x));

function f16Fallback(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const sign = Math.sign(x);
  const a = Math.abs(x);
  if (a >= 65520) return sign * Number.POSITIVE_INFINITY;
  const quantum = 2 ** (Math.max(Math.floor(Math.log2(a)), -14) - 10);
  const m = a / quantum;
  const floor = Math.floor(m);
  const frac = m - floor;
  return sign * (frac > 0.5 || (frac === 0.5 && floor % 2 === 1) ? floor + 1 : floor) * quantum;
}

/** Rounds to the nearest float16. */
export const f16: (x: number) => number =
  (Math as { f16round?: (x: number) => number }).f16round ?? f16Fallback;

// Minimax polynomials on [0, π/2] with float32 coefficients.
const S1 = 0.9844167828559875;
const S3 = -0.15346269309520721;
const S5 = 0.0054653966799378395;
const C0 = 0.0013932585716247559;
const C2 = 0.4953497052192688;
const C4 = -0.0392276905477047;
const C6 = 0.0009696679771877825;
const N0 = -0.9986067414283752;

export function sinPoly(x: number): number {
  const s = fround(x);
  const x2 = fround(s * s);
  return fround(fma32(fma32(x2, S5, S3), x2, S1) * s);
}

export function negSinPoly(x: number): number {
  const s = fround(x);
  const x2 = fround(s * s);
  return fround(fma32(fma32(x2, -S5, -S3), x2, -S1) * s);
}

/** 1 - cos(x) */
export function oneMinusCosPoly(x: number): number {
  const s = fround(x);
  const x2 = fround(s * s);
  return fma32(fma32(fma32(x2, C6, C4), x2, C2), x2, C0);
}

/** -cos(x) */
export function negCosPoly(x: number): number {
  const s = fround(x);
  const x2 = fround(s * s);
  return fma32(fma32(fma32(x2, C6, C4), x2, C2), x2, N0);
}
