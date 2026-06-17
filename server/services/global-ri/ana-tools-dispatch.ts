/**
 * Global-RI tool dispatcher — routes an AnA tool name to its deterministic
 * global-RI service and returns the service's structured result object (NOT
 * stringified). Input is passed through cast as the service's input type; the
 * service throws on bad input and the parent handler is expected to catch.
 *
 * Split out of ./ana-tools so the spec catalog and the service-wiring stay in
 * separate, focused modules. Pure / deterministic — no LLM, no IO.
 *
 * @module server/services/global-ri/ana-tools-dispatch
 */

import { recommendPathway, type PathwayAdvisorInput } from './regulatory-pathway-advisor';
import { buildStrategyBrief, type StrategyBriefInput } from './regulatory-strategy-brief';
import { computeExclusivity, type ExclusivityInput } from './exclusivity-periods';
import { classifyDossier, type DossierClassifierInput } from './dossier-classifier';
import { matchExpeditedPrograms, type MatchInput } from './expedited-programs';
import { assessDesignationEligibility, type DesignationInput } from './special-designations';
import { estimateFees, type FeeEstimateInput } from './regulatory-fee-estimator';
import { classifyChange, type ChangeClassificationInput } from './post-approval-changes';
import { classifyDevicePathway, type DeviceClassificationInput } from './device-classification';
import { classifySafetyReport, type SafetyReportInput } from './clinical-safety-reporting';
import { getStabilityConditions, type StorageCondition } from './stability-requirements';
import { computeObligationSchedule, type ObligationScheduleInput } from './lifecycle-obligations-calendar';
import { assessPediatricPlan, type PediatricPlanInput } from './pediatric-requirements';
import { recommendReliancePathways, type ReliancePathwayInput } from './reliance-pathways';
import { getSpecificationTests, type SpecificationTestsInput } from './cmc-specifications';
import { getBioequivalenceCriteria, getBcsBiowaiverEligibility, type BeRegion, type BcsClass } from './bioequivalence-requirements';
import { recommendExpandedAccessMechanism, type RecommendMechanismInput } from './expanded-access';
import { classifyAdvancedTherapy, type AdvancedTherapyClassificationInput } from './advanced-therapies';
import { getCompanionDiagnosticFramework, type CdxRegion } from './companion-diagnostics';
import { getPromotionalRules, type PromoRegion } from './promotional-compliance';
import { getSchedule, type Schedule } from './controlled-substances';
import { getProcessValidationFramework, type PvRegion } from './process-validation';
import { getEvidenceStandard, type EvidenceRegion } from './clinical-evidence-standards';
import { getEstablishmentFramework, type EstablishmentRegion } from './establishment-registration';
import { getImportExportRequirements, type ImportExportRequirementsInput } from './import-export-licensing';

/**
 * Route a global-RI tool call to its deterministic service. Throws for an unknown
 * tool name (and propagates any error the service throws on bad input).
 */
export function dispatchGlobalRiTool(name: string, input: Record<string, unknown>): unknown {
  switch (name) {
    case 'global_ri_regulatory_pathway':
      return recommendPathway(input as unknown as PathwayAdvisorInput);
    case 'global_ri_strategy_brief':
      return buildStrategyBrief(input as unknown as StrategyBriefInput);
    case 'global_ri_exclusivity':
      return computeExclusivity(input as unknown as ExclusivityInput);
    case 'global_ri_dossier_classifier':
      return classifyDossier(input as unknown as DossierClassifierInput);
    case 'global_ri_expedited_programs':
      return matchExpeditedPrograms(input as unknown as MatchInput);
    case 'global_ri_special_designations':
      return assessDesignationEligibility(input as unknown as DesignationInput);
    case 'global_ri_fee_estimate':
      return estimateFees(input as unknown as FeeEstimateInput);
    case 'global_ri_post_approval_change':
      return classifyChange(input as unknown as ChangeClassificationInput);
    case 'global_ri_device_classification':
      return classifyDevicePathway(input as unknown as DeviceClassificationInput);
    case 'global_ri_safety_reporting':
      return classifySafetyReport(input as unknown as SafetyReportInput);
    case 'global_ri_stability_conditions':
      return getStabilityConditions((input as unknown as { storageCondition: StorageCondition }).storageCondition);
    case 'global_ri_lifecycle_schedule':
      return computeObligationSchedule(input as unknown as ObligationScheduleInput);
    case 'global_ri_pediatric_plan':
      return assessPediatricPlan(input as unknown as PediatricPlanInput);
    case 'global_ri_reliance_pathways':
      return recommendReliancePathways(input as unknown as ReliancePathwayInput);
    case 'global_ri_cmc_specifications':
      return getSpecificationTests(input as unknown as SpecificationTestsInput);
    case 'global_ri_bioequivalence_criteria':
      return getBioequivalenceCriteria((input as unknown as { region: BeRegion }).region);
    case 'global_ri_bcs_biowaiver':
      return getBcsBiowaiverEligibility((input as unknown as { bcsClass: BcsClass }).bcsClass);
    case 'global_ri_expanded_access':
      return recommendExpandedAccessMechanism(input as unknown as RecommendMechanismInput);
    case 'global_ri_advanced_therapy':
      return classifyAdvancedTherapy(input as unknown as AdvancedTherapyClassificationInput);
    case 'global_ri_companion_diagnostic':
      return getCompanionDiagnosticFramework((input as unknown as { region: CdxRegion }).region);
    case 'global_ri_promotional_compliance':
      return getPromotionalRules((input as unknown as { region: PromoRegion }).region);
    case 'global_ri_controlled_substance':
      return getSchedule((input as unknown as { schedule: Schedule }).schedule);
    case 'global_ri_process_validation':
      return getProcessValidationFramework((input as unknown as { region: PvRegion }).region);
    case 'global_ri_evidence_standard':
      return getEvidenceStandard((input as unknown as { region: EvidenceRegion }).region);
    case 'global_ri_establishment_registration':
      return getEstablishmentFramework((input as unknown as { region: EstablishmentRegion }).region);
    case 'global_ri_import_export':
      return getImportExportRequirements(input as unknown as ImportExportRequirementsInput);
    default:
      throw new Error(`Unknown global-RI tool "${name}"`);
  }
}
