-- =========================================================================================
-- LOAD ALL 388 REGULATORY TEMPLATES - COMPLETE VERSION
-- Version: 5.0.0
-- Last Updated: 2025-01-22
-- =========================================================================================

-- Clear existing templates for fresh start
DELETE FROM ectd_templates WHERE organization_id IN (1, 6, 7);

-- =========================================================================================
-- FDA TEMPLATES (45 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, placeholders, ich_guidance, tags, is_active, is_default, version, usage_count, created_by)
VALUES
-- FDA Core Forms (10)
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

5. PHASE(S) OF CLINICAL INVESTIGATION: {{clinical_phases}}', 
'{"sponsor_name": {"type": "text", "required": true}}'::jsonb,
'FDA Form 1571 per 21 CFR 312.23',
ARRAY['fda', 'ind', 'form-1571', 'required']::text[],
true, true, '5.0', 0, 1),

(6, 'FDA Form 1572 - Statement of Investigator', 'form-1572', '1.2', 'regulatory', 'form',
'STATEMENT OF INVESTIGATOR', '{"investigator_name": {"type": "text"}}'::jsonb,
'FDA Form 1572', ARRAY['fda', 'ind', 'form-1572']::text[], true, true, '5.0', 0, 1),

(6, 'FDA Form 3674 - Certification of Compliance', 'form-3674', '1.2', 'regulatory', 'form',
'CERTIFICATION OF COMPLIANCE WITH CLINICALTRIALS.GOV', '{}'::jsonb, 
'FDA Form 3674', ARRAY['fda', 'ind', 'form-3674']::text[], true, false, '5.0', 0, 1),

(6, 'FDA Form 356h - Application to Market', 'form-356h', '1.2', 'regulatory', 'form',
'APPLICATION TO MARKET A NEW DRUG', '{}'::jsonb, 
'FDA Form 356h', ARRAY['fda', 'nda', 'form-356h']::text[], true, false, '5.0', 0, 1),

(6, 'FDA Form 3500A - Adverse Event Reporting', 'form-3500a', '1.8', 'safety', 'form',
'MEDWATCH ADVERSE EVENT REPORT', '{}'::jsonb,
'FDA Form 3500A', ARRAY['fda', 'safety', 'form-3500a']::text[], true, false, '5.0', 0, 1),

(6, 'FDA Form 483 - Inspectional Observations', 'form-483', '1.11', 'quality', 'form',
'INSPECTIONAL OBSERVATIONS', '{}'::jsonb,
'FDA Form 483', ARRAY['fda', 'inspection', 'form-483']::text[], true, false, '5.0', 0, 1),

(6, 'FDA Form 1815 - Fast Track Designation', 'form-1815', '1.6', 'regulatory', 'form',
'FAST TRACK DESIGNATION REQUEST', '{}'::jsonb,
'FDA Fast Track', ARRAY['fda', 'ind', 'fast-track']::text[], true, false, '5.0', 0, 1),

(6, 'FDA Form 2253 - Promotional Materials', 'form-2253', '1.14', 'regulatory', 'form',
'PROMOTIONAL MATERIALS SUBMISSION', '{}'::jsonb,
'FDA Form 2253', ARRAY['fda', 'promotion']::text[], true, false, '5.0', 0, 1),

(6, 'FDA Form 3926 - Pediatric Study', 'form-3926', '1.9', 'clinical', 'form',
'PEDIATRIC STUDY PLAN', '{}'::jsonb,
'FDA PSP', ARRAY['fda', 'pediatric']::text[], true, false, '5.0', 0, 1),

(6, 'FDA Form 3397 - User Fee Cover Sheet', 'form-3397', '1.2', 'administrative', 'form',
'USER FEE COVER SHEET', '{}'::jsonb,
'FDA User Fees', ARRAY['fda', 'administrative']::text[], true, false, '5.0', 0, 1);

-- FDA Clinical Templates (11-25)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'FDA Clinical Protocol Template', 'fda-protocol', '5.3.5', 'clinical', 'template',
'CLINICAL PROTOCOL TEMPLATE', ARRAY['fda', 'clinical', 'protocol']::text[], true, '5.0', 1),

(6, 'FDA Informed Consent Form', 'fda-icf', '1.16', 'clinical', 'template',
'INFORMED CONSENT FORM', ARRAY['fda', 'clinical', 'icf']::text[], true, '5.0', 1),

(6, 'FDA Case Report Form', 'fda-crf', '5.3.2', 'clinical', 'template',
'CASE REPORT FORM', ARRAY['fda', 'clinical', 'crf']::text[], true, '5.0', 1),

(6, 'FDA Statistical Analysis Plan', 'fda-sap', '5.3.1', 'clinical', 'template',
'STATISTICAL ANALYSIS PLAN', ARRAY['fda', 'clinical', 'sap']::text[], true, '5.0', 1),

(6, 'FDA Data Safety Monitoring Plan', 'fda-dsmp', '5.3.4', 'safety', 'template',
'DATA SAFETY MONITORING PLAN', ARRAY['fda', 'safety', 'dsmp']::text[], true, '5.0', 1),

(6, 'FDA Clinical Study Report', 'fda-csr', '5.3.5', 'clinical', 'template',
'CLINICAL STUDY REPORT', ARRAY['fda', 'clinical', 'csr']::text[], true, '5.0', 1),

(6, 'FDA Patient Reported Outcomes', 'fda-pro', '5.3.5', 'clinical', 'template',
'PATIENT REPORTED OUTCOMES', ARRAY['fda', 'clinical', 'pro']::text[], true, '5.0', 1),

(6, 'FDA IND Safety Report', 'fda-safety', '2.6', 'safety', 'report',
'IND SAFETY REPORT', ARRAY['fda', 'ind', 'safety']::text[], true, '5.0', 1),

(6, 'FDA Annual Report', 'fda-annual', '1.4', 'regulatory', 'report',
'ANNUAL REPORT FOR IND', ARRAY['fda', 'ind', 'annual']::text[], true, '5.0', 1),

(6, 'FDA Protocol Amendment', 'fda-amendment', '5.3', 'clinical', 'protocol',
'PROTOCOL AMENDMENT', ARRAY['fda', 'ind', 'protocol']::text[], true, '5.0', 1),

(6, 'FDA Investigator Brochure', 'fda-ib', '2.5', 'clinical', 'document',
'INVESTIGATOR BROCHURE', ARRAY['fda', 'ind', 'ib']::text[], true, '5.0', 1),

(6, 'FDA Clinical Overview', 'fda-clinical-overview', '2.5', 'clinical', 'document',
'CLINICAL OVERVIEW', ARRAY['fda', 'clinical']::text[], true, '5.0', 1),

(6, 'FDA Clinical Summary', 'fda-clinical-summary', '2.7', 'clinical', 'document',
'CLINICAL SUMMARY', ARRAY['fda', 'clinical']::text[], true, '5.0', 1),

(6, 'FDA Bioanalytical Method Validation', 'fda-bmv', '2.7.1', 'quality', 'template',
'BIOANALYTICAL METHOD VALIDATION', ARRAY['fda', 'quality', 'bmv']::text[], true, '5.0', 1),

(6, 'FDA REMS Template', 'fda-rems', '1.16', 'safety', 'template',
'RISK EVALUATION AND MITIGATION STRATEGY', ARRAY['fda', 'safety', 'rems']::text[], true, '5.0', 1);

-- FDA Quality/CMC Templates (26-35)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'FDA CMC Information', 'fda-cmc', '2.3', 'quality', 'document',
'CHEMISTRY, MANUFACTURING AND CONTROLS', ARRAY['fda', 'ind', 'cmc']::text[], true, '5.0', 1),

(6, 'FDA Manufacturing Process Description', 'fda-mpd', '3.2.P.3', 'quality', 'template',
'MANUFACTURING PROCESS DESCRIPTION', ARRAY['fda', 'quality', 'manufacturing']::text[], true, '5.0', 1),

(6, 'FDA Batch Records', 'fda-batch', '3.2.P.3.5', 'quality', 'template',
'BATCH RECORDS', ARRAY['fda', 'quality', 'batch']::text[], true, '5.0', 1),

(6, 'FDA Stability Protocol', 'fda-stability', '3.2.P.8', 'quality', 'template',
'STABILITY PROTOCOL', ARRAY['fda', 'quality', 'stability']::text[], true, '5.0', 1),

(6, 'FDA Analytical Procedures', 'fda-analytical', '3.2.P.5.2', 'quality', 'template',
'ANALYTICAL PROCEDURES', ARRAY['fda', 'quality', 'analytical']::text[], true, '5.0', 1),

(6, 'FDA Reference Standards', 'fda-reference', '3.2.P.6', 'quality', 'template',
'REFERENCE STANDARDS', ARRAY['fda', 'quality', 'reference']::text[], true, '5.0', 1),

(6, 'FDA Container Closure System', 'fda-container', '3.2.P.7', 'quality', 'template',
'CONTAINER CLOSURE SYSTEM', ARRAY['fda', 'quality', 'container']::text[], true, '5.0', 1),

(6, 'FDA Drug Substance Specification', 'fda-ds-spec', '3.2.S.4', 'quality', 'template',
'DRUG SUBSTANCE SPECIFICATION', ARRAY['fda', 'quality', 'specification']::text[], true, '5.0', 1),

(6, 'FDA Impurities Profile', 'fda-impurities', '3.2.S.3.2', 'quality', 'template',
'IMPURITIES PROFILE', ARRAY['fda', 'quality', 'impurities']::text[], true, '5.0', 1),

(6, 'FDA Validation Reports', 'fda-validation', '3.2.P.5.3', 'quality', 'template',
'VALIDATION REPORTS', ARRAY['fda', 'quality', 'validation']::text[], true, '5.0', 1);

-- FDA Administrative Templates (36-45)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'FDA Environmental Assessment', 'fda-ea', '1.12', 'regulatory', 'template',
'ENVIRONMENTAL ASSESSMENT', ARRAY['fda', 'environmental']::text[], true, '5.0', 1),

(6, 'FDA Pharmacovigilance Plan', 'fda-pvp', '1.8.1', 'safety', 'template',
'PHARMACOVIGILANCE PLAN', ARRAY['fda', 'safety', 'pharmacovigilance']::text[], true, '5.0', 1),

(6, 'FDA Quality Overall Summary', 'fda-qos', '2.3', 'quality', 'document',
'QUALITY OVERALL SUMMARY', ARRAY['fda', 'quality', 'summary']::text[], true, '5.0', 1),

(6, 'FDA Module 1 Administrative', 'fda-m1', '1.0', 'administrative', 'template',
'MODULE 1 ADMINISTRATIVE', ARRAY['fda', 'administrative']::text[], true, '5.0', 1),

(6, 'FDA Labeling', 'fda-labeling', '1.14', 'regulatory', 'template',
'LABELING', ARRAY['fda', 'labeling']::text[], true, '5.0', 1),

(6, 'FDA Financial Disclosure', 'fda-financial', '1.3.4', 'administrative', 'template',
'FINANCIAL DISCLOSURE', ARRAY['fda', 'administrative', 'financial']::text[], true, '5.0', 1),

(6, 'FDA Patent Information', 'fda-patent', '1.3.5', 'administrative', 'template',
'PATENT INFORMATION', ARRAY['fda', 'administrative', 'patent']::text[], true, '5.0', 1),

(6, 'FDA Establishment Information', 'fda-establishment', '1.12', 'administrative', 'template',
'ESTABLISHMENT INFORMATION', ARRAY['fda', 'administrative', 'establishment']::text[], true, '5.0', 1),

(6, 'FDA Drug Master File Letter', 'fda-dmf', '1.4.1', 'regulatory', 'template',
'DRUG MASTER FILE LETTER', ARRAY['fda', 'dmf']::text[], true, '5.0', 1),

(6, 'FDA Breakthrough Therapy Designation', 'fda-btd', '1.6', 'regulatory', 'template',
'BREAKTHROUGH THERAPY DESIGNATION', ARRAY['fda', 'breakthrough']::text[], true, '5.0', 1);

