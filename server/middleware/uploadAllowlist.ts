/**
 * Reusable upload allowlist — a multer `fileFilter` factory that admits only an
 * approved set of file types and always rejects dangerous executable/script
 * types. Provides one consistent control for AI/document upload endpoints.
 *
 * This is the type-allowlist layer. For untrusted content also verify the file
 * bytes (magic number) and scan for malware — see server/utils/fileSignature
 * and server/utils/virusScan, used by server/routes/chat/upload.ts.
 *
 * Usage:
 *   import multer from 'multer';
 *   import { makeUploadFileFilter } from '../middleware/uploadAllowlist';
 *   const upload = multer({ storage: multer.memoryStorage(),
 *     limits: { fileSize: 25 * 1024 * 1024 },
 *     fileFilter: makeUploadFileFilter() });
 *
 * @module server/middleware/uploadAllowlist
 */

import type { Request, RequestHandler } from 'express';
import multer from 'multer';

export interface UploadAllowlistOptions {
  /** Allowed lowercase extensions (no dot). Defaults to the regulatory doc set. */
  extensions?: string[];
  /** Additional exact MIME types to allow. */
  mimeTypes?: string[];
  /** MIME prefixes to allow (e.g. 'image/'). */
  allowMimePrefixes?: string[];
}

/** Default allowlist: documents, spreadsheets, structured data, and images. */
export const DEFAULT_ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'tsv', 'txt', 'md', 'rtf',
  'html', 'htm', 'json', 'xml', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff',
];

const DEFAULT_ALLOWED_MIME_PREFIXES = ['image/'];

/** Always rejected, even if added to an allowlist by mistake. */
export const BLOCKED_EXTENSIONS = [
  'exe', 'sh', 'bat', 'cmd', 'com', 'jar', 'dll', 'msi', 'ps1', 'scr', 'bin',
  'app', 'js', 'mjs', 'cjs', 'php', 'py', 'rb', 'pl', 'vbs', 'wsf',
];

export function extensionOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : '';
}

/** True when the file is allowed by the (default or provided) allowlist. */
export function isAllowedUpload(
  originalname: string,
  mimetype: string,
  opts: UploadAllowlistOptions = {}
): boolean {
  const ext = extensionOf(originalname);
  if (ext === '' || BLOCKED_EXTENSIONS.includes(ext)) return false;

  const extensions = opts.extensions ?? DEFAULT_ALLOWED_EXTENSIONS;
  if (extensions.includes(ext)) return true;

  if (opts.mimeTypes?.includes(mimetype)) return true;

  const prefixes = opts.allowMimePrefixes ?? DEFAULT_ALLOWED_MIME_PREFIXES;
  return prefixes.some(p => mimetype.startsWith(p));
}

type MulterFile = { originalname: string; mimetype: string };
type FileFilterCb = (error: Error | null, acceptFile?: boolean) => void;

/** Build a multer `fileFilter` enforcing the allowlist. */
export function makeUploadFileFilter(opts: UploadAllowlistOptions = {}) {
  return (_req: Request, file: MulterFile, cb: FileFilterCb): void => {
    if (isAllowedUpload(file.originalname, file.mimetype, opts)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.originalname}`));
    }
  };
}

/**
 * Wrap a multer receiver so its outcomes are answered as the 4xx they are:
 * `LIMIT_FILE_SIZE` → 413, a `fileFilter` refusal → 415, any other multer
 * complaint → 400. Left to `next(err)` each became a 500 at the generic
 * handler, and every router that noticed wrote its own copy of this mapping
 * (chat, vault-ingest, stability). One place, one shape
 * (`{ error, code }`), so a client can tell "too large" from "wrong type".
 */
export function receiveUpload(receiver: RequestHandler, opts: { maxBytes?: number } = {}): RequestHandler {
  return (req, res, next) => {
    receiver(req, res, (err?: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          const limit = opts.maxBytes ? ` of ${Math.round(opts.maxBytes / (1024 * 1024))} MB` : '';
          return res.status(413).json({ error: `The file exceeds the upload limit${limit}.`, code: 'FILE_TOO_LARGE' });
        }
        return res.status(400).json({ error: `Upload rejected: ${err.message}`, code: 'UPLOAD_INVALID' });
      }
      if (err instanceof Error) {
        // A fileFilter refuses with its own Error; nothing else reaches here.
        return res.status(415).json({ error: err.message, code: 'UNSUPPORTED_FILE_TYPE' });
      }
      return next(err);
    });
  };
}
