/**
 * PDEV → IND routes — mounted at /api/pdev.
 *
 *   GET   /api/pdev/registry
 *         Closed-enum activity registry. No tenant gating —
 *         canonical spec, same for every org.
 *
 *   GET   /api/pdev/programs/:programId
 *         Unified PDEV program view: workstream rollups + per-activity
 *         state + latest readiness snapshots + Q-Sub / FDA counts.
 *
 *   GET   /api/pdev/programs/:programId/workstreams
 *         Workstream rollup only.
 *
 *   GET   /api/pdev/programs/:programId/workstreams/:workstream
 *         Drill-down to a single workstream's activities and state.
 *
 *   GET   /api/pdev/programs/:programId/readiness
 *         Computed readiness report (per-workstream + overall + findings).
 *
 *   POST  /api/pdev/programs/:programId/readiness/snapshot
 *         Materialize a readiness snapshot row per workstream.
 *
 *   GET   /api/pdev/programs/:programId/ind-assembly
 *         Module 1–5 assembly readiness (labelled honestly as
 *         "readiness", not eCTD publishing).
 *
 *   GET   /api/pdev/programs/:programId/fda-interactions
 *         Chronological FDA touchpoint stream (q_submissions family
 *         + fda_communications).
 *
 *   GET   /api/pdev/programs/:programId/contradictions
 *         Read-side adapter over the existing contradiction engine.
 *
 *   POST  /api/pdev/programs/:programId/activities/:activityKey/state
 *         Update one activity's state. Goes through the existing
 *         auditService (dual-write hash chain) — no new audit machinery.
 *
 * Auth: every route is gated by authenticateToken at mount time
 * (see register-regulatory-routes.ts). Tenant isolation is then
 * enforced inside each service by joining regulatory_programs first.
 *
 * Response envelope: canonical `{ data, meta? }` via api-response helpers,
 * matching the q-sub and regulatory-programs convention.
 *
 * @module server/routes/pdev/pdev-routes
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { createScopedLogger } from '../../utils/logger';
import {
  ok,
  created,
  clientError,
  orgRequired,
  notFoundInTenant,
  serverError,
} from '../../lib/api-response';
import { db } from '../../db';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import { pdevProgramActivities } from '../../../shared/schema/pdev-workflow';
import auditService from '../../services/auditService';

import { pdevOrchestrator } from '../../services/pdev/pdev-orchestrator';
import {
  pdevReadinessService,
} from '../../services/pdev/pdev-readiness-service';
import { pdevIndAssemblyService } from '../../services/pdev/pdev-ind-assembly';
import { pdevFdaInteractionsService } from '../../services/pdev/pdev-fda-interactions';
import { pdevContradictionBridge } from '../../services/pdev/pdev-contradiction-bridge';
import { pdevAiDraftingService } from '../../services/pdev/pdev-ai-drafting';
import { pdevEctdCompileService } from '../../services/pdev/pdev-ectd-compile';
import {
  checkStateTransition,
  describeBlockers,
} from '../../services/pdev/pdev-state-guard';
import { pdevProvenanceTraceService } from '../../services/pdev/pdev-provenance-trace';
import { pdevWorkflowBridge } from '../../services/pdev/pdev-workflow-bridge';
import {
  pdevFdaFeedbackRollupService,
} from '../../services/pdev/pdev-fda-feedback-rollup';
import { pdevEvidenceAttachService } from '../../services/pdev/pdev-evidence-attach';
import { pdevReadinessScheduler } from '../../services/pdev/pdev-readiness-scheduler';
import {
  PDEV_ACTIVITIES,
  PDEV_WORKSTREAMS,
  PDEV_STAGES,
  PDEV_ACTIVITY_STATES,
  getActivityByKey,
  type PdevWorkstream,
} from '../../services/pdev/pdev-activity-registry';

const router = Router();
const log = createScopedLogger('pdev-routes');

// ─── Helpers ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId ?? (req as any).tenantId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id ?? (req as any).userId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function getUserRole(req: Request): string {
  return String((req as any).user?.role ?? (req as any).userRole ?? '');
}

const READINESS_BATCH_ROLES = new Set([
  'admin',
  'superadmin',
  'regulatory_lead',
]);

async function programBelongsToOrg(programId: string, organizationId: number): Promise<boolean> {
  const row = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(
      and(
        eq(regulatoryPrograms.id, programId),
        eq(regulatoryPrograms.organizationId, organizationId)
      )
    )
    .limit(1);
  return Boolean(row[0]);
}

// ─── GET /api/pdev/registry — closed enum ───────────────────────────────────

router.get('/registry', (_req: Request, res: Response) => {
  return ok(res, {
    activities: PDEV_ACTIVITIES,
    workstreams: PDEV_WORKSTREAMS,
    stages: PDEV_STAGES,
    states: PDEV_ACTIVITY_STATES,
  });
});

// ─── GET /api/pdev/programs/:programId — unified view ───────────────────────

router.get('/programs/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) {
    return clientError(res, 400, 'programId must be a UUID');
  }

  try {
    const view = await pdevOrchestrator.getProgramView(programId, orgId);
    if (!view) return notFoundInTenant(res, 'program');
    return ok(res, view);
  } catch (err) {
    return serverError(res, log, 'Failed to load PDEV program view', err);
  }
});

// ─── GET /api/pdev/programs/:programId/workstreams ──────────────────────────

router.get('/programs/:programId/workstreams', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

  try {
    const view = await pdevOrchestrator.getProgramView(programId, orgId);
    if (!view) return notFoundInTenant(res, 'program');
    return ok(res, { workstreams: view.workstreams });
  } catch (err) {
    return serverError(res, log, 'Failed to load workstreams', err);
  }
});

// ─── GET /api/pdev/programs/:programId/workstreams/:workstream ──────────────

const workstreamParam = z.enum(['cmc', 'nonclinical', 'clinical', 'regulatory']);

router.get('/programs/:programId/workstreams/:workstream', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const programId = String(req.params.programId);
  const workstream = String(req.params.workstream);
  if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');
  const wsParse = workstreamParam.safeParse(workstream);
  if (!wsParse.success) return clientError(res, 400, 'Invalid workstream');

  try {
    const view = await pdevOrchestrator.getProgramView(programId, orgId);
    if (!view) return notFoundInTenant(res, 'program');

    const ws = wsParse.data as PdevWorkstream;
    const rollup = view.workstreams.find(w => w.workstream === ws);
    const activities = view.activities.filter(a => a.registry.workstream === ws);
    return ok(res, { workstream: ws, rollup, activities });
  } catch (err) {
    return serverError(res, log, 'Failed to load workstream drill-down', err);
  }
});

// ─── GET /api/pdev/programs/:programId/readiness ────────────────────────────

router.get('/programs/:programId/readiness', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

  try {
    const report = await pdevReadinessService.computeReadiness(programId, orgId);
    if (!report) return notFoundInTenant(res, 'program');
    return ok(res, report);
  } catch (err) {
    return serverError(res, log, 'Failed to compute readiness', err);
  }
});

// ─── POST /api/pdev/programs/:programId/readiness/snapshot ──────────────────

router.post('/programs/:programId/readiness/snapshot', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);

  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

  try {
    const report = await pdevReadinessService.snapshot(programId, orgId, userId, 'manual');
    if (!report) return notFoundInTenant(res, 'program');

    void auditService.logAction({
      tenantId: orgId,
      userId: userId ?? undefined,
      action: 'pdev_readiness_snapshot',
      resourceType: 'regulatory_program',
      resourceId: programId,
      details: { trigger: 'manual', overallScore: report.overall.readinessScore },
    });

    return created(res, report);
  } catch (err) {
    return serverError(res, log, 'Failed to snapshot readiness', err);
  }
});

// ─── GET /api/pdev/programs/:programId/ind-assembly ─────────────────────────

router.get('/programs/:programId/ind-assembly', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

  try {
    const report = await pdevIndAssemblyService.getReadiness(programId, orgId);
    if (!report) return notFoundInTenant(res, 'program');
    return ok(res, report, {
      // Honest framing — this is *readiness*, not eCTD publishing.
      label: 'IND assembly readiness',
      note:
        'Readiness view only; eCTD backbone publishing requires the existing ' +
        'ectd_compilations / ectd-export pipeline, which this endpoint does not invoke.',
    });
  } catch (err) {
    return serverError(res, log, 'Failed to compute IND assembly readiness', err);
  }
});

// ─── GET /api/pdev/programs/:programId/fda-interactions ─────────────────────

router.get('/programs/:programId/fda-interactions', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

  try {
    const stream = await pdevFdaInteractionsService.getStream(programId, orgId);
    if (!stream) return notFoundInTenant(res, 'program');
    return ok(res, stream);
  } catch (err) {
    return serverError(res, log, 'Failed to load FDA interaction stream', err);
  }
});

// ─── GET /api/pdev/programs/:programId/contradictions ───────────────────────

const contradictionsQuerySchema = z.object({
  projectId: z
    .string()
    .regex(/^\d+$/)
    .transform(s => Number.parseInt(s, 10))
    .optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  authorityState: z
    .enum([
      'advisory_only',
      'requires_review',
      'requires_approval',
      'blocks_promotion',
      'requires_escalation',
    ])
    .optional(),
  reviewState: z
    .enum(['unresolved', 'under_review', 'reviewed', 'approved_resolution', 'superseded'])
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(s => Number.parseInt(s, 10))
    .pipe(z.number().int().min(1).max(500))
    .optional(),
});

router.get('/programs/:programId/contradictions', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

  const parsed = contradictionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
  }

  try {
    const registry = await pdevContradictionBridge.getRegistry(programId, orgId, parsed.data);
    if (!registry) return notFoundInTenant(res, 'program');
    return ok(res, registry);
  } catch (err) {
    return serverError(res, log, 'Failed to load contradiction registry', err);
  }
});

// ─── POST /api/pdev/programs/:programId/activities/:activityKey/state ───────

const stateUpdateSchema = z.object({
  state: z.enum(PDEV_ACTIVITY_STATES as readonly [string, ...string[]]),
  notes: z.string().max(8000).optional().nullable(),
  ownerUserId: z.number().int().positive().optional().nullable(),
  reviewerUserId: z.number().int().positive().optional().nullable(),
  dueDate: z.string().datetime({ offset: true }).optional().nullable(),
  /**
   * Force-override the dependency-gate guard. Used when a user has a
   * legitimate reason to promote an activity even though its registry
   * `dependsOn` chain isn't fully completed yet. Audit-flagged so an
   * auditor can find every governance override.
   */
  force: z.boolean().optional(),
});

