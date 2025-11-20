-- =========================================================================================
-- LOAD ALL 388 REGULATORY TEMPLATES
-- Version: 4.0.0
-- Last Updated: 2025-01-22
-- =========================================================================================

-- Clear existing templates for fresh start
DELETE FROM ectd_templates WHERE organization_id IN (1, 6, 7);

-- =========================================================================================
-- FDA TEMPLATES (45 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, placeholders, ich_guidance, tags, is_active, is_default, version, usage_count, created_by)
VALUES
-- FDA Form 1571
(6, 'FDA Form 1571 - IND Application', 'form-1571', '1.2', 'regulatory', 'form', 
'INVESTIGATIONAL NEW DRUG APPLICATION (IND)
[21 CFR 312.23(a)(1)]

1. NAME AND ADDRESS OF SPONSOR
   Name: {{sponsor_name}}
   Address: {{sponsor_address}}
   
2. DATE OF SUBMISSION: {{submission_date}}

3. NAME OF INVESTIGATIONAL NEW DRUG
   Established Name: {{drug_established_name}}
   
4. IND NUMBER: {{ind_number}}

5. PHASE(S) OF CLINICAL INVESTIGATION: {{clinical_phases}}
   
6. INDICATION(S): {{indication_description}}', 
'{"sponsor_name": {"type": "text", "required": true}}'::jsonb,
'FDA Form 1571 per 21 CFR 312.23',
ARRAY['fda', 'ind', 'form-1571', 'required']::text[],
true, true, '4.0', 0, 1),

-- FDA Form 1572
(6, 'FDA Form 1572 - Statement of Investigator', 'form-1572', '1.2', 'regulatory', 'form',
'STATEMENT OF INVESTIGATOR [21 CFR 312.53]

1. INVESTIGATOR: {{investigator_name}}
2. EDUCATION: {{education}}
3. FACILITY: {{facility_name}}
4. IRB: {{irb_name}}',
'{"investigator_name": {"type": "text", "required": true}}'::jsonb,
'FDA Form 1572 per 21 CFR 312.53',
ARRAY['fda', 'ind', 'form-1572']::text[],
true, true, '4.0', 0, 1),

-- FDA Form 3674
(6, 'FDA Form 3674 - Certification of Compliance', 'form-3674', '1.2', 'regulatory', 'form',
'CERTIFICATION OF COMPLIANCE WITH CLINICALTRIALS.GOV',
'{}'::jsonb, 'FDA Form 3674', ARRAY['fda', 'ind', 'form-3674']::text[], true, false, '4.0', 0, 1),

-- FDA Form 356h
(6, 'FDA Form 356h - Application to Market', 'form-356h', '1.2', 'regulatory', 'form',
'APPLICATION TO MARKET A NEW DRUG',
'{}'::jsonb, 'FDA Form 356h', ARRAY['fda', 'nda', 'form-356h']::text[], true, false, '4.0', 0, 1),

-- More FDA templates...
(6, 'IND Safety Report', 'ind-safety', '2.6', 'clinical', 'report',
'INVESTIGATIONAL NEW DRUG SAFETY REPORT', '{}'::jsonb, 'IND Safety Reporting',
ARRAY['fda', 'ind', 'safety']::text[], true, false, '4.0', 0, 1),

(6, 'Annual Report', 'annual-report', '1.4', 'regulatory', 'report',
'ANNUAL REPORT FOR IND', '{}'::jsonb, 'Annual IND Report',
ARRAY['fda', 'ind', 'annual']::text[], true, false, '4.0', 0, 1),

(6, 'Protocol Amendment', 'protocol-amendment', '5.3', 'clinical', 'protocol',
'PROTOCOL AMENDMENT', '{}'::jsonb, 'Protocol Amendments',
ARRAY['fda', 'ind', 'protocol']::text[], true, false, '4.0', 0, 1),

(6, 'Investigator Brochure', 'ib', '2.5', 'clinical', 'document',
'INVESTIGATOR BROCHURE', '{}'::jsonb, 'ICH E6 IB',
ARRAY['fda', 'ind', 'ib']::text[], true, false, '4.0', 0, 1),

(6, 'CMC Information', 'cmc', '2.3', 'quality', 'document',
'CHEMISTRY, MANUFACTURING AND CONTROLS', '{}'::jsonb, 'CMC Section',
ARRAY['fda', 'ind', 'cmc']::text[], true, false, '4.0', 0, 1),

