/**
 * CSR-grounded evidence for the trial simulator.
 *
 * This reads prior Clinical Study Reports (the `csr_reports` / `csr_details` corpus)
 * for an indication and turns the ones that carry a *structured* primary effect into
 * {@link EvidenceObservation}s the simulator can build a prior from. It is deliberately
 * conservative: a CSR only contributes an effect observation when the effect and its
 * uncertainty are present in a machine-readable field. Free-text efficacy prose is not
 * parsed into a number here — the coverage note states how many CSRs were scanned and
 * how many carried a usable effect, so the prior is honest about its evidence base.
 *
 * The extraction (`extractEffectObservation`) is pure and unit-tested; `gatherCsrEffectEvidence`
 * is the tenant-scoped database query that feeds it.
 *
 * Recognized structured shapes (in `csr_details.results`, `csr_reports.content`, or their
 * `metadata`):
 *   • `{ primaryEffect: { value, standardError | ci:[lo,hi], scale?, n? } }`
 *   • `{ effectSize | standardizedEffect, standardError | ci }`
 *   • `{ hazardRatio | oddsRatio, ci:[lo,hi] }`  → converted to a benefit-oriented log effect
 *
 * @module server/services/study-design/csr-evidence-source
 */

import { and, desc, eq, ilike } from 'drizzle-orm';
import { db } from '../../db';
import { csrReports, csrDetails } from 'shared/schema';
import type { EvidenceObservation } from './evidence-prior';
import type { Endpoint } from './study-design-types';

const Z_975 = 1.959963985; // standard-normal 97.5th percentile

/** Options controlling extraction. */
export interface ExtractOptions {
  /** Benefit direction of the target endpoint; orients ratio effects to "positive = benefit". */
  direction?: Endpoint['direction'];
  /** Target indication, for relevance weighting against the CSR's indication. */
  targetIndication?: string;
  /** Target phase, for relevance weighting. */
  targetPhase?: string;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function asObject(v: unknown): Record<string, any> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : undefined;
}

/** SE from a 95% CI [lo, hi] on the same scale as the effect. */
function seFromCi(ci: unknown): number | undefined {
  if (Array.isArray(ci) && ci.length === 2) {
    const lo = num(ci[0]);
    const hi = num(ci[1]);
    if (lo !== undefined && hi !== undefined && hi > lo) return (hi - lo) / (2 * Z_975);
  }
  return undefined;
}

/** Relevance (0–1) from indication / phase agreement. */
function relevance(
  reportIndication: string | null | undefined,
  reportPhase: string | null | undefined,
  opts: ExtractOptions,
): number {
  let r = 1;
  if (opts.targetIndication && reportIndication) {
    const a = opts.targetIndication.toLowerCase();
    const b = reportIndication.toLowerCase();
    if (!(a.includes(b) || b.includes(a))) r *= 0.6;
  }
  if (opts.targetPhase && reportPhase && opts.targetPhase !== reportPhase) r *= 0.8;
  return r;
}

/**
 * Try to pull one structured benefit-oriented effect observation out of a CSR's
 * report row and (optional) detail row. Returns `null` when no machine-readable effect
 * is present — never a parsed-from-prose guess.
 */