router.post(
  '/programs/:programId/activities/:activityKey/state',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);
    const userId = getUserId(req);

    const programId = String(req.params.programId);
    const activityKey = String(req.params.activityKey);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    const activity = getActivityByKey(activityKey);
    if (!activity) return clientError(res, 404, `Unknown activity key: ${activityKey}`);

    const parsed = stateUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }

    const inOrg = await programBelongsToOrg(programId, orgId);
    if (!inOrg) return notFoundInTenant(res, 'program');

    // Dependency gate: refuse promotion to completed states when the
    // registry dependsOn chain isn't satisfied, unless caller forces.
    const forced = Boolean(parsed.data.force);
    const gate = await checkStateTransition(
      programId,
      activityKey,
      parsed.data.state as (typeof PDEV_ACTIVITY_STATES)[number]
    );
    if (!gate.allowed && !forced) {
      return clientError(res, 409, describeBlockers(gate.blockers), {
        blockers: gate.blockers,
        hint: 'Pass force=true with a justification in notes to override; the override is audit-flagged.',
      });
    }

    const now = new Date();
    const due = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;

    try {
      // Upsert by (program_id, activity_key) — unique index from migration.
      const existing = await db
        .select()
        .from(pdevProgramActivities)
        .where(
          and(
            eq(pdevProgramActivities.programId, programId),
            eq(pdevProgramActivities.activityKey, activityKey)
          )
        )
        .limit(1);

      let row;
      if (existing[0]) {
        const updated = await db
          .update(pdevProgramActivities)
          .set({
            state: parsed.data.state,
            notes: parsed.data.notes ?? existing[0].notes,
            ownerUserId: parsed.data.ownerUserId ?? existing[0].ownerUserId,
            reviewerUserId: parsed.data.reviewerUserId ?? existing[0].reviewerUserId,
            dueDate: due ?? existing[0].dueDate,
            stateChangedAt: now,
            stateChangedBy: userId,
            updatedAt: now,
          })
          .where(eq(pdevProgramActivities.id, existing[0].id))
          .returning();
        row = updated[0];
      } else {
        const inserted = await db
          .insert(pdevProgramActivities)
          .values({
            programId,
            activityKey,
            workstream: activity.workstream,
            stage: activity.stage,
            state: parsed.data.state,
            notes: parsed.data.notes ?? null,
            ownerUserId: parsed.data.ownerUserId ?? null,
            reviewerUserId: parsed.data.reviewerUserId ?? null,
            dueDate: due,
            stateChangedAt: now,
            stateChangedBy: userId,
          })
          .returning();
        row = inserted[0];
      }

      void auditService.logAction({
        tenantId: orgId,
        userId: userId ?? undefined,
        action: 'pdev_activity_state_change',
        resourceType: 'pdev_program_activity',
        resourceId: row.id,
        details: {
          programId,
          activityKey,
          newState: parsed.data.state,
          workstream: activity.workstream,
          stage: activity.stage,
          dependencyGateOverridden: forced && !gate.allowed,
          ...(forced && !gate.allowed
            ? { overriddenBlockers: gate.blockers.map(b => b.activityKey) }
            : {}),
        },
      });

      return ok(res, row);
    } catch (err) {
      return serverError(res, log, 'Failed to update activity state', err);
    }
  }
);

