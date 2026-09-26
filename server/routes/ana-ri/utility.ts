/**
 * AnA RI utility endpoints — /health, /evaluate, /observability/*, /commands,
 * /decisions. Read-mostly, no LLM generation. Grouped here because each one
 * is small and none of them share helpers beyond what's in ./shared.ts.
 *
 * Extracted from ana-ri.ts. Mounted via {@link mountUtilityRoutes}.
 *
 * @module server/routes/ana-ri/utility
 */

import type { Request, Response, Router } from 'express';

import { evaluateResponse } from '../../services/ana-ri/evaluation.js';
import {
  getGenerationLog,
  getGenerationStats,
} from '../../services/ana-ri/enforcement.js';
import { decisionLifecycleService } from '../../services/decision-lifecycle-service.js';
import { getSinceLastVisit } from '../../services/ana/since-last-visit.js';
import { loadAgentActivity } from '../../services/ana/agent-activity.js';
import { resolveDriveState } from '../../services/ana-ri/live-drive.js';
import { executeCommands, type CommandContext } from '../../services/ana-ri/command-executor.js';
import {
  governedTierOf,
  MIN_REASON_FOR_CHANGE_LEN,
} from '../../services/ana-ri/part11-governance.js';
import { isProposeOnlyCommand } from '../../services/ana-ri/command-rbac.js';
import { CONFIRM_TIER_TOOLS } from '../../services/ana/governed-tool-gate.js';
import { reverifySigner } from '../../services/part11/reverify-signer.js';
import { signerReverificationDeps } from '../../services/part11/reverify-signer-deps.js';
import {
  readPendingApproval,
  recordApprovalDecision,
} from '../../services/ana/run-control.js';
import { resolveOrgId } from '../../types/auth-request.js';
import { requestPgClient } from '../../db/requestDb';
import { handleSealVerifiedVersion } from './seal-verified.js';
import auditService from '../../services/auditService.js';
import { createScopedLogger } from '../../utils/logger.js';
import {
  sendSuccess,
  sendError,
  ensureGateway,
  isDatabaseAvailable,
  extractRequestContext,
} from './shared.js';
import { clientIpOf } from '../../utils/client-ip';

const log = createScopedLogger('ana-ri/utility');

/**
 * Resolve WHAT this request is authorising.
 *
 * When the client names a run, the command and params come from the run row,
 * never from the request body. The body would let a caller show one action in
 * the sign-off modal and post back another, so a signature the person gave for
 * "freeze document 7" would execute "freeze document 9" — a tampering window an
 * electronic signature exists to close, not open.
 *
 * The row is looked up with resolveOrgId because that is the resolver beginRun
 * stamped it with; extractRequestContext, used elsewhere in this route, reads
 * fewer sources. Two resolvers disagreeing about "which organization is this"
 * is precisely what breaks run ownership, so if they differ here the lookup
 * finds nothing and the request fails closed rather than guessing.
 *
 * Without a runId this is the original behaviour: the body is the request, as
 * it has always been for a client re-submitting a blocked chat command.
 */
async function resolveAuthorisedAction(
  req: Request,
  body: Record<string, any>,
): Promise<
  | { error: string; status: number; code: string }
  | {
      pendingForRun: Awaited<ReturnType<typeof readPendingApproval>>;
      runId: string;
      toolUseId: string;
      command: string;
      params: Record<string, unknown>;
    }
> {
  const runId = typeof body.runId === 'string' ? body.runId : '';
  const toolUseId = typeof body.toolUseId === 'string' ? body.toolUseId : '';

  if (!runId) {
    return {
      pendingForRun: null,
      runId,
      toolUseId,
      command: typeof body.command === 'string' ? body.command : '',
      params: body.params && typeof body.params === 'object' ? body.params : {},
    };
  }

  const runOrgId = resolveOrgId(req);
  const pendingForRun = runOrgId === null ? null : await readPendingApproval(requestPgClient(req), runId, runOrgId);
  if (!pendingForRun) {
    return {
      error: 'That run is not waiting on an approval',
      status: 404,
      code: 'NO_PENDING_APPROVAL',
    };
  }
  if (pendingForRun.toolUseId !== toolUseId) {
    // The run moved on, or this decision belongs to a different proposal.
    // Executing it would apply a person's decision to something they were
    // never shown.
    return {
      error: 'That approval is no longer the one in flight',
      status: 409,
      code: 'STALE_APPROVAL',
    };
  }
  return {
    pendingForRun,
    runId,
    toolUseId,
    command: pendingForRun.command,
    params: pendingForRun.params,
  };
}

