import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/**
 * Upload configuration for profile photos.
 *
 * Constraints enforced here:
 *  - max 5 MB per file
 *  - only image/jpeg, image/png, image/webp (by declared MIME type AND extension)
 *  - max 5 photos per user (enforced in the controller before the row is inserted)
 *
 * Because a client can spoof the Content-Type header, the actual file bytes are
 * additionally sniffed for a JPEG/PNG/WebP magic signature after the write.
 * Files that fail that check are deleted from disk and rejected with a 400.
 */

export const MAX_PHOTOS_PER_USER = 5;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

export const UPLOAD_ROOT = env.UPLOAD_DIR;
export const UPLOAD_DIR = path.join(UPLOAD_ROOT, 'photos');
export const UPLOAD_URL_PREFIX = '/uploads/photos';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Deterministic, collision-resistant filename. The original user-supplied name
 * is discarded entirely so no path traversal or odd characters can reach the disk.
 */
const buildFilename = (mimetype: string): string => {
  const ext =
    mimetype === 'image/png' ? '.png' : mimetype === 'image/webp' ? '.webp' : '.jpg';
  const unique = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  return `${unique}${ext}`;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, buildFilename(file.mimetype));
  },
});

const fileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const declaredType = (file.mimetype || '').toLowerCase();
  const extension = path.extname(file.originalname || '').toLowerCase();

  if (!ALLOWED_MIME_TYPES.includes(declaredType as (typeof ALLOWED_MIME_TYPES)[number])) {
    cb(
      AppError.badRequest(
        `Unsupported image type "${file.mimetype}". Allowed types: JPEG, PNG, WebP.`
      )
    );
    return;
  }

  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    cb(
      AppError.badRequest(
        `Unsupported file extension "${extension}". Allowed extensions: .jpg, .jpeg, .png, .webp.`
      )
    );
    return;
  }

  cb(null, true);
};

export const photoUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 5,
  },
});

/** Backwards-compatible alias used by the route definitions. */
export const upload = photoUpload;

interface MagicSignature {
  mime: string;
  bytes: number[];
  offset?: number;
  ascii?: string;
  asciiOffset?: number;
}

const SIGNATURES: MagicSignature[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WebP: "RIFF" .... "WEBP"
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], ascii: 'WEBP', asciiOffset: 8 },
];

/**
 * Verifies the on-disk bytes match a real JPEG/PNG/WebP header.
 * Returns the detected mime type, or null when the file is not a genuine image.
 */
export const detectImageMime = (filePath: string): string | null => {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    if (bytesRead < 4) return null;

    for (const sig of SIGNATURES) {
      const matchesPrefix = sig.bytes.every((byte, i) => buffer[i] === byte);
      if (!matchesPrefix) continue;

      if (sig.ascii && sig.asciiOffset !== undefined) {
        const end = sig.asciiOffset + sig.ascii.length;
        if (bytesRead < end) continue;
        const actual = buffer.subarray(sig.asciiOffset, end).toString('ascii');
        if (actual !== sig.ascii) continue;
      }

      return sig.mime;
    }

    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
};

/**
 * Removes a file from disk, ignoring "already gone" errors.
 */
export const safeUnlink = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err: any) {
    console.error('[UploadService] Failed to delete file:', filePath, err?.message);
  }
};

/**
 * Validates an uploaded file's real bytes and returns its public URL.
 * Deletes the file and throws a 400 when the content is not a genuine image.
 */
export const finalizeUploadedImage = (file: Express.Multer.File): string => {
  const detected = detectImageMime(file.path);

  if (!detected) {
    safeUnlink(file.path);
    throw AppError.badRequest(
      'The uploaded file is not a valid image. Allowed types: JPEG, PNG, WebP.'
    );
  }

  return `${UPLOAD_URL_PREFIX}/${file.filename}`;
};

/**
 * Resolves a stored public URL (e.g. "/uploads/photos/abc.jpg") to an absolute
 * filesystem path, refusing anything that escapes the uploads directory.
 */
export const resolveUploadPath = (url: string): string | null => {
  if (typeof url !== 'string' || !url.startsWith(`${UPLOAD_URL_PREFIX}/`)) return null;

  const filename = url.slice(UPLOAD_URL_PREFIX.length + 1);
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return null;
  }

  const resolved = path.join(UPLOAD_DIR, filename);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) return null;

  return resolved;
};
