import type { CurlMeshInput, Rgba } from '../src/index.js';

/** A small deterministic generator, so the cases are the same on every run. */
export function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 2 ** 32;
  };
}

export function meshCases(count: number): CurlMeshInput[] {
  const rnd = random(12345);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
  const color = (): Rgba => [rnd(), rnd(), rnd(), pick([1, rnd()])];
  const cases: CurlMeshInput[] = [];
  for (let i = 0; i < count; i++) {
    const width = pick([320, 300.5, 640, 200, 1024, 37]);
    const height = pick([480, 700, 512.25, 90]);
    const axis = rnd() < 0.25;
    cases.push({
      width,
      height,
      pixelRatio: pick([1, 2, 3, 1.5, 2.625]),
      time: pick([0, 1, rnd(), rnd(), rnd(), -0.2, 1.3]),
      angle: axis
        ? pick([0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, -Math.PI / 2]) +
          (rnd() < 0.3 ? 1e-4 : 0)
        : (rnd() * 4 - 1) * Math.PI,
      radius: pick([1, 5, 20 + rnd() * 100, 150, 0.5 + rnd() * 300]),
      startAngle: rnd() < 0.8 ? 0 : rnd() * 1.4,
      endAngle: rnd() < 0.8 ? Math.PI : 1.6 + rnd() * 1.5,
      front: rnd() < 0.85,
      back: rnd() < 0.85,
      colors: {
        front: rnd() < 0.7 ? [1, 1, 1, 1] : color(),
        backNear: rnd() < 0.3 ? [1, 1, 1, 0] : color(),
        backFar: color(),
        shadow: color(),
      },
      shadowBounds:
        rnd() < 0.7
          ? undefined
          : [rnd() * 20 - 10, rnd() * 20 - 10, width - rnd() * 30, height - rnd() * 30],
    });
  }
  return cases;
}

/** FNV-1a over the bits of the given numbers, as float64. */
export function hash(values: Iterable<number>): string {
  const view = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  for (const v of values) {
    view.setFloat64(0, v === 0 ? 0 : v);
    for (let i = 0; i < 8; i++) h = Math.imul(h ^ view.getUint8(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
