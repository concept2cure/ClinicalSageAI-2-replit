/**
 * Device & IVD program cockpit — one cross-pathway readiness rollup.
 *
 * The unified "Device & Diagnostics Workbench" backend the medical-device beta
 * audit called for: given a program's canonical content, score readiness across
 * EVERY relevant pathway (FDA 510(k), De Novo, PMA; EU MDR, IVDR) in one pass,
 * overlay target-market readiness, and recommend the most-ready pathway — so a
 * device/IVD team sees one honest picture instead of five separate checks.
 *
 * Composes (never modifies): estar-mapper, pma-mapper, mdr-ivdr tech-doc
 * assembler, and the global-market readiness scorer. Pure + deterministic +
 * honest-by-construction: no DB, no network, no LLM; never claims submittable/
 * transmittable capability that the underlying pathway does not report.
 *
 * @module server/services/device-ivd-cockpit/cockpit
 */

import { mapToEstar, type EstarType, type DeviceFlags } from '../pathway-engines/estar/estar-mapper';
import { mapToPma } from '../pathway-engines/pma/pma-mapper';
import { assembleTechDoc } from '../pathway-engines/mdr-ivdr/tech-doc-assembler';
import { tryAssessMarketReadiness } from '../global-markets/market-readiness';
import type { MarketId, MarketReadinessResult } from '../global-markets/types';

export type DevicePathwayId = '510k' | 'de_novo' | 'pma' | 'mdr' | 'ivdr';

export interface CockpitInputLeaf {
  sectionCode: string;
  title: string;
  documentType?: string;
  /**
   * True only when this leaf carries real, finalized authored content — never a
   * draft/placeholder stub. Required so a title match alone never marks a
   * required section present (mirrors EstarInputLeaf/PmaInputLeaf).
   */
  substantive?: boolean; // optional: undefined ⇒ NOT substantive (fail-closed)
}

export interface PathwayReadiness {
  pathway: DevicePathwayId;
  label: string;
  ready: boolean;
  /** Percentage of required sections present (0..100). */
  completeness: number;
  missingRequired: string[];
}

export interface DeviceProgramAssessment {
  variant: 'device' | 'ivd';
  pathways: PathwayReadiness[];
  /** Highest-completeness (ties: first listed) ready-or-closest pathway, if any. */
  recommendedPathway?: DevicePathwayId;
  market?: MarketReadinessResult;
  /** De-duplicated cross-pathway + market blockers. */
  blockers: string[];
  provenance: { generatedAt: string; modules: string[] };
}

const PATHWAY_LABEL: Record<DevicePathwayId, string> = {
  '510k': 'FDA 510(k) (eSTAR)',
  de_novo: 'FDA De Novo (eSTAR)',
  pma: 'FDA PMA',
  mdr: 'EU MDR technical documentation',
  ivdr: 'EU IVDR technical documentation',
};

/** Default pathway set by variant: IVDs don't have a 510(k)-device/PMA-as-primary IVD nuance, but
 *  FDA IVDs are still cleared via 510(k)/De Novo/PMA, so the FDA set applies to both; EU splits MDR vs IVDR. */
function defaultPathways(variant: 'device' | 'ivd'): DevicePathwayId[] {
  return variant === 'ivd'
    ? ['510k', 'de_novo', 'pma', 'ivdr']
    : ['510k', 'de_novo', 'pma', 'mdr'];
}

function completenessFrom(sections: Array<{ required: boolean; present: boolean }>): number {
  const required = sections.filter((s) => s.required);
  if (required.length === 0) return 0;
  const present = required.filter((s) => s.present).length;
  return Math.round((present / required.length) * 100);
}

function assessPathway(pathway: DevicePathwayId, leaves: CockpitInputLeaf[], deviceFlags?: DeviceFlags): PathwayReadiness {
  const label = PATHWAY_LABEL[pathway];
  if (pathway === '510k' || pathway === 'de_novo') {
    const r = mapToEstar({ leaves, type: pathway as EstarType, flags: deviceFlags });
    // An unanswered device question reads as a gap, not as a satisfied section.
    return { pathway, label, ready: r.summary.ready, completeness: completenessFrom(r.sections), missingRequired: [...r.summary.missingRequired, ...r.summary.undetermined] };
  }
  if (pathway === 'pma') {
    const r = mapToPma({ leaves });
    return { pathway, label, ready: r.summary.ready, completeness: r.summary.completeness, missingRequired: r.summary.missingRequired };
  }
  // mdr | ivdr
  const r = assembleTechDoc({ leaves, regulation: pathway });
  return { pathway, label, ready: r.summary.ready, completeness: completenessFrom(r.sections), missingRequired: r.summary.missingRequired };
}

export interface AssessDeviceProgramInput {
  leaves: CockpitInputLeaf[];
  variant: 'device' | 'ivd';
  /**
   * The device's answers to the seven intake flags. Sections required only for
   * some devices cannot be judged without them, and an unjudged section counts
   * as a gap rather than as satisfied (W1-5).
   */
  deviceFlags?: DeviceFlags;
  /** Restrict to specific pathways; defaults to the variant's standard set. */
  pathways?: DevicePathwayId[];
  /** Optional target market for a readiness overlay. */
  market?: MarketId;
  availableArtifacts?: string[];
}

/**
 * Assess a device/IVD program across all relevant pathways + the target market,
 * and recommend the most-ready pathway. Honest: a recommendation is only the
 * closest-to-ready option, never a claim that any submission is complete.
 */
export function assessDeviceProgram(input: AssessDeviceProgramInput): DeviceProgramAssessment {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  const wanted = input.pathways && input.pathways.length > 0 ? input.pathways : defaultPathways(input.variant);

  const pathways = wanted.map((p) => assessPathway(p, leaves, input.deviceFlags));

  // Recommend the most-complete pathway (prefer a ready one; ties → first listed).
  let recommendedPathway: DevicePathwayId | undefined;
  let best = -1;
  for (const p of pathways) {
    const score = (p.ready ? 1000 : 0) + p.completeness;
    if (score > best) {
      best = score;
      recommendedPathway = p.pathway;
    }
  }
  if (pathways.length === 0 || best <= 0) recommendedPathway = undefined;

  const market = input.market
    ? (tryAssessMarketReadiness(input.market, input.availableArtifacts ?? []) ?? undefined)
    : undefined;

  const blockers: string[] = [];
  for (const p of pathways) {
    if (!p.ready && p.missingRequired.length > 0) {
      blockers.push(`${p.label}: ${p.missingRequired.length} required section(s) missing.`);
    }
  }
  if (market) for (const b of market.blockers) blockers.push(b);

  return {
    variant: input.variant,
    pathways,
    recommendedPathway,
    market,
    blockers: Array.from(new Set(blockers)),
    provenance: {
      generatedAt: new Date().toISOString(),
      modules: [
        'pathway-engines/estar/estar-mapper',
        'pathway-engines/pma/pma-mapper',
        'pathway-engines/mdr-ivdr/tech-doc-assembler',
        ...(market ? ['global-markets/market-readiness'] : []),
      ],
    },
  };
}

export default { assessDeviceProgram };