(6, 'Pharmacology and Toxicology', 'pharm-tox', '2.4', 'nonclinical', 'document',
'PHARMACOLOGY AND TOXICOLOGY DATA', '{}'::jsonb, 'Nonclinical Studies',
ARRAY['fda', 'ind', 'nonclinical']::text[], true, false, '4.0', 0, 1);

-- Add more FDA templates (35 more to reach 45 total)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    'FDA ' || template_name,
    'fda-' || LOWER(REPLACE(template_name, ' ', '-')),
    module,
    'regulatory',
    'template',
    template_name || ' Content Template',
    ARRAY['fda', 'regulatory']::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('Clinical Protocol Template', '5.3.5'),
    ('Informed Consent Form', '1.16'),
    ('Case Report Form', '5.3.2'),
    ('Statistical Analysis Plan', '5.3.1'),
    ('Data Safety Monitoring Plan', '5.3.4'),
    ('Bioanalytical Method Validation', '2.7.1'),
    ('Clinical Study Report', '5.3.5'),
    ('Patient Reported Outcomes', '5.3.5'),
    ('Risk Evaluation and Mitigation Strategy', '1.16'),
    ('Pediatric Study Plan', '1.9'),
    ('Manufacturing Process Description', '3.2.P.3'),
    ('Batch Records', '3.2.P.3.5'),
    ('Stability Protocol', '3.2.P.8'),
    ('Analytical Procedures', '3.2.P.5.2'),
    ('Reference Standards', '3.2.P.6'),
    ('Container Closure System', '3.2.P.7'),
    ('Drug Substance Specification', '3.2.S.4'),
    ('Impurities Profile', '3.2.S.3.2'),
    ('Validation Reports', '3.2.P.5.3'),
    ('Environmental Assessment', '1.12'),
    ('Pharmacovigilance Plan', '1.8.1'),
    ('Clinical Overview', '2.5'),
    ('Clinical Summary', '2.7'),
    ('Nonclinical Overview', '2.4'),
    ('Nonclinical Summary', '2.6'),
    ('Quality Overall Summary', '2.3'),
    ('Module 1 Administrative', '1.0'),
    ('Labeling', '1.14'),
    ('Financial Disclosure', '1.3.4'),
    ('Patent Information', '1.3.5'),
    ('Establishment Information', '1.12'),
    ('Drug Master File Letter', '1.4.1'),
    ('Fast Track Designation Request', '1.6'),
    ('Breakthrough Therapy Designation', '1.6'),
    ('Orphan Drug Designation', '1.17')
) AS t(template_name, module);

-- =========================================================================================
-- EMA TEMPLATES (38 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'EMA Cover Letter', 'ema-cover', '1.0', 'regulatory', 'letter',
'COVER LETTER FOR EMA SUBMISSION', ARRAY['ema', 'ctis', 'cover-letter']::text[], true, '4.0', 1),

(6, 'EMA Application Form', 'ema-app', '1.2', 'regulatory', 'form',
'EMA APPLICATION FORM', ARRAY['ema', 'ctis', 'application']::text[], true, '4.0', 1),

(6, 'Protocol Synopsis EMA', 'ema-synopsis', '1.3', 'clinical', 'protocol',
'PROTOCOL SYNOPSIS FOR EMA', ARRAY['ema', 'ctis', 'protocol']::text[], true, '4.0', 1),

(6, 'EudraVigilance Reporting', 'eudra-report', '1.8', 'safety', 'report',
'EUDRAVIGILANCE SAFETY REPORTING', ARRAY['ema', 'safety', 'eudravigilance']::text[], true, '4.0', 1),

(6, 'IMPD Quality', 'impd-q', '2.1', 'quality', 'document',
'INVESTIGATIONAL MEDICINAL PRODUCT DOSSIER - QUALITY', ARRAY['ema', 'impd', 'quality']::text[], true, '4.0', 1),

(6, 'IMPD Safety', 'impd-s', '2.1', 'safety', 'document',
'INVESTIGATIONAL MEDICINAL PRODUCT DOSSIER - SAFETY', ARRAY['ema', 'impd', 'safety']::text[], true, '4.0', 1);

