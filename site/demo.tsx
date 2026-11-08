import { PageCurl, type PageCurlHandle, type TurnEvent } from '@pagecurl/react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CHAPTER, edgeColor, HEIGHT, PAGES, pageColor, printPage, type Run, WIDTH } from './book';
import { PageSound } from './book/sound';

// The demo book is drawn by the browser (site/book): each page is composed in a canvas and printed
// onto procedural paper, cloth or marbled endpaper by a WebGL pass. That canvas is also what the
// curl turns, so the page looks exactly the same lying flat and mid-turn, in any browser. Over the
// canvas lies the page's text, transparent but in place, so it can still be selected and copied.

const ASPECT = WIDTH / HEIGHT;
const MAX_PAGE_WIDTH = 450;
// Full screen, the book fills a phone in portrait and opens out into a spread in landscape.
const FILL_MAX_PAGE_WIDTH = 900;
const FILL_SPREAD = '(orientation: landscape) and (min-width: 560px)';
/** How much squatter than the book a screen can be and still have a spread fill it. */
const SPREAD_SQUAT = 0.97;
/** The desk the book lies on full screen when it doesn't fill it (play styles in styles.css). */
const DESK = '#221d19';

/** Resolves once a page's canvas has been printed at its current size. */
const drawn = new WeakMap<HTMLCanvasElement, Promise<unknown>>();

/** The curl uses each page's own canvas instead of capturing it. */
function pageCanvas(page: HTMLElement): Promise<HTMLCanvasElement> {
  const canvas = page.querySelector('canvas') as HTMLCanvasElement;
  return (drawn.get(canvas) ?? Promise.resolve()).then(() => canvas);
}

/**
 * The demo book. With `fill`, it takes the whole of its container (the full-screen page at /play,
 * for recording) and has no controls: it is turned by hand or by key.
 */
