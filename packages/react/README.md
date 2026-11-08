# @pagecurl/react

A realistic page curl for React. Each child is a page: drag a corner, tap near an edge, or turn pages from code. Zero dependencies beyond React itself.

```sh
npm install @pagecurl/react
```

## Usage

```tsx
import { PageCurl, type PageCurlHandle } from '@pagecurl/react';
import { useRef, useState } from 'react';

export function Book() {
  const book = useRef<PageCurlHandle>(null);
  const [page, setPage] = useState(0);

  return (
    <>
      <PageCurl ref={book} page={page} onPageChange={setPage} style={{ width: 400, height: 560 }}>
        <Cover />
        <Chapter />
        <Notes />
      </PageCurl>

      <button onClick={() => book.current?.prev()}>Previous</button>
      <button onClick={() => book.current?.next()}>Next</button>
    </>
  );
}
```

Give the component a size. Any other `div` props (`className`, `style`, `aria-*`) are passed through.

## Props

Every option of [`@pagecurl/core`](../core/README.md#options) is a prop: `spread`, `direction`, `pageColor`, `turnDuration`, `dragDuration`, `drag`, `tap`, `tapZone`, `grabZone`, `ignore`, `overflow`, `pixelRatio`, `snapshot`, `liveFlat`, `htmlInCanvas`, `onPageChange`, `onTurnStart` and `onTurnEnd`.

| Prop          |                                                                              |
| ------------- | ---------------------------------------------------------------------------- |
| `page`        | Controlled page. Moving it by one turn animates; larger jumps are immediate. |
| `defaultPage` | Initial page when `page` isn't controlled.                                   |

## Ref

The ref gives you the same controls as the core: `next()`, `prev()`, `turn(direction)`, `goTo(page)`, `canTurn(direction)`, `dragStart(x, y, direction?)`, `dragMove(x, y)`, `dragEnd(options?)`, `refresh()`, and `page`, `pageCount`, `turning`, `element`.

Keyboard shortcuts are left to you, so they don't clash with the rest of your app:

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') book.current?.next();
    if (e.key === 'ArrowLeft') book.current?.prev();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);
```

## Your own markup

`usePageCurl` turns the children of any element into pages, if you'd rather render the container yourself:

```tsx
const { ref, curl, page } = usePageCurl({ spread: true });

return (
  <div ref={ref} className="book">
    {chapters.map((c) => (
      <Chapter key={c.id} {...c} />
    ))}
  </div>
);
```

See the core package for [how pages are captured](../core/README.md#how-pages-are-captured) and what can't be.