/**
 * Hand a decided approval back to the turn that is waiting on it.
 *
 * Best-effort by design: the command has already run and been audited by the
 * time this is called, so a failure here costs AnA her continuation, not the
 * person's action or its record. Refusing the whole request at this point would
 * report a governed action as failed after it had already taken effect, which
 * is the worse of the two lies.
 */
async function releaseWaitingRun(
  req: Request,
  runId: string,
  toolUseId: string,
  userId: number,
  reasonForChange: string,
  outcome: { result?: unknown; error?: string; declined?: true },
): Promise<void> {
  // Bound with the SAME resolver the lookup used (resolveAuthorisedAction), so
  // the decision is written against exactly the tenant whose run was proven to
  // be waiting. Only reached when that lookup found the run, which already
  // required a non-null org — the guard is for the type, not a live branch.
  const organizationId = resolveOrgId(req);
  if (organizationId === null) {
    log.error('Refusing to record an approval decision with no organization', { runId, toolUseId });
    return;
  }
  try {
    await recordApprovalDecision(requestPgClient(req), runId, organizationId, {
      toolUseId,
      decided: outcome.error || outcome.declined ? 'denied' : 'approved',
      decidedAt: new Date().toISOString(),
      byUserId: userId,
      reasonForChange,
      ...outcome,
    });
  } catch (err: any) {
    log.error('Approved action ran but the waiting run could not be released', {
      runId,
      toolUseId,
      error: err?.message,
    });
  }
}

/**
 * A tool that writes on its own handler is confirmed like a command, but only
 * from a held run: its context — the project, and the model that wrote the
 * content — comes from the run row (runConfirmedTool), never from the browser.
 */
function refuseToolWithoutHeldRun(res: Response): Response {
  return sendError(res, 400, 'This action can only be confirmed while AnA is waiting on it', null, 'TOOL_NEEDS_HELD_RUN');
}

/**
 * Run a confirmed tool from CONFIRM_TIER_TOOLS with the context the waiting run
 * recorded when it asked.
 *
 * The handler is reached through the same registry every path uses, so its own
 * gates still run: the approved-model check reads the recorded serving model,
 * and the confirm gate reads the flag stamped here — a person's yes to exactly
 * this call. Loaded lazily: the tool module is large and this route rarely
 * needs it.
 */
