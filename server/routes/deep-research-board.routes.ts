/**
 * Deep Research & Connectors — display/aggregation read route.
 *
 * Backs the ui-v2 "Deep Research & Connectors" surface (DeepResearch.tsx). The
 * surface's fixtures (deep-research-data.ts) declare two read shapes and one
 * action flow:
 *
 *   • DR_CONN (ConnectorInfo[] + a client-computed `configured`) — the primary
 *     read-model. The fixture header states it "mirrors CONNECTOR_CATALOG", so
 *     this endpoint serves the REAL catalog with the org's live configured
 *     status via getConnectorCatalog(orgId), mapped 1:1 into the fixture shape
 *     (category→cat, requiredTier→tier, requiresCredentials→creds,
 *     description→desc, setupGuide.credentialFields→cf).
 *
 *   • Persisted research runs — deep_research_jobs rows for the org, via
 *     listJobs(orgId). Each run's fan-out (DrJob: { name, state, hits }) is
 *     DERIVED from the persisted connector_logs (resultCount→hits). The list
 *     read-model does NOT carry per-run results/synthesis (DR_RESULTS / DR_SYNTH)
 *     — listJobs returns results/synthesis = null by design; fetch the existing
 *     GET /api/deep-research/jobs/:id for those. Never fabricated.
 *
 *   • The live "launch → fan-out → results" flow is a POST action handled by the
 *     existing server/routes/deep-research.ts router (POST /jobs, SSE
 *     /jobs/:id/stream, GET /jobs/:id, POST /jobs/:id/stop, POST /connectors).
 *     This module is READ-ONLY and coexists with that router.
 *
 * This module ONLY orchestrates existing service functions (getConnectorCatalog,
 * listJobs, getUsageSummary, getLicenseInfo). It writes no SQL of its own, issues
 * no direct DB query (so requestDb is not applicable — see RLS NOTE), and fails
 * closed: a Promise.allSettled fan-out degrades each source independently
 * (connectors → static catalog, runs → [], credits → null) when a table is
 * unprovisioned, so the surface keeps an honest board instead of a 500.
 *
 * Display fields with no real source are OMITTED or returned as documented nulls,
 * never fabricated (see HONESTY NOTES at the bottom).
 *
 * Style template: server/routes/pharmacovigilance-routes.ts /
 * pharmacovigilance-board.routes.ts (Router factory / default export, org id from
 * tenant/user context, scoped logger, honest error shaping, { success, data }
 * envelope).
 *
 * RLS NOTE (ci:requestdb-coverage): this route performs NO direct DB access. It
 * calls existing services that own their own pool-backed, organization_id-scoped
 * queries — the preferred path. There is therefore no requestDb(req) usage to add
 * and no `db`/`pool` import. If those services later migrate to RLS, this route
 * inherits it unchanged.
 *
 * @module routes/deep-research-board.routes
 */

import { Router, Request, Response } from 'express';

import { createScopedLogger } from '../utils/logger.js';
import { getConnectorCatalog } from '../services/connectors/connector-registry.js';
import {
  CONNECTOR_CATALOG,
  type ConnectorCatalogEntry,
} from '../services/connectors/connector-interface.js';
import { listJobs, type DeepResearchJob } from '../services/deep-research-orchestrator.js';
import { getUsageSummary } from '../services/usage-metering.js';
import { getLicenseInfo } from '../services/license-manager.js';

const logger = createScopedLogger('deep-research-board-routes');

/** Metered feature id for the deep-research credit allowance (usage-metering). */
const DEEP_RESEARCH_FEATURE = 'deep_research';

/** Persisted-run list defaults (this is a board card, not an unbounded export). */
const DEFAULT_RUN_LIMIT = 20;
const MAX_RUN_LIMIT = 50;

// ── Display-shape types (mirror deep-research-data.ts fixtures) ──────────────────

