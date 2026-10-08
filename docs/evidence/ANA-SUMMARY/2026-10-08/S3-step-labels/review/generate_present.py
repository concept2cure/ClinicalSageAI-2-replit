"""One-off generator for the register's `present` blocks (ANA-SUMMARY S3).

Mechanical first pass from each tool's name, then per-tool overrides written
after reading the tool's description. Output: present.json (name -> block) and
present-review.tsv (family, name, class, doing, done, source, preview).
Never run against a reviewed register: it is evidence of method, not a tool.
"""
import json, re, sys, os

ROOT = '/home/user/ClinicalSageAI-2-replit'
OUT = os.path.dirname(os.path.abspath(__file__))
inv = json.load(open(f'{ROOT}/server/services/ana/ana-launch-scope.inventory.json'))
reg = json.load(open(f'{ROOT}/server/services/ana/tool-authorization.register.json'))['tools']
man = {t['name']: t for t in json.load(open(f'{ROOT}/docs/ana-capability-manifest.json'))['tools']}
IN_SCOPE = sorted(inv['tools']['inScope'])
# Hidden-app tools that had a hand-written label before S3: kept, so dev keeps its words.
HIDDEN_LABELLED = ['load_nonclinical_program', 'regulatory_deadline_radar', 'assess_claim_evidence_integrity',
                   'start_deep_investigation', 'check_deep_investigation', 'get_tmf_view', 'seed_tmf']

ACRONYMS = {
    'fda': 'FDA', 'ich': 'ICH', 'ectd': 'eCTD', 'qms': 'QMS', 'cmc': 'CMC', 'gmp': 'GMP', 'gcp': 'GCP', 'bla': 'BLA',
    'nda': 'NDA', 'anda': 'ANDA', 'ind': 'IND', 'csr': 'CSR', 'sop': 'SOP', 'spl': 'SPL', 'udi': 'UDI', 'ivd': 'IVD',
    'samd': 'SaMD', 'rwe': 'RWE', 'pk': 'PK', 'pv': 'PV', 'coa': 'COA', 'ddi': 'DDI', 'qtc': 'QTc', 'atmp': 'ATMP',
    'cart': 'CAR-T', 'cns': 'CNS', 'bcs': 'BCS', 'cyp': 'CYP', 'midd': 'MIDD', 'pbpk': 'PBPK', 'rems': 'REMS',
    'pccp': 'PCCP', 'pacmp': 'PACMP', 'mrmc': 'MRMC', 'mmrm': 'MMRM', 'rmst': 'RMST', 'capa': 'CAPA', 'irb': 'IRB',
    'soa': 'SoA', 'tmf': 'TMF', 'cdisc': 'CDISC', 'sdtm': 'SDTM', 'adam': 'ADaM', 'docx': 'Word', 'pdf': 'PDF',
    'xml': 'XML', 'eu': 'EU', 'us': 'US', 'ctd': 'CTD', 'rim': 'RIM', 'ctq': 'CTQ', 'usdm': 'USDM', 'dct': 'DCT',
    'who': 'WHO', 'ictrp': 'ICTRP', 'cdx': 'CDx', 'ada': 'ADA', 'nab': 'NAb', 'be': 'bioequivalence', 'fih': 'first-in-human',
    'rp2d': 'RP2D', 'br': 'benefit-risk', 'gmlp': 'GMLP', 'mdr': 'MDR', 'otc': 'OTC', 'plr': 'PLR', 'smpc': 'SmPC',
    'ttc': 'TTC', 'icd10': 'ICD-10', 'meddra': 'MedDRA', 'whodrug': 'WHODrug', 'ema': 'EMA', 'epar': 'EPAR',
    'ctis': 'CTIS', 'eudamed': 'EUDAMED', 'chembl': 'ChEMBL', 'crm': 'CRM', 'ris': 'RIS', 'dsur': 'DSUR', 'psur': 'PSUR',
    'stf': 'study tagging file', 'rps': 'RPS', 'v4': 'v4', 'iso17511': 'ISO 17511', 'qa': 'QA', 'qc': 'QC',
    'api': 'API', 'ai': 'AI', 'ml': 'ML', 'm2': 'Module 2', 'gsppr': 'GSPR', 'nmb': 'net monetary benefit',
    'heor': 'HEOR', 'ctgov': 'ClinicalTrials.gov', '505': '505', '510k': '510(k)', 'ri': 'RI', 'ana': 'AnA',
}

def words(rest):
    out = []
    for w in rest.split('_'):
        out.append(ACRONYMS.get(w, w))
    return ' '.join(out)

