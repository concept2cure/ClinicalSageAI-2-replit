/**
 * The sponsor's per-study pivotal declaration (D5, founder's decision of
 * 2026-10-29; services/csr/study-pivotal-declaration.ts). Mounted at
 * /api/csr-workflow/pivotal beside the CSR workflow board.
 *
 *   GET  ?projectId= | ?programId=   every study the project's CSR builds name,
 *                                    with its current declaration (null when
 *                                    undeclared)
 *   POST { projectId | programId, studyId, pivotal, reason }
 *                                    declare one study pivotal or not, with a
 *                                    reason; a change is a new record
 *
 * Both read the project under the CSR scope (project access, as the board
 * does). A declaration is a regulatory claim Module 2 repeats, so it needs a
 * writing role (requireEditorAccessForWrites) on a project that is not
 * archived.
 */
import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import { queryableFromDrizzle } from '../db/drizzle-queryable';
import { requireEditorAccessForWrites } from '../middleware/orgMembership';
import { createScopedLogger } from '../utils/logger';
import { CsrScopeError, resolveCsrScope } from '../services/csr/project-scope';
import {
  declareStudyPivotal, readProjectStudyPivotal, StudyPivotalDeclarationError,
} from '../services/csr/study-pivotal-declaration';

const log = createScopedLogger('csr-study-pivotal');

function positive(raw: unknown): number | null {
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
}
function organizationOf(req: Request): number | null {
  const r = req as unknown as { tenantContext?: { organizationId?: unknown }; user?: { organizationId?: unknown } };
  return positive(r.tenantContext?.organizationId ?? r.user?.organizationId);
}
function userOf(req: Request): number | null {
  const u = (req as unknown as { user?: { id?: unknown; userId?: unknown } }).user;
  return positive(u?.id ?? u?.userId);
}

/** The project the request names, under the CSR scope; null when it names none. */
async function projectOf(req: Request, source: Record<string, unknown>, forWrite: boolean, organizationId: number, userId: number): Promise<number | null> {
  if (!db) throw new Error('database not initialized');
  const scope = await resolveCsrScope(db, organizationId,
    { projectId: source.projectId, programId: source.programId }, { forWrite, actorUserId: userId });
  return scope.projectId ?? null;
}

function failure(res: Response, err: unknown, action: string): Response {
  if (err instanceof StudyPivotalDeclarationError || err instanceof CsrScopeError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  log.error(`Pivotal declaration ${action} failed`, { err: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: action === 'read' ? 'The pivotal declarations could not be read.' : 'The declaration was not recorded.' });
}

export default function csrStudyPivotalRouter(): Router {
  const router = Router();
  router.use(requireEditorAccessForWrites);

  router.get('/', async (req: Request, res: Response) => {
    const organizationId = organizationOf(req);
    const userId = userOf(req);
    if (organizationId === null || userId === null) return res.status(401).json({ error: 'A signed-in user is required.' });
    try {
      const projectId = await projectOf(req, req.query as Record<string, unknown>, false, organizationId, userId);
      if (projectId === null) return res.status(400).json({ error: 'Name the project.', code: 'PROJECT_REQUIRED' });
      const studies = await readProjectStudyPivotal(queryableFromDrizzle(db!), organizationId, projectId);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({ projectId, studies });
    } catch (err) {
      return failure(res, err, 'read');
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    const organizationId = organizationOf(req);
    const userId = userOf(req);
    if (organizationId === null || userId === null) return res.status(401).json({ error: 'A signed-in user is required.' });
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const projectId = await projectOf(req, body, true, organizationId, userId);
      if (projectId === null) return res.status(400).json({ error: 'Name the project. Nothing was recorded.', code: 'PROJECT_REQUIRED' });
      const declaration = await declareStudyPivotal(queryableFromDrizzle(db!), {
        organizationId, projectId, studyId: body.studyId, pivotal: body.pivotal, reason: body.reason, declaredBy: userId,
      });
      return res.status(201).json({ projectId, declaration });
    } catch (err) {
      return failure(res, err, 'write');
    }
  });

  return router;
}
