// The demo book, page by page. Each page is drawn in page units (420 across, like an A5 sheet in
// points) onto a Plate, and printed on its material by the press.

import {
  crible,
  fleuron,
  flower,
  rosette,
  rules,
  spirograph,
  vine,
  vineFrame,
  waves,
} from './ornament';
import { BLACKLETTER, type Plate, random, type TextStyle } from './plate';
import type { Material } from './press';

export const WIDTH = 420;
export const HEIGHT = 594.96;

export interface BookPage {
  material: Material;
  ink?: string;
  ink2?: string;
  cloth?: string;
  /** Pages printed on paper show the page on the other side of their leaf through them. */
  draw(plate: Plate): void;
}

const W = WIDTH;
const CLOTH = '#1c2742';
const NAVY = '#203061';

const BODY = 10.6;
const LEAD = 14.6;
const caps = (size: number, tracking = 0.14): TextStyle => ({ size, caps: true, tracking });

// Pages are designed HEIGHT tall. Full screen on a phone they are as tall as the screen: frames
// stretch to the edges, what sits in the middle moves down by half the extra height, and folios
// stay at the foot.

/** How far a page's centred content moves down on a page taller than HEIGHT. */
const middle = (p: Plate): number => (p.pageHeight - HEIGHT) / 2;

/** How far the deepest text page runs below its first line, set at the normal size. */
const DEEPEST = 345;

/**
 * How much larger running text is set on a tall page, so it fills the page as it does at the
 * normal height. Text grows in both directions, so the deepest page needs DEEPEST·k² + 84·k to
 * reach its folio; the extra size comes in over the first 120 units of extra height.
 */
function grow(p: Plate): number {
  const extra = p.pageHeight - HEIGHT;
  if (extra <= 0) return 1;
  const fit = (-84 + Math.sqrt(84 * 84 + 4 * DEEPEST * (p.pageHeight - 95))) / (2 * DEEPEST);
  return 1 + Math.max(0, fit * 0.97 - 1) * Math.min(1, extra / 120);
}

const cover: BookPage = {
  material: 'cloth',
  cloth: CLOTH,
  draw(p) {
    const H = p.pageHeight;
    const gilt = p.layer(0);
    const blind = p.layer(1);
    blind.lineWidth = 1.4;
    blind.strokeRect(15, 15, W - 30, H - 30);
    blind.lineWidth = 0.6;
    blind.strokeRect(19.5, 19.5, W - 39, H - 39);
    vineFrame(gilt, 32, 32, W - 64, H - 64, 24);
    p.shift(middle(p));
    p.centred('THE TURNING', W / 2, 176, { size: 27, tracking: 0.13, weight: 500 });
    p.centred('of Pages', W / 2, 214, { size: 30, italic: true });
    gilt.fillRect(W / 2 - 40, 236, 80, 0.8);
    const c: [number, number] = [W / 2, 338];
    rosette(gilt, c, 66, 44, { lines: 22, lobes: 9, line: 0.42 });
    spirograph(gilt, c, 36, { loops: 15, copies: 6, line: 0.38, depth: 0.5 });
    gilt.lineWidth = 0.9;
    for (const r of [67.5, 43]) {
      gilt.beginPath();
      gilt.arc(...c, r, 0, Math.PI * 2);
      gilt.stroke();
    }
    flower(gilt, c, 11);
    p.centred('PAGECURL PRESS', W / 2, 470, { size: 10, tracking: 0.32, weight: 500 });
  },
};

