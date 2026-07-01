/**
 * Advisory Committee Briefing Document flow definition for the AnA
 * Intelligence Questioning system.
 *
 * Guides pharma/biotech sponsors through the preparation of an FDA
 * Advisory Committee Briefing Document — the single most important
 * document a sponsor presents to an advisory committee. Covers meeting
 * context, product overview, nonclinical summary, clinical program,
 * benefit-risk framework, and voting question strategy.
 *
 * 16 nodes, 6 sections, 75+ fields with branching for advisory
 * committee type (ODAC, AADPAC, CDRH panel), pre-approval vs.
 * post-approval meeting purpose, and pediatric-focused meetings.
 *
 * Regulatory foundation: 21 CFR Part 14 (Public Hearing Before the
 * FDA), FDA Guidance "Convening Advisory Committee Meetings" (2023),
 * FDA Guidance "Procedures for Meetings of the FDA Advisory Committees"
 * (2017), and PDUFA VII commitment letter provisions on advisory
 * committee processes.
 *
 * @module server/services/ana/intelligence-questions/flows/briefing-book
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createBriefingBookFlow(): FlowDefinition {
  return {
    id: 'briefing-book-v1',
    category: 'briefing_book',
    name: 'Advisory Committee Briefing Document',
    description:
      'Comprehensive questionnaire for preparing an FDA Advisory Committee Briefing Document covering meeting context, product and indication overview, nonclinical summary, clinical program, benefit-risk framework, and voting question strategy per 21 CFR Part 14 and FDA Advisory Committee guidance.',
    clientTypes: ['pharma', 'biotech'],
    entryNode: 'meeting_context',
    estimatedMinutes: 50,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'meeting_context_section',
        label: 'Meeting Context',
        nodeIds: ['meeting_context', 'meeting_logistics', 'meeting_logistics_postapproval', 'meeting_logistics_pediatric'],
      },
      {
        id: 'product_indication_section',
        label: 'Product & Indication Overview',
        nodeIds: ['product_overview', 'competitive_landscape'],
      },
      {
        id: 'nonclinical_section',
        label: 'Nonclinical Summary',
        nodeIds: ['nonclinical_pharmacology', 'nonclinical_toxicology'],
      },
      {
        id: 'clinical_program_section',
        label: 'Clinical Program Overview',
        nodeIds: ['clinical_development', 'efficacy_data', 'safety_data', 'special_populations'],
      },
      {
        id: 'benefit_risk_section',
        label: 'Benefit-Risk Framework',
        nodeIds: ['benefit_risk_assessment', 'risk_management'],
      },
      {
        id: 'voting_strategy_section',
        label: 'Voting Questions & Strategy',
        nodeIds: ['voting_questions'],
      },
      {
        id: 'presentation_planning_section',
        label: 'Presentation & Post-Meeting Planning',
        nodeIds: ['presentation_strategy', 'post_meeting_planning'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [

      /* ================================================================
       * Section 1 — Meeting Context
       * ================================================================ */

      {
        id: 'meeting_context',
        section: 'Meeting Context',
        question:
          'Let\'s begin the Advisory Committee Briefing Document questionnaire. What type of advisory committee meeting is this, and what is the meeting purpose?',
        guidance:
          'Under 21 CFR Part 14, FDA advisory committees provide independent expert advice on regulatory decisions. The type of committee determines the review division, panel composition, and procedural requirements. FDA Guidance "Convening Advisory Committee Meetings" (2023) describes the criteria the Agency uses to decide whether to convene an advisory committee — sponsors should understand this framework to anticipate whether a meeting is likely. PDUFA VII commitments require FDA to provide sponsors with draft voting questions at least 3 weeks before the meeting and to share the FDA briefing document at least 2 business days before.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'committee_type',
            label: 'Advisory Committee',
            type: 'select',
            required: true,
            options: [
              {
                value: 'odac',
                label: 'ODAC — Oncologic Drugs Advisory Committee',
                description: 'Reviews oncology drug applications; managed by CDER\'s Office of Oncologic Diseases.',
              },
              {
                value: 'aadpac',
                label: 'AADPAC — Anesthetic and Analgesic Drug Products Advisory Committee',
                description: 'Reviews anesthetics, analgesics, and addiction medicine products.',
              },
              {
                value: 'cdrh_panel',
                label: 'CDRH Panel — Medical Devices Advisory Committee Panel',
                description: 'Various device panels (Orthopedic, Cardiovascular, Neurological, etc.) under CDRH.',
              },
              {
                value: 'aac',
                label: 'AAC — Antimicrobial Advisory Committee',
                description: 'Reviews anti-infective, antiviral, and antimicrobial drug products.',
              },
              {
                value: 'emdac',
                label: 'EMDAC — Endocrinologic and Metabolic Drugs Advisory Committee',
                description: 'Reviews endocrine and metabolic products including diabetes therapies.',
              },
              {
                value: 'pcns_ac',
                label: 'PCNS-AC — Psychopharmacologic / CNS Drugs Advisory Committee',
                description: 'Reviews psychopharmacologic and central nervous system drugs.',
              },
              {
                value: 'crdac',
                label: 'CRDAC — Cardiovascular and Renal Drugs Advisory Committee',
                description: 'Reviews cardiovascular and renal drug products.',
              },
              {
                value: 'gaac',
                label: 'GAAC — Gastrointestinal Drugs Advisory Committee',
                description: 'Reviews gastrointestinal drug products.',
              },
              {
                value: 'dac',
                label: 'DAC — Dermatologic and Ophthalmic Drugs Advisory Committee',
                description: 'Reviews dermatologic and ophthalmic drug products.',
              },
              {
                value: 'pdac',
                label: 'PDAC — Pulmonary-Allergy Drugs Advisory Committee',
                description: 'Reviews pulmonary and allergy drug products.',
              },
              {
                value: 'arthac',
                label: 'ArthAC — Arthritis Advisory Committee',
                description: 'Reviews drugs for arthritis and related rheumatologic conditions.',
              },
              {
                value: 'vrbpac',
                label: 'VRBPAC — Vaccines and Related Biological Products Advisory Committee',
                description: 'Reviews vaccine products; managed by CBER.',
              },
              {
                value: 'other',
                label: 'Other Advisory Committee',
                description: 'Any other FDA advisory committee or joint committee meeting.',
              },
            ],
          },
          {
            id: 'cdrh_panel_type',
            label: 'CDRH Panel Subtype',
            type: 'select',
            visibleWhen: { field: 'committee_type', operator: 'eq', value: 'cdrh_panel' },
            options: [
              { value: 'ortho', label: 'Orthopedic and Rehabilitation Devices Panel' },
              { value: 'cardio', label: 'Circulatory System Devices Panel' },
              { value: 'neuro', label: 'Neurological Devices Panel' },
              { value: 'general_plastic', label: 'General and Plastic Surgery Devices Panel' },
              { value: 'ophthalmic', label: 'Ophthalmic Devices Panel' },
              { value: 'molecular_clinical', label: 'Molecular and Clinical Genetics Panel' },
              { value: 'other_panel', label: 'Other Panel' },
            ],
          },
          {
            id: 'meeting_purpose',
            label: 'Meeting Purpose',
            type: 'select',
            required: true,
            options: [
              {
                value: 'pre_approval',
                label: 'Pre-Approval — Review of pending application',
                description: 'Advisory committee convened to discuss a pending NDA, BLA, or PMA before FDA\'s action date.',
              },
              {
                value: 'post_approval',
                label: 'Post-Approval — Safety or efficacy review',
                description: 'Post-marketing safety signal review, confirmatory trial results, or labeling change.',
              },
              {
                value: 'accelerated_conversion',
                label: 'Accelerated Approval — Confirmatory evidence review',
                description: 'Review of confirmatory trial data for a product granted accelerated approval under 21 CFR 314 Subpart H / 601 Subpart E.',
              },
              {
                value: 'pediatric_focused',
                label: 'Pediatric-Focused — Pediatric study plan or extrapolation review',
                description: 'Meeting focused on pediatric development, extrapolation approaches, or Pediatric Research Equity Act (PREA) requirements.',
              },
              {
                value: 'risk_evaluation',
                label: 'Risk Evaluation — REMS or safety issue',
                description: 'Advisory committee convened to discuss REMS requirements or emerging safety concerns.',
              },
            ],
          },
          {
            id: 'application_type',
            label: 'Application Type',
            type: 'select',
            required: true,
            options: [
              { value: 'nda', label: 'NDA — New Drug Application' },
              { value: 'bla', label: 'BLA — Biologics License Application' },
              { value: 'snda', label: 'sNDA — Supplemental NDA' },
              { value: 'sbla', label: 'sBLA — Supplemental BLA' },
              { value: 'pma', label: 'PMA — Premarket Approval (Device)' },
              { value: 'hde', label: 'HDE — Humanitarian Device Exemption' },
              { value: 'not_application_specific', label: 'Not Application-Specific (safety review, etc.)' },
            ],
          },
          {
            id: 'application_number',
            label: 'Application Number (if assigned)',
            type: 'text',
            placeholder: 'e.g., NDA 214787 or BLA 761222',
            helpText: 'Enter the NDA, BLA, or PMA number if already assigned by FDA.',
          },
          {
            id: 'pdufa_action_date',
            label: 'PDUFA Action Date',
            type: 'date',
            helpText: 'Per PDUFA VII, the advisory committee meeting should be scheduled to allow FDA sufficient time to consider the committee\'s advice before the action date. FDA typically schedules meetings 1-3 months before the PDUFA date.',
            visibleWhen: { field: 'meeting_purpose', operator: 'in', value: ['pre_approval', 'accelerated_conversion'] },
          },
          {
            id: 'meeting_date',
            label: 'Advisory Committee Meeting Date (actual or anticipated)',
            type: 'date',
            required: true,
          },
        ],
        branches: [
          {
            when: { field: 'meeting_purpose', operator: 'eq', value: 'pediatric_focused' },
            goto: 'meeting_logistics_pediatric',
          },
          {
            when: { field: 'meeting_purpose', operator: 'eq', value: 'post_approval' },
            goto: 'meeting_logistics_postapproval',
          },
        ],
        defaultNext: 'meeting_logistics',
      },

      /* ── Meeting Logistics (pre-approval / general) ─────────────────── */

      {
        id: 'meeting_logistics',
        section: 'Meeting Context',
        question:
          'What are the logistical details and procedural considerations for this advisory committee meeting?',
        guidance:
          'Per 21 CFR 14.25, advisory committee meetings are open to the public unless the Commissioner determines that a portion should be closed under 5 USC 552b (Government in the Sunshine Act). The sponsor\'s briefing document is typically due to FDA 4 weeks before the meeting date, and FDA publishes it on the Federal Register at least 2 business days before the meeting per PDUFA VII commitments. The open public hearing (OPH) segment allows external stakeholders (patients, advocacy groups, competitors) to present, which can significantly influence committee votes.',
        fields: [
          {
            id: 'briefing_doc_due_date',
            label: 'Sponsor Briefing Document Due Date',
            type: 'date',
            required: true,
            helpText: 'Typically 4 weeks before the advisory committee meeting. FDA may request earlier submission.',
          },
          {
            id: 'fda_questions_received',
            label: 'Has FDA shared draft voting questions or discussion topics?',
            type: 'yes_no',
            required: true,
            helpText: 'Per PDUFA VII, FDA commits to providing sponsors with draft voting/discussion questions at least 3 weeks before the meeting.',
          },
          {
            id: 'fda_draft_questions_text',
            label: 'FDA Draft Questions (paste or summarize)',
            type: 'textarea',
            visibleWhen: { field: 'fda_questions_received', operator: 'eq', value: true },
            placeholder: 'Enter the draft voting and discussion questions provided by FDA...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'sponsor_presentation_time',
            label: 'Anticipated Sponsor Presentation Time (minutes)',
            type: 'number',
            placeholder: '60',
            helpText: 'Sponsor presentations typically range from 45 to 90 minutes, depending on the complexity of the application.',
            validation: { min: 15, max: 180 },
          },
          {
            id: 'key_presenters',
            label: 'Key Sponsor Presenters',
            type: 'textarea',
            placeholder: 'List the presenters and their roles (e.g., Lead clinician, biostatistician, safety medical officer, CMO)...',
            required: true,
            validation: { minLength: 10, maxLength: 3000 },
          },
          {
            id: 'open_public_hearing_speakers',
            label: 'Are patient advocacy groups or other speakers expected at the Open Public Hearing?',
            type: 'yes_no',
            helpText: 'Patient and advocacy organization testimony during the OPH can influence committee voting. Sponsors often coordinate (but cannot script) patient advocates.',
          },
          {
            id: 'oph_speaker_details',
            label: 'OPH Speaker Details',
            type: 'textarea',
            visibleWhen: { field: 'open_public_hearing_speakers', operator: 'eq', value: true },
            placeholder: 'Describe expected OPH speakers and their perspectives...',
          },
          {
            id: 'committee_roster_reviewed',
            label: 'Has the committee roster been reviewed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'known_coi_concerns',
            label: 'Any known conflict-of-interest concerns among committee members?',
            type: 'textarea',
            placeholder: 'Describe any known COIs that may lead to recusals or waivers per 18 USC 208(b)(3)...',
          },
          {
            id: 'prior_similar_votes',
            label: 'Has this committee voted on a similar product or class in the past 5 years?',
            type: 'yes_no',
          },
          {
            id: 'prior_vote_details',
            label: 'Prior Vote Details',
            type: 'textarea',
            visibleWhen: { field: 'prior_similar_votes', operator: 'eq', value: true },
            placeholder: 'Describe the prior vote: product name, vote outcome (e.g., 8Y-4N), key concerns raised, and how your product addresses them...',
            validation: { maxLength: 3000 },
          },
        ],
        issueChecks: [
          {
            id: 'fda_questions_not_received',
            condition: { field: 'fda_questions_received', operator: 'eq', value: false },
            severity: 'warning',
            title: 'FDA Draft Questions Not Yet Received',
            message:
              'Per PDUFA VII, FDA commits to providing draft voting/discussion questions at least 3 weeks before the advisory committee meeting. If you have not received them, follow up with the review division promptly — the briefing document should be structured to anticipate and address the voting questions.',
            reference: 'PDUFA VII commitment letter; 21 CFR 14.22(d)',
          },
        ],
        defaultNext: 'product_overview',
      },

      /* ── Meeting Logistics — Post-Approval Branch ───────────────────── */

      {
        id: 'meeting_logistics_postapproval',
        section: 'Meeting Context',
        question:
          'For this post-approval advisory committee meeting, what is the specific safety or efficacy concern driving the review?',
        guidance:
          'Post-approval advisory committee meetings are typically convened when FDA identifies a significant safety signal, a confirmatory trial fails to verify clinical benefit, or there is a need to re-evaluate the benefit-risk balance. Under 21 CFR 14.1(b), FDA may convene an advisory committee at any time to obtain expert advice. For accelerated approval products, FDORA (2022) strengthened FDA\'s authority to require post-marketing studies and to initiate withdrawal proceedings if confirmatory trials are not conducted with due diligence.',
        fields: [
          {
            id: 'post_approval_trigger',
            label: 'What triggered this post-approval advisory committee meeting?',
            type: 'select',
            required: true,
            options: [
              { value: 'safety_signal', label: 'New safety signal or adverse event reports' },
              { value: 'confirmatory_failure', label: 'Confirmatory trial did not verify clinical benefit' },
              { value: 'label_change', label: 'Proposed major labeling change' },
              { value: 'rems_modification', label: 'REMS modification or assessment' },
              { value: 'class_wide_review', label: 'Class-wide safety review' },
              { value: 'fda_initiated', label: 'FDA-initiated benefit-risk re-evaluation' },
            ],
          },
          {
            id: 'years_on_market',
            label: 'Years on Market',
            type: 'number',
            placeholder: 'e.g., 3',
            validation: { min: 0, max: 50 },
          },
          {
            id: 'post_market_safety_data_summary',
            label: 'Summary of Post-Marketing Safety Data',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the post-marketing safety experience including FAERS data, PSUR/PBRER findings, and any signals of concern...',
            validation: { minLength: 50, maxLength: 5000 },
          },
          {
            id: 'current_label_warnings',
            label: 'Current Label Warnings & Precautions (relevant sections)',
            type: 'textarea',
            placeholder: 'Summarize the current Boxed Warning, Warnings and Precautions, and any Contraindications relevant to the safety concern...',
          },
          {
            id: 'estimated_patient_exposure',
            label: 'Estimated Cumulative Patient Exposure Post-Approval',
            type: 'text',
            placeholder: 'e.g., 500,000 patients treated worldwide',
            helpText: 'Post-marketing exposure estimates help contextualize the reporting rate of safety signals.',
          },
        ],
        defaultNext: 'product_overview',
      },

      /* ── Meeting Logistics — Pediatric-Focused Branch ───────────────── */

      {
        id: 'meeting_logistics_pediatric',
        section: 'Meeting Context',
        question:
          'For this pediatric-focused advisory committee meeting, what is the pediatric development context?',
        guidance:
          'Pediatric advisory committee meetings are governed by the Pediatric Research Equity Act (PREA, 21 USC 355c) and the Best Pharmaceuticals for Children Act (BPCA, 21 USC 355a). Per PREA, sponsors must submit pediatric study plans (iPSPs) and conduct studies in all relevant pediatric age groups unless granted a waiver or deferral. FDA Guidance "Pediatric Study Plans: Content of and Process for Submitting Initial Pediatric Study Plans and Agreed Initial Pediatric Study Plans" (2020) outlines the requirements. Extrapolation of efficacy from adult data (per FDA Guidance "Leveraging Existing Clinical Data for Extrapolation to Pediatric Uses," 2022) is a key discussion topic at many pediatric advisory committees.',
        fields: [
          {
            id: 'pediatric_age_groups',
            label: 'Pediatric Age Groups Under Discussion',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'neonates', label: 'Neonates (birth to < 28 days)' },
              { value: 'infants', label: 'Infants (28 days to < 24 months)' },
              { value: 'children_2_11', label: 'Children (2 to < 12 years)' },
              { value: 'adolescents', label: 'Adolescents (12 to < 17 years)' },
            ],
          },
          {
            id: 'extrapolation_approach',
            label: 'Is efficacy extrapolation from adult data being proposed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'extrapolation_justification',
            label: 'Extrapolation Justification',
            type: 'textarea',
            visibleWhen: { field: 'extrapolation_approach', operator: 'eq', value: true },
            placeholder: 'Describe the scientific basis for extrapolation: similar disease, similar drug response, exposure-response relationship...',
            validation: { minLength: 50, maxLength: 5000 },
          },
          {
            id: 'pediatric_formulation',
            label: 'Is an age-appropriate formulation available?',
            type: 'yes_no',
            helpText: 'FDA expects sponsors to develop age-appropriate formulations for each target age group. Lack of a suitable formulation can complicate pediatric development.',
          },
          {
            id: 'prea_status',
            label: 'PREA Status',
            type: 'select',
            required: true,
            options: [
              { value: 'ipsp_agreed', label: 'iPSP agreed with FDA' },
              { value: 'ipsp_submitted', label: 'iPSP submitted, not yet agreed' },
              { value: 'deferral_granted', label: 'Pediatric study deferral granted' },
              { value: 'waiver_granted', label: 'Full or partial waiver granted' },
              { value: 'studies_complete', label: 'Pediatric studies completed' },
            ],
          },
        ],
        defaultNext: 'product_overview',
      },

      /* ================================================================
       * Section 2 — Product & Indication Overview
       * ================================================================ */

      {
        id: 'product_overview',
        section: 'Product & Indication Overview',
        question:
          'Provide an overview of the product and its proposed indication for the briefing document.',
        guidance:
          'The product overview section of the briefing document should concisely describe the mechanism of action, pharmacologic class, proposed indication, and where the product fits in the current treatment landscape. Advisory committee members need sufficient background to evaluate benefit-risk — many may not be specialists in the specific disease area. Per 21 CFR Part 14 and FDA advisory committee procedures, the briefing document should clearly articulate the unmet medical need and the clinical rationale for the product.',
        fields: [
          {
            id: 'product_name_generic',
            label: 'Generic (INN) Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., Pembrolizumab',
          },
          {
            id: 'product_name_trade',
            label: 'Proposed Trade Name',
            type: 'text',
            placeholder: 'e.g., Keytruda',
          },
          {
            id: 'product_class',
            label: 'Pharmacologic / Product Class',
            type: 'text',
            required: true,
            placeholder: 'e.g., PD-1 blocking antibody, selective serotonin reuptake inhibitor',
          },
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action (brief)',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the mechanism of action in 2-3 sentences for a general scientific audience...',
            validation: { minLength: 20, maxLength: 2000 },
          },
          {
            id: 'proposed_indication',
            label: 'Proposed Indication Statement',
            type: 'textarea',
            required: true,
            placeholder: 'e.g., For the treatment of adult patients with unresectable or metastatic melanoma...',
            validation: { minLength: 20, maxLength: 2000 },
          },
          {
            id: 'dosage_form_route',
            label: 'Dosage Form and Route of Administration',
            type: 'text',
            required: true,
            placeholder: 'e.g., 200 mg IV infusion every 3 weeks',
          },
          {
            id: 'unmet_medical_need',
            label: 'Unmet Medical Need',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the current treatment landscape gaps, limitations of existing therapies, and the clinical need this product addresses...',
            validation: { minLength: 50, maxLength: 3000 },
          },
          {
            id: 'disease_background',
            label: 'Disease Background & Epidemiology',
            type: 'textarea',
            required: true,
            placeholder: 'Incidence, prevalence, natural history, mortality/morbidity, affected populations...',
            validation: { minLength: 50, maxLength: 5000 },
          },
          {
            id: 'regulatory_designations',
            label: 'Regulatory Designations',
            type: 'multi_select',
            options: [
              { value: 'breakthrough', label: 'Breakthrough Therapy' },
              { value: 'fast_track', label: 'Fast Track' },
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'accelerated_approval', label: 'Accelerated Approval' },
              { value: 'orphan_drug', label: 'Orphan Drug Designation' },
              { value: 'rmat', label: 'RMAT — Regenerative Medicine Advanced Therapy' },
              { value: 'qidp', label: 'QIDP — Qualified Infectious Disease Product' },
              { value: 'none', label: 'No Special Designations' },
            ],
          },
        ],
        defaultNext: 'competitive_landscape',
      },

      /* ── Competitive Landscape ──────────────────────────────────────── */

      {
        id: 'competitive_landscape',
        section: 'Product & Indication Overview',
        question:
          'Describe the competitive landscape and how this product is differentiated from existing and emerging therapies.',
        guidance:
          'Advisory committee members will compare your product against available alternatives. The briefing document should include a clear comparison table showing approved therapies, their efficacy and safety profiles, and where your product offers improvement. Per FDA advisory committee best practices, a strong competitive landscape section anticipates the "why do we need another [drug class]?" question that committees frequently ask. Include both approved and late-stage pipeline competitors.',
        fields: [
          {
            id: 'approved_therapies',
            label: 'Currently Approved Therapies for this Indication',
            type: 'textarea',
            required: true,
            placeholder: 'List approved therapies, their efficacy benchmarks, and key limitations...',
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'pipeline_competitors',
            label: 'Late-Stage Pipeline Competitors',
            type: 'textarea',
            placeholder: 'Describe any Phase 3 or filed competitors that the committee may be aware of...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'differentiation_summary',
            label: 'Key Differentiators',
            type: 'textarea',
            required: true,
            placeholder: 'How is this product differentiated? Consider efficacy, safety, dosing convenience, mechanism, patient subgroups...',
            validation: { minLength: 30, maxLength: 3000 },
          },
          {
            id: 'treatment_guidelines',
            label: 'Relevant Treatment Guidelines',
            type: 'textarea',
            placeholder: 'List relevant NCCN, AHA/ACC, IDSA, or other society guidelines and where this product would fit...',
            validation: { maxLength: 3000 },
          },
        ],
        issueChecks: [
          {
            id: 'incomplete_competitive_landscape',
            condition: { field: 'approved_therapies', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'Incomplete Competitive Landscape',
            message:
              'Advisory committee members will expect a thorough comparison against approved alternatives. Failing to present the competitive landscape risks appearing to avoid unfavorable comparisons and undermines credibility with the committee.',
            reference: 'FDA Guidance "Procedures for Meetings of the FDA Advisory Committees" (2017)',
          },
        ],
        defaultNext: 'nonclinical_pharmacology',
      },

      /* ================================================================
       * Section 3 — Nonclinical Summary
       * ================================================================ */

      {
        id: 'nonclinical_pharmacology',
        section: 'Nonclinical Summary',
        question:
          'Summarize the nonclinical pharmacology and pharmacokinetics data to be presented in the briefing document.',
        guidance:
          'The nonclinical section of an advisory committee briefing document is typically concise — committee members focus primarily on clinical data. However, key nonclinical findings that inform clinical safety (e.g., carcinogenicity signals, reproductive toxicity, off-target pharmacology) must be highlighted because committee members will ask about them. Per ICH M4S, the nonclinical overview should be organized by primary pharmacodynamics, secondary pharmacodynamics, safety pharmacology, pharmacokinetics, and toxicology.',
        fields: [
          {
            id: 'primary_pharmacodynamics',
            label: 'Primary Pharmacodynamic Findings',
            type: 'textarea',
            required: true,
            placeholder: 'Summarize key in vitro and in vivo pharmacology studies demonstrating mechanism and efficacy...',
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'safety_pharmacology',
            label: 'Safety Pharmacology Findings',
            type: 'textarea',
            placeholder: 'Summarize cardiovascular (hERG, telemetry), CNS, respiratory safety pharmacology results...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'nonclinical_pk',
            label: 'Nonclinical Pharmacokinetics Summary',
            type: 'textarea',
            placeholder: 'ADME characteristics, species comparisons, human-relevant exposures...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'nonclinical_findings_clinical_relevance',
            label: 'Are there nonclinical findings with potential clinical relevance?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'nonclinical_findings_details',
            label: 'Clinically Relevant Nonclinical Findings',
            type: 'textarea',
            visibleWhen: { field: 'nonclinical_findings_clinical_relevance', operator: 'eq', value: true },
            placeholder: 'Describe findings and their clinical implications (e.g., target organ toxicity, carcinogenicity signals, reproductive effects)...',
            validation: { minLength: 30, maxLength: 5000 },
          },
        ],
        defaultNext: 'nonclinical_toxicology',
      },

      /* ── Nonclinical Toxicology ─────────────────────────────────────── */

      {
        id: 'nonclinical_toxicology',
        section: 'Nonclinical Summary',
        question:
          'Summarize the toxicology program findings relevant to the briefing document.',
        guidance:
          'Per ICH S9 (nonclinical evaluation of anticancer pharmaceuticals) and ICH M3(R2) (nonclinical safety studies), the toxicology summary should focus on findings that translate to clinical safety monitoring requirements. Advisory committees pay particular attention to carcinogenicity study results (ICH S1A/S1B), reproductive and developmental toxicity (ICH S5(R3)), and genotoxicity (ICH S2(R1)). Highlight the safety margins (exposure multiples at NOAEL vs. clinical exposure) for all key toxicity findings.',
        fields: [
          {
            id: 'repeat_dose_tox_summary',
            label: 'Repeat-Dose Toxicity Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Key findings from repeat-dose studies: target organs, NOAELs, exposure margins vs. clinical dose...',
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'carcinogenicity_status',
            label: 'Carcinogenicity Assessment Status',
            type: 'select',
            required: true,
            options: [
              { value: 'studies_complete_negative', label: 'Studies completed — no carcinogenic signal' },
              { value: 'studies_complete_positive', label: 'Studies completed — carcinogenic signal identified' },
              { value: 'studies_ongoing', label: 'Studies ongoing (results not yet available)' },
              { value: 'waiver_granted', label: 'Waiver granted by FDA' },
              { value: 'not_required', label: 'Not required (e.g., ICH S9 for anticancer agents)' },
            ],
          },
          {
            id: 'reproductive_tox_summary',
            label: 'Reproductive & Developmental Toxicity',
            type: 'textarea',
            placeholder: 'Summarize fertility, embryo-fetal development, and pre-/post-natal development study findings...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'genotoxicity_summary',
            label: 'Genotoxicity Battery Results',
            type: 'textarea',
            placeholder: 'Ames test, in vitro chromosomal aberration, in vivo micronucleus — results summary...',
            validation: { maxLength: 3000 },
          },
        ],
        defaultNext: 'clinical_development',
      },

      /* ================================================================
       * Section 4 — Clinical Program Overview
       * ================================================================ */

      {
        id: 'clinical_development',
        section: 'Clinical Program Overview',
        question:
          'Provide an overview of the clinical development program supporting this application.',
        guidance:
          'The clinical program overview is the backbone of the briefing document. Advisory committee members need to understand the breadth of clinical evidence, the study designs, and how the program addresses the benefit-risk questions. Per ICH E1A (population exposure), the size and duration of the safety database should be justified. FDA\'s Guidance "Integrated Summary of Effectiveness" (1988, still current) describes how to organize clinical evidence. Include a clinical development program timeline/schematic — this visual aid is highly valued by committee members.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'total_patients_exposed',
            label: 'Total Number of Patients Exposed to Drug',
            type: 'number',
            required: true,
            helpText: 'Per ICH E1A, at least 1,500 patients should be exposed for non-life-threatening conditions, with 300-600 for 6 months and 100 for 12 months.',
            validation: { min: 1 },
          },
          {
            id: 'num_pivotal_trials',
            label: 'Number of Pivotal Trials',
            type: 'number',
            required: true,
            validation: { min: 1, max: 20 },
          },
          {
            id: 'pivotal_trial_designs',
            label: 'Pivotal Trial Design(s)',
            type: 'textarea',
            required: true,
            placeholder: 'For each pivotal trial: study design (randomized, double-blind, etc.), comparator, primary endpoint, sample size, key inclusion/exclusion criteria...',
            validation: { minLength: 50, maxLength: 10000 },
          },
          {
            id: 'supportive_trial_summary',
            label: 'Supportive Studies Summary',
            type: 'textarea',
            placeholder: 'Describe Phase 1, Phase 2, dose-finding, and other supportive studies...',
            validation: { maxLength: 10000 },
          },
          {
            id: 'primary_endpoint_type',
            label: 'Primary Endpoint Category',
            type: 'select',
            required: true,
            options: [
              { value: 'clinical_outcome', label: 'Clinical Outcome (e.g., overall survival, event-free survival)' },
              { value: 'surrogate_validated', label: 'Validated Surrogate Endpoint (e.g., HbA1c, blood pressure)' },
              { value: 'surrogate_reasonably_likely', label: 'Reasonably Likely Surrogate (for accelerated approval, e.g., ORR, pCR)' },
              { value: 'patient_reported', label: 'Patient-Reported Outcome (PRO)' },
              { value: 'composite', label: 'Composite Endpoint' },
            ],
          },
          {
            id: 'statistical_analysis_approach',
            label: 'Statistical Analysis Approach',
            type: 'textarea',
            placeholder: 'Describe the primary statistical methods, multiplicity adjustments, interim analyses, and alpha allocation strategy...',
            validation: { maxLength: 5000 },
          },
        ],
        defaultNext: 'efficacy_data',
      },

      /* ── Efficacy Data ──────────────────────────────────────────────── */

      {
        id: 'efficacy_data',
        section: 'Clinical Program Overview',
        question:
          'Summarize the efficacy results from the clinical program.',
        guidance:
          'Present efficacy results clearly and transparently — advisory committees respond negatively to perceived "spin." Per FDA Guidance "Integrated Summary of Effectiveness," results should be presented by study, with the primary analysis first, followed by sensitivity analyses and subgroup analyses. Forest plots of subgroup effects are expected. Present the primary endpoint results with exact p-values and confidence intervals — do not simply state "statistically significant." If the product received Breakthrough Therapy designation, explain how the efficacy data met the "substantial improvement" threshold.',
        fields: [
          {
            id: 'primary_efficacy_results',
            label: 'Primary Endpoint Results',
            type: 'textarea',
            required: true,
            placeholder: 'For each pivotal trial: treatment effect (HR, OR, mean difference), 95% CI, p-value, clinical significance...',
            validation: { minLength: 50, maxLength: 10000 },
          },
          {
            id: 'secondary_endpoint_results',
            label: 'Key Secondary Endpoint Results',
            type: 'textarea',
            placeholder: 'Summarize results for key secondary and exploratory endpoints...',
            validation: { maxLength: 10000 },
          },
          {
            id: 'subgroup_analyses_performed',
            label: 'Were pre-specified subgroup analyses performed?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'subgroup_analysis_results',
            label: 'Subgroup Analysis Results',
            type: 'textarea',
            visibleWhen: { field: 'subgroup_analyses_performed', operator: 'eq', value: true },
            placeholder: 'Describe subgroup analyses: age, sex, race/ethnicity, disease severity, biomarker status, geographic region. Note any subgroups with inconsistent treatment effects...',
            validation: { minLength: 30, maxLength: 10000 },
          },
          {
            id: 'duration_of_response',
            label: 'Duration of Response / Durability Data',
            type: 'textarea',
            placeholder: 'Median duration of response, Kaplan-Meier curves, landmark analyses...',
            validation: { maxLength: 5000 },
          },
        ],
        issueChecks: [
          {
            id: 'missing_subgroup_efficacy_data',
            condition: { field: 'subgroup_analyses_performed', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Missing Subgroup Efficacy Data',
            message:
              'Advisory committees expect pre-specified subgroup efficacy analyses (age, sex, race/ethnicity, disease severity, biomarker status). Missing subgroup data will raise concerns about generalizability and may prompt unfavorable questions. FDA reviewers routinely include forest plots of subgroup effects in their briefing documents.',
            reference: 'ICH E9 "Statistical Principles for Clinical Trials"; FDA Guidance "Evaluation of Sex-Specific Data in Medical Device Clinical Studies" (2014)',
          },
        ],
        defaultNext: 'safety_data',
      },

      /* ── Safety Data ────────────────────────────────────────────────── */

      {
        id: 'safety_data',
        section: 'Clinical Program Overview',
        question:
          'Summarize the safety data from the clinical program.',
        guidance:
          'The safety presentation is often the most scrutinized section of the briefing document. Per ICH E2E (pharmacovigilance planning), present the safety database size, exposure duration, and completeness. Organize by common adverse events, serious adverse events (SAEs), adverse events leading to discontinuation, deaths, and adverse events of special interest (AESIs). FDA expects exposure-adjusted incidence rates for fair comparisons. FDA Guidance "Premarketing Risk Assessment" (2005) outlines expectations for safety database size and duration. Advisory committees frequently ask about specific organ system toxicities, dose-response relationships for adverse events, and events observed only at higher doses or with longer exposure.',
        provideExpertFeedback: true,
        fields: [
          {
            id: 'safety_database_size',
            label: 'Safety Database Size',
            type: 'textarea',
            required: true,
            placeholder: 'Number of patients exposed by dose level and duration (e.g., 1,500 patients at proposed dose, 600 for >= 6 months, 100 for >= 12 months per ICH E1A)...',
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'common_aes',
            label: 'Most Common Adverse Events (>= 5%)',
            type: 'textarea',
            required: true,
            placeholder: 'List the most common AEs with incidence rates in treatment vs. comparator arms...',
            validation: { minLength: 30, maxLength: 10000 },
          },
          {
            id: 'serious_aes',
            label: 'Serious Adverse Events Summary',
            type: 'textarea',
            required: true,
            placeholder: 'SAE types, incidence rates, causality assessments, outcomes...',
            validation: { minLength: 30, maxLength: 10000 },
          },
          {
            id: 'deaths_summary',
            label: 'Deaths in Clinical Program',
            type: 'textarea',
            required: true,
            placeholder: 'Number of deaths by treatment arm, causes, relationship to study drug, narratives for drug-related deaths...',
            validation: { minLength: 10, maxLength: 10000 },
          },
          {
            id: 'aes_leading_to_discontinuation',
            label: 'Adverse Events Leading to Discontinuation',
            type: 'textarea',
            placeholder: 'Types and rates of AEs leading to treatment discontinuation...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'aesi_identified',
            label: 'Have Adverse Events of Special Interest (AESIs) been identified?',
            type: 'yes_no',
            required: true,
          },
          {
            id: 'aesi_details',
            label: 'AESI Details',
            type: 'textarea',
            visibleWhen: { field: 'aesi_identified', operator: 'eq', value: true },
            placeholder: 'List each AESI with: definition, incidence, time to onset, management strategy, outcome...',
            validation: { minLength: 30, maxLength: 10000 },
          },
          {
            id: 'safety_update_available',
            label: 'Is an updated safety dataset (120-day safety update) available?',
            type: 'yes_no',
            required: true,
            helpText: 'Per 21 CFR 314.50(d)(5)(vi)(b), a 120-day safety update must be submitted 120 days after the NDA/BLA submission date. This updated data should be incorporated into the briefing document if available.',
          },
        ],
        issueChecks: [
          {
            id: 'missing_safety_update',
            condition: { field: 'safety_update_available', operator: 'eq', value: false },
            severity: 'warning',
            title: 'Missing Safety Update',
            message:
              'A 120-day safety update is required per 21 CFR 314.50(d)(5)(vi)(b) and should be incorporated into the briefing document. Advisory committees expect the most current safety data. FDA\'s briefing document will include any additional safety information — presenting outdated data risks a credibility gap.',
            reference: '21 CFR 314.50(d)(5)(vi)(b); PDUFA VII commitment on safety update requirements',
          },
        ],
        defaultNext: 'special_populations',
      },

      /* ── Special Populations ────────────────────────────────────────── */

      {
        id: 'special_populations',
        section: 'Clinical Program Overview',
        question:
          'Describe the data in special populations and any population-specific considerations.',
        guidance:
          'Advisory committees routinely ask about data in special populations per ICH E7 (elderly), ICH E11 (pediatric), and FDA Guidance "Pharmacokinetics in Patients with Impaired Renal/Hepatic Function" (2020). Subgroup analyses by demographic characteristics are expected per 21 CFR 314.50(d)(5)(v). The 2014 FDA Action Plan to Enhance the Collection and Availability of Demographic Subgroup Data requires thorough evaluation of efficacy and safety across age, sex, and race/ethnicity.',
        fields: [
          {
            id: 'elderly_data',
            label: 'Geriatric Population Data (>= 65 years)',
            type: 'textarea',
            placeholder: 'Number of elderly patients, efficacy and safety in this subgroup, dosage adjustments...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'pediatric_data',
            label: 'Pediatric Population Data',
            type: 'textarea',
            placeholder: 'Pediatric studies completed or planned, results if available, PREA compliance...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'renal_impairment_data',
            label: 'Renal Impairment Data',
            type: 'textarea',
            placeholder: 'PK/safety data in mild/moderate/severe renal impairment and ESRD...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'hepatic_impairment_data',
            label: 'Hepatic Impairment Data',
            type: 'textarea',
            placeholder: 'PK/safety data in mild (Child-Pugh A), moderate (B), and severe (C) hepatic impairment...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'pregnancy_lactation_data',
            label: 'Pregnancy and Lactation Data',
            type: 'textarea',
            placeholder: 'Available human and animal data, pregnancy registry plans, lactation considerations per FDA PLLR requirements...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'racial_ethnic_diversity',
            label: 'Racial/Ethnic Diversity in Clinical Trials',
            type: 'textarea',
            required: true,
            placeholder: 'Enrollment by race/ethnicity, any differences in efficacy or safety across racial/ethnic subgroups...',
            validation: { minLength: 20, maxLength: 5000 },
            helpText: 'FDA Guidance "Enhancing the Diversity of Clinical Trial Populations" (2020) and FDORA Section 3601 require sponsors to demonstrate diverse enrollment and analyze subgroup effects.',
          },
        ],
        defaultNext: 'benefit_risk_assessment',
      },

      /* ================================================================
       * Section 5 — Benefit-Risk Framework
       * ================================================================ */

      {
        id: 'benefit_risk_assessment',
        section: 'Benefit-Risk Framework',
        question:
          'Present the structured benefit-risk assessment for the advisory committee.',
        guidance:
          'The benefit-risk framework is the centerpiece of the briefing document and directly informs the committee\'s voting. FDA uses the Benefit-Risk Framework described in PDUFA VI and VII commitments, structured around: (1) Analysis of Condition, (2) Current Treatment Options, (3) Benefit, (4) Risk, and (5) Risk Management. The framework is documented in FDA\'s "Benefit-Risk Assessment in Drug Regulatory Decision-Making" (2018). The sponsor\'s benefit-risk assessment should mirror FDA\'s framework to facilitate comparison with FDA\'s own briefing document. A clear, balanced, and transparent benefit-risk summary is critical — committees are skeptical of presentations that appear to minimize risks or overstate benefits.',
        fields: [
          {
            id: 'benefit_summary',
            label: 'Summary of Benefits',
            type: 'textarea',
            required: true,
            placeholder: 'Key efficacy benefits: magnitude and clinical meaningfulness of treatment effect, effect on patient-relevant outcomes, consistency across studies and subgroups...',
            validation: { minLength: 50, maxLength: 10000 },
          },
          {
            id: 'risk_summary',
            label: 'Summary of Risks',
            type: 'textarea',
            required: true,
            placeholder: 'Key safety risks: most clinically significant adverse events, severity, reversibility, risk factors, dose-dependency, long-term concerns...',
            validation: { minLength: 50, maxLength: 10000 },
          },
          {
            id: 'benefit_risk_conclusion',
            label: 'Benefit-Risk Conclusion',
            type: 'textarea',
            required: true,
            placeholder: 'Your overall benefit-risk assessment: why do the benefits outweigh the risks for the proposed indication and population?',
            validation: { minLength: 50, maxLength: 5000 },
          },
          {
            id: 'uncertainties',
            label: 'Key Uncertainties and Data Gaps',
            type: 'textarea',
            required: true,
            placeholder: 'Acknowledge key uncertainties: limited long-term data, small subgroups, surrogate vs. clinical endpoint, potential for off-label use...',
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'has_benefit_risk_table',
            label: 'Have you prepared a structured benefit-risk summary table?',
            type: 'yes_no',
            required: true,
            helpText: 'FDA recommends using the PDUFA Benefit-Risk Framework table format with dimensions: Analysis of Condition, Current Treatment Options, Benefit, Risk, and Risk Management.',
          },
        ],
        issueChecks: [
          {
            id: 'no_clear_benefit_risk_summary',
            condition: { field: 'has_benefit_risk_table', operator: 'eq', value: false },
            severity: 'critical',
            title: 'No Clear Benefit-Risk Summary',
            message:
              'A structured benefit-risk summary table using the PDUFA framework is expected in every advisory committee briefing document. Without it, the committee lacks a clear framework to evaluate the product and FDA\'s own briefing document will include one — creating a gap the committee will notice.',
            reference: 'FDA "Benefit-Risk Assessment in Drug Regulatory Decision-Making" (2018); PDUFA VII commitments',
          },
          {
            id: 'benefit_risk_conclusion_too_short',
            condition: { field: 'benefit_risk_conclusion', operator: 'lt', value: 100 },
            severity: 'warning',
            title: 'Benefit-Risk Conclusion May Be Insufficient',
            message:
              'The benefit-risk conclusion should be a thorough, balanced assessment addressing why benefits outweigh risks. A brief statement may appear dismissive to advisory committee members who are evaluating a nuanced benefit-risk trade-off.',
          },
        ],
        defaultNext: 'risk_management',
      },

      /* ── Risk Management ────────────────────────────────────────────── */

      {
        id: 'risk_management',
        section: 'Benefit-Risk Framework',
        question:
          'Describe the risk management and mitigation strategies to be presented to the advisory committee.',
        guidance:
          'Risk management is the fifth dimension of FDA\'s Benefit-Risk Framework. Per 21 USC 355-1, FDA may require a Risk Evaluation and Mitigation Strategy (REMS) if it determines that a REMS is necessary to ensure the benefits outweigh the risks. Advisory committees frequently vote on whether a REMS should be required. Even if a formal REMS is not proposed, the sponsor should present a comprehensive pharmacovigilance plan, labeling strategies to mitigate risks, and any voluntary risk minimization activities. FDA Guidance "Format and Content of Proposed REMS" (2009, updated 2019) provides the framework.',
        fields: [
          {
            id: 'rems_proposed',
            label: 'Is a REMS proposed or anticipated?',
            type: 'select',
            required: true,
            options: [
              { value: 'proposed_by_sponsor', label: 'Yes — REMS proposed by sponsor' },
              { value: 'requested_by_fda', label: 'Yes — REMS requested by FDA' },
              { value: 'not_proposed', label: 'No — REMS not proposed or required' },
              { value: 'under_discussion', label: 'Under discussion with FDA' },
            ],
          },
          {
            id: 'rems_elements',
            label: 'REMS Elements',
            type: 'multi_select',
            visibleWhen: { field: 'rems_proposed', operator: 'in', value: ['proposed_by_sponsor', 'requested_by_fda', 'under_discussion'] },
            options: [
              { value: 'medication_guide', label: 'Medication Guide' },
              { value: 'communication_plan', label: 'Communication Plan' },
              { value: 'etasu', label: 'Elements to Assure Safe Use (ETASU)' },
              { value: 'implementation_system', label: 'Implementation System' },
              { value: 'timetable_assessment', label: 'Timetable for Assessment' },
            ],
          },
          {
            id: 'pharmacovigilance_plan',
            label: 'Pharmacovigilance Plan Summary',
            type: 'textarea',
            required: true,
            placeholder: 'Describe the post-marketing surveillance strategy: routine pharmacovigilance, enhanced monitoring, signal detection methods, PSUR/PBRER schedule...',
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'post_marketing_studies_planned',
            label: 'Post-Marketing Commitments and Studies Planned',
            type: 'textarea',
            placeholder: 'Describe any planned PMR/PMC studies: long-term safety study, outcomes trial, pediatric studies, specific safety endpoint studies...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'labeling_risk_mitigation',
            label: 'Labeling-Based Risk Mitigation Measures',
            type: 'textarea',
            placeholder: 'Describe proposed Boxed Warning, Contraindications, Warnings and Precautions, or other label-based risk mitigation...',
            validation: { maxLength: 5000 },
          },
        ],
        issueChecks: [
          {
            id: 'no_risk_management_strategy',
            condition: { field: 'pharmacovigilance_plan', operator: 'eq', value: '' },
            severity: 'critical',
            title: 'No Risk Management Strategy',
            message:
              'Every advisory committee briefing document must include a clear risk management and pharmacovigilance strategy. Advisory committees expect to see how the sponsor will monitor and mitigate risks post-approval. This is the fifth dimension of FDA\'s Benefit-Risk Framework and a frequent voting topic.',
            reference: '21 USC 355-1; FDA "Benefit-Risk Assessment in Drug Regulatory Decision-Making" (2018)',
          },
          {
            id: 'no_post_marketing_plan',
            condition: { field: 'post_marketing_studies_planned', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'No Post-Marketing Plan Presented',
            message:
              'Advisory committees frequently ask about planned post-marketing studies, especially for products with limited long-term data, surrogate endpoints, or identified safety signals. Presenting a robust post-marketing plan demonstrates commitment to continued characterization of the product\'s benefit-risk profile.',
            reference: '21 CFR 314.81(b)(2)(vii); FDORA Section 3611 (post-marketing study requirements)',
          },
        ],
        defaultNext: 'voting_questions',
      },

      /* ================================================================
       * Section 6 — Voting Questions & Strategy
       * ================================================================ */

      {
        id: 'voting_questions',
        section: 'Voting Questions & Strategy',
        question:
          'Provide the proposed or anticipated voting questions and discuss how they align with the product\'s label claims.',
        guidance:
          'Voting questions are the most consequential element of the advisory committee meeting. Per 21 CFR 14.22(d), the committee chair is responsible for putting questions to a vote. PDUFA VII commits FDA to providing draft voting/discussion questions to sponsors at least 3 weeks before the meeting. Sponsors typically negotiate the wording with FDA — overly broad questions (e.g., "Do the benefits outweigh the risks?") without specificity to the proposed indication can lead to ambiguous votes. Well-crafted questions should be answerable with "yes" or "no" and directly map to the proposed label claims. Discussion questions (not voted on) are used to explore specific concerns. The voting question wording often predicts the outcome — careful strategic alignment is essential.',
        fields: [
          {
            id: 'voting_questions_text',
            label: 'Proposed Voting Questions',
            type: 'textarea',
            required: true,
            placeholder: 'List each voting question. Example:\n1. Has the applicant provided sufficient evidence of effectiveness of [drug] for [indication]?\n2. Has the applicant provided sufficient evidence of safety of [drug] for [indication]?\n3. Do the benefits of [drug] outweigh its risks for [specific indication in specific population]?',
            validation: { minLength: 30, maxLength: 10000 },
          },
          {
            id: 'discussion_questions_text',
            label: 'Proposed Discussion Questions (not voted on)',
            type: 'textarea',
            placeholder: 'List discussion questions that explore specific issues without requiring a formal vote...',
            validation: { maxLength: 10000 },
          },
          {
            id: 'voting_questions_aligned_with_label',
            label: 'Are the voting questions aligned with the proposed labeling claims?',
            type: 'yes_no',
            required: true,
            helpText: 'Voting questions should directly reflect the proposed indication, population, and dosing regimen in the proposed labeling. Misalignment between voting questions and label claims creates risk.',
          },
          {
            id: 'alignment_concerns',
            label: 'Describe Alignment Concerns',
            type: 'textarea',
            visibleWhen: { field: 'voting_questions_aligned_with_label', operator: 'eq', value: false },
            placeholder: 'What are the specific areas of misalignment between voting questions and proposed label claims?',
            validation: { minLength: 20, maxLength: 5000 },
          },
          {
            id: 'voting_question_scope',
            label: 'Are the voting questions specific enough to the proposed population and indication?',
            type: 'select',
            required: true,
            options: [
              { value: 'specific', label: 'Yes — questions reference specific indication, population, and dosing' },
              { value: 'somewhat_broad', label: 'Somewhat broad — questions could be more specific' },
              { value: 'too_broad', label: 'Too broad — questions do not reference specific population or indication' },
            ],
          },
          {
            id: 'anticipated_vote_outcome',
            label: 'Anticipated Vote Outcome',
            type: 'select',
            options: [
              { value: 'strongly_favorable', label: 'Strongly favorable (> 75% yes expected)' },
              { value: 'moderately_favorable', label: 'Moderately favorable (50-75% yes expected)' },
              { value: 'uncertain', label: 'Uncertain (close vote expected)' },
              { value: 'challenging', label: 'Challenging (< 50% yes expected)' },
            ],
          },
        ],
        issueChecks: [
          {
            id: 'voting_not_aligned_with_label',
            condition: { field: 'voting_questions_aligned_with_label', operator: 'eq', value: false },
            severity: 'critical',
            title: 'Voting Questions Not Aligned with Label Claims',
            message:
              'Misalignment between advisory committee voting questions and proposed labeling claims is a significant strategic risk. If the committee votes favorably on questions that do not match the proposed label, the vote may not support the label claims. Conversely, if questions are broader than the label, an unfavorable vote could undermine an approvable narrower indication. Work with the FDA review team to align question wording with the proposed indication statement.',
            reference: '21 CFR 14.22(d); PDUFA VII advisory committee process commitments',
          },
          {
            id: 'voting_questions_too_broad',
            condition: { field: 'voting_question_scope', operator: 'eq', value: 'too_broad' },
            severity: 'warning',
            title: 'Voting Questions Too Broad',
            message:
              'Overly broad voting questions (e.g., "Do the benefits outweigh the risks?") without reference to the specific indication, population, and dosing regimen create ambiguity. Broad questions make it easier for committee members to vote "no" based on concerns about off-label use, uncharacterized populations, or hypothetical risks. Request more specific question wording from FDA.',
            reference: 'FDA Guidance "Procedures for Meetings of the FDA Advisory Committees" (2017)',
          },
        ],
        defaultNext: 'presentation_strategy',
      },

      /* ── Presentation Strategy ──────────────────────────────────────── */

      {
        id: 'presentation_strategy',
        section: 'Presentation & Post-Meeting Planning',
        question:
          'What is the overall presentation strategy for the advisory committee meeting?',
        guidance:
          'A successful advisory committee presentation requires strategic planning beyond the briefing document content. The sponsor presentation typically includes: opening remarks by the sponsor\'s CMO or VP of Regulatory, a clinical overview by the lead clinician, a safety presentation by the safety medical officer, and a benefit-risk summary. Key Opinion Leaders (KOLs) may present on disease background or interpret clinical data. Mock advisory committee panels ("murder boards") are standard practice — these rehearsals with external experts simulate committee questioning and identify weak points. Per FDA procedure, sponsors may not communicate with committee members outside the meeting, but public domain materials (publications, presentations at medical meetings) can influence member preparation.',
        fields: [
          {
            id: 'mock_adcom_conducted',
            label: 'Has a mock advisory committee panel ("murder board") been conducted?',
            type: 'yes_no',
            required: true,
            helpText: 'Mock advisory committees with external experts (former FDA officials, KOLs, biostatisticians) are critical for rehearsal and identifying vulnerabilities in the presentation.',
          },
          {
            id: 'mock_adcom_findings',
            label: 'Key Findings from Mock Advisory Committee',
            type: 'textarea',
            visibleWhen: { field: 'mock_adcom_conducted', operator: 'eq', value: true },
            placeholder: 'What were the primary concerns raised? What questions were most difficult to answer? What presentation adjustments were recommended?',
            validation: { maxLength: 5000 },
          },
          {
            id: 'anticipated_fda_concerns',
            label: 'Anticipated FDA Concerns in Their Briefing Document',
            type: 'textarea',
            required: true,
            placeholder: 'Based on FDA interactions and review issues, what concerns do you expect FDA to highlight in their briefing document?',
            validation: { minLength: 30, maxLength: 5000 },
          },
          {
            id: 'kol_involvement',
            label: 'Will KOLs participate in the sponsor presentation?',
            type: 'yes_no',
          },
          {
            id: 'kol_details',
            label: 'KOL Presentation Details',
            type: 'textarea',
            visibleWhen: { field: 'kol_involvement', operator: 'eq', value: true },
            placeholder: 'Describe which KOLs will present, their roles, and what they will cover...',
            validation: { maxLength: 3000 },
          },
          {
            id: 'backup_slides_prepared',
            label: 'Have backup slides been prepared for anticipated committee questions?',
            type: 'yes_no',
            helpText: 'Best practice is to prepare 50-100 backup slides covering anticipated questions, subgroup analyses, safety data cuts, and sensitivity analyses.',
          },
          {
            id: 'difficult_questions_preparation',
            label: 'Top 5 Most Difficult Anticipated Questions',
            type: 'textarea',
            required: true,
            placeholder: 'List the 5 most challenging questions the committee is likely to ask and your prepared responses...',
            validation: { minLength: 50, maxLength: 10000 },
          },
        ],
        issueChecks: [
          {
            id: 'no_mock_adcom',
            condition: { field: 'mock_adcom_conducted', operator: 'eq', value: false },
            severity: 'warning',
            title: 'No Mock Advisory Committee Conducted',
            message:
              'Mock advisory committee panels ("murder boards") are considered essential best practice for advisory committee preparation. Without a rehearsal, the sponsor team may be unprepared for challenging committee questions, leading to poor responses that damage credibility. Industry standard is to conduct at least one mock panel 4-6 weeks before the meeting date.',
            reference: 'FDA Guidance "Procedures for Meetings of the FDA Advisory Committees" (2017); industry best practice',
          },
          {
            id: 'no_backup_slides',
            condition: { field: 'backup_slides_prepared', operator: 'eq', value: false },
            severity: 'info',
            title: 'No Backup Slides Prepared',
            message:
              'Best practice is to prepare 50-100 backup slides covering anticipated committee questions, additional subgroup analyses, safety data cuts, and sensitivity analyses. Without backup slides, the sponsor team may be unable to respond to committee questions with data, relying instead on verbal answers that carry less weight.',
          },
        ],
        defaultNext: 'post_meeting_planning',
      },

      /* ── Post-Meeting Planning ──────────────────────────────────────── */

      {
        id: 'post_meeting_planning',
        section: 'Presentation & Post-Meeting Planning',
        question:
          'What are the plans for post-meeting activities and communication?',
        guidance:
          'Advisory committee votes are non-binding per 21 CFR 14.5 — FDA makes the final regulatory decision. However, a negative vote significantly impacts the likelihood of approval and may require additional clinical evidence or label modifications. Post-meeting strategy should address both favorable and unfavorable vote scenarios. Per PDUFA VII, FDA must communicate the advisory committee\'s recommendations and their impact on the review timeline. A post-meeting docket submission (21 CFR 10.30) may be used to provide additional information or correct factual inaccuracies from the meeting. Investor and public communications require careful coordination per SEC regulations.',
        fields: [
          {
            id: 'favorable_vote_plan',
            label: 'Plan if Vote is Favorable',
            type: 'textarea',
            required: true,
            placeholder: 'Post-meeting actions: timeline to PDUFA date, investor communications, launch preparation, KOL engagement...',
            validation: { minLength: 20, maxLength: 5000 },
          },
          {
            id: 'unfavorable_vote_plan',
            label: 'Contingency Plan if Vote is Unfavorable',
            type: 'textarea',
            required: true,
            placeholder: 'Contingency actions: FDA meeting request, additional data generation, label narrowing, docket submission, investor communications...',
            validation: { minLength: 20, maxLength: 5000 },
          },
          {
            id: 'split_vote_plan',
            label: 'Plan for Split Vote (close to 50/50)',
            type: 'textarea',
            placeholder: 'Strategy for a close or split vote: how to interpret committee commentary, whether to submit additional information to the docket...',
            validation: { maxLength: 5000 },
          },
          {
            id: 'docket_submission_planned',
            label: 'Is a post-meeting docket submission planned?',
            type: 'yes_no',
            helpText: 'Per 21 CFR 10.30, sponsors may submit written comments to the meeting docket after the advisory committee meeting. This is often used to address factual corrections or provide additional data.',
          },
          {
            id: 'communications_plan',
            label: 'External Communications Plan',
            type: 'textarea',
            placeholder: 'Describe the plan for press releases, investor calls, medical affairs communications, and social media monitoring around the meeting date...',
            validation: { maxLength: 5000 },
          },
        ],
        defaultNext: null,
        issueChecks: [
          {
            id: 'no_unfavorable_contingency',
            condition: { field: 'unfavorable_vote_plan', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'Missing Contingency Plan for Unfavorable Vote',
            message:
              'A contingency plan for an unfavorable advisory committee vote is essential for investor communications and regulatory strategy. Per SEC Regulation FD, material non-public information about advisory committee outcomes must be disclosed promptly. Companies should have pre-drafted communications for all vote scenarios to ensure timely and accurate public disclosure.',
            reference: '21 CFR 14.5, SEC Regulation FD, FDA PDUFA VII Commitments',
          },
        ],
      },
    ],
  };
}
