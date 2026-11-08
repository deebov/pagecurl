/**
 * Splits a book into pages by measuring it in a hidden page. Paragraphs that don't fit are
 * broken between words and continue on the next page.
 */

export interface Chapter {
  number: string;
  title: string;
  blocks: ({ type: 'p'; text: string } | { type: 'verse'; lines: string[] } | { type: 'break' })[];
}

interface Word {
  text: string;
  em: boolean;
}

type Block =
  | { type: 'opener'; number: string; title: string }
  | { type: 'p'; words: Word[]; first: boolean; cont: boolean; split: boolean }
  | { type: 'verse'; lines: string[] }
  | { type: 'break' };

/** A block placed on a page. `start` is the index of its first word in the book. */
export type Item = Block & { start: number };

export interface Page {
  items: Item[];
  start: number;
  chapter: string;
}

/** Turns the chapters into a flat list of blocks, numbering words so a position survives a re-flow. */
export function prepare(chapters: Chapter[]): Item[] {
  const items: Item[] = [];
  let index = 0;
  for (const chapter of chapters) {
    items.push({ type: 'opener', number: chapter.number, title: chapter.title, start: index });
    let first = true;
    for (const block of chapter.blocks) {
      if (block.type === 'p') {
        const words = parseWords(block.text);
        items.push({ type: 'p', words, first, cont: false, split: false, start: index });
        index += words.length;
      } else {
        items.push({ ...block, start: index });
        index += 1;
      }
      first = false;
    }
  }
  return items;
}

/** `_underscores_` mark italics in the source text. */
function parseWords(text: string): Word[] {
  let em = false;
  return text.split(/\s+/).map((raw) => {
    const word = { text: raw.replaceAll('_', ''), em: em || raw.startsWith('_') };
    for (const c of raw) if (c === '_') em = !em;
    return word;
  });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function itemHtml(item: Item): string {
  switch (item.type) {
    case 'opener':
      return `<div class="opener"><small>${escapeHtml(item.number)}</small><h2>${escapeHtml(item.title)}</h2></div>`;
    case 'p': {
      const cls = [item.first && 'first', item.cont && 'cont', item.split && 'split'].filter(
        Boolean,
      );
      const text = item.words.map((w) =>
        w.em ? `<em>${escapeHtml(w.text)}</em>` : escapeHtml(w.text),
      );
      return `<p class="${cls.join(' ')}">${text.join(' ')}</p>`;
    }
    case 'verse':
      return `<div class="verse">${item.lines.map((l) => `<span>${escapeHtml(l)}</span>`).join('')}</div>`;
    case 'break':
      return '<div class="break">* * *</div>';
  }
}

/** Fills pages in order. `body` is the content area of an empty page with the final size and styles. */
export function paginate(items: Item[], body: HTMLElement): Page[] {
  const pages: Page[] = [];
  let current: Item[] = [];
  let chapter = '';
  body.innerHTML = '';

  const fits = () => body.scrollHeight <= body.clientHeight;
  const tryAdd = (item: Item) => {
    body.insertAdjacentHTML('beforeend', itemHtml(item));
    if (fits()) return true;
    body.lastElementChild?.remove();
    return false;
  };
  const add = (item: Item) => {
    if (!tryAdd(item)) body.insertAdjacentHTML('beforeend', itemHtml(item));
    current.push(item);
  };
  const flush = () => {
    if (current.length) pages.push({ items: current, start: current[0]?.start ?? 0, chapter });
    current = [];
    body.innerHTML = '';
  };

  for (const item of items) {
    if (item.type === 'opener') {
      flush();
      chapter = item.title;
      add(item);
      continue;
    }
    if (item.type !== 'p') {
      if (tryAdd(item)) current.push(item);
      else {
        flush();
        add(item);
      }
      continue;
    }
    let rest = item;
    while (!tryAdd(rest)) {
      // The most words that still fit, found by bisection.
      let lo = 0;
      let hi = rest.words.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const head = { ...rest, words: rest.words.slice(0, mid), split: true };
        if (tryAdd(head)) {
          body.lastElementChild?.remove();
          lo = mid;
        } else hi = mid - 1;
      }
      if (lo === 0 && !current.length) lo = 1; // a page too small for one word
      if (lo > 0) add({ ...rest, words: rest.words.slice(0, lo), split: true });
      flush();
      rest = {
        ...rest,
        words: rest.words.slice(lo),
        start: rest.start + lo,
        first: false,
        cont: lo > 0,
      };
    }
    current.push(rest);
  }
  flush();
  return pages;
}
