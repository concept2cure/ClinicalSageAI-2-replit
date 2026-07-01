/**
 * Project Setup flow definition for the AnA Intelligence Questioning system.
 *
 * Guides users through intelligent project setup that configures the regulatory
 * intelligence platform for their specific product, indication, and submission
 * strategy.
 *
 * ~12 nodes · 50+ fields · 5 sections · 8+ issue checks
 *
 * @module server/services/ana/intelligence-questions/flows/project-setup
 */

import type { FlowDefinition } from '../../../../../shared/types/intelligence-questions.js';

export function createProjectSetupFlow(): FlowDefinition {
  return {
    id: 'project-setup-v1',
    category: 'project_setup',
    name: 'Project Setup',
    description:
      'Intelligent project setup questionnaire that configures the regulatory intelligence platform for your specific product, indication, and submission strategy.',
    clientTypes: [],
    entryNode: 'project_basics',
    estimatedMinutes: 15,

    /* ─── Sections ──────────────────────────────────────────────────────── */

    sections: [
      {
        id: 'project_basics_section',
        label: 'Project Basics',
        nodeIds: ['project_basics', 'product_details', 'development_stage'],
      },
      {
        id: 'regulatory_strategy_section',
        label: 'Regulatory Strategy',
        nodeIds: ['target_agencies', 'filing_strategy', 'competitive_landscape'],
      },
      {
        id: 'team_timeline_section',
        label: 'Team & Timeline',
        nodeIds: ['team_roles', 'milestones_timeline'],
      },
      {
        id: 'data_sources_section',
        label: 'Data Sources',
        nodeIds: ['existing_documents', 'regulatory_correspondence'],
      },
      {
        id: 'platform_config_section',
        label: 'Platform Configuration',
        nodeIds: ['template_preferences', 'collaboration_settings'],
      },
    ],

    /* ─── Nodes ─────────────────────────────────────────────────────────── */

    nodes: [
      /* ================================================================ */
      /*  Section 1 — Project Basics                                      */
      /* ================================================================ */

      {
        id: 'project_basics',
        section: 'project_basics_section',
        question:
          'Welcome to the regulatory intelligence platform. I\'m AnA, your regulatory AI, and I\'ll walk you through setting up your project. Let\'s start with the essentials — what is the project name, and what type of product are we working with?',
        guidance:
          'Accurate project identification is the foundation for all downstream regulatory intelligence. The product type drives which regulatory frameworks, submission pathways, and compliance checks apply. Choose carefully — this selection shapes the entire platform experience.',
        fields: [
          {
            id: 'project_name',
            label: 'Project Name',
            type: 'text',
            placeholder: 'e.g., Project Orion — Oritavancin Phase 3',
            required: true,
            helpText: 'A descriptive project name used across the platform for identification. This can include an internal code name.',
          },
          {
            id: 'project_description',
            label: 'Project Description',
            type: 'textarea',
            placeholder: 'e.g., Phase 3 clinical development program for a novel PD-L1 antibody in first-line metastatic NSCLC, targeting FDA and EMA simultaneous submissions.',
            helpText: 'A brief summary of the project scope. This helps AnA tailor regulatory intelligence and alerts to your specific program.',
            validation: { maxLength: 1000 },
          },
          {
            id: 'product_type',
            label: 'Product Type',
            type: 'select',
            required: true,
            options: [
              { value: 'small_molecule', label: 'Small Molecule Drug', description: 'Traditional pharmaceutical compounds regulated under NDA pathway' },
              { value: 'biologic', label: 'Biologic', description: 'Monoclonal antibodies, gene/cell therapies, vaccines — BLA pathway under 42 USC 262' },
              { value: 'medical_device', label: 'Medical Device', description: 'Instruments, apparatus, or implants — 510(k), PMA, or De Novo pathways' },
              { value: 'combination_product', label: 'Combination Product', description: 'Drug-device, biologic-device, or drug-biologic combinations — requires lead agency designation per 21 CFR 3.2' },
              { value: 'diagnostic', label: 'Diagnostic (IVD)', description: 'In vitro diagnostic devices — 510(k), PMA, or LDT framework' },
            ],
          },
          {
            id: 'therapeutic_area',
            label: 'Therapeutic Area',
            type: 'select',
            required: true,
            options: [
              { value: 'oncology', label: 'Oncology' },
              { value: 'cardiovascular', label: 'Cardiovascular' },
              { value: 'neurology', label: 'Neurology / CNS' },
              { value: 'immunology', label: 'Immunology / Inflammation' },
              { value: 'infectious_disease', label: 'Infectious Disease' },
              { value: 'metabolic', label: 'Metabolic / Endocrine' },
              { value: 'respiratory', label: 'Respiratory' },
              { value: 'gastrointestinal', label: 'Gastrointestinal' },
              { value: 'rare_disease', label: 'Rare Disease / Orphan' },
              { value: 'dermatology', label: 'Dermatology' },
              { value: 'ophthalmology', label: 'Ophthalmology' },
              { value: 'hematology', label: 'Hematology' },
              { value: 'musculoskeletal', label: 'Musculoskeletal' },
              { value: 'psychiatry', label: 'Psychiatry' },
              { value: 'other', label: 'Other' },
            ],
          },
          {
            id: 'indication',
            label: 'Target Indication',
            type: 'text',
            placeholder: 'e.g., Locally advanced or metastatic non-small cell lung cancer (NSCLC)',
            required: true,
            helpText: 'Specify the disease or condition the product is intended to treat, diagnose, or prevent. Be as precise as possible — this drives competitive intelligence and regulatory precedent analysis.',
          },
        ],
        defaultNext: 'product_details',
        issueChecks: [
          {
            id: 'no_project_name',
            condition: { field: 'project_name', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'Project Name Required',
            message:
              'A project name is essential for platform organization and team collaboration. All regulatory intelligence alerts, documents, and reports will reference this name.',
          },
          {
            id: 'no_therapeutic_area',
            condition: { field: 'therapeutic_area', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'No Therapeutic Area Selected',
            message:
              'Selecting a therapeutic area enables AnA to configure relevant regulatory intelligence feeds, competitive landscape monitoring, and precedent analysis for your indication.',
          },
        ],
      },

      {
        id: 'product_details',
        section: 'project_basics_section',
        question:
          'Tell me more about the product itself. These details allow me to configure the right regulatory frameworks and compliance checks for your program.',
        guidance:
          'Product-specific details drive regulatory pathway selection, testing requirements, and submission content expectations. For drugs and biologics, the mechanism of action and route of administration inform safety monitoring and labeling requirements. For devices, classification and intended use determine the submission pathway.',
        fields: [
          {
            id: 'product_name',
            label: 'Product Name (Generic / INN / Trade Name)',
            type: 'text',
            placeholder: 'e.g., pembrolizumab (Keytruda) or ABC-1234',
            required: true,
            helpText: 'Use the established name (INN/USAN) if assigned, or the internal compound designation.',
          },
          {
            id: 'mechanism_of_action',
            label: 'Mechanism of Action / Intended Use',
            type: 'textarea',
            placeholder: 'e.g., Humanized monoclonal antibody that blocks PD-1/PD-L1 interaction, restoring T-cell anti-tumor activity.',
            helpText: 'For drugs/biologics: describe the pharmacological mechanism. For devices: describe the intended use and technological characteristics.',
            validation: { minLength: 20 },
          },
          {
            id: 'route_of_administration',
            label: 'Route of Administration / Mode of Use',
            type: 'select',
            options: [
              { value: 'oral', label: 'Oral' },
              { value: 'iv', label: 'Intravenous (IV)' },
              { value: 'sc', label: 'Subcutaneous (SC)' },
              { value: 'im', label: 'Intramuscular (IM)' },
              { value: 'topical', label: 'Topical' },
              { value: 'inhaled', label: 'Inhaled' },
              { value: 'implantable', label: 'Implantable' },
              { value: 'external_device', label: 'External Device' },
              { value: 'in_vitro', label: 'In Vitro (diagnostic)' },
              { value: 'other', label: 'Other' },
            ],
            visibleWhen: { field: 'product_type', operator: 'neq', value: 'medical_device' },
          },
          {
            id: 'target_patient_population',
            label: 'Target Patient Population',
            type: 'textarea',
            placeholder: 'e.g., Adult patients (≥18 years) with EGFR mutation-positive locally advanced or metastatic NSCLC who have progressed on or after first-line therapy.',
            required: true,
            helpText: 'Define the intended population including age range, disease stage, and prior treatment history. This informs inclusion/exclusion criteria and labeling scope.',
          },
          {
            id: 'device_classification',
            label: 'Device Classification',
            type: 'select',
            visibleWhen: { field: 'product_type', operator: 'in', value: ['medical_device', 'diagnostic'] },
            options: [
              { value: 'class_i', label: 'Class I (General Controls)', description: 'Lowest risk — most exempt from premarket notification' },
              { value: 'class_ii', label: 'Class II (Special Controls)', description: 'Moderate risk — typically requires 510(k)' },
              { value: 'class_iii', label: 'Class III (Premarket Approval)', description: 'Highest risk — requires PMA with clinical data' },
              { value: 'unclassified', label: 'Not Yet Classified', flagsIssue: true },
            ],
            helpText: 'FDA device classification per 21 CFR Parts 862-892 determines the regulatory pathway (510(k), PMA, or De Novo).',
          },
          {
            id: 'combination_lead_agency',
            label: 'Designated Lead Agency Center',
            type: 'select',
            visibleWhen: { field: 'product_type', operator: 'eq', value: 'combination_product' },
            options: [
              { value: 'cder', label: 'CDER (Center for Drug Evaluation and Research)' },
              { value: 'cber', label: 'CBER (Center for Biologics Evaluation and Research)' },
              { value: 'cdrh', label: 'CDRH (Center for Devices and Radiological Health)' },
              { value: 'not_determined', label: 'Not Yet Determined', flagsIssue: true },
            ],
            helpText: 'Combination products require a Request for Designation (RFD) to FDA\'s Office of Combination Products (OCP) per 21 CFR Part 3 to determine the lead center.',
          },
        ],
        defaultNext: 'development_stage',
        issueChecks: [
          {
            id: 'device_not_classified',
            condition: { field: 'device_classification', operator: 'eq', value: 'unclassified' },
            severity: 'warning',
            title: 'Device Classification Not Determined',
            message:
              'Device classification must be established to determine the appropriate regulatory pathway. Use FDA\'s Product Classification Database or request a classification determination from CDRH. De Novo classification may be appropriate for novel devices without a predicate.',
            reference: '21 CFR Parts 862-892; FDA Product Classification Database',
          },
          {
            id: 'combination_no_lead_agency',
            condition: { field: 'combination_lead_agency', operator: 'eq', value: 'not_determined' },
            severity: 'warning',
            title: 'Combination Product Without Lead Agency Designation',
            message:
              'Combination products require a lead center designation from FDA\'s Office of Combination Products (OCP) per 21 CFR Part 3. Submit a Request for Designation (RFD) early — the lead center determines the primary regulatory pathway, review standards, and applicable cGMP requirements.',
            reference: '21 CFR Part 3; FDA Guidance: Classification of Products as Drugs and Devices (2017)',
          },
        ],
      },

      {
        id: 'development_stage',
        section: 'project_basics_section',
        question:
          'Where does this product stand in its development lifecycle? This determines which regulatory activities, documents, and milestones are most relevant right now.',
        guidance:
          'The development stage determines which regulatory deliverables are immediate priorities versus future planning items. AnA will configure the platform dashboard, document templates, and compliance checks based on the current stage.',
        fields: [
          {
            id: 'current_stage',
            label: 'Current Development Stage',
            type: 'select',
            required: true,
            options: [
              { value: 'discovery', label: 'Discovery', description: 'Target identification and lead optimization' },
              { value: 'preclinical', label: 'Preclinical', description: 'Nonclinical pharmacology, toxicology, and CMC development' },
              { value: 'phase_1', label: 'Phase 1', description: 'First-in-human safety and PK studies' },
              { value: 'phase_2', label: 'Phase 2', description: 'Dose-finding and preliminary efficacy studies' },
              { value: 'phase_3', label: 'Phase 3', description: 'Pivotal efficacy and safety trials' },
              { value: 'nda_bla_filed', label: 'NDA/BLA Filed', description: 'Marketing application under regulatory review' },
              { value: 'marketed', label: 'Marketed', description: 'Approved product — lifecycle management and post-market activities' },
            ],
          },
          {
            id: 'regulatory_pathway',
            label: 'Regulatory Pathway',
            type: 'select',
            required: true,
            options: [
              { value: 'standard', label: 'Standard Approval', description: 'Traditional NDA/BLA or 510(k)/PMA pathway' },
              { value: 'accelerated', label: 'Accelerated Approval', description: 'FDA accelerated approval based on surrogate endpoint (21 CFR 314.500)' },
              { value: 'breakthrough', label: 'Breakthrough Therapy', description: 'Intensive FDA guidance for substantial improvement over existing therapies' },
              { value: 'fast_track', label: 'Fast Track', description: 'Expedited development for serious conditions with unmet need' },
              { value: 'rmat', label: 'RMAT (Regenerative Medicine Advanced Therapy)', description: 'Expedited pathway for cell/gene therapies' },
              { value: 'orphan', label: 'Orphan Drug', description: 'Orphan Drug Act incentives for rare diseases (<200,000 US prevalence)' },
              { value: '510k', label: '510(k) Premarket Notification', description: 'Substantial equivalence to a predicate device' },
              { value: 'pma', label: 'PMA (Premarket Approval)', description: 'Class III device with clinical data requirement' },
              { value: 'de_novo', label: 'De Novo Classification', description: 'Novel low-to-moderate risk device without a predicate' },
            ],
            helpText: 'Select the primary regulatory pathway. Multiple expedited designations (e.g., Breakthrough + Orphan) can coexist — we will capture those separately.',
          },
          {
            id: 'expedited_designations',
            label: 'Expedited Designations Obtained or Planned',
            type: 'multi_select',
            options: [
              { value: 'fast_track', label: 'Fast Track Designation' },
              { value: 'breakthrough', label: 'Breakthrough Therapy Designation' },
              { value: 'accelerated_approval', label: 'Accelerated Approval' },
              { value: 'priority_review', label: 'Priority Review' },
              { value: 'rmat', label: 'RMAT Designation' },
              { value: 'orphan', label: 'Orphan Drug Designation' },
              { value: 'none', label: 'None at this time' },
            ],
            helpText: 'Select all expedited designations that have been granted or are planned. These affect FDA interaction frequency, review timelines, and submission requirements.',
          },
          {
            id: 'first_in_class',
            label: 'Is this a first-in-class product?',
            type: 'yes_no',
            helpText: 'First-in-class products with a novel mechanism of action may face additional scrutiny but can also qualify for expedited pathways. This influences competitive landscape analysis.',
          },
        ],
        branches: [
          {
            when: { field: 'product_type', operator: 'in', value: ['medical_device', 'diagnostic'] },
            goto: 'target_agencies',
          },
        ],
        defaultNext: 'target_agencies',
        issueChecks: [
          {
            id: 'no_regulatory_pathway',
            condition: { field: 'regulatory_pathway', operator: 'eq', value: '' },
            severity: 'warning',
            title: 'No Regulatory Pathway Selected',
            message:
              'A regulatory pathway must be selected to configure the appropriate submission templates, compliance checks, and milestone tracking. If uncertain, select "Standard Approval" and refine after regulatory strategy discussions.',
          },
          {
            id: 'discovery_with_filings',
            condition: { field: 'current_stage', operator: 'eq', value: 'discovery' },
            severity: 'info',
            title: 'Discovery Stage — Regulatory Planning Is Premature for Filing Milestones',
            message:
              'At the discovery stage, regulatory strategy is typically high-level. AnA will configure the platform for early regulatory planning activities (target product profile, competitive landscape, pathway assessment) rather than submission-specific milestones. Filing dates set at this stage are highly speculative.',
          },
        ],
      },

      /* ================================================================ */
      /*  Section 2 — Regulatory Strategy                                 */
      /* ================================================================ */

      {
        id: 'target_agencies',
        section: 'regulatory_strategy_section',
        question:
          'Which regulatory agencies are you targeting for submissions? This determines the regulatory intelligence feeds, guideline monitoring, and template configurations AnA will activate.',
        guidance:
          'Multi-jurisdictional submissions require careful coordination of regulatory requirements. Each agency has distinct guidelines, timelines, and expectations. AnA monitors regulatory intelligence from all selected agencies, including guideline updates, advisory committee meetings, and approval precedents in your therapeutic area.',
        fields: [
          {
            id: 'target_agencies_list',
            label: 'Target Regulatory Agencies',
            type: 'multi_select',
            required: true,
            options: [
              { value: 'fda', label: 'FDA (United States)', description: 'U.S. Food and Drug Administration — CDER, CBER, or CDRH' },
              { value: 'ema', label: 'EMA (European Union)', description: 'European Medicines Agency — Centralised Procedure' },
              { value: 'pmda', label: 'PMDA (Japan)', description: 'Pharmaceuticals and Medical Devices Agency' },
              { value: 'health_canada', label: 'Health Canada', description: 'Health Products and Food Branch' },
              { value: 'mhra', label: 'MHRA (United Kingdom)', description: 'Medicines and Healthcare products Regulatory Agency' },
              { value: 'tga', label: 'TGA (Australia)', description: 'Therapeutic Goods Administration' },
              { value: 'nmpa', label: 'NMPA (China)', description: 'National Medical Products Administration' },
            ],
            helpText: 'Select all agencies where you plan to submit. AnA will track regulatory intelligence, guideline updates, and approval precedents for each agency.',
          },
          {
            id: 'primary_agency',
            label: 'Primary Agency (Lead Submission)',
            type: 'select',
            required: true,
            options: [
              { value: 'fda', label: 'FDA' },
              { value: 'ema', label: 'EMA' },
              { value: 'pmda', label: 'PMDA' },
              { value: 'health_canada', label: 'Health Canada' },
              { value: 'mhra', label: 'MHRA' },
              { value: 'tga', label: 'TGA' },
              { value: 'nmpa', label: 'NMPA' },
            ],
            helpText: 'The primary agency drives the core submission timeline. Other agencies are aligned to this schedule.',
          },
          {
            id: 'filing_strategy_approach',
            label: 'Multi-Agency Filing Strategy',
            type: 'radio',
            options: [
              { value: 'simultaneous', label: 'Simultaneous Filing', description: 'Submit to multiple agencies within the same window to maximize global launch alignment' },
              { value: 'sequential', label: 'Sequential Filing', description: 'File with primary agency first, then adapt and file with secondary agencies' },
              { value: 'single_market', label: 'Single Market Initially', description: 'Focus on one agency for initial approval before expanding' },
            ],
            helpText: 'Simultaneous filing requires harmonized data packages but enables faster global access. Sequential filing allows incorporating feedback from the primary agency.',
          },
        ],
        defaultNext: 'filing_strategy',
        issueChecks: [
          {
            id: 'no_target_agencies',
            condition: { field: 'target_agencies_list', operator: 'eq', value: [] },
            severity: 'warning',
            title: 'No Target Agencies Selected',
            message:
              'At least one target regulatory agency must be selected for AnA to configure the appropriate regulatory intelligence feeds, submission templates, and compliance requirements. Without this selection, the platform cannot provide jurisdiction-specific guidance.',
          },
        ],
      },

      {
        id: 'filing_strategy',
        section: 'regulatory_strategy_section',
        question:
          'What type of filing are you planning, and what specific submission pathway will you pursue? This determines the document structure and content requirements.',
        guidance:
          'The filing type dictates the eCTD module structure, required documentation, and review timeline. For drugs, the choice between NDA (505(b)(1), 505(b)(2)) and BLA has significant implications for data requirements. For devices, 510(k), PMA, and De Novo each have distinct submission formats and evidentiary standards.',
        fields: [
          {
            id: 'planned_filing_type',
            label: 'Planned Filing Type',
            type: 'select',
            required: true,
            options: [
              { value: 'ind', label: 'IND (Investigational New Drug Application)', description: 'Required before initiating clinical trials in the US' },
              { value: 'nda_505b1', label: 'NDA — 505(b)(1) Full NDA', description: 'Contains full reports of safety and efficacy from sponsor-conducted studies' },
              { value: 'nda_505b2', label: 'NDA — 505(b)(2)', description: 'Relies in part on FDA findings of safety/efficacy for a listed drug' },
              { value: 'bla', label: 'BLA (Biologics License Application)', description: 'Required for biologic products under 42 USC 262' },
              { value: '510k', label: '510(k) Premarket Notification', description: 'Demonstrates substantial equivalence to a predicate device' },
              { value: 'pma', label: 'PMA (Premarket Approval)', description: 'Required for Class III devices with clinical data' },
              { value: 'de_novo', label: 'De Novo Classification Request', description: 'For novel devices without a predicate that are not Class III risk' },
              { value: 'cer', label: 'CER (Clinical Evaluation Report)', description: 'EU MDR requirement for CE marking of medical devices' },
              { value: 'maa', label: 'MAA (Marketing Authorisation Application)', description: 'EMA centralised procedure marketing application' },
            ],
          },
          {
            id: 'reference_listed_drug',
            label: 'Reference Listed Drug (for 505(b)(2))',
            type: 'text',
            placeholder: 'e.g., Revlimid (lenalidomide), NDA 021880',
            visibleWhen: { field: 'planned_filing_type', operator: 'eq', value: 'nda_505b2' },
            helpText: 'For 505(b)(2) submissions, identify the Reference Listed Drug (RLD) from which you intend to rely on FDA\'s prior findings of safety and efficacy. Include the NDA number if known.',
          },
          {
            id: 'target_filing_date',
            label: 'Target Filing Date',
            type: 'date',
            helpText: 'Estimated date for the primary submission. AnA will use this to configure milestone tracking and backward-plan regulatory activities.',
          },
          {
            id: 'target_approval_date',
            label: 'Target Approval Date',
            type: 'date',
            helpText: 'Estimated date for primary agency approval. Used for launch planning and lifecycle management.',
          },
          {
            id: 'ectd_format',
            label: 'Will the submission be in eCTD format?',
            type: 'yes_no',
            defaultValue: true,
            helpText: 'Most major regulatory agencies require eCTD (electronic Common Technical Document) format per ICH M4. FDA mandates eCTD for all NDA/BLA/IND submissions.',
          },
        ],
        defaultNext: 'competitive_landscape',
        issueChecks: [
          {
            id: 'no_filing_date',
            condition: { field: 'target_filing_date', operator: 'eq', value: '' },
            severity: 'info',
            title: 'No Target Filing Date Set',
            message:
              'Setting a target filing date enables AnA to configure milestone tracking, backward-plan regulatory activities, and alert you to upcoming deadlines. You can update this date at any time as plans evolve.',
          },
        ],
      },

      {
        id: 'competitive_landscape',
        section: 'regulatory_strategy_section',
        question:
          'Let me understand the competitive context for your product. This helps me configure market intelligence monitoring and identify regulatory precedents that could inform your strategy.',
        guidance:
          'Understanding the competitive landscape helps AnA identify relevant regulatory precedents, advisory committee outcomes, FDA review templates, and labeling comparisons. First-in-class products may face more scrutiny from advisory committees but can benefit from expedited pathways.',
        fields: [
          {
            id: 'competitive_positioning',
            label: 'Competitive Positioning',
            type: 'select',
            options: [
              { value: 'first_in_class', label: 'First-in-Class', description: 'Novel mechanism — no approved drugs in this class' },
              { value: 'best_in_class', label: 'Best-in-Class', description: 'Same class as approved drugs but with differentiated profile' },
              { value: 'me_too', label: 'Me-Too / Follow-On', description: 'Similar to existing approved products in the class' },
              { value: 'biosimilar', label: 'Biosimilar / Generic', description: 'Referencing an approved reference product' },
            ],
            helpText: 'Competitive positioning influences the depth of comparative data needed and the type of clinical endpoints regulators will expect.',
          },
          {
            id: 'key_competitors',
            label: 'Key Competitor Products',
            type: 'textarea',
            placeholder: 'e.g., Keytruda (pembrolizumab, Merck), Opdivo (nivolumab, BMS), Tecentriq (atezolizumab, Roche)',
            helpText: 'List approved or late-stage competitor products. AnA will monitor their labeling changes, post-market requirements, and FDA interactions.',
          },
          {
            id: 'differentiation_strategy',
            label: 'Key Differentiators from Competitors',
            type: 'textarea',
            placeholder: 'e.g., Superior safety profile (lower immune-related AE rate), novel combination approach, convenient subcutaneous dosing vs. IV competitors.',
            helpText: 'Understanding your differentiation strategy helps AnA identify which clinical and regulatory data points are most critical to emphasize.',
          },
          {
            id: 'unmet_need',
            label: 'Unmet Medical Need Statement',
            type: 'textarea',
            placeholder: 'e.g., No approved therapies exist for patients with [condition] who have progressed on [standard treatment]. Current 5-year survival rate is <10%.',
            helpText: 'A clear unmet need statement is foundational for expedited designation requests (Fast Track, Breakthrough) and supports regulatory strategy discussions.',
          },
        ],
        defaultNext: 'team_roles',
        provideExpertFeedback: true,
      },

      /* ================================================================ */
      /*  Section 3 — Team & Timeline                                     */
      /* ================================================================ */

      {
        id: 'team_roles',
        section: 'team_timeline_section',
        question:
          'Who are the key team members on this project? I\'ll configure access, notifications, and role-based views based on these assignments.',
        guidance:
          'Role assignments determine platform permissions, notification routing, and dashboard views. Each role receives tailored regulatory intelligence — for example, the Regulatory Affairs lead sees guideline updates while the CMC lead sees manufacturing-related FDA guidance.',
        fields: [
          {
            id: 'project_lead',
            label: 'Project Lead / Program Director',
            type: 'text',
            placeholder: 'e.g., Jane Smith, VP Clinical Development',
            required: true,
          },
          {
            id: 'regulatory_lead',
            label: 'Regulatory Affairs Lead',
            type: 'text',
            placeholder: 'e.g., John Doe, Senior Director Regulatory Affairs',
            helpText: 'Primary contact for regulatory strategy, agency interactions, and submission oversight.',
          },
          {
            id: 'clinical_lead',
            label: 'Clinical Development Lead',
            type: 'text',
            placeholder: 'e.g., Dr. Sarah Johnson, VP Clinical Development',
          },
          {
            id: 'cmc_lead',
            label: 'CMC / Manufacturing Lead',
            type: 'text',
            placeholder: 'e.g., Michael Chen, Director CMC',
          },
          {
            id: 'medical_lead',
            label: 'Medical Director / Chief Medical Officer',
            type: 'text',
            placeholder: 'e.g., Dr. Emily Brown, CMO',
          },
          {
            id: 'cro_involvement',
            label: 'CRO Involvement',
            type: 'select',
            options: [
              { value: 'full_service', label: 'Full-Service CRO', description: 'CRO managing the majority of clinical operations and regulatory support' },
              { value: 'functional', label: 'Functional Service Provider', description: 'CRO providing specific functional capabilities (e.g., biostatistics, data management)' },
              { value: 'none', label: 'No CRO — In-House', description: 'All clinical and regulatory operations managed internally' },
            ],
          },
          {
            id: 'cro_name',
            label: 'CRO Name',
            type: 'text',
            placeholder: 'e.g., IQVIA, Covance, PPD, Parexel',
            visibleWhen: { field: 'cro_involvement', operator: 'in', value: ['full_service', 'functional'] },
          },
          {
            id: 'regulatory_counsel',
            label: 'External Regulatory Counsel',
            type: 'text',
            placeholder: 'e.g., Hyman, Phelps & McNamara, P.C.',
            helpText: 'External regulatory law firm or consultant advising on strategy, if applicable.',
          },
        ],
        defaultNext: 'milestones_timeline',
      },

      {
        id: 'milestones_timeline',
        section: 'team_timeline_section',
        question:
          'Let\'s map out the key milestones for your program. These dates drive the project timeline, automated reminders, and backward-planning calculations.',
        guidance:
          'Regulatory milestones form the backbone of program management. AnA uses these dates to calculate backward-planning timelines (e.g., "CMC stability data needed 6 months before NDA filing"), generate automated reminders, and flag timeline conflicts. All dates can be updated as the program evolves.',
        fields: [
          {
            id: 'ind_filing_date',
            label: 'IND / CTA Filing Date',
            type: 'date',
            helpText: 'Target date for filing the Investigational New Drug (IND) application or Clinical Trial Application (CTA). Applicable for products not yet in clinical development.',
            visibleWhen: { field: 'current_stage', operator: 'in', value: ['discovery', 'preclinical'] },
          },
          {
            id: 'fpfv_date',
            label: 'First Patient First Visit (FPFV)',
            type: 'date',
            helpText: 'Target date for enrolling the first patient in the clinical study.',
          },
          {
            id: 'database_lock_date',
            label: 'Database Lock',
            type: 'date',
            helpText: 'Target date for locking the clinical database for the pivotal study.',
          },
          {
            id: 'nda_bla_filing_date',
            label: 'NDA / BLA / PMA Filing Date',
            type: 'date',
            helpText: 'Target date for filing the marketing application with the primary agency.',
          },
          {
            id: 'pdufa_date',
            label: 'PDUFA / Target Action Date',
            type: 'date',
            helpText: 'Prescription Drug User Fee Act (PDUFA) target action date, typically 10 months (standard) or 6 months (priority) after NDA/BLA acceptance.',
          },
          {
            id: 'commercial_launch_date',
            label: 'Target Commercial Launch Date',
            type: 'date',
            helpText: 'Planned commercial launch date. AnA will use this for launch readiness tracking.',
          },
          {
            id: 'key_interim_milestones',
            label: 'Key Interim Milestones',
            type: 'textarea',
            placeholder: 'e.g., End-of-Phase 2 Meeting: Q2 2027\nPre-NDA Meeting: Q4 2028\nAdvisory Committee: Q2 2029',
            helpText: 'List any additional program milestones not captured above, one per line.',
          },
        ],
        defaultNext: 'existing_documents',
      },

      /* ================================================================ */
      /*  Section 4 — Data Sources                                        */
      /* ================================================================ */

      {
        id: 'existing_documents',
        section: 'data_sources_section',
        question:
          'Do you have existing documents or data packages that should be imported into the platform? This allows me to pre-populate templates and identify gaps in your regulatory dossier.',
        guidance:
          'Importing existing documents enables AnA to analyze your current dossier completeness, identify gaps relative to regulatory requirements, and pre-populate document templates with available data. Supported formats include eCTD modules, Word documents, PDFs, and structured data exports.',
        fields: [
          {
            id: 'existing_nonclinical_package',
            label: 'Nonclinical Data Package Available',
            type: 'select',
            options: [
              { value: 'complete', label: 'Complete — All nonclinical studies finished' },
              { value: 'partial', label: 'Partial — Some studies completed, others ongoing' },
              { value: 'planned', label: 'Planned — Studies not yet started' },
              { value: 'na', label: 'Not Applicable (marketed product or device)' },
            ],
          },
          {
            id: 'existing_clinical_data',
            label: 'Clinical Data Available',
            type: 'select',
            options: [
              { value: 'full_database', label: 'Full Clinical Database (CDISC/SDTM format)' },
              { value: 'csr_available', label: 'Clinical Study Reports Available' },
              { value: 'top_line_results', label: 'Top-Line Results Only' },
              { value: 'no_clinical_data', label: 'No Clinical Data Yet' },
            ],
          },
          {
            id: 'existing_cmc_dossier',
            label: 'CMC Dossier Status',
            type: 'select',
            options: [
              { value: 'complete', label: 'Complete CMC Package (Module 3 ready)' },
              { value: 'in_development', label: 'CMC Package in Development' },
              { value: 'early_stage', label: 'Early-Stage CMC (process development)' },
              { value: 'na', label: 'Not Applicable' },
            ],
          },
          {
            id: 'documents_to_import',
            label: 'Documents Available for Import',
            type: 'multi_select',
            options: [
              { value: 'ectd_modules', label: 'eCTD Modules (partial or complete)' },
              { value: 'protocols', label: 'Clinical Protocols' },
              { value: 'csrs', label: 'Clinical Study Reports' },
              { value: 'ib', label: 'Investigator\'s Brochure' },
              { value: 'nonclinical_reports', label: 'Nonclinical Study Reports' },
              { value: 'cmc_documents', label: 'CMC Documents (specifications, batch records)' },
              { value: 'meeting_minutes', label: 'FDA Meeting Minutes / Correspondence' },
              { value: 'sops', label: 'Standard Operating Procedures' },
              { value: 'risk_assessments', label: 'Risk Assessments / FMEA' },
              { value: 'none', label: 'No Documents to Import' },
            ],
          },
          {
            id: 'data_standards',
            label: 'Clinical Data Standards Used',
            type: 'multi_select',
            options: [
              { value: 'cdisc_sdtm', label: 'CDISC SDTM' },
              { value: 'cdisc_adam', label: 'CDISC ADaM' },
              { value: 'cdash', label: 'CDASH' },
              { value: 'meddra', label: 'MedDRA Coding' },
              { value: 'whodrug', label: 'WHODrug Coding' },
              { value: 'none', label: 'No Standardized Formats Yet' },
            ],
            helpText: 'FDA requires CDISC data standards (SDTM and ADaM) for NDA/BLA submissions. Early adoption of standards reduces downstream conversion effort.',
          },
        ],
        defaultNext: 'regulatory_correspondence',
      },

      {
        id: 'regulatory_correspondence',
        section: 'data_sources_section',
        question:
          'Have there been any prior regulatory interactions or submissions related to this product? I\'ll use this history to inform strategy recommendations and avoid repeating questions already addressed with agencies.',
        guidance:
          'Prior regulatory correspondence provides critical context for the platform. Pre-IND meeting minutes, FDA written responses, complete response letters, and prior submission deficiencies all inform the optimal regulatory strategy. AnA tracks these interactions to ensure all agency recommendations are addressed in future submissions.',
        fields: [
          {
            id: 'prior_fda_meetings',
            label: 'Prior FDA Meetings',
            type: 'multi_select',
            options: [
              { value: 'pre_ind', label: 'Pre-IND Meeting (Type B)' },
              { value: 'eop1', label: 'End-of-Phase 1 Meeting' },
              { value: 'eop2', label: 'End-of-Phase 2 Meeting (Type B)' },
              { value: 'pre_nda', label: 'Pre-NDA/BLA Meeting (Type B)' },
              { value: 'pre_submission', label: 'Pre-Submission Meeting (devices)' },
              { value: 'type_a', label: 'Type A Meeting' },
              { value: 'type_c', label: 'Type C Meeting' },
              { value: 'none', label: 'No Prior FDA Meetings' },
            ],
          },
          {
            id: 'prior_submissions',
            label: 'Prior Submissions for This Product',
            type: 'multi_select',
            options: [
              { value: 'ind', label: 'IND (active)' },
              { value: 'ind_amendments', label: 'IND Amendments' },
              { value: 'nda_bla', label: 'NDA / BLA (previously submitted)' },
              { value: '510k', label: '510(k) (previously submitted)' },
              { value: 'pma', label: 'PMA (previously submitted)' },
              { value: 'dmf', label: 'Drug Master File (DMF)' },
              { value: 'orphan_application', label: 'Orphan Drug Designation Application' },
              { value: 'none', label: 'No Prior Submissions' },
            ],
          },
          {
            id: 'agency_feedback_summary',
            label: 'Summary of Key Agency Feedback',
            type: 'textarea',
            placeholder: 'e.g., FDA Pre-IND meeting (March 2025): Agreed with proposed Phase 1 design. Requested additional genotoxicity data before FIH dosing. Confirmed orphan designation pathway.',
            helpText: 'Summarize the most important agency recommendations, agreements, and outstanding requests. AnA will track these as action items.',
          },
          {
            id: 'complete_response_letter',
            label: 'Has a Complete Response Letter (CRL) or Refuse to File (RTF) been received?',
            type: 'yes_no',
            helpText: 'If yes, the CRL/RTF deficiencies will be prioritized in the project plan. AnA will configure the platform to track resolution of all cited deficiencies.',
          },
          {
            id: 'crl_summary',
            label: 'CRL / RTF Deficiency Summary',
            type: 'textarea',
            placeholder: 'e.g., CRL cited: (1) insufficient stability data for commercial formulation, (2) additional safety data requested for hepatic impairment population.',
            visibleWhen: { field: 'complete_response_letter', operator: 'eq', value: true },
          },
        ],
        defaultNext: 'template_preferences',
      },

      /* ================================================================ */
      /*  Section 5 — Platform Configuration                              */
      /* ================================================================ */

      {
        id: 'template_preferences',
        section: 'platform_config_section',
        question:
          'Let\'s configure the platform to match your workflow preferences. Which document templates, intelligence alerts, and compliance checks would you like activated?',
        guidance:
          'Platform configuration determines which automated features are active for your project. Document templates are pre-configured to match your regulatory pathway and agency requirements. Intelligence alerts monitor regulatory developments relevant to your product and therapeutic area. Compliance checks run automatically against your documents to identify gaps and inconsistencies.',
        fields: [
          {
            id: 'document_templates',
            label: 'Document Templates to Activate',
            type: 'multi_select',
            options: [
              { value: 'protocol', label: 'Clinical Protocol Template' },
              { value: 'csr', label: 'Clinical Study Report (CSR) Template' },
              { value: 'ib', label: 'Investigator\'s Brochure Template' },
              { value: 'nda_modules', label: 'NDA/BLA Module Templates (eCTD)' },
              { value: '510k_template', label: '510(k) Submission Template' },
              { value: 'cer_template', label: 'Clinical Evaluation Report (CER) Template' },
              { value: 'sop_templates', label: 'SOP Templates' },
              { value: 'briefing_book', label: 'FDA Briefing Book Template' },
              { value: 'risk_management', label: 'Risk Management Plan Template' },
            ],
            helpText: 'Select the document templates you anticipate needing. Additional templates can be activated at any time.',
          },
          {
            id: 'intelligence_alerts',
            label: 'Regulatory Intelligence Alerts',
            type: 'multi_select',
            options: [
              { value: 'guideline_updates', label: 'Guideline and Guidance Updates', description: 'New or revised FDA/EMA/ICH guidelines in your therapeutic area' },
              { value: 'competitor_approvals', label: 'Competitor Approvals and Labeling Changes' },
              { value: 'advisory_committees', label: 'Advisory Committee Meeting Announcements' },
              { value: 'safety_alerts', label: 'Safety Alerts and Risk Communications' },
              { value: 'pdufa_actions', label: 'PDUFA Action Date Outcomes' },
              { value: 'patent_exclusivity', label: 'Patent and Exclusivity Expirations' },
              { value: 'clinical_trial_updates', label: 'Competitive Clinical Trial Updates' },
            ],
            helpText: 'AnA monitors regulatory intelligence sources and delivers alerts tailored to your project. You can adjust alert frequency and channels at any time.',
          },
          {
            id: 'compliance_checks',
            label: 'Automated Compliance Checks',
            type: 'multi_select',
            options: [
              { value: 'document_completeness', label: 'Document Completeness Verification' },
              { value: 'cross_reference', label: 'Cross-Reference Consistency Checks' },
              { value: 'regulatory_requirements', label: 'Regulatory Requirement Mapping' },
              { value: 'submission_readiness', label: 'Submission Readiness Assessment' },
              { value: 'formatting_validation', label: 'eCTD Formatting Validation' },
            ],
          },
          {
            id: 'dashboard_view',
            label: 'Default Dashboard View',
            type: 'select',
            options: [
              { value: 'executive', label: 'Executive Summary', description: 'High-level program status, milestones, and risk indicators' },
              { value: 'regulatory', label: 'Regulatory Operations', description: 'Submission timelines, document status, and agency interactions' },
              { value: 'clinical', label: 'Clinical Development', description: 'Study progress, enrollment, and safety data' },
              { value: 'comprehensive', label: 'Comprehensive', description: 'All modules visible with customizable layout' },
            ],
            helpText: 'Each team member can customize their own dashboard view. This sets the project default.',
          },
        ],
        defaultNext: 'collaboration_settings',
      },

      {
        id: 'collaboration_settings',
        section: 'platform_config_section',
        question:
          'Finally, let\'s set up your collaboration and notification preferences. How should the platform handle team communication and document workflows?',
        guidance:
          'Collaboration settings determine how your team interacts within the platform. These settings can be refined by individual team members after project setup is complete.',
        fields: [
          {
            id: 'notification_preferences',
            label: 'Notification Preferences',
            type: 'multi_select',
            options: [
              { value: 'email', label: 'Email Notifications' },
              { value: 'in_app', label: 'In-App Notifications' },
              { value: 'slack', label: 'Slack Integration' },
              { value: 'teams', label: 'Microsoft Teams Integration' },
            ],
            helpText: 'Select how you want to receive notifications about regulatory alerts, document reviews, and milestone reminders.',
          },
          {
            id: 'document_review_workflow',
            label: 'Document Review Workflow',
            type: 'select',
            options: [
              { value: 'sequential', label: 'Sequential Review', description: 'Documents pass through reviewers in a defined order' },
              { value: 'parallel', label: 'Parallel Review', description: 'All reviewers receive documents simultaneously' },
              { value: 'hybrid', label: 'Hybrid', description: 'SME review in parallel, then sequential management approval' },
              { value: 'none', label: 'No Formal Workflow', description: 'Ad-hoc review and approval' },
            ],
          },
          {
            id: 'access_control',
            label: 'Access Control Model',
            type: 'select',
            options: [
              { value: 'open', label: 'Open — All team members can access all documents' },
              { value: 'role_based', label: 'Role-Based — Access determined by role assignment' },
              { value: 'restricted', label: 'Restricted — Need-to-know basis with explicit sharing' },
            ],
          },
          {
            id: 'audit_trail',
            label: 'Enable 21 CFR Part 11 Compliant Audit Trail?',
            type: 'yes_no',
            defaultValue: true,
            helpText: 'Enables electronic signatures, version control, and comprehensive audit trail per 21 CFR Part 11 requirements. Recommended for all regulated submissions.',
          },
          {
            id: 'ana_proactive_mode',
            label: 'AnA Proactive Intelligence Mode',
            type: 'select',
            options: [
              { value: 'proactive', label: 'Proactive', description: 'AnA proactively surfaces insights, identifies risks, and suggests next steps' },
              { value: 'responsive', label: 'Responsive', description: 'AnA responds when asked and provides alerts for critical items only' },
              { value: 'minimal', label: 'Minimal', description: 'AnA provides only mandatory compliance alerts' },
            ],
            helpText: 'Controls how actively AnA engages with your project. Proactive mode provides the most comprehensive regulatory intelligence experience.',
          },
          {
            id: 'additional_setup_notes',
            label: 'Additional Setup Notes or Requirements',
            type: 'textarea',
            placeholder: 'e.g., We need integration with our internal Veeva Vault system. Our company requires all documents in both English and Japanese for PMDA submissions.',
            helpText: 'Any additional requirements, integrations, or preferences not captured above.',
          },
        ],
        defaultNext: null,
        provideExpertFeedback: true,
      },
    ],
  };
}
