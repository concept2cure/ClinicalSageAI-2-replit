/**
 * Device submission blueprint — the reverse-workflow synthesis for a device/IVD
 * submission. Given the submission type and structured device facts, it assembles
 * the complete picture a team needs working BACKWARD from a submitted application:
 * the risk classification, the required documents, the applicable evidence
 * structures (CER / PER / risk management / biocompatibility / software), and the
 * reviewer checklist — in one deterministic object.
 *
 * This is the tie-it-together layer over the per-domain modules (classification,
 * requirements, cer/per/rmf/biocomp/software structures, shadow reviewer). It does
 * not duplicate them — it orchestrates them and reports which evidence modules
 * apply to this device and how complete each is.
 *
 * HONESTY: applicability is derived from the supplied facts; each underlying module
 * carries its own caveat. This is planning/oversight intelligence, not a regulatory
 * decision.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/device-blueprint
 */

import { classifyMdr, classifyIvdr, recommendFdaPathway, type MdrDeviceFacts, type IvdrDeviceFacts, type FdaPathwayFacts } from './device-classification';
import { getRequirements } from './submission-requirements';
import { CER_SECTIONS, assessCerStructure } from './cer-structure';
import { PER_SECTIONS, assessPerStructure } from './per-structure';
import { RMF_SECTIONS, assessRmfStructure } from './risk-management-structure';
import { requiredBiocompEndpoints, type ContactNature, type ContactDuration } from './biocompatibility-matrix';
import { classifySoftware, deliverablesForClass, assessSoftwareDeliverables } from './software-lifecycle';
import { applicableElectricalStandards, type ElectricalDeviceFacts } from './electrical-safety';
import { sterilizationRequirements, type SterilizationFacts } from './sterilization';
import { buildShadowReviewerChecklist, type DeviceSubmissionType as ReviewerType } from './device-shadow-reviewer';

export type DeviceSubmissionType = '510k' | 'de_novo' | 'pma' | 'mdr_td' | 'ivdr_td';

export interface DeviceBlueprintInput {
  submissionType: DeviceSubmissionType;
  /** Classification facts; the framework is chosen to match the submission type when omitted. */
  classification?:
    | { framework: 'mdr'; facts: MdrDeviceFacts }
    | { framework: 'ivdr'; facts: IvdrDeviceFacts }
    | { framework: 'fda'; facts: FdaPathwayFacts };
  /** Patient-contact category — when present, biocompatibility applies. */
  contact?: { nature: ContactNature; duration: ContactDuration };
  /** Software — when present and applicable, the IEC 62304 module applies. */
  software?: { applicable: boolean; canContributeToDeathOrSeriousInjury?: boolean; canContributeToNonSeriousInjury?: boolean; presentDeliverableIds?: string[] };
  /** Electrical facts — when electricallyPowered, the IEC 60601 module applies; unstated, its applicability is undetermined. */
  electrical?: ElectricalDeviceFacts;
  /** Sterilization facts — when sterile, the ISO 11135/11137/17665 module applies; unstated, its applicability is undetermined. */
  sterilization?: SterilizationFacts;
  /** Sections already authored, per evidence module, for the gap assessment. */
  present?: { cerSectionIds?: string[]; perSectionIds?: string[]; rmfSectionIds?: string[] };
  /** CER equivalence claim. */
  equivalenceClaimed?: boolean;
}

export interface EvidenceModuleStatus {
  id: 'risk_management' | 'clinical_evaluation' | 'performance_evaluation' | 'biocompatibility' | 'software' | 'electrical_safety' | 'sterilization';
  title: string;
  applicable: boolean;
  basis: string;
  /** Module-specific detail (assessment / endpoints / deliverables), when applicable. */
  detail?: unknown;
}

/** An applicable evidence module whose evidence nobody assessed, and what would assess it. */
export interface EvidenceNotAssessed {
  id: EvidenceModuleStatus['id'];
  reason: string;
}

/** An evidence module whose applicability turns on a fact that was not stated. */
export interface EvidenceModuleUndetermined {
  id: EvidenceModuleStatus['id'];
  title: string;
  basis: string;
  /** 'undetermined — <fact> not stated'. */
  applicability: string;
}

