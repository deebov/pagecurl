// Ornaments, drawn as paths in page units: vine borders that grow along a frame, guilloché
// (the turned line work of banknotes), a dotted ground for initials, fleurons and rules.

type Ctx = CanvasRenderingContext2D;
type Point = [number, number];
const TAU = Math.PI * 2;

/** A stroke that tapers from w0 to w1 along its points, filled as one shape. */
export function taper(ctx: Ctx, pts: Point[], w0: number, w1: number): void {
  if (pts.length < 2) return;
  const left: Point[] = [];
  const right: Point[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)] as Point;
    const b = pts[Math.min(pts.length - 1, i + 1)] as Point;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    left.push([p[0] - (dy / len) * w, p[1] + (dx / len) * w]);
    right.push([p[0] + (dy / len) * w, p[1] - (dx / len) * w]);
  });
  ctx.beginPath();
  ctx.moveTo(...(left[0] as Point));
  for (const p of left) ctx.lineTo(...p);
  for (const p of right.reverse()) ctx.lineTo(...p);
  ctx.closePath();
  ctx.fill();
  const end = pts[pts.length - 1] as Point;
  ctx.beginPath();
  ctx.arc(end[0], end[1], w1 / 2, 0, TAU);
  ctx.fill();
}

/** A tendril: leaves `from` heading at angle `a`, then winds into a spiral. */
export function curl(
  ctx: Ctx,
  from: Point,
  a: number,
  size: number,
  turn: 1 | -1,
  width = 0.7,
): Point {
  const pts: Point[] = [];
  let [x, y] = from;
  let heading = a;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([x, y]);
    const step = (size / steps) * 2.4 * (1 - t * 0.75);
    heading += turn * (0.02 + t * t * 0.32);
    x += Math.cos(heading) * step;
    y += Math.sin(heading) * step;
  }
  taper(ctx, pts, width, width * 0.3);
  const end = pts[pts.length - 1] as Point;
  ctx.beginPath();
  ctx.arc(end[0], end[1], width * 0.75, 0, TAU);
  ctx.fill();
  return end;
}

/** An almond leaf with its midrib cut out. */
export function leaf(ctx: Ctx, at: Point, a: number, length: number, width: number): void {
  ctx.save();
  ctx.translate(...at);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(length * 0.3, -width, length * 0.75, -width * 0.8, length, 0);
  ctx.bezierCurveTo(length * 0.75, width * 0.8, length * 0.3, width, 0, 0);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = width * 0.22;
  ctx.beginPath();
  ctx.moveTo(length * 0.15, 0);
  ctx.quadraticCurveTo(length * 0.55, width * 0.08, length * 0.85, 0);
  ctx.stroke();
  ctx.restore();
}

