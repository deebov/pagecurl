// Renders a DOM element to a canvas without dependencies: the element is cloned with its
// computed styles inlined, images and fonts embedded as data URLs, wrapped in an SVG
// <foreignObject> and drawn as an image.

export interface SnapshotOptions {
  /** Size in CSS pixels. */
  width: number;
  height: number;
  /** Output pixels per CSS pixel. */
  pixelRatio: number;
  /** Fill behind the content (any CSS colour). */
  background?: string;
}

/** Produces the image a page is curled with. Replaceable through the `snapshot` option. */
export type Snapshotter = (
  element: HTMLElement,
  options: SnapshotOptions,
) => TexImageSource | Promise<TexImageSource>;

const SKIP_TAGS = new Set(['script', 'noscript', 'template', 'style', 'link', 'meta', 'title']);
// Properties that never affect a still image, or would replay an animation from its start.
const SKIP_PROPS =
  /^(?:--|animation|transition|will-change|cursor|pointer-events|user-select|-webkit-user-select|caret-color|interactivity)/;
const URL_PROPS = [
  'background-image',
  'mask-image',
  '-webkit-mask-image',
  'border-image-source',
  'list-style-image',
];
const URL_PATTERN = /url\((['"]?)([^'")]+)\1\)/g;

const dataUrls = new Map<string, Promise<string>>();
const fontRules = new Map<string, Promise<string>>();

/** Fetches a resource as a data URL; resolves to '' when it cannot be read. */
export function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return Promise.resolve(url);
  let cached = dataUrls.get(url);
  if (!cached) {
    cached = fetch(url, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(
        (blob) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => resolve('');
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => '');
    dataUrls.set(url, cached);
  }
  return cached;
}

async function inlineUrls(value: string, base: string): Promise<string> {
  const urls = new Set<string>();
  for (const m of value.matchAll(URL_PATTERN)) urls.add(m[2] as string);
  let out = value;
  for (const raw of urls) {
    if (raw.startsWith('data:') || raw.startsWith('#')) continue;
    const data = await toDataUrl(new URL(raw, base).href);
    out = out.split(raw).join(data);
  }
  return out;
}

// Default styles

let sandbox: Document | null = null;
const defaults = new Map<string, Map<string, string>>();

function sandboxDocument(): Document {
  if (sandbox?.defaultView) return sandbox;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:10px;height:10px;visibility:hidden;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument as Document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head></head><body></body></html>');
  doc.close();
  sandbox = doc;
  return doc;
}

function defaultStyle(el: Element): Map<string, string> {
  const key = `${el.namespaceURI}|${el.localName}`;
  let map = defaults.get(key);
  if (!map) {
    map = new Map();
    const doc = sandboxDocument();
    const probe = doc.createElementNS(el.namespaceURI, el.localName);
    const host =
      el.namespaceURI === 'http://www.w3.org/2000/svg'
        ? doc.createElementNS(el.namespaceURI, 'svg')
        : null;
    (host ?? doc.body).appendChild(probe);
    if (host) doc.body.appendChild(host);
    const cs = (doc.defaultView as Window).getComputedStyle(probe);
    for (let i = 0; i < cs.length; i++) {
      const name = cs.item(i);
      map.set(name, cs.getPropertyValue(name));
    }
    (host ?? probe).remove();
    defaults.set(key, map);
  }
  return map;
}

// Cloning

interface CloneContext {
  css: string[];
  families: Set<string>;
  /** Code points of the text on the page, to pick the font subsets it needs. */
  chars: Set<number>;
  tasks: Promise<void>[];
  pseudo: number;
}

function copyStyle(
  target: CSSStyleDeclaration,
  style: CSSStyleDeclaration,
  parent: CSSStyleDeclaration | null,
  base: Map<string, string>,
): void {
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i);
    if (SKIP_PROPS.test(name)) continue;
    const value = style.getPropertyValue(name);
    // A property can be left out when the clone would end up with the same value anyway: it
    // matches both the default (non-inherited) and the parent's value (inherited).
    if (value === base.get(name) && (!parent || value === parent.getPropertyValue(name))) continue;
    target.setProperty(name, value);
  }
}

function cssDeclarations(style: CSSStyleDeclaration): string {
  let out = '';
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i);
    if (SKIP_PROPS.test(name)) continue;
    out += `${name}:${style.getPropertyValue(name)};`;
  }
  return out;
}

