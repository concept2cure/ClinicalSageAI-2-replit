/**
 * IVD Completeness read-model — IVDR technical-file / Performance-Evaluation
 * completeness for the ui-v2 `ivd-completeness` surface
 * (client/src/concept2cure/v2/surfaces/IvdCompleteness.tsx).
 *
 * The surface renders the regulator's fixed IVDR requirement families
 * (GSPR Annex I, analytical + clinical performance, scientific validity, the
 * Performance Evaluation Report, device description/classification, and
 * post-market PMPF/PMS) with a completeness percentage and a per-requirement
 * item list. This endpoint returns that exact display shape, populated from
 * the org's real IVDR records:
 *
 *   - desc  ← ivdr_classifications            (recorded Annex VIII determinations)
 *   - anal  ← ivd_analytical_performance      (per-study pass/fail)
 *   - clin  ← ivd_clinical_performance        (per-study endpoint-met)
 *   - valid ← ivdr_per_documents.scientific_validity_done   (latest PER)
 *   - per   ← ivdr_per_documents pillar coverage            (latest PER)
 *   - pmpf  ← ivdr_per_documents.pmpf_plan_attached         (latest PER)
 *   - gspr  ← ivdr_gspr_assessments           (legacy GSPR-checklist store)
 *
 * The IVDR requirement TAXONOMY (family id/label/annex-ref/blurb) is regulatory
 * reference structure encoded here as constants — it is NOT org data. Item
 * percentages for the performance families are a coarse projection of each
 * record's lifecycle status (see HONESTY notes below); GSPR and PER percentages
 * are genuinely computed. No provenance, confidence, audit-hash, owner, version
 * or free-text evidence-flag is fabricated — the surface's optional `flag` is
 * omitted and `summary.flags` is always 0 because no such field is stored.
 *
 * Envelope: { success: true, data: <displayShape> }. Org-scoped; fail-closed
 * (503) when the IVD read-model tables are not provisioned.
 *
 * @module routes/ivd-completeness-routes
 */

import { Router, Request, Response } from 'express';
import { and, eq, isNull, sql, desc as descOrder } from 'drizzle-orm';

import { requestDb } from '../db/requestDb';
import { createScopedLogger } from '../utils/logger.js';
import {
  ivdrClassifications,
  ivdrPerDocuments,
  ivdAnalyticalPerformance,
  ivdClinicalPerformance,
} from '../../shared/schema';

const logger = createScopedLogger('ivd-completeness-routes');

// ─── Display-shape types (mirror IvdCompleteness.tsx IvdFamily / IvdItem) ──────

type ItemStatus = 'complete' | 'review' | 'draft' | 'not_started';

interface IvdItem {
  code: string;
  title: string;
  ref: string;
  status: ItemStatus;
  pct: number;
  flag?: string;
}

interface IvdFamily {
  id: string;
  label: string;
  ref: string;
  blurb: string;
  pct: number;
  items: IvdItem[];
}

// ─── IVDR requirement taxonomy (regulatory reference structure, not org data) ──
// Mirrors the client seed so the live board reads identically to the fixture.

const FAMILY_ORDER = ['gspr', 'anal', 'clin', 'valid', 'per', 'desc', 'pmpf'] as const;
type FamilyId = (typeof FAMILY_ORDER)[number];