export interface DeviceBlueprint {
  submissionType: DeviceSubmissionType;
  classification?: unknown;
  requiredDocuments: Array<{ templateId?: string; name: string; required: boolean }>;
  requiredForms: string[];
  evidenceModules: EvidenceModuleStatus[];
  reviewer: {
    reviewer: string;
    questionCount: number;
    criticalCount: number;
  };
  /**
   * True only when every applicable evidence module was assessed and reports ready; false
   * when an assessed one is not ready (a module asked to be assessed whose required set is
   * undetermined — software class, CER equivalence claim — counts as not ready); otherwise
   * null, with the modules nobody assessed in `evidenceNotAssessed` and those whose
   * applicability is undetermined in `evidenceModulesUndetermined`. Until 2026-10-15 those
   * were dropped, so a complete RMF alone made an mdr_td file with no CER evidence ready.
   */
  evidenceReady: boolean | null;
  evidenceNotAssessed: EvidenceNotAssessed[];
  /**
   * Modules left out of `evidenceModules` because the fact deciding whether they apply
   * was not stated (electrical.electricallyPowered, sterilization.sterile). Until
   * 2026-10-15 they were listed applicable:false, as for a device stated unpowered or
   * non-sterile.
   */
  evidenceModulesUndetermined: EvidenceModuleUndetermined[];
}

const REVIEWER_TYPE: Record<DeviceSubmissionType, ReviewerType> = {
  '510k': '510k',
  de_novo: 'de_novo',
  pma: 'pma',
  mdr_td: 'cer',
  ivdr_td: 'per',
};

/**
 * The software module's detail, and its readiness when an assessment was asked for
 * (null when none was). 2026-10-15: unstated harm facts used to read as Class A, so
 * the module was assessed (and scored ready) against the Class A set alone. With no
 * class there is no required set to assess against, and a requested assessment is
 * not ready.
 */
function softwareModule(software: NonNullable<DeviceBlueprintInput['software']>): { detail: unknown; ready: boolean | null } {
  const cls = classifySoftware({
    canContributeToDeathOrSeriousInjury: software.canContributeToDeathOrSeriousInjury,
    canContributeToNonSeriousInjury: software.canContributeToNonSeriousInjury,
  });
  const deliverables = deliverablesForClass(cls.class);
  const asked = software.presentDeliverableIds;
  if (cls.class === 'undetermined') {
    const assessment = {
      status: 'not_assessed' as const,
      reason: 'No IEC 62304 safety class is determined, so the required deliverable set is not known.',
      missingFacts: cls.missingFacts,
    };
    return { detail: { classification: cls, deliverables, assessment }, ready: asked ? false : null };
  }
  const assessment = asked ? assessSoftwareDeliverables(cls.class, asked) : undefined;
  return { detail: { classification: cls, deliverables, assessment }, ready: assessment ? assessment.ready : null };
}

/** `evidenceReady` from assessed readiness, and the count of modules nobody assessed or that may apply. */
function evidenceReadiness(assessedReady: boolean[], unassessedCount: number): boolean | null {
  if (assessedReady.includes(false)) return false;
  return unassessedCount > 0 || assessedReady.length === 0 ? null : true;
}

const LISTED_ONLY = 'The blueprint lists what is required; it does not assess evidence for it.';

/**
 * A module that one stated fact decides (electrical safety, sterilization): applicable
 * when it is true, listed not applicable when false, and undetermined when not stated.
 * 2026-10-15: `=== true` listed an unstated one applicable:false.
 */
function factGatedModule(
  sink: { modules: EvidenceModuleStatus[]; notAssessed: EvidenceNotAssessed[]; undetermined: EvidenceModuleUndetermined[] },
  m: { id: 'electrical_safety' | 'sterilization'; title: string; basis: string; fact: string; value: boolean | undefined; detail: () => unknown },
): void {
  if (m.value === undefined) {
    sink.undetermined.push({ id: m.id, title: m.title, basis: m.basis, applicability: `undetermined — ${m.fact} not stated` });
    return;
  }
  if (m.value) sink.notAssessed.push({ id: m.id, reason: LISTED_ONLY });
  sink.modules.push({ id: m.id, title: m.title, applicable: m.value, basis: m.basis, detail: m.value ? m.detail() : undefined });
}

