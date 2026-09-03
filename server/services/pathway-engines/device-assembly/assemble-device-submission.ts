/**
 * Device & IVD submission assembly contract (Device Slice 1, B5).
 *
 * The single, honest orchestration spine for assembling a device/IVD submission.
 * It ties together the pieces that already exist as isolated modules:
 *   - eSTAR section readiness   (estar-mapper.mapToEstar — 510(k) / De Novo)
 *   - PMA module readiness      (pma-mapper.mapToPma — 21 CFR 814, pathway 'pma')
 *   - official template gate    (estar-template-registry.assessEstarTemplateReadiness)
 *   - target-market readiness   (global-markets.assessMarketReadiness)
 *
 * It does NOT render or transmit anything here — it computes WHAT can honestly be
 * produced and WHAT blocks a submittable artifact, mirroring the eCTD dispatch-gate
 * discipline. The decisive, honesty-preserving output is `artifactKind`:
 *   - 'official-estar'        → eSTAR sections complete AND the official FDA template
 *                               is available to fill (via forms/fill-official-pdf, B3/B4)
 *   - 'content-package-draft' → content exists but no official template ⇒ only the
 *                               loose section-PDF ZIP is producible (NOT submittable)
 *   - 'none'                  → required content missing; nothing to assemble
 *
 * Pure + deterministic + honest-by-construction: no DB, no network, no LLM, no
 * rendering. Never claims a submittable eSTAR it cannot actually produce.
 *
 * @module server/services/pathway-engines/device-assembly/assemble-device-submission
 */

import { mapToEstar, type EstarType, type EstarInputLeaf, type EstarResult, type DeviceFlags } from '../estar/estar-mapper';
import { mapToPma, type PmaResult, type PmaSubmissionType } from '../pma/pma-mapper';
import {
  assessEstarTemplateReadiness,
  estarTemplateRequiredFromEnv,
  type EstarTemplateVariant,
  type EstarTemplateReadinessResult,
} from '../estar/estar-template-registry';
import { tryAssessMarketReadiness } from '../../global-markets/market-readiness';
import type { MarketId, MarketReadinessResult } from '../../global-markets/types';

export type DeviceArtifactKind = 'official-estar' | 'content-package-draft' | 'none';

/**
 * The FDA device pathways this contract assembles. All three are filed on the
 * nIVD/IVD eSTAR (the template registry carries pma-device / pma-ivd); what
 * differs is the section registry the content is scored against — the eSTAR
 * slots for 510(k)/De Novo, the 21 CFR 814 modules for a PMA. (EU MDR/IVDR
 * technical documentation is a separate contract.)
 */
export type DeviceAssemblyPathway = EstarType | 'pma';

/** Section readiness for the pathway: eSTAR slots, or the PMA modules. */
export type DeviceSectionReadiness = EstarResult | PmaResult;

export interface AssembleDeviceSubmissionInput {
  /** FDA device pathway — selects the readiness registry and the template descriptor. */
  pathway: DeviceAssemblyPathway;
  /**
   * For pathway 'pma': original application vs a supplement/notice (21 CFR
   * 814.39), which scopes the modules a filing owes. Defaults to 'original'.
   * Ignored for 510(k) / De Novo.
   */
  pmaSubmissionType?: PmaSubmissionType;
  /** Device vs IVD selects the official template variant. */
  variant: EstarTemplateVariant;
  /** Canonical content leaves to project onto the eSTAR section tree. */
  leaves: EstarInputLeaf[];
  /** Official eSTAR template filenames present in the drop-point (from listVendoredTemplates). */
  presentTemplates?: string[];
  /** Target market for a market-readiness overlay (optional). */
  market?: MarketId;
  /** Artifact ids available, for the market-readiness overlay. */
  availableArtifacts?: string[];
  /** Build environment — production gates the template requirement. */
  environment?: 'staging' | 'production';
  /** Override the ESTAR_REQUIRE_TEMPLATE flag (defaults to the env reader). */
  requireTemplate?: boolean;
  /**
   * The device's answers to the seven intake flags. Sections that are required
   * only for some devices (sterilization, software, cybersecurity) cannot be
   * judged without them, and an unjudged section blocks readiness rather than
   * being scored as satisfied (W1-5).
   */
  deviceFlags?: DeviceFlags;
}

