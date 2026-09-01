/**
 * Firebase client setup.
 *
 * One place that knows about environment variables, emulators and App Check.
 * Everything else takes the resulting handles as arguments, which keeps the
 * rest of an application testable without a Firebase project.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;

  /**
   * reCAPTCHA v3 **site** key for App Check. Public — it ships in the bundle,
   * by design. The matching secret key lives only in the Firebase console.
   *
   * App Check is skipped entirely when this is absent, rather than being
   * half-configured: a broken attestation fails every call with a confusing
   * error, which is worse than not enabling it.
   */
  appCheckSiteKey?: string;

  /**
   * Debug token, to reach a live project from a developer machine while App
   * Check is enforced. Register it in the console against this app; revoke it
   * when you are done. Useless on its own.
   */
  appCheckDebugToken?: string;

  /** Region the callables are deployed to. The client must match. */
  region?: string;

  useEmulators?: boolean;
  emulatorPorts?: Partial<EmulatorPorts>;
}

export interface EmulatorPorts {
  auth: number;
  firestore: number;
  functions: number;
  storage: number;
}

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  storage: FirebaseStorage;
}

/**
 * Where callables are deployed unless an application says otherwise.
 *
 * Region is a data-residency decision, so it belongs to the application. This
 * default only exists so a UK-based project need not repeat itself.
 */
export const DEFAULT_FUNCTIONS_REGION = 'europe-west2';

export const DEFAULT_EMULATOR_PORTS: EmulatorPorts = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
  storage: 9199,
};

export function createFirebase(config: FirebaseConfig): FirebaseHandles {
  const app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });

  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, config.region ?? DEFAULT_FUNCTIONS_REGION);
  const storage = getStorage(app);

  if (config.useEmulators) {
    const ports = { ...DEFAULT_EMULATOR_PORTS, ...config.emulatorPorts };
    connectAuthEmulator(auth, `http://127.0.0.1:${ports.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', ports.firestore);
    connectFunctionsEmulator(functions, '127.0.0.1', ports.functions);
    connectStorageEmulator(storage, '127.0.0.1', ports.storage);
  } else if (config.appCheckSiteKey) {
    // Set before initialiseAppCheck, or the SDK has already decided.
    if (config.appCheckDebugToken) {
      // `true` (the boolean) tells the SDK to mint a token and log it, which
      // is how you obtain one to register. Any string is used as an existing
      // token. Environment variables are always strings, so the literal
      // "true" has to be coerced or it is treated as a token and silently
      // fails attestation — leaving you with nothing to register.
      const debugToken: string | boolean =
        config.appCheckDebugToken === 'true' ? true : config.appCheckDebugToken;

      (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).
        FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(config.appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  return { app, auth, db, functions, storage };
}

/**
 * Read configuration from a bundler's environment object.
 *
 * Returns `null` when the project is unconfigured, so an application can fall
 * back to a mock implementation rather than crash on a missing key. Every value
 * read here is public: these ship in the JS bundle and every visitor sees them.
 * Security comes from Security Rules and App Check, not from hiding them.
 */
export function configFromEnv(env: Record<string, string | undefined>): FirebaseConfig | null {
  const apiKey = env.VITE_FIREBASE_API_KEY;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;

  return {
    apiKey,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: env.VITE_FIREBASE_APP_ID ?? '',
    ...(env.VITE_APP_CHECK_SITE_KEY ? { appCheckSiteKey: env.VITE_APP_CHECK_SITE_KEY } : {}),
    ...(env.VITE_APP_CHECK_DEBUG_TOKEN
      ? { appCheckDebugToken: env.VITE_APP_CHECK_DEBUG_TOKEN }
      : {}),
    ...(env.VITE_FIREBASE_REGION ? { region: env.VITE_FIREBASE_REGION } : {}),
    useEmulators: env.VITE_USE_EMULATORS === 'true',
  };
}
