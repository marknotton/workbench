# Security

## What we are defending against

- Someone driving the callable surface with a script rather than the app.
- A signed-in user reaching another user's or another workspace's data.
- A user escalating their own privileges (setting `emailVerified`, granting
  themselves a role).
- Enumeration — discovering which accounts, workspaces or resources exist.
- Replay: a retried or double-submitted command taking effect twice.
- Secrets escaping into the repository or a bundle.

Explicitly **not** in scope for v0.1: DDoS, sophisticated account-takeover
detection, and anything requiring paid abuse tooling.

## The rules that follow

### Clients never write

Security Rules allow scoped reads and deny **every** client write. Mutations go
through callables, which are the only place a role can be checked, a payload
validated and a counter kept consistent inside a transaction.

This also makes the audit trail complete by construction: no path to the data
avoids the code that records the change.

### The token is the authority, never the request body

A client can put anything in a request. It cannot forge an ID token. So email,
verification state and provider list are read from `request.auth.token` and
never from `request.data`. `claimsFrom()` exists to make that the easy path.

### Two App Check gates

`enforceAppCheck: true` rejects unattested calls at the platform. The in-handler
`requireAppCheck()` rejects them again. One configuration mistake should not
open the whole database.

The local opt-out is a **per-application** environment variable, read only from
`.env.local`, which `firebase deploy` ignores.

### Never confirm whether an account exists

Password reset returns the same result whether or not the address is known. A
form that says "no such user" is an account-enumeration oracle.

The same reasoning applies to alias lookups: they are gettable **by key** and
never listable, so an invite link resolves for a non-member without exposing the
set of workspaces that exist.

### Suspension outranks roles

`memberCan()` refuses a suspended or removed membership regardless of what roles
it holds. Revoking access must never require editing a role list — that is a
step someone forgets under pressure.

### Length-based passwords

Minimum ten characters, no character-class rules. Composition rules push people
towards `Passw0rd!`, which is shorter, more predictable and easier to crack than
a long memorable phrase. Leading/trailing whitespace and single repeated
characters are rejected because both are nearly always mistakes.

## Public, server-only, deploy-only

Firebase client configuration — including the API key — is **public**. It ships
in the bundle by design. It identifies the project; it does not authorise
anything. Access is decided by rules, App Check and the callables.

Restrict the key by HTTP referrer and API anyway: it limits what a copied key
can be aimed at. That is defence in depth, not the defence.

The full classification is in [environment-variables.md](environment-variables.md).

## Service-account keys

A service-account key grants full admin access and **bypasses Security Rules
entirely**. It is the one credential in this system that is genuinely
catastrophic to leak.

- Never in source, never in the working tree, never in a message.
- Referenced by path through `GOOGLE_APPLICATION_CREDENTIALS`, stored elsewhere.
- `.gitignore` covers the obvious filenames as a backstop only.
- If one is ever exposed, rotate it. Do not reason about whether it was noticed.

## Known weaknesses in v0.1

| Weakness | Status |
|---|---|
| No account deletion — no self-service way to exercise erasure | Gap. See gaps.md. |
| No upload validation, because uploads are not built | Gap. Storage rules deny all writes, so nothing is exposed meanwhile. |
| No rate limiting beyond Firebase's own on auth endpoints | Accepted for v0.1. |
| Rules tests require Java and cannot run in every environment | Documented; the offline suite is unaffected. |
| Invitations have no expiry or single-use guarantee | Gap. Do not treat an invite link as a credential until this lands. |
