# Wiring Workbench into a new application

Assumes the console work in
[firebase-project-setup.md](firebase-project-setup.md) is done, or that you are
working against the emulator.

## 1. Depend on the packages

```jsonc
{
  "dependencies": {
    "@workbench/core": "portal:../Workbench/packages/core",
    "@workbench/client": "portal:../Workbench/packages/client",
    "@workbench/functions": "portal:../Workbench/packages/functions"
  }
}
```

`portal:` resolves to TypeScript source — edits are visible immediately, with no
build step. Both repositories must be checked out side by side.

If your bundler does not follow workspace source automatically, add path
aliases, as a Vite app would:

```ts
resolve: {
  alias: {
    '@workbench/core': resolve('../Workbench/packages/core/src/index.ts'),
    '@workbench/client': resolve('../Workbench/packages/client/src/index.ts'),
  },
}
```

## 2. Define your identity and roles

Workbench does not define these. Yours must satisfy `BaseIdentity`
structurally — no import, no inheritance.

```ts
import type { BaseIdentity } from '@workbench/core';

export interface User extends BaseIdentity {
  avatarUrl?: string;
  // ...whatever else your application needs
}

export type Role = 'owner' | 'editor' | 'viewer';
export type Capability = 'project.configure' | 'project.read';
```

## 3. Build your permission matrix

```ts
import { createPermissions } from '@workbench/core';

export const permissions = createPermissions<Role, Capability>({
  owner:  ['project.configure', 'project.read'],
  editor: ['project.read'],
  viewer: ['project.read'],
});
```

Use the **same** matrix on the client and in your functions. That is what stops
the hidden button and the server refusal from disagreeing.

## 4. Wire the client

```ts
import { configFromEnv, createFirebase, FirebaseAuthService } from '@workbench/client';

const config = configFromEnv(import.meta.env);
if (!config) throw new Error('Firebase is not configured');

const { auth, db, functions } = createFirebase(config);
export const authService = new FirebaseAuthService<User>(auth, functions, {
  providers: ['password', 'google'],
});
```

`configFromEnv` returns `null` when unconfigured, so an application can fall
back to a mock rather than crash on a missing key.

## 5. Wire the functions

```ts
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  createAppCheckGuard, createAuditWriter, createCallableOptions,
  createEnsureProfile, createIdempotency, requireAuth,
} from '@workbench/functions';

// The application owns Admin SDK initialisation — initialising twice is a
// confusing failure, so Workbench never does it for you.
if (getApps().length === 0) initializeApp();
export const db = getFirestore();

export const CALLABLE_OPTIONS = createCallableOptions({ region: 'europe-west2' });

// Name the opt-out per application, so one project's local setting can never
// affect another's.
export const requireAppCheck = createAppCheckGuard({
  allowUnverifiedEnvVar: 'MYAPP_ALLOW_UNVERIFIED',
});

export const idempotency = createIdempotency({
  db,
  requestPath: (scopeId, requestId) => `workspaces/${scopeId}/requests/${requestId}`,
});

export const audit = createAuditWriter({
  db,
  auditPath: (scopeId) => `workspaces/${scopeId}/auditLog`,
});

export const ensureProfile = createEnsureProfile<User>({
  db,
  userPath: (uid) => `users/${uid}`,
  callableOptions: CALLABLE_OPTIONS,
  requireAppCheck,
  requireAuth,
  createProfile: (claims, requestedName) => ({
    id: claims.uid,
    displayName: requestedName || claims.displayName || claims.email.split('@')[0] || 'Member',
    email: claims.email,
    emailVerified: claims.emailVerified,
    providers: claims.providers.length ? claims.providers : ['password'],
    status: 'active',
    createdAt: new Date().toISOString(),
  }),
});
```

## 6. Copy and adapt the rules

Take `templates/firestore.rules` and `templates/storage.rules`, rename
`workspaces` to your container, and narrow the catch-all read rule per
collection. Keep `allow write: if false` everywhere — every mutation belongs in
a callable.

## 7. Write a command

The shape every mutating callable should have:

```ts
export const doThing = onCall(CALLABLE_OPTIONS, async (request) => {
  requireAppCheck(request);
  const userId = requireAuth(request);
  const requestId = requireString(request.data?.requestId, 'requestId');

  return db.runTransaction(async (tx) => {
    // Replay returns the recorded result without repeating the work.
    const replayed = await idempotency.read<Result>(tx, workspaceId, requestId);
    if (replayed) return replayed;

    // ...check capability, validate, do the work...

    audit.write(tx, workspaceId, {
      actorUserId: userId, action: 'thing.done',
      entityKind: 'thing', entityId: thing.id,
    });
    idempotency.write(tx, workspaceId, requestId, result);
    return result;
  });
});
```

The idempotency read and write must be **inside** the same transaction as the
work. Outside it, two concurrent replays both see "not seen yet".

## 8. Environment

Copy `templates/env.example`. Keep mode flags out of `.env.local` — it is loaded
in every mode and outranks `.env.production`.

## 9. Verify

```bash
yarn test        # offline
yarn typecheck
firebase emulators:start   # needs Java
```