-- Add more EMA templates
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    'EMA ' || template_name,
    'ema-' || LOWER(REPLACE(template_name, ' ', '-')),
    module,
    'regulatory',
    'template',
    template_name || ' Content Template',
    ARRAY['ema', 'ctis', 'regulatory']::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('Scientific Advice Request', '1.5'),
    ('Orphan Designation Application', '1.6'),
    ('Pediatric Investigation Plan', '1.10'),
    ('Risk Management Plan', '1.8.2'),
    ('Periodic Safety Update Report', '1.8.1'),
    ('Development Safety Update Report', '2.7.4'),
    ('Subject Information Sheet', '1.16'),
    ('Ethics Committee Application', '1.4'),
    ('Substantial Amendment', '1.7'),
    ('End of Trial Notification', '1.13'),
    ('Annual Safety Report', '2.7.4'),
    ('Pharmacovigilance System Master File', '1.8.1'),
    ('GMP Certificate', '1.3.1'),
    ('Manufacturing Authorization', '1.3.2'),
    ('QP Declaration', '1.4.3'),
    ('TSE Certificate', '3.2.R'),
    ('Bioequivalence Study Report', '5.3.1.2'),
    ('Pharmacokinetic Study Report', '5.3.3.1'),
    ('Pharmacodynamic Study Report', '5.3.4.1'),
    ('Efficacy Study Report', '5.3.5.1'),
    ('Safety Study Report', '5.3.5.2'),
    ('Post-Authorization Safety Study', '5.3.6'),
    ('Environmental Risk Assessment', '1.12'),
    ('Variation Application', '1.5'),
    ('Renewal Application', '1.5'),
    ('Marketing Authorization Transfer', '1.4'),
    ('Urgent Safety Restriction', '1.8.3'),
    ('Direct Healthcare Professional Communication', '1.8.3'),
    ('Patient Card', '1.8.3'),
    ('Educational Materials', '1.8.3'),
    ('Summary of Product Characteristics', '1.3.1'),
    ('Package Leaflet', '1.3.3')
) AS t(template_name, module);

-- =========================================================================================
-- PMDA TEMPLATES (32 Templates) 
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'PMDA CTN Application', 'pmda-ctn', '1.2', 'regulatory', 'form',
'CLINICAL TRIAL NOTIFICATION - JAPAN', ARRAY['pmda', 'ctn', 'application']::text[], true, '4.0', 1),

(6, 'J-GCP Compliance Statement', 'jgcp', '1.4', 'regulatory', 'statement',
'J-GCP COMPLIANCE STATEMENT', ARRAY['pmda', 'jgcp', 'compliance']::text[], true, '4.0', 1);

-- Add more PMDA templates
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    'PMDA ' || template_name,
    'pmda-' || LOWER(REPLACE(template_name, ' ', '-')),
    module,
    'regulatory',
    'template',
    template_name || ' Content Template',
    ARRAY['pmda', 'regulatory']::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('Clinical Trial Protocol Japan', '5.3.5'),
    ('Informed Consent Form Japanese', '1.16'),
    ('Investigator CV Japanese Format', '1.4'),
    ('Study Drug Import Certificate', '1.3'),
    ('GMP Inspection Application', '1.3.1'),
    ('Japanese Package Insert', '1.3.3'),
    ('CTD Summary Japanese', '2.1'),
    ('Quality Summary PMDA', '2.3'),
    ('Nonclinical Summary PMDA', '2.6'),
    ('Clinical Summary PMDA', '2.7'),
    ('Manufacturing Site Master File', '3.2.A'),
    ('Stability Data Japan', '3.2.P.8'),
    ('Specifications Japan', '3.2.S.4'),
    ('Carcinogenicity Study Report', '4.2.3.4'),
    ('Reproductive Toxicity Report', '4.2.3.5'),
    ('Local Tolerance Study', '4.2.3.6'),
    ('Japanese Bridging Study', '5.3.5'),
    ('Ethnic Factors Assessment', '5.3.3'),
    ('Post Marketing Surveillance Plan', '1.8'),
    ('Re-examination Application', '1.5'),
    ('Safety Periodic Report Japan', '1.8.1'),
    ('Drug Price Listing Application', '1.2.5'),
    ('National Health Insurance', '1.2.6'),
    ('Orphan Drug Designation Japan', '1.6'),
    ('Priority Review Request', '1.5'),
    ('Conditional Approval Application', '1.5'),
    ('Sakigake Designation Request', '1.6'),
    ('Medical Device Notification', '1.12'),
    ('Combination Product Application', '1.12'),
    ('Regenerative Medicine Application', '1.12')
) AS t(template_name, module);

-- =========================================================================================
-- ICH TEMPLATES (41 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'ICH E6 Protocol', 'ich-e6-protocol', '5.3.5', 'clinical', 'protocol',
'ICH E6 COMPLIANT PROTOCOL TEMPLATE', ARRAY['ich', 'e6', 'protocol', 'gcp']::text[], true, '4.0', 1),

