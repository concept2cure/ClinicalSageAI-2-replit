/**
 * RBM board read-model — one aggregated GET that hydrates the ui-v2
 * Risk-Based Monitoring surface (client/src/concept2cure/v2/surfaces/Rbm.tsx
 * + RbmSurfacesA/B) for a single program, from live, org-scoped RBQM data.
 *
 * The kit's RBM shell renders ~10 sub-surfaces (overview, risk-review report,
 * RACT, KRIs, QTLs, central-monitoring signals, patient profiles, site risk,
 * site oversight, monitoring plan) each seeded from the rbm-data.ts fixtures.
 * This endpoint returns those fixtures' shape populated from the rbm_* tables,
 * so the surface can render one call instead of the 12 granular /api/mdx/rbm-*
 * reads it would otherwise fan out.
 *
 * Mounted at /api/mdx-rbm (alongside mdx-rbm.ts which owns the granular CRUD +
 * the compute/POST actions). READ-ONLY: every write path (seed, recompute,
 * central-monitoring run, patient scoring, approvals, CRUD) stays in mdx-rbm.ts.
 *
 *   GET /api/mdx-rbm/rbm-board/:programId
 *     → { success: true, data: <RBM board display shape> }
 *
 * RLS: queries run through requestDb(req) (request-scoped, tenant-pinned) and
 * additionally filter organization_id explicitly (defense in depth, matches the
 * mdx-rbm.ts convention). Fails closed (empty board) when the rbm_* store is
 * absent rather than 500-ing.
 *
 * @module routes/mdx-rbm-board
 */

import { Router, Request, Response } from 'express';
import { and, eq, isNull, isNotNull, inArray, desc } from 'drizzle-orm';

import { createScopedLogger } from '../utils/logger';
import { requestDb } from '../db/requestDb';
import {
  rbmRiskAssessments, rbmRiskItems, rbmKris, rbmKriValues, rbmQtls,
  rbmSignals, rbmSiteRiskScores, rbmPatientProfiles, rbmMonitoringPlans,
  rbmMonitoringActions, rbmDataRuns, users,
} from '../../shared/schema';
import {
  buildRiskReview, renderRiskReviewMarkdown, buildAttentionFeed,
  type RiskReviewInput, type AttentionItem,
} from '../services/rbm/risk-report';
import { freshnessFromRun, type SourceFreshness } from '../services/rbm/metric-ingestion';

const log = createScopedLogger('mdx-rbm-board');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres error code for "relation does not exist" — the rbm_* store hasn't
// been migrated into this database yet. Read routes fail closed to an empty
// board rather than surfacing a 500.
const UNDEFINED_TABLE = '42P01';

const OPEN_SIGNAL = new Set(['new', 'triaged', 'investigating']);
const HIGH_SEV = new Set(['high', 'critical']);
const OPEN_ITEM = new Set(['open', 'mitigating']);

const SIGNAL_SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
// `not_evaluated` sorts above green/within: an indicator nobody has read is an
// oversight gap the monitor should see before the healthy ones.
const KRI_STATUS_RANK: Record<string, number> = { red: 0, amber: 1, not_evaluated: 2, green: 3 };
const QTL_STATUS_RANK: Record<string, number> = { breached: 0, approaching: 1, not_evaluated: 2, within: 3 };
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

// Attention-feed kind → the sub-surface tab it deep-links to, and a short
// human category label. Pure display transforms of the real AttentionItem.kind.
const NAV_BY_KIND: Record<AttentionItem['kind'], string> = {
  qtl: 'qtls', kri: 'kris', signal: 'signals', patient: 'patients',
  action: 'plan', assessment: 'ract', data: 'overview',
};
const KIND_LABEL: Record<AttentionItem['kind'], string> = {
  qtl: 'QTL', kri: 'KRI', signal: 'Signal', patient: 'Patient',
  action: 'Action', assessment: 'Assessment', data: 'Data',
};

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId
    ?? (req as any).tenantContext?.organizationId
    ?? (req as any).tenantId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/** Parse a pg numeric (returned as string) to a JS number, or null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Serialize a timestamp column (Date | string | null) to an ISO string, or null. */