# prefix -> (verb, object template using {r} for humanised remainder)
PREFIX = [
    ('search_', 'search', 'the {r}'), ('list_', 'list', 'the {r}'), ('read_', 'read', 'the {r}'),
    ('get_', 'look_up', 'the {r}'), ('lookup_', 'look_up', 'the {r}'), ('assess_', 'assess', 'the {r}'),
    ('analyze_', 'analyze', 'the {r}'), ('classify_', 'classify', 'the {r}'), ('compute_', 'compute', 'the {r}'),
    ('calculate_', 'compute', 'the {r}'), ('compare_', 'compare', 'the {r}'), ('check_', 'check', 'the {r}'),
    ('validate_', 'validate', 'the {r}'), ('verify_', 'check', 'the {r}'), ('design_', 'design', 'the {r}'),
    ('plan_', 'plan', 'the {r}'), ('select_', 'select', 'the {r}'), ('draft_', 'draft', 'the {r}'),
    ('generate_', 'generate', 'the {r}'), ('build_', 'build', 'the {r}'), ('assemble_', 'assemble', 'the {r}'),
    ('create_', 'create', 'a {r}'), ('add_', 'add', 'a {r}'), ('update_', 'update', 'the {r}'),
    ('set_', 'update', 'the {r}'), ('review_', 'review', 'the {r}'), ('advise_', 'look_up', 'guidance on {r}'),
    ('explain_', 'explain', 'the {r}'), ('estimate_', 'estimate', 'the {r}'), ('model_', 'compute', 'the {r}'),
    ('score_', 'score', 'the {r}'), ('screen_', 'screen', 'the {r}'), ('detect_', 'check', 'the {r}'),
    ('global_ri_', 'look_up', 'the {r}'),
]

FAMILY_SOURCE = {
    'vault': 'vault', 'data room': 'data_room', 'authoring': 'authoring', 'protocol authoring': 'authoring',
    'submission': 'submissions', 'quality': 'qms', 'reports': 'reports', 'project': 'project', 'agency': 'agency',
    'literature': 'literature', 'regulatory knowledge': 'knowledge', 'engines': 'engine', 'screen': 'screen',
    'plan': 'plan', 'connected': 'connected', 'mailbox': 'mailbox',
}

# name -> (family, verb, object, preview) ; written after reading each description.
O = {}
def o(family, verb, obj, *names, preview=None, source=None):
    for n in names:
        O[n] = (family, verb, obj, preview, source)

