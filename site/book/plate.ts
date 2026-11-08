// A page before it's printed: three layers drawn in page units, each one coverage for one
// channel of the press (see press.ts for what each channel means on each material), and the
// position of every word, for the invisible text layer over the page.

export const SERIF = '"EB Garamond", Garamond, Georgia, serif';
export const BLACKLETTER = '"UnifrakturMaguntia", "EB Garamond", serif';

/** Text on the page: left, top and font size in page units, its width, and its face. */
export interface Run {
  text: string;
  x: number;
  top: number;
  size: number;
  width: number;
  italic: boolean;
  /** For a justified line: how many spaces to stretch to its width, rather than its letters. */
  spaces?: number;
}

export interface TextStyle {
  size: number;
  italic?: boolean;
  weight?: number;
  family?: string;
  /** Extra space between letters, in ems. */
  tracking?: number;
  /** Small capitals. */
  caps?: boolean;
}

export class Plate {
  readonly layers: CanvasRenderingContext2D[];
  readonly runs: Run[] = [];
  readonly measure: CanvasRenderingContext2D;
  /** How far `shift` has moved everything drawn since, in page units. */
  offset = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly scale: number,
  ) {
    this.layers = [0, 1, 2].map(() => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.scale(scale, scale);
      ctx.fillStyle = ctx.strokeStyle = '#fff';
      ctx.lineCap = ctx.lineJoin = 'round';
      return ctx;
    });
    this.measure = this.layers[0] as CanvasRenderingContext2D;
  }

  /** The page's height in page units: more than HEIGHT when it fills a tall screen. */
  get pageHeight(): number {
    return this.height / this.scale;
  }

  /** Moves everything drawn from now on down by `dy` page units. */
  shift(dy: number): void {
    for (const ctx of this.layers) ctx.translate(0, dy);
    this.offset += dy;
  }

  layer(i: 0 | 1 | 2): CanvasRenderingContext2D {
    return this.layers[i] as CanvasRenderingContext2D;
  }

  /** The three layers as the red, green and blue of one canvas. */
  coverage(): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = this.width;
    out.height = this.height;
    const ctx = out.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);
    const tint = document.createElement('canvas');
    tint.width = this.width;
    tint.height = this.height;
    const t = tint.getContext('2d') as CanvasRenderingContext2D;
    ['#f00', '#0f0', '#00f'].forEach((color, i) => {
      t.globalCompositeOperation = 'copy';
      t.drawImage((this.layers[i] as CanvasRenderingContext2D).canvas, 0, 0);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = color;
      t.fillRect(0, 0, this.width, this.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(tint, 0, 0);
    });
    return out;
  }

  // ── type ─────────────────────────────────────────────────────────────────────────────────

  /** Width of `text` in `style`, in page units. */
  textWidth(text: string, style: TextStyle): number {
    let w = 0;
    for (const [part, size] of pieces(text, style)) {
      this.measure.font = font({ ...style, size });
      w += this.measure.measureText(part).width + tracking(style) * [...part].length;
    }
    return w;
  }

  /** Draws `text` with its baseline at y, starting at x, and records it for the text layer. */
  text(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    layer: 0 | 1 = 0,
    record: string | false = text,
  ): number {
    const ctx = this.layer(layer);
    let at = x;
    for (const [part, size] of pieces(text, style)) {
      ctx.font = font({ ...style, size });
      if (!style.tracking) {
        ctx.fillText(part, at, y);
        at += ctx.measureText(part).width;
      } else {
        for (const ch of part) {
          ctx.fillText(ch, at, y);
          at += ctx.measureText(ch).width + tracking(style);
        }
      }
    }
    if (record !== false) {
      this.measure.font = font(style);
      const m = this.measure.measureText('Hg');
      const ascent = m.fontBoundingBoxAscent ?? style.size * 0.8;
      const descent = m.fontBoundingBoxDescent ?? style.size * 0.25;
      this.runs.push({
        text: record,
        x,
        top: this.offset + y - ascent - (style.size - ascent - descent) / 2,
        size: style.size,
        width: at - x,
        italic: !!style.italic,
      });
    }
    return at - x;
  }

  /** A line centred on x. */
  centred(text: string, x: number, y: number, style: TextStyle, layer: 0 | 1 = 0): void {
    this.text(text, x - this.textWidth(text, style) / 2, y, style, layer);
    this.br();
  }

  /** Ends a line in the copied text. */
  br(): void {
    const last = this.runs[this.runs.length - 1];
    if (last && !last.text.endsWith('\n')) last.text += '\n';
  }

  /**
   * Sets paragraphs justified in a column and returns the baseline after the last line.
   * `*words*` are italic. A `cap` takes the first letter as a drop cap, drawn by the caller.
   */
  column(
    paragraphs: string[],
    box: { x: number; y: number; width: number; leading: number; size: number },
    options: { indentFirst?: boolean; cap?: { width: number; lines: number } } = {},
  ): number {
    const { x, width, leading, size } = box;
    const roman: TextStyle = { size };
    const italic: TextStyle = { size, italic: true };
    const space = this.textWidth(' ', roman);
    let y = box.y;
    let lineNo = 0;
    paragraphs.forEach((paragraph, pi) => {
      const words = tokens(paragraph).map((parts) => ({
        parts,
        width: parts.reduce((w, [t, it]) => w + this.textWidth(t, it ? italic : roman), 0),
      }));
      const indent = pi > 0 || options.indentFirst ? size * 1.2 : 0;
      let i = 0;
      let first = true;
      while (i < words.length) {
        const capped = options.cap && lineNo < options.cap.lines ? options.cap.width : 0;
        const left = x + capped + (first && !capped ? indent : 0);
        const room = x + width - left;
        let used = 0;
        let j = i;
        while (j < words.length) {
          const w = (words[j] as { width: number }).width;
          if (j > i && used + space + w > room) break;
          used += (j > i ? space : 0) + w;
          j++;
        }
        const last = j >= words.length;
        const gap = last || j - i < 2 ? space : space + (room - used) / (j - i - 1);
        let at = left;
        for (let k = i; k < j; k++) {
          for (const [t, it] of (words[k] as { parts: [string, boolean][] }).parts) {
            at += this.text(t, at, y, it ? italic : roman, 0, false);
          }
          if (k < j - 1) at += gap;
        }
        // one run for the line, its spaces stretched to the same width as on the page
        const line = words
          .slice(i, j)
          .map((word) => word.parts.map(([t]) => t).join(''))
          .join(' ');
        this.measure.font = font(roman);
        const m = this.measure.measureText('Hg');
        const ascent = m.fontBoundingBoxAscent ?? size * 0.8;
        const descent = m.fontBoundingBoxDescent ?? size * 0.25;
        this.runs.push({
          text: last ? `${line}\n` : `${line} `,
          x: left,
          top: this.offset + y - ascent - (size - ascent - descent) / 2,
          size,
          width: last ? at - left : at - left + gap,
          italic: false,
          spaces: last ? 0 : j - i,
        });
        i = j;
        first = false;
        y += leading;
        lineNo++;
      }
    });
    return y;
  }
}

function tracking(style: TextStyle): number {
  return (style.tracking ?? 0) * style.size;
}

export function font(style: TextStyle): string {
  return `${style.italic ? 'italic ' : ''}${style.weight ?? 400} ${style.size}px ${style.family ?? SERIF}`;
}

/** Splits text for small caps: capitals at full size, the rest as capitals a size smaller. */
function pieces(text: string, style: TextStyle): [string, number][] {
  if (!style.caps) return [[text, style.size]];
  const out: [string, number][] = [];
  for (const m of text.matchAll(/([^a-z]+)|([a-z]+)/g)) {
    if (m[1]) out.push([m[1], style.size]);
    else if (m[2]) out.push([m[2].toUpperCase(), style.size * 0.76]);
  }
  return out;
}

/** Words, each a list of [text, italic] parts, from text where `*…*` is italic. */
function tokens(text: string): [string, boolean][][] {
  const words: [string, boolean][][] = [];
  let italic = false;
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    const parts: [string, boolean][] = [];
    for (const piece of raw.split(/(\*)/)) {
      if (piece === '*') italic = !italic;
      else if (piece) parts.push([piece, italic]);
    }
    if (parts.length) words.push(parts);
  }
  return words;
}

/** A seeded random number generator. */
export function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