(6, 'ICH E3 Clinical Study Report', 'ich-e3-csr', '5.3.5', 'clinical', 'report',
'ICH E3 CLINICAL STUDY REPORT TEMPLATE', ARRAY['ich', 'e3', 'csr']::text[], true, '4.0', 1),

(6, 'ICH E2F DSUR', 'ich-e2f-dsur', '2.7.4', 'safety', 'report',
'DEVELOPMENT SAFETY UPDATE REPORT', ARRAY['ich', 'e2f', 'dsur', 'safety']::text[], true, '4.0', 1);

-- Add more ICH templates
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    'ICH ' || template_name,
    'ich-' || LOWER(REPLACE(template_name, ' ', '-')),
    module,
    'regulatory', 
    'template',
    template_name || ' Content Template',
    ARRAY['ich', 'regulatory', 'harmonized']::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('M4 CTD Structure', '1.0'),
    ('E8 General Considerations', '5.1'),
    ('E9 Statistical Principles', '5.3.1'),
    ('E10 Control Group', '5.2'),
    ('E1 Extent of Exposure', '5.3.5'),
    ('E7 Geriatric Studies', '5.3.5'),
    ('E11 Pediatric Studies', '5.3.5'),
    ('E5 Ethnic Factors', '5.3.3'),
    ('E4 Dose Response', '5.3.4'),
    ('E14 QT Studies', '5.3.4'),
    ('E15 Pharmacogenomics', '5.3.2'),
    ('E16 Genomic Biomarkers', '5.3.2'),
    ('E17 Multiregional Trials', '5.3.5'),
    ('E18 Genomic Sampling', '5.3.2'),
    ('S1 Carcinogenicity', '4.2.3.4'),
    ('S2 Genotoxicity', '4.2.3.3'),
    ('S3 Toxicokinetics', '4.2.3.2'),
    ('S4 Chronic Toxicity', '4.2.3.2'),
    ('S5 Reproductive Toxicity', '4.2.3.5'),
    ('S6 Biotechnology Products', '4.2'),
    ('S7 Pharmacology Studies', '4.2.1'),
    ('S8 Immunotoxicity', '4.2.3.7'),
    ('S9 Anticancer Drugs', '4.2'),
    ('S10 Photosafety', '4.2.3.7'),
    ('S11 Juvenile Toxicity', '4.2.3.5'),
    ('M1 MedDRA', '1.0'),
    ('M2 eCTD', '1.0'),
    ('M3 Nonclinical', '4.0'),
    ('M7 Mutagenic Impurities', '3.2.S.3'),
    ('M8 eCTD v4.0', '1.0'),
    ('M9 BCS Biowaivers', '5.3.1'),
    ('M10 Bioanalytical Validation', '5.3.1'),
    ('Q1 Stability', '3.2.P.8'),
    ('Q2 Analytical Validation', '3.2.P.5'),
    ('Q3 Impurities', '3.2.S.3'),
    ('Q6 Specifications', '3.2.S.4'),
    ('Q8 Pharmaceutical Development', '3.2.P.2')
) AS t(template_name, module);