export function Demo({ fill = false }: { fill?: boolean }) {
  const book = useRef<PageCurlHandle>(null);
  const stage = useRef<HTMLElement>(null);
  const spread = useMediaQuery(fill ? FILL_SPREAD : '(min-width: 720px)');
  // In a spread the closed book is the cover on the right, with nothing on its left, and at the
  // end the back cover on the left.
  const pages = PAGES.map((_, i) => i);
  const leaves = spread ? [null, ...pages, null] : pages;
  const step = spread ? 2 : 1;
  const spreads = Math.ceil(leaves.length / step);
  // The book in the page lies open at the first chapter; full screen, it starts closed.
  const start = fill ? 0 : Math.floor(leaves.indexOf(CHAPTER) / step) * step;
  const [page, setPage] = useState(start);
  // The page the book has come to rest on: animated turns change `page` as they start.
  const [settled, setSettled] = useState(start);
  // Switching between one page and a spread opens the book afresh, at the start.
  useLayoutEffect(() => {
    setPage(start);
    setSettled(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the layout changes
  }, [spread]);
  // Where the turns in flight are going: a half that will be bare there loses its shadow as soon
  // as its page starts to lift, not when it lands.
  const [heading, setHeading] = useState<number | null>(null);
  const active = useRef(0);
  const sound = useRef<PageSound | null>(null);
  sound.current ??= new PageSound();
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    try {
      setMuted(localStorage.getItem('pagecurl-sound') === 'off');
    } catch {
      // storage is blocked: the sound stays on
    }
  }, []);
  (sound.current as PageSound).muted = muted;
  const [room, setRoom] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = stage.current as HTMLElement;
    const observer = new ResizeObserver(() =>
      setRoom({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Page sizes in whole screen pixels, so each canvas pixel lands on exactly one of them.
  const grid = screenPixelGrid();
  // Full screen on a screen taller than the book, a single page takes the whole screen, edge to
  // edge, as in a reading app: the page grows taller to fit (see book/pages.ts). A spread does the
  // same on a screen its shape or taller, like a foldable opened out or a tablet on its side, and
  // allows a screen a little squatter too, where the pages lose a few points of margin.
  const bleed =
    fill &&
    room.width > 0 &&
    room.height / (room.width / step) > (spread ? SPREAD_SQUAT : 1) / ASPECT;
  const width = toGrid(
    bleed
      ? room.width / step
      : fill
        ? Math.min(
            FILL_MAX_PAGE_WIDTH,
            spread ? (room.width * 0.94) / 2 : room.width * 0.9,
            room.height * 0.9 * ASPECT,
          )
        : Math.min(MAX_PAGE_WIDTH, spread ? room.width / 2 : room.width * 0.86),
    grid,
  );
  const height = toGrid(bleed ? room.height : width / ASPECT, grid);

  // Full screen, the status bar above the page takes the colour along the page's top edge, so
  // it reads as the page's margin. iOS colours it from theme-color, or from a full-width fixed
  // element at the top: this section.
  const edge = bleed && !spread ? edgeColor(leaves[settled] ?? 0) : null;
  useEffect(() => {
    if (!fill) return;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', edge ?? DESK);
  }, [fill, edge]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') sound.current?.wake();
      if (e.key === 'ArrowRight') void book.current?.next();
      else if (e.key === 'ArrowLeft') void book.current?.prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Redrawn canvases aren't a change the book can see, so tell it.
  const refresh = useRef(0);
  const onDrawn = () => {
    cancelAnimationFrame(refresh.current);
    refresh.current = requestAnimationFrame(() => book.current?.refresh());
  };

  return (
    <section
      className={bleed ? 'demo fill bleed' : fill ? 'demo fill' : 'demo'}
      aria-label="Interactive demo"
      ref={stage}
      style={edge ? { backgroundColor: edge } : undefined}
    >
      {width > 0 ? (
        <div
          className="desk"
          style={{ width: width * step, height }}
          onPointerDown={() => sound.current?.wake()}
          onPointerMove={(e) => sound.current?.move(e.clientX, e.clientY, e.timeStamp)}
          onPointerUp={() => sound.current?.release()}
          onPointerCancel={() => sound.current?.release()}
        >
          {bleed ? null : spread ? (
            <>
              <div
                className={`book-shadow left ${covered(leaves, settled, heading, 0) ? 'on' : ''}`}
              />
              <div
                className={`book-shadow right ${covered(leaves, settled, heading, 1) ? 'on' : ''}`}
              />
            </>
          ) : (
            <div className="book-shadow on" />
          )}
          <PageCurl
            ref={book}
            key={spread ? 'spread' : 'single'}
            className="book"
            spread={spread}
            defaultPage={start}
            snapshot={pageCanvas}
            grabZone={56}
            onPageChange={(p) => {
              setPage(p);
              if (!active.current) setSettled(p);
            }}
            onTurnStart={(e) => {
              active.current++;
              setHeading(e.to);
              const heavy = isBoard(e, leaves, spread);
              if (e.interactive) sound.current?.lift(heavy);
              else sound.current?.swish(heavy);
            }}
            onTurnEnd={(e) => {
              active.current--;
              if (!active.current) setHeading(null);
              setSettled(e.completed ? e.to : e.from);
              sound.current?.land(isBoard(e, leaves, spread), e.completed);
            }}
            style={{ width: width * step, height }}
          >
            {leaves.map((index, i) =>
              index === null ? (
                <div key={`blank${i}`} />
              ) : (
                <Sheet
                  key={index}
                  index={index}
                  // the spine is on the left of a right-hand page
                  spine={!spread || i % 2 === 1 ? -1 : 1}
                  width={width}
                  height={height}
                  onDrawn={onDrawn}
                />
              ),
            )}
          </PageCurl>
        </div>
      ) : fill ? null : (
        // Holds the book's place until it can be measured, so nothing below it moves.
        <div className="book-placeholder" />
      )}
      {fill ? null : (
        <>
          <div className="controls">
            <button
              type="button"
              className="round"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => {
                sound.current?.wake();
                void book.current?.prev();
              }}
            >
              ←
            </button>
            <div className="dots" aria-hidden="true">
              {Array.from({ length: spreads }, (_, i) => (
                <span key={i} className={i === Math.floor(page / step) ? 'on' : ''} />
              ))}
            </div>
            <button
              type="button"
              className="round"
              aria-label="Next page"
              disabled={page + step >= leaves.length}
              onClick={() => {
                sound.current?.wake();
                void book.current?.next();
              }}
            >
              →
            </button>
            <button
              type="button"
              className="round sound"
              aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
              aria-pressed={!muted}
              onClick={() => {
                const next = !muted;
                setMuted(next);
                try {
                  localStorage.setItem('pagecurl-sound', next ? 'off' : 'on');
                } catch {
                  // storage is blocked: the choice lasts until the page is closed
                }
                if (!next) sound.current?.wake();
              }}
            >
              <SpeakerIcon muted={muted} />
            </button>
          </div>
          <p className="hint">Drag the corner, click an edge, or press ← →</p>
        </>
      )}
    </section>
  );
}

/**
 * Whether a half of the spread (0 left, 1 right) has a page lying on it: it does at the spread the
 * book rests on, unless a turn is taking it to a spread where that half is bare.
 */
function covered(
  leaves: (number | null)[],
  at: number,
  heading: number | null,
  side: 0 | 1,
): boolean {
  if (heading !== null && leaves[heading + side] == null) return false;
  return leaves[at + side] != null;
}

/** Whether the leaf in this turn is one of the boards, the covers, rather than paper. */
function isBoard(e: TurnEvent, leaves: (number | null)[], spread: boolean): boolean {
  const forward = e.to > e.from;
  // the leaf that moves: in a spread, the right page going forward or the left coming back
  const at = spread ? (forward ? e.from + 1 : e.from) : forward ? e.from : e.to;
  const index = leaves[at];
  return index != null && PAGES[index]?.material !== 'paper';
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {muted ? (
        <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path
          d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * One page of the book: printed into a canvas at the screen's resolution, under its text.
 */
function Sheet({
  index,
  spine,
  width,
  height,
  onDrawn,
}: {
  index: number;
  spine: number;
  width: number;
  height: number;
  onDrawn: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const scale = width / WIDTH;
  const done = useRef(onDrawn);
  done.current = onDrawn;

  useLayoutEffect(() => {
    const canvas = ref.current as HTMLCanvasElement;
    const ratio = window.devicePixelRatio || 1;
    const promise = printPage(
      index,
      canvas,
      Math.round(width * ratio),
      Math.round(height * ratio),
      spine,
    ).then((r) => {
      setRuns(r);
      done.current();
    });
    drawn.set(canvas, promise);
  }, [index, spine, width, height]);

  // Fit each run to the width it has on the page, as the browser's text is laid out apart: a
  // justified line by widening its spaces, anything else by stretching it.
  useLayoutEffect(() => {
    const spans = (layer.current as HTMLDivElement).querySelectorAll<HTMLSpanElement>('span');
    for (const span of spans) {
      span.style.transform = '';
      span.style.wordSpacing = '';
    }
    for (const span of spans) {
      const natural = span.getBoundingClientRect().width;
      const target = Number(span.dataset.width);
      const spaces = Number(span.dataset.spaces);
      if (spaces > 0) span.style.wordSpacing = `${(target - natural) / spaces}px`;
      else if (natural > 0) span.style.transform = `scaleX(${target / natural})`;
    }
  }, [runs, width]);

  return (
    <>
      {/* its background is the colour the curl gives the back of the page */}
      <canvas ref={ref} className="sheet" style={{ backgroundColor: pageColor(index) }} />
      <div ref={layer} className="text-layer">
        {runs.map((run, i) => (
          <span
            key={i}
            data-width={run.width * scale}
            data-spaces={run.spaces}
            style={{
              left: run.x * scale,
              top: run.top * scale,
              fontSize: run.size * scale,
              fontStyle: run.italic ? 'italic' : undefined,
            }}
          >
            {run.text}
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * The smallest number of CSS pixels that is also a whole number of screen pixels: 1 at 1x, 2x or
 * 3x, but 4 at 125% zoom, where 4 CSS pixels make 5 screen pixels.
 */
function screenPixelGrid(): number {
  if (typeof window === 'undefined') return 1;
  const ratio = window.devicePixelRatio || 1;
  for (let n = 1; n <= 20; n++) {
    if (Math.abs(n * ratio - Math.round(n * ratio)) < 0.001) return n;
  }
  return 1;
}

function toGrid(v: number, grid: number): number {
  return Math.max(0, Math.floor(v / grid) * grid);
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (update) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', update);
      return () => list.removeEventListener('change', update);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
