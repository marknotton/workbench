# Migration report — extracted from Gatherplay

What moved out of Gatherplay into Workbench v0.1, what changed on the way, and
what deliberately stayed behind.

Source: Gatherplay at commit `59a2503`.

## Extracted

| From (Gatherplay) | To (Workbench) | Changed on the way |
|---|---|---|
| `packages/core/src/auth.ts` | `@workbench/core` → `auth.ts` | `AuthService` became generic over `TUser extends BaseIdentity`. Added `AUTH_ERROR_COPY_KEYS`. |
| `packages/core/src/types.ts` (identity parts only) | `@workbench/core` → `identity.ts` | New `BaseIdentity` and `VerifiedTokenClaims`. `AuthProviderId` lifted verbatim. |
| `packages/core/src/permissions.ts` | `@workbench/core` → `permissions.ts` | Fixed role union and matrix replaced by `createPermissions<TRole, TCapability>()`. Added an `owner`/`admin`/`member` starter matrix. |
| `packages/firebase/src/client.ts` | `@workbench/client` → `firebase.ts` | Region and emulator ports became configurable. Storage handle added. |
| `packages/firebase/src/auth.ts` | `@workbench/client` → `auth.ts` | Generic over `TUser`. Profile callable name configurable. Error map and enumeration-safe reset lifted verbatim. |
| `packages/functions/src/shared.ts` (generic half) | `@workbench/functions` → `guards.ts`, `idempotency.ts`, `audit.ts` | App Check env var, callable region, and all document paths became parameters. |
| `packages/functions/src/profile.ts` | `@workbench/functions` → `profile.ts` | `createEnsureProfile()` factory; profile construction supplied by the application. |
| `firestore.rules`, `storage.rules` | `templates/` | Rewritten around a generic `workspaces` container. Gatherplay's own rules were **not** modified. |

## Behaviour-affecting changes

Three, all additive:

1. **Storage handle** — `createFirebase` now also returns `storage` and connects
   the storage emulator when emulators are on. Additive; nothing calls it unless
   the application does. Needed so the foundation is usable for uploads later.
2. **`sendVerificationOnRegister`** — was unconditional, now an option
   defaulting to `true`. Same behaviour unless overridden.
3. **`scopeField` on the audit writer** — defaults to `scopeId`, but exists so
   an application with an established audit shape (Gatherplay writes `eventId`)
   can adopt the writer without rewriting documents.

Everything else was lifted with its logic and its comments intact.

## Deliberately left in Gatherplay

Domain-shaped code with no reusable core:

- `paths` — every collection path is Gatherplay's own data model.
- `loadEvent`, `loadMember`, `requireCapability` — bound to events and its
  seven roles. The *pattern* is in Workbench; these bindings are not.
- `postTransaction` and the whole wallet ledger — a currency ledger is a
  Gatherplay feature, not foundation material.
- `requireTokens` — validates Gatherplay's branded `Tokens` type. Workbench has
  the generic `requireInteger`.
- Its markets, entries, settlement, capacity and terms-acceptance logic.
- Its Firestore and Storage rules, which stay as they are.

## What Workbench does **not** contain

Checked deliberately, because leakage here is the failure mode that matters:

- No Gatherplay names — no event, market, entry, wallet, player, token, stake.
- No Gatherplay collections or paths.
- No Gatherplay roles.
- No Gatherplay screens, copy or business rules.
- No assumption that a "workspace" is a game, or that members have balances.

Grep confirms zero occurrences of `gatherplay`, `event`, `market` or `wallet` as
domain terms in `packages/`.

## Verification at extraction time

| Check | Result |
|---|---|
| `yarn test` (Workbench) | **29 passed** — 2 files, auth policy and permissions |
| `yarn typecheck` (Workbench) | **Clean** across all three packages |
| Gatherplay suites | **Not run.** The extraction container's `node_modules` was a root-owned volume, so Gatherplay could not be installed or tested. Re-run before merging the integration. |

The last row is the honest caveat on this release: Workbench is verified,
Gatherplay's consumption of it is not.

## Follow-up

- Run Gatherplay's full suite against the integration branch and confirm the
  counts match the pre-extraction baseline.
- Extract the rules and contention test harness into `@workbench/testing`
  (see gaps.md) — it exists and works in Gatherplay but was not generalised.
- Build an example application, the only real proof the foundation works
  detached from the app it came from.