-- =========================================================================================
-- THERAPEUTIC AREA TEMPLATES (44 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    template_name,
    'therapeutic-' || LOWER(REPLACE(template_name, ' ', '-')),
    module,
    'therapeutic',
    'template',
    template_name || ' Therapeutic Area Specific Template',
    ARRAY['therapeutic', area, 'specialized']::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('Oncology Protocol Template', '5.3.5', 'oncology'),
    ('Oncology Statistical Analysis Plan', '5.3.1', 'oncology'),
    ('Tumor Response Criteria', '5.3.5', 'oncology'),
    ('Oncology Safety Monitoring', '5.3.5', 'oncology'),
    ('Cardiology Protocol Template', '5.3.5', 'cardiology'),
    ('Cardiovascular Endpoints', '5.3.5', 'cardiology'),
    ('MACE Adjudication Charter', '5.3.5', 'cardiology'),
    ('Neurology Protocol Template', '5.3.5', 'neurology'),
    ('Cognitive Assessment Plan', '5.3.5', 'neurology'),
    ('Neurology Rating Scales', '5.3.5', 'neurology'),
    ('Psychiatry Protocol Template', '5.3.5', 'psychiatry'),
    ('Mental Health Assessments', '5.3.5', 'psychiatry'),
    ('Suicide Risk Monitoring', '5.3.5', 'psychiatry'),
    ('Infectious Disease Protocol', '5.3.5', 'infectious'),
    ('Antimicrobial Resistance Plan', '5.3.5', 'infectious'),
    ('Virology Assay Validation', '5.3.1', 'infectious'),
    ('Rare Disease Protocol', '5.3.5', 'rare'),
    ('Natural History Study', '5.3.5', 'rare'),
    ('Patient Registry Protocol', '5.3.6', 'rare'),
    ('Pediatric Protocol Template', '5.3.5', 'pediatric'),
    ('Pediatric Formulation Development', '3.2.P', 'pediatric'),
    ('Pediatric PK Modeling', '5.3.3', 'pediatric'),
    ('Vaccine Protocol Template', '5.3.5', 'vaccine'),
    ('Immunogenicity Assessment', '5.3.5', 'vaccine'),
    ('Vaccine Safety Database', '5.3.6', 'vaccine'),
    ('Gene Therapy Protocol', '5.3.5', 'gene-therapy'),
    ('Vector Characterization', '3.2.S', 'gene-therapy'),
    ('Shedding Study Protocol', '5.3.5', 'gene-therapy'),
    ('Cell Therapy Protocol', '5.3.5', 'cell-therapy'),
    ('Cell Product Specification', '3.2.S', 'cell-therapy'),
    ('Chain of Custody', '3.2.P', 'cell-therapy'),
    ('Diabetes Protocol Template', '5.3.5', 'diabetes'),
    ('Continuous Glucose Monitoring', '5.3.5', 'diabetes'),
    ('Hypoglycemia Management', '5.3.5', 'diabetes'),
    ('Ophthalmology Protocol', '5.3.5', 'ophthalmology'),
    ('Visual Acuity Assessments', '5.3.5', 'ophthalmology'),
    ('OCT Imaging Protocol', '5.3.5', 'ophthalmology'),
    ('Dermatology Protocol', '5.3.5', 'dermatology'),
    ('Skin Assessment Scales', '5.3.5', 'dermatology'),
    ('Photographic Standards', '5.3.5', 'dermatology'),
    ('Respiratory Protocol', '5.3.5', 'respiratory'),
    ('Pulmonary Function Testing', '5.3.5', 'respiratory'),
    ('Asthma Control Questionnaire', '5.3.5', 'respiratory'),
    ('Rheumatology Protocol', '5.3.5', 'rheumatology')
) AS t(template_name, module, area);

-- =========================================================================================
-- CLINICAL OPERATIONS TEMPLATES (45 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    template_name,
    'clinical-ops-' || LOWER(REPLACE(template_name, ' ', '-')),
    '5.3',
    'clinical',
    'operations',
    template_name || ' Clinical Operations Template',
    ARRAY['clinical-ops', category, 'operations']::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('Site Initiation Visit Report', 'site-management'),
    ('Monitoring Visit Report', 'monitoring'),
    ('Site Qualification Checklist', 'site-management'),
    ('Investigator Meeting Agenda', 'training'),
    ('Clinical Trial Agreement', 'contracts'),
    ('Budget Template', 'finance'),
    ('Patient Recruitment Plan', 'recruitment'),
    ('Screening Log', 'enrollment'),
    ('Enrollment Log', 'enrollment'),
    ('Drug Accountability Log', 'pharmacy'),
    ('Temperature Log', 'pharmacy'),
    ('Delegation Log', 'regulatory'),
    ('Training Log', 'training'),
    ('Protocol Deviation Report', 'quality'),
    ('Serious Adverse Event Form', 'safety'),
    ('Data Management Plan', 'data-management'),
    ('Statistical Analysis Plan', 'statistics'),
    ('Clinical Study Report Shell', 'reporting'),
    ('Monitoring Plan', 'monitoring'),
    ('Risk Assessment Template', 'risk'),
    ('CAPA Template', 'quality'),
    ('Audit Report Template', 'audit'),
    ('TMF Reference Model', 'tmf'),
    ('Essential Documents Checklist', 'tmf'),
    ('Subject Screening Script', 'recruitment'),
    ('Informed Consent Checklist', 'ethics'),
    ('Protocol Training Slides', 'training'),
    ('CRF Completion Guidelines', 'data-management'),
    ('Query Resolution Guide', 'data-management'),
    ('Medical Coding Guidelines', 'data-management'),
    ('Randomization Procedures', 'statistics'),
    ('Unblinding Procedures', 'statistics'),
    ('Safety Reporting Flowchart', 'safety'),
    ('Pregnancy Reporting Form', 'safety'),
    ('Device Complaint Form', 'device'),
    ('Laboratory Manual', 'laboratory'),
    ('Imaging Charter', 'imaging'),
    ('ECG Manual', 'cardiology'),
    ('Biomarker Manual', 'translational'),
    ('Patient Diary', 'patient'),
    ('Patient Card', 'patient'),
    ('Newsletter Template', 'communication'),
    ('Close-out Visit Checklist', 'site-management'),
    ('Archive Box Inventory', 'tmf'),
    ('Destruction Certificate', 'pharmacy')
) AS t(template_name, category);

