/** Registration on the existing authoring router, after its verified auth middleware. */
import type { Request, Router } from 'express';
import type { CreateContext } from '../services/authoring/authoring-documents';
import type { AuthoringPrincipal } from '../services/authoring/authoring-permissions';
import { commitAuthoringAssembly, previewAuthoringAssembly } from '../services/authoring/authoring-assembly';

export function registerAuthoringAssemblyRoutes(router: Router, dependencies: {
  context: (req: Request) => CreateContext;
  principal: (req: Request) => AuthoringPrincipal | null;
}): void {
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
