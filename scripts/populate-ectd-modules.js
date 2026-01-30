import { pool } from '../server/db.js';

/**
 * Complete IND/eCTD Module Hierarchy
 * Based on FDA eCTD v4.0 Technical Specification and ICH M4 CTD
 */

const ectdModuleHierarchy = [
  // MODULE 1: Administrative Information (Region-Specific)
  {
    module_number: '1',
    module_name: 'Module 1: Administrative Information and Prescribing Information',
    parent_module_id: null,
    level: 1,
    is_leaf: false,
    sort_order: 1,
    ich_guidance: 'ICH M4: Region-specific administrative information',
    is_required: true,
    children: [
      { module_number: '1.0', module_name: 'Cover Letter', level: 2, is_leaf: true, sort_order: 1, is_required: true },
      { module_number: '1.2', module_name: 'Administrative Information', level: 2, is_leaf: false, sort_order: 2, is_required: true,
        children: [
          { module_number: '1.2.1', module_name: 'Form FDA 1571', level: 3, is_leaf: true, sort_order: 1, is_required: true },
          { module_number: '1.2.2', module_name: 'Contact Information', level: 3, is_leaf: true, sort_order: 2, is_required: true },
        ]
      },
      { module_number: '1.3', module_name: 'Introductory Statement and General Investigational Plan', level: 2, is_leaf: true, sort_order: 3, is_required: true },
      { module_number: '1.4', module_name: 'Protocol', level: 2, is_leaf: true, sort_order: 4, is_required: false },
      { module_number: '1.5', module_name: "Investigator's Brochure", level: 2, is_leaf: true, sort_order: 5, is_required: false },
      { module_number: '1.6', module_name: 'Protocols and IND Safety Reports', level: 2, is_leaf: true, sort_order: 6, is_required: false },
      { module_number: '1.7', module_name: 'Previous Correspondence', level: 2, is_leaf: true, sort_order: 7, is_required: false },
      { module_number: '1.14', module_name: 'Labeling', level: 2, is_leaf: false, sort_order: 8, is_required: false,
        children: [
          { module_number: '1.14.1', module_name: 'Draft Labeling', level: 3, is_leaf: true, sort_order: 1 },
          { module_number: '1.14.2', module_name: 'Annotated Labeling', level: 3, is_leaf: true, sort_order: 2 },
        ]
      },
    ]
  },

  // MODULE 2: Common Technical Document Summaries
  {
    module_number: '2',
    module_name: 'Module 2: Common Technical Document Summaries',
    parent_module_id: null,
    level: 1,
    is_leaf: false,
    sort_order: 2,
    ich_guidance: 'ICH M4: CTD summaries providing overview of quality, nonclinical and clinical data',
    is_required: true,
    children: [
      { module_number: '2.1', module_name: 'CTD Table of Contents', level: 2, is_leaf: true, sort_order: 1, is_required: true },
      { module_number: '2.2', module_name: 'CTD Introduction', level: 2, is_leaf: true, sort_order: 2, is_required: true },
      { module_number: '2.3', module_name: 'Quality Overall Summary', level: 2, is_leaf: false, sort_order: 3, is_required: true,
        children: [
          { module_number: '2.3.S', module_name: 'Drug Substance', level: 3, is_leaf: false, sort_order: 1, is_required: true,
            children: [
              { module_number: '2.3.S.1', module_name: 'General Information', level: 4, is_leaf: true, sort_order: 1, is_required: true },
              { module_number: '2.3.S.2', module_name: 'Manufacture', level: 4, is_leaf: true, sort_order: 2, is_required: true },
              { module_number: '2.3.S.3', module_name: 'Characterization', level: 4, is_leaf: true, sort_order: 3, is_required: true },
              { module_number: '2.3.S.4', module_name: 'Control of Drug Substance', level: 4, is_leaf: true, sort_order: 4, is_required: true },
              { module_number: '2.3.S.5', module_name: 'Reference Standards or Materials', level: 4, is_leaf: true, sort_order: 5, is_required: true },
              { module_number: '2.3.S.6', module_name: 'Container Closure System', level: 4, is_leaf: true, sort_order: 6, is_required: true },
              { module_number: '2.3.S.7', module_name: 'Stability', level: 4, is_leaf: true, sort_order: 7, is_required: true },
            ]
          },
          { module_number: '2.3.P', module_name: 'Drug Product', level: 3, is_leaf: false, sort_order: 2, is_required: true,
            children: [
              { module_number: '2.3.P.1', module_name: 'Description and Composition', level: 4, is_leaf: true, sort_order: 1, is_required: true },
              { module_number: '2.3.P.2', module_name: 'Pharmaceutical Development', level: 4, is_leaf: true, sort_order: 2, is_required: true },
              { module_number: '2.3.P.3', module_name: 'Manufacture', level: 4, is_leaf: true, sort_order: 3, is_required: true },
              { module_number: '2.3.P.4', module_name: 'Control of Excipients', level: 4, is_leaf: true, sort_order: 4, is_required: true },
              { module_number: '2.3.P.5', module_name: 'Control of Drug Product', level: 4, is_leaf: true, sort_order: 5, is_required: true },
              { module_number: '2.3.P.6', module_name: 'Reference Standards or Materials', level: 4, is_leaf: true, sort_order: 6, is_required: true },
              { module_number: '2.3.P.7', module_name: 'Container Closure System', level: 4, is_leaf: true, sort_order: 7, is_required: true },
              { module_number: '2.3.P.8', module_name: 'Stability', level: 4, is_leaf: true, sort_order: 8, is_required: true },
            ]
          },
          { module_number: '2.3.A', module_name: 'Appendices', level: 3, is_leaf: true, sort_order: 3, is_required: false },
          { module_number: '2.3.R', module_name: 'Regional Information', level: 3, is_leaf: true, sort_order: 4, is_required: false },
        ]
      },
      { module_number: '2.4', module_name: 'Nonclinical Overview', level: 2, is_leaf: true, sort_order: 4, is_required: true },
      { module_number: '2.5', module_name: 'Clinical Overview', level: 2, is_leaf: true, sort_order: 5, is_required: true },
      { module_number: '2.6', module_name: 'Nonclinical Written and Tabulated Summaries', level: 2, is_leaf: false, sort_order: 6, is_required: true,
        children: [
          { module_number: '2.6.1', module_name: 'Introduction', level: 3, is_leaf: true, sort_order: 1, is_required: true },
          { module_number: '2.6.2', module_name: 'Pharmacology Written Summary', level: 3, is_leaf: true, sort_order: 2, is_required: true },
          { module_number: '2.6.3', module_name: 'Pharmacology Tabulated Summary', level: 3, is_leaf: true, sort_order: 3, is_required: true },
          { module_number: '2.6.4', module_name: 'Pharmacokinetics Written Summary', level: 3, is_leaf: true, sort_order: 4, is_required: true },
          { module_number: '2.6.5', module_name: 'Pharmacokinetics Tabulated Summary', level: 3, is_leaf: true, sort_order: 5, is_required: true },
          { module_number: '2.6.6', module_name: 'Toxicology Written Summary', level: 3, is_leaf: true, sort_order: 6, is_required: true },
          { module_number: '2.6.7', module_name: 'Toxicology Tabulated Summary', level: 3, is_leaf: true, sort_order: 7, is_required: true },
        ]
      },
      { module_number: '2.7', module_name: 'Clinical Summary', level: 2, is_leaf: false, sort_order: 7, is_required: true,
        children: [
          { module_number: '2.7.1', module_name: 'Summary of Biopharmaceutic Studies', level: 3, is_leaf: true, sort_order: 1, is_required: true },
          { module_number: '2.7.2', module_name: 'Summary of Clinical Pharmacology Studies', level: 3, is_leaf: true, sort_order: 2, is_required: true },
          { module_number: '2.7.3', module_name: 'Summary of Clinical Efficacy', level: 3, is_leaf: true, sort_order: 3, is_required: true },
          { module_number: '2.7.4', module_name: 'Summary of Clinical Safety', level: 3, is_leaf: true, sort_order: 4, is_required: true },
          { module_number: '2.7.5', module_name: 'References', level: 3, is_leaf: true, sort_order: 5, is_required: false },
          { module_number: '2.7.6', module_name: 'Synopses of Individual Studies', level: 3, is_leaf: true, sort_order: 6, is_required: true },
        ]
      },
    ]
  },

  // MODULE 3: Quality
  {
    module_number: '3',
    module_name: 'Module 3: Quality',
    parent_module_id: null,
    level: 1,
    is_leaf: false,
    sort_order: 3,
    ich_guidance: 'ICH M4Q: Chemistry, Manufacturing and Controls information',
    is_required: true,
    children: [
      { module_number: '3.1', module_name: 'Table of Contents', level: 2, is_leaf: true, sort_order: 1, is_required: true },
      { module_number: '3.2', module_name: 'Body of Data', level: 2, is_leaf: false, sort_order: 2, is_required: true,
        children: [
          { module_number: '3.2.S', module_name: 'Drug Substance', level: 3, is_leaf: false, sort_order: 1, is_required: true,
            children: [
              { module_number: '3.2.S.1', module_name: 'General Information', level: 4, is_leaf: false, sort_order: 1, is_required: true,
                children: [
                  { module_number: '3.2.S.1.1', module_name: 'Nomenclature', level: 5, is_leaf: true, sort_order: 1, is_required: true },
                  { module_number: '3.2.S.1.2', module_name: 'Structure', level: 5, is_leaf: true, sort_order: 2, is_required: true },
                  { module_number: '3.2.S.1.3', module_name: 'General Properties', level: 5, is_leaf: true, sort_order: 3, is_required: true },
                ]
              },
              { module_number: '3.2.S.2', module_name: 'Manufacture', level: 4, is_leaf: false, sort_order: 2, is_required: true,
                children: [
                  { module_number: '3.2.S.2.1', module_name: 'Manufacturer(s)', level: 5, is_leaf: true, sort_order: 1, is_required: true },
                  { module_number: '3.2.S.2.2', module_name: 'Description of Manufacturing Process and Process Controls', level: 5, is_leaf: true, sort_order: 2, is_required: true },
                  { module_number: '3.2.S.2.3', module_name: 'Control of Materials', level: 5, is_leaf: true, sort_order: 3, is_required: true },
                  { module_number: '3.2.S.2.4', module_name: 'Controls of Critical Steps and Intermediates', level: 5, is_leaf: true, sort_order: 4, is_required: true },
                  { module_number: '3.2.S.2.5', module_name: 'Process Validation/Evaluation', level: 5, is_leaf: true, sort_order: 5, is_required: true },
                  { module_number: '3.2.S.2.6', module_name: 'Manufacturing Process Development', level: 5, is_leaf: true, sort_order: 6, is_required: false },
                ]
              },
              { module_number: '3.2.S.3', module_name: 'Characterization', level: 4, is_leaf: false, sort_order: 3, is_required: true,
                children: [
                  { module_number: '3.2.S.3.1', module_name: 'Elucidation of Structure and other Characteristics', level: 5, is_leaf: true, sort_order: 1, is_required: true },
                  { module_number: '3.2.S.3.2', module_name: 'Impurities', level: 5, is_leaf: true, sort_order: 2, is_required: true },
                ]
              },
              { module_number: '3.2.S.4', module_name: 'Control of Drug Substance', level: 4, is_leaf: false, sort_order: 4, is_required: true,
                children: [
                  { module_number: '3.2.S.4.1', module_name: 'Specification', level: 5, is_leaf: true, sort_order: 1, is_required: true },
                  { module_number: '3.2.S.4.2', module_name: 'Analytical Procedures', level: 5, is_leaf: true, sort_order: 2, is_required: true },
                  { module_number: '3.2.S.4.3', module_name: 'Validation of Analytical Procedures', level: 5, is_leaf: true, sort_order: 3, is_required: true },
                  { module_number: '3.2.S.4.4', module_name: 'Batch Analyses', level: 5, is_leaf: true, sort_order: 4, is_required: true },
                  { module_number: '3.2.S.4.5', module_name: 'Justification of Specification', level: 5, is_leaf: true, sort_order: 5, is_required: true },
                ]
              },
              { module_number: '3.2.S.5', module_name: 'Reference Standards or Materials', level: 4, is_leaf: true, sort_order: 5, is_required: true },
              { module_number: '3.2.S.6', module_name: 'Container Closure System', level: 4, is_leaf: true, sort_order: 6, is_required: true },
              { module_number: '3.2.S.7', module_name: 'Stability', level: 4, is_leaf: false, sort_order: 7, is_required: true,
                children: [
                  { module_number: '3.2.S.7.1', module_name: 'Stability Summary and Conclusions', level: 5, is_leaf: true, sort_order: 1, is_required: true },
                  { module_number: '3.2.S.7.2', module_name: 'Post-approval Stability Protocol', level: 5, is_leaf: true, sort_order: 2, is_required: false },
                  { module_number: '3.2.S.7.3', module_name: 'Stability Data', level: 5, is_leaf: true, sort_order: 3, is_required: true },
                ]
              },
            ]
          },
          { module_number: '3.2.P', module_name: 'Drug Product', level: 3, is_leaf: false, sort_order: 2, is_required: true,
            children: [
              { module_number: '3.2.P.1', module_name: 'Description and Composition of the Drug Product', level: 4, is_leaf: true, sort_order: 1, is_required: true },
              { module_number: '3.2.P.2', module_name: 'Pharmaceutical Development', level: 4, is_leaf: false, sort_order: 2, is_required: true,
                children: [
                  { module_number: '3.2.P.2.1', module_name: 'Components of the Drug Product', level: 5, is_leaf: false, sort_order: 1, is_required: true,
                    children: [
                      { module_number: '3.2.P.2.1.1', module_name: 'Drug Substance', level: 6, is_leaf: true, sort_order: 1, is_required: true },
                      { module_number: '3.2.P.2.1.2', module_name: 'Excipients', level: 6, is_leaf: true, sort_order: 2, is_required: true },
                    ]
                  },
                  { module_number: '3.2.P.2.2', module_name: 'Drug Product', level: 5, is_leaf: false, sort_order: 2, is_required: true,
                    children: [
                      { module_number: '3.2.P.2.2.1', module_name: 'Formulation Development', level: 6, is_leaf: true, sort_order: 1, is_required: true },
                      { module_number: '3.2.P.2.2.2', module_name: 'Overages', level: 6, is_leaf: true, sort_order: 2, is_required: false },
                      { module_number: '3.2.P.2.2.3', module_name: 'Physicochemical and Biological Properties', level: 6, is_leaf: true, sort_order: 3, is_required: false },
                    ]
                  },
                  { module_number: '3.2.P.2.3', module_name: 'Manufacturing Process Development', level: 5, is_leaf: true, sort_order: 3, is_required: false },
                  { module_number: '3.2.P.2.4', module_name: 'Container Closure System', level: 5, is_leaf: true, sort_order: 4, is_required: true },
                  { module_number: '3.2.P.2.5', module_name: 'Microbiological Attributes', level: 5, is_leaf: true, sort_order: 5, is_required: false },
                  { module_number: '3.2.P.2.6', module_name: 'Compatibility', level: 5, is_leaf: true, sort_order: 6, is_required: false },
                ]
              },
              { module_number: '3.2.P.3', module_name: 'Manufacture', level: 4, is_leaf: false, sort_order: 3, is_required: true,
                children: [
                  { module_number: '3.2.P.3.1', module_name: 'Manufacturer(s)', level: 5, is_leaf: true, sort_order: 1, is_required: true },
                  { module_number: '3.2.P.3.2', module_name: 'Batch Formula', level: 5, is_leaf: true, sort_order: 2, is_required: true },
                  { module_number: '3.2.P.3.3', module_name: 'Description of Manufacturing Process and Process Controls', level: 5, is_leaf: true, sort_order: 3, is_required: true },
                  { module_number: '3.2.P.3.4', module_name: 'Controls of Critical Steps and Intermediates', level: 5, is_leaf: true, sort_order: 4, is_required: true },
                  { module_number: '3.2.P.3.5', module_name: 'Process Validation/Evaluation', level: 5, is_leaf: true, sort_order: 5, is_required: true },
                ]
              },
              { module_number: '3.2.P.4', module_name: 'Control of Excipients', level: 4, is_leaf: false, sort_order: 4, is_required: true,
                children: [
                  { module_number: '3.2.P.4.1', module_name: 'Specifications', level: 5, is_leaf: true, sort_order: 1, is_required: true },
                  { module_number: '3.2.P.4.2', module_name: 'Analytical Procedures', level: 5, is_leaf: true, sort_order: 2, is_required: true },
                  { module_number: '3.2.P.4.3', module_name: 'Validation of Analytical Procedures', level: 5, is_leaf: true, sort_order: 3, is_required: true },
                  { module_number: '3.2.P.4.4', module_name: 'Justification of Specifications', level: 5, is_leaf: true, sort_order: 4, is_required: true },
                  { module_number: '3.2.P.4.5', module_name: 'Excipients of Human or Animal Origin', level: 5, is_leaf: true, sort_order: 5, is_required: false },
                  { module_number: '3.2.P.4.6', module_name: 'Novel Excipients', level: 5, is_leaf: true, sort_order: 6, is_required: false },
                ]
              },
              { module_number: '3.2.P.5', module_name: 'Control of Drug Product', level: 4, is_leaf: false, sort_order: 5, is_required: true,
                children: [
                  { module_number: '3.2.P.5.1', module_name: 'Specification(s)', level: 5, is_leaf: true, sort_order: 1, is_required: true },
                  { module_number: '3.2.P.5.2', module_name: 'Analytical Procedures', level: 5, is_leaf: true, sort_order: 2, is_required: true },
                  { module_number: '3.2.P.5.3', module_name: 'Validation of Analytical Procedures', level: 5, is_leaf: true, sort_order: 3, is_required: true },
                  { module_number: '3.2.P.5.4', module_name: 'Batch Analyses', level: 5, is_leaf: true, sort_order: 4, is_required: true },
                  { module_number: '3.2.P.5.5', module_name: 'Characterization of Impurities', level: 5, is_leaf: true, sort_order: 5, is_required: true },
                  { module_number: '3.2.P.5.6', module_name: 'Justification of Specification(s)', level: 5, is_leaf: true, sort_order: 6, is_required: true },
                ]
              },
              { module_number: '3.2.P.6', module_name: 'Reference Standards or Materials', level: 4, is_leaf: true, sort_order: 6, is_required: true },
              { module_number: '3.2.P.7', module_name: 'Container Closure System', level: 4, is_leaf: true, sort_order: 7, is_required: true },
              { module_number: '3.2.P.8', module_name: 'Stability', level: 4, is_leaf: false, sort_order: 8, is_required: true,
                children: [
                  { module_number: '3.2.P.8.1', module_name: 'Stability Summary and Conclusion', level: 5, is_leaf: true, sort_order: 1, is_required: true },
                  { module_number: '3.2.P.8.2', module_name: 'Post-approval Stability Protocol and Stability Commitment', level: 5, is_leaf: true, sort_order: 2, is_required: false },
                  { module_number: '3.2.P.8.3', module_name: 'Stability Data', level: 5, is_leaf: true, sort_order: 3, is_required: true },
                ]
              },
            ]
          },
          { module_number: '3.2.A', module_name: 'Appendices', level: 3, is_leaf: true, sort_order: 3, is_required: false },
          { module_number: '3.2.R', module_name: 'Regional Information', level: 3, is_leaf: true, sort_order: 4, is_required: false },
        ]
      },
      { module_number: '3.3', module_name: 'Literature References', level: 2, is_leaf: true, sort_order: 3, is_required: false },
    ]
  },

  // MODULE 4: Nonclinical Study Reports
  {
    module_number: '4',
    module_name: 'Module 4: Nonclinical Study Reports',
    parent_module_id: null,
    level: 1,
    is_leaf: false,
    sort_order: 4,
    ich_guidance: 'ICH M4S: Nonclinical study reports',
    is_required: true,
    children: [
      { module_number: '4.1', module_name: 'Table of Contents', level: 2, is_leaf: true, sort_order: 1, is_required: true },
      { module_number: '4.2', module_name: 'Study Reports', level: 2, is_leaf: false, sort_order: 2, is_required: true,
        children: [
          { module_number: '4.2.1', module_name: 'Pharmacology', level: 3, is_leaf: false, sort_order: 1, is_required: true,
            children: [
              { module_number: '4.2.1.1', module_name: 'Primary Pharmacodynamics', level: 4, is_leaf: true, sort_order: 1, is_required: true },
              { module_number: '4.2.1.2', module_name: 'Secondary Pharmacodynamics', level: 4, is_leaf: true, sort_order: 2, is_required: false },
              { module_number: '4.2.1.3', module_name: 'Safety Pharmacology', level: 4, is_leaf: true, sort_order: 3, is_required: true },
              { module_number: '4.2.1.4', module_name: 'Pharmacodynamic Drug Interactions', level: 4, is_leaf: true, sort_order: 4, is_required: false },
            ]
          },
          { module_number: '4.2.2', module_name: 'Pharmacokinetics', level: 3, is_leaf: false, sort_order: 2, is_required: true,
            children: [
              { module_number: '4.2.2.1', module_name: 'Analytical Methods and Validation Reports', level: 4, is_leaf: true, sort_order: 1, is_required: true },
              { module_number: '4.2.2.2', module_name: 'Absorption', level: 4, is_leaf: true, sort_order: 2, is_required: true },
              { module_number: '4.2.2.3', module_name: 'Distribution', level: 4, is_leaf: true, sort_order: 3, is_required: true },
              { module_number: '4.2.2.4', module_name: 'Metabolism', level: 4, is_leaf: true, sort_order: 4, is_required: true },
              { module_number: '4.2.2.5', module_name: 'Excretion', level: 4, is_leaf: true, sort_order: 5, is_required: true },
              { module_number: '4.2.2.6', module_name: 'Pharmacokinetic Drug Interactions', level: 4, is_leaf: true, sort_order: 6, is_required: false },
              { module_number: '4.2.2.7', module_name: 'Other Pharmacokinetic Studies', level: 4, is_leaf: true, sort_order: 7, is_required: false },
            ]
          },
          { module_number: '4.2.3', module_name: 'Toxicology', level: 3, is_leaf: false, sort_order: 3, is_required: true,
            children: [
              { module_number: '4.2.3.1', module_name: 'Single-Dose Toxicity', level: 4, is_leaf: true, sort_order: 1, is_required: true },
              { module_number: '4.2.3.2', module_name: 'Repeat-Dose Toxicity', level: 4, is_leaf: true, sort_order: 2, is_required: true },
              { module_number: '4.2.3.3', module_name: 'Genotoxicity', level: 4, is_leaf: true, sort_order: 3, is_required: true },
              { module_number: '4.2.3.4', module_name: 'Carcinogenicity', level: 4, is_leaf: true, sort_order: 4, is_required: false },
              { module_number: '4.2.3.5', module_name: 'Reproductive and Developmental Toxicity', level: 4, is_leaf: true, sort_order: 5, is_required: false },
              { module_number: '4.2.3.6', module_name: 'Local Tolerance', level: 4, is_leaf: true, sort_order: 6, is_required: false },
              { module_number: '4.2.3.7', module_name: 'Other Toxicity Studies', level: 4, is_leaf: true, sort_order: 7, is_required: false },
            ]
          },
        ]
      },
      { module_number: '4.3', module_name: 'Literature References', level: 2, is_leaf: true, sort_order: 3, is_required: false },
    ]
  },

  // MODULE 5: Clinical Study Reports
  {
    module_number: '5',
    module_name: 'Module 5: Clinical Study Reports',
    parent_module_id: null,
    level: 1,
    is_leaf: false,
    sort_order: 5,
    ich_guidance: 'ICH M4E: Clinical study reports',
    is_required: true,
    children: [
      { module_number: '5.1', module_name: 'Table of Contents', level: 2, is_leaf: true, sort_order: 1, is_required: true },
      { module_number: '5.2', module_name: 'Tabular Listing of All Clinical Studies', level: 2, is_leaf: true, sort_order: 2, is_required: true },
      { module_number: '5.3', module_name: 'Clinical Study Reports', level: 2, is_leaf: false, sort_order: 3, is_required: true,
        children: [
          { module_number: '5.3.1', module_name: 'Reports of Biopharmaceutic Studies', level: 3, is_leaf: false, sort_order: 1, is_required: false,
            children: [
              { module_number: '5.3.1.1', module_name: 'Bioavailability Study Reports', level: 4, is_leaf: true, sort_order: 1, is_required: false },
              { module_number: '5.3.1.2', module_name: 'Comparative BA and Bioequivalence Study Reports', level: 4, is_leaf: true, sort_order: 2, is_required: false },
              { module_number: '5.3.1.3', module_name: 'In Vitro - In Vivo Correlation Study Reports', level: 4, is_leaf: true, sort_order: 3, is_required: false },
              { module_number: '5.3.1.4', module_name: 'Reports of Bioanalytical and Analytical Methods', level: 4, is_leaf: true, sort_order: 4, is_required: false },
            ]
          },
          { module_number: '5.3.2', module_name: 'Reports of Studies Pertinent to Pharmacokinetics using Human Biomaterials', level: 3, is_leaf: false, sort_order: 2, is_required: false,
            children: [
              { module_number: '5.3.2.1', module_name: 'Plasma Protein Binding Study Reports', level: 4, is_leaf: true, sort_order: 1, is_required: false },
              { module_number: '5.3.2.2', module_name: 'Reports of Hepatic Metabolism and Drug Interaction Studies', level: 4, is_leaf: true, sort_order: 2, is_required: false },
              { module_number: '5.3.2.3', module_name: 'Reports of Studies Using Other Human Biomaterials', level: 4, is_leaf: true, sort_order: 3, is_required: false },
            ]
          },
          { module_number: '5.3.3', module_name: 'Reports of Human Pharmacokinetic (PK) Studies', level: 3, is_leaf: false, sort_order: 3, is_required: true,
            children: [
              { module_number: '5.3.3.1', module_name: 'Healthy Subject PK and Initial Tolerability Study Reports', level: 4, is_leaf: true, sort_order: 1, is_required: true },
              { module_number: '5.3.3.2', module_name: 'Patient PK and Initial Tolerability Study Reports', level: 4, is_leaf: true, sort_order: 2, is_required: false },
              { module_number: '5.3.3.3', module_name: 'Intrinsic Factor PK Study Reports', level: 4, is_leaf: true, sort_order: 3, is_required: false },
              { module_number: '5.3.3.4', module_name: 'Extrinsic Factor PK Study Reports', level: 4, is_leaf: true, sort_order: 4, is_required: false },
              { module_number: '5.3.3.5', module_name: 'Population PK Study Reports', level: 4, is_leaf: true, sort_order: 5, is_required: false },
            ]
          },
          { module_number: '5.3.4', module_name: 'Reports of Human Pharmacodynamic (PD) Studies', level: 3, is_leaf: false, sort_order: 4, is_required: false,
            children: [
              { module_number: '5.3.4.1', module_name: 'Healthy Subject PD and PK/PD Study Reports', level: 4, is_leaf: true, sort_order: 1, is_required: false },
              { module_number: '5.3.4.2', module_name: 'Patient PD and PK/PD Study Reports', level: 4, is_leaf: true, sort_order: 2, is_required: false },
            ]
          },
          { module_number: '5.3.5', module_name: 'Reports of Efficacy and Safety Studies', level: 3, is_leaf: false, sort_order: 5, is_required: true,
            children: [
              { module_number: '5.3.5.1', module_name: 'Study Reports of Controlled Clinical Studies Pertinent to Indication', level: 4, is_leaf: true, sort_order: 1, is_required: true },
              { module_number: '5.3.5.2', module_name: 'Study Reports of Uncontrolled Clinical Studies', level: 4, is_leaf: true, sort_order: 2, is_required: false },
              { module_number: '5.3.5.3', module_name: 'Reports of Analyses of Data from More than One Study', level: 4, is_leaf: true, sort_order: 3, is_required: false },
              { module_number: '5.3.5.4', module_name: 'Other Study Reports', level: 4, is_leaf: true, sort_order: 4, is_required: false },
            ]
          },
          { module_number: '5.3.6', module_name: 'Reports of Post-marketing Experience', level: 3, is_leaf: true, sort_order: 6, is_required: false },
          { module_number: '5.3.7', module_name: 'Case Report Forms and Individual Patient Listings', level: 3, is_leaf: true, sort_order: 7, is_required: false },
        ]
      },
      { module_number: '5.4', module_name: 'Literature References', level: 2, is_leaf: true, sort_order: 4, is_required: false },
    ]
  },
];

