import {
  type PageCurl as Controller,
  createPageCurl,
  type PageCurlOptions,
  type TurnDirection,
  type TurnEndEvent,
  type TurnEvent,
} from '@pagecurl/core';
import {
  Children,
  type CSSProperties,
  forwardRef,
  type HTMLAttributes,
  isValidElement,
  type ReactNode,
  type RefCallback,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export type { PageCurlOptions, TurnDirection, TurnEndEvent, TurnEvent };

/** Imperative controls, available through a ref. */
export interface PageCurlHandle {
  readonly element: HTMLElement | null;
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
  refresh(): void;
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Callback = 'onPageChange' | 'onTurnStart' | 'onTurnEnd';

/**
 * Turns the children of an element into pages. Attach `ref` to the element; `curl` is the
 * controller once it has mounted.
 */
export function usePageCurl<T extends HTMLElement = HTMLDivElement>(
  options: PageCurlOptions = {},
): { ref: RefCallback<T>; curl: Controller | null; page: number } {
  const [element, setElement] = useState<T | null>(null);
  const [curl, setCurl] = useState<Controller | null>(null);
  const [page, setPage] = useState(options.page ?? 0);
  const latest = useRef(options);
  latest.current = options;

  useIsomorphicLayoutEffect(() => {
    if (!element) return;
    const controller = createPageCurl(element, {
      ...latest.current,
      onPageChange: (p) => {
        setPage(p);
        latest.current.onPageChange?.(p);
      },
      onTurnStart: (e) => latest.current.onTurnStart?.(e),
      onTurnEnd: (e) => latest.current.onTurnEnd?.(e),
    });
    setCurl(controller);
    setPage(controller.page);
    return () => {
      controller.destroy();
      setCurl(null);
    };
  }, [element]);

  const {
    spread,
    direction,
    pageColor,
    turnDuration,
    dragDuration,
    drag,
    tap,
    tapZone,
    grabZone,
    ignore,
    overflow,
    pixelRatio,
    snapshot,
    liveFlat,
    htmlInCanvas,
  } = options;
  useEffect(() => {
    curl?.setOptions({
      spread,
      direction,
      pageColor,
      turnDuration,
      dragDuration,
      drag,
      tap,
      tapZone,
      grabZone,
      ignore,
      overflow,
      pixelRatio,
      snapshot,
      liveFlat,
      htmlInCanvas,
    });
  }, [
    curl,
    spread,
    direction,
    pageColor,
    turnDuration,
    dragDuration,
    drag,
    tap,
    tapZone,
    grabZone,
    ignore,
    overflow,
    pixelRatio,
    snapshot,
    liveFlat,
    htmlInCanvas,
  ]);

  const ref = useCallback((el: T | null) => setElement(el), []);
  return { ref, curl, page };
}

export interface PageCurlProps
  extends
    Omit<PageCurlOptions, Callback | 'page'>,
    Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dir'> {
  /** Each child is one page. */
  children?: ReactNode;
  /** Current page. Changing it by one turn animates; larger jumps are immediate. */
  page?: number;
  /** Initial page when `page` isn't controlled. */
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  onTurnStart?: (event: TurnEvent) => void;
  onTurnEnd?: (event: TurnEndEvent) => void;
}

const PAGE_STYLE: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
};
const HIDDEN_PAGE_STYLE: CSSProperties = { ...PAGE_STYLE, opacity: 0 };

/** A stack of pages that turn with a page curl. */
export const PageCurl = forwardRef<PageCurlHandle, PageCurlProps>(function PageCurl(props, ref) {
  const {
    children,
    page,
    defaultPage,
    spread,
    direction,
    pageColor,
    turnDuration,
    dragDuration,
    drag,
    tap,
    tapZone,
    grabZone,
    ignore,
    overflow,
    pixelRatio,
    snapshot,
    liveFlat,
    htmlInCanvas,
    onPageChange,
    onTurnStart,
    onTurnEnd,
    style,
    ...rest
  } = props;
  const [initial] = useState(() => page ?? defaultPage ?? 0);
  const { ref: attach, curl } = usePageCurl<HTMLDivElement>({
    page: initial,
    spread,
    direction,
    pageColor,
    turnDuration,
    dragDuration,
    drag,
    tap,
    tapZone,
    grabZone,
    ignore,
    overflow,
    pixelRatio,
    snapshot,
    liveFlat,
    htmlInCanvas,
    onPageChange,
    onTurnStart,
    onTurnEnd,
  });

  useImperativeHandle(
    ref,
    () => ({
      get element() {
        return curl?.element ?? null;
      },
      get page() {
        return curl?.page ?? initial;
      },
      get pageCount() {
        return curl?.pageCount ?? 0;
      },
      get turning() {
        return curl?.turning ?? false;
      },
      turn: (d) => curl?.turn(d) ?? Promise.resolve(false),
      next: () => curl?.next() ?? Promise.resolve(false),
      prev: () => curl?.prev() ?? Promise.resolve(false),
      goTo: (p) => curl?.goTo(p),
      canTurn: (d) => curl?.canTurn(d) ?? false,
      dragStart: (x, y, d) => curl?.dragStart(x, y, d) ?? false,
      dragMove: (x, y) => curl?.dragMove(x, y),
      dragEnd: (o) => curl?.dragEnd(o),
      refresh: () => curl?.refresh(),
    }),
    [curl, initial],
  );

  // A controlled page that moves by one turn animates there; anything else jumps.
  useEffect(() => {
    if (!curl || page === undefined || page === curl.page) return;
    const step = spread ? 2 : 1;
    if (page === curl.page + step) void curl.next();
    else if (page === curl.page - step) void curl.prev();
    else curl.goTo(page);
  }, [curl, page, spread]);

  const first = spread ? initial - (initial % 2) : initial;
  const pages = Children.toArray(children);
  return (
    <div ref={attach} style={{ position: 'relative', ...style }} {...rest}>
      {pages.map((child, i) => (
        <div
          key={isValidElement(child) && child.key !== null ? child.key : i}
          data-pagecurl-page=""
          style={i === first || (spread && i === first + 1) ? PAGE_STYLE : HIDDEN_PAGE_STYLE}
        >
          {child}
        </div>
      ))}
    </div>
  );
});
