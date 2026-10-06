/** Mounted at /api/c2c/projects behind canonical authentication. */
import { Router, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import { governedActorId, requireEditorAccess } from '../../middleware/orgMembership.js';
import { writeChainedAuditRow } from '../../services/auditService.js';
import { createDocumentDispositionService, DispositionError, type DispositionScope, type DispositionDatabase } from '../../services/document-data-disposition/service';
import type { DocumentDispositionTargetType } from '../../../shared/document-data-disposition';

export const DOCUMENT_DISPOSITIONS_ENABLED_ENV = 'C2C_DOCUMENT_DISPOSITIONS_ENABLED';
export function documentDispositionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DOCUMENT_DISPOSITIONS_ENABLED_ENV] === '1';
}
export function createDefaultDocumentDispositionService() {
  return createDocumentDispositionService({
    db: pool as unknown as DispositionDatabase,
    enabled: () => documentDispositionsEnabled(),
    tokenSecret: process.env.DOCUMENT_DISPOSITION_PREVIEW_SECRET ?? process.env.SESSION_SECRET ?? '',
    audit: async (q, entry) => {
      await writeChainedAuditRow(q, entry, entry.organizationId, entry.resourceId);
      const receipt = await q.query(`SELECT id::text AS id, sha256_chain FROM audit_logs
        WHERE tenant_id=$1 AND target=$2 ORDER BY chain_seq DESC NULLS LAST,occurred_at DESC,id DESC LIMIT 1`,
        [entry.organizationId,`${entry.resourceType}:${entry.resourceId}`]);
      if (!receipt.rows[0]) throw new DispositionError(503,'AUDIT_UNAVAILABLE','The chained audit receipt is unavailable. Nothing was changed.');
      return { id:receipt.rows[0].id,sha256Chain:receipt.rows[0].sha256_chain };
    },
  });
}
type Service = ReturnType<typeof createDocumentDispositionService>;
function scope(req: Request): DispositionScope {
  const request = req as any;
  const raw = request.tenantContext?.organizationId ?? request.user?.organizationId ?? request.tenantId;
  const organizationId = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : raw;
  const actorId = governedActorId(req);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || actorId === null) throw new DispositionError(403,'FORBIDDEN','Verified organization and actor context are required.');
  return { organizationId, actorId,programId:String(req.params.id ?? ''),orgRole:request.userRole ?? request.user?.role };
}
function failure(res: Response, err: unknown) {
  if (err instanceof DispositionError) return res.status(err.status).json({ error:err.code,message:err.message });
  return res.status(503).json({ error:'IMPACT_UNAVAILABLE',message:'The complete source impact could not be verified. Nothing was changed.' });
}
export default function createDocumentDataDispositionRoutes(service?: Service): Router {
  const router = Router();
  const current = () => service ?? createDefaultDocumentDispositionService();
  router.get('/:id/document-dispositions/preview', async (req: Request,res: Response) => {
    try {
      const preview = await current().preview({ ...scope(req),targetType:req.query.targetType as DocumentDispositionTargetType,
        targetId:typeof req.query.targetId==='string'?req.query.targetId:'',
        ...(typeof req.query.replacementId==='string' ? {replacementId:req.query.replacementId} : {}),
      });
      return res.json({ preview });
    } catch (err) { return failure(res,err); }
  });
  router.post('/:id/document-dispositions',requireEditorAccess,async (req: Request,res: Response) => {
    try {
      const body = req.body ?? {};
      // Never accept scope, actor or impact data from a client body.
      const result = await current().apply({ ...scope(req),targetType:body.targetType,targetId:body.targetId,
        choice:body.choice,reason:body.reason,previewToken:body.previewToken,
        ...(typeof body.replacementId==='string' ? {replacementId:body.replacementId} : {}),
      });
      return res.status(201).json(result);
    } catch (err) { return failure(res,err); }
  });
  return router;
}
