import type { ReactNode } from 'react';
import { Code } from './code';
import { NativeFaq, NativeGuides, NativeReference } from './docs-native';
import type { Platform } from './platform';

export function Guides({ platform }: { platform: Platform }) {
  return platform === 'native' ? <NativeGuides /> : <WebGuides />;
}

export function Reference({ platform }: { platform: Platform }) {
  return platform === 'native' ? <NativeReference /> : <WebReference />;
}

export function Faq({ platform }: { platform: Platform }) {
  return platform === 'native' ? <NativeFaq /> : <WebFaq />;
}

const GUIDES: [string, string][] = [
  ['sizing', 'Sizing'],
  ['spreads', 'Spreads and right-to-left'],
  ['controlled', 'Controlling the page'],
  ['from-code', 'Turning from code'],
  ['own-drag', 'Driving a drag yourself'],
  ['interaction', 'Links, buttons and text'],
  ['snapshots', 'Pages that are already pixels'],
  ['limits', 'What can’t be captured'],
];

const REFERENCE: [string, string][] = [
  ['create', 'createPageCurl'],
  ['component', '<PageCurl>'],
  ['hook', 'usePageCurl'],
  ['options', 'Options'],
  ['methods', 'Methods and properties'],
  ['events', 'Events'],
  ['snapshotter', 'Snapshotter'],
];

function WebGuides() {
  return (
    <section className="section" id="docs">
      <h2>Guides</h2>
      <Contents items={GUIDES} />

      <Topic id="sizing" title="Sizing">
        <p>
          The book is the element you pass in, or the <code>div</code> that{' '}
          <code>&lt;PageCurl&gt;</code> renders. Give it a width and a height. Every page is
          stretched to fill it, or half of it each in spread mode, so design pages to that size.
        </p>
        <Code id="sizing" />
        <p>
          The book follows its own size. When it changes, pages are laid out again and recaptured,
          so a fluid width or a media query just works.
        </p>
      </Topic>

      <Topic id="spreads" title="Spreads and right-to-left">
        <p>
          <code>spread</code> shows two pages side by side, like an open book. The page number is
          then always the left page of the spread, and a turn moves two pages.{' '}
          <code>direction="rtl"</code> binds the book on the right for Arabic, Hebrew or manga.
        </p>
        <Code id="spreads" />
        <p>
          Spreads start with pages 0 and 1 side by side. To open on a single page on the right, as a
          printed book does, put an empty page first.
        </p>
      </Topic>

      <Topic id="controlled" title="Controlling the page">
        <p>
          In React, pass <code>page</code> and <code>onPageChange</code> to keep the page in your
          own state. A change of one turn animates. Anything further jumps straight there.
        </p>
        <Code id="controlled" />
        <p>
          Prefer <code>defaultPage</code> when you only need a starting point and don't mind the
          component keeping its own state.
        </p>
      </Topic>

      <Topic id="from-code" title="Turning from code">
        <p>
          <code>next()</code>, <code>prev()</code> and <code>turn(direction)</code> animate a turn
          and return a promise. It resolves to <code>true</code> when the page lands, or to{' '}
          <code>false</code> straight away if there is no page to turn to. <code>goTo(page)</code>{' '}
          jumps without animating.
        </p>
        <Code id="fromCode" />
        <p>Keyboard shortcuts are left to you, so they don't clash with the rest of your app.</p>
        <Code id="keys" />
      </Topic>

      <Topic id="own-drag" title="Driving a drag yourself">
        <p>
          A drag doesn't have to come from the pointer. <code>dragStart</code>,{' '}
          <code>dragMove</code> and <code>dragEnd</code> move the curl as if a finger held the page,
          so you can tie it to a slider, the scroll position or a gesture library.
        </p>
        <Code id="ownDrag" />
        <p>
          Without a direction, a drag that starts on the right half turns forward. Pass{' '}
          <code>{'{ complete: true }'}</code> to <code>dragEnd</code> to finish the turn wherever
          the drag stopped, or <code>false</code> to let the page fall back.
        </p>
      </Topic>

      <Topic id="interaction" title="Links, buttons and text">
        <p>
          While pages lie flat they are your live DOM. Links, buttons, inputs, focus and screen
          readers all work, and only the current pages can be reached.
        </p>
        <ul>
          <li>
            Clicking a link or a button never counts as a tap, and form fields never start a drag.
          </li>
          <li>
            With a mouse, a drag that starts on text selects it. A drag from blank paper, or from
            within <code>grabZone</code> of the book's edges, turns the page. Add{' '}
            <code>user-select: none</code> to pages that should turn from anywhere.
          </li>
          <li>
            On touch it works like a reading app: a drag anywhere on the book, in any direction,
            turns the page, and the page never scrolls while a finger is on the book. A long press
            selects text as usual.
          </li>
          <li>
            Taps only turn the page near the edges. <code>tapZone</code> sets how wide those strips
            are.
          </li>
        </ul>
        <p>
          Anything that needs the pointer for itself, like a map, a canvas you draw on or a
          carousel, should opt out with <code>data-pagecurl-ignore</code>:
        </p>
        <Code id="ignore" />
        <p>
          The <code>ignore</code> option replaces the selector entirely, so include the form fields
          if you still want them left alone.
        </p>
      </Topic>

      <Topic id="snapshots" title="Pages that are already pixels">
        <p>
          When a turn starts, the turning page is captured as an image. If a page is already drawn,
          such as a PDF or a chart on a <code>&lt;canvas&gt;</code>, hand that over instead of
          capturing the DOM:
        </p>
        <Code id="canvas" />
        <p>
          The snapshot may also be a promise. The turn waits for it, which lets you render a page
          only when someone is about to see it:
        </p>
        <Code id="pdf" />
        <p>
          Snapshots are cached until the page's markup changes. Redrawing a canvas isn't a markup
          change, so call <code>refresh()</code> after it.
        </p>
      </Topic>

      <Topic id="limits" title="What can’t be captured">
        <p>
          The built-in capture clones the page with its styles and draws it through SVG, with images
          and web fonts embedded. A few things don't survive that:
        </p>
        <ul>
          <li>Images and fonts from other origins without CORS headers.</li>
          <li>
            The contents of <code>&lt;iframe&gt;</code>s, video frames and WebGL canvases.
          </li>
          <li>Scrolled content inside a page, which is captured scrolled to the top.</li>
          <li>Animations, which are captured at the frame they were on.</li>
        </ul>
        <p>
          Use a custom <a href="#snapshotter">snapshot</a> for pages like these. Without WebGL,
          pages still turn, just without the curl.
        </p>
      </Topic>
    </section>
  );
}