/** Matches CredentialField in the fixture: { field, label, placeholder, secret }. */
interface DrCredentialField {
  field: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

/** Matches ConnectorInfo + ConnectorState.configured in the fixture. */
interface DrConnector {
  id: string;
  name: string;
  type: string;
  cat: string;
  tier: string;
  creds: boolean;
  /** GAP: catalog icon name (e.g. 'flask'); NOT rendered by the JSX — present only to satisfy the fixture type. */
  icon: string | null;
  desc: string;
  cf: DrCredentialField[];
  configured: boolean;
}

/** Matches DrJob in the fixture: { name, state, hits } — one connector's fan-out. */
interface DrRunJob {
  name: string;
  state: 'run' | 'done';
  /** Persisted resultCount; null when a job's connector_logs did not record a count. */
  hits: number | null;
}

/** Persisted research run (deep_research_jobs). results/synthesis omitted — see HONESTY NOTES. */
interface DrRun {
  id: number;
  uuid: string | null;
  status: string;
  indication: string | null;
  progress: number;
  creditsUsed: number;
  jobs: DrRunJob[];
  createdAt: string | null;
  completedAt: string | null;
}

/** Matches the client's hardcoded `credits` block. limit/remaining === -1 ⇒ unlimited (enterprise). */
interface DrCredits {
  remaining: number;
  limit: number;
  /** Org subscription tier (getLicenseInfo); null when the license is unreadable. */
  tier: string | null;
}

interface DrBoard {
  connectors: DrConnector[];
  connectorCount: number;
  configuredCount: number;
  credits: DrCredits | null;
  runs: DrRun[];
}

// ── Pure mappers ─────────────────────────────────────────────────────────────────

/** connectorId → display name, for labelling a persisted run's fan-out rows. */
const CONNECTOR_NAME_BY_ID = new Map<string, string>(
  CONNECTOR_CATALOG.map((entry) => [entry.id, entry.name]),
);

function toDrConnector(entry: ConnectorCatalogEntry, configured: boolean): DrConnector {
  const cf: DrCredentialField[] = (entry.setupGuide?.credentialFields ?? []).map((f) => ({
    field: f.field,
    label: f.label,
    placeholder: f.placeholder,
    secret: f.secret,
  }));
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    cat: entry.category,
    tier: entry.requiredTier,
    creds: entry.requiresCredentials,
    icon: entry.icon ?? null,
    desc: entry.description,
    cf,
    configured,
  };
}

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Map a persisted job to the surface run shape. The per-connector fan-out is
 * derived from connector_logs: an entry means that connector's search returned,
 * so state='done' and hits=resultCount. A run whose logs are not yet written
 * (still queued/running) yields jobs=[] rather than fabricated in-flight rows.
 */
function toDrRun(job: DeepResearchJob): DrRun {
  const logs = job.connectorLogs ?? {};
  const jobs: DrRunJob[] = Object.entries(logs).map(([connectorId, log]) => {
    const resultCount = (log as { resultCount?: unknown } | null)?.resultCount;
    return {
      name: CONNECTOR_NAME_BY_ID.get(connectorId) ?? connectorId,
      state: 'done' as const,
      hits: typeof resultCount === 'number' && Number.isFinite(resultCount) ? resultCount : null,
    };
  });

  const query = (job.query ?? {}) as { indication?: unknown };
  return {
    id: job.id,
    uuid: job.uuid ?? null,
    status: job.status,
    indication: typeof query.indication === 'string' ? query.indication : null,
    progress: typeof job.progress === 'number' ? job.progress : 0,
    creditsUsed: typeof job.creditsUsed === 'number' ? job.creditsUsed : 0,
    jobs,
    createdAt: toIso(job.createdAt),
    completedAt: toIso(job.completedAt),
  };
}

// ── Router factory ──────────────────────────────────────────────────────────────

