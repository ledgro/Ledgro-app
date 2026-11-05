import { useEffect, useRef, useState } from 'react';

/**
 * True while a loader should be on screen. Waits `delay` ms before showing it (fast loads show nothing, so no flicker),
 * and once shown keeps it for at least `minShow` ms (so it never blinks).
 */
export function useShowLoader(loading, delay = 300, minShow = 400) {
  const [show, setShow] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    let t;
    if (loading) {
      t = setTimeout(() => { since.current = Date.now(); setShow(true); }, delay);
    } else if (since.current) {
      t = setTimeout(() => { since.current = 0; setShow(false); }, Math.max(0, minShow - (Date.now() - since.current)));
    }
    return () => clearTimeout(t);
  }, [loading, delay, minShow]);
  return show;
}