async function runConfirmedTool(
  name: string,
  params: Record<string, unknown>,
  held: NonNullable<Awaited<ReturnType<typeof readPendingApproval>>>,
  organizationId: number,
  userId: number,
): Promise<unknown> {
  const { getToolHandler } = await import('../../services/ana/AnaToolExecutor.js');
  const handler = getToolHandler(name);
  if (!handler) throw new Error(`${name} is not an available tool`);
  const recorded = held.toolContext;
  const out = await handler(params, {
    organizationId,
    userId,
    projectId: recorded?.projectId ?? null,
    projectRef: recorded?.projectRef ?? null,
    servingModel: recorded?.servingModel ?? null,
    humanConfirmed: true,
  });
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

/**
 * A person's no to an action AnA is holding a turn on.
 *
 * Cancelling a live prompt used to close the dialog and tell the server
 * nothing, so the turn waited out the pause ceiling — and with every write now
 * proposed (P0-12), that would be most turns. The decision is audited (a
 * person chose it) and recorded against the run, whose waiting turn tells the
 * model the action was declined and must not be retried. Nothing executes.
 *
 * Only meaningful for a held run: a proposal from a finished turn has nothing
 * waiting on it, and dismissing it is already the whole of declining.
 */
async function declineHeldAction(
  req: Request,
  res: Response,
  held: {
    pendingForRun: Awaited<ReturnType<typeof readPendingApproval>>;
    runId: string;
    toolUseId: string;
    command: string;
    userId: number;
    numericOrgId: number;
  },
): Promise<Response> {
  if (!held.pendingForRun) {
    return sendError(res, 400, 'A decline needs the run that is waiting on it', null, 'NO_PENDING_APPROVAL');
  }
  const audit = await auditService.logAction({
    tenantId: held.numericOrgId,
    userId: held.userId,
    action: 'ana.governed_action.declined',
    resourceType: 'ana_command',
    resourceId: held.command,
    ipAddress: clientIpOf(req) ?? undefined,
    userAgent: req.headers['user-agent'] as string | undefined,
    details: { command: held.command, runId: held.runId, toolUseId: held.toolUseId, proposedByAgent: true },
  });
  // A decline runs nothing, so a lost audit row does not stop it — refusing
  // would leave AnA holding the turn for a decision already made. It is not
  // hidden either: logged, and carried to the client, which says so.
  if (!audit.persisted) {
    log.error('Decline recorded against the run but its audit row was not persisted', {
      command: held.command,
      runId: held.runId,
      reason: audit.error ?? 'no durable store accepted the row',
    });
  }
  await releaseWaitingRun(req, held.runId, held.toolUseId, held.userId, '', { declined: true });
  return sendSuccess(res, {
    success: true,
    declined: true,
    auditRecorded: audit.persisted,
    message: audit.persisted
      ? 'Declined. AnA will carry on without it.'
      : 'Declined, and AnA will carry on without it — but the decline could not be written to the audit trail.',
  });
}

/** Register utility endpoints on the given router. */
export function mountUtilityRoutes(router: Router): void {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/health — AnA runtime readiness snapshot
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/health', async (_req: Request, res: Response) => {
    const gw = ensureGateway();
    const enabledProviders = gw?.getEnabledProviders() || [];
    const providerHealth = gw?.getProviderHealth?.() || [];
    const deterministicMode = gw?.isDeterministic?.() || false;
    const databaseAvailable = await isDatabaseAvailable();

    const hasHealthyProvider = providerHealth.some((provider: any) => provider.healthy);
    const providerHealthUnavailable =
      providerHealth.length === 0 && enabledProviders.length > 0;

    const checks = {
      gateway: deterministicMode || enabledProviders.length > 0,
      providersHealthy: deterministicMode || hasHealthyProvider || providerHealthUnavailable,
      database: databaseAvailable,
    };

    const status =
      checks.gateway && checks.providersHealthy && checks.database ? 'healthy' : 'degraded';

    return sendSuccess(res, {
      status,
      checks,
      providers: enabledProviders,
      providerHealth,
      deterministicMode,
      timestamp: new Date().toISOString(),
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/ana-ri/evaluate — Evaluate a response against the rubric
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/evaluate', (req: Request, res: Response) => {
    const { response, context } = req.body;

    if (!response || typeof response !== 'string') {
      return sendError(res, 400, 'Response text is required');
    }

    const evaluation = evaluateResponse(response, context || {});
    return sendSuccess(res, evaluation);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/observability — Runtime generation stats
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/observability', (_req: Request, res: Response) => {
    const stats = getGenerationStats();
    return sendSuccess(res, stats);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/observability/log — Filtered generation log
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/observability/log', (_req: Request, res: Response) => {
    const { route, artifact, orchestrated, limit } = _req.query;
    const log = getGenerationLog({
      route: route as string | undefined,
      artifactCreated: artifact === 'true' ? true : artifact === 'false' ? false : undefined,
      anaRiOrchestrated:
        orchestrated === 'true' ? true : orchestrated === 'false' ? false : undefined,
      limit: limit ? Number(limit) : 100,
    });
    return sendSuccess(res, { count: log.length, events: log });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/commands — List registered command surface
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/commands', async (_req: Request, res: Response) => {
    try {
      const { COMMAND_REGISTRY } = await import('../../services/ana-ri/command-executor.js');
      if (!Array.isArray(COMMAND_REGISTRY)) {
        throw new Error('Command registry unavailable');
      }
      return sendSuccess(res, { commands: COMMAND_REGISTRY });
    } catch (error: any) {
      return sendError(
        res,
        503,
        error?.message || 'Command registry unavailable',
        null,
        'COMMANDS_UNAVAILABLE'
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/decisions — Decision audit trail for current project
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/decisions', async (req: Request, res: Response) => {
    try {
      const { project_id, section_code, module_code, limit } = req.query;

      // project_id arrives from the query string, so it names a project the
      // caller may not own. Decision records live in an in-memory Map, not a
      // FORCE'd RLS table, so nothing behind this handler will scope the read
      // — authenticateToken proves who is asking, not what they may see.
      const { numericOrgId } = extractRequestContext(req);
      if (!numericOrgId) {
        return sendError(
          res,
          403,
          'An organization context is required to read a decision trail.',
          null,
          'TENANT_CONTEXT_REQUIRED'
        );
      }

      if (!project_id || typeof project_id !== 'string') {
        return sendError(
          res,
          400,
          'project_id query parameter is required',
          null,
          'MISSING_PROJECT_ID'
        );
      }

      const decisionLimit = Number(limit);
      const safeLimit =
        Number.isFinite(decisionLimit) && decisionLimit > 0
          ? Math.min(Math.floor(decisionLimit), 50)
          : 20;

      const context = decisionLifecycleService.getContradictionDecisionContext(project_id, {
        sectionCode: typeof section_code === 'string' ? section_code : undefined,
        moduleCode: typeof module_code === 'string' ? module_code : undefined,
        limit: safeLimit,
        organizationId: numericOrgId,
      });

      const decisionAwareStatus = decisionLifecycleService.computeDecisionAwareStatus(
        project_id,
        {
          moduleCode: typeof module_code === 'string' ? module_code : undefined,
          organizationId: numericOrgId,
        }
      );

      return sendSuccess(res, {
        projectId: project_id,
        count: context.length,
        decisionAwareStatus,
        decisions: context,
      });
    } catch (error: any) {
      return sendError(
        res,
        500,
        error?.message || 'Failed to load decision audit trail',
        null,
        'DECISIONS_FETCH_FAILED'
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/since-last-visit?since=<ISO> — "what changed while you were
  // away": newly-overdue deadlines + newly-opened blockers / contradictions,
  // computed against the client-supplied last-visit timestamp. Org-scoped.
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/since-last-visit', async (req: Request, res: Response) => {
    const { numericOrgId } = extractRequestContext(req);
    if (!numericOrgId) {
      return sendError(res, 401, 'Organization context required', null, 'NO_ORG_CONTEXT');
    }
    const since = req.query.since;
    if (typeof since !== 'string' || since.trim() === '') {
      return sendError(res, 400, 'since (ISO timestamp) query parameter is required', null, 'MISSING_SINCE');
    }
    try {
      const result = await getSinceLastVisit({ organizationId: numericOrgId, since });
      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(
        res,
        500,
        error?.message || 'Failed to compute since-last-visit delta',
        null,
        'SINCE_LAST_VISIT_FAILED'
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/agent-activity — the live agent surface: the tenant's
  // active / stalled / recently-finished background deep investigations, for a
  // live dashboard panel to poll. Org-scoped. Fails CLOSED: a read that throws
  // (table absent, database down) is a 500 the panel renders as a failed
  // read, never an empty queue presented as "nothing is running".
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/agent-activity', async (req: Request, res: Response) => {
    const { numericOrgId } = extractRequestContext(req);
    if (!numericOrgId) {
      return sendError(res, 401, 'Organization context required', null, 'NO_ORG_CONTEXT');
    }
    try {
      const summary = await loadAgentActivity(numericOrgId);
      return sendSuccess(res, summary);
    } catch (error: any) {
      return sendError(res, 500, error?.message || 'Failed to load agent activity', null, 'AGENT_ACTIVITY_FAILED');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/live-drive/state — the pre-emptive Live Drive verdict, so
  // the toggle can show an honest lock (with the real required tier) BEFORE
  // the person burns a turn discovering it. Runs the exact per-turn decision
  // (resolveDriveState — entitlement + ENTITLEMENTS_ENFORCE mode), so the
  // toggle and the stream can never disagree. Advisory only: every drive turn
  // still resolves its own drive_state; this endpoint grants nothing.
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/live-drive/state', async (req: Request, res: Response) => {
    const { numericOrgId } = extractRequestContext(req);
    if (!numericOrgId) {
      return sendError(res, 401, 'Organization context required', null, 'NO_ORG_CONTEXT');
    }
    try {
      const state = await resolveDriveState(true, numericOrgId);
      return sendSuccess(res, {
        enabled: state.enabled,
        ...(state.reason ? { reason: state.reason } : {}),
        ...(state.requiredTier !== undefined ? { requiredTier: state.requiredTier } : {}),
      });
    } catch (error: any) {
      return sendError(
        res,
        500,
        error?.message || 'Failed to resolve Live Drive state',
        null,
        'LIVE_DRIVE_STATE_FAILED'
      );
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/ana-ri/governed-action — execute a Part 11 governed AnA command
  // WITH a verified sign-off. The client routes here after a chat command is
  // blocked with PART11_SIGNATURE_REQUIRED: it collects the reason-for-change +
  // re-authentication (password, and MFA when enabled) and posts them with the
  // original command/params. We verify the signer server-side (§11.200), record
  // the sign-off to the audit trail (§11.10(e)), then run the command through
  // the gated dispatch with a verified signoff stamped on the context.
  // Body: { command, params, reasonForChange, password, mfaToken? }
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/governed-action', async (req: Request, res: Response) => {
    const { numericOrgId, userId } = extractRequestContext(req);
    if (!numericOrgId || !userId) {
      return sendError(res, 401, 'Authentication and organization context required', null, 'AUTH_REQUIRED');
    }
    const body = req.body ?? {};
    const reasonForChange = typeof body.reasonForChange === 'string' ? body.reasonForChange.trim() : '';

    // What is being authorised. When the client names a run, this is read from
    // the ROW rather than the body — see resolveAuthorisedAction.
    const authorised = await resolveAuthorisedAction(req, body);
    if ('error' in authorised) {
      return sendError(res, authorised.status, authorised.error, null, authorised.code);
    }
    const { pendingForRun, runId, toolUseId, command, params } = authorised;
    const password = typeof body.password === 'string' ? body.password : '';
    const mfaToken = typeof body.mfaToken === 'string' ? body.mfaToken : undefined;

    // A person's no to an action AnA is holding a turn on. Checked before any
    // tier rule: declining asks for nothing, whatever the tier.
    if (body.decision === 'decline') {
      return declineHeldAction(req, res, { pendingForRun, runId, toolUseId, command, userId, numericOrgId });
    }

    // This route is ONLY for proposed commands — every write (P0-12); reads go
    // through chat. The tier decides what the person supplies: 'confirm' an
    // explicit yes, 'reason' a reason for change, 'esignature' the reason and
    // re-authentication.
    const isTool = CONFIRM_TIER_TOOLS.has(command);
    if (isTool && !pendingForRun) return refuseToolWithoutHeldRun(res);
    if (!command || !(isProposeOnlyCommand(command) || isTool)) {
      return sendError(res, 400, 'A governed command name is required', null, 'NOT_A_GOVERNED_COMMAND');
    }
    const tier = governedTierOf(command);
    if (tier === 'confirm') {
      if (body.confirm !== true) {
        return sendError(res, 400, 'Confirm the proposed action to run it', null, 'CONFIRMATION_REQUIRED');
      }
    } else if (reasonForChange.length < MIN_REASON_FOR_CHANGE_LEN) {
      return sendError(
        res,
        400,
        `A reason for change of at least ${MIN_REASON_FOR_CHANGE_LEN} characters is required`,
        null,
        'REASON_REQUIRED'
      );
    }

    // Tiered policy: high-impact actions additionally require a manifested
    // e-signature; the rest require only the reason-for-change. §11.200:
    // re-verify the signer server-side for the e-sign tier (never a client flag).
    const eSignRequired = tier === 'esignature';
    let secondFactorVerified = false;
    // The instant the server actually verified the signer, captured here rather
    // than synthesised downstream. Handlers that hand the human gate to an
    // external gateway (FDA ESG transmit) pass this through as the
    // transmission's `reauthVerifiedAt`, so it must be a real observation.
    let signatureVerifiedAt: Date | undefined;
    if (eSignRequired) {
      const verification = await reverifySigner(userId, { password, mfaToken }, signerReverificationDeps());
      if (!verification.ok) {
        return sendError(res, verification.status, verification.error, { code: verification.code }, 'SIGNATURE_REJECTED');
      }
      secondFactorVerified = verification.secondFactorVerified;
      signatureVerifiedAt = new Date();
    }

    // §11.10(e): record the sign-off to the audit trail before executing.
    // No governed mutation without a durable audit record.
    //
    // This was a try/catch whose catch returned SIGNOFF_AUDIT_FAILED — and it
    // had never once run. `auditService.logAction` swallows both of its
    // persistence sections internally and RESOLVES NORMALLY on failure; it is
    // documented never to reject. So the abort below was unreachable, and a
    // governed Part 11 action whose audit row was lost proceeded to execute
    // while the code read as though it refused to. The strictest-looking guard
    // on the e-signature path was the one doing nothing.
    //
    // logAction returns AuditWriteResult, so the refusal can be real: read
    // `persisted` and abort on it.
    const signoffAudit = await auditService.logAction({
      tenantId: numericOrgId,
      userId,
      action: `ana.governed_action.${tier === 'esignature' ? 'esign' : tier}`,
      resourceType: 'ana_command',
      resourceId: command,
      ipAddress: clientIpOf(req) ?? undefined,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: { command, tier, reasonForChange, eSignRequired, secondFactorVerified },
    });
    if (!signoffAudit.persisted) {
      log.error('Governed action aborted: sign-off audit row was not persisted', {
        command,
        organizationId: numericOrgId,
        userId,
        eSignRequired,
        reason: signoffAudit.error ?? 'no durable store accepted the row',
      });
      return sendError(res, 500, 'Could not record the sign-off in the audit trail; action aborted', null, 'SIGNOFF_AUDIT_FAILED');
    }

    const ctx: CommandContext = {
      userId,
      organizationId: numericOrgId,
      part11Enforce: true,
      // ONE OF THE TWO ASSIGNMENTS OF THIS FIELD, BOTH IN THIS ROUTE (the other
      // is runConfirmedTool's, for the tools that write on their own handlers).
      //
      // executeCommands refuses every propose-only command unless it is true,
      // so this literal is the sole path by which an agent-proposed governed
      // action can execute. Reaching here means the browser posted to
      // /api/ana-ri/governed-action after GovernedActionSignoff collected the
      // user's reason-for-change and — for the e-signature tier — the server
      // re-verified their credentials above. A person decided; that is the
      // whole claim this field carries.
      //
      // Do not stamp it anywhere else. A second writer would make the guard
      // conventional rather than structural, and the anti-drift test asserts
      // the identifier appears in exactly one source file.
      humanConfirmed: true,
      // The confirm tier carries no sign-off: the command is in neither Part 11
      // set, so the executor's sign-off gate does not apply to it, and an
      // invented reason would be a false record.
      ...(tier === 'confirm'
        ? {}
        : {
            signoff: {
              reasonForChange,
              // For the reason-only tier there is no e-signature; the gate does not
              // require one for these commands (validateSignoff requireSignature=false).
              signatureVerified: eSignRequired,
              signaturePurpose: 'approval' as const,
              verifiedAt: signatureVerifiedAt,
            },
          }),
    };
    try {
      const [result] = isTool ? [await runConfirmedTool(command, params, pendingForRun!, numericOrgId, userId)] : await executeCommands([{ command, params } as any], ctx);
      // The execution stays HERE, in the one place that stamps humanConfirmed.
      // The waiting turn is handed the RESULT, not the right to run the command
      // itself — a second dispatcher would be a second writer of that flag, and
      // the partition guard asserts it has exactly one. So AnA resumes with
      // what a person's decision produced, and there is still one execution,
      // one signature and one audit row.
      if (pendingForRun) {
        await releaseWaitingRun(req, runId, toolUseId, userId, reasonForChange, { result });
      }
      return sendSuccess(res, result);
    } catch (error: any) {
      // A failed execution must still release the run. Otherwise the turn sits
      // at a gate nobody will ever answer again until the pause ceiling expires
      // — the person signed, something broke, and AnA is left silent.
      if (pendingForRun) {
        await releaseWaitingRun(req, runId, toolUseId, userId, reasonForChange, {
          error: error?.message || 'Governed action failed',
        });
      }
      return sendError(res, 500, error?.message || 'Governed action failed', null, 'GOVERNED_ACTION_FAILED');
    }
  });

  // POST /api/ana-ri/seal-verified-version — E1: Part 11 verified-and-sealed
  // export (handler in ./seal-verified.ts). Gated behind
  // ENABLE_ANA_DOCUMENT_STUDIO (off by default).
  router.post('/seal-verified-version', handleSealVerifiedVersion);
}