// ─── POST /api/pdev/programs/:programId/activities/:activityKey/ai-draft ────

const aiDraftBodySchema = z.object({
  projectId: z.number().int().positive(),
  documentCode: z.string().min(1).max(128).optional(),
  userPrompt: z.string().max(8000).optional(),
  evidenceObjectIds: z.array(z.string().uuid()).max(32).optional(),
});

router.post(
  '/programs/:programId/activities/:activityKey/ai-draft',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);
    const userId = getUserId(req);
    if (userId === null) return clientError(res, 403, 'User context required');

    const programId = String(req.params.programId);
    const activityKey = String(req.params.activityKey);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    const parsed = aiDraftBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }

    try {
      const result = await pdevAiDraftingService.generateActivityDraft({
        programId,
        organizationId: orgId,
        userId,
        projectId: parsed.data.projectId,
        activityKey,
        documentCode: parsed.data.documentCode,
        userPrompt: parsed.data.userPrompt,
        evidenceObjectIds: parsed.data.evidenceObjectIds,
      });
      return created(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI draft failed';
      if (
        message.includes('not found in tenant') ||
        message.includes('Unknown PDEV activity key')
      ) {
        return clientError(res, 404, message);
      }
      if (message.includes('OpenAI API key not configured')) {
        return clientError(res, 422, message);
      }
      return serverError(res, log, 'AI draft generation', err);
    }
  }
);

