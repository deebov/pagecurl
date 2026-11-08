// The React Native docs, in the same order as the web ones so the two read side by side.
import { Code } from './code';
import { Contents, EventsTopic, Row, Rows, Topic } from './docs';

const GUIDES: [string, string][] = [
  ['sizing', 'Sizing'],
  ['spreads', 'Spreads, tablets and foldables'],
  ['controlled', 'Controlling the page'],
  ['from-code', 'Turning from code'],
  ['own-drag', 'Driving a drag yourself'],
  ['interaction', 'Buttons, taps and drags'],
  ['capture', 'How pages are captured'],
];

const REFERENCE: [string, string][] = [
  ['component', '<PageCurl>'],
  ['options', 'Props'],
  ['methods', 'Methods and properties'],
  ['events', 'Events'],
];

export function NativeGuides() {
  return (
    <section className="section" id="docs">
      <h2>Guides</h2>
      <Contents items={GUIDES} />

      <Topic id="sizing" title="Sizing">
        <p>
          Give <code>&lt;PageCurl&gt;</code> a size with its <code>style</code>, like any view.
          Every page is stretched to fill it, or half of it each in spread mode.
        </p>
        <Code id="nativeSizing" />
        <p>
          The book follows its own layout. When it changes size, as on rotation, pages are laid out
          again and pictured afresh.
        </p>
      </Topic>

      <Topic id="spreads" title="Spreads, tablets and foldables">
        <p>
          <code>spread</code> shows two pages side by side, like an open book. The page number is
          then always the left page of the spread, and a turn moves two pages. Switch it on when the
          screen is wide, and an iPad, an open foldable or a phone on its side reads like a book.
        </p>
        <Code id="nativeSpreads" />
        <p>
          <code>direction="rtl"</code> binds the book on the right for Arabic, Hebrew or manga.
        </p>
      </Topic>

      <Topic id="controlled" title="Controlling the page">
        <p>
          Pass <code>page</code> and <code>onPageChange</code> to keep the page in your own state. A
          change of one turn animates. Anything further jumps straight there.
        </p>
        <Code id="nativeControlled" />
        <p>
          Prefer <code>defaultPage</code> when you only need a starting point.
        </p>
      </Topic>

      <Topic id="from-code" title="Turning from code">
        <p>
          <code>next()</code>, <code>prev()</code> and <code>turn(direction)</code> on the ref
          animate a turn and return a promise. It resolves to <code>true</code> when the page lands,
          or to <code>false</code> straight away if there is no page to turn to.{' '}
          <code>goTo(page)</code> jumps without animating.
        </p>
        <Code id="nativeFromCode" />
      </Topic>

      <Topic id="own-drag" title="Driving a drag yourself">
        <p>
          <code>dragStart</code>, <code>dragMove</code> and <code>dragEnd</code> move the curl as if
          a finger held the page, so you can tie it to a slider, a scroll position or a gesture of
          your own. Positions are points from the book's top left corner.
        </p>
        <Code id="nativeOwnDrag" />
        <p>
          Pass <code>{'{ complete: true }'}</code> to <code>dragEnd</code> to finish the turn
          wherever the drag stopped, or <code>false</code> to let the page fall back.
        </p>
      </Topic>

      <Topic id="interaction" title="Buttons, taps and drags">
        <p>
          While pages lie flat they are your live views. Buttons, text inputs, scroll views and
          screen readers all work, and only the current pages can be reached.
        </p>
        <ul>
          <li>
            A tap goes to whatever is under the finger first. It turns the page only near the left
            or right edge, and only when nothing on the page, like a button, took it.{' '}
            <code>tapZone</code> sets how wide those strips are.
          </li>
          <li>
            A drag anywhere on the book, in any direction, turns the page. Once the finger has moved
            a few points, the book takes the touch, so a button you started the drag on doesn't
            fire.
          </li>
          <li>
            Set <code>drag={'{false}'}</code> or <code>tap={'{false}'}</code> to turn pages only
            from code.
          </li>
        </ul>
      </Topic>

      <Topic id="capture" title="How pages are captured">
        <p>
          When a turn starts, Skia takes a picture of the turning page and curls that, then the live
          page takes over again when it lands. The picture is of the view as it's drawn, so it
          matches the page exactly. Pages either side of the current one are pictured ahead of time,
          and again whenever the book's children change.
        </p>
        <p>
          A page that changes on its own, like a clock or a video, isn't seen changing. Call{' '}
          <code>refresh()</code> after it does, or the curl shows how it looked before.
        </p>
        <Code id="nativeRefresh" />
        <p>
          Only the pages near the current one are mounted. Pages further away are unmounted, and
          their state goes with them, so keep anything that should last in your own state.
        </p>
      </Topic>
    </section>
  );
}