# ── Vault (the client's filed project documents) ──
o('vault', 'list', 'the Vault documents', 'list_project_documents')
o('vault', 'search', 'the Vault', 'search_project_documents', preview=['query'])
o('vault', 'read', 'a Vault document', 'read_project_document', preview=['@documentTitle'])
o('vault', 'record', 'what a Vault document is', 'catalog_project_document', preview=['@documentTitle'])
o('vault', 'place', 'a Vault document in its folder', 'place_project_document', preview=['@documentTitle'])
o('vault', 'search', 'inside the Vault documents', 'search_document_passages', preview=['query'])
o('vault', 'file', 'an upload into the Vault', 'file_chat_upload_to_vault', preview=['title'])
o('vault', 'search', 'every document store', 'search_all_documents', preview=['query'])
o('vault', 'save', 'a document to the Vault', 'save_document_to_vault', preview=['title'])
o('vault', 'save', 'a new version of a Vault document', 'update_vault_document')
o('vault', 'compare', 'two versions of a Vault document', 'compare_vault_versions')
o('vault', 'look_up', "a Vault document's version history", 'get_document_versions')
o('vault', 'save', 'a governed revision of the document', 'commit_document_revision', preview=['title'])
# ── Artifacts Center (governed program artifacts) ──
o('project', 'list', 'the Artifacts Center documents', 'list_vault_documents', preview=['query'])
o('project', 'read', 'an Artifacts Center document', 'read_vault_document')
# ── Data Room (uploads and the project's knowledge corpus) ──
o('data room', 'search', "the project's documents", 'project_knowledge_search', preview=['query'])
o('data room', 'search', "the project's documents", 'project_knowledge_search_multi', preview=['queries[0]'])
o('data room', 'read', 'an uploaded file', 'read_uploaded_document')
o('data room', 'check', 'an uploaded file before reading it', 'inspect_uploaded_document')
o('data room', 'search', 'inside a large uploaded file', 'search_large_document', preview=['queries[0]', 'query'])
o('data room', 'read', 'scanned pages', 'ocr_document_pages')
o('data room', 'read', 'an uploaded spreadsheet', 'read_spreadsheet')
o('data room', 'edit', 'an uploaded spreadsheet', 'edit_spreadsheet')
o('data room', 'save', 'a document to project memory', 'remember_document_in_project')
o('data room', 'render', 'a page as an image', 'rasterize_page')
o('data room', 'start', 'a legacy import', 'start_legacy_import')
o('data room', 'update', "an imported file's mapping", 'override_import_mapping')
o('data room', 'finalize', 'the import', 'approve_import')
o('data room', 'add', 'the study reports to the evidence base', 'project_csr_evidence')
# ── Authoring ──
o('authoring', 'list', 'the authoring outline', 'list_authoring_outline')
o('authoring', 'read', 'an authoring section', 'read_authoring_section')
o('authoring', 'search', 'the authoring documents', 'search_authoring_sections', preview=['query'])
o('authoring', 'create', 'an authoring document', 'draft_authoring_document', preview=['title'])
o('authoring', 'draft', 'a regulatory document', 'generate_document', preview=['title'])
o('authoring', 'draft', 'several sections at once', 'batch_draft_sections')
o('authoring', 'run', 'the drafting council', 'convene_drafting_council')
o('authoring', 'build', 'a Word document', 'author_docx_native', preview=['title'])
o('authoring', 'build', 'a document from your template', 'build_from_template')
o('authoring', 'build', 'a document from the template library', 'fetch_template_and_fill')
o('authoring', 'add', 'a clause to the Word document', 'insert_clause_template')
o('authoring', 'edit', 'the Word document', 'insert_document_content', 'surgical_docx_xml_edit')
o('authoring', 'convert', 'the Word document to PDF', 'convert_docx_to_pdf')
o('authoring', 'critique', 'the document', 'critique_document')
o('authoring', 'critique', 'the draft', 'critique_draft')
o('authoring', 'look_up', 'medical-writing guidance', 'medical_writing_guidance')
o('authoring', 'review', 'the draft against medical-writing standards', 'medical_writing_review')
o('authoring', 'check', 'that the revision improved the draft', 'verify_revision')
o('authoring', 'draft', 'the Module 2.5 Clinical Overview', 'draft_clinical_overview_m2_5')
o('authoring', 'draft', 'the Module 2.7 Clinical Summary', 'draft_clinical_summary_m2_7')
o('authoring', 'draft', 'the Module 2.4 Nonclinical Overview', 'draft_nonclinical_overview_m2_4')
o('authoring', 'draft', 'the Module 2.6 Nonclinical Summaries', 'draft_nonclinical_summaries_m2_6')
o('authoring', 'draft', 'the Module 2.3 Quality Overall Summary', 'draft_quality_overall_summary_m2_3')
o('authoring', 'draft', 'the FDA Information Request response', 'draft_fda_ir_response')
o('authoring', 'draft', 'a patient safety narrative', 'draft_safety_narrative')
o('authoring', 'draft', 'the 510(k) substantial-equivalence comparison', 'draft_510k_substantial_equivalence')
o('authoring', 'draft', 'a statement of the statistical result', 'narrate_statistical_result')
o('authoring', 'draft', 'a statistical document', 'generate_statistical_document')
o('authoring', 'draft', 'an SOP', 'generate_sop', preview=['title'])
o('authoring', 'look_up', 'a document template', 'get_document_template')
o('authoring', 'look_up', 'the Module 5 report template', 'get_csr_template')
o('authoring', 'look_up', 'the Module 4 report template', 'get_nonclinical_template')
o('authoring', 'draft', 'an FDA form', 'prepare_fda_form')
o('authoring', 'update', 'an FDA form', 'amend_fda_form')
o('authoring', 'list', 'the FDA forms', 'list_fda_forms')
o('authoring', 'plan', 'the IND module', 'plan_ind_module_authoring')
o('authoring', 'plan', 'the labeling authoring', 'plan_labeling_authoring')
o('authoring', 'check', 'the draft for abbreviations', 'build_abbreviation_list')
o('authoring', 'check', 'the draft for ungrounded figures', 'check_grounding')
o('authoring', 'check', 'the text against expected topics', 'check_regulatory_compliance')
o('authoring', 'screen', 'the text for promotional claims', 'screen_promotional_language')
o('authoring', 'score', 'the text for readability', 'assess_readability')
o('authoring', 'search', 'inside the document', 'search_document', preview=['query'])
o('authoring', 'extract', "the document's structure", 'extract_document_structure')
o('authoring', 'compare', 'two versions of the text', 'compare_document_versions')
o('authoring', 'validate', 'the Word document', 'validate_docx')
o('authoring', 'check', 'the Word document against its source', 'verify_docx_against_source')
o('authoring', 'run', 'a PDF overlay', 'pdf_overlay')
o('authoring', 'scan', 'the document for citations', 'scan_document_citations')
o('authoring', 'apply', 'a change to a governed value', 'apply_fact_change')
o('authoring', 'check', 'the draft against guidance changes', 'guidance_change_radar')
# ── Protocol authoring ──
for n, obj in [('add_amendment_change', 'a change to the amendment'), ('add_capa_action', 'a CAPA action'),
               ('add_eligibility_criterion', 'an eligibility criterion'), ('add_irb_site', 'a site to the IRB submission'),
               ('add_protocol_budget_item', 'a budget line to the protocol'), ('add_protocol_milestone', 'a protocol milestone'),
               ('add_protocol_objective', 'an objective to the protocol'), ('add_protocol_review_comment', 'a review comment'),
               ('add_protocol_risk', 'a risk to the protocol'), ('add_soa_assessment', 'an assessment to the schedule')]:
    o('protocol authoring', 'add', obj, n)
