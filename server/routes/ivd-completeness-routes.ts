/**
 * IVD Completeness read-model — IVDR technical-file / Performance-Evaluation
 * completeness, drawn by the IVDR readiness board
 * (client/src/concept2cure/v2/surfaces/IvdReadinessBoard.tsx): the readiness
 * panel of device-diagnostics (mdx/surfaces/IvdSurface.tsx), and the older
 * ui-v2 `ivd-completeness` screen until it folds into device-diagnostics.
 *
 * The board renders the regulator's fixed IVDR requirement families
 * (GSPR Annex I, analytical + clinical performance, scientific validity, the
 * Performance Evaluation Report, device description/classification, and
 * post-market PMPF/PMS) with a completeness percentage and a per-requirement
 * item list. This endpoint returns that exact display shape, populated from
 * real IVDR records:
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
 * omitted and `summary.flags` counts only items that carry one.
 *
 * D2, 2026-10-29 (docs/evidence/D2-ONE-ANA/2026-10-29/fold-f2-ivd-completeness/):
 * the board reads the open project. It read the four tables by organization
 * only, although each has program_id, and GSPR as the organization's newest
 * checklist (LIMIT 1) whichever project it was for, so a project showed
 * another assay's classification, studies, PER and GSPR score as its own.
 *   - With `?program_id=` the route asks admitProject first
 *     (server/lib/admit-project.ts, over programInOrganization): 404 for a
 *     foreign, missing, deleted or malformed project, 503 when the check cannot
 *     run, and no IVD table is read either way. All five reads then filter by
 *     the project, and the response says `scope: 'program'` with the
 *     `programId`. A record with no project is the organization's unscoped
 *     record; no project read returns it.
 *   - Without a project the route reads the organization as before and says
 *     `scope: 'organization'`.
 *   - A store that cannot be read is named in `unread`: its families carry
 *     `pct: null` and no items, `overall` is null, and the summary counts them
 *     apart. An unread store is never a family "not started".
 *
 * Envelope: { success: true, data: <displayShape> }. Fail-closed (503) when
 * none of the IVD read-model tables is provisioned.
 *
 * @module routes/ivd-completeness-routes
 */

import { Router, Request, Response } from 'express';
import { and, eq, isNull, sql, desc as descOrder, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { requestDb, type RequestDb } from '../db/requestDb';
import { admitProject } from '../lib/admit-project';
import { createScopedLogger } from '../utils/logger.js';
import {
  ivdrClassifications,
  ivdrPerDocuments,
  ivdAnalyticalPerformance,
  ivdClinicalPerformance,
} from '../../shared/schema';

const logger = createScopedLogger('ivd-completeness-routes');

// ─── Display-shape types (mirror IvdReadinessBoard.tsx IvdFamily / IvdItem) ────

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
  /** Null when the family's records could not be read. */
  pct: number | null;
  items: IvdItem[];
}

// ─── IVDR requirement taxonomy (regulatory reference structure, not org data) ──

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

/** Status of a computed percentage, on the board's bands. */
function pctStatus(pct: number): ItemStatus {
  return pct >= 100 ? 'complete' : pct >= 60 ? 'review' : pct > 0 ? 'draft' : 'not_started';
}

/** The SQLSTATE of a failed query. Drizzle (0.45) wraps the driver's error in
 *  DrizzleQueryError and puts the code on `.cause`; this read only `.code`, so
 *  a missing table was never recognised and answered 500 (2026-10-29). */
