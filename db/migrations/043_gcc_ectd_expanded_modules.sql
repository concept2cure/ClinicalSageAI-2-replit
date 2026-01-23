-- Migration 043: Expanded eCTD Module Structure (300+ nodes)
-- Adds comprehensive sub-sections per ICH M4 CTD specifications
-- Target: 300+ module nodes for complete eCTD coverage

BEGIN;

-- ============================================================================
-- Module 1 - Regional Administrative Information (FDA-specific expansions)
-- ============================================================================

-- m1.1 Forms sub-sections
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type, is_regional, fda_specific)
VALUES
    ('m1.1.1', 'Form FDA 356h', 'm1.1', 3, 'document', true, true),
    ('m1.1.2', 'Form FDA 1571', 'm1.1', 3, 'document', true, true),
    ('m1.1.3', 'Form FDA 1572', 'm1.1', 3, 'document', true, true),
    ('m1.1.4', 'Form FDA 3674', 'm1.1', 3, 'document', true, true),
    ('m1.1.5', 'Form FDA 3397', 'm1.1', 3, 'document', true, true),
    ('m1.1.6', 'Certification Statement', 'm1.1', 3, 'document', true, true),
    ('m1.1.7', 'Debarment Certification', 'm1.1', 3, 'document', true, true),
    ('m1.1.8', 'Field Copy Certification', 'm1.1', 3, 'document', true, true)
ON CONFLICT (module_code) DO NOTHING;

-- m1.3 Administrative Information sub-sections
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type, is_regional, fda_specific)
VALUES
    ('m1.3.1', 'Contact Information', 'm1.3', 3, 'document', true, true),
    ('m1.3.2', 'Agent Authorization', 'm1.3', 3, 'document', true, true),
    ('m1.3.3', 'US Agent Information', 'm1.3', 3, 'document', true, true),
    ('m1.3.4', 'Patent Information', 'm1.3', 3, 'document', true, true),
    ('m1.3.5', 'Exclusivity Information', 'm1.3', 3, 'document', true, true),
    ('m1.3.6', 'Tropical Disease Priority Review', 'm1.3', 3, 'document', true, true)
ON CONFLICT (module_code) DO NOTHING;

-- m1.4 References sub-sections
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type, is_regional, fda_specific)
VALUES
    ('m1.4.1', 'Letter of Authorization', 'm1.4', 3, 'document', true, true),
    ('m1.4.2', 'Statement of Right of Reference', 'm1.4', 3, 'document', true, true),
    ('m1.4.3', 'List of Authorized DMFs', 'm1.4', 3, 'document', true, true),
    ('m1.4.4', 'DMF Authorization Letters', 'm1.4', 3, 'document', true, true)
ON CONFLICT (module_code) DO NOTHING;

-- m1.14 Labeling sub-sections
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type, is_regional, fda_specific)
VALUES
    ('m1.14.1', 'Draft Labeling', 'm1.14', 3, 'folder', true, true),
    ('m1.14.1.1', 'Container Labels', 'm1.14.1', 4, 'document', true, true),
    ('m1.14.1.2', 'Carton Labels', 'm1.14.1', 4, 'document', true, true),
    ('m1.14.1.3', 'Package Insert', 'm1.14.1', 4, 'document', true, true),
    ('m1.14.1.4', 'Patient Information', 'm1.14.1', 4, 'document', true, true),
    ('m1.14.1.5', 'Medication Guide', 'm1.14.1', 4, 'document', true, true),
    ('m1.14.1.6', 'Instructions for Use', 'm1.14.1', 4, 'document', true, true),
    ('m1.14.2', 'Final Labeling', 'm1.14', 3, 'folder', true, true),
    ('m1.14.2.1', 'Final Container Labels', 'm1.14.2', 4, 'document', true, true),
    ('m1.14.2.2', 'Final Carton Labels', 'm1.14.2', 4, 'document', true, true),
    ('m1.14.2.3', 'Final Package Insert', 'm1.14.2', 4, 'document', true, true),
    ('m1.14.2.4', 'Final Patient Information', 'm1.14.2', 4, 'document', true, true),
    ('m1.14.3', 'Labeling History', 'm1.14', 3, 'document', true, true),
    ('m1.14.4', 'Annotated Labeling', 'm1.14', 3, 'document', true, true),
    ('m1.14.5', 'SPL Files', 'm1.14', 3, 'folder', true, true)
