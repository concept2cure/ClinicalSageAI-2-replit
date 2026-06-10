# Dead tables inventory (operator migration artifact)

Generated 2026-06-08. A table is listed **dead** only if BOTH its Drizzle const name AND its physical SQL table name have zero references across server/, client/src/, scripts/, shared/{types,regulatory,utils} (schema-def files, the barrel, and tests excluded).

**581 table consts total · 418 referenced · 163 dead (zero const + zero SQL-name refs).**

> Caveat: this is static-reference analysis. Confirm against a live DB (information_schema + query logs) before dropping — a table touched only by an external/raw-SQL path outside these dirs would not appear here. Removing a table requires a reviewed Drizzle + migration change.

## shared/cmc-schema.ts (1)
- `riskAssessments` → `risk_assessments`

## shared/schema.ts (106)
- `activityReactions` → `activity_reactions`
- `agencyCommunications` → `agency_communications`
- `agencyCorrespondence` → `agency_correspondence`
- `agencyValidationResults` → `agency_validation_results`
- `aiAuditLog` → `ai_audit_log`
- `batchGenealogy` → `batch_genealogy`
- `cdiscAdamSpecs` → `cdisc_adam_specs`
- `cdiscCdashFields` → `cdisc_cdash_fields`
- `cdiscCdashForms` → `cdisc_cdash_forms`
- `cdiscCdashSdtmMappings` → `cdisc_cdash_sdtm_mappings`
- `cdiscComplianceAgencyPrefs` → `cdisc_compliance_agency_prefs`
- `cdiscComplianceResults` → `cdisc_compliance_results`
- `cdiscComplianceRules` → `cdisc_compliance_rules`
- `cdiscComplianceVersions` → `cdisc_compliance_versions`
- `cdiscCsrSap` → `cdisc_csr_sap`
- `cdiscCsrTemplates` → `cdisc_csr_templates`
- `cdiscCsrTfl` → `cdisc_csr_tfl`
- `cdiscDeviceDe` → `cdisc_device_de`
- `cdiscDeviceDx` → `cdisc_device_dx`
- `cdiscDeviceRelationships` → `cdisc_device_relationships`
- `cdiscDocsAcrf` → `cdisc_docs_acrf`
- `cdiscDocsDefineArtifacts` → `cdisc_docs_define_artifacts`
- `cdiscDocsRepository` → `cdisc_docs_repository`
- `cdiscEctdDatasets` → `cdisc_ectd_datasets`
- `cdiscEctdDefineXml` → `cdisc_ectd_define_xml`
- `cdiscEctdReviewersGuide` → `cdisc_ectd_reviewers_guide`
- `cdiscEctdSdsp` → `cdisc_ectd_sdsp`
- `cdiscIndIntegration` → `cdisc_ind_integration`
- `cdiscIndIse` → `cdisc_ind_ise`
- `cdiscIndIss` → `cdisc_ind_iss`
- `cdiscIndSend` → `cdisc_ind_send`
- `cdiscPqDomains` → `cdisc_pq_domains`
- `cdiscPqManufacturing` → `cdisc_pq_manufacturing`
- `cdiscPqStability` → `cdisc_pq_stability`
- `cdiscPrmEpochs` → `cdisc_prm_epochs`
- `cdiscPrmVisits` → `cdisc_prm_visits`
- `cdiscTaskDeliverables` → `cdisc_task_deliverables`
- `cdiscTaskMilestones` → `cdisc_task_milestones`
- `cdiscTaskValidationQueue` → `cdisc_task_validation_queue`
- `cdiscTaskWorkflows` → `cdisc_task_workflows`
- `clientAccess` → `client_access`
- `coauthorAnnotations` → `coauthor_annotations`
- `coauthorDocumentVersions` → `coauthor_document_versions`
- `coauthorImportHistory` → `coauthor_import_history`
- `coauthorStatusHistory` → `coauthor_status_history`
- `communicationChannels` → `communication_channels`
- `communicationMessages` → `communication_messages`
- `complianceCalendar` → `compliance_calendar`
- `componentCrossReferences` → `component_cross_references`
- `componentSequenceReferences` → `component_sequence_references`
- `contextGroups` → `context_groups`
- `contextMembers` → `context_members`
- `documentAuditLog` → `document_audit_log`
- `documentLocks` → `document_locks`
- `documentSessions` → `document_sessions`
- `doeAnalysisResults` → `doe_analysis_results`
- `doeExperiments` → `doe_experiments`
- `doeFactors` → `doe_factors`
- `doeResponses` → `doe_responses`
- `doeStudies` → `doe_studies`
- `ectdChangeControl` → `ectd_change_control`
- `ectdCrossReferences` → `ectd_cross_references`
- `evidenceChangeEvents` → `evidence_change_events`
- `evidenceComplianceScores` → `evidence_compliance_scores`
- `gateApprovals` → `gate_approvals`
- `indDocuments` → `ind_documents`
- `indPackagePlanDocuments` → `ind_package_plan_documents`
- `indPackagePlanModalities` → `ind_package_plan_modalities`
- `indPackagePlanRegions` → `ind_package_plan_regions`
- `indPackagePlanRequirements` → `ind_package_plan_requirements`
- `indPackagePlanTimelines` → `ind_package_plan_timelines`
- `integrationTokens` → `integration_tokens`
- `lumenFilingDocuments` → `lumen_filing_documents`
- `lumenObservationTerms` → `lumen_observation_terms`
- `multiAgencyValidationSessions` → `multi_agency_validation_sessions`
- `obligationUpdates` → `obligation_updates`
- `pkpdCompartments` → `pkpd_compartments`
- `postApprovalCommitments` → `post_approval_commitments`
- `projectPredictions` → `project_predictions`
- `qmpAuditTrail` → `qmp_audit_trail`
- `regAttachments` → `reg_attachments`
- `regMessages` → `reg_messages`
- `regObligationEvents` → `reg_obligation_events`
- `regObligationTemplates` → `reg_obligation_templates`
- `regResponses` → `reg_responses`
- `regulatoryChangeControl` → `regulatory_change_control`
- `regulatoryObligations` → `regulatory_obligations`
- `replacementRules` → `replacement_rules`
- `riskDetections` → `risk_detections`
- `sectionGraphNodes` → `section_graph_nodes`
- `sectionPatches` → `section_patches`
- `sectionPropagations` → `section_propagations`
- `sharepointIntegration` → `sharepoint_integration`
- `simpleDocumentVersions` → `simple_document_versions`
- `simpleDocuments` → `simple_documents`
- `structuredObservationTerms` → `structured_observation_terms`
- `supplyChainBatches` → `supply_chain_batches`
- `supplyChainCOAs` → `supply_chain_coas`
- `supplyChainMaterials` → `supply_chain_materials`
- `supplyChainOrganizations` → `supply_chain_organizations`
- `supplyChainShipments` → `supply_chain_shipments`
- `supplyChainSuppliers` → `supply_chain_suppliers`
- `supplyChainTemperatureReadings` → `supply_chain_temperature_readings`
- `userFollowing` → `user_following`
- `userPresence` → `user_presence`
- `validationHarmonizationOpportunities` → `validation_harmonization_opportunities`