export interface AssembleDeviceSubmissionResult {
  pathway: DeviceAssemblyPathway;
  variant: EstarTemplateVariant;
  /** What can honestly be produced for this input. */
  artifactKind: DeviceArtifactKind;
  /** True only when sections are complete AND the official template is available. */
  canProduceOfficialEstar: boolean;
  /**
   * Section readiness on the pathway's own registry. Named `estar` because
   * every pathway here is filed on the eSTAR; for 'pma' the sections are the
   * 21 CFR 814 modules (PmaResult), never the 510(k) slots.
   */
  estar: DeviceSectionReadiness;
  template: EstarTemplateReadinessResult;
  market?: MarketReadinessResult;
  /** Aggregated, de-duplicated blockers preventing a submittable official eSTAR. */
  blockers: string[];
  provenance: {
    generatedAt: string;
    modules: string[];
  };
}

/**
 * Compute the honest assembly state for a device/IVD eSTAR submission. Decides
 * the producible artifact kind and surfaces every blocker; it never fabricates a
 * submittable eSTAR when the official template is missing or sections are incomplete.
 */
export function assembleDeviceSubmission(
  input: AssembleDeviceSubmissionInput,
): AssembleDeviceSubmissionResult {
  const environment = input.environment ?? 'staging';
  const requireTemplate = input.requireTemplate ?? estarTemplateRequiredFromEnv();

  const estar: DeviceSectionReadiness =
    input.pathway === 'pma'
      ? mapToPma({ leaves: input.leaves, submissionType: input.pmaSubmissionType })
      : mapToEstar({ leaves: input.leaves, type: input.pathway, flags: input.deviceFlags });

  const template = assessEstarTemplateReadiness({
    type: input.pathway,
    variant: input.variant,
    present: input.presentTemplates ?? [],
    environment,
    requireTemplate,
  });

  // tryAssessMarketReadiness returns null for an unknown market; normalize to
  // undefined so the result field stays `MarketReadinessResult | undefined`.
  const market = input.market
    ? (tryAssessMarketReadiness(input.market, input.availableArtifacts ?? []) ?? undefined)
    : undefined;

  const blockers: string[] = [];

  // Section completeness blockers (RTA-style administrative gate).
  if (estar.summary.missingRequired.length > 0) {
    blockers.push(
      `${estar.summary.missingRequired.length} required eSTAR section(s) missing: ` +
        `${estar.summary.missingRequired.join(', ')}.`,
    );
  }

  // Official-template blockers (cannot produce the artifact CDRH ingests).
  for (const b of template.blockers) blockers.push(b);

  // Market overlay blockers (honest about transmit/assemble gaps).
  if (market) for (const b of market.blockers) blockers.push(b);

  const sectionsComplete = estar.summary.missingRequired.length === 0;
  const canProduceOfficialEstar = sectionsComplete && template.available;

  let artifactKind: DeviceArtifactKind;
  if (canProduceOfficialEstar) {
    artifactKind = 'official-estar';
  } else if (input.leaves.length > 0) {
    // We have content but cannot produce the official eSTAR — only the loose
    // section-PDF draft package is producible, which is NOT submittable.
    artifactKind = 'content-package-draft';
  } else {
    artifactKind = 'none';
  }

  // De-duplicate blockers while preserving order.
  const dedupedBlockers = Array.from(new Set(blockers));

  return {
    pathway: input.pathway,
    variant: input.variant,
    artifactKind,
    canProduceOfficialEstar,
    estar,
    template,
    market,
    blockers: dedupedBlockers,
    provenance: {
      generatedAt: new Date().toISOString(),
      modules: [
        input.pathway === 'pma' ? 'pathway-engines/pma/pma-mapper' : 'pathway-engines/estar/estar-mapper',
        'pathway-engines/estar/estar-template-registry',
        ...(market ? ['global-markets/market-readiness'] : []),
      ],
    },
  };
}

export default { assembleDeviceSubmission };