ON CONFLICT (module_code) DO NOTHING;

-- ============================================================================
-- Module 2 - CTD Summaries (expanded per ICH M4)
-- ============================================================================

-- m2.3 Quality Overall Summary sub-sections
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type, is_required)
VALUES
    ('m2.3.S', 'Drug Substance QOS', 'm2.3', 3, 'folder', true),
    ('m2.3.S.1', 'General Information Summary', 'm2.3.S', 4, 'document', true),
    ('m2.3.S.2', 'Manufacture Summary', 'm2.3.S', 4, 'document', true),
    ('m2.3.S.3', 'Characterisation Summary', 'm2.3.S', 4, 'document', true),
    ('m2.3.S.4', 'Control of Drug Substance Summary', 'm2.3.S', 4, 'document', true),
    ('m2.3.S.5', 'Reference Standards Summary', 'm2.3.S', 4, 'document', true),
    ('m2.3.S.6', 'Container Closure Summary', 'm2.3.S', 4, 'document', true),
    ('m2.3.S.7', 'Stability Summary', 'm2.3.S', 4, 'document', true),
    ('m2.3.P', 'Drug Product QOS', 'm2.3', 3, 'folder', true),
    ('m2.3.P.1', 'Description and Composition Summary', 'm2.3.P', 4, 'document', true),
    ('m2.3.P.2', 'Pharmaceutical Development Summary', 'm2.3.P', 4, 'document', true),
    ('m2.3.P.3', 'Manufacture Summary', 'm2.3.P', 4, 'document', true),
    ('m2.3.P.4', 'Control of Excipients Summary', 'm2.3.P', 4, 'document', true),
    ('m2.3.P.5', 'Control of Drug Product Summary', 'm2.3.P', 4, 'document', true),
    ('m2.3.P.6', 'Reference Standards Summary', 'm2.3.P', 4, 'document', true),
    ('m2.3.P.7', 'Container Closure Summary', 'm2.3.P', 4, 'document', true),
    ('m2.3.P.8', 'Stability Summary', 'm2.3.P', 4, 'document', true),
    ('m2.3.A', 'Appendices QOS', 'm2.3', 3, 'folder', false),
    ('m2.3.A.1', 'Facilities and Equipment Summary', 'm2.3.A', 4, 'document', false),
    ('m2.3.A.2', 'Adventitious Agents Safety Summary', 'm2.3.A', 4, 'document', false),
    ('m2.3.A.3', 'Novel Excipients Summary', 'm2.3.A', 4, 'document', false),
    ('m2.3.R', 'Regional Information QOS', 'm2.3', 3, 'folder', true)
ON CONFLICT (module_code) DO NOTHING;

-- m2.4 Nonclinical Overview sub-sections
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type)
VALUES
    ('m2.4.1', 'Overview of Nonclinical Testing Strategy', 'm2.4', 3, 'document'),
    ('m2.4.2', 'Pharmacology', 'm2.4', 3, 'document'),
    ('m2.4.3', 'Pharmacokinetics', 'm2.4', 3, 'document'),
    ('m2.4.4', 'Toxicology', 'm2.4', 3, 'document'),
    ('m2.4.5', 'Integrated Overview and Conclusions', 'm2.4', 3, 'document'),
    ('m2.4.6', 'List of Literature References', 'm2.4', 3, 'document')
ON CONFLICT (module_code) DO NOTHING;

-- m2.5 Clinical Overview sub-sections  
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type)
VALUES
    ('m2.5.1', 'Product Development Rationale', 'm2.5', 3, 'document'),
    ('m2.5.2', 'Overview of Biopharmaceutics', 'm2.5', 3, 'document'),
    ('m2.5.3', 'Overview of Clinical Pharmacology', 'm2.5', 3, 'document'),
    ('m2.5.4', 'Overview of Efficacy', 'm2.5', 3, 'document'),
    ('m2.5.5', 'Overview of Safety', 'm2.5', 3, 'document'),
    ('m2.5.6', 'Benefits and Risks Conclusions', 'm2.5', 3, 'document'),
    ('m2.5.7', 'Literature References', 'm2.5', 3, 'document')