function WebReference() {
  return (
    <section className="section" id="api">
      <h2>API reference</h2>
      <Contents items={REFERENCE} />

      <Topic id="create" title="createPageCurl" mono>
        <p>
          From <code>@pagecurl/core</code>. Turns every child of <code>element</code> into a page
          and returns a <a href="#methods">controller</a>.
        </p>
        <Code id="create" />
      </Topic>

      <Topic id="component" title="<PageCurl>" mono>
        <p>
          From <code>@pagecurl/react</code>. Each child is one page. It takes every{' '}
          <a href="#options">option</a> as a prop, plus these. Any other <code>div</code> props,
          like <code>className</code>, <code>style</code> and <code>aria-*</code>, are passed
          through. The ref gives you the <a href="#methods">methods</a>.
        </p>
        <Code id="component" />
        <Rows>
          <Row name="page" type="number">
            Controlled page. A change of one turn animates; larger jumps are immediate.
          </Row>
          <Row name="defaultPage" type="number" def="0">
            Starting page when <code>page</code> isn't controlled.
          </Row>
        </Rows>
      </Topic>

      <Topic id="hook" title="usePageCurl" mono>
        <p>
          From <code>@pagecurl/react</code>, for when you'd rather render the book element yourself.
          Takes the same <a href="#options">options</a>.
        </p>
        <Code id="hook" />
        <Rows>
          <Row name="ref" type="RefCallback">
            Attach it to the book element.
          </Row>
          <Row name="curl" type="PageCurl | null">
            The controller, once the element has mounted.
          </Row>
          <Row name="page" type="number">
            The current page, kept in state so the component re-renders when it changes.
          </Row>
        </Rows>
      </Topic>

      <Topic id="options" title="Options">
        <p>
          Passed to <code>createPageCurl</code> or as props. Change them later with{' '}
          <code>setOptions</code>, or by passing new props.
        </p>
        <Rows>
          <Row name="page" type="number" def="0">
            Starting page. In spread mode, rounded down to the left page of its spread.
          </Row>
          <Row name="spread" type="boolean" def="false">
            Show two pages side by side.
          </Row>
          <Row name="direction" type="'ltr' | 'rtl'" def="'ltr'">
            <code>'rtl'</code> binds the book on the right.
          </Row>
          <Row name="pageColor" type="string" def="page background">
            Paper colour, used to tint the back of a turning page and its shadows. Any CSS colour.
          </Row>
          <Row name="turnDuration" type="number" def="0.25">
            Seconds for a turn started by a tap or from code.
          </Row>
          <Row name="dragDuration" type="number" def="0.2">
            Seconds for a drag to catch up with the pointer, and to settle after release.
          </Row>
          <Row name="drag" type="boolean" def="true">
            Turn pages by dragging.
          </Row>
          <Row name="tap" type="boolean" def="true">
            Turn pages by tapping near the left or right edge.
          </Row>
          <Row name="tapZone" type="number" def="110, or 82 in spreads">
            Width of the tap strips, in CSS pixels.
          </Row>
          <Row name="grabZone" type="number" def="32">
            Width of the strips along the book's left and right edges where a mouse drag always
            turns the page, even when it starts on text. Elsewhere a drag on text selects it.
          </Row>
          <Row name="ignore" type="string" def="form fields">
            Elements matching this selector never start a drag or a tap. The default covers inputs,
            text areas, selects, editable content and <code>[data-pagecurl-ignore]</code>.
          </Row>
          <Row name="overflow" type="number" def="25% of the longer side">
            CSS pixels around the book the curl may draw into, as a page lifts past its edges.
          </Row>
          <Row name="pixelRatio" type="number" def="devicePixelRatio">
            Rendering resolution. Lower it to save memory on very large books.
          </Row>
          <Row name="snapshot" type="Snapshotter" def="built in">
            Replaces how a page is captured. See <a href="#snapshotter">Snapshotter</a>.
          </Row>
          <Row name="liveFlat" type="boolean" def="false">
            During a turn, keep the part of the page that hasn't started to bend as the live page,
            and draw only the bending part from its snapshot. Text that isn't moving can't shift.
            See the <a href="#faq">FAQ</a>.
          </Row>
          <Row name="htmlInCanvas" type="boolean" def="false">
            Experimental. Where the browser supports{' '}
            <a href="https://github.com/WICG/html-in-canvas">HTML-in-Canvas</a>, the browser paints
            pages for the curl itself, so even the bending part matches the page exactly. Ignored
            with a custom <code>snapshot</code>. See the <a href="#faq">FAQ</a>.
          </Row>
          <Row name="onPageChange" type="(page: number) => void">
            Called whenever the current page changes.
          </Row>
          <Row name="onTurnStart" type="(event: TurnEvent) => void">
            Called when a turn begins. See <a href="#events">Events</a>.
          </Row>
          <Row name="onTurnEnd" type="(event: TurnEndEvent) => void">
            Called when a turn has settled, whether it completed or fell back.
          </Row>
        </Rows>
      </Topic>

      <Topic id="methods" title="Methods and properties">
        <p>
          On the object <code>createPageCurl</code> returns, and on a ref to{' '}
          <code>&lt;PageCurl&gt;</code>. Directions are <code>'next'</code> or <code>'prev'</code>,
          and coordinates are CSS pixels from the book's top left corner.
        </p>
        <Rows>
          <Row name="next()" type="Promise<boolean>">
            Animate a turn forward. Resolves to <code>true</code> when it lands, or{' '}
            <code>false</code> if there's no next page.
          </Row>
          <Row name="prev()" type="Promise<boolean>">
            Animate a turn back.
          </Row>
          <Row name="turn(direction)" type="Promise<boolean>">
            <code>next()</code> or <code>prev()</code>, chosen by a value.
          </Row>
          <Row name="goTo(page)" type="void">
            Show a page immediately, cancelling any turn in progress.
          </Row>
          <Row name="canTurn(direction)" type="boolean">
            Whether there is a page that way.
          </Row>
          <Row name="dragStart(x, y, direction?)" type="boolean">
            Start a drag as if a pointer pressed there. Returns <code>false</code> if there is
            nowhere to turn or a drag is already active.
          </Row>
          <Row name="dragMove(x, y)" type="void">
            Move the drag.
          </Row>
          <Row name="dragEnd({ complete? })" type="void">
            Release the drag. It completes when released past the middle of the book, unless{' '}
            <code>complete</code> says otherwise.
          </Row>
          <Row name="refresh()" type="void">
            Drop cached snapshots and re-read the pages. Adding, removing or editing pages is picked
            up on its own, so this is only for changes the book can't see.
          </Row>
          <Row name="setOptions(options)" type="void">
            Change options. Core only; in React, pass new props.
          </Row>
          <Row name="destroy()" type="void">
            Remove listeners and restore the element. Core only; React does it on unmount.
          </Row>
          <Row name="page" type="number">
            Current page, the left page of the spread in spread mode.
          </Row>
          <Row name="pageCount" type="number">
            Number of pages.
          </Row>
          <Row name="turning" type="boolean">
            A turn is animating or being dragged.
          </Row>
          <Row name="element" type="HTMLElement">
            The book element.
          </Row>
        </Rows>
      </Topic>

      <EventsTopic />

      <Topic id="snapshotter" title="Snapshotter">
        <p>
          The type of the <code>snapshot</code> option. It gets the page element and the size to
          draw at, and returns anything WebGL can upload: a canvas, an image, an{' '}
          <code>ImageBitmap</code> or a video frame, or a promise of one.
        </p>
        <Code id="snapshotter" />
        <p>
          The built-in <code>snapshot</code> function is exported from <code>@pagecurl/core</code>,
          so a custom one can fall back to it for some pages.
        </p>
      </Topic>
    </section>
  );
}

