import { PageCurl, type PageCurlHandle } from '@pagecurl/react';
import { type PointerEvent, StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bookPages } from './pages.js';
import { mountPostcard } from './postcard.js';

const THEMES = ['white', 'sepia', 'night'] as const;
type Theme = (typeof THEMES)[number];

function App() {
  const book = useRef<PageCurlHandle>(null);
  const pages = bookPages();
  const [page, setPage] = useState(0);
  const [spread, setSpread] = useState(false);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [drag, setDrag] = useState(true);
  const [tap, setTap] = useState(true);
  const [turnDuration, setTurnDuration] = useState(0.25);
  const [dragDuration, setDragDuration] = useState(0.2);
  const [theme, setTheme] = useState<Theme>('white');
  const [log, setLog] = useState<{ id: number; text: string }[]>([]);
  const nextId = useRef(0);
  const [scrub, setScrub] = useState(0);
  const scrubbing = useRef(false);

  const note = (line: string) => {
    const t = new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
    const entry = { id: nextId.current++, text: `${t}  ${line}` };
    setLog((l) => [entry, ...l].slice(0, 8));
  };

  // The component has no keyboard handling of its own; these keys call its API.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea')) return;
      const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const back = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === forward || e.key === ' ') void book.current?.next();
      else if (e.key === back) void book.current?.prev();
      else if (e.key === 'Home') setPage(0);
      else if (e.key === 'End') setPage(pages.length - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [direction, pages.length]);

  // The scrub slider drives a drag through the API, the way a custom input would.
  const scrubPoint = (value: number): [number, number] => {
    const el = book.current?.element;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const travel = spread ? w : 2 * w;
    const x = direction === 'rtl' ? value * travel : w - value * travel;
    return [x, h * 0.82];
  };
  const startScrub = (e: PointerEvent<HTMLInputElement>) => {
    const [x, y] = scrubPoint(0);
    const edge = direction === 'rtl' ? x + 1 : x - 1;
    scrubbing.current = book.current?.dragStart(edge, y, 'next') ?? false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveScrub = (value: number) => {
    setScrub(value);
    if (scrubbing.current) book.current?.dragMove(...scrubPoint(value));
  };
  const endScrub = () => {
    if (scrubbing.current) book.current?.dragEnd({ complete: scrub > 0.35 });
    scrubbing.current = false;
    setScrub(0);
  };

  const step = spread ? 2 : 1;
  const shown = spread && page + 1 < pages.length ? `${page + 1}–${page + 2}` : `${page + 1}`;

  return (
    <main className={`app theme-${theme}`}>
      <header className="masthead">
        <h1>pagecurl</h1>
        <p>A page curl for any DOM content. Drag a corner, click near an edge, or press ← →.</p>
      </header>

      <div className="stage">
        <div className={`desk ${spread ? 'is-spread' : ''}`}>
          <PageCurl
            ref={book}
            className="book"
            page={page}
            spread={spread}
            direction={direction}
            drag={drag}
            tap={tap}
            turnDuration={turnDuration}
            dragDuration={dragDuration}
            onPageChange={(p) => {
              setPage(p);
              note(`page → ${p + 1}`);
            }}
            onTurnStart={(e) =>
              note(`${e.interactive ? 'drag' : 'turn'} ${e.direction} from ${e.from + 1}`)
            }
            onTurnEnd={(e) => note(`${e.completed ? 'turned' : 'settled back'} (${e.direction})`)}
          >
            {pages}
          </PageCurl>
        </div>

        <aside className="panel">
          <section>
            <h3>Navigate</h3>
            <div className="row">
              <button type="button" onClick={() => book.current?.prev()}>
                Previous
              </button>
              <span className="indicator">
                {shown} <small>of {pages.length}</small>
              </span>
              <button type="button" onClick={() => book.current?.next()}>
                Next
              </button>
            </div>
            <div className="row jumps">
              <button type="button" onClick={() => setPage(0)}>
                First
              </button>
              <button type="button" onClick={() => setPage(Math.max(0, page - step))}>
                page − {step}
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(pages.length - 1, page + step))}
              >
                page + {step}
              </button>
              <button type="button" onClick={() => setPage(pages.length - 1)}>
                Last
              </button>
            </div>
            <label className="slider">
              <span>Scrub the next turn</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={scrub}
                onPointerDown={startScrub}
                onPointerUp={endScrub}
                onPointerCancel={endScrub}
                onChange={(e) => moveScrub(Number(e.target.value))}
              />
            </label>
          </section>

          <section>
            <h3>Layout</h3>
            <Segmented
              value={spread ? 'spread' : 'single'}
              options={['single', 'spread']}
              onChange={(v) => setSpread(v === 'spread')}
            />
            <Segmented
              value={direction}
              options={['ltr', 'rtl']}
              onChange={(v) => setDirection(v as 'ltr' | 'rtl')}
            />
            <Segmented value={theme} options={THEMES} onChange={(v) => setTheme(v as Theme)} />
          </section>

          <section>
            <h3>Input</h3>
            <label className="toggle">
              <input type="checkbox" checked={drag} onChange={(e) => setDrag(e.target.checked)} />{' '}
              Drag to turn
            </label>
            <label className="toggle">
              <input type="checkbox" checked={tap} onChange={(e) => setTap(e.target.checked)} /> Tap
              near an edge to turn
            </label>
          </section>

          <section>
            <h3>Timing</h3>
            <Range label="Turn" value={turnDuration} onChange={setTurnDuration} />
            <Range label="Drag settle" value={dragDuration} onChange={setDragDuration} />
          </section>

          <section>
            <h3>Events</h3>
            <ol className="log">
              {log.length ? log.map((e) => <li key={e.id}>{e.text}</li>) : <li>Turn a page…</li>}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="segmented">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          aria-pressed={o === value}
          className={o === value ? 'on' : ''}
          onClick={() => onChange(o)}
        >
          {o === 'ltr' || o === 'rtl' ? o.toUpperCase() : o[0]?.toUpperCase() + o.slice(1)}
        </button>
      ))}
    </fieldset>
  );
}

function Range({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider">
      <span>
        {label} <output>{value.toFixed(2)} s</output>
      </span>
      <input
        type="range"
        min={0.05}
        max={2}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
mountPostcard(document.getElementById('postcard') as HTMLElement);