ON CONFLICT (module_code) DO NOTHING;

-- m2.6 Nonclinical Written and Tabulated Summaries
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type)
VALUES
    ('m2.6.1', 'Introduction', 'm2.6', 3, 'document'),
    ('m2.6.2', 'Pharmacology Written Summary', 'm2.6', 3, 'document'),
    ('m2.6.3', 'Pharmacology Tabulated Summary', 'm2.6', 3, 'document'),
    ('m2.6.4', 'Pharmacokinetics Written Summary', 'm2.6', 3, 'document'),
    ('m2.6.5', 'Pharmacokinetics Tabulated Summary', 'm2.6', 3, 'document'),
    ('m2.6.6', 'Toxicology Written Summary', 'm2.6', 3, 'document'),
    ('m2.6.7', 'Toxicology Tabulated Summary', 'm2.6', 3, 'document')
ON CONFLICT (module_code) DO NOTHING;

-- m2.7 Clinical Summary sub-sections
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type)
VALUES
    ('m2.7.1', 'Summary of Biopharmaceutic Studies', 'm2.7', 3, 'document'),
    ('m2.7.2', 'Summary of Clinical Pharmacology Studies', 'm2.7', 3, 'document'),
    ('m2.7.3', 'Summary of Clinical Efficacy', 'm2.7', 3, 'document'),
    ('m2.7.4', 'Summary of Clinical Safety', 'm2.7', 3, 'document'),
    ('m2.7.5', 'Literature References', 'm2.7', 3, 'document'),
    ('m2.7.6', 'Synopses of Individual Studies', 'm2.7', 3, 'document')
ON CONFLICT (module_code) DO NOTHING;

-- ============================================================================
-- Module 3 - Quality (comprehensive CMC per ICH Q specifications)
-- ============================================================================

-- m3.2.S Drug Substance (detailed structure)
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type)
VALUES
    ('m3.2.S', 'Drug Substance', 'm3.2', 3, 'folder'),
    ('m3.2.S.1', 'General Information', 'm3.2.S', 4, 'folder'),
    ('m3.2.S.1.1', 'Nomenclature', 'm3.2.S.1', 5, 'document'),
    ('m3.2.S.1.2', 'Structure', 'm3.2.S.1', 5, 'document'),
    ('m3.2.S.1.3', 'General Properties', 'm3.2.S.1', 5, 'document'),
    ('m3.2.S.2', 'Manufacture', 'm3.2.S', 4, 'folder'),
    ('m3.2.S.2.1', 'Manufacturer(s)', 'm3.2.S.2', 5, 'document'),
    ('m3.2.S.2.2', 'Description of Manufacturing Process', 'm3.2.S.2', 5, 'document'),
    ('m3.2.S.2.3', 'Control of Materials', 'm3.2.S.2', 5, 'document'),
    ('m3.2.S.2.4', 'Controls of Critical Steps', 'm3.2.S.2', 5, 'document'),
    ('m3.2.S.2.5', 'Process Validation', 'm3.2.S.2', 5, 'document'),
    ('m3.2.S.2.6', 'Manufacturing Process Development', 'm3.2.S.2', 5, 'document'),
    ('m3.2.S.3', 'Characterisation', 'm3.2.S', 4, 'folder'),
    ('m3.2.S.3.1', 'Elucidation of Structure', 'm3.2.S.3', 5, 'document'),
    ('m3.2.S.3.2', 'Impurities', 'm3.2.S.3', 5, 'document'),
    ('m3.2.S.4', 'Control of Drug Substance', 'm3.2.S', 4, 'folder'),
    ('m3.2.S.4.1', 'Specification', 'm3.2.S.4', 5, 'document'),
    ('m3.2.S.4.2', 'Analytical Procedures', 'm3.2.S.4', 5, 'document'),
    ('m3.2.S.4.3', 'Validation of Analytical Procedures', 'm3.2.S.4', 5, 'document'),
    ('m3.2.S.4.4', 'Batch Analyses', 'm3.2.S.4', 5, 'document'),
    ('m3.2.S.4.5', 'Justification of Specification', 'm3.2.S.4', 5, 'document'),
    ('m3.2.S.5', 'Reference Standards or Materials', 'm3.2.S', 4, 'document'),
    ('m3.2.S.6', 'Container Closure System', 'm3.2.S', 4, 'document'),
    ('m3.2.S.7', 'Stability', 'm3.2.S', 4, 'folder'),
    ('m3.2.S.7.1', 'Stability Summary', 'm3.2.S.7', 5, 'document'),
    ('m3.2.S.7.2', 'Post-Approval Stability Protocol', 'm3.2.S.7', 5, 'document'),
    ('m3.2.S.7.3', 'Stability Data', 'm3.2.S.7', 5, 'document')