function endpaper(spine: 'left' | 'right', label: boolean): BookPage {
  return {
    material: 'endpaper',
    ink: '#1d1b19',
    draw(p) {
      // the cloth turned in over three edges of the board; the spine edge is the hinge
      const H = p.pageHeight;
      const turn = p.layer(2);
      const m = 13;
      turn.fillRect(0, 0, W, H);
      turn.globalCompositeOperation = 'destination-out';
      turn.fillRect(spine === 'left' ? 0 : m, m, W - m, H - 2 * m);
      turn.globalCompositeOperation = 'source-over';
      if (!label) return;
      p.shift(middle(p));
      // a bookplate
      const ink = p.layer(0);
      const lw = 128;
      const lh = 166;
      const x = (spine === 'right' ? W - m : W + m) / 2 - lw / 2 - (spine === 'right' ? 0 : m);
      const y = 150;
      p.layer(1).fillRect(x, y, lw, lh);
      ink.lineWidth = 0.8;
      ink.strokeRect(x + 8, y + 8, lw - 16, lh - 16);
      ink.lineWidth = 0.3;
      ink.strokeRect(x + 10.5, y + 10.5, lw - 21, lh - 21);
      const cx = x + lw / 2;
      p.centred('EX LIBRIS', cx, y + 36, { size: 9.5, tracking: 0.32, weight: 500 });
      rosette(ink, [cx, y + 80], 26, 15, { lines: 16, lobes: 8, line: 0.26 });
      flower(ink, [cx, y + 80], 7);
      p.centred('pagecurl', cx, y + 128, { size: 15, italic: true });
      vine(ink, [x + 22, y + 145], [x + lw - 22, y + 145], 9);
    },
  };
}

const title: BookPage = {
  material: 'paper',
  draw(p) {
    const H = p.pageHeight;
    const red = p.layer(1);
    red.lineWidth = 1.4;
    red.strokeRect(46, 46, W - 92, H - 92);
    red.lineWidth = 0.4;
    red.strokeRect(50.5, 50.5, W - 101, H - 101);
    p.shift(middle(p));
    p.centred('THE', W / 2, 124, caps(13, 0.42));
    p.centred('TURNING', W / 2, 172, { size: 46, tracking: 0.06, weight: 500 });
    p.centred('OF PAGES', W / 2, 206, caps(19, 0.3), 1);
    p.centred('Being a short account of paper, of ink,', W / 2, 250, { size: 12.5, italic: true });
    p.centred('and of what happens when a leaf is turned', W / 2, 267, {
      size: 12.5,
      italic: true,
    });
    const c: [number, number] = [W / 2, 344];
    rosette(red, c, 40, 22, { lines: 26, lobes: 8, line: 0.24 });
    spirograph(red, c, 18, { loops: 12, copies: 5, line: 0.22 });
    flower(p.layer(0), c, 6);
    p.centred('WITH A PLATE AND ORNAMENTS', W / 2, 420, caps(9, 0.24));
    p.centred('DRAWN IN THE BROWSER', W / 2, 434, caps(9, 0.24));
    rules(p.layer(0), W / 2 - 60, 462, 120);
    p.centred('PAGECURL PRESS', W / 2, 496, caps(11.5, 0.3));
    p.centred('MMXXVI', W / 2, 514, caps(10, 0.3), 1);
  },
};

const plate: BookPage = {
  material: 'paper',
  ink: NAVY,
  draw(p) {
    p.shift(middle(p));
    const ink = p.layer(0);
    const x = 64;
    const y = 76;
    const w = 300;
    const h = 380;
    // the plate mark, pressed into the paper around the engraving
    p.layer(2).fillRect(x - 12, y - 12, w + 24, h + 24);
    waves(ink, x, y, w, h, { gap: 1.05, amp: 1.4, period: 8, line: 0.24 });
    ink.save();
    ink.globalCompositeOperation = 'destination-out';
    ink.fillRect(x + 15, y + 15, w - 30, h - 30);
    ink.restore();
    ink.lineWidth = 0.7;
    ink.strokeRect(x, y, w, h);
    ink.strokeRect(x + 15, y + 15, w - 30, h - 30);
    ink.lineWidth = 0.3;
    ink.strokeRect(x + 18, y + 18, w - 36, h - 36);
    const c: [number, number] = [x + w / 2, y + 168];
    rosette(ink, c, 112, 76, { lines: 40, lobes: 14, line: 0.22 });
    spirograph(ink, c, 62, { loops: 22, copies: 12, line: 0.2, depth: 0.45 });
    rosette(ink, c, 30, 12, { lines: 18, lobes: 7, line: 0.2 });
    ink.lineWidth = 0.6;
    for (const r of [113.5, 76, 30.5]) {
      ink.beginPath();
      ink.arc(...c, r, 0, Math.PI * 2);
      ink.stroke();
    }
    flower(ink, c, 7.5);
    p.centred('PLATE I', W / 2, y + h - 52, caps(9.5, 0.3));
    p.centred('A rosette, as turned on the engine lathe.', W / 2, y + h - 36, {
      size: 11,
      italic: true,
    });
  },
};

