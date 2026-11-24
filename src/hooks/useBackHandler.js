import { useEffect } from 'react';
import { backStack } from '../lib/nativeBack';

/** While `active`, the Android Back button calls `fn` first (for example to leave select mode) instead of leaving the page. */
export function useBackHandler(active, fn) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = () => fn();
    backStack.push(handler);
    return () => { const i = backStack.lastIndexOf(handler); if (i >= 0) backStack.splice(i, 1); };
  }, [active, fn]);
}