// ─── POST /api/pdev/programs/:programId/ind-assembly/compile ────────────────

const ectdCompileBodySchema = z.object({
  submissionId: z.number().int().positive(),
  region: z.string().min(1).max(8).optional(),
  submissionType: z.string().min(1).max(32).optional(),
  sequenceNumber: z
    .string()
    .regex(/^\d{4}$/, 'sequenceNumber must be a 4-digit string')
    .optional(),
  applicationNumber: z.string().min(1).max(64).optional(),
  readinessThreshold: z.number().min(0).max(100).optional(),
  force: z.boolean().optional(),
});

router.post(
  '/programs/:programId/ind-assembly/compile',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);
    const userId = getUserId(req);
    if (userId === null) return clientError(res, 403, 'User context required');

    const programId = String(req.params.programId);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    const parsed = ectdCompileBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }

    try {
      const result = await pdevEctdCompileService.compile({
        programId,
        organizationId: orgId,
        userId,
        submissionId: parsed.data.submissionId,
        region: parsed.data.region,
        submissionType: parsed.data.submissionType,
        sequenceNumber: parsed.data.sequenceNumber,
        applicationNumber: parsed.data.applicationNumber,
        readinessThreshold: parsed.data.readinessThreshold,
        force: parsed.data.force,
      });
      if (result.status === 'refused_low_readiness') {
        return clientError(res, 409, result.refusalReason ?? 'Readiness too low', {
          readinessSnapshot: result.readinessSnapshot,
          thresholdApplied: result.thresholdApplied,
        });
      }
      // Honest framing: route returns metadata only. Caller pulls the
      // ZIP via the existing /api/ectd/export pipeline if they want the
      // binary — the buffer here is dropped to keep the response shape
      // JSON-friendly.
      return created(res, {
        status: result.status,
        thresholdApplied: result.thresholdApplied,
        forced: result.forced,
        readinessAtCompile: result.readinessSnapshot.overallReadiness,
        package: result.package
          ? {
              filename: result.package.filename,
              sizeBytes: result.package.sizeBytes,
              stats: result.package.stats,
            }
          : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Compile failed';
      if (message.includes('not found in tenant')) {
        return clientError(res, 404, message);
      }
      return serverError(res, log, 'eCTD compile', err);
    }
  }
);