-- =========================================================================================
-- EMA TEMPLATES (38 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
-- EMA Core Forms (1-10)
(6, 'EMA Cover Letter', 'ema-cover', '1.0', 'regulatory', 'letter',
'COVER LETTER FOR EMA SUBMISSION', ARRAY['ema', 'ctis', 'cover-letter']::text[], true, '5.0', 1),

(6, 'EMA Application Form', 'ema-app', '1.2', 'regulatory', 'form',
'EMA APPLICATION FORM', ARRAY['ema', 'ctis', 'application']::text[], true, '5.0', 1),

(6, 'EMA Protocol Synopsis', 'ema-synopsis', '1.3', 'clinical', 'protocol',
'PROTOCOL SYNOPSIS FOR EMA', ARRAY['ema', 'ctis', 'protocol']::text[], true, '5.0', 1),

(6, 'EMA EudraVigilance Reporting', 'ema-eudra', '1.8', 'safety', 'report',
'EUDRAVIGILANCE SAFETY REPORTING', ARRAY['ema', 'safety', 'eudravigilance']::text[], true, '5.0', 1),

(6, 'EMA IMPD Quality', 'ema-impd-q', '2.1', 'quality', 'document',
'INVESTIGATIONAL MEDICINAL PRODUCT DOSSIER - QUALITY', ARRAY['ema', 'impd', 'quality']::text[], true, '5.0', 1),

(6, 'EMA IMPD Safety', 'ema-impd-s', '2.1', 'safety', 'document',
'INVESTIGATIONAL MEDICINAL PRODUCT DOSSIER - SAFETY', ARRAY['ema', 'impd', 'safety']::text[], true, '5.0', 1),

(6, 'EMA Scientific Advice Request', 'ema-sa', '1.5', 'regulatory', 'template',
'SCIENTIFIC ADVICE REQUEST', ARRAY['ema', 'scientific-advice']::text[], true, '5.0', 1),

(6, 'EMA Orphan Designation Application', 'ema-orphan', '1.6', 'regulatory', 'template',
'ORPHAN DESIGNATION APPLICATION', ARRAY['ema', 'orphan']::text[], true, '5.0', 1),

(6, 'EMA Pediatric Investigation Plan', 'ema-pip', '1.10', 'clinical', 'template',
'PEDIATRIC INVESTIGATION PLAN', ARRAY['ema', 'pediatric', 'pip']::text[], true, '5.0', 1),

(6, 'EMA Risk Management Plan', 'ema-rmp', '1.8.2', 'safety', 'template',
'RISK MANAGEMENT PLAN', ARRAY['ema', 'safety', 'rmp']::text[], true, '5.0', 1);

-- EMA Safety & Reporting Templates (11-20)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'EMA Periodic Safety Update Report', 'ema-psur', '1.8.1', 'safety', 'report',
'PERIODIC SAFETY UPDATE REPORT', ARRAY['ema', 'safety', 'psur']::text[], true, '5.0', 1),

(6, 'EMA Development Safety Update Report', 'ema-dsur', '2.7.4', 'safety', 'report',
'DEVELOPMENT SAFETY UPDATE REPORT', ARRAY['ema', 'safety', 'dsur']::text[], true, '5.0', 1),

(6, 'EMA Subject Information Sheet', 'ema-sis', '1.16', 'clinical', 'template',
'SUBJECT INFORMATION SHEET', ARRAY['ema', 'clinical', 'patient']::text[], true, '5.0', 1),

(6, 'EMA Ethics Committee Application', 'ema-ethics', '1.4', 'regulatory', 'template',
'ETHICS COMMITTEE APPLICATION', ARRAY['ema', 'ethics']::text[], true, '5.0', 1),

(6, 'EMA Substantial Amendment', 'ema-amendment', '1.7', 'regulatory', 'template',
'SUBSTANTIAL AMENDMENT', ARRAY['ema', 'amendment']::text[], true, '5.0', 1),

(6, 'EMA End of Trial Notification', 'ema-eot', '1.13', 'regulatory', 'template',
'END OF TRIAL NOTIFICATION', ARRAY['ema', 'eot']::text[], true, '5.0', 1),

(6, 'EMA Annual Safety Report', 'ema-asr', '2.7.4', 'safety', 'report',
'ANNUAL SAFETY REPORT', ARRAY['ema', 'safety', 'annual']::text[], true, '5.0', 1),

(6, 'EMA Pharmacovigilance System Master File', 'ema-psmf', '1.8.1', 'safety', 'template',
'PHARMACOVIGILANCE SYSTEM MASTER FILE', ARRAY['ema', 'safety', 'psmf']::text[], true, '5.0', 1),

(6, 'EMA Urgent Safety Restriction', 'ema-usr', '1.8.3', 'safety', 'template',
'URGENT SAFETY RESTRICTION', ARRAY['ema', 'safety', 'urgent']::text[], true, '5.0', 1),

(6, 'EMA DHPC Communication', 'ema-dhpc', '1.8.3', 'safety', 'template',
'DIRECT HEALTHCARE PROFESSIONAL COMMUNICATION', ARRAY['ema', 'safety', 'dhpc']::text[], true, '5.0', 1);

-- EMA Quality & Manufacturing Templates (21-30)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'EMA GMP Certificate', 'ema-gmp', '1.3.1', 'quality', 'certificate',
'GMP CERTIFICATE', ARRAY['ema', 'quality', 'gmp']::text[], true, '5.0', 1),

(6, 'EMA Manufacturing Authorization', 'ema-mfg-auth', '1.3.2', 'quality', 'authorization',
'MANUFACTURING AUTHORIZATION', ARRAY['ema', 'quality', 'manufacturing']::text[], true, '5.0', 1),

(6, 'EMA QP Declaration', 'ema-qp', '1.4.3', 'quality', 'declaration',
'QP DECLARATION', ARRAY['ema', 'quality', 'qp']::text[], true, '5.0', 1),

(6, 'EMA TSE Certificate', 'ema-tse', '3.2.R', 'quality', 'certificate',
'TSE CERTIFICATE', ARRAY['ema', 'quality', 'tse']::text[], true, '5.0', 1),

(6, 'EMA Bioequivalence Study Report', 'ema-be', '5.3.1.2', 'clinical', 'report',
'BIOEQUIVALENCE STUDY REPORT', ARRAY['ema', 'clinical', 'bioequivalence']::text[], true, '5.0', 1),

(6, 'EMA Pharmacokinetic Study Report', 'ema-pk', '5.3.3.1', 'clinical', 'report',
'PHARMACOKINETIC STUDY REPORT', ARRAY['ema', 'clinical', 'pk']::text[], true, '5.0', 1),

(6, 'EMA Pharmacodynamic Study Report', 'ema-pd', '5.3.4.1', 'clinical', 'report',
'PHARMACODYNAMIC STUDY REPORT', ARRAY['ema', 'clinical', 'pd']::text[], true, '5.0', 1),

(6, 'EMA Efficacy Study Report', 'ema-efficacy', '5.3.5.1', 'clinical', 'report',
'EFFICACY STUDY REPORT', ARRAY['ema', 'clinical', 'efficacy']::text[], true, '5.0', 1),

(6, 'EMA Safety Study Report', 'ema-safety-study', '5.3.5.2', 'safety', 'report',
'SAFETY STUDY REPORT', ARRAY['ema', 'safety', 'study']::text[], true, '5.0', 1),

(6, 'EMA Post-Authorization Safety Study', 'ema-pass', '5.3.6', 'safety', 'study',
'POST-AUTHORIZATION SAFETY STUDY', ARRAY['ema', 'safety', 'pass']::text[], true, '5.0', 1);

-- EMA Administrative Templates (31-38)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'EMA Environmental Risk Assessment', 'ema-era', '1.12', 'regulatory', 'assessment',
'ENVIRONMENTAL RISK ASSESSMENT', ARRAY['ema', 'environmental']::text[], true, '5.0', 1),

(6, 'EMA Variation Application', 'ema-variation', '1.5', 'regulatory', 'application',
'VARIATION APPLICATION', ARRAY['ema', 'variation']::text[], true, '5.0', 1),

(6, 'EMA Renewal Application', 'ema-renewal', '1.5', 'regulatory', 'application',
'RENEWAL APPLICATION', ARRAY['ema', 'renewal']::text[], true, '5.0', 1),

(6, 'EMA Marketing Authorization Transfer', 'ema-mat', '1.4', 'regulatory', 'transfer',
'MARKETING AUTHORIZATION TRANSFER', ARRAY['ema', 'mat']::text[], true, '5.0', 1),

(6, 'EMA Article 57 Database', 'ema-art57', '1.2', 'administrative', 'database',
'ARTICLE 57 DATABASE SUBMISSION', ARRAY['ema', 'article57']::text[], true, '5.0', 1),

(6, 'EMA XEVMPD Submission', 'ema-xevmpd', '1.2', 'administrative', 'submission',
'XEVMPD SUBMISSION', ARRAY['ema', 'xevmpd']::text[], true, '5.0', 1),

(6, 'EMA IDMP Compliance', 'ema-idmp', '1.2', 'administrative', 'compliance',
'IDMP COMPLIANCE DOCUMENTATION', ARRAY['ema', 'idmp']::text[], true, '5.0', 1),

(6, 'EMA Sunset Clause Response', 'ema-sunset', '1.4', 'regulatory', 'response',
'SUNSET CLAUSE RESPONSE', ARRAY['ema', 'sunset']::text[], true, '5.0', 1);

