import { useRef, useState } from 'react';

/**
 * Swipe a row left to reveal an action behind it (a red Delete). Plain touch and mouse handling, no library,
 * so it works inside scrolling pages: it only reacts once the finger moves mostly sideways.
 */
export default function SwipeRow({ action, onTap, className = '', children, width = 88 }) {
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const start = useRef(null);
  const locked = useRef(null); // 'x' | 'y' | null
  const moved = useRef(false);
  const open = useRef(false);

  const down = (e) => {
    if (!action) return;
    start.current = { x: e.clientX, y: e.clientY, from: open.current ? -width : 0 };
    locked.current = null; moved.current = false;
  };
  const move = (e) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!locked.current && (Math.abs(mx) > 8 || Math.abs(my) > 8)) locked.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
    if (locked.current !== 'x') return;
    moved.current = true;
    setDrag(true);
    setDx(Math.max(-width, Math.min(0, s.from + mx)));
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    if (locked.current === 'x') {
      const shut = dx > -width / 2;
      open.current = !shut;
      setDx(shut ? 0 : -width);
    }
    setDrag(false);
    if (!moved.current && onTap) { if (open.current) { open.current = false; setDx(0); } else onTap(); }
    return s;
  };

  return (
    <div className={`relative overflow-hidden rounded-3xl ${className}`}>
      {action && <div className="absolute inset-y-0 right-0 flex" style={{ width }}>{action}</div>}
      <div
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ transform: `translateX(${dx}px)`, transition: drag ? 'none' : 'transform 180ms ease-out', touchAction: 'pan-y' }}
        className="relative bg-white"
      >
        {children}
      </div>
    </div>
  );
}