export function NativeReference() {
  return (
    <section className="section" id="api">
      <h2>API reference</h2>
      <Contents items={REFERENCE} />

      <Topic id="component" title="<PageCurl>" mono>
        <p>
          From <code>@pagecurl/react-native</code>. Each child is one page. It takes the{' '}
          <a href="#options">props</a> below, and any other <code>View</code> props, like{' '}
          <code>style</code>, <code>testID</code> and <code>accessibilityLabel</code>, are passed
          through. The ref gives you the <a href="#methods">methods</a>.
        </p>
        <Code id="nativeComponent" />
      </Topic>

      <Topic id="options" title="Props">
        <Rows>
          <Row name="page" type="number">
            Controlled page. A change of one turn animates; larger jumps are immediate.
          </Row>
          <Row name="defaultPage" type="number" def="0">
            Starting page when <code>page</code> isn't controlled.
          </Row>
          <Row name="spread" type="boolean" def="false">
            Show two pages side by side.
          </Row>
          <Row name="direction" type="'ltr' | 'rtl'" def="'ltr'">
            <code>'rtl'</code> binds the book on the right.
          </Row>
          <Row name="pageColor" type="ColorValue" def="page background, or white">
            Paper colour, used to tint the back of a turning page and its shadows.
          </Row>
          <Row name="turnDuration" type="number" def="0.25">
            Seconds for a turn started by a tap or from code.
          </Row>
          <Row name="dragDuration" type="number" def="0.2">
            Seconds for a drag to catch up with the finger, and to settle after release.
          </Row>
          <Row name="drag" type="boolean" def="true">
            Turn pages by dragging.
          </Row>
          <Row name="tap" type="boolean" def="true">
            Turn pages by tapping near the left or right edge.
          </Row>
          <Row name="tapZone" type="number" def="110, or 82 in spreads">
            Width of the tap strips, in points.
          </Row>
          <Row name="overflow" type="number" def="25% of the longer side">
            Points around the book the curl may draw into, as a page lifts past its edges.
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
          On a ref to <code>&lt;PageCurl&gt;</code>, typed <code>PageCurlHandle</code>. Directions
          are <code>'next'</code> or <code>'prev'</code>, and positions are points from the book's
          top left corner.
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
            Start a drag as if a finger pressed there. Returns <code>false</code> if there is
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
            Take the pictures of the pages again, after a page changed on its own.
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
        </Rows>
      </Topic>

      <EventsTopic />
    </section>
  );
}

export function NativeFaq() {
  return (
    <section className="section" id="faq">
      <h2>FAQ</h2>

      <Topic id="faq-expo" title="Does it work in Expo Go?">
        <p>
          Yes. Skia, the one thing it needs, is built into Expo Go, so the book runs there as it is.
          It works the same in a development build and in a bare React Native app.
        </p>
      </Topic>

      <Topic id="faq-bare" title="How do I install it without Expo?">
        <p>
          Install it with Skia from npm, then install the iOS pods. Skia's own{' '}
          <a href="https://shopify.github.io/react-native-skia/docs/getting-started/installation">
            installation guide
          </a>{' '}
          covers the rest.
        </p>
        <Code id="installNativeBare" />
      </Topic>

      <Topic id="faq-exact" title="Does text shift when a page starts to turn?">
        <p>
          No. On the web the page has to be copied and laid out again to make an image of it. In
          React Native the picture is taken of the view as it is drawn on screen, so the page that
          curls is exactly the page you were looking at.
        </p>
      </Topic>

      <Topic id="faq-stale" title="Why does a turning page show old content?">
        <p>
          Pages are pictured ahead of time, and again when the book's children change. A page that
          changes by itself, without the book re-rendering, keeps its old picture until you call{' '}
          <a href="#capture">
            <code>refresh()</code>
          </a>
          .
        </p>
      </Topic>
    </section>
  );
}
