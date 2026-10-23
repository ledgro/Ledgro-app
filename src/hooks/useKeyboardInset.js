import { useEffect } from 'react';

// Bottom sheets sit on top of the on-screen keyboard instead of jumping or hiding behind it.
// --kb  = height covered by the keyboard (also follows iOS panning the page)
// --vvh = height of what is actually visible
export const sheetStyle = {
  bottom: 'var(--kb, 0px)',
  maxHeight: 'calc(var(--vvh, 100dvh) - 1rem)',
};

export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) return undefined;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        root.style.setProperty('--kb', `${kb}px`);
        root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
      });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--kb');
      root.style.removeProperty('--vvh');
    };
  }, []);
}
