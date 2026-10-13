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
 *   - leadProgram       → the OPEN program's REAL governed readiness (none when
 *                         no program is open: the canvas asks which one),
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
 * zero. A failed portfolio read is a 503 PORTFOLIO_UNAVAILABLE, not an empty
 * organisation (review round 1).
 *
 * Mounted at `/api/insights-canvas` (see server/bootstrap/register-*-routes.ts).
 *
 * @module routes/insights-canvas-routes
 */

import { Router, Request, Response } from 'express';

import { requestDb, requestPgClient, MissingRequestDbContextError } from '../db/requestDb';
import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger';
import { looksLikeProgramUuid } from '../lib/project-id';
import { resolveProgramProjectAnchor } from '../services/c2c/program-project-anchor';
import { REPORT_TYPE_SEED, type ReportTypeDefinition } from '../services/report-os/taxonomy';
import { GLOBAL_REPORT_TYPE_SEED } from '../services/report-os/taxonomy-global';
import { PREDICTION_REPORT_TYPES } from '../services/report-os/prediction/report-types';
import {
  deriveOrgSegments,
  deriveProjectSegments,
  segmentsForScope,
  filterTypesForSegment,
  type ReportSegment,
} from '../services/report-os/segment';
import { reportAvailability } from '../services/report-os/report-engine';
import {
  requireReportEntitlement,
  decideReportEntitlement,
  type ReportEntitlementDecision,
} from '../services/report-os/entitlement-map';
import { fetchOrgPortfolioSummary } from '../services/report-os/portfolio/fetch';
import type { ProgramMemberInsight, RiskLevel, OrgPortfolioSummary } from '../services/report-os/portfolio/types';
import type { FeatureKey, Tier } from '../services/entitlements/types';
import { authedUserId } from '../utils/authedActor';
import { getAccessibleReportProjectIds, type ReportProjectActor } from '../services/report-os/project-access';
import { aggregateOrgPortfolio } from '../services/report-os/portfolio/aggregate';

const logger = createScopedLogger('insights-canvas-routes');

/**
 * The full governed report taxonomy (base + global-markets + prediction), read
 * from the canonical seeds for discovery. Deployed registry declarations below
 * authorize runs; missing definitions stay visible as explicitly unavailable.
 */
const ALL_REPORT_TYPES: ReportTypeDefinition[] = [
  ...REPORT_TYPE_SEED,
  ...GLOBAL_REPORT_TYPE_SEED,
  ...PREDICTION_REPORT_TYPES,
];

type CatalogDefinition = ReportTypeDefinition & { registered: boolean; enabled: boolean };

/** Seeds retain discovery, while deployed declarations authorize actual runs. */
async function deployedCatalog(req: Request): Promise<CatalogDefinition[]> {
  const { rows } = await requestPgClient(req).query(`SELECT type_id, label, family, allowed_scopes,
    allowed_personas, allowed_client_segments, governance_requirements, truthfulness_rules, enabled
    FROM report_type_registry`);
  const registry = new Map(rows.map(row => [row.type_id, row]));
  const list = (value: unknown): string[] => {
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Report registry has an invalid declaration list');
    return value;
  };
  return ALL_REPORT_TYPES.map(seed => {
    const row = registry.get(seed.typeId);
    if (!row) return { ...seed, registered: false, enabled: false };
    if (typeof row.label !== 'string' || typeof row.family !== 'string' || typeof row.enabled !== 'boolean' ||
        !row.governance_requirements || typeof row.governance_requirements !== 'object' ||
        !row.truthfulness_rules || typeof row.truthfulness_rules !== 'object') throw new Error('Report registry has an invalid declaration');
    return { ...seed, registered: true, enabled: row.enabled, label: row.label, family: row.family,
      allowedScopes: list(row.allowed_scopes) as ReportTypeDefinition['allowedScopes'],
      allowedPersonas: list(row.allowed_personas), allowedClientSegments: list(row.allowed_client_segments),
      governanceRequirements: row.governance_requirements as Record<string, unknown>, truthfulnessRules: row.truthfulness_rules as Record<string, unknown> };
  });
}

class CatalogUnavailableError extends Error {}
class OpenProgramUnavailableError extends Error {}

function availableCatalog(result: PromiseSettledResult<CatalogDefinition[]>, organizationId: number): CatalogDefinition[] {
  if (result.status === 'fulfilled') return result.value;
  if (result.reason instanceof MissingRequestDbContextError) throw result.reason;
  logger.error('report registry catalog read failed', { organizationId, error: String(result.reason) });
  throw new CatalogUnavailableError('The report catalog could not be read. Try again in a moment.');
}

