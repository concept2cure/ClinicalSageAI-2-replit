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
 * @module server/services/ana/intelligence-questions/flows/cer-report
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

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

      {
        id: 'cer_device_info',
        section: 'device_desc',
        question:
          'Let\'s begin with the device details. What is the device name, manufacturer, and current CE marking status?',
        guidance:
          'The CER must include a complete description of the device per MEDDEV 2.7/1 Rev 4 Section A1. Include the GMDN code for standardized nomenclature and the UDI-DI for traceability across the European market. Under EU MDR 2017/745, the CER must reference the device\'s classification per Annex VIII classification rules. The description should be sufficiently detailed that the device can be unambiguously identified, including all models, sizes, variants, and accessories covered by the CER scope. MDCG 2020-13 provides additional guidance on clinical evaluation scoping.',
        fields: [
          {
            id: 'cer_device_name',
            label: 'Device Name',
            type: 'text',
            required: true,
            helpText: 'The trade name or proprietary name of the device as it appears on the label',
          },
          {
            id: 'cer_manufacturer',
            label: 'Manufacturer',
            type: 'text',
            required: true,
            helpText: 'Legal manufacturer name and address as per EU MDR Article 2(30)',
          },
          {
            id: 'cer_authorized_representative',
            label: 'Authorized Representative in EU (if applicable)',
            type: 'text',
            helpText: 'Required for manufacturers established outside the EU per Article 11',
          },
          {
            id: 'ce_marking_status',
            label: 'CE Marking Status',
            type: 'select',
            required: true,
            options: [
              { value: 'not_applied', label: 'Not Applied' },
              { value: 'applied_pending', label: 'Applied — Pending' },
              { value: 'ce_marked_mdd', label: 'CE Marked (under MDD 93/42/EEC)' },
              { value: 'ce_marked_mdr', label: 'CE Marked (under EU MDR 2017/745)' },
              { value: 'transitioning', label: 'Transitioning MDD to MDR' },
            ],
          },
          {
            id: 'eu_mdr_class',
            label: 'EU MDR Device Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'class_i', label: 'Class I' },
              { value: 'class_is', label: 'Class Is (Sterile)' },
              { value: 'class_im', label: 'Class Im (Measuring)' },
              { value: 'class_ir', label: 'Class Ir (Reusable Surgical Instruments)' },
              { value: 'class_iia', label: 'Class IIa' },
              { value: 'class_iib', label: 'Class IIb' },
              { value: 'class_iii', label: 'Class III' },
            ],
            helpText: 'Classification per EU MDR Annex VIII classification rules',
          },
          {
            id: 'classification_rule',
            label: 'Applicable Classification Rule(s)',
            type: 'text',
            helpText: 'EU MDR Annex VIII rule number(s) that determine the classification (e.g. Rule 8, Rule 13)',
          },
          {
            id: 'gmdn_code',
            label: 'GMDN Code',
            type: 'text',
            helpText: 'Global Medical Device Nomenclature code for standardized device identification',
          },
          {
            id: 'udi_di',
            label: 'UDI-DI',
            type: 'text',
            helpText: 'Unique Device Identification - Device Identifier per EUDAMED requirements',
          },
          {
            id: 'device_description_summary',
            label: 'Device Description Summary',
            type: 'textarea',
            required: true,
            helpText: 'Comprehensive description of the device including principles of operation, materials, components, accessories, and all variants/models covered by this CER. Per MEDDEV 2.7/1 Rev 4 Section A1.',
            validation: { minLength: 50 },
          },
          {
            id: 'is_implantable',
            label: 'Is the device implantable?',
            type: 'yes_no',
            required: true,
            helpText: 'Implantable as defined by EU MDR Article 2(5) — intended to be totally or partially introduced into the human body',
          },
          {
            id: 'is_novel_device',
            label: 'Is this a novel device with no established technology precedent?',
            type: 'yes_no',
            required: true,
            helpText: 'Novel devices require a more extensive state-of-the-art analysis and typically require clinical investigation data',
          },
          {
            id: 'notified_body_name',
            label: 'Notified Body',
            type: 'text',
            helpText: 'Name and NB number of the Notified Body (e.g. BSI 0086, TUV SUD 0123)',
          },
          {
            id: 'notified_body_feedback_received',
            label: 'Has Notified Body feedback been received on a prior CER submission?',
            type: 'yes_no',
          },
          {
            id: 'notified_body_feedback_summary',
            label: 'Summary of Notified Body Feedback',
            type: 'textarea',
            visibleWhen: { field: 'notified_body_feedback_received', operator: 'eq', value: true },
            helpText: 'Summarize key findings, deficiency letters, or questions raised by the Notified Body on prior CER reviews',
          },
          {
            id: 'cer_revision_number',
            label: 'CER Revision Number',
            type: 'text',
            helpText: 'Current revision of this CER (e.g. Rev 01, Rev 02)',
          },
          {
            id: 'cer_date',
            label: 'CER Date',
            type: 'date',
          },
        ],
        issueChecks: [
          {
            id: 'missing_notified_body_feedback_check',
            condition: { field: 'notified_body_feedback_received', operator: 'eq', value: false },
            severity: 'info',
            title: 'Missing Notified Body Feedback',
            message:
              'No Notified Body feedback has been received on a prior CER. While not required for an initial submission, addressing prior NB feedback is critical for CER updates and re-certifications. Consider proactively engaging the NB on the clinical evaluation approach for complex or novel devices.',
          },
        ],
        defaultNext: 'intended_purpose',
      },

      {
        id: 'intended_purpose',
        section: 'device_desc',
        question:
          'What is the intended purpose of this device, and who is the target patient population?',
        guidance:
          'The intended purpose is a critical element of the CER and determines the scope of clinical evaluation. Per EU MDR Article 2(12), the intended purpose includes the medical condition, target patient population, and clinical benefits. Contraindications must also be clearly identified. The intended purpose must be consistent with the labeling and IFU. Per MEDDEV 2.7/1 Rev 4 Section A1, the scope of the clinical evaluation is directly defined by the intended purpose. All claimed clinical benefits must be substantiated by clinical evidence in the CER.',
        fields: [
          {
            id: 'cer_intended_purpose',
            label: 'Intended Purpose',
            type: 'textarea',
            required: true,
            helpText: 'The intended purpose as stated in the labeling and IFU, consistent with EU MDR Article 2(12)',
            validation: { minLength: 30 },
          },
          {
            id: 'target_patient_population',
            label: 'Target Patient Population',
            type: 'textarea',
            required: true,
            helpText: 'Include age range, clinical condition, any exclusions. Identify any vulnerable populations (pediatric, pregnant, elderly).',
          },
          {
            id: 'medical_conditions_treated',
            label: 'Medical Conditions / Indications',
            type: 'textarea',
            required: true,
          },
          {
            id: 'claimed_clinical_benefits',
            label: 'Claimed Clinical Benefits',
            type: 'textarea',
            required: true,
            helpText: 'List all clinical benefits claimed for the device — each benefit must be supported by clinical evidence in the CER per EU MDR Annex XIV Part A. Distinguish between direct clinical benefits and indirect/performance benefits.',
            validation: { minLength: 30 },
          },
          {
            id: 'cer_contraindications',
            label: 'Contraindications',
            type: 'textarea',
          },
          {
            id: 'intended_users',
            label: 'Intended Users',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'healthcare_professional', label: 'Healthcare Professional' },
              { value: 'patient_self_use', label: 'Patient (Self-Use)' },
              { value: 'caregiver', label: 'Caregiver / Lay Person' },
              { value: 'surgeon', label: 'Surgeon' },
              { value: 'nurse', label: 'Nurse' },
              { value: 'technician', label: 'Technician' },
              { value: 'radiologist', label: 'Radiologist' },
              { value: 'dentist', label: 'Dentist' },
            ],
          },
          {
            id: 'clinical_context',
            label: 'Clinical Context of Use',
            type: 'textarea',
            helpText: 'Describe the clinical setting and workflow in which the device is used (e.g. operating room, outpatient clinic, home use)',
          },
          {
            id: 'duration_of_use',
            label: 'Duration of Use',
            type: 'select',
            required: true,
            options: [
              { value: 'transient', label: 'Transient (< 60 minutes)' },
              { value: 'short_term', label: 'Short-term (up to 30 days)' },
              { value: 'long_term', label: 'Long-term (> 30 days)' },
              { value: 'permanent', label: 'Permanent (lifetime of patient)' },
            ],
            helpText: 'Duration of contact or intended functional period per EU MDR Annex VIII Chapter I',
          },
        ],
        defaultNext: 'device_classification_detail',
      },

      {
        id: 'device_classification_detail',
        section: 'device_desc',
        question:
          'Provide the detailed classification justification and regulatory pathway information.',
        guidance:
          'EU MDR Annex VIII contains 22 classification rules. The manufacturer must document which rule(s) apply and justify the resulting classification. For devices where multiple rules apply, the strictest classification prevails per Article 51(7). The classification determines the conformity assessment route (Annex IX, X, or XI) and the depth of clinical evidence required. MDCG 2021-24 provides guidance on classification of medical devices.',
        fields: [
          {
            id: 'classification_justification',
            label: 'Classification Justification',
            type: 'textarea',
            required: true,
            helpText: 'Explain why the selected classification rule(s) apply to this device. Reference specific criteria from Annex VIII.',
            validation: { minLength: 50 },
          },
          {
            id: 'invasiveness_type',
            label: 'Device Invasiveness',
            type: 'select',
            required: true,
            options: [
              { value: 'non_invasive', label: 'Non-Invasive' },
              { value: 'body_orifice', label: 'Invasive via Body Orifice' },
              { value: 'surgically_invasive', label: 'Surgically Invasive' },
              { value: 'implantable', label: 'Implantable' },
            ],
          },
          {
            id: 'active_device',
            label: 'Is the device an active medical device?',
            type: 'yes_no',
            required: true,
            helpText: 'Per EU MDR Article 2(4), any device whose operation depends on a source of energy other than human body or gravity',
          },
          {
            id: 'body_contact_type',
            label: 'Body Contact Type',
            type: 'multi_select',
            options: [
              { value: 'skin', label: 'Intact Skin' },
              { value: 'mucosal', label: 'Mucosal Membrane' },
              { value: 'breached_skin', label: 'Breached / Compromised Skin' },
              { value: 'blood_path', label: 'Blood Path (Indirect)' },
              { value: 'tissue_bone', label: 'Tissue / Bone' },
              { value: 'blood_direct', label: 'Blood (Direct Contact)' },
              { value: 'cns', label: 'Central Nervous System' },
              { value: 'cardiovascular', label: 'Central Cardiovascular System' },
            ],
          },
          {
            id: 'incorporates_medicinal_substance',
            label: 'Does the device incorporate a medicinal substance?',
            type: 'yes_no',
            helpText: 'Per EU MDR Article 1(8) and classification Rule 14',
          },
          {
            id: 'incorporates_biological_material',
            label: 'Does the device incorporate tissues or cells of human or animal origin?',
            type: 'yes_no',
            helpText: 'Per EU MDR Article 1(6) and Annex VIII Rule 18',
          },
          {
            id: 'device_variants_covered',
            label: 'Device Variants / Models Covered by This CER',
            type: 'textarea',
            helpText: 'List all variants, models, sizes, configurations covered. Justify why they can be grouped in a single CER.',
          },
          {
            id: 'previous_generation_devices',
            label: 'Previous Generation Devices',
            type: 'textarea',
            helpText: 'List any predecessor devices and summarize design changes. Clinical data from predecessors may be relevant if equivalence can be demonstrated.',
          },
        ],
        branches: [
          {
            when: { field: 'is_novel_device', operator: 'eq', value: true },
            goto: 'novel_device_assessment',
          },
        ],
        defaultNext: 'medical_alternatives',
      },

      /* ================================================================ */
      /*  Section 2 — State of the Art                                    */
      /* ================================================================ */

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

      /* ================================================================ */
      /*  Section 3 — Clinical Data Identification                        */
      /* ================================================================ */

      {
        id: 'clinical_data_sources',
        section: 'clinical_data_id',
        question:
          'What clinical data sources are available for the evaluation?',
        guidance:
          'The CER should draw on all available clinical data, including clinical investigations, published literature, post-market surveillance, registry data, and complaints data. Per MEDDEV 2.7/1 Rev 4 Section 7, all data from the manufacturer\'s post-market surveillance system should be included. For Class III and implantable devices under EU MDR Article 61(4), clinical investigations are generally required unless justified otherwise. Clinical data must be identified systematically and the identification process documented. MDCG 2020-5 provides guidance on clinical evaluation adequacy and the clinical data sets that should be considered.',
        fields: [
          {
            id: 'data_sources_available',
            label: 'Clinical Data Sources Available',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'clinical_investigations', label: 'Clinical Investigations (own device)' },
              { value: 'clinical_investigations_equiv', label: 'Clinical Investigations (equivalent device)' },
              { value: 'literature', label: 'Published Literature' },
              { value: 'post_market_surveillance', label: 'Post-Market Surveillance Data' },
              { value: 'registers', label: 'Registers / Registries' },
              { value: 'complaints_data', label: 'Complaints Data' },
              { value: 'vigilance_data', label: 'Vigilance / FSCA Data' },
              { value: 'pmcf_data', label: 'PMCF Study Data' },
              { value: 'expert_opinion', label: 'Expert Clinical Opinion' },
              { value: 'real_world_evidence', label: 'Real-World Evidence / EHR Data' },
            ],
          },
          {
            id: 'clinical_investigation_available',
            label: 'Clinical Investigation Data Available for Subject Device',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'equiv_device_identified',
            label: 'Equivalent Device Identified for Clinical Data',
            type: 'yes_no',
            required: true,
            helpText: 'Per MEDDEV 2.7/1 Rev 4, equivalence must be demonstrated to use clinical data from another device',
          },
          {
            id: 'data_sufficiency_assessment',
            label: 'Initial Data Sufficiency Assessment',
            type: 'select',
            required: true,
            options: [
              { value: 'sufficient', label: 'Sufficient — All claims and safety endpoints supported' },
              { value: 'partial_gaps', label: 'Partial Gaps — Some endpoints lack clinical data' },
              { value: 'significant_gaps', label: 'Significant Gaps — Major endpoints unsupported' },
              { value: 'insufficient', label: 'Insufficient — Fundamental lack of clinical data' },
            ],
            helpText: 'Preliminary assessment of whether available clinical data is sufficient to support all safety and performance claims',
          },
          {
            id: 'data_gap_description',
            label: 'Description of Clinical Data Gaps',
            type: 'textarea',
            visibleWhen: { field: 'data_sufficiency_assessment', operator: 'neq', value: 'sufficient' },
            helpText: 'Describe each identified gap and how it will be addressed (PMCF, clinical investigation, additional literature)',
          },
          {
            id: 'systematic_review_methodology_used',
            label: 'Systematic Review Methodology Used for Data Identification',
            type: 'yes_no',
            required: true,
            helpText: 'Per MEDDEV 2.7/1 Rev 4 Section 8, a systematic and documented approach is required',
          },
        ],
        branches: [
          {
            when: { field: 'equiv_device_identified', operator: 'eq', value: true },
            goto: 'equivalent_device',
          },
          {
            when: { field: 'clinical_investigation_available', operator: 'eq', value: true },
            goto: 'clinical_investigation_detail',
          },
        ],
        issueChecks: [
          {
            id: 'clinical_data_gaps_not_addressed_check',
            condition: { field: 'data_sufficiency_assessment', operator: 'eq', value: 'significant_gaps' },
            severity: 'warning',
            title: 'Clinical Data Gaps Not Addressed',
            message:
              'Significant gaps in clinical data have been identified. Per MEDDEV 2.7/1 Rev 4 and EU MDR Annex XIV Part A, all gaps must be clearly documented with a plan to address them (e.g. through PMCF studies, additional clinical investigations, or further literature review). Unaddressed gaps may result in CER rejection by the Notified Body.',
            reference: 'MEDDEV 2.7/1 Rev 4; EU MDR Annex XIV Part A',
          },
          {
            id: 'no_systematic_review_check',
            condition: { field: 'systematic_review_methodology_used', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Systematic Review Methodology',
            message:
              'A systematic and documented approach to clinical data identification is required per MEDDEV 2.7/1 Rev 4 Section 8. Without a systematic review methodology, the comprehensiveness of the data identification cannot be demonstrated, and the CER may be challenged by the Notified Body.',
            reference: 'MEDDEV 2.7/1 Rev 4, Section 8',
          },
        ],
        defaultNext: 'literature_search',
      },

      {
        id: 'equivalent_device',
        section: 'clinical_data_id',
        question:
          'Provide details about the equivalent device and the basis for the equivalence claim.',
        guidance:
          'MEDDEV 2.7/1 Rev 4 requires manufacturers to justify equivalence on clinical, technical, and biological grounds. An equivalent device must have the same clinical purpose, similar design, and use similar materials. Under EU MDR Article 61(5), manufacturers demonstrating equivalence to a device of another manufacturer must have a contract in place giving them access to the equivalent device\'s technical documentation — this is a hard requirement. Without such access, the equivalence route is not available for devices of other manufacturers. The equivalence assessment must use a structured side-by-side comparison as described in MEDDEV 2.7/1 Rev 4 Appendix A1.',
        fields: [
          {
            id: 'equiv_device_name',
            label: 'Equivalent Device Name',
            type: 'text',
            required: true,
          },
          {
            id: 'equiv_device_manufacturer',
            label: 'Equivalent Device Manufacturer',
            type: 'text',
            required: true,
          },
          {
            id: 'equiv_device_ce_marked',
            label: 'Is the Equivalent Device Currently CE Marked?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'equiv_device_classification',
            label: 'Equivalent Device Classification',
            type: 'select',
            options: [
              { value: 'class_i', label: 'Class I' },
              { value: 'class_iia', label: 'Class IIa' },
              { value: 'class_iib', label: 'Class IIb' },
              { value: 'class_iii', label: 'Class III' },
            ],
          },
          {
            id: 'access_to_technical_documentation',
            label: 'Access to Equivalent Device Technical Documentation',
            type: 'select',
            required: true,
            options: [
              { value: 'own_device', label: 'Own Device — Full access' },
              { value: 'contract_access', label: 'Contract in Place — Access to technical documentation' },
              { value: 'no_access', label: 'No Direct Access to Technical Documentation' },
            ],
            helpText: 'EU MDR Article 61(5) requires access to the equivalent device\'s technical documentation via contract when claiming equivalence to another manufacturer\'s device',
          },
          {
            id: 'equiv_clinical_data_available',
            label: 'Clinical Data Available for Equivalent Device',
            type: 'multi_select',
            options: [
              { value: 'clinical_investigations', label: 'Clinical Investigations' },
              { value: 'published_literature', label: 'Published Literature' },
              { value: 'registry_data', label: 'Registry Data' },
              { value: 'post_market_data', label: 'Post-Market Surveillance Data' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'no_equivalence_demonstration_check',
            condition: { field: 'access_to_technical_documentation', operator: 'eq', value: 'no_access' },
            severity: 'warning',
            title: 'No Equivalence Demonstration for Reference Device',
            message:
              'Without access to the equivalent device\'s technical documentation, the equivalence route cannot be used for devices of other manufacturers per EU MDR Article 61(5). The manufacturer must either obtain a contract with the equivalent device manufacturer, use their own predicate device, or generate standalone clinical investigation data.',
            reference: 'EU MDR Article 61(5); MEDDEV 2.7/1 Rev 4, Appendix A1',
          },
        ],
        defaultNext: 'equivalence_demonstration',
      },

      {
        id: 'equivalence_demonstration',
        section: 'clinical_data_id',
        question:
          'Provide the equivalence justification across clinical, technical, and biological dimensions.',
        guidance:
          'Per MEDDEV 2.7/1 Rev 4 Appendix A1, equivalence must be demonstrated across three dimensions: clinical (same clinical condition, purpose, and effect), technical (similar design, specifications, and deployment), and biological (same materials, contact type, and duration). Each dimension must be individually justified with a detailed comparison. Any differences must be assessed for their impact on safety and clinical performance. Notified Bodies expect a structured side-by-side comparison table covering each dimension. The MDCG 2020-5 guidance clarifies that any difference between the subject device and the claimed equivalent must be clinically justified.',
        fields: [
          {
            id: 'clinical_equivalence',
            label: 'Clinical Equivalence',
            type: 'textarea',
            required: true,
            helpText: 'Same clinical condition, same clinical purpose, same clinical effect, same site in body, same target population',
            validation: { minLength: 50 },
          },
          {
            id: 'technical_equivalence',
            label: 'Technical Equivalence',
            type: 'textarea',
            required: true,
            helpText: 'Similar design, specifications, physicochemical properties, deployment methods, operating principles, energy type, sterilization',
            validation: { minLength: 50 },
          },
          {
            id: 'biological_equivalence',
            label: 'Biological Equivalence',
            type: 'textarea',
            required: true,
            helpText: 'Same materials in contact with human body, contact type (skin, tissue, blood, CNS), contact duration (transient, short-term, long-term)',
            validation: { minLength: 50 },
          },
          {
            id: 'equivalence_differences',
            label: 'Identified Differences from Equivalent Device',
            type: 'textarea',
            required: true,
            helpText: 'List ALL differences and explain why they do not negatively affect safety or clinical performance. Per MDCG 2020-5, each difference requires clinical justification.',
          },
          {
            id: 'equivalence_table_prepared',
            label: 'Side-by-Side Equivalence Comparison Table Prepared',
            type: 'yes_no',
            required: true,
            helpText: 'A structured comparison table is expected by Notified Bodies per MEDDEV 2.7/1 Rev 4 Appendix A1',
          },
          {
            id: 'equivalence_conclusion',
            label: 'Equivalence Conclusion',
            type: 'select',
            required: true,
            options: [
              { value: 'equivalent', label: 'Equivalent — No clinically significant differences' },
              { value: 'similar_with_differences', label: 'Similar — Differences identified but justified' },
              { value: 'not_equivalent', label: 'Not Equivalent — Significant differences that prevent equivalence claim' },
            ],
          },
        ],
        defaultNext: 'literature_search',
      },

      /* ================================================================ */
      /*  Section 4 — Literature Search & Appraisal                       */
      /* ================================================================ */

      {
        id: 'literature_search',
        section: 'literature_appraisal',
        question:
          'Describe the literature search strategy and results.',
        guidance:
          'MEDDEV 2.7/1 Rev 4 Section 8 requires a systematic literature review. The search strategy must be documented, reproducible, and comprehensive. Include the databases searched, search terms (using PICO framework: Population, Intervention, Comparison, Outcome), date range, and the screening/appraisal methodology. Multiple databases should be searched to ensure comprehensive coverage — MEDDEV 2.7/1 Rev 4 explicitly recommends searching at minimum PubMed/MEDLINE and Embase. The literature search protocol should be finalized before conducting the search. A PRISMA flow diagram is strongly recommended to document the screening process. ISO 14155:2020 Annex A provides guidance on literature search methodology for clinical investigations.',
        fields: [
          {
            id: 'literature_search_protocol',
            label: 'Literature Search Protocol Documented',
            type: 'yes_no',
            required: true,
            helpText: 'A written protocol should be finalized before conducting the search',
          },
          {
            id: 'pico_framework_used',
            label: 'PICO Framework Used for Search Strategy',
            type: 'yes_no',
            required: true,
            helpText: 'Population, Intervention, Comparison, Outcome — the recommended framework for structuring clinical questions and search terms',
          },
          {
            id: 'pico_population',
            label: 'PICO — Population',
            type: 'textarea',
            visibleWhen: { field: 'pico_framework_used', operator: 'eq', value: true },
            helpText: 'Target patient population and clinical condition',
          },
          {
            id: 'pico_intervention',
            label: 'PICO — Intervention',
            type: 'textarea',
            visibleWhen: { field: 'pico_framework_used', operator: 'eq', value: true },
            helpText: 'The device or procedure under evaluation',
          },
          {
            id: 'pico_comparison',
            label: 'PICO — Comparison',
            type: 'textarea',
            visibleWhen: { field: 'pico_framework_used', operator: 'eq', value: true },
            helpText: 'Alternative treatments, standard of care, or competing devices',
          },
          {
            id: 'pico_outcome',
            label: 'PICO — Outcome',
            type: 'textarea',
            visibleWhen: { field: 'pico_framework_used', operator: 'eq', value: true },
            helpText: 'Clinical endpoints: safety (adverse events, complications) and performance (efficacy, success rates)',
          },
          {
            id: 'literature_search_strategy',
            label: 'Literature Search Strategy',
            type: 'textarea',
            required: true,
            helpText: 'Describe search terms, Boolean operators, MeSH/EMTREE terms, inclusion/exclusion criteria, and date range',
            validation: { minLength: 50 },
          },
          {
            id: 'databases_searched',
            label: 'Databases Searched',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'pubmed', label: 'PubMed / MEDLINE' },
              { value: 'embase', label: 'Embase' },
              { value: 'cochrane', label: 'Cochrane Library' },
              { value: 'scopus', label: 'Scopus' },
              { value: 'web_of_science', label: 'Web of Science' },
              { value: 'google_scholar', label: 'Google Scholar' },
              { value: 'clinicaltrials_gov', label: 'ClinicalTrials.gov' },
              { value: 'who_ictrp', label: 'WHO ICTRP' },
              { value: 'eudamed', label: 'EUDAMED (when available)' },
            ],
          },
          {
            id: 'search_date_range',
            label: 'Literature Search Date Range',
            type: 'text',
            required: true,
            placeholder: 'e.g. January 2010 — December 2025',
          },
          {
            id: 'search_last_conducted',
            label: 'Date Search Was Last Conducted',
            type: 'date',
            required: true,
            helpText: 'The literature search should be updated before each CER revision',
          },
          {
            id: 'total_articles_identified',
            label: 'Total Articles Identified',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'articles_after_duplicate_removal',
            label: 'Articles After Duplicate Removal',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'articles_after_title_abstract_screening',
            label: 'Articles After Title/Abstract Screening',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'articles_after_full_text_screening',
            label: 'Articles After Full-Text Screening',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'articles_included_after_screening',
            label: 'Total Articles Included in Evaluation',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'articles_pivotal',
            label: 'Number of Pivotal Articles',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Articles directly relevant to the subject or equivalent device that form the core evidence base',
          },
          {
            id: 'articles_supportive',
            label: 'Number of Supportive Articles',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Articles providing background or contextual information (state of the art, benchmarks)',
          },
          {
            id: 'prisma_flow_diagram',
            label: 'PRISMA Flow Diagram Prepared',
            type: 'yes_no',
            helpText: 'Strongly recommended to document the screening and selection process per PRISMA 2020 guidelines',
          },
          {
            id: 'grey_literature_searched',
            label: 'Grey Literature Searched',
            type: 'yes_no',
            helpText: 'Conference proceedings, regulatory reports, registries, device-specific databases — MEDDEV 2.7/1 Rev 4 recommends including non-peer-reviewed sources',
          },
        ],
        issueChecks: [
          {
            id: 'literature_search_fewer_than_2_databases_check',
            condition: { field: 'databases_searched', operator: 'eq', value: ['pubmed'] },
            severity: 'warning',
            title: 'Literature Search < 2 Databases',
            message:
              'MEDDEV 2.7/1 Rev 4 requires a comprehensive literature search. Searching only a single database may miss relevant publications. At minimum, PubMed/MEDLINE and Embase should be searched. Notified Bodies routinely cite single-database searches as a deficiency.',
            reference: 'MEDDEV 2.7/1 Rev 4, Section 8',
          },
        ],
        defaultNext: 'literature_appraisal_method',
      },

      {
        id: 'literature_appraisal_method',
        section: 'literature_appraisal',
        question:
          'Describe the methodology used to appraise the quality and relevance of clinical data from the literature.',
        guidance:
          'Per MEDDEV 2.7/1 Rev 4 Section 9, each piece of clinical data must be appraised for methodological quality (suitability of the study design, statistical methods, and conduct) and scientific relevance (to the subject device\'s intended purpose, target population, and clinical conditions). The appraisal must be documented for each included study. The evaluator should assess study design, sample size, bias, confounding factors, and statistical methods. Each study should be assigned a level of evidence and its contribution to the overall evidence base weighted accordingly. The appraisal criteria must be defined before the appraisal is conducted.',
        fields: [
          {
            id: 'appraisal_method_documented',
            label: 'Appraisal Method Documented',
            type: 'yes_no',
            required: true,
            helpText: 'The appraisal methodology must be defined and documented per MEDDEV 2.7/1 Rev 4 Section 9',
          },
          {
            id: 'appraisal_method',
            label: 'Evidence Appraisal Method',
            type: 'select',
            required: true,
            options: [
              { value: 'oxford_levels', label: 'Oxford Levels of Evidence' },
              { value: 'grade', label: 'GRADE (Grading of Recommendations Assessment)' },
              { value: 'jadad', label: 'Jadad Score (for RCTs)' },
              { value: 'newcastle_ottawa', label: 'Newcastle-Ottawa Scale (for observational studies)' },
              { value: 'rob2', label: 'Cochrane Risk of Bias (RoB 2)' },
              { value: 'robins_i', label: 'ROBINS-I (for non-randomized studies)' },
              { value: 'custom', label: 'Custom Appraisal Framework' },
            ],
          },
          {
            id: 'quality_assessment_criteria',
            label: 'Study Quality Assessment Criteria',
            type: 'textarea',
            required: true,
            helpText: 'Describe the specific criteria and scales used to assess the quality of individual studies (study design, randomization, blinding, sample size, follow-up, statistical analysis)',
          },
          {
            id: 'relevance_assessment',
            label: 'Relevance Assessment Criteria',
            type: 'textarea',
            required: true,
            helpText: 'Describe how relevance to the subject device was assessed: direct relevance (same device), indirect relevance (equivalent device), or contextual relevance (device category)',
          },
          {
            id: 'data_weighting_approach',
            label: 'Data Weighting Approach',
            type: 'textarea',
            required: true,
            helpText: 'Describe how different data sources and studies are weighted in the overall clinical evaluation. Higher-quality, more relevant studies should carry more weight.',
          },
          {
            id: 'bias_assessment',
            label: 'Bias Assessment Conducted',
            type: 'yes_no',
            required: true,
            helpText: 'Assessment of selection bias, performance bias, detection bias, attrition bias, and reporting bias for each included study',
          },
          {
            id: 'number_pivotal_studies',
            label: 'Number of Pivotal Studies',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Studies with the highest relevance and quality forming the core evidence base for the device',
          },
          {
            id: 'number_supportive_studies',
            label: 'Number of Supportive Studies',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'data_extraction_standardized',
            label: 'Standardized Data Extraction Form Used',
            type: 'yes_no',
            helpText: 'Use of a standardized form ensures consistent data extraction across studies',
          },
        ],
        issueChecks: [
          {
            id: 'appraisal_method_not_documented_check',
            condition: { field: 'appraisal_method_documented', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Appraisal Method Not Documented',
            message:
              'The appraisal methodology must be documented per MEDDEV 2.7/1 Rev 4 Section 9. Without a documented appraisal method, the clinical evaluation cannot demonstrate that data quality and relevance were systematically assessed. This is a common deficiency cited by Notified Bodies.',
            reference: 'MEDDEV 2.7/1 Rev 4, Section 9',
          },
        ],
        defaultNext: 'data_analysis',
      },

      {
        id: 'data_analysis',
        section: 'literature_appraisal',
        question:
          'Describe the data analysis and synthesis methodology.',
        guidance:
          'The CER should describe how clinical data from different sources is analyzed and synthesized to reach conclusions on safety and performance per MEDDEV 2.7/1 Rev 4 Section 10. Where appropriate, quantitative methods (meta-analysis) may be used. The analysis should address heterogeneity between studies, publication bias, and the robustness of conclusions. Separate analyses should be conducted for safety and performance endpoints. The analysis must be traceable — each conclusion must be linked to the underlying evidence.',
        fields: [
          {
            id: 'statistical_methods',
            label: 'Statistical Methods for Data Synthesis',
            type: 'textarea',
            required: true,
            helpText: 'Describe the statistical methods used to analyze and synthesize clinical data from different sources',
          },
          {
            id: 'meta_analysis_performed',
            label: 'Meta-Analysis Performed',
            type: 'yes_no',
          },
          {
            id: 'meta_analysis_method',
            label: 'Meta-Analysis Method',
            type: 'select',
            visibleWhen: { field: 'meta_analysis_performed', operator: 'eq', value: true },
            options: [
              { value: 'fixed_effects', label: 'Fixed Effects Model' },
              { value: 'random_effects', label: 'Random Effects Model' },
              { value: 'bayesian', label: 'Bayesian Meta-Analysis' },
            ],
          },
          {
            id: 'heterogeneity_assessment',
            label: 'Heterogeneity Assessment',
            type: 'textarea',
            visibleWhen: { field: 'meta_analysis_performed', operator: 'eq', value: true },
            helpText: 'Describe how heterogeneity between studies was assessed (e.g. I-squared statistic, Cochran Q test)',
          },
          {
            id: 'sensitivity_analysis',
            label: 'Sensitivity Analysis Performed',
            type: 'yes_no',
            helpText: 'To test the robustness of conclusions by excluding individual studies or using different statistical models',
          },
          {
            id: 'publication_bias_assessment',
            label: 'Publication Bias Assessment',
            type: 'yes_no',
            helpText: 'e.g. Funnel plot, Egger\'s test, Begg\'s test',
          },
          {
            id: 'safety_data_summary',
            label: 'Safety Data Summary',
            type: 'textarea',
            required: true,
            helpText: 'Summarize the overall safety profile from all data sources: adverse events, complications, device-related incidents, mortality, reoperation rates',
          },
          {
            id: 'performance_data_summary',
            label: 'Performance/Efficacy Data Summary',
            type: 'textarea',
            required: true,
            helpText: 'Summarize the overall performance and clinical effectiveness from all data sources: primary endpoints, success rates, patient-reported outcomes',
          },
          {
            id: 'data_consistency_assessment',
            label: 'Data Consistency Assessment',
            type: 'textarea',
            helpText: 'Assess whether findings from different data sources (literature, clinical investigations, post-market) are consistent with each other',
          },
        ],
        defaultNext: 'clinical_investigation_detail',
      },

      /* ================================================================ */
      /*  Section 5 — Clinical Investigation Data                         */
      /* ================================================================ */

      {
        id: 'clinical_investigation_detail',
        section: 'clinical_investigation',
        question:
          'Provide details about the clinical investigation(s) for the subject device.',
        guidance:
          'Clinical investigations must be conducted in accordance with ISO 14155:2020 and EU MDR Article 62-82. For Class III and implantable devices, clinical investigation data is generally required per EU MDR Article 61(4) unless the manufacturer can justify reliance on existing clinical data — this justification must be clearly documented and is subject to heightened Notified Body scrutiny. The clinical investigation report must include study design, endpoints, sample size justification, statistical analysis plan, and results. Per MDCG 2021-6, the clinical investigation should be designed to address the specific clinical questions relevant to the CER.',
        fields: [
          {
            id: 'clinical_investigation_type',
            label: 'Clinical Investigation Type',
            type: 'select',
            required: true,
            options: [
              { value: 'pre_market_pivotal', label: 'Pre-Market Pivotal Investigation' },
              { value: 'pre_market_feasibility', label: 'Pre-Market Feasibility/Pilot Study' },
              { value: 'pmcf_study', label: 'PMCF Study (Post-CE Marking)' },
              { value: 'registry_study', label: 'Registry-Based Study' },
              { value: 'real_world_evidence', label: 'Real-World Evidence Study' },
            ],
          },
          {
            id: 'investigation_study_design',
            label: 'Study Design',
            type: 'select',
            required: true,
            options: [
              { value: 'rct', label: 'Randomized Controlled Trial (RCT)' },
              { value: 'non_randomized_controlled', label: 'Non-Randomized Controlled Trial' },
              { value: 'single_arm', label: 'Single-Arm Study (with objective performance criteria)' },
              { value: 'case_control', label: 'Case-Control Study' },
              { value: 'cohort', label: 'Cohort Study (Prospective or Retrospective)' },
              { value: 'case_series', label: 'Case Series' },
              { value: 'cross_sectional', label: 'Cross-Sectional Study' },
            ],
          },
          {
            id: 'investigation_iso_14155_compliant',
            label: 'Investigation Conducted per ISO 14155:2020',
            type: 'yes_no',
            required: true,
            helpText: 'Clinical investigations for CE marking purposes must comply with ISO 14155',
          },
          {
            id: 'investigation_primary_endpoint',
            label: 'Primary Endpoint(s)',
            type: 'textarea',
            required: true,
            helpText: 'Define the primary safety and/or performance endpoint(s) with success criteria',
          },
          {
            id: 'investigation_secondary_endpoints',
            label: 'Secondary Endpoint(s)',
            type: 'textarea',
            helpText: 'List all secondary endpoints and their definitions',
          },
          {
            id: 'investigation_number_subjects',
            label: 'Number of Subjects Enrolled',
            type: 'number',
            required: true,
            validation: { min: 1 },
          },
          {
            id: 'investigation_sample_size_justification',
            label: 'Sample Size Justification',
            type: 'textarea',
            required: true,
            helpText: 'Statistical basis for the sample size, including power calculation, expected effect size, alpha, and dropout rate',
          },
          {
            id: 'investigation_number_sites',
            label: 'Number of Investigational Sites',
            type: 'number',
            validation: { min: 1 },
          },
          {
            id: 'investigation_follow_up_duration',
            label: 'Follow-up Duration (months)',
            type: 'number',
            required: true,
            validation: { min: 0 },
            helpText: 'Duration of clinical follow-up. For implantable devices, long-term follow-up may be required.',
          },
          {
            id: 'investigation_statistical_analysis',
            label: 'Statistical Analysis Plan Summary',
            type: 'textarea',
            required: true,
            helpText: 'Summary of the pre-specified statistical analysis plan, including analysis populations (ITT, PP), handling of missing data, and multiplicity adjustments',
          },
          {
            id: 'investigation_results_summary',
            label: 'Results Summary',
            type: 'textarea',
            required: true,
            helpText: 'Summary of key results including primary endpoint achievement, safety outcomes, and device-related adverse events',
            validation: { minLength: 50 },
          },
          {
            id: 'investigation_adverse_events',
            label: 'Adverse Events Summary',
            type: 'textarea',
            required: true,
            helpText: 'Summary of all adverse events, serious adverse events, and device-related adverse events with rates',
          },
          {
            id: 'investigation_ethics_approval',
            label: 'Ethics Committee/IRB Approval Obtained',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'investigation_competent_authority',
            label: 'Competent Authority Notification/Approval',
            type: 'yes_no',
            helpText: 'Per EU MDR Article 70, clinical investigations in the EU must be notified to the Member State competent authority',
          },
          {
            id: 'investigation_registration',
            label: 'Clinical Investigation Registered',
            type: 'text',
            helpText: 'Registry identifier (e.g. ClinicalTrials.gov NCT number, EUDAMED CIV-ID)',
          },
        ],
        issueChecks: [
          {
            id: 'no_clinical_investigation_class_iii_check',
            condition: { field: 'clinical_investigation_available', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Clinical Investigation Data for Class III / Implantable',
            message:
              'For Class III and implantable devices, EU MDR Article 61(4) generally requires clinical investigation data unless the manufacturer can provide robust justification for reliance on existing clinical data. This justification is subject to heightened scrutiny by Notified Bodies. The absence of clinical investigation data is a critical gap that must be addressed.',
            reference: 'EU MDR Article 61(4); MDCG 2020-6',
          },
        ],
        defaultNext: 'clinical_experience',
      },

      {
        id: 'clinical_experience',
        section: 'clinical_investigation',
        question:
          'Summarize the clinical experience and post-market data for this device.',
        guidance:
          'Post-market clinical data provides real-world evidence on the device\'s safety and performance. Include distribution volumes, complaint rates, vigilance reports, and any field safety corrective actions. High vigilance rates or FSCA occurrences may indicate safety concerns requiring additional analysis. Data from EUDAMED vigilance system should be considered where available. Per EU MDR Article 83-86, the manufacturer must have a post-market surveillance system that collects and evaluates real-world data on the device. This data feeds into the CER as clinical experience per MEDDEV 2.7/1 Rev 4 Section 7.',
        fields: [
          {
            id: 'total_units_distributed',
            label: 'Total Device Units Sold/Distributed',
            type: 'number',
          },
          {
            id: 'distribution_countries',
            label: 'Countries of Distribution',
            type: 'textarea',
            helpText: 'List the countries where the device has been marketed',
          },
          {
            id: 'years_on_market',
            label: 'Years on Market',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'complaint_rate',
            label: 'Complaint Rate',
            type: 'text',
            placeholder: 'e.g. 0.02% per devices distributed',
          },
          {
            id: 'total_complaints',
            label: 'Total Number of Complaints',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'complaint_categories',
            label: 'Main Complaint Categories',
            type: 'textarea',
            helpText: 'Summarize the main types/categories of complaints received and their trends over time',
          },
          {
            id: 'vigilance_reports',
            label: 'Number of Serious Incident Reports Filed',
            type: 'number',
            validation: { min: 0 },
            helpText: 'Vigilance reports / serious incident reports per EU MDR Article 87',
          },
          {
            id: 'field_safety_corrective_actions',
            label: 'Number of Field Safety Corrective Actions (FSCA)',
            type: 'number',
            validation: { min: 0 },
          },
          {
            id: 'fsca_descriptions',
            label: 'FSCA Descriptions',
            type: 'textarea',
            visibleWhen: { field: 'field_safety_corrective_actions', operator: 'gt', value: 0 },
            helpText: 'Describe each FSCA including root cause, corrective actions taken, and effectiveness assessment',
          },
          {
            id: 'trend_reports_conducted',
            label: 'Trend Reports / Signal Detection Conducted',
            type: 'yes_no',
            helpText: 'Per EU MDR Article 88 — systematic detection of trends in incidents that may not be individually reportable',
          },
          {
            id: 'pms_report_reference',
            label: 'PMS Report / PSUR Reference',
            type: 'text',
            helpText: 'Reference to the Post-Market Surveillance Report (Class I) or Periodic Safety Update Report (Class IIa, IIb, III) per EU MDR Article 85-86',
          },
        ],
        issueChecks: [
          {
            id: 'high_vigilance_rate_check',
            condition: { field: 'vigilance_reports', operator: 'gt', value: 10 },
            severity: 'warning',
            title: 'High Number of Vigilance Reports',
            message:
              'The number of serious incident reports may indicate a safety concern. The CER must include a thorough analysis of vigilance data and any corrective actions taken. Trend analysis per EU MDR Article 88 should be performed.',
          },
          {
            id: 'fsca_safety_signal_check',
            condition: { field: 'field_safety_corrective_actions', operator: 'gt', value: 0 },
            severity: 'warning',
            title: 'FSCA Reported — Safety Signal Investigation Required',
            message:
              'Any Field Safety Corrective Action indicates a potential safety issue that must be thoroughly analyzed in the CER. The root cause analysis, corrective actions, and their effectiveness must be documented. The impact on the benefit-risk assessment must be considered.',
            reference: 'EU MDR Article 87-90',
          },
        ],
        defaultNext: 'gspr_checklist',
      },

      /* ================================================================ */
      /*  Section 6 — GSPR Compliance                                     */
      /* ================================================================ */

      {
        id: 'gspr_checklist',
        section: 'gspr_compliance',
        question:
          'Map the clinical evidence to the applicable General Safety and Performance Requirements (GSPRs).',
        guidance:
          'EU MDR Annex I defines the General Safety and Performance Requirements (GSPRs) — the fundamental requirements that all medical devices must meet. The CER must demonstrate that clinical evidence supports conformity with each applicable GSPR. GSPRs are divided into three chapters: Chapter I (General Requirements, GSPRs 1-9), Chapter II (Requirements Regarding Design and Manufacture, GSPRs 10-22), and Chapter III (Requirements Regarding Information Supplied with the Device, GSPR 23). Some GSPRs are addressed through clinical evidence, while others are addressed through design verification, biocompatibility testing (ISO 10993), or other non-clinical evidence. A GSPR checklist mapping each requirement to its supporting evidence is required as part of the technical documentation per EU MDR Annex II Section 4. The clinical evaluation must specifically address GSPRs that can only be verified through clinical data.',
        fields: [
          {
            id: 'gspr_mapping_completed',
            label: 'GSPR Mapping Completed',
            type: 'yes_no',
            required: true,
            helpText: 'Have you mapped clinical evidence to each applicable GSPR in Annex I?',
          },
          {
            id: 'gsprs_requiring_clinical_evidence',
            label: 'GSPRs Requiring Clinical Evidence',
            type: 'textarea',
            required: true,
            helpText: 'List the specific GSPRs (by number) that require clinical data as supporting evidence. Typically includes GSPR 1 (safety/performance), 2 (risk management), 6 (clinical benefits), 8 (performance characteristics).',
          },
          {
            id: 'gsprs_design_verification',
            label: 'GSPRs Addressed by Design Verification',
            type: 'textarea',
            helpText: 'List GSPRs addressed through non-clinical evidence (bench testing, design verification, biocompatibility per ISO 10993)',
          },
          {
            id: 'gsprs_with_gaps',
            label: 'GSPRs with Evidence Gaps',
            type: 'textarea',
            helpText: 'Identify any GSPRs where the clinical evidence is insufficient and describe the plan to address the gap',
          },
          {
            id: 'annex_i_chapter_i_covered',
            label: 'Chapter I (General Requirements) GSPRs 1-9 Addressed',
            type: 'yes_no',
            required: true,
            helpText: 'Includes: general safety/performance (1), risk management (2), acceptability of benefit-risk (3-4), design for performance (5), clinical benefits (6), chemical properties (7), performance characteristics (8), design for safety (9)',
          },
          {
            id: 'annex_i_chapter_ii_covered',
            label: 'Chapter II (Design & Manufacturing) GSPRs 10-22 Addressed',
            type: 'yes_no',
            required: true,
            helpText: 'Includes: chemical/physical/biological properties (10-11), infection (12), substances (13-14), software (15-17), active devices (18-22)',
          },
          {
            id: 'annex_i_chapter_iii_covered',
            label: 'Chapter III (Information Supplied) GSPR 23 Addressed',
            type: 'yes_no',
            required: true,
            helpText: 'Labeling requirements including label, IFU, implant card per Annex I Section 23',
          },
          {
            id: 'gspr_specific_concerns',
            label: 'GSPR-Specific Concerns or Notified Body Questions',
            type: 'textarea',
            helpText: 'Document any specific GSPR-related questions raised by the Notified Body or identified as areas of concern',
          },
        ],
        issueChecks: [
          {
            id: 'no_gspr_compliance_assessment_check',
            condition: { field: 'gspr_mapping_completed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No GSPR Compliance Assessment',
            message:
              'A mapping of clinical evidence to the applicable General Safety and Performance Requirements is required per EU MDR Annex XIV Part A and Annex II Section 4. Without a complete GSPR checklist, the CER cannot demonstrate that the device meets the fundamental safety and performance requirements. This will result in rejection by the Notified Body.',
            reference: 'EU MDR Annex XIV Part A; Annex II Section 4; Annex I',
          },
        ],
        defaultNext: 'common_specifications',
      },

      {
        id: 'common_specifications',
        section: 'gspr_compliance',
        question:
          'Are there any Common Specifications (CS) applicable to this device, and how is conformity demonstrated?',
        guidance:
          'Common Specifications are adopted by the European Commission per EU MDR Article 9 for certain device categories where harmonized standards are insufficient. Where CS exist, manufacturers must comply unless they can justify that their alternative solution provides at least an equivalent level of safety and performance — the burden of proof is on the manufacturer. Deviations from CS require robust justification and will receive heightened Notified Body scrutiny. The conformity assessment route determines the level of Notified Body involvement and the depth of documentation review.',
        fields: [
          {
            id: 'common_specs_applicable',
            label: 'Common Specifications Applicable',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'common_specs_list',
            label: 'Applicable Common Specifications',
            type: 'textarea',
            visibleWhen: { field: 'common_specs_applicable', operator: 'eq', value: true },
            helpText: 'List the applicable Common Specifications by reference number, title, and publication date',
          },
          {
            id: 'cs_conformity_demonstrated',
            label: 'Conformity with CS Demonstrated',
            type: 'yes_no',
            visibleWhen: { field: 'common_specs_applicable', operator: 'eq', value: true },
          },
          {
            id: 'cs_deviations',
            label: 'Deviations from Common Specifications',
            type: 'textarea',
            visibleWhen: { field: 'common_specs_applicable', operator: 'eq', value: true },
            helpText: 'If deviating from any CS, provide justification that the alternative approach provides equivalent safety and performance per EU MDR Article 9(2)',
          },
          {
            id: 'conformity_assessment_route',
            label: 'Conformity Assessment Route',
            type: 'select',
            required: true,
            options: [
              { value: 'annex_ix', label: 'Annex IX — QMS + Technical Documentation Assessment' },
              { value: 'annex_x', label: 'Annex X — Type Examination' },
              { value: 'annex_xi_a', label: 'Annex XI Part A — Production QA' },
              { value: 'annex_xi_b', label: 'Annex XI Part B — Product Verification' },
            ],
            helpText: 'The conformity assessment procedure per EU MDR Article 52 and Annex IX-XI',
          },
          {
            id: 'technical_documentation_structure',
            label: 'Technical Documentation Structure per Annex II',
            type: 'select',
            required: true,
            options: [
              { value: 'sted', label: 'Summary Technical Documentation (STED) Format' },
              { value: 'annex_ii', label: 'EU MDR Annex II Structure' },
              { value: 'custom', label: 'Custom Structure (mapped to Annex II)' },
            ],
          },
        ],
        defaultNext: 'risk_analysis',
      },

      /* ================================================================ */
      /*  Section 7 — Benefit-Risk & PMCF                                 */
      /* ================================================================ */

      {
        id: 'risk_analysis',
        section: 'benefit_risk_pmcf',
        question:
          'Describe the risk management outputs and the benefit-risk determination.',
        guidance:
          'The CER must include an analysis of the overall benefit-risk profile per MEDDEV 2.7/1 Rev 4 Section 10 and EU MDR Annex XIV Part A. This should draw on the risk management file (ISO 14971:2019), identify residual risks, and conclude whether the benefits outweigh the risks in the context of the state of the art. The benefit-risk analysis must consider the severity and probability of each risk, the clinical benefits demonstrated by evidence, and the acceptability of risks in light of the intended purpose and state of the art. Per EU MDR GSPR 1 and 8, the device must achieve the performance intended by the manufacturer and the risks must be acceptable when weighed against the benefits.',
        fields: [
          {
            id: 'risk_management_file_available',
            label: 'Risk Management File Available (ISO 14971)',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'risk_management_standard',
            label: 'Risk Management Standard Applied',
            type: 'select',
            options: [
              { value: 'iso_14971_2019', label: 'ISO 14971:2019' },
              { value: 'iso_14971_2007', label: 'ISO 14971:2007' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'hazard_analysis_summary',
            label: 'Summary of Hazard Analysis',
            type: 'textarea',
            required: true,
            helpText: 'Summarize key hazards identified and their risk control measures, drawn from the risk management file',
          },
          {
            id: 'residual_risks_identified',
            label: 'Residual Risks Identified',
            type: 'textarea',
            required: true,
            helpText: 'List all residual risks after risk control measures have been applied',
          },
          {
            id: 'clinical_risks',
            label: 'Clinical Risks Requiring Clinical Evidence',
            type: 'textarea',
            helpText: 'Identify which risks from the risk management file require clinical data to substantiate their acceptability. These must be addressed by clinical evidence in the CER.',
          },
          {
            id: 'benefit_risk',
            label: 'Overall Benefit-Risk Determination',
            type: 'select',
            required: true,
            options: [
              { value: 'favorable', label: 'Favorable — Benefits clearly outweigh risks' },
              { value: 'acceptable', label: 'Acceptable — Benefits outweigh risks with adequate risk controls' },
              { value: 'unfavorable', label: 'Unfavorable — Risks outweigh benefits' },
              { value: 'indeterminate', label: 'Indeterminate — Insufficient data to conclude' },
            ],
          },
          {
            id: 'benefit_risk_justification',
            label: 'Benefit-Risk Justification',
            type: 'textarea',
            required: true,
            helpText: 'Provide a detailed justification of the benefit-risk conclusion with reference to clinical evidence, state of the art benchmarks, and risk management outputs. Each claimed benefit must be linked to supporting evidence.',
            validation: { minLength: 50 },
          },
          {
            id: 'risk_acceptability_criteria',
            label: 'Risk Acceptability Criteria',
            type: 'textarea',
            helpText: 'Describe the criteria used to determine whether individual and overall residual risks are acceptable in the context of the benefits',
          },
        ],
        issueChecks: [
          {
            id: 'benefit_risk_not_favorable_check',
            condition: { field: 'benefit_risk', operator: 'eq', value: 'unfavorable' },
            severity: 'critical',
            title: 'Benefit-Risk Not Favorable',
            message:
              'An unfavorable benefit-risk ratio will not support CE marking under EU MDR. The device cannot demonstrate conformity with General Safety and Performance Requirements (GSPR 1, 3, 8). Review risk mitigations, consider whether additional clinical data or design modifications could change the determination. An unfavorable conclusion precludes placing the device on the EU market.',
            reference: 'EU MDR Annex I, GSPRs 1, 3, 8',
          },
        ],
        defaultNext: 'cer_conclusions',
      },

      {
        id: 'cer_conclusions',
        section: 'benefit_risk_pmcf',
        question:
          'Summarize the overall CER conclusions and identify any gaps or open items.',
        guidance:
          'The CER conclusion must state whether sufficient clinical evidence exists to demonstrate conformity with the relevant General Safety and Performance Requirements (GSPR) of the EU MDR. Include identified data gaps, needed additional evidence, and the update schedule. Per EU MDR Article 61(11), CERs for implantable and Class III devices must be updated at least annually. For other device classes, updates may be less frequent but must be justified. The conclusion must be clearly traceable to the evidence presented in the CER and must address each claimed clinical benefit and identified risk.',
        fields: [
          {
            id: 'overall_conclusion',
            label: 'Overall Clinical Evaluation Conclusion',
            type: 'textarea',
            required: true,
            helpText: 'State the overall conclusion: does the available clinical evidence demonstrate that the device conforms to the applicable GSPRs for safety and performance?',
            validation: { minLength: 100 },
          },
          {
            id: 'gspr_conformity_confirmed',
            label: 'GSPR Conformity Confirmed by Clinical Evidence',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'all_claimed_benefits_supported',
            label: 'All Claimed Clinical Benefits Supported by Evidence',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'unsupported_claims',
            label: 'Claims Not Fully Supported by Evidence',
            type: 'textarea',
            visibleWhen: { field: 'all_claimed_benefits_supported', operator: 'eq', value: false },
            helpText: 'List any claims that lack sufficient clinical evidence and the plan to address them',
          },
          {
            id: 'data_gaps_identified',
            label: 'Clinical Data Gaps Identified',
            type: 'textarea',
            helpText: 'Describe any gaps in the clinical evidence and how they will be addressed (PMCF, additional studies, ongoing literature review)',
          },
          {
            id: 'cer_update_schedule',
            label: 'CER Update Schedule',
            type: 'select',
            required: true,
            defaultValue: 'annual',
            options: [
              { value: 'annual', label: 'Annual (required for Class III and implantable per Article 61(11))' },
              { value: 'biennial', label: 'Biennial (Class IIa/IIb non-implant — with justification)' },
              { value: 'triennial', label: 'Triennial (low-risk devices — with robust justification)' },
              { value: 'triggered', label: 'Triggered by Significant New Data' },
            ],
          },
          {
            id: 'last_cer_update_date',
            label: 'Date of Last CER Update',
            type: 'date',
          },
          {
            id: 'additional_clinical_evidence_needed',
            label: 'Additional Clinical Evidence Needed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'additional_evidence_plan',
            label: 'Plan to Address Evidence Gaps',
            type: 'textarea',
            visibleWhen: { field: 'additional_clinical_evidence_needed', operator: 'eq', value: true },
            helpText: 'Describe the planned activities to generate additional clinical evidence: PMCF studies, literature updates, registry participation',
          },
          {
            id: 'cer_reviewer_sign_off',
            label: 'CER Reviewed and Approved by Qualified Person',
            type: 'yes_no',
            required: true,
            helpText: 'The CER must be reviewed and approved by the Person Responsible for Regulatory Compliance (PRRC) per EU MDR Article 15',
          },
        ],
        defaultNext: 'pmcf_plan',
      },

      {
        id: 'pmcf_plan',
        section: 'benefit_risk_pmcf',
        question:
          'Describe the Post-Market Clinical Follow-up (PMCF) plan for this device.',
        guidance:
          'EU MDR Article 61(11) and Annex XIV Part B require a PMCF plan for all devices except where duly justified. The PMCF plan must describe how the manufacturer will proactively collect and evaluate clinical data after CE marking to confirm safety and performance throughout the device\'s lifetime, address residual risks, and detect emerging risks. MDCG 2020-7 provides detailed guidance on PMCF plan and PMCF evaluation report content. The PMCF plan should be proportionate to the risk class of the device and must address any gaps identified in the clinical evaluation.',
        fields: [
          {
            id: 'pmcf_plan_established',
            label: 'PMCF Plan Established',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'pmcf_justification_not_needed',
            label: 'Justification for No PMCF (if applicable)',
            type: 'textarea',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: false },
            helpText: 'If no PMCF is planned, provide detailed justification per EU MDR Annex XIV Part B — note that justification must be robust and will be scrutinized by the Notified Body',
          },
          {
            id: 'pmcf_objectives',
            label: 'PMCF Objectives',
            type: 'textarea',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
            helpText: 'Per MDCG 2020-7: confirm safety/performance, identify unknown risks, detect misuse, verify long-term safety, assess rare complications',
          },
          {
            id: 'pmcf_study_type',
            label: 'PMCF Activities Planned',
            type: 'multi_select',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
            options: [
              { value: 'interventional_study', label: 'Interventional PMCF Study' },
              { value: 'observational_study', label: 'Observational PMCF Study' },
              { value: 'registry', label: 'Registry Participation' },
              { value: 'survey', label: 'Surveys / Questionnaires' },
              { value: 'literature_review', label: 'Ongoing Systematic Literature Review' },
              { value: 'complaint_analysis', label: 'Systematic Complaint Analysis' },
              { value: 'real_world_data', label: 'Real-World Data / Electronic Health Records' },
              { value: 'patient_reported_outcomes', label: 'Patient-Reported Outcome Measures (PROMs)' },
            ],
          },
          {
            id: 'pmcf_endpoints',
            label: 'PMCF Study Endpoints',
            type: 'textarea',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
            helpText: 'Primary and secondary endpoints for PMCF data collection, including definitions and success criteria',
          },
          {
            id: 'pmcf_sample_size',
            label: 'Target PMCF Sample Size',
            type: 'number',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
            validation: { min: 1 },
            helpText: 'Include sample size justification (statistical or pragmatic basis)',
          },
          {
            id: 'pmcf_duration',
            label: 'PMCF Duration (months)',
            type: 'number',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
            validation: { min: 1 },
          },
          {
            id: 'pmcf_milestones',
            label: 'PMCF Milestones and Timeline',
            type: 'textarea',
            visibleWhen: { field: 'pmcf_plan_established', operator: 'eq', value: true },
            helpText: 'Key milestones including enrollment targets, interim analyses, reports to Notified Body, and final analysis',
          },
          {
            id: 'pmcf_evaluation_report_available',
            label: 'PMCF Evaluation Report Available',
            type: 'yes_no',
            helpText: 'Has a PMCF Evaluation Report been prepared from previously collected PMCF data? Per MDCG 2020-8.',
          },
          {
            id: 'pms_plan_reference',
            label: 'PMS Plan Reference',
            type: 'text',
            helpText: 'Reference number or title of the Post-Market Surveillance Plan that integrates with this PMCF plan',
          },
        ],
        branches: [
          {
            when: { field: 'pmcf_study_type', operator: 'contains', value: 'interventional_study' },
            goto: 'pmcf_study_design',
          },
          {
            when: { field: 'pmcf_study_type', operator: 'contains', value: 'observational_study' },
            goto: 'pmcf_study_design',
          },
        ],
        issueChecks: [
          {
            id: 'no_pmcf_plan_check',
            condition: { field: 'pmcf_plan_established', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No PMCF Plan',
            message:
              'A Post-Market Clinical Follow-up plan is required per EU MDR Article 61(11) and Annex XIV Part B for all devices unless duly justified. Notified Bodies will not approve the CER without a PMCF plan (or a robust justification for its absence). For Class III and implantable devices, a PMCF plan is always required.',
            reference: 'EU MDR Article 61(11); Annex XIV Part B; MDCG 2020-7',
          },
        ],
        defaultNext: 'evaluator_qualifications',
      },

      {
        id: 'pmcf_study_design',
        section: 'benefit_risk_pmcf',
        question:
          'Provide details on the PMCF study design.',
        guidance:
          'PMCF studies may be interventional (where the device is used in a protocol-defined manner) or observational (where the device is used per routine clinical practice). Interventional PMCF studies must comply with EU MDR Article 74 and ISO 14155:2020. Observational studies should follow applicable national regulations and MDCG 2020-7 recommendations. The study design must be proportionate to the device risk class and the specific PMCF objectives. For Class III and implantable devices, PMCF studies are typically expected to be more rigorous. Per MDCG 2020-7, the PMCF plan should specify the study type, methodology, endpoints, and timelines.',
        fields: [
          {
            id: 'pmcf_study_classification',
            label: 'PMCF Study Classification',
            type: 'select',
            required: true,
            options: [
              { value: 'interventional', label: 'Interventional PMCF Study (Article 74 scope)' },
              { value: 'observational_prospective', label: 'Observational — Prospective' },
              { value: 'observational_retrospective', label: 'Observational — Retrospective' },
              { value: 'mixed_methods', label: 'Mixed Methods' },
            ],
          },
          {
            id: 'pmcf_study_iso_14155',
            label: 'PMCF Study Conducted per ISO 14155:2020',
            type: 'yes_no',
            helpText: 'Interventional PMCF studies within EU MDR Article 74 scope must comply with ISO 14155',
          },
          {
            id: 'pmcf_study_protocol_reference',
            label: 'PMCF Study Protocol Reference',
            type: 'text',
            helpText: 'Protocol identifier or document reference number',
          },
          {
            id: 'pmcf_study_sites',
            label: 'Number of PMCF Study Sites',
            type: 'number',
            validation: { min: 1 },
          },
          {
            id: 'pmcf_study_countries',
            label: 'Countries Where PMCF Study Is Conducted',
            type: 'textarea',
          },
          {
            id: 'pmcf_study_ethics_approval',
            label: 'Ethics Committee Approval Obtained',
            type: 'yes_no',
            helpText: 'Ethics approval is required for interventional PMCF studies and may be required for observational studies depending on national requirements',
          },
          {
            id: 'pmcf_study_competent_authority',
            label: 'Competent Authority Approval/Notification',
            type: 'yes_no',
            helpText: 'Required for interventional PMCF studies per EU MDR Article 70',
          },
          {
            id: 'pmcf_study_data_management',
            label: 'Data Management Plan',
            type: 'textarea',
            helpText: 'Describe the data collection, management, and quality assurance approach (eCRF, monitoring, source data verification)',
          },
          {
            id: 'pmcf_study_interim_results',
            label: 'Interim Results Available',
            type: 'yes_no',
          },
          {
            id: 'pmcf_interim_results_summary',
            label: 'Interim Results Summary',
            type: 'textarea',
            visibleWhen: { field: 'pmcf_study_interim_results', operator: 'eq', value: true },
            helpText: 'Summary of interim analysis results and any safety signals identified',
          },
        ],
        defaultNext: 'evaluator_qualifications',
      },

      /* ================================================================ */
      /*  Section 8 — Evaluator Qualifications                            */
      /* ================================================================ */

      {
        id: 'evaluator_qualifications',
        section: 'evaluator_qual',
        question:
          'Provide the qualifications of the CER evaluator(s).',
        guidance:
          'Per MEDDEV 2.7/1 Rev 4 Section 6 and EU MDR Annex XIV Part A, the CER must be performed by evaluators with sufficient clinical, regulatory, and scientific expertise. Evaluators must have documented professional experience (recommended at least 5 years) in the relevant medical field or device technology. The qualification requirements are based on three domains: (1) knowledge of the device technology and its application, (2) knowledge of the clinical evaluation methodology and regulatory requirements, and (3) knowledge of research methodology including clinical investigation design. Notified Bodies will specifically assess evaluator qualifications during their review and may reject CERs where the evaluator lacks sufficient expertise.',
        fields: [
          {
            id: 'evaluator_name',
            label: 'Lead Evaluator Name',
            type: 'text',
            required: true,
          },
          {
            id: 'evaluator_title',
            label: 'Evaluator Title / Credentials',
            type: 'text',
            required: true,
            helpText: 'e.g. MD, PhD, MSc, Professional Engineer, Clinical Specialist',
          },
          {
            id: 'evaluator_clinical_expertise',
            label: 'Clinical Expertise in Relevant Medical Field',
            type: 'textarea',
            required: true,
            helpText: 'Describe the evaluator\'s clinical experience and expertise relevant to the device\'s intended purpose. Include medical specialty, subspecialty, and clinical practice area.',
            validation: { minLength: 30 },
          },
          {
            id: 'evaluator_years_experience',
            label: 'Years of Relevant Professional Experience',
            type: 'number',
            required: true,
            validation: { min: 0 },
            helpText: 'MEDDEV 2.7/1 Rev 4 Section 6 recommends at least 5 years of documented professional experience',
          },
          {
            id: 'evaluator_regulatory_expertise',
            label: 'Regulatory Expertise',
            type: 'textarea',
            required: true,
            helpText: 'Experience with EU MDR 2017/745, MEDDEV 2.7/1 Rev 4, MDCG guidance, clinical evaluation methodology, conformity assessment procedures',
          },
          {
            id: 'evaluator_scientific_expertise',
            label: 'Scientific Expertise',
            type: 'textarea',
            helpText: 'Research publications, academic appointments, clinical trial experience, systematic review experience',
          },
          {
            id: 'evaluator_device_technology_knowledge',
            label: 'Device Technology Knowledge',
            type: 'textarea',
            required: true,
            helpText: 'Describe the evaluator\'s knowledge of the specific device technology, including hands-on experience, training, or research in the device field',
          },
          {
            id: 'evaluator_cv_attached',
            label: 'Evaluator CV Attached to CER',
            type: 'yes_no',
            required: true,
            helpText: 'A current CV must be included in the CER to demonstrate evaluator qualifications',
          },
          {
            id: 'evaluator_cer_training',
            label: 'Specific CER / Clinical Evaluation Training Completed',
            type: 'yes_no',
            helpText: 'Training on MEDDEV 2.7/1 Rev 4 methodology, systematic literature review, evidence appraisal',
          },
          {
            id: 'additional_evaluators',
            label: 'Additional Evaluators Involved',
            type: 'yes_no',
          },
          {
            id: 'additional_evaluator_details',
            label: 'Additional Evaluator Names and Qualifications',
            type: 'textarea',
            visibleWhen: { field: 'additional_evaluators', operator: 'eq', value: true },
            helpText: 'List all additional evaluators with their names, credentials, and specific contributions to the CER',
          },
        ],
        issueChecks: [
          {
            id: 'evaluator_not_qualified_mdr_check',
            condition: { field: 'evaluator_years_experience', operator: 'lt', value: 5 },
            severity: 'critical',
            title: 'Evaluator Not Qualified per MDR',
            message:
              'MEDDEV 2.7/1 Rev 4 Section 6 requires evaluators to have at least 5 years of documented professional experience in the relevant field. Evaluators with fewer than 5 years of experience may not meet Notified Body expectations and could result in CER rejection. Consider supplementing with an additional evaluator who meets the experience requirements.',
            reference: 'MEDDEV 2.7/1 Rev 4, Section 6; EU MDR Annex XIV Part A',
          },
        ],
        defaultNext: 'evaluator_declaration',
      },

      {
        id: 'evaluator_declaration',
        section: 'evaluator_qual',
        question:
          'Provide the evaluator independence declaration and conflict of interest disclosure.',
        guidance:
          'Per MEDDEV 2.7/1 Rev 4 Section 6 and EU MDR Annex XIV Part A, evaluators must declare their independence and disclose any potential conflicts of interest. The declaration must confirm that the evaluator has no financial or other interest that could bias the clinical evaluation. Internal evaluators (employed by the manufacturer) must disclose this relationship and demonstrate that appropriate measures are in place to ensure objectivity. Notified Bodies pay particular attention to evaluator independence and may request additional evaluators if conflicts are identified.',
        fields: [
          {
            id: 'independence_declaration',
            label: 'Independence Declaration Signed',
            type: 'yes_no',
            required: true,
            helpText: 'Declaration confirming no conflicts of interest with the manufacturer',
          },
          {
            id: 'evaluator_relationship',
            label: 'Evaluator Relationship to Manufacturer',
            type: 'select',
            required: true,
            options: [
              { value: 'external_independent', label: 'External — Fully Independent' },
              { value: 'external_consultant', label: 'External — Retained Consultant' },
              { value: 'internal_employee', label: 'Internal — Manufacturer Employee' },
              { value: 'internal_contracted', label: 'Internal — Contracted to Manufacturer' },
            ],
          },
          {
            id: 'conflict_of_interest',
            label: 'Any Conflicts of Interest Disclosed',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'conflict_details',
            label: 'Conflict of Interest Details',
            type: 'textarea',
            visibleWhen: { field: 'conflict_of_interest', operator: 'eq', value: true },
            helpText: 'Describe all disclosed conflicts and the mitigation measures in place',
          },
          {
            id: 'objectivity_measures',
            label: 'Measures to Ensure Objectivity',
            type: 'textarea',
            helpText: 'For internal evaluators or those with disclosed conflicts, describe the measures in place to ensure objectivity (e.g. peer review, independent oversight, separation of duties)',
          },
          {
            id: 'declaration_date',
            label: 'Date of Independence Declaration',
            type: 'date',
            required: true,
          },
        ],
        issueChecks: [
          {
            id: 'no_independence_declaration_check',
            condition: { field: 'independence_declaration', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Independence Declaration',
            message:
              'Evaluators should provide a signed declaration of independence and disclose any potential conflicts of interest per MEDDEV 2.7/1 Rev 4 Section 6. This is expected by Notified Bodies during the CER review. Absence of a declaration may result in the CER being returned for revision.',
            reference: 'MEDDEV 2.7/1 Rev 4, Section 6',
          },
        ],
        defaultNext: null,
      },
    ],
  };
}