o('protocol authoring', 'link', 'the protocol to its study design', 'bind_protocol_to_study_design')
o('protocol authoring', 'apply', 'accepted design derivations', 'apply_protocol_design_derivation')
o('protocol authoring', 'link', 'the program to its clinical study', 'link_program_clinical_study')
o('protocol authoring', 'update', 'a reviewer assignment', 'assign_protocol_reviewer')
o('protocol authoring', 'create', 'a protocol from a template', 'clone_protocol_template', preview=['title'])
o('protocol authoring', 'create', 'a consent form', 'create_consent_form', preview=['title'])
o('protocol authoring', 'create', 'an IRB submission', 'create_irb_submission', preview=['title'])
o('protocol authoring', 'create', 'a protocol amendment', 'create_protocol_amendment', preview=['title'])
o('protocol authoring', 'create', 'a protocol document', 'create_protocol_document', preview=['title'])
o('protocol authoring', 'create', 'a protocol template', 'create_protocol_template')
o('protocol authoring', 'save', 'the protocol as a template', 'save_document_as_template')
o('protocol authoring', 'update', 'a protocol section', 'update_protocol_section')
o('protocol authoring', 'update', 'a consent element', 'update_consent_element')
o('protocol authoring', 'update', "the protocol's budget settings", 'set_protocol_budget_params')
o('protocol authoring', 'update', "a milestone's status", 'set_protocol_milestone_status')
o('protocol authoring', 'update', 'the schedule of assessments', 'set_soa_cell')
o('protocol authoring', 'check', 'whether the protocol can be finalized', 'finalize_protocol_document')
o('protocol authoring', 'assemble', 'the protocol document', 'export_protocol_document')
o('protocol authoring', 'build', 'the USDM view of the study design', 'export_usdm_projection')
o('protocol authoring', 'derive', 'the critical-to-quality factors', 'derive_ctq_factors')
o('protocol authoring', 'generate', 'a ClinicalTrials.gov registration draft', 'generate_ctgov_registration_draft')
o('protocol authoring', 'list', 'the protocol templates', 'list_protocol_templates')
o('protocol authoring', 'select', 'stress scenarios for the protocol', 'stress_test_protocol')
for n, obj in [('review_amendment', 'the amendment'), ('review_biospecimen_profile', 'the biospecimen collection'),
               ('review_consent_completeness', 'the consent form'), ('review_dct_profile', 'the decentralised elements'),
               ('review_deviation', 'the deviation'), ('review_deviation_trends', 'the deviation trends'),
               ('review_dose_escalation_design', 'the dose-escalation rules'), ('review_enrollment_forecast', 'the enrollment forecast'),
               ('review_external_control_plan', 'the external-control plan'), ('review_informed_consent', 'the informed-consent form'),
               ('review_interim_operating_characteristics', 'the interim-analysis plan'), ('review_irb_submission', 'the IRB submission'),
               ('review_master_protocol', 'the master-protocol plan'), ('review_mmrm_sizing', 'the MMRM sizing'),
               ('review_multiplicity_control', 'the multiplicity control'), ('review_protocol_budget', 'the protocol budget'),
               ('review_protocol_completeness', 'the protocol for completeness'), ('review_protocol_design_derivation', "the protocol's study design"),
               ('review_protocol_design_gates', 'the study-design checks'), ('review_protocol_redline', 'two protocol versions'),
               ('review_protocol_regulatory_rules', 'the protocol against the regulatory rules'), ('review_protocol_review_status', 'the protocol review status'),
               ('review_protocol_risk_register', 'the protocol risk register'), ('review_protocol_timeline', 'the protocol timeline'),
               ('review_soa_matrix', 'the schedule of assessments'), ('review_spirit_conformance', 'the protocol against SPIRIT'),
               ('review_trial_schema', 'the trial schema'), ('review_who_ictrp_record', 'the WHO registration record')]:
    o('protocol authoring', 'review', obj, n)
