/**
 * GET /api/mdx/qms/documents/:id/controlled-copy?format=pdf|docx — the
 * controlled copy of a QMS controlled document's version in force (MR-12 Stage
 * 8 step 3; server/services/qms/controlled-copy.ts), mounted by mdx-qms.ts.
 *
 * The reader must be able to read that version's authored content, as the
 * version history requires. The copy is delivered through the audited download
 * (sendAuditedDownload): the record of who was issued which version, when, and
 * the delivered bytes' SHA-256 is written before a byte is sent, and a copy
 * whose record did not persist is not delivered.
 *
 * @module server/routes/mdx-qms-controlled-copy
 */
import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { clientError, orgRequired, serverError, notFoundInTenant } from '../lib/api-response';
import { requestPgClient } from '../db/requestDb';
import { getOrgId, getUserId } from './mdx-qms-context';
import { authoringPrincipalFromRequest, resolveAuthoringDocumentScope, decideAuthoringPermission } from '../services/authoring/authoring-permissions';
import { renderQmsControlledCopy, QmsControlledCopyRefused, type ControlledCopyFormat } from '../services/qms/controlled-copy';
import { AuthoringPdfRenderingError } from '../services/authoring/authoring-export';
import { isUnauditedExportRefusal, sendAuditedDownload } from '../services/export/governedExportConsequence';
import type { QmsDocumentRow } from '../services/qms/document-approval-signature';

const router = Router();
const log = createScopedLogger('mdx-qms');

router.get('/qms/documents/:id/controlled-copy', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  if (userId === null) return clientError(res, 401, 'User context required');
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return clientError(res, 422, 'id must be a positive integer');
  const format: ControlledCopyFormat = req.query.format === 'docx' ? 'docx' : 'pdf';
  const email = typeof (req as { user?: { email?: unknown } }).user?.email === 'string' ? String((req as { user?: { email?: string } }).user!.email) : null;
  try {
    const client = requestPgClient(req);
    const { rows } = await client.query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [id, orgId]);
    if (!rows.length) return notFoundInTenant(res, 'Document');
    const copy = await renderQmsControlledCopy(client, rows[0] as QmsDocumentRow, {
      format, issuedTo: email ?? `user ${userId}`, actor: { id: String(userId), email },
      admit: async (authoringDocumentId) => {
        const scope = await resolveAuthoringDocumentScope(client, orgId, authoringDocumentId);
        return (await decideAuthoringPermission({ pool: client, principal: authoringPrincipalFromRequest(req), scope, action: 'view' })).allowed;
      },
    });
    await sendAuditedDownload(res, {
      organizationId: orgId, userId, sourceType: format === 'pdf' ? 'export_pdf' : 'export_docx',
      backendRoute: '/api/mdx/qms/documents/:id/controlled-copy', resourceType: 'qms_document_controlled_copy',
      resourceId: `qms-document:${id}`, programUuid: null, filename: copy.filename, mimeType: copy.mimeType, buffer: copy.buffer,
      metadata: { docNumber: rows[0].doc_number, version: copy.version, signatureId: copy.signatureId, authoringDocumentId: copy.authoringDocumentId, issuedTo: email },
    });
    return res;
  } catch (err) {
    if (err instanceof QmsControlledCopyRefused) return clientError(res, err.status, err.message, { code: err.code });
    if (err instanceof AuthoringPdfRenderingError) {
      return res.status(503).json({ error: 'The PDF could not be completed. No controlled copy was issued. Download the Word copy, or contact an administrator.',
        details: { code: 'PDF_RENDERER_UNAVAILABLE' } });
    }
    if (isUnauditedExportRefusal(err)) {
      return res.status(503).json({ error: 'The issue of this controlled copy could not be recorded, so it was not delivered. Try again.', details: { code: 'CONTROLLED_COPY_NOT_RECORDED' } });
    }
    return serverError(res, log, 'doc-controlled-copy', err);
  }
});

export default router;