// ── Display shape (mirrors client/.../v2/surfaces/Insights.tsx InsightsCanvas) ──

interface CanvasReportType {
  typeId: string;
  label: string;
  family: string;
  allowedScopes: string[];
  /**
   * The declared scopes an engine actually computes this type over — a subset of
   * `allowedScopes`, and empty for a type no engine computes.
   *
   * The two differ. A market filing assessment declares program, project and
   * submission, and `regional/filing-readiness.ts` computes it over one program
   * only (project scope); the evidence trace declares three and runs over a
   * document. The catalog printed `allowedScopes` as "Runs over: program,
   * project, submission", which is where the type MAY be declared, not where it
   * runs — so a reader was told a run was available at a scope that answers
   * REPORT_TYPE_NOT_COMPUTED.
   */
  computedScopes: string[];
  allowedClientSegments: string[];
  allowedPersonas: string[];
  region: string | null;
  computedScope: 'organization' | 'project' | 'document' | null;
  availabilityReason: string | null;
  availabilityState: 'available' | 'not-computed' | 'scope-required' | 'disabled' | 'unregistered';
  runScopeType: 'project' | 'account' | null;
  runScopeId: string | null;
  /** The real seed truthfulness rules, passed through untouched. */
  truthfulnessRules: Record<string, unknown>;
  entitled: boolean;
  feature: FeatureKey;
  requiredTier: Tier;
  /**
   * Whether the current program or organization context permits a run.
   * A type that is not runnable is
   * shown as not computed in this release, never run as the readiness digest
   * under its title (QA 2026-10-08, j8).
   */
  runnable: boolean;
}

interface CanvasLeadProgram {
  /** The canvas's "program" is a project: its readiness is computed at project scope. */
  scope: 'project';
  scopeId: string;
  projectId: number;
  code: string | null;
  label: string;
  indication: string | null;
  /** Real governed readiness (0-100) from computeInitialRun; never originated here. */
  readiness: number | null;
  /** A measured confidence, or null: the readiness run measures none. */
  confidence: number | null;
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
  programId: string | null;
  topBlockers: string[];
  code: string | null;
  label: string;
  indication: string | null;
  readiness: number | null;
  confidence: number | null;
  status: ProgramMemberInsight['status'];
  riskLevel: RiskLevel;
  criticalBlockerCount: number;
}

