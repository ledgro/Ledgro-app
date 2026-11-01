export const FORMER_MEMBER = 'Former member';
export const NEW_MEMBER = 'New member';

/**
 * Name to show for an account id.
 * names   - { uid: name } from the shop's memberProfiles
 * current - Set of uids that belong to the shop right now (null when not known yet)
 * A current member whose name has not been saved yet is "New member", not "Former member".
 */
export function memberLabel(uid, { selfUid, names, current } = {}) {
  if (!uid) return '';
  if (uid === selfUid) return 'You';
  const name = names?.[uid];
  if (name) return name;
  if (current && current.has(uid)) return NEW_MEMBER;
  return FORMER_MEMBER;
}
