# Gaps — specified but not built

v0.1 is an **extraction**. Everything below was in the intended scope but did
not exist in the source application, so there was nothing to extract. Each entry
records the design decision already taken, so picking one up is implementation
rather than discovery.

Do not assume any of these work. Where a partial mechanism exists, it is noted.

---

## Passwordless email-link sign-in

**Not built.** `AuthProviderId` has no `email_link` member.

Design: add `email_link` to `AuthProviderId`; add
`sendSignInLink(email, continueUrl)` and `completeSignInFromLink(url)` to
`AuthService`. Firebase's `sendSignInLinkToEmail` / `isSignInWithEmailLink` /
`signInWithEmailLink` do the work. The email address must be persisted between
sending and completing (Firebase suggests `localStorage`) and re-prompted for if
the link is opened on another device — that prompt is a real UX requirement, not
an edge case.

Needs: Email link enabled in the console; the continue URL added to authorised
domains.

## Account deletion

**Not built.** No `deleteAccount()` on the port.

Design: a `deleteAccount` callable, not a client call. It must delete the auth
user, the profile document, and every membership — deleting only the auth user
leaves orphaned documents that still satisfy membership checks. Recent
re-authentication is required (`requires_recent_login` is already in the error
vocabulary for this reason).

Decide before building: hard delete, or tombstone. Audit trails and anything
referencing the user by id usually argue for a tombstone plus redaction.

## Custom email action handler

**Not built.**

Design: a hosted route handling Firebase's `mode` parameter
(`verifyEmail`, `resetPassword`, `recoverEmail`) so the flows stay on the
application's own domain with its own branding, instead of Firebase's default
page. Configured in Console → Authentication → Templates → Action URL.

Worth doing before launch: the default page is visibly not your product, at
exactly the moment a user is deciding whether to trust it.

## Expiring one-time invitations

**Not built.** The source application had a static invite code on the member
document — no expiry, no single-use guarantee, and it does not become invalid
once used.

Design: an `invitations/{token}` collection with a high-entropy token, an
`expiresAt`, an intended email, a status, and a role to grant on acceptance.
Two callables — `createInvitation` (checks `members.invite`) and
`acceptInvitation` (validates token, expiry and single use inside a
transaction, then creates the membership).

**Until this lands, treat an invite link as a hint, not a credential.**

## Generic membership and workspace management

**Partially built.** `BaseMembership` and the permission engine exist and are
tested. There are no callables for creating a workspace, adding or removing
members, or changing roles — the source application's versions were too
entangled with its own domain to lift.

Design: `createWorkspace`, `setMemberRoles`, `removeMember`, each gated on a
capability and each writing an audit entry.

## Private file uploads

**Not built.** `templates/storage.rules` denies all client writes, which is the
correct end state — but the callable that should perform validated uploads does
not exist, so there is currently no upload path at all.

Design: an `uploadFile` callable taking base64 or a signed-URL request,
validating declared content type against an allowlist, enforcing a size ceiling,
confirming the caller owns the target path, then writing via the Admin SDK.
Client-side rules cannot check any of this reliably — a client controls the
metadata it declares.

## Mail interface and Resend adapter

**Not built.**

Design: a small interface — `sendInvitation`, `sendBrandedAuthEmail`,
`sendNotification` — with a Resend adapter and a no-op adapter for local runs.
The provider must stay replaceable; no private mail server, ever.

Division of labour already decided: **routine identity email stays on Firebase
Authentication** (verification, reset, email-link, email-change). Resend is for
invitations, branded auth email where Firebase's templates are insufficient, and
product notifications. Each application uses its own Resend credentials and its
own verified sending domain.

## Example application

**Not built.** The packages are proven by unit tests and by their first real
consumer, but there is no minimal standalone app demonstrating a clean install.

This matters more than it sounds: an example is the only thing that proves the
foundation works *detached* from the application it was extracted from, rather
than merely still working inside it.

## Safe patterns for Google APIs and other keys

**Partially documented.** `environment-variables.md` covers classification, and
`firebase-project-setup.md` covers restricting the Firebase key by referrer and
API. There is no worked pattern for calling a third-party Google API from a
callable with a Secret Manager-held key.

## Emulator and rules test harness

**Partially built.** The source application has working rules and contention
tests, but they are written against its own collections and were not generalised
in this pass. `@workbench/testing` does not exist yet.

Design: helpers to boot the emulator, seed a workspace with members at various
roles, and assert allow/deny — so a consuming application tests its rules by
declaring expectations rather than by writing boilerplate.

**Java is required** for the emulator, which is a real constraint in containers
and CI images that do not ship a JRE.
