import { beforeAll, describe, expect, test } from 'bun:test';
import { Book, type BookHost, type BookOptions, type TurnEndEvent } from '../src/book.js';

beforeAll(() => {
  globalThis.requestAnimationFrame ??= (cb) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number;
  globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A book of `count` pages whose pictures are their page numbers. */
function setup(count: number, options: BookOptions = {}, page = 0) {
  const drawn: { page: number; flip: boolean }[][] = [];
  const ends: TurnEndEvent[] = [];
  const host: BookHost<number> = {
    capture: async (p) => p,
    release: () => {},
    paper: () => [1, 1, 1, 1],
    draw: (layers) => {
      const frame: { page: number; flip: boolean }[] = [];
      layers((mesh, image, view) => {
        if (mesh.draws.length) frame.push({ page: image, flip: view.flip });
      });
      drawn.push(frame);
    },
    changed: () => {},
  };
  const book = new Book(host, count, page, {
    turnDuration: 0.05,
    dragDuration: 0.05,
    ...options,
    onTurnEnd: (e) => ends.push(e),
  });
  book.setSize(400, 600, 2);
  return { book, drawn, ends };
}

describe('Book', () => {
  test('an animated turn draws the turning page and lands on the next one', async () => {
    const { book, drawn, ends } = setup(3);
    expect(await book.next()).toBe(true);
    expect(book.page).toBe(1);
    expect(ends).toEqual([
      { from: 0, to: 1, direction: 'next', interactive: false, completed: true },
    ]);
    expect(drawn.some((f) => f.length === 1 && f[0]?.page === 0)).toBe(true);
    // The last frame clears the drawing.
    expect(drawn.at(-1)).toEqual([]);
  });

  test('there is nothing to turn to before the first page or after the last', async () => {
    const { book } = setup(2, {}, 1);
    expect(await book.next()).toBe(false);
    book.goTo(0);
    expect(await book.prev()).toBe(false);
  });

  test('a turn back curls the previous page down over the current one', async () => {
    const { book, drawn } = setup(3, {}, 2);
    expect(await book.prev()).toBe(true);
    expect(book.page).toBe(1);
    expect(drawn.some((f) => f[0]?.page === 1)).toBe(true);
  });

  test('a tap near the right edge turns forward, near the left edge back', async () => {
    const { book } = setup(3, {}, 1);
    book.touchStart(390, 300, 0);
    book.touchEnd();
    await wait(150);
    expect(book.page).toBe(2);
    book.touchStart(10, 300, 1000);
    book.touchEnd();
    await wait(150);
    expect(book.page).toBe(1);
  });

  test('a tap in the middle does nothing', async () => {
    const { book } = setup(3);
    book.touchStart(200, 300, 0);
    book.touchEnd();
    await wait(150);
    expect(book.page).toBe(0);
  });

  test('a drag released past the middle completes the turn', async () => {
    const { book, ends } = setup(3);
    book.touchStart(380, 300, 0);
    expect(book.touchMove(360, 302, 200)).toBe(true);
    await wait(20);
    for (let i = 1; i <= 10; i++) book.touchMove(360 - i * 30, 300, 200 + i * 40);
    book.touchEnd();
    await wait(150);
    expect(book.page).toBe(1);
    expect(ends.at(-1)).toMatchObject({ interactive: true, completed: true });
  });

  test('a drag released on the side it started from falls back', async () => {
    const { book, ends } = setup(3);
    book.touchStart(380, 300, 0);
    book.touchMove(360, 300, 200);
    await wait(20);
    book.touchMove(300, 300, 600);
    book.touchMove(299, 300, 900);
    book.touchEnd();
    await wait(150);
    expect(book.page).toBe(0);
    expect(ends.at(-1)).toMatchObject({ interactive: true, completed: false });
  });

  test('a spread turns two pages and shows the next one on the back', async () => {
    const { book, drawn } = setup(6, { spread: true });
    expect(book.restingPages()).toEqual([0, 1]);
    expect(await book.next()).toBe(true);
    expect(book.page).toBe(2);
    expect(
      drawn.some(
        (f) => f.length === 2 && f[0]?.page === 1 && f[1]?.page === 2 && f[1]?.flip === true,
      ),
    ).toBe(true);
  });

  test('right-to-left books turn forward from the left edge', async () => {
    const { book } = setup(3, { direction: 'rtl' });
    book.touchStart(10, 300, 0);
    book.touchEnd();
    await wait(150);
    expect(book.page).toBe(1);
  });

  test('while a page turns forward, the page underneath lies flat', async () => {
    const { book } = setup(3);
    const turn = book.next();
    await wait(30);
    expect(book.turning).toBe(true);
    expect(book.restingPages()).toEqual([1]);
    await turn;
    expect(book.turning).toBe(false);
  });

  test('a page that cannot be captured still turns, without the curl', async () => {
    const { book } = setup(3);
    const host = book.host as BookHost<number | null>;
    host.capture = async () => null;
    expect(await book.next()).toBe(true);
    expect(book.page).toBe(1);
  });
});
