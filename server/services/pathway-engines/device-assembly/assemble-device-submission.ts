/**
 * Device & IVD submission assembly contract (Device Slice 1, B5).
 *
 * The single, honest orchestration spine for assembling a device/IVD submission.
 * It ties together the pieces that already exist as isolated modules:
 *   - eSTAR section readiness   (estar-mapper.mapToEstar)
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

import { mapToEstar, type EstarType, type EstarInputLeaf, type EstarResult } from '../estar/estar-mapper';
import {
  assessEstarTemplateReadiness,
  estarTemplateRequiredFromEnv,
  type EstarTemplateVariant,
  type EstarTemplateReadinessResult,
} from '../estar/estar-template-registry';
import { tryAssessMarketReadiness } from '../../global-markets/market-readiness';
import type { MarketId, MarketReadinessResult } from '../../global-markets/types';

export type DeviceArtifactKind = 'official-estar' | 'content-package-draft' | 'none';

export interface AssembleDeviceSubmissionInput {
  /** eSTAR pathway. (PMA / MDR-IVDR assembly are separate contracts; out of scope here.) */
  pathway: EstarType;
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
}

export interface AssembleDeviceSubmissionResult {
  pathway: EstarType;
  variant: EstarTemplateVariant;
  /** What can honestly be produced for this input. */
  artifactKind: DeviceArtifactKind;
  /** True only when sections are complete AND the official template is available. */
  canProduceOfficialEstar: boolean;
  estar: EstarResult;
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

  const estar = mapToEstar({ leaves: input.leaves, type: input.pathway });

  const template = assessEstarTemplateReadiness({
    type: input.pathway,
    variant: input.variant,
    present: input.presentTemplates ?? [],
    environment,
    requireTemplate,
  });

  const market = input.market
    ? tryAssessMarketReadiness(input.market, input.availableArtifacts ?? [])
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
        'pathway-engines/estar/estar-mapper',
        'pathway-engines/estar/estar-template-registry',
        ...(market ? ['global-markets/market-readiness'] : []),
      ],
    },
  };
}

export default { assembleDeviceSubmission };