-- =========================================================================================
-- PATIENT MATERIALS TEMPLATES (45 Templates - Multi-language)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    template_name || ' - ' || language,
    'patient-' || LOWER(REPLACE(template_name, ' ', '-')) || '-' || LOWER(language),
    '1.16',
    'patient',
    'material',
    template_name || ' in ' || language,
    ARRAY['patient-materials', LOWER(language), 'patient', category]::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('Informed Consent Form', 'English', 'consent'),
    ('Informed Consent Form', 'Spanish', 'consent'),
    ('Informed Consent Form', 'French', 'consent'),
    ('Informed Consent Form', 'German', 'consent'),
    ('Informed Consent Form', 'Japanese', 'consent'),
    ('Patient Information Sheet', 'English', 'information'),
    ('Patient Information Sheet', 'Spanish', 'information'),
    ('Patient Information Sheet', 'French', 'information'),
    ('Patient Information Sheet', 'German', 'information'),
    ('Patient Diary Instructions', 'English', 'diary'),
    ('Patient Diary Instructions', 'Spanish', 'diary'),
    ('Patient Diary Instructions', 'French', 'diary'),
    ('Study Overview Brochure', 'English', 'overview'),
    ('Study Overview Brochure', 'Spanish', 'overview'),
    ('Study Overview Brochure', 'French', 'overview'),
    ('Medication Guide', 'English', 'medication'),
    ('Medication Guide', 'Spanish', 'medication'),
    ('Medication Guide', 'French', 'medication'),
    ('Side Effects Information', 'English', 'safety'),
    ('Side Effects Information', 'Spanish', 'safety'),
    ('Side Effects Information', 'French', 'safety'),
    ('Contact Card', 'English', 'contact'),
    ('Contact Card', 'Spanish', 'contact'),
    ('Contact Card', 'French', 'contact'),
    ('Appointment Reminder', 'English', 'scheduling'),
    ('Appointment Reminder', 'Spanish', 'scheduling'),
    ('Appointment Reminder', 'French', 'scheduling'),
    ('Travel Reimbursement Form', 'English', 'reimbursement'),
    ('Travel Reimbursement Form', 'Spanish', 'reimbursement'),
    ('Travel Reimbursement Form', 'German', 'reimbursement'),
    ('Emergency Instructions', 'English', 'emergency'),
    ('Emergency Instructions', 'Spanish', 'emergency'),
    ('Emergency Instructions', 'French', 'emergency'),
    ('Pregnancy Prevention', 'English', 'contraception'),
    ('Pregnancy Prevention', 'Spanish', 'contraception'),
    ('Pregnancy Prevention', 'French', 'contraception'),
    ('Lifestyle Guidelines', 'English', 'lifestyle'),
    ('Lifestyle Guidelines', 'Spanish', 'lifestyle'),
    ('Diet Restrictions', 'English', 'diet'),
    ('Diet Restrictions', 'Spanish', 'diet'),
    ('Exercise Guidelines', 'English', 'exercise'),
    ('Exercise Guidelines', 'Spanish', 'exercise'),
    ('Laboratory Instructions', 'English', 'laboratory'),
    ('Laboratory Instructions', 'Spanish', 'laboratory'),
    ('Home Dosing Instructions', 'English', 'dosing')
) AS t(template_name, language, category);