// ─── GET /api/pdev/programs/:programId/fda-feedback/proposals ───────────────

const fdaProposalQuerySchema = z.object({
  minConfidence: z
    .string()
    .regex(/^0(?:\.\d+)?|1(?:\.0+)?$/)
    .transform(s => Number.parseFloat(s))
    .optional(),
});

router.get(
  '/programs/:programId/fda-feedback/proposals',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);

    const programId = String(req.params.programId);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    const parsed = fdaProposalQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }

    try {
      const report = await pdevFdaFeedbackRollupService.proposeRollup(programId, orgId, {
        minConfidence: parsed.data.minConfidence,
      });
      if (!report) return notFoundInTenant(res, 'program');
      return ok(res, report);
    } catch (err) {
      return serverError(res, log, 'FDA feedback proposals', err);
    }
  }
);

// ─── POST /api/pdev/programs/:programId/fda-feedback/apply ──────────────────

const fdaApplyBodySchema = z.object({
  mappings: z
    .array(
      z.object({
        commitmentId: z.string().uuid(),
        activityKey: z.string().min(1).max(96),
        forceState: z.boolean().optional(),
      })
    )
    .min(1)
    .max(100),
});

router.post(
  '/programs/:programId/fda-feedback/apply',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);
    const userId = getUserId(req);
    if (userId === null) return clientError(res, 403, 'User context required');

    const programId = String(req.params.programId);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    const parsed = fdaApplyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }

    try {
      const result = await pdevFdaFeedbackRollupService.applyRollup({
        programId,
        organizationId: orgId,
        userId,
        mappings: parsed.data.mappings,
      });
      return created(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Apply failed';
      if (message.includes('not found in tenant')) {
        return clientError(res, 404, message);
      }
      return serverError(res, log, 'FDA feedback apply', err);
    }
  }
);

// ─── POST /api/pdev/programs/:programId/activities/:activityKey/evidence ────

const evidenceAttachBodySchema = z.object({
  evidenceObjectId: z.string().uuid(),
  linkType: z.enum(['supports', 'contradicts', 'references', 'supersedes']).optional(),
  strength: z.enum(['strong', 'moderate', 'weak']).optional(),
  rationale: z.string().max(4000).optional(),
});

