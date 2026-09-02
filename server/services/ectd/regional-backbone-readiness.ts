/**
 * Regional Module 1 backbone readiness — honest-state for the widened regions.
 *
 * THE DEFECT THIS CLOSES. The packager writes `m1/<cc>/<cc>-regional.xml` for all
 * twelve regions, but only four (fda / ema / pmda / ca) have their own regional
 * backbone builder. The other eight — uk / ch / au / cn / br / in / kr / sg —
 * reuse `buildEmaBackbone` "as the closest standard", so a file named
 * `uk-regional.xml` actually contains an `<eu-regional>` root and references
 * `eu-regional.dtd`. That is a placeholder, not an MHRA-conformant Module 1. The
 * pre-transmit regional rules only checked that the file EXISTED at the expected
 * path, so the placeholder passed readiness as if it were conformant — a
 * fabricated claim of regional conformance for eight marketed regions.
 *
 * This module does not implement eight agency specifications (that is real,
 * per-agency work). It does the honest thing available now: classify each
 * region's backbone as region-conformant or an EMA-structure placeholder, surface
 * that on the bundle (the same shape/pattern as dtdStatus and submissionGrade),
 * and give the pre-transmit gate an opt-in fail-closed check — report-only by
 * default, blocking a PRODUCTION transmit when ECTD_REQUIRE_REGIONAL_BACKBONE=true,
 * mirroring the PDF/A / DTD / xref gates so the enforcement posture is uniform.
 *
 * @module server/services/ectd/regional-backbone-readiness
 */

import type { Region } from '../submission-gateways/types';

/** Regions that have their OWN regional Module 1 backbone builder + DTD. */
const CONFORMANT_REGIONS: ReadonlySet<Region> = new Set<Region>(['fda', 'ema', 'pmda', 'ca']);

/** For a placeholder region, the region whose backbone structure is reused. */
const PLACEHOLDER_OF: Partial<Record<Region, Region>> = {
  uk: 'ema', ch: 'ema', au: 'ema', cn: 'ema', br: 'ema', in: 'ema', kr: 'ema', sg: 'ema',
};

/** Status recorded on the bundle. Structural (no cross-layer import). */
export interface RegionalBackboneStatus {
  region: Region;
  /** The package-relative path of the regional backbone file that was written. */
  file: string;
  /** True only when the region has its own conformant M1 backbone builder. */
  regionConformant: boolean;
  /** When not conformant: which region's backbone structure was reused. */
  placeholderOf?: Region;
}

/** Classify a region's regional backbone. Pure. */
export function classifyRegionalBackbone(region: Region, file: string): RegionalBackboneStatus {
  if (CONFORMANT_REGIONS.has(region)) return { region, file, regionConformant: true };
  return { region, file, regionConformant: false, placeholderOf: PLACEHOLDER_OF[region] ?? 'ema' };
}

/** Read the opt-in enforcement flag (mirrors dtdRequiredFromEnv / pdfaRequiredFromEnv). */
export function regionalBackboneRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.ECTD_REQUIRE_REGIONAL_BACKBONE ?? '').toLowerCase() === 'true';
}

export interface RegionalBackboneGateInput {
  status: RegionalBackboneStatus | undefined;
  environment: 'staging' | 'production';
  /** Wire from regionalBackboneRequiredFromEnv(); false ⇒ report-only. */
  required: boolean;
}

export interface RegionalBackboneGateResult {
  /** A readiness check row for the pre-transmit report (absent when no status). */
  check?: { name: string; passed: boolean; detail: string };
  blockers: string[];
  warnings: string[];
}

/**
 * Evaluate the regional-backbone gate. A placeholder backbone is ALWAYS surfaced
 * (check row + warning) so no surface can read it as conformant; it BLOCKS only
 * for a production transmit when enforcement is opted in — the same posture as
 * the DTD gate. A required flag with no status on the bundle is itself a warning
 * (cannot prove conformance at transmit time).
 */
export function evaluateRegionalBackboneGate(input: RegionalBackboneGateInput): RegionalBackboneGateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const { status } = input;
  if (!status) {
    if (input.required) {
      warnings.push(
        'ECTD_REQUIRE_REGIONAL_BACKBONE is set but the bundle carries no regional-backbone status — cannot prove Module 1 conformance at transmit time.',
      );
    }
    return { blockers, warnings };
  }
  const check = {
    name: 'regional-backbone-conformant',
    passed: status.regionConformant,
    detail: status.regionConformant
      ? `${status.region} Module 1 backbone is region-conformant (${status.file})`
      : `${status.region} has no region-specific Module 1 backbone; ${status.file} is an ${status.placeholderOf}-structure placeholder`,
  };
  if (!status.regionConformant) {
    const msg =
      `${status.file} is NOT an ${status.region.toUpperCase()}-conformant Module 1 backbone — it reuses the ` +
      `${(status.placeholderOf ?? 'ema').toUpperCase()} regional structure as a placeholder. A regional validator will not accept it as ${status.region.toUpperCase()} Module 1.`;
    if (input.environment === 'production' && input.required) {
      blockers.push(`${msg} ECTD_REQUIRE_REGIONAL_BACKBONE blocks this production transmit.`);
    } else {
      warnings.push(msg);
    }
  }
  return { check, blockers, warnings };
}

export default {
  classifyRegionalBackbone,
  regionalBackboneRequiredFromEnv,
  evaluateRegionalBackboneGate,
};
