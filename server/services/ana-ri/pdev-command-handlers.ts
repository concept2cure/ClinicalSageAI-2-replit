/**
 * AnA PDEV command handlers — gives AnA full conversational control over the
 * PDEV → IND workflow surface.
 *
 * Design principles (mirrors mdx-command-handlers.ts):
 *
 * 1. Every governed mutation requires `confirm: 'yes'` + `reason` per the
 *    `requireGovernedToolGate` policy. Read-only handlers skip the gate.
 *
 * 2. Audit codes are prefixed `agent.ana.pdev.<verb>` so an auditor can
 *    distinguish AnA-initiated PDEV mutations from human ones via the
 *    underlying service's audit_logs rows (auditService is dual-write
 *    hash-chain).
 *
 * 3. Tenant scope: every handler reads ctx.organizationId from the chat
 *    context and passes it to the underlying PDEV service. The service
 *    enforces tenant isolation via its JOIN on regulatory_programs.
 *
 * 4. The 16 commands cover every PDEV → IND verb a regulated user would
 *    issue in natural conversation:
 *      - registry / program / workstream / readiness inspection
 *      - IND assembly readiness + compile (gated)
 *      - FDA interaction stream + feedback rollup (propose + apply)
 *      - contradiction registry
 *      - activity state writes + AI drafting
 *      - evidence attach / detach / list
 *
 * @module server/services/ana-ri/pdev-command-handlers
 */

import auditService from '../auditService';
import type { CommandContext, CommandResult } from './command-executor';
import { requireGovernedToolGate, mapServiceError, agentAuditDetails } from './mdx-tool-policy';

import { pdevOrchestrator } from '../pdev/pdev-orchestrator';
import { pdevReadinessService } from '../pdev/pdev-readiness-service';
import { pdevIndAssemblyService } from '../pdev/pdev-ind-assembly';
import { pdevFdaInteractionsService } from '../pdev/pdev-fda-interactions';
import { pdevContradictionBridge } from '../pdev/pdev-contradiction-bridge';
import { pdevAiDraftingService } from '../pdev/pdev-ai-drafting';
import { pdevEctdCompileService } from '../pdev/pdev-ectd-compile';
import { pdevFdaFeedbackRollupService } from '../pdev/pdev-fda-feedback-rollup';
import { pdevEvidenceAttachService } from '../pdev/pdev-evidence-attach';
import { pdevProvenanceTraceService } from '../pdev/pdev-provenance-trace';
import { pdevWorkflowBridge } from '../pdev/pdev-workflow-bridge';
import { applyIndClearanceIfTerminal } from '../pdev/pdev-clearance';
import {
  PDEV_ACTIVITIES,
  PDEV_WORKSTREAMS,
  PDEV_STAGES,
  PDEV_ACTIVITY_STATES,
  getActivityByKey,
  type PdevActivityState,
  type PdevWorkstream,
} from '../pdev/pdev-activity-registry';
import {
  checkStateTransition,
  describeBlockers,
} from '../pdev/pdev-state-guard';