export default function createDeepResearchBoardRoutes(): Router {
  const router = Router();

  function getOrgId(req: Request): number {
    const raw =
      (req as any).user?.organizationId ??
      (req as any).tenantContext?.organizationId ??
      (req as any).tenantId;
    const orgId = Number(raw);
    if (raw === undefined || raw === null || raw === '' || !Number.isFinite(orgId)) {
      throw new Error('DR_NO_TENANT: Organization context required');
    }
    return orgId;
  }

  /**
   * GET /api/deep-research/board
   * Read-model for the ui-v2 Deep Research & Connectors surface.
   * Response: { success: true, data: DrBoard }
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req);

      const rawLimit = Number.parseInt(String(req.query.limit ?? ''), 10);
      const limit =
        Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_RUN_LIMIT) : DEFAULT_RUN_LIMIT;

      const [catalogResult, jobsResult, usageResult, licenseResult] = await Promise.allSettled([
        getConnectorCatalog(orgId),
        listJobs(orgId, limit),
        getUsageSummary(orgId),
        getLicenseInfo(orgId),
      ]);

      // Connectors — the org-scoped configured status. getConnectorCatalog now
      // handles the legitimately-unprovisioned case internally (missing
      // connector_credentials → catalog with every credentialed connector
      // not-configured), so a REJECTION here is a genuine read failure. Fail
      // closed on it (→ the outer catch's 500 → the surface's board.error, which
      // reports the inventory as UNKNOWN due to a failure). Serving the static
      // CONNECTOR_CATALOG on a failed read published a bundle constant to the
      // assistant as though it were this org's real connector inventory.
      let connectors: DrConnector[];
      if (catalogResult.status === 'fulfilled') {
        connectors = catalogResult.value.map((entry) => toDrConnector(entry, entry.configured));
      } else {
        throw catalogResult.reason;
      }

      // Persisted research runs — empty when deep_research_jobs is unprovisioned.
      let runs: DrRun[] = [];
      if (jobsResult.status === 'fulfilled') {
        runs = jobsResult.value.map(toDrRun);
      } else {
        logger.warn('research jobs read failed; returning empty runs', {
          err:
            jobsResult.reason instanceof Error ? jobsResult.reason.message : String(jobsResult.reason),
        });
      }

      // Credits — real deep-research allowance for the org's billing period.
      // Omitted (null) when the org/usage tables are unreadable rather than
      // fabricated to a placeholder cap. remaining/limit === -1 means unlimited.
      const usage = usageResult.status === 'fulfilled' ? usageResult.value : [];
      const license = licenseResult.status === 'fulfilled' ? licenseResult.value : null;
      const drSummary = usage.find((u) => u.featureId === DEEP_RESEARCH_FEATURE);
      const credits: DrCredits | null = drSummary
        ? {
            remaining: drSummary.creditsRemaining,
            limit: drSummary.creditsLimit,
            tier: license?.tier ?? null,
          }
        : null;

      const board: DrBoard = {
        connectors,
        connectorCount: connectors.length,
        configuredCount: connectors.filter((c) => c.configured).length,
        credits,
        runs,
      };

      return res.json({ success: true, data: board });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('DR_NO_TENANT')) {
        return res.status(400).json({ success: false, error: 'Organization context required' });
      }
      logger.error('deep research board error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to build deep research board' });
    }
  });

  return router;
}

/*
 * ── HONESTY NOTES (regulated product — no fabricated fields) ──────────────────────
 *
 * SERVED FROM REAL, ORG-SCOPED DATA:
 *   • connectors[]            — getConnectorCatalog(orgId): live catalog + per-org
 *                               configured status (reads connector_credentials).
 *   • connectorCount /
 *     configuredCount         — derived from connectors[].
 *   • credits.remaining/limit — getUsageSummary(orgId) 'deep_research' allowance.
 *   • credits.tier            — getLicenseInfo(orgId).tier.
 *   • runs[]                  — listJobs(orgId): persisted deep_research_jobs
 *                               (id, uuid, status, query.indication, progress,
 *                               creditsUsed, timestamps).
 *   • runs[].jobs[]           — derived from each job's persisted connector_logs
 *                               (resultCount → hits, state='done').
 *
 * OMITTED / NULLED (documented gaps — NOT fabricated):
 *   • DEPTHS (quick/standard/exhaustive @ 1/3/8 credits) is NOT served. The engine's
 *     real depth model is standard|comprehensive @ 1|3 credits
 *     (deep-research-orchestrator). Serving the fixture's option/pricing model would
 *     fabricate credit costs the engine does not charge — kept as a client constant.
 *   • DR_CATS category labels are NOT served — a purely presentational client map.
 *   • connector 'connected' vs 'ready' is derived client-side from configured+creds;
 *     getConnectorCatalog's `healthy` flag is intentionally dropped (unrendered).
 *   • connector.icon is catalog-sourced (real; e.g. 'flask') and differs from the
 *     fixture's decorative names; it is not rendered by the JSX.
 *   • runs[].results (DR_RESULTS { conn, title, date, meta }) and synthesis
 *     (DR_SYNTH) are NOT in this list read-model — listJobs returns
 *     results/synthesis = null by design. Fetch GET /api/deep-research/jobs/:id
 *     (getJobStatus) for a run's topResults + synthesis.
 *   • credits is null (not a placeholder 42/60) when the org/usage tables are
 *     unreadable; credits.tier is null when the license is unreadable.
 *   • The live launch/fan-out/stop flow is a POST action on the existing
 *     /api/deep-research router, not this read-model.
 */