function WebFaq() {
  return (
    <section className="section" id="faq">
      <h2>FAQ</h2>

      <Topic id="faq-shift" title="Why does text shift a little when a page starts to turn?">
        <p>
          Browsers can't take a picture of an element. So when a turn starts, the page is copied and
          drawn a second time as an image, through SVG, and that image is what curls. The copy is
          laid out again from scratch, with its fonts embedded separately and at a different scale,
          and the text can land a fraction of a pixel away from where it was. When the image takes
          over from the live page, that difference shows as a small jump.
        </p>
        <p>
          How much depends on the browser, the fonts, emoji and the zoom level. Often it's nothing
          at all. Two options remove it.
        </p>
      </Topic>

      <Topic id="faq-fix" title="How do I make turns pixel-exact?">
        <p>Turn on one option or both:</p>
        <Code
          tabs={[
            ['React', 'exactReact'],
            ['JavaScript', 'exactCore'],
          ]}
        />
        <ul>
          <li>
            <code>liveFlat</code> works in every browser. While a page turns, the part that hasn't
            started to bend stays the live page, cut along the fold, and only the bending part comes
            from the image. Text that isn't moving never switches to the image, so it can't jump.
            Any difference is left inside the part that is curling, where the paper is already
            bending and shading.
          </li>
          <li>
            <code>htmlInCanvas</code> has the browser paint the page into the curl itself, so the
            image matches the page exactly, bending part included. It needs a browser that supports
            it, and does nothing elsewhere.
          </li>
        </ul>
        <p>
          Two things make the default exact on their own. Size text, line heights and padding in
          whole pixels, since fractions are what round differently in the snapshot. And pages that
          are already pixels, like images, canvases or PDF pages, never shift when you pass them as
          their own <a href="#snapshots">snapshot</a>: the image that curls is the page you see. The
          demo on this page is built that way.
        </p>
      </Topic>

      <Topic id="faq-html-in-canvas" title="Which browsers support htmlInCanvas?">
        <p>
          It uses <a href="https://github.com/WICG/html-in-canvas">HTML-in-Canvas</a>, a new web API
          that is still being designed. Today it's only in Chrome, behind the{' '}
          <code>chrome://flags/#enable-experimental-web-platform-features</code> flag, or for every
          Chrome visitor of a site that has joined Chrome's origin trial:
        </p>
        <Code id="originTrial" />
        <p>
          Everywhere else, and if the API changes before it ships, pages are captured the usual way.
          Pair it with <code>liveFlat</code> so those browsers are covered too.
        </p>
      </Topic>

      <Topic id="faq-default" title="Why aren't they on by default?">
        <p>
          Both are new. <code>liveFlat</code> changes how a turning page is shown, and{' '}
          <code>htmlInCanvas</code> builds on an API that is still changing, so they're opt-in while
          they settle.
        </p>
      </Topic>

      <Topic id="faq-limits" title="Is there anything they don't cover?">
        <ul>
          <li>
            <code>liveFlat</code> applies while one page is turning. If several turns overlap, as in
            fast flipping, the turning pages are drawn from images until they settle.
          </li>
          <li>
            In spread mode, the page arriving on the back of the turning page is drawn from its
            image until it lands.
          </li>
          <li>
            <code>htmlInCanvas</code> curls a still copy of the page, kept hidden inside the book's
            canvas. Videos and iframes come out blank in it, and code that searches the whole
            document, like <code>querySelectorAll</code>, finds the copies too.
          </li>
          <li>
            With a custom <a href="#snapshotter">snapshot</a>, such as a PDF page's own canvas,{' '}
            <code>htmlInCanvas</code> is ignored. <code>liveFlat</code> still works.
          </li>
        </ul>
      </Topic>
    </section>
  );
}

