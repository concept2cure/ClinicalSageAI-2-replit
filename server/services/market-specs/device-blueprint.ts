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
  /** Sections already authored, per evidence module, for the gap assessment. */
  present?: { cerSectionIds?: string[]; perSectionIds?: string[]; rmfSectionIds?: string[] };
  /** CER equivalence claim. */
  equivalenceClaimed?: boolean;
}

export interface EvidenceModuleStatus {
  id: 'risk_management' | 'clinical_evaluation' | 'performance_evaluation' | 'biocompatibility' | 'software';
  title: string;
  applicable: boolean;
  basis: string;
  /** Module-specific detail (assessment / endpoints / deliverables), when applicable. */
  detail?: unknown;
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
  /** True when every applicable evidence module that was assessed reports ready. */
  evidenceReady: boolean;
}

const REVIEWER_TYPE: Record<DeviceSubmissionType, ReviewerType> = {
  '510k': '510k',
  de_novo: 'de_novo',
  pma: 'pma',
  mdr_td: 'cer',
  ivdr_td: 'per',
};

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

  // Risk management — always applicable to a device/IVD.
  {
    const detail = input.present?.rmfSectionIds ? assessRmfStructure(input.present.rmfSectionIds) : { sections: RMF_SECTIONS.length };
    if (input.present?.rmfSectionIds) assessedReady.push((detail as { ready: boolean }).ready);
    evidenceModules.push({ id: 'risk_management', title: 'Risk Management File (ISO 14971)', applicable: true, basis: 'ISO 14971:2019; MDR Annex II §5', detail });
  }

  // Clinical evaluation (CER) — EU medical device technical file.
  {
    const applicable = input.submissionType === 'mdr_td';
    const detail = applicable && input.present?.cerSectionIds
      ? assessCerStructure(input.present.cerSectionIds, { equivalenceClaimed: input.equivalenceClaimed })
      : applicable ? { sections: CER_SECTIONS.length } : undefined;
    if (applicable && input.present?.cerSectionIds) assessedReady.push((detail as { ready: boolean }).ready);
    evidenceModules.push({ id: 'clinical_evaluation', title: 'Clinical Evaluation Report (MDR Annex XIV)', applicable, basis: 'MDR Annex XIV; MEDDEV 2.7/1 Rev 4', detail });
  }

  // Performance evaluation (PER) — EU IVD technical file.
  {
    const applicable = input.submissionType === 'ivdr_td';
    const detail = applicable && input.present?.perSectionIds
      ? assessPerStructure(input.present.perSectionIds)
      : applicable ? { sections: PER_SECTIONS.length } : undefined;
    if (applicable && input.present?.perSectionIds) assessedReady.push((detail as { ready: boolean }).ready);
    evidenceModules.push({ id: 'performance_evaluation', title: 'Performance Evaluation Report (IVDR Annex XIII)', applicable, basis: 'IVDR Annex XIII', detail });
  }

  // Biocompatibility — when the device contacts the body.
  {
    const applicable = !!input.contact;
    const detail = input.contact ? requiredBiocompEndpoints(input.contact.nature, input.contact.duration) : undefined;
    evidenceModules.push({ id: 'biocompatibility', title: 'Biological Evaluation (ISO 10993-1)', applicable, basis: 'ISO 10993-1:2018', detail });
  }

  // Software — when the device contains software.
  {
    const applicable = input.software?.applicable === true;
    let detail: unknown;
    if (applicable) {
      const cls = classifySoftware({
        canContributeToDeathOrSeriousInjury: input.software?.canContributeToDeathOrSeriousInjury,
        canContributeToNonSeriousInjury: input.software?.canContributeToNonSeriousInjury,
      });
      const deliverables = deliverablesForClass(cls.class);
      const assessment = input.software?.presentDeliverableIds
        ? assessSoftwareDeliverables(cls.class, input.software.presentDeliverableIds)
        : undefined;
      if (assessment) assessedReady.push(assessment.ready);
      detail = { classification: cls, deliverables, assessment };
    }
    evidenceModules.push({ id: 'software', title: 'Software Lifecycle (IEC 62304)', applicable, basis: 'IEC 62304:2006+A1:2015', detail });
  }

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
    evidenceReady: assessedReady.length > 0 && assessedReady.every(Boolean),
  };
}

export default { buildDeviceBlueprint };
