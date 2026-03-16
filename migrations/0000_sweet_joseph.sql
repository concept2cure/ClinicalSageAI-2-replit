CREATE TYPE "vault"."document_classification" AS ENUM('CONFIDENTIAL', 'INTERNAL', 'CONTROLLED', 'PUBLIC');--> statement-breakpoint
CREATE TYPE "vault"."processing_status" AS ENUM('PENDING', 'EXTRACTING', 'VECTORIZING', 'INDEXED', 'FAILED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "vault"."storage_class" AS ENUM('STANDARD', 'INTELLIGENT', 'ARCHIVE', 'DEEP_ARCHIVE');--> statement-breakpoint
CREATE TABLE "activity_feed" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"user_avatar" text,
	"activity_type" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_name" text,
	"entity_icon" text,
	"description" text,
	"preview_snippet" text,
	"changes" json,
	"metadata" json,
	"likes" integer DEFAULT 0,
	"reactions" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "activity_feed_activity_id_unique" UNIQUE("activity_id")
);
--> statement-breakpoint
CREATE TABLE "activity_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"reaction_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_reactions_activity_id_user_id_reaction_type_unique" UNIQUE("activity_id","user_id","reaction_type")
);
--> statement-breakpoint
CREATE TABLE "agency_communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"obligation_id" integer,
	"submission_id" text,
	"communication_type" text NOT NULL,
	"direction" text NOT NULL,
	"agency" text NOT NULL,
	"agency_contact" text,
	"subject" text NOT NULL,
	"summary" text NOT NULL,
	"key_decisions" json,
	"action_items" json,
	"follow_up_required" boolean DEFAULT false,
	"follow_up_date" timestamp,
	"attachments" json,
	"related_obligations" integer[],
	"urgency" text DEFAULT 'normal' NOT NULL,
	"confidentiality_level" text DEFAULT 'internal' NOT NULL,
	"meeting_participants" json,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_correspondence" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"submission_id" integer,
	"correspondence_number" varchar(100) NOT NULL,
	"correspondence_type" varchar(50) NOT NULL,
	"direction" varchar(20) NOT NULL,
	"agency_id" integer NOT NULL,
	"subject" text NOT NULL,
	"content" text,
	"received_date" date,
	"response_deadline" date,
	"response_date" date,
	"status" varchar(50) DEFAULT 'pending',
	"priority" varchar(20) DEFAULT 'medium',
	"assigned_to" text,
	"documents" json,
	"version_history" json,
	"thread_id" varchar(100),
	"parent_correspondence_id" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agency_validation_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"agency" text NOT NULL,
	"compliance_score" numeric(5, 2),
	"issues_found" integer DEFAULT 0,
	"processing_time_seconds" integer,
	"validation_details" json,
	"recommendations" json,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"user_id" text,
	"ai_service" varchar(50) NOT NULL,
	"prompt_full" text,
	"model_used" varchar(50),
	"response_structured" json,
	"affected_udis" json,
	"tokens_used" integer DEFAULT 0,
	"success" boolean DEFAULT false,
	"approval_status" varchar(20),
	"digital_signature" text,
	"created_at" timestamp DEFAULT now(),
	"ip_address" varchar(45),
	"session_id" varchar,
	CONSTRAINT "ai_audit_log_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "analytical_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"method_code" text NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"analyte" text NOT NULL,
	"matrix" text NOT NULL,
	"technique" text NOT NULL,
	"status" text DEFAULT 'development' NOT NULL,
	"ich_q2_parameters" json,
	"system_suitability" json,
	"acceptance_criteria" json,
	"robustness_data" json,
	"validation_date" timestamp,
	"developed_by" integer,
	"validated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" integer NOT NULL,
	"user_id" integer,
	"user_name" text NOT NULL,
	"user_role" text,
	"session_id" text,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"timestamp_utc" timestamp DEFAULT now() NOT NULL,
	"old_values" json,
	"new_values" json,
	"changed_fields" json,
	"reason" text,
	"comments" text,
	"requires_signature" boolean DEFAULT false,
	"signature_status" varchar(50),
	"signed_by" text,
	"signed_date" timestamp,
	"signature_meaning" text,
	"application_version" text,
	"system_version" text,
	"regulatory_significant" boolean DEFAULT false,
	"gxp_relevant" boolean DEFAULT false,
	"record_hash" text,
	"previous_hash" text,
	"sequence_number" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"old_values" json,
	"new_values" json,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_trail" (
	"id" serial PRIMARY KEY NOT NULL,
	"trail_id" text NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"leaf_id" text,
	"action" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"signature" text,
	"ip_address" text,
	"user_agent" text,
	"reason" text,
	"metadata" json,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_trail_trail_id_unique" UNIQUE("trail_id")
);
--> statement-breakpoint
CREATE TABLE "available_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"path" text,
	"icon" text,
	"is_new" boolean DEFAULT false,
	"is_highlight" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "available_modules_module_id_unique" UNIQUE("module_id")
);
--> statement-breakpoint
CREATE TABLE "batch_genealogy" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"child_batch_id" integer NOT NULL,
	"parent_batch_id" integer NOT NULL,
	"quantity_used" numeric(15, 6) NOT NULL,
	"quantity_unit" text NOT NULL,
	"usage_date" date NOT NULL,
	"process_step" text,
	"operator_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"batch_number" text NOT NULL,
	"material_id" integer NOT NULL,
	"manufacturing_org_id" integer NOT NULL,
	"batch_size" numeric(15, 6) NOT NULL,
	"batch_size_unit" text NOT NULL,
	"manufactured_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"retest_date" date,
	"quarantine_until" date,
	"batch_status" text DEFAULT 'quarantine' NOT NULL,
	"release_date" date,
	"released_by" integer,
	"rejection_reason" text,
	"recall_date" date,
	"recall_reason" text,
	"destruction_date" date,
	"potency" numeric(8, 4),
	"yield" numeric(8, 4),
	"process_parameters" json,
	"environmental_conditions" json,
	"equipment_used" text[],
	"personnel_involved" text[],
	"quality_remarks" text,
	"storage_location" text,
	"current_quantity" numeric(15, 6),
	"original_quantity" numeric(15, 6),
	"reserved_quantity" numeric(15, 6) DEFAULT '0',
	"parent_batches" text[],
	"child_batches" text[],
	"cost_per_unit" numeric(12, 4),
	"total_cost" numeric(15, 4),
	"barcode" text,
	"qr_code" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biomarker_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"biomarker_id" varchar(255) NOT NULL,
	"biomarker_name" text NOT NULL,
	"biomarker_type" text,
	"endpoint_id" varchar(255) NOT NULL,
	"endpoint_name" text NOT NULL,
	"endpoint_type" text,
	"correlation_score" real DEFAULT 0,
	"evidence_count" integer DEFAULT 0,
	"phase" text,
	"indication" text,
	"species" text,
	"data_source" text,
	"confidence" real DEFAULT 0.5,
	"metadata" json,
	"organization_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_adam_specs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100),
	"dataset_name" varchar(40) NOT NULL,
	"dataset_label" text,
	"dataset_class" varchar(40),
	"dataset_structure" json,
	"variables" json,
	"derivations" json,
	"source_datasets" json,
	"key_variables" json,
	"analysis_variables" json,
	"version" varchar(20) DEFAULT '1.0',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_cdash_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"form_id" varchar(100) NOT NULL,
	"field_name" varchar(50) NOT NULL,
	"cdash_variable" varchar(40) NOT NULL,
	"field_label" text,
	"field_type" varchar(30),
	"data_type" varchar(30),
	"field_length" integer,
	"required" boolean DEFAULT false,
	"controlled_terminology" varchar(100),
	"code_list" json,
	"validation_rules" json,
	"sdtm_mapping" varchar(40),
	"sequence_number" integer,
	"is_core" boolean DEFAULT false,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_cdash_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"form_id" varchar(100) NOT NULL,
	"form_name" text NOT NULL,
	"form_label" text,
	"domain" varchar(20) NOT NULL,
	"form_type" varchar(50),
	"cdash_version" varchar(20) DEFAULT '1.1',
	"form_structure" json,
	"fields" json,
	"validation_rules" json,
	"is_standard" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_cdash_sdtm_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100),
	"cdash_domain" varchar(20) NOT NULL,
	"cdash_variable" varchar(40) NOT NULL,
	"sdtm_domain" varchar(20) NOT NULL,
	"sdtm_variable" varchar(40) NOT NULL,
	"mapping_type" varchar(30),
	"mapping_logic" text,
	"transformation_rule" text,
	"is_active" boolean DEFAULT true,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_compliance_agency_prefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"agency" varchar(20) NOT NULL,
	"region" varchar(50),
	"preferred_standards" json,
	"required_domains" json,
	"mandatory_variables" json,
	"submission_format" json,
	"special_requirements" json,
	"guidance_documents" json,
	"effective_date" date,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_compliance_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"check_run_id" varchar(100) NOT NULL,
	"check_date" timestamp DEFAULT now() NOT NULL,
	"standard" varchar(30),
	"dataset_name" varchar(40),
	"rule_id" varchar(50),
	"finding_type" varchar(30),
	"finding_message" text,
	"record_id" varchar(100),
	"variable_name" varchar(40),
	"value" text,
	"expected_value" text,
	"is_resolved" boolean DEFAULT false,
	"resolution_date" timestamp,
	"resolution_notes" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_compliance_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"rule_id" varchar(50) NOT NULL,
	"rule_category" varchar(50),
	"standard" varchar(30),
	"standard_version" varchar(20),
	"agency" varchar(20),
	"rule_type" varchar(30),
	"severity" varchar(20),
	"description" text,
	"check_logic" text,
	"error_message" text,
	"remediation_guidance" text,
	"is_active" boolean DEFAULT true,
	"effective_date" date,
	"expiration_date" date,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_compliance_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"standard" varchar(30) NOT NULL,
	"version" varchar(20) NOT NULL,
	"release_date" date,
	"implementation_date" date,
	"retirement_date" date,
	"changes" json,
	"impacted_domains" json,
	"migration_notes" text,
	"is_supported" boolean DEFAULT true,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_csr_sap" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"sap_version" varchar(20) NOT NULL,
	"sap_date" date,
	"populations" json,
	"endpoints" json,
	"analysis_sets" json,
	"statistical_methods" json,
	"missing_data_handling" text,
	"interim_analyses" json,
	"multiplicity" text,
	"sample_size_calculation" json,
	"adam_datasets" json,
	"status" varchar(30) DEFAULT 'draft',
	"approval_date" date,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_csr_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"template_id" varchar(100) NOT NULL,
	"template_name" text NOT NULL,
	"template_type" varchar(50),
	"sections" json,
	"tfl_specs" json,
	"data_requirements" json,
	"version" varchar(20) DEFAULT '1.0',
	"is_active" boolean DEFAULT true,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_csr_tfl" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100),
	"tfl_id" varchar(50) NOT NULL,
	"tfl_type" varchar(20) NOT NULL,
	"tfl_number" varchar(20) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"population" varchar(50),
	"datasets" json,
	"programming_logic" text,
	"shell_template" text,
	"output_format" varchar(20),
	"csr_section" varchar(50),
	"priority" varchar(20) DEFAULT 'medium',
	"status" varchar(30) DEFAULT 'planned',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_device_de" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"subject_id" varchar(50) NOT NULL,
	"device_id" varchar(100) NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"event_term" text,
	"event_type" varchar(50),
	"event_date" date,
	"severity" varchar(30),
	"relationship" varchar(50),
	"outcome" varchar(50),
	"action_taken" text,
	"reported_to_fda" boolean DEFAULT false,
	"mdr_report_number" varchar(50),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_device_dx" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"subject_id" varchar(50) NOT NULL,
	"device_id" varchar(100) NOT NULL,
	"device_name" text,
	"device_type" varchar(50),
	"udi" varchar(100),
	"serial_number" varchar(100),
	"lot_number" varchar(100),
	"implant_date" date,
	"explant_date" date,
	"exposure_duration" integer,
	"anatomical_location" varchar(100),
	"laterality" varchar(20),
	"device_size" varchar(50),
	"reason_for_use" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_device_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"subject_id" varchar(50) NOT NULL,
	"device_id" varchar(100) NOT NULL,
	"relationship_type" varchar(50),
	"start_date" date,
	"end_date" date,
	"device_performance" json,
	"patient_reported_outcomes" json,
	"clinician_assessments" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_docs_acrf" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"acrf_version" varchar(20) NOT NULL,
	"form_name" text,
	"page_number" integer,
	"field_name" varchar(50),
	"cdash_variable" varchar(40),
	"sdtm_domain" varchar(20),
	"sdtm_variable" varchar(40),
	"annotation" text,
	"coordinates" json,
	"is_required" boolean DEFAULT false,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_docs_define_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"define_id" varchar(100) NOT NULL,
	"artifact_type" varchar(50),
	"artifact_name" text,
	"artifact_path" text,
	"version" varchar(20),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_docs_repository" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"doc_id" varchar(100) NOT NULL,
	"study_id" varchar(100),
	"doc_type" varchar(50) NOT NULL,
	"doc_name" text NOT NULL,
	"doc_version" varchar(20),
	"file_path" text,
	"file_size" integer,
	"mime_type" varchar(100),
	"linked_datasets" json,
	"annotations" json,
	"status" varchar(30) DEFAULT 'draft',
	"checksum" varchar(64),
	"is_locked" boolean DEFAULT false,
	"locked_by" text,
	"locked_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"last_modified_by" text
);
--> statement-breakpoint
CREATE TABLE "cdisc_ectd_datasets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"dataset_type" varchar(20) NOT NULL,
	"dataset_name" varchar(40) NOT NULL,
	"dataset_label" text,
	"dataset_location" text,
	"file_format" varchar(20) DEFAULT 'xpt',
	"file_size" integer,
	"record_count" integer,
	"variable_count" integer,
	"split_method" varchar(50),
	"dataset_md5" varchar(32),
	"is_supplemental" boolean DEFAULT false,
	"version" varchar(20),
	"status" varchar(30) DEFAULT 'pending',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_ectd_define_xml" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"define_version" varchar(20) DEFAULT '2.1',
	"define_id" varchar(100) NOT NULL,
	"creation_date_time" timestamp DEFAULT now() NOT NULL,
	"study_name" text,
	"study_description" text,
	"protocol_name" text,
	"dataset_metadata" json,
	"variable_metadata" json,
	"code_lists" json,
	"value_level_metadata" json,
	"where_clause_def" json,
	"computation_methods" json,
	"comments" json,
	"standards" json,
	"status" varchar(30) DEFAULT 'draft',
	"xml_content" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_ectd_reviewers_guide" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"guide_version" varchar(20) NOT NULL,
	"guide_type" varchar(30),
	"sections" json,
	"conformance_findings" json,
	"data_issues" json,
	"traceability_matrix" json,
	"custom_domains" json,
	"derivation_details" json,
	"validation_results" json,
	"status" varchar(30) DEFAULT 'draft',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_ectd_sdsp" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"sdsp_version" varchar(20) NOT NULL,
	"standards_used" json,
	"domains_plan" json,
	"controlled_terminology" json,
	"custom_variables" json,
	"data_flow_diagram" text,
	"mapping_strategy" text,
	"validation_plan" text,
	"delivery_schedule" json,
	"status" varchar(30) DEFAULT 'draft',
	"approval_date" date,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_ind_integration" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"ind_number" varchar(50) NOT NULL,
	"study_id" varchar(100),
	"submission_type" varchar(50),
	"clinical_data_package" json,
	"nonclinical_data_package" json,
	"integrated_analyses" json,
	"data_submission_date" date,
	"data_status" varchar(30) DEFAULT 'pending',
	"validation_status" varchar(30),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_ind_ise" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"ise_id" varchar(100) NOT NULL,
	"ind_number" varchar(50) NOT NULL,
	"pooled_studies" json,
	"pooling_rationale" text,
	"efficacy_population" json,
	"primary_endpoints" json,
	"secondary_endpoints" json,
	"subgroup_analyses" json,
	"dose_response" json,
	"time_to_event" json,
	"analysis_datasets" json,
	"status" varchar(30) DEFAULT 'draft',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_ind_iss" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"iss_id" varchar(100) NOT NULL,
	"ind_number" varchar(50) NOT NULL,
	"pooled_studies" json,
	"pooling_strategy" text,
	"safety_population" json,
	"adverse_events" json,
	"serious_ae" json,
	"deaths_summary" json,
	"lab_abnormalities" json,
	"vital_signs" json,
	"exposure_data" json,
	"demographic_data" json,
	"analysis_datasets" json,
	"status" varchar(30) DEFAULT 'draft',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_ind_send" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"domain" varchar(20) NOT NULL,
	"domain_label" text,
	"dataset_name" varchar(40) NOT NULL,
	"species_code" varchar(20),
	"study_type" varchar(50),
	"test_article" text,
	"data_structure" json,
	"variables" json,
	"controlled_terms" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_pq_domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" varchar(100) NOT NULL,
	"batch_id" varchar(100),
	"domain" varchar(20) NOT NULL,
	"domain_label" text,
	"test_category" varchar(50),
	"test_name" text,
	"test_method" text,
	"specification" text,
	"results" json,
	"units" varchar(50),
	"test_date" date,
	"laboratory_id" varchar(50),
	"analyst_id" varchar(50),
	"equipment_id" varchar(50),
	"compliance_status" varchar(30),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_pq_manufacturing" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"batch_id" varchar(100) NOT NULL,
	"product_id" varchar(100) NOT NULL,
	"process_step" varchar(100),
	"step_sequence" integer,
	"parameter" varchar(100),
	"target_value" numeric(15, 5),
	"actual_value" numeric(15, 5),
	"lower_limit" numeric(15, 5),
	"upper_limit" numeric(15, 5),
	"units" varchar(50),
	"equipment" varchar(100),
	"operator" varchar(100),
	"start_time" timestamp,
	"end_time" timestamp,
	"duration" integer,
	"in_process" boolean DEFAULT false,
	"deviation" boolean DEFAULT false,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_pq_stability" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"batch_id" varchar(100) NOT NULL,
	"storage_condition" varchar(50),
	"orientation" varchar(30),
	"container" varchar(100),
	"timepoint" varchar(20),
	"timepoint_value" integer,
	"parameter" varchar(100),
	"result" numeric(15, 5),
	"units" varchar(50),
	"specification" text,
	"conformance" boolean DEFAULT true,
	"oos" boolean DEFAULT false,
	"test_date" date,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_prm_endpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"endpoint_id" varchar(50) NOT NULL,
	"endpoint_type" varchar(20) NOT NULL,
	"endpoint_name" text NOT NULL,
	"endpoint_description" text,
	"measurement_type" varchar(50),
	"analysis_method" text,
	"timepoint" text,
	"success_criteria" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_prm_epochs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"epoch_code" varchar(20) NOT NULL,
	"epoch_name" text NOT NULL,
	"epoch_type" varchar(50),
	"duration" integer,
	"sequence_number" integer,
	"description" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_prm_studies" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"protocol_id" varchar(100) NOT NULL,
	"protocol_title" text NOT NULL,
	"protocol_version" varchar(20) NOT NULL,
	"study_phase" varchar(20),
	"study_type" varchar(50),
	"therapeutic_area" text,
	"indication" text,
	"primary_objective" text,
	"secondary_objectives" json,
	"study_design" text,
	"blinding_schema" varchar(50),
	"randomization" json,
	"population_description" text,
	"planned_subjects" integer,
	"study_duration" integer,
	"regulatory_requirements" json,
	"protocol_status" varchar(50) DEFAULT 'draft',
	"approval_date" date,
	"amendment_history" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"last_modified_by" text,
	CONSTRAINT "cdisc_prm_studies_study_id_unique" UNIQUE("study_id")
);
--> statement-breakpoint
CREATE TABLE "cdisc_prm_study_arms" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"arm_code" varchar(20) NOT NULL,
	"arm_name" text NOT NULL,
	"arm_description" text,
	"arm_type" varchar(50),
	"planned_subjects" integer,
	"treatment_description" text,
	"dosing" json,
	"duration" integer,
	"sequence_number" integer,
	"is_active" boolean DEFAULT true,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_prm_visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"visit_num" varchar(20) NOT NULL,
	"visit_name" text NOT NULL,
	"visit_label" text,
	"epoch_code" varchar(20),
	"visit_day" integer,
	"visit_window" json,
	"visit_type" varchar(50),
	"procedures" json,
	"assessments" json,
	"sequence_number" integer,
	"is_mandatory" boolean DEFAULT true,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_task_deliverables" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"task_id" varchar(100) NOT NULL,
	"deliverable_id" varchar(100) NOT NULL,
	"deliverable_type" varchar(50),
	"cdisc_standard" varchar(30),
	"deliverable_name" text,
	"description" text,
	"assigned_to" text,
	"due_date" date,
	"completion_date" date,
	"status" varchar(30) DEFAULT 'pending',
	"priority" varchar(20) DEFAULT 'medium',
	"dependencies" json,
	"validation_status" varchar(30),
	"review_status" varchar(30),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_task_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"study_id" varchar(100) NOT NULL,
	"milestone_id" varchar(100) NOT NULL,
	"milestone_name" text,
	"milestone_type" varchar(50),
	"target_date" date,
	"actual_date" date,
	"deliverables" json,
	"completion_criteria" json,
	"status" varchar(30) DEFAULT 'pending',
	"approval_required" boolean DEFAULT true,
	"approved_by" text,
	"approval_date" date,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_task_validation_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"queue_id" varchar(100) NOT NULL,
	"study_id" varchar(100),
	"dataset_name" varchar(40),
	"validation_type" varchar(50),
	"priority" varchar(20) DEFAULT 'medium',
	"scheduled_time" timestamp,
	"start_time" timestamp,
	"end_time" timestamp,
	"status" varchar(30) DEFAULT 'queued',
	"results_summary" json,
	"error_count" integer DEFAULT 0,
	"warning_count" integer DEFAULT 0,
	"retry_count" integer DEFAULT 0,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdisc_task_workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"workflow_id" varchar(100) NOT NULL,
	"workflow_name" text,
	"workflow_type" varchar(50),
	"study_id" varchar(100),
	"steps" json,
	"current_step" integer DEFAULT 1,
	"total_steps" integer,
	"start_date" timestamp,
	"completion_date" timestamp,
	"status" varchar(30) DEFAULT 'pending',
	"automation_level" varchar(30),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"document_id" integer,
	"section_key" text,
	"approval_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_id" integer,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_by_id" integer,
	"approved_at" timestamp,
	"rejected_by_id" integer,
	"rejected_at" timestamp,
	"comments" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_clinical_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"cer_report_id" integer NOT NULL,
	"evidence_type" text,
	"title" text,
	"authors" text,
	"year" integer,
	"patients" integer,
	"findings" text,
	"relevance" real,
	"quality" real,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_compliance_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"check_id" text NOT NULL,
	"check_type" text NOT NULL,
	"requirement" text,
	"status" text DEFAULT 'pending',
	"result" json,
	"notes" text,
	"checked_by_id" integer,
	"checked_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"cer_project_id" integer NOT NULL,
	"document_type" text NOT NULL,
	"title" text NOT NULL,
	"version" text NOT NULL,
	"status" text NOT NULL,
	"content" json,
	"metadata" json,
	"created_by_id" integer,
	"updated_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_essential_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"cer_report_id" integer NOT NULL,
	"requirement" text,
	"evidence" text,
	"status" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"export_id" text NOT NULL,
	"format" text NOT NULL,
	"file_name" text,
	"file_path" text,
	"exported_by_id" integer,
	"exported_at" timestamp DEFAULT now(),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_faers_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"faers_id" text NOT NULL,
	"event_date" timestamp,
	"event_type" text,
	"severity" text,
	"device_info" json,
	"patient_info" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_literature" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"literature_id" text NOT NULL,
	"title" text NOT NULL,
	"authors" json,
	"publication_date" timestamp,
	"journal" text,
	"doi" text,
	"pmid" text,
	"relevance_score" real,
	"included" boolean DEFAULT false,
	"summary" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"device_id" integer,
	"name" text NOT NULL,
	"device_name" text NOT NULL,
	"device_manufacturer" text NOT NULL,
	"device_type" text,
	"device_class" text,
	"regulatory_context" text,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0',
	"created_by_id" integer,
	"assigned_to_id" integer,
	"due_date" timestamp,
	"start_date" timestamp,
	"completion_date" timestamp,
	"review_date" timestamp,
	"qmp_id" integer,
	"settings" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"cer_project_id" integer,
	"report_id" text NOT NULL,
	"device_id" integer,
	"device_name" text NOT NULL,
	"device_manufacturer" text,
	"device_type" text,
	"device_class" text,
	"cer_number" text,
	"cer_version" text,
	"cer_status" text,
	"regulatory_framework" text,
	"notified_body_id" text,
	"executive_summary" json,
	"device_description" json,
	"essential_requirements" json,
	"clinical_background" json,
	"clinical_evidence" json,
	"literature_review" json,
	"risk_benefit_analysis" json,
	"conclusions" json,
	"template_id" text,
	"template_version" text,
	"template_checksum" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0',
	"content" json,
	"metadata" json,
	"change_log" json,
	"created_by" integer,
	"updated_by" integer,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cer_reports_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "cer_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"section_id" text NOT NULL,
	"title" text NOT NULL,
	"order" integer NOT NULL,
	"content" json,
	"status" text DEFAULT 'draft',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"version" text DEFAULT '1.0.0',
	"content" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cer_templates_template_id_unique" UNIQUE("template_id")
);
--> statement-breakpoint
CREATE TABLE "cer_version_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"cer_report_id" integer NOT NULL,
	"version" text NOT NULL,
	"change_log" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cer_workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'pending',
	"assigned_to_id" integer,
	"due_date" timestamp,
	"completed_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cerv2_510k_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"document_id" integer,
	"section_number" text NOT NULL,
	"section_title" text NOT NULL,
	"section_key" text NOT NULL,
	"category" text NOT NULL,
	"parent_section_id" integer,
	"level" integer DEFAULT 1,
	"display_order" integer NOT NULL,
	"is_required" boolean DEFAULT false,
	"icon" text,
	"fields" json,
	"content" text,
	"status" text DEFAULT 'todo',
	"completion_percentage" integer DEFAULT 0,
	"compliance_notes" text,
	"regulatory_references" text[],
	"sources" json,
	"assigned_to" integer,
	"reviewer" integer,
	"due_date" date,
	"last_edited_by" integer,
	"validation_errors" json,
	"validation_status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cerv2_document_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"open_sections" text[],
	"active_section_id" text,
	"section_order" text[],
	"is_dirty" boolean DEFAULT false,
	"unsaved_data" json,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cerv2_section_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"version_label" text,
	"change_type" text NOT NULL,
	"change_summary" text,
	"content" text,
	"field_data" json,
	"status" text,
	"completion_percentage" integer,
	"fields_changed" text[],
	"previous_values" json,
	"new_values" json,
	"changed_by" integer,
	"changed_by_name" text,
	"changed_by_email" text,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"original_value" text NOT NULL,
	"new_value" text NOT NULL,
	"affected_udis" json,
	"staging_data" json,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium',
	"reason" text,
	"target_date" timestamp,
	"digital_signature" text,
	"initiated_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"organization_id" integer,
	"executed_by" text,
	"executed_at" timestamp,
	"completed_at" timestamp,
	"execution_summary" json,
	"error" text,
	"failure_reason" text,
	"failed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "client_access" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"permissions" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_client" UNIQUE("user_id","client_workspace_id")
);
--> statement-breakpoint
CREATE TABLE "client_security_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"password_policy_settings" json,
	"session_settings" json,
	"data_protection_settings" json,
	"audit_settings" json,
	"fda_compliance_settings" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_client_security" UNIQUE("client_workspace_id")
);
--> statement-breakpoint
CREATE TABLE "client_user_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"project_id" integer,
	"permissions" json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_project" UNIQUE("user_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "client_workspace_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"general_settings" json,
	"quota_settings" json,
	"module_settings" json,
	"integration_settings" json,
	"appearance_settings" json,
	"notification_settings" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_client_settings" UNIQUE("client_workspace_id")
);
--> statement-breakpoint
CREATE TABLE "client_workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"logo" text,
	"status" text DEFAULT 'active' NOT NULL,
	"quota_projects" integer DEFAULT 5,
	"quota_storage" integer DEFAULT 1,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"industry" text,
	"settings" json,
	"metadata" json,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_org_slug" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "clinical_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" varchar(255) NOT NULL,
	"prediction_id" uuid,
	"phase" text,
	"feedback_type" text NOT NULL,
	"actual_outcome" text,
	"predicted_outcome" text,
	"accuracy_score" real,
	"learning_points" json,
	"impact_on_model" json,
	"verified" boolean DEFAULT false,
	"verified_by" text,
	"organization_id" integer,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "clinical_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" varchar(255) NOT NULL,
	"biomarker_endpoint_id" uuid,
	"outcome_type" text NOT NULL,
	"outcome_value" json,
	"phase" text,
	"patient_count" integer,
	"timepoint" text,
	"statistical_significance" real,
	"adverse_events" json,
	"failure_reasons" text[],
	"metadata" json,
	"organization_id" integer,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cmc_change_control" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"change_number" text NOT NULL,
	"change_type" text NOT NULL,
	"description" text NOT NULL,
	"justification" text NOT NULL,
	"impact_assessment" json,
	"risk_assessment" json,
	"regulatory_filing" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"initiator" integer,
	"approvers" integer[],
	"implementation_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coauthor_annotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"notes" text NOT NULL,
	"ai_advice" text,
	"advice_generated_at" timestamp,
	"created_by_id" integer,
	"last_modified_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coauthor_document_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"content" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"change_summary" text,
	CONSTRAINT "unique_document_version" UNIQUE("document_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "coauthor_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"sections" json,
	"status" text DEFAULT 'draft' NOT NULL,
	"template_id" integer,
	"created_by" text,
	"client_workspace" text,
	"completion_percentage" integer,
	"regulatory_compliance_score" integer,
	"metadata" json,
	"ectd_module_id" integer,
	"module_number" text,
	"module_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coauthor_import_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"ind_submission_id" text,
	"target_document_id" integer NOT NULL,
	"target_module" text NOT NULL,
	"import_type" text NOT NULL,
	"sections_imported" json NOT NULL,
	"field_mappings" json NOT NULL,
	"status" text NOT NULL,
	"progress" integer DEFAULT 0,
	"content_before" text,
	"content_after" text,
	"changes_summary" json,
	"mapping_configuration" json,
	"transformations_applied" json,
	"conflict_resolution" text,
	"conflicts" json,
	"error_message" text,
	"error_details" json,
	"imported_by_id" integer NOT NULL,
	"imported_by_name" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "coauthor_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" varchar NOT NULL,
	"organization_id" integer NOT NULL,
	"session_id" varchar,
	"submission_id" varchar,
	"title" text NOT NULL,
	"module_number" text,
	"section_type" text,
	"x" integer DEFAULT 50 NOT NULL,
	"y" integer DEFAULT 50 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"connections" json DEFAULT '[]'::json,
	"created_by_id" integer,
	"last_modified_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coauthor_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"comments" text,
	"is_approval" boolean DEFAULT false,
	"approval_level" text,
	"changed_by_id" integer NOT NULL,
	"changed_by_name" text NOT NULL,
	"changed_by_role" text,
	"notification_sent" boolean DEFAULT false,
	"notification_sent_at" timestamp,
	"notification_recipients" json,
	"metadata" json,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coauthor_validation_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"validation_id" text NOT NULL,
	"organization_id" integer,
	"document_id" integer,
	"document_version" integer,
	"module" text NOT NULL,
	"agency" text NOT NULL,
	"total_issues" integer DEFAULT 0,
	"critical_issues" integer DEFAULT 0,
	"major_issues" integer DEFAULT 0,
	"minor_issues" integer DEFAULT 0,
	"informational_issues" integer DEFAULT 0,
	"compliance_score" real,
	"passed_rules" integer DEFAULT 0,
	"failed_rules" integer DEFAULT 0,
	"skipped_rules" integer DEFAULT 0,
	"validation_results" json NOT NULL,
	"performed_by" text NOT NULL,
	"performed_by_user_id" integer,
	"performed_at" timestamp DEFAULT now() NOT NULL,
	"exported_at" timestamp,
	"report_path" text,
	"report_format" text,
	"metadata" json,
	CONSTRAINT "coauthor_validation_history_validation_id_unique" UNIQUE("validation_id")
);
--> statement-breakpoint
CREATE TABLE "coauthor_validation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"organization_id" integer,
	"module" text NOT NULL,
	"section" text,
	"agency" text NOT NULL,
	"category" text NOT NULL,
	"rule_type" text NOT NULL,
	"severity" text NOT NULL,
	"rule_name" text NOT NULL,
	"description" text NOT NULL,
	"check_logic" json NOT NULL,
	"remediation_text" text NOT NULL,
	"auto_fix_available" boolean DEFAULT false,
	"auto_fix_logic" json,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coauthor_validation_rules_rule_id_unique" UNIQUE("rule_id")
);
--> statement-breakpoint
CREATE TABLE "communication_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer,
	"name" text NOT NULL,
	"channel_type" text DEFAULT 'internal' NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"project_id" integer,
	"sender_id" integer,
	"sender_type" text DEFAULT 'internal' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"attachments" json,
	"metadata" json,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_calendar" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"obligation_id" integer,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"all_day" boolean DEFAULT false,
	"location" text,
	"participants" json,
	"agency" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"reminder_settings" json,
	"recurrence_rule" text,
	"timezone" text DEFAULT 'UTC',
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"product_id" varchar(100) NOT NULL,
	"agency_id" integer NOT NULL,
	"compliance_status" varchar(50) DEFAULT 'pending',
	"compliance_score" numeric(5, 2),
	"last_assessment_date" date,
	"next_assessment_date" date,
	"requirements" json,
	"findings" json,
	"remediation_actions" json,
	"risk_level" varchar(20) DEFAULT 'medium',
	"assigned_to" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_cross_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_component_id" integer NOT NULL,
	"target_component_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"reference_type" text NOT NULL,
	"reference_text" text,
	"is_valid" boolean DEFAULT true,
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_sequence_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"component_id" integer NOT NULL,
	"component_version_id" integer,
	"udi" varchar(255) NOT NULL,
	"sequence_number" text NOT NULL,
	"submission_id" integer,
	"application_number" text,
	"document_id" integer,
	"document_title" text,
	"module_context" text,
	"section_number" text,
	"ectd_operation" text,
	"replaced_udi" varchar(255),
	"first_used_in_sequence" boolean DEFAULT false,
	"reused_from_sequence" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"component_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"version_label" text,
	"content" json NOT NULL,
	"diff" json,
	"change_description" text,
	"change_type" text,
	"compliance_status" text,
	"compliance_notes" text,
	"validated_against" json,
	"created_by_id" integer,
	"created_by_name" text,
	"approved_by_id" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "components" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"udi" varchar(255) NOT NULL,
	"type" text NOT NULL,
	"level" integer,
	"content" json NOT NULL,
	"module_context" text,
	"section_number" text,
	"source_file" text,
	"extracted_at" timestamp NOT NULL,
	"word_count" integer,
	"checksum" text,
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"tags" json,
	"priority_number" integer DEFAULT 0,
	"display_order" integer DEFAULT 0,
	"context_of_use" text,
	"context_group" text,
	"controlled_vocabulary" json,
	"lifecycle_state" text DEFAULT 'new',
	"replaced_udi" text,
	"replacement_mapping" json,
	"source_data_reference" json,
	"data_traceability" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concept2cure_artifact_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artifact_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"change_description" text,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "c2c_artifact_unique_version" UNIQUE("artifact_id","version")
);
--> statement-breakpoint
CREATE TABLE "concept2cure_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"project_id" integer NOT NULL,
	"conversation_id" integer,
	"organization_id" integer NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"ctd_section" text,
	"template_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_version_id" integer,
	"published_version_id" integer,
	"published_at" timestamp,
	"locked_at" timestamp,
	"locked_by_id" integer,
	"created_by_id" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concept2cure_artifacts_artifact_id_unique" UNIQUE("artifact_id")
);
--> statement-breakpoint
CREATE TABLE "concept2cure_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"parent_conversation_id" integer,
	"fork_message_index" integer,
	"thread_id" text,
	"message_count" integer DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_id" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concept2cure_conversations_conversation_id_unique" UNIQUE("conversation_id")
);
--> statement-breakpoint
CREATE TABLE "concept2cure_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text,
	"attachments" json,
	"artifact_id" text,
	"citations" json,
	"token_count" integer,
	"model_used" text,
	"latency_ms" integer,
	"edited" boolean DEFAULT false,
	"edited_at" timestamp,
	"original_content" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concept2cure_messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "concept2cure_provenance_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"artifact_id" integer NOT NULL,
	"artifact_version_id" integer,
	"organization_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"event_action" text NOT NULL,
	"actor_id" integer,
	"actor_name" text,
	"actor_email" text,
	"details" json DEFAULT '{}'::json,
	"source_artifact_id" integer,
	"source_description" text,
	"backend_route" text,
	"backend_service" text,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concept2cure_provenance_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "concept2cure_review_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"artifact_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"comment" text NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"resolved_by_id" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concept2cure_review_comments_comment_id_unique" UNIQUE("comment_id")
);
--> statement-breakpoint
CREATE TABLE "concept2cure_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"signature_id" text NOT NULL,
	"artifact_id" integer NOT NULL,
	"artifact_version_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"signature_type" text NOT NULL,
	"signature_purpose" text NOT NULL,
	"signature_meaning" text,
	"signer_id" integer NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text NOT NULL,
	"signer_role" text,
	"authentication_method" text NOT NULL,
	"authentication_timestamp" timestamp NOT NULL,
	"second_factor_verified" boolean DEFAULT false,
	"signature_hash" varchar(256) NOT NULL,
	"signature_manifest" json,
	"ip_address" varchar(45),
	"device_info" json,
	"status" text DEFAULT 'active' NOT NULL,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concept2cure_signatures_signature_id_unique" UNIQUE("signature_id")
);
--> statement-breakpoint
CREATE TABLE "concept2cure_submission_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"artifact_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"approved_version_id" integer,
	"published_version_id" integer,
	"content_hash" text NOT NULL,
	"export_hash" text,
	"title" text NOT NULL,
	"ctd_section" text,
	"template_id" text,
	"filename" text,
	"file_size" integer,
	"action_type" text NOT NULL,
	"actor_id" integer,
	"actor_name" text NOT NULL,
	"actor_email" text,
	"actor_role" text,
	"attestation_text" text,
	"signature_meaning" text,
	"metadata" json DEFAULT '{}'::json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concept2cure_submission_snapshots_snapshot_id_unique" UNIQUE("snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "context_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_type" varchar(50) NOT NULL,
	"context_of_use" varchar(100) NOT NULL,
	"priority_number" integer DEFAULT 0,
	"organization_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "context_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context_group_id" uuid,
	"component_udi" varchar(255) NOT NULL,
	"version" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"sequence_references" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cro_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"company_type" text NOT NULL,
	"industry_segment" text,
	"headquarters" text,
	"website" text,
	"primary_contact" text,
	"contact_email" text,
	"contact_phone" text,
	"regulatory_contact" text,
	"regulatory_email" text,
	"contract_start_date" timestamp,
	"contract_end_date" timestamp,
	"contract_value" numeric,
	"contract_status" text DEFAULT 'active' NOT NULL,
	"preferred_regions" json,
	"compliance_requirements" json,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cro_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"study_id" integer,
	"submission_id" integer,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"planned_start_date" timestamp,
	"actual_start_date" timestamp,
	"planned_end_date" timestamp,
	"actual_end_date" timestamp,
	"dependencies" json,
	"deliverables" json,
	"resources" json,
	"budget" numeric,
	"actual_cost" numeric,
	"assigned_to" integer,
	"completion_percentage" integer DEFAULT 0,
	"quality_checks" json,
	"risk_factors" json,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cro_regulatory_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"study_id" integer,
	"submission_type" text NOT NULL,
	"submission_number" text,
	"regulatory_region" text NOT NULL,
	"submission_status" text DEFAULT 'draft' NOT NULL,
	"submission_date" timestamp,
	"expected_approval_date" timestamp,
	"actual_approval_date" timestamp,
	"submission_package" json,
	"regulatory_strategy" text,
	"meeting_history" json,
	"queries" json,
	"amendments" json,
	"milestones" json,
	"budget" numeric,
	"assigned_regulator" text,
	"consultants" json,
	"compliance_score" integer,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cro_studies" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"study_number" text NOT NULL,
	"study_title" text NOT NULL,
	"study_type" text NOT NULL,
	"therapeutic_area" text NOT NULL,
	"indication" text NOT NULL,
	"compound" text,
	"device_name" text,
	"study_phase" text,
	"study_design" text,
	"primary_endpoint" text,
	"secondary_endpoints" json,
	"target_enrollment" integer,
	"current_enrollment" integer DEFAULT 0,
	"study_status" text DEFAULT 'planning' NOT NULL,
	"regulatory_status" text DEFAULT 'pre_ind' NOT NULL,
	"first_patient_in" timestamp,
	"last_patient_out" timestamp,
	"study_completion_date" timestamp,
	"regulatory_regions" json,
	"investigational_product" json,
	"study_budget" numeric,
	"cso_assignments" json,
	"timeline" json,
	"risk_assessment" json,
	"compliance_status" text DEFAULT 'compliant' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cro_team_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"client_id" integer,
	"study_id" integer,
	"submission_id" integer,
	"role" text NOT NULL,
	"responsibility" text,
	"assignment_type" text DEFAULT 'primary' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"utilization_percentage" integer DEFAULT 100,
	"billable_rate" numeric,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_module_task_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_id" text NOT NULL,
	"source_task_id" text NOT NULL,
	"source_module" text NOT NULL,
	"target_task_id" text NOT NULL,
	"target_module" text NOT NULL,
	"link_type" text NOT NULL,
	"dependency_type" text,
	"is_blocking" boolean DEFAULT false,
	"status" text DEFAULT 'active' NOT NULL,
	"impact_description" text,
	"risk_level" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cross_module_task_links_link_id_unique" UNIQUE("link_id")
);
--> statement-breakpoint
CREATE TABLE "cross_species_pkpd" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" varchar(255) NOT NULL,
	"study_id" text NOT NULL,
	"drug_name" text NOT NULL,
	"indication" text,
	"analysis_type" text NOT NULL,
	"source_species" text[] NOT NULL,
	"target_species" text DEFAULT 'human' NOT NULL,
	"scaling_method" text NOT NULL,
	"allometric_exponent" real DEFAULT 0.75,
	"clearance_exponent" real DEFAULT 0.75,
	"volume_exponent" real DEFAULT 1,
	"human_equivalent_dose" numeric(10, 4),
	"human_predicted_cmax" numeric(12, 4),
	"human_predicted_auc" numeric(12, 4),
	"human_predicted_t12" numeric(8, 2),
	"safety_margin" real DEFAULT 10,
	"noael_dose" numeric(10, 4),
	"mabel_dose" numeric(10, 4),
	"pad_dose" numeric(10, 4),
	"recommended_starting_dose" numeric(10, 4),
	"confidence_interval" json,
	"validation_metrics" json,
	"regulatory_guidelines" json,
	"organization_id" integer,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cross_species_pkpd_analysis_id_unique" UNIQUE("analysis_id")
);
--> statement-breakpoint
CREATE TABLE "csr_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"study_design" text,
	"primary_objective" text,
	"secondary_objective" text,
	"primary_endpoint" text,
	"secondary_endpoints" text,
	"inclusion_criteria" text,
	"exclusion_criteria" text,
	"sample_size" integer,
	"dropout_rate" real,
	"blinding" text,
	"randomization" text,
	"statistical_methods" text,
	"efficacy_results" text,
	"safety_results" text,
	"adverse_events" text,
	"serious_events" text,
	"patient_reported_outcome" text,
	"biomarker_used" text,
	"endpoints" json,
	"results" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csr_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"report_id" text NOT NULL,
	"report_title" text NOT NULL,
	"title" text,
	"sponsor" text,
	"indication" text,
	"phase" text,
	"report_date" date,
	"report_type" text,
	"study_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"submission_date" timestamp,
	"due_date" timestamp,
	"upload_date" timestamp DEFAULT now() NOT NULL,
	"sample_size" integer,
	"duration_weeks" integer,
	"study_design" text,
	"primary_endpoint" text,
	"secondary_endpoints" text,
	"deleted_at" timestamp,
	"content" json,
	"metadata" json,
	"compliance_status" text,
	"regulatory_agency" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "csr_reports_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "ctq_factors" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"qmp_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"risk_level" text NOT NULL,
	"applicable_section" text,
	"validation_criteria" text,
	"validation_method" text,
	"status" text DEFAULT 'active' NOT NULL,
	"requires_evidence_type" text,
	"requirement_type" text DEFAULT 'mandatory' NOT NULL,
	"failure_action" text DEFAULT 'block' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_lineage_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" text NOT NULL,
	"workflow_id" text,
	"source_field" text NOT NULL,
	"source_value" json,
	"source_stage" text,
	"source_section" text,
	"target_section" text NOT NULL,
	"target_field" text NOT NULL,
	"mapping_rule" text NOT NULL,
	"transformations" text[],
	"user_id" integer NOT NULL,
	"session_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deviations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"deviation_number" varchar(100) NOT NULL,
	"deviation_type" varchar(50) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"impact" varchar(50),
	"batch_id" integer,
	"material_id" integer,
	"shipment_id" integer,
	"supplier_id" integer,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"discovery_date" timestamp NOT NULL,
	"discovered_by" text NOT NULL,
	"location" text,
	"investigation_required" boolean DEFAULT true,
	"investigation_status" varchar(50) DEFAULT 'not_started',
	"root_cause" text,
	"immediate_action" text,
	"corrective_actions" json,
	"preventive_actions" json,
	"capa_required" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium',
	"assigned_to" text,
	"due_date" date,
	"closed_date" date,
	"closed_by" text,
	"regulatory_reporting_required" boolean DEFAULT false,
	"regulatory_notification_date" date,
	"quality_impact_assessment" text,
	"batch_disposition" varchar(50),
	"attachments" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_audit_trail" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"action" text NOT NULL,
	"previous_values" json,
	"new_values" json,
	"changed_fields" text[],
	"change_reason" text,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"user_role" text,
	"ip_address" text,
	"user_agent" text,
	"session_id" text,
	"electronic_signature" text,
	"signature_timestamp" timestamp,
	"signature_meaning" text,
	"compliance_standard" text DEFAULT '21 CFR Part 11',
	"data_integrity_check" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"component_code" text NOT NULL,
	"component_name" text NOT NULL,
	"component_type" text,
	"parent_id" integer,
	"level" integer DEFAULT 0,
	"bom_ref" text,
	"manufacturer" text,
	"part_number" text,
	"version" text,
	"specifications" json,
	"test_requirements" text[],
	"related_standards" text[],
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_data_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_code" text NOT NULL,
	"category_name" text NOT NULL,
	"description" text,
	"parent_category" text,
	"parent_id" integer,
	"level" integer DEFAULT 0,
	"synonyms" text[],
	"required_for_510k" boolean DEFAULT false,
	"display_order" integer,
	"icon" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "device_data_categories_category_code_unique" UNIQUE("category_code")
);
--> statement-breakpoint
CREATE TABLE "device_data_center" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer,
	"storage_url" text,
	"checksum" text,
	"device_name" text,
	"device_model" text,
	"device_identifier" text,
	"category" text NOT NULL,
	"subcategory" text,
	"test_standards" text[],
	"test_type" text,
	"test_date" date,
	"test_lab_name" text,
	"test_lab_certification" text,
	"device_components" text[],
	"component_version" text,
	"regulatory_status" text,
	"submission_number" text,
	"predicate_device" text,
	"predicate_k_number" text,
	"report_id" text,
	"version" text,
	"author_owner" text,
	"confidentiality" text,
	"lot_batch" text,
	"sample_id" text,
	"build_rev" text,
	"configuration" text,
	"product_code" text,
	"device_class" text,
	"protocol_id" text,
	"acceptance_criteria_ref" text,
	"environment" text,
	"n_samples" integer,
	"cycles" integer,
	"sterilization_method" text,
	"sal" text,
	"aging_duration" text,
	"result" text,
	"margin" text,
	"deviations" text[],
	"section_refs" text[],
	"rta_checklist_refs" text[],
	"tags" text[],
	"categories" text[],
	"components" text[],
	"standard_ref" json,
	"related_documents" integer[],
	"parent_document_id" integer,
	"metadata" json,
	"searchable_content" text,
	"uploaded_by" text NOT NULL,
	"reviewed_by" text,
	"approved_by" text,
	"comments" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"approved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "device_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text,
	"device_name" text,
	"classification" text,
	"manufacturer" text,
	"device_type" text,
	"product_code" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_submission_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"submission_type" text NOT NULL,
	"submission_id" integer NOT NULL,
	"document_type" text NOT NULL,
	"document_title" text NOT NULL,
	"document_version" text DEFAULT '1.0',
	"file_path" text,
	"file_size" integer,
	"mime_type" text,
	"status" text DEFAULT 'draft',
	"review_comments" json,
	"is_required" boolean DEFAULT false,
	"is_submitted" boolean DEFAULT false,
	"validation_status" text,
	"validation_errors" json,
	"uploaded_by" integer,
	"uploaded_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_submission_workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"workflow_type" text NOT NULL,
	"submission_type" text NOT NULL,
	"submission_id" integer NOT NULL,
	"current_step" text NOT NULL,
	"completed_steps" json DEFAULT '[]'::json,
	"pending_steps" json DEFAULT '[]'::json,
	"total_steps" integer,
	"progress_percentage" integer DEFAULT 0,
	"estimated_completion_date" date,
	"workflow_status" text DEFAULT 'active',
	"validation_checkpoints" json,
	"blocking_issues" json,
	"assigned_to" integer,
	"reviewers" integer[],
	"started_at" timestamp,
	"completed_at" timestamp,
	"last_activity_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"device_id" integer,
	"submission_type" text,
	"status" text,
	"submitted_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_test_standards" (
	"id" serial PRIMARY KEY NOT NULL,
	"standard_code" text NOT NULL,
	"standard_name" text NOT NULL,
	"standard_body" text,
	"family" text,
	"version" text,
	"edition_year" integer,
	"clause" text,
	"region" text,
	"description" text,
	"applicable_categories" text[],
	"required_tests" json,
	"effective_date" date,
	"superseded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "device_test_standards_standard_code_unique" UNIQUE("standard_code")
);
--> statement-breakpoint
CREATE TABLE "dlt_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"cohort_id" uuid NOT NULL,
	"patient_id" text NOT NULL,
	"event_date" date NOT NULL,
	"ctcae_grade" integer NOT NULL,
	"system_organ_class" text NOT NULL,
	"preferred_term" text NOT NULL,
	"description" text,
	"relatedness" text NOT NULL,
	"seriousness" text NOT NULL,
	"outcome" text,
	"action_taken" text,
	"dose_modification" json,
	"rechallenge" boolean DEFAULT false,
	"rechallenge_outcome" text,
	"reported_to_fda" boolean DEFAULT false,
	"reported_to_irb" boolean DEFAULT false,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"previous_version" text,
	"new_version" text NOT NULL,
	"changes" json,
	"metadata" json,
	"comments" text,
	"review_details" json,
	"compliance_score" integer,
	"ip_address" text,
	"user_agent" text,
	"session_id" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_audit_trail" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"document_id" integer,
	"version_id" integer,
	"action_type" varchar(50) NOT NULL,
	"action_category" varchar(50) NOT NULL,
	"action_description" text NOT NULL,
	"action_result" varchar(20) NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"user_email" text NOT NULL,
	"user_role" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"session_id" varchar(100),
	"previous_value" json,
	"new_value" json,
	"reason_for_change" text,
	"justification" text,
	"data_integrity_check" varchar(64),
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"version_id" integer,
	"parent_comment_id" integer,
	"comment_type" varchar(50) DEFAULT 'general',
	"section_reference" varchar(200),
	"content" text NOT NULL,
	"status" varchar(50) DEFAULT 'open',
	"priority" varchar(20) DEFAULT 'normal',
	"resolved_by_id" integer,
	"resolved_at" timestamp,
	"resolution_note" text,
	"author_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"attachments" json,
	"mentions" json,
	"is_edited" boolean DEFAULT false,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"component_id" integer NOT NULL,
	"component_version_id" integer,
	"organization_id" integer NOT NULL,
	"position" integer NOT NULL,
	"parent_component_id" integer,
	"depth" integer DEFAULT 0,
	"override_content" json,
	"is_overridden" boolean DEFAULT false,
	"is_locked" boolean DEFAULT false,
	"locked_by_id" integer,
	"locked_at" timestamp,
	"lock_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" integer,
	"path" text,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"section_id" varchar(100),
	"lock_type" varchar(50) NOT NULL,
	"locked_by_id" integer NOT NULL,
	"locked_by_name" text NOT NULL,
	"lock_reason" text,
	"lock_token" varchar(100) NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"released_at" timestamp,
	"auto_release" boolean DEFAULT true,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "document_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"section_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"leaf_id" integer,
	"override" boolean DEFAULT false NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_token" varchar(256) NOT NULL,
	"user_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"document_id" integer,
	"session_type" varchar(50) DEFAULT 'read',
	"ip_address" varchar(45),
	"user_agent" text,
	"device_id" varchar(100),
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"is_active" boolean DEFAULT true,
	"end_reason" varchar(50),
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"module" text,
	"region" text,
	"type" text NOT NULL,
	"description" text,
	"version" text DEFAULT '1.0.0',
	"content" json,
	"placeholders" json,
	"tags" text[],
	"status" text DEFAULT 'active' NOT NULL,
	"is_public" boolean DEFAULT true,
	"download_count" integer DEFAULT 0,
	"rating_average" numeric(3, 2) DEFAULT '0',
	"rating_count" integer DEFAULT 0,
	"file_url" text,
	"file_size" integer,
	"file_type" text,
	"created_by_id" integer,
	"last_used_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_vectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"component_id" integer,
	"component_version_id" integer,
	"document_id" integer,
	"chunk_text" text NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"chunk_size" integer NOT NULL,
	"embedding" vector(3072),
	"embedding_model" text DEFAULT 'text-embedding-3-large' NOT NULL,
	"module_context" text,
	"section_number" text,
	"regulatory_entities" json,
	"metadata" json,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp,
	"access_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"version_number" varchar(20) NOT NULL,
	"version_label" varchar(50),
	"content" text NOT NULL,
	"change_description" text,
	"change_type" varchar(50),
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"is_published" boolean DEFAULT false,
	"published_at" timestamp,
	"reviewed_by_id" integer,
	"reviewed_at" timestamp,
	"approved_by_id" integer,
	"approved_at" timestamp,
	"file_path" text,
	"file_size" integer,
	"mime_type" varchar(100),
	"checksum" varchar(64),
	"metadata" json,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"project_id" integer,
	"module" varchar(50),
	"version" varchar(20) DEFAULT '1.0',
	"region_scope" text,
	"document_code" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"category" varchar(50),
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"current_version_id" integer,
	"effective_date" date,
	"expiry_date" date,
	"owner_id" integer NOT NULL,
	"department_id" integer,
	"compliance_level" varchar(50) DEFAULT 'standard',
	"regulatory_references" json,
	"validation_status" varchar(50),
	"access_level" varchar(50) DEFAULT 'restricted',
	"access_control_list" json,
	"encryption_status" boolean DEFAULT false,
	"keywords" text,
	"description" text,
	"metadata" json,
	"is_active" boolean DEFAULT true,
	"is_locked" boolean DEFAULT false,
	"locked_by_id" integer,
	"locked_at" timestamp,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doe_analysis_results" (
	"id" varchar PRIMARY KEY NOT NULL,
	"study_id" varchar NOT NULL,
	"response_id" varchar NOT NULL,
	"analysis_type" text NOT NULL,
	"model" json,
	"statistics" json,
	"predictions" json,
	"residuals" json,
	"optimization_results" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doe_experiments" (
	"id" varchar PRIMARY KEY NOT NULL,
	"study_id" varchar NOT NULL,
	"run_order" integer NOT NULL,
	"standard_order" integer,
	"block_number" integer DEFAULT 1,
	"factor_settings" json NOT NULL,
	"response_values" json,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"conducted_by" text,
	"conducted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doe_factors" (
	"id" varchar PRIMARY KEY NOT NULL,
	"study_id" varchar NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'continuous' NOT NULL,
	"unit" text,
	"low_level" text,
	"high_level" text,
	"center_point" text,
	"levels" json,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doe_responses" (
	"id" varchar PRIMARY KEY NOT NULL,
	"study_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text,
	"target" numeric(15, 6),
	"target_type" text DEFAULT 'maximize',
	"lower_limit" numeric(15, 6),
	"upper_limit" numeric(15, 6),
	"importance" integer DEFAULT 1,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doe_studies" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"process_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"design_type" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"objectives" json,
	"constraints" json,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dose_cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"dose_level_id" uuid NOT NULL,
	"cohort_number" integer NOT NULL,
	"patient_id" text NOT NULL,
	"enrollment_date" date NOT NULL,
	"first_dose_date" date,
	"last_dose_date" date,
	"dlt_evaluation_start_date" date,
	"dlt_evaluation_end_date" date,
	"evaluable_for_dlt" boolean DEFAULT true,
	"dlt_occurred" boolean DEFAULT false,
	"dlt_details" json,
	"discontinuation_date" date,
	"discontinuation_reason" text,
	"best_response" text,
	"adverse_events" json,
	"concomitant_medications" json,
	"pk_samples" json,
	"biomarker_results" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dose_escalation_studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" varchar(255) NOT NULL,
	"protocol_number" text NOT NULL,
	"title" text NOT NULL,
	"indication" text NOT NULL,
	"phase" text NOT NULL,
	"escalation_method" text NOT NULL,
	"starting_dose" numeric(10, 4) NOT NULL,
	"dose_unit" text NOT NULL,
	"max_dose" numeric(10, 4),
	"target_toxicity_rate" real DEFAULT 0.33,
	"toxicity_window" integer DEFAULT 28,
	"status" text DEFAULT 'active' NOT NULL,
	"current_dose_level" integer DEFAULT 1,
	"mtd_determined" boolean DEFAULT false,
	"mtd_dose" numeric(10, 4),
	"rp2d" numeric(10, 4),
	"total_patients" integer DEFAULT 0,
	"dlts_observed" integer DEFAULT 0,
	"safety_run_in" boolean DEFAULT false,
	"stopping_rules_met" boolean DEFAULT false,
	"stopping_reason" text,
	"regulatory_compliance" json,
	"escalation_parameters" json,
	"organization_id" integer,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dose_escalation_studies_study_id_unique" UNIQUE("study_id")
);
--> statement-breakpoint
CREATE TABLE "dose_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"level_number" integer NOT NULL,
	"dose_amount" numeric(10, 4) NOT NULL,
	"dose_unit" text NOT NULL,
	"escalation_percentage" real,
	"max_patients_per_cohort" integer DEFAULT 3,
	"min_patients_per_cohort" integer DEFAULT 3,
	"patients_enrolled" integer DEFAULT 0,
	"patients_evaluable" integer DEFAULT 0,
	"dlts_in_cohort" integer DEFAULT 0,
	"toxicity_rate" real,
	"pharmacokinetic_data" json,
	"pharmacodynamic_data" json,
	"biomarker_data" json,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_date" timestamp,
	"decision_rationale" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drug_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"dosage_form" text NOT NULL,
	"strength" text NOT NULL,
	"route_of_administration" text,
	"composition" json,
	"manufacturing_process" json,
	"batch_formula" json,
	"process_controls" json,
	"specifications" json,
	"packaging_materials" json,
	"stability" json,
	"status" text DEFAULT 'development' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drug_substances" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"substance_name" text NOT NULL,
	"structural_formula" text,
	"molecular_formula" text,
	"molecular_weight" numeric,
	"cas_number" text,
	"inn" text,
	"manufacturing_process" json,
	"specifications" json,
	"impurities_profile" json,
	"stability" json,
	"control_of_materials" json,
	"status" text DEFAULT 'development' NOT NULL,
	"development_phase" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ectd_change_control" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"granule_id" integer NOT NULL,
	"change_type" text NOT NULL,
	"change_reason" text NOT NULL,
	"previous_version" text,
	"new_version" text NOT NULL,
	"change_description" text,
	"sequence_number" text,
	"xml_operation" text,
	"affected_sections" json,
	"review_required" boolean DEFAULT false,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"implemented_at" timestamp,
	"rollback_info" json,
	"audit_trail" json,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ectd_compilations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"compilation_name" text NOT NULL,
	"compilation_type" text NOT NULL,
	"included_granules" json,
	"compiled_file_path" text,
	"sharepoint_url" text,
	"xml_backbone" text,
	"cross_references" json,
	"status" text DEFAULT 'pending' NOT NULL,
	"compiled_by" integer NOT NULL,
	"compiled_at" timestamp,
	"version" text DEFAULT '1.0',
	"change_log" json,
	"validation_results" json,
	"lock_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ectd_cross_references" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"source_granule_id" integer NOT NULL,
	"target_granule_id" integer NOT NULL,
	"reference_type" text NOT NULL,
	"source_location" text,
	"target_location" text,
	"link_text" text,
	"auto_generated" boolean DEFAULT false,
	"ich_compliant" boolean DEFAULT true,
	"validation_status" text DEFAULT 'valid',
	"last_validated" timestamp,
	"xml_hyperlink" text,
	"context_info" json,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ectd_granules" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"granule_id" text NOT NULL,
	"granule_name" text NOT NULL,
	"file_name" text,
	"file_extension" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"last_edited_by" integer,
	"last_edited_at" timestamp,
	"document_path" text,
	"sharepoint_url" text,
	"sharepoint_doc_id" text,
	"is_locked" boolean DEFAULT false,
	"compiled_into" integer,
	"template_id" integer,
	"custom_granule" boolean DEFAULT false,
	"ich_section" text,
	"word_count" integer DEFAULT 0,
	"metadata" json,
	"tags" text[],
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ectd_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer,
	"module_number" text NOT NULL,
	"module_name" text NOT NULL,
	"parent_module_id" integer,
	"level" integer NOT NULL,
	"is_leaf" boolean DEFAULT false,
	"sort_order" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ich_guidance" text,
	"is_required" boolean DEFAULT false,
	"allow_custom_granules" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ectd_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"template_name" text NOT NULL,
	"granule_id" text,
	"module_number" text,
	"category" text NOT NULL,
	"template_type" text NOT NULL,
	"content" text,
	"placeholders" json,
	"ich_guidance" text,
	"word_template" text,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"version" text DEFAULT '1.0',
	"approved_by" integer,
	"approved_at" timestamp,
	"usage_count" integer DEFAULT 0,
	"tags" text[],
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "electronic_signatures" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"signature_type" varchar(50) NOT NULL,
	"signature_purpose" text NOT NULL,
	"signature_level" integer DEFAULT 1,
	"signer_id" integer NOT NULL,
	"signer_name" text NOT NULL,
	"signer_title" text,
	"signer_email" text NOT NULL,
	"authentication_method" varchar(50) NOT NULL,
	"authentication_timestamp" timestamp NOT NULL,
	"second_factor_verified" boolean DEFAULT false,
	"signature_hash" varchar(256) NOT NULL,
	"signature_meaning" text,
	"signature_manifest" json,
	"is_valid" boolean DEFAULT true,
	"verification_status" varchar(50),
	"verification_date" timestamp,
	"compliance_statement" text,
	"legal_disclaimer" text,
	"ip_address" varchar(45),
	"device_info" json,
	"signed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"fact_id" text NOT NULL,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"source" text,
	"confidence" real DEFAULT 1,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "facts_fact_id_unique" UNIQUE("fact_id")
);
--> statement-breakpoint
CREATE TABLE "fda_510k_data_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"mapping_code" text NOT NULL,
	"mapping_name" text NOT NULL,
	"source_type" text NOT NULL,
	"source_reference" text NOT NULL,
	"target_template" text NOT NULL,
	"target_field" text NOT NULL,
	"transformation_type" text,
	"transformation_rules" json,
	"is_required" boolean DEFAULT false,
	"validation_rules" json,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fda_510k_data_mappings_mapping_code_unique" UNIQUE("mapping_code")
);
--> statement-breakpoint
CREATE TABLE "fda_510k_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"template_id" integer,
	"document_id" text NOT NULL,
	"document_type" text NOT NULL,
	"document_name" text NOT NULL,
	"content" text,
	"form_data" json,
	"attachments" json,
	"status" text DEFAULT 'draft',
	"is_locked" boolean DEFAULT false,
	"locked_at" timestamp,
	"locked_by" integer,
	"version" integer DEFAULT 1,
	"previous_version_id" integer,
	"change_log" json,
	"signatures" json,
	"signature_required" boolean DEFAULT false,
	"validation_status" text DEFAULT 'pending',
	"validation_errors" json,
	"compliance_score" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fda_510k_documents_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "fda_510k_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"submission_id" integer,
	"current_stage" text DEFAULT 'setup',
	"current_stage_progress" integer DEFAULT 0,
	"overall_progress" integer DEFAULT 0,
	"device_name" text NOT NULL,
	"device_classification" text,
	"product_code" text,
	"regulation_number" text,
	"panel_code" text,
	"has_software" boolean DEFAULT false,
	"has_cybersecurity" boolean DEFAULT false,
	"has_sterility" boolean DEFAULT false,
	"has_biocompatibility" boolean DEFAULT true,
	"has_clinical_data" boolean DEFAULT false,
	"has_ai" boolean DEFAULT false,
	"project_lead" integer,
	"regulatory_lead" integer,
	"quality_lead" integer,
	"team_members" json,
	"project_start_date" timestamp DEFAULT now(),
	"target_submission_date" date,
	"actual_submission_date" date,
	"status" text DEFAULT 'active',
	"locked_for_submission" boolean DEFAULT false,
	"locked_at" timestamp,
	"locked_by" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fda_510k_stage_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"stage_name" text NOT NULL,
	"section_name" text NOT NULL,
	"status" text DEFAULT 'pending',
	"progress" integer DEFAULT 0,
	"is_required" boolean DEFAULT true,
	"collected_data" json,
	"validation_status" text DEFAULT 'pending',
	"validation_errors" json,
	"started_at" timestamp,
	"completed_at" timestamp,
	"completed_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fda_510k_submission_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"submission_id" integer,
	"package_id" text NOT NULL,
	"package_name" text NOT NULL,
	"package_type" text DEFAULT '510k',
	"documents" json,
	"attachments" json,
	"estar_data" json,
	"submission_method" text DEFAULT 'esg',
	"esg_transaction_id" text,
	"fda_acknowledgment_number" text,
	"status" text DEFAULT 'draft',
	"is_locked" boolean DEFAULT false,
	"locked_at" timestamp,
	"rta_checklist_complete" boolean DEFAULT false,
	"rta_checklist_results" json,
	"final_validation" json,
	"submitted_at" timestamp,
	"submitted_by" integer,
	"acknowledgment_date" date,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fda_510k_submission_packages_package_id_unique" UNIQUE("package_id")
);
--> statement-breakpoint
CREATE TABLE "fda_510k_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"device_id" integer NOT NULL,
	"submission_number" text,
	"submission_type" text NOT NULL,
	"submission_status" text DEFAULT 'draft',
	"predicate_device_name" text,
	"predicate_device_number" text,
	"predicate_manufacturer" text,
	"substantial_equivalence_rationale" text,
	"performance_testing_summary" text,
	"biocompatibility_testing" json,
	"sterilization_validation" json,
	"software_validation" json,
	"clinical_data_summary" text,
	"consensus_standards_used" text[],
	"guidance_documents_referenced" text[],
	"target_submission_date" date,
	"actual_submission_date" date,
	"fda_acknowledgment_date" date,
	"additional_info_request_date" date,
	"clearance_date" date,
	"prepared_by" integer,
	"prepared_date" timestamp,
	"reviewed_by" integer,
	"reviewed_date" timestamp,
	"approved_by" integer,
	"approved_date" timestamp,
	"electronic_signatures" json,
	"audit_trail" json,
	"validation_status" text DEFAULT 'pending',
	"validation_errors" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fda_510k_submissions_submission_number_unique" UNIQUE("submission_number")
);
--> statement-breakpoint
CREATE TABLE "fda_510k_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"template_code" text NOT NULL,
	"template_name" text NOT NULL,
	"template_type" text NOT NULL,
	"fda_form_number" text,
	"template_content" text,
	"placeholders" json,
	"data_mapping" json,
	"validation_rules" json,
	"version" text DEFAULT '1.0',
	"is_active" boolean DEFAULT true,
	"is_draft" boolean DEFAULT false,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fda_510k_templates_template_code_unique" UNIQUE("template_code")
);
--> statement-breakpoint
CREATE TABLE "fda_communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer,
	"channel_id" integer,
	"direction" text DEFAULT 'outbound' NOT NULL,
	"communication_type" text DEFAULT 'email' NOT NULL,
	"subject" text NOT NULL,
	"summary" text,
	"sent_at" timestamp,
	"received_at" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"attachments" json,
	"metadata" json,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fda_integration_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"integration_type" text NOT NULL,
	"api_endpoint" text,
	"http_method" text,
	"request_payload" json,
	"response_payload" json,
	"http_status_code" integer,
	"related_entity_type" text,
	"related_entity_id" integer,
	"status" text NOT NULL,
	"error_message" text,
	"error_code" text,
	"retry_count" integer DEFAULT 0,
	"request_duration" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foresight_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" varchar(255) NOT NULL,
	"phase" text NOT NULL,
	"prediction_type" text NOT NULL,
	"success_score" real,
	"confidence_interval" json,
	"risk_factors" json,
	"recommendations" json,
	"similar_trials" json,
	"failure_patterns" json,
	"model_version" text,
	"organization_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "gate_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"approval_id" text NOT NULL,
	"gate_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"approver_role" text NOT NULL,
	"approver_id" integer NOT NULL,
	"approver_name" text NOT NULL,
	"decision" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"comments" text,
	"conditions" text,
	"signature_hash" text NOT NULL,
	"signature_meaning" text NOT NULL,
	"signature_timestamp" timestamp NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text,
	"verification_method" text,
	"verification_token" text,
	"requested_at" timestamp NOT NULL,
	"responded_at" timestamp,
	"expires_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gate_approvals_approval_id_unique" UNIQUE("approval_id")
);
--> statement-breakpoint
CREATE TABLE "ind_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"application_number" text,
	"sponsor_name" text,
	"drug_name" text,
	"drug_established_name" text,
	"drug_code" text,
	"indication" text,
	"phase" text,
	"submission_type" text,
	"submission_date" date,
	"status" text DEFAULT 'draft',
	"pre_ind_data" json,
	"nonclinical_data" json,
	"cmc_data" json,
	"clinical_protocol_data" json,
	"investigator_brochure_data" json,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ind_applications_application_number_unique" UNIQUE("application_number")
);
--> statement-breakpoint
CREATE TABLE "ind_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"ind_application_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"template_id" integer,
	"title" text NOT NULL,
	"content" text,
	"document_type" text,
	"module_number" text,
	"version" text DEFAULT '1.0',
	"status" text DEFAULT 'draft',
	"file_path" text,
	"sharepoint_url" text,
	"ai_generated" boolean DEFAULT false,
	"ai_model" text,
	"ai_tokens_used" integer,
	"generation_time" integer,
	"approved_by" integer,
	"approved_at" timestamp,
	"metadata" json,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ind_narrative_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"narrative_id" uuid NOT NULL,
	"section_number" text NOT NULL,
	"section_title" text NOT NULL,
	"section_type" text NOT NULL,
	"template_id" text,
	"content" text,
	"html_content" text,
	"word_count" integer DEFAULT 0,
	"data_source" json,
	"citations" json,
	"tables" json,
	"figures" json,
	"review_status" text DEFAULT 'pending',
	"review_comments" json,
	"compliance_flags" json,
	"version" integer DEFAULT 1,
	"previous_version_id" uuid,
	"created_by" text,
	"last_modified_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ind_narratives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"narrative_id" varchar(255) NOT NULL,
	"ind_number" text,
	"protocol_number" text NOT NULL,
	"title" text NOT NULL,
	"drug_name" text NOT NULL,
	"indication" text NOT NULL,
	"phase" text NOT NULL,
	"narrative_type" text NOT NULL,
	"version" integer DEFAULT 1,
	"status" text DEFAULT 'draft' NOT NULL,
	"compliance_score" real,
	"compliance_checks" json,
	"cross_references" json,
	"source_data" json,
	"generated_sections" integer DEFAULT 0,
	"total_sections" integer DEFAULT 0,
	"last_generated_at" timestamp,
	"approved_by" text,
	"approved_at" timestamp,
	"submitted_to_fda" boolean DEFAULT false,
	"submission_date" date,
	"fda_response_date" date,
	"fda_response" text,
	"organization_id" integer,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ind_narratives_narrative_id_unique" UNIQUE("narrative_id")
);
--> statement-breakpoint
CREATE TABLE "ind_package_plan_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"region_code" varchar(10) NOT NULL,
	"modality_code" varchar(20),
	"document_type" varchar(50) NOT NULL,
	"document_title" text NOT NULL,
	"description" text,
	"section" varchar(50),
	"is_mandatory" boolean DEFAULT true,
	"is_region_specific" boolean DEFAULT false,
	"is_modality_specific" boolean DEFAULT false,
	"recommended_template" text,
	"template_id" text,
	"guidance_references" json,
	"status" varchar(50) DEFAULT 'not_started',
	"completion_percentage" integer DEFAULT 0,
	"assigned_to" text,
	"estimated_effort" integer,
	"target_date" date,
	"completion_date" date,
	"current_version" varchar(20) DEFAULT '1.0',
	"last_review_date" date,
	"reviewed_by" text,
	"approved_by" text,
	"approval_date" date,
	"document_id" integer,
	"file_path" text,
	"file_size" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ind_package_plan_modalities" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"modality_code" varchar(20) NOT NULL,
	"modality_name" text NOT NULL,
	"special_requirements" json,
	"recommended_templates" json,
	"additional_studies" json,
	"cmc_complexity" varchar(20) DEFAULT 'standard',
	"manufacturing_requirements" json,
	"analytical_requirements" json,
	"timeline_impact_days" integer DEFAULT 0,
	"complexity_multiplier" numeric(3, 2) DEFAULT '1.0',
	"priority" varchar(20) DEFAULT 'medium',
	"status" varchar(50) DEFAULT 'configured',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ind_package_plan_regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"region_code" varchar(10) NOT NULL,
	"region_name" text NOT NULL,
	"agency_name" text,
	"submission_type" varchar(50),
	"regulatory_pathway" text,
	"estimated_days" integer,
	"critical_path" boolean DEFAULT false,
	"required_documents" json,
	"recommended_templates" json,
	"specific_requirements" json,
	"compliance_status" varchar(50) DEFAULT 'not_assessed',
	"compliance_score" numeric(5, 2),
	"priority" varchar(20) DEFAULT 'medium',
	"status" varchar(50) DEFAULT 'planned',
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ind_package_plan_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"region_code" varchar(10) NOT NULL,
	"modality_code" varchar(20),
	"requirement_type" varchar(50) NOT NULL,
	"requirement_title" text NOT NULL,
	"description" text,
	"is_mandatory" boolean DEFAULT true,
	"status" varchar(50) DEFAULT 'pending',
	"compliance_level" varchar(50),
	"estimated_effort" integer,
	"estimated_duration" integer,
	"dependencies" json,
	"template_recommendations" json,
	"reference_guidelines" json,
	"assigned_to" text,
	"due_date" date,
	"completion_date" date,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ind_package_plan_timelines" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"region_code" varchar(10),
	"modality_code" varchar(20),
	"phase_type" varchar(50) NOT NULL,
	"phase_name" text NOT NULL,
	"description" text,
	"estimated_days" integer NOT NULL,
	"buffer_days" integer DEFAULT 0,
	"total_days" integer NOT NULL,
	"optimistic_days" integer,
	"expected_days" integer,
	"pessimistic_days" integer,
	"sequence_order" integer,
	"is_parallel" boolean DEFAULT false,
	"depends_on_phases" json,
	"risk_level" varchar(20) DEFAULT 'medium',
	"uncertainty_factor" numeric(3, 2) DEFAULT '1.2',
	"status" varchar(50) DEFAULT 'planned',
	"actual_start_date" date,
	"actual_end_date" date,
	"actual_days" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ind_package_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"plan_id" varchar(100) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"drug_name" text,
	"indication" text,
	"phase" varchar(20) DEFAULT 'Phase I',
	"sponsor" text,
	"plan_type" varchar(50) DEFAULT 'multi_regional',
	"status" varchar(50) DEFAULT 'draft',
	"selected_regions" json,
	"selected_modalities" json,
	"package_config" json,
	"overall_compliance_score" numeric(5, 2),
	"cmc_readiness_score" numeric(5, 2),
	"estimated_timeline_days" integer,
	"target_submission_date" date,
	"cmc_project_id" text,
	"last_synced_at" timestamp,
	"metadata" json,
	"is_active" boolean DEFAULT true,
	"created_by_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ind_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"name" text NOT NULL,
	"drug_name" text NOT NULL,
	"indication" text NOT NULL,
	"sponsor" text NOT NULL,
	"phase" text NOT NULL,
	"target_submission_date" timestamp,
	"status" text DEFAULT 'draft' NOT NULL,
	"stage" text DEFAULT 'preparation' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"project_data" json NOT NULL,
	"step_data" json NOT NULL,
	"sections" json NOT NULL,
	"cmc_data" json,
	"csr_data" json,
	"analytics_data" json,
	"compliance_score" integer DEFAULT 0,
	"ai_capabilities" json,
	"deficiencies" json,
	"owner_id" integer,
	"created_by_id" integer,
	"last_modified_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp,
	"approved_at" timestamp,
	CONSTRAINT "ind_projects_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "ind_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"session_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"ind_project_id" text,
	"current_phase" text DEFAULT 'ind-wizard' NOT NULL,
	"phases" json NOT NULL,
	"drug_name" text NOT NULL,
	"indication" text NOT NULL,
	"sponsor" text NOT NULL,
	"phase" text NOT NULL,
	"target_submission_date" timestamp,
	"ind_wizard_status" text DEFAULT 'draft' NOT NULL,
	"ind_steps_completed" json NOT NULL,
	"ind_step_data" json NOT NULL,
	"ectd_status" text DEFAULT 'not-started' NOT NULL,
	"ectd_modules_completed" json,
	"ectd_document_ids" json,
	"submission_summary" json,
	"module_2_data" json,
	"module_3_data" json,
	"module_5_data" json,
	"regulatory_strategy" text,
	"compliance_score" integer DEFAULT 0,
	"deficiencies" json,
	"created_by_id" integer,
	"last_modified_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"submitted_at" timestamp,
	CONSTRAINT "ind_submissions_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "ind_template_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"organization_id" integer,
	"used_by" integer,
	"used_for_entity" text,
	"used_for_entity_id" text,
	"generated_document_id" text,
	"time_spent" integer,
	"changes_count" integer,
	"completion_score" integer,
	"user_rating" integer,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ind_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"organization_id" integer,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"region" text,
	"content" text,
	"sections" json,
	"blocks" json,
	"metadata" json,
	"validation_rules" json,
	"required_fields" json,
	"default_values" json,
	"status" text DEFAULT 'active' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"created_by_id" integer,
	"updated_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ind_templates_template_id_unique" UNIQUE("template_id")
);
--> statement-breakpoint
CREATE TABLE "integration_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp NOT NULL,
	"scope" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"entry_type" text NOT NULL,
	"source" text,
	"title" text NOT NULL,
	"content" text,
	"embedding" vector(1536),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaf_citations" (
	"id" serial PRIMARY KEY NOT NULL,
	"leaf_id" text NOT NULL,
	"fact_id" text NOT NULL,
	"block_id" text,
	"citation_type" text,
	"confidence" real,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaf_patches" (
	"id" serial PRIMARY KEY NOT NULL,
	"patch_id" text NOT NULL,
	"leaf_id" text NOT NULL,
	"blocks" json,
	"citations" json,
	"status" text DEFAULT 'pending' NOT NULL,
	"author" text,
	"description" text,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leaf_patches_patch_id_unique" UNIQUE("patch_id")
);
--> statement-breakpoint
CREATE TABLE "leaves" (
	"id" serial PRIMARY KEY NOT NULL,
	"leaf_id" text NOT NULL,
	"organization_id" integer,
	"ctd_path" text NOT NULL,
	"template_id" integer,
	"content" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"last_modified_by" text,
	CONSTRAINT "leaves_leaf_id_unique" UNIQUE("leaf_id")
);
--> statement-breakpoint
CREATE TABLE "link_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_section_id" integer NOT NULL,
	"target_section_id" integer NOT NULL,
	"link_type" varchar(50) NOT NULL,
	"strength" real DEFAULT 1,
	"bidirectional" boolean DEFAULT false,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lumen_data_atoms" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"atom_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"structured_data" json,
	"tags" text[],
	"confidence" real DEFAULT 0.5,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lumen_filing_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"source" text NOT NULL,
	"cik" text,
	"accession_no" text NOT NULL,
	"filing_date" text,
	"report_year" integer,
	"company_name" text,
	"form_type" text,
	"primary_document" text,
	"filing_url" text,
	"content" text,
	"extracted_signals" json,
	"rejection_signals" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lumen_observation_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"term" text NOT NULL,
	"term_type" text NOT NULL,
	"category" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"weight" real DEFAULT 1,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"material_code" text NOT NULL,
	"material_name" text NOT NULL,
	"material_type" text NOT NULL,
	"manufacturer_sku" text,
	"cas_number" text,
	"einecs" text,
	"molecular_formula" text,
	"molecular_weight" numeric(10, 4),
	"physical_form" text,
	"storage_conditions" text[],
	"hazard_classification" text[],
	"shelf_life_months" integer,
	"reorder_level" integer,
	"reorder_quantity" integer,
	"unit_of_measure" text NOT NULL,
	"cost_per_unit" numeric(12, 4),
	"currency" text DEFAULT 'USD',
	"regulatory_status" text DEFAULT 'approved' NOT NULL,
	"controlled_substance" boolean DEFAULT false,
	"schedule_class" text,
	"supplier_org_id" integer,
	"quality_grade" text,
	"specifications" json,
	"safety_data_sheet" json,
	"certificates" text[],
	"customs_code" text,
	"country_of_origin" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"device_name" text NOT NULL,
	"device_model" text,
	"manufacturer" text NOT NULL,
	"establishment_registration_number" text,
	"device_class" text NOT NULL,
	"device_type" text,
	"product_code" text,
	"regulation_number" text,
	"udi_device_identifier" text,
	"udi_production_identifier" text,
	"gudid_submission_status" text,
	"intended_use" text,
	"indications_for_use" text,
	"technology_type" text,
	"is_implantable" boolean DEFAULT false,
	"is_sterile" boolean DEFAULT false,
	"contains_software" boolean DEFAULT false,
	"regulatory_status" text DEFAULT 'development',
	"fda_clearance_number" text,
	"ce_mark_status" text,
	"created_by" integer NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"module_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"enabled_at" timestamp,
	"disabled_at" timestamp,
	"enabled_by" text,
	"disabled_by" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "module_subscriptions_organization_id_module_id_unique" UNIQUE("organization_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "multi_agency_validation_sessions" (
	"session_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" integer NOT NULL,
	"document_id" text NOT NULL,
	"document_version_id" text,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"agencies" text[],
	"content" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"validation_started_at" timestamp DEFAULT now() NOT NULL,
	"validation_completed_at" timestamp,
	"total_issues_found" integer DEFAULT 0,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email_mentions" boolean DEFAULT true,
	"email_shares" boolean DEFAULT true,
	"email_approvals" boolean DEFAULT true,
	"email_compliance" boolean DEFAULT true,
	"email_system" boolean DEFAULT true,
	"email_digest" text DEFAULT 'daily',
	"in_app_mentions" boolean DEFAULT true,
	"in_app_shares" boolean DEFAULT true,
	"in_app_approvals" boolean DEFAULT true,
	"in_app_compliance" boolean DEFAULT true,
	"in_app_system" boolean DEFAULT true,
	"toast_enabled" boolean DEFAULT true,
	"toast_duration" integer DEFAULT 5000,
	"toast_position" text DEFAULT 'top-right',
	"quiet_hours_enabled" boolean DEFAULT false,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"timezone" text DEFAULT 'UTC',
	"auto_follow_on_interaction" boolean DEFAULT true,
	"sound_enabled" boolean DEFAULT false,
	"metadata" json,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"priority" text DEFAULT 'normal',
	"title" text NOT NULL,
	"message" text NOT NULL,
	"icon" text,
	"action_url" text,
	"activity_id" text,
	"is_read" boolean DEFAULT false,
	"read_at" timestamp,
	"is_dismissed" boolean DEFAULT false,
	"dismissed_at" timestamp,
	"email_sent" boolean DEFAULT false,
	"email_sent_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "notifications_notification_id_unique" UNIQUE("notification_id")
);
--> statement-breakpoint
CREATE TABLE "obligation_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"obligation_id" integer NOT NULL,
	"update_type" text NOT NULL,
	"previous_status" text,
	"new_status" text,
	"progress_percentage" integer DEFAULT 0,
	"description" text NOT NULL,
	"impact_assessment" text,
	"attachments" json,
	"agency_response" text,
	"next_action" text,
	"action_due_date" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"permissions" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_org" UNIQUE("user_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text,
	"logo" text,
	"industry_mode" text,
	"stripe_customer_id" text,
	"settings" json,
	"api_key" text,
	"tier" text DEFAULT 'standard' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"max_users" integer DEFAULT 5,
	"max_projects" integer DEFAULT 10,
	"max_storage" integer DEFAULT 5,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "patches" (
	"id" serial PRIMARY KEY NOT NULL,
	"leaf_id" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"author_id" integer NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"diff_ops" json,
	"snapshot" text,
	"reason" text,
	"change_type" varchar(50),
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pkpd_compartments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"model_type" text NOT NULL,
	"species" text NOT NULL,
	"central_volume" real,
	"peripheral_volume1" real,
	"peripheral_volume2" real,
	"clearance_central" real,
	"intercompartmental_clearance1" real,
	"intercompartmental_clearance2" real,
	"absorption_rate" real,
	"elimination_rate" real,
	"distribution_rate" real,
	"model_parameters" json,
	"covariate_effects" json,
	"population_variability" json,
	"residual_error" json,
	"goodness_of_fit" json,
	"diagnostic_plots" json,
	"validation_results" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pm_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"ai_settings" json,
	"workflow_settings" json,
	"notification_settings" json,
	"compliance_settings" json,
	"therapeutic_area_settings" json,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	CONSTRAINT "unique_pm_settings_org" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "pma_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"device_id" integer NOT NULL,
	"pma_number" text,
	"supplement_number" text,
	"submission_type" text NOT NULL,
	"clinical_trial_ids" text[],
	"pivotal_study_summary" text,
	"clinical_data_overview" json,
	"adverse_events_analysis" json,
	"manufacturing_site_addresses" json,
	"quality_system_regulation" json,
	"device_master_record" text,
	"risk_analysis_method" text,
	"risk_mitigation_measures" json,
	"residual_risk_assessment" json,
	"advisory_committee_required" boolean DEFAULT false,
	"advisory_committee_meeting" date,
	"advisory_committee_recommendation" text,
	"submission_status" text DEFAULT 'draft',
	"fda_filing_date" date,
	"fda_approval_date" date,
	"conditions_of_approval" json,
	"post_approval_studies" json,
	"annual_reports_due" json,
	"electronic_signatures" json,
	"audit_trail" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pma_submissions_pma_number_unique" UNIQUE("pma_number")
);
--> statement-breakpoint
CREATE TABLE "post_approval_commitments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"submission_id" integer,
	"commitment_number" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" varchar(50) NOT NULL,
	"agency_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"priority" varchar(20) DEFAULT 'medium',
	"due_date" date,
	"reminder_date" date,
	"submission_date" date,
	"approval_date" date,
	"assigned_to" text,
	"progress_report" text,
	"deliverables" json,
	"milestones" json,
	"escalation_rules" json,
	"notification_settings" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "process_validation" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"process_name" text NOT NULL,
	"stage" text NOT NULL,
	"batch_numbers" text[],
	"critical_process_parameters" json,
	"critical_quality_attributes" json,
	"control_strategy" json,
	"validation_protocol" text,
	"validation_report" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"lead_validator" integer,
	"approved_by" integer,
	"approval_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer,
	"activity_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"description" text NOT NULL,
	"details" json,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"vault_document_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"category" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0',
	"file_path" text,
	"file_size" integer,
	"mime_type" text,
	"checksum" text,
	"uploaded_by_id" integer,
	"meta_data" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_date" timestamp NOT NULL,
	"completed_at" timestamp,
	"completed_by_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"notify_days" integer DEFAULT 7,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"module_type" text NOT NULL,
	"module_instance_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"settings" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_project_module" UNIQUE("project_id","module_type","module_instance_id")
);
--> statement-breakpoint
CREATE TABLE "project_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"success_probability" numeric(3, 2),
	"confidence_level" numeric(3, 2),
	"risk_level" text,
	"detected_risks" json,
	"recommendations" json,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"scope" text DEFAULT 'global' NOT NULL,
	"scope_project_id" integer,
	"scope_template_id" integer,
	"trigger_event" text NOT NULL,
	"conditions" json,
	"actions" json,
	"priority" integer DEFAULT 50,
	"is_active" boolean DEFAULT true,
	"cooldown_minutes" integer DEFAULT 0,
	"max_executions" integer,
	"execution_count" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"failure_count" integer DEFAULT 0,
	"last_executed_at" timestamp,
	"last_result" json,
	"is_built_in" boolean DEFAULT false,
	"tags" text[],
	"metadata" json,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_rules_rule_id_unique" UNIQUE("rule_id")
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"workflow_stage_id" integer,
	"parent_task_id" integer,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"module_type" text,
	"module_icon" text,
	"module_color" text,
	"assignee_id" integer,
	"reviewer_id" integer,
	"estimated_hours" integer,
	"actual_hours" integer,
	"start_date" timestamp,
	"due_date" timestamp,
	"completed_at" timestamp,
	"completed_by_id" integer,
	"blocked_reason" text,
	"critical_to_quality" boolean DEFAULT false,
	"quality_metrics" json,
	"depends_on" text[],
	"linked_tasks" json,
	"settings" json,
	"metadata" json,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"project_type" text NOT NULL,
	"module_types" text[],
	"industry_focus" text[],
	"version" text DEFAULT '1.0.0',
	"status" text DEFAULT 'active' NOT NULL,
	"workflow_stages" json,
	"tasks" json,
	"critical_to_quality_factors" json,
	"regulatory_framework" text[],
	"settings" json,
	"metadata" json,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_workflow_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"due_date" timestamp,
	"critical_to_quality_factors" json,
	"completion_criteria" json,
	"auto_advance" boolean DEFAULT false,
	"assignees" text[],
	"reviewers" text[],
	"approval_status" text DEFAULT 'not-started',
	"settings" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"parent_project_id" integer,
	"depth" integer DEFAULT 0 NOT NULL,
	"path" text,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"type" text NOT NULL,
	"start_date" timestamp,
	"target_end_date" timestamp,
	"actual_end_date" timestamp,
	"progress" integer DEFAULT 0,
	"budget" integer,
	"budget_currency" text DEFAULT 'USD',
	"budget_status" text DEFAULT 'within-budget',
	"created_by_id" integer,
	"owner_id" integer,
	"sponsors" text[],
	"tags" text[],
	"critical_to_quality_factors" json,
	"risk_level" text DEFAULT 'medium',
	"risk_assessment" json,
	"quality_targets" json,
	"module_references" json,
	"settings" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"organization_id" integer,
	"workflow_run_id" text,
	"event_type" text NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"details" json NOT NULL,
	"previous_hash" text,
	"hash_chain" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"timestamp_source" text DEFAULT 'server' NOT NULL,
	"immutable" boolean DEFAULT true NOT NULL,
	CONSTRAINT "proof_audit_logs_entry_id_unique" UNIQUE("entry_id")
);
--> statement-breakpoint
CREATE TABLE "protocols" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"title" text NOT NULL,
	"indication" text,
	"phase" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text,
	"content" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_testing" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"sample_id" text NOT NULL,
	"sample_type" text NOT NULL,
	"test_method" text NOT NULL,
	"test_results" json,
	"specifications" json,
	"pass_fail_status" text,
	"certificate_of_analysis" text,
	"analyst" integer,
	"reviewed_by" integer,
	"test_date" timestamp NOT NULL,
	"release_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qmp_audit_trail" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"qmp_id" integer NOT NULL,
	"user_id" integer,
	"action_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"description" text NOT NULL,
	"previous_state" json,
	"new_state" json,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qmp_section_gating" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"qmp_id" integer NOT NULL,
	"section_key" text NOT NULL,
	"section_name" text NOT NULL,
	"required_ctq_factor_ids" json NOT NULL,
	"minimum_mandatory_completion" integer DEFAULT 100,
	"minimum_recommended_completion" integer DEFAULT 80,
	"allow_override" boolean DEFAULT false,
	"override_requires_approval" boolean DEFAULT true,
	"override_requires_reason" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qmp_traceability_matrix" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"qmp_id" integer NOT NULL,
	"ctq_factor_id" integer,
	"requirement_id" text NOT NULL,
	"requirement_text" text NOT NULL,
	"requirement_source" text,
	"verification_method" text,
	"implementation_evidence" json,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verified_by_id" integer,
	"verified_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_management_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"name" text NOT NULL,
	"description" text,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by_id" integer,
	"approved_at" timestamp,
	"effective_date" timestamp,
	"expiry_date" timestamp,
	"review_frequency_days" integer DEFAULT 365,
	"last_review_date" timestamp,
	"next_review_date" timestamp,
	"review_reminder_days" integer DEFAULT 30,
	"created_by_id" integer,
	"settings" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text,
	"page_number" integer,
	"section_title" text,
	"subsection_title" text,
	"paragraph_index" integer,
	"start_offset" integer,
	"end_offset" integer,
	"embedding" vector(1536),
	"embedding_model" text DEFAULT 'text-embedding-3-small',
	"token_count" integer,
	"character_count" integer,
	"chunk_type" text,
	"language" text DEFAULT 'en',
	"entities" json,
	"keywords" json,
	"concepts" json,
	"references" json,
	"search_vector" text,
	"relevance_score" real,
	"access_count" integer DEFAULT 0,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp,
	CONSTRAINT "rag_chunks_chunk_id_unique" UNIQUE("chunk_id")
);
--> statement-breakpoint
CREATE TABLE "rag_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" integer NOT NULL,
	"document_id" text NOT NULL,
	"title" text NOT NULL,
	"document_type" text NOT NULL,
	"source" text,
	"source_url" text,
	"file_hash" text,
	"file_name" text,
	"file_size" integer,
	"mime_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"processing_status" json,
	"language" text DEFAULT 'en',
	"page_count" integer,
	"word_count" integer,
	"chunk_count" integer,
	"therapeutic_area" text,
	"indication" text,
	"phase" text,
	"compound" text,
	"sponsor" text,
	"regulatory_agency" text,
	"document_date" date,
	"embed_model" text DEFAULT 'text-embedding-3-small',
	"embedding_dimensions" integer DEFAULT 1536,
	"average_embedding" json,
	"confidential" boolean DEFAULT false,
	"access_level" text DEFAULT 'organization',
	"allowed_users" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"indexed_at" timestamp,
	"last_accessed_at" timestamp,
	CONSTRAINT "rag_documents_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "rag_ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" integer NOT NULL,
	"job_id" text NOT NULL,
	"job_type" text NOT NULL,
	"source" text,
	"source_id" uuid,
	"document_url" text,
	"document_title" text,
	"document_type" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 5,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"started_at" timestamp,
	"completed_at" timestamp,
	"failed_at" timestamp,
	"processing_time" real,
	"document_id" uuid,
	"chunks_processed" integer,
	"entities_extracted" integer,
	"error" text,
	"error_details" json,
	"progress" integer DEFAULT 0,
	"progress_message" text,
	"stages" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rag_ingestion_jobs_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "rag_knowledge_graph" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" integer NOT NULL,
	"entity_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_name" text NOT NULL,
	"entity_aliases" json,
	"relationship_type" text,
	"related_entity_id" text,
	"related_entity_type" text,
	"related_entity_name" text,
	"confidence" real DEFAULT 1,
	"evidence" json,
	"strength" real,
	"direction" text,
	"source_document_ids" json,
	"source_chunk_ids" json,
	"mechanism" text,
	"therapeutic_class" text,
	"molecular_weight" real,
	"chemical_formula" text,
	"uniprot_id" text,
	"pubchem_id" text,
	"drugbank_id" text,
	"centrality" real,
	"clustering" real,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer,
	"query_id" text NOT NULL,
	"query" text NOT NULL,
	"enhanced_query" text,
	"query_type" text,
	"query_vector" json,
	"search_mode" text DEFAULT 'hybrid',
	"top_k" integer DEFAULT 10,
	"min_score" real,
	"filters" json,
	"results_count" integer,
	"results" json,
	"response_time" real,
	"precision" real,
	"recall" real,
	"relevance_feedback" json,
	"session_id" text,
	"conversation_id" text,
	"follow_up" boolean DEFAULT false,
	"parent_query_id" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rag_queries_query_id_unique" UNIQUE("query_id")
);
--> statement-breakpoint
CREATE TABLE "rag_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" integer NOT NULL,
	"source_name" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text NOT NULL,
	"document_type" text,
	"is_active" boolean DEFAULT true,
	"crawl_frequency" text,
	"last_crawled_at" timestamp,
	"next_crawl_at" timestamp,
	"documents_ingested" integer DEFAULT 0,
	"last_document_date" date,
	"failure_count" integer DEFAULT 0,
	"crawl_config" json,
	"authentication" json,
	"rate_limit" integer DEFAULT 10,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recent_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"template_id" integer,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"file_url" text,
	"last_edited_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"correspondence_id" integer,
	"file_name" text NOT NULL,
	"file_type" varchar(50),
	"file_size" integer,
	"file_path" text,
	"uploaded_by" text,
	"extracted_text" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"correspondence_id" integer,
	"question_id" integer,
	"message_type" varchar(50) NOT NULL,
	"message_text" text NOT NULL,
	"sender" text,
	"sender_type" varchar(20) DEFAULT 'internal',
	"attachments" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_obligation_events" (
	"evt_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obl_id" uuid NOT NULL,
	"event" text NOT NULL,
	"by_user" text,
	"payload_json" json DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_obligation_templates" (
	"tpl_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region" text,
	"title" text NOT NULL,
	"default_severity" text DEFAULT 'MAJOR' NOT NULL,
	"default_recurrence" json DEFAULT '{}' NOT NULL,
	"default_links" json DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_obligations" (
	"obl_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_id" uuid NOT NULL,
	"product_id" text NOT NULL,
	"region" text,
	"title" text NOT NULL,
	"source" text DEFAULT 'AGENCY' NOT NULL,
	"severity" text DEFAULT 'MAJOR' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"due_date" timestamp,
	"recurrence" json DEFAULT '{}' NOT NULL,
	"owner_user_id" uuid,
	"priority" text DEFAULT 'High' NOT NULL,
	"evidence" json DEFAULT '[]' NOT NULL,
	"links" json DEFAULT '[]' NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "reg_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"correspondence_id" integer,
	"attachment_id" integer,
	"question_text" text NOT NULL,
	"section_reference" text,
	"priority" varchar(20) DEFAULT 'medium',
	"severity" varchar(20) DEFAULT 'MAJOR',
	"status" varchar(50) DEFAULT 'pending',
	"region" text,
	"due_date" date,
	"assigned_to" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reg_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"response_text" text NOT NULL,
	"evidence_used" json,
	"version" integer DEFAULT 1,
	"status" varchar(50) DEFAULT 'draft',
	"drafted_by" text,
	"reviewed_by" text,
	"approved_by" text,
	"submitted_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_agencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"agency_code" varchar(10) NOT NULL,
	"agency_name" text NOT NULL,
	"region" varchar(50) NOT NULL,
	"country" varchar(100),
	"contact_info" json,
	"requirements" json,
	"is_active" boolean DEFAULT true,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"audit_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"submission_id" text,
	"action" text NOT NULL,
	"action_category" text NOT NULL,
	"previous_value" json,
	"new_value" json,
	"change_reason" text,
	"user_id" integer NOT NULL,
	"user_name" text NOT NULL,
	"user_role" text,
	"ip_address" text NOT NULL,
	"user_agent" text,
	"session_id" text,
	"is_gxp_relevant" boolean DEFAULT false,
	"requires_justification" boolean DEFAULT false,
	"justification" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"metadata" json,
	CONSTRAINT "regulatory_audit_logs_audit_id_unique" UNIQUE("audit_id")
);
--> statement-breakpoint
CREATE TABLE "regulatory_calendar" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"event_id" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"event_type" varchar(50) NOT NULL,
	"event_date" timestamp NOT NULL,
	"end_date" timestamp,
	"all_day" boolean DEFAULT false,
	"agency_id" integer,
	"submission_id" integer,
	"commitment_id" integer,
	"priority" varchar(20) DEFAULT 'medium',
	"status" varchar(50) DEFAULT 'scheduled',
	"location" text,
	"attendees" json,
	"reminders" json,
	"recurrence" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_change_control" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"change_control_number" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"change_type" varchar(50) NOT NULL,
	"affected_products" json,
	"affected_agencies" json,
	"risk_category" varchar(20) DEFAULT 'medium',
	"regulatory_impact" text,
	"notification_required" boolean DEFAULT false,
	"submission_type" varchar(50),
	"impact_assessment" text,
	"implementation" json,
	"agency_notifications" json,
	"status" varchar(50) DEFAULT 'draft',
	"initiated_by" text,
	"approved_by" text,
	"implementation_date" date,
	"due_date" date,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"document_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0',
	"created_by_id" integer,
	"last_modified_by_id" integer,
	"file_path" text,
	"metadata" json,
	"compliance_metrics" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_intelligence" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"intel_id" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text,
	"type" varchar(50) NOT NULL,
	"agency_id" integer,
	"effective_date" date,
	"published_date" date,
	"source" text,
	"url" text,
	"impact_level" varchar(20) DEFAULT 'medium',
	"applicable_products" json,
	"impact_assessment" text,
	"action_required" boolean DEFAULT false,
	"action_items" json,
	"status" varchar(50) DEFAULT 'active',
	"tags" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_obligations" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"submission_id" text,
	"obligation_type" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"agency" text NOT NULL,
	"agency_division" text,
	"regulatory_pathway" text,
	"due_date" timestamp,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" integer,
	"source_document" text,
	"source_reference" text,
	"legal_basis" text,
	"consequence_of_non_compliance" text,
	"compliance_evidence" json,
	"agency_correspondence" json,
	"milestones" json,
	"dependencies" json,
	"risk_assessment" json,
	"business_impact" text,
	"estimated_cost" numeric,
	"actual_cost" numeric,
	"completion_date" timestamp,
	"verification_method" text,
	"verification_evidence" text,
	"review_cycle" text,
	"next_review_date" timestamp,
	"tags" json,
	"attachments" json,
	"notes" text,
	"created_by" integer NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"submission_type" text NOT NULL,
	"drug_name" text NOT NULL,
	"indication" text NOT NULL,
	"sponsor" text NOT NULL,
	"target_market" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"current_gate" text DEFAULT 'initiation' NOT NULL,
	"progress_percentage" integer DEFAULT 0,
	"target_submission_date" timestamp NOT NULL,
	"actual_submission_date" timestamp,
	"regulatory_deadline" timestamp,
	"compliance_score" integer DEFAULT 0,
	"risk_level" text DEFAULT 'medium',
	"priority_level" text DEFAULT 'normal',
	"lead_regulatory" integer,
	"lead_qa" integer,
	"lead_clinical" integer,
	"team_members" json,
	"metadata" json,
	"created_by_id" integer,
	"last_modified_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "regulatory_submissions_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "regulatory_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"task_type" text NOT NULL,
	"category" text,
	"assigned_to" integer,
	"assigned_by" integer,
	"assigned_at" timestamp,
	"team_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"estimated_hours" real,
	"actual_hours" real,
	"progress_percentage" integer DEFAULT 0,
	"due_date" timestamp NOT NULL,
	"start_date" timestamp,
	"completed_at" timestamp,
	"stage_gate" text,
	"is_gatekeeper" boolean DEFAULT false,
	"document_ids" json,
	"deliverables" json,
	"ai_priority_score" real,
	"automation_status" text,
	"metadata" json,
	"created_by_id" integer,
	"last_modified_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "regulatory_tasks_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "replacement_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_type" varchar(20) NOT NULL,
	"source_udis" json NOT NULL,
	"target_udis" json NOT NULL,
	"sequence_references" json,
	"applied_at" timestamp,
	"created_by" text NOT NULL,
	"organization_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "report_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"section" text,
	"details" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"report_type" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer,
	"query_hash" varchar(64) NOT NULL,
	"query_text" text NOT NULL,
	"response_text" text NOT NULL,
	"confidence" numeric(3, 2),
	"metadata" json,
	"hit_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_accessed" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_detections" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"risk_factor_id" integer,
	"severity" numeric(3, 2),
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"mitigation_applied" text,
	"resolved_at" timestamp,
	"details" json
);
--> statement-breakpoint
CREATE TABLE "risk_factors" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"description" text,
	"default_severity" numeric(3, 2),
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_execution_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer,
	"trigger_event" text NOT NULL,
	"trigger_context" json,
	"conditions_matched" boolean DEFAULT false,
	"actions_executed" json,
	"success" boolean DEFAULT false,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rule_execution_log_execution_id_unique" UNIQUE("execution_id")
);
--> statement-breakpoint
CREATE TABLE "section_graph_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"canonical" boolean DEFAULT false NOT NULL,
	"ich_reference" text,
	"region_scope" text,
	"description" text,
	"section_type" varchar(50),
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "section_graph_nodes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "section_leaves" (
	"id" serial PRIMARY KEY NOT NULL,
	"latest_patch_id" integer,
	"value_html" text,
	"value_text" text,
	"structured_json" json,
	"checksum" text,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"last_modified_by" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"leaf_id" text NOT NULL,
	"section_id" text NOT NULL,
	"organization_id" integer,
	"project_id" integer,
	"block_range" json,
	"link_type" text DEFAULT 'reference',
	"is_active" boolean DEFAULT true,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_patches" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"leaf_id" text,
	"patch" json NOT NULL,
	"author" json,
	"version" integer NOT NULL,
	"conflicts_with" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_propagations" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"patch_id" integer,
	"target_leaf_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal',
	"retry_count" integer DEFAULT 0,
	"last_error" text,
	"scheduled_at" timestamp DEFAULT now() NOT NULL,
	"executed_at" timestamp,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"organization_id" integer,
	"project_id" integer,
	"title" text,
	"content" text,
	"content_hash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"last_modified_by" text,
	CONSTRAINT "sections_section_id_unique" UNIQUE("section_id")
);
--> statement-breakpoint
CREATE TABLE "sentinel_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"finding_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer,
	"analyzer_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"details" json,
	"recommendations" json,
	"affected_items" json,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp,
	"resolved_by_id" integer,
	"ai_request_id" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sentinel_findings_finding_id_unique" UNIQUE("finding_id")
);
--> statement-breakpoint
CREATE TABLE "sharepoint_integration" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"granule_id" integer NOT NULL,
	"sharepoint_site_id" text NOT NULL,
	"sharepoint_document_id" text NOT NULL,
	"sharepoint_url" text NOT NULL,
	"sharepoint_path" text,
	"sharepoint_version" text,
	"sync_status" text DEFAULT 'synced' NOT NULL,
	"last_sync_at" timestamp,
	"sync_direction" text,
	"lock_status" text,
	"locked_by" text,
	"locked_at" timestamp,
	"conflict_resolution" json,
	"access_permissions" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sharepoint_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"file_id" integer,
	"action" text NOT NULL,
	"details" json,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"signature" text
);
--> statement-breakpoint
CREATE TABLE "sharepoint_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"parent_comment_id" integer,
	"content" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"is_resolved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sharepoint_file_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"version_number" text NOT NULL,
	"size" integer,
	"storage_url" text NOT NULL,
	"checksum" text NOT NULL,
	"change_comment" text,
	"is_major_version" boolean DEFAULT false,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sharepoint_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"parent_id" integer,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"mime_type" text,
	"size" integer,
	"path" text NOT NULL,
	"storage_url" text,
	"checksum" text,
	"status" text DEFAULT 'active' NOT NULL,
	"locked_by" integer,
	"locked_at" timestamp,
	"tags" text[],
	"metadata" json,
	"permissions" json,
	"created_by" text NOT NULL,
	"modified_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"modified_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sharepoint_locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"lock_type" text NOT NULL,
	"lock_reason" text,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "sharepoint_locks_file_id_unique" UNIQUE("file_id")
);
--> statement-breakpoint
CREATE TABLE "sharepoint_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"shared_with" text NOT NULL,
	"permission" text NOT NULL,
	"share_type" text NOT NULL,
	"expires_at" timestamp,
	"share_link" text,
	"password" text,
	"access_count" integer DEFAULT 0,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sharepoint_shares_share_link_unique" UNIQUE("share_link")
);
--> statement-breakpoint
CREATE TABLE "simple_document_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"version_number" text NOT NULL,
	"content" text NOT NULL,
	"change_description" text,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simple_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"folder_id" integer,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" text DEFAULT '1.0.0',
	"file_name" text,
	"file_type" text,
	"file_size" integer,
	"file_path" text,
	"content" json,
	"metadata" json,
	"tags" text[],
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "species_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"species" text NOT NULL,
	"body_weight" real NOT NULL,
	"dose_administered" numeric(10, 4) NOT NULL,
	"dose_unit" text NOT NULL,
	"route" text NOT NULL,
	"cmax" numeric(12, 4),
	"tmax" real,
	"auc0_inf" numeric(12, 4),
	"auc0_last" numeric(12, 4),
	"t12" real,
	"clearance" real,
	"volume_distribution" real,
	"bioavailability" real,
	"protein_binding" real,
	"metabolites" json,
	"tissue_distribution" json,
	"toxicology_findings" json,
	"efficacy_endpoints" json,
	"data_source" text,
	"study_references" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stability_studies" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"study_title" text,
	"product_name" text NOT NULL,
	"batch_number" text NOT NULL,
	"dosage_form" text DEFAULT 'Tablet' NOT NULL,
	"strength" text,
	"scope" text DEFAULT 'DP' NOT NULL,
	"climatic_zone" text DEFAULT 'II' NOT NULL,
	"study_type" text DEFAULT 'long-term' NOT NULL,
	"storage_conditions" text[] NOT NULL,
	"duration" integer DEFAULT 24 NOT NULL,
	"test_parameters" text[] NOT NULL,
	"testing_schedule" json,
	"time_points" text[],
	"stability_data" json,
	"notes" text,
	"shelf_life" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"start_date" timestamp NOT NULL,
	"planned_end_date" timestamp,
	"study_director" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(50) NOT NULL,
	"permissions" json,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" integer,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_gates" (
	"id" serial PRIMARY KEY NOT NULL,
	"gate_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"gate_name" text NOT NULL,
	"gate_order" integer NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"completion_percentage" integer DEFAULT 0,
	"required_tasks" json,
	"required_documents" json,
	"required_approvals" json,
	"exit_criteria" json,
	"planned_date" timestamp,
	"actual_start_date" timestamp,
	"actual_completion_date" timestamp,
	"qa_approved" boolean DEFAULT false,
	"regulatory_approved" boolean DEFAULT false,
	"clinical_approved" boolean DEFAULT false,
	"final_approved" boolean DEFAULT false,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stage_gates_gate_id_unique" UNIQUE("gate_id")
);
--> statement-breakpoint
CREATE TABLE "strategic_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"report_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" json,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "strategic_reports_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "structured_observation_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"term_code" text NOT NULL,
	"name" text NOT NULL,
	"definition" text,
	"category" text,
	"subcategory" text,
	"terminology" text,
	"status" text DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"batch_number" varchar(100) NOT NULL,
	"lot_number" varchar(100),
	"material_id" integer NOT NULL,
	"batch_status" varchar(50) DEFAULT 'in_process' NOT NULL,
	"manufacturing_status" varchar(50) DEFAULT 'planned',
	"manufacturing_date" date,
	"expiry_date" date,
	"retest_date" date,
	"manufacturing_site_id" integer,
	"batch_size" numeric(12, 3),
	"batch_size_unit" varchar(20) DEFAULT 'kg',
	"yield" numeric(5, 2),
	"qc_status" varchar(50) DEFAULT 'pending',
	"qc_testing_date" date,
	"qc_approval_date" date,
	"qc_approved_by" text,
	"coa_number" varchar(100),
	"test_results" json,
	"release_status" varchar(50) DEFAULT 'not_released',
	"qp_release_date" date,
	"qp_released_by" text,
	"release_notes" text,
	"parent_batch_ids" json,
	"bom_version" varchar(20),
	"process_version" varchar(20),
	"current_location" text,
	"storage_conditions" text,
	"distribution_status" varchar(50) DEFAULT 'in_stock',
	"batch_record" text,
	"deviations" json,
	"investigations" json,
	"notes" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_coas" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"coa_number" varchar(100) NOT NULL,
	"batch_id" integer NOT NULL,
	"material_id" integer NOT NULL,
	"coa_version" varchar(20) DEFAULT '1.0',
	"coa_status" varchar(50) DEFAULT 'draft' NOT NULL,
	"issued_date" date,
	"effective_date" date,
	"expiry_date" date,
	"testing_laboratory" text,
	"testing_start_date" date,
	"testing_end_date" date,
	"analyst_name" text,
	"specification_version" varchar(20),
	"test_results" json,
	"overall_result" varchar(20) DEFAULT 'pending',
	"out_of_specifications" json,
	"reviewed_by" text,
	"reviewed_date" date,
	"approved_by" text,
	"approved_date" date,
	"digital_signature" text,
	"signature_timestamp" timestamp,
	"audit_trail" json,
	"notes" text,
	"attachments" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"material_code" varchar(100) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"material_type" varchar(50) NOT NULL,
	"material_category" varchar(50),
	"cas_number" varchar(50),
	"molecular_formula" text,
	"molecular_weight" numeric(10, 4),
	"regulatory_status" varchar(50) DEFAULT 'approved',
	"dme_file_number" text,
	"cep_number" text,
	"storage_conditions" text,
	"handling_instructions" text,
	"shelf_life" integer,
	"reorder_point" numeric(10, 3),
	"primary_supplier_id" integer,
	"approved_suppliers" json,
	"quality_grade" varchar(50),
	"specification_version" varchar(20) DEFAULT '1.0',
	"specifications" json,
	"batch_size" numeric(12, 3),
	"batch_size_unit" varchar(20) DEFAULT 'kg',
	"is_controlled" boolean DEFAULT false,
	"is_hazardous" boolean DEFAULT false,
	"notes" text,
	"metadata" json,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_organizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"organization_type" text NOT NULL,
	"regulatory_class" text NOT NULL,
	"duns" text,
	"registration_number" text,
	"address" json NOT NULL,
	"contact_info" json NOT NULL,
	"qualification_status" text DEFAULT 'pending' NOT NULL,
	"qualification_date" timestamp,
	"qualified_by" integer,
	"audit_date" timestamp,
	"audit_score" integer,
	"certifications" text[],
	"capabilities" text[],
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"shipment_number" varchar(100) NOT NULL,
	"shipment_type" varchar(50) NOT NULL,
	"shipment_status" varchar(50) DEFAULT 'planned' NOT NULL,
	"origin_supplier_id" integer,
	"destination_supplier_id" integer,
	"origin_address" text,
	"destination_address" text,
	"carrier_id" integer,
	"tracking_number" varchar(100),
	"carrier_service" text,
	"transport_mode" varchar(50),
	"planned_ship_date" timestamp,
	"actual_ship_date" timestamp,
	"planned_delivery_date" timestamp,
	"actual_delivery_date" timestamp,
	"temperature_min" numeric(5, 2),
	"temperature_max" numeric(5, 2),
	"humidity_min" numeric(5, 2),
	"humidity_max" numeric(5, 2),
	"temperature_monitoring_device" text,
	"device_calibration_date" date,
	"temperature_excursions" json,
	"cold_chain_intact" boolean DEFAULT true,
	"gdp_compliance" boolean DEFAULT true,
	"qualified_person" text,
	"packing_list" json,
	"shipping_documents" json,
	"customs_clearance" json,
	"notes" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"supplier_code" varchar(50) NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"supplier_type" varchar(50) NOT NULL,
	"qualification_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"risk_level" varchar(20) DEFAULT 'medium' NOT NULL,
	"qualification_date" date,
	"next_audit_date" date,
	"last_audit_date" date,
	"audit_score" numeric(5, 2),
	"primary_contact" text,
	"contact_email" text,
	"contact_phone" text,
	"address" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text,
	"regulatory_licenses" json,
	"certifications" json,
	"inspection_history" json,
	"deviation_history" json,
	"contract_status" varchar(50) DEFAULT 'active',
	"contract_expiry" date,
	"payment_terms" text,
	"delivery_terms" text,
	"quality_score" numeric(5, 2),
	"delivery_performance" numeric(5, 2),
	"notes" text,
	"metadata" json,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_chain_temperature_readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer NOT NULL,
	"shipment_id" integer NOT NULL,
	"device_id" text NOT NULL,
	"reading_time" timestamp NOT NULL,
	"temperature" numeric(5, 2) NOT NULL,
	"humidity" numeric(5, 2),
	"location" text,
	"battery_level" integer,
	"data_quality" varchar(20) DEFAULT 'good',
	"calibration_status" varchar(20) DEFAULT 'valid',
	"is_excursion" boolean DEFAULT false,
	"excursion_type" varchar(20),
	"raw_data" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"status" varchar(50) NOT NULL,
	"last_error" text,
	"last_propagation_timestamp" timestamp,
	"sync_direction" varchar(20),
	"retry_count" integer DEFAULT 0,
	"next_retry_at" timestamp,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_automation" (
	"id" serial PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rule_type" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 50,
	"trigger_module" text,
	"trigger_event" text NOT NULL,
	"trigger_conditions" json,
	"action_type" text NOT NULL,
	"task_template" json,
	"task_defaults" json,
	"delay_minutes" integer,
	"recurring_schedule" json,
	"max_executions" integer,
	"workload_balancing" boolean DEFAULT true,
	"smart_assignment" json,
	"risk_assessment" json,
	"last_executed_at" timestamp,
	"execution_count" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"failure_count" integer DEFAULT 0,
	"tags" text[],
	"metadata" json,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_automation_automation_id_unique" UNIQUE("automation_id")
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"dependency_id" text NOT NULL,
	"predecessor_task_id" text NOT NULL,
	"successor_task_id" text NOT NULL,
	"dependency_type" text NOT NULL,
	"lag_time" integer DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"is_critical" boolean DEFAULT false,
	"is_blocking" boolean DEFAULT true,
	"impact_score" real,
	"risk_level" text,
	"cascade_effect" json,
	"validation_rules" json,
	"violation_reason" text,
	"bypass_reason" text,
	"bypassed_by" integer,
	"bypassed_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_dependency_id_unique" UNIQUE("dependency_id")
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"submission_type" text,
	"milestone" text,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"version" integer DEFAULT 1,
	"tasks" json NOT NULL,
	"dependencies" json,
	"milestones" json,
	"default_duration" integer,
	"critical_path" json,
	"best_practices" text,
	"regulatory_requirements" json,
	"risk_factors" json,
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"avg_completion_time" real,
	"success_rate" real,
	"tags" text[],
	"metadata" json,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_templates_template_id_unique" UNIQUE("template_id")
);
--> statement-breakpoint
CREATE TABLE "template_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"project_id" integer,
	"document_title" text,
	"usage_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translational_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_name" text NOT NULL,
	"pattern_type" text NOT NULL,
	"preclinical_markers" json,
	"clinical_endpoints" json,
	"success_rate" real,
	"occurrence_count" integer DEFAULT 1,
	"indication" text,
	"phase" text,
	"species" text[],
	"confidence" real DEFAULT 0.5,
	"last_observed" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"project_id" integer,
	"module_type" text NOT NULL,
	"module_icon" text,
	"module_color" text,
	"source_entity_id" text,
	"source_entity_type" text,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"task_type" text,
	"assignee_id" integer,
	"assignee_name" text,
	"assigned_by" integer,
	"assigned_at" timestamp,
	"team_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"progress" integer DEFAULT 0,
	"completion_percentage" integer DEFAULT 0,
	"start_date" timestamp,
	"due_date" timestamp,
	"completed_at" timestamp,
	"estimated_hours" real,
	"actual_hours" real,
	"linked_tasks" json,
	"dependencies" json,
	"blocked_by" text[],
	"blocks" text[],
	"module_source" text,
	"module_data" json,
	"cross_module_links" json,
	"automation_rules" json,
	"escalation_path" json,
	"approval_required" boolean DEFAULT false,
	"approvers" json,
	"approval_status" text,
	"approval_history" json,
	"impact_score" real,
	"risk_level" text,
	"critical_path" boolean DEFAULT false,
	"regulatory_impact" boolean DEFAULT false,
	"notification_settings" json,
	"automation_enabled" boolean DEFAULT true,
	"ai_suggestions" json,
	"tags" text[],
	"attachments" json,
	"comments" json,
	"metadata" json,
	"created_by_id" integer,
	"last_modified_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unified_tasks_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "user_following" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_name" text,
	"auto_followed" boolean DEFAULT false,
	"notify_on_activity" boolean DEFAULT true,
	"followed_at" timestamp DEFAULT now() NOT NULL,
	"metadata" json,
	CONSTRAINT "user_following_user_id_entity_type_entity_id_unique" UNIQUE("user_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "user_presence" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'offline',
	"status_message" text,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp DEFAULT now() NOT NULL,
	"current_document_id" text,
	"current_component_id" text,
	"current_page_url" text,
	"socket_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" json,
	CONSTRAINT "user_presence_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"title" text,
	"department" text,
	"avatar" text,
	"bio" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_login" timestamp,
	"default_organization_id" integer,
	"preferences" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "validation_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"finding_id" text NOT NULL,
	"leaf_id" text,
	"document_id" text,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"check" text NOT NULL,
	"message" text NOT NULL,
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp,
	"resolved_by" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "validation_findings_finding_id_unique" UNIQUE("finding_id")
);
--> statement-breakpoint
CREATE TABLE "validation_harmonization_opportunities" (
	"opportunity_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"agencies" text[],
	"requirement_type" text NOT NULL,
	"harmonization_potential" text NOT NULL,
	"description" text NOT NULL,
	"suggested_approach" text,
	"potential_impact" text,
	"status" text DEFAULT 'identified' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_issues" (
	"issue_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"agency" text NOT NULL,
	"issue_type" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"location" text,
	"conflicting_requirements" json,
	"suggested_fix" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"resolved_at" timestamp,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"organization_id" integer NOT NULL,
	"client_workspace_id" integer,
	"module" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"current_state" json NOT NULL,
	"completed_steps" json,
	"pending_steps" json,
	"progress_percentage" integer DEFAULT 0,
	"session_id" text,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"resume_data" json,
	"status" text DEFAULT 'active' NOT NULL,
	"completed_at" timestamp,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_progress_workflow_id_unique" UNIQUE("workflow_id")
);
--> statement-breakpoint
CREATE TABLE "vault"."document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_type" text DEFAULT 'TEXT' NOT NULL,
	"chunk_text" text NOT NULL,
	"char_start" integer,
	"char_end" integer,
	"page_number" integer,
	"section_title" text,
	"section_hierarchy" text[],
	"embedding" vector(1536),
	"embedding_model" text DEFAULT 'text-embedding-ada-002',
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vectorized_at" timestamp with time zone,
	CONSTRAINT "vault_document_chunks_document_index" UNIQUE("document_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "vault"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"document_code" text NOT NULL,
	"document_title" text NOT NULL,
	"document_type" text NOT NULL,
	"version" text DEFAULT '1.0',
	"s3_bucket" text NOT NULL,
	"s3_key" text NOT NULL,
	"s3_version_id" text,
	"storage_class" "vault"."storage_class" DEFAULT 'STANDARD' NOT NULL,
	"file_name" text NOT NULL,
	"file_size" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"content_hash" text NOT NULL,
	"classification" "vault"."document_classification" DEFAULT 'INTERNAL' NOT NULL,
	"retention_policy" text,
	"retention_until" date,
	"processing_status" "vault"."processing_status" DEFAULT 'PENDING' NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"extracted_text" text,
	"page_count" integer,
	"word_count" integer,
	"language" text DEFAULT 'en',
	"parent_document_id" uuid,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "vault_documents_program_doc_version" UNIQUE("program_id","document_code","version")
);
--> statement-breakpoint
CREATE TABLE "vault"."evidence_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"source_chunk_id" uuid,
	"claim_text" text NOT NULL,
	"evidence_document_id" uuid NOT NULL,
	"evidence_chunk_id" uuid,
	"evidence_text" text,
	"relevance_score" numeric(3, 2),
	"support_type" text,
	"citation_context" text,
	"regulatory_relevance" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"verified" boolean DEFAULT false,
	"verified_at" timestamp with time zone,
	"verified_by" uuid
);
--> statement-breakpoint
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_reactions" ADD CONSTRAINT "activity_reactions_activity_id_activity_feed_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_feed"("activity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_reactions" ADD CONSTRAINT "activity_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_communications" ADD CONSTRAINT "agency_communications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_communications" ADD CONSTRAINT "agency_communications_obligation_id_regulatory_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."regulatory_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_communications" ADD CONSTRAINT "agency_communications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_correspondence" ADD CONSTRAINT "agency_correspondence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_correspondence" ADD CONSTRAINT "agency_correspondence_submission_id_regulatory_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."regulatory_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_correspondence" ADD CONSTRAINT "agency_correspondence_agency_id_regulatory_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."regulatory_agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_validation_results" ADD CONSTRAINT "agency_validation_results_session_id_multi_agency_validation_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."multi_agency_validation_sessions"("session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytical_methods" ADD CONSTRAINT "analytical_methods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytical_methods" ADD CONSTRAINT "analytical_methods_developed_by_users_id_fk" FOREIGN KEY ("developed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytical_methods" ADD CONSTRAINT "analytical_methods_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_leaf_id_leaves_leaf_id_fk" FOREIGN KEY ("leaf_id") REFERENCES "public"."leaves"("leaf_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_genealogy" ADD CONSTRAINT "batch_genealogy_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_genealogy" ADD CONSTRAINT "batch_genealogy_child_batch_id_batches_id_fk" FOREIGN KEY ("child_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_genealogy" ADD CONSTRAINT "batch_genealogy_parent_batch_id_batches_id_fk" FOREIGN KEY ("parent_batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_genealogy" ADD CONSTRAINT "batch_genealogy_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_manufacturing_org_id_supply_chain_organizations_id_fk" FOREIGN KEY ("manufacturing_org_id") REFERENCES "public"."supply_chain_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biomarker_endpoints" ADD CONSTRAINT "biomarker_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_adam_specs" ADD CONSTRAINT "cdisc_adam_specs_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_cdash_fields" ADD CONSTRAINT "cdisc_cdash_fields_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_cdash_fields" ADD CONSTRAINT "cdisc_cdash_fields_form_id_cdisc_cdash_forms_form_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."cdisc_cdash_forms"("form_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_cdash_forms" ADD CONSTRAINT "cdisc_cdash_forms_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_cdash_sdtm_mappings" ADD CONSTRAINT "cdisc_cdash_sdtm_mappings_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_compliance_agency_prefs" ADD CONSTRAINT "cdisc_compliance_agency_prefs_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_compliance_results" ADD CONSTRAINT "cdisc_compliance_results_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_compliance_rules" ADD CONSTRAINT "cdisc_compliance_rules_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_csr_sap" ADD CONSTRAINT "cdisc_csr_sap_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_csr_sap" ADD CONSTRAINT "cdisc_csr_sap_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_csr_templates" ADD CONSTRAINT "cdisc_csr_templates_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_csr_tfl" ADD CONSTRAINT "cdisc_csr_tfl_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_device_de" ADD CONSTRAINT "cdisc_device_de_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_device_dx" ADD CONSTRAINT "cdisc_device_dx_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_device_relationships" ADD CONSTRAINT "cdisc_device_relationships_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_docs_acrf" ADD CONSTRAINT "cdisc_docs_acrf_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_docs_acrf" ADD CONSTRAINT "cdisc_docs_acrf_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_docs_define_artifacts" ADD CONSTRAINT "cdisc_docs_define_artifacts_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_docs_define_artifacts" ADD CONSTRAINT "cdisc_docs_define_artifacts_define_id_cdisc_ectd_define_xml_define_id_fk" FOREIGN KEY ("define_id") REFERENCES "public"."cdisc_ectd_define_xml"("define_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_docs_repository" ADD CONSTRAINT "cdisc_docs_repository_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ectd_datasets" ADD CONSTRAINT "cdisc_ectd_datasets_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ectd_datasets" ADD CONSTRAINT "cdisc_ectd_datasets_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ectd_define_xml" ADD CONSTRAINT "cdisc_ectd_define_xml_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ectd_define_xml" ADD CONSTRAINT "cdisc_ectd_define_xml_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ectd_reviewers_guide" ADD CONSTRAINT "cdisc_ectd_reviewers_guide_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ectd_reviewers_guide" ADD CONSTRAINT "cdisc_ectd_reviewers_guide_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ectd_sdsp" ADD CONSTRAINT "cdisc_ectd_sdsp_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ectd_sdsp" ADD CONSTRAINT "cdisc_ectd_sdsp_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ind_integration" ADD CONSTRAINT "cdisc_ind_integration_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ind_ise" ADD CONSTRAINT "cdisc_ind_ise_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ind_iss" ADD CONSTRAINT "cdisc_ind_iss_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_ind_send" ADD CONSTRAINT "cdisc_ind_send_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_pq_domains" ADD CONSTRAINT "cdisc_pq_domains_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_pq_manufacturing" ADD CONSTRAINT "cdisc_pq_manufacturing_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_pq_stability" ADD CONSTRAINT "cdisc_pq_stability_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_prm_endpoints" ADD CONSTRAINT "cdisc_prm_endpoints_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_prm_endpoints" ADD CONSTRAINT "cdisc_prm_endpoints_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_prm_epochs" ADD CONSTRAINT "cdisc_prm_epochs_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_prm_epochs" ADD CONSTRAINT "cdisc_prm_epochs_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_prm_studies" ADD CONSTRAINT "cdisc_prm_studies_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_prm_study_arms" ADD CONSTRAINT "cdisc_prm_study_arms_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_prm_study_arms" ADD CONSTRAINT "cdisc_prm_study_arms_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_prm_visits" ADD CONSTRAINT "cdisc_prm_visits_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_prm_visits" ADD CONSTRAINT "cdisc_prm_visits_study_id_cdisc_prm_studies_study_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cdisc_prm_studies"("study_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_task_deliverables" ADD CONSTRAINT "cdisc_task_deliverables_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_task_milestones" ADD CONSTRAINT "cdisc_task_milestones_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_task_validation_queue" ADD CONSTRAINT "cdisc_task_validation_queue_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdisc_task_workflows" ADD CONSTRAINT "cdisc_task_workflows_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_approvals" ADD CONSTRAINT "cer_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_approvals" ADD CONSTRAINT "cer_approvals_project_id_cer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cer_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_approvals" ADD CONSTRAINT "cer_approvals_document_id_project_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_approvals" ADD CONSTRAINT "cer_approvals_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_approvals" ADD CONSTRAINT "cer_approvals_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_approvals" ADD CONSTRAINT "cer_approvals_rejected_by_id_users_id_fk" FOREIGN KEY ("rejected_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_clinical_evidence" ADD CONSTRAINT "cer_clinical_evidence_cer_report_id_cer_reports_id_fk" FOREIGN KEY ("cer_report_id") REFERENCES "public"."cer_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_compliance_checks" ADD CONSTRAINT "cer_compliance_checks_report_id_cer_reports_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."cer_reports"("report_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_compliance_checks" ADD CONSTRAINT "cer_compliance_checks_checked_by_id_users_id_fk" FOREIGN KEY ("checked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_documents" ADD CONSTRAINT "cer_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_documents" ADD CONSTRAINT "cer_documents_cer_project_id_cer_projects_id_fk" FOREIGN KEY ("cer_project_id") REFERENCES "public"."cer_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_documents" ADD CONSTRAINT "cer_documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_documents" ADD CONSTRAINT "cer_documents_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_essential_requirements" ADD CONSTRAINT "cer_essential_requirements_cer_report_id_cer_reports_id_fk" FOREIGN KEY ("cer_report_id") REFERENCES "public"."cer_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_exports" ADD CONSTRAINT "cer_exports_report_id_cer_reports_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."cer_reports"("report_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_exports" ADD CONSTRAINT "cer_exports_exported_by_id_users_id_fk" FOREIGN KEY ("exported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_faers_data" ADD CONSTRAINT "cer_faers_data_report_id_cer_reports_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."cer_reports"("report_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_literature" ADD CONSTRAINT "cer_literature_report_id_cer_reports_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."cer_reports"("report_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_projects" ADD CONSTRAINT "cer_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_projects" ADD CONSTRAINT "cer_projects_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_projects" ADD CONSTRAINT "cer_projects_device_id_medical_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."medical_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_projects" ADD CONSTRAINT "cer_projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_projects" ADD CONSTRAINT "cer_projects_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_reports" ADD CONSTRAINT "cer_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_reports" ADD CONSTRAINT "cer_reports_cer_project_id_cer_projects_id_fk" FOREIGN KEY ("cer_project_id") REFERENCES "public"."cer_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_reports" ADD CONSTRAINT "cer_reports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_sections" ADD CONSTRAINT "cer_sections_report_id_cer_reports_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."cer_reports"("report_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_templates" ADD CONSTRAINT "cer_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_version_history" ADD CONSTRAINT "cer_version_history_cer_report_id_cer_reports_id_fk" FOREIGN KEY ("cer_report_id") REFERENCES "public"."cer_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_workflows" ADD CONSTRAINT "cer_workflows_report_id_cer_reports_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."cer_reports"("report_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cer_workflows" ADD CONSTRAINT "cer_workflows_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cerv2_510k_sections" ADD CONSTRAINT "cerv2_510k_sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cerv2_document_sessions" ADD CONSTRAINT "cerv2_document_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cerv2_section_versions" ADD CONSTRAINT "cerv2_section_versions_section_id_cerv2_510k_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."cerv2_510k_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cerv2_section_versions" ADD CONSTRAINT "cerv2_section_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access" ADD CONSTRAINT "client_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_security_settings" ADD CONSTRAINT "client_security_settings_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_security_settings" ADD CONSTRAINT "client_security_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_user_permissions" ADD CONSTRAINT "client_user_permissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_user_permissions" ADD CONSTRAINT "client_user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_user_permissions" ADD CONSTRAINT "client_user_permissions_project_id_cer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cer_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_workspace_settings" ADD CONSTRAINT "client_workspace_settings_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_workspace_settings" ADD CONSTRAINT "client_workspace_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_workspaces" ADD CONSTRAINT "client_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_workspaces" ADD CONSTRAINT "client_workspaces_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_feedback" ADD CONSTRAINT "clinical_feedback_prediction_id_foresight_predictions_id_fk" FOREIGN KEY ("prediction_id") REFERENCES "public"."foresight_predictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_feedback" ADD CONSTRAINT "clinical_feedback_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_outcomes" ADD CONSTRAINT "clinical_outcomes_biomarker_endpoint_id_biomarker_endpoints_id_fk" FOREIGN KEY ("biomarker_endpoint_id") REFERENCES "public"."biomarker_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_outcomes" ADD CONSTRAINT "clinical_outcomes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmc_change_control" ADD CONSTRAINT "cmc_change_control_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmc_change_control" ADD CONSTRAINT "cmc_change_control_initiator_users_id_fk" FOREIGN KEY ("initiator") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_annotations" ADD CONSTRAINT "coauthor_annotations_section_id_coauthor_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."coauthor_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_annotations" ADD CONSTRAINT "coauthor_annotations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_annotations" ADD CONSTRAINT "coauthor_annotations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_annotations" ADD CONSTRAINT "coauthor_annotations_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_document_versions" ADD CONSTRAINT "coauthor_document_versions_document_id_coauthor_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."coauthor_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_documents" ADD CONSTRAINT "coauthor_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_documents" ADD CONSTRAINT "coauthor_documents_ectd_module_id_ectd_modules_id_fk" FOREIGN KEY ("ectd_module_id") REFERENCES "public"."ectd_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_import_history" ADD CONSTRAINT "coauthor_import_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_import_history" ADD CONSTRAINT "coauthor_import_history_ind_submission_id_ind_submissions_submission_id_fk" FOREIGN KEY ("ind_submission_id") REFERENCES "public"."ind_submissions"("submission_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_import_history" ADD CONSTRAINT "coauthor_import_history_target_document_id_coauthor_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."coauthor_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_import_history" ADD CONSTRAINT "coauthor_import_history_imported_by_id_users_id_fk" FOREIGN KEY ("imported_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_sections" ADD CONSTRAINT "coauthor_sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_sections" ADD CONSTRAINT "coauthor_sections_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_sections" ADD CONSTRAINT "coauthor_sections_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_status_history" ADD CONSTRAINT "coauthor_status_history_document_id_coauthor_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."coauthor_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_status_history" ADD CONSTRAINT "coauthor_status_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_status_history" ADD CONSTRAINT "coauthor_status_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_validation_history" ADD CONSTRAINT "coauthor_validation_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_validation_history" ADD CONSTRAINT "coauthor_validation_history_document_id_coauthor_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."coauthor_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_validation_history" ADD CONSTRAINT "coauthor_validation_history_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coauthor_validation_rules" ADD CONSTRAINT "coauthor_validation_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_channels" ADD CONSTRAINT "communication_channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_channels" ADD CONSTRAINT "communication_channels_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_channels" ADD CONSTRAINT "communication_channels_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_channel_id_communication_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."communication_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_calendar" ADD CONSTRAINT "compliance_calendar_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_calendar" ADD CONSTRAINT "compliance_calendar_obligation_id_regulatory_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."regulatory_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_calendar" ADD CONSTRAINT "compliance_calendar_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_tracking" ADD CONSTRAINT "compliance_tracking_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_tracking" ADD CONSTRAINT "compliance_tracking_agency_id_regulatory_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."regulatory_agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_cross_references" ADD CONSTRAINT "component_cross_references_source_component_id_components_id_fk" FOREIGN KEY ("source_component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_cross_references" ADD CONSTRAINT "component_cross_references_target_component_id_components_id_fk" FOREIGN KEY ("target_component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_cross_references" ADD CONSTRAINT "component_cross_references_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_sequence_references" ADD CONSTRAINT "component_sequence_references_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_sequence_references" ADD CONSTRAINT "component_sequence_references_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_sequence_references" ADD CONSTRAINT "component_sequence_references_component_version_id_component_versions_id_fk" FOREIGN KEY ("component_version_id") REFERENCES "public"."component_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_sequence_references" ADD CONSTRAINT "component_sequence_references_document_id_coauthor_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."coauthor_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_versions" ADD CONSTRAINT "component_versions_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_versions" ADD CONSTRAINT "component_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_versions" ADD CONSTRAINT "component_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_versions" ADD CONSTRAINT "component_versions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_artifact_versions" ADD CONSTRAINT "concept2cure_artifact_versions_artifact_id_concept2cure_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."concept2cure_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_artifact_versions" ADD CONSTRAINT "concept2cure_artifact_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_artifact_versions" ADD CONSTRAINT "concept2cure_artifact_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_artifacts" ADD CONSTRAINT "concept2cure_artifacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_artifacts" ADD CONSTRAINT "concept2cure_artifacts_conversation_id_concept2cure_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."concept2cure_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_artifacts" ADD CONSTRAINT "concept2cure_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_artifacts" ADD CONSTRAINT "concept2cure_artifacts_locked_by_id_users_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_artifacts" ADD CONSTRAINT "concept2cure_artifacts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_conversations" ADD CONSTRAINT "concept2cure_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_conversations" ADD CONSTRAINT "concept2cure_conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_conversations" ADD CONSTRAINT "concept2cure_conversations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_messages" ADD CONSTRAINT "concept2cure_messages_conversation_id_concept2cure_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."concept2cure_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_messages" ADD CONSTRAINT "concept2cure_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_provenance_events" ADD CONSTRAINT "concept2cure_provenance_events_artifact_id_concept2cure_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."concept2cure_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_provenance_events" ADD CONSTRAINT "concept2cure_provenance_events_artifact_version_id_concept2cure_artifact_versions_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."concept2cure_artifact_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_provenance_events" ADD CONSTRAINT "concept2cure_provenance_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_provenance_events" ADD CONSTRAINT "concept2cure_provenance_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_provenance_events" ADD CONSTRAINT "concept2cure_provenance_events_source_artifact_id_concept2cure_artifacts_id_fk" FOREIGN KEY ("source_artifact_id") REFERENCES "public"."concept2cure_artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_review_comments" ADD CONSTRAINT "concept2cure_review_comments_artifact_id_concept2cure_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."concept2cure_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_review_comments" ADD CONSTRAINT "concept2cure_review_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_review_comments" ADD CONSTRAINT "concept2cure_review_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_review_comments" ADD CONSTRAINT "concept2cure_review_comments_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_signatures" ADD CONSTRAINT "concept2cure_signatures_artifact_id_concept2cure_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."concept2cure_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_signatures" ADD CONSTRAINT "concept2cure_signatures_artifact_version_id_concept2cure_artifact_versions_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."concept2cure_artifact_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_signatures" ADD CONSTRAINT "concept2cure_signatures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_signatures" ADD CONSTRAINT "concept2cure_signatures_signer_id_users_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_submission_snapshots" ADD CONSTRAINT "concept2cure_submission_snapshots_artifact_id_concept2cure_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."concept2cure_artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_submission_snapshots" ADD CONSTRAINT "concept2cure_submission_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept2cure_submission_snapshots" ADD CONSTRAINT "concept2cure_submission_snapshots_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_groups" ADD CONSTRAINT "context_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_members" ADD CONSTRAINT "context_members_context_group_id_context_groups_id_fk" FOREIGN KEY ("context_group_id") REFERENCES "public"."context_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_clients" ADD CONSTRAINT "cro_clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_milestones" ADD CONSTRAINT "cro_milestones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_milestones" ADD CONSTRAINT "cro_milestones_client_id_cro_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."cro_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_milestones" ADD CONSTRAINT "cro_milestones_study_id_cro_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cro_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_milestones" ADD CONSTRAINT "cro_milestones_submission_id_cro_regulatory_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."cro_regulatory_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_milestones" ADD CONSTRAINT "cro_milestones_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_regulatory_submissions" ADD CONSTRAINT "cro_regulatory_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_regulatory_submissions" ADD CONSTRAINT "cro_regulatory_submissions_client_id_cro_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."cro_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_regulatory_submissions" ADD CONSTRAINT "cro_regulatory_submissions_study_id_cro_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cro_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_studies" ADD CONSTRAINT "cro_studies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_studies" ADD CONSTRAINT "cro_studies_client_id_cro_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."cro_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_team_assignments" ADD CONSTRAINT "cro_team_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_team_assignments" ADD CONSTRAINT "cro_team_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_team_assignments" ADD CONSTRAINT "cro_team_assignments_client_id_cro_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."cro_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_team_assignments" ADD CONSTRAINT "cro_team_assignments_study_id_cro_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."cro_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cro_team_assignments" ADD CONSTRAINT "cro_team_assignments_submission_id_cro_regulatory_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."cro_regulatory_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_module_task_links" ADD CONSTRAINT "cross_module_task_links_source_task_id_unified_tasks_task_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."unified_tasks"("task_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_module_task_links" ADD CONSTRAINT "cross_module_task_links_target_task_id_unified_tasks_task_id_fk" FOREIGN KEY ("target_task_id") REFERENCES "public"."unified_tasks"("task_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_species_pkpd" ADD CONSTRAINT "cross_species_pkpd_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csr_details" ADD CONSTRAINT "csr_details_report_id_csr_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."csr_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csr_reports" ADD CONSTRAINT "csr_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csr_reports" ADD CONSTRAINT "csr_reports_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ctq_factors" ADD CONSTRAINT "ctq_factors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ctq_factors" ADD CONSTRAINT "ctq_factors_qmp_id_quality_management_plans_id_fk" FOREIGN KEY ("qmp_id") REFERENCES "public"."quality_management_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_lineage_tracking" ADD CONSTRAINT "data_lineage_tracking_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deviations" ADD CONSTRAINT "deviations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deviations" ADD CONSTRAINT "deviations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deviations" ADD CONSTRAINT "deviations_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_audit_trail" ADD CONSTRAINT "device_audit_trail_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_components" ADD CONSTRAINT "device_components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_data_center" ADD CONSTRAINT "device_data_center_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_submission_documents" ADD CONSTRAINT "device_submission_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_submission_workflows" ADD CONSTRAINT "device_submission_workflows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_submissions" ADD CONSTRAINT "device_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_submissions" ADD CONSTRAINT "device_submissions_device_id_device_profiles_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dlt_events" ADD CONSTRAINT "dlt_events_study_id_dose_escalation_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."dose_escalation_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dlt_events" ADD CONSTRAINT "dlt_events_cohort_id_dose_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."dose_cohorts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_trail" ADD CONSTRAINT "document_audit_trail_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_trail" ADD CONSTRAINT "document_audit_trail_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_trail" ADD CONSTRAINT "document_audit_trail_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_audit_trail" ADD CONSTRAINT "document_audit_trail_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_comments" ADD CONSTRAINT "document_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_components" ADD CONSTRAINT "document_components_document_id_coauthor_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."coauthor_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_components" ADD CONSTRAINT "document_components_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_components" ADD CONSTRAINT "document_components_component_version_id_component_versions_id_fk" FOREIGN KEY ("component_version_id") REFERENCES "public"."component_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_components" ADD CONSTRAINT "document_components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_components" ADD CONSTRAINT "document_components_locked_by_id_users_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parent_id_document_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."document_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_locks" ADD CONSTRAINT "document_locks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_locks" ADD CONSTRAINT "document_locks_locked_by_id_users_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_section_id_section_graph_nodes_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section_graph_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_leaf_id_section_leaves_id_fk" FOREIGN KEY ("leaf_id") REFERENCES "public"."section_leaves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sessions" ADD CONSTRAINT "document_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sessions" ADD CONSTRAINT "document_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sessions" ADD CONSTRAINT "document_sessions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_vectors" ADD CONSTRAINT "document_vectors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_vectors" ADD CONSTRAINT "document_vectors_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_vectors" ADD CONSTRAINT "document_vectors_component_version_id_component_versions_id_fk" FOREIGN KEY ("component_version_id") REFERENCES "public"."component_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_vectors" ADD CONSTRAINT "document_vectors_document_id_coauthor_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."coauthor_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_locked_by_id_users_id_fk" FOREIGN KEY ("locked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doe_analysis_results" ADD CONSTRAINT "doe_analysis_results_study_id_doe_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."doe_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doe_analysis_results" ADD CONSTRAINT "doe_analysis_results_response_id_doe_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."doe_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doe_experiments" ADD CONSTRAINT "doe_experiments_study_id_doe_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."doe_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doe_factors" ADD CONSTRAINT "doe_factors_study_id_doe_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."doe_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doe_responses" ADD CONSTRAINT "doe_responses_study_id_doe_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."doe_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doe_studies" ADD CONSTRAINT "doe_studies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doe_studies" ADD CONSTRAINT "doe_studies_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_cohorts" ADD CONSTRAINT "dose_cohorts_study_id_dose_escalation_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."dose_escalation_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_cohorts" ADD CONSTRAINT "dose_cohorts_dose_level_id_dose_levels_id_fk" FOREIGN KEY ("dose_level_id") REFERENCES "public"."dose_levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_escalation_studies" ADD CONSTRAINT "dose_escalation_studies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_levels" ADD CONSTRAINT "dose_levels_study_id_dose_escalation_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."dose_escalation_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_products" ADD CONSTRAINT "drug_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drug_substances" ADD CONSTRAINT "drug_substances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_change_control" ADD CONSTRAINT "ectd_change_control_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_change_control" ADD CONSTRAINT "ectd_change_control_granule_id_ectd_granules_id_fk" FOREIGN KEY ("granule_id") REFERENCES "public"."ectd_granules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_compilations" ADD CONSTRAINT "ectd_compilations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_compilations" ADD CONSTRAINT "ectd_compilations_module_id_ectd_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."ectd_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_cross_references" ADD CONSTRAINT "ectd_cross_references_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_cross_references" ADD CONSTRAINT "ectd_cross_references_source_granule_id_ectd_granules_id_fk" FOREIGN KEY ("source_granule_id") REFERENCES "public"."ectd_granules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_cross_references" ADD CONSTRAINT "ectd_cross_references_target_granule_id_ectd_granules_id_fk" FOREIGN KEY ("target_granule_id") REFERENCES "public"."ectd_granules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_granules" ADD CONSTRAINT "ectd_granules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_granules" ADD CONSTRAINT "ectd_granules_module_id_ectd_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."ectd_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_modules" ADD CONSTRAINT "ectd_modules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_modules" ADD CONSTRAINT "ectd_modules_parent_module_id_ectd_modules_id_fk" FOREIGN KEY ("parent_module_id") REFERENCES "public"."ectd_modules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ectd_templates" ADD CONSTRAINT "ectd_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_signatures" ADD CONSTRAINT "electronic_signatures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_signatures" ADD CONSTRAINT "electronic_signatures_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electronic_signatures" ADD CONSTRAINT "electronic_signatures_signer_id_users_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_data_mappings" ADD CONSTRAINT "fda_510k_data_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_documents" ADD CONSTRAINT "fda_510k_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_documents" ADD CONSTRAINT "fda_510k_documents_project_id_fda_510k_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."fda_510k_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_documents" ADD CONSTRAINT "fda_510k_documents_template_id_fda_510k_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."fda_510k_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_documents" ADD CONSTRAINT "fda_510k_documents_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_documents" ADD CONSTRAINT "fda_510k_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_documents" ADD CONSTRAINT "fda_510k_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_projects" ADD CONSTRAINT "fda_510k_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_projects" ADD CONSTRAINT "fda_510k_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_projects" ADD CONSTRAINT "fda_510k_projects_submission_id_fda_510k_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."fda_510k_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_projects" ADD CONSTRAINT "fda_510k_projects_project_lead_users_id_fk" FOREIGN KEY ("project_lead") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_projects" ADD CONSTRAINT "fda_510k_projects_regulatory_lead_users_id_fk" FOREIGN KEY ("regulatory_lead") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_projects" ADD CONSTRAINT "fda_510k_projects_quality_lead_users_id_fk" FOREIGN KEY ("quality_lead") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_projects" ADD CONSTRAINT "fda_510k_projects_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_stage_progress" ADD CONSTRAINT "fda_510k_stage_progress_project_id_fda_510k_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."fda_510k_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_stage_progress" ADD CONSTRAINT "fda_510k_stage_progress_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_submission_packages" ADD CONSTRAINT "fda_510k_submission_packages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_submission_packages" ADD CONSTRAINT "fda_510k_submission_packages_project_id_fda_510k_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."fda_510k_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_submission_packages" ADD CONSTRAINT "fda_510k_submission_packages_submission_id_fda_510k_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."fda_510k_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_submission_packages" ADD CONSTRAINT "fda_510k_submission_packages_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_submissions" ADD CONSTRAINT "fda_510k_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_submissions" ADD CONSTRAINT "fda_510k_submissions_device_id_medical_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."medical_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_templates" ADD CONSTRAINT "fda_510k_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_templates" ADD CONSTRAINT "fda_510k_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_510k_templates" ADD CONSTRAINT "fda_510k_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_communications" ADD CONSTRAINT "fda_communications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_communications" ADD CONSTRAINT "fda_communications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_communications" ADD CONSTRAINT "fda_communications_channel_id_communication_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."communication_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_communications" ADD CONSTRAINT "fda_communications_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fda_integration_logs" ADD CONSTRAINT "fda_integration_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foresight_predictions" ADD CONSTRAINT "foresight_predictions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_approvals" ADD CONSTRAINT "gate_approvals_gate_id_stage_gates_gate_id_fk" FOREIGN KEY ("gate_id") REFERENCES "public"."stage_gates"("gate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_approvals" ADD CONSTRAINT "gate_approvals_submission_id_regulatory_submissions_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."regulatory_submissions"("submission_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_approvals" ADD CONSTRAINT "gate_approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_approvals" ADD CONSTRAINT "gate_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_applications" ADD CONSTRAINT "ind_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_documents" ADD CONSTRAINT "ind_documents_ind_application_id_ind_applications_id_fk" FOREIGN KEY ("ind_application_id") REFERENCES "public"."ind_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_documents" ADD CONSTRAINT "ind_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_documents" ADD CONSTRAINT "ind_documents_template_id_ectd_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."ectd_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_narrative_sections" ADD CONSTRAINT "ind_narrative_sections_narrative_id_ind_narratives_id_fk" FOREIGN KEY ("narrative_id") REFERENCES "public"."ind_narratives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_narratives" ADD CONSTRAINT "ind_narratives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_package_plan_documents" ADD CONSTRAINT "ind_package_plan_documents_plan_id_ind_package_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ind_package_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_package_plan_documents" ADD CONSTRAINT "ind_package_plan_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_package_plan_modalities" ADD CONSTRAINT "ind_package_plan_modalities_plan_id_ind_package_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ind_package_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_package_plan_regions" ADD CONSTRAINT "ind_package_plan_regions_plan_id_ind_package_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ind_package_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_package_plan_requirements" ADD CONSTRAINT "ind_package_plan_requirements_plan_id_ind_package_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ind_package_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_package_plan_timelines" ADD CONSTRAINT "ind_package_plan_timelines_plan_id_ind_package_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."ind_package_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_package_plans" ADD CONSTRAINT "ind_package_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_package_plans" ADD CONSTRAINT "ind_package_plans_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_package_plans" ADD CONSTRAINT "ind_package_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_projects" ADD CONSTRAINT "ind_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_projects" ADD CONSTRAINT "ind_projects_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_projects" ADD CONSTRAINT "ind_projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_projects" ADD CONSTRAINT "ind_projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_projects" ADD CONSTRAINT "ind_projects_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_submissions" ADD CONSTRAINT "ind_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_submissions" ADD CONSTRAINT "ind_submissions_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_submissions" ADD CONSTRAINT "ind_submissions_ind_project_id_ind_projects_project_id_fk" FOREIGN KEY ("ind_project_id") REFERENCES "public"."ind_projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_submissions" ADD CONSTRAINT "ind_submissions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_submissions" ADD CONSTRAINT "ind_submissions_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_template_usage_logs" ADD CONSTRAINT "ind_template_usage_logs_template_id_ind_templates_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."ind_templates"("template_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_template_usage_logs" ADD CONSTRAINT "ind_template_usage_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_template_usage_logs" ADD CONSTRAINT "ind_template_usage_logs_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_templates" ADD CONSTRAINT "ind_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_templates" ADD CONSTRAINT "ind_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ind_templates" ADD CONSTRAINT "ind_templates_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaf_citations" ADD CONSTRAINT "leaf_citations_leaf_id_leaves_leaf_id_fk" FOREIGN KEY ("leaf_id") REFERENCES "public"."leaves"("leaf_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaf_citations" ADD CONSTRAINT "leaf_citations_fact_id_facts_fact_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."facts"("fact_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaf_patches" ADD CONSTRAINT "leaf_patches_leaf_id_leaves_leaf_id_fk" FOREIGN KEY ("leaf_id") REFERENCES "public"."leaves"("leaf_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_edges" ADD CONSTRAINT "link_edges_source_section_id_sections_id_fk" FOREIGN KEY ("source_section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_edges" ADD CONSTRAINT "link_edges_target_section_id_sections_id_fk" FOREIGN KEY ("target_section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_edges" ADD CONSTRAINT "link_edges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_edges" ADD CONSTRAINT "link_edges_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lumen_data_atoms" ADD CONSTRAINT "lumen_data_atoms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lumen_filing_documents" ADD CONSTRAINT "lumen_filing_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lumen_observation_terms" ADD CONSTRAINT "lumen_observation_terms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_supplier_org_id_supply_chain_organizations_id_fk" FOREIGN KEY ("supplier_org_id") REFERENCES "public"."supply_chain_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_devices" ADD CONSTRAINT "medical_devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_subscriptions" ADD CONSTRAINT "module_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_subscriptions" ADD CONSTRAINT "module_subscriptions_module_id_available_modules_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."available_modules"("module_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multi_agency_validation_sessions" ADD CONSTRAINT "multi_agency_validation_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_activity_id_activity_feed_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_feed"("activity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_updates" ADD CONSTRAINT "obligation_updates_obligation_id_regulatory_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."regulatory_obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_updates" ADD CONSTRAINT "obligation_updates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_users" ADD CONSTRAINT "organization_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_leaf_id_section_leaves_id_fk" FOREIGN KEY ("leaf_id") REFERENCES "public"."section_leaves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pkpd_compartments" ADD CONSTRAINT "pkpd_compartments_analysis_id_cross_species_pkpd_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."cross_species_pkpd"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pm_settings" ADD CONSTRAINT "pm_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pma_submissions" ADD CONSTRAINT "pma_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pma_submissions" ADD CONSTRAINT "pma_submissions_device_id_medical_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."medical_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_approval_commitments" ADD CONSTRAINT "post_approval_commitments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_approval_commitments" ADD CONSTRAINT "post_approval_commitments_submission_id_regulatory_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."regulatory_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_approval_commitments" ADD CONSTRAINT "post_approval_commitments_agency_id_regulatory_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."regulatory_agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_validation" ADD CONSTRAINT "process_validation_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_validation" ADD CONSTRAINT "process_validation_lead_validator_users_id_fk" FOREIGN KEY ("lead_validator") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_validation" ADD CONSTRAINT "process_validation_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_cer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cer_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_cer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cer_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_cer_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."cer_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_modules" ADD CONSTRAINT "project_modules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_modules" ADD CONSTRAINT "project_modules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_modules" ADD CONSTRAINT "project_modules_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_predictions" ADD CONSTRAINT "project_predictions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rules" ADD CONSTRAINT "project_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rules" ADD CONSTRAINT "project_rules_scope_project_id_projects_id_fk" FOREIGN KEY ("scope_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rules" ADD CONSTRAINT "project_rules_scope_template_id_project_templates_id_fk" FOREIGN KEY ("scope_template_id") REFERENCES "public"."project_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rules" ADD CONSTRAINT "project_rules_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_workflow_stage_id_project_workflow_stages_id_fk" FOREIGN KEY ("workflow_stage_id") REFERENCES "public"."project_workflow_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_parent_task_id_project_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_workflow_stages" ADD CONSTRAINT "project_workflow_stages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_workflow_stages" ADD CONSTRAINT "project_workflow_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_project_id_projects_id_fk" FOREIGN KEY ("parent_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_audit_logs" ADD CONSTRAINT "proof_audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_testing" ADD CONSTRAINT "qc_testing_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_testing" ADD CONSTRAINT "qc_testing_analyst_users_id_fk" FOREIGN KEY ("analyst") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_testing" ADD CONSTRAINT "qc_testing_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qmp_audit_trail" ADD CONSTRAINT "qmp_audit_trail_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qmp_audit_trail" ADD CONSTRAINT "qmp_audit_trail_qmp_id_quality_management_plans_id_fk" FOREIGN KEY ("qmp_id") REFERENCES "public"."quality_management_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qmp_audit_trail" ADD CONSTRAINT "qmp_audit_trail_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qmp_section_gating" ADD CONSTRAINT "qmp_section_gating_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qmp_section_gating" ADD CONSTRAINT "qmp_section_gating_qmp_id_quality_management_plans_id_fk" FOREIGN KEY ("qmp_id") REFERENCES "public"."quality_management_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qmp_traceability_matrix" ADD CONSTRAINT "qmp_traceability_matrix_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qmp_traceability_matrix" ADD CONSTRAINT "qmp_traceability_matrix_qmp_id_quality_management_plans_id_fk" FOREIGN KEY ("qmp_id") REFERENCES "public"."quality_management_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qmp_traceability_matrix" ADD CONSTRAINT "qmp_traceability_matrix_ctq_factor_id_ctq_factors_id_fk" FOREIGN KEY ("ctq_factor_id") REFERENCES "public"."ctq_factors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qmp_traceability_matrix" ADD CONSTRAINT "qmp_traceability_matrix_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_management_plans" ADD CONSTRAINT "quality_management_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_management_plans" ADD CONSTRAINT "quality_management_plans_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_management_plans" ADD CONSTRAINT "quality_management_plans_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_management_plans" ADD CONSTRAINT "quality_management_plans_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_document_id_rag_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rag_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_documents" ADD CONSTRAINT "rag_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_ingestion_jobs" ADD CONSTRAINT "rag_ingestion_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_ingestion_jobs" ADD CONSTRAINT "rag_ingestion_jobs_source_id_rag_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."rag_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_ingestion_jobs" ADD CONSTRAINT "rag_ingestion_jobs_document_id_rag_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rag_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_knowledge_graph" ADD CONSTRAINT "rag_knowledge_graph_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_queries" ADD CONSTRAINT "rag_queries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_queries" ADD CONSTRAINT "rag_queries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_sources" ADD CONSTRAINT "rag_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_documents" ADD CONSTRAINT "recent_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_documents" ADD CONSTRAINT "recent_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_documents" ADD CONSTRAINT "recent_documents_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_attachments" ADD CONSTRAINT "reg_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_attachments" ADD CONSTRAINT "reg_attachments_correspondence_id_agency_correspondence_id_fk" FOREIGN KEY ("correspondence_id") REFERENCES "public"."agency_correspondence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_messages" ADD CONSTRAINT "reg_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_messages" ADD CONSTRAINT "reg_messages_correspondence_id_agency_correspondence_id_fk" FOREIGN KEY ("correspondence_id") REFERENCES "public"."agency_correspondence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_messages" ADD CONSTRAINT "reg_messages_question_id_reg_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."reg_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_obligation_events" ADD CONSTRAINT "reg_obligation_events_obl_id_reg_obligations_obl_id_fk" FOREIGN KEY ("obl_id") REFERENCES "public"."reg_obligations"("obl_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_questions" ADD CONSTRAINT "reg_questions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_questions" ADD CONSTRAINT "reg_questions_correspondence_id_agency_correspondence_id_fk" FOREIGN KEY ("correspondence_id") REFERENCES "public"."agency_correspondence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_questions" ADD CONSTRAINT "reg_questions_attachment_id_reg_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."reg_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_responses" ADD CONSTRAINT "reg_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reg_responses" ADD CONSTRAINT "reg_responses_question_id_reg_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."reg_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_agencies" ADD CONSTRAINT "regulatory_agencies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_audit_logs" ADD CONSTRAINT "regulatory_audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_audit_logs" ADD CONSTRAINT "regulatory_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_calendar" ADD CONSTRAINT "regulatory_calendar_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_calendar" ADD CONSTRAINT "regulatory_calendar_agency_id_regulatory_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."regulatory_agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_calendar" ADD CONSTRAINT "regulatory_calendar_submission_id_regulatory_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."regulatory_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_calendar" ADD CONSTRAINT "regulatory_calendar_commitment_id_post_approval_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."post_approval_commitments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_change_control" ADD CONSTRAINT "regulatory_change_control_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_documents" ADD CONSTRAINT "regulatory_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_documents" ADD CONSTRAINT "regulatory_documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_documents" ADD CONSTRAINT "regulatory_documents_last_modified_by_id_users_id_fk" FOREIGN KEY ("last_modified_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_intelligence" ADD CONSTRAINT "regulatory_intelligence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_intelligence" ADD CONSTRAINT "regulatory_intelligence_agency_id_regulatory_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."regulatory_agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_obligations" ADD CONSTRAINT "regulatory_obligations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_obligations" ADD CONSTRAINT "regulatory_obligations_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_obligations" ADD CONSTRAINT "regulatory_obligations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_obligations" ADD CONSTRAINT "regulatory_obligations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_obligations" ADD CONSTRAINT "regulatory_obligations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_lead_regulatory_users_id_fk" FOREIGN KEY ("lead_regulatory") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_lead_qa_users_id_fk" FOREIGN KEY ("lead_qa") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_lead_clinical_users_id_fk" FOREIGN KEY ("lead_clinical") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_tasks" ADD CONSTRAINT "regulatory_tasks_submission_id_regulatory_submissions_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."regulatory_submissions"("submission_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_tasks" ADD CONSTRAINT "regulatory_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_tasks" ADD CONSTRAINT "regulatory_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_tasks" ADD CONSTRAINT "regulatory_tasks_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_tasks" ADD CONSTRAINT "regulatory_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_tasks" ADD CONSTRAINT "regulatory_tasks_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replacement_rules" ADD CONSTRAINT "replacement_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_details" ADD CONSTRAINT "report_details_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_cache" ADD CONSTRAINT "response_cache_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_detections" ADD CONSTRAINT "risk_detections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_detections" ADD CONSTRAINT "risk_detections_risk_factor_id_risk_factors_id_fk" FOREIGN KEY ("risk_factor_id") REFERENCES "public"."risk_factors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_execution_log" ADD CONSTRAINT "rule_execution_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_execution_log" ADD CONSTRAINT "rule_execution_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_graph_nodes" ADD CONSTRAINT "section_graph_nodes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_graph_nodes" ADD CONSTRAINT "section_graph_nodes_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_leaves" ADD CONSTRAINT "section_leaves_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_leaves" ADD CONSTRAINT "section_leaves_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_leaves" ADD CONSTRAINT "section_leaves_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_leaves" ADD CONSTRAINT "section_leaves_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_links" ADD CONSTRAINT "section_links_leaf_id_leaves_leaf_id_fk" FOREIGN KEY ("leaf_id") REFERENCES "public"."leaves"("leaf_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_links" ADD CONSTRAINT "section_links_section_id_sections_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("section_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_links" ADD CONSTRAINT "section_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_patches" ADD CONSTRAINT "section_patches_section_id_sections_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("section_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_propagations" ADD CONSTRAINT "section_propagations_patch_id_section_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."section_patches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentinel_findings" ADD CONSTRAINT "sentinel_findings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentinel_findings" ADD CONSTRAINT "sentinel_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentinel_findings" ADD CONSTRAINT "sentinel_findings_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_integration" ADD CONSTRAINT "sharepoint_integration_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_integration" ADD CONSTRAINT "sharepoint_integration_granule_id_ectd_granules_id_fk" FOREIGN KEY ("granule_id") REFERENCES "public"."ectd_granules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_audit_log" ADD CONSTRAINT "sharepoint_audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_audit_log" ADD CONSTRAINT "sharepoint_audit_log_file_id_sharepoint_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."sharepoint_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_comments" ADD CONSTRAINT "sharepoint_comments_file_id_sharepoint_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."sharepoint_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_file_versions" ADD CONSTRAINT "sharepoint_file_versions_file_id_sharepoint_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."sharepoint_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_files" ADD CONSTRAINT "sharepoint_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_locks" ADD CONSTRAINT "sharepoint_locks_file_id_sharepoint_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."sharepoint_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharepoint_shares" ADD CONSTRAINT "sharepoint_shares_file_id_sharepoint_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."sharepoint_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simple_document_versions" ADD CONSTRAINT "simple_document_versions_document_id_simple_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."simple_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simple_document_versions" ADD CONSTRAINT "simple_document_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simple_documents" ADD CONSTRAINT "simple_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simple_documents" ADD CONSTRAINT "simple_documents_folder_id_document_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."document_folders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simple_documents" ADD CONSTRAINT "simple_documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "species_comparisons" ADD CONSTRAINT "species_comparisons_analysis_id_cross_species_pkpd_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."cross_species_pkpd"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stability_studies" ADD CONSTRAINT "stability_studies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stability_studies" ADD CONSTRAINT "stability_studies_study_director_users_id_fk" FOREIGN KEY ("study_director") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_gates" ADD CONSTRAINT "stage_gates_submission_id_regulatory_submissions_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."regulatory_submissions"("submission_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_gates" ADD CONSTRAINT "stage_gates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_reports" ADD CONSTRAINT "strategic_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_reports" ADD CONSTRAINT "strategic_reports_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_reports" ADD CONSTRAINT "strategic_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_observation_terms" ADD CONSTRAINT "structured_observation_terms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_batches" ADD CONSTRAINT "supply_chain_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_batches" ADD CONSTRAINT "supply_chain_batches_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_batches" ADD CONSTRAINT "supply_chain_batches_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_coas" ADD CONSTRAINT "supply_chain_coas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_coas" ADD CONSTRAINT "supply_chain_coas_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_coas" ADD CONSTRAINT "supply_chain_coas_batch_id_supply_chain_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."supply_chain_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_coas" ADD CONSTRAINT "supply_chain_coas_material_id_supply_chain_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."supply_chain_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_materials" ADD CONSTRAINT "supply_chain_materials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_materials" ADD CONSTRAINT "supply_chain_materials_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_organizations" ADD CONSTRAINT "supply_chain_organizations_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_organizations" ADD CONSTRAINT "supply_chain_organizations_qualified_by_users_id_fk" FOREIGN KEY ("qualified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_shipments" ADD CONSTRAINT "supply_chain_shipments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_shipments" ADD CONSTRAINT "supply_chain_shipments_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_shipments" ADD CONSTRAINT "supply_chain_shipments_origin_supplier_id_supply_chain_suppliers_id_fk" FOREIGN KEY ("origin_supplier_id") REFERENCES "public"."supply_chain_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_shipments" ADD CONSTRAINT "supply_chain_shipments_destination_supplier_id_supply_chain_suppliers_id_fk" FOREIGN KEY ("destination_supplier_id") REFERENCES "public"."supply_chain_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_shipments" ADD CONSTRAINT "supply_chain_shipments_carrier_id_supply_chain_suppliers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."supply_chain_suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_suppliers" ADD CONSTRAINT "supply_chain_suppliers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_suppliers" ADD CONSTRAINT "supply_chain_suppliers_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_temperature_readings" ADD CONSTRAINT "supply_chain_temperature_readings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_temperature_readings" ADD CONSTRAINT "supply_chain_temperature_readings_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_temperature_readings" ADD CONSTRAINT "supply_chain_temperature_readings_shipment_id_supply_chain_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."supply_chain_shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_status" ADD CONSTRAINT "sync_status_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_status" ADD CONSTRAINT "sync_status_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_automation" ADD CONSTRAINT "task_automation_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_automation" ADD CONSTRAINT "task_automation_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_task_id_unified_tasks_task_id_fk" FOREIGN KEY ("predecessor_task_id") REFERENCES "public"."unified_tasks"("task_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successor_task_id_unified_tasks_task_id_fk" FOREIGN KEY ("successor_task_id") REFERENCES "public"."unified_tasks"("task_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_bypassed_by_users_id_fk" FOREIGN KEY ("bypassed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_usage" ADD CONSTRAINT "template_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_usage" ADD CONSTRAINT "template_usage_template_id_document_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."document_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_usage" ADD CONSTRAINT "template_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_usage" ADD CONSTRAINT "template_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_tasks" ADD CONSTRAINT "unified_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_tasks" ADD CONSTRAINT "unified_tasks_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_tasks" ADD CONSTRAINT "unified_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_tasks" ADD CONSTRAINT "unified_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_tasks" ADD CONSTRAINT "unified_tasks_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_tasks" ADD CONSTRAINT "unified_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_tasks" ADD CONSTRAINT "unified_tasks_last_modified_by_users_id_fk" FOREIGN KEY ("last_modified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_following" ADD CONSTRAINT "user_following_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_following" ADD CONSTRAINT "user_following_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_default_organization_id_organizations_id_fk" FOREIGN KEY ("default_organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_findings" ADD CONSTRAINT "validation_findings_leaf_id_leaves_leaf_id_fk" FOREIGN KEY ("leaf_id") REFERENCES "public"."leaves"("leaf_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_harmonization_opportunities" ADD CONSTRAINT "validation_harmonization_opportunities_session_id_multi_agency_validation_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."multi_agency_validation_sessions"("session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_session_id_multi_agency_validation_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."multi_agency_validation_sessions"("session_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_progress" ADD CONSTRAINT "workflow_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_progress" ADD CONSTRAINT "workflow_progress_client_workspace_id_client_workspaces_id_fk" FOREIGN KEY ("client_workspace_id") REFERENCES "public"."client_workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_progress" ADD CONSTRAINT "workflow_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_org_idx" ON "activity_feed" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "activity_user_idx" ON "activity_feed" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_type_idx" ON "activity_feed" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "activity_entity_idx" ON "activity_feed" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity_feed" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reaction_activity_idx" ON "activity_reactions" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "reaction_user_idx" ON "activity_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "correspondence_number_org_idx" ON "agency_correspondence" USING btree ("correspondence_number","organization_id");--> statement-breakpoint
CREATE INDEX "correspondence_status_idx" ON "agency_correspondence" USING btree ("status");--> statement-breakpoint
CREATE INDEX "correspondence_deadline_idx" ON "agency_correspondence" USING btree ("response_deadline");--> statement-breakpoint
CREATE INDEX "correspondence_thread_idx" ON "agency_correspondence" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "agency_results_session_idx" ON "agency_validation_results" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "agency_results_agency_idx" ON "agency_validation_results" USING btree ("agency");--> statement-breakpoint
CREATE INDEX "agency_results_status_idx" ON "agency_validation_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_audit_transaction_idx" ON "ai_audit_log" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ai_audit_service_idx" ON "ai_audit_log" USING btree ("ai_service");--> statement-breakpoint
CREATE INDEX "ai_audit_created_idx" ON "ai_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_event_idx" ON "audit_events" USING btree ("entity_type","entity_id","event_type");--> statement-breakpoint
CREATE INDEX "audit_event_timestamp_idx" ON "audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_user_event_idx" ON "audit_events" USING btree ("user_id","event_type");--> statement-breakpoint
CREATE INDEX "audit_regulatory_idx" ON "audit_events" USING btree ("regulatory_significant");--> statement-breakpoint
CREATE INDEX "audit_gxp_idx" ON "audit_events" USING btree ("gxp_relevant");--> statement-breakpoint
CREATE INDEX "idx_audit_tenant" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_table_record" ON "audit_logs" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "audit_trail_entity_idx" ON "audit_trail" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_trail_action_idx" ON "audit_trail" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_trail_user_idx" ON "audit_trail" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_trail_timestamp_idx" ON "audit_trail" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "batch_genealogy_tenant_idx" ON "batch_genealogy" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "batch_genealogy_child_idx" ON "batch_genealogy" USING btree ("child_batch_id");--> statement-breakpoint
CREATE INDEX "batch_genealogy_parent_idx" ON "batch_genealogy" USING btree ("parent_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_genealogy_unique" ON "batch_genealogy" USING btree ("child_batch_id","parent_batch_id");--> statement-breakpoint
CREATE INDEX "batches_tenant_idx" ON "batches" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_number_unique" ON "batches" USING btree ("tenant_id","batch_number");--> statement-breakpoint
CREATE INDEX "batches_material_idx" ON "batches" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "batches_status_idx" ON "batches" USING btree ("batch_status");--> statement-breakpoint
CREATE INDEX "batches_mfg_org_idx" ON "batches" USING btree ("manufacturing_org_id");--> statement-breakpoint
CREATE INDEX "batches_mfg_date_idx" ON "batches" USING btree ("manufactured_date");--> statement-breakpoint
CREATE INDEX "batches_expiry_idx" ON "batches" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "batches_barcode_idx" ON "batches" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "biomarker_endpoint_idx" ON "biomarker_endpoints" USING btree ("biomarker_id","endpoint_id");--> statement-breakpoint
CREATE INDEX "phase_idx" ON "biomarker_endpoints" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "biomarker_org_idx" ON "biomarker_endpoints" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "adam_study_dataset_idx" ON "cdisc_adam_specs" USING btree ("study_id","dataset_name");--> statement-breakpoint
CREATE UNIQUE INDEX "cdash_form_field_idx" ON "cdisc_cdash_fields" USING btree ("form_id","field_name");--> statement-breakpoint
CREATE INDEX "cdash_variable_idx" ON "cdisc_cdash_fields" USING btree ("cdash_variable");--> statement-breakpoint
CREATE UNIQUE INDEX "cdash_tenant_form_idx" ON "cdisc_cdash_forms" USING btree ("tenant_id","form_id");--> statement-breakpoint
CREATE INDEX "cdash_domain_idx" ON "cdisc_cdash_forms" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "cdash_sdtm_idx" ON "cdisc_cdash_sdtm_mappings" USING btree ("cdash_domain","cdash_variable","sdtm_variable");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_pref_idx" ON "cdisc_compliance_agency_prefs" USING btree ("agency","region");--> statement-breakpoint
CREATE INDEX "compliance_check_run_idx" ON "cdisc_compliance_results" USING btree ("check_run_id");--> statement-breakpoint
CREATE INDEX "compliance_study_check_idx" ON "cdisc_compliance_results" USING btree ("study_id","check_date");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_rule_idx" ON "cdisc_compliance_rules" USING btree ("rule_id","standard");--> statement-breakpoint
CREATE INDEX "compliance_agency_idx" ON "cdisc_compliance_rules" USING btree ("agency");--> statement-breakpoint
CREATE UNIQUE INDEX "standard_version_idx" ON "cdisc_compliance_versions" USING btree ("standard","version");--> statement-breakpoint
CREATE UNIQUE INDEX "csr_study_sap_idx" ON "cdisc_csr_sap" USING btree ("study_id","sap_version");--> statement-breakpoint
CREATE UNIQUE INDEX "csr_tenant_template_idx" ON "cdisc_csr_templates" USING btree ("tenant_id","template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "csr_study_tfl_idx" ON "cdisc_csr_tfl" USING btree ("study_id","tfl_id");--> statement-breakpoint
CREATE INDEX "csr_tfl_number_idx" ON "cdisc_csr_tfl" USING btree ("tfl_number");--> statement-breakpoint
CREATE INDEX "device_event_idx" ON "cdisc_device_de" USING btree ("study_id","subject_id","event_id");--> statement-breakpoint
CREATE INDEX "device_study_subject_idx" ON "cdisc_device_dx" USING btree ("study_id","subject_id","device_id");--> statement-breakpoint
CREATE INDEX "device_rel_idx" ON "cdisc_device_relationships" USING btree ("study_id","subject_id","device_id");--> statement-breakpoint
CREATE INDEX "acrf_idx" ON "cdisc_docs_acrf" USING btree ("study_id","acrf_version");--> statement-breakpoint
CREATE INDEX "define_artifact_idx" ON "cdisc_docs_define_artifacts" USING btree ("define_id","artifact_type");--> statement-breakpoint
CREATE UNIQUE INDEX "docs_doc_idx" ON "cdisc_docs_repository" USING btree ("doc_id","doc_version");--> statement-breakpoint
CREATE INDEX "docs_study_doc_idx" ON "cdisc_docs_repository" USING btree ("study_id","doc_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ectd_study_dataset_idx" ON "cdisc_ectd_datasets" USING btree ("study_id","dataset_name");--> statement-breakpoint
CREATE UNIQUE INDEX "ectd_study_define_idx" ON "cdisc_ectd_define_xml" USING btree ("study_id","define_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ectd_study_guide_idx" ON "cdisc_ectd_reviewers_guide" USING btree ("study_id","guide_version");--> statement-breakpoint
CREATE UNIQUE INDEX "ectd_study_sdsp_idx" ON "cdisc_ectd_sdsp" USING btree ("study_id","sdsp_version");--> statement-breakpoint
CREATE UNIQUE INDEX "ind_integration_idx" ON "cdisc_ind_integration" USING btree ("ind_number","study_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ise_idx" ON "cdisc_ind_ise" USING btree ("ise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "iss_idx" ON "cdisc_ind_iss" USING btree ("iss_id");--> statement-breakpoint
CREATE UNIQUE INDEX "send_domain_idx" ON "cdisc_ind_send" USING btree ("study_id","domain");--> statement-breakpoint
CREATE INDEX "pq_domain_idx" ON "cdisc_pq_domains" USING btree ("product_id","domain");--> statement-breakpoint
CREATE INDEX "batch_pq_idx" ON "cdisc_pq_domains" USING btree ("batch_id","test_category");--> statement-breakpoint
CREATE INDEX "batch_manufacturing_idx" ON "cdisc_pq_manufacturing" USING btree ("batch_id","step_sequence");--> statement-breakpoint
CREATE INDEX "stability_study_idx" ON "cdisc_pq_stability" USING btree ("study_id","batch_id");--> statement-breakpoint
CREATE INDEX "stability_timepoint_idx" ON "cdisc_pq_stability" USING btree ("timepoint");--> statement-breakpoint
CREATE UNIQUE INDEX "prm_study_endpoint_idx" ON "cdisc_prm_endpoints" USING btree ("study_id","endpoint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prm_study_epoch_idx" ON "cdisc_prm_epochs" USING btree ("study_id","epoch_code");--> statement-breakpoint
CREATE UNIQUE INDEX "prm_tenant_study_idx" ON "cdisc_prm_studies" USING btree ("tenant_id","study_id");--> statement-breakpoint
CREATE INDEX "prm_protocol_idx" ON "cdisc_prm_studies" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "prm_phase_idx" ON "cdisc_prm_studies" USING btree ("study_phase");--> statement-breakpoint
CREATE UNIQUE INDEX "prm_study_arm_idx" ON "cdisc_prm_study_arms" USING btree ("study_id","arm_code");--> statement-breakpoint
CREATE UNIQUE INDEX "prm_study_visit_idx" ON "cdisc_prm_visits" USING btree ("study_id","visit_num");--> statement-breakpoint
CREATE UNIQUE INDEX "task_deliverable_idx" ON "cdisc_task_deliverables" USING btree ("task_id","deliverable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_milestone_idx" ON "cdisc_task_milestones" USING btree ("study_id","milestone_id");--> statement-breakpoint
CREATE INDEX "validation_queue_idx" ON "cdisc_task_validation_queue" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "validation_study_queue_idx" ON "cdisc_task_validation_queue" USING btree ("study_id","validation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_idx" ON "cdisc_task_workflows" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "cerv2_sections_org_idx" ON "cerv2_510k_sections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cerv2_sections_doc_idx" ON "cerv2_510k_sections" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "cerv2_sections_order_idx" ON "cerv2_510k_sections" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "cerv2_sections_status_idx" ON "cerv2_510k_sections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cerv2_session_user_doc_idx" ON "cerv2_document_sessions" USING btree ("user_id","document_id");--> statement-breakpoint
CREATE INDEX "cerv2_session_activity_idx" ON "cerv2_document_sessions" USING btree ("last_activity");--> statement-breakpoint
CREATE INDEX "cerv2_version_section_idx" ON "cerv2_section_versions" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "cerv2_version_org_idx" ON "cerv2_section_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "cerv2_version_timestamp_idx" ON "cerv2_section_versions" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "cerv2_version_user_idx" ON "cerv2_section_versions" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "change_requests_status_idx" ON "change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "change_requests_org_idx" ON "change_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "change_requests_created_idx" ON "change_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_study_idx" ON "clinical_feedback" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "feedback_prediction_idx" ON "clinical_feedback" USING btree ("prediction_id");--> statement-breakpoint
CREATE INDEX "outcome_study_idx" ON "clinical_outcomes" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "outcome_biomarker_endpoint_idx" ON "clinical_outcomes" USING btree ("biomarker_endpoint_id");--> statement-breakpoint
CREATE INDEX "coauthor_annotation_section_idx" ON "coauthor_annotations" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "coauthor_annotation_org_idx" ON "coauthor_annotations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coauthor_version_document_idx" ON "coauthor_document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "coauthor_version_number_idx" ON "coauthor_document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "coauthor_version_created_idx" ON "coauthor_document_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "coauthor_document_org_idx" ON "coauthor_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coauthor_document_status_idx" ON "coauthor_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "coauthor_document_module_idx" ON "coauthor_documents" USING btree ("ectd_module_id");--> statement-breakpoint
CREATE INDEX "coauthor_document_module_number_idx" ON "coauthor_documents" USING btree ("module_number");--> statement-breakpoint
CREATE INDEX "coauthor_import_org_idx" ON "coauthor_import_history" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coauthor_import_target_doc_idx" ON "coauthor_import_history" USING btree ("target_document_id");--> statement-breakpoint
CREATE INDEX "coauthor_import_source_idx" ON "coauthor_import_history" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "coauthor_import_status_idx" ON "coauthor_import_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "coauthor_import_ind_submission_idx" ON "coauthor_import_history" USING btree ("ind_submission_id");--> statement-breakpoint
CREATE INDEX "coauthor_import_by_idx" ON "coauthor_import_history" USING btree ("imported_by_id");--> statement-breakpoint
CREATE INDEX "coauthor_import_started_idx" ON "coauthor_import_history" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "coauthor_section_org_idx" ON "coauthor_sections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coauthor_section_session_idx" ON "coauthor_sections" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "coauthor_section_submission_idx" ON "coauthor_sections" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "coauthor_section_status_idx" ON "coauthor_sections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "coauthor_section_lookup_idx" ON "coauthor_sections" USING btree ("section_id","organization_id");--> statement-breakpoint
CREATE INDEX "coauthor_status_document_idx" ON "coauthor_status_history" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "coauthor_status_org_idx" ON "coauthor_status_history" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coauthor_status_to_idx" ON "coauthor_status_history" USING btree ("to_status");--> statement-breakpoint
CREATE INDEX "coauthor_status_changed_by_idx" ON "coauthor_status_history" USING btree ("changed_by_id");--> statement-breakpoint
CREATE INDEX "coauthor_status_changed_at_idx" ON "coauthor_status_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "validation_history_document_idx" ON "coauthor_validation_history" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "validation_history_performed_idx" ON "coauthor_validation_history" USING btree ("performed_at");--> statement-breakpoint
CREATE INDEX "validation_history_agency_idx" ON "coauthor_validation_history" USING btree ("agency");--> statement-breakpoint
CREATE INDEX "validation_history_compliance_idx" ON "coauthor_validation_history" USING btree ("compliance_score");--> statement-breakpoint
CREATE INDEX "validation_rules_module_idx" ON "coauthor_validation_rules" USING btree ("module");--> statement-breakpoint
CREATE INDEX "validation_rules_agency_idx" ON "coauthor_validation_rules" USING btree ("agency");--> statement-breakpoint
CREATE INDEX "validation_rules_severity_idx" ON "coauthor_validation_rules" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "validation_rules_category_idx" ON "coauthor_validation_rules" USING btree ("category");--> statement-breakpoint
CREATE INDEX "validation_rules_type_idx" ON "coauthor_validation_rules" USING btree ("rule_type");--> statement-breakpoint
CREATE INDEX "communication_channels_org_idx" ON "communication_channels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "communication_channels_project_idx" ON "communication_channels" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "communication_channels_status_idx" ON "communication_channels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "communication_messages_channel_idx" ON "communication_messages" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "communication_messages_project_idx" ON "communication_messages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "communication_messages_sender_idx" ON "communication_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_agency_idx" ON "compliance_tracking" USING btree ("product_id","agency_id");--> statement-breakpoint
CREATE INDEX "compliance_status_idx" ON "compliance_tracking" USING btree ("compliance_status");--> statement-breakpoint
CREATE INDEX "cross_ref_source_idx" ON "component_cross_references" USING btree ("source_component_id");--> statement-breakpoint
CREATE INDEX "cross_ref_target_idx" ON "component_cross_references" USING btree ("target_component_id");--> statement-breakpoint
CREATE INDEX "cross_ref_type_idx" ON "component_cross_references" USING btree ("reference_type");--> statement-breakpoint
CREATE INDEX "seq_ref_component_idx" ON "component_sequence_references" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "seq_ref_udi_idx" ON "component_sequence_references" USING btree ("udi");--> statement-breakpoint
CREATE INDEX "seq_ref_sequence_idx" ON "component_sequence_references" USING btree ("sequence_number");--> statement-breakpoint
CREATE INDEX "seq_ref_org_idx" ON "component_sequence_references" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "seq_ref_document_idx" ON "component_sequence_references" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "seq_ref_module_idx" ON "component_sequence_references" USING btree ("module_context");--> statement-breakpoint
CREATE INDEX "seq_ref_udi_sequence_idx" ON "component_sequence_references" USING btree ("udi","sequence_number");--> statement-breakpoint
CREATE INDEX "component_version_comp_idx" ON "component_versions" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "component_version_unique_idx" ON "component_versions" USING btree ("component_id","version_number");--> statement-breakpoint
CREATE INDEX "component_version_created_idx" ON "component_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "component_org_idx" ON "components" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "component_udi_idx" ON "components" USING btree ("udi","organization_id");--> statement-breakpoint
CREATE INDEX "component_type_idx" ON "components" USING btree ("type");--> statement-breakpoint
CREATE INDEX "component_module_idx" ON "components" USING btree ("module_context");--> statement-breakpoint
CREATE INDEX "component_status_idx" ON "components" USING btree ("status");--> statement-breakpoint
CREATE INDEX "component_priority_idx" ON "components" USING btree ("priority_number");--> statement-breakpoint
CREATE INDEX "component_display_order_idx" ON "components" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "component_context_of_use_idx" ON "components" USING btree ("context_of_use");--> statement-breakpoint
CREATE INDEX "component_lifecycle_state_idx" ON "components" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "c2c_artifact_ver_idx" ON "concept2cure_artifact_versions" USING btree ("artifact_id","version");--> statement-breakpoint
CREATE INDEX "c2c_artifact_project_idx" ON "concept2cure_artifacts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "c2c_artifact_id_idx" ON "concept2cure_artifacts" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "c2c_artifact_type_idx" ON "concept2cure_artifacts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "c2c_artifact_status_idx" ON "concept2cure_artifacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "c2c_conv_project_idx" ON "concept2cure_conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "c2c_conv_org_idx" ON "concept2cure_conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "c2c_conv_id_idx" ON "concept2cure_conversations" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "c2c_msg_conv_idx" ON "concept2cure_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "c2c_msg_id_idx" ON "concept2cure_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "c2c_msg_role_idx" ON "concept2cure_messages" USING btree ("role");--> statement-breakpoint
CREATE INDEX "c2c_prov_artifact_idx" ON "concept2cure_provenance_events" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "c2c_prov_event_type_idx" ON "concept2cure_provenance_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "c2c_prov_org_idx" ON "concept2cure_provenance_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "c2c_prov_created_at_idx" ON "concept2cure_provenance_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "c2c_review_comment_artifact_idx" ON "concept2cure_review_comments" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "c2c_review_comment_org_idx" ON "concept2cure_review_comments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "c2c_sig_id_idx" ON "concept2cure_signatures" USING btree ("signature_id");--> statement-breakpoint
CREATE INDEX "c2c_sig_artifact_idx" ON "concept2cure_signatures" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "c2c_sig_artifact_version_idx" ON "concept2cure_signatures" USING btree ("artifact_version_id");--> statement-breakpoint
CREATE INDEX "c2c_sig_org_idx" ON "concept2cure_signatures" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "c2c_sig_signer_idx" ON "concept2cure_signatures" USING btree ("signer_id");--> statement-breakpoint
CREATE INDEX "c2c_sig_signed_at_idx" ON "concept2cure_signatures" USING btree ("signed_at");--> statement-breakpoint
CREATE INDEX "c2c_snap_id_idx" ON "concept2cure_submission_snapshots" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "c2c_snap_artifact_idx" ON "concept2cure_submission_snapshots" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "c2c_snap_action_type_idx" ON "concept2cure_submission_snapshots" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "c2c_snap_org_idx" ON "concept2cure_submission_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "c2c_snap_created_at_idx" ON "concept2cure_submission_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "context_groups_org_idx" ON "context_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "context_groups_context_idx" ON "context_groups" USING btree ("context_of_use");--> statement-breakpoint
CREATE INDEX "context_members_group_idx" ON "context_members" USING btree ("context_group_id");--> statement-breakpoint
CREATE INDEX "context_members_udi_idx" ON "context_members" USING btree ("component_udi");--> statement-breakpoint
CREATE INDEX "context_members_status_idx" ON "context_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "link_source_idx" ON "cross_module_task_links" USING btree ("source_task_id");--> statement-breakpoint
CREATE INDEX "link_target_idx" ON "cross_module_task_links" USING btree ("target_task_id");--> statement-breakpoint
CREATE INDEX "link_type_idx" ON "cross_module_task_links" USING btree ("link_type");--> statement-breakpoint
CREATE INDEX "pkpd_analysis_id_idx" ON "cross_species_pkpd" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "pkpd_study_idx" ON "cross_species_pkpd" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "pkpd_org_idx" ON "cross_species_pkpd" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lineage_project_idx" ON "data_lineage_tracking" USING btree ("project_id","organization_id");--> statement-breakpoint
CREATE INDEX "lineage_source_idx" ON "data_lineage_tracking" USING btree ("source_field");--> statement-breakpoint
CREATE INDEX "lineage_target_idx" ON "data_lineage_tracking" USING btree ("target_section","target_field");--> statement-breakpoint
CREATE UNIQUE INDEX "deviation_number_org_idx" ON "deviations" USING btree ("deviation_number","organization_id");--> statement-breakpoint
CREATE INDEX "deviation_status_idx" ON "deviations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deviation_severity_idx" ON "deviations" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "deviation_assigned_idx" ON "deviations" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "deviation_batch_idx" ON "deviations" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "device_audit_org_idx" ON "device_audit_trail" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "device_audit_entity_idx" ON "device_audit_trail" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "device_audit_user_idx" ON "device_audit_trail" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_audit_timestamp_idx" ON "device_audit_trail" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_components_org_code_idx" ON "device_components" USING btree ("organization_id","component_code");--> statement-breakpoint
CREATE INDEX "device_data_org_idx" ON "device_data_center" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "device_data_category_idx" ON "device_data_center" USING btree ("category");--> statement-breakpoint
CREATE INDEX "device_data_device_idx" ON "device_data_center" USING btree ("device_name");--> statement-breakpoint
CREATE INDEX "device_data_status_idx" ON "device_data_center" USING btree ("regulatory_status");--> statement-breakpoint
CREATE INDEX "device_data_tags_gin_idx" ON "device_data_center" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "device_data_standards_gin_idx" ON "device_data_center" USING gin ("test_standards");--> statement-breakpoint
CREATE INDEX "device_data_components_gin_idx" ON "device_data_center" USING gin ("device_components");--> statement-breakpoint
CREATE INDEX "device_data_content_idx" ON "device_data_center" USING gin (to_tsvector('english', "searchable_content"));--> statement-breakpoint
CREATE INDEX "device_docs_org_idx" ON "device_submission_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "device_docs_submission_idx" ON "device_submission_documents" USING btree ("submission_type","submission_id");--> statement-breakpoint
CREATE INDEX "device_docs_status_idx" ON "device_submission_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "device_workflow_org_idx" ON "device_submission_workflows" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "device_workflow_status_idx" ON "device_submission_workflows" USING btree ("workflow_status");--> statement-breakpoint
CREATE INDEX "device_workflow_submission_idx" ON "device_submission_workflows" USING btree ("submission_type","submission_id");--> statement-breakpoint
CREATE INDEX "dlt_study_idx" ON "dlt_events" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "dlt_cohort_idx" ON "dlt_events" USING btree ("cohort_id");--> statement-breakpoint
CREATE INDEX "dlt_patient_idx" ON "dlt_events" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "doc_audit_document_idx" ON "document_audit_trail" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_audit_user_idx" ON "document_audit_trail" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "doc_audit_timestamp_idx" ON "document_audit_trail" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "doc_audit_action_idx" ON "document_audit_trail" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "comment_document_idx" ON "document_comments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "comment_author_idx" ON "document_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "comment_status_idx" ON "document_comments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "comment_created_idx" ON "document_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "doc_component_doc_idx" ON "document_components" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_component_comp_idx" ON "document_components" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "doc_component_position_idx" ON "document_components" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "doc_component_locked_idx" ON "document_components" USING btree ("is_locked");--> statement-breakpoint
CREATE INDEX "lock_document_idx" ON "document_locks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "lock_section_idx" ON "document_locks" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "lock_user_idx" ON "document_locks" USING btree ("locked_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lock_token_idx" ON "document_locks" USING btree ("lock_token");--> statement-breakpoint
CREATE UNIQUE INDEX "document_section_idx" ON "document_sections" USING btree ("document_id","section_id");--> statement-breakpoint
CREATE INDEX "document_section_position_idx" ON "document_sections" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "document_section_section_idx" ON "document_sections" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "document_section_leaf_idx" ON "document_sections" USING btree ("leaf_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_idx" ON "document_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "document_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_document_idx" ON "document_sessions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "session_active_idx" ON "document_sessions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "document_templates_category_idx" ON "document_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "document_templates_module_idx" ON "document_templates" USING btree ("module");--> statement-breakpoint
CREATE INDEX "document_templates_region_idx" ON "document_templates" USING btree ("region");--> statement-breakpoint
CREATE INDEX "document_templates_status_idx" ON "document_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_templates_org_idx" ON "document_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "doc_vector_component_idx" ON "document_vectors" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "doc_vector_document_idx" ON "document_vectors" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "doc_vector_module_idx" ON "document_vectors" USING btree ("module_context");--> statement-breakpoint
CREATE INDEX "doc_vector_created_idx" ON "document_vectors" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_idx" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE INDEX "version_status_idx" ON "document_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "version_created_idx" ON "document_versions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "document_code_org_idx" ON "documents" USING btree ("document_code","organization_id");--> statement-breakpoint
CREATE INDEX "document_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_type_idx" ON "documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "document_owner_idx" ON "documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "document_effective_date_idx" ON "documents" USING btree ("effective_date");--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_patient_idx" ON "dose_cohorts" USING btree ("study_id","patient_id");--> statement-breakpoint
CREATE INDEX "cohort_dose_level_idx" ON "dose_cohorts" USING btree ("dose_level_id");--> statement-breakpoint
CREATE INDEX "dose_study_id_idx" ON "dose_escalation_studies" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "dose_study_status_idx" ON "dose_escalation_studies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dose_study_org_idx" ON "dose_escalation_studies" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dose_level_idx" ON "dose_levels" USING btree ("study_id","level_number");--> statement-breakpoint
CREATE INDEX "ectd_change_org_idx" ON "ectd_change_control" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ectd_change_granule_idx" ON "ectd_change_control" USING btree ("granule_id");--> statement-breakpoint
CREATE INDEX "ectd_change_type_idx" ON "ectd_change_control" USING btree ("change_type");--> statement-breakpoint
CREATE INDEX "ectd_change_status_idx" ON "ectd_change_control" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ectd_change_sequence_idx" ON "ectd_change_control" USING btree ("sequence_number");--> statement-breakpoint
CREATE INDEX "ectd_compilations_org_idx" ON "ectd_compilations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ectd_compilations_module_idx" ON "ectd_compilations" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "ectd_compilations_status_idx" ON "ectd_compilations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ectd_compilations_date_idx" ON "ectd_compilations" USING btree ("compiled_at");--> statement-breakpoint
CREATE INDEX "ectd_cross_ref_org_idx" ON "ectd_cross_references" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ectd_cross_ref_source_idx" ON "ectd_cross_references" USING btree ("source_granule_id");--> statement-breakpoint
CREATE INDEX "ectd_cross_ref_target_idx" ON "ectd_cross_references" USING btree ("target_granule_id");--> statement-breakpoint
CREATE INDEX "ectd_cross_ref_type_idx" ON "ectd_cross_references" USING btree ("reference_type");--> statement-breakpoint
CREATE INDEX "ectd_cross_ref_validation_idx" ON "ectd_cross_references" USING btree ("validation_status");--> statement-breakpoint
CREATE INDEX "ectd_granules_org_idx" ON "ectd_granules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ectd_granules_module_idx" ON "ectd_granules" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "ectd_granules_id_idx" ON "ectd_granules" USING btree ("granule_id");--> statement-breakpoint
CREATE INDEX "ectd_granules_status_idx" ON "ectd_granules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ectd_granules_version_idx" ON "ectd_granules" USING btree ("version");--> statement-breakpoint
CREATE INDEX "ectd_granules_edited_idx" ON "ectd_granules" USING btree ("last_edited_at");--> statement-breakpoint
CREATE INDEX "ectd_modules_org_idx" ON "ectd_modules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ectd_modules_project_idx" ON "ectd_modules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ectd_modules_number_idx" ON "ectd_modules" USING btree ("module_number");--> statement-breakpoint
CREATE INDEX "ectd_modules_parent_idx" ON "ectd_modules" USING btree ("parent_module_id");--> statement-breakpoint
CREATE INDEX "ectd_templates_org_idx" ON "ectd_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ectd_templates_category_idx" ON "ectd_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "ectd_templates_type_idx" ON "ectd_templates" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "ectd_templates_active_idx" ON "ectd_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "signature_document_idx" ON "electronic_signatures" USING btree ("document_id","version_id");--> statement-breakpoint
CREATE INDEX "signature_signer_idx" ON "electronic_signatures" USING btree ("signer_id");--> statement-breakpoint
CREATE INDEX "signature_type_idx" ON "electronic_signatures" USING btree ("signature_type");--> statement-breakpoint
CREATE INDEX "signed_at_idx" ON "electronic_signatures" USING btree ("signed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fda_510k_mappings_code_idx" ON "fda_510k_data_mappings" USING btree ("mapping_code");--> statement-breakpoint
CREATE INDEX "fda_510k_mappings_org_idx" ON "fda_510k_data_mappings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fda_510k_documents_id_idx" ON "fda_510k_documents" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "fda_510k_documents_project_idx" ON "fda_510k_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "fda_510k_documents_status_idx" ON "fda_510k_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fda_510k_projects_org_idx" ON "fda_510k_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fda_510k_projects_project_idx" ON "fda_510k_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "fda_510k_projects_stage_idx" ON "fda_510k_projects" USING btree ("current_stage");--> statement-breakpoint
CREATE INDEX "fda_510k_stage_progress_project_idx" ON "fda_510k_stage_progress" USING btree ("project_id","stage_name");--> statement-breakpoint
CREATE UNIQUE INDEX "fda_510k_packages_id_idx" ON "fda_510k_submission_packages" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "fda_510k_packages_project_idx" ON "fda_510k_submission_packages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "fda_510k_org_idx" ON "fda_510k_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fda_510k_device_idx" ON "fda_510k_submissions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "fda_510k_status_idx" ON "fda_510k_submissions" USING btree ("submission_status");--> statement-breakpoint
CREATE UNIQUE INDEX "fda_510k_submission_idx" ON "fda_510k_submissions" USING btree ("submission_number");--> statement-breakpoint
CREATE UNIQUE INDEX "fda_510k_templates_code_idx" ON "fda_510k_templates" USING btree ("template_code");--> statement-breakpoint
CREATE INDEX "fda_510k_templates_org_idx" ON "fda_510k_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fda_communications_org_idx" ON "fda_communications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fda_communications_project_idx" ON "fda_communications" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "fda_communications_channel_idx" ON "fda_communications" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "fda_communications_status_idx" ON "fda_communications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fda_integration_org_idx" ON "fda_integration_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "fda_integration_status_idx" ON "fda_integration_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fda_integration_type_idx" ON "fda_integration_logs" USING btree ("integration_type");--> statement-breakpoint
CREATE INDEX "prediction_study_phase_idx" ON "foresight_predictions" USING btree ("study_id","phase");--> statement-breakpoint
CREATE INDEX "prediction_org_idx" ON "foresight_predictions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "gate_approval_id_idx" ON "gate_approvals" USING btree ("approval_id");--> statement-breakpoint
CREATE INDEX "gate_approval_gate_idx" ON "gate_approvals" USING btree ("gate_id");--> statement-breakpoint
CREATE INDEX "gate_approval_approver_idx" ON "gate_approvals" USING btree ("approver_id");--> statement-breakpoint
CREATE INDEX "gate_approval_status_idx" ON "gate_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ind_applications_org_idx" ON "ind_applications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ind_applications_status_idx" ON "ind_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ind_applications_phase_idx" ON "ind_applications" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "ind_documents_org_idx" ON "ind_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ind_documents_application_idx" ON "ind_documents" USING btree ("ind_application_id");--> statement-breakpoint
CREATE INDEX "ind_documents_status_idx" ON "ind_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ind_documents_module_idx" ON "ind_documents" USING btree ("module_number");--> statement-breakpoint
CREATE INDEX "section_narrative_idx" ON "ind_narrative_sections" USING btree ("narrative_id");--> statement-breakpoint
CREATE INDEX "section_number_idx" ON "ind_narrative_sections" USING btree ("section_number");--> statement-breakpoint
CREATE INDEX "narrative_id_idx" ON "ind_narratives" USING btree ("narrative_id");--> statement-breakpoint
CREATE INDEX "ind_number_idx" ON "ind_narratives" USING btree ("ind_number");--> statement-breakpoint
CREATE INDEX "narrative_status_idx" ON "ind_narratives" USING btree ("status");--> statement-breakpoint
CREATE INDEX "narrative_org_idx" ON "ind_narratives" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "plan_document_idx" ON "ind_package_plan_documents" USING btree ("plan_id","document_type");--> statement-breakpoint
CREATE INDEX "ind_document_status_idx" ON "ind_package_plan_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ind_document_target_date_idx" ON "ind_package_plan_documents" USING btree ("target_date");--> statement-breakpoint
CREATE INDEX "document_region_modality_idx" ON "ind_package_plan_documents" USING btree ("region_code","modality_code");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_modality_idx" ON "ind_package_plan_modalities" USING btree ("plan_id","modality_code");--> statement-breakpoint
CREATE INDEX "modality_status_idx" ON "ind_package_plan_modalities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "modality_complexity_idx" ON "ind_package_plan_modalities" USING btree ("cmc_complexity");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_region_idx" ON "ind_package_plan_regions" USING btree ("plan_id","region_code");--> statement-breakpoint
CREATE INDEX "region_status_idx" ON "ind_package_plan_regions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "region_priority_idx" ON "ind_package_plan_regions" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "plan_requirement_idx" ON "ind_package_plan_requirements" USING btree ("plan_id","requirement_type");--> statement-breakpoint
CREATE INDEX "requirement_status_idx" ON "ind_package_plan_requirements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requirement_due_date_idx" ON "ind_package_plan_requirements" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "plan_timeline_idx" ON "ind_package_plan_timelines" USING btree ("plan_id","sequence_order");--> statement-breakpoint
CREATE INDEX "timeline_status_idx" ON "ind_package_plan_timelines" USING btree ("status");--> statement-breakpoint
CREATE INDEX "timeline_phase_type_idx" ON "ind_package_plan_timelines" USING btree ("phase_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ind_plan_id_org_idx" ON "ind_package_plans" USING btree ("plan_id","organization_id");--> statement-breakpoint
CREATE INDEX "ind_plan_status_idx" ON "ind_package_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ind_plan_phase_idx" ON "ind_package_plans" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "ind_project_id_idx" ON "ind_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ind_org_idx" ON "ind_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ind_status_idx" ON "ind_projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submission_id_idx" ON "ind_submissions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "session_id_idx" ON "ind_submissions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "submission_ind_project_idx" ON "ind_submissions" USING btree ("ind_project_id");--> statement-breakpoint
CREATE INDEX "submission_org_idx" ON "ind_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "submission_status_idx" ON "ind_submissions" USING btree ("ind_wizard_status","ectd_status");--> statement-breakpoint
CREATE INDEX "ind_template_id_idx" ON "ind_templates" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "ind_template_category_idx" ON "ind_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "ind_template_type_idx" ON "ind_templates" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ind_template_status_idx" ON "ind_templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "integration_tokens_org_idx" ON "integration_tokens" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "integration_tokens_user_idx" ON "integration_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "integration_tokens_provider_idx" ON "integration_tokens" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_tokens_unique" ON "integration_tokens" USING btree ("organization_id","user_id","provider");--> statement-breakpoint
CREATE INDEX "knowledge_entries_type_idx" ON "knowledge_entries" USING btree ("entry_type");--> statement-breakpoint
CREATE INDEX "knowledge_entries_source_idx" ON "knowledge_entries" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "link_edge_source_target_idx" ON "link_edges" USING btree ("source_section_id","target_section_id","link_type");--> statement-breakpoint
CREATE INDEX "link_edge_source_idx" ON "link_edges" USING btree ("source_section_id");--> statement-breakpoint
CREATE INDEX "link_edge_target_idx" ON "link_edges" USING btree ("target_section_id");--> statement-breakpoint
CREATE INDEX "link_edge_type_idx" ON "link_edges" USING btree ("link_type");--> statement-breakpoint
CREATE INDEX "lumen_atom_org_idx" ON "lumen_data_atoms" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lumen_atom_source_idx" ON "lumen_data_atoms" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "lumen_filing_org_idx" ON "lumen_filing_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lumen_filing_accession_idx" ON "lumen_filing_documents" USING btree ("accession_no");--> statement-breakpoint
CREATE INDEX "lumen_terms_org_idx" ON "lumen_observation_terms" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lumen_terms_term_idx" ON "lumen_observation_terms" USING btree ("term");--> statement-breakpoint
CREATE INDEX "materials_tenant_idx" ON "materials" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_code_unique" ON "materials" USING btree ("tenant_id","material_code");--> statement-breakpoint
CREATE INDEX "materials_type_idx" ON "materials" USING btree ("material_type");--> statement-breakpoint
CREATE INDEX "materials_supplier_idx" ON "materials" USING btree ("supplier_org_id");--> statement-breakpoint
CREATE INDEX "materials_status_idx" ON "materials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "materials_cas_idx" ON "materials" USING btree ("cas_number");--> statement-breakpoint
CREATE INDEX "medical_devices_org_idx" ON "medical_devices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "medical_devices_udi_idx" ON "medical_devices" USING btree ("udi_device_identifier");--> statement-breakpoint
CREATE INDEX "medical_devices_status_idx" ON "medical_devices" USING btree ("regulatory_status");--> statement-breakpoint
CREATE INDEX "module_subscriptions_org_idx" ON "module_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "module_subscriptions_module_idx" ON "module_subscriptions" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "module_subscriptions_enabled_idx" ON "module_subscriptions" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "validation_sessions_org_idx" ON "multi_agency_validation_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "validation_sessions_tenant_idx" ON "multi_agency_validation_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "validation_sessions_doc_idx" ON "multi_agency_validation_sessions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "validation_sessions_status_idx" ON "multi_agency_validation_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "preferences_user_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_recipient_idx" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notification_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notification_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notification_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patch_leaf_version_idx" ON "patches" USING btree ("leaf_id","version");--> statement-breakpoint
CREATE INDEX "patch_leaf_idx" ON "patches" USING btree ("leaf_id");--> statement-breakpoint
CREATE INDEX "patch_author_idx" ON "patches" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "patch_timestamp_idx" ON "patches" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "patch_change_type_idx" ON "patches" USING btree ("change_type");--> statement-breakpoint
CREATE INDEX "compartment_analysis_idx" ON "pkpd_compartments" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "compartment_species_idx" ON "pkpd_compartments" USING btree ("species");--> statement-breakpoint
CREATE INDEX "pma_org_idx" ON "pma_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pma_device_idx" ON "pma_submissions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "pma_status_idx" ON "pma_submissions" USING btree ("submission_status");--> statement-breakpoint
CREATE UNIQUE INDEX "pma_number_idx" ON "pma_submissions" USING btree ("pma_number");--> statement-breakpoint
CREATE UNIQUE INDEX "commitment_number_org_idx" ON "post_approval_commitments" USING btree ("commitment_number","organization_id");--> statement-breakpoint
CREATE INDEX "commitment_status_idx" ON "post_approval_commitments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commitment_due_date_idx" ON "post_approval_commitments" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "commitment_assigned_idx" ON "post_approval_commitments" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "project_predictions_project_idx" ON "project_predictions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_predictions_generated_idx" ON "project_predictions" USING btree ("generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_rules_rule_id_idx" ON "project_rules" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "project_rules_org_idx" ON "project_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_rules_trigger_idx" ON "project_rules" USING btree ("trigger_event");--> statement-breakpoint
CREATE INDEX "project_rules_scope_idx" ON "project_rules" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "project_rules_active_idx" ON "project_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "projects_parent_project_idx" ON "projects" USING btree ("parent_project_id");--> statement-breakpoint
CREATE INDEX "projects_path_idx" ON "projects" USING btree ("path");--> statement-breakpoint
CREATE INDEX "projects_depth_idx" ON "projects" USING btree ("depth");--> statement-breakpoint
CREATE UNIQUE INDEX "proof_audit_entry_id_idx" ON "proof_audit_logs" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "proof_audit_org_idx" ON "proof_audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "proof_audit_workflow_idx" ON "proof_audit_logs" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "proof_audit_event_type_idx" ON "proof_audit_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "proof_audit_timestamp_idx" ON "proof_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "proof_audit_hash_chain_idx" ON "proof_audit_logs" USING btree ("hash_chain");--> statement-breakpoint
CREATE INDEX "rag_chunks_document_idx" ON "rag_chunks" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "rag_chunks_index_idx" ON "rag_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "rag_chunks_section_idx" ON "rag_chunks" USING btree ("section_title");--> statement-breakpoint
CREATE INDEX "rag_documents_org_idx" ON "rag_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rag_documents_type_idx" ON "rag_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "rag_documents_status_idx" ON "rag_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rag_documents_therapeutic_idx" ON "rag_documents" USING btree ("therapeutic_area");--> statement-breakpoint
CREATE INDEX "rag_documents_compound_idx" ON "rag_documents" USING btree ("compound");--> statement-breakpoint
CREATE INDEX "rag_documents_date_idx" ON "rag_documents" USING btree ("document_date");--> statement-breakpoint
CREATE INDEX "rag_jobs_org_idx" ON "rag_ingestion_jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rag_jobs_status_idx" ON "rag_ingestion_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rag_jobs_priority_idx" ON "rag_ingestion_jobs" USING btree ("priority","created_at");--> statement-breakpoint
CREATE INDEX "rag_jobs_source_idx" ON "rag_ingestion_jobs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "rag_jobs_created_idx" ON "rag_ingestion_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rag_knowledge_org_idx" ON "rag_knowledge_graph" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rag_knowledge_entity_idx" ON "rag_knowledge_graph" USING btree ("entity_id","entity_type");--> statement-breakpoint
CREATE INDEX "rag_knowledge_related_idx" ON "rag_knowledge_graph" USING btree ("related_entity_id","related_entity_type");--> statement-breakpoint
CREATE INDEX "rag_knowledge_type_idx" ON "rag_knowledge_graph" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "rag_knowledge_relationship_idx" ON "rag_knowledge_graph" USING btree ("relationship_type");--> statement-breakpoint
CREATE UNIQUE INDEX "rag_knowledge_unique_rel" ON "rag_knowledge_graph" USING btree ("entity_id","related_entity_id","relationship_type");--> statement-breakpoint
CREATE INDEX "rag_queries_org_idx" ON "rag_queries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rag_queries_user_idx" ON "rag_queries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rag_queries_session_idx" ON "rag_queries" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "rag_queries_type_idx" ON "rag_queries" USING btree ("query_type");--> statement-breakpoint
CREATE INDEX "rag_queries_created_idx" ON "rag_queries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rag_sources_org_idx" ON "rag_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rag_sources_name_idx" ON "rag_sources" USING btree ("source_name");--> statement-breakpoint
CREATE INDEX "rag_sources_active_idx" ON "rag_sources" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "rag_sources_next_crawl_idx" ON "rag_sources" USING btree ("next_crawl_at");--> statement-breakpoint
CREATE INDEX "recent_documents_user_idx" ON "recent_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recent_documents_date_idx" ON "recent_documents" USING btree ("last_edited_at");--> statement-breakpoint
CREATE INDEX "reg_attachment_correspondence_idx" ON "reg_attachments" USING btree ("correspondence_id");--> statement-breakpoint
CREATE INDEX "reg_attachment_org_idx" ON "reg_attachments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reg_message_correspondence_idx" ON "reg_messages" USING btree ("correspondence_id");--> statement-breakpoint
CREATE INDEX "reg_message_question_idx" ON "reg_messages" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "reg_message_type_idx" ON "reg_messages" USING btree ("message_type");--> statement-breakpoint
CREATE INDEX "idx_reg_obl_sub_due" ON "reg_obligations" USING btree ("sub_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_reg_obl_status" ON "reg_obligations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reg_question_correspondence_idx" ON "reg_questions" USING btree ("correspondence_id");--> statement-breakpoint
CREATE INDEX "reg_question_status_idx" ON "reg_questions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reg_question_priority_idx" ON "reg_questions" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "reg_question_due_date_idx" ON "reg_questions" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "reg_response_question_idx" ON "reg_responses" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "reg_response_status_idx" ON "reg_responses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reg_response_version_idx" ON "reg_responses" USING btree ("question_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agency_code_org_idx" ON "regulatory_agencies" USING btree ("agency_code","organization_id");--> statement-breakpoint
CREATE INDEX "reg_audit_id_idx" ON "regulatory_audit_logs" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "reg_audit_entity_idx" ON "regulatory_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "reg_audit_user_idx" ON "regulatory_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reg_audit_timestamp_idx" ON "regulatory_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "reg_audit_submission_idx" ON "regulatory_audit_logs" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_id_org_idx" ON "regulatory_calendar" USING btree ("event_id","organization_id");--> statement-breakpoint
CREATE INDEX "calendar_event_date_idx" ON "regulatory_calendar" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "calendar_event_type_idx" ON "regulatory_calendar" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "calendar_status_idx" ON "regulatory_calendar" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "change_control_number_org_idx" ON "regulatory_change_control" USING btree ("change_control_number","organization_id");--> statement-breakpoint
CREATE INDEX "change_control_status_idx" ON "regulatory_change_control" USING btree ("status");--> statement-breakpoint
CREATE INDEX "change_control_risk_idx" ON "regulatory_change_control" USING btree ("risk_category");--> statement-breakpoint
CREATE UNIQUE INDEX "intel_id_org_idx" ON "regulatory_intelligence" USING btree ("intel_id","organization_id");--> statement-breakpoint
CREATE INDEX "intel_type_idx" ON "regulatory_intelligence" USING btree ("type");--> statement-breakpoint
CREATE INDEX "intel_impact_level_idx" ON "regulatory_intelligence" USING btree ("impact_level");--> statement-breakpoint
CREATE INDEX "intel_effective_date_idx" ON "regulatory_intelligence" USING btree ("effective_date");--> statement-breakpoint
CREATE INDEX "reg_obligations_org_workspace_idx" ON "regulatory_obligations" USING btree ("organization_id","client_workspace_id");--> statement-breakpoint
CREATE INDEX "reg_obligations_status_idx" ON "regulatory_obligations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reg_obligations_due_date_idx" ON "regulatory_obligations" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "reg_obligations_agency_idx" ON "regulatory_obligations" USING btree ("agency");--> statement-breakpoint
CREATE INDEX "reg_obligations_priority_idx" ON "regulatory_obligations" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "reg_submission_id_idx" ON "regulatory_submissions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "reg_submission_org_idx" ON "regulatory_submissions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "reg_submission_status_idx" ON "regulatory_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reg_submission_type_idx" ON "regulatory_submissions" USING btree ("submission_type");--> statement-breakpoint
CREATE INDEX "reg_submission_gate_idx" ON "regulatory_submissions" USING btree ("current_gate");--> statement-breakpoint
CREATE INDEX "reg_task_id_idx" ON "regulatory_tasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "reg_task_submission_idx" ON "regulatory_tasks" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "reg_task_assigned_idx" ON "regulatory_tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "reg_task_status_idx" ON "regulatory_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reg_task_due_date_idx" ON "regulatory_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "reg_task_priority_idx" ON "regulatory_tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "replacement_rules_org_idx" ON "replacement_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "replacement_rules_type_idx" ON "replacement_rules" USING btree ("rule_type");--> statement-breakpoint
CREATE INDEX "replacement_rules_created_idx" ON "replacement_rules" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "response_cache_query_hash_idx" ON "response_cache" USING btree ("query_hash");--> statement-breakpoint
CREATE INDEX "response_cache_last_accessed_idx" ON "response_cache" USING btree ("last_accessed");--> statement-breakpoint
CREATE INDEX "risk_detections_project_idx" ON "risk_detections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "risk_detections_status_idx" ON "risk_detections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "risk_detections_factor_idx" ON "risk_detections" USING btree ("risk_factor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_factor_code_idx" ON "risk_factors" USING btree ("code");--> statement-breakpoint
CREATE INDEX "risk_factor_category_idx" ON "risk_factors" USING btree ("category");--> statement-breakpoint
CREATE INDEX "rule_exec_rule_id_idx" ON "rule_execution_log" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "rule_exec_org_idx" ON "rule_execution_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rule_exec_project_idx" ON "rule_execution_log" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "rule_exec_created_idx" ON "rule_execution_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "section_graph_slug_idx" ON "section_graph_nodes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "section_graph_canonical_idx" ON "section_graph_nodes" USING btree ("canonical");--> statement-breakpoint
CREATE INDEX "section_graph_region_scope_idx" ON "section_graph_nodes" USING btree ("region_scope");--> statement-breakpoint
CREATE INDEX "section_graph_org_idx" ON "section_graph_nodes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "section_leaves_status_idx" ON "section_leaves" USING btree ("status");--> statement-breakpoint
CREATE INDEX "section_leaves_checksum_idx" ON "section_leaves" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "section_leaves_org_idx" ON "section_leaves" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "leaf_section_idx" ON "section_links" USING btree ("leaf_id","section_id");--> statement-breakpoint
CREATE INDEX "section_links_idx" ON "section_links" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "section_patches_idx" ON "section_patches" USING btree ("section_id","status");--> statement-breakpoint
CREATE INDEX "section_version_idx" ON "section_patches" USING btree ("section_id","version");--> statement-breakpoint
CREATE INDEX "propagation_status_idx" ON "section_propagations" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "target_leaf_idx" ON "section_propagations" USING btree ("target_leaf_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sentinel_finding_id_idx" ON "sentinel_findings" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "sentinel_org_idx" ON "sentinel_findings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sentinel_project_idx" ON "sentinel_findings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sentinel_analyzer_idx" ON "sentinel_findings" USING btree ("analyzer_type");--> statement-breakpoint
CREATE INDEX "sentinel_severity_idx" ON "sentinel_findings" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "sentinel_status_idx" ON "sentinel_findings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sharepoint_org_idx" ON "sharepoint_integration" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sharepoint_granule_idx" ON "sharepoint_integration" USING btree ("granule_id");--> statement-breakpoint
CREATE INDEX "sharepoint_site_idx" ON "sharepoint_integration" USING btree ("sharepoint_site_id");--> statement-breakpoint
CREATE INDEX "sharepoint_status_idx" ON "sharepoint_integration" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "sharepoint_sync_idx" ON "sharepoint_integration" USING btree ("last_sync_at");--> statement-breakpoint
CREATE INDEX "sharepoint_audit_org_timestamp_idx" ON "sharepoint_audit_log" USING btree ("organization_id","timestamp");--> statement-breakpoint
CREATE INDEX "sharepoint_audit_file_idx" ON "sharepoint_audit_log" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "sharepoint_comments_file_idx" ON "sharepoint_comments" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_version_idx" ON "sharepoint_file_versions" USING btree ("file_id","version_number");--> statement-breakpoint
CREATE INDEX "sharepoint_files_org_path_idx" ON "sharepoint_files" USING btree ("organization_id","path");--> statement-breakpoint
CREATE INDEX "sharepoint_files_parent_idx" ON "sharepoint_files" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "sharepoint_files_status_idx" ON "sharepoint_files" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sharepoint_shares_file_idx" ON "sharepoint_shares" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "sharepoint_shares_with_idx" ON "sharepoint_shares" USING btree ("shared_with");--> statement-breakpoint
CREATE INDEX "comparison_analysis_idx" ON "species_comparisons" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "comparison_species_idx" ON "species_comparisons" USING btree ("species");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_assignment_entity_user_idx" ON "staff_assignments" USING btree ("entity_type","entity_id","user_id","role");--> statement-breakpoint
CREATE INDEX "staff_assignment_entity_idx" ON "staff_assignments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "staff_assignment_user_idx" ON "staff_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_assignment_role_idx" ON "staff_assignments" USING btree ("role");--> statement-breakpoint
CREATE INDEX "staff_assignment_active_idx" ON "staff_assignments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "stage_gate_id_idx" ON "stage_gates" USING btree ("gate_id");--> statement-breakpoint
CREATE INDEX "stage_gate_submission_idx" ON "stage_gates" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "stage_gate_status_idx" ON "stage_gates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stage_gate_order_idx" ON "stage_gates" USING btree ("gate_order");--> statement-breakpoint
CREATE UNIQUE INDEX "batch_number_org_idx" ON "supply_chain_batches" USING btree ("batch_number","organization_id");--> statement-breakpoint
CREATE INDEX "lot_number_org_idx" ON "supply_chain_batches" USING btree ("lot_number","organization_id");--> statement-breakpoint
CREATE INDEX "batch_status_idx" ON "supply_chain_batches" USING btree ("batch_status");--> statement-breakpoint
CREATE INDEX "qc_status_idx" ON "supply_chain_batches" USING btree ("qc_status");--> statement-breakpoint
CREATE INDEX "release_status_idx" ON "supply_chain_batches" USING btree ("release_status");--> statement-breakpoint
CREATE INDEX "material_batch_idx" ON "supply_chain_batches" USING btree ("material_id","batch_number");--> statement-breakpoint
CREATE UNIQUE INDEX "coa_number_org_idx" ON "supply_chain_coas" USING btree ("coa_number","organization_id");--> statement-breakpoint
CREATE INDEX "coa_batch_idx" ON "supply_chain_coas" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "coa_status_idx" ON "supply_chain_coas" USING btree ("coa_status");--> statement-breakpoint
CREATE INDEX "coa_result_idx" ON "supply_chain_coas" USING btree ("overall_result");--> statement-breakpoint
CREATE UNIQUE INDEX "material_code_org_idx" ON "supply_chain_materials" USING btree ("material_code","organization_id");--> statement-breakpoint
CREATE INDEX "material_type_idx" ON "supply_chain_materials" USING btree ("material_type");--> statement-breakpoint
CREATE INDEX "cas_number_idx" ON "supply_chain_materials" USING btree ("cas_number");--> statement-breakpoint
CREATE INDEX "storage_conditions_idx" ON "supply_chain_materials" USING btree ("storage_conditions");--> statement-breakpoint
CREATE INDEX "supply_chain_orgs_tenant_idx" ON "supply_chain_organizations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "supply_chain_orgs_type_idx" ON "supply_chain_organizations" USING btree ("organization_type");--> statement-breakpoint
CREATE INDEX "supply_chain_orgs_status_idx" ON "supply_chain_organizations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "supply_chain_orgs_duns_unique" ON "supply_chain_organizations" USING btree ("duns");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_number_org_idx" ON "supply_chain_shipments" USING btree ("shipment_number","organization_id");--> statement-breakpoint
CREATE INDEX "shipment_status_idx" ON "supply_chain_shipments" USING btree ("shipment_status");--> statement-breakpoint
CREATE INDEX "tracking_number_idx" ON "supply_chain_shipments" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "cold_chain_intact_idx" ON "supply_chain_shipments" USING btree ("cold_chain_intact");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_code_org_idx" ON "supply_chain_suppliers" USING btree ("supplier_code","organization_id");--> statement-breakpoint
CREATE INDEX "supplier_qualification_status_idx" ON "supply_chain_suppliers" USING btree ("qualification_status");--> statement-breakpoint
CREATE INDEX "supplier_risk_level_idx" ON "supply_chain_suppliers" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "temp_reading_shipment_time_idx" ON "supply_chain_temperature_readings" USING btree ("shipment_id","reading_time");--> statement-breakpoint
CREATE INDEX "temp_reading_device_time_idx" ON "supply_chain_temperature_readings" USING btree ("device_id","reading_time");--> statement-breakpoint
CREATE INDEX "temp_reading_excursion_idx" ON "supply_chain_temperature_readings" USING btree ("is_excursion");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_status_entity_idx" ON "sync_status" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sync_status_status_idx" ON "sync_status" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sync_status_next_retry_idx" ON "sync_status" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "sync_status_org_idx" ON "sync_status" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_id_idx" ON "task_automation" USING btree ("automation_id");--> statement-breakpoint
CREATE INDEX "automation_rule_type_idx" ON "task_automation" USING btree ("rule_type");--> statement-breakpoint
CREATE INDEX "automation_trigger_module_idx" ON "task_automation" USING btree ("trigger_module");--> statement-breakpoint
CREATE INDEX "automation_trigger_event_idx" ON "task_automation" USING btree ("trigger_event");--> statement-breakpoint
CREATE INDEX "automation_org_idx" ON "task_automation" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dependency_id_idx" ON "task_dependencies" USING btree ("dependency_id");--> statement-breakpoint
CREATE INDEX "dependency_predecessor_idx" ON "task_dependencies" USING btree ("predecessor_task_id");--> statement-breakpoint
CREATE INDEX "dependency_successor_idx" ON "task_dependencies" USING btree ("successor_task_id");--> statement-breakpoint
CREATE INDEX "dependency_status_idx" ON "task_dependencies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dependency_critical_idx" ON "task_dependencies" USING btree ("is_critical");--> statement-breakpoint
CREATE UNIQUE INDEX "template_id_idx" ON "task_templates" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_category_idx" ON "task_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "template_submission_type_idx" ON "task_templates" USING btree ("submission_type");--> statement-breakpoint
CREATE INDEX "template_org_idx" ON "task_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "template_usage_template_idx" ON "template_usage" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_usage_user_idx" ON "template_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "template_usage_date_idx" ON "template_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pattern_type_idx" ON "translational_patterns" USING btree ("pattern_type");--> statement-breakpoint
CREATE INDEX "pattern_indication_idx" ON "translational_patterns" USING btree ("indication");--> statement-breakpoint
CREATE INDEX "unified_task_id_idx" ON "unified_tasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "unified_module_idx" ON "unified_tasks" USING btree ("module_type");--> statement-breakpoint
CREATE INDEX "unified_status_idx" ON "unified_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "unified_assignee_idx" ON "unified_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "unified_due_date_idx" ON "unified_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "unified_priority_idx" ON "unified_tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "unified_project_idx" ON "unified_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "following_user_idx" ON "user_following" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "following_entity_idx" ON "user_following" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "presence_user_idx" ON "user_presence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "presence_status_idx" ON "user_presence" USING btree ("status");--> statement-breakpoint
CREATE INDEX "presence_activity_idx" ON "user_presence" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "harmonization_session_idx" ON "validation_harmonization_opportunities" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "harmonization_potential_idx" ON "validation_harmonization_opportunities" USING btree ("harmonization_potential");--> statement-breakpoint
CREATE INDEX "harmonization_status_idx" ON "validation_harmonization_opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "validation_issues_session_idx" ON "validation_issues" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "validation_issues_agency_idx" ON "validation_issues" USING btree ("agency");--> statement-breakpoint
CREATE INDEX "validation_issues_severity_idx" ON "validation_issues" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "validation_issues_status_idx" ON "validation_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_id_idx" ON "workflow_progress" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_entity_idx" ON "workflow_progress" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "workflow_user_idx" ON "workflow_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workflow_status_idx" ON "workflow_progress" USING btree ("status");