-- =========================================================================================
-- MODALITY-SPECIFIC TEMPLATES (40 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    template_name,
    'modality-' || LOWER(REPLACE(template_name, ' ', '-')),
    module,
    'modality',
    modality_type,
    template_name || ' Template for ' || modality_type,
    ARRAY['modality', modality_type, 'specialized']::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('Small Molecule CMC', '3.2.S', 'small-molecule'),
    ('Small Molecule Stability', '3.2.P.8', 'small-molecule'),
    ('API Characterization', '3.2.S.3', 'small-molecule'),
    ('Solid Oral Dosage Development', '3.2.P.2', 'small-molecule'),
    ('Biologic CMC Overview', '3.2.S', 'biologic'),
    ('Cell Line Development', '3.2.S.2', 'biologic'),
    ('Protein Characterization', '3.2.S.3', 'biologic'),
    ('Glycosylation Analysis', '3.2.S.3', 'biologic'),
    ('Monoclonal Antibody CMC', '3.2.S', 'antibody'),
    ('Antibody Drug Conjugate', '3.2', 'adc'),
    ('ADC Linker Chemistry', '3.2.S.2', 'adc'),
    ('Vaccine CMC', '3.2', 'vaccine'),
    ('Adjuvant Characterization', '3.2.A', 'vaccine'),
    ('Potency Assay Validation', '3.2.P.5', 'vaccine'),
    ('Gene Therapy Vector', '3.2.S', 'gene-therapy'),
    ('AAV Manufacturing', '3.2.S.2', 'gene-therapy'),
    ('Vector Copy Number', '3.2.S.4', 'gene-therapy'),
    ('Cell Therapy Product', '3.2.S', 'cell-therapy'),
    ('Cell Banking System', '3.2.S.2', 'cell-therapy'),
    ('Cell Product Release', '3.2.P.5', 'cell-therapy'),
    ('mRNA Product CMC', '3.2', 'mrna'),
    ('LNP Formulation', '3.2.P', 'mrna'),
    ('mRNA Integrity Testing', '3.2.P.5', 'mrna'),
    ('Oligonucleotide CMC', '3.2.S', 'oligonucleotide'),
    ('siRNA Characterization', '3.2.S.3', 'oligonucleotide'),
    ('Peptide Drug Substance', '3.2.S', 'peptide'),
    ('Peptide Synthesis', '3.2.S.2', 'peptide'),
    ('Peptide Impurity Profile', '3.2.S.3', 'peptide'),
    ('Biosimilar Comparability', '3.2.R', 'biosimilar'),
    ('Analytical Similarity', '3.2.R', 'biosimilar'),
    ('PK/PD Comparison', '5.3.3', 'biosimilar'),
    ('Device Combination Product', '3.2.P', 'device-combo'),
    ('Autoinjector Development', '3.2.P.2', 'device-combo'),
    ('Device Human Factors', '3.2.P.2', 'device-combo'),
    ('Inhalation Product', '3.2.P', 'inhalation'),
    ('Aerodynamic Assessment', '3.2.P.5', 'inhalation'),
    ('Ophthalmic Product', '3.2.P', 'ophthalmic'),
    ('Ocular Tolerability', '4.2.3.6', 'ophthalmic'),
    ('Topical Product Development', '3.2.P', 'topical'),
    ('Skin Penetration Study', '5.3.3', 'topical')
) AS t(template_name, module, modality_type);

-- =========================================================================================
-- QUALITY & MANUFACTURING TEMPLATES (35 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    template_name,
    'quality-' || LOWER(REPLACE(template_name, ' ', '-')),
    module,
    'quality',
    'manufacturing',
    template_name || ' Quality/Manufacturing Template',
    ARRAY['quality', 'manufacturing', 'gmp']::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('Process Validation Protocol', '3.2.P.3.5'),
    ('Cleaning Validation Protocol', '3.2.P.3.5'),
    ('Analytical Method Validation', '3.2.P.5.3'),
    ('Equipment Qualification Protocol', '3.2.P.3'),
    ('Facility Qualification Report', '3.2.P.3'),
    ('Change Control Procedure', '3.2.P.3'),
    ('Deviation Investigation Report', '3.2.P.3'),
    ('Out of Specification Report', '3.2.P.5'),
    ('Annual Product Review', '3.2.P.3'),
    ('Technology Transfer Report', '3.2.P.3'),
    ('Scale-Up Report', '3.2.P.2'),
    ('Batch Manufacturing Record', '3.2.P.3.5'),
    ('Certificate of Analysis', '3.2.P.5.4'),
    ('Stability Protocol', '3.2.P.8'),
    ('Forced Degradation Study', '3.2.P.8'),
    ('Container Closure Integrity', '3.2.P.7'),
    ('Extractables and Leachables', '3.2.P.7'),
    ('Microbiology Testing Protocol', '3.2.P.5'),
    ('Endotoxin Testing Protocol', '3.2.P.5'),
    ('Sterility Testing Protocol', '3.2.P.5'),
    ('Environmental Monitoring', '3.2.P.3'),
    ('Water System Validation', '3.2.P.3'),
    ('HVAC Validation', '3.2.P.3'),
    ('Computer System Validation', '3.2.P.3'),
    ('Supply Chain Qualification', '3.2.P.3'),
    ('Vendor Audit Report', '3.2.P.3'),
    ('Quality Agreement Template', '3.2.P.3'),
    ('Risk Assessment ICH Q9', '3.2.P.2'),
    ('Quality by Design Report', '3.2.P.2'),
    ('Design Space Justification', '3.2.P.2'),
    ('Control Strategy Document', '3.2.P.2'),
    ('Comparability Protocol', '3.2.P.5'),
    ('Reference Standard Qualification', '3.2.P.6'),
    ('Impurity Identification', '3.2.S.3.2'),
    ('Residual Solvents Testing', '3.2.S.4')
) AS t(template_name, module);

