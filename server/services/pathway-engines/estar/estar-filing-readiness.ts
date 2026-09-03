/**
 * eSTAR filing-readiness orchestrator — the single "can this client file X, and
 * what's left?" answer for any eSTAR submission.
 *
 * Ties together the four independently-verified pieces of the eSTAR program into
 * one honest verdict, so a surface doesn't have to call (and reconcile) each:
 *
 *   1. registration eligibility  — estar-registration (FDA ESG / CDRH Portal /
 *      DUNS / MDUFA-fee prerequisites → is this client allowed to file this type?)
 *   2. template + version         — estar-catalog / estar-versions (which family,
 *      the current recommended version, and the OMB control numbers)
 *   3. content readiness          — the right readiness mapper for the submission
 *      (estar-mapper for 510(k)/De Novo, pma-mapper for PMA + supplements,
 *      prestar-mapper for Q-Sub/IDE/513(g)) → are the required sections present?
 *   4. official-template producibility — whether the platform can actually fill
 *      the official FDA PDF (template vendored + verified field map)
 *
 * PURE + DETERMINISTIC + HONEST-BY-CONSTRUCTION: no DB, no network, no filesystem.
 * Producibility is passed in (the caller reads it from the template registry / fill
 * orchestration) so this stays a pure projection; it defaults to not-producible so
 * the verdict fails closed. Nothing is invented — every gap is reported.
 *
 * @module server/services/pathway-engines/estar/estar-filing-readiness
 */

import {
  getCatalogEntry,
  resolveCatalogTemplate,
  type EstarCatalogKey,
} from './estar-catalog';
import {
  canFile,
  type EstarClientRegistration,
  type EstarRegistrationRequirement,
} from './estar-registration';
import type { EstarProgramSubmissionType, EstarTemplateFamily } from './estar-versions';
import { mapToEstar, type EstarType, type DeviceFlags } from './estar-mapper';
import { mapToPma, type PmaSubmissionType } from '../pma/pma-mapper';
import { mapToPreStar, type QSubType } from '../prestar/prestar-mapper';

/** A canonical content leaf — shape shared by every readiness mapper. */
export interface FilingLeaf {
  sectionCode: string;
  title: string;
  documentType?: string;
  /**
   * True only when this leaf carries real, finalized authored content — never a
   * draft/placeholder stub. Mirrors EstarInputLeaf/PmaInputLeaf/PreStarInputLeaf:
   * required so a caller must consciously mark a leaf substantive rather than a
   * title match silently counting as "present" (see those mappers' evalSlot).
   */
  substantive?: boolean; // optional: undefined ⇒ NOT substantive (fail-closed)
}

/** PMA catalog key → the pma-mapper submission type. */
const PMA_KEY_TO_TYPE: Record<string, PmaSubmissionType> = {
  pma_original: 'original',
  pma_panel_track_supplement: 'panel_track_supplement',
  pma_180_day_supplement: '180_day_supplement',
  pma_real_time_supplement: 'real_time_supplement',
  pma_30_day_notice: '30_day_notice',
  pma_135_day_supplement: '135_day_supplement',
};

/** Q-Sub catalog key → the prestar-mapper Q-Sub sub-type. */
const QSUB_KEY_TO_TYPE: Record<string, QSubType> = {
  qsub_pre_submission: 'pre_submission',
  qsub_submission_issue_request: 'submission_issue_request',
  qsub_informational_meeting: 'informational_meeting',
  qsub_study_risk_determination: 'study_risk_determination',
  qsub_pma_day_100_meeting: 'pma_day_100_meeting',
  qsub_accessory_classification_request: 'accessory_classification_request',
};

interface NormalizedContent {
  ready: boolean;
  missingSections: string[];
  completeness: number;
}

/** Normalize any mapper's section list into a uniform readiness shape. */
function normalize(
  sections: Array<{ required: boolean; present: boolean }>,
  missingRequired: string[],
  ready: boolean,
): NormalizedContent {
  const required = sections.filter((s) => s.required);
  const presentRequired = required.filter((s) => s.present).length;
  const completeness = required.length === 0 ? 0 : Math.round((presentRequired / required.length) * 100);
  return { ready, missingSections: missingRequired, completeness };
}

/** Dispatch to the correct readiness mapper for a catalog key. */
function assessContent(
  programType: EstarProgramSubmissionType,
  catalogKey: EstarCatalogKey,
  leaves: FilingLeaf[],
  qSubTypeOverride?: QSubType,
  deviceFlags?: DeviceFlags,
): NormalizedContent {
  switch (programType) {
    case '510k':
    case 'de_novo': {
      const r = mapToEstar({ leaves, type: programType as EstarType, flags: deviceFlags });
      /* An undetermined section is reported alongside the missing ones: the
         reader needs to know that "not ready" here means a question is
         unanswered, not that a document is absent. */
      return normalize(
        r.sections,
        [...r.summary.missingRequired, ...r.summary.undetermined],
        r.summary.ready,
      );
    }
    case 'pma': {
      const submissionType = PMA_KEY_TO_TYPE[catalogKey] ?? 'original';
      const r = mapToPma({ leaves, submissionType });
      return normalize(r.sections, r.summary.missingRequired, r.summary.ready);
    }
    case 'q_sub': {
      const qSubType = qSubTypeOverride ?? QSUB_KEY_TO_TYPE[catalogKey] ?? 'pre_submission';
      const r = mapToPreStar({ leaves, submissionType: 'q_sub', qSubType });
      return normalize(r.sections, r.summary.missingRequired, r.summary.ready);
    }
    case 'ide': {
      const r = mapToPreStar({ leaves, submissionType: 'ide' });
      return normalize(r.sections, r.summary.missingRequired, r.summary.ready);
    }
    case '513g': {
      const r = mapToPreStar({ leaves, submissionType: '513g' });
      return normalize(r.sections, r.summary.missingRequired, r.summary.ready);
    }
    default: {
      const _exhaustive: never = programType;
      throw new Error(`Unknown program type: ${String(_exhaustive)}`);
    }
  }
}