// ─── Local helpers ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function strParam(params: Record<string, unknown>, key: string): string | null {
  const v = params[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function numParam(params: Record<string, unknown>, key: string): number | null {
  const v = params[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function boolParam(params: Record<string, unknown>, key: string): boolean {
  const v = params[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  return false;
}

function requireProgramId(action: string, params: Record<string, unknown>): CommandResult | string {
  const programId = strParam(params, 'programId');
  if (!programId || !UUID_RE.test(programId)) {
    return {
      success: false,
      action,
      message: 'programId is required and must be a UUID.',
      error: 'INVALID_INPUT',
    };
  }
  return programId;
}

function requireActivityKey(
  action: string,
  params: Record<string, unknown>
): CommandResult | string {
  const key = strParam(params, 'activityKey');
  if (!key) {
    return {
      success: false,
      action,
      message: 'activityKey is required.',
      error: 'INVALID_INPUT',
    };
  }
  if (!getActivityByKey(key)) {
    return {
      success: false,
      action,
      message: `Unknown PDEV activity: ${key}. Use pdev.registry.list to see valid keys.`,
      error: 'UNKNOWN_ACTIVITY',
    };
  }
  return key;
}

// ═══════════════════════════════════════════════════════════════════════════
// READ-ONLY HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

export async function pdevRegistryList(
  _ctx: CommandContext,
  _params: Record<string, unknown>
): Promise<CommandResult> {
  return {
    success: true,
    action: 'pdev.registry.list',
    message: `${PDEV_ACTIVITIES.length} canonical PDEV activities across ${PDEV_WORKSTREAMS.length} workstreams.`,
    data: {
      activities: PDEV_ACTIVITIES,
      workstreams: PDEV_WORKSTREAMS,
      stages: PDEV_STAGES,
      states: PDEV_ACTIVITY_STATES,
    },
  };
}

export async function pdevProgramGet(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.program.get';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  try {
    const view = await pdevOrchestrator.getProgramView(programIdOrErr, ctx.organizationId);
    if (!view) {
      return { success: false, action, message: 'Program not found in tenant.', error: 'NOT_FOUND' };
    }
    return {
      success: true,
      action,
      message: `Loaded PDEV view for ${view.program.productName}.`,
      data: { view },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevProgramReadiness(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.program.readiness';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  try {
    const report = await pdevReadinessService.computeReadiness(
      programIdOrErr,
      ctx.organizationId
    );
    if (!report) {
      return { success: false, action, message: 'Program not found in tenant.', error: 'NOT_FOUND' };
    }
    return {
      success: true,
      action,
      message: `Overall PDEV readiness ${report.overall.readinessScore}%; ${report.findings.length} finding(s).`,
      data: { report },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevProgramWorkstream(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.program.workstream';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const workstream = strParam(params, 'workstream');
  if (!workstream || !PDEV_WORKSTREAMS.includes(workstream as PdevWorkstream)) {
    return {
      success: false,
      action,
      message: `workstream must be one of: ${PDEV_WORKSTREAMS.join(', ')}.`,
      error: 'INVALID_INPUT',
    };
  }
  try {
    const view = await pdevOrchestrator.getProgramView(programIdOrErr, ctx.organizationId);
    if (!view) {
      return { success: false, action, message: 'Program not found in tenant.', error: 'NOT_FOUND' };
    }
    const ws = workstream as PdevWorkstream;
    const rollup = view.workstreams.find(w => w.workstream === ws);
    const activities = view.activities.filter(a => a.registry.workstream === ws);
    return {
      success: true,
      action,
      message: `Workstream ${ws}: ${rollup?.completedActivities ?? 0}/${rollup?.totalActivities ?? 0} complete, readiness ${rollup?.readinessScore ?? 0}%.`,
      data: { workstream: ws, rollup, activities },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevProgramIndAssembly(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.program.ind_assembly';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  try {
    const report = await pdevIndAssemblyService.getReadiness(programIdOrErr, ctx.organizationId);
    if (!report) {
      return { success: false, action, message: 'Program not found in tenant.', error: 'NOT_FOUND' };
    }
    return {
      success: true,
      action,
      message: `IND assembly readiness ${report.overallReadiness}% (${report.blockers.length} mandatory blocker(s)). Readiness only — not eCTD publishing.`,
      data: { report },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevProgramFdaInteractions(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.program.fda_interactions';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  try {
    const stream = await pdevFdaInteractionsService.getStream(
      programIdOrErr,
      ctx.organizationId
    );
    if (!stream) {
      return { success: false, action, message: 'Program not found in tenant.', error: 'NOT_FOUND' };
    }
    return {
      success: true,
      action,
      message: `${stream.items.length} FDA touchpoint(s) — q_sub: ${stream.counts.qSubmissions}, comms: ${stream.counts.fdaCommunications}.`,
      data: { stream },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevProgramContradictions(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.program.contradictions';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  try {
    const registry = await pdevContradictionBridge.getRegistry(
      programIdOrErr,
      ctx.organizationId,
      {
        severity: strParam(params, 'severity') as
          | 'critical'
          | 'high'
          | 'medium'
          | 'low'
          | null
          ?? undefined,
        projectId: numParam(params, 'projectId') ?? undefined,
        limit: numParam(params, 'limit') ?? undefined,
      }
    );
    if (!registry) {
      return { success: false, action, message: 'Program not found in tenant.', error: 'NOT_FOUND' };
    }
    return {
      success: true,
      action,
      message: `${registry.counts.open} open contradiction(s); ${registry.counts.resolved} resolved.`,
      data: { registry },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevFdaFeedbackProposals(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.fda_feedback.proposals';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  try {
    const minConfidence = numParam(params, 'minConfidence') ?? undefined;
    const report = await pdevFdaFeedbackRollupService.proposeRollup(
      programIdOrErr,
      ctx.organizationId,
      { minConfidence }
    );
    if (!report) {
      return { success: false, action, message: 'Program not found in tenant.', error: 'NOT_FOUND' };
    }
    const matched = report.proposals.filter(p => p.match).length;
    return {
      success: true,
      action,
      message: `${report.totalUnrolledCommitments} unrolled commitment(s); ${matched} have a confident PDEV activity match.`,
      data: { report },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevActivityProvenance(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.activity.provenance';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const activityKeyOrErr = requireActivityKey(action, params);
  if (typeof activityKeyOrErr !== 'string') return activityKeyOrErr;
  try {
    const trace = await pdevProvenanceTraceService.trace(
      programIdOrErr,
      ctx.organizationId,
      activityKeyOrErr
    );
    if (!trace) {
      return {
        success: false,
        action,
        message: 'Program or activity not found in tenant.',
        error: 'NOT_FOUND',
      };
    }
    return {
      success: true,
      action,
      message: `Traced ${trace.counts.artifacts} artifact(s), ${trace.counts.evidence} evidence row(s), ${trace.counts.lineageEdges} lineage edge(s), ${trace.counts.auditEvents} audit event(s) for ${activityKeyOrErr}.`,
      data: { trace },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevActivityEvidenceList(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.activity.evidence_list';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const activityKeyOrErr = requireActivityKey(action, params);
  if (typeof activityKeyOrErr !== 'string') return activityKeyOrErr;
  try {
    const evidence = await pdevEvidenceAttachService.listForActivity(
      programIdOrErr,
      ctx.organizationId,
      activityKeyOrErr
    );
    return {
      success: true,
      action,
      message: `${evidence.length} evidence object(s) attached to ${activityKeyOrErr}.`,
      data: { activityKey: activityKeyOrErr, evidence },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GOVERNED MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function pdevActivitySetState(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.activity.set_state';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const activityKeyOrErr = requireActivityKey(action, params);
  if (typeof activityKeyOrErr !== 'string') return activityKeyOrErr;

  const newState = strParam(params, 'state');
  if (
    !newState ||
    !(PDEV_ACTIVITY_STATES as readonly string[]).includes(newState)
  ) {
    return {
      success: false,
      action,
      message: `state must be one of: ${PDEV_ACTIVITY_STATES.join(', ')}.`,
      error: 'INVALID_INPUT',
    };
  }

  // Dependency gate — same check the HTTP route runs.
  const forced = boolParam(params, 'force');
  const transitionGate = await checkStateTransition(
    programIdOrErr,
    activityKeyOrErr,
    newState as PdevActivityState
  );
  if (!transitionGate.allowed && !forced) {
    return {
      success: false,
      action,
      message: describeBlockers(transitionGate.blockers),
      error: 'DEPENDENCY_BLOCKERS',
      data: {
        blockers: transitionGate.blockers,
        hint: 'Re-issue with force=true and a reason that documents why the override is justified.',
      },
    };
  }

  // Reuse the underlying route's mutation path so audit + governance
  // stay aligned. Calling the route handler directly is heavy; instead
  // we re-implement the upsert here with the same audit code prefix.
  try {
    const { db } = await import('../../db');
    const { eq, and } = await import('drizzle-orm');
    const { pdevProgramActivities } = await import('../../../shared/schema/pdev-workflow');

    const activity = getActivityByKey(activityKeyOrErr)!;
    const existing = await db
      .select()
      .from(pdevProgramActivities)
      .where(
        and(
          eq(pdevProgramActivities.programId, programIdOrErr),
          eq(pdevProgramActivities.activityKey, activityKeyOrErr)
        )
      )
      .limit(1);

    const notes = strParam(params, 'notes');
    const now = new Date();
    let stateRowId: string;
    const previousState = existing[0]?.state ?? 'not_started';
    if (existing[0]) {
      const updated = await db
        .update(pdevProgramActivities)
        .set({
          state: newState,
          notes: notes ?? existing[0].notes,
          stateChangedAt: now,
          stateChangedBy: ctx.userId,
          updatedAt: now,
        })
        .where(eq(pdevProgramActivities.id, existing[0].id))
        .returning({ id: pdevProgramActivities.id });
      stateRowId = updated[0].id;
    } else {
      const inserted = await db
        .insert(pdevProgramActivities)
        .values({
          programId: programIdOrErr,
          activityKey: activityKeyOrErr,
          workstream: activity.workstream,
          stage: activity.stage,
          state: newState,
          notes: notes ?? null,
          stateChangedAt: now,
          stateChangedBy: ctx.userId,
        })
        .returning({ id: pdevProgramActivities.id });
      stateRowId = inserted[0].id;
    }

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.pdev.activity.set_state',
      resourceType: 'pdev_program_activity',
      resourceId: stateRowId,
      details: { ...agentAuditDetails(ctx, gate),
        programId: programIdOrErr,
        activityKey: activityKeyOrErr,
        previousState,
        newState,
        dependencyGateOverridden: forced && !transitionGate.allowed,
        ...(forced && !transitionGate.allowed
          ? { overriddenBlockers: transitionGate.blockers.map(b => b.activityKey) }
          : {}),
      },
    });

    // Terminal IND-clearance transition (no-op unless this is the
    // clearance activity reaching a completed state).
    const clearance = await applyIndClearanceIfTerminal({
      programId: programIdOrErr,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      activityKey: activityKeyOrErr,
      newState: newState as PdevActivityState,
    });

    return {
      success: true,
      action,
      message: clearance.cleared
        ? `Activity ${activityKeyOrErr} → ${newState}. IND cleared — program moved to its terminal approved state.`
        : `Activity ${activityKeyOrErr} → ${newState} (was ${previousState}).`,
      data: {
        activityStateId: stateRowId,
        previousState,
        newState,
        indCleared: clearance.cleared,
      },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevActivityAiDraft(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.activity.ai_draft';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const activityKeyOrErr = requireActivityKey(action, params);
  if (typeof activityKeyOrErr !== 'string') return activityKeyOrErr;

  const projectId = numParam(params, 'projectId');
  if (!projectId) {
    return {
      success: false,
      action,
      message: 'projectId (number) is required for governed AI drafting.',
      error: 'INVALID_INPUT',
    };
  }

  try {
    const result = await pdevAiDraftingService.generateActivityDraft({
      programId: programIdOrErr,
      organizationId: ctx.organizationId,
      projectId,
      userId: ctx.userId,
      activityKey: activityKeyOrErr,
      documentCode: strParam(params, 'documentCode') ?? undefined,
      userPrompt: strParam(params, 'userPrompt') ?? undefined,
      evidenceObjectIds: Array.isArray(params.evidenceObjectIds)
        ? (params.evidenceObjectIds as string[]).filter(s => typeof s === 'string')
        : undefined,
    });

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.pdev.activity.ai_draft',
      resourceType: 'pdev_program_activity',
      resourceId: result.activityStateId,
      details: { ...agentAuditDetails(ctx, gate),
        programId: programIdOrErr,
        activityKey: activityKeyOrErr,
        artifactId: result.artifactId,
        documentCode: result.documentCode,
        qualityGrade: result.qualityGrade,
      },
    });

    return {
      success: true,
      action,
      message: `Drafted ${result.title} (${result.wordCount} words, quality ${result.qualityGrade}). Filed against ${result.documentCode}${result.ectdSection ? ' · eCTD ' + result.ectdSection : ''}.`,
      data: result as unknown as Record<string, unknown>,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevActivityEvidenceAttach(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.activity.evidence_attach';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const activityKeyOrErr = requireActivityKey(action, params);
  if (typeof activityKeyOrErr !== 'string') return activityKeyOrErr;
  const evidenceId = strParam(params, 'evidenceObjectId');
  if (!evidenceId || !UUID_RE.test(evidenceId)) {
    return {
      success: false,
      action,
      message: 'evidenceObjectId is required and must be a UUID.',
      error: 'INVALID_INPUT',
    };
  }
  try {
    const result = await pdevEvidenceAttachService.attach({
      programId: programIdOrErr,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      activityKey: activityKeyOrErr,
      evidenceObjectId: evidenceId,
      linkType: strParam(params, 'linkType') as
        | 'supports'
        | 'contradicts'
        | 'references'
        | 'supersedes'
        | null
        ?? undefined,
      strength: strParam(params, 'strength') as
        | 'strong'
        | 'moderate'
        | 'weak'
        | null
        ?? undefined,
      rationale: strParam(params, 'rationale') ?? undefined,
    });
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.pdev.activity.evidence_attach',
      resourceType: 'pdev_program_activity',
      resourceId: result.activityStateId,
      details: { ...agentAuditDetails(ctx, gate),
        programId: programIdOrErr,
        activityKey: activityKeyOrErr,
        evidenceObjectId: evidenceId,
      },
    });
    return {
      success: true,
      action,
      message: `Attached evidence ${evidenceId} to ${activityKeyOrErr}.`,
      data: result as unknown as Record<string, unknown>,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevActivityEvidenceDetach(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.activity.evidence_detach';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const activityKeyOrErr = requireActivityKey(action, params);
  if (typeof activityKeyOrErr !== 'string') return activityKeyOrErr;
  const evidenceId = strParam(params, 'evidenceObjectId');
  if (!evidenceId || !UUID_RE.test(evidenceId)) {
    return {
      success: false,
      action,
      message: 'evidenceObjectId is required and must be a UUID.',
      error: 'INVALID_INPUT',
    };
  }
  try {
    const result = await pdevEvidenceAttachService.detach({
      programId: programIdOrErr,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      activityKey: activityKeyOrErr,
      evidenceObjectId: evidenceId,
    });
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.pdev.activity.evidence_detach',
      resourceType: 'pdev_program_activity',
      resourceId: result.activityStateId,
      details: { ...agentAuditDetails(ctx, gate),
        programId: programIdOrErr,
        activityKey: activityKeyOrErr,
        evidenceObjectId: evidenceId,
        removedLinks: result.removedLinks,
      },
    });
    return {
      success: true,
      action,
      message: `Detached evidence ${evidenceId} from ${activityKeyOrErr} (${result.removedLinks} link(s) removed).`,
      data: result as unknown as Record<string, unknown>,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevFdaFeedbackApply(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.fda_feedback.apply';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;

  const raw = params.mappings;
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      success: false,
      action,
      message: 'mappings must be a non-empty array of {commitmentId, activityKey, forceState?}.',
      error: 'INVALID_INPUT',
    };
  }
  const mappings: Array<{ commitmentId: string; activityKey: string; forceState?: boolean }> = [];
  for (const m of raw as Array<Record<string, unknown>>) {
    const commitmentId = strParam(m, 'commitmentId');
    const activityKey = strParam(m, 'activityKey');
    if (!commitmentId || !UUID_RE.test(commitmentId) || !activityKey) {
      return {
        success: false,
        action,
        message: 'Each mapping needs commitmentId (UUID) + activityKey.',
        error: 'INVALID_INPUT',
      };
    }
    if (!getActivityByKey(activityKey)) {
      return {
        success: false,
        action,
        message: `Unknown activity key: ${activityKey}`,
        error: 'UNKNOWN_ACTIVITY',
      };
    }
    mappings.push({
      commitmentId,
      activityKey,
      forceState: boolParam(m, 'forceState'),
    });
  }

  try {
    const result = await pdevFdaFeedbackRollupService.applyRollup({
      programId: programIdOrErr,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      mappings,
    });
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.pdev.fda_feedback.apply',
      resourceType: 'regulatory_program',
      resourceId: programIdOrErr,
      details: { ...agentAuditDetails(ctx, gate),
        appliedCount: result.applied.length,
        skippedCount: result.skipped.length,
      },
    });
    return {
      success: true,
      action,
      message: `Applied ${result.applied.length} rollup(s); skipped ${result.skipped.length}.`,
      data: result as unknown as Record<string, unknown>,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevIndAssemblyCompile(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.ind_assembly.compile';
  // This is the most consequential PDEV verb — bump the reason floor.
  const gate = requireGovernedToolGate(action, ctx, params, { minReasonLength: 30 });
  if (!gate.ok) return gate.result;

  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const submissionId = numParam(params, 'submissionId');
  if (!submissionId) {
    return {
      success: false,
      action,
      message: 'submissionId (numeric project id) is required.',
      error: 'INVALID_INPUT',
    };
  }
  try {
    const result = await pdevEctdCompileService.compile({
      programId: programIdOrErr,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      submissionId,
      region: strParam(params, 'region') ?? undefined,
      submissionType: strParam(params, 'submissionType') ?? undefined,
      sequenceNumber: strParam(params, 'sequenceNumber') ?? undefined,
      applicationNumber: strParam(params, 'applicationNumber') ?? undefined,
      readinessThreshold: numParam(params, 'readinessThreshold') ?? undefined,
      force: boolParam(params, 'force'),
    });
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.pdev.ind_assembly.compile',
      resourceType: 'regulatory_program',
      resourceId: programIdOrErr,
      details: { ...agentAuditDetails(ctx, gate),
        status: result.status,
        readinessAtCompile: result.readinessSnapshot.overallReadiness,
        thresholdApplied: result.thresholdApplied,
        forced: result.forced,
      },
    });
    if (result.status === 'refused_low_readiness') {
      return {
        success: false,
        action,
        message: result.refusalReason ?? 'Readiness too low to compile.',
        error: 'READINESS_TOO_LOW',
        data: {
          readinessSnapshot: result.readinessSnapshot,
          thresholdApplied: result.thresholdApplied,
        },
      };
    }
    return {
      success: true,
      action,
      message: `Compiled ${result.package?.filename} (${result.package?.sizeBytes} bytes). Readiness ${result.readinessSnapshot.overallReadiness}%. eCTD assembly readiness — not new publishing.`,
      data: {
        filename: result.package?.filename,
        sizeBytes: result.package?.sizeBytes,
        stats: result.package?.stats,
        readinessAtCompile: result.readinessSnapshot.overallReadiness,
        thresholdApplied: result.thresholdApplied,
        forced: result.forced,
      },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevReadinessSnapshot(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.readiness.snapshot';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  try {
    const report = await pdevReadinessService.snapshot(
      programIdOrErr,
      ctx.organizationId,
      ctx.userId,
      'manual'
    );
    if (!report) {
      return { success: false, action, message: 'Program not found in tenant.', error: 'NOT_FOUND' };
    }
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.pdev.readiness.snapshot',
      resourceType: 'regulatory_program',
      resourceId: programIdOrErr,
      details: { ...agentAuditDetails(ctx, gate),
        overallReadiness: report.overall.readinessScore,
      },
    });
    return {
      success: true,
      action,
      message: `Snapshotted readiness; overall ${report.overall.readinessScore}%.`,
      data: { report },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW BRIDGE — multi-step approval chains
// ═══════════════════════════════════════════════════════════════════════════

export async function pdevWorkflowKickoff(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.workflow.kickoff';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const activityKeyOrErr = requireActivityKey(action, params);
  if (typeof activityKeyOrErr !== 'string') return activityKeyOrErr;

  const targetState = strParam(params, 'targetState');
  const completedStates = ['approved', 'locked', 'submission_ready', 'submitted'];
  if (!targetState || !completedStates.includes(targetState)) {
    return {
      success: false,
      action,
      message: `targetState must be one of: ${completedStates.join(', ')}.`,
      error: 'INVALID_INPUT',
    };
  }

  try {
    const result = await pdevWorkflowBridge.kickoff({
      programId: programIdOrErr,
      organizationId: ctx.organizationId,
      activityKey: activityKeyOrErr,
      targetState: targetState as PdevActivityState,
      requestedByUserId: ctx.userId,
      requestedByRole: ctx.userRole,
      reason: typeof params.reason === 'string' ? params.reason : undefined,
    });
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.pdev.workflow.kickoff',
      resourceType: 'workflow_run',
      resourceId: result.workflowRunId,
      details: { ...agentAuditDetails(ctx, gate),
        programId: programIdOrErr,
        activityKey: activityKeyOrErr,
        targetState,
        checkpointCount: result.checkpointIds.length,
      },
    });
    return {
      success: true,
      action,
      message: `Started ${result.checkpointIds.length}-step approval chain for ${activityKeyOrErr} → ${targetState}. Activity held at ${result.holdingState}.`,
      data: result as unknown as Record<string, unknown>,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevWorkflowStatus(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.workflow.status';
  const programIdOrErr = requireProgramId(action, params);
  if (typeof programIdOrErr !== 'string') return programIdOrErr;
  const activityKeyOrErr = requireActivityKey(action, params);
  if (typeof activityKeyOrErr !== 'string') return activityKeyOrErr;
  try {
    const status = await pdevWorkflowBridge.getChainStatus(
      programIdOrErr,
      ctx.organizationId,
      activityKeyOrErr
    );
    if (!status) {
      return {
        success: true,
        action,
        message: `No workflow run on record for ${activityKeyOrErr}.`,
        data: { workflowRunId: null, checkpoints: [] },
      };
    }
    return {
      success: true,
      action,
      message: `Workflow ${status.workflowStatus}; step ${
        status.checkpoints.findIndex(c => c.status === 'awaiting_review') + 1
      } of ${status.checkpoints.length} awaiting review.`,
      data: { status },
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

export async function pdevWorkflowDecide(
  ctx: CommandContext,
  params: Record<string, unknown>
): Promise<CommandResult> {
  const action = 'pdev.workflow.decide';
  const gate = requireGovernedToolGate(action, ctx, params);
  if (!gate.ok) return gate.result;

  const workflowRunId = strParam(params, 'workflowRunId');
  const checkpointId = strParam(params, 'checkpointId');
  const decision = strParam(params, 'decision');
  if (!workflowRunId || !UUID_RE.test(workflowRunId)) {
    return {
      success: false,
      action,
      message: 'workflowRunId is required and must be a UUID.',
      error: 'INVALID_INPUT',
    };
  }
  if (!checkpointId || !UUID_RE.test(checkpointId)) {
    return {
      success: false,
      action,
      message: 'checkpointId is required and must be a UUID.',
      error: 'INVALID_INPUT',
    };
  }
  if (!decision || (decision !== 'approve' && decision !== 'reject')) {
    return {
      success: false,
      action,
      message: 'decision must be one of: approve, reject.',
      error: 'INVALID_INPUT',
    };
  }
  const reason = typeof params.reason === 'string' ? params.reason.trim() : '';
  if (reason.length < 10) {
    return {
      success: false,
      action,
      message: 'reason is required (≥10 chars).',
      error: 'INVALID_INPUT',
    };
  }
  try {
    const result = await pdevWorkflowBridge.recordDecision({
      workflowRunId,
      checkpointId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userRole: ctx.userRole,
      decision: decision as 'approve' | 'reject',
      reason,
    });
    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: `agent.ana.pdev.workflow.${decision}`,
      resourceType: 'approval_checkpoint',
      resourceId: checkpointId,
      details: { ...agentAuditDetails(ctx, gate),
        workflowRunId,
        decision,
        finalState: result.activityFinalState,
      },
    });
    return {
      success: result.checkpointStatus !== 'failed',
      action,
      message:
        result.activityFinalState
          ? `Chain complete; activity advanced to ${result.activityFinalState}.`
          : result.nextCheckpointId
          ? `Checkpoint approved; next checkpoint ${result.nextCheckpointId} awaiting review.`
          : result.checkpointStatus === 'failed'
          ? `Rejected: ${result.rejectionReason ?? reason}.`
          : `Decision recorded (status=${result.checkpointStatus}).`,
      data: result as unknown as Record<string, unknown>,
    };
  } catch (err) {
    return mapServiceError(action, err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// METADATA — used by the AnA intent parser / OpenAI tool-use surface
// ═══════════════════════════════════════════════════════════════════════════

export const PDEV_COMMAND_METADATA = [
  {
    name: 'pdev.registry.list',
    description:
      'List the closed-enum canonical PDEV → IND activity registry (52 ' +
      'activities across CMC, Nonclinical, Clinical, Regulatory; five stages). ' +
      'Read-only.',
    parameters: '(none)',
    example: '"What PDEV activities exist for the Nonclinical workstream?"',
  },
  {
    name: 'pdev.program.get',
    description:
      'Load the unified PDEV view for one program — metadata, per-workstream ' +
      'rollup, per-activity state, latest readiness snapshot. Read-only.',
    parameters: 'programId (UUID)',
    example: '"Show me the PDEV state for OR-801."',
  },
  {
    name: 'pdev.program.readiness',
    description:
      'Compute per-workstream and overall PDEV readiness plus blocker / ' +
      'overdue / next-action findings. Read-only.',
    parameters: 'programId (UUID)',
    example: '"What is blocking IND for program OR-801?"',
  },
  {
    name: 'pdev.program.workstream',
    description:
      'Drill into one PDEV workstream (cmc, nonclinical, clinical, regulatory) ' +
      'for a program — rollup + activity-level state. Read-only.',
    parameters: 'programId (UUID), workstream (cmc|nonclinical|clinical|regulatory)',
    example: '"What is the CMC status on OR-801?"',
  },
  {
    name: 'pdev.program.ind_assembly',
    description:
      'Compute IND assembly readiness across eCTD modules M1–M5 (mandatory ' +
      'document presence). Labelled as readiness, not publishing. Read-only.',
    parameters: 'programId (UUID)',
    example: '"How ready is OR-801 for IND assembly?"',
  },
  {
    name: 'pdev.program.fda_interactions',
    description:
      'Chronological stream of FDA touchpoints for a program — q_submissions ' +
      'family (INTERACT / Pre-IND / SIR / SRD) + fda_communications. Read-only.',
    parameters: 'programId (UUID)',
    example: '"Walk me through every FDA interaction on OR-801."',
  },
  {
    name: 'pdev.program.contradictions',
    description:
      'Open contradiction registry for a program, via the existing contradiction ' +
      'engine. Filter by severity / authorityState / reviewState / limit. ' +
      'Read-only.',
    parameters: 'programId (UUID), severity?, projectId?, limit?',
    example: '"Show me the critical contradictions on OR-801."',
  },
  {
    name: 'pdev.fda_feedback.proposals',
    description:
      'Propose PDEV activity matches for unrolled q_sub_commitments using a ' +
      'deterministic token-overlap heuristic. Read-only, no mutation.',
    parameters: 'programId (UUID), minConfidence? (0..1)',
    example: '"What FDA commitments need to be rolled into PDEV activities?"',
  },
  {
    name: 'pdev.activity.evidence_list',
    description:
      'List evidence objects currently attached to one PDEV activity. Read-only.',
    parameters: 'programId (UUID), activityKey',
    example: '"What evidence is attached to nonclinical.glp_tox on OR-801?"',
  },
  {
    name: 'pdev.activity.provenance',
    description:
      'Full regulatory traceability trace for one PDEV activity — activity ' +
      'state + attached evidence + AI-drafted artifacts + data-lineage edges + ' +
      'audit events. Read-only. Single read across existing tables; no new ' +
      'schema. Use when an auditor or reviewer asks "where did this come from?"',
    parameters: 'programId (UUID), activityKey',
    example:
      '"Show me the full provenance trace for nonclinical.ind_enabling_summary on OR-801."',
  },
  {
    name: 'pdev.activity.set_state',
    description:
      'Move one PDEV activity to a new lifecycle state (draft / in_review / ' +
      'approved / locked / superseded etc.). Promotion into a completed state ' +
      '(approved / locked / submission_ready / submitted) is dependency-gated: ' +
      'the registry dependsOn chain must be satisfied, or pass force=true to ' +
      'override. The override is audit-flagged. Requires confirm + reason.',
    parameters:
      'programId, activityKey, state, notes?, force?, confirm="yes", reason',
    example:
      '"Mark cmc.formulation_development as approved on OR-801, reason: SAP and stability data finalized."',
  },
  {
    name: 'pdev.activity.ai_draft',
    description:
      'Generate a governed AI draft bound to a PDEV activity via the existing ' +
      'governed-ana-execution pipeline (quality gate, decision lineage, ' +
      'citations). Lands as a versioned concept2cure_artifact and moves the ' +
      'activity to ai_draft_generated. Requires confirm + reason.',
    parameters:
      'programId, activityKey, projectId, documentCode?, userPrompt?, evidenceObjectIds?, confirm="yes", reason',
    example:
      '"Draft my GLP toxicology summary into Module 4 for OR-801, reason: prepping briefing book."',
  },
  {
    name: 'pdev.activity.evidence_attach',
    description:
      'Attach an evidence_objects row to a PDEV activity via the existing ' +
      'evidence_links table. First attach advances state to evidence_linked. ' +
      'Requires confirm + reason.',
    parameters:
      'programId, activityKey, evidenceObjectId (UUID), linkType?, strength?, rationale?, confirm="yes", reason',
    example:
      '"Attach PMID 12345678 to clinical.endpoint_rationale on OR-801, reason: justifies the primary endpoint."',
  },
  {
    name: 'pdev.activity.evidence_detach',
    description:
      'Remove an evidence link from a PDEV activity. Does not delete the ' +
      'evidence object itself. Requires confirm + reason.',
    parameters: 'programId, activityKey, evidenceObjectId (UUID), confirm="yes", reason',
    example:
      '"Detach evidence <uuid> from clinical.full_protocol, reason: superseded by newer literature."',
  },
  {
    name: 'pdev.fda_feedback.apply',
    description:
      'Apply a set of (commitment → PDEV activity) mappings. Appends the ' +
      'commitment text to the activity notes, advances activity state to ' +
      'agency_feedback_received (preserving already-completed states unless ' +
      'forceState=true per mapping), and marks the commitment rolled_in. ' +
      'Requires confirm + reason.',
    parameters:
      'programId, mappings (array of {commitmentId, activityKey, forceState?}), confirm="yes", reason',
    example:
      '"Roll up the two open FDA commitments — cm-1142-1 to nonclinical.glp_tox and cm-1142-2 to cmc.specifications. Reason: post-Pre-IND triage."',
  },
  {
    name: 'pdev.ind_assembly.compile',
    description:
      'Invoke the existing eCTD compile primitive once IND assembly mandatory- ' +
      'document readiness is at or above threshold (default 90 %). Refuses ' +
      'compile below threshold unless force=true. eCTD assembly — not new ' +
      'publishing. Requires confirm + reason ≥ 30 chars.',
    parameters:
      'programId, submissionId (numeric), region?, submissionType?, sequenceNumber?, applicationNumber?, readinessThreshold?, force?, confirm="yes", reason',
    example:
      '"Compile the IND eCTD assembly for OR-801, submission 12, reason: cleared all blockers and RA sign-off complete this week."',
  },
  {
    name: 'pdev.workflow.kickoff',
    description:
      'Start a multi-step approval chain for promoting a PDEV activity to a ' +
      'completed state (approved / locked / submission_ready / submitted). ' +
      'Activity is held at human_review_required until every checkpoint is ' +
      'approved. Default chain is 2 steps (reviewer + approver). ' +
      'Requires confirm + reason.',
    parameters:
      'programId, activityKey, targetState, confirm="yes", reason',
    example:
      '"Start the approval chain for nonclinical.glp_tox to approved, reason: RA review complete and tox data clean."',
  },
  {
    name: 'pdev.workflow.status',
    description:
      'Read the current approval chain status for a PDEV activity — every ' +
      'checkpoint, its state, who has approved, what is awaiting. Read-only.',
    parameters: 'programId, activityKey',
    example:
      '"What is the workflow status of nonclinical.glp_tox on OR-801?"',
  },
  {
    name: 'pdev.workflow.decide',
    description:
      'Record an approve or reject decision on one approval checkpoint. ' +
      'On approve, the next checkpoint activates (or the activity advances ' +
      'to its target state when the chain completes). On reject, the run is ' +
      'marked failed and the activity moves to revision_required. ' +
      'Requires confirm + reason (≥10 chars).',
    parameters:
      'workflowRunId, checkpointId, decision (approve|reject), confirm="yes", reason',
    example:
      '"Approve checkpoint <uuid> on workflow <uuid>, reason: reviewer sign-off complete and supplementary tox tables uploaded."',
  },
  {
    name: 'pdev.readiness.snapshot',
    description:
      'Materialize a point-in-time readiness snapshot for the program ' +
      '(per-workstream + overall) into pdev_readiness_snapshots. Requires ' +
      'confirm + reason.',
    parameters: 'programId, confirm="yes", reason',
    example: '"Snapshot the readiness on OR-801 now, reason: weekly RA review."',
  },
];

// Dispatch map exported for command-executor to merge.
export const PDEV_COMMAND_HANDLERS: Record<
  string,
  (ctx: CommandContext, params: Record<string, unknown>) => Promise<CommandResult>
> = {
  'pdev.registry.list': pdevRegistryList,
  'pdev.program.get': pdevProgramGet,
  'pdev.program.readiness': pdevProgramReadiness,
  'pdev.program.workstream': pdevProgramWorkstream,
  'pdev.program.ind_assembly': pdevProgramIndAssembly,
  'pdev.program.fda_interactions': pdevProgramFdaInteractions,
  'pdev.program.contradictions': pdevProgramContradictions,
  'pdev.fda_feedback.proposals': pdevFdaFeedbackProposals,
  'pdev.activity.evidence_list': pdevActivityEvidenceList,
  'pdev.activity.provenance': pdevActivityProvenance,
  'pdev.activity.set_state': pdevActivitySetState,
  'pdev.activity.ai_draft': pdevActivityAiDraft,
  'pdev.activity.evidence_attach': pdevActivityEvidenceAttach,
  'pdev.activity.evidence_detach': pdevActivityEvidenceDetach,
  'pdev.fda_feedback.apply': pdevFdaFeedbackApply,
  'pdev.ind_assembly.compile': pdevIndAssemblyCompile,
  'pdev.readiness.snapshot': pdevReadinessSnapshot,
  'pdev.workflow.kickoff': pdevWorkflowKickoff,
  'pdev.workflow.status': pdevWorkflowStatus,
  'pdev.workflow.decide': pdevWorkflowDecide,
};
