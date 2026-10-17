/** Bounded signed-MDN upload, used by the canonical MDX transmittal route. */
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { getTenantScope, runWithTenantScope } from '../db/tenantStore';
import { clientError, ok, orgRequired, serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import { ingestFdaAs2Receipt, FdaAs2ReceiptRefusal } from '../services/submission-gateways/fda-esg-receipts';
import { makeUploadFileFilter } from '../middleware/uploadAllowlist';
import { assertUploadSafe, UploadSafetyError } from '../middleware/uploadSafety';

const log = createScopedLogger('mdx-as2-receipt');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 1, fieldSize: 512, parts: 2 },
  fileFilter: makeUploadFileFilter({ extensions: ['mdn', 'eml', 'mime', 'p7m', 'p7s', 'der', 'txt'], mimeTypes: [] }),
});

/** Multipart parsing may drop ALS continuity; restore only the scope already granted. */
export function acceptAs2Receipt(req: Request, res: Response, next: NextFunction): void {
  const scope = getTenantScope();
  upload.single('receipt')(req, res, (err: unknown) => {
    if (err) {
      const status = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({ error: status === 413 ? 'The agency receipt must be 8 MB or smaller.' : 'Upload one agency receipt and its original Content-Type header.' });
      return;
    }
    if (scope) runWithTenantScope(scope, next); else next();
  });
}

function positiveId(raw: unknown): number | null {
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function receiptContentType(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value && value.length <= 512 && !/[\r\n\0]/.test(value) ? value : null;
}

/** The server verifies the outcome; the uploader never chooses a disposition or ACK stage. */
export async function recordAs2Receipt(req: Request, res: Response): Promise<Response> {
  const organizationId = positiveId((req as any).user?.organizationId);
  const userId = positiveId((req as any).user?.id);
  const transmittalId = positiveId(req.params.id);
  if (organizationId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'A signed-in actor is required.');
  if (transmittalId === null) return clientError(res, 422, 'A positive transmittal identifier is required.');
  const contentType = receiptContentType(req.body?.contentType);
  if (!req.file?.buffer?.length || contentType === null) {
    return clientError(res, 400, 'Upload the original signed agency receipt and its original Content-Type header.');
  }
  try {
    const receiptMime = contentType.split(';')[0].trim().toLowerCase();
    // Detached signed MIME is text framing; opaque SignedData is binary DER.
    // Neither upload-part MIME nor filename can bypass the actual CMS verifier.
    await assertUploadSafe(req.file.buffer, receiptMime === 'multipart/signed' ? 'text/plain' : receiptMime, req.file.originalname);
    const result = await ingestFdaAs2Receipt({ organizationId, userId, transmittalId, body: req.file.buffer, contentType });
    return ok(res, result);
  } catch (err) {
    if (err instanceof UploadSafetyError) return res.status(err.status).json(err.body);
    if (err instanceof FdaAs2ReceiptRefusal) return clientError(res, err.status, err.message, { code: err.code });
    return serverError(res, log, 'record', err);
  }
}