function sqlState(e: unknown): string | undefined {
  const err = e as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = err?.code ?? err?.cause?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Await a Drizzle select. An unprovisioned table (42P01) is unread; any other failure is thrown. */
async function runSelect<R>(qb: PromiseLike<R[]>): Promise<{ rows: R[]; missing: boolean }> {
  try {
    const rows = await qb;
    return { rows, missing: false };
  } catch (e) {
    if (sqlState(e) === '42P01') return { rows: [], missing: true };
    throw e;
  }
}

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

/** `?program_id=` as sent, or null when none is named. A repeated parameter is
 *  passed on as text, so admitProject refuses it rather than this picking one. */
function namedProgram(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

/** The live rows of one store: the organization's, and only the project's when one is named. */
function live(org: AnyPgColumn, program: AnyPgColumn, deleted: AnyPgColumn, orgId: number, programId: string | null): SQL | undefined {
  return and(eq(org, orgId), isNull(deleted), programId ? eq(program, programId) : undefined);
}

function gsprPercent(requirements: unknown): number | null {
  const reqs = Array.isArray(requirements) ? (requirements as Array<{ status?: string }>) : [];
  if (!reqs.length) return null;
  const applicable = reqs.filter((r) => r?.status !== 'not_applicable');
  const compliant = applicable.filter((r) => r?.status === 'compliant');
  return applicable.length ? Math.round((compliant.length / applicable.length) * 100) : 0;
}

/**
 * GSPR compliance % from the legacy GSPR-checklist store, through the
 * request-scoped client (RLS gate) with an explicit org filter.
 *
 * ivdr_gspr_assessments keys on project_id TEXT (migrations/20260813c), not a
 * uuid: its writer (ivdr-routes.ts POST /gspr-checklist) stores the project id
 * as the client sent it. So it is compared as text, lower-cased, against the
 * admitted uuid's canonical text (`::uuid::text` is lower-case and hyphenated).
 * The column is never cast: a legacy value that is no uuid would raise 22P02
 * and fail the read for every project. The writer refuses a second checklist
 * for a project (409), so LIMIT 1 under a project is that project's one; with
 * no project it is the organization's newest, as before.
 */
async function readGspr(d: RequestDb, orgId: number, programId: string | null): Promise<{ pct: number | null; unread: boolean }> {
  try {
    const result = (await d.execute(sql`
      SELECT requirements
      FROM ivdr_gspr_assessments
      WHERE organization_id = ${orgId}
        AND (${programId}::text IS NULL OR lower(project_id) = ${programId}::uuid::text)
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `)) as unknown as { rows?: Array<{ requirements?: unknown }> };
    return { pct: gsprPercent(result.rows?.[0]?.requirements), unread: false };
  } catch (gErr) {
    // The driver's own error, not drizzle's wrapper, whose message carries the SQL and its params.
    const cause = (gErr as { cause?: unknown } | null)?.cause ?? gErr;
    logger.warn('GSPR read failed; GSPR is reported unread', {
      code: sqlState(gErr),
      err: cause instanceof Error ? cause.message : String(cause),
    });
    return { pct: null, unread: true };
  }
}

/** Sequential, to keep a single request-scoped connection well-behaved. */
async function readSources(d: RequestDb, orgId: number, programId: string | null) {
  const classRes = await runSelect(
    d.select({ deviceName: ivdrClassifications.deviceName, ivdrClass: ivdrClassifications.ivdrClass })
      .from(ivdrClassifications)
      .where(live(ivdrClassifications.organizationId, ivdrClassifications.programId, ivdrClassifications.deletedAt, orgId, programId))
      .orderBy(descOrder(ivdrClassifications.createdAt))
      .limit(200),
  );
  const perRes = await runSelect(
    d.select({
      deviceName: ivdrPerDocuments.deviceName,
      perVersion: ivdrPerDocuments.perVersion,
      scientificValidityDone: ivdrPerDocuments.scientificValidityDone,
      analyticalPerformanceDone: ivdrPerDocuments.analyticalPerformanceDone,
      clinicalPerformanceDone: ivdrPerDocuments.clinicalPerformanceDone,
      pmpfPlanAttached: ivdrPerDocuments.pmpfPlanAttached,
    })
      .from(ivdrPerDocuments)
      .where(live(ivdrPerDocuments.organizationId, ivdrPerDocuments.programId, ivdrPerDocuments.deletedAt, orgId, programId))
      .orderBy(descOrder(ivdrPerDocuments.updatedAt))
      .limit(1),
  );
  const analRes = await runSelect(
    d.select({ title: ivdAnalyticalPerformance.title, studyType: ivdAnalyticalPerformance.studyType, passFail: ivdAnalyticalPerformance.passFail })
      .from(ivdAnalyticalPerformance)
      .where(live(ivdAnalyticalPerformance.organizationId, ivdAnalyticalPerformance.programId, ivdAnalyticalPerformance.deletedAt, orgId, programId))
      .orderBy(descOrder(ivdAnalyticalPerformance.createdAt))
      .limit(200),
  );
  const clinRes = await runSelect(
    d.select({ title: ivdClinicalPerformance.title, endpointMet: ivdClinicalPerformance.preSpecifiedEndpointMet })
      .from(ivdClinicalPerformance)
      .where(live(ivdClinicalPerformance.organizationId, ivdClinicalPerformance.programId, ivdClinicalPerformance.deletedAt, orgId, programId))
      .orderBy(descOrder(ivdClinicalPerformance.updatedAt))
      .limit(200),
  );
  const gspr = await readGspr(d, orgId, programId);
  const unread = new Set<FamilyId>([
    ...(classRes.missing ? (['desc'] as const) : []),
    ...(analRes.missing ? (['anal'] as const) : []),
    ...(clinRes.missing ? (['clin'] as const) : []),
    ...(perRes.missing ? (['valid', 'per', 'pmpf'] as const) : []),
    ...(gspr.unread ? (['gspr'] as const) : []),
  ]);
  return {
    classRows: classRes.rows,
    analRows: analRes.rows,
    clinRows: clinRes.rows,
    perDoc: perRes.rows[0],
    gsprPct: gspr.pct,
    unread,
    noneProvisioned: classRes.missing && perRes.missing && analRes.missing && clinRes.missing,
  };
}

type Sources = Awaited<ReturnType<typeof readSources>>;

/** The Performance Evaluation Report families: scientific validity, the PER itself and PMPF. */
function perFamilies(perDoc: Sources['perDoc']): Pick<Record<FamilyId, IvdItem[]>, 'valid' | 'per' | 'pmpf'> {
  if (!perDoc) return { valid: [], per: [], pmpf: [] };
  const pillars = [perDoc.scientificValidityDone, perDoc.analyticalPerformanceDone, perDoc.clinicalPerformanceDone];
  const covered = pillars.filter((p) => p === true).length;
  const perPct = Math.round((covered / 3) * 100);
  return {
    valid: [{ code: FAMILY_META.valid.code, title: 'Scientific validity report', ref: FAMILY_META.valid.ref, ...boolItem(perDoc.scientificValidityDone) }],
    per: [{
      code: FAMILY_META.per.code,
      title: perDoc.perVersion ? `Performance Evaluation Report ${perDoc.perVersion}` : 'Performance Evaluation Report (PER)',
      ref: FAMILY_META.per.ref,
      status: pctStatus(perPct),
      pct: perPct,
    }],
    pmpf: [{ code: FAMILY_META.pmpf.code, title: 'Post-Market Performance Follow-up (PMPF) plan', ref: FAMILY_META.pmpf.ref, ...boolItem(perDoc.pmpfPlanAttached) }],
  };
}

/** Build family items from real records. */
function familyItems(src: Sources): Record<FamilyId, IvdItem[]> {
  return {
    // GSPR: single computed item; none when there is no checklist.
    gspr: src.gsprPct == null ? [] : [{
      code: FAMILY_META.gspr.code, title: 'GSPR conformity (Annex I)', ref: FAMILY_META.gspr.ref,
      status: pctStatus(src.gsprPct), pct: src.gsprPct,
    }],
    // Analytical: pass → complete(100); fail → review(70, evidence present but
    // not passing); pending/absent → draft(40, in progress).
    anal: src.analRows.map((r) => {
      const pf = (r.passFail || '').toLowerCase();
      const status: ItemStatus = pf === 'pass' ? 'complete' : pf === 'fail' ? 'review' : 'draft';
      return { code: r.studyType || 'analytical', title: r.title, ref: FAMILY_META.anal.ref, status, pct: status === 'complete' ? 100 : status === 'review' ? 70 : 40 };
    }),
    // Clinical: endpoint met → complete(100); not met → review(70); pending → draft(40).
    clin: src.clinRows.map((r) => {
      const status: ItemStatus = r.endpointMet === true ? 'complete' : r.endpointMet === false ? 'review' : 'draft';
      return { code: 'clinical', title: r.title, ref: FAMILY_META.clin.ref, status, pct: status === 'complete' ? 100 : status === 'review' ? 70 : 40 };
    }),
    // Device description & classification: a recorded Annex VIII determination.
    desc: src.classRows.map((r) => ({
      code: FAMILY_META.desc.code,
      title: r.ivdrClass ? `${r.deviceName} · Class ${r.ivdrClass}` : r.deviceName,
      ref: FAMILY_META.desc.ref,
      status: 'complete' as ItemStatus,
      pct: 100,
    })),
    ...perFamilies(src.perDoc),
  };
}

/** What a response covers: one project, or, with no project named, the organization. */
function scopeOf(programId: string | null): { scope: 'program'; programId: string } | { scope: 'organization' } {
  return programId ? { scope: 'program', programId } : { scope: 'organization' };
}

function completenessBoard(src: Sources, programId: string | null) {
  const itemsByFamily = familyItems(src);
  const families: IvdFamily[] = FAMILY_ORDER.map((id) => {
    const unread = src.unread.has(id);
    const items = unread ? [] : itemsByFamily[id];
    return { id, label: FAMILY_META[id].label, ref: FAMILY_META[id].ref, blurb: FAMILY_META[id].blurb, pct: unread ? null : avgPct(items), items };
  });
  const read = families.map((f) => f.pct).filter((p): p is number => p !== null);
  const allItems = families.flatMap((f) => f.items);
  /* THE DENOMINATOR IS THE SEVEN FAMILIES, NOT THE EVIDENCE THAT EXISTS.
     This was `avgPct(allItems)`, and `allItems` is the concatenation of the
     families' item arrays — so a family with NO records contributed nothing
     to the mean instead of contributing a zero, and the average could only
     ever be taken over things that are present. `descItems` hardcodes
     pct: 100 for every row in ivdr_classifications, so recording one Annex
     VIII classification — the first thing a user does — made allItems a
     single 100% item and this 100: "Your IVDR technical file is 100%
     complete", over a file with no GSPR assessment, no analytical or
     clinical performance, no scientific validity, no PER and no PMPF plan.

     The family is the unit the surface itself names, and a family holding
     nothing is 0% — which is a fact about the technical file, not an
     absence of data to average. A family that could not be read is not
     that fact, so with one unread there is no overall figure (2026-10-29). */
  const overall = read.length === families.length
    ? Math.round(read.reduce((a, p) => a + p, 0) / families.length)
    : null;
  return {
    ...scopeOf(programId),
    program: src.perDoc?.deviceName ?? src.classRows[0]?.deviceName ?? null,
    spine: 'EU IVDR 2017/746 · Annex II/III · Annex XIII',
    standard: 'IVDR',
    overall,
    /* Counted over the SAME unit as `overall` above. These were counted
       over allItems, so beside a headline of 100% they read "1/1
       Requirements evidenced — 0 Not yet started": three statements of
       one falsehood rather than one. `flags` was the literal 0 — a number
       on an "Open evidence flags" tile that was the result of no check at
       all — and is now the count of items actually carrying a flag. An
       unread family is counted as unread, never as not started. */
    summary: {
      total: families.length,
      evidenced: read.filter((p) => p >= 100).length,
      inProgress: read.filter((p) => p > 0 && p < 100).length,
      notStarted: read.filter((p) => p === 0).length,
      unread: families.length - read.length,
      flags: allItems.filter((i) => Boolean(i.flag)).length,
    },
    families,
    unread: FAMILY_ORDER.filter((id) => src.unread.has(id)),
    gsprSourced: src.gsprPct != null,
    perDocumentPresent: Boolean(src.perDoc),
  };
}

export default function createIvdCompletenessRoutes(): Router {
  const router = Router();

  /**
   * GET /completeness[?program_id=<uuid>]
   * Returns the IVDR technical-file completeness board for the project, or for
   * the organization when no project is named.
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
    const programId = namedProgram(req.query.program_id);

    try {
      if (!(await admitProject(res, logger, programId, orgId))) return;
      const src = await readSources(requestDb(req), orgId, programId);
      // Fail-closed: if EVERY IVD read-model table is unprovisioned, deny.
      if (src.noneProvisioned) {
        logger.warn('IVD read-model tables not provisioned', { orgId });
        return res
          .status(503)
          .json({ success: false, error: 'IVD tables not yet provisioned', code: 'IVD_NOT_PROVISIONED' });
      }
      return res.json({ success: true, data: completenessBoard(src, programId) });
    } catch (error) {
      logger.error('ivd completeness error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to compute IVD completeness' });
    }
  });

  return router;
}
