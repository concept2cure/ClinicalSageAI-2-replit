import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CsrSourceSelectionSchema } from '../../shared/csr-source-input.js';
import { csrSourceContract } from '../../shared/csr-source-contract.js';
import { requestConnectable, requestPgClient } from '../db/requestDb.js';
import { listCsrVaultSources, previewCsrVaultSource, CsrSourceInputError, type CsrSourceScope } from '../services/csr/vault-source-input.js';
import { readSavedClinicalTables } from '../services/csr/saved-clinical-tables.js';
import { serverError } from '../lib/api-response.js';
import { createScopedLogger } from '../utils/logger.js';
import { recordAuditRow } from '../services/audit/audit-write-outcome.js';

const log = createScopedLogger('csr-source-inputs');
type RequireTenant = (req: Request, res: Response) => number | null;
const Program = z.string().uuid();
const Preview = CsrSourceSelectionSchema.extend({ programId: Program }).strict();
function scope(req: Request, res: Response, tenant: RequireTenant, programId: unknown): CsrSourceScope | null {
  const organizationId = tenant(req, res);
  if (organizationId === null) return null;
  const parsed = Program.safeParse(programId);
  if (!parsed.success) { res.status(400).json({ error: 'CSR_SCOPE_INVALID', message: 'Select a project: a valid project id is required.' }); return null; }
  const user = (req as Request & { user?: { id?: unknown; userId?: unknown } }).user;
  const userId = Number(user?.id ?? user?.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) { res.status(403).json({ error: 'CSR_ACTOR_REQUIRED' }); return null; }
  return { organizationId, userId, programId: parsed.data.toLowerCase() };
}
function failure(res: Response, error: unknown, action: string) {
  if (error instanceof CsrSourceInputError) return res.status(error.status).json({ error: error.code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) });
  return serverError(res, log, action, error);
}
export function createCsrSourceInputRouter(tenant: RequireTenant) {
  const router = Router();
  router.get('/csr/source-contract', (req, res) => {
    if (tenant(req, res) === null) return;
    return res.json(csrSourceContract());
  });
  router.get('/csr/sources', async (req, res) => {
    const current = scope(req, res, tenant, req.query.programId); if (!current) return;
    try { return res.json(await listCsrVaultSources(requestPgClient(req), current)); }
    catch (error) { return failure(res, error, 'reading CSR source candidates'); }
  });
  router.post('/csr/source-preview', async (req, res) => {
    const current = scope(req, res, tenant, req.body?.programId); if (!current) return;
    const parsed = Preview.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'CSR_SOURCE_SELECTION_INVALID', message: 'Choose an exact Vault document and its recorded SHA-256 digest.' });
    try {
      const result = await previewCsrVaultSource(requestConnectable(req), current,
        { documentId: parsed.data.documentId, expectedSha256: parsed.data.expectedSha256 });
      const auditTrail = await recordAuditRow({ tenantId: current.organizationId, userId: current.userId,
        action: 'orchestrator_csr_source_previewed', resourceType: 'vault.documents', resourceId: result.source.documentId,
        ipAddress: req.ip, userAgent: req.get('user-agent'),
        details: { programId: current.programId, sourceSha256: result.source.sha256, sourceVersion: result.source.version,
          adapter: result.source.adapter, platformApproved: result.approved, clinicalVerification: 'not-established' },
      }, requestConnectable(req));
      return res.json({ ...result, meta: { auditTrail } });
    }
    catch (error) { return failure(res, error, 'previewing CSR source tables'); }
  });
  router.get('/runs/:runId/clinical-tables', async (req, res) => {
    const current = scope(req, res, tenant, req.query.programId); if (!current) return;
    const runId = z.string().uuid().safeParse(req.params.runId);
    if (!runId.success) return res.status(400).json({ error: 'CSR_RUN_ID_INVALID' });
    try { return res.json(await readSavedClinicalTables(requestPgClient(req), current, runId.data)); }
    catch (error) { return failure(res, error, 'reading retained CSR source tables'); }
  });
  return router;
}