/** Running head and folio on a text page. */
function furniture(p: Plate, head: string, folio: string, recto: boolean): void {
  const x = recto ? 56 : 70;
  p.centred(head, x + 147, 50, caps(8.5, 0.24));
  p.centred(folio, x + 147, p.pageHeight - (HEIGHT - 548), { size: 10 });
}

/** A run of text under an optional heading in red small capitals. */
interface Section {
  heading?: string;
  paragraphs: string[];
}

/**
 * A page of running text: verso pages carry the book's title at their head and recto pages the
 * chapter's. With `end`, a fleuron closes the text.
 */
function textPage(head: string, folio: number, sections: Section[], end = false): BookPage {
  const recto = folio % 2 === 1;
  return {
    material: 'paper',
    draw(p) {
      furniture(p, head, String(folio), recto);
      const x = recto ? 56 : 70;
      const k = grow(p);
      const box = { x, width: 294, leading: LEAD * k, size: BODY * k };
      let y = 84 + (k - 1) * 20;
      sections.forEach((section, i) => {
        if (section.heading) {
          if (i > 0) y += 12 * k;
          p.centred(section.heading, x + 147, y, caps(10 * k, 0.3), 1);
          y += LEAD * k * 1.6;
        }
        y = p.column(section.paragraphs, { ...box, y }, { indentFirst: i > 0 && !section.heading });
      });
      if (end) fleuron(p.layer(1), [x + 147, y + 22], 22);
    },
  };
}

/** The opening page of a chapter: a vine frame, the title, and a blackletter initial on a dotted ground. */
function opener(
  number: string,
  title: string,
  paragraphs: string[],
  folio: number,
  seed: number,
): BookPage {
  return {
    material: 'paper',
    draw(p) {
      const rand = random(seed);
      vineFrame(p.layer(0), 38, 38, W - 76, p.pageHeight - 76, 20);
      p.shift(middle(p));
      p.centred(`CHAPTER THE ${number}`, W / 2, 112, caps(9, 0.3), 1);
      p.centred(title, W / 2, 146, { size: 26, italic: true });
      const x = 84;
      const y = 190;
      const k = grow(p);
      // the initial: the first letter on a dotted red ground, the rest of the word runs on
      const initial = (paragraphs[0] as string)[0] as string;
      const size = (2 * LEAD + 7.4) * k;
      const box = { x, y: y - 7.4 * k, w: size, h: size };
      const red = p.layer(1);
      red.save();
      red.beginPath();
      red.rect(box.x, box.y, box.w, box.h);
      red.clip();
      crible(red, box.x, box.y, box.w, box.h, rand);
      red.restore();
      red.lineWidth = 0.9;
      red.strokeRect(box.x, box.y, box.w, box.h);
      red.lineWidth = 0.3;
      red.strokeRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
      const letter: TextStyle = { size: 34 * k, family: BLACKLETTER };
      const lx = box.x + box.w / 2 - p.textWidth(initial, letter) / 2;
      const ly = box.y + box.h * 0.8;
      red.save();
      red.globalCompositeOperation = 'destination-out';
      red.font = `${34 * k}px "UnifrakturMaguntia", serif`;
      red.lineWidth = 2.6 * k;
      red.strokeText(initial, lx, ly);
      red.fillText(initial, lx, ly);
      red.restore();
      p.text(initial, lx, ly, letter, 0);
      p.column(
        [(paragraphs[0] as string).slice(1), ...paragraphs.slice(1)],
        { x, y, width: W - 2 * x, leading: LEAD * k, size: BODY * k },
        { cap: { width: size + 5 * k, lines: 3 } },
      );
      // the fleuron and folio keep their place at the foot
      p.shift(middle(p));
      fleuron(p.layer(1), [W / 2, 488], 26);
      p.centred(String(folio), W / 2, 530, { size: 10 });
    },
  };
}

