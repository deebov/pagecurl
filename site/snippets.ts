// Every code sample on the page. They're highlighted at build time by highlight.ts.

export interface Snippet {
  lang: 'tsx' | 'ts' | 'js' | 'css' | 'bash' | 'html';
  /** Shown in the card's title bar. */
  title: string;
  code: string;
}

export const SNIPPETS = {
  installReact: {
    lang: 'bash',
    title: 'Terminal',
    code: `npm install @pagecurl/react`,
  },
  installCore: {
    lang: 'bash',
    title: 'Terminal',
    code: `npm install @pagecurl/core`,
  },
  reactUsage: {
    lang: 'tsx',
    title: 'Book.tsx',
    code: `import { PageCurl } from '@pagecurl/react';

export function Book() {
  return (
    <PageCurl style={{ width: 360, height: 500 }}>
      <Cover />
      <Chapter />
      <Notes />
    </PageCurl>
  );
}`,
  },
  reactApi: {
    lang: 'tsx',
    title: 'Reader.tsx',
    code: `const book = useRef<PageCurlHandle>(null);

<PageCurl ref={book} onPageChange={setPage}>…</PageCurl>

book.current?.next();
book.current?.prev();
book.current?.goTo(4);`,
  },
  vanillaUsage: {
    lang: 'js',
    title: 'book.js',
    code: `import { createPageCurl } from '@pagecurl/core';

// Every child of #book becomes a page.
const curl = createPageCurl(document.querySelector('#book'));

nextButton.onclick = () => curl.next();
curl.dragStart(x, y); // or drive a drag yourself`,
  },
  sizing: {
    lang: 'css',
    title: 'styles.css',
    code: `.book {
  width: 400px;
  aspect-ratio: 5 / 7; /* or a height */
}`,
  },
  spreads: {
    lang: 'tsx',
    title: 'Book.tsx',
    code: `<PageCurl spread direction="rtl" style={{ width: 800, height: 560 }}>
  {pages}
</PageCurl>`,
  },
  controlled: {
    lang: 'tsx',
    title: 'Reader.tsx',
    code: `const [page, setPage] = useState(0);

<PageCurl page={page} onPageChange={setPage}>…</PageCurl>

<input
  type="range"
  max={pageCount - 1}
  value={page}
  onChange={(e) => setPage(Number(e.target.value))}
/>`,
  },
  fromCode: {
    lang: 'js',
    title: 'book.js',
    code: `if (curl.canTurn('next')) {
  const turned = await curl.next(); // resolves when the page lands
}

curl.goTo(12); // no animation`,
  },
  keys: {
    lang: 'tsx',
    title: 'Reader.tsx',
    code: `useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') book.current?.next();
    if (e.key === 'ArrowLeft') book.current?.prev();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);`,
  },
  ownDrag: {
    lang: 'js',
    title: 'slider.js',
    code: `// Coordinates are CSS pixels inside the book.
const { width, height } = book.getBoundingClientRect();

slider.onpointerdown = () => curl.dragStart(width, height, 'next');
slider.oninput = () => curl.dragMove(width * (1 - slider.value), height);
slider.onpointerup = () => curl.dragEnd(); // completes past the middle`,
  },
  ignore: {
    lang: 'tsx',
    title: 'Page.tsx',
    code: `<figure data-pagecurl-ignore>
  <Map /> {/* pans instead of turning the page */}
</figure>`,
  },
  canvas: {
    lang: 'js',
    title: 'viewer.js',
    code: `createPageCurl(book, {
  snapshot: (page) => page.querySelector('canvas'),
});`,
  },
  pdf: {
    lang: 'js',
    title: 'viewer.js',
    code: `createPageCurl(book, {
  // Render the page the first time it's about to turn.
  snapshot: async (page, { width, height, pixelRatio }) => {
    const canvas = page.querySelector('canvas');
    await renderPdfPage(canvas, width * pixelRatio, height * pixelRatio);
    return canvas;
  },
});`,
  },
  create: {
    lang: 'ts',
    title: 'index.d.ts',
    code: `function createPageCurl(element: HTMLElement, options?: PageCurlOptions): PageCurl`,
  },
  component: {
    lang: 'tsx',
    title: 'Book.tsx',
    code: `<PageCurl ref={book} className="book" spread onPageChange={setPage}>
  {children}
</PageCurl>`,
  },
  hook: {
    lang: 'tsx',
    title: 'Book.tsx',
    code: `const { ref, curl, page } = usePageCurl({ spread: true });

return <div ref={ref} className="book">{pages}</div>;`,
  },
  snapshotter: {
    lang: 'ts',
    title: 'index.d.ts',
    code: `type Snapshotter = (
  page: HTMLElement,
  options: { width: number; height: number; pixelRatio: number; background?: string },
) => TexImageSource | Promise<TexImageSource>;`,
  },
  exactReact: {
    lang: 'tsx',
    title: 'Book.tsx',
    code: `<PageCurl liveFlat htmlInCanvas>
  {pages}
</PageCurl>`,
  },
  exactCore: {
    lang: 'js',
    title: 'book.js',
    code: `createPageCurl(book, {
  liveFlat: true,
  htmlInCanvas: true,
});`,
  },
  originTrial: {
    lang: 'html',
    title: 'index.html',
    code: `<!-- The token from your origin trial registration -->
<meta http-equiv="origin-trial" content="YOUR_TOKEN" />`,
  },

  // React Native
  installNative: {
    lang: 'bash',
    title: 'Terminal',
    code: `npx expo install @pagecurl/react-native @shopify/react-native-skia`,
  },
  installNativeBare: {
    lang: 'bash',
    title: 'Terminal',
    code: `npm install @pagecurl/react-native @shopify/react-native-skia
cd ios && pod install`,
  },
  nativeUsage: {
    lang: 'tsx',
    title: 'Book.tsx',
    code: `import { PageCurl } from '@pagecurl/react-native';

export function Book() {
  return (
    <PageCurl style={{ flex: 1 }}>
      <Cover />
      <Chapter />
      <Notes />
    </PageCurl>
  );
}`,
  },
  nativeApi: {
    lang: 'tsx',
    title: 'Reader.tsx',
    code: `const book = useRef<PageCurlHandle>(null);

<PageCurl ref={book} onPageChange={setPage}>…</PageCurl>

<Button title="Next" onPress={() => book.current?.next()} />`,
  },
  nativeSizing: {
    lang: 'tsx',
    title: 'Book.tsx',
    code: `<PageCurl style={{ flex: 1, margin: 16 }}>{pages}</PageCurl>

<PageCurl style={{ width: 360, aspectRatio: 5 / 7 }}>{pages}</PageCurl>`,
  },
  nativeSpreads: {
    lang: 'tsx',
    title: 'Book.tsx',
    code: `const { width, height } = useWindowDimensions();

// Two pages on a tablet, an open foldable or a phone on its side.
<PageCurl spread={width > height} style={{ flex: 1 }}>
  {pages}
</PageCurl>`,
  },
  nativeControlled: {
    lang: 'tsx',
    title: 'Reader.tsx',
    code: `const [page, setPage] = useState(0);

<PageCurl page={page} onPageChange={setPage}>…</PageCurl>

<Button title="Chapter 2" onPress={() => setPage(12)} />`,
  },
  nativeFromCode: {
    lang: 'tsx',
    title: 'Reader.tsx',
    code: `if (book.current?.canTurn('next')) {
  const turned = await book.current.next(); // resolves when the page lands
}

book.current?.goTo(12); // no animation`,
  },
  nativeOwnDrag: {
    lang: 'tsx',
    title: 'Scrubber.tsx',
    code: `// Positions are points inside the book.
<Slider
  onSlidingStart={() => book.current?.dragStart(width, height, 'next')}
  onValueChange={(v) => book.current?.dragMove(width * (1 - v), height)}
  onSlidingComplete={() => book.current?.dragEnd()} // completes past the middle
/>`,
  },
  nativeRefresh: {
    lang: 'tsx',
    title: 'Clock.tsx',
    code: `// A page that changes on its own: take its picture again.
useEffect(() => book.current?.refresh(), [time]);`,
  },
  nativeComponent: {
    lang: 'tsx',
    title: 'Book.tsx',
    code: `<PageCurl ref={book} style={{ flex: 1 }} spread pageColor="#fbfaf6" onPageChange={setPage}>
  {children}
</PageCurl>`,
  },
} satisfies Record<string, Snippet>;

export type SnippetId = keyof typeof SNIPPETS;
