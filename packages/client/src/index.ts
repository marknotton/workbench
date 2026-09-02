/**
 * @workbench/client — browser-side Firebase wiring.
 *
 * `firebase` is a peer dependency: the application owns the version, and two
 * copies of the SDK in one bundle is a bug that is painful to diagnose.
 */

export {
  createFirebase,
  configFromEnv,
  DEFAULT_FUNCTIONS_REGION,
  DEFAULT_EMULATOR_PORTS,
  type FirebaseConfig,
  type FirebaseHandles,
  type EmulatorPorts,
} from './firebase.js';

export {
  FirebaseAuthService,
  toAuthError,
  DEFAULT_PROFILE_CALLABLE,
  type FirebaseAuthOptions,
  type ProfileCallableInput,
} from './auth.js';

export {
  uploadImage,
  prepareImage,
  isImageUrl,
  ImageError,
  DEFAULT_IMAGE_CONSTRAINTS,
  IMMUTABLE_CACHE,
  type ImageConstraints,
  type UploadResult,
} from './images.js';