const BOOK = 'THE TURNING OF PAGES';

const chapter = opener(
  'FIRST',
  'Of Paper',
  [
    'Paper begins as a cloud. Fibres of linen, cotton or wood are beaten loose in water until the vat holds a thin grey milk, and a mould of fine wires is dipped in and lifted out level. The water runs away through the wires; what stays is a felt of fibres so thin that light passes through it, and so tangled that it holds together when it dries.',
    'Every sheet keeps a little of that cloud. Hold one to a window and you will see it: denser in places, thinner in others, the faint ribs where the wires were, and here and there a single fibre lying alone like a hair on a pillow.',
  ],
  1,
  11,
);

const ink = textPage(BOOK, 2, [
  {
    paragraphs: [
      'A sheet does not stay the colour it was made. The acids in the pulp work slowly, and the edges, which meet the air first, go first: cream, then straw, then the brown of weak tea. Small rust-coloured spots appear in the margins of old books, which the trade calls *foxing*, after the colour of the animal, and nobody quite agrees on their cause. Damp, iron in the water, a mould that waits decades for its moment. They are the freckles of a book that has been kept.',
    ],
  },
  {
    heading: 'OF INK',
    paragraphs: [
      'Ink is the other half of the bargain. The printing ink of the hand press was lampblack ground into boiled linseed oil, thick as honey, beaten onto the type with leather balls. Pressed into damp paper it does not sit on the surface but bites a little way in, and spreads a hair’s breadth past the edge of every letter.',
      'Under a glass no two letters on a page are the same. One took too much ink and filled its counters; the next took too little and shows the paper through its stem. Where a second colour was printed, in red for a heading or an initial, it seldom lands exactly where it was meant to. The sheet went through the press twice, and the second time it moved.',
      'And the press itself leaves a mark. An engraved plate is inked, wiped and forced into the paper so hard that it sinks a shallow well into the sheet, and the edge of that well, the plate mark, stays for as long as the paper does.',
    ],
  },
]);

const type = textPage('OF PAPER', 3, [
  {
    heading: 'OF TYPE',
    paragraphs: [
      'Before a page can be printed it has to be set. The compositor works at a case of small metal blocks, one letter to each, cast in an alloy of lead, tin and antimony that shrinks so little as it cools that every *a* in the case stands the same height to a fraction of a hair. They are picked out one at a time into a composing stick held in the left hand, and the line is read upside down and backwards, so that it will print the right way round.',
      'When a line is nearly full it must be made exactly full. The words cannot be stretched, so the spaces between them are: a thin space traded for a thick one, or a thick for a thin, until the line is tight in the stick and will not drop out when the page is lifted. This is *justification*, and it is why the lines of a well-set book end in a straight edge on the right, as these do.',
      'Spacing is where the craft shows. Too much and a line falls apart into separate words, and on a crowded page the gaps line up from one line to the next into pale channels running down the column, which printers call *rivers*. Too little and the words run together. A good compositor would rather reset the lines above, carrying a word up or down, than leave a gap the eye could fall into.',
      'The type carries its own history. The *f* and the *i* collided, so they were cast joined, as one piece. Capitals too loud for a running head gave way to small capitals, cut to the height of the lower case. A page of type is a few thousand such decisions, made by hand, then locked into an iron frame, inked, and printed.',
    ],
  },
]);

