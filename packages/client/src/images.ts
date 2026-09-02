/**
 * Image uploads.
 *
 * Two jobs, and the first matters more than it looks: **shrink before
 * uploading**. A photograph straight off a phone is 3–5 MB, and every one of
 * those megabytes is paid for twice — once to store and again on every
 * download, by every viewer, forever. Resizing to something a browser will
 * actually display turns that into roughly a hundred kilobytes. It is the
 * single largest lever on what this costs and how fast it feels, and it has to
 * happen client-side because by the time bytes reach the server they have
 * already crossed the expensive part.
 *
 * The second job is uploading with metadata that lets browsers cache
 * aggressively — see `IMMUTABLE_CACHE` below for why that forces a new
 * filename each time.
 */

import {
  getDownloadURL,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage';

export interface ImageConstraints {
  /** Rejected above this, before any processing. Guards against a video. */
  maxSourceBytes: number;
  /** Longest edge after resizing. */
  maxDimension: number;
  /** Source types accepted. */
  accept: readonly string[];
  /** WebP quality, 0–1. */
  quality: number;
}

export const DEFAULT_IMAGE_CONSTRAINTS: ImageConstraints = {
  // Generous for a phone photo, small enough that an accidental video fails
  // immediately rather than after a long upload.
  maxSourceBytes: 25 * 1024 * 1024,
  maxDimension: 1200,
  accept: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  quality: 0.82,
};

/**
 * A year, immutable.
 *
 * Safe only because every upload gets a fresh filename. Overwriting a path
 * that has been served with this header leaves browsers showing the old image
 * until the cache expires — which, at a year, is indistinguishable from the
 * upload having silently failed.
 */
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageError';
  }
}

/**
 * Resize and re-encode, returning WebP.
 *
 * `imageOrientation: 'from-image'` matters: without it, a photo taken in
 * portrait on a phone arrives rotated, because the pixels are landscape and
 * the rotation lives in EXIF metadata that the canvas discards.
 */
export async function prepareImage(
  file: File,
  constraints: ImageConstraints = DEFAULT_IMAGE_CONSTRAINTS,
): Promise<Blob> {
  if (!constraints.accept.includes(file.type)) {
    throw new ImageError(
      `That is a ${file.type || 'unknown'} file. Use ${constraints.accept
        .map((type) => type.replace('image/', ''))
        .join(', ')}.`,
    );
  }

  if (file.size > constraints.maxSourceBytes) {
    const limit = Math.round(constraints.maxSourceBytes / 1024 / 1024);
    throw new ImageError(`That image is larger than ${limit} MB.`);
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  try {
    const scale = Math.min(
      1,
      constraints.maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new ImageError('This browser cannot process images.');
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', constraints.quality),
    );
    if (!blob) throw new ImageError('Could not process that image.');
    return blob;
  } finally {
    // Frees the decoded bitmap immediately rather than waiting for GC, which
    // matters when someone picks several large photos in a row.
    bitmap.close();
  }
}

/** Unguessable, and unique per upload so the immutable cache header is safe. */
function uniqueName(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${Date.now().toString(36)}-${suffix}.webp`;
}

export interface UploadResult {
  /** Public download URL, for storing against the record. */
  url: string;
  /** Full storage path, should the file ever need deleting. */
  path: string;
  /** Final size, so the interface can show what was achieved. */
  bytes: number;
}

/**
 * Resize, then upload into `directory`.
 *
 * The filename is generated rather than taken from the file: a person's
 * filename may contain anything, and reusing it would both leak what they
 * called it and risk collisions between two people uploading `photo.jpg`.
 */
export async function uploadImage(
  storage: FirebaseStorage,
  directory: string,
  file: File,
  constraints: ImageConstraints = DEFAULT_IMAGE_CONSTRAINTS,
): Promise<UploadResult> {
  const blob = await prepareImage(file, constraints);
  const path = `${directory.replace(/\/+$/, '')}/${uniqueName()}`;
  const target = ref(storage, path);

  await uploadBytes(target, blob, {
    contentType: 'image/webp',
    cacheControl: IMMUTABLE_CACHE,
  });

  return { url: await getDownloadURL(target), path, bytes: blob.size };
}

/**
 * Whether a stored value is a real image rather than a placeholder.
 *
 * Applications commonly seed an emoji into the same field before anyone has
 * uploaded anything, so the renderer has to tell the two apart.
 */
export function isImageUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  return value.startsWith('http://') || value.startsWith('https://');
}