function collectFamilies(style: CSSStyleDeclaration, into: Set<string>): void {
  for (const f of style.fontFamily.split(',')) {
    const name = f
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .toLowerCase();
    if (name) into.add(name);
  }
}

function replaced(el: Element, ctx: CloneContext): HTMLElement | null {
  if (el instanceof HTMLCanvasElement || el instanceof HTMLVideoElement) {
    const img = document.createElement('img');
    try {
      let canvas = el as HTMLCanvasElement;
      if (el instanceof HTMLVideoElement) {
        canvas = document.createElement('canvas');
        canvas.width = el.videoWidth;
        canvas.height = el.videoHeight;
        canvas.getContext('2d')?.drawImage(el, 0, 0);
      }
      img.src = canvas.toDataURL();
    } catch {
      // A tainted canvas or video can't be read; it renders empty.
    }
    return img;
  }
  if (el instanceof HTMLIFrameElement) return document.createElement('div');
  if (el instanceof HTMLImageElement) {
    const img = el.cloneNode(false) as HTMLImageElement;
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.removeAttribute('loading');
    const src = el.currentSrc || el.src;
    if (src) {
      img.src = '';
      ctx.tasks.push(
        toDataUrl(src).then((data) => {
          img.src = data;
        }),
      );
    }
    return img;
  }
  return null;
}

const UNWRAPPED: Record<string, string> = { normal: 'nowrap', 'pre-wrap': 'pre' };

/**
 * Keeps text that fits on one line on one line in the snapshot. Sizes are copied as fixed pixels,
 * and the snapshot can measure text a hair wider than the page did (a different emoji font, a
 * font that couldn't be embedded, rounding), which would push the last word onto a new line.
 */
function keepOnOneLine(el: Element, clone: HTMLElement | SVGElement, style: CSSStyleDeclaration) {
  const unwrapped = UNWRAPPED[style.whiteSpace];
  if (!unwrapped) return;
  let text = false;
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.nodeValue?.trim()) text = true;
  }
  if (!text) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  let line = Number.POSITIVE_INFINITY;
  for (const r of range.getClientRects()) {
    if (!r.height) continue;
    first = Math.min(first, r.top);
    last = Math.max(last, r.top);
    line = Math.min(line, r.height);
  }
  // One line when every box starts at about the same height.
  if (line < Number.POSITIVE_INFINITY && last - first < line / 2)
    clone.style.setProperty('white-space', unwrapped);
}

function cloneTree(
  node: Node,
  parentStyle: CSSStyleDeclaration | null,
  ctx: CloneContext,
): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? '';
    for (const ch of text) ctx.chars.add(ch.codePointAt(0) as number);
    return document.createTextNode(text);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  if (SKIP_TAGS.has(el.localName)) return null;
  const style = getComputedStyle(el);
  if (style.display === 'none') return null;

  const clone = (replaced(el, ctx) ?? el.cloneNode(false)) as HTMLElement | SVGElement;
  copyStyle(clone.style, style, parentStyle, defaultStyle(el));
  collectFamilies(style, ctx.families);
  keepOnOneLine(el, clone, style);

  for (const prop of URL_PROPS) {
    const value = style.getPropertyValue(prop);
    if (value.includes('url(')) {
      ctx.tasks.push(
        inlineUrls(value, document.baseURI).then((v) => clone.style.setProperty(prop, v)),
      );
    }
  }

  for (const which of ['::before', '::after'] as const) {
    const ps = getComputedStyle(el, which);
    if (!ps.content || ps.content === 'none' || ps.content === 'normal') continue;
    const cls = `pagecurl-p${ctx.pseudo++}`;
    clone.classList.add(cls);
    const decl = cssDeclarations(ps);
    ctx.tasks.push(
      inlineUrls(decl, document.baseURI).then((d) => {
        ctx.css.push(`.${cls}${which}{${d}}`);
      }),
    );
  }

  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      if (el.checked) clone.setAttribute('checked', '');
      else clone.removeAttribute('checked');
    } else clone.setAttribute('value', el.value);
  } else if (el instanceof HTMLTextAreaElement) {
    clone.textContent = el.value;
    return clone;
  } else if (el instanceof HTMLSelectElement) {
    const i = el.selectedIndex;
    Array.from(el.options).forEach((o, j) => {
      const c = document.createElement('option');
      c.textContent = o.text;
      if (j === i) c.setAttribute('selected', '');
      clone.appendChild(c);
    });
    return clone;
  }
  if (clone instanceof HTMLImageElement) return clone;

  const children = (el as HTMLElement).shadowRoot?.childNodes ?? el.childNodes;
  for (const child of children) {
    const c = cloneTree(child, style, ctx);
    if (c) clone.appendChild(c);
  }
  return clone;
}