/**
 * Recursively insert modules into database
 */
async function insertModulesRecursive(modules, parentId, organizationId, depth = 0) {
  const indent = '  '.repeat(depth);
  
  for (const module of modules) {
    const { children, ...moduleData } = module;
    
    // Insert the module
    const result = await pool.query(
      `INSERT INTO ectd_modules 
       (organization_id, module_number, module_name, parent_module_id, level, is_leaf, sort_order, ich_guidance, is_required, allow_custom_granules, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, module_number, module_name`,
      [
        organizationId,
        moduleData.module_number,
        moduleData.module_name,
        parentId,
        moduleData.level,
        moduleData.is_leaf !== false && (!children || children.length === 0), // is_leaf true if no children
        moduleData.sort_order,
        moduleData.ich_guidance || null,
        moduleData.is_required !== false, // default true
        moduleData.allow_custom_granules || false,
        'active'
      ]
    );
    
    const insertedModule = result.rows[0];
    logger.info(`${indent}✅ ${insertedModule.module_number} - ${insertedModule.module_name}`);
    
    // Recursively insert children
    if (children && children.length > 0) {
      await insertModulesRecursive(children, insertedModule.id, organizationId, depth + 1);
    }
  }
}

/**
 * Main function to populate eCTD modules
 */
async function populateEctdModules() {
  logger.info('🚀 Populating complete IND/eCTD module hierarchy...\n');

  try {
    // Check if modules already exist
    const existingCheck = await pool.query('SELECT COUNT(*) as count FROM ectd_modules');
    
    if (existingCheck.rows[0].count > 0) {
      logger.info(`⚠️  Found ${existingCheck.rows[0].count} existing modules.`);
      logger.info('🗑️  Clearing existing modules...');
      await pool.query('DELETE FROM ectd_modules');
      logger.info('✅ Cleared.\n');
    }

    // Get organization ID (default to 1)
    const orgResult = await pool.query('SELECT id FROM organizations LIMIT 1');
    const organizationId = orgResult.rows[0]?.id || 1;

    logger.info(`📋 Inserting modules for organization ${organizationId}...\n`);

    // Insert all modules recursively
    await insertModulesRecursive(ectdModuleHierarchy, null, organizationId);

    // Final count
    const finalCount = await pool.query('SELECT COUNT(*) as count FROM ectd_modules');
    logger.info(`\n✨ Successfully populated ${finalCount.rows[0].count} eCTD modules!`);
    
    // Show module breakdown
    const breakdown = await pool.query(`
      SELECT level, COUNT(*) as count
      FROM ectd_modules
      GROUP BY level
      ORDER BY level
    `);
    
    logger.info('\n📊 Module Breakdown by Level:');
    breakdown.rows.forEach(row => {
      logger.info(`   Level ${row.level}: ${row.count} modules`);
    });

  } catch (error) {
    logger.error('❌ Error populating eCTD modules:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
populateEctdModules().catch(console.error);
