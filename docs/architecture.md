# Architecture

## The stack

| Concern | Choice |
|---|---|
| Identity | Firebase Authentication |
| Data | Cloud Firestore |
| Files | Cloud Storage |
| Trusted logic | Node.js / TypeScript Cloud Functions (callables) |
| Static hosting | Firebase Hosting |
| Abuse resistance | Firebase App Check (reCAPTCHA v3) |

No PHP. Cloud Run is a plausible future option for long-running or
CPU-heavy work and is deliberately **not** built now — callables cover
everything the foundation currently does.

## One Firebase project per application

Each application has its own project, its own user database, its own Firestore
and its own bucket. There is no central directory that all applications share.

This costs some duplication — a person signing up for two applications has two
accounts. It buys three things that matter more:

- **A breach is contained.** Compromising one application's credentials reaches
  one application's users.
- **No cross-application coupling.** An application can be handed over, shut
  down, or given to a different owner without untangling shared identity.
- **Rules stay legible.** Multi-tenancy pushes tenant checks into every rule and
  every query, and a missed check is a data leak.

Sharing identity across applications later means adding a deliberate federation
step, which is a much better position than trying to *remove* multi-tenancy from
a live system.

## Ports, not frameworks

`@workbench/core` defines interfaces and contains no I/O. `@workbench/client`
and `@workbench/functions` implement against them.

The application picks an implementation at its composition root, so no screen
knows whether it is talking to Firebase, an emulator, or a mock. That is what
makes an application testable without a Firebase project, and what makes
swapping a provider a contained change.

`@workbench/core` has **zero dependencies**. Not a stylistic preference: it is
imported by browser bundles, Cloud Functions and tests alike, and anything it
depends on is dragged into all three.

## Generic over the application's types

Workbench does not define your user or your roles.

```ts
AuthService<TUser extends BaseIdentity>
createPermissions<TRole extends string, TCapability extends string>(matrix)
```

An application binds its own `User` and its own role union and gets type-safe
checks with no mapping layer. `BaseIdentity` is the small set of fields
authentication genuinely needs, and it is structural — an application whose user
already has those fields satisfies it without importing anything.

## Clients never write

Every mutation goes through a callable Cloud Function. Security Rules allow
reads and deny **all** client writes.

Rules can check who you are and what a document says. They cannot easily
validate a payload, keep a counter consistent, enforce a limit across several
documents, or make an operation idempotent. Splitting authorisation between
rules and functions means writing it twice and having it disagree.

So the rules answer one question — *may this person read this?* — and the
callables answer everything else. It also makes the audit trail complete by
construction: there is no path to the data that bypasses the code that writes it.

## Capabilities, not role checks

Handlers ask `can(roles, 'members.manage')`, never `role === 'admin'`.

Adding a role becomes a matrix edit rather than a hunt through call sites, and
the same matrix runs on the client and the server. The client uses it to hide
what a person cannot do; the server uses it to refuse. The hiding is a courtesy
and the refusal is the enforcement — but because both read one matrix, they
cannot drift.

## Idempotency by request id

Every command carries a caller-generated `requestId`. The handler reads the
idempotency ledger inside the same transaction as the work, and writes the
result to it in that transaction.

A replay returns the recorded result instead of repeating the work. This is what
stops a double-tapped button becoming two records and a retried call becoming
two writes. The read and write **must** share the transaction with the work —
otherwise two concurrent replays both see "not seen yet".

## App Check, twice

`enforceAppCheck: true` makes the platform reject unattested calls before they
reach application code. `requireAppCheck(request)` repeats the check inside the
handler.

Redundant on purpose: this is the boundary between the open internet and the
entire database, and the platform-level flag is one configuration mistake away
from being off.

The emulator cannot produce attestation, so local runs opt out through a
**per-application** environment variable. Naming it per application means one
project's local setting can never affect another's, and `firebase deploy`
ignores `.env.local` so a deployed function never sees it.

## Counters, not queries, for contention

Where a limit must hold under concurrency, keep a running counter on a document
the transaction reads *and* writes.

A Firestore transaction that reads a **query** does not lock rows a concurrent
transaction is about to insert — so two callers can both see "0 taken" and both
claim the last slot. Reading and writing the same document forces them to
serialise.

This pattern came from the first consumer and is documented here because it is
the sort of thing that looks like premature complexity until it silently fails
in production.