router.post(
  '/programs/:programId/activities/:activityKey/evidence',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);
    const userId = getUserId(req);
    if (userId === null) return clientError(res, 403, 'User context required');

    const programId = String(req.params.programId);
    const activityKey = String(req.params.activityKey);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    const parsed = evidenceAttachBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }

    try {
      const result = await pdevEvidenceAttachService.attach({
        programId,
        organizationId: orgId,
        userId,
        activityKey,
        evidenceObjectId: parsed.data.evidenceObjectId,
        linkType: parsed.data.linkType,
        strength: parsed.data.strength,
        rationale: parsed.data.rationale,
      });
      return created(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Attach failed';
      if (
        message.includes('not found in tenant') ||
        message.includes('Unknown PDEV activity key')
      ) {
        return clientError(res, 404, message);
      }
      return serverError(res, log, 'Evidence attach', err);
    }
  }
);

// ─── DELETE /api/pdev/programs/:programId/activities/:activityKey/evidence/:evidenceId ─

router.delete(
  '/programs/:programId/activities/:activityKey/evidence/:evidenceObjectId',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);
    const userId = getUserId(req);
    if (userId === null) return clientError(res, 403, 'User context required');

    const programId = String(req.params.programId);
    const activityKey = String(req.params.activityKey);
    const evidenceObjectId = String(req.params.evidenceObjectId);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');
    if (!UUID_RE.test(evidenceObjectId)) return clientError(res, 400, 'evidenceObjectId must be a UUID');

    try {
      const result = await pdevEvidenceAttachService.detach({
        programId,
        organizationId: orgId,
        userId,
        activityKey,
        evidenceObjectId,
      });
      return ok(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detach failed';
      if (
        message.includes('not found in tenant') ||
        message.includes('Unknown PDEV activity key')
      ) {
        return clientError(res, 404, message);
      }
      return serverError(res, log, 'Evidence detach', err);
    }
  }
);

// ─── GET /api/pdev/programs/:programId/activities/:activityKey/provenance ───

router.get(
  '/programs/:programId/activities/:activityKey/provenance',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);

    const programId = String(req.params.programId);
    const activityKey = String(req.params.activityKey);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    try {
      const trace = await pdevProvenanceTraceService.trace(programId, orgId, activityKey);
      if (!trace) return notFoundInTenant(res, 'program or activity');
      return ok(res, trace, {
        // Honest framing — read-only assembly across existing tables.
        label: 'PDEV activity provenance trace',
        note:
          'Stitches activity state + evidence_links + concept2cure_artifacts + ' +
          'data_lineage_records + audit_logs into a single regulatory traceability ' +
          'view. No new schema; read-only.',
      });
    } catch (err) {
      return serverError(res, log, 'Failed to load provenance trace', err);
    }
  }
);

// ─── GET /api/pdev/programs/:programId/activities/:activityKey/evidence ─────

router.get(
  '/programs/:programId/activities/:activityKey/evidence',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);

    const programId = String(req.params.programId);
    const activityKey = String(req.params.activityKey);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    try {
      const evidence = await pdevEvidenceAttachService.listForActivity(
        programId,
        orgId,
        activityKey
      );
      return ok(res, { activityKey, evidence });
    } catch (err) {
      return serverError(res, log, 'Evidence list', err);
    }
  }
);

// ─── POST /api/pdev/programs/:programId/activities/:key/workflow/kickoff ───
//
// Kicks off a multi-step approval chain for promoting a PDEV activity to a
// completed state. The activity is held at human_review_required until the
// chain resolves (each checkpoint approved → activity moves to targetState;
// any rejection → activity moves to revision_required and run is marked
// failed).

const workflowKickoffBodySchema = z.object({
  targetState: z.enum(['approved', 'locked', 'submission_ready', 'submitted']),
  reason: z.string().trim().min(10).max(8000),
  requestedByRole: z.string().min(1).max(64).optional(),
});

