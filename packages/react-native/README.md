# @pagecurl/react-native

A realistic page curl for React Native. Each child is a page: drag a corner, tap near an edge, or turn pages from code. The curl is the same one as [`@pagecurl/core`](../core/README.md), drawn with [Skia](https://shopify.github.io/react-native-skia/) on iOS and Android.

```sh
npx expo install @pagecurl/react-native @shopify/react-native-skia
```

Skia is a peer dependency. It works in Expo Go, in development builds and in bare React Native apps.

## Usage

```tsx
import { PageCurl, type PageCurlHandle } from '@pagecurl/react-native';
import { useRef, useState } from 'react';
import { Button, View } from 'react-native';

export function Book() {
  const book = useRef<PageCurlHandle>(null);
  const [page, setPage] = useState(0);

  return (
    <View style={{ flex: 1 }}>
      <PageCurl ref={book} page={page} onPageChange={setPage} style={{ flex: 1 }}>
        <Cover />
        <Chapter />
        <Notes />
      </PageCurl>

      <Button title="Previous" onPress={() => book.current?.prev()} />
      <Button title="Next" onPress={() => book.current?.next()} />
    </View>
  );
}
```

Give the book a size. Each page fills it (or half of it each, in spread mode). Any other `View` props are passed through.

## Props

| Prop           | Default                     |                                                                              |
| -------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `page`         |                             | Controlled page. Moving it by one turn animates; larger jumps are immediate. |
| `defaultPage`  | `0`                         | Initial page when `page` isn't controlled.                                   |
| `spread`       | `false`                     | Two pages side by side, as on a tablet or an open foldable.                  |
| `direction`    | `'ltr'`                     | `'rtl'` binds pages on the right.                                            |
| `pageColor`    | page background, or white   | Paper colour, used to tint the back of a page and its shadows.               |
| `turnDuration` | `0.25`                      | Seconds for a turn started by a tap or from code.                            |
| `dragDuration` | `0.2`                       | Seconds for a drag to catch up with the finger, and to settle after release. |
| `drag`         | `true`                      | Turn pages by dragging, from anywhere on the book.                           |
| `tap`          | `true`                      | Turn pages by tapping near the left or right edge.                           |
| `tapZone`      | `110` (`82` in spread mode) | Width of the tap zones, in points.                                           |
| `overflow`     | 25% of the larger side      | Points around the book the curl may draw into (a page lifts past its edges). |
| `onPageChange` |                             | `(page) => void`                                                             |
| `onTurnStart`  |                             | `({ from, to, direction, interactive }) => void`                             |
| `onTurnEnd`    |                             | `({ from, to, direction, interactive, completed }) => void`                  |

## Ref

`next()`, `prev()`, `turn(direction)`, `goTo(page)`, `canTurn(direction)`, `dragStart(x, y, direction?)`, `dragMove(x, y)`, `dragEnd(options?)`, `refresh()`, and `page`, `pageCount`, `turning`. They work as in [`@pagecurl/react`](../react/README.md#ref), with positions in points.

## How it works

Pages lying flat are your live views, so buttons, text input and scroll views on them work as normal. When a page starts to turn, Skia takes a picture of it (`makeImageFromView`) and curls that, then the live page takes over again when it lands. Pictures of the pages either side are taken ahead of time, and again whenever the book's children change.

- Taps go to whatever is under the finger first. A tap reaches the book's tap zones only when nothing on the page handled it.
- A drag takes the touch from the page once the finger has moved a few points, so a button you start dragging on doesn't fire.
- Only the pages near the current one are mounted. Pages further away are unmounted, and their state with them.
- A page whose content changes on its own, without the book re-rendering (a timer, say), is pictured as it was. Call `refresh()` after such a change.
