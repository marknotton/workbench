/**
 * Authentication port.
 *
 * The application talks to this interface and the implementation is chosen at
 * the composition root. Firebase Authentication is one implementation; a
 * development account switcher is another. No screen knows which it has.
 *
 * Deliberately narrow. Password policy, token refresh, popup-versus-redirect
 * and provider quirks belong to the implementation, not to the callers.
 *
 * Generic over `TUser` so an application keeps its own user type end to end.
 */

import type { AuthProviderId, BaseIdentity } from './identity.js';

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_in_use'
  | 'weak_password'
  | 'invalid_email'
  | 'user_disabled'
  | 'too_many_attempts'
  | 'popup_blocked'
  | 'popup_closed'
  | 'account_exists_with_different_provider'
  | 'requires_recent_login'
  | 'network'
  | 'unknown';

/**
 * A failure a person can act on.
 *
 * Providers return a zoo of codes; an implementation maps them onto this small
 * set so the UI can show its own wording rather than a raw provider string
 * like `auth/invalid-login-credentials`.
 */
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message?: string,
    override readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthService<TUser extends BaseIdentity = BaseIdentity> {
  /** Fires immediately with the current state, then on every change. Returns an unsubscribe. */
  subscribe(listener: (user: TUser | null) => void): () => void;

  signInWithEmail(email: string, password: string): Promise<TUser>;
  register(input: RegisterInput): Promise<TUser>;
  signInWithProvider(provider: AuthProviderId): Promise<TUser>;

  sendVerificationEmail(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;

  /** Attach another sign-in method to the current account, so one person is one account. */
  linkProvider(provider: AuthProviderId): Promise<TUser>;

  signOut(): Promise<void>;

  /** Providers this build can actually offer, for rendering the buttons. */
  availableProviders(): AuthProviderId[];

  /** Development-only account switching. Absent or empty in production. */
  listSwitchableAccounts?(): Promise<TUser[]>;
  switchTo?(userId: string): Promise<TUser>;
}

// ---------------------------------------------------------------------------
// Password policy
// ---------------------------------------------------------------------------

export interface PasswordCheck {
  ok: boolean;
  problems: string[];
}

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Length first, because it is what actually helps.
 *
 * Deliberately no character-class rules: they push people towards `Passw0rd!`,
 * which is worse than a long memorable phrase. Applications that must satisfy
 * an external policy can wrap this rather than replace it.
 */
export function checkPassword(password: string): PasswordCheck {
  const problems: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (/^\s|\s$/.test(password)) {
    problems.push('Remove the space at the start or end.');
  }
  if (/^(.)\1+$/.test(password)) {
    problems.push('That is the same character repeated.');
  }

  return { ok: problems.length === 0, problems };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL.test(email.trim());
}

/**
 * Suggested copy keys for provider buttons.
 *
 * Workbench ships keys, never sentences — the wording belongs to the
 * application's own copy or i18n layer.
 */
export const PROVIDER_COPY_KEYS: Record<AuthProviderId, string> = {
  password: 'auth.signIn',
  google: 'auth.continueWithGoogle',
  facebook: 'auth.continueWithFacebook',
  twitter: 'auth.continueWithTwitter',
};

/** Suggested copy keys for each failure, for the same reason. */
export const AUTH_ERROR_COPY_KEYS: Record<AuthErrorCode, string> = {
  invalid_credentials: 'auth.error.invalidCredentials',
  email_in_use: 'auth.error.emailInUse',
  weak_password: 'auth.error.weakPassword',
  invalid_email: 'auth.error.invalidEmail',
  user_disabled: 'auth.error.userDisabled',
  too_many_attempts: 'auth.error.tooManyAttempts',
  popup_blocked: 'auth.error.popupBlocked',
  popup_closed: 'auth.error.popupClosed',
  account_exists_with_different_provider: 'auth.error.accountExistsWithDifferentProvider',
  requires_recent_login: 'auth.error.requiresRecentLogin',
  network: 'auth.error.network',
  unknown: 'auth.error.unknown',
};
