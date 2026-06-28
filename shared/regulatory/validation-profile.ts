/**
 * Validation profile — made real, grounded in the evidence model.
 *
 * `validationProfile` on a registry entry was a decorative, auto-derived string
 * (`${id}_validation`) that nothing read. This resolves it to something true: a
 * profile keyed by **(segment, evidence model)** that answers "what must a
 * complete, defensible argument for this filing contain?" — the required claims
 * (from the claim spine), the apps that support each, and where each projects.
 *
 * The grouping is the *correct* one, which the old per-id string got wrong:
 *   - NDA → `pharma-clinical_efficacy`   BLA → `biotech-clinical_efficacy`
 *     (NOT the same profile — CDER chemistry vs CBER biologic)
 *   - ANDA / generic → `pharma-sameness`  (different evidence model than NDA)
 *   - 510(k) → `device-equivalence`       PMA → `device-clinical_efficacy`
 *
 * Pure, no DB. Composes program-model + claim-spine; replaces the decorative field.
 *
 * @module shared/regulatory/validation-profile
 */

import { resolveProgramModel } from './program-model.js';
import { resolveToRegistryEntry } from './submission-type-bridge.js';
import type { ClientSegmentId, EvidenceModel } from './client-segments.js';
import type { WorkspaceAppId } from './app-registry.js';

export interface ValidationClaimRequirement {
  /** Claim id (e.g. 'efficacy', 'substantial_equivalence'). */
  id: string;
  label: string;
  /** Apps whose evidence supports this claim. */
  supportedByApps: WorkspaceAppId[];
  /** Dossier sections this claim's evidence projects to. */
  projectsTo: string[];
}

export interface ValidationProfile {
  /** Grounded, shared profile id: `<segment>-<evidenceModel>`. */
  profileId: string;
  /** The legacy decorative id this replaces (for migration reference). */
  legacyProfileId: string | null;
  segment: ClientSegmentId | null;
  evidenceModel: EvidenceModel | null;
  dossierStandard: string | null;
  /** Claims that must be supported for a complete, defensible argument. */
  requiredClaims: ValidationClaimRequirement[];
  /** True when this resolved to a real grounded profile (vs the generic fallback). */
  grounded: boolean;
}

/**
 * Resolve the grounded validation profile for a selected need. Falls back to a
 * generic, ungrounded profile (never throws) for selections with no concrete
 * product segment (cross-cutting modules, QMS docs, unknown ids).
 */
export function resolveValidationProfile(need: string): ValidationProfile {
  const key = (need ?? '').trim();
  const legacyProfileId = resolveToRegistryEntry(key)?.validationProfile ?? null;
  const program = resolveProgramModel(key);

  if (program.segment && program.axes && program.claimSpine) {
    return {
      profileId: `${program.segment.id}-${program.axes.evidenceModel}`,
      legacyProfileId,
      segment: program.segment.id,
      evidenceModel: program.axes.evidenceModel,
      dossierStandard: program.segment.dossierStandard,
      requiredClaims: program.claimSpine.claims.map((c) => ({
        id: c.id,
        label: c.label,
        supportedByApps: c.supportedByApps,
        projectsTo: c.projectsTo,
      })),
      grounded: true,
    };
  }

  return {
    profileId: 'generic-document',
    legacyProfileId,
    segment: null,
    evidenceModel: null,
    dossierStandard: null,
    requiredClaims: [],
    grounded: false,
  };
}

export default { resolveValidationProfile };
