# Environment variables

Every variable, and — the part that actually matters — whether it is public,
server-only or deploy-only.

## Classification

| Class | Meaning | Where it may appear |
|---|---|---|
| **Public** | Ships in the JS bundle. Every visitor can read it. | `.env.local`, committed examples, the browser |
| **Server-only** | Read by Cloud Functions. Never reaches a browser. | Functions `.env.local` (local), Secret Manager (deployed) |
| **Deploy-only** | Used by tooling at deploy time. Never at runtime. | CI configuration, your shell |

The mistake this table exists to prevent is treating Firebase client config as a
secret. It is not one. It is public by design, and trying to hide it produces
elaborate workarounds that protect nothing.

## Client — all PUBLIC

| Variable | Required | Notes |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Yes | Public. An identifier, not an authorisation. Restrict by referrer and API anyway. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | Defaults to `<projectId>.firebaseapp.com`. Set explicitly if you use a custom auth domain. |
| `VITE_FIREBASE_PROJECT_ID` | Yes | |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | Defaults to `<projectId>.firebasestorage.app`. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | |
| `VITE_FIREBASE_APP_ID` | Yes | |
| `VITE_FIREBASE_REGION` | No | Callable region. Must match deployment or every call 404s. Defaults to `europe-west2`. |
| `VITE_APP_CHECK_SITE_KEY` | No | reCAPTCHA v3 **site** key. Public. Absent ⇒ App Check skipped rather than half-configured. |
| `VITE_APP_CHECK_DEBUG_TOKEN` | No | Reaches a live project from a dev machine with enforcement on. **Never commit a real value.** Revoke after use. |
| `VITE_USE_EMULATORS` | No | `true` for the Emulator Suite. |

### Why the API key being public is fine

It identifies the project; it does not authorise anything. Access is decided by
Security Rules, App Check and the callables. Restricting it by HTTP referrer and
by API in the Google Cloud console is still worth doing — it limits what a
copied key can be pointed at — but it is defence in depth, not the defence.

## Server-only

| Variable | Notes |
|---|---|
| `<APP>_ALLOW_UNVERIFIED` | `true` skips App Check. **Local emulator only.** Name it per application. `firebase deploy` ignores `.env.local`, so a deployed function never sees it. |
| `RESEND_API_KEY` | Only if using the Resend adapter — **not built yet**, see gaps.md. Secret Manager, never a file. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to a service-account key, for local admin scripts only. Keep the file **outside** the repository. |

## Deploy-only

| Variable | Notes |
|---|---|
| `FIREBASE_TOKEN` / CI credentials | Deploy authentication. CI secret store only. |
| `FIREBASE_PROJECT` | Which project a script targets. Always name it explicitly rather than relying on whichever account is active. |

## File layout, and one trap

Vite loads `.env.local` in **every** mode and ranks it **above**
`.env.production`. A mode flag there silently overrides the production build —
with no error and a working-looking site.

| File | Holds | Committed |
|---|---|---|
| `.env.local` | Connection config only | No |
| `.env.development.local` | What `yarn dev` runs against | No |
| `.env.production` | What `yarn build` produces | **Yes** — no secrets in it |
| `packages/functions/.env.local` | Local App Check opt-out | No |

Pinning mode flags in a committed `.env.production` means a deploy cannot
accidentally ship the wrong configuration.

## Secrets

- Never commit a real secret.
- Never put a service-account key in source, or anywhere in the working tree.
- Never paste a secret into a chat, an issue or a commit message.
- Deployed functions read secrets from **Secret Manager**, referenced by name.
- Use separate credentials per application wherever practical, so revoking one
  does not take down the others.

`.gitignore` covers the obvious service-account filenames as a backstop. A key
that never enters the working tree cannot be committed by a typo, which is a
better guarantee than any pattern list.
