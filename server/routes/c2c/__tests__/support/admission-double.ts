/**
 * `projectAdmissionMiddleware`, decided by a route suite's own access stub
 * (D6, docs/evidence/D6-PROJECT-WRITE-GATES/2026-10-29/).
 *
 * The artifact, task, review, HAQ and governance routers admit the project in
 * `router.param('projectId', projectAdmissionMiddleware(…))` before any handler
 * runs. The real check reads the current membership and the sharing policy on
 * PostgreSQL, and it is proven there (project-write-gates.pglite.test.ts). A
 * suite that drives one of those routers over a queued query mock stubs
 * `verifyProjectAccess` instead, so the middleware must answer as that stub
 * does, never admit everything: it takes the project the real middleware would
 * (the router's `projectId` translation, else the URL's), admits it when the
 * stub grants it, and refuses it as the real check refuses (404
 * PROJECT_NOT_FOUND). A translation or a stub that throws is the real check's
 * 503 PROJECT_ACCESS_UNAVAILABLE: a check that could not run is not an answer.
 *
 * Use (inside the suite's vi.mock factory for project-access):
 *   const verifyProjectAccess = vi.fn(async (_req, id) => String(id) === '3');
 *   const { admissionDecidedBy } = await import('./support/admission-double');
 *   return { verifyProjectAccess, projectAdmissionMiddleware: admissionDecidedBy(verifyProjectAccess) };
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AccessStub = (req: Request, projectId: string) => boolean | Promise<boolean>;
type AdmissionOptions = { projectId?: (req: Request) => Promise<number | null> };

const refuse = (res: Response, status: 404 | 503, code: string, message: string) =>
  res.status(status).json({ success: false, error: { message, code } });

export function admissionDecidedBy(verify: AccessStub): (options?: AdmissionOptions) => RequestHandler {
  return (options = {}) => async (req: Request, res: Response, next: NextFunction) => {
    let granted: boolean;
    try {
      const projectId = options.projectId ? await options.projectId(req) : req.params.projectId;
      granted = projectId !== null && projectId !== undefined && (await verify(req, String(projectId)));
    } catch {
      refuse(res, 503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. Nothing was changed.');
      return;
    }
    if (!granted) {
      refuse(res, 404, 'PROJECT_NOT_FOUND', 'Project not found.');
      return;
    }
    next();
  };
}
