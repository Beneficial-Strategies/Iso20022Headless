import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
}

export interface Placement {
  left: number;
  width: number;
  maxHeight: number;
  /** Distance from the top of the viewport, when opening below. */
  top?: number;
  /** Distance from the bottom of the viewport, when opening above. */
  bottom?: number;
  placement: 'below' | 'above';
}

const MARGIN = 8;
const GAP = 4;

/**
 * Where to put a floating panel relative to its trigger. Pure, so it can be tested without a browser.
 * Opens below when there is room (or more room than above), otherwise above; stays inside the viewport.
 */
export function computePlacement(
  anchor: Rect,
  viewport: { width: number; height: number },
  opts: { width?: number | 'anchor'; minWidth?: number; maxWidth?: number; align?: 'start' | 'end'; contentHeight?: number },
): Placement {
  const { align = 'start', contentHeight = 320 } = opts;
  const want = opts.width === 'anchor' || opts.width === undefined ? anchor.width : opts.width;
  const width = Math.max(1, Math.min(Math.max(want, opts.minWidth ?? 0), opts.maxWidth ?? Infinity, viewport.width - 2 * MARGIN));
  let left = align === 'end' ? anchor.right - width : anchor.left;
  left = Math.max(MARGIN, Math.min(left, viewport.width - width - MARGIN));
  const below = viewport.height - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  // below if everything fits there, or there is at least as much room as above; otherwise above
  const useBelow = below >= contentHeight || below >= above;
  return useBelow
    ? { left, width, top: anchor.bottom + GAP, maxHeight: Math.max(96, below), placement: 'below' }
    : { left, width, bottom: viewport.height - anchor.top + GAP, maxHeight: Math.max(96, above), placement: 'above' };
}

interface Props {
  anchor: HTMLElement | null;
  children: ReactNode;
  width?: number | 'anchor';
  minWidth?: number;
  maxWidth?: number;
  align?: 'start' | 'end';
  className?: string;
  role?: string;
  id?: string;
  label?: string;
}

/**
 * A panel rendered in <body> and positioned from the trigger's rectangle, so it is never clipped by a
 * scrolling or overflow-hidden ancestor. It follows the trigger on scroll/resize.
 */
export const Popup = forwardRef<HTMLDivElement, Props>(function Popup(
  { anchor, children, width, minWidth, maxWidth, align, className = '', role, id, label },
  ref,
) {
  const [place, setPlace] = useState<Placement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const opts = { width, minWidth, maxWidth, align };
    // Text wraps at the final width, so measure the content height at that width, not at its natural one.
    const el = inner.current;
    if (el) el.style.width = `${computePlacement(rect, viewport, opts).width}px`;
    setPlace(computePlacement(rect, viewport, { ...opts, contentHeight: el?.scrollHeight }));
  }, [anchor, width, minWidth, maxWidth, align]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true); // capture: scrolling any ancestor moves the trigger
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  const style: CSSProperties = place
    ? { position: 'fixed', left: place.left, width: place.width, maxHeight: place.maxHeight, ...(place.top !== undefined ? { top: place.top } : { bottom: place.bottom }) }
    : { position: 'fixed', visibility: 'hidden', left: 0, top: 0 };

  return createPortal(
    <div
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      id={id}
      role={role}
      aria-label={label}
      data-placement={place?.placement}
      style={style}
      className={`z-50 overflow-auto ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
});
