# Capability completion and convergence inventory

Derived from canonical taxonomy seeds, generated registry migration and `reportAvailability`; counts are definitions, not deployment attestations. The continuation adds one recorded-source label matrix through the existing domain engine. No grants or release activation were added.

**61 definitions: 23 engine-backed, 5 prediction-unavailable, 33 uncomputed.** Engine-backed means a provider exists at the listed scopes; records, access, plan and output gates still decide each actual run.

| Type | Current state / decision | Engine / computed scopes | Declared input dependencies |
| --- | --- | --- | --- |
| readiness.executive_digest | engine-backed / retain-canonical | readiness / project | submission_readiness, section_status, artifact_lifecycle |
| provenance.evidence_trace_report | engine-backed / retain-canonical | lineage / document | provenance_map, cross_refs, evidence_links |
| compliance.audit_assurance_pack | uncomputed / complete-or-retire | none / none | audit_events, signature_chain, compliance_scan |
| usa_fda.pma_submission_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, clinical_evidence, device_safety_summary |
| usa_fda.estar_510k_equivalence_matrix | uncomputed / complete-or-retire | none / none | predicate_mapping, substantial_equivalence, testing_coverage |
| usa_fda.deficiency_response_intelligence | uncomputed / complete-or-retire | none / none | correspondence_issues, response_actions, risk_register |
| ema.maa_readiness_assessment | engine-backed / retain-canonical | regional / project | submission_readiness, module_completeness, question_risk |
| ema.rmp_psur_signal_alignment | uncomputed / complete-or-retire | none / none | safety_signals, benefit_risk, risk_management_plan |
| china_nmpa.ctd_module_gap_analysis | uncomputed / complete-or-retire | none / none | module_completeness, formatting_compliance, evidence_links |
| china_nmpa.registration_dossier_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, artifact_lifecycle, question_risk |
| china_nmpa.deficiency_letter_root_cause_pack | uncomputed / complete-or-retire | none / none | correspondence_issues, root_cause_analysis, response_actions |
| fcoi.disclosure_register | engine-backed / retain-canonical | domain / submission, project, account | financial_disclosures, disclosure_interests, provenance_links |
| ha.commitment_register | engine-backed / retain-canonical | domain / submission, project, program, account | ha_interactions, regulatory_commitments, commitment_milestones, provenance_links |
| iacuc.protocol_register | engine-backed / retain-canonical | domain / project, submission, program, account | iacuc_protocols, iacuc_animal_cohorts, iacuc_reviews, iacuc_amendments, provenance_links |
| irb.submission_register | engine-backed / retain-canonical | domain / submission, project, account | irb_submissions, irb_sites, irb_reviews, irb_amendments, irb_reportable_events, provenance_links |
| ibc.registration_register | engine-backed / retain-canonical | domain / project, submission, program, account | ibc_registrations, ibc_biological_agents, ibc_reviews, provenance_links |
| nonclinical.study_send_register | engine-backed / retain-canonical | domain / submission, program, project, account | nonclinical_studies, send_datasets, provenance_links |
| grants.portfolio_register | engine-backed / retain-canonical | domain / program, project, account | grant_opportunities, grant_proposals, grant_awards, grant_milestones, grant_invoices, provenance_links |
| rim.registration_grid | engine-backed / retain-canonical | domain / program, project, account | rim_products, rim_registrations, rim_labels |
| inspection.readiness_pack | engine-backed / retain-canonical | domain / program, project, submission, account | inspections, inspection_findings, finding_responses, readiness_assessments |
| controlled_substances.inventory_ledger | engine-backed / retain-canonical | domain / program, project, account | dea_registrations, controlled_substances, cs_transactions |
| lifecycle.obligation_calendar | engine-backed / retain-canonical | domain / program, project, submission, account | lifecycle_obligations, lifecycle_obligation_events |
| etmf.completeness_pack | engine-backed / retain-canonical | domain / submission, project, account | tmf_files, tmf_artifacts |
| research_compliance.training_status | engine-backed / retain-canonical | domain / program, project, account | research_personnel, personnel_training |
| effort.certification_register | engine-backed / retain-canonical | domain / program, project, account | effort_certifications, effort_lines |
| research_security.coi_register | engine-backed / retain-canonical | domain / program, project, account | coi_disclosures, research_personnel |
| research_admin.scorecard | engine-backed / retain-canonical | domain / program, account | regulatory_commitments, iacuc_protocols, personnel_training, coi_disclosures, grant_awards, grant_closeout_records, effort_certifications |
| prediction.regulatory_forecast | prediction-unavailable / qualify-before-exposure | none / none | submission_readiness, readiness_trend |
| prediction.crl_rtf_premortem | prediction-unavailable / qualify-before-exposure | none / none | deficiency_risk, correspondence_issues |
| usa_fda.ind_safety_readiness | engine-backed / retain-canonical | regional / project | submission_readiness, nonclinical_studies, safety_signals, module_completeness |
| usa_fda.nda_bla_filing_readiness | engine-backed / retain-canonical | regional / project | submission_readiness, module_completeness, section_status, question_risk |
| usa_fda.crl_response_intelligence | uncomputed / complete-or-retire | none / none | correspondence_issues, root_cause_analysis, response_actions, risk_register |
| usa_fda.type_bcd_meeting_brief | uncomputed / complete-or-retire | none / none | ha_interactions, submission_readiness, question_risk, evidence_links |
| usa_fda.de_novo_classification_pack | uncomputed / complete-or-retire | none / none | submission_readiness, clinical_evidence, device_safety_summary, predicate_mapping |
| ema.maa_loq_response_pack | uncomputed / complete-or-retire | none / none | correspondence_issues, response_actions, question_risk, evidence_links |
| ema.variation_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, module_completeness, lifecycle_obligations |
| ema.psur_pbrer_pack | uncomputed / complete-or-retire | none / none | safety_signals, benefit_risk, risk_management_plan, evidence_links |
| ema.scientific_advice_brief | uncomputed / complete-or-retire | none / none | ha_interactions, submission_readiness, question_risk, evidence_links |
| eu_mdr.technical_documentation_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, module_completeness, clinical_evidence, device_safety_summary |
| eu_mdr.cer_per_completeness | uncomputed / complete-or-retire | none / none | clinical_evidence, evidence_links, benefit_risk, section_status |
| eu_ivdr.performance_evaluation_readiness | uncomputed / complete-or-retire | none / none | clinical_evidence, evidence_links, device_safety_summary, section_status |
| japan_pmda.jnda_shonin_readiness | engine-backed / retain-canonical | regional / project | submission_readiness, module_completeness, question_risk, section_status |
| japan_pmda.consultation_brief | uncomputed / complete-or-retire | none / none | ha_interactions, submission_readiness, question_risk, evidence_links |
| japan_pmda.reexamination_pack | uncomputed / complete-or-retire | none / none | safety_signals, benefit_risk, lifecycle_obligations, evidence_links |
| canada_hc.nds_snds_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, module_completeness, question_risk, section_status |
| canada_hc.device_licence_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, clinical_evidence, device_safety_summary, module_completeness |
| uk_mhra.maa_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, module_completeness, question_risk, section_status |
| uk_mhra.ilap_pathway_brief | uncomputed / complete-or-retire | none / none | ha_interactions, submission_readiness, question_risk, evidence_links |
| australia_tga.prescription_medicine_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, module_completeness, question_risk, section_status |
| australia_tga.artg_device_inclusion_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, clinical_evidence, device_safety_summary, module_completeness |
| korea_mfds.drug_registration_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, module_completeness, question_risk, formatting_compliance |
| switzerland_swissmedic.maa_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, module_completeness, question_risk, section_status |
| brazil_anvisa.registration_dossier_readiness | uncomputed / complete-or-retire | none / none | submission_readiness, module_completeness, question_risk, formatting_compliance |
| global.cross_region_submission_comparison | uncomputed / complete-or-retire | none / none | submission_readiness, module_completeness, rim_registrations, question_risk |
| global.harmonization_gap_matrix | uncomputed / complete-or-retire | none / none | module_completeness, formatting_compliance, rim_registrations, evidence_links |
| global.label_currency_matrix | engine-backed / retain-canonical; legal currency unknown, finalization blocked | domain / account, program, project (organization-wide inputs) | rim_labels, rim_registrations, rim_products, lifecycle_obligations |
| pv.dsur_readiness | uncomputed / complete-or-retire | none / none | safety_signals, benefit_risk, nonclinical_studies, evidence_links |
| pv.signal_management_report | uncomputed / complete-or-retire | none / none | safety_signals, benefit_risk, risk_management_plan, evidence_links |
| prediction.deficiency_risk | prediction-unavailable / qualify-before-exposure | none / none | submission_readiness, risk_model, network_prior |
| prediction.readiness_trajectory | prediction-unavailable / qualify-before-exposure | none / none | submission_readiness, section_status, gap_score |
| prediction.trial_pos | prediction-unavailable / qualify-before-exposure | none / none | trial_design, evidence_prior, monte_carlo_simulation |