const sheet = textPage(BOOK, 4, [
  {
    heading: 'OF THE SHEET',
    paragraphs: [
      'A page is never printed alone. A whole sheet goes through the press at once, carrying several pages on each side, laid out so that when it is folded they fall in the right order and the right way up. Flat, the arrangement looks like nonsense, pages upside down and page five beside page twelve. It is called *imposition*.',
      'Folded once, a sheet makes two leaves and four pages, a *folio*. Folded twice it makes a *quarto*, three times an *octavo*, and the sizes of books are still named after how often the sheet was folded. The folded sheet is a gathering, and the letter printed at the foot of its first page, its *signature*, tells the binder which comes next.',
      'The binder’s first task is to check the gatherings against one another, which is called collating, and the signatures make it quick: A, B, C down the folded edges, with no letter missing and none doubled. In many old books you can still find them, a small letter and numeral below the last line of a page, put there for the binder and left for anyone who looks.',
      'This is why the pages of a book come in fours, and why every leaf has two pages, one on each side: turning it shows you the back of the page you have just read. The folds at the head are cut away when the book is trimmed. Books were once sold uncut, and a reader opened each gathering with a paper knife on the way through.',
    ],
  },
]);

const book = opener(
  'SECOND',
  'Of the Book',
  [
    'The gatherings come to the binder flat and loose, folded but not yet a book. Each is sewn through its fold to cords running across the spine, the thread passing in and out along the crease so that no stitch shows on the page. The spine is glued, rounded with a hammer, and the boards are laced on.',
    'Last comes the cover. Letters and ornaments cut in brass are heated and pressed into the cloth through gold leaf, which stays only where the tool touched. The same tools pressed without gold leave a dull, sunken mark, called blind tooling, like the frame on the back of this book.',
  ],
  5,
  23,
);

const marbling = textPage(BOOK, 6, [
  {
    heading: 'OF MARBLING',
    paragraphs: [
      'Inside each board a sheet of paper is pasted down to hide the edges of the cloth, and in a good binding it is marbled. A shallow tray is filled with size, water thickened with carrageen moss, and colours ground with a drop of ox gall are flicked onto its surface from a whisk of straw. The gall lets each drop spread into a thin skin, and each new drop pushes the ones before it aside, until the tray is covered in veined cells like the cut face of a stone.',
      'The craft came to Europe from Persia and Turkey, where it is called *ebru*, after a word for cloud, and for two centuries it was guarded closely. Apprentices, it is said, were taught only one step each, so that none of them could leave and set up alone.',
      'The pattern can be left as it is, which marblers call *stone*, or drawn through with a stylus and a comb into waves, feathers and peacocks. A sheet is laid on the surface for a moment, lifted, and takes every colour with it. The tray is skimmed clean, and the next sheet will be different.',
      'No two marbled sheets match, and that was once a safeguard: the edges of account books were marbled so that a leaf cut out and replaced could never line up with the pattern again. The endpapers of this book were made without water, colours dropped into a field of numbers and pushed through one another, but the idea is the same.',
    ],
  },
]);

const turning = textPage('OF THE BOOK', 7, [
  {
    heading: 'OF TURNING',
    paragraphs: [
      'A page is turned some thousands of times in its life, and each turn is the same small piece of physics. The leaf is held at the spine and lifted at the corner, so it cannot simply swing like a door; it rolls. A fold travels across it, the paper bending round something like a cylinder, while the part already turned lies flat on the other side. Thin paper rolls tightly and quickly. Card resists, and rolls wide.',
      'The light falls differently on every part of the curl, so it is drawn in shadow and highlight as much as in shape, and for a moment you can see both sides of the leaf at once: the end of one thought and, faintly through the paper, the beginning of the next.',
      'Paper has a grain, as wood does. The fibres settle mostly one way as the sheet is formed, and it bends more easily along the grain than across it. Binders make the grain run from head to foot, parallel to the spine, so that the leaves turn freely and lie flat. A book bound against the grain fights its reader at every page.',
      'In a real book no two leaves turn quite alike. The boards of the cover swing stiffly on their hinges and close with a dull knock, a thick plate turns slowly, and a leaf of tissue floats. If your sound is on you will hear the difference here too: the covers are heavier than the pages.',
    ],
  },
]);

