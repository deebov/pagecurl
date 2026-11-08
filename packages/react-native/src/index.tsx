import type { Rgba } from '@pagecurl/core';
import {
  makeImageFromView,
  type SkImage,
  type SkJSIInstance,
  type SkPicture,
  Skia,
  SkiaPictureView,
} from '@shopify/react-native-skia';
import {
  Children,
  type ComponentRef,
  forwardRef,
  isValidElement,
  type ReactNode,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  type ColorValue,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PixelRatio,
  processColor,
  type StyleProp,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { Book, type BookHost, type BookOptions, type TurnDirection } from './book.js';
import { drawMesh } from './draw.js';

export type { TurnDirection, TurnEndEvent, TurnEvent } from './book.js';

/** Imperative controls, available through a ref. */
export interface PageCurlHandle {
  readonly page: number;
  readonly pageCount: number;
  readonly turning: boolean;
  turn(direction: TurnDirection): Promise<boolean>;
  next(): Promise<boolean>;
  prev(): Promise<boolean>;
  goTo(page: number): void;
  canTurn(direction: TurnDirection): boolean;
  dragStart(x: number, y: number, direction?: TurnDirection): boolean;
  dragMove(x: number, y: number): void;
  dragEnd(options?: { complete?: boolean; velocity?: number }): void;
  /** Takes the pictures of the pages again, after their content changed. */
  refresh(): void;
}

export interface PageCurlProps extends BookOptions, Omit<ViewProps, 'children'> {
  /** Each child is one page. */
  children?: ReactNode;
  /** Current page. Changing it by one turn animates; larger jumps are immediate. */
  page?: number;
  /** Initial page when `page` isn't controlled. */
  defaultPage?: number;
  /** Paper colour, used to tint the back of a page and its shadows. Defaults to white. */
  pageColor?: ColorValue;
  /** Points around the book the curl may draw into. Defaults to 25% of the larger side. */
  overflow?: number;
  style?: StyleProp<ViewStyle>;
}

type NativeView = ComponentRef<typeof View>;

/** Pages this many turns either side of the current one stay mounted, ready to be captured. */
const MOUNTED = 2;
const WHITE: Rgba = [1, 1, 1, 1];
/** How far outside the book pages that aren't shown wait, in points. */
const OFFSTAGE = 100_000;

let emptyPicture: SkPicture | null = null;
const empty = (): SkPicture => {
  if (!emptyPicture) {
    const recorder = Skia.PictureRecorder();
    recorder.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    emptyPicture = recorder.finishRecordingAsPicture();
  }
  return emptyPicture;
};

/** A stack of pages that turn with a page curl. */
export const PageCurl = forwardRef<PageCurlHandle, PageCurlProps>(function PageCurl(props, ref) {
  const {
    children,
    page,
    defaultPage,
    spread,
    direction,
    turnDuration,
    dragDuration,
    drag,
    tap,
    tapZone,
    pageColor,
    overflow,
    onPageChange,
    onTurnStart,
    onTurnEnd,
    style,
    onLayout,
    ...rest
  } = props;
  const pages = Children.toArray(children);
  const [initial] = useState(() => page ?? defaultPage ?? 0);
  const [book, setBook] = useState<Book<SkImage> | null>(null);
  const [size, setSize] = useState<readonly [number, number]>([0, 0]);
  const [, update] = useReducer((n: number) => n + 1, 0);
  const container = useRef<NativeView>(null);
  const pageViews = useRef(new Map<number, RefObject<NativeView | null>>());
  const canvas = useRef<CurlCanvasHandle>(null);
  const origin = useRef<readonly [number, number]>([0, 0]);
  const touchId = useRef<number | null>(null);
  const responder = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const pageList = useRef(pages);
  pageList.current = pages;

  const [w, h] = size;
  const bleed = overflow ?? Math.max(w, h) * 0.25;
  const geometry = useRef({ bleed, w, h });
  geometry.current = { bleed, w, h };

  useEffect(() => {
    let cleared = 0;
    const host: BookHost<SkImage> = {
      capture: async (i) => {
        const view = pageViews.current.get(i);
        if (!view?.current) return null;
        return makeImageFromView(view as unknown as Parameters<typeof makeImageFromView>[0]);
      },
      release: (image) => image.dispose(),
      paper: (i) => paperColor(latest.current.pageColor, pageList.current[i]),
      draw: (layers) => {
        const { bleed: b, w: bw, h: bh } = geometry.current;
        const recorder = Skia.PictureRecorder();
        const c = recorder.beginRecording(Skia.XYWHRect(0, 0, bw + 2 * b, bh + 2 * b));
        const made: SkJSIInstance<string>[] = [];
        let drawn = false;
        layers((mesh, image, view) => {
          drawn = true;
          made.push(...drawMesh(c, mesh, image, view, [b, b]));
        });
        const picture = recorder.finishRecordingAsPicture();
        for (const m of made) m.dispose();
        cancelAnimationFrame(cleared);
        if (drawn) canvas.current?.show(picture);
        else {
          picture.dispose();
          // The pages that landed are shown first; the curl is cleared once they are on screen.
          cleared = requestAnimationFrame(() => canvas.current?.show(null));
        }
      },
      changed: update,
    };
    const { spread, direction, turnDuration, dragDuration, drag, tap, tapZone } = latest.current;
    const b = new Book<SkImage>(host, pageList.current.length, initial, {
      spread,
      direction,
      turnDuration,
      dragDuration,
      drag,
      tap,
      tapZone,
      onPageChange: (p) => {
        update();
        latest.current.onPageChange?.(p);
      },
      onTurnStart: (e) => latest.current.onTurnStart?.(e),
      onTurnEnd: (e) => latest.current.onTurnEnd?.(e),
    });
    setBook(b);
    return () => {
      cancelAnimationFrame(cleared);
      b.destroy();
      setBook(null);
    };
    // The book is made once; later props reach it through the effects below.
  }, [initial]);

  useEffect(() => {
    book?.setOptions({ spread, direction, turnDuration, dragDuration, drag, tap, tapZone });
  }, [book, spread, direction, turnDuration, dragDuration, drag, tap, tapZone]);

  useEffect(() => {
    if (book && w > 0 && h > 0) book.setSize(w, h, PixelRatio.get());
  }, [book, w, h]);

  useEffect(() => {
    book?.setPageCount(pages.length);
  }, [book, pages.length]);

  // New children may show something new on any page.
  useEffect(() => {
    book?.invalidate();
    book?.prewarm();
  }, [book, children, pageColor]);

  useImperativeHandle(
    ref,
    () => ({
      get page() {
        return book?.page ?? initial;
      },
      get pageCount() {
        return book?.pageCount ?? pages.length;
      },
      get turning() {
        return book?.turning ?? false;
      },
      turn: (d) => book?.turn(d) ?? Promise.resolve(false),
      next: () => book?.next() ?? Promise.resolve(false),
      prev: () => book?.prev() ?? Promise.resolve(false),
      goTo: (p) => book?.goTo(p),
      canTurn: (d) => book?.canTurn(d) ?? false,
      dragStart: (x, y, d) => book?.dragStart(x, y, d) ?? false,
      dragMove: (x, y) => book?.dragMove(x, y),
      dragEnd: (o) => book?.dragEnd(o),
      refresh: () => {
        book?.invalidate();
        book?.prewarm();
      },
    }),
    [book, initial, pages.length],
  );

  // A controlled page that moves by one turn animates there; anything else jumps.
  useEffect(() => {
    if (!book || page === undefined || page === book.page) return;
    const step = spread ? 2 : 1;
    if (page === book.page + step) void book.next();
    else if (page === book.page - step) void book.prev();
    else book.goTo(page);
  }, [book, page, spread]);

  // Touches. Every touch on the book is followed, so a drag can start anywhere; the book only
  // takes the touch from what's under the finger once it is dragging a page, and taps reach it
  // only when nothing on the page (a button, say) handled them.
  const local = (e: GestureResponderEvent): [number, number] => [
    e.nativeEvent.pageX - origin.current[0],
    e.nativeEvent.pageY - origin.current[1],
  ];
  const onTouchStart = (e: GestureResponderEvent) => {
    if (!book || touchId.current !== null) return;
    touchId.current = e.nativeEvent.identifier;
    responder.current = false;
    origin.current = bookOrigin(container.current, e);
    const [x, y] = local(e);
    book.touchStart(x, y, e.nativeEvent.timestamp);
  };
  const ours = (e: GestureResponderEvent) =>
    [e.nativeEvent, ...e.nativeEvent.changedTouches].find((t) => t.identifier === touchId.current);
  const onTouchMove = (e: GestureResponderEvent) => {
    const touch = ours(e);
    if (!book || !touch) return;
    book.touchMove(
      touch.pageX - origin.current[0],
      touch.pageY - origin.current[1],
      touch.timestamp,
    );
  };
  const onTouchEnd = (e: GestureResponderEvent) => {
    if (!book || !ours(e)) return;
    touchId.current = null;
    if (responder.current || book.dragging) book.touchEnd();
    else book.touchCancel();
  };
  const onTouchCancel = () => {
    touchId.current = null;
    book?.touchCancel();
  };

  const resting = new Set(book?.restingPages() ?? (spread ? [initial, initial + 1] : [initial]));
  const current = book?.page ?? initial;
  const step = spread ? 2 : 1;
  const ready = book !== null && w > 0 && h > 0;

  return (
    <View
      ref={container}
      style={[styles.book, style]}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setSize([width, height]);
        onLayout?.(e);
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onStartShouldSetResponder={() => tap !== false || drag !== false}
      onMoveShouldSetResponderCapture={() => book?.dragging ?? false}
      onResponderGrant={() => {
        responder.current = true;
      }}
      onResponderTerminationRequest={() => !(book?.dragging ?? false)}
      {...rest}
    >
      {pages.map((child, i) => {
        const near = i >= current - MOUNTED * step && i < current + (MOUNTED + 1) * step;
        if (!ready || (!near && !resting.has(i))) return null;
        const shown = resting.has(i);
        let view = pageViews.current.get(i);
        if (!view) {
          view = { current: null };
          pageViews.current.set(i, view);
        }
        const [px, y, pw, ph] = book.pageRect(i);
        // Pages not lying flat wait outside the book rather than transparent: iOS can only take
        // a picture of a view that is drawn, and they are pictured to curl.
        const x = shown ? px : px - OFFSTAGE * (i + 1);
        return (
          <View
            key={isValidElement(child) && child.key !== null ? child.key : i}
            ref={view}
            collapsable={false}
            pointerEvents={shown ? 'auto' : 'none'}
            accessibilityElementsHidden={!shown}
            importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
            style={[styles.page, { left: x, top: y, width: pw, height: ph }]}
          >
            {child}
          </View>
        );
      })}
      {ready ? (
        <CurlCanvas
          ref={canvas}
          style={{
            position: 'absolute',
            left: -bleed,
            top: -bleed,
            width: w + 2 * bleed,
            height: h + 2 * bleed,
            zIndex: 3,
          }}
        />
      ) : null}
    </View>
  );
});

interface CurlCanvasHandle {
  show(picture: SkPicture | null): void;
}

/** The curling pages, redrawn every frame without re-rendering the book. */
const CurlCanvas = forwardRef<CurlCanvasHandle, { style: StyleProp<ViewStyle> }>(
  function CurlCanvas({ style }, ref) {
    const [picture, setPicture] = useState<SkPicture | null>(null);
    useImperativeHandle(ref, () => ({ show: setPicture }), []);
    // The view holds on to the picture it draws, so the previous one can go once this is shown.
    useEffect(() => () => picture?.dispose(), [picture]);
    return <SkiaPictureView picture={picture ?? empty()} style={style} pointerEvents="none" />;
  },
);

/** The book's top-left on screen, in the coordinates of a touch's `pageX` and `pageY`. */
function bookOrigin(view: NativeView | null, e: GestureResponderEvent): readonly [number, number] {
  const el = view as unknown as { getBoundingClientRect?: () => { x: number; y: number } } | null;
  const rect = el?.getBoundingClientRect?.();
  if (rect) return [rect.x, rect.y];
  // Without the DOM-like API, the touch's offset within the view it landed on is all there is.
  return [
    e.nativeEvent.pageX - e.nativeEvent.locationX,
    e.nativeEvent.pageY - e.nativeEvent.locationY,
  ];
}

/** Paper colour: the `pageColor` prop, else the page's own background, else white. */
function paperColor(pageColor: ColorValue | undefined, page: ReactNode): Rgba {
  const own = isValidElement<{ style?: StyleProp<ViewStyle> }>(page)
    ? StyleSheet.flatten(page.props.style)?.backgroundColor
    : undefined;
  return toRgba(pageColor ?? own) ?? WHITE;
}

function toRgba(color: ColorValue | undefined): Rgba | null {
  if (color === undefined) return null;
  const n = processColor(color);
  if (typeof n !== 'number') return null;
  const argb = n >>> 0;
  const a = ((argb >>> 24) & 255) / 255;
  if (a === 0) return null;
  return [((argb >>> 16) & 255) / 255, ((argb >>> 8) & 255) / 255, (argb & 255) / 255, a];
}

const styles = StyleSheet.create({
  book: { position: 'relative' },
  page: { position: 'absolute', overflow: 'hidden' },
});
