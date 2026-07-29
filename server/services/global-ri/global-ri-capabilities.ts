/**
 * Global Regulatory Intelligence — capabilities index (UI discovery surface).
 *
 * WHY THIS EXISTS: the global-RI layer is now ~40 deterministic expert domains
 * exposed over /api/global-ri (plus 26 AnA tools). The incoming UI kit (and AnA
 * itself) needs ONE call to discover what's available, how it's grouped for
 * navigation, how to invoke it (HTTP routes + AnA tool names), and — crucially —
 * the input JSON-schema for each callable so a UI can render forms dynamically
 * without hard-coding the surface.
 *
 * This is reference data kept in lock-step with the routes/tools it lists. It is
 * pure / deterministic (no DB, no network, no LLM) and builds NO UI — it is the
 * data contract a UI kit renders against.
 *
 * @module server/services/global-ri/global-ri-capabilities
 */

import { GLOBAL_RI_GROUPS } from '@shared/constants/global-ri-ui';
import type {
  GlobalRiCapability,
  EnrichedGlobalRiCapability,
  GlobalRiCatalog,
} from '@shared/types/global-ri-api';
import { GLOBAL_RI_TOOL_SPECS } from './ana-tools';

export type { GlobalRiCapability, EnrichedGlobalRiCapability, GlobalRiCatalog } from '@shared/types/global-ri-api';

