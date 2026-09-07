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
  requiresPart11Signoff,
  requiresEsignature,
  MIN_REASON_FOR_CHANGE_LEN,
} from '../../services/ana-ri/part11-governance.js';
import {
  verifySignerCredentials,
  defaultSignoffDeps,
} from '../../services/ana-ri/governed-action-signoff.js';
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

const log = createScopedLogger('ana-ri/utility');

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
    const command = typeof body.command === 'string' ? body.command : '';
    const params = body.params && typeof body.params === 'object' ? body.params : {};
    const reasonForChange = typeof body.reasonForChange === 'string' ? body.reasonForChange.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const mfaToken = typeof body.mfaToken === 'string' ? body.mfaToken : undefined;

    // This route is ONLY for governed commands — reads/drafting go through chat.
    if (!command || !requiresPart11Signoff(command)) {
      return sendError(res, 400, 'A governed command name is required', null, 'NOT_A_GOVERNED_COMMAND');
    }
    if (reasonForChange.length < MIN_REASON_FOR_CHANGE_LEN) {
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
    const eSignRequired = requiresEsignature(command);
    let secondFactorVerified = false;
    // The instant the server actually verified the signer, captured here rather
    // than synthesised downstream. Handlers that hand the human gate to an
    // external gateway (FDA ESG transmit) pass this through as the
    // transmission's `reauthVerifiedAt`, so it must be a real observation.
    let signatureVerifiedAt: Date | undefined;
    if (eSignRequired) {
      const verification = await verifySignerCredentials(defaultSignoffDeps, { userId, password, mfaToken });
      if (!verification.verified) {
        return sendError(res, 401, verification.error || 'Signature verification failed', { code: verification.code }, 'SIGNATURE_REJECTED');
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
      action: eSignRequired ? 'ana.governed_action.esign' : 'ana.governed_action.reason',
      resourceType: 'ana_command',
      resourceId: command,
      ipAddress: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.socket?.remoteAddress || undefined,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: { command, reasonForChange, eSignRequired, secondFactorVerified },
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
      // THE ONLY ASSIGNMENT OF THIS FIELD IN THE CODEBASE.
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
      signoff: {
        reasonForChange,
        // For the reason-only tier there is no e-signature; the gate does not
        // require one for these commands (validateSignoff requireSignature=false).
        signatureVerified: eSignRequired,
        signaturePurpose: 'approval',
        verifiedAt: signatureVerifiedAt,
      },
    };
    try {
      const [result] = await executeCommands([{ command, params } as any], ctx);
      return sendSuccess(res, result);
    } catch (error: any) {
      return sendError(res, 500, error?.message || 'Governed action failed', null, 'GOVERNED_ACTION_FAILED');
    }
  });

  // POST /api/ana-ri/seal-verified-version — E1: Part 11 verified-and-sealed
  // export (handler in ./seal-verified.ts). Gated behind
  // ENABLE_ANA_DOCUMENT_STUDIO (off by default).
  router.post('/seal-verified-version', handleSealVerifiedVersion);
}