For each uncomputed type, the listed inputs are an explicit completion dependency. An engine must compute that analysis over authorized recorded data and render its own qualified output; the readiness digest must never substitute. Five prediction entries remain unavailable as governed runs. A separate advisory assembly API or paid tier does not validate a forecast.

| Deferred surface | Decision | Implemented parts | Completion needed | Canonical launch surface |
| --- | --- | --- | --- | --- |
| program-journey | converge | Journey canvas and seeded demonstration stages. | Persist and advance journey stages for programs created through the product; qualify real gates and remove predictive outcome claims. | project-home |
| filings-catalog | converge | Filing-type discovery catalog. | Carry the selected filing into canonical program creation rather than dropping the choice. | projects |
| authoring-engine | converge | Reference and architecture explainer. | Converge authoring controls on the canonical editor; retire the duplicate explainer as an execution surface. | document-authoring |
| regulatory-workspace | converge | Workspace tree and retained layout. | Replace the static editor area and second-store reads with canonical authored records, or retire the duplicate workspace. | document-authoring |
| template-library | retain-deferred | Saved-template CRUD, extraction/preview and retained library UI. | Apply a saved template to canonical authored-document formatting and qualified export, preserving its source version. | document-authoring |
| ectd-coauthor | converge | Retained eCTD tree and second-store section editor. | Converge validation/compliance onto the canonical section and authoring records; qualify the full content-to-gate connection. | submission-center, document-authoring |
| dossier-map | converge | Dossier-map reader and overlays over its retained store. | Populate or replace the map store from canonical program sections and qualify completeness for newly created programs. | project-home, submission-center |
| ectd-publishing | converge | Publishing reference screen and existing specification/validation services. | Connect a durable qualified publication operation, lifecycle state and exact delivery record; a reference screen is not publication. | ectd-compile, gateway-transmittals |
| orchestration | converge | Persisted orchestration APIs and a retained project-based board. | Resolve canonical program ownership and record identities before exposing board review, scan or advance outcomes. | dispatch-readiness, tasks |
| inconsistency | retain-deferred | Retained analysis board and related governed-intelligence services. | Bind scans to canonical program/documents, qualify propagation and re-approval effects, and prove saved audit/task outcomes. | document-authoring |
| qmp | retain-deferred | Plan list/create/activate APIs and summary UI. | Author plan gates and CTQ factors, consume them in the governed gate, and qualify their recorded decisions. | quality |
| ana-command | converge | Enterprise portfolio commands and retained workflow controls. | Qualify actual service effects and audit records for each command; converge on the current conversation, reports and filing gate. | conversation-thread, insights, dispatch-readiness |
| ana-memory | converge | Memory browser over the retained MDX store. | Read and govern the memory actually used by each AnA turn rather than an unwritten second store. | conversation-thread |
| training | converge | Retained training screen and discovery layout. | Provide persisted lessons, paths and assessed certifications before exposure, or converge on QMS read-and-understood training. | quality |

