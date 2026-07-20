/**
 * Insights Canvas read-model endpoint (Report-OS).
 *
 * Backs the ui-v2 "AnA Reporting Canvas" surface
 * (client/src/concept2cure/v2/surfaces/Insights.tsx → InsightsCanvas) with
 * live, org-scoped data in place of its client-side fixtures (PJ_PROGRAMS /
 * GI_BY_SEG / APP_LICENSE). ONE GET endpoint assembles the canvas BOOTSTRAP:
 *
 *   - tier + segments   → the org's real subscription tier (via the entitlement
 *                         gate) and its derived client segment(s)
 *   - reportTypes[]     → the governed report taxonomy, filtered to the org's
 *                         segment(s) and annotated with the org's entitlement
 *                         verdict — the SAME pure helpers the
 *                         /api/report-os/taxonomy catalog uses
 *   - leadProgram       → the org's flagship program's REAL governed readiness,
 *                         derived from the SAME orchestrator the /runs path uses
 *                         (computeInitialRun, via fetchOrgPortfolioSummary)
 *   - portfolio         → the cross-program board rollup, ENTERPRISE-gated
 *                         exactly like /api/report-os/portfolio/org
 *
 * The per-utterance report / dashboard artifacts the canvas renders on demand
 * are NOT served here — they already have honest endpoints
 * (/api/insights/predictions[/run], /api/report-os/runs,
 * /api/report-os/portfolio*). This route serves only the initial canvas state.
 *
 * HONESTY (regulated product): this route originates no metric. Readiness
 * figures trace to computeInitialRun; tier/entitlement verdicts to the
 * entitlement matrix. Fields with no truthful server source — a program's
 * submission `filing`, target `agency`, and `pdufa` action date are not on the
 * `projects` / readiness model and are not joined in this pass — are returned as
 * an explicit `null`, never a fabricated value. The surface already renders a
 * null metric as "--" / "missing".
 *
 * Org id is bound from the verified JWT (authedOrgId); the mount adds
 * authenticateToken. Every handler is try/caught and never throws out of the
 * router; DB-touching services fail closed (empty list / null), never a fake
 * zero.
 *
 * Mounted at `/api/insights-canvas` (see server/bootstrap/register-*-routes.ts).
 *
 * @module routes/insights-canvas-routes
 */

import { Router, Request, Response } from 'express';

import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger';
import { REPORT_TYPE_SEED, type ReportTypeDefinition } from '../services/report-os/taxonomy';
import { GLOBAL_REPORT_TYPE_SEED } from '../services/report-os/taxonomy-global';
import { PREDICTION_REPORT_TYPES } from '../services/report-os/prediction/report-types';
import {
  deriveOrgSegments,
  filterTypesForSegment,
  type ReportSegment,
} from '../services/report-os/segment';
import {
  requireReportEntitlement,
  decideReportEntitlement,
  type ReportEntitlementDecision,
} from '../services/report-os/entitlement-map';
import { fetchOrgPortfolioSummary } from '../services/report-os/portfolio/fetch';
import type { ProgramMemberInsight, RiskLevel } from '../services/report-os/portfolio/types';
import type { FeatureKey, Tier } from '../services/entitlements/types';

const logger = createScopedLogger('insights-canvas-routes');

/**
 * The full governed report taxonomy (base + global-markets + prediction), read
 * from the in-memory seed rather than the reportTypeRegistry table so the
 * catalog renders even before taxonomy seeding (missing-table-safe). Same seed
 * the /api/report-os/taxonomy catalog and the report-os-insights router use.
 */
const ALL_REPORT_TYPES: ReportTypeDefinition[] = [
  ...REPORT_TYPE_SEED,
  ...GLOBAL_REPORT_TYPE_SEED,
  ...PREDICTION_REPORT_TYPES,
];

// ── Display shape (mirrors client/.../v2/surfaces/Insights.tsx InsightsCanvas) ──

interface CanvasReportType {
  typeId: string;
  label: string;
  family: string;
  allowedScopes: string[];
  allowedClientSegments: string[];
  /** The real seed truthfulness rules, passed through untouched. */
  truthfulnessRules: Record<string, unknown>;
  entitled: boolean;
  feature: FeatureKey;
  requiredTier: Tier;
}