router.post(
  '/programs/:programId/activities/:activityKey/workflow/kickoff',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);
    const userId = getUserId(req);
    if (userId === null) return clientError(res, 403, 'User context required');

    const programId = String(req.params.programId);
    const activityKey = String(req.params.activityKey);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    const parsed = workflowKickoffBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }

    try {
      const result = await pdevWorkflowBridge.kickoff({
        programId,
        organizationId: orgId,
        activityKey,
        targetState: parsed.data.targetState,
        requestedByUserId: userId,
        requestedByRole: parsed.data.requestedByRole,
        reason: parsed.data.reason,
      });
      return created(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Workflow kickoff failed';
      if (
        message.includes('not found in tenant') ||
        message.includes('Unknown PDEV activity key')
      ) {
        return clientError(res, 404, message);
      }
      if (message.includes('only used for promotions')) {
        return clientError(res, 422, message);
      }
      return serverError(res, log, 'Workflow kickoff', err);
    }
  }
);

// ─── GET /api/pdev/programs/:programId/activities/:key/workflow ─────────────

router.get(
  '/programs/:programId/activities/:activityKey/workflow',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);

    const programId = String(req.params.programId);
    const activityKey = String(req.params.activityKey);
    if (!UUID_RE.test(programId)) return clientError(res, 400, 'programId must be a UUID');

    try {
      const status = await pdevWorkflowBridge.getChainStatus(programId, orgId, activityKey);
      if (!status) return ok(res, { workflowRunId: null, checkpoints: [] });
      return ok(res, status);
    } catch (err) {
      return serverError(res, log, 'Failed to load workflow status', err);
    }
  }
);

// ─── POST /api/pdev/workflow-runs/:runId/checkpoints/:checkpointId/decision ─

const workflowDecisionBodySchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(10).max(8000),
  userRole: z.string().min(1).max(64).optional(),
});

router.post(
  '/workflow-runs/:runId/checkpoints/:checkpointId/decision',
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);
    const userId = getUserId(req);
    if (userId === null) return clientError(res, 403, 'User context required');

    const runId = String(req.params.runId);
    const checkpointId = String(req.params.checkpointId);
    if (!UUID_RE.test(runId)) return clientError(res, 400, 'runId must be a UUID');
    if (!UUID_RE.test(checkpointId)) return clientError(res, 400, 'checkpointId must be a UUID');

    const parsed = workflowDecisionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return clientError(res, 422, 'Validation failed', parsed.error.flatten().fieldErrors);
    }

    try {
      const result = await pdevWorkflowBridge.recordDecision({
        workflowRunId: runId,
        checkpointId,
        organizationId: orgId,
        userId,
        userRole: parsed.data.userRole,
        decision: parsed.data.decision,
        reason: parsed.data.reason,
      });
      return ok(res, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Decision failed';
      if (
        message.includes('not found') ||
        message.includes('only awaiting_review is decidable')
      ) {
        return clientError(res, 409, message);
      }
      return serverError(res, log, 'Workflow checkpoint decision', err);
    }
  }
);

// ─── POST /api/pdev/admin/readiness/snapshot-all ───────────────────────────
//
// Batch-snapshot readiness for every active PDEV program in the caller's
// organization. Role-gated (admin / superadmin / regulatory_lead) — this
// writes one snapshot row per active program, so it must not be open to
// every authenticated user. Scoped to the caller's org; never org-wide
// from the HTTP surface (an org-wide sweep is the interval worker's job).

router.post('/admin/readiness/snapshot-all', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const userId = getUserId(req);
  const role = getUserRole(req);

  if (!READINESS_BATCH_ROLES.has(role)) {
    return clientError(
      res,
      403,
      'Batch readiness snapshot requires an admin or regulatory-lead role.'
    );
  }

  try {
    const result = await pdevReadinessScheduler.snapshotActivePrograms(orgId, userId);
    void auditService.logAction({
      tenantId: orgId,
      userId: userId ?? undefined,
      action: 'pdev_readiness_snapshot_batch',
      resourceType: 'organization',
      resourceId: orgId,
      details: {
        programsConsidered: result.programsConsidered,
        snapshotted: result.snapshotted,
      },
    });
    return ok(res, result);
  } catch (err) {
    return serverError(res, log, 'Batch readiness snapshot', err);
  }
});

export default router;