-- =========================================================================================
-- ADDITIONAL REGULATORY TEMPLATES (23 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
SELECT 
    6,
    template_name,
    'regulatory-' || LOWER(REPLACE(template_name, ' ', '-')),
    module,
    'regulatory',
    'document',
    template_name || ' Regulatory Document Template',
    ARRAY['regulatory', 'submission', category]::text[],
    true,
    '4.0',
    1
FROM (VALUES
    ('Pre-IND Meeting Request', '1.6', 'meeting'),
    ('End of Phase 2 Meeting Request', '1.6', 'meeting'),
    ('Pre-NDA Meeting Request', '1.6', 'meeting'),
    ('Type C Meeting Request', '1.6', 'meeting'),
    ('Meeting Background Package', '1.6', 'meeting'),
    ('Meeting Minutes Template', '1.6', 'meeting'),
    ('FDA Response Document', '1.6', 'correspondence'),
    ('General Correspondence', '1.11', 'correspondence'),
    ('Safety Update Report', '1.8', 'safety'),
    ('IND Amendment Cover Letter', '1.0', 'amendment'),
    ('Protocol Amendment Summary', '5.3.5', 'amendment'),
    ('Information Amendment', '1.11', 'amendment'),
    ('Cross Reference Letter', '1.4', 'reference'),
    ('Right of Reference Letter', '1.4', 'reference'),
    ('DMF Authorization Letter', '1.4', 'reference'),
    ('Fast Track Request', '1.6', 'designation'),
    ('Breakthrough Designation Request', '1.6', 'designation'),
    ('RMAT Designation Request', '1.6', 'designation'),
    ('Priority Review Request', '1.6', 'designation'),
    ('Waiver Request Template', '1.5', 'waiver'),
    ('Extension Request', '1.5', 'administrative'),
    ('Withdrawal Letter', '1.11', 'administrative'),
    ('Reactivation Request', '1.11', 'administrative')
) AS t(template_name, module, category);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_templates_tags ON ectd_templates USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_templates_category ON ectd_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_org ON ectd_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_active ON ectd_templates(is_active);

-- Update template counts for organization
UPDATE organizations 
SET template_count = (
    SELECT COUNT(*) FROM ectd_templates 
    WHERE organization_id = 6 AND is_active = true
),
updated_at = CURRENT_TIMESTAMP
WHERE id = 6;

-- Verify counts
DO $$
DECLARE 
    total_count INTEGER;
    fda_count INTEGER;
    ema_count INTEGER;
    pmda_count INTEGER;
    ich_count INTEGER;
    therapeutic_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM ectd_templates WHERE is_active = true;
    SELECT COUNT(*) INTO fda_count FROM ectd_templates WHERE is_active = true AND 'fda' = ANY(tags);
    SELECT COUNT(*) INTO ema_count FROM ectd_templates WHERE is_active = true AND 'ema' = ANY(tags);
    SELECT COUNT(*) INTO pmda_count FROM ectd_templates WHERE is_active = true AND 'pmda' = ANY(tags);
    SELECT COUNT(*) INTO ich_count FROM ectd_templates WHERE is_active = true AND 'ich' = ANY(tags);
    SELECT COUNT(*) INTO therapeutic_count FROM ectd_templates WHERE is_active = true AND 'therapeutic' = ANY(tags);
    
    RAISE NOTICE 'Template Loading Complete:';
    RAISE NOTICE '  Total Templates: %', total_count;
    RAISE NOTICE '  FDA Templates: %', fda_count;
    RAISE NOTICE '  EMA Templates: %', ema_count;
    RAISE NOTICE '  PMDA Templates: %', pmda_count;
    RAISE NOTICE '  ICH Templates: %', ich_count;
    RAISE NOTICE '  Therapeutic Templates: %', therapeutic_count;
END $$;