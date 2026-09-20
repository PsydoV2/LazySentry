import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks an element's content-box width via ResizeObserver. Used to size
 * dashboard sections (see DashboardGroup) — CSS alone can't do this: a
 * shrink-wrapped box's intrinsic width for an auto-fit grid collapses to a
 * single column regardless of how many cards actually render or how much
 * room is available, so the real rendered width has to be measured.
 *
 * A callback ref, not useRef+useEffect(fn, []): the element this attaches
 * to (.dashboard-groups) only exists once the projects query resolves, so a
 * plain ref would still be null the one time an empty-deps effect runs,
 * and — since it never reruns — the observer would never attach at all.
 * The callback ref instead fires exactly when the node itself appears.
 */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: T | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, width];
}