const FAMILY_META: Record<FamilyId, { label: string; ref: string; blurb: string; code: string }> = {
  gspr: {
    label: 'General Safety & Performance Requirements',
    ref: 'IVDR Annex I',
    blurb: 'Conformity of the device against each applicable GSPR — the backbone of the technical file.',
    code: 'Annex I',
  },
  anal: {
    label: 'Analytical performance',
    ref: 'IVDR Annex I §9.1 — Annex XIII Part A',
    blurb: 'Sensitivity, specificity, LoD, linearity, precision, trueness, cross-reactivity.',
    code: 'Annex XIII-A',
  },
  clin: {
    label: 'Clinical performance',
    ref: 'IVDR Annex XIII Part A',
    blurb: 'Diagnostic sensitivity/specificity, predictive values, likelihood ratios vs a reference.',
    code: 'Annex XIII-A',
  },
  valid: {
    label: 'Scientific validity',
    ref: 'IVDR Annex XIII Part A',
    blurb: 'Association of the analyte with the targeted clinical condition/physiological state.',
    code: 'Annex XIII-A',
  },
  per: {
    label: 'Performance Evaluation Report (PER)',
    ref: 'IVDR Annex XIII',
    blurb: 'The consolidated report tying scientific validity + analytical + clinical performance together.',
    code: 'Annex XIII',
  },
  desc: {
    label: 'Device description & classification',
    ref: 'IVDR Annex II — Annex VIII',
    blurb: 'Intended purpose, target markers/population, and the Annex VIII risk-class rule.',
    code: 'Annex VIII',
  },
  pmpf: {
    label: 'Post-market performance & surveillance',
    ref: 'IVDR Annex III — Art. 78-81',
    blurb: 'PMPF plan/report, PMS plan, trend reporting and the periodic safety update (PSUR).',
    code: 'Annex III',
  },
};

function avgPct(items: IvdItem[]): number {
  if (!items.length) return 0;
  return Math.round(items.reduce((a, b) => a + (b.pct || 0), 0) / items.length);
}

/** Coarse pct/status projection of a boolean pillar-completion flag. */
function boolItem(done: boolean | null): { status: ItemStatus; pct: number } {
  return done === true ? { status: 'complete', pct: 100 } : { status: 'not_started', pct: 0 };
}

/** Await a Drizzle select, tolerating an unprovisioned table (42P01). */
async function runSelect<R>(qb: PromiseLike<R[]>): Promise<{ rows: R[]; missing: boolean }> {
  try {
    const rows = await qb;
    return { rows, missing: false };
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return { rows: [], missing: true };
    throw e;
  }
}

