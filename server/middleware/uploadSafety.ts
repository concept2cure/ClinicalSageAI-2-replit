/**
 * Shared post-upload safety helper.
 *
 * One reusable gate that runs the two content-level defenses every
 * untrusted upload needs AFTER multer has parsed the file:
 *
 *   1. Magic-byte signature verification — confirm the actual bytes
 *      match the declared MIME type (multer's `file.mimetype` is
 *      attacker-controlled, derived from the request Content-Type).
 *      Delegates to {@link verifyFileSignature}.
 *
 *   2. Antivirus scan — stream the bytes to clamd. Delegates to
 *      {@link scanBuffer} (the INSTREAM client in utils/virusScan).
 *
 * This module does NOT reimplement either check; it composes the two
 * existing utilities and adds a single, important policy decision:
 * AV is FAIL-CLOSED in production.
 *
 * ── Fail-closed AV policy ──
 * The underlying scanner fails OPEN: when CLAMAV_HOST is unset or the
 * daemon is unreachable it returns `{ scanned: false, clean: true }`
 * so dev/CI work without infra. That posture is unsafe for a
 * regulated production deployment — a misconfigured/missing scanner
 * would silently wave malware through. So here, when
 * `NODE_ENV === 'production'` and the scan did not actually run
 * (`scanned === false`), we REJECT the upload (503). In dev/test we
 * preserve the permissive behavior: log a warning and allow.
 *
 * Usage (memory storage — buffer in hand):
 *   import { assertUploadSafe, UploadSafetyError } from '../middleware/uploadSafety';
 *   try {
 *     await assertUploadSafe(req.file.buffer, req.file.mimetype, req.file.originalname);
 *   } catch (err) {
 *     if (err instanceof UploadSafetyError) return res.status(err.status).json(err.body);
 *     throw err;
 *   }
 *
 * Usage (disk storage — path on disk): pass the path string instead of
 * a Buffer; the helper reads the file. On rejection the caller is
 * responsible for unlinking the persisted temp file if desired.
 *
 * @module server/middleware/uploadSafety
 */

import { promises as fs } from 'node:fs';
import { verifyFileSignature } from '../utils/fileSignature';
import { scanBuffer } from '../utils/virusScan';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('upload-safety');

/** Structured failure codes returned to the caller / client. */
export type UploadSafetyCode =
  | 'FILE_SIGNATURE_MISMATCH'
  | 'FILE_SCAN_REJECTED'
  | 'FILE_SCAN_UNAVAILABLE';

/**
 * Thrown by {@link assertUploadSafe} when an upload must be rejected.
 * Carries the HTTP status and a client-safe JSON body so handlers can
 * uniformly translate it into a response without leaking scanner
 * internals (signature names, scanner reachability detail).
 */
export class UploadSafetyError extends Error {
  readonly status: number;
  readonly code: UploadSafetyCode;
  readonly body: { error: string; code: UploadSafetyCode };

  constructor(status: number, code: UploadSafetyCode, message: string) {
    super(message);
    this.name = 'UploadSafetyError';
    this.status = status;
    this.code = code;
    this.body = { error: message, code };
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Run signature verification + AV scan on an uploaded file.
 *
 * @param input    The file bytes (Buffer) OR a filesystem path to the
 *                 persisted upload (string). Path inputs are read into
 *                 memory for the checks.
 * @param declaredMime The MIME type multer derived from the request.
 * @param filename The original filename (for logging only).
 *
 * @throws {UploadSafetyError} 400 on signature mismatch, 400 on a
 *   positive virus hit, 503 in production when no scan could run.
 *   Resolves (no throw) on success or — in dev/test — when the scan
 *   was bypassed.
 */
export async function assertUploadSafe(
  input: Buffer | string,
  declaredMime: string,
  filename: string
): Promise<void> {
  let buffer: Buffer;
  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else {
    buffer = await fs.readFile(input);
  }

  if (!buffer || buffer.length === 0) {
    // An empty upload can't carry a payload; treat it as a signature
    // mismatch rather than silently passing (verifyFileSignature also
    // rejects empty buffers).
    throw new UploadSafetyError(
      400,
      'FILE_SIGNATURE_MISMATCH',
      'File content does not match declared type'
    );
  }

  // 1) Magic-byte signature check.
  const sig = verifyFileSignature(buffer, declaredMime);
  if (!sig.ok) {
    logger.warn('Upload rejected by signature check', {
      filename,
      declaredMime,
      reason: sig.reason,
    });
    throw new UploadSafetyError(
      400,
      'FILE_SIGNATURE_MISMATCH',
      'File content does not match declared type'
    );
  }

  // 2) Antivirus scan.
  const scan = await scanBuffer(buffer);

  if (!scan.clean) {
    // Real hit. Do NOT echo the signature name to the client.
    logger.warn('Upload rejected by virus scanner', {
      filename,
      declaredMime,
      signature: scan.signature,
    });
    throw new UploadSafetyError(
      400,
      'FILE_SCAN_REJECTED',
      'File rejected by content scan'
    );
  }

  if (!scan.scanned) {
    // Scanner did not actually run (not configured / unreachable /
    // unparseable). In production this is fail-CLOSED: reject so a
    // missing scanner can't silently admit malware. In dev/test we
    // preserve the permissive behavior so local/CI work without a
    // clamd daemon.
    if (isProduction()) {
      logger.error('Upload rejected: virus scanner unavailable in production', {
        filename,
        declaredMime,
        reason: scan.reason,
      });
      throw new UploadSafetyError(
        503,
        'FILE_SCAN_UNAVAILABLE',
        'File scanning is temporarily unavailable; upload rejected'
      );
    }
    logger.warn('Virus scan bypassed (non-production)', {
      filename,
      reason: scan.reason,
    });
  }
}