## shared/schema/csr-knowledge-db.ts (25)
- `csrAdverseEvents` → `csr_adverse_events`
- `csrBiomarkers` → `csr_biomarkers`
- `csrCrossStudyComparisons` → `csr_cross_study_comparisons`
- `csrDoseResponse` → `csr_dose_response`
- `csrEligibilityCriteria` → `csr_eligibility_criteria`
- `csrEndpointResults` → `csr_endpoint_results`
- `csrExtractionLog` → `csr_extraction_log`
- `csrKnowledgeEdges` → `csr_knowledge_edges`
- `csrKnowledgeNodes` → `csr_knowledge_nodes`
- `csrModelPerformance` → `csr_model_performance`
- `csrPharmacokinetics` → `csr_pharmacokinetics`
- `csrPopulations` → `csr_populations`
- `csrReferences` → `csr_references`
- `csrRegulatoryIntelligence` → `csr_regulatory_intelligence`
- `csrSafetySignals` → `csr_safety_signals`
- `csrSafetySummaries` → `csr_safety_summaries`
- `csrStatisticalAnalyses` → `csr_statistical_analyses`
- `csrTablesAndFigures` → `csr_tables_and_figures`
- `csrTrainingData` → `csr_training_data`
- `csrTreatmentArms` → `csr_treatment_arms`
- `ctdCrossReferences` → `ctd_cross_references`
- `ctdDocuments` → `ctd_documents`
- `ctdModuleSections` → `ctd_module_sections`
- `ctdQualityData` → `ctd_quality_data`
- `ctdSubmissions` → `ctd_submissions`

## shared/schema/living-record-spine.ts (1)
- `spineNodes` → `spine_nodes`

## shared/schema/operating-system.ts (1)
- `assumptionHistory` → `assumption_history`

## shared/schema/orchestration.ts (2)
- `projectIntelligenceSummaries` → `project_intelligence_summaries`
- `readinessRules` → `readiness_rules`

## shared/schema/programs.ts (1)
- `programActivityLog` → `program_activity_log`

## shared/schema/project-charter.ts (5)
- `charterAuditEvents` → `charter_audit_events`
- `charterSections` → `charter_sections`
- `projectCommitments` → `project_commitments`
- `regulatoryMeetings` → `regulatory_meetings`
- `timelinePhases` → `timeline_phases`

## shared/schema/qc-schemas.ts (6)
- `qcBatchReleases` → `qc_batch_releases`
- `qcDeviations` → `qc_deviations`
- `qcMicrobiologicalTests` → `qc_microbiological_tests`
- `qcOosInvestigations` → `qc_oos_investigations`
- `qcReferenceStandards` → `qc_reference_standards`
- `qcSpecifications` → `qc_specifications`

## shared/schema/regulatory-atoms.ts (10)
- `biomarkerOntology` → `biomarker_ontology`
- `cmcProcessSteps` → `cmc_process_steps`
- `documentAtomProvenance` → `document_atom_provenance`
- `extractedCrossDocLinks` → `extracted_cross_doc_links`
- `extractedGraphEdges` → `extracted_graph_edges`
- `extractedGraphEntities` → `extracted_graph_entities`
- `extractedGraphTriplets` → `extracted_graph_triplets`
- `protocolExtractions` → `protocol_extractions`
- `pvSignalAssessments` → `pv_signal_assessments`
- `relationExtractionLog` → `relation_extraction_log`

## shared/schema/support-admin.ts (4)
- `supportArticles` → `support_articles`
- `supportSettings` → `support_settings`
- `supportTicketMessages` → `support_ticket_messages`
- `supportTickets` → `support_tickets`

## shared/schema/unified_workflow.ts (1)
- `documentAttachments` → `document_attachments`

