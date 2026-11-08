import { PageCurl, type PageCurlHandle } from '@pagecurl/react';
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import chapters from './alice.json';
import { type Chapter, itemHtml, type Page, paginate, prepare } from './paginate';

const TITLE = 'Alice’s Adventures in Wonderland';
const ASPECT = 0.68; // page width / height

const items = prepare(chapters as Chapter[]);

function App() {
  const book = useRef<PageCurlHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  const [textSize, setTextSize] = useState(16);
  const [pages, setPages] = useState<Page[]>([]);
  const [page, setPage] = useState(0);
  // The first word on screen, so the reader keeps their place when the text re-flows.
  const anchor = useRef(0);

  useLayoutEffect(() => {
    const el = stage.current as HTMLDivElement;
    const observer = new ResizeObserver(() =>
      setRoom({ width: el.clientWidth - 48, height: el.clientHeight - 40 }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const spread = room.width > room.height * ASPECT * 1.6;
  const height = Math.floor(Math.min(room.height, room.width / (spread ? 2 : 1) / ASPECT));
  const width = Math.floor(height * ASPECT);

  // Leaves in reading order: a title page, then the text. Spreads open with the title on the right.
  const leaves = useMemo(() => {
    const text = pages.map((p, i) => <TextPage key={p.start} page={p} number={i + 1} />);
    return [
      ...(spread ? [<article key="blank" className="leaf" />] : []),
      <article key="title" className="leaf title-page">
        <h1>{TITLE}</h1>
        <p>Lewis Carroll</p>
      </article>,
      ...text,
    ];
  }, [pages, spread]);
  const offset = spread ? 2 : 1; // leaves before the first page of text

  useEffect(() => {
    if (!width) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      const body = measure.current?.querySelector('.body') as HTMLElement | null;
      if (cancelled || !body) return;
      const next = paginate(items, body);
      setPages(next);
      let at = next.length - 1;
      while (at > 0 && (next[at]?.start ?? 0) > anchor.current) at--;
      setPage(anchor.current === 0 ? 0 : at + offset);
    });
    return () => {
      cancelled = true;
    };
  }, [width, height, textSize, offset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') void book.current?.next();
      if (e.key === 'ArrowLeft') void book.current?.prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onPageChange = (p: number) => {
    setPage(p);
    anchor.current = pages[p - offset]?.start ?? 0;
  };

  const vars = { '--text': `${textSize}px` } as CSSProperties;
  const total = pages.length;
  const first = Math.max(0, page - offset + 1);

  return (
    <div className="app" style={vars}>
      <header className="bar">
        <span>{TITLE}</span>
        <span>{total ? `${first || '–'} of ${total}` : 'Paginating…'}</span>
        <select
          value={textSize}
          onChange={(e) => setTextSize(Number(e.target.value))}
          aria-label="Text size"
        >
          {[14, 16, 18, 20, 22].map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
      </header>
      <main className="stage" ref={stage}>
        {width > 0 && pages.length > 0 && (
          <PageCurl
            ref={book}
            className="book"
            spread={spread}
            page={page}
            onPageChange={onPageChange}
            style={{ width: width * (spread ? 2 : 1), height }}
          >
            {leaves}
          </PageCurl>
        )}
      </main>
      {/* An empty page, the same size and style as the real ones, to measure text in. */}
      <div
        ref={measure}
        aria-hidden="true"
        style={{ position: 'fixed', left: -9999, top: 0, width, height, visibility: 'hidden' }}
      >
        <article className="leaf">
          <header className="running">{TITLE}</header>
          <div className="body" />
          <footer className="folio">0</footer>
        </article>
      </div>
    </div>
  );
}

function TextPage({ page, number }: { page: Page; number: number }) {
  return (
    <article className="leaf">
      <header className="running">{number % 2 ? page.chapter : TITLE}</header>
      <div
        className="body"
        dangerouslySetInnerHTML={{ __html: page.items.map(itemHtml).join('') }}
      />
      <footer className="folio">{number}</footer>
    </article>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
