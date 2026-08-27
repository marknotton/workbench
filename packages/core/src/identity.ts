/**
 * The identity shape Workbench needs, and nothing more.
 *
 * Deliberately minimal. A consuming application almost always has a richer user
 * of its own — display preferences, membership, domain state — and Workbench
 * has no business knowing about any of it. It only requires the handful of
 * fields authentication genuinely depends on, and stays generic over the rest.
 *
 * An application binds its own user type to the generic parameters throughout
 * this package, so there is no mapping layer unless the app wants one.
 */

/** Sign-in methods Workbench knows how to drive. */
export type AuthProviderId = 'password' | 'google' | 'facebook' | 'twitter';

export type AccountStatus = 'active' | 'suspended';

/**
 * The minimum an application's user type must provide.
 *
 * Structural, not nominal: an application whose own `User` already has these
 * fields satisfies it without importing anything or changing its shape.
 */
export interface BaseIdentity {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  providers: AuthProviderId[];
  status: AccountStatus;
  createdAt: string;
}

/**
 * What a trusted profile function receives from a verified ID token.
 *
 * The token is the authority on email and verification state — a client can
 * claim anything in a request body, but it cannot forge a token. Anything
 * derived from these fields is therefore safe to persist; anything sent
 * alongside them is not.
 */
export interface VerifiedTokenClaims {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  providers: AuthProviderId[];
}
