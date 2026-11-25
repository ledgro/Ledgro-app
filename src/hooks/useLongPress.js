import { useRef, useCallback } from 'react';

/**
 * Press and hold (about 450 ms) starts something, like WhatsApp or the gallery.
 * Moving more than 10 px (a scroll) cancels it. The click that follows a long press is swallowed.
 */
export function useLongPress(onLong, { ms = 450, slop = 10, enabled = true } = {}) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const cb = useRef(onLong);
  cb.current = onLong; // eslint-disable-line react-hooks/refs

  const clear = useCallback(() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } }, []);

  return {
    onPointerDown: (e) => {
      if (!enabled) return;
      if (e.button != null && e.button !== 0) return;
      if (e.target?.closest?.('button, a, input, label')) return; // buttons on a card keep their own press
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        try { navigator.vibrate?.(15); } catch { /* ignore */ }
        cb.current?.();
      }, ms);
    },
    onPointerMove: (e) => {
      if (!timer.current || !start.current) return;
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > slop) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e) => { if (fired.current || timer.current) e.preventDefault(); },
    onClickCapture: (e) => { if (fired.current) { fired.current = false; e.preventDefault(); e.stopPropagation(); } },
  };
}
