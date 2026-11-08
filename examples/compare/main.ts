// Two copies of the same book, one with the default behaviour and one with `liveFlat`, turned
// together so the start of a turn can be compared side by side.
import { createPageCurl } from '@pagecurl/core';

// A condensed font loaded from script rather than a stylesheet. The snapshot can only embed fonts
// it finds in stylesheets, so it draws these pages in a fallback font: an exaggerated version of
// the small differences that make text shift.
const CONDENSED =
  'https://fonts.gstatic.com/s/robotocondensed/v31/ieVl2ZhZI2eCN5jzbjEETS9weq8-19K7DQk6YvM.woff2';

const PAGES = [
  `<article class="leaf cover">
    <span class="kicker">pagecurl</span>
    <h3>Watch the text as each turn starts.</h3>
  </article>`,
  `<article class="leaf">
    <span class="kicker">Start here</span>
    <h3>Grab the corner and pull slowly.</h3>
    <p>The text on this page should stay exactly where it is while the corner lifts.</p>
    <span class="folio">1</span>
  </article>`,
  `<article class="leaf">
    <span class="kicker">Anything goes</span>
    <h3>Gradients, SVG, emoji, you name it.</h3>
    <div class="chips"><span>🌿 fern</span><span>🪨 stone</span><span>🐌 snail</span></div>
    <span class="folio">2</span>
  </article>`,
  `<article class="leaf">
    <span class="kicker">A long paragraph</span>
    <p>Small differences add up along a line, so text far to the right is where a shift shows
    first. This paragraph runs the full width of the page, line after line, to give it room to
    drift. Look at the ends of the lines as the turn begins.</p>
    <span class="folio">3</span>
  </article>`,
  `<article class="leaf">
    <span class="kicker">Numbers</span>
    <h3>1,234,567.89</h3>
    <p>Figures, punctuation — dashes, “quotes” and ellipses… all of it should hold still.</p>
    <span class="folio">4</span>
  </article>`,
  `<article class="leaf">
    <span class="kicker">Small print</span>
    <p class="small">Very small text rounds to the pixel grid differently, so it can
    move more than large headings do. Compare the two books here closely.</p>
    <span class="folio">5</span>
  </article>`,
  `<article class="leaf">
    <span class="kicker">Almost there</span>
    <h3>Turn back too.</h3>
    <p>Backward turns start from the left page.</p>
    <span class="folio">6</span>
  </article>`,
  `<article class="leaf cover">
    <span class="kicker">The end</span>
    <h3>Try “Exaggerate” to see the difference clearly.</h3>
  </article>`,
];

function book(id: string, liveFlat: boolean) {
  const el = document.getElementById(id) as HTMLElement;
  el.innerHTML = PAGES.join('');
  return createPageCurl(el, { spread: true, liveFlat });
}

const books = [book('default', false), book('live', true)];

const turn = (direction: 'next' | 'prev') => {
  for (const b of books) void b.turn(direction);
};
document.getElementById('next')?.addEventListener('click', () => turn('next'));
document.getElementById('prev')?.addEventListener('click', () => turn('prev'));
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') turn('next');
  if (e.key === 'ArrowLeft') turn('prev');
});

const whole = document.getElementById('whole') as HTMLInputElement;
whole.addEventListener('change', () => {
  document.body.classList.toggle('whole', whole.checked);
});

const slow = document.getElementById('slow') as HTMLInputElement;
slow.addEventListener('change', () => {
  const options = slow.checked
    ? { turnDuration: 1.6, dragDuration: 0.6 }
    : { turnDuration: 0.25, dragDuration: 0.2 };
  for (const b of books) b.setOptions(options);
});

let condensed: Promise<void> | null = null;
const exaggerate = document.getElementById('exaggerate') as HTMLInputElement;
exaggerate.addEventListener('change', async () => {
  condensed ??= new FontFace('Condensed', `url(${CONDENSED})`, { weight: '100 900' })
    .load()
    .then((face) => {
      document.fonts.add(face);
    });
  await condensed;
  document.body.classList.toggle('exaggerate', exaggerate.checked);
});
