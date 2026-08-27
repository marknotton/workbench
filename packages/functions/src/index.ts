/**
 * @workbench/functions — trusted server-side building blocks.
 *
 * `firebase-admin` and `firebase-functions` are peer dependencies: the
 * application owns the versions and the Admin SDK initialisation, because
 * initialising it twice in one process is a confusing failure.
 *
 * Nothing here assumes a collection layout. Every helper takes the paths it
 * should use, so an application's data model stays its own.
 */

export {
  requireAuth,
  requireField,
  requireInteger,
  requireString,
  createAppCheckGuard,
  createCallableOptions,
  type AppCheckOptions,
  type CallableOptionsInput,
} from './guards.js';

export {
  createIdempotency,
  type Idempotency,
  type IdempotencyOptions,
  type RequestRecord,
} from './idempotency.js';

export {
  createAuditWriter,
  type AuditInput,
  type AuditOptions,
  type AuditWriter,
} from './audit.js';

export {
  createEnsureProfile,
  claimsFrom,
  type EnsureProfileOptions,
} from './profile.js';