/** A flower of `petals` round petals with a hollow eye. */
export function flower(ctx: Ctx, at: Point, r: number, petals = 8): void {
  ctx.save();
  ctx.translate(...at);
  for (let i = 0; i < petals; i++) {
    ctx.save();
    ctx.rotate((i / petals) * TAU);
    ctx.beginPath();
    ctx.ellipse(r * 0.55, 0, r * 0.42, r * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.26, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.13, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * A vine running from a to b: a stem waving across a band `width` wide, a tendril curling into
 * each bay it leaves, a leaf where it crosses the middle and a bud on each crest.
 */
export function vine(ctx: Ctx, a: Point, b: Point, width: number): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const base = Math.atan2(uy, ux);
  const waves = Math.max(1, Math.round(length / (width * 2.3)));
  const amp = width * 0.24;
  const at = (s: number): Point => {
    const off = amp * Math.sin((s / length) * waves * TAU);
    return [a[0] + ux * s - uy * off, a[1] + uy * s + ux * off];
  };
  const half = length / (waves * 2);
  const stem: Point[] = [];
  for (let i = 0; i <= waves * 32; i++) stem.push(at((i / (waves * 32)) * length));
  taper(ctx, stem, width * 0.1, width * 0.1);
  for (let k = 0; k < waves * 2; k++) {
    // the stem rises to a crest on one side (1: toward the normal of a→b, turned clockwise), then
    // comes back through the middle
    const side = k % 2 === 0 ? 1 : -1;
    const crest = (k + 0.5) * half;
    // a tendril leaves just past the crest and curls down into the hollow beneath it
    curl(
      ctx,
      at(crest + half * 0.2),
      base - side * 0.95,
      width * 0.42,
      side === 1 ? -1 : 1,
      width * 0.075,
    );
    // a bud on the crest, pointing out
    leaf(ctx, at(crest - half * 0.1), base + side * 1.25, width * 0.2, width * 0.09);
    // a leaf where the stem crosses the middle, reaching toward the next crest
    leaf(ctx, at((k + 1) * half), base - side * 0.7, width * 0.36, width * 0.12);
  }
}

/** A frame: rules inside and out, a vine along each side, and a flower in a box at each corner. */
export function vineFrame(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  band: number,
): void {
  const rule = band * 0.07;
  ctx.lineWidth = rule;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeRect(x + band, y + band, w - band * 2, h - band * 2);
  ctx.lineWidth = rule * 0.5;
  ctx.strokeRect(x - band * 0.14, y - band * 0.14, w + band * 0.28, h + band * 0.28);
  const m = band / 2;
  const inset = band;
  vine(ctx, [x + inset, y + m], [x + w - inset, y + m], band);
  vine(ctx, [x + w - m, y + inset], [x + w - m, y + h - inset], band);
  vine(ctx, [x + w - inset, y + h - m], [x + inset, y + h - m], band);
  vine(ctx, [x + m, y + h - inset], [x + m, y + inset], band);
  for (const [cx, cy] of [
    [x, y],
    [x + w - band, y],
    [x, y + h - band],
    [x + w - band, y + h - band],
  ] as Point[]) {
    ctx.lineWidth = rule;
    ctx.strokeRect(cx, cy, band, band);
    flower(ctx, [cx + band / 2, cy + band / 2], band * 0.36);
  }
}

/**
 * Guilloché: a band of wavy rings, each shifted a little further round than the last, so they
 * cross and weave like the line work of a banknote.
 */
export function rosette(
  ctx: Ctx,
  at: Point,
  outer: number,
  inner: number,
  options: { lines?: number; lobes?: number; line?: number } = {},
): void {
  const lines = options.lines ?? 36;
  const lobes = options.lobes ?? 12;
  ctx.lineWidth = options.line ?? 0.22;
  const mid = (outer + inner) / 2;
  const amp = (outer - inner) / 2;
  for (let i = 0; i < lines; i++) {
    const phase = (i / lines) * TAU;
    ctx.beginPath();
    for (let s = 0; s <= 900; s++) {
      const t = (s / 900) * TAU;
      const r =
        mid + amp * (0.62 * Math.sin(lobes * t + phase) + 0.38 * Math.sin(lobes * 2 * t - phase));
      const px = at[0] + Math.cos(t) * r;
      const py = at[1] + Math.sin(t) * r;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

/** Nested families of petals round a centre, another guilloché figure. */
export function spirograph(
  ctx: Ctx,
  at: Point,
  R: number,
  options: { loops?: number; copies?: number; line?: number; depth?: number } = {},
): void {
  const loops = options.loops ?? 24;
  const copies = options.copies ?? 10;
  const depth = options.depth ?? 0.42;
  ctx.lineWidth = options.line ?? 0.2;
  for (let c = 0; c < copies; c++) {
    const k = c / copies;
    const radius = R * (1 - k * 0.55);
    const phase = k * Math.PI;
    ctx.beginPath();
    for (let s = 0; s <= 1440; s++) {
      const t = (s / 1440) * TAU;
      const r = radius * (1 - depth * (0.5 - 0.5 * Math.cos(loops * t + phase)));
      const px = at[0] + Math.cos(t) * r;
      const py = at[1] + Math.sin(t) * r;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

/** A field of fine wavy lines filling a rectangle, as on the ground of a banknote. */
export function waves(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { gap?: number; line?: number; amp?: number; period?: number } = {},
): void {
  const gap = options.gap ?? 1.1;
  const amp = options.amp ?? 1.6;
  const period = options.period ?? 9;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.lineWidth = options.line ?? 0.2;
  for (let j = -4; j * gap < h + 8; j++) {
    const y0 = y + j * gap;
    ctx.beginPath();
    for (let s = 0; s <= w; s += 0.5) {
      const py =
        y0 +
        amp * Math.sin(((x + s) / period) * TAU + j * 0.35) +
        amp * 0.4 * Math.sin(((x + s) / (period * 3.1)) * TAU - j * 0.2);
      if (s === 0) ctx.moveTo(x + s, py);
      else ctx.lineTo(x + s, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Criblé: a ground of dots punched into the metal, for an initial to sit on. */
export function crible(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  rand: () => number,
): void {
  const step = 1.7;
  for (let j = 0.6; j < h; j += step) {
    for (let i = 0.6 + ((j / step) % 2) * (step / 2); i < w; i += step) {
      ctx.beginPath();
      ctx.arc(
        x + i + (rand() - 0.5) * 0.3,
        y + j + (rand() - 0.5) * 0.3,
        0.42 + rand() * 0.18,
        0,
        TAU,
      );
      ctx.fill();
    }
  }
}

/** A fleuron: a sprig with a flower at its head, tendrils and leaves either side. */
export function fleuron(ctx: Ctx, at: Point, size: number): void {
  const [x, y] = at;
  taper(
    ctx,
    [
      [x, y + size * 0.55],
      [x, y - size * 0.1],
    ],
    size * 0.07,
    size * 0.07,
  );
  for (const side of [1, -1] as const) {
    curl(
      ctx,
      [x, y + size * 0.15],
      -Math.PI / 2 + side * 1.45,
      size * 0.33,
      side === 1 ? 1 : -1,
      size * 0.055,
    );
    leaf(ctx, [x, y + size * 0.42], Math.PI / 2 - side * 2.1, size * 0.36, size * 0.11);
  }
  flower(ctx, [x, y - size * 0.25], size * 0.22, 6);
}

/** A thick rule with a thin one beside it. */
export function rules(ctx: Ctx, x: number, y: number, w: number, gap = 1.6): void {
  ctx.fillRect(x, y, w, 0.9);
  ctx.fillRect(x, y + gap + 0.9, w, 0.3);
}
