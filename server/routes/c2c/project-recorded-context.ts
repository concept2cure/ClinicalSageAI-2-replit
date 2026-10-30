/** Reach the existing profile reader through the current UUID project scope. */
import type { Request, Response, Router } from 'express';
import { requestDb, requestPgClient } from '../../db/requestDb';
import { getTenantScope } from '../../db/tenantStore';
import { resolveOrgId } from '../../types/auth-request';
import { getProjectIntelligence } from '../../services/intelligence/project-intelligence-service';
import {
  getCurrentAccessibleProgramScope, verifiedProgramAnchors, requireProgramScopeStillCurrent,
  ProgramReadAccessError, type ProgramAccessExecutor, type VerifiedProgramAnchor,
} from '../../services/c2c/current-program-access';
import { isProjectRecordedContextData, type ProjectRecordedProfile } from '../../../shared/project-recorded-context';
import { projectSharingId } from '../../../shared/project-sharing';
import { requireProjectRouteAccess, sendProjectAccessFailure } from './project-route-access';

const unavailable = () => new ProgramReadAccessError(503, 'PROJECT_RECORDED_CONTEXT_UNAVAILABLE',
  'The saved project profile could not be verified. No profile data was supplied.');

function workspaceClaim(req: Request): number | undefined {
  // security-allow: workspace-claim only; verified against the canonical saved parent and owned workspace below, never used to select one.
  const raw = req.headers['x-client-id'];
  if (raw === undefined) return undefined;
  const claim = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
  if (!projectSharingId(claim)) throw new ProgramReadAccessError(409, 'PROJECT_WORKSPACE_MISMATCH', 'The client workspace claim is invalid.');
  return claim;
}

async function verifyWorkspace(q: ProgramAccessExecutor, org: number, anchor: VerifiedProgramAnchor, claim: number | undefined): Promise<void> {
  if (claim !== undefined && claim !== anchor.clientWorkspaceId) {
    throw new ProgramReadAccessError(409, 'PROJECT_WORKSPACE_MISMATCH', 'The saved project belongs to a different client workspace.');
  }
  if (anchor.clientWorkspaceId === null) return;
  const workspace = await q.query('SELECT id FROM client_workspaces WHERE id=$1 AND organization_id=$2', [anchor.clientWorkspaceId, org]);
  if (workspace.rows.length !== 1) throw new ProgramReadAccessError(409, 'PROJECT_WORKSPACE_UNRESOLVED', 'The saved project client relationship needs verification.');
}

function profileFields(summary: Awaited<ReturnType<typeof getProjectIntelligence>>, org: number, projectId: number): ProjectRecordedProfile | null {
  if (summary === null) return null;
  if (summary.organizationId !== org || summary.projectId !== projectId) throw unavailable();
  if (summary.customInstructions !== null && typeof summary.customInstructions !== 'string') throw unavailable();
  return { profileId: summary.profileId, regulatoryStrategy: summary.regulatoryStrategy,
    targetIndication: summary.targetIndication, targetPopulation: summary.targetPopulation, customInstructions: summary.customInstructions,
    riskFactors: [...summary.riskFactors], openQuestions: [...summary.openQuestions], keyDecisions: [...summary.keyDecisions],
    learnedInsights: [...summary.learnedInsights], lastEnrichedAt: summary.lastEnrichedAt };
}

async function recordedContext(req: Request, res: Response): Promise<Response> {
  try {
    const organizationId = resolveOrgId(req);
    const tenant = getTenantScope();
    if (!projectSharingId(organizationId) || tenant?.source !== 'request' || tenant.tenantId !== String(organizationId)) throw unavailable();
    const q = requestPgClient(req);
    const access = await requireProjectRouteAccess(req, res, { kind: 'projects', executor: q });
    const identity = { organizationId, userId: access.actor.userId, programId: access.programId };
    const scope = await getCurrentAccessibleProgramScope(q, identity);
    const anchors = verifiedProgramAnchors(q, identity, scope);
    if (anchors.length !== 1 || anchors[0].programId !== access.programId) throw unavailable();
    const anchor = anchors[0];
    const claim = workspaceClaim(req);
    await verifyWorkspace(q, organizationId, anchor, claim);
    const summary = await getProjectIntelligence(anchor.projectId, organizationId, requestDb(req), { includeProfileInstructions: true });
    const data = { programId: anchor.programId, projectId: anchor.projectId, organizationId, actorUserId: scope.actor.userId,
      clientWorkspaceId: anchor.clientWorkspaceId, profile: profileFields(summary, organizationId, anchor.projectId) };
    if (!isProjectRecordedContextData(data)) throw unavailable();
    await requireProgramScopeStillCurrent(q, identity, scope);
    await verifyWorkspace(q, organizationId, anchor, claim);
    return res.json({ success: true, data });
  } catch (error) { return sendProjectAccessFailure(res, error, true); }
}

export function installProjectRecordedContextRoutes(router: Router): void {
  router.get('/:id/intelligence', (req, res) => { void recordedContext(req, res); });
}