o('protocol authoring', 'record', 'a protocol deviation', 'report_protocol_deviation')
# ── Submission Center ──
o('submission', 'validate', 'the eCTD package', 'validate_ectd_package')
o('submission', 'look_up', 'the submission acknowledgment', 'get_submission_ack')
o('submission', 'check', 'the submission status', 'check_submission_status')
o('submission', 'package', 'the eCTD for a region', 'package_ectd_for_region', preview=['sequence'])
o('submission', 'place', 'a document in the sequence', 'place_into_sequence', preview=['title'])
o('submission', 'check', 'whether the sequence is clear to dispatch', 'assess_dispatch_readiness')
o('submission', 'check', 'the sequence before dispatch', 'dispatch_qc_check')
o('submission', 'build', 'the pathway table of contents', 'build_pathway_manifest')
o('submission', 'check', 'the sequence for its pathway', 'assess_pathway_readiness')
o('submission', 'compute', 'the eCTD lifecycle operations', 'compute_lifecycle_operations')
o('submission', 'convert', 'the leaves to eCTD v4', 'convert_to_rps_v4')
o('submission', 'record', 'a validation finding', 'record_validation_finding')
o('submission', 'resolve', 'a validation finding', 'resolve_validation_finding')
o('submission', 'run', 'a shadow review', 'run_shadow_review')
o('submission', 'check', 'which gateways are configured', 'gateway_configuration_status')
o('submission', 'explain', 'how to transmit the submission', 'transmit_submission', preview=['sequence'])
o('submission', 'list', 'the validation rules', 'list_validation_rules')
o('submission', 'explain', 'the validation findings', 'explain_validation_findings')
o('submission', 'classify', 'a submission document', 'classify_submission_document')
o('submission', 'extract', 'a submission document', 'extract_submission_document')
o('submission', 'list', "the Submission Center's capabilities", 'list_regulatory_capabilities')
o('submission', 'check', "a market's formatting rules", 'validate_market_formatting')
o('submission', 'look_up', "a market's submission specification", 'get_market_submission_spec')
o('submission', 'check', 'the eCTD cross-references', 'check_ectd_cross_references')
o('submission', 'generate', 'the study tagging file', 'generate_stf')
o('submission', 'list', 'the governed documents', 'list_governed_documents')
o('submission', 'read', 'a governed document', 'read_governed_document')
o('submission', 'assemble', 'an eCTD module from the artifacts', 'assemble_ectd_module_from_artifacts')
o('submission', 'assemble', 'the correspondence response package', 'compile_correspondence_response_package')
o('submission', 'check', 'the CTD cross-references', 'validate_cross_references')
o('submission', 'check', 'figures across the dossier', 'check_consistency', 'check_dossier_consistency', 'reconcile_dossier_numbers', 'reconcile_extracted_figures')
o('submission', 'check', 'the draft for conflicting figures', 'check_numerical_integrity')
o('submission', 'assess', 'the submission package', 'assess_submission_package')
o('submission', 'assess', 'the device submission assembly', 'assemble_device_submission')
o('submission', 'look_up', 'the submission requirements', 'get_submission_requirements')
o('submission', 'look_up', 'the CTD Module 1 and 2 structure', 'get_ctd_module_home')
o('submission', 'look_up', 'the regulatory structure', 'resolve_regulatory_structure')
o('submission', 'plan', 'the multi-region submission', 'resolve_submission_plan')
o('submission', 'plan', 'the submission', 'plan_submission')
o('submission', 'run', 'a submission pre-mortem', 'run_submission_premortem')
o('submission', 'assemble', 'a pre-mortem report', 'assemble_crl_premortem_artifact', preview=['title'])
o('submission', 'look_up', 'likely submission deficiencies', 'lookup_submission_deficiencies')
o('submission', 'scan', 'the text for likely deficiencies', 'scan_regulatory_deficiencies')
o('submission', 'compare', 'the submission against precedent', 'compare_submission_against_precedent')
o('submission', 'trace', "a section's sources", 'trace_provenance')
o('submission', 'look_up', 'the device reviewer checklist', 'get_device_reviewer_checklist')
# ── Quality ──
o('quality', 'record', 'a training acknowledgement', 'ack_training')
o('quality', 'explain', 'how to approve the controlled document', 'approve_qms_document')
o('quality', 'explain', 'how to retire the controlled document', 'retire_qms_document')
o('quality', 'create', 'a controlled revision', 'revise_qms_document')
o('quality', 'create', 'a controlled document', 'create_qms_document', preview=['title'])
o('quality', 'create', 'a change request', 'qms_change_create', preview=['title'])
o('quality', 'link', 'a change to a quality record', 'qms_change_link')
o('quality', 'update', "a change request's status", 'qms_change_transition')
o('quality', 'record', 'a nonconforming product', 'log_nonconforming_product')
o('quality', 'add', 'a supplier', 'register_supplier')
# ── Reports ──
o('reports', 'generate', 'a report', 'generate_report')
o('reports', 'look_up', 'reports that fit your programs', 'suggest_reports')
o('reports', 'explain', 'what is blocking the report', 'explain_report_blockers')
o('reports', 'save', 'the dashboard', 'save_report_definition', preview=['title'])
o('reports', 'list', 'your saved dashboards', 'list_report_definitions')
o('reports', 'list', 'the available reports', 'list_report_types')
o('reports', 'look_up', 'portfolio readiness', 'get_portfolio_readiness')
# ── Project and workspace ──
o('project', 'look_up', 'where your program stands', 'get_session_briefing')
o('project', 'scan', 'open project risks', 'scan_project_risks')
o('project', 'look_up', 'where you are in your journey', 'get_client_journey')
o('project', 'recall', 'where we left off', 'recall_session_context')
o('project', 'generate', 'the schedule of events', 'generate_schedule_of_events')
o('project', 'update', 'a milestone in the schedule of events', 'amend_schedule_of_events')
o('project', 'review', 'the schedule of events', 'review_schedule_of_events_health')
o('project', 'update', "the project's goals", 'reset_project_goals')
o('project', 'update', "the program's details", 'set_program_metadata')
o('project', 'send', 'a notification', 'fire_notification', preview=['title'])
o('project', 'create', 'a calendar event', 'create_calendar_event', source='connected')
o('project', 'look_up', "your organization's capabilities", 'get_org_capabilities')
o('project', 'look_up', 'your plan usage', 'get_plan_usage')
o('project', 'look_up', 'your usage credits', 'get_billing_credits')
o('project', 'look_up', 'your usage and license standing', 'get_usage_and_license_status')
o('project', 'summarize', 'onboarding readiness', 'summarize_onboarding_readiness')
o('project', 'search', 'across the platform', 'global_search', preview=['query'])
o('project', 'create', 'review tasks for critical items', 'triage_compliance_attention')
o('project', 'record', 'a memory item as verified', 'verify_memory_atom')
o('project', 'look_up', 'learned regulatory patterns', 'recall_rim_patterns', 'query_rim_patterns_by_domain')
o('project', 'summarize', 'the regulatory intelligence', 'summarize_rim_intelligence')
o('project', 'check', 'what AnA can do here', 'describe_capabilities')
o('project', 'check', "how reliable a tool's output is", 'ana_tool_pedigree')
o('project', 'look_up', 'the biotech program status', 'get_biotech_program_status')
o('project', 'run', 'an agent', 'run_agent', preview=['objective'])
o('project', 'run', 'a script in the sandbox', 'run_in_container', 'run_python_script')
o('project', 'list', 'the platform commands', 'list_platform_commands', preview=['query'])
o('project', 'run', 'a platform command', 'execute_platform_command')
o('project', 'simulate', "an auditor's review", 'start_war_game')
o('project', 'list', 'the questioning flows', 'list_intelligence_flows')
o('project', 'search', 'the CRM', 'search_crm', preview=['query'], source='connected')
o('project', 'trace', 'the evidence behind a recommendation', 'trace_design_recommendation')
o('project', 'render', 'a signature manifestation', 'render_signature_manifestation')
# ── Screen ──
o('screen', 'open', 'a screen', 'navigate_to')
o('screen', 'run', 'an on-screen action', 'act_on_screen')
o('screen', 'list', 'the on-screen actions', 'list_screen_actions')
o('screen', 'list', 'the app screens', 'list_app_screens')
o('screen', 'list', 'the product demonstrations', 'list_demo_scripts')
o('screen', 'start', 'a product demonstration', 'start_product_demo')
# ── Plan ──
o('plan', 'update', 'the plan', 'update_plan')
# ── Connected systems and mailbox ──
o('connected', 'search', 'your connected repositories', 'search_connected_repositories', preview=['query'])
o('mailbox', 'search', 'the regulatory mailbox', 'search_regulatory_correspondence', preview=['query'])
# ── Agency databases ──
o('agency', 'search', 'FDA drug approvals', 'search_drug_approvals', preview=['query'])
o('agency', 'search', 'FDA drug labels', 'search_drug_labels', preview=['query'])
o('agency', 'search', 'EMA assessment reports', 'search_ema_epar', preview=['query'])
o('agency', 'search', 'EU CTIS', 'search_eu_ctis', preview=['query'])
o('agency', 'search', 'EUDAMED', 'search_eudamed', preview=['query'])
o('agency', 'search', 'device adverse events', 'search_device_adverse_events', preview=['query'])
o('agency', 'search', 'drug adverse events', 'search_drug_adverse_events', preview=['query'])
o('agency', 'search', 'FDA device recalls', 'search_device_recalls', preview=['query'])
o('agency', 'search', 'ClinicalTrials.gov', 'search_clinical_evidence', preview=['query'])
o('agency', 'look_up', 'the published label', 'lookup_published_label')
o('agency', 'search', 'Medicare coverage', 'search_medicare_coverage')
o('agency', 'list', 'FDA guidance documents', 'fetch_fda_guidance_list', preview=['topic'])
o('agency', 'screen', 'a party against SAM.gov', 'screen_restricted_party')
o('agency', 'search', 'Grants.gov', 'search_grants_gov', preview=['query'])
o('agency', 'code', 'a drug name in RxNorm', 'code_drug')
o('agency', 'code', 'a term in MedDRA', 'code_meddra', preview=['term'])
o('agency', 'code', 'a drug in WHODrug', 'code_whodrug')
o('agency', 'look_up', 'ICD-10 codes', 'lookup_icd10_code', preview=['term'])
o('agency', 'look_up', 'a predicate device', 'analyze_predicate_device')
o('agency', 'assess', 'trial feasibility from ClinicalTrials.gov', 'assess_trial_feasibility')
o('agency', 'assess', 'the regulatory landscape', 'assess_regulatory_landscape', preview=['topic'])
# ── Literature ──
o('literature', 'search', 'the literature', 'search_literature', preview=['query'])
o('literature', 'search', 'preprints', 'search_preprints', preview=['query'])
o('literature', 'search', 'ChEMBL', 'search_chembl_compound', preview=['query'])
o('literature', 'check', 'the references exist', 'verify_citations')
o('literature', 'format', 'a citation', 'generate_citation')
o('literature', 'format', 'the references', 'format_references')
o('literature', 'check', 'the reference list', 'lint_references')
o('literature', 'convert', 'RIS references', 'import_ris_references')
o('literature', 'search', 'the clinical-regulatory evidence', 'search_clinical_regulatory_evidence', preview=['query'])
o('literature', 'look_up', 'regulatory precedents', 'lookup_regulatory_precedents', preview=['query'])
o('literature', 'plan', 'the precedent search', 'mine_precedents')
o('literature', 'compute', 'a benchmark from precedent trials', 'benchmark_precedent_trials')
o('literature', 'compare', 'the design to precedent', 'compare_proposed_design_to_precedent')
o('literature', 'explain', 'the risk of the design feature', 'explain_design_risk')
o('literature', 'explain', 'the resolution plan', 'explain_resolution_plan')
# ── Regulatory knowledge (curated registries and guidance) ──
o('regulatory knowledge', 'look_up', 'FDA guidance', 'lookup_fda_guidance', preview=['topic'])
o('regulatory knowledge', 'look_up', 'ICH guidelines', 'lookup_ich_guideline', preview=['section', 'topic'])
o('regulatory knowledge', 'look_up', 'ICH guideline updates', 'fetch_ich_guideline_updates')
o('regulatory knowledge', 'look_up', 'the CMC guidance', 'find_cmc_guidance', preview=['query'])
o('regulatory knowledge', 'look_up', 'the CMC requirements', 'get_cmc_requirements')
o('regulatory knowledge', 'explain', 'a CMC topic', 'explain_cmc_topic', preview=['query'])
o('regulatory knowledge', 'look_up', 'IVD knowledge', 'ivd_knowledge_lookup', preview=['query', 'topic'])
o('regulatory knowledge', 'search', 'the IVD knowledge base', 'search_ivd_knowledge', preview=['query'])
o('regulatory knowledge', 'look_up', 'what the document must contain', 'get_document_section_requirements', preview=['section'])
o('regulatory knowledge', 'look_up', "FDA's technical submission rules", 'list_fda_technical_rules')
o('regulatory knowledge', 'look_up', 'the submission steps from database lock', 'plan_submission_from_database_lock')
o('regulatory knowledge', 'check', 'that the cited guidance is current', 'check_guidance_freshness')
o('regulatory knowledge', 'check', 'that the rule is still current', 'check_regulatory_currency', preview=['topic'])
o('regulatory knowledge', 'look_up', 'the review timeline', 'get_regulatory_timeline')
o('regulatory knowledge', 'look_up', 'expedited pathways', 'lookup_regulatory_pathway', preview=['query'])
o('regulatory knowledge', 'look_up', 'guidance for a generic application', 'guidance_for_anda')
o('regulatory knowledge', 'look_up', 'value-dossier guidance', 'value_dossier_guidance')
o('regulatory knowledge', 'look_up', 'the compliance checklist', 'run_compliance_checklist')
o('regulatory knowledge', 'look_up', 'the biocompatibility endpoints', 'get_biocompatibility_endpoints')
o('regulatory knowledge', 'look_up', 'the device labeling requirements', 'get_device_labeling')
o('regulatory knowledge', 'look_up', 'the electrical-safety standards', 'get_electrical_standards')
o('regulatory knowledge', 'look_up', 'the sterilization requirements', 'get_sterilization_requirements')
# Hidden-app tools whose label predates S3.
o('project', 'load', None, 'load_nonclinical_program')
O['load_nonclinical_program'] = ('engines', 'read', 'the nonclinical studies for the program', None, None)
o('project', 'scan', 'regulatory deadlines', 'regulatory_deadline_radar')
o('project', 'check', 'that claims are backed by evidence', 'assess_claim_evidence_integrity')
o('project', 'start', 'a background investigation', 'start_deep_investigation')
o('project', 'check', 'the background investigation', 'check_deep_investigation')
o('project', 'open', 'the Trial Master File', 'get_tmf_view')
o('project', 'create', 'the Trial Master File structure', 'seed_tmf')

