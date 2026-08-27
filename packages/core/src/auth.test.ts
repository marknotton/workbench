import { describe, expect, it } from 'vitest';
import {
  AUTH_ERROR_COPY_KEYS,
  AuthError,
  MIN_PASSWORD_LENGTH,
  PROVIDER_COPY_KEYS,
  checkPassword,
  isValidEmail,
} from './auth.js';
import type { AuthErrorCode } from './auth.js';
import type { AuthProviderId } from './identity.js';

describe('password policy', () => {
  it('accepts a long passphrase', () => {
    expect(checkPassword('correct horse battery staple').ok).toBe(true);
  });

  it('rejects anything shorter than the minimum', () => {
    const result = checkPassword('short');
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('accepts exactly the minimum length', () => {
    expect(checkPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1)).ok).toBe(false);
    expect(checkPassword('abcdefghij').ok).toBe(true);
  });

  it('has no character-class rules, by design', () => {
    // All lower case, no digits, no symbols — and long enough to be fine.
    expect(checkPassword('thequickbrownfox').ok).toBe(true);
  });

  it('flags leading or trailing whitespace, which is nearly always a paste error', () => {
    expect(checkPassword(' averylongpassword').problems).toContain(
      'Remove the space at the start or end.',
    );
    expect(checkPassword('averylongpassword ').ok).toBe(false);
  });

  it('flags a single repeated character', () => {
    expect(checkPassword('aaaaaaaaaaaa').ok).toBe(false);
  });

  it('reports every problem at once rather than one at a time', () => {
    expect(checkPassword(' aa ').problems.length).toBeGreaterThan(1);
  });
});

describe('email validation', () => {
  it('accepts ordinary addresses and trims first', () => {
    expect(isValidEmail('someone@example.com')).toBe(true);
    expect(isValidEmail('  someone@example.com  ')).toBe(true);
  });

  it('rejects obvious nonsense', () => {
    for (const bad of ['', 'someone', 'someone@', '@example.com', 'a b@example.com', 'a@b']) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe('AuthError', () => {
  it('carries a code and defaults its message to it', () => {
    const error = new AuthError('too_many_attempts');
    expect(error.code).toBe('too_many_attempts');
    expect(error.message).toBe('too_many_attempts');
    expect(error.name).toBe('AuthError');
  });

  it('preserves the underlying cause for logging', () => {
    const cause = new Error('auth/network-request-failed');
    expect(new AuthError('network', 'Offline.', cause).cause).toBe(cause);
  });
});

describe('copy keys', () => {
  it('covers every provider', () => {
    const providers: AuthProviderId[] = ['password', 'google', 'facebook', 'twitter'];
    for (const provider of providers) {
      expect(PROVIDER_COPY_KEYS[provider]).toBeTruthy();
    }
  });

  it('covers every error code, so no failure renders as a raw enum', () => {
    const codes: AuthErrorCode[] = [
      'invalid_credentials', 'email_in_use', 'weak_password', 'invalid_email',
      'user_disabled', 'too_many_attempts', 'popup_blocked', 'popup_closed',
      'account_exists_with_different_provider', 'requires_recent_login',
      'network', 'unknown',
    ];
    for (const code of codes) {
      expect(AUTH_ERROR_COPY_KEYS[code]).toBeTruthy();
    }
  });
});
