/**
 * Turning an authenticated credential into an application profile.
 *
 * Firebase Authentication and the profile document are separate things: auth
 * proves who someone is, the profile is what the application reads. This
 * creates the profile on first sign-in and keeps the verified-email flag
 * current afterwards.
 *
 * It is a callable rather than a client write because Security Rules deny
 * client writes everywhere, including to a user's own profile — otherwise
 * somebody could set `emailVerified` on themselves.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import type { AuthProviderId, BaseIdentity, VerifiedTokenClaims } from '@workbench/core';

/** Firebase's provider ids, mapped onto ours. */
const PROVIDER_IDS: Record<string, AuthProviderId> = {
  password: 'password',
  'google.com': 'google',
  'facebook.com': 'facebook',
  'twitter.com': 'twitter',
};

/**
 * Read the trustworthy claims out of a verified request.
 *
 * Everything here comes from the ID token, which the platform has already
 * verified. Nothing here comes from the request body, which a client controls.
 */
export function claimsFrom(request: CallableRequest, userId: string): VerifiedTokenClaims {
  const token = request.auth!.token;
  const identities = token.firebase?.identities;

  const providers = (identities ? Object.keys(identities) : [])
    .map((id) => PROVIDER_IDS[id])
    .filter((provider): provider is AuthProviderId => Boolean(provider));

  return {
    uid: userId,
    email: (token.email as string | undefined) ?? '',
    emailVerified: Boolean(token.email_verified),
    displayName: (token.name as string | undefined) ?? null,
    providers,
  };
}

export interface EnsureProfileOptions<TUser extends BaseIdentity> {
  db: Firestore;
  /** Where the profile lives, e.g. `(uid) => \`users/${uid}\``. */
  userPath: (userId: string) => string;
  /** Shared callable options, so this cannot ship without App Check. */
  callableOptions: { region: string; enforceAppCheck: boolean };
  requireAppCheck: (request: CallableRequest) => void;
  requireAuth: (request: CallableRequest) => string;

  /**
   * Build the application's user on first sign-in.
   *
   * Supplied by the application because Workbench does not know what fields it
   * needs beyond the identity basics.
   */
  createProfile: (claims: VerifiedTokenClaims, requestedDisplayName: string | null) => TUser;

  /**
   * Fields to refresh on every subsequent sign-in.
   *
   * Deliberately a patch rather than a rewrite: a sign-in must not resurrect a
   * suspended account or overwrite a display name the person chose in the app
   * with the one their identity provider happens to hold.
   */
  updateProfile?: (existing: TUser, claims: VerifiedTokenClaims) => Partial<TUser>;
}

/** Default refresh: keep the email and verification state current, nothing else. */
function defaultUpdate<TUser extends BaseIdentity>(
  _existing: TUser,
  claims: VerifiedTokenClaims,
): Partial<TUser> {
  return {
    email: claims.email,
    emailVerified: claims.emailVerified,
    ...(claims.providers.length ? { providers: claims.providers } : {}),
  } as Partial<TUser>;
}

/**
 * Build the `ensureProfile` callable for an application.
 *
 * ```ts
 * export const ensureProfile = createEnsureProfile<User>({
 *   db, userPath: (uid) => `users/${uid}`,
 *   callableOptions: CALLABLE_OPTIONS,
 *   requireAppCheck, requireAuth,
 *   createProfile: (claims, requested) => ({ ...  }),
 * });
 * ```
 */
export function createEnsureProfile<TUser extends BaseIdentity>(
  options: EnsureProfileOptions<TUser>,
) {
  const update = options.updateProfile ?? defaultUpdate;

  return onCall(options.callableOptions, async (request): Promise<TUser> => {
    options.requireAppCheck(request);
    const userId = options.requireAuth(request);

    const claims = claimsFrom(request, userId);
    const requestedName =
      (request.data?.displayName as string | undefined)?.trim() || null;

    const ref = options.db.doc(options.userPath(userId));

    // A transaction, so two tabs signing in at once cannot both decide the
    // profile is missing and write a different one.
    return options.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        const created = options.createProfile(claims, requestedName);
        tx.set(ref, created);
        return created;
      }

      const existing = snap.data() as TUser;
      const patch = update(existing, claims);
      tx.set(ref, patch, { merge: true });
      return { ...existing, ...patch };
    });
  });
}