/** The events, the same on every platform. */
export function EventsTopic() {
  return (
    <Topic id="events" title="Events">
      <p>
        <code>onTurnStart</code> receives a <code>TurnEvent</code>, and <code>onTurnEnd</code> a{' '}
        <code>TurnEndEvent</code>, which adds <code>completed</code>.
      </p>
      <Rows>
        <Row name="from" type="number">
          Page shown before the turn.
        </Row>
        <Row name="to" type="number">
          Page shown if the turn completes.
        </Row>
        <Row name="direction" type="'next' | 'prev'">
          Which way the page is turning.
        </Row>
        <Row name="interactive" type="boolean">
          Started by a drag, rather than a tap or a call.
        </Row>
        <Row name="completed" type="boolean">
          <code>onTurnEnd</code> only. False when a drag was let go and the page fell back.
        </Row>
      </Rows>
    </Topic>
  );
}

export function Contents({ items }: { items: [string, string][] }) {
  return (
    <nav className="contents" aria-label="On this page">
      {items.map(([id, title]) => (
        <a key={id} className="contents-link" href={`#${id}`}>
          {title}
        </a>
      ))}
    </nav>
  );
}

export function Topic({
  id,
  title,
  mono,
  children,
}: {
  id: string;
  title: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="topic" id={id}>
      <h3 className="topic-title">
        <a href={`#${id}`} className={mono ? 'topic-link mono' : 'topic-link'}>
          {title}
        </a>
      </h3>
      {children}
    </div>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <dl className="rows">{children}</dl>;
}

export function Row({
  name,
  type,
  def,
  children,
}: {
  name: string;
  type: string;
  def?: string;
  children: ReactNode;
}) {
  return (
    <div className="row">
      <dt>
        <code className="name">{name}</code>
        <span className="type">{type}</span>
      </dt>
      <dd>
        {children}
        {def && (
          <span className="default">
            Default: <code>{def}</code>
          </span>
        )}
      </dd>
    </div>
  );
}