// Fonts

function familyOf(rule: string): string {
  const m = /font-family\s*:\s*([^;]+)/i.exec(rule);
  return m
    ? (m[1] as string)
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase()
    : '';
}

function inlineFontRule(text: string, base: string): Promise<string> {
  const key = `${base}\n${text}`;
  let cached = fontRules.get(key);
  if (!cached) {
    cached = inlineUrls(text, base);
    fontRules.set(key, cached);
  }
  return cached;
}

async function fontFaceRules(): Promise<{ text: string; base: string }[]> {
  const rules: { text: string; base: string }[] = [];
  const visit = async (sheet: CSSStyleSheet) => {
    const base = sheet.href ?? document.baseURI;
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      // Cross-origin stylesheet: read it directly.
      if (!sheet.href) return;
      try {
        const css = await (await fetch(sheet.href, { cache: 'force-cache' })).text();
        for (const m of css.matchAll(/@font-face\s*{[^}]*}/g)) rules.push({ text: m[0], base });
      } catch {
        // Unreadable: fonts from it fall back.
      }
      return;
    }
    for (const rule of list) {
      if (rule instanceof CSSFontFaceRule) rules.push({ text: rule.cssText, base });
      else if (rule instanceof CSSImportRule && rule.styleSheet) await visit(rule.styleSheet);
    }
  };
  for (const sheet of document.styleSheets) await visit(sheet);
  return rules;
}

let fontRuleList: Promise<{ text: string; base: string }[]> | null = null;

/**
 * Whether a font face covers any of `chars`. Web font services split each font into many
 * `unicode-range` subsets, and embedding only the ones a page uses keeps snapshots fast.
 */
function coversText(rule: string, chars: Set<number>): boolean {
  const m = /unicode-range\s*:\s*([^;}]+)/i.exec(rule);
  if (!m) return true;
  for (const part of (m[1] as string).split(',')) {
    const range = part.trim().replace(/^u\+/i, '');
    const [lo, hi] = range.includes('-')
      ? range.split('-').map((h) => Number.parseInt(h, 16))
      : [
          Number.parseInt(range.replace(/\?/g, '0'), 16),
          Number.parseInt(range.replace(/\?/g, 'f'), 16),
        ];
    if (lo === undefined || hi === undefined || Number.isNaN(lo) || Number.isNaN(hi)) return true;
    for (const c of chars) if (c >= lo && c <= hi) return true;
  }
  return false;
}

async function embeddedFonts(families: Set<string>, chars: Set<number>): Promise<string> {
  fontRuleList ??= fontFaceRules();
  const rules = (await fontRuleList).filter(
    (r) => families.has(familyOf(r.text)) && coversText(r.text, chars),
  );
  return (await Promise.all(rules.map((r) => inlineFontRule(r.text, r.base)))).join('\n');
}

/** Forgets cached stylesheet fonts, e.g. after new stylesheets load. */
export function resetSnapshotCache(): void {
  fontRuleList = null;
}

// Rendering