interface CanvasLeadProgram {
  scope: 'program';
  scopeId: string;
  projectId: number;
  code: string | null;
  label: string;
  indication: string | null;
  /** Real governed readiness (0-100) from computeInitialRun; never originated here. */
  readiness: number | null;
  confidence: number;
  status: ProgramMemberInsight['status'];
  riskLevel: RiskLevel;
  criticalBlockerCount: number;
  /**
   * HONESTY: submission filing type, target agency and PDUFA / action date are
   * NOT on the `projects` / readiness model and are not joined in this pass, so
   * they are returned as an explicit null rather than a fabricated value.
   * Populating them truthfully requires a submission-table join (follow-up pass).
   */
  filing: string | null;
  agency: string | null;
  pdufa: string | null;
}

interface CanvasPortfolioProgram {
  projectId: number;
  code: string | null;
  label: string;
  indication: string | null;
  readiness: number;
  confidence: number;
  status: ProgramMemberInsight['status'];
  riskLevel: RiskLevel;
  criticalBlockerCount: number;
}

interface CanvasPortfolioSummary {
  programCount: number;
  avgReadiness: number;
  avgConfidence: number;
  worstRisk: RiskLevel;
  readyCount: number;
  partialCount: number;
  missingCount: number;
  totalCriticalBlockers: number;
  truncated: boolean;
}

interface CanvasPortfolio {
  /** Enterprise `portfolio_rollup` capability — mirrors /api/report-os/portfolio/org. */
  entitled: boolean;
  requiredTier: Tier;
  /** Non-null only when entitled AND the org has programs; honest lock/empty otherwise. */
  summary: CanvasPortfolioSummary | null;
  programs: CanvasPortfolioProgram[] | null;
}

interface CanvasOverview {
  organizationId: number;
  tier: Tier;
  segments: ReportSegment[];
  reportTypes: CanvasReportType[];
  leadProgram: CanvasLeadProgram | null;
  portfolio: CanvasPortfolio;
}

/** Fail-closed decision used only if the (never-throwing) entitlement gate rejects. */
const LOCKED_PORTFOLIO_DECISION: ReportEntitlementDecision = {
  entitled: false,
  feature: 'portfolio_rollup',
  requiredTier: 'enterprise',
  tier: 'standard',
};

/**
 * PURE: pick the flagship program to lead the canvas opener with — the highest
 * governed readiness, ties broken to the fewest critical blockers then lowest
 * projectId (stable). Ranks the scores computeInitialRun already produced; it
 * does not recompute or originate any readiness value.
 */
function pickFlagship(members: ProgramMemberInsight[]): ProgramMemberInsight | null {
  if (members.length === 0) return null;
  const sorted = [...members].sort((a, b) => {
    if (b.readinessScore !== a.readinessScore) return b.readinessScore - a.readinessScore;
    if (a.criticalBlockerCount !== b.criticalBlockerCount) {
      return a.criticalBlockerCount - b.criticalBlockerCount;
    }
    return a.projectId - b.projectId;
  });
  return sorted[0] ?? null;
}

/** PURE: single-program lead context. filing/agency/pdufa are unsourced → null. */
function toLeadProgram(insight: ProgramMemberInsight): CanvasLeadProgram {
  return {
    scope: 'program',
    scopeId: String(insight.projectId),
    projectId: insight.projectId,
    code: insight.code ?? null,
    label: insight.name,
    indication: insight.indication ?? null,
    readiness: insight.readinessScore,
    confidence: insight.confidence,
    status: insight.status,
    riskLevel: insight.riskLevel,
    criticalBlockerCount: insight.criticalBlockerCount,
    filing: null,
    agency: null,
    pdufa: null,
  };
}

/** PURE: one board-rollup row. */
function toPortfolioProgram(insight: ProgramMemberInsight): CanvasPortfolioProgram {
  return {
    projectId: insight.projectId,
    code: insight.code ?? null,
    label: insight.name,
    indication: insight.indication ?? null,
    readiness: insight.readinessScore,
    confidence: insight.confidence,
    status: insight.status,
    riskLevel: insight.riskLevel,
    criticalBlockerCount: insight.criticalBlockerCount,
  };
}

