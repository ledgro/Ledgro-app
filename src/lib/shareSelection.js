import { MAX_SHARE_FILES } from './catalogImages';

/** What the one big button says and does for N pictures: share up to 30, otherwise a ZIP. */
export function sendAction(n) {
  if (n <= 0) return { label: 'Send pictures', mode: 'share', disabled: true };
  if (n > MAX_SHARE_FILES) return { label: `Save ${n} pictures as ZIP`, mode: 'zip', disabled: false };
  return { label: `Send ${n} picture${n === 1 ? '' : 's'}`, mode: 'share', disabled: false };
}

/** The line about products left out for having no photo, or '' when none. */
export const skippedNote = (skipped) => (skipped > 0 ? `${skipped} ${skipped === 1 ? 'has' : 'have'} no photo and ${skipped === 1 ? 'is' : 'are'} left out` : '');

export const toggleKey = (set, key) => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; };

/** Select all means every card in the current list (after search and filter), not only the ones drawn so far. */
export const selectAllKeys = (entries, keyOf) => new Set(entries.map(keyOf));

/** Only cards still in the list count: a pick hidden by a later search is ignored. */
export const pickedEntries = (entries, selected, keyOf) => entries.filter((e) => selected.has(keyOf(e)));