# Verb overrides for engine-family tools whose generated object reads badly.
OBJ = {
    'classify_bcs': 'the BCS class', 'design_be_study': 'the bioequivalence study', 'compute_fih_dose': 'the first-in-human dose',
    'calculate_ttc': 'the TTC limit', 'calculate_safety_margin': 'the safety margin', 'analyze_rmst': 'the restricted mean survival time',
    'analyze_win_ratio': 'the win ratio', 'analyze_safety_signal': 'the disproportionality', 'analyze_external_control_borrow': 'external-control borrowing',
    'analyze_missing_data_impact': 'the missing-data impact', 'analyze_exposure_response': 'the exposure-response framework',
    'adjust_multiplicity': None, 'model_budget_impact': 'the budget impact', 'model_budget_impact_mix': 'the budget impact',
    'model_cost_effectiveness': 'the cost-effectiveness', 'model_cost_effectiveness_nmb': 'the cost-effectiveness',
    'model_markov_cohort': 'a Markov cohort model', 'compute_assurance': 'the assurance', 'compute_diagnostic_accuracy': 'the diagnostic accuracy',
    'compute_analytical_performance': 'the analytical performance', 'compute_sample_size': 'the sample size',
    'estimate_sample_size': 'the sample size', 'estimate_shelf_life': 'the shelf life', 'classify_cyp_phenotype': 'the CYP phenotype',
    'classify_pediatric_age': 'the pediatric age band', 'classify_tox_findings': 'the toxicology findings', 'check_dataset_conformance': 'the dataset spec',
    'design_dose_finding': 'the dose-finding boundaries', 'design_group_sequential': 'the group-sequential boundaries',
    'design_mmrm': 'the MMRM sizing', 'design_bayesian_device': 'the Bayesian device study', 'design_mrmc_reader_study': 'the reader-study power',
    'detect_safety_signal': 'the safety signal', 'detect_evidence_contradictions': 'the evidence for contradictions',
    'detect_evidence_gaps': 'the evidence for gaps', 'assess_output_confidence': 'how confident the answer can be',
    'validate_cdisc_dataset': 'the CDISC dataset', 'validate_sdtm_dataset': 'the SDTM dataset', 'validate_adam_dataset': 'the ADaM dataset',
    'validate_spl': 'the SPL', 'validate_spl_structure': 'the SPL XML', 'validate_udi': 'the UDI', 'validate_analytical_method': 'the method-validation parameters',
    'generate_define_xml': 'the define.xml', 'generate_spl': 'the SPL document', 'generate_spl_xml': 'an SPL skeleton',
    'generate_declaration_of_conformity': 'the Declaration of Conformity', 'generate_dsur_structure': 'the DSUR structure',
    'generate_psur_structure': 'the PSUR structure', 'run_cdisc_pipeline': None, 'run_monte_carlo_simulation': None,
    'run_probabilistic_sensitivity': None, 'forecast_enrollment': 'enrollment', 'project_events': 'event accrual',
    'size_diagnostic_study': 'the diagnostic study size', 'determine_assay_cutoff': 'the assay cutoff',
    'determine_meaningful_change': 'the meaningful-change threshold', 'determine_primary_mode_of_action': 'the primary mode of action',
    'screen_compound_liabilities': 'the compound for liabilities', 'screen_signal_panel': 'the signal panel',
    'score_predicate_adequacy': 'the predicate devices', 'score_rwe_data_source': 'the real-world data source',
    'define_estimand': None, 'build_effects_table': 'the effects table', 'build_device_blueprint': 'the device submission blueprint',
    'build_global_device_strategy': 'the global device strategy', 'build_postmarket_report': None,
    'control_mutagenic_impurity': None, 'cross_region_gap_analysis': None, 'set_specifications': None,
    'structure_benefit_risk_framework': None, 'structure_smpc': None, 'position_coa_endpoint': None,
    'evaluate_pbpk_model': None, 'code_meddra': None,
}
SPECIAL = {
    'adjust_multiplicity': ('apply', 'a multiplicity adjustment'),
    'run_cdisc_pipeline': ('check', 'the dataset against CDISC'),
    'run_monte_carlo_simulation': ('simulate', 'the outcome distributions'),
    'run_probabilistic_sensitivity': ('run', 'a probabilistic sensitivity analysis'),
    'forecast_enrollment': ('forecast', 'enrollment'), 'project_events': ('forecast', 'event accrual'),
    'size_diagnostic_study': ('compute', 'the diagnostic study size'),
    'determine_assay_cutoff': ('determine', 'the assay cutoff'),
    'determine_meaningful_change': ('determine', 'the meaningful-change threshold'),
    'determine_primary_mode_of_action': ('determine', 'the primary mode of action'),
    'define_estimand': ('build', 'the estimand'),
    'build_postmarket_report': ('draft', 'a post-market report'),
    'control_mutagenic_impurity': ('design', 'the mutagenic-impurity control'),
    'cross_region_gap_analysis': ('compare', 'what another region needs'),
    'set_specifications': ('look_up', 'the specification tests'),
    'structure_benefit_risk_framework': ('build', 'the benefit-risk framework'),
    'structure_smpc': ('build', 'the SmPC structure'),
    'position_coa_endpoint': ('select', "the COA endpoint's position"),
    'evaluate_pbpk_model': ('assess', 'the PBPK model'),
    'model_markov_cohort': ('simulate', 'a Markov cohort'),
}

