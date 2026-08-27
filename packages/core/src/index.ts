/**
 * @workbench/core — contracts with no runtime dependencies.
 *
 * Nothing here imports Firebase, React, or any I/O library. That is what lets
 * the same types be used by a browser bundle, a Cloud Function and a test
 * without dragging a platform along with them.
 */

export * from './identity.js';
export * from './auth.js';
export * from './permissions.js';