export interface EstarFilingReadinessInput {
  /** What the client wants to file. */
  catalogKey: EstarCatalogKey;
  /** Device vs IVD (selects the nIVD/IVD template family for marketing pathways). */
  variant: 'device' | 'ivd';
  /** The client's eSTAR registration state (which FDA accounts/identifiers it holds). */
  registration: EstarClientRegistration;
  /** Canonical content leaves to project onto the submission's section tree. */
  leaves: FilingLeaf[];
  /** Override the Q-Sub sub-type (else derived from the catalog key). */
  qSubType?: QSubType;
  /**
   * The device's answers to the seven intake flags (DEVICE_FLAGS, W1-6).
   *
   * Several eSTAR sections are required only for some devices — sterilization
   * for a sterile one, software documentation for one containing software,
   * cybersecurity for a cyber device. Without these answers the model cannot
   * say whether those sections are needed, and `contentReady` fails closed
   * rather than reporting a submission complete on questions nobody asked
   * (W1-5).
   */
  deviceFlags?: DeviceFlags;
  /**
   * Platform-side producibility of the official FDA template (from the template
   * registry / fill orchestration). Both default to false so the verdict fails
   * closed — a submittable eSTAR is never claimed without them.
   */
  templateAvailable?: boolean;
  fieldMapPopulated?: boolean;
}

export interface EstarFilingReadinessResult {
  catalogKey: EstarCatalogKey;
  label: string;
  programType: EstarProgramSubmissionType;
  variant: 'device' | 'ivd';
  center: string;
  regulatoryRef: string;
  reviewGoalDays?: number;
  // Template + version (from the version registry).
  family: EstarTemplateFamily;
  currentVersion: string | null;
  ombNumbers: string[];
  // Registration eligibility.
  eligible: boolean;
  registrationMissing: EstarRegistrationRequirement[];
  // Content readiness.
  contentReady: boolean;
  missingSections: string[];
  completeness: number;
  // Official-template producibility.
  templateAvailable: boolean;
  fieldMapPopulated: boolean;
  officialTemplateProducible: boolean;
  // Overall verdict.
  canFileNow: boolean;
  blockers: string[];
}

/**
 * Assess whether a client can file a given eSTAR submission today, and what's
 * blocking the rest. `canFileNow` is true only when the client is registered for
 * it, the content is complete, AND the platform can produce the official FDA
 * template — every failing dimension is reported in `blockers`.
 */
export function assessEstarFilingReadiness(
  input: EstarFilingReadinessInput,
): EstarFilingReadinessResult | undefined {
  const entry = getCatalogEntry(input.catalogKey);
  if (!entry) return undefined;

  const resolved = resolveCatalogTemplate(input.catalogKey, input.variant);
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];

  // 1. Registration eligibility.
  const eligibility = canFile(input.registration, input.catalogKey);
  const eligible = eligibility?.eligible ?? false;
  const registrationMissing = eligibility?.missing ?? [];

  // 2. Content readiness (dispatched to the right mapper).
  const content = assessContent(entry.programType, input.catalogKey, leaves, input.qSubType, input.deviceFlags);

  // 3. Official-template producibility (passed in; fails closed).
  const templateAvailable = input.templateAvailable ?? false;
  const fieldMapPopulated = input.fieldMapPopulated ?? false;
  const officialTemplateProducible = templateAvailable && fieldMapPopulated;

  // Overall verdict + human-readable blockers.
  const blockers: string[] = [];
  if (!eligible) {
    blockers.push(
      `Client is not registered to file ${entry.label}: missing ${registrationMissing.join(', ') || 'registration prerequisites'}.`,
    );
  }
  if (!content.ready) {
    blockers.push(
      `Content incomplete (${content.completeness}%): missing required sections ${content.missingSections.join(', ') || '(none reported)'}.`,
    );
  }
  if (!officialTemplateProducible) {
    const what = !templateAvailable && !fieldMapPopulated
      ? 'the official FDA template is not vendored and its field map is not populated'
      : !templateAvailable
        ? 'the official FDA template is not vendored'
        : 'the field map is not populated/verified';
    blockers.push(`Cannot produce a submittable eSTAR: ${what}.`);
  }

  return {
    catalogKey: input.catalogKey,
    label: entry.label,
    programType: entry.programType,
    variant: input.variant,
    center: entry.center,
    regulatoryRef: entry.regulatoryRef,
    reviewGoalDays: entry.reviewGoalDays,
    family: resolved?.family ?? 'nivd',
    currentVersion: resolved?.currentVersion ?? null,
    ombNumbers: resolved?.ombNumbers ?? [],
    eligible,
    registrationMissing,
    contentReady: content.ready,
    missingSections: content.missingSections,
    completeness: content.completeness,
    templateAvailable,
    fieldMapPopulated,
    officialTemplateProducible,
    canFileNow: eligible && content.ready && officialTemplateProducible,
    blockers,
  };
}

export default { assessEstarFilingReadiness };
