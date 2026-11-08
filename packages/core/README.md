# @pagecurl/core

A realistic page curl for any DOM content. Drag a corner, tap near an edge, or turn pages from code. Rendered with WebGL, with no dependencies and no framework.

```sh
npm install @pagecurl/core
```

## Usage

Every child of the element becomes a page.

```html
<div id="book" style="width: 400px; height: 560px">
  <section>First page</section>
  <section>Second page</section>
  <section>Third page</section>
</div>
```

```js
import { createPageCurl } from '@pagecurl/core';

const curl = createPageCurl(document.getElementById('book'), {
  onPageChange: (page) => console.log('now on page', page),
});

// Hook turns up to anything: keys, buttons, timers, gestures of your own.
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') curl.next();
  if (e.key === 'ArrowLeft') curl.prev();
});
```

The element needs a size. Pages are laid out to fill it (or half of it each, in spread mode).

## Options

| Option         | Default                     |                                                                                                                                                                                                                                                                               |
| -------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`         | `0`                         | Initial page.                                                                                                                                                                                                                                                                 |
| `spread`       | `false`                     | Two pages side by side.                                                                                                                                                                                                                                                       |
| `direction`    | `'ltr'`                     | `'rtl'` binds pages on the right.                                                                                                                                                                                                                                             |
| `pageColor`    | page background             | Paper colour, used to tint the back of a page and its shadows.                                                                                                                                                                                                                |
| `turnDuration` | `0.25`                      | Seconds for a turn started by a tap or from code.                                                                                                                                                                                                                             |
| `dragDuration` | `0.2`                       | Seconds for a drag to catch up with the pointer, and to settle after release.                                                                                                                                                                                                 |
| `drag`         | `true`                      | Turn pages by dragging. On touch, a drag anywhere on the book turns the page and the page doesn't scroll under the finger. With a mouse, a drag that starts on text selects it instead, except within `grabZone` of the edges; add `user-select: none` to turn from anywhere. |
| `tap`          | `true`                      | Turn pages by tapping near the left or right edge.                                                                                                                                                                                                                            |
| `tapZone`      | `110` (`82` in spread mode) | Width of the tap zones, in CSS pixels.                                                                                                                                                                                                                                        |
| `grabZone`     | `32`                        | Width of the strips along the book's left and right edges where a mouse drag always turns the page, even when it starts on text.                                                                                                                                              |
| `ignore`       | form fields                 | Elements matching this selector never start a drag or tap. Add `data-pagecurl-ignore` to opt out any element.                                                                                                                                                                 |
| `overflow`     | 25% of the larger side      | CSS pixels around the element the curl may draw into.                                                                                                                                                                                                                         |
| `pixelRatio`   | `devicePixelRatio`          | Rendering resolution.                                                                                                                                                                                                                                                         |
| `snapshot`     | built in                    | Replaces how a page is turned into an image (see below).                                                                                                                                                                                                                      |
| `liveFlat`     | `false`                     | During a turn, keep the part of the page that hasn't started to bend as the live page, and draw only the bending part from its snapshot, so text that isn't moving can't shift. See the [FAQ](#faq).                                                                          |
| `htmlInCanvas` | `false`                     | Experimental. Where the browser supports [HTML-in-Canvas](https://github.com/WICG/html-in-canvas), the browser paints pages for the curl itself, so even the bending part matches the page exactly. Ignored with a custom `snapshot`. See the [FAQ](#faq).                    |
| `onPageChange` |                             | `(page) => void`                                                                                                                                                                                                                                                              |
| `onTurnStart`  |                             | `({ from, to, direction, interactive }) => void`                                                                                                                                                                                                                              |
| `onTurnEnd`    |                             | `({ from, to, direction, interactive, completed }) => void`                                                                                                                                                                                                                   |

## Methods

|                                                                                      |                                                                                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `next()`, `prev()`, `turn('next' \| 'prev')`                                         | Animate a turn. Resolve to `true` when it finishes, `false` if there was nowhere to go.                                     |
| `goTo(page)`                                                                         | Show a page immediately.                                                                                                    |
| `canTurn('next' \| 'prev')`                                                          | Whether there is a page in that direction.                                                                                  |
| `dragStart(x, y, direction?)`, `dragMove(x, y)`, `dragEnd({ complete?, velocity? })` | Drive a drag yourself, in the element's CSS pixels. Use it to tie the curl to a slider, scroll position or any other input. |
| `setOptions(options)`                                                                | Change options after creation.                                                                                              |
| `refresh()`                                                                          | Re-read the pages and drop cached snapshots.                                                                                |
| `destroy()`                                                                          | Remove listeners and restore the element.                                                                                   |
| `page`, `pageCount`, `turning`                                                       | Current state.                                                                                                              |

## How pages are captured

While pages lie flat they are the live DOM, so links, inputs and selection work as normal. When a turn starts, the turning page is captured as an image and curled with WebGL (with `liveFlat`, only the part that bends). Capturing happens ahead of time while the browser is idle, and again whenever a page's content changes.

The built-in capture clones the page with its computed styles and draws it through an SVG `foreignObject`, with images and web fonts embedded. A few things can't be captured that way:

- Cross-origin images and fonts without CORS headers.
- The contents of `<iframe>`s.
- Scrolled content inside a page: the page is captured scrolled to the top.
- CSS animations are captured at their current frame.

For pages that are already pixels, such as a PDF viewer drawing into a `<canvas>`, pass your own `snapshot`:

```js
createPageCurl(book, {
  snapshot: (page) => page.querySelector('canvas'),
});
```

Without WebGL, pages still turn, just without the curl.

## FAQ

### Why does text shift a little when a page starts to turn?

Browsers can't take a picture of an element, so the turning page is copied and drawn a second time as an image, through SVG. The copy is laid out again from scratch, with its fonts embedded separately and at a different scale, and text can land a fraction of a pixel away from where it was. When the image takes over from the live page, that shows as a small jump. How much depends on the browser, fonts, emoji and zoom; often it's nothing.

### How do I make turns pixel-exact?

```js
createPageCurl(book, { liveFlat: true, htmlInCanvas: true });
```

- `liveFlat` works in every browser. While a page turns, the part that hasn't started to bend stays the live page, cut along the fold, and only the bending part comes from the image. Text that isn't moving can't jump; any difference is left inside the part that is curling, where the paper is already bending and shading.
- `htmlInCanvas` has the browser paint the page into the curl itself, so the image matches exactly, bending part included. It needs a browser that supports it and does nothing elsewhere.

Two things make the default exact on their own. Size text, line heights and padding in whole pixels, since fractions are what round differently in the snapshot. And pages that are already pixels, like images, canvases or PDF pages, never shift when you pass them as their own [`snapshot`](#how-pages-are-captured): the image that curls is the page you see.

### Which browsers support `htmlInCanvas`?

It uses [HTML-in-Canvas](https://github.com/WICG/html-in-canvas), a web API still being designed. Today it's only in Chrome, behind `chrome://flags/#enable-experimental-web-platform-features`, or for every Chrome visitor of a site that has joined Chrome's origin trial:

```html
<meta http-equiv="origin-trial" content="YOUR_TOKEN" />
```

Elsewhere, and if the API changes before it ships, pages are captured the usual way. Pair it with `liveFlat` so those browsers are covered too.

### Why aren't they on by default?

Both are new: `liveFlat` changes how a turning page is shown, and `htmlInCanvas` builds on an API that is still changing. They're opt-in while they settle.

### Is there anything they don't cover?

- `liveFlat` applies while one page is turning. When turns overlap, as in fast flipping, the turning pages are drawn from images until they settle.
- In spread mode, the page arriving on the back of the turning page is drawn from its image until it lands.
- `htmlInCanvas` curls a still copy of the page kept hidden inside the book's canvas. Videos and iframes come out blank in it, and document-wide queries like `querySelectorAll` find the copies too.
- With a custom `snapshot`, `htmlInCanvas` is ignored; `liveFlat` still works.