export default function createInsightsCanvasRoutes(): Router {
  const router = Router();

  /**
   * GET /api/insights-canvas/overview
   *
   * The Insights (AnA Reporting Canvas) bootstrap: the org's tier + segments,
   * the entitlement-annotated governed report catalog, the flagship program's
   * real governed readiness, and the (enterprise-gated) cross-program board
   * rollup. Optional `?persona=` intersects the catalog on allowedPersonas.
   */
  router.get('/overview', async (req: Request, res: Response) => {
    try {
      const organizationId = authedOrgId(req);
      if (organizationId == null) {
        return res.status(403).json({ success: false, error: 'Tenant context required' });
      }

      const persona = typeof req.query.persona === 'string' ? req.query.persona : null;

      // Independent, resilient reads. The entitlement gate and segment
      // derivation fail closed internally (never throw); the portfolio compute
      // can throw, so any rejection degrades to an honest empty, not a 500.
      const [gateResult, segmentsResult, portfolioResult] = await Promise.allSettled([
        requireReportEntitlement(organizationId, 'portfolio.board_pack', 'portfolio'),
        deriveOrgSegments(organizationId),
        fetchOrgPortfolioSummary(organizationId),
      ]);

      const gate: ReportEntitlementDecision =
        gateResult.status === 'fulfilled' ? gateResult.value : LOCKED_PORTFOLIO_DECISION;
      const tier: Tier = gate.tier;

      const segments: ReportSegment[] =
        segmentsResult.status === 'fulfilled' ? segmentsResult.value : [];

      if (portfolioResult.status === 'rejected') {
        logger.warn('org portfolio compute failed; degrading to empty', {
          organizationId,
          err:
            portfolioResult.reason instanceof Error
              ? portfolioResult.reason.message
              : String(portfolioResult.reason),
        });
      }
      const summary = portfolioResult.status === 'fulfilled' ? portfolioResult.value : null;

      // Report catalog: filter the seed to the org's segment(s), annotate each
      // with the org's entitlement verdict (pure). Identical to /taxonomy.
      const reportTypes: CanvasReportType[] = filterTypesForSegment(
        ALL_REPORT_TYPES,
        segments,
        persona,
      ).map((t) => {
        const decision = decideReportEntitlement(t.typeId, t.family, tier);
        return {
          typeId: t.typeId,
          label: t.label,
          family: t.family,
          allowedScopes: t.allowedScopes,
          allowedClientSegments: t.allowedClientSegments,
          truthfulnessRules: t.truthfulnessRules,
          entitled: decision.entitled,
          feature: decision.feature,
          requiredTier: decision.requiredTier,
        };
      });

      // Lead / flagship program — a single program's OWN governed readiness, a
      // base capability shown on every tier (not the enterprise rollup).
      const flagship = summary ? pickFlagship(summary.attentionRanked) : null;
      const leadProgram = flagship ? toLeadProgram(flagship) : null;

      // Cross-program board rollup — the ENTERPRISE portfolio_rollup capability.
      // Populated only when entitled; otherwise an honest lock (null), mirroring
      // /api/report-os/portfolio/org.
      const portfolio: CanvasPortfolio = {
        entitled: gate.entitled,
        requiredTier: gate.requiredTier,
        summary:
          gate.entitled && summary
            ? {
                programCount: summary.memberCount,
                avgReadiness: summary.avgReadiness,
                avgConfidence: summary.avgConfidence,
                worstRisk: summary.worstRisk,
                readyCount: summary.readyCount,
                partialCount: summary.partialCount,
                missingCount: summary.missingCount,
                totalCriticalBlockers: summary.totalCriticalBlockers,
                truncated: summary.truncated,
              }
            : null,
        programs:
          gate.entitled && summary ? summary.attentionRanked.map(toPortfolioProgram) : null,
      };

      const data: CanvasOverview = {
        organizationId,
        tier,
        segments,
        reportTypes,
        leadProgram,
        portfolio,
      };

      return res.json({ success: true, data });
    } catch (error) {
      logger.error('insights-canvas overview error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res
        .status(500)
        .json({ success: false, error: 'Failed to assemble insights canvas overview' });
    }
  });

  return router;
}
