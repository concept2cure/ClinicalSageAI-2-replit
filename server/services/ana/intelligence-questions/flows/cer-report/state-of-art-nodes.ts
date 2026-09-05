/**
 * Section 2 — State of the Art — question nodes for the Clinical Evaluation Report (CER) flow.
 *
 * Extracted verbatim from cer-report.ts (which had outgrown the repo file-size
 * gate) into one module per flow section. createCerReportFlow() assembles these
 * arrays into the flow's `nodes` array in the order its `sections` metadata
 * declares, so node ids, branching (defaultNext / visibleWhen) and issue checks
 * are byte-for-byte the ones the flow always had.
 *
 * @module server/services/ana/intelligence-questions/flows/cer-report/state-of-art-nodes
 */

import type { QuestionNode } from '../../../../../../shared/types/intelligence-questions.js';

export const stateOfArtNodes: QuestionNode[] = [
  {
    id: 'medical_alternatives',
    section: 'state_of_art',
    question:
      'Describe the current state of the art for the medical condition this device addresses.',
    guidance:
      'The CER must include an analysis of the state of the art per MEDDEV 2.7/1 Rev 4 Section 7 and EU MDR Article 61(1). This includes current treatment alternatives, competing devices, standard of care, and benchmarks from published literature. The state of the art forms the context for evaluating whether the device\'s benefit-risk profile is acceptable. Per MDCG 2020-6, the state of the art should reflect the current knowledge at the time of CER preparation and must be updated when new treatments or technologies emerge. Include clinical practice guidelines and consensus statements from relevant medical societies.',
    fields: [
      {
        id: 'current_treatment_landscape',
        label: 'Current Treatment Landscape',
        type: 'textarea',
        required: true,
        helpText: 'Describe all available treatment options (surgical, pharmacological, device-based, conservative) for the target medical condition',
        validation: { minLength: 50 },
      },
      {
        id: 'alternative_devices',
        label: 'Alternative Devices/Therapies',
        type: 'textarea',
        required: true,
        helpText: 'List competing devices and alternative therapeutic approaches on the market, including their market share where known',
      },
      {
        id: 'standard_of_care',
        label: 'Standard of Care',
        type: 'textarea',
        required: true,
        helpText: 'Describe the current standard of care and reference relevant clinical practice guidelines (e.g. ESC, AHA, NICE)',
      },
      {
        id: 'clinical_guidelines_referenced',
        label: 'Clinical Practice Guidelines Referenced',
        type: 'textarea',
        helpText: 'List specific clinical practice guidelines, their issuing bodies, and publication dates',
      },
      {
        id: 'published_benchmarks',
        label: 'Published Performance Benchmarks',
        type: 'textarea',
        helpText: 'Cite published literature benchmarks for safety and performance endpoints relevant to this device category (e.g. complication rates, success rates, survival data)',
      },
      {
        id: 'unmet_clinical_need',
        label: 'Unmet Clinical Need',
        type: 'textarea',
        helpText: 'Describe any unmet clinical needs that this device addresses and how it improves upon existing treatment options',
      },
      {
        id: 'disease_epidemiology',
        label: 'Disease / Condition Epidemiology',
        type: 'textarea',
        helpText: 'Prevalence, incidence, disease burden, and patient demographics for the target condition',
      },
      {
        id: 'state_of_art_search_date',
        label: 'Date of State of the Art Review',
        type: 'date',
        required: true,
        helpText: 'The state of the art must reflect current knowledge at the time of CER preparation',
      },
    ],
    issueChecks: [
      {
        id: 'no_state_of_art_check',
        condition: { field: 'current_treatment_landscape', operator: 'eq', value: '' },
        severity: 'warning',
        title: 'No State of the Art Review',
        message:
          'A state of the art analysis is required per MEDDEV 2.7/1 Rev 4 Section 7 and EU MDR Article 61(1). This analysis provides the context for evaluating the device\'s benefit-risk profile and is expected by Notified Bodies. Without a thorough state of the art review, the CER conclusion cannot be properly contextualized.',
        reference: 'MEDDEV 2.7/1 Rev 4, Section 7; EU MDR Article 61(1)',
      },
    ],
    defaultNext: 'technology_assessment',
  },

  {
    id: 'technology_assessment',
    section: 'state_of_art',
    question:
      'Describe the current state of technology and any evolving standards relevant to this device.',
    guidance:
      'Per EU MDR Article 61(1), the clinical evaluation must consider the current state of technology. This includes evolving standards, recent guidance changes, harmonized standards applicable to the device, and any emerging technologies that may affect the device\'s risk-benefit profile. Reference MDCG guidance documents where applicable. The technology assessment should demonstrate awareness of the regulatory landscape, including any anticipated changes that may affect the device\'s conformity.',
    fields: [
      {
        id: 'current_technology_state',
        label: 'Current State of Technology',
        type: 'textarea',
        required: true,
        helpText: 'Describe the technological landscape for this type of device, including recent technological advances and innovations',
      },
      {
        id: 'harmonized_standards_applicable',
        label: 'Harmonized Standards Applicable',
        type: 'textarea',
        required: true,
        helpText: 'List the EU harmonized standards applicable to this device type (e.g. EN ISO 14708 for active implants, EN ISO 10993 for biocompatibility)',
      },
      {
        id: 'evolving_standards',
        label: 'Evolving Standards or Guidance',
        type: 'textarea',
        helpText: 'Identify any standards or guidelines currently under revision that may affect the device',
      },
      {
        id: 'recent_guidance_changes',
        label: 'Recent Regulatory Guidance Changes',
        type: 'textarea',
        helpText: 'List any recent MDCG guidance documents, MEDDEV revisions, or Notified Body position papers relevant to this device (e.g. MDCG 2020-5, MDCG 2020-6, MDCG 2020-13)',
      },
      {
        id: 'emerging_safety_concerns',
        label: 'Emerging Safety Concerns in the Field',
        type: 'textarea',
        helpText: 'Identify any emerging safety signals, product recalls (from RAPEX/Safety Gate), field safety notices, or safety communications in this device category',
      },
      {
        id: 'technology_gap_analysis',
        label: 'Technology Gap Analysis',
        type: 'textarea',
        helpText: 'Assess how the subject device compares to the current state of technology. Are there technology gaps that affect safety or performance?',
      },
    ],
    defaultNext: 'clinical_data_sources',
  },

  {
    id: 'novel_device_assessment',
    section: 'state_of_art',
    question:
      'This device has been identified as novel. Provide an extended state-of-the-art analysis covering the scientific rationale and innovation justification.',
    guidance:
      'Novel devices without established technology precedent require a more comprehensive state-of-the-art analysis per MEDDEV 2.7/1 Rev 4. The scientific rationale for the novel approach must be clearly articulated, including the mechanism of action and preclinical evidence supporting clinical translation. Per EU MDR Article 61(4), novel Class III and implantable devices will generally require clinical investigation data. Notified Bodies apply heightened scrutiny to novel devices. MDCG 2020-6 emphasizes that for novel technologies, the state of the art may need to draw on scientific principles, bench testing, and preclinical data when clinical evidence is limited.',
    fields: [
      {
        id: 'novelty_description',
        label: 'Description of Novel Technology / Approach',
        type: 'textarea',
        required: true,
        helpText: 'Describe what makes this device novel and how it differs from established technologies',
        validation: { minLength: 50 },
      },
      {
        id: 'scientific_rationale',
        label: 'Scientific Rationale',
        type: 'textarea',
        required: true,
        helpText: 'Explain the scientific basis for the novel approach, including mechanism of action and underlying scientific principles',
        validation: { minLength: 50 },
      },
      {
        id: 'preclinical_evidence_summary',
        label: 'Preclinical Evidence Summary',
        type: 'textarea',
        required: true,
        helpText: 'Summarize bench testing, animal studies, computational modeling, or other preclinical evidence supporting clinical translation',
      },
      {
        id: 'innovation_benefit_over_existing',
        label: 'Claimed Innovation Benefit Over Existing Solutions',
        type: 'textarea',
        required: true,
        helpText: 'Articulate the specific advantages this novel approach offers over established technologies',
      },
      {
        id: 'first_in_human_study_planned',
        label: 'First-in-Human Study Planned or Completed',
        type: 'select',
        required: true,
        options: [
          { value: 'planned', label: 'Planned — Not Yet Started' },
          { value: 'ongoing', label: 'Ongoing' },
          { value: 'completed', label: 'Completed' },
          { value: 'not_applicable', label: 'Not Applicable' },
        ],
      },
      {
        id: 'novel_risk_profile',
        label: 'Novel Risk Profile Assessment',
        type: 'textarea',
        required: true,
        helpText: 'Describe any novel risks associated with this technology that may not be covered by existing standards or known safety profiles',
      },
    ],
    defaultNext: 'clinical_data_sources',
  },
];