let thumbCanvas: CanvasRenderingContext2D | null = null;

function isWebKit(): boolean {
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Android/.test(ua);
}

/** A tiny copy of an image, as a string, to tell whether two draws differ. */
function thumbnail(img: HTMLImageElement): string {
  if (!thumbCanvas) {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 24;
    thumbCanvas = c.getContext('2d', { willReadFrequently: true });
  }
  if (!thumbCanvas) return '';
  thumbCanvas.clearRect(0, 0, 24, 24);
  thumbCanvas.drawImage(img, 0, 0, 24, 24);
  return thumbCanvas.getImageData(0, 0, 24, 24).data.join();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('pagecurl: snapshot failed to render'));
    img.src = src;
  });
}

/** Draws `element` into a new canvas. */
export async function snapshot(
  element: HTMLElement,
  { width, height, pixelRatio, background }: SnapshotOptions,
): Promise<HTMLCanvasElement> {
  await document.fonts.ready;
  const ctx: CloneContext = {
    css: [],
    families: new Set(),
    chars: new Set(),
    tasks: [],
    pseudo: 0,
  };
  const parent = element.parentElement ? getComputedStyle(element.parentElement) : null;
  const root = cloneTree(element, parent, ctx) as HTMLElement | null;
  const pw = Math.max(1, Math.round(width * pixelRatio));
  const ph = Math.max(1, Math.round(height * pixelRatio));
  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  if (background) {
    g.fillStyle = background;
    g.fillRect(0, 0, pw, ph);
  }
  if (!root) return canvas;

  // Pin the root to the snapshot's frame regardless of how it is placed on the page.
  // That includes the logical offsets (inset-inline-start and friends), which browsers report
  // alongside left and top.
  const rs = root.style;
  for (const p of Array.from(rs)) {
    if (/^(inset|left|top|right|bottom|translate|rotate|scale|inline-size|block-size)/.test(p)) {
      rs.removeProperty(p);
    }
  }
  rs.setProperty('position', 'relative');
  rs.setProperty('margin', '0');
  rs.setProperty('opacity', '1');
  rs.setProperty('clip-path', 'none');
  rs.setProperty('visibility', 'visible');
  rs.setProperty('box-sizing', 'border-box');
  rs.setProperty('width', `${width}px`);
  rs.setProperty('height', `${height}px`);

  const [fonts] = await Promise.all([embeddedFonts(ctx.families, ctx.chars), ...ctx.tasks]);
  const styles = `${fonts}\n${ctx.css.join('\n')}`.trim();
  if (styles) {
    const el = document.createElement('style');
    el.textContent = styles;
    root.insertBefore(el, root.firstChild);
  }
  // Scale with CSS rather than the SVG viewBox: WebKit ignores the viewBox when it rasterizes
  // foreignObject content, and would draw the page at 1x in one corner. WebKit rounds text to
  // device pixels on the page, so it needs the layout at device scale (zoom) to match. Chromium
  // matches when the layout is scaled afterwards (transform).
  if (isWebKit()) {
    rs.setProperty('zoom', `${pw / width}`);
  } else {
    rs.setProperty('transform', `scale(${pw / width}, ${ph / height})`);
    rs.setProperty('transform-origin', '0 0');
  }
  const xhtml = new XMLSerializer().serializeToString(root);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}">` +
    `<foreignObject x="0" y="0" width="${pw}" height="${ph}">${xhtml}</foreignObject></svg>`;
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  g.drawImage(img, 0, 0, pw, ph);
  // WebKit only starts decoding the images inside an SVG image when it is first drawn, so that
  // draw can come out with blank images. Redraw until two draws in a row agree.
  if (root.querySelector('img') || /url\(["']?data:/.test(xhtml)) {
    let previous = thumbnail(img);
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 16));
      const next = thumbnail(img);
      if (next === previous) break;
      previous = next;
    }
    g.clearRect(0, 0, pw, ph);
    if (background) g.fillRect(0, 0, pw, ph);
    g.drawImage(img, 0, 0, pw, ph);
  }
  return canvas;
}