/** Build the complete device submission blueprint. */
export function buildDeviceBlueprint(input: DeviceBlueprintInput): DeviceBlueprint {
  // 1. Classification.
  let classification: unknown;
  if (input.classification) {
    const c = input.classification;
    classification =
      c.framework === 'mdr' ? { framework: 'mdr', ...classifyMdr(c.facts) }
        : c.framework === 'ivdr' ? { framework: 'ivdr', ...classifyIvdr(c.facts) }
          : { framework: 'fda', ...recommendFdaPathway(c.facts) };
  }

  // 2. Required documents/forms.
  const req = getRequirements(input.submissionType);
  const requiredDocuments = req?.requiredDocuments ?? [];
  const requiredForms = req?.requiredForms ?? [];

  // 3. Applicable evidence modules.
  const evidenceModules: EvidenceModuleStatus[] = [];
  const assessedReady: boolean[] = [];
  const evidenceNotAssessed: EvidenceNotAssessed[] = [];
  const evidenceModulesUndetermined: EvidenceModuleUndetermined[] = [];

  // Risk management — always applicable to a device/IVD.
  {
    const detail = input.present?.rmfSectionIds ? assessRmfStructure(input.present.rmfSectionIds) : { sections: RMF_SECTIONS.length };
    if (input.present?.rmfSectionIds) assessedReady.push((detail as { ready: boolean }).ready);
    else evidenceNotAssessed.push({ id: 'risk_management', reason: 'No Risk Management File sections were supplied (present.rmfSectionIds).' });
    evidenceModules.push({ id: 'risk_management', title: 'Risk Management File (ISO 14971)', applicable: true, basis: 'ISO 14971:2019; MDR Annex II §5', detail });
  }

  // Clinical evaluation (CER) — EU medical device technical file.
  {
    const applicable = input.submissionType === 'mdr_td';
    const detail = applicable && input.present?.cerSectionIds
      ? assessCerStructure(input.present.cerSectionIds, { equivalenceClaimed: input.equivalenceClaimed })
      : applicable ? { sections: CER_SECTIONS.length } : undefined;
    if (applicable && input.present?.cerSectionIds) assessedReady.push((detail as { ready: boolean }).ready);
    else if (applicable) evidenceNotAssessed.push({ id: 'clinical_evaluation', reason: 'No CER sections were supplied (present.cerSectionIds).' });
    evidenceModules.push({ id: 'clinical_evaluation', title: 'Clinical Evaluation Report (MDR Annex XIV)', applicable, basis: 'MDR Annex XIV; MEDDEV 2.7/1 Rev 4', detail });
  }

  // Performance evaluation (PER) — EU IVD technical file.
  {
    const applicable = input.submissionType === 'ivdr_td';
    const detail = applicable && input.present?.perSectionIds
      ? assessPerStructure(input.present.perSectionIds)
      : applicable ? { sections: PER_SECTIONS.length } : undefined;
    if (applicable && input.present?.perSectionIds) assessedReady.push((detail as { ready: boolean }).ready);
    else if (applicable) evidenceNotAssessed.push({ id: 'performance_evaluation', reason: 'No PER sections were supplied (present.perSectionIds).' });
    evidenceModules.push({ id: 'performance_evaluation', title: 'Performance Evaluation Report (IVDR Annex XIII)', applicable, basis: 'IVDR Annex XIII', detail });
  }

  // Biocompatibility — when the device contacts the body.
  {
    const applicable = !!input.contact;
    const detail = input.contact ? requiredBiocompEndpoints(input.contact.nature, input.contact.duration) : undefined;
    if (applicable) evidenceNotAssessed.push({ id: 'biocompatibility', reason: LISTED_ONLY });
    evidenceModules.push({ id: 'biocompatibility', title: 'Biological Evaluation (ISO 10993-1)', applicable, basis: 'ISO 10993-1:2018', detail });
  }

  // Software — when the device contains software.
  {
    const applicable = input.software?.applicable === true;
    const sw = applicable && input.software ? softwareModule(input.software) : null;
    if (sw && sw.ready !== null) assessedReady.push(sw.ready);
    else if (sw) evidenceNotAssessed.push({ id: 'software', reason: 'No software deliverables were supplied (software.presentDeliverableIds).' });
    evidenceModules.push({ id: 'software', title: 'Software Lifecycle (IEC 62304)', applicable, basis: 'IEC 62304:2006+A1:2015', detail: sw?.detail });
  }

  // Electrical safety — when the device is electrically powered; sterilization — when it
  // is supplied sterile. Either is undetermined while its fact is not stated.
  const sink = { modules: evidenceModules, notAssessed: evidenceNotAssessed, undetermined: evidenceModulesUndetermined };
  factGatedModule(sink, {
    id: 'electrical_safety', title: 'Electrical Safety (IEC 60601)', basis: 'IEC 60601-1 family',
    fact: 'electrical.electricallyPowered', value: input.electrical?.electricallyPowered,
    detail: () => applicableElectricalStandards(input.electrical!),
  });
  factGatedModule(sink, {
    id: 'sterilization', title: 'Sterilization (ISO 11135/11137/17665)', basis: 'ISO 11135 / 11137 / 17665; SAL 10⁻⁶',
    fact: 'sterilization.sterile', value: input.sterilization?.sterile,
    detail: () => sterilizationRequirements(input.sterilization!),
  });

  // 4. Reviewer checklist.
  const checklist = buildShadowReviewerChecklist(REVIEWER_TYPE[input.submissionType]);

  return {
    submissionType: input.submissionType,
    classification,
    requiredDocuments,
    requiredForms,
    evidenceModules,
    reviewer: {
      reviewer: checklist.reviewer,
      questionCount: checklist.counts.total,
      criticalCount: checklist.counts.critical,
    },
    evidenceReady: evidenceReadiness(assessedReady, evidenceNotAssessed.length + evidenceModulesUndetermined.length),
    evidenceNotAssessed,
    evidenceModulesUndetermined,
  };
}

export default { buildDeviceBlueprint };
