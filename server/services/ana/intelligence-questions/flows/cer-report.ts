/**
 * Clinical Evaluation Report (CER) flow definition for the AnA Intelligence
 * Questioning system.
 *
 * Guides the user through gathering the information required for a CER per
 * MEDDEV 2.7/1 Rev 4 and EU MDR (2017/745), covering device description &
 * classification, state of the art, clinical data identification, literature
 * search & appraisal, clinical investigation data, GSPR compliance,
 * benefit-risk & PMCF, and evaluator qualifications.
 *
 * 22 nodes · 130+ fields · 8 sections · 15 issue checks
 *
 * The question nodes live in ./cer-report/, one module per flow section; this
 * module owns the flow's identity, metadata and section map, and assembles the
 * per-section node arrays in section order.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

/* One module per flow section (see `sections` below) — the nodes were split
   out of this file solely along its own section boundaries, so each module is
   a cohesive questionnaire section and this file stays the single place the
   flow's identity, metadata, section map and node order are defined. */
import { deviceDescriptionNodes } from './cer-report/device-description-nodes.js';
import { stateOfArtNodes } from './cer-report/state-of-art-nodes.js';
import { clinicalDataIdentificationNodes } from './cer-report/clinical-data-identification-nodes.js';
import { literatureAppraisalNodes } from './cer-report/literature-appraisal-nodes.js';
import { clinicalInvestigationNodes } from './cer-report/clinical-investigation-nodes.js';
import { gsprComplianceNodes } from './cer-report/gspr-compliance-nodes.js';
import { benefitRiskPmcfNodes } from './cer-report/benefit-risk-pmcf-nodes.js';
import { evaluatorQualificationNodes } from './cer-report/evaluator-qualification-nodes.js';

export function createCerReportFlow(): FlowDefinition {
  return {
    id: 'cer-report-v1',
    category: 'cer_report',
    name: 'Clinical Evaluation Report',
    description:
      'Comprehensive questionnaire for Clinical Evaluation Reports (CER) per MEDDEV 2.7/1 Rev 4 and EU MDR (2017/745). Covers device description & classification, state of the art review, clinical data identification, literature search & appraisal (PICO framework), clinical investigation data (ISO 14155), GSPR compliance (Annex I), benefit-risk analysis & PMCF planning (Article 61(11)), and evaluator qualifications. Includes branching for Class III/implantable devices, equivalence claims, PMCF study type, and novel vs established technology.',
    clientTypes: ['medtech'],
    entryNode: 'cer_device_info',
    estimatedMinutes: 60,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'device_desc',
        label: 'Device Description & Classification',
        nodeIds: ['cer_device_info', 'intended_purpose', 'device_classification_detail'],
      },
      {
        id: 'state_of_art',
        label: 'State of the Art',
        nodeIds: ['medical_alternatives', 'technology_assessment', 'novel_device_assessment'],
      },
      {
        id: 'clinical_data_id',
        label: 'Clinical Data Identification',
        nodeIds: ['clinical_data_sources', 'equivalent_device', 'equivalence_demonstration'],
      },
      {
        id: 'literature_appraisal',
        label: 'Literature Search & Appraisal',
        nodeIds: ['literature_search', 'literature_appraisal_method', 'data_analysis'],
      },
      {
        id: 'clinical_investigation',
        label: 'Clinical Investigation Data',
        nodeIds: ['clinical_investigation_detail', 'clinical_experience'],
      },
      {
        id: 'gspr_compliance',
        label: 'GSPR Compliance',
        nodeIds: ['gspr_checklist', 'common_specifications'],
      },
      {
        id: 'benefit_risk_pmcf',
        label: 'Benefit-Risk & PMCF',
        nodeIds: ['risk_analysis', 'cer_conclusions', 'pmcf_plan', 'pmcf_study_design'],
      },
      {
        id: 'evaluator_qual',
        label: 'Evaluator Qualifications',
        nodeIds: ['evaluator_qualifications', 'evaluator_declaration'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Device Description & Classification                 */
      /* ================================================================ */

      ...deviceDescriptionNodes,

      /* ================================================================ */
      /*  Section 2 — State of the Art                                    */
      /* ================================================================ */

      ...stateOfArtNodes,

      /* ================================================================ */
      /*  Section 3 — Clinical Data Identification                        */
      /* ================================================================ */

      ...clinicalDataIdentificationNodes,

      /* ================================================================ */
      /*  Section 4 — Literature Search & Appraisal                       */
      /* ================================================================ */

      ...literatureAppraisalNodes,

      /* ================================================================ */
      /*  Section 5 — Clinical Investigation Data                         */
      /* ================================================================ */

      ...clinicalInvestigationNodes,

      /* ================================================================ */
      /*  Section 6 — GSPR Compliance                                     */
      /* ================================================================ */

      ...gsprComplianceNodes,

      /* ================================================================ */
      /*  Section 7 — Benefit-Risk & PMCF                                 */
      /* ================================================================ */

      ...benefitRiskPmcfNodes,

      /* ================================================================ */
      /*  Section 8 — Evaluator Qualifications                            */
      /* ================================================================ */

      ...evaluatorQualificationNodes,
    ],
  };
}