/** The global-RI capability catalog (data only — routes verbatim from the sub-routers). */
export const GLOBAL_RI_CAPABILITIES: GlobalRiCapability[] = [
  // ── Strategy & Pathway ──────────────────────────────────────────────────────
  { id: 'regulatory_pathway', label: 'Regulatory pathway advisor', group: 'strategy', description: 'Per-market clinical-trial + marketing-application pathway for a product type.', routes: ['POST /pathway'], anaTools: ['global_ri_regulatory_pathway'], deterministic: true },
  { id: 'strategy_brief', label: 'Cross-market strategy brief', group: 'strategy', description: 'One-call cross-market brief: pathway, designations, expedited, meetings, checklists, fees, exclusivity, pediatric + PV obligations.', routes: ['POST /strategy-brief'], anaTools: ['global_ri_strategy_brief'], deterministic: true },
  { id: 'dossier_classifier', label: 'Dossier legal-basis classifier', group: 'strategy', description: 'FDA 505(b)(1)/(b)(2)/ANDA/351(a)/(k) and EU Article 8(3)/10(x) marketing-application legal basis.', routes: ['GET /dossier/legal-bases/:region', 'POST /dossier/classify'], anaTools: ['global_ri_dossier_classifier'], deterministic: true },
  { id: 'fee_estimator', label: 'Regulatory fee estimator', group: 'strategy', description: 'Indicative agency fees per market with orphan / small-business waivers.', routes: ['GET /fees/schedule/:market', 'POST /fees/estimate'], anaTools: ['global_ri_fee_estimate'], deterministic: true },
  { id: 'reliance_pathways', label: 'Reliance & work-sharing pathways', group: 'strategy', description: 'Project Orbis, Access Consortium, EU-M4all, WHO CRP, ASEAN Joint Assessment, Swissmedic MAGHP.', routes: ['GET /reliance-pathways', 'GET /reliance-pathways/:id', 'POST /reliance-pathways/recommend'], anaTools: ['global_ri_reliance_pathways'], deterministic: true },
  { id: 'ich_guidelines', label: 'ICH guideline catalog', group: 'strategy', description: 'Searchable ICH guideline reference catalog.', routes: ['GET /ich-guidelines', 'GET /ich-guidelines/:code'], anaTools: [], deterministic: true },
  { id: 'guidance_map', label: 'Regulatory guidance map', group: 'strategy', description: 'Governing ICH guidelines + regulations for a topic (grounding).', routes: ['GET /guidance/topics', 'GET /guidance/:topic'], anaTools: [], deterministic: true },
  { id: 'submission_economics', label: 'Submission economics', group: 'strategy', description: 'Combined fee + review-timeline projection for a submission.', routes: ['POST /submission-economics'], anaTools: [], deterministic: true },

  // ── Designations & Access ───────────────────────────────────────────────────
  { id: 'expedited_programs', label: 'Expedited / accelerated programs', group: 'designations_access', description: 'Match a development context to FDA/EMA/PMDA expedited programs.', routes: ['GET /expedited-programs', 'POST /expedited-programs/match'], anaTools: ['global_ri_expedited_programs'], deterministic: true },
  { id: 'special_designations', label: 'Orphan & pediatric designations', group: 'designations_access', description: 'Orphan + pediatric designation eligibility per market.', routes: ['GET /designations/criteria/:market', 'POST /designations/assess'], anaTools: ['global_ri_special_designations'], deterministic: true },
  { id: 'expanded_access', label: 'Expanded access / compassionate use', group: 'designations_access', description: 'Pre-approval access mechanism by region and population size.', routes: ['GET /expanded-access/framework/:region', 'POST /expanded-access/recommend'], anaTools: ['global_ri_expanded_access'], deterministic: true },

  // ── Clinical & Nonclinical ──────────────────────────────────────────────────
  { id: 'cta_requirements', label: 'Clinical-trial-application requirements', group: 'clinical', description: 'IND/CTA/CTN component checklist + readiness per market.', routes: ['GET /cta/requirements/:market', 'POST /cta/assess'], anaTools: [], deterministic: true },
  { id: 'ha_meetings', label: 'Health-authority meetings', group: 'clinical', description: 'Recommended HA meeting(s) per market + development milestone.', routes: ['GET /meetings', 'POST /meetings/recommend'], anaTools: [], deterministic: true },
  { id: 'review_timeline', label: 'Global review-timeline projection', group: 'clinical', description: 'Review timeline + milestones per region/procedure.', routes: ['POST /review-timeline'], anaTools: [], deterministic: true },
  { id: 'nonclinical', label: 'Nonclinical requirements (ICH M3(R2))', group: 'clinical', description: 'Nonclinical-to-clinical phasing + repeat-dose tox duration.', routes: ['GET /nonclinical/requirements/:phase', 'POST /nonclinical/tox-duration'], anaTools: [], deterministic: true },
  { id: 'bioequivalence', label: 'Bioequivalence & BCS biowaivers', group: 'clinical', description: 'BE acceptance criteria (FDA/EMA) + ICH M9 BCS biowaiver eligibility.', routes: ['GET /bioequivalence/criteria/:region', 'GET /bioequivalence/biowaiver/:bcsClass'], anaTools: ['global_ri_bioequivalence_criteria', 'global_ri_bcs_biowaiver'], deterministic: true },
  { id: 'pediatric_plan', label: 'Pediatric study-plan obligations', group: 'clinical', description: 'PREA iPSP / EMA PIP plan obligation, timing, waiver/deferral status.', routes: ['GET /pediatric/obligation/:market', 'POST /pediatric/assess'], anaTools: ['global_ri_pediatric_plan'], deterministic: true },
  { id: 'clinical_evidence', label: 'Clinical evidence standards', group: 'clinical', description: 'FDA substantial evidence / EU pivotal-trial standard + control types.', routes: ['GET /clinical-evidence/standard/:region', 'GET /clinical-evidence/control-types'], anaTools: ['global_ri_evidence_standard'], deterministic: true },

  // ── Quality & CMC ───────────────────────────────────────────────────────────
  { id: 'cmc_specifications', label: 'CMC specifications (ICH Q6A/Q6B)', group: 'quality_cmc', description: 'Universal + dosage-form-specific specification test sets.', routes: ['GET /cmc/specifications/:productType', 'GET /cmc/universal-tests/:productType'], anaTools: ['global_ri_cmc_specifications'], deterministic: true },
  { id: 'stability', label: 'Stability requirements (ICH Q1A(R2))', group: 'quality_cmc', description: 'Climatic zones + storage conditions + study design.', routes: ['GET /stability/zones', 'GET /stability/zones/:zone', 'GET /stability/conditions/:storageCondition', 'GET /stability/study-design'], anaTools: ['global_ri_stability_conditions'], deterministic: true },
  { id: 'impurities', label: 'Impurities & limits (ICH Q3A/B/C/D)', group: 'quality_cmc', description: 'Impurity thresholds, residual-solvent classes, elemental-impurity PDEs.', routes: ['GET /impurities/drug-substance', 'GET /impurities/drug-product', 'GET /impurities/residual-solvents', 'GET /impurities/residual-solvents/:name', 'GET /impurities/elemental', 'GET /impurities/elemental/:element'], anaTools: [], deterministic: true },
  { id: 'process_validation', label: 'Process validation', group: 'quality_cmc', description: 'FDA 3-stage lifecycle + EU GMP Annex 15 qualification stages.', routes: ['GET /process-validation/framework/:region', 'GET /process-validation/stage/:region/:stageId'], anaTools: ['global_ri_process_validation'], deterministic: true },

  // ── Safety & Pharmacovigilance ──────────────────────────────────────────────
  { id: 'safety_reporting', label: 'Investigational safety reporting (ICH E2)', group: 'safety_pv', description: 'Expedited reporting classification + timelines (FDA IND / EU SUSAR).', routes: ['GET /safety-reporting/timelines/:region', 'POST /safety-reporting/classify'], anaTools: ['global_ri_safety_reporting'], deterministic: true },
  { id: 'pharmacovigilance', label: 'Pharmacovigilance obligations', group: 'safety_pv', description: 'Post-approval PV duties per market + readiness assessment.', routes: ['GET /pharmacovigilance/obligations/:market', 'POST /pharmacovigilance/assess'], anaTools: [], deterministic: true },
  { id: 'gcp', label: 'GCP essential records (ICH E6)', group: 'safety_pv', description: 'GCP principles, essential records by trial stage, responsibility split.', routes: ['GET /gcp/principles', 'GET /gcp/essential-documents/:stage', 'GET /gcp/responsibilities/:party'], anaTools: [], deterministic: true },

  // ── Submissions & Format ────────────────────────────────────────────────────
  { id: 'module1', label: 'Regional Module 1 requirements', group: 'submissions', description: 'Per-market Module 1 component checklist + readiness.', routes: ['GET /module1/requirements/:market', 'POST /module1/assess'], anaTools: [], deterministic: true },
  { id: 'submission_format', label: 'Electronic submission format', group: 'submissions', description: 'eCTD / gateway / validation profile + readiness per market.', routes: ['GET /submission-format/:market', 'POST /submission-format/assess'], anaTools: [], deterministic: true },
  { id: 'labeling', label: 'Cross-market labeling', group: 'submissions', description: 'Required labeling sections (PI / SmPC / package insert) + readiness.', routes: ['GET /labeling/requirements/:market', 'POST /labeling/assess'], anaTools: [], deterministic: true },
  { id: 'post_approval_changes', label: 'Post-approval changes / variations', group: 'submissions', description: 'Classify a change into the correct filing vehicle per market.', routes: ['GET /changes/vehicles/:market', 'POST /changes/classify'], anaTools: ['global_ri_post_approval_change'], deterministic: true },
  { id: 'inspection', label: 'Inspection readiness (PAI/GMP/BIMO)', group: 'submissions', description: 'Inspection profile + readiness-domain assessment per market.', routes: ['GET /inspection/profile/:market', 'POST /inspection/assess'], anaTools: [], deterministic: true },

  // ── Devices & Diagnostics ───────────────────────────────────────────────────
  { id: 'device_classification', label: 'Device & IVD classification', group: 'devices_dx', description: 'FDA / EU MDR / EU IVDR risk class + conformity pathway.', routes: ['GET /device/framework/:region', 'POST /device/classify'], anaTools: ['global_ri_device_classification'], deterministic: true },
  { id: 'combination_product', label: 'Combination-product classification', group: 'devices_dx', description: 'FDA PMOA lead center + EU MDR Article 117 routing.', routes: ['GET /combination/framework/:region', 'POST /combination/classify'], anaTools: [], deterministic: true },
  { id: 'companion_diagnostics', label: 'Companion diagnostics (CDx)', group: 'devices_dx', description: 'CDx regulatory framework + co-development checklist.', routes: ['GET /companion-diagnostics/framework/:region', 'GET /companion-diagnostics/codevelopment'], anaTools: ['global_ri_companion_diagnostic'], deterministic: true },
  { id: 'advanced_therapies', label: 'Advanced therapies (ATMP/cell-gene)', group: 'devices_dx', description: 'ATMP / cell & gene / regenerative classification + route.', routes: ['GET /advanced-therapies/framework/:region', 'POST /advanced-therapies/classify'], anaTools: ['global_ri_advanced_therapy'], deterministic: true },

  // ── Lifecycle & Post-market ─────────────────────────────────────────────────
  { id: 'exclusivity', label: 'Exclusivity & LOE', group: 'lifecycle', description: 'Data/market/orphan/pediatric exclusivity + projected loss-of-exclusivity date.', routes: ['GET /exclusivity/rules/:market', 'POST /exclusivity/compute'], anaTools: ['global_ri_exclusivity'], deterministic: true },
  { id: 'lifecycle_obligations', label: 'Lifecycle obligations calendar', group: 'lifecycle', description: 'Recurring post-approval obligations projected into a due-date calendar.', routes: ['GET /lifecycle/obligations/:market', 'POST /lifecycle/schedule'], anaTools: ['global_ri_lifecycle_schedule'], deterministic: true },
  { id: 'disclosure', label: 'Clinical-trial disclosure', group: 'lifecycle', description: 'Registration + results-posting obligations & deadlines (CT.gov / CTIS / WHO).', routes: ['GET /disclosure/requirements/:market', 'POST /disclosure/deadlines'], anaTools: [], deterministic: true },

  // ── Commercial & Supply Chain ───────────────────────────────────────────────
  { id: 'promotional', label: 'Promotional compliance', group: 'commercial_supply', description: 'Prescription-medicine promotion rules + readiness (FDA OPDP / EU Title VIII).', routes: ['GET /promotional-compliance/rules/:region', 'POST /promotional-compliance/assess'], anaTools: ['global_ri_promotional_compliance'], deterministic: true },
  { id: 'controlled_substances', label: 'Controlled substances (DEA)', group: 'commercial_supply', description: 'US DEA schedules I–V + handling/prescription/quota controls.', routes: ['GET /controlled-substances/schedules', 'GET /controlled-substances/schedules/:schedule', 'GET /controlled-substances/handling/:schedule'], anaTools: ['global_ri_controlled_substance'], deterministic: true },
  { id: 'establishment', label: 'Establishment registration', group: 'commercial_supply', description: 'Manufacturer/establishment registration & drug listing + readiness.', routes: ['GET /establishment/framework/:region', 'POST /establishment/assess'], anaTools: ['global_ri_establishment_registration'], deterministic: true },
  { id: 'import_export', label: 'Import / export licensing', group: 'commercial_supply', description: 'Import/export authorisation by region + product category.', routes: ['GET /import-export/matrix/:region', 'POST /import-export/requirements'], anaTools: ['global_ri_import_export'], deterministic: true },
];

const TOOL_SPEC_BY_NAME = new Map(GLOBAL_RI_TOOL_SPECS.map((s) => [s.name, s]));

/** Capabilities grouped by navigation group (display order from the shared taxonomy). */
export function capabilitiesByGroup(): Record<string, GlobalRiCapability[]> {
  const out: Record<string, GlobalRiCapability[]> = {};
  for (const g of GLOBAL_RI_GROUPS) out[g.id] = [];
  for (const c of GLOBAL_RI_CAPABILITIES) (out[c.group] ??= []).push(c);
  return out;
}

/**
 * Build the global-RI capability catalog — one call for the UI to discover the whole
 * surface (groups, routes, AnA tools, and per-tool input schemas for dynamic forms).
 * Pure / deterministic.
 */
export function getGlobalRiCatalog(): GlobalRiCatalog {
  const capabilities: EnrichedGlobalRiCapability[] = GLOBAL_RI_CAPABILITIES.map((c) => ({
    ...c,
    tools: c.anaTools.map((name) => {
      const spec = TOOL_SPEC_BY_NAME.get(name);
      return { name, description: spec?.description ?? '', inputSchema: spec?.input_schema ?? null };
    }),
  }));
  const grouped = capabilitiesByGroup();
  const byGroup = Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.length]));
  return {
    total: GLOBAL_RI_CAPABILITIES.length,
    groups: GLOBAL_RI_GROUPS.map((g) => ({ ...g })),
    byGroup,
    capabilities,
    anaToolCount: GLOBAL_RI_TOOL_SPECS.length,
  };
}

export default { GLOBAL_RI_CAPABILITIES, capabilitiesByGroup, getGlobalRiCatalog };
