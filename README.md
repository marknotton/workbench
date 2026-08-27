# Workbench

A reusable Firebase application foundation: authentication, permissions,
callable hardening and security-rule templates, extracted so that each new
application starts with the boring, security-critical parts already done.

> **Temporary name.** "Workbench" is a working title and appears in package
> scopes (`@workbench/*`). Renaming later is a find-and-replace plus a version
> bump — nothing depends on the name structurally.

## What this is, and is not

**It is** a codebase, a set of packages, rule templates, documentation and a
setup process. Each consuming application keeps **its own Firebase project, its
own user database and its own data.**

**It is not** a hosted backend, a shared user directory, or a multi-tenant
platform. There is no central Firebase project that all applications sign into.
That was a deliberate decision — see [docs/architecture.md](docs/architecture.md).

## Status

**v0.1.0 — extracted, not yet feature-complete.**

This release is the reusable material lifted out of its first consumer
(Gatherplay), generalised and tested. Several items from the intended scope are
documented but **not built**; see [docs/gaps.md](docs/gaps.md) before assuming a
feature exists.

| Package | What it holds |
|---|---|
| `@workbench/core` | The auth port, identity shape, permission engine. No dependencies at all. |
| `@workbench/client` | Firebase app setup, App Check, emulator wiring, `FirebaseAuthService`. |
| `@workbench/functions` | Auth and App Check guards, idempotency, audit writes, `ensureProfile`. |

Plus `templates/` — Firestore and Storage rules, `firebase.json`, `env.example`.

## What works today

- Email/password registration and sign-in
- Google OAuth (Facebook and X modelled, not wired)
- Email verification and password reset
- Provider linking, so one person is one account
- Sign-out and session subscription
- Provider error codes mapped to a small, presentable set
- Length-based password policy
- Generic role/capability permissions, enforced client *and* server side
- App Check enforcement, both platform-level and in-handler
- Idempotent callables via caller-supplied request ids
- Append-only audit trail
- Deny-all-client-writes rule templates

## What is not built yet

Passwordless email-link sign-in · account deletion · custom email action
handler · expiring one-time invitations · file uploads · the mail interface and
Resend adapter · a runnable example application.

Each is specified in [docs/gaps.md](docs/gaps.md) with the design already
decided, so picking one up is implementation rather than discovery.

## Install

Workbench is consumed as a local workspace package. There is no registry
publish yet.

```jsonc
// your-app/package.json
{
  "dependencies": {
    "@workbench/core": "portal:../Workbench/packages/core",
    "@workbench/client": "portal:../Workbench/packages/client",
    "@workbench/functions": "portal:../Workbench/packages/functions"
  }
}
```

`portal:` resolves to the TypeScript source, so a change here is visible in the
consuming app immediately with no build or publish step.

## Quick start

```bash
yarn install
yarn test        # offline unit tests
yarn typecheck
yarn lint
```

Then follow [docs/setup-new-application.md](docs/setup-new-application.md).

## Documentation

| Document | Covers |
|---|---|
| [architecture.md](docs/architecture.md) | The shape, and why each decision went the way it did |
| [security.md](docs/security.md) | Threat model, the rules that follow from it, what is public vs secret |
| [setup-new-application.md](docs/setup-new-application.md) | Wiring Workbench into a new app |
| [firebase-project-setup.md](docs/firebase-project-setup.md) | **The manual console checklist** |
| [environment-variables.md](docs/environment-variables.md) | Every variable, and whether it is public, server-only or deploy-only |
| [migration-report.md](docs/migration-report.md) | Exactly what was extracted from Gatherplay and what changed |
| [gaps.md](docs/gaps.md) | Specified but unbuilt, with the intended design |

## Testing

`yarn test` runs the offline unit suites and needs nothing installed beyond the
dependencies.

Security-rule and emulator tests need the Firebase Emulator Suite, which needs
**Java**. If `java -version` fails, install a JRE (`brew install openjdk` on
macOS). The offline suite never needs it.

## Secrets

Never commit real secrets. Never put service-account credentials in source.
Firebase *client* config is application configuration, not a server secret — it
ships in the bundle by design. Everything genuinely secret goes in Secret
Manager and is referenced by name.

The full breakdown of which value is which is in
[docs/environment-variables.md](docs/environment-variables.md).