-- =========================================================================================
-- PMDA TEMPLATES (30 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
-- PMDA Core Templates (1-10)
(6, 'PMDA CTN Application', 'pmda-ctn', '1.2', 'regulatory', 'application',
'CLINICAL TRIAL NOTIFICATION', ARRAY['pmda', 'ctn', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA J-NDA Application', 'pmda-jnda', '1.2', 'regulatory', 'application',
'JAPANESE NEW DRUG APPLICATION', ARRAY['pmda', 'jnda', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Protocol Development', 'pmda-protocol', '5.3', 'clinical', 'protocol',
'JAPANESE CLINICAL PROTOCOL', ARRAY['pmda', 'protocol', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA GCP Compliance', 'pmda-gcp', '1.3', 'quality', 'compliance',
'J-GCP COMPLIANCE DOCUMENTATION', ARRAY['pmda', 'gcp', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Consultation Meeting', 'pmda-consultation', '1.5', 'regulatory', 'meeting',
'PMDA CONSULTATION MEETING PACKAGE', ARRAY['pmda', 'consultation', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Bridging Study', 'pmda-bridging', '5.3.5', 'clinical', 'study',
'BRIDGING STUDY REPORT', ARRAY['pmda', 'bridging', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Japanese Labeling', 'pmda-labeling', '1.14', 'regulatory', 'labeling',
'JAPANESE PRODUCT LABELING', ARRAY['pmda', 'labeling', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Package Insert', 'pmda-pi', '1.14', 'regulatory', 'insert',
'JAPANESE PACKAGE INSERT', ARRAY['pmda', 'package-insert', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Risk Management Plan', 'pmda-rmp', '1.8.2', 'safety', 'plan',
'J-RMP RISK MANAGEMENT PLAN', ARRAY['pmda', 'rmp', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA GPSP Study', 'pmda-gpsp', '5.3.6', 'safety', 'study',
'GPSP POST-MARKETING SURVEILLANCE', ARRAY['pmda', 'gpsp', 'japan']::text[], true, '5.0', 1);

-- PMDA Safety & Quality Templates (11-20)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'PMDA EPPV Report', 'pmda-eppv', '1.8', 'safety', 'report',
'EARLY POST-MARKETING PHASE VIGILANCE', ARRAY['pmda', 'eppv', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Periodic Benefit-Risk Report', 'pmda-pbrr', '1.8.1', 'safety', 'report',
'PERIODIC BENEFIT-RISK EVALUATION REPORT', ARRAY['pmda', 'pbrr', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Safety Specification', 'pmda-ss', '1.8.2', 'safety', 'specification',
'SAFETY SPECIFICATION', ARRAY['pmda', 'safety-spec', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Manufacturing Site Information', 'pmda-site', '3.2.A', 'quality', 'information',
'MANUFACTURING SITE INFORMATION', ARRAY['pmda', 'manufacturing', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Quality Standard', 'pmda-quality', '3.2.R', 'quality', 'standard',
'JAPANESE QUALITY STANDARDS', ARRAY['pmda', 'quality', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Stability Data', 'pmda-stability', '3.2.P.8', 'quality', 'data',
'STABILITY DATA FOR JAPAN', ARRAY['pmda', 'stability', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Reference Standards', 'pmda-reference', '3.2.R', 'quality', 'standards',
'JAPANESE REFERENCE STANDARDS', ARRAY['pmda', 'reference', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Reexamination Application', 'pmda-reexam', '1.5', 'regulatory', 'application',
'REEXAMINATION APPLICATION', ARRAY['pmda', 'reexamination', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Reevaluation Report', 'pmda-reeval', '1.5', 'regulatory', 'report',
'REEVALUATION REPORT', ARRAY['pmda', 'reevaluation', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Drug Price Listing', 'pmda-pricing', '1.2', 'administrative', 'pricing',
'DRUG PRICE LISTING APPLICATION', ARRAY['pmda', 'pricing', 'japan']::text[], true, '5.0', 1);

-- PMDA Clinical & Administrative Templates (21-30)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'PMDA Japanese ICF', 'pmda-icf', '1.16', 'clinical', 'consent',
'JAPANESE INFORMED CONSENT FORM', ARRAY['pmda', 'icf', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Clinical Data Package', 'pmda-cdp', '5.3', 'clinical', 'package',
'CLINICAL DATA PACKAGE', ARRAY['pmda', 'clinical', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Japanese Population Study', 'pmda-population', '5.3.5', 'clinical', 'study',
'JAPANESE POPULATION STUDY', ARRAY['pmda', 'population', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Ethnic Factor Analysis', 'pmda-ethnic', '5.3.3', 'clinical', 'analysis',
'ETHNIC FACTOR ANALYSIS', ARRAY['pmda', 'ethnic', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Drug Interaction Study', 'pmda-ddi', '5.3.3', 'clinical', 'study',
'DRUG INTERACTION STUDY', ARRAY['pmda', 'ddi', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA QT/QTc Study', 'pmda-qt', '5.3.4', 'clinical', 'study',
'QT/QTC PROLONGATION STUDY', ARRAY['pmda', 'qt-qtc', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Elderly Population Study', 'pmda-elderly', '5.3.5', 'clinical', 'study',
'ELDERLY POPULATION STUDY', ARRAY['pmda', 'elderly', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Sakigake Designation', 'pmda-sakigake', '1.6', 'regulatory', 'designation',
'SAKIGAKE DESIGNATION REQUEST', ARRAY['pmda', 'sakigake', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Conditional Approval', 'pmda-conditional', '1.6', 'regulatory', 'approval',
'CONDITIONAL EARLY APPROVAL SYSTEM', ARRAY['pmda', 'conditional', 'japan']::text[], true, '5.0', 1),

(6, 'PMDA Priority Review', 'pmda-priority', '1.6', 'regulatory', 'review',
'PRIORITY REVIEW DESIGNATION', ARRAY['pmda', 'priority', 'japan']::text[], true, '5.0', 1);

-- =========================================================================================
-- ICH TEMPLATES (45 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
-- ICH E Series - Clinical (1-15)
(6, 'ICH E3 Clinical Study Report', 'ich-e3', '5.3.5', 'clinical', 'guideline',
'STRUCTURE AND CONTENT OF CLINICAL STUDY REPORTS', ARRAY['ich', 'e3', 'csr']::text[], true, '5.0', 1),

(6, 'ICH E6 Good Clinical Practice', 'ich-e6', '5.3', 'clinical', 'guideline',
'GOOD CLINICAL PRACTICE (GCP)', ARRAY['ich', 'e6', 'gcp']::text[], true, '5.0', 1),

(6, 'ICH E8 General Considerations', 'ich-e8', '5.3', 'clinical', 'guideline',
'GENERAL CONSIDERATIONS FOR CLINICAL TRIALS', ARRAY['ich', 'e8', 'clinical']::text[], true, '5.0', 1),

(6, 'ICH E9 Statistical Principles', 'ich-e9', '5.3.1', 'clinical', 'guideline',
'STATISTICAL PRINCIPLES FOR CLINICAL TRIALS', ARRAY['ich', 'e9', 'statistics']::text[], true, '5.0', 1),

(6, 'ICH E10 Control Group', 'ich-e10', '5.3', 'clinical', 'guideline',
'CHOICE OF CONTROL GROUP', ARRAY['ich', 'e10', 'control']::text[], true, '5.0', 1),

(6, 'ICH E11 Pediatric Studies', 'ich-e11', '5.3.5', 'clinical', 'guideline',
'CLINICAL INVESTIGATION IN PEDIATRIC POPULATION', ARRAY['ich', 'e11', 'pediatric']::text[], true, '5.0', 1),

(6, 'ICH E14 QT/QTc Studies', 'ich-e14', '5.3.4', 'clinical', 'guideline',
'CLINICAL EVALUATION OF QT/QTC INTERVAL', ARRAY['ich', 'e14', 'qt-qtc']::text[], true, '5.0', 1),

(6, 'ICH E15 Pharmacogenomics', 'ich-e15', '5.3.2', 'clinical', 'guideline',
'DEFINITIONS FOR GENOMIC BIOMARKERS', ARRAY['ich', 'e15', 'pharmacogenomics']::text[], true, '5.0', 1),

(6, 'ICH E16 Biomarkers', 'ich-e16', '5.3.2', 'clinical', 'guideline',
'BIOMARKERS RELATED TO DRUG OR BIOTECHNOLOGY', ARRAY['ich', 'e16', 'biomarkers']::text[], true, '5.0', 1),

(6, 'ICH E17 Multi-Regional Trials', 'ich-e17', '5.3.5', 'clinical', 'guideline',
'MULTI-REGIONAL CLINICAL TRIALS', ARRAY['ich', 'e17', 'mrct']::text[], true, '5.0', 1),

(6, 'ICH E18 Genomic Sampling', 'ich-e18', '5.3.2', 'clinical', 'guideline',
'GENOMIC SAMPLING AND MANAGEMENT', ARRAY['ich', 'e18', 'genomics']::text[], true, '5.0', 1),

(6, 'ICH E19 Optimisation', 'ich-e19', '5.3', 'clinical', 'guideline',
'OPTIMISATION OF SAFETY DATA COLLECTION', ARRAY['ich', 'e19', 'safety']::text[], true, '5.0', 1),

(6, 'ICH E2A Definitions', 'ich-e2a', '1.8', 'safety', 'guideline',
'CLINICAL SAFETY DATA MANAGEMENT DEFINITIONS', ARRAY['ich', 'e2a', 'safety']::text[], true, '5.0', 1),

(6, 'ICH E2B Data Elements', 'ich-e2b', '1.8', 'safety', 'guideline',
'CLINICAL SAFETY DATA MANAGEMENT DATA ELEMENTS', ARRAY['ich', 'e2b', 'safety']::text[], true, '5.0', 1),

(6, 'ICH E2C PSUR', 'ich-e2c', '1.8.1', 'safety', 'guideline',
'PERIODIC BENEFIT-RISK EVALUATION REPORT', ARRAY['ich', 'e2c', 'psur']::text[], true, '5.0', 1);

-- ICH M Series - Multidisciplinary (16-30)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'ICH M2 eCTD', 'ich-m2', '1.0', 'regulatory', 'guideline',
'ELECTRONIC COMMON TECHNICAL DOCUMENT', ARRAY['ich', 'm2', 'ectd']::text[], true, '5.0', 1),

(6, 'ICH M3 Nonclinical Safety', 'ich-m3', '4.0', 'nonclinical', 'guideline',
'NONCLINICAL SAFETY STUDIES', ARRAY['ich', 'm3', 'nonclinical']::text[], true, '5.0', 1),

(6, 'ICH M4 CTD Organisation', 'ich-m4', '2.0', 'regulatory', 'guideline',
'ORGANISATION OF THE CTD', ARRAY['ich', 'm4', 'ctd']::text[], true, '5.0', 1),

(6, 'ICH M4Q Quality CTD', 'ich-m4q', '3.0', 'quality', 'guideline',
'THE CTD - QUALITY', ARRAY['ich', 'm4q', 'quality']::text[], true, '5.0', 1),

(6, 'ICH M4S Safety CTD', 'ich-m4s', '4.0', 'safety', 'guideline',
'THE CTD - SAFETY', ARRAY['ich', 'm4s', 'safety']::text[], true, '5.0', 1),

(6, 'ICH M4E Efficacy CTD', 'ich-m4e', '5.0', 'clinical', 'guideline',
'THE CTD - EFFICACY', ARRAY['ich', 'm4e', 'efficacy']::text[], true, '5.0', 1),

(6, 'ICH M7 Mutagenic Impurities', 'ich-m7', '3.2.S.3', 'quality', 'guideline',
'ASSESSMENT OF MUTAGENIC IMPURITIES', ARRAY['ich', 'm7', 'impurities']::text[], true, '5.0', 1),

(6, 'ICH M8 eCTD v4.0', 'ich-m8', '1.0', 'regulatory', 'guideline',
'ELECTRONIC COMMON TECHNICAL DOCUMENT V4.0', ARRAY['ich', 'm8', 'ectd']::text[], true, '5.0', 1),

(6, 'ICH M9 BCS Biowaivers', 'ich-m9', '5.3.1', 'clinical', 'guideline',
'BCS-BASED BIOWAIVERS', ARRAY['ich', 'm9', 'biowaiver']::text[], true, '5.0', 1),

(6, 'ICH M10 Bioanalytical Validation', 'ich-m10', '5.3.1', 'quality', 'guideline',
'BIOANALYTICAL METHOD VALIDATION', ARRAY['ich', 'm10', 'validation']::text[], true, '5.0', 1),

(6, 'ICH M11 Clinical Protocol Template', 'ich-m11', '5.3', 'clinical', 'guideline',
'CLINICAL PROTOCOL TEMPLATE', ARRAY['ich', 'm11', 'protocol']::text[], true, '5.0', 1),

(6, 'ICH M12 DDI Studies', 'ich-m12', '5.3.3', 'clinical', 'guideline',
'DRUG INTERACTION STUDIES', ARRAY['ich', 'm12', 'ddi']::text[], true, '5.0', 1),

(6, 'ICH M13 Bioequivalence', 'ich-m13', '5.3.1', 'clinical', 'guideline',
'BIOEQUIVALENCE FOR IMMEDIATE RELEASE', ARRAY['ich', 'm13', 'bioequivalence']::text[], true, '5.0', 1),

(6, 'ICH M14 DNA Reactive', 'ich-m14', '3.2.S.3', 'quality', 'guideline',
'DNA REACTIVE IMPURITIES', ARRAY['ich', 'm14', 'impurities']::text[], true, '5.0', 1),

(6, 'ICH M1 MedDRA', 'ich-m1', '1.8', 'safety', 'guideline',
'MEDICAL DICTIONARY FOR REGULATORY ACTIVITIES', ARRAY['ich', 'm1', 'meddra']::text[], true, '5.0', 1);

-- ICH Q Series - Quality (31-45)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'ICH Q1 Stability', 'ich-q1', '3.2.P.8', 'quality', 'guideline',
'STABILITY TESTING', ARRAY['ich', 'q1', 'stability']::text[], true, '5.0', 1),

(6, 'ICH Q2 Analytical Validation', 'ich-q2', '3.2.P.5', 'quality', 'guideline',
'VALIDATION OF ANALYTICAL PROCEDURES', ARRAY['ich', 'q2', 'validation']::text[], true, '5.0', 1),

(6, 'ICH Q3A Impurities', 'ich-q3a', '3.2.S.3', 'quality', 'guideline',
'IMPURITIES IN NEW DRUG SUBSTANCES', ARRAY['ich', 'q3a', 'impurities']::text[], true, '5.0', 1),

(6, 'ICH Q3B Impurities Products', 'ich-q3b', '3.2.P.5', 'quality', 'guideline',
'IMPURITIES IN NEW DRUG PRODUCTS', ARRAY['ich', 'q3b', 'impurities']::text[], true, '5.0', 1),

(6, 'ICH Q3C Residual Solvents', 'ich-q3c', '3.2.S.2', 'quality', 'guideline',
'GUIDELINE FOR RESIDUAL SOLVENTS', ARRAY['ich', 'q3c', 'solvents']::text[], true, '5.0', 1),

(6, 'ICH Q3D Elemental Impurities', 'ich-q3d', '3.2.P.5', 'quality', 'guideline',
'GUIDELINE FOR ELEMENTAL IMPURITIES', ARRAY['ich', 'q3d', 'elemental']::text[], true, '5.0', 1),

(6, 'ICH Q4B Pharmacopoeial', 'ich-q4b', '3.2.S.4', 'quality', 'guideline',
'EVALUATION OF PHARMACOPOEIAL TEXTS', ARRAY['ich', 'q4b', 'pharmacopoeia']::text[], true, '5.0', 1),

(6, 'ICH Q5A Viral Safety', 'ich-q5a', '3.2.A', 'quality', 'guideline',
'VIRAL SAFETY EVALUATION', ARRAY['ich', 'q5a', 'viral']::text[], true, '5.0', 1),

(6, 'ICH Q5B Expression Construct', 'ich-q5b', '3.2.S.2', 'quality', 'guideline',
'EXPRESSION CONSTRUCT IN CELLS', ARRAY['ich', 'q5b', 'biotechnology']::text[], true, '5.0', 1),

(6, 'ICH Q5C Stability Biotechnology', 'ich-q5c', '3.2.P.8', 'quality', 'guideline',
'STABILITY OF BIOTECHNOLOGY PRODUCTS', ARRAY['ich', 'q5c', 'biotechnology']::text[], true, '5.0', 1),

(6, 'ICH Q5D Cell Substrates', 'ich-q5d', '3.2.S.2', 'quality', 'guideline',
'DERIVATION OF CELL SUBSTRATES', ARRAY['ich', 'q5d', 'cell-line']::text[], true, '5.0', 1),

(6, 'ICH Q5E Comparability', 'ich-q5e', '3.2.S.2', 'quality', 'guideline',
'COMPARABILITY OF BIOTECHNOLOGY PRODUCTS', ARRAY['ich', 'q5e', 'comparability']::text[], true, '5.0', 1),

(6, 'ICH Q6A Specifications', 'ich-q6a', '3.2.S.4', 'quality', 'guideline',
'SPECIFICATIONS FOR NEW DRUG SUBSTANCES', ARRAY['ich', 'q6a', 'specifications']::text[], true, '5.0', 1),

(6, 'ICH Q6B Biotechnology Specs', 'ich-q6b', '3.2.S.4', 'quality', 'guideline',
'SPECIFICATIONS FOR BIOTECHNOLOGY PRODUCTS', ARRAY['ich', 'q6b', 'biotechnology']::text[], true, '5.0', 1),

(6, 'ICH Q7 GMP APIs', 'ich-q7', '3.2.S.2', 'quality', 'guideline',
'GMP FOR ACTIVE PHARMACEUTICAL INGREDIENTS', ARRAY['ich', 'q7', 'gmp']::text[], true, '5.0', 1);

-- =========================================================================================
-- THERAPEUTIC AREA TEMPLATES (60 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
-- Oncology Templates (1-15)
(6, 'Oncology Phase I Template', 'onc-phase1', '5.3', 'clinical', 'therapeutic',
'ONCOLOGY PHASE I DOSE ESCALATION', ARRAY['therapeutic', 'oncology', 'phase1']::text[], true, '5.0', 1),

(6, 'Oncology Combination Study', 'onc-combo', '5.3', 'clinical', 'therapeutic',
'ONCOLOGY COMBINATION THERAPY', ARRAY['therapeutic', 'oncology', 'combination']::text[], true, '5.0', 1),

(6, 'Oncology Biomarker Protocol', 'onc-biomarker', '5.3', 'clinical', 'therapeutic',
'ONCOLOGY BIOMARKER-DRIVEN TRIAL', ARRAY['therapeutic', 'oncology', 'biomarker']::text[], true, '5.0', 1),

(6, 'Oncology Basket Trial', 'onc-basket', '5.3', 'clinical', 'therapeutic',
'ONCOLOGY BASKET TRIAL DESIGN', ARRAY['therapeutic', 'oncology', 'basket']::text[], true, '5.0', 1),

(6, 'Oncology Umbrella Trial', 'onc-umbrella', '5.3', 'clinical', 'therapeutic',
'ONCOLOGY UMBRELLA TRIAL DESIGN', ARRAY['therapeutic', 'oncology', 'umbrella']::text[], true, '5.0', 1),

(6, 'Oncology Immunotherapy', 'onc-immuno', '5.3', 'clinical', 'therapeutic',
'ONCOLOGY IMMUNOTHERAPY PROTOCOL', ARRAY['therapeutic', 'oncology', 'immunotherapy']::text[], true, '5.0', 1),

(6, 'Oncology CAR-T Protocol', 'onc-cart', '5.3', 'clinical', 'therapeutic',
'CAR-T CELL THERAPY PROTOCOL', ARRAY['therapeutic', 'oncology', 'car-t']::text[], true, '5.0', 1),

(6, 'Oncology RECIST Criteria', 'onc-recist', '5.3', 'clinical', 'therapeutic',
'RECIST 1.1 RESPONSE CRITERIA', ARRAY['therapeutic', 'oncology', 'recist']::text[], true, '5.0', 1),

(6, 'Oncology iRECIST Criteria', 'onc-irecist', '5.3', 'clinical', 'therapeutic',
'IMMUNE RECIST CRITERIA', ARRAY['therapeutic', 'oncology', 'irecist']::text[], true, '5.0', 1),

(6, 'Oncology Adaptive Design', 'onc-adaptive', '5.3', 'clinical', 'therapeutic',
'ONCOLOGY ADAPTIVE TRIAL DESIGN', ARRAY['therapeutic', 'oncology', 'adaptive']::text[], true, '5.0', 1),

(6, 'Oncology Dose Optimization', 'onc-dose', '5.3', 'clinical', 'therapeutic',
'ONCOLOGY DOSE OPTIMIZATION STUDY', ARRAY['therapeutic', 'oncology', 'dose']::text[], true, '5.0', 1),

(6, 'Oncology Maintenance Therapy', 'onc-maintenance', '5.3', 'clinical', 'therapeutic',
'ONCOLOGY MAINTENANCE THERAPY TRIAL', ARRAY['therapeutic', 'oncology', 'maintenance']::text[], true, '5.0', 1),

(6, 'Oncology Neoadjuvant', 'onc-neoadjuvant', '5.3', 'clinical', 'therapeutic',
'NEOADJUVANT THERAPY PROTOCOL', ARRAY['therapeutic', 'oncology', 'neoadjuvant']::text[], true, '5.0', 1),

(6, 'Oncology Adjuvant', 'onc-adjuvant', '5.3', 'clinical', 'therapeutic',
'ADJUVANT THERAPY PROTOCOL', ARRAY['therapeutic', 'oncology', 'adjuvant']::text[], true, '5.0', 1),

(6, 'Oncology Real-World Evidence', 'onc-rwe', '5.3.6', 'clinical', 'therapeutic',
'ONCOLOGY REAL-WORLD EVIDENCE', ARRAY['therapeutic', 'oncology', 'rwe']::text[], true, '5.0', 1);

-- Rare Disease Templates (16-25)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Rare Disease Natural History', 'rare-nh', '5.3', 'clinical', 'therapeutic',
'RARE DISEASE NATURAL HISTORY STUDY', ARRAY['therapeutic', 'rare-disease', 'natural-history']::text[], true, '5.0', 1),

(6, 'Rare Disease Registry', 'rare-registry', '5.3', 'clinical', 'therapeutic',
'RARE DISEASE PATIENT REGISTRY', ARRAY['therapeutic', 'rare-disease', 'registry']::text[], true, '5.0', 1),

(6, 'Rare Disease Gene Therapy', 'rare-gene', '5.3', 'clinical', 'therapeutic',
'RARE DISEASE GENE THERAPY PROTOCOL', ARRAY['therapeutic', 'rare-disease', 'gene-therapy']::text[], true, '5.0', 1),

(6, 'Rare Disease Pediatric', 'rare-peds', '5.3', 'clinical', 'therapeutic',
'RARE DISEASE PEDIATRIC STUDY', ARRAY['therapeutic', 'rare-disease', 'pediatric']::text[], true, '5.0', 1),

(6, 'Rare Disease Enzyme Replacement', 'rare-ert', '5.3', 'clinical', 'therapeutic',
'ENZYME REPLACEMENT THERAPY', ARRAY['therapeutic', 'rare-disease', 'ert']::text[], true, '5.0', 1),

(6, 'Rare Disease Substrate Reduction', 'rare-srt', '5.3', 'clinical', 'therapeutic',
'SUBSTRATE REDUCTION THERAPY', ARRAY['therapeutic', 'rare-disease', 'srt']::text[], true, '5.0', 1),

(6, 'Rare Disease Small Population', 'rare-small', '5.3', 'clinical', 'therapeutic',
'SMALL POPULATION STUDY DESIGN', ARRAY['therapeutic', 'rare-disease', 'small-population']::text[], true, '5.0', 1),

(6, 'Rare Disease Biomarker', 'rare-biomarker', '5.3', 'clinical', 'therapeutic',
'RARE DISEASE BIOMARKER STUDY', ARRAY['therapeutic', 'rare-disease', 'biomarker']::text[], true, '5.0', 1),

(6, 'Rare Disease Compassionate Use', 'rare-compassionate', '1.10', 'regulatory', 'therapeutic',
'COMPASSIONATE USE PROGRAM', ARRAY['therapeutic', 'rare-disease', 'compassionate-use']::text[], true, '5.0', 1),

(6, 'Rare Disease Expanded Access', 'rare-expanded', '1.10', 'regulatory', 'therapeutic',
'EXPANDED ACCESS PROTOCOL', ARRAY['therapeutic', 'rare-disease', 'expanded-access']::text[], true, '5.0', 1);

-- Cardiovascular Templates (26-35)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Cardiovascular MACE Endpoints', 'cv-mace', '5.3', 'clinical', 'therapeutic',
'MAJOR ADVERSE CARDIOVASCULAR EVENTS', ARRAY['therapeutic', 'cardiovascular', 'mace']::text[], true, '5.0', 1),

(6, 'Cardiovascular Heart Failure', 'cv-hf', '5.3', 'clinical', 'therapeutic',
'HEART FAILURE TRIAL PROTOCOL', ARRAY['therapeutic', 'cardiovascular', 'heart-failure']::text[], true, '5.0', 1),

(6, 'Cardiovascular Hypertension', 'cv-htn', '5.3', 'clinical', 'therapeutic',
'HYPERTENSION STUDY PROTOCOL', ARRAY['therapeutic', 'cardiovascular', 'hypertension']::text[], true, '5.0', 1),

(6, 'Cardiovascular Lipids', 'cv-lipids', '5.3', 'clinical', 'therapeutic',
'LIPID-LOWERING THERAPY STUDY', ARRAY['therapeutic', 'cardiovascular', 'lipids']::text[], true, '5.0', 1),

(6, 'Cardiovascular Anticoagulation', 'cv-anticoag', '5.3', 'clinical', 'therapeutic',
'ANTICOAGULATION THERAPY PROTOCOL', ARRAY['therapeutic', 'cardiovascular', 'anticoagulation']::text[], true, '5.0', 1),

(6, 'Cardiovascular Device Trial', 'cv-device', '5.3', 'clinical', 'therapeutic',
'CARDIOVASCULAR DEVICE TRIAL', ARRAY['therapeutic', 'cardiovascular', 'device']::text[], true, '5.0', 1),

(6, 'Cardiovascular Imaging Study', 'cv-imaging', '5.3', 'clinical', 'therapeutic',
'CARDIOVASCULAR IMAGING ENDPOINTS', ARRAY['therapeutic', 'cardiovascular', 'imaging']::text[], true, '5.0', 1),

(6, 'Cardiovascular Outcomes Trial', 'cv-outcomes', '5.3', 'clinical', 'therapeutic',
'CARDIOVASCULAR OUTCOMES STUDY', ARRAY['therapeutic', 'cardiovascular', 'outcomes']::text[], true, '5.0', 1),

(6, 'Cardiovascular Thorough QT', 'cv-tqt', '5.3.4', 'clinical', 'therapeutic',
'THOROUGH QT STUDY PROTOCOL', ARRAY['therapeutic', 'cardiovascular', 'tqt']::text[], true, '5.0', 1),

(6, 'Cardiovascular Acute Coronary', 'cv-acs', '5.3', 'clinical', 'therapeutic',
'ACUTE CORONARY SYNDROME TRIAL', ARRAY['therapeutic', 'cardiovascular', 'acs']::text[], true, '5.0', 1);

-- Neurology Templates (36-45)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Neurology Alzheimer Disease', 'neuro-ad', '5.3', 'clinical', 'therapeutic',
'ALZHEIMER DISEASE TRIAL PROTOCOL', ARRAY['therapeutic', 'neurology', 'alzheimer']::text[], true, '5.0', 1),

(6, 'Neurology Parkinson Disease', 'neuro-pd', '5.3', 'clinical', 'therapeutic',
'PARKINSON DISEASE STUDY PROTOCOL', ARRAY['therapeutic', 'neurology', 'parkinson']::text[], true, '5.0', 1),

(6, 'Neurology Multiple Sclerosis', 'neuro-ms', '5.3', 'clinical', 'therapeutic',
'MULTIPLE SCLEROSIS TRIAL DESIGN', ARRAY['therapeutic', 'neurology', 'ms']::text[], true, '5.0', 1),

(6, 'Neurology Epilepsy', 'neuro-epilepsy', '5.3', 'clinical', 'therapeutic',
'EPILEPSY STUDY PROTOCOL', ARRAY['therapeutic', 'neurology', 'epilepsy']::text[], true, '5.0', 1),

(6, 'Neurology Migraine', 'neuro-migraine', '5.3', 'clinical', 'therapeutic',
'MIGRAINE PREVENTION TRIAL', ARRAY['therapeutic', 'neurology', 'migraine']::text[], true, '5.0', 1),

(6, 'Neurology ALS', 'neuro-als', '5.3', 'clinical', 'therapeutic',
'AMYOTROPHIC LATERAL SCLEROSIS', ARRAY['therapeutic', 'neurology', 'als']::text[], true, '5.0', 1),

(6, 'Neurology Stroke', 'neuro-stroke', '5.3', 'clinical', 'therapeutic',
'STROKE PREVENTION STUDY', ARRAY['therapeutic', 'neurology', 'stroke']::text[], true, '5.0', 1),

(6, 'Neurology Cognitive Assessment', 'neuro-cognitive', '5.3', 'clinical', 'therapeutic',
'COGNITIVE ASSESSMENT BATTERY', ARRAY['therapeutic', 'neurology', 'cognitive']::text[], true, '5.0', 1),

(6, 'Neurology Biomarker CSF', 'neuro-csf', '5.3', 'clinical', 'therapeutic',
'CSF BIOMARKER COLLECTION', ARRAY['therapeutic', 'neurology', 'csf']::text[], true, '5.0', 1),

(6, 'Neurology Imaging Protocol', 'neuro-imaging', '5.3', 'clinical', 'therapeutic',
'NEUROIMAGING PROTOCOL', ARRAY['therapeutic', 'neurology', 'imaging']::text[], true, '5.0', 1);

-- Infectious Disease Templates (46-55)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Infectious Disease Antiviral', 'id-antiviral', '5.3', 'clinical', 'therapeutic',
'ANTIVIRAL THERAPY PROTOCOL', ARRAY['therapeutic', 'infectious-disease', 'antiviral']::text[], true, '5.0', 1),

(6, 'Infectious Disease Antibacterial', 'id-antibacterial', '5.3', 'clinical', 'therapeutic',
'ANTIBACTERIAL STUDY DESIGN', ARRAY['therapeutic', 'infectious-disease', 'antibacterial']::text[], true, '5.0', 1),

(6, 'Infectious Disease Vaccine', 'id-vaccine', '5.3', 'clinical', 'therapeutic',
'VACCINE DEVELOPMENT PROTOCOL', ARRAY['therapeutic', 'infectious-disease', 'vaccine']::text[], true, '5.0', 1),

(6, 'Infectious Disease Pandemic', 'id-pandemic', '5.3', 'clinical', 'therapeutic',
'PANDEMIC RESPONSE PROTOCOL', ARRAY['therapeutic', 'infectious-disease', 'pandemic']::text[], true, '5.0', 1),

(6, 'Infectious Disease HIV', 'id-hiv', '5.3', 'clinical', 'therapeutic',
'HIV TREATMENT PROTOCOL', ARRAY['therapeutic', 'infectious-disease', 'hiv']::text[], true, '5.0', 1),

(6, 'Infectious Disease Hepatitis', 'id-hep', '5.3', 'clinical', 'therapeutic',
'HEPATITIS THERAPY STUDY', ARRAY['therapeutic', 'infectious-disease', 'hepatitis']::text[], true, '5.0', 1),

(6, 'Infectious Disease Tuberculosis', 'id-tb', '5.3', 'clinical', 'therapeutic',
'TUBERCULOSIS TREATMENT TRIAL', ARRAY['therapeutic', 'infectious-disease', 'tb']::text[], true, '5.0', 1),

(6, 'Infectious Disease Fungal', 'id-fungal', '5.3', 'clinical', 'therapeutic',
'ANTIFUNGAL THERAPY PROTOCOL', ARRAY['therapeutic', 'infectious-disease', 'fungal']::text[], true, '5.0', 1),

(6, 'Infectious Disease MDR', 'id-mdr', '5.3', 'clinical', 'therapeutic',
'MULTI-DRUG RESISTANT ORGANISMS', ARRAY['therapeutic', 'infectious-disease', 'mdr']::text[], true, '5.0', 1),

(6, 'Infectious Disease PK/PD', 'id-pkpd', '5.3', 'clinical', 'therapeutic',
'ANTIMICROBIAL PK/PD STUDY', ARRAY['therapeutic', 'infectious-disease', 'pk-pd']::text[], true, '5.0', 1);

-- Metabolic/Endocrine Templates (56-60)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Metabolic Diabetes Type 2', 'met-t2d', '5.3', 'clinical', 'therapeutic',
'TYPE 2 DIABETES STUDY PROTOCOL', ARRAY['therapeutic', 'metabolic', 'diabetes']::text[], true, '5.0', 1),

(6, 'Metabolic Diabetes Type 1', 'met-t1d', '5.3', 'clinical', 'therapeutic',
'TYPE 1 DIABETES TRIAL DESIGN', ARRAY['therapeutic', 'metabolic', 'diabetes']::text[], true, '5.0', 1),

(6, 'Metabolic Obesity', 'met-obesity', '5.3', 'clinical', 'therapeutic',
'OBESITY TREATMENT PROTOCOL', ARRAY['therapeutic', 'metabolic', 'obesity']::text[], true, '5.0', 1),

(6, 'Metabolic NASH', 'met-nash', '5.3', 'clinical', 'therapeutic',
'NASH CLINICAL TRIAL PROTOCOL', ARRAY['therapeutic', 'metabolic', 'nash']::text[], true, '5.0', 1),

(6, 'Metabolic Thyroid', 'met-thyroid', '5.3', 'clinical', 'therapeutic',
'THYROID DISORDER STUDY', ARRAY['therapeutic', 'metabolic', 'thyroid']::text[], true, '5.0', 1);

-- =========================================================================================
-- CLINICAL OPERATIONS TEMPLATES (40 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
-- Site Management Templates (1-10)
(6, 'Site Initiation Visit', 'ops-siv', '1.16', 'clinical', 'operations',
'SITE INITIATION VISIT CHECKLIST', ARRAY['clinical-ops', 'site', 'initiation']::text[], true, '5.0', 1),

(6, 'Site Qualification Visit', 'ops-sqv', '1.16', 'clinical', 'operations',
'SITE QUALIFICATION QUESTIONNAIRE', ARRAY['clinical-ops', 'site', 'qualification']::text[], true, '5.0', 1),

(6, 'Site Monitoring Plan', 'ops-smp', '1.16', 'clinical', 'operations',
'SITE MONITORING PLAN', ARRAY['clinical-ops', 'site', 'monitoring']::text[], true, '5.0', 1),

(6, 'Site Close-Out Visit', 'ops-cov', '1.16', 'clinical', 'operations',
'SITE CLOSE-OUT VISIT CHECKLIST', ARRAY['clinical-ops', 'site', 'closeout']::text[], true, '5.0', 1),

(6, 'Site Training Log', 'ops-training', '1.16', 'clinical', 'operations',
'SITE PERSONNEL TRAINING LOG', ARRAY['clinical-ops', 'site', 'training']::text[], true, '5.0', 1),

(6, 'Site Delegation Log', 'ops-delegation', '1.16', 'clinical', 'operations',
'SITE DELEGATION OF AUTHORITY LOG', ARRAY['clinical-ops', 'site', 'delegation']::text[], true, '5.0', 1),

(6, 'Site Communication Plan', 'ops-comm', '1.16', 'clinical', 'operations',
'SITE COMMUNICATION PLAN', ARRAY['clinical-ops', 'site', 'communication']::text[], true, '5.0', 1),

(6, 'Site Recruitment Plan', 'ops-recruitment', '1.16', 'clinical', 'operations',
'PATIENT RECRUITMENT STRATEGY', ARRAY['clinical-ops', 'site', 'recruitment']::text[], true, '5.0', 1),

(6, 'Site Budget Template', 'ops-budget', '1.16', 'administrative', 'operations',
'CLINICAL SITE BUDGET TEMPLATE', ARRAY['clinical-ops', 'site', 'budget']::text[], true, '5.0', 1),

(6, 'Site Contract Template', 'ops-contract', '1.16', 'administrative', 'operations',
'CLINICAL TRIAL AGREEMENT', ARRAY['clinical-ops', 'site', 'contract']::text[], true, '5.0', 1);

-- Data Management Templates (11-20)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Data Management Plan', 'ops-dmp', '5.3.9', 'clinical', 'operations',
'DATA MANAGEMENT PLAN', ARRAY['clinical-ops', 'data', 'management']::text[], true, '5.0', 1),

(6, 'Data Validation Plan', 'ops-dvp', '5.3.9', 'clinical', 'operations',
'DATA VALIDATION PLAN', ARRAY['clinical-ops', 'data', 'validation']::text[], true, '5.0', 1),

(6, 'eCRF Specifications', 'ops-ecrf', '5.3.9', 'clinical', 'operations',
'ELECTRONIC CRF SPECIFICATIONS', ARRAY['clinical-ops', 'data', 'ecrf']::text[], true, '5.0', 1),

(6, 'Edit Check Specifications', 'ops-edits', '5.3.9', 'clinical', 'operations',
'EDIT CHECK SPECIFICATIONS', ARRAY['clinical-ops', 'data', 'edit-checks']::text[], true, '5.0', 1),

(6, 'Data Transfer Agreement', 'ops-dta', '5.3.9', 'administrative', 'operations',
'DATA TRANSFER AGREEMENT', ARRAY['clinical-ops', 'data', 'transfer']::text[], true, '5.0', 1),

(6, 'Database Lock Checklist', 'ops-dbl', '5.3.9', 'clinical', 'operations',
'DATABASE LOCK CHECKLIST', ARRAY['clinical-ops', 'data', 'lock']::text[], true, '5.0', 1),

(6, 'SAE Reconciliation', 'ops-sae', '5.3.9', 'safety', 'operations',
'SAE RECONCILIATION PLAN', ARRAY['clinical-ops', 'data', 'sae']::text[], true, '5.0', 1),

(6, 'Query Management Plan', 'ops-query', '5.3.9', 'clinical', 'operations',
'QUERY MANAGEMENT PROCESS', ARRAY['clinical-ops', 'data', 'queries']::text[], true, '5.0', 1),

(6, 'Coding Guidelines', 'ops-coding', '5.3.9', 'clinical', 'operations',
'MEDICAL CODING GUIDELINES', ARRAY['clinical-ops', 'data', 'coding']::text[], true, '5.0', 1),

(6, 'Data Review Plan', 'ops-review', '5.3.9', 'clinical', 'operations',
'CLINICAL DATA REVIEW PLAN', ARRAY['clinical-ops', 'data', 'review']::text[], true, '5.0', 1);

-- Regulatory Operations Templates (21-30)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Regulatory Submission Plan', 'ops-regplan', '1.0', 'regulatory', 'operations',
'REGULATORY SUBMISSION STRATEGY', ARRAY['clinical-ops', 'regulatory', 'submission']::text[], true, '5.0', 1),

(6, 'Regulatory Tracking Sheet', 'ops-regtrack', '1.0', 'regulatory', 'operations',
'REGULATORY DOCUMENT TRACKING', ARRAY['clinical-ops', 'regulatory', 'tracking']::text[], true, '5.0', 1),

(6, 'IRB/EC Communication', 'ops-irb', '1.4', 'regulatory', 'operations',
'IRB/EC COMMUNICATION LOG', ARRAY['clinical-ops', 'regulatory', 'irb']::text[], true, '5.0', 1),

(6, 'Protocol Deviation Report', 'ops-deviation', '1.7', 'quality', 'operations',
'PROTOCOL DEVIATION REPORT', ARRAY['clinical-ops', 'quality', 'deviation']::text[], true, '5.0', 1),

(6, 'CAPA Management', 'ops-capa', '1.7', 'quality', 'operations',
'CORRECTIVE AND PREVENTIVE ACTION', ARRAY['clinical-ops', 'quality', 'capa']::text[], true, '5.0', 1),

(6, 'Audit Preparation', 'ops-audit', '1.7', 'quality', 'operations',
'AUDIT PREPARATION CHECKLIST', ARRAY['clinical-ops', 'quality', 'audit']::text[], true, '5.0', 1),

(6, 'Inspection Readiness', 'ops-inspection', '1.7', 'quality', 'operations',
'INSPECTION READINESS CHECKLIST', ARRAY['clinical-ops', 'quality', 'inspection']::text[], true, '5.0', 1),

(6, 'TMF Management Plan', 'ops-tmf', '1.7', 'quality', 'operations',
'TRIAL MASTER FILE PLAN', ARRAY['clinical-ops', 'quality', 'tmf']::text[], true, '5.0', 1),

(6, 'Quality Management Plan', 'ops-qmp', '1.7', 'quality', 'operations',
'QUALITY MANAGEMENT PLAN', ARRAY['clinical-ops', 'quality', 'qms']::text[], true, '5.0', 1),

(6, 'Risk Management Plan', 'ops-risk', '1.7', 'quality', 'operations',
'CLINICAL TRIAL RISK MANAGEMENT', ARRAY['clinical-ops', 'quality', 'risk']::text[], true, '5.0', 1);

-- Supply Chain Templates (31-40)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Drug Supply Plan', 'ops-supply', '3.2.P', 'quality', 'operations',
'INVESTIGATIONAL PRODUCT SUPPLY', ARRAY['clinical-ops', 'supply', 'drug']::text[], true, '5.0', 1),

(6, 'Drug Accountability', 'ops-accountability', '3.2.P', 'quality', 'operations',
'DRUG ACCOUNTABILITY LOG', ARRAY['clinical-ops', 'supply', 'accountability']::text[], true, '5.0', 1),

(6, 'Temperature Monitoring', 'ops-temp', '3.2.P', 'quality', 'operations',
'TEMPERATURE EXCURSION MANAGEMENT', ARRAY['clinical-ops', 'supply', 'temperature']::text[], true, '5.0', 1),

(6, 'Randomization Plan', 'ops-random', '5.3.1', 'clinical', 'operations',
'RANDOMIZATION AND BLINDING PLAN', ARRAY['clinical-ops', 'supply', 'randomization']::text[], true, '5.0', 1),

(6, 'IVRS/IWRS Specifications', 'ops-ivrs', '5.3.1', 'clinical', 'operations',
'INTERACTIVE RESPONSE SYSTEM SPECS', ARRAY['clinical-ops', 'supply', 'ivrs']::text[], true, '5.0', 1),

(6, 'Kit Design Specifications', 'ops-kit', '3.2.P', 'quality', 'operations',
'CLINICAL SUPPLY KIT DESIGN', ARRAY['clinical-ops', 'supply', 'kit']::text[], true, '5.0', 1),

(6, 'Comparator Sourcing', 'ops-comparator', '3.2.P', 'quality', 'operations',
'COMPARATOR DRUG SOURCING', ARRAY['clinical-ops', 'supply', 'comparator']::text[], true, '5.0', 1),

(6, 'Label Design Template', 'ops-label', '3.2.P', 'quality', 'operations',
'CLINICAL TRIAL LABEL DESIGN', ARRAY['clinical-ops', 'supply', 'label']::text[], true, '5.0', 1),

(6, 'Pharmacy Manual', 'ops-pharmacy', '3.2.P', 'quality', 'operations',
'SITE PHARMACY MANUAL', ARRAY['clinical-ops', 'supply', 'pharmacy']::text[], true, '5.0', 1),

(6, 'Return/Destruction Plan', 'ops-return', '3.2.P', 'quality', 'operations',
'DRUG RETURN AND DESTRUCTION', ARRAY['clinical-ops', 'supply', 'return']::text[], true, '5.0', 1);

-- =========================================================================================
-- PATIENT MATERIALS TEMPLATES (35 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
-- Informed Consent Templates (1-10)
(6, 'Adult ICF Template', 'pat-icf-adult', '1.16', 'clinical', 'patient',
'ADULT INFORMED CONSENT FORM', ARRAY['patient-materials', 'consent', 'adult']::text[], true, '5.0', 1),

(6, 'Pediatric ICF/Assent', 'pat-icf-peds', '1.16', 'clinical', 'patient',
'PEDIATRIC CONSENT AND ASSENT', ARRAY['patient-materials', 'consent', 'pediatric']::text[], true, '5.0', 1),

(6, 'LAR Consent Form', 'pat-icf-lar', '1.16', 'clinical', 'patient',
'LEGALLY AUTHORIZED REPRESENTATIVE', ARRAY['patient-materials', 'consent', 'lar']::text[], true, '5.0', 1),

(6, 'Biobanking Consent', 'pat-biobank', '1.16', 'clinical', 'patient',
'BIOBANKING AND FUTURE RESEARCH', ARRAY['patient-materials', 'consent', 'biobank']::text[], true, '5.0', 1),

(6, 'Genetic Testing Consent', 'pat-genetic', '1.16', 'clinical', 'patient',
'GENETIC TESTING CONSENT', ARRAY['patient-materials', 'consent', 'genetic']::text[], true, '5.0', 1),

(6, 'Photography Consent', 'pat-photo', '1.16', 'clinical', 'patient',
'PHOTOGRAPHY AND VIDEO CONSENT', ARRAY['patient-materials', 'consent', 'media']::text[], true, '5.0', 1),

(6, 'Remote Consent Process', 'pat-econsent', '1.16', 'clinical', 'patient',
'ELECTRONIC CONSENT PROCESS', ARRAY['patient-materials', 'consent', 'econsent']::text[], true, '5.0', 1),

(6, 'Re-consent Template', 'pat-reconsent', '1.16', 'clinical', 'patient',
'RE-CONSENT FORM TEMPLATE', ARRAY['patient-materials', 'consent', 'reconsent']::text[], true, '5.0', 1),

(6, 'Screening Consent', 'pat-screening', '1.16', 'clinical', 'patient',
'SCREENING CONSENT FORM', ARRAY['patient-materials', 'consent', 'screening']::text[], true, '5.0', 1),

(6, 'Pregnant Partner Consent', 'pat-pregnancy', '1.16', 'clinical', 'patient',
'PREGNANT PARTNER CONSENT', ARRAY['patient-materials', 'consent', 'pregnancy']::text[], true, '5.0', 1);

-- Patient Information Materials (11-20)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Patient Information Sheet', 'pat-info', '1.16', 'clinical', 'patient',
'PATIENT INFORMATION LEAFLET', ARRAY['patient-materials', 'information', 'general']::text[], true, '5.0', 1),

(6, 'Study Brochure', 'pat-brochure', '1.16', 'clinical', 'patient',
'PATIENT STUDY BROCHURE', ARRAY['patient-materials', 'information', 'brochure']::text[], true, '5.0', 1),

(6, 'Patient Diary', 'pat-diary', '5.3.5', 'clinical', 'patient',
'PATIENT DIARY TEMPLATE', ARRAY['patient-materials', 'tools', 'diary']::text[], true, '5.0', 1),

(6, 'Medication Guide', 'pat-medguide', '1.16', 'clinical', 'patient',
'PATIENT MEDICATION GUIDE', ARRAY['patient-materials', 'information', 'medication']::text[], true, '5.0', 1),

(6, 'Study Card', 'pat-card', '1.16', 'clinical', 'patient',
'PATIENT STUDY CARD', ARRAY['patient-materials', 'tools', 'card']::text[], true, '5.0', 1),

(6, 'Emergency Contact Card', 'pat-emergency', '1.16', 'safety', 'patient',
'EMERGENCY CONTACT CARD', ARRAY['patient-materials', 'safety', 'emergency']::text[], true, '5.0', 1),

(6, 'Travel Letter', 'pat-travel', '1.16', 'clinical', 'patient',
'PATIENT TRAVEL LETTER', ARRAY['patient-materials', 'support', 'travel']::text[], true, '5.0', 1),

(6, 'Insurance Letter', 'pat-insurance', '1.16', 'administrative', 'patient',
'INSURANCE NOTIFICATION LETTER', ARRAY['patient-materials', 'support', 'insurance']::text[], true, '5.0', 1),

(6, 'Study Newsletter', 'pat-newsletter', '1.16', 'clinical', 'patient',
'PATIENT STUDY NEWSLETTER', ARRAY['patient-materials', 'communication', 'newsletter']::text[], true, '5.0', 1),

(6, 'FAQ Document', 'pat-faq', '1.16', 'clinical', 'patient',
'FREQUENTLY ASKED QUESTIONS', ARRAY['patient-materials', 'information', 'faq']::text[], true, '5.0', 1);

-- Patient Reported Outcomes (21-30)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Quality of Life PRO', 'pat-qol', '5.3.5', 'clinical', 'patient',
'QUALITY OF LIFE QUESTIONNAIRE', ARRAY['patient-materials', 'pro', 'qol']::text[], true, '5.0', 1),

(6, 'Pain Assessment PRO', 'pat-pain', '5.3.5', 'clinical', 'patient',
'PAIN ASSESSMENT SCALE', ARRAY['patient-materials', 'pro', 'pain']::text[], true, '5.0', 1),

(6, 'Symptom Diary PRO', 'pat-symptom', '5.3.5', 'clinical', 'patient',
'SYMPTOM DIARY', ARRAY['patient-materials', 'pro', 'symptoms']::text[], true, '5.0', 1),

(6, 'Activity Log PRO', 'pat-activity', '5.3.5', 'clinical', 'patient',
'DAILY ACTIVITY LOG', ARRAY['patient-materials', 'pro', 'activity']::text[], true, '5.0', 1),

(6, 'Sleep Diary PRO', 'pat-sleep', '5.3.5', 'clinical', 'patient',
'SLEEP QUALITY DIARY', ARRAY['patient-materials', 'pro', 'sleep']::text[], true, '5.0', 1),

(6, 'Mood Assessment PRO', 'pat-mood', '5.3.5', 'clinical', 'patient',
'MOOD ASSESSMENT QUESTIONNAIRE', ARRAY['patient-materials', 'pro', 'mood']::text[], true, '5.0', 1),

(6, 'Adherence Questionnaire', 'pat-adherence', '5.3.5', 'clinical', 'patient',
'MEDICATION ADHERENCE SURVEY', ARRAY['patient-materials', 'pro', 'adherence']::text[], true, '5.0', 1),

(6, 'Side Effects Log', 'pat-sideeffects', '5.3.5', 'safety', 'patient',
'SIDE EFFECTS REPORTING LOG', ARRAY['patient-materials', 'pro', 'safety']::text[], true, '5.0', 1),

(6, 'Satisfaction Survey', 'pat-satisfaction', '5.3.5', 'clinical', 'patient',
'PATIENT SATISFACTION SURVEY', ARRAY['patient-materials', 'pro', 'satisfaction']::text[], true, '5.0', 1),

(6, 'Caregiver Assessment', 'pat-caregiver', '5.3.5', 'clinical', 'patient',
'CAREGIVER BURDEN ASSESSMENT', ARRAY['patient-materials', 'pro', 'caregiver']::text[], true, '5.0', 1);

-- Digital/Remote Materials (31-35)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'ePRO Instructions', 'pat-epro', '5.3.5', 'clinical', 'patient',
'ELECTRONIC PRO INSTRUCTIONS', ARRAY['patient-materials', 'digital', 'epro']::text[], true, '5.0', 1),

(6, 'Wearable Device Guide', 'pat-wearable', '5.3.5', 'clinical', 'patient',
'WEARABLE DEVICE USER GUIDE', ARRAY['patient-materials', 'digital', 'wearable']::text[], true, '5.0', 1),

(6, 'Mobile App Instructions', 'pat-app', '5.3.5', 'clinical', 'patient',
'STUDY MOBILE APP GUIDE', ARRAY['patient-materials', 'digital', 'app']::text[], true, '5.0', 1),

(6, 'Telemedicine Guide', 'pat-telehealth', '5.3.5', 'clinical', 'patient',
'TELEMEDICINE VISIT GUIDE', ARRAY['patient-materials', 'digital', 'telehealth']::text[], true, '5.0', 1),

(6, 'Home Nursing Instructions', 'pat-home', '5.3.5', 'clinical', 'patient',
'HOME HEALTHCARE INSTRUCTIONS', ARRAY['patient-materials', 'remote', 'home']::text[], true, '5.0', 1);

-- =========================================================================================
-- MODALITY-SPECIFIC TEMPLATES (40 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
-- Cell & Gene Therapy Templates (1-10)
(6, 'CAR-T Manufacturing', 'mod-cart-mfg', '3.2.S', 'quality', 'modality',
'CAR-T MANUFACTURING PROCESS', ARRAY['modality', 'cell-therapy', 'car-t']::text[], true, '5.0', 1),

(6, 'Gene Therapy Vector', 'mod-gene-vector', '3.2.S', 'quality', 'modality',
'GENE THERAPY VECTOR PRODUCTION', ARRAY['modality', 'gene-therapy', 'vector']::text[], true, '5.0', 1),

(6, 'Cell Therapy Protocol', 'mod-cell-protocol', '5.3', 'clinical', 'modality',
'CELL THERAPY CLINICAL PROTOCOL', ARRAY['modality', 'cell-therapy', 'protocol']::text[], true, '5.0', 1),

(6, 'Stem Cell Collection', 'mod-stem-cell', '5.3', 'clinical', 'modality',
'STEM CELL COLLECTION PROTOCOL', ARRAY['modality', 'cell-therapy', 'stem-cell']::text[], true, '5.0', 1),

(6, 'Chain of Custody', 'mod-coc', '3.2.P', 'quality', 'modality',
'CHAIN OF CUSTODY PROCEDURES', ARRAY['modality', 'cell-therapy', 'logistics']::text[], true, '5.0', 1),

(6, 'Cryopreservation Protocol', 'mod-cryo', '3.2.P', 'quality', 'modality',
'CRYOPRESERVATION PROTOCOL', ARRAY['modality', 'cell-therapy', 'storage']::text[], true, '5.0', 1),

(6, 'Apheresis Procedure', 'mod-apheresis', '5.3', 'clinical', 'modality',
'APHERESIS COLLECTION PROCEDURE', ARRAY['modality', 'cell-therapy', 'apheresis']::text[], true, '5.0', 1),

(6, 'Vector Safety Testing', 'mod-vector-safety', '4.2', 'nonclinical', 'modality',
'VECTOR SAFETY TESTING PROTOCOL', ARRAY['modality', 'gene-therapy', 'safety']::text[], true, '5.0', 1),

(6, 'Cell Characterization', 'mod-cell-char', '3.2.S', 'quality', 'modality',
'CELL PRODUCT CHARACTERIZATION', ARRAY['modality', 'cell-therapy', 'characterization']::text[], true, '5.0', 1),

(6, 'Potency Assay Development', 'mod-potency', '3.2.P.5', 'quality', 'modality',
'POTENCY ASSAY DEVELOPMENT', ARRAY['modality', 'cell-therapy', 'potency']::text[], true, '5.0', 1);

-- Biologics/Biosimilars Templates (11-20)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Biosimilar Comparability', 'mod-biosim-comp', '3.2.R', 'quality', 'modality',
'BIOSIMILAR COMPARABILITY STUDY', ARRAY['modality', 'biosimilar', 'comparability']::text[], true, '5.0', 1),

(6, 'Monoclonal Antibody', 'mod-mab', '3.2.S', 'quality', 'modality',
'MONOCLONAL ANTIBODY DEVELOPMENT', ARRAY['modality', 'biologics', 'mab']::text[], true, '5.0', 1),

(6, 'Protein Characterization', 'mod-protein', '3.2.S.3', 'quality', 'modality',
'PROTEIN CHARACTERIZATION', ARRAY['modality', 'biologics', 'protein']::text[], true, '5.0', 1),

(6, 'Glycosylation Analysis', 'mod-glyco', '3.2.S.3', 'quality', 'modality',
'GLYCOSYLATION PATTERN ANALYSIS', ARRAY['modality', 'biologics', 'glycosylation']::text[], true, '5.0', 1),

(6, 'Cell Line Development', 'mod-cell-line', '3.2.S.2', 'quality', 'modality',
'CELL LINE DEVELOPMENT', ARRAY['modality', 'biologics', 'cell-line']::text[], true, '5.0', 1),

(6, 'Immunogenicity Assessment', 'mod-immuno', '5.3.5', 'clinical', 'modality',
'IMMUNOGENICITY ASSESSMENT PLAN', ARRAY['modality', 'biologics', 'immunogenicity']::text[], true, '5.0', 1),

(6, 'PK/PD Biosimilar', 'mod-biosim-pkpd', '5.3.3', 'clinical', 'modality',
'BIOSIMILAR PK/PD STUDY', ARRAY['modality', 'biosimilar', 'pk-pd']::text[], true, '5.0', 1),

(6, 'Switching Study Design', 'mod-switching', '5.3', 'clinical', 'modality',
'BIOSIMILAR SWITCHING STUDY', ARRAY['modality', 'biosimilar', 'switching']::text[], true, '5.0', 1),

(6, 'ADC Development', 'mod-adc', '3.2', 'quality', 'modality',
'ANTIBODY-DRUG CONJUGATE', ARRAY['modality', 'biologics', 'adc']::text[], true, '5.0', 1),

(6, 'Fusion Protein', 'mod-fusion', '3.2.S', 'quality', 'modality',
'FUSION PROTEIN DEVELOPMENT', ARRAY['modality', 'biologics', 'fusion']::text[], true, '5.0', 1);

-- mRNA/Vaccine Templates (21-30)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'mRNA Vaccine Development', 'mod-mrna-vax', '3.2', 'quality', 'modality',
'MRNA VACCINE DEVELOPMENT', ARRAY['modality', 'mrna', 'vaccine']::text[], true, '5.0', 1),

(6, 'LNP Formulation', 'mod-lnp', '3.2.P', 'quality', 'modality',
'LIPID NANOPARTICLE FORMULATION', ARRAY['modality', 'mrna', 'lnp']::text[], true, '5.0', 1),

(6, 'mRNA Stability Protocol', 'mod-mrna-stab', '3.2.P.8', 'quality', 'modality',
'MRNA STABILITY TESTING', ARRAY['modality', 'mrna', 'stability']::text[], true, '5.0', 1),

(6, 'Vaccine Immunogenicity', 'mod-vax-immuno', '5.3.5', 'clinical', 'modality',
'VACCINE IMMUNOGENICITY STUDY', ARRAY['modality', 'vaccine', 'immunogenicity']::text[], true, '5.0', 1),

(6, 'Challenge Study Protocol', 'mod-challenge', '5.3', 'clinical', 'modality',
'HUMAN CHALLENGE STUDY', ARRAY['modality', 'vaccine', 'challenge']::text[], true, '5.0', 1),

(6, 'Adjuvant Development', 'mod-adjuvant', '3.2.A', 'quality', 'modality',
'VACCINE ADJUVANT DEVELOPMENT', ARRAY['modality', 'vaccine', 'adjuvant']::text[], true, '5.0', 1),

(6, 'Cold Chain Management', 'mod-cold-chain', '3.2.P.8', 'quality', 'modality',
'VACCINE COLD CHAIN MANAGEMENT', ARRAY['modality', 'vaccine', 'storage']::text[], true, '5.0', 1),

(6, 'Lot Release Testing', 'mod-lot-release', '3.2.P.5', 'quality', 'modality',
'VACCINE LOT RELEASE TESTING', ARRAY['modality', 'vaccine', 'release']::text[], true, '5.0', 1),

(6, 'Correlates of Protection', 'mod-correlates', '5.3.5', 'clinical', 'modality',
'CORRELATES OF PROTECTION STUDY', ARRAY['modality', 'vaccine', 'efficacy']::text[], true, '5.0', 1),

(6, 'Vaccine Safety Database', 'mod-vax-safety', '5.3.5', 'safety', 'modality',
'VACCINE SAFETY DATABASE', ARRAY['modality', 'vaccine', 'safety']::text[], true, '5.0', 1);

-- Digital Therapeutics Templates (31-40)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Digital Therapeutic Protocol', 'mod-dtx-protocol', '5.3', 'clinical', 'modality',
'DIGITAL THERAPEUTIC TRIAL', ARRAY['modality', 'digital-therapeutics', 'protocol']::text[], true, '5.0', 1),

(6, 'Software Validation', 'mod-dtx-validation', '3.2.R', 'quality', 'modality',
'SOFTWARE VALIDATION PROTOCOL', ARRAY['modality', 'digital-therapeutics', 'validation']::text[], true, '5.0', 1),

(6, 'Cybersecurity Assessment', 'mod-dtx-cyber', '3.2.R', 'quality', 'modality',
'CYBERSECURITY RISK ASSESSMENT', ARRAY['modality', 'digital-therapeutics', 'security']::text[], true, '5.0', 1),

(6, 'User Experience Study', 'mod-dtx-ux', '5.3', 'clinical', 'modality',
'USER EXPERIENCE EVALUATION', ARRAY['modality', 'digital-therapeutics', 'usability']::text[], true, '5.0', 1),

(6, 'Algorithm Validation', 'mod-dtx-algo', '3.2.R', 'quality', 'modality',
'ALGORITHM VALIDATION STUDY', ARRAY['modality', 'digital-therapeutics', 'algorithm']::text[], true, '5.0', 1),

(6, 'Real-World Evidence DTx', 'mod-dtx-rwe', '5.3.6', 'clinical', 'modality',
'DIGITAL THERAPEUTIC RWE', ARRAY['modality', 'digital-therapeutics', 'rwe']::text[], true, '5.0', 1),

(6, 'Engagement Metrics', 'mod-dtx-engage', '5.3', 'clinical', 'modality',
'PATIENT ENGAGEMENT METRICS', ARRAY['modality', 'digital-therapeutics', 'engagement']::text[], true, '5.0', 1),

(6, 'Clinical Decision Support', 'mod-dtx-cds', '5.3', 'clinical', 'modality',
'CLINICAL DECISION SUPPORT SYSTEM', ARRAY['modality', 'digital-therapeutics', 'cds']::text[], true, '5.0', 1),

(6, 'AI/ML Validation', 'mod-dtx-ai', '3.2.R', 'quality', 'modality',
'AI/ML MODEL VALIDATION', ARRAY['modality', 'digital-therapeutics', 'ai-ml']::text[], true, '5.0', 1),

(6, 'Data Privacy Protocol', 'mod-dtx-privacy', '1.3', 'regulatory', 'modality',
'DATA PRIVACY AND PROTECTION', ARRAY['modality', 'digital-therapeutics', 'privacy']::text[], true, '5.0', 1);

-- =========================================================================================
-- OTHER REGULATORY TEMPLATES (55 Templates)
-- =========================================================================================

INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
-- Health Canada Templates (1-10)
(6, 'HC CTA Application', 'hc-cta', '1.2', 'regulatory', 'application',
'HEALTH CANADA CTA APPLICATION', ARRAY['hc', 'canada', 'cta']::text[], true, '5.0', 1),

(6, 'HC NOC Application', 'hc-noc', '1.2', 'regulatory', 'application',
'NOTICE OF COMPLIANCE APPLICATION', ARRAY['hc', 'canada', 'noc']::text[], true, '5.0', 1),

(6, 'HC Canadian Reference', 'hc-crf', '3.2.R', 'quality', 'reference',
'CANADIAN REFERENCE PRODUCT', ARRAY['hc', 'canada', 'reference']::text[], true, '5.0', 1),

(6, 'HC Periodic Report', 'hc-periodic', '1.8', 'safety', 'report',
'HC PERIODIC SAFETY REPORT', ARRAY['hc', 'canada', 'safety']::text[], true, '5.0', 1),

(6, 'HC Product Monograph', 'hc-pm', '1.14', 'regulatory', 'labeling',
'CANADIAN PRODUCT MONOGRAPH', ARRAY['hc', 'canada', 'monograph']::text[], true, '5.0', 1),

(6, 'HC SAE Reporting', 'hc-sae', '1.8', 'safety', 'report',
'HC SAE REPORTING FORM', ARRAY['hc', 'canada', 'sae']::text[], true, '5.0', 1),

(6, 'HC Priority Review', 'hc-priority', '1.6', 'regulatory', 'review',
'HC PRIORITY REVIEW REQUEST', ARRAY['hc', 'canada', 'priority']::text[], true, '5.0', 1),

(6, 'HC NOC/c Application', 'hc-nocc', '1.6', 'regulatory', 'conditional',
'NOTICE OF COMPLIANCE WITH CONDITIONS', ARRAY['hc', 'canada', 'conditional']::text[], true, '5.0', 1),

(6, 'HC Biosimilar SEB', 'hc-seb', '3.2.R', 'quality', 'biosimilar',
'SUBSEQUENT ENTRY BIOLOGIC', ARRAY['hc', 'canada', 'biosimilar']::text[], true, '5.0', 1),

(6, 'HC PSUR-C Format', 'hc-psurc', '1.8.1', 'safety', 'report',
'CANADIAN PSUR FORMAT', ARRAY['hc', 'canada', 'psur']::text[], true, '5.0', 1);

-- TGA Australia Templates (11-20)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'TGA CTN Application', 'tga-ctn', '1.2', 'regulatory', 'notification',
'CLINICAL TRIAL NOTIFICATION', ARRAY['tga', 'australia', 'ctn']::text[], true, '5.0', 1),

(6, 'TGA CTX Scheme', 'tga-ctx', '1.2', 'regulatory', 'exemption',
'CLINICAL TRIAL EXEMPTION', ARRAY['tga', 'australia', 'ctx']::text[], true, '5.0', 1),

(6, 'TGA ARTG Registration', 'tga-artg', '1.2', 'regulatory', 'registration',
'ARTG REGISTRATION', ARRAY['tga', 'australia', 'artg']::text[], true, '5.0', 1),

(6, 'TGA Biosimilar Application', 'tga-biosimilar', '1.2', 'regulatory', 'biosimilar',
'TGA BIOSIMILAR APPLICATION', ARRAY['tga', 'australia', 'biosimilar']::text[], true, '5.0', 1),

(6, 'TGA Priority Determination', 'tga-priority', '1.6', 'regulatory', 'priority',
'PRIORITY REVIEW DETERMINATION', ARRAY['tga', 'australia', 'priority']::text[], true, '5.0', 1),

(6, 'TGA Provisional Pathway', 'tga-provisional', '1.6', 'regulatory', 'provisional',
'PROVISIONAL APPROVAL PATHWAY', ARRAY['tga', 'australia', 'provisional']::text[], true, '5.0', 1),

(6, 'TGA PI Document', 'tga-pi', '1.14', 'regulatory', 'information',
'PRODUCT INFORMATION DOCUMENT', ARRAY['tga', 'australia', 'pi']::text[], true, '5.0', 1),

(6, 'TGA CMI Document', 'tga-cmi', '1.14', 'regulatory', 'information',
'CONSUMER MEDICINE INFORMATION', ARRAY['tga', 'australia', 'cmi']::text[], true, '5.0', 1),

(6, 'TGA Safety Reporting', 'tga-safety', '1.8', 'safety', 'report',
'TGA SAFETY REPORTING', ARRAY['tga', 'australia', 'safety']::text[], true, '5.0', 1),

(6, 'TGA PSRF Format', 'tga-psrf', '1.8.1', 'safety', 'report',
'PERIODIC SAFETY REPORT FORMAT', ARRAY['tga', 'australia', 'psrf']::text[], true, '5.0', 1);

-- MHRA UK Templates (21-30)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'MHRA CTA Application', 'mhra-cta', '1.2', 'regulatory', 'application',
'MHRA CLINICAL TRIAL APPLICATION', ARRAY['mhra', 'uk', 'cta']::text[], true, '5.0', 1),

(6, 'MHRA MAA Application', 'mhra-maa', '1.2', 'regulatory', 'application',
'MARKETING AUTHORIZATION APPLICATION', ARRAY['mhra', 'uk', 'maa']::text[], true, '5.0', 1),

(6, 'MHRA ILAP Pathway', 'mhra-ilap', '1.6', 'regulatory', 'innovative',
'INNOVATIVE LICENSING PATHWAY', ARRAY['mhra', 'uk', 'ilap']::text[], true, '5.0', 1),

(6, 'MHRA EAMS Scheme', 'mhra-eams', '1.6', 'regulatory', 'early-access',
'EARLY ACCESS TO MEDICINES', ARRAY['mhra', 'uk', 'eams']::text[], true, '5.0', 1),

(6, 'MHRA Yellow Card', 'mhra-yellow', '1.8', 'safety', 'reporting',
'YELLOW CARD REPORTING', ARRAY['mhra', 'uk', 'yellow-card']::text[], true, '5.0', 1),

(6, 'MHRA DSUR Format', 'mhra-dsur', '2.7.4', 'safety', 'report',
'DEVELOPMENT SAFETY UPDATE', ARRAY['mhra', 'uk', 'dsur']::text[], true, '5.0', 1),

(6, 'MHRA SmPC', 'mhra-smpc', '1.14', 'regulatory', 'labeling',
'SUMMARY OF PRODUCT CHARACTERISTICS', ARRAY['mhra', 'uk', 'smpc']::text[], true, '5.0', 1),

(6, 'MHRA PIL', 'mhra-pil', '1.14', 'regulatory', 'information',
'PATIENT INFORMATION LEAFLET', ARRAY['mhra', 'uk', 'pil']::text[], true, '5.0', 1),

(6, 'MHRA Biosimilar Guidance', 'mhra-biosimilar', '3.2.R', 'quality', 'biosimilar',
'UK BIOSIMILAR GUIDANCE', ARRAY['mhra', 'uk', 'biosimilar']::text[], true, '5.0', 1),

(6, 'MHRA Variation Application', 'mhra-variation', '1.5', 'regulatory', 'variation',
'VARIATION APPLICATION', ARRAY['mhra', 'uk', 'variation']::text[], true, '5.0', 1);

-- Swissmedic Templates (31-40)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
(6, 'Swissmedic CTA', 'swiss-cta', '1.2', 'regulatory', 'application',
'SWISSMEDIC CLINICAL TRIAL', ARRAY['swissmedic', 'switzerland', 'cta']::text[], true, '5.0', 1),

(6, 'Swissmedic NAS Application', 'swiss-nas', '1.2', 'regulatory', 'application',
'NEW ACTIVE SUBSTANCE APPLICATION', ARRAY['swissmedic', 'switzerland', 'nas']::text[], true, '5.0', 1),

(6, 'Swissmedic Fast Track', 'swiss-fast', '1.6', 'regulatory', 'fast-track',
'FAST TRACK AUTHORIZATION', ARRAY['swissmedic', 'switzerland', 'fast-track']::text[], true, '5.0', 1),

(6, 'Swissmedic Orphan Drug', 'swiss-orphan', '1.6', 'regulatory', 'orphan',
'ORPHAN DRUG STATUS', ARRAY['swissmedic', 'switzerland', 'orphan']::text[], true, '5.0', 1),

(6, 'Swissmedic PSUR', 'swiss-psur', '1.8.1', 'safety', 'report',
'PERIODIC SAFETY UPDATE', ARRAY['swissmedic', 'switzerland', 'psur']::text[], true, '5.0', 1),

(6, 'Swissmedic Safety Reporting', 'swiss-safety', '1.8', 'safety', 'reporting',
'SAFETY VIGILANCE REPORTING', ARRAY['swissmedic', 'switzerland', 'safety']::text[], true, '5.0', 1),

(6, 'Swissmedic Product Information', 'swiss-pi', '1.14', 'regulatory', 'information',
'PRODUCT INFORMATION TEXT', ARRAY['swissmedic', 'switzerland', 'pi']::text[], true, '5.0', 1),

(6, 'Swissmedic Biosimilar', 'swiss-biosimilar', '3.2.R', 'quality', 'biosimilar',
'SWISS BIOSIMILAR APPLICATION', ARRAY['swissmedic', 'switzerland', 'biosimilar']::text[], true, '5.0', 1),

(6, 'Swissmedic Variation', 'swiss-variation', '1.5', 'regulatory', 'variation',
'VARIATION APPLICATION', ARRAY['swissmedic', 'switzerland', 'variation']::text[], true, '5.0', 1),

(6, 'Swissmedic Temporary Authorization', 'swiss-temp', '1.6', 'regulatory', 'temporary',
'TEMPORARY AUTHORIZATION', ARRAY['swissmedic', 'switzerland', 'temporary']::text[], true, '5.0', 1);

-- Other International Templates (41-55)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, tags, is_active, version, created_by)
VALUES
-- Brazil ANVISA
(6, 'ANVISA Clinical Trial', 'anvisa-ct', '1.2', 'regulatory', 'application',
'ANVISA CLINICAL TRIAL', ARRAY['anvisa', 'brazil', 'clinical-trial']::text[], true, '5.0', 1),

(6, 'ANVISA Registration', 'anvisa-reg', '1.2', 'regulatory', 'registration',
'ANVISA PRODUCT REGISTRATION', ARRAY['anvisa', 'brazil', 'registration']::text[], true, '5.0', 1),

(6, 'ANVISA RDC 200', 'anvisa-rdc200', '1.2', 'regulatory', 'biosimilar',
'RDC 200 BIOSIMILAR PATHWAY', ARRAY['anvisa', 'brazil', 'biosimilar']::text[], true, '5.0', 1),

-- China NMPA
(6, 'NMPA IND Application', 'nmpa-ind', '1.2', 'regulatory', 'application',
'NMPA IND APPLICATION', ARRAY['nmpa', 'china', 'ind']::text[], true, '5.0', 1),

(6, 'NMPA NDA Application', 'nmpa-nda', '1.2', 'regulatory', 'application',
'NMPA NEW DRUG APPLICATION', ARRAY['nmpa', 'china', 'nda']::text[], true, '5.0', 1),

(6, 'NMPA Breakthrough Therapy', 'nmpa-breakthrough', '1.6', 'regulatory', 'breakthrough',
'BREAKTHROUGH THERAPY DESIGNATION', ARRAY['nmpa', 'china', 'breakthrough']::text[], true, '5.0', 1),

-- India CDSCO
(6, 'CDSCO Clinical Trial', 'cdsco-ct', '1.2', 'regulatory', 'application',
'CDSCO CLINICAL TRIAL APPLICATION', ARRAY['cdsco', 'india', 'clinical-trial']::text[], true, '5.0', 1),

(6, 'CDSCO New Drug Application', 'cdsco-nda', '1.2', 'regulatory', 'application',
'CDSCO NEW DRUG APPLICATION', ARRAY['cdsco', 'india', 'nda']::text[], true, '5.0', 1),

(6, 'CDSCO Biosimilar Guidelines', 'cdsco-biosimilar', '3.2.R', 'quality', 'biosimilar',
'INDIAN BIOSIMILAR GUIDELINES', ARRAY['cdsco', 'india', 'biosimilar']::text[], true, '5.0', 1),

-- South Korea MFDS
(6, 'MFDS Clinical Trial', 'mfds-ct', '1.2', 'regulatory', 'application',
'MFDS CLINICAL TRIAL APPLICATION', ARRAY['mfds', 'korea', 'clinical-trial']::text[], true, '5.0', 1),

(6, 'MFDS NDA Application', 'mfds-nda', '1.2', 'regulatory', 'application',
'MFDS NEW DRUG APPLICATION', ARRAY['mfds', 'korea', 'nda']::text[], true, '5.0', 1),

-- Singapore HSA
(6, 'HSA CTC Application', 'hsa-ctc', '1.2', 'regulatory', 'application',
'HSA CLINICAL TRIAL CERTIFICATE', ARRAY['hsa', 'singapore', 'ctc']::text[], true, '5.0', 1),

(6, 'HSA NDA Application', 'hsa-nda', '1.2', 'regulatory', 'application',
'HSA NEW DRUG APPLICATION', ARRAY['hsa', 'singapore', 'nda']::text[], true, '5.0', 1),

-- Mexico COFEPRIS
(6, 'COFEPRIS Clinical Trial', 'cofepris-ct', '1.2', 'regulatory', 'application',
'COFEPRIS CLINICAL TRIAL', ARRAY['cofepris', 'mexico', 'clinical-trial']::text[], true, '5.0', 1),

(6, 'COFEPRIS Registration', 'cofepris-reg', '1.2', 'regulatory', 'registration',
'COFEPRIS PRODUCT REGISTRATION', ARRAY['cofepris', 'mexico', 'registration']::text[], true, '5.0', 1);

-- Update organization 7 templates (copy of organization 6)
INSERT INTO ectd_templates (organization_id, template_name, granule_id, module_number, category, template_type, content, placeholders, ich_guidance, tags, is_active, is_default, version, usage_count, created_by)
SELECT 
    7 as organization_id,
    template_name,
    granule_id,
    module_number,
    category,
    template_type,
    content,
    placeholders,
    ich_guidance,
    tags,
    is_active,
    is_default,
    version,
    usage_count,
    created_by
FROM ectd_templates 
WHERE organization_id = 6;

-- Verify the count
SELECT 
    organization_id,
    COUNT(*) as template_count 
FROM ectd_templates 
GROUP BY organization_id;