# Engine candidates: compute deterministically over the inputs given. The gate decides
# whether each claim survives (no path from the handler to a model call).
ENGINE_PREFIXES = ('compute_', 'calculate_', 'estimate_', 'model_', 'analyze_', 'validate_', 'classify_', 'check_',
                   'detect_', 'score_', 'screen_compound', 'screen_signal', 'size_', 'forecast_', 'project_events',
                   'run_monte', 'run_probabilistic', 'adjust_', 'determine_', 'design_group_sequential', 'design_mmrm',
                   'design_dose_finding', 'design_bayesian_device', 'design_mrmc_reader_study', 'generate_define_xml',
                   'generate_stf', 'convert_to_rps_v4', 'compute_lifecycle', 'format_references', 'lint_references',
                   'import_ris_references', 'build_abbreviation_list', 'reconcile_', 'assess_output_confidence',
                   'scan_regulatory_deficiencies', 'assess_readability', 'validate_docx')

def describe_deterministic(n):
    d = (man.get(n, {}).get('description') or '').lower()
    return 'deterministic' in d or 'no llm' in d

def family_of(n, verb):
    return 'engines'

# nosemgrep: exec-detected -- one-off evidence generator running the table script it wrote beside itself; not product code
exec(open(os.path.join(OUT, 'table_g.py')).read())

def generate(n):
    if n in G:
        g = G[n]
        return g[0], g[1], g[2], (g[4] if len(g) > 4 else None), g[3]
    if n in O:
        fam, verb, obj, preview, source = O[n]
        return fam, verb, obj, preview, source
    if n in SPECIAL:
        verb, obj = SPECIAL[n]
        return 'engines', verb, obj, None, None
    for pre, verb, tmpl in PREFIX:
        if n.startswith(pre):
            rest = n[len(pre):]
            obj = OBJ.get(n) or tmpl.format(r=words(rest))
            fam = 'regulatory knowledge'
            return fam, verb, obj, None, None
    raise SystemExit(f'no reviewed entry for {n}')

# Deterministic checks and builders filed under a launch family, whose source is the engine.
ENGINE_FROM_FAMILY = {
    'validate_ectd_package', 'check_ectd_cross_references', 'validate_cross_references', 'validate_market_formatting',
    'compute_lifecycle_operations', 'convert_to_rps_v4', 'generate_stf',
    # build_pathway_manifest and assess_dispatch_readiness were claimed and refused by the gate: their handlers'
    # modules reach anthropic-files.ts (gateway-bypass baseline). They keep source submissions.
    'check_numerical_integrity', 'reconcile_dossier_numbers', 'reconcile_extracted_figures', 'check_dossier_consistency',
    'scan_regulatory_deficiencies', 'check_grounding', 'build_abbreviation_list', 'assess_readability', 'screen_promotional_language',
    'check_regulatory_compliance', 'validate_docx', 'verify_docx_against_source', 'extract_document_structure', 'compare_document_versions',
}
rows = []
present = {}
for n in IN_SCOPE + HIDDEN_LABELLED:
    fam, verb, obj, preview, source = generate(n)
    if source is None:
        source = FAMILY_SOURCE.get(fam, 'knowledge')
    if n in ENGINE_FROM_FAMILY and reg[n]['class'] in ('read', 'self', 'conditional'):
        source = 'engine'
    block = {'verb': verb, 'object': obj, 'source': source}
    if preview:
        block['preview'] = preview
    present[n] = block
    rows.append((fam, n, reg[n]['class'], verb, obj, source, ','.join(preview or [])))

json.dump(present, open(f'{OUT}/present.json', 'w'), indent=1, ensure_ascii=False)
with open(f'{OUT}/present-review.tsv', 'w') as f:
    for r in sorted(rows):
        f.write('\t'.join(r) + '\n')
from collections import Counter
print(Counter(r[0] for r in rows))
print(Counter(r[5] for r in rows))
print(len(rows))
