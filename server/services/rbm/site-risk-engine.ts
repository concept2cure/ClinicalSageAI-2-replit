/**
 * RBM site-risk engine — derives a per-site risk snapshot from Site
 * Intelligence and persists it to rbm_site_risk_scores.
 *
 * Site Intelligence stores 0–100 *quality* scores (higher = better). RBM needs
 * *risk* (higher = worse), so each present score is inverted to 100 − score.
 * The monitoring tier is risk-proportionate per ICH E6(R3): higher risk →
 * more oversight (reduced / standard / enhanced).
 *
 * Defensive by design: two divergent site_intel.sites shapes exist in the
 * codebase (composite_score/operational_score vs overall_score/compliance_score),
 * and the schema may be absent in some tenants. We SELECT * and read whichever
 * score columns are present, and treat a missing table as "no sites".
 *
 * @module server/services/rbm/site-risk-engine
 */

import { pool } from '../../db';
import { monitoringTierFromRisk, type MonitoringTier } from './rbm-engine';

export interface SiteRiskSnapshot {
  siteId: string | null;
  siteNumber: string | null;
  siteName: string | null;
  compositeRisk: number | null;
  enrollmentRisk: number | null;
  qualityRisk: number | null;
  operationalRisk: number | null;
  monitoringTier: MonitoringTier;
  drivers: string[];
}

function toRisk(score: unknown): number | null {
  const n = typeof score === 'string' ? parseFloat(score) : (score as number);
  if (!Number.isFinite(n)) return null;
  return Math.round((100 - n) * 100) / 100;
}

function firstNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Compute a risk snapshot for one raw site_intel.sites row. */
export function snapshotFromSiteRow(row: Record<string, unknown>): SiteRiskSnapshot {
  const enrollmentRisk = toRisk(row.enrollment_score);
  const qualityRisk = toRisk(row.quality_score);
  const operationalRisk = toRisk(firstNumber(row.operational_score, row.compliance_score));

  const components = [enrollmentRisk, qualityRisk, operationalRisk].filter(
    (r): r is number => r != null,
  );
  let compositeRisk = toRisk(firstNumber(row.composite_score, row.overall_score));
  if (compositeRisk == null && components.length > 0) {
    compositeRisk = Math.round((components.reduce((a, b) => a + b, 0) / components.length) * 100) / 100;
  }

  const drivers: string[] = [];
  if (enrollmentRisk != null && enrollmentRisk >= 60) drivers.push('enrollment');
  if (qualityRisk != null && qualityRisk >= 60) drivers.push('quality');
  if (operationalRisk != null && operationalRisk >= 60) drivers.push('operational');

  return {
    siteId: row.id != null ? String(row.id) : null,
    siteNumber: row.site_number != null ? String(row.site_number) : null,
    siteName: (row.site_name ?? row.name ?? null) as string | null,
    compositeRisk,
    enrollmentRisk,
    qualityRisk,
    operationalRisk,
    monitoringTier: monitoringTierFromRisk(compositeRisk ?? 0),
    drivers,
  };
}

/** Read site_intel.sites for a program; returns [] if the schema is absent. */
export async function readProgramSites(programId: string): Promise<Record<string, unknown>[]> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM site_intel.sites WHERE program_id = $1`,
      [programId],
    );
    return rows;
  } catch {
    return [];
  }
}

/**
 * Recompute and persist the site-risk snapshot for a program. Replaces the
 * prior snapshot (delete-then-insert) so the table holds the current view.
 * Tenant-scoped on write via organizationId. Returns the computed snapshots.
 */
export async function recomputeSiteRisk(
  organizationId: number,
  programId: string,
): Promise<SiteRiskSnapshot[]> {
  const sites = await readProgramSites(programId);
  const snapshots = sites.map(snapshotFromSiteRow);

  await pool.query(
    `DELETE FROM rbm_site_risk_scores WHERE organization_id = $1 AND program_id = $2`,
    [organizationId, programId],
  );

  for (const s of snapshots) {
    await pool.query(
      `INSERT INTO rbm_site_risk_scores (
         organization_id, program_id, site_id, site_number, site_name,
         composite_risk, enrollment_risk, quality_risk, operational_risk,
         monitoring_tier, drivers
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        organizationId, programId, s.siteId, s.siteNumber, s.siteName,
        s.compositeRisk, s.enrollmentRisk, s.qualityRisk, s.operationalRisk,
        s.monitoringTier, JSON.stringify(s.drivers),
      ],
    );
  }

  return snapshots;
}