function iso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Read metadata.amendmentReason off a jsonb column without throwing. */
function amendmentReason(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const r = (metadata as Record<string, unknown>).amendmentReason;
    return typeof r === 'string' ? r : null;
  }
  return null;
}

/** Read metadata.approvalReason off a jsonb column without throwing. */
function approvalReason(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const r = (metadata as Record<string, unknown>).approvalReason;
    return typeof r === 'string' ? r : null;
  }
  return null;
}

export default function createRbmBoardRoutes(): Router {
  const router = Router();

  /**
   * GET /api/mdx-rbm/rbm-board/:programId
   * Aggregated read-model for the RBM shell: summary, attention feed, risk
   * review report, RACT (assessment + CtQ register), KRIs (with trend sparks),
   * QTLs, central-monitoring signals, patient profiles, site risk, site
   * oversight counts, monitoring plan and its actions — all for one program,
   * tenant-scoped.
   */
  router.get('/rbm-board/:programId', async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) {
      return res.status(403).json({ success: false, error: 'Organization context required' });
    }
    const programId = String(req.params.programId);
    if (!UUID_RE.test(programId)) {
      return res.status(422).json({ success: false, error: 'programId must be a UUID' });
    }

    const asOf = new Date().toISOString();
    const todayStr = asOf.slice(0, 10);
    const db = requestDb(req);

    try {
      // ── Fetch the raw, tenant-scoped rows for every board section. ──────────
      const [
        assessmentRows, itemRows, kriRows, qtlRows, signalRows,
        siteRows, patientRows, planRows,
      ] = await Promise.all([
        db.select({ a: rbmRiskAssessments, approver: users.name })
          .from(rbmRiskAssessments)
          .leftJoin(users, eq(users.id, rbmRiskAssessments.approvedBy))
          .where(and(
            eq(rbmRiskAssessments.organizationId, orgId),
            eq(rbmRiskAssessments.programId, programId),
            isNull(rbmRiskAssessments.deletedAt),
          )),
        db.select({ it: rbmRiskItems, owner: users.name })
          .from(rbmRiskItems)
          .leftJoin(users, eq(users.id, rbmRiskItems.assignedTo))
          .where(and(
            eq(rbmRiskItems.organizationId, orgId),
            eq(rbmRiskItems.programId, programId),
            isNull(rbmRiskItems.deletedAt),
          )),
        db.select().from(rbmKris)
          .where(and(
            eq(rbmKris.organizationId, orgId),
            eq(rbmKris.programId, programId),
            isNull(rbmKris.deletedAt),
          )),
        db.select().from(rbmQtls)
          .where(and(
            eq(rbmQtls.organizationId, orgId),
            eq(rbmQtls.programId, programId),
            isNull(rbmQtls.deletedAt),
          )),
        db.select().from(rbmSignals)
          .where(and(
            eq(rbmSignals.organizationId, orgId),
            eq(rbmSignals.programId, programId),
            isNull(rbmSignals.deletedAt),
          )),
        db.select().from(rbmSiteRiskScores)
          .where(and(
            eq(rbmSiteRiskScores.organizationId, orgId),
            eq(rbmSiteRiskScores.programId, programId),
          )),
        db.select().from(rbmPatientProfiles)
          .where(and(
            eq(rbmPatientProfiles.organizationId, orgId),
            eq(rbmPatientProfiles.programId, programId),
            isNull(rbmPatientProfiles.deletedAt),
          )),
        db.select({ p: rbmMonitoringPlans, approver: users.name })
          .from(rbmMonitoringPlans)
          .leftJoin(users, eq(users.id, rbmMonitoringPlans.approvedBy))
          .where(and(
            eq(rbmMonitoringPlans.organizationId, orgId),
            eq(rbmMonitoringPlans.programId, programId),
            isNull(rbmMonitoringPlans.deletedAt),
          )),
      ]);

      // KRI trend sparklines: readings for this program's KRIs, oldest first.
      const kriIds = kriRows.map(k => k.id);
      const sparkByKri = new Map<number, number[]>();
      if (kriIds.length > 0) {
        const valueRows = await db.select({
          kriId: rbmKriValues.kriId, value: rbmKriValues.value, observedAt: rbmKriValues.observedAt,
        })
          .from(rbmKriValues)
          .where(and(
            eq(rbmKriValues.organizationId, orgId),
            inArray(rbmKriValues.kriId, kriIds),
          ));
        valueRows.sort((x, y) => (iso(x.observedAt) ?? '').localeCompare(iso(y.observedAt) ?? ''));
        for (const v of valueRows) {
          const n = num(v.value);
          if (n === null) continue;
          const arr = sparkByKri.get(v.kriId) ?? [];
          arr.push(n);
          sparkByKri.set(v.kriId, arr);
        }
      }

      // Monitoring actions for the program (scoped through their plan), with
      // the owner's display name resolved.
      const actionRows = await db.select({ act: rbmMonitoringActions, owner: users.name })
        .from(rbmMonitoringActions)
        .innerJoin(rbmMonitoringPlans, eq(rbmMonitoringPlans.id, rbmMonitoringActions.planId))
        .leftJoin(users, eq(users.id, rbmMonitoringActions.owner))
        .where(and(
          eq(rbmMonitoringActions.organizationId, orgId),
          eq(rbmMonitoringPlans.programId, programId),
        ));

      // ── Per-source data freshness: the newest run per feed. ────────────────
      // Queried defensively in its own try/catch rather than inside the board's
      // outer one: an older database can carry the rbm_* store without the
      // ingestion tables, and a missing rbm_data_runs must not blank the whole
      // board. No runs simply means no feed is tracked, which the surface says
      // outright rather than treating as healthy.
      let freshness: SourceFreshness[] = [];
      try {
        const runRows = await db.select({
          source: rbmDataRuns.source,
          startedAt: rbmDataRuns.startedAt,
          dataCutoff: rbmDataRuns.dataCutoff,
          status: rbmDataRuns.status,
          rowsAccepted: rbmDataRuns.rowsAccepted,
          rowsRejected: rbmDataRuns.rowsRejected,
        })
          .from(rbmDataRuns)
          .where(and(
            eq(rbmDataRuns.organizationId, orgId),
            eq(rbmDataRuns.programId, programId),
          ))
          .orderBy(desc(rbmDataRuns.startedAt))
          .limit(500);

        const newestBySource = new Map<string, typeof runRows[number]>();
        for (const r of runRows) if (!newestBySource.has(r.source)) newestBySource.set(r.source, r);
        const now = new Date(asOf);
        freshness = [...newestBySource.values()]
          .map(r => freshnessFromRun({
            source: r.source,
            startedAt: iso(r.startedAt),
            dataCutoff: r.dataCutoff ? String(r.dataCutoff) : null,
            status: r.status,
            rowsAccepted: r.rowsAccepted,
            rowsRejected: r.rowsRejected,
          }, now))
          // Stale first — the feed that stopped is the one worth seeing.
          .sort((x, y) => Number(y.stale) - Number(x.stale) || x.source.localeCompare(y.source));
      } catch (err) {
        if ((err as { code?: string })?.code !== UNDEFINED_TABLE) throw err;
      }

      // ── Choose the governing assessment/plan (active, else most-recent). ────
      // Highest version wins, so an open draft amendment is what the RACT
      // surface shows and edits. The APPROVED version remains the governing
      // risk basis for the risk review and the attention feed — those read
      // through loadRiskReviewInput, which orders active first — so an
      // unapproved draft can never be reported as the study's risk position.
      const sortedAssessments = [...assessmentRows].sort(
        (x, y) => (y.a.version ?? 0) - (x.a.version ?? 0)
          || (iso(y.a.updatedAt) ?? '').localeCompare(iso(x.a.updatedAt) ?? ''),
      );
      const chosenAssessment = sortedAssessments[0] ?? null;

      // Plans version like assessments, so the same rule applies: highest
      // version wins, and an open draft amendment is what the plan surface shows
      // and edits. Ordered by version rather than updated_at, because touching
      // an archived row (an action closing out under it) must not promote it
      // back to being the plan on screen.
      const sortedPlans = [...planRows].sort(
        (x, y) => (y.p.version ?? 0) - (x.p.version ?? 0)
          || (iso(y.p.updatedAt) ?? '').localeCompare(iso(x.p.updatedAt) ?? ''),
      );
      const chosenPlan = sortedPlans[0] ?? null;

      // ── Derived aggregates for the summary + the report/attention builders. ─
      const criticalItems = itemRows.filter(r => r.it.isCritical);
      const openItems = itemRows.filter(r => OPEN_ITEM.has(r.it.status));
      const highItems = itemRows.filter(r => (r.it.riskScore ?? 0) >= 15);
      const openCritical = itemRows
        .filter(r => r.it.isCritical && OPEN_ITEM.has(r.it.status))
        .sort((x, y) => (y.it.riskScore ?? 0) - (x.it.riskScore ?? 0))
        .slice(0, 10)
        .map(r => r.it.ctqFactor);

      const redKris = kriRows.filter(k => k.status === 'red').map(k => k.name);
      const amberKris = kriRows.filter(k => k.status === 'amber').map(k => k.name);
      const unevalKris = kriRows.filter(k => k.status === 'not_evaluated').map(k => k.name);

      const breachedQtls = qtlRows.filter(q => q.status === 'breached').map(q => q.parameter);
      const approachingQtls = qtlRows.filter(q => q.status === 'approaching').map(q => q.parameter);
      const unevalQtls = qtlRows.filter(q => q.status === 'not_evaluated').map(q => q.parameter);

      const openSignals = signalRows.filter(s => OPEN_SIGNAL.has(s.status));
      const highSignals = openSignals.filter(s => HIGH_SEV.has(s.severity)).map(s => s.title);

      const enhancedSites = siteRows.filter(s => s.monitoringTier === 'enhanced').length;

      const flaggedPatients = patientRows.filter(p => p.status === 'flagged').length;
      const reviewPatients = patientRows.filter(p => p.status === 'review').length;

      const openActions = actionRows.filter(r => r.act.status !== 'done').length;
      const overdueActions = actionRows
        .filter(r => r.act.dueDate && r.act.dueDate < todayStr && r.act.status !== 'done')
        .map(r => ({ description: r.act.description, dueDate: r.act.dueDate, priority: r.act.priority }));

      // ── Risk review report + attention feed via the shared pure builders. ──
      const reviewInput: RiskReviewInput = {
        programId,
        asOf,
        assessment: chosenAssessment ? {
          title: chosenAssessment.a.title,
          framework: chosenAssessment.a.framework,
          overallRisk: chosenAssessment.a.overallRisk,
          status: chosenAssessment.a.status,
          approvedAt: iso(chosenAssessment.a.approvedAt),
        } : null,
        riskItems: {
          total: itemRows.length,
          critical: criticalItems.length,
          open: openItems.length,
          high: highItems.length,
          openCritical,
        },
        kris: { total: kriRows.length, red: redKris, amber: amberKris, notEvaluated: unevalKris },
        qtls: { total: qtlRows.length, breached: breachedQtls, approaching: approachingQtls, notEvaluated: unevalQtls },
        signals: { open: openSignals.length, high: highSignals },
        sites: { total: siteRows.length, enhanced: enhancedSites },
        patients: { total: patientRows.length, flagged: flaggedPatients, review: reviewPatients },
        actions: { open: openActions, overdue: overdueActions },
        dataSources: freshness.map(f => ({ source: f.source, stale: f.stale, ageDays: f.ageDays, status: f.status })),
      };
      const report = buildRiskReview(reviewInput);
      const attention = buildAttentionFeed(reviewInput).map(a => ({
        sev: a.severity,
        kind: KIND_LABEL[a.kind],
        nav: NAV_BY_KIND[a.kind],
        t: a.label,
        d: a.detail ?? null,
      }));

      // ── Site oversight: open / high-severity open signal load per site. ─────
      // Mirrors the mdx-rbm.ts /rbm-site-oversight join (signals keyed by
      // site_id, surfaced under the site's site_number).
      const oversight: Record<string, { open: number; high: number }> = {};
      for (const s of siteRows) {
        const key = s.siteNumber ?? s.siteId ?? String(s.id);
        const open = openSignals.filter(sig => sig.siteId && sig.siteId === s.siteId);
        oversight[key] = {
          open: open.length,
          high: open.filter(sig => HIGH_SEV.has(sig.severity)).length,
        };
      }

      // ── Shape each section to what the surface JSX consumes. ────────────────
      // Scoped to the assessment being shown. Fetching program-wide would
      // concatenate the registers of every version once an amendment is open.
      // When the program has no assessment at all, every item is shown — those
      // rows have nowhere else to belong.
      const scopedItems = chosenAssessment
        ? itemRows.filter(r => r.it.assessmentId === chosenAssessment.a.id)
        : itemRows;
      const items = [...scopedItems]
        .sort((x, y) => (y.it.riskScore ?? 0) - (x.it.riskScore ?? 0))
        .map(({ it, owner }) => ({
          id: it.id,
          category: it.category,
          factor: it.ctqFactor,
          l: it.likelihood,
          i: it.impact,
          det: it.detectability,
          critical: !!it.isCritical,
          mitigation: it.mitigation,
          residual: it.residualScore,
          status: it.status,
          owner: owner ?? null,
          refCode: it.refCode,
        }));

      const kris = [...kriRows]
        .sort((x, y) => (KRI_STATUS_RANK[x.status] ?? 9) - (KRI_STATUS_RANK[y.status] ?? 9) || x.name.localeCompare(y.name))
        .map(k => ({
          id: k.id,
          name: k.name,
          metric: k.metricDefinition,
          source: k.dataSource,
          unit: k.unit,
          dir: k.direction,
          amber: num(k.thresholdAmber),
          red: num(k.thresholdRed),
          current: num(k.currentValue),
          status: k.status,
          at: iso(k.evaluatedAt),
          spark: sparkByKri.get(k.id) ?? [],
        }));

      const qtls = [...qtlRows]
        .sort((x, y) => (QTL_STATUS_RANK[x.status] ?? 9) - (QTL_STATUS_RANK[y.status] ?? 9))
        .map(q => ({
          id: q.id,
          parameter: q.parameter,
          rationale: q.rationale,
          unit: null,
          secondary: num(q.secondaryLimit),
          threshold: num(q.threshold),
          direction: q.direction ?? 'upper',
          thresholdLower: num(q.thresholdLower),
          secondaryLower: num(q.secondaryLimitLower),
          current: num(q.currentValue),
          status: q.status,
          breachActionTaken: q.breachActionTaken,
        }));

      const signals = [...signalRows]
        .sort((x, y) =>
          (SIGNAL_SEV_RANK[x.severity] ?? 9) - (SIGNAL_SEV_RANK[y.severity] ?? 9)
          || (iso(y.detectedAt) ?? '').localeCompare(iso(x.detectedAt) ?? ''))
        .map(s => ({
          id: s.id,
          source: s.source,
          type: s.signalType,
          severity: s.severity,
          title: s.title,
          site: s.siteId ?? '—',
          detail: s.detail,
          detected: iso(s.detectedAt),
          status: s.status,
          resolution: s.resolutionNotes,
        }));

      const patients = [...patientRows]
        .sort((x, y) => (num(y.anomalyScore) ?? -Infinity) - (num(x.anomalyScore) ?? -Infinity))
        .map(p => ({
          sid: p.subjectId,
          site: p.siteId,
          anomaly: num(p.anomalyScore),
          top: p.topDimension,
          status: p.status,
          at: iso(p.scoredAt),
          metrics: [] as { k: string; z: number }[],
        }));

      const sites = [...siteRows]
        .sort((x, y) => (num(y.compositeRisk) ?? -Infinity) - (num(x.compositeRisk) ?? -Infinity))
        .map(s => ({
          n: s.siteNumber,
          name: s.siteName,
          country: null,
          composite: num(s.compositeRisk),
          enr: num(s.enrollmentRisk),
          qual: num(s.qualityRisk),
          ops: num(s.operationalRisk),
          tier: s.monitoringTier,
          drivers: Array.isArray(s.drivers) ? (s.drivers as string[]) : [],
          at: iso(s.scoredAt),
        }));

      const actions = [...actionRows]
        .sort((x, y) =>
          (PRIORITY_RANK[x.act.priority] ?? 9) - (PRIORITY_RANK[y.act.priority] ?? 9)
          || (x.act.dueDate ?? '9999').localeCompare(y.act.dueDate ?? '9999'))
        .map(({ act, owner }) => ({
          id: act.id,
          // A program can hold several plan versions and this list spans all of
          // them. Surfaced so the plan surface can show — and mutate — only the
          // actions belonging to the plan it is displaying.
          planId: act.planId,
          type: act.actionType,
          title: act.description,
          priority: act.priority,
          owner: owner ?? 'Unassigned',
          due: act.dueDate ?? '—',
          status: act.status,
          overdue: !!(act.dueDate && act.dueDate < todayStr && act.status !== 'done'),
          origin: act.signalId != null ? 'signal' : act.riskItemId != null ? 'ract' : 'plan',
        }));

      const assessment = chosenAssessment ? {
        id: chosenAssessment.a.id,
        framework: chosenAssessment.a.framework,
        version: chosenAssessment.a.version,
        status: chosenAssessment.a.status,
        updated: iso(chosenAssessment.a.updatedAt),
        approval: chosenAssessment.a.approvedAt ? {
          by: chosenAssessment.approver ?? null,
          when: iso(chosenAssessment.a.approvedAt),
          reason: approvalReason(chosenAssessment.a.metadata),
        } : null,
        // The real version chain. An amendment creates a new draft version and
        // approving it archives the one it supersedes, so every row here is a
        // version that existed — the approved ones with the signature they were
        // approved under. Newest first.
        history: sortedAssessments.map(r => ({
          id: r.a.id,
          v: r.a.version,
          status: r.a.status,
          by: r.approver ?? null,
          when: iso(r.a.approvedAt),
          reason: approvalReason(r.a.metadata),
          amendmentReason: amendmentReason(r.a.metadata),
        })),
      } : null;

      const plan = chosenPlan ? {
        id: chosenPlan.p.id,
        title: chosenPlan.p.title,
        strategy: chosenPlan.p.strategy,
        status: chosenPlan.p.status,
        version: chosenPlan.p.version,
        updated: iso(chosenPlan.p.updatedAt),
        // Not persisted per-plan: tier→visit-cadence text, the AnA-draft
        // provenance flag, and the plan "basis" narrative. Returned null/false
        // rather than fabricated (see caveats).
        tiers: null,
        anaDraft: false,
        approval: chosenPlan.p.approvedAt ? {
          by: chosenPlan.approver ?? null,
          when: iso(chosenPlan.p.approvedAt),
          reason: approvalReason(chosenPlan.p.metadata),
        } : null,
        // The plan's version chain, same construction as the assessment's:
        // every row is a version that existed, the approved ones carrying the
        // signature they were approved under. Newest first.
        history: sortedPlans.map(r => ({
          id: r.p.id,
          v: r.p.version,
          status: r.p.status,
          by: r.approver ?? null,
          when: iso(r.p.approvedAt),
          reason: approvalReason(r.p.metadata),
          amendmentReason: amendmentReason(r.p.metadata),
        })),
      } : null;

      const summary = {
        overallRisk: chosenAssessment?.a.overallRisk ?? null,
        asOf,
        riskItems: {
          total: itemRows.length,
          critical: criticalItems.length,
          open: openItems.length,
          high: highItems.length,
        },
        kris: { total: kriRows.length, red: redKris.length, amber: amberKris.length, notEvaluated: unevalKris.length },
        qtls: { total: qtlRows.length, breached: breachedQtls.length, approaching: approachingQtls.length, notEvaluated: unevalQtls.length },
        signals: { total: signalRows.length, open: openSignals.length, high: highSignals.length },
        sites: { total: siteRows.length, enhanced: enhancedSites },
        patients: { scored: patientRows.length, flagged: flaggedPatients, review: reviewPatients },
      };

      return res.json({
        success: true,
        data: {
          programId,
          asOf,
          summary,
          attention,
          report,
          reportMarkdown: renderRiskReviewMarkdown(report),
          assessment,
          items,
          kris,
          qtls,
          signals,
          patients,
          sites,
          oversight,
          plan,
          actions,
          freshness,
        },
      });
    } catch (err) {
      // The rbm_* store hasn't been provisioned in this database — fail closed
      // to an empty board rather than 500.
      if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
        return res.json({
          success: true,
          data: {
            programId, asOf,
            summary: {
              overallRisk: null, asOf,
              riskItems: { total: 0, critical: 0, open: 0, high: 0 },
              kris: { total: 0, red: 0, amber: 0, notEvaluated: 0 },
              qtls: { total: 0, breached: 0, approaching: 0, notEvaluated: 0 },
              signals: { total: 0, open: 0, high: 0 },
              sites: { total: 0, enhanced: 0 },
              patients: { scored: 0, flagged: 0, review: 0 },
            },
            attention: [], report: null, reportMarkdown: null,
            assessment: null, items: [], kris: [], qtls: [], signals: [],
            patients: [], sites: [], oversight: {}, plan: null, actions: [],
            freshness: [],
            pendingStore: true,
          },
        });
      }
      log.error('rbm-board failed', { err: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ success: false, error: 'Failed to assemble RBM board' });
    }
  });

  /**
   * GET /api/mdx-rbm/rbm-programs
   * The programs (studies) that have a real RBM risk assessment for this org —
   * the selectable studies for the RBM shell's study picker. Ids are the same
   * program_id UUIDs the board keys on, so a selected study always resolves.
   * The label is the most-recent assessment title (the only program-level label
   * the RBM store carries — there is no separate program-name column, so nothing
   * is fabricated). Fails closed to an empty list when the store is unprovisioned.
   * Response: { success: true, data: { id: string; label: string }[], total }
   */
  router.get('/rbm-programs', async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) {
      return res.status(403).json({ success: false, error: 'Organization context required' });
    }
    const db = requestDb(req);
    try {
      const rows = await db
        .select({
          programId: rbmRiskAssessments.programId,
          title: rbmRiskAssessments.title,
        })
        .from(rbmRiskAssessments)
        .where(and(
          eq(rbmRiskAssessments.organizationId, orgId),
          isNotNull(rbmRiskAssessments.programId),
          isNull(rbmRiskAssessments.deletedAt),
        ))
        .orderBy(desc(rbmRiskAssessments.updatedAt));

      const seen = new Map<string, string>();
      for (const r of rows) {
        if (r.programId && !seen.has(r.programId)) seen.set(r.programId, r.title);
      }
      const data = Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
      return res.json({ success: true, data, total: data.length });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
        return res.json({ success: true, data: [], total: 0 });
      }
      log.error('rbm-programs failed', { err: err instanceof Error ? err.message : String(err) });
      return res.status(500).json({ success: false, error: 'Failed to list RBM programs' });
    }
  });

  return router;
}
