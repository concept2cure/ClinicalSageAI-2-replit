/**
 * GET /api/mdx/gateways/transmittals/:id/sent-package — the exact bytes a
 * transmittal sent, registered by the canonical MDX transmittal router
 * (mdx-submission-gateway.ts) beside its acknowledgement download.
 *
 * The guarded transmit keeps the package before the wire (2026-10-29, W5/D7,
 * sent-package-archive.ts). This reads it under the project's own access,
 * verifies it against the digest the row records as sent, and records the
 * download before delivering it, as the acknowledgement is.
 */
import type { Request, Response } from 'express';
import { pool } from '../db';
import { clientError, orgRequired, serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../services/export/governedExportConsequence';
import { readSentPackage, SentPackageReadRefusal } from '../services/submission-gateways/sent-package-read';
import { ProgramReadAccessError } from '../services/c2c/current-program-access';

const log = createScopedLogger('mdx-sent-package');

function positiveId(raw: unknown): number | null {
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function downloadSentPackage(req: Request, res: Response): Promise<Response | void> {
  const organizationId = positiveId((req as any).user?.organizationId);
  const userId = positiveId((req as any).user?.id);
  const transmittalId = positiveId(req.params.id);
  if (organizationId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'A signed-in actor is required.');
  if (transmittalId === null) return clientError(res, 422, 'A positive transmittal identifier is required.');
  try {
    const kept = await readSentPackage(pool, { organizationId, userId, transmittalId });
    await sendAuditedDownload(res, {
      organizationId,
      userId,
      sourceType: 'export_zip',
      backendRoute: '/api/mdx/gateways/transmittals/:id/sent-package',
      resourceType: 'submission_transmittal_sent_package',
      resourceId: String(transmittalId),
      programUuid: kept.programId,
      filename: kept.record.filename,
      mimeType: 'application/zip',
      buffer: kept.bytes,
      metadata: { storageVersionId: kept.record.storageVersionId, provider: kept.record.provider },
    });
  } catch (err: unknown) {
    return sentPackageFailure(res, err);
  }
}

/** Why the kept package was not handed back. A 503 answers a fixed sentence. */
function sentPackageFailure(res: Response, err: unknown): Response {
  if (err instanceof SentPackageReadRefusal || err instanceof ProgramReadAccessError) {
    if (err.status === 503) {
      log.error('sent-package-unavailable', { code: err.code, message: err.message });
      return res.status(503).json({
        error: 'The kept package could not be read here. Nothing was downloaded. Try again.',
        details: { code: err.code },
      });
    }
    return res.status(err.status).json({ error: err.message, details: { code: err.code } });
  }
  if (isUnauditedExportRefusal(err)) {
    return res.status(503).json({
      error: 'Package not delivered',
      detail: 'Its record could not be written, so the file was not sent. Try again.',
    });
  }
  return serverError(res, log, 'sent-package', err);
}