ON CONFLICT (module_code) DO NOTHING;

-- m3.2.P Drug Product (detailed structure)
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type)
VALUES
    ('m3.2.P', 'Drug Product', 'm3.2', 3, 'folder'),
    ('m3.2.P.1', 'Description and Composition', 'm3.2.P', 4, 'document'),
    ('m3.2.P.2', 'Pharmaceutical Development', 'm3.2.P', 4, 'folder'),
    ('m3.2.P.2.1', 'Components of Drug Product', 'm3.2.P.2', 5, 'folder'),
    ('m3.2.P.2.1.1', 'Drug Substance', 'm3.2.P.2.1', 6, 'document'),
    ('m3.2.P.2.1.2', 'Excipients', 'm3.2.P.2.1', 6, 'document'),
    ('m3.2.P.2.2', 'Drug Product', 'm3.2.P.2', 5, 'folder'),
    ('m3.2.P.2.2.1', 'Formulation Development', 'm3.2.P.2.2', 6, 'document'),
    ('m3.2.P.2.2.2', 'Overages', 'm3.2.P.2.2', 6, 'document'),
    ('m3.2.P.2.2.3', 'Physicochemical and Biological Properties', 'm3.2.P.2.2', 6, 'document'),
    ('m3.2.P.2.3', 'Manufacturing Process Development', 'm3.2.P.2', 5, 'document'),
    ('m3.2.P.2.4', 'Container Closure System', 'm3.2.P.2', 5, 'document'),
    ('m3.2.P.2.5', 'Microbiological Attributes', 'm3.2.P.2', 5, 'document'),
    ('m3.2.P.2.6', 'Compatibility', 'm3.2.P.2', 5, 'document'),
    ('m3.2.P.3', 'Manufacture', 'm3.2.P', 4, 'folder'),
    ('m3.2.P.3.1', 'Manufacturer(s)', 'm3.2.P.3', 5, 'document'),
    ('m3.2.P.3.2', 'Batch Formula', 'm3.2.P.3', 5, 'document'),
    ('m3.2.P.3.3', 'Description of Manufacturing Process', 'm3.2.P.3', 5, 'document'),
    ('m3.2.P.3.4', 'Controls of Critical Steps', 'm3.2.P.3', 5, 'document'),
    ('m3.2.P.3.5', 'Process Validation', 'm3.2.P.3', 5, 'document'),
    ('m3.2.P.4', 'Control of Excipients', 'm3.2.P', 4, 'folder'),
    ('m3.2.P.4.1', 'Specifications', 'm3.2.P.4', 5, 'document'),
    ('m3.2.P.4.2', 'Analytical Procedures', 'm3.2.P.4', 5, 'document'),
    ('m3.2.P.4.3', 'Validation of Analytical Procedures', 'm3.2.P.4', 5, 'document'),
    ('m3.2.P.4.4', 'Justification of Specifications', 'm3.2.P.4', 5, 'document'),
    ('m3.2.P.4.5', 'Excipients of Human or Animal Origin', 'm3.2.P.4', 5, 'document'),
    ('m3.2.P.4.6', 'Novel Excipients', 'm3.2.P.4', 5, 'document'),
    ('m3.2.P.5', 'Control of Drug Product', 'm3.2.P', 4, 'folder'),
    ('m3.2.P.5.1', 'Specification(s)', 'm3.2.P.5', 5, 'document'),
    ('m3.2.P.5.2', 'Analytical Procedures', 'm3.2.P.5', 5, 'document'),
    ('m3.2.P.5.3', 'Validation of Analytical Procedures', 'm3.2.P.5', 5, 'document'),
    ('m3.2.P.5.4', 'Batch Analyses', 'm3.2.P.5', 5, 'document'),
    ('m3.2.P.5.5', 'Characterisation of Impurities', 'm3.2.P.5', 5, 'document'),
    ('m3.2.P.5.6', 'Justification of Specification(s)', 'm3.2.P.5', 5, 'document'),
    ('m3.2.P.6', 'Reference Standards or Materials', 'm3.2.P', 4, 'document'),
    ('m3.2.P.7', 'Container Closure System', 'm3.2.P', 4, 'document'),
    ('m3.2.P.8', 'Stability', 'm3.2.P', 4, 'folder'),
    ('m3.2.P.8.1', 'Stability Summary', 'm3.2.P.8', 5, 'document'),
    ('m3.2.P.8.2', 'Post-Approval Stability Protocol', 'm3.2.P.8', 5, 'document'),
    ('m3.2.P.8.3', 'Stability Data', 'm3.2.P.8', 5, 'document')