| Parallel implementation | Decision | Canonical implementation / remaining qualification |
| --- | --- | --- |
| `services/ai` predictor, scenario and monitor factories | Retire unvalidated predictor execution; retain source reference | Governed Reporting and canonical recorded readiness/risk services. Literal approval priors and manufactured intervals require authoritative datasets, calibration, tenant provenance and supported disclosure before any prediction exposure. |
| `services/workflow/WorkflowExecutionEngine` | Retire parallel execution entry point; retain reference | Canonical tasking, authoring, approval and dispatch flows. Prototype effects only logged notification/task/worker/artifact/lock/reminder claims and in-memory state, with no durable authorized adapters. |
| `server/services/workflow/WorkflowExecutionEngine` | Retire legacy database execution entry point; retain reference | The canonical product flows above. Its step tables have no live runtime consumer and logged effects could mark completion. |
| `services/documents/ChangePropagationService` | Converge before exposure | Canonical authored document/version/source records. In-memory events and suggested patches must be replaced by scoped durable records, explicit approval and verified application. Retained helper availability is not delivery of this workflow. |
| `services/compliance/ComplianceRulesEngine` | Retain rules as reference; converge qualification | Canonical validation, governed authoring and dispatch gates. Local scores cannot establish regulatory compliance or replace those gates. |

No external non-test runtime consumers were found for these top-level AI/workflow/document/compliance subtrees in the audited tree. Constructor refusals prevent the three executable predictor/parallel-workflow entry paths from emitting probability or effect/completion success. No active canonical service was replaced. Remaining engineering/authoritative-data outcomes are **partial or blocked**, and this inventory does not claim them implemented.

The label matrix displays recorded inputs and explicit gaps; its existence does not qualify legal currency or J-Label support. See [native, worker, UI and PDF proof](continuation-label-currency-matrix.md).