export function extractEffectObservation(
  report: {
    reportId?: string | null;
    reportTitle?: string | null;
    sponsor?: string | null;
    indication?: string | null;
    phase?: string | null;
    nctId?: string | null;
    sampleSize?: number | null;
    content?: unknown;
    metadata?: unknown;
  },
  detail: { results?: unknown; metadata?: unknown; sampleSize?: number | null } | null | undefined,
  opts: ExtractOptions = {},
): EvidenceObservation | null {
  const benefitSign = opts.direction === 'decrease' ? -1 : 1;
  const sources = [
    asObject(detail?.results),
    asObject(report.content),
    asObject(detail?.metadata),
    asObject(report.metadata),
  ].filter(Boolean) as Record<string, any>[];

  for (const src of sources) {
    const pe = asObject(src.primaryEffect);

    // Shape 1: an explicit primaryEffect object.
    if (pe) {
      const value = num(pe.value);
      const se = num(pe.standardError) ?? seFromCi(pe.ci);
      if (value !== undefined && se !== undefined && se > 0) {
        return observation(report, detail, value, se, num(pe.n), opts);
      }
    }

    // Shape 2: a flat standardized / mean-difference effect with SE or CI.
    const flat = num(src.effectSize) ?? num(src.standardizedEffect) ?? num(src.meanDifference);
    const flatSe = num(src.standardError) ?? seFromCi(src.ci);
    if (flat !== undefined && flatSe !== undefined && flatSe > 0) {
      return observation(report, detail, flat, flatSe, undefined, opts);
    }

    // Shape 3: a ratio effect (HR/OR) with a CI → benefit-oriented log effect.
    const ratio = num(src.hazardRatio) ?? num(src.oddsRatio);
    if (ratio !== undefined && ratio > 0 && Array.isArray(src.ci) && src.ci.length === 2) {
      const lo = num(src.ci[0]);
      const hi = num(src.ci[1]);
      if (lo !== undefined && hi !== undefined && lo > 0 && hi > lo) {
        const logEffect = benefitSign * Math.log(ratio);
        const se = (Math.log(hi) - Math.log(lo)) / (2 * Z_975);
        if (se > 0) return observation(report, detail, logEffect, se, undefined, opts);
      }
    }
  }

  return null;
}

function observation(
  report: { reportId?: string | null; reportTitle?: string | null; sponsor?: string | null; indication?: string | null; phase?: string | null; nctId?: string | null; sampleSize?: number | null },
  detail: { sampleSize?: number | null } | null | undefined,
  effect: number,
  standardError: number,
  n: number | undefined,
  opts: ExtractOptions,
): EvidenceObservation {
  return {
    source: {
      kind: 'prior_data',
      source: report.reportTitle || report.sponsor || `CSR ${report.reportId ?? ''}`.trim(),
      ref: report.nctId || report.reportId || undefined,
    },
    effect,
    standardError,
    n: n ?? detail?.sampleSize ?? report.sampleSize ?? undefined,
    relevance: relevance(report.indication, report.phase, opts),
  };
}

/** The result of scanning the CSR corpus for an indication. */
export interface CsrEvidenceResult {
  observations: EvidenceObservation[];
  /** How many CSRs matched the indication and were scanned. */
  scanned: number;
  /** How many of those carried a machine-readable primary effect. */
  withStructuredEffect: number;
  /** Honest coverage note for the assumptions ledger. */
  note: string;
}

/**
 * Gather CSR-grounded effect observations for a tenant and indication. Tenant-scoped;
 * returns an empty set (with a note) when the corpus carries no structured effects, so
 * the caller falls back to an explicit assumption rather than a fabricated number.
 */
export async function gatherCsrEffectEvidence(args: {
  tenantId: number;
  indication: string;
  phase?: string;
  direction?: Endpoint['direction'];
  limit?: number;
}): Promise<CsrEvidenceResult> {
  const reports = await db
    .select()
    .from(csrReports)
    .where(and(eq(csrReports.organizationId, args.tenantId), ilike(csrReports.indication, `%${args.indication}%`)))
    .orderBy(desc(csrReports.uploadDate))
    .limit(Math.min(args.limit ?? 100, 300));

  const opts: ExtractOptions = {
    direction: args.direction,
    targetIndication: args.indication,
    targetPhase: args.phase,
  };

  const observations: EvidenceObservation[] = [];
  for (const report of reports) {
    const [detail] = await db
      .select()
      .from(csrDetails)
      .where(eq(csrDetails.reportId, report.id))
      .limit(1);
    const obs = extractEffectObservation(report as any, (detail as any) ?? null, opts);
    if (obs) observations.push(obs);
  }

  const scanned = reports.length;
  const withStructuredEffect = observations.length;
  const note =
    scanned === 0
      ? `No prior CSRs match indication "${args.indication}" for this tenant; the prior must be an explicit assumption.`
      : `Scanned ${scanned} prior CSR(s) for "${args.indication}"; ${withStructuredEffect} carried a machine-readable primary effect and informed the prior.`;

  return { observations, scanned, withStructuredEffect, note };
}