ON CONFLICT (module_code) DO NOTHING;

-- m3.2.A Appendices
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type)
VALUES
    ('m3.2.A', 'Appendices', 'm3.2', 3, 'folder'),
    ('m3.2.A.1', 'Facilities and Equipment', 'm3.2.A', 4, 'document'),
    ('m3.2.A.2', 'Adventitious Agents Safety Evaluation', 'm3.2.A', 4, 'document'),
    ('m3.2.A.3', 'Excipients', 'm3.2.A', 4, 'document')
ON CONFLICT (module_code) DO NOTHING;

-- m3.2.R Regional Information
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type, is_regional, fda_specific)
VALUES
    ('m3.2.R', 'Regional Information', 'm3.2', 3, 'folder', true, true),
    ('m3.2.R.1', 'Executed Batch Records', 'm3.2.R', 4, 'document', true, true),
    ('m3.2.R.2', 'Comparability Protocols', 'm3.2.R', 4, 'document', true, true),
    ('m3.2.R.3', 'Methods Validation Package', 'm3.2.R', 4, 'document', true, true)
ON CONFLICT (module_code) DO NOTHING;

-- ============================================================================
-- Module 4 - Nonclinical Study Reports (detailed per ICH M4S)
-- ============================================================================

-- m4.2 Study Reports detailed structure
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type)
VALUES
    ('m4.2.1', 'Pharmacology', 'm4.2', 3, 'folder'),
    ('m4.2.1.1', 'Primary Pharmacodynamics', 'm4.2.1', 4, 'folder'),
    ('m4.2.1.2', 'Secondary Pharmacodynamics', 'm4.2.1', 4, 'folder'),
    ('m4.2.1.3', 'Safety Pharmacology', 'm4.2.1', 4, 'folder'),
    ('m4.2.1.4', 'Pharmacodynamic Drug Interactions', 'm4.2.1', 4, 'folder'),
    ('m4.2.2', 'Pharmacokinetics', 'm4.2', 3, 'folder'),
    ('m4.2.2.1', 'Analytical Methods and Validation', 'm4.2.2', 4, 'folder'),
    ('m4.2.2.2', 'Absorption', 'm4.2.2', 4, 'folder'),
    ('m4.2.2.3', 'Distribution', 'm4.2.2', 4, 'folder'),
    ('m4.2.2.4', 'Metabolism', 'm4.2.2', 4, 'folder'),
    ('m4.2.2.5', 'Excretion', 'm4.2.2', 4, 'folder'),
    ('m4.2.2.6', 'Pharmacokinetic Drug Interactions', 'm4.2.2', 4, 'folder'),
    ('m4.2.2.7', 'Other Pharmacokinetic Studies', 'm4.2.2', 4, 'folder'),
    ('m4.2.3', 'Toxicology', 'm4.2', 3, 'folder'),
    ('m4.2.3.1', 'Single-Dose Toxicity', 'm4.2.3', 4, 'folder'),
    ('m4.2.3.2', 'Repeat-Dose Toxicity', 'm4.2.3', 4, 'folder'),
    ('m4.2.3.3', 'Genotoxicity', 'm4.2.3', 4, 'folder'),
    ('m4.2.3.3.1', 'In Vitro', 'm4.2.3.3', 5, 'folder'),
    ('m4.2.3.3.2', 'In Vivo', 'm4.2.3.3', 5, 'folder'),
    ('m4.2.3.4', 'Carcinogenicity', 'm4.2.3', 4, 'folder'),
    ('m4.2.3.4.1', 'Long-term Studies', 'm4.2.3.4', 5, 'folder'),
    ('m4.2.3.4.2', 'Short- or Medium-term Studies', 'm4.2.3.4', 5, 'folder'),
    ('m4.2.3.4.3', 'Other Studies', 'm4.2.3.4', 5, 'folder'),
    ('m4.2.3.5', 'Reproductive and Developmental Toxicity', 'm4.2.3', 4, 'folder'),
    ('m4.2.3.5.1', 'Fertility and Early Embryonic Development', 'm4.2.3.5', 5, 'folder'),
    ('m4.2.3.5.2', 'Embryo-Fetal Development', 'm4.2.3.5', 5, 'folder'),
    ('m4.2.3.5.3', 'Prenatal and Postnatal Development', 'm4.2.3.5', 5, 'folder'),
    ('m4.2.3.5.4', 'Studies in Juvenile Animals', 'm4.2.3.5', 5, 'folder'),
    ('m4.2.3.6', 'Local Tolerance', 'm4.2.3', 4, 'folder'),
    ('m4.2.3.7', 'Other Toxicity Studies', 'm4.2.3', 4, 'folder'),
    ('m4.2.3.7.1', 'Antigenicity', 'm4.2.3.7', 5, 'folder'),
    ('m4.2.3.7.2', 'Immunotoxicity', 'm4.2.3.7', 5, 'folder'),
    ('m4.2.3.7.3', 'Mechanistic Studies', 'm4.2.3.7', 5, 'folder'),
    ('m4.2.3.7.4', 'Dependence', 'm4.2.3.7', 5, 'folder'),
    ('m4.2.3.7.5', 'Metabolites', 'm4.2.3.7', 5, 'folder'),
    ('m4.2.3.7.6', 'Impurities', 'm4.2.3.7', 5, 'folder'),
    ('m4.2.3.7.7', 'Other', 'm4.2.3.7', 5, 'folder')