const screen = textPage(BOOK, 8, [
  {
    heading: 'ON A SCREEN',
    paragraphs: [
      'None of the pages in this little book were scanned or photographed. The paper, its fibres and foxing, the ink and its misprints, the marbled endpapers and the gilt on the cover were all made by your browser a moment ago, and the page you are turning is a picture of them.',
      'To turn a picture like a leaf, the screen lays it over a mesh of small triangles and wraps every one past the fold round a cylinder. The finger sets where the cylinder lies and how it is angled; its radius sets how tightly the paper rolls. Each triangle is shaded by how far it has turned from the light, the back of the leaf is printed with whatever is on its other side, and a soft shadow falls on the page being uncovered.',
      'Let go, and the leaf finishes on its own, quickly at first and then gently, as a real one settles. Or it falls back where it came from, if it was not lifted far enough. All of it is drawn again sixty times a second, for as long as the page is moving, and not at all when it is still.',
      'The hard part is not the curl but the page. A browser keeps no picture of what it has drawn where a script can reach it, so a page must be captured before it can be turned, quickly enough that the finger never waits, and exactly enough that nothing shifts when the picture takes the page’s place. In this book there is nothing to capture: each page is drawn into a canvas in the first place, and the curl turns that canvas as it is.',
    ],
  },
]);

const codex = textPage(
  'OF THE BOOK',
  9,
  [
    {
      heading: 'OF THE CODEX',
      paragraphs: [
        'For most of the history of writing there was nothing to turn. A long text was a scroll, read by unrolling one end while rolling up the other, and to find a passage near the end you wound through everything before it. The codex, leaves folded and sewn along one edge, slowly took its place in the first centuries of our era, and the page arrived with it.',
        'The first codices were notebooks, wax tablets hinged together and then sheets of parchment folded and stitched. Lawyers and the early Christians took to them first: a codex is easy to carry, holds writing on both sides of every leaf, and lets you find your place.',
        'A page can be numbered, and so a book can have an index. You can keep a finger in one place while you look at another, and come back tomorrow to the corner you turned down. Reading became something you could do out of order.',
        'A screen can scroll, slide or fade, and any of those will reach the next page. A turn also shows you where you are: the leaves read on the left, the leaves to come on the right, and between them the one in your hand, lifting.',
      ],
    },
  ],
  true,
);

const colophon: BookPage = {
  material: 'paper',
  draw(p) {
    p.shift(middle(p));
    const cx = 70 + 147;
    p.centred('COLOPHON', cx, 200, caps(10, 0.34), 1);
    const lines = [
      'This book was set in EB Garamond,',
      'after the types of Claude Garamont,',
      'with an initial in Unifraktur Maguntia.',
      'Its paper, ink, marbling and gilding',
      'were drawn procedurally in WebGL,',
      'and its pages are turned with pagecurl.',
    ];
    lines.forEach((line, i) => {
      p.centred(line, cx, 236 + i * 16.5, { size: 11.5, italic: true });
    });
    const red = p.layer(1);
    rosette(red, [cx, 380], 22, 11, { lines: 18, lobes: 7, line: 0.22 });
    flower(p.layer(0), [cx, 380], 5);
    p.centred('FINIS', cx, 440, caps(10, 0.4));
  },
};

const back: BookPage = {
  material: 'cloth',
  cloth: CLOTH,
  draw(p) {
    const H = p.pageHeight;
    const blind = p.layer(1);
    blind.lineWidth = 1.4;
    blind.strokeRect(15, 15, W - 30, H - 30);
    blind.lineWidth = 0.6;
    blind.strokeRect(19.5, 19.5, W - 39, H - 39);
    vineFrame(blind, 32, 32, W - 64, H - 64, 24);
    const gilt = p.layer(0);
    const c: [number, number] = [W / 2, H / 2];
    rosette(gilt, c, 24, 13, { lines: 14, lobes: 8, line: 0.4 });
    flower(gilt, c, 6);
  },
};

/** The pages in order, the front cover first and the back cover last. */
export const PAGES: BookPage[] = [
  cover,
  endpaper('right', true),
  title,
  plate,
  chapter,
  ink,
  type,
  sheet,
  book,
  marbling,
  turning,
  screen,
  codex,
  colophon,
  endpaper('left', false),
  back,
];

/** The first chapter's opening page, where the demo on the landing page lies open. */
export const CHAPTER = PAGES.indexOf(chapter);
