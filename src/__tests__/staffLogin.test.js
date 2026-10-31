import { describe, it, expect } from 'vitest';
import { toLoginEmail, usernameError, passwordError, displayId, isStaffEmail, STAFF_DOMAIN } from '../lib/staffLogin';

describe('staff login helpers', () => {
  it('turns a username into the hidden email and keeps a real email', () => {
    expect(toLoginEmail(' Ravi ')).toBe(`ravi@${STAFF_DOMAIN}`);
    expect(toLoginEmail('Owner@Gmail.com')).toBe('owner@gmail.com');
  });
  it('checks usernames', () => {
    expect(usernameError('ravi')).toBe('');
    expect(usernameError('ra')).not.toBe('');
    expect(usernameError('rav i')).not.toBe('');
    expect(usernameError('a@b')).not.toBe('');
    expect(usernameError('_ravi')).not.toBe('');
  });
  it('checks passwords', () => {
    expect(passwordError('1234567')).not.toBe('');
    expect(passwordError('12345678')).toBe('');
  });
  it('shows the username, not the hidden email', () => {
    expect(displayId({ email: `ravi@${STAFF_DOMAIN}` })).toBe('ravi');
    expect(displayId({ email: 'a@gmail.com' })).toBe('a@gmail.com');
    expect(isStaffEmail('a@gmail.com')).toBe(false);
  });
});
