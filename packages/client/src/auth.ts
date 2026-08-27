/**
 * Firebase Authentication, behind the `AuthService` port.
 *
 * Two things this does beyond wrapping the SDK:
 *
 *  - It maps Firebase's error codes onto the small `AuthErrorCode` set, so
 *    screens show their own copy instead of `auth/invalid-login-credentials`.
 *  - It resolves a Firebase credential into the *application's* user by calling
 *    a trusted callable. Authentication and the profile document are separate
 *    things, and an application almost always wants the profile.
 *
 * Generic over `TUser`: the application's own user type travels through
 * unchanged, so there is no mapping layer.
 */

import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  TwitterAuthProvider,
  createUserWithEmailAndPassword,
  linkWithPopup,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type AuthProvider as FirebaseAuthProvider,
  type User as FirebaseUser,
} from 'firebase/auth';
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  AuthError,
  type AuthErrorCode,
  type AuthProviderId,
  type AuthService,
  type BaseIdentity,
  type RegisterInput,
} from '@workbench/core';

const FIREBASE_ERROR_MAP: Record<string, AuthErrorCode> = {
  'auth/invalid-credential': 'invalid_credentials',
  'auth/invalid-login-credentials': 'invalid_credentials',
  'auth/wrong-password': 'invalid_credentials',
  'auth/user-not-found': 'invalid_credentials',
  'auth/email-already-in-use': 'email_in_use',
  'auth/weak-password': 'weak_password',
  'auth/invalid-email': 'invalid_email',
  'auth/user-disabled': 'user_disabled',
  'auth/too-many-requests': 'too_many_attempts',
  'auth/popup-blocked': 'popup_blocked',
  'auth/popup-closed-by-user': 'popup_closed',
  'auth/cancelled-popup-request': 'popup_closed',
  'auth/account-exists-with-different-credential': 'account_exists_with_different_provider',
  'auth/requires-recent-login': 'requires_recent_login',
  'auth/network-request-failed': 'network',
};

export function toAuthError(cause: unknown): AuthError {
  const code = (cause as { code?: string })?.code ?? '';
  return new AuthError(FIREBASE_ERROR_MAP[code] ?? 'unknown', undefined, cause);
}

function providerFor(provider: AuthProviderId): FirebaseAuthProvider {
  switch (provider) {
    case 'google':
      return new GoogleAuthProvider();
    case 'facebook':
      return new FacebookAuthProvider();
    case 'twitter':
      return new TwitterAuthProvider();
    default:
      throw new AuthError('unknown', `${provider} is not an OAuth provider.`);
  }
}

/** What the profile callable is sent. The token is the authority, not this. */
export interface ProfileCallableInput {
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
}

export interface FirebaseAuthOptions {
  /**
   * Providers this deployment offers. Enabling one means adding it here *and*
   * configuring it in the Firebase console — the list alone does nothing.
   */
  providers?: AuthProviderId[];

  /**
   * Name of the callable that turns a credential into an application user,
   * creating the profile document on first sign-in.
   */
  profileCallable?: string;

  /**
   * Whether registering sends a verification email immediately.
   *
   * On by default. Whether an *unverified* account may then do anything is the
   * application's decision, not this service's.
   */
  sendVerificationOnRegister?: boolean;
}

export const DEFAULT_PROFILE_CALLABLE = 'ensureProfile';

export class FirebaseAuthService<TUser extends BaseIdentity = BaseIdentity>
  implements AuthService<TUser>
{
  private readonly providers: AuthProviderId[];
  private readonly profileCallable: string;
  private readonly sendVerificationOnRegister: boolean;

  constructor(
    private readonly auth: Auth,
    private readonly functions: Functions,
    options: FirebaseAuthOptions = {},
  ) {
    this.providers = options.providers ?? ['password', 'google'];
    this.profileCallable = options.profileCallable ?? DEFAULT_PROFILE_CALLABLE;
    this.sendVerificationOnRegister = options.sendVerificationOnRegister ?? true;
  }

  availableProviders(): AuthProviderId[] {
    return [...this.providers];
  }

  /**
   * Turn a Firebase credential into the application's user.
   *
   * Done server-side because the profile document is not client-writable —
   * Security Rules deny it like everything else, otherwise a user could set
   * their own verification state.
   */
  private async resolve(firebaseUser: FirebaseUser): Promise<TUser> {
    const ensure = httpsCallable<ProfileCallableInput, TUser>(
      this.functions,
      this.profileCallable,
    );

    const { data } = await ensure({
      displayName: firebaseUser.displayName,
      email: firebaseUser.email,
      emailVerified: firebaseUser.emailVerified,
    });
    return data;
  }

  subscribe(listener: (user: TUser | null) => void): () => void {
    return onAuthStateChanged(this.auth, (firebaseUser) => {
      if (!firebaseUser) {
        listener(null);
        return;
      }
      this.resolve(firebaseUser)
        .then(listener)
        .catch(() => {
          // A profile that cannot be resolved is not a usable session; better
          // to present as signed out than to render a half-broken app.
          listener(null);
        });
    });
  }

  async signInWithEmail(email: string, password: string): Promise<TUser> {
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email.trim(), password);
      return await this.resolve(credential.user);
    } catch (cause) {
      throw toAuthError(cause);
    }
  }

  async register({ email, password, displayName }: RegisterInput): Promise<TUser> {
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
      await updateProfile(credential.user, { displayName: displayName.trim() });
      if (this.sendVerificationOnRegister) {
        await sendEmailVerification(credential.user);
      }
      return await this.resolve(credential.user);
    } catch (cause) {
      throw toAuthError(cause);
    }
  }

  async signInWithProvider(provider: AuthProviderId): Promise<TUser> {
    try {
      const credential = await signInWithPopup(this.auth, providerFor(provider));
      return await this.resolve(credential.user);
    } catch (cause) {
      throw toAuthError(cause);
    }
  }

  async linkProvider(provider: AuthProviderId): Promise<TUser> {
    const current = this.auth.currentUser;
    if (!current) throw new AuthError('invalid_credentials', 'Nobody is signed in.');
    try {
      const credential = await linkWithPopup(current, providerFor(provider));
      return await this.resolve(credential.user);
    } catch (cause) {
      throw toAuthError(cause);
    }
  }

  async sendVerificationEmail(): Promise<void> {
    const current = this.auth.currentUser;
    if (!current) throw new AuthError('invalid_credentials', 'Nobody is signed in.');
    try {
      await sendEmailVerification(current);
    } catch (cause) {
      throw toAuthError(cause);
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email.trim());
    } catch (cause) {
      // Deliberately swallowed: telling an anonymous caller that an address is
      // unknown turns the reset form into an account-enumeration oracle. The
      // caller sees the same outcome either way.
      const mapped = toAuthError(cause);
      if (mapped.code !== 'invalid_credentials') throw mapped;
    }
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(this.auth);
  }
}
