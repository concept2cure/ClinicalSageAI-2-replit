/** Registration on the existing authoring router, after its verified auth middleware. */
import type { Request, Router } from 'express';
import type { CreateContext } from '../services/authoring/authoring-documents';
import type { AuthoringPrincipal } from '../services/authoring/authoring-permissions';
import { commitAuthoringAssembly, previewAuthoringAssembly } from '../services/authoring/authoring-assembly';
import { readSavedAuthoringAssemblySources, SavedAssemblySourcesError } from '../services/authoring/authoring-saved-assembly-sources';

export function registerAuthoringAssemblyRoutes(router: Router, dependencies: {
  context: (req: Request) => CreateContext;
  principal: (req: Request) => AuthoringPrincipal | null;
}): void {
  router.get('/docs/:docId/assembly/sources', async (req, res) => {
    try {
      const principal = dependencies.principal(req);
      if (!principal) return res.status(401).json({ success: false, error: 'ASSEMBLY_ACTOR_REQUIRED', message: 'Authentication required.' });
      const ctx = dependencies.context(req);
      if (principal.id !== ctx.actor.id) return res.status(401).json({ success: false, error: 'ASSEMBLY_ACTOR_REQUIRED', message: 'Authentication required.' });
      const data = await readSavedAuthoringAssemblySources(ctx.pool, { organizationId: ctx.tenantId, userId: Number(ctx.actor.id),
        docId: String(req.params.docId), programId: typeof req.query.programId === 'string' ? req.query.programId : '' });
      return res.json({ success: true, data });
    } catch (error) {
      if (error instanceof SavedAssemblySourcesError) {
        return res.status(error.status).json({ success: false, error: error.code, message: error.message });
      }
      return res.status(503).json({ success: false, error: 'SAVED_ASSEMBLY_SOURCES_UNAVAILABLE', message: 'Saved document sources could not be verified. Check again before reusing them.' });
    }
  });
  // Reuse the authenticated Authoring router and its assigned human review.
  router.post('/documents/:id/csr-evidence/preview', async (req, res) => {
    try {
      const principal = dependencies.principal(req);
      const ctx = dependencies.context(req);
      if (!principal || principal.id !== ctx.actor.id) {
        return res.status(401).json({ success: false, error: 'CSR_EVIDENCE_ACTOR_REQUIRED' });
      }
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
          Object.keys(req.body).some(key => key !== 'runIds')) {
        return res.status(400).json({ success: false, error: 'CSR_EVIDENCE_INPUT_INVALID' });
      }
      const { requestConnectable } = await import('../db/requestDb');
      const { previewAuthoringCsrReview } = await import('../services/authoring/peer-review');
      const preview = await previewAuthoringCsrReview(requestConnectable(req), {
        tenantId: ctx.tenantId, actorId: String(principal.id),
        documentId: String(req.params.id), runIds: req.body.runIds,
      });
      return res.json({ success: true, preview });
    } catch (error) {
      const known = error as { code?: unknown; status?: unknown };
      const status = Number(known?.status);
      if (typeof known?.code === 'string' && /^CSR_|^REVIEW_/.test(known.code) &&
          [400, 401, 403, 404, 409, 503].includes(status)) {
        return res.status(status).json({ success: false, error: known.code });
      }
      return res.status(503).json({ success: false, error: 'CSR_EVIDENCE_UNAVAILABLE' });
    }
  });
  for (const action of ['preview', 'commit'] as const) {
    router.post(`/docs/:docId/assembly/${action}`, async (req, res) => {
      try {
        const principal = dependencies.principal(req);
        if (!principal) return res.status(401).json({ success: false, error: 'ASSEMBLY_ACTOR_REQUIRED', message: 'Authentication required.' });
        const ctx = dependencies.context(req);
        const docId = String(req.params.docId);
        const result = action === 'preview'
          ? await previewAuthoringAssembly(ctx, principal, docId, req.body)
          : await commitAuthoringAssembly(ctx, principal, docId, req.body);
        return result.ok ? res.json({ success: true, data: result.data }) :
          res.status(result.status).json({ success: false, error: result.code, message: result.message });
      } catch {
        return res.status(503).json({ success: false, error: 'ASSEMBLY_UNAVAILABLE', message: 'The build could not be completed. Check the saved document before trying again.' });
      }
    });
  }
}