export default function createIvdCompletenessRoutes(): Router {
  const router = Router();

  /** Org id from the authenticated session — never from the client body. */
  function getOrgId(req: Request): number {
    const raw =
      (req as any).tenantId ??
      (req as any).tenantContext?.organizationId ??
      (req as any).user?.organizationId;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    if (!Number.isInteger(n) || (n as number) <= 0) {
      throw new Error('IVD_NO_TENANT: organization context required');
    }
    return n as number;
  }

  /**
   * GET /completeness
   * Returns the IVDR technical-file completeness board for the org.
   */
  router.get('/completeness', async (req: Request, res: Response) => {
    let orgId: number;
    try {
      orgId = getOrgId(req);
    } catch {
      return res
        .status(403)
        .json({ success: false, error: 'Organization context required', code: 'IVD_NO_TENANT' });
    }

    try {
      const d = requestDb(req);

      // ── Real, org-scoped IVDR records (typed Drizzle builders) ──────────────
      const classSel = d
        .select({
          deviceName: ivdrClassifications.deviceName,
          ivdrClass: ivdrClassifications.ivdrClass,
        })
        .from(ivdrClassifications)
        .where(and(eq(ivdrClassifications.organizationId, orgId), isNull(ivdrClassifications.deletedAt)))
        .orderBy(descOrder(ivdrClassifications.createdAt))
        .limit(200);

      const perSel = d
        .select({
          deviceName: ivdrPerDocuments.deviceName,
          perVersion: ivdrPerDocuments.perVersion,
          scientificValidityDone: ivdrPerDocuments.scientificValidityDone,
          analyticalPerformanceDone: ivdrPerDocuments.analyticalPerformanceDone,
          clinicalPerformanceDone: ivdrPerDocuments.clinicalPerformanceDone,
          pmpfPlanAttached: ivdrPerDocuments.pmpfPlanAttached,
        })
        .from(ivdrPerDocuments)
        .where(and(eq(ivdrPerDocuments.organizationId, orgId), isNull(ivdrPerDocuments.deletedAt)))
        .orderBy(descOrder(ivdrPerDocuments.updatedAt))
        .limit(1);

      const analSel = d
        .select({
          title: ivdAnalyticalPerformance.title,
          studyType: ivdAnalyticalPerformance.studyType,
          passFail: ivdAnalyticalPerformance.passFail,
        })
        .from(ivdAnalyticalPerformance)
        .where(and(eq(ivdAnalyticalPerformance.organizationId, orgId), isNull(ivdAnalyticalPerformance.deletedAt)))
        .orderBy(descOrder(ivdAnalyticalPerformance.createdAt))
        .limit(200);

      const clinSel = d
        .select({
          title: ivdClinicalPerformance.title,
          endpointMet: ivdClinicalPerformance.preSpecifiedEndpointMet,
        })
        .from(ivdClinicalPerformance)
        .where(and(eq(ivdClinicalPerformance.organizationId, orgId), isNull(ivdClinicalPerformance.deletedAt)))
        .orderBy(descOrder(ivdClinicalPerformance.updatedAt))
        .limit(200);

      // Sequential to keep a single request-scoped connection well-behaved.
      const classRes = await runSelect(classSel);
      const perRes = await runSelect(perSel);
      const analRes = await runSelect(analSel);
      const clinRes = await runSelect(clinSel);

      // Fail-closed: if EVERY IVD read-model table is unprovisioned, deny.
      if (classRes.missing && perRes.missing && analRes.missing && clinRes.missing) {
        logger.warn('IVD read-model tables not provisioned', { orgId });
        return res
          .status(503)
          .json({ success: false, error: 'IVD tables not yet provisioned', code: 'IVD_NOT_PROVISIONED' });
      }

      const classRows = classRes.rows;
      const analRows = analRes.rows;
      const clinRows = clinRes.rows;
      const perDoc = perRes.rows[0];

      // ── GSPR: real compliance % from the legacy GSPR-checklist store. ────────
      // Separate lineage from the PER store; queried through the request-scoped
      // client (RLS gate) with an explicit org filter. Absent table → null.
      let gsprPct: number | null = null;
      try {
        const gsprResult = (await d.execute(sql`
          SELECT requirements
          FROM ivdr_gspr_assessments
          WHERE organization_id = ${orgId}
          ORDER BY updated_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        `)) as unknown as { rows?: Array<{ requirements?: unknown }> };
        const gRows = gsprResult.rows ?? [];
        const reqs = Array.isArray(gRows[0]?.requirements)
          ? (gRows[0]!.requirements as Array<{ status?: string }>)
          : [];
        if (reqs.length) {
          const applicable = reqs.filter((r) => r?.status !== 'not_applicable');
          const compliant = applicable.filter((r) => r?.status === 'compliant');
          gsprPct = applicable.length ? Math.round((compliant.length / applicable.length) * 100) : 0;
        }
      } catch (gErr) {
        if ((gErr as { code?: string })?.code !== '42P01') {
          logger.warn('GSPR read failed (non-fatal)', {
            err: gErr instanceof Error ? gErr.message : String(gErr),
          });
        }
        gsprPct = null;
      }

      // ── Build family items from real records ────────────────────────────────

      // Analytical: pass → complete(100); fail → review(70, evidence present but
      // not passing); pending/absent → draft(40, in progress).
      const analItems: IvdItem[] = analRows.map((r) => {
        const pf = (r.passFail || '').toLowerCase();
        const status: ItemStatus = pf === 'pass' ? 'complete' : pf === 'fail' ? 'review' : 'draft';
        const pct = status === 'complete' ? 100 : status === 'review' ? 70 : 40;
        return { code: r.studyType || 'analytical', title: r.title, ref: FAMILY_META.anal.ref, status, pct };
      });

      // Clinical: endpoint met → complete(100); not met → review(70); pending → draft(40).
      const clinItems: IvdItem[] = clinRows.map((r) => {
        const status: ItemStatus =
          r.endpointMet === true ? 'complete' : r.endpointMet === false ? 'review' : 'draft';
        const pct = status === 'complete' ? 100 : status === 'review' ? 70 : 40;
        return { code: 'clinical', title: r.title, ref: FAMILY_META.clin.ref, status, pct };
      });

      // Device description & classification: a recorded Annex VIII determination.
      const descItems: IvdItem[] = classRows.map((r) => ({
        code: FAMILY_META.desc.code,
        title: r.ivdrClass ? `${r.deviceName} · Class ${r.ivdrClass}` : r.deviceName,
        ref: FAMILY_META.desc.ref,
        status: 'complete' as ItemStatus,
        pct: 100,
      }));

      // GSPR: single computed item; empty when the store is absent.
      const gsprItems: IvdItem[] =
        gsprPct == null
          ? []
          : [
              {
                code: FAMILY_META.gspr.code,
                title: 'GSPR conformity (Annex I)',
                ref: FAMILY_META.gspr.ref,
                status:
                  gsprPct >= 100 ? 'complete' : gsprPct >= 60 ? 'review' : gsprPct > 0 ? 'draft' : 'not_started',
                pct: gsprPct,
              },
            ];

      // Scientific validity / PER / PMPF: the latest Performance Evaluation doc.
      const validItems: IvdItem[] = perDoc
        ? [
            {
              code: FAMILY_META.valid.code,
              title: 'Scientific validity report',
              ref: FAMILY_META.valid.ref,
              ...boolItem(perDoc.scientificValidityDone),
            },
          ]
        : [];

      let perItems: IvdItem[] = [];
      if (perDoc) {
        const pillars = [
          perDoc.scientificValidityDone,
          perDoc.analyticalPerformanceDone,
          perDoc.clinicalPerformanceDone,
        ];
        const covered = pillars.filter((p) => p === true).length;
        const perPct = Math.round((covered / 3) * 100);
        const status: ItemStatus =
          covered === 3 ? 'complete' : perPct >= 60 ? 'review' : perPct > 0 ? 'draft' : 'not_started';
        perItems = [
          {
            code: FAMILY_META.per.code,
            title: perDoc.perVersion
              ? `Performance Evaluation Report ${perDoc.perVersion}`
              : 'Performance Evaluation Report (PER)',
            ref: FAMILY_META.per.ref,
            status,
            pct: perPct,
          },
        ];
      }

      const pmpfItems: IvdItem[] = perDoc
        ? [
            {
              code: FAMILY_META.pmpf.code,
              title: 'Post-Market Performance Follow-up (PMPF) plan',
              ref: FAMILY_META.pmpf.ref,
              ...boolItem(perDoc.pmpfPlanAttached),
            },
          ]
        : [];

      const itemsByFamily: Record<FamilyId, IvdItem[]> = {
        gspr: gsprItems,
        anal: analItems,
        clin: clinItems,
        valid: validItems,
        per: perItems,
        desc: descItems,
        pmpf: pmpfItems,
      };

      const families: IvdFamily[] = FAMILY_ORDER.map((id) => {
        const items = itemsByFamily[id];
        return {
          id,
          label: FAMILY_META[id].label,
          ref: FAMILY_META[id].ref,
          blurb: FAMILY_META[id].blurb,
          pct: avgPct(items),
          items,
        };
      });

      const allItems = families.reduce<IvdItem[]>((a, f) => a.concat(f.items), []);
      const overall = avgPct(allItems);
      const program = perDoc?.deviceName ?? classRows[0]?.deviceName ?? null;

      return res.json({
        success: true,
        data: {
          program,
          spine: 'EU IVDR 2017/746 · Annex II/III · Annex XIII',
          standard: 'IVDR',
          overall,
          summary: {
            total: allItems.length,
            evidenced: allItems.filter((i) => (i.pct || 0) >= 100).length,
            inProgress: allItems.filter((i) => (i.pct || 0) > 0 && (i.pct || 0) < 100).length,
            notStarted: allItems.filter((i) => (i.pct || 0) === 0).length,
            flags: 0,
          },
          families,
          gsprSourced: gsprPct != null,
          perDocumentPresent: Boolean(perDoc),
        },
      });
    } catch (error) {
      logger.error('ivd completeness error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to compute IVD completeness' });
    }
  });

  return router;
}
