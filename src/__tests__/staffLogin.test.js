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

import { emailTypo, cooldownLeft, verifyMessage, COOLDOWN_MS } from '../lib/verifyEmail';

describe('verification email helpers', () => {
  it('flags common address typos', () => {
    expect(emailTypo('a@gmial.com')).toEqual({ fix: 'a@gmail.com' });
    expect(emailTypo('a@gamil.com')).toEqual({ fix: 'a@gmail.com' });
    expect(emailTypo('a@gmail.dom')).toEqual({ fix: null });
    expect(emailTypo('a@shop.con')).toEqual({ fix: null });
    expect(emailTypo('a@gmail.com')).toBeNull();
    expect(emailTypo('a@company.co.in')).toBeNull();
  });
  it('cooldown counts down to zero', () => {
    expect(cooldownLeft(1000 + COOLDOWN_MS / 2, 1000)).toBe(30);
    expect(cooldownLeft(1000 + COOLDOWN_MS, 1000)).toBe(0);
    expect(cooldownLeft(Date.now(), 0)).toBe(0);
  });
  it('keeps the error code in unknown messages and explains throttling', () => {
    expect(verifyMessage({ code: 'auth/too-many-requests' })).toMatch(/Too many emails/);
    expect(verifyMessage({ code: 'auth/weird' })).toMatch(/auth\/weird/);
  });
});
