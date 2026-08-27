# Firebase project setup — manual checklist

Everything here needs a human in the Firebase or Google Cloud console. Nothing
in this list can be done from the repository, and nothing should be done on
your behalf without you asking.

Work top to bottom; later steps depend on earlier ones.

---

## 1. Project

- [ ] Create the Firebase project. Note the **project id** — it is permanent.
- [ ] Choose the region. **`europe-west2` (London)** unless you have a reason.
      Keep Firestore, Functions and Storage in the *same* region so a
      transaction never leaves the datacentre.
- [ ] Decide the billing plan. **Cloud Functions require Blaze** (pay-as-you-go).
      Spark cannot deploy functions at all, and this foundation is built around
      callables — nothing works without them.

> **Blaze means a real card against a real project.** Set a budget alert before
> you enable it.

## 2. Web app

- [ ] Add a Web app to the project.
- [ ] Copy the SDK config into `.env.local` (see environment-variables.md).
      All six values are public.
- [ ] In Google Cloud console → APIs & Services → Credentials, restrict the API
      key by **HTTP referrer** (your domains) and by **API** (only what you use).

## 3. Authentication

- [ ] Enable **Email/Password**.
- [ ] Enable **Google**. Set the support email.
- [ ] Leave Facebook and X disabled unless you need them — each needs a
      developer app and review with that provider.
- [ ] Under **Authorized domains**, add every host you will sign in from:
  - `localhost`
  - `<project-id>.web.app` and `<project-id>.firebaseapp.com`
  - your custom domain(s), including any vanity subdomains
- [ ] Set the **password policy** to length-based if the console offers it, to
      match the foundation's own check.

> Missing authorised domains breaks **Google sign-in only** — email/password
> keeps working. If *both* are failing, look at App Check first.

## 4. Google OAuth

- [ ] Google Cloud console → APIs & Services → OAuth consent screen. Set the app
      name, support email and logo. These appear on the Google sign-in sheet, so
      they are user-facing.
- [ ] Add authorised redirect URIs. Firebase creates most of these when you
      enable the provider; verify they match your auth domain.
- [ ] While the consent screen is in **Testing**, only listed test users can sign
      in. Publish it before a real launch.

## 5. Firestore

- [ ] Create the database in **production mode** (locked). Never test mode —
      test mode is world-writable for 30 days.
- [ ] Same region as everything else.
- [ ] Deploy rules from `templates/firestore.rules`, adapted to your collections.
- [ ] Create composite indexes as your queries need them. The emulator and the
      console both tell you which are missing.

## 6. Storage

- [ ] Enable Cloud Storage. Note the bucket name.
- [ ] Deploy rules from `templates/storage.rules`.
- [ ] Configure CORS if the browser uploads or downloads directly.

## 7. App Check

- [ ] Register the Web app with **reCAPTCHA v3**.
- [ ] Put the **site** key in `VITE_APP_CHECK_SITE_KEY`. Public.
- [ ] Put the **secret** key in the Firebase console. It goes nowhere else,
      ever — not in the repo, not in `.env`, not in a message.
- [ ] Register the reCAPTCHA key against every domain you test from —
      reCAPTCHA keys are **domain-scoped**, and a mismatch fails attestation.
- [ ] Enable enforcement for **Cloud Functions**.
- [ ] For local development against the live project, generate a **debug token**
      in the browser console, register it, and revoke it when finished.

> Enforcement is the single most common cause of "sign-in silently fails". Auth
> succeeds, then the profile callable is rejected. If both Google *and*
> email/password break at once, suspect this before suspecting either provider.

## 8. Cloud Functions

- [ ] Confirm Blaze is active.
- [ ] Deploy to the chosen region.
- [ ] **Deploy rules before functions.** A callable writing a collection with no
      rule still works — the Admin SDK bypasses rules — but clients cannot read
      the result back, which looks like a broken feature rather than a missing
      rule.
- [ ] Confirm the client's region matches the deployment.

## 9. Hosting

- [ ] Initialise Hosting; point it at your build output.
- [ ] Add custom domains and verify ownership.
- [ ] **Firebase Hosting has no wildcard custom domains.** Each subdomain is a
      separate setup with its own certificate. Plan addressing accordingly — a
      path segment costs nothing and works immediately.
- [ ] If DNS is at an external provider, add the records it gives you and allow
      for propagation.
- [ ] Add every new domain to Authentication → Authorized domains **and** to the
      reCAPTCHA key. Forgetting is the usual cause of "works on
      `.web.app`, broken on the real domain".

## 10. Secret Manager

Only for genuinely secret values — not Firebase client config.

- [ ] Enable the Secret Manager API.
- [ ] Create each secret; grant the functions service account access.
- [ ] Reference by name at deploy time. Never commit a value.

## 11. Resend — only if used

Not built yet; see gaps.md. When it is:

- [ ] Create the account and verify a sending domain.
- [ ] Add the DNS records it provides (SPF, DKIM, and DMARC if you use it).
- [ ] Store the API key in **Secret Manager**.
- [ ] Keep routine identity emails (verification, reset, email-link) on Firebase
      Authentication. Use Resend for invitations, branded auth email and product
      notifications.

## 12. Service accounts

- [ ] Only if you need local admin scripts.
- [ ] Generate the key, store it **outside the repository**, reference it with
      `GOOGLE_APPLICATION_CREDENTIALS`.
- [ ] A service-account key grants full admin access and **bypasses Security
      Rules entirely**. Treat it like a root password.
- [ ] Rotate it if it is ever committed, pasted or emailed. Assume the worst.

---

## Order that avoids rework

1. Project + billing
2. Web app + API key restrictions
3. Authentication providers + authorised domains
4. Firestore + rules
5. Storage + rules
6. App Check (site key, secret, enforcement)
7. Functions
8. Hosting + domains → then revisit 3 and 6 with the new domains
