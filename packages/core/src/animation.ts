export type Bezier = readonly [x1: number, y1: number, x2: number, y2: number];

/** Timing curves of a turn. */
export const Easing = {
  /** Time and radius. */
  inOut: [0.44, 0, 0.56, 1],
  /** Angle of a page curling away. */
  curlOut: [0, 0, 0.44, 1],
  /** Angle of a page coming back down. */
  curlIn: [0.56, 0, 1, 1],
  /** Angle while settling after a drag. */
  ease: [0.25, 0.1, 0.25, 1],
} as const satisfies Record<string, Bezier>;

/** CSS-style cubic Bézier timing function. */
export function cubicBezier([x1, y1, x2, y2]: Bezier): (u: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (t: number) => ((ax * t + bx) * t + cx) * t;
  const y = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let t = u;
    for (let i = 0; i < 8; i++) {
      const e = x(t) - u;
      if (Math.abs(e) < 1e-7) return y(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0;
    let hi = 1;
    t = u;
    for (let i = 0; i < 40; i++) {
      const v = x(t);
      if (Math.abs(v - u) < 1e-7) break;
      if (v < u) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return y(t);
  };
}

/**
 * Animates one value from `from` to `to`. Without `to` it follows a moving target (the value a
 * drag sets), so the curl catches up with the finger.
 */
export class Tween {
  private readonly ease: (u: number) => number;

  constructor(
    readonly from: number,
    readonly to: number | undefined,
    readonly duration: number,
    timing: Bezier,
    readonly start: number,
  ) {
    this.ease = cubicBezier(timing);
  }

  value(now: number, target: number): number {
    const to = this.to ?? target;
    const u = this.duration > 0 ? Math.min(Math.max((now - this.start) / this.duration, 0), 1) : 1;
    return this.from + (to - this.from) * this.ease(u);
  }

  done(now: number): boolean {
    return now - this.start >= this.duration;
  }
}