ON CONFLICT (module_code) DO NOTHING;

-- ============================================================================
-- Module 5 - Clinical Study Reports (detailed per ICH E3/M4E)
-- ============================================================================

-- m5.3 Clinical Study Reports detailed structure
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type)
VALUES
    ('m5.3.1', 'Biopharmaceutic Studies', 'm5.3', 3, 'folder'),
    ('m5.3.1.1', 'Bioavailability Study Reports', 'm5.3.1', 4, 'folder'),
    ('m5.3.1.2', 'Comparative BA and Bioequivalence', 'm5.3.1', 4, 'folder'),
    ('m5.3.1.3', 'In Vitro-In Vivo Correlation', 'm5.3.1', 4, 'folder'),
    ('m5.3.1.4', 'Bioanalytical and Analytical Methods', 'm5.3.1', 4, 'folder'),
    ('m5.3.2', 'Human Pharmacokinetic Studies', 'm5.3', 3, 'folder'),
    ('m5.3.2.1', 'Healthy Subject PK and Initial Tolerability', 'm5.3.2', 4, 'folder'),
    ('m5.3.2.2', 'Patient PK and Initial Tolerability', 'm5.3.2', 4, 'folder'),
    ('m5.3.2.3', 'Intrinsic Factor PK', 'm5.3.2', 4, 'folder'),
    ('m5.3.2.4', 'Extrinsic Factor PK', 'm5.3.2', 4, 'folder'),
    ('m5.3.2.5', 'Population PK', 'm5.3.2', 4, 'folder'),
    ('m5.3.3', 'Human Pharmacodynamic Studies', 'm5.3', 3, 'folder'),
    ('m5.3.3.1', 'Healthy Subject PD Studies', 'm5.3.3', 4, 'folder'),
    ('m5.3.3.2', 'Patient PD Studies', 'm5.3.3', 4, 'folder'),
    ('m5.3.3.3', 'PK/PD Studies', 'm5.3.3', 4, 'folder'),
    ('m5.3.4', 'Human PK/PD Studies', 'm5.3', 3, 'folder'),
    ('m5.3.4.1', 'PK/PD Studies Reports', 'm5.3.4', 4, 'folder'),
    ('m5.3.4.2', 'PK/PD Studies (additional)', 'm5.3.4', 4, 'folder'),
    ('m5.3.5', 'Efficacy and Safety Studies', 'm5.3', 3, 'folder'),
    ('m5.3.5.1', 'Controlled Clinical Studies', 'm5.3.5', 4, 'folder'),
    ('m5.3.5.2', 'Uncontrolled Clinical Studies', 'm5.3.5', 4, 'folder'),
    ('m5.3.5.3', 'Analyses of Data from Multiple Studies', 'm5.3.5', 4, 'folder'),
    ('m5.3.5.4', 'Other Clinical Studies', 'm5.3.5', 4, 'folder'),
    ('m5.3.6', 'Post-Marketing Experience', 'm5.3', 3, 'folder'),
    ('m5.3.7', 'Case Report Forms and Individual Patient Listings', 'm5.3', 3, 'folder')
