/** Mounted at /api/c2c/projects behind canonical authentication. */
import { Router, type Request, type Response } from 'express';
import { governedActorId, requireEditorAccess } from '../../middleware/orgMembership.js';
import { createDocumentDispositionService, DispositionError, type DispositionScope } from '../../services/document-data-disposition/service';
import type { DocumentDispositionTargetType } from '../../../shared/document-data-disposition';
import { createDefaultDocumentDispositionService } from '../../services/document-data-disposition/production-adapter';
export { createDefaultDocumentDispositionService, documentDispositionsEnabled, DOCUMENT_DISPOSITIONS_ENABLED_ENV } from '../../services/document-data-disposition/production-adapter';

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
