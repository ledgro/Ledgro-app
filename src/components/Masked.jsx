import { useEffect, useRef, useState } from 'react';

/**
 * A number hidden by the dashboard's privacy switch. Tapping it shows just this one for a few seconds;
 * everything else stays hidden. `epoch` changes whenever the eye switch is used, which also hides it again.
 */
export default function Masked({ hidden, epoch, children, revealMs = 8000 }) {
  const [revealedAt, setRevealedAt] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!hidden || revealedAt === epoch) return children;
  return (
    <button
      type="button"
      onClick={() => {
        setRevealedAt(epoch);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setRevealedAt(null), revealMs);
      }}
      aria-label="Tap to show this amount"
      className="blur-md select-none"
    >
      {children}
    </button>
  );
}