interface CanvasPortfolioSummary {
  programCount: number;
  avgReadiness: number | null;
  avgConfidence: number | null;
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

/**
 * The program the shell has open (`?programId=`), and what became of it:
 *   lead              its anchored project leads the canvas;
 *   unanchored        it has no projects row, so no readiness or report runs
 *                     over it — and the canvas has no lead;
 *   not-in-portfolio  its row is not among the programs the portfolio computed
 *                     (archived, a sub-project, or past the rollup cap).
 * Null when no program was named: there is no lead, and the canvas offers
 * `programs` to pick from.
 */
interface CanvasOpenProgram {
  programId: string;
  state: 'lead' | 'unanchored' | 'not-in-portfolio';
}

/** A program the canvas can be opened on: one with a project record to compute over. */
interface CanvasProgramChoice {
  programId: string;
  code: string | null;
  label: string;
}

interface CanvasOverview {
  organizationId: number;
  dataScope: 'accessible_projects';
  tier: Tier;
  /**
   * Whether `tier` was read, or assumed after a failed capability lookup.
   *
   * False means the canvas must not present `tier` as the organisation's plan:
   * an enterprise customer whose lookup threw was shown "Plan: Standard" and a
   * screen of locked tiles with no hint the plan had not been read
   * (HS-1008-4). The locks stay — the gate fails closed — but the claim goes.
   */
  tierResolved: boolean;
  /** The segments the catalog was filtered to: the lead program's, else the organisation's. */
  segments: ReportSegment[];
  reportTypes: CanvasReportType[];
  leadProgram: CanvasLeadProgram | null;
  openProgram: CanvasOpenProgram | null;
  /**
   * The organisation's programs a report can run over, for the canvas's
   * program picker. Names only, so on every plan (the rollup stays gated).
   * With no program open there is no lead: the person picks one (QA
   * 2026-10-08, j8: the canvas led with the lowest project id, project 1).
   */
  programs: CanvasProgramChoice[];
  portfolio: CanvasPortfolio;
}

/** Fail-closed decision used only if the (never-throwing) entitlement gate rejects.
 *  `tierResolved: false` because nothing was read: this decision is the absence
 *  of an answer, and `standard` here is an assumption, not the org's plan. */
const LOCKED_PORTFOLIO_DECISION: ReportEntitlementDecision = {
  entitled: false,
  feature: 'portfolio_rollup',
  requiredTier: 'enterprise',
  tier: 'standard',
  tierResolved: false,
};

/** PURE: single-program lead context. filing/agency/pdufa are unsourced → null. */
function toLeadProgram(insight: ProgramMemberInsight): CanvasLeadProgram {
  /* L189 (reporting review 2026-10-01). This said 'program' with a PROJECT id,
     and the canvas runs every report over the scope it is given: POST /runs
     read 'program' as a report program group and looked up the group whose
     serial id equalled the project id. So a report titled for the project
     the opener named was computed over an unrelated group, or over nothing
     ("No governed artifacts discovered"), and half the standard-pack tiles
     were refused because their types do not run at program scope. The lead
     is a project, and its readiness above is computed at project scope. */
  return {
    scope: 'project',
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
    programId: insight.programId ?? null,
    topBlockers: insight.topBlockers ?? [],
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

function overviewActor(req: Request): ReportProjectActor | null {
  const userId = authedUserId(req);
  if (!userId || !Number.isSafeInteger(userId) || userId < 1) return null;
  return { userId, role: req.userRole ?? req.user?.role };
}

function accessiblePortfolioSummary(organizationId: number, rawSummary: OrgPortfolioSummary | null, accessibleProjectIds: number[]): OrgPortfolioSummary | null {
  const members = rawSummary?.attentionRanked.filter(member => accessibleProjectIds.includes(member.projectId)) ?? [];
  return rawSummary && members.length ? aggregateOrgPortfolio(organizationId, members, rawSummary.truncated) : null;
}

function canvasPortfolio(gate: ReportEntitlementDecision, summary: OrgPortfolioSummary | null): CanvasPortfolio {
  return {
    entitled: gate.entitled,
    requiredTier: gate.requiredTier,
    summary: gate.entitled && summary ? {
      programCount: summary.memberCount,
      avgReadiness: summary.avgReadiness,
      avgConfidence: summary.avgConfidence,
      worstRisk: summary.worstRisk,
      readyCount: summary.readyCount,
      partialCount: summary.partialCount,
      missingCount: summary.missingCount,
      totalCriticalBlockers: summary.totalCriticalBlockers,
      truncated: summary.truncated,
    } : null,
    programs: gate.entitled && summary ? summary.attentionRanked.map(toPortfolioProgram) : null,
  };
}

/**
 * `?programId=` → the open program's regulatory_programs UUID (lower-cased),
 * null when none is named, or false when the value is not a program UUID. QA
 * 2026-10-08 (j1): the canvas always led with the flagship, so HLV-333's
 * Reporting screen spoke about C2C-001. Anything that is not a program UUID is
 * refused rather than read as a project id: the client never parses one, and an
 * integer here would be another id space.
 */
function openProgramParam(raw: unknown): string | null | false {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return null;
  return looksLikeProgramUuid(v) ? v.toLowerCase() : false;
}

/**
 * The canvas lead. With a program open: that program's anchored projects row,
 * resolved on the server (strict — a lookup that could not complete throws to
 * the route's 500, never "no record"), led only when the portfolio computed it;
 * otherwise no lead and `openProgram` says why. Never the flagship in its place.
 *
 * With none open there is no lead, and the canvas asks which program (QA
 * 2026-10-08, j8). The flagship stood in: the highest readiness, which with no
 * readiness computed anywhere fell to the lowest project id — project 1, a
 * legacy record no program anchors — so every report and digest ran over a
 * program the person had not chosen.
 *
 * The anchor is read on the request's RLS-scoped client (`requestDb(req)`), the
 * handle resolveProgramProjectAnchor requires, and only when a program is
 * named. It was read through the shared pool's `db` (4ac15bdd1), which the
 * requestDb adoption gate refuses for a new route.
 */
async function pickLead(
  req: Request,
  organizationId: number,
  programId: string | null,
  summary: { attentionRanked: ProgramMemberInsight[] } | null,
  accessibleProjectIds: readonly number[],
): Promise<{ leadProgram: CanvasLeadProgram | null; openProgram: CanvasOpenProgram | null }> {
  const members = summary?.attentionRanked ?? [];
  if (!programId) return { leadProgram: null, openProgram: null };
  const anchored = await resolveProgramProjectAnchor(requestDb(req), {
    programId,
    orgId: organizationId,
    context: 'insights-canvas-overview',
    strict: true,
  });
  if (anchored != null && !accessibleProjectIds.includes(anchored)) throw new OpenProgramUnavailableError('Program not found');
  const member = anchored == null ? null : members.find((m) => m.projectId === anchored) ?? null;
  return {
    leadProgram: member ? toLeadProgram(member) : null,
    openProgram: { programId, state: anchored == null ? 'unanchored' : member ? 'lead' : 'not-in-portfolio' },
  };
}

/**
 * PURE: the report catalog for the segments the lead program's recorded product
 * type gives (its anchored regulatory program; the org's derived segments when
 * there is no lead). The org's union offered a device-only 510(k) matrix for a
 * biologic IND because the organisation also holds device programs (QA
 * 2026-10-08, j8). Each type carries the org's entitlement verdict and whether
 * an engine computes it over a program (`runnable`, report-engine.ts).
 */
function catalogAvailabilityState(type: CatalogDefinition, runnable: boolean, computedScopes: string[]): CanvasReportType['availabilityState'] {
  if (!type.registered) return 'unregistered';
  if (!type.enabled) return 'disabled';
  if (runnable) return 'available';
  return computedScopes.length ? 'scope-required' : 'not-computed';
}

function catalogFor(types: CatalogDefinition[], segments: ReportSegment[], persona: string | null, tier: Tier, context: { organizationId: number; lead: CanvasLeadProgram | null }): CanvasReportType[] {
  const { organizationId, lead } = context;
  return filterTypesForSegment(types, segments, persona).map((t) => {
    const decision = decideReportEntitlement(t.typeId, t.family, tier);
    const project = reportAvailability(t.typeId, 'project', t.allowedScopes);
    const account = reportAvailability(t.typeId, 'account', t.allowedScopes);
    const runScopeType = lead && project.runnable ? 'project' : account.runnable ? 'account' : null;
    const availability = runScopeType === 'account' ? account : project;
    const registryReason = !t.registered ? 'This report is not in the deployed registry and cannot run yet.'
      : !t.enabled ? 'This report is disabled in the report registry.' : null;
    const runnable = registryReason == null && runScopeType != null && availability.runnable;
    const computedScopes = t.allowedScopes.filter((s) => reportAvailability(t.typeId, s, t.allowedScopes).runnable);
    const availabilityState = catalogAvailabilityState(t, runnable, computedScopes);
    return {
      typeId: t.typeId,
      label: t.label,
      family: t.family,
      allowedScopes: t.allowedScopes,
      computedScopes,
      allowedClientSegments: t.allowedClientSegments,
      allowedPersonas: t.allowedPersonas,
      region: typeof t.governanceRequirements.region === 'string' ? t.governanceRequirements.region : null,
      computedScope: availability.computedScope,
      availabilityReason: registryReason ?? (!runnable && project.runnable ? 'Open a program to run this project report.' : availability.availabilityReason),
      availabilityState,
      runScopeType,
      runScopeId: runScopeType === 'account' ? String(organizationId) : runScopeType === 'project' ? lead!.scopeId : null,
      truthfulnessRules: t.truthfulnessRules,
      entitled: decision.entitled,
      feature: decision.feature,
      requiredTier: decision.requiredTier,
      runnable,
    };
  });
}

/** The lead program's segments (its recorded product type); the organisation's when there is no lead or none is recorded. */
async function leadSegments(
  organizationId: number,
  leadProgram: CanvasLeadProgram | null,
  orgSegments: ReportSegment[],
): Promise<ReportSegment[]> {
  if (!leadProgram) return orgSegments;
  return segmentsForScope(await deriveProjectSegments(organizationId, leadProgram.projectId), orgSegments);
}

/** PURE: the programs a person can open the canvas on — anchored ones, by name (every plan). */
function programChoices(summary: { attentionRanked: ProgramMemberInsight[] } | null): CanvasProgramChoice[] {
  return (summary?.attentionRanked ?? [])
    .filter((m): m is ProgramMemberInsight & { programId: string } => typeof m.programId === 'string' && m.programId !== '')
    .map((m) => ({ programId: m.programId, code: m.code ?? null, label: m.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export default function createInsightsCanvasRoutes(): Router {
  const router = Router();

  /**
   * GET /api/insights-canvas/overview
   *
   * The Insights (AnA Reporting Canvas) bootstrap: the org's tier + segments,
   * the entitlement-annotated governed report catalog, the open program's
   * real governed readiness, and the (enterprise-gated) cross-program board
   * rollup. Optional `?persona=` intersects the catalog on allowedPersonas.
   * Optional `?programId=` (a regulatory_programs UUID) names the program the
   * shell has open: it leads, or `openProgram` says why
   * it cannot.
   */
  router.get('/overview', async (req: Request, res: Response) => {
    try {
      const organizationId = authedOrgId(req);
      if (organizationId == null) {
        return res.status(403).json({ success: false, error: 'Tenant context required' });
      }

      const persona = typeof req.query.persona === 'string' ? req.query.persona : null;
      const programId = openProgramParam(req.query.programId);
      if (programId === false) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_PROGRAM_ID', message: 'programId must be a program id.' } });
      }
      const actor = overviewActor(req);
      if (!actor) return res.status(401).json({ success: false, error: 'Sign in to read reporting records.' });
      const accessibleProjectIds = await getAccessibleReportProjectIds(organizationId, actor, requestPgClient(req));

      // Independent reads. The entitlement gate and segment derivation fail
      // closed internally (never throw). The portfolio compute can throw, and
      // a failed read is answered as one (below), never as an empty org.
      const [gateResult, segmentsResult, portfolioResult, catalogResult] = await Promise.allSettled([
        requireReportEntitlement(organizationId, 'portfolio.board_pack', 'portfolio'),
        deriveOrgSegments(organizationId),
        fetchOrgPortfolioSummary(organizationId, { accessibleProjectIds }),
        deployedCatalog(req),
      ]);

      const gate: ReportEntitlementDecision =
        gateResult.status === 'fulfilled' ? gateResult.value : LOCKED_PORTFOLIO_DECISION;
      const tier: Tier = gate.tier;

      const segments: ReportSegment[] =
        segmentsResult.status === 'fulfilled' ? segmentsResult.value : [];

      // Review round 1 (honest-state M5): a failed portfolio read was answered
      // 200 with leadProgram null, so the canvas said "No program readiness
      // yet" for a read that failed. It is a 503 now, the detail logged only;
      // an organisation with no program (a fulfilled null) is still the 200
      // empty.
      if (portfolioResult.status === 'rejected') {
        logger.error('org portfolio read failed', {
          organizationId,
          err:
            portfolioResult.reason instanceof Error
              ? portfolioResult.reason.message
              : String(portfolioResult.reason),
        });
        return res.status(503).json({
          success: false,
          error: {
            code: 'PORTFOLIO_UNAVAILABLE',
            message: 'Program readiness could not be read just now. Try again in a moment.',
          },
        });
      }
      const summary = accessiblePortfolioSummary(organizationId, portfolioResult.value, accessibleProjectIds);
      const types = availableCatalog(catalogResult, organizationId);

      // Lead program — a single program's OWN governed readiness, a base
      // capability shown on every tier (not the enterprise rollup): the open
      // program when one is named; none otherwise (pickLead).
      const { leadProgram, openProgram } = await pickLead(req, organizationId, programId, summary, accessibleProjectIds);

      const catalogSegments = await leadSegments(organizationId, leadProgram, segments);
      const reportTypes = catalogFor(types, catalogSegments, persona, tier, { organizationId, lead: leadProgram });
      const programs = programChoices(summary);

      // Cross-program board rollup — the ENTERPRISE portfolio_rollup capability.
      // Populated only when entitled; otherwise an honest lock (null), mirroring
      // /api/report-os/portfolio/org.
      const portfolio = canvasPortfolio(gate, summary);

      const data: CanvasOverview = {
        organizationId,
        tier,
        tierResolved: gate.tierResolved,
        segments: catalogSegments,
        reportTypes,
        leadProgram,
        openProgram,
        programs,
        portfolio,
        dataScope: 'accessible_projects',
      };

      return res.json({ success: true, data });
    } catch (error) {
      if (error instanceof OpenProgramUnavailableError) return res.status(404).json({ success: false, error: 'Program not found' });
      if (error instanceof CatalogUnavailableError) {
        return res.status(503).json({ success: false, error: { code: 'REPORT_CATALOG_UNAVAILABLE', message: 'The report catalog could not be read. Try again in a moment.' } });
      }
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
