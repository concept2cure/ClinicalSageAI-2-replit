/**
 * Regional Module 1 backbone readiness — honest-state per region.
 *
 * THE DEFECT THIS CLOSES. The packager writes `m1/<cc>/<cc>-regional.xml` for all
 * twelve regions, but only ONE of them — FDA — is built to the agency's Module 1
 * structure: its leaves are grouped under the published FDA Module 1 heading
 * table (controlled-vocab/fda-regional-sections.ts) inside the us-regional DTD's
 * element tree. The other eleven fall into two classes, and both used to be
 * reported as if they were conformant:
 *
 *   - ema / pmda / ca have their OWN root element and DOCTYPE, but their
 *     builders file every Module 1 leaf FLAT directly under the Module 1
 *     container (`<m1-eu>`, `<m1-jp>`, …) instead of under the agency's Module 1
 *     headings, and their `<admin>` envelopes do not follow the agency DTD's
 *     envelope structure. A regional validator rejects that. The agency DTDs are
 *     licensed and not vendored (docs/runbooks/ectd-dtd-vendoring.md), so the
 *     real structure cannot be built and verified here — claiming conformance
 *     meanwhile would be a fabrication.
 *   - uk / ch / au / cn / br / in / kr / sg reuse `buildEmaBackbone` "as the
 *     closest standard", so a file named `uk-regional.xml` actually contains an
 *     `<eu-regional>` root: a placeholder, not an MHRA-conformant Module 1.
 *
 * This module classifies each region honestly, the packager stamps the status on
 * the bundle (same shape/pattern as dtdStatus and submissionGrade), and the
 * pre-transmit gate has an opt-in fail-closed check — report-only by default,
 * blocking a PRODUCTION transmit when ECTD_REQUIRE_REGIONAL_BACKBONE=true,
 * mirroring the PDF/A / DTD / xref gates so the enforcement posture is uniform.
 *
 * @module server/services/ectd/regional-backbone-readiness
 */

import type { Region } from '../submission-gateways/types';

/** Regions whose backbone is built to the agency's own Module 1 structure. */
const CONFORMANT_REGIONS: ReadonlySet<Region> = new Set<Region>(['fda']);

/** Regions with their own root element whose Module 1 is nevertheless FLAT
 *  (leaves directly under the container) and whose envelope is not the agency
 *  DTD's structure — the specific gap, stated so no surface can read the file
 *  name as conformance. */
const FLAT_MODULE1_GAP: Partial<Record<Region, string>> = {
  ema:
    'its Module 1 leaves are filed flat under <m1-eu> instead of under the EU Module 1 headings ' +
    '(1.0 cover letter … 1.10 paediatrics), and its envelope does not follow the eu-regional DTD structure',
  pmda:
    'its Module 1 leaves are filed flat under <m1-jp> instead of under the JP Module 1 headings, ' +
    'and its envelope does not follow the jp-regional DTD structure',
  ca:
    'its Module 1 leaves are filed flat under the Module 1 container instead of under the Health Canada ' +
    'Module 1 headings, and its envelope does not follow the ca-regional DTD structure',
};

/** For a placeholder region, the region whose backbone structure is reused. */
const PLACEHOLDER_OF: Partial<Record<Region, Region>> = {
  uk: 'ema', ch: 'ema', au: 'ema', cn: 'ema', br: 'ema', in: 'ema', kr: 'ema', sg: 'ema',
};

/** Status recorded on the bundle. Structural (no cross-layer import). */
export interface RegionalBackboneStatus {
  region: Region;
  /** The package-relative path of the regional backbone file that was written. */
  file: string;
  /** True only when the backbone is built to the agency's own Module 1 structure. */
  regionConformant: boolean;
  /** When not conformant because ANOTHER region's backbone structure is reused. */
  placeholderOf?: Region;
  /** When not conformant for the region's OWN builder: what is missing. */
  conformanceGap?: string;
}

/** Classify a region's regional backbone. Pure. */
export function classifyRegionalBackbone(region: Region, file: string): RegionalBackboneStatus {
  if (CONFORMANT_REGIONS.has(region)) return { region, file, regionConformant: true };
  const gap = FLAT_MODULE1_GAP[region];
  if (gap) return { region, file, regionConformant: false, conformanceGap: gap };
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

/** One sentence naming why a backbone is not conformant. */
function nonConformanceReason(status: RegionalBackboneStatus): string {
  if (status.placeholderOf) {
    return `it reuses the ${status.placeholderOf.toUpperCase()} regional structure as a placeholder`;
  }
  return status.conformanceGap ?? 'its structure has not been verified against the agency DTD';
}

/**
 * Evaluate the regional-backbone gate. A non-conformant backbone is ALWAYS
 * surfaced (check row + warning) so no surface can read it as conformant; it
 * BLOCKS only for a production transmit when enforcement is opted in — the same
 * posture as the DTD gate. A required flag with no status on the bundle is
 * itself a warning (cannot prove conformance at transmit time).
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
  const R = status.region.toUpperCase();
  const check = {
    name: 'regional-backbone-conformant',
    passed: status.regionConformant,
    detail: status.regionConformant
      ? `${status.region} Module 1 backbone is region-conformant (${status.file})`
      : `${status.region} Module 1 backbone is not region-conformant: ${nonConformanceReason(status)} (${status.file})`,
  };
  if (!status.regionConformant) {
    const msg =
      `${status.file} is NOT an ${R}-conformant Module 1 backbone — ${nonConformanceReason(status)}. ` +
      `A regional validator will not accept it as ${R} Module 1.`;
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