ON CONFLICT (module_code) DO NOTHING;

-- ============================================================================
-- Additional regional variants (EMA, PMDA)
-- ============================================================================

-- EMA-specific modules
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type, is_regional, ema_specific)
VALUES
    ('m1.0', 'Cover Letter', 'm1', 2, 'document', true, true),
    ('m1.0.1', 'Application Form', 'm1.0', 3, 'document', true, true),
    ('m1.0.2', 'QRD Template', 'm1.0', 3, 'document', true, true),
    ('m1.2.1', 'Cover Letters - EMA', 'm1.2', 3, 'document', true, true),
    ('m1.2.2', 'Responses to Questions', 'm1.2', 3, 'document', true, true),
    ('m1.5.1', 'Orphan Drug Designation', 'm1.5', 3, 'document', true, true),
    ('m1.5.2', 'PRIME Designation', 'm1.5', 3, 'document', true, true),
    ('m1.5.3', 'Conditional Marketing Authorization', 'm1.5', 3, 'document', true, true),
    ('m1.8.1', 'Risk Management Plan', 'm1.8', 3, 'document', true, true),
    ('m1.8.2', 'PSUR Schedule', 'm1.8', 3, 'document', true, true)
ON CONFLICT (module_code) DO NOTHING;

-- PMDA-specific modules (Japan)
INSERT INTO ectd.module_structure (module_code, module_name, parent_module_code, module_level, content_type, is_regional, pmda_specific)
VALUES
    ('m1.13.1', 'Japanese Labeling', 'm1.13', 3, 'document', true, true),
    ('m1.13.2', 'Package Insert (JP)', 'm1.13', 3, 'document', true, true),
    ('m1.13.3', 'Interview Form', 'm1.13', 3, 'document', true, true),
    ('m1.13.4', 'Risk Management Plan (JP)', 'm1.13', 3, 'document', true, true)
ON CONFLICT (module_code) DO NOTHING;

-- ============================================================================
-- Verify final count
-- ============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM ectd.module_structure;
    RAISE NOTICE 'Total eCTD module nodes: %', v_count;
    
    IF v_count < 300 THEN
        RAISE NOTICE 'Warning: Node count (%) is below target of 300', v_count;
    ELSE
        RAISE NOTICE 'SUCCESS: Node count (%) meets 300+ target', v_count;
    END IF;
END $$;

COMMIT;
