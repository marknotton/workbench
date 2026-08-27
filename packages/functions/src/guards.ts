/**
 * The checks every callable runs before it touches data.
 *
 * The rule these exist to enforce: nothing reaches the database without first
 * proving who the caller is and that the request is coming from the real
 * application. Security Rules deny every client write, so callables are the
 * only way in — which makes them the only place authorisation can happen.
 */

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

/**
 * The signed-in user's id, or a refusal.
 *
 * `request.auth` is populated by the platform from a verified ID token. A
 * client cannot forge it, which is why this is trustworthy and a uid in the
 * request body would not be.
 */
export function requireAuth(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  return uid;
}

export interface AppCheckOptions {
  /**
   * Environment variable that, when `'true'`, skips the check.
   *
   * Needed because the emulator cannot produce attestation, so local runs must
   * opt out explicitly. `firebase deploy` ignores `.env.local`, so a deployed
   * function never sees it — but name it per-application anyway, so one
   * project's local setting can never affect another's.
   */
  allowUnverifiedEnvVar: string;
}

/**
 * Refuse a request that is not attested by App Check.
 *
 * This is the second of two checks. `enforceAppCheck` in the callable options
 * makes the platform reject unattested calls before they reach this code; this
 * repeats it inside the handler. Belt and braces, because this is the boundary
 * between the open internet and the whole database.
 */
export function createAppCheckGuard(options: AppCheckOptions) {
  return function requireAppCheck(request: CallableRequest): void {
    if (process.env[options.allowUnverifiedEnvVar] === 'true') return;
    if (!request.app) {
      // Deliberately vague: a caller probing the boundary learns nothing about
      // why they were refused.
      throw new HttpsError('failed-precondition', 'Request failed verification.');
    }
  };
}

export function requireField<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null || value === '') {
    throw new HttpsError('invalid-argument', `Missing required field: ${name}`);
  }
  return value;
}

/** Whole numbers only, all the way to the boundary. */
export function requireInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', `${name} must be a whole number.`);
  }
  return value;
}

export function requireString(value: unknown, name: string, maxLength = 4096): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpsError('invalid-argument', `${name} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new HttpsError('invalid-argument', `${name} is too long.`);
  }
  return value;
}

export interface CallableOptionsInput {
  /** Must match the region the client calls. */
  region: string;
  /** Leave enforced unless there is a specific, documented reason not to. */
  enforceAppCheck?: boolean;
}

/**
 * Shared options for every callable in an application.
 *
 * Defined once so a new function cannot quietly ship without App Check by
 * forgetting to opt in.
 */
export function createCallableOptions(input: CallableOptionsInput) {
  return {
    region: input.region,
    enforceAppCheck: input.enforceAppCheck ?? true,
  } as const;
}
