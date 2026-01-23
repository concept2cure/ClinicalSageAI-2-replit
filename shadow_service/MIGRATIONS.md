# Shadow Service Database Migrations

**Generated:** 2026-01-23  
**Purpose:** Definitive reference for all GCC (Global Command Center) database migrations

---

## Migration Index

| Migration | Name | Purpose | Key Objects | Dependencies |
|-----------|------|---------|-------------|--------------|
| 001 | Core | Foundational schemas + pgvector | `truth.*`, `prose.*`, `adversarial.*`, `audit.*` | pgvector, uuid-ossp |
| 002 | Audit Immutability | Append-only enforcement | Triggers on audit/truth tables | 001 |
| 003 | Prose Versioning | Version history + attribution | `prose.smart_fragment_versions`, triggers | 001, 002 |
| 003-verify | Versioning Verify | Validate 003 applied correctly | Verification queries | 003 |
| 004 | Enhanced Citations | Evidence strength + source locators | `fragment_truth_links` columns | 001, 003 |
| 005 | Database Roles | RBAC role definitions | `gcc_app_reader/writer/auditor/admin` | 001-004 |
| 006 | Dashboard Views | Fragment latest + risk views | `prose.v_fragment_latest`, `audit.v_fragment_latest_risk` | 001-005 |
| 007 | Heatmap Views | Risk rollup views | `prose.v_fragment_current`, `prose.v_section_rollup` | 006 |
| 007-run-groups | Shadow Run Groups | Batch interrogation tracking | `audit.shadow_run_groups` | 007 |
| 007-008-verify | Verify 007/008 | Validate views exist | Verification queries | 007, 008 |
| 008 | Submission Snapshots | Freeze/lock workflow | `prose.submission_snapshots`, `submission_snapshot_fragments` | 007 |
| 008-exports | Snapshot Exports | Export manifest records | `prose.submission_snapshot_exports` | 008 |
| 009 | E-Signatures + Gate | Submission gate enforcement | `audit.e_signatures`, gate triggers | 008 |
| 010 | Program Scoping + RLS | Multi-tenant access control | `core.programs`, RLS policies | 009 |
| 011 | Config Bundles | Reproducible AI decisions | `audit.config_bundles` | 010 |
| 012 | Retention + Legal Hold | Data lifecycle management | `retention.*` schema | 011 |
| 013 | Drift Monitoring | Scheduled drift detection | `monitoring.*` schema | 011, 012 |
| 014 | Regulatory Timeline | Milestone tracking | `regulatory.*` schema | 010, 013 |
| 015 | Submission Package | eCTD manifest generation | `ectd.*` schema | 014 |
| 017 | Shadow Agent RBAC | Dedicated shadow agent role | `gcc_shadow_agent` role | 005, 007, 008 |

---

## Detailed Migration Descriptions

### 001_gcc_core.sql
**Purpose:** Creates foundational schemas and tables for Scientific Ground Truth, Regulatory Prose, Adversarial Simulation, and 21 CFR Part 11 audit primitives.

**Schemas Created:**
- `truth` - Immutable scientific facts from CSR, lab datasets, SAP outputs
- `prose` - eCTD module fragments with semantic embeddings  
- `adversarial` - IRs, CRLs, assessment questions vectorized for IR prediction
- `audit` - Append-only event logs (Part 11 audit trail)

**Key Tables:**
- `truth.clinical_truth_store` - Single metrics/datapoints from clinical data
- `prose.smart_fragments` - eCTD prose fragments with embeddings
- `prose.fragment_truth_links` - Links prose to truth (citations)
- `adversarial.regulatory_adversarial_precedents` - Historical IR questions
- `audit.concomitant_audit_logs` - Append-only audit trail

**Extensions:**
- `pgvector` - Vector similarity search with HNSW indexing
- `uuid-ossp` - UUID generation

---

### 002_gcc_audit_immutability.sql
**Purpose:** Enforces append-only semantics for audit logs and truth store (21 CFR Part 11 hardening).

**Triggers Created:**
- `trg_no_update_delete_concomitant_audit_logs` - Prevents UPDATE/DELETE on audit logs
- `trg_no_update_delete_clinical_truth_store` - Prevents UPDATE/DELETE on truth store

**Invariant:** These triggers MUST exist for Part 11 compliance.

---

### 003_gcc_prose_versioning.sql
**Purpose:** Add append-only version history for prose.smart_fragments with attribution capture.

**Key Tables:**
- `prose.smart_fragment_versions` - Immutable version history

**Triggers:**
- Auto-version on UPDATE to smart_fragments
- Attribution capture via session variables (`app.user`, `app.reason`, `app.request_id`)

**Invariant:** Version rows are immutable (no UPDATE/DELETE).

---

### 004_gcc_enhanced_citations.sql
**Purpose:** Upgrades fragment_truth_links into defensible regulatory citations.

**Columns Added to `prose.fragment_truth_links`:**
- `evidence_strength` - primary_endpoint, secondary_endpoint, exploratory, etc.
- `source_locator` - JSONB with precise location (CSR section, table, figure)
- `interpretation_note` - Rationale for interpretation
- `claim_subject/predicate/object` - Structured claim triple
- `claim_kind` - supports, contradicts, contextualizes

---

### 005_gcc_database_roles.sql
**Purpose:** Implements least-privilege access model for Part 11 compliance.

**Roles Created:**
- `gcc_app_reader` - SELECT only across all GCC schemas
- `gcc_app_writer` - INSERT/UPDATE on prose/links; no audit modification
- `gcc_auditor` - Read audit + versions; no data modification
- `gcc_admin_migrator` - DDL only for schema changes

**Security:** Revokes default PUBLIC privileges on all GCC schemas.

---

### 006_gcc_dashboard_views.sql
**Purpose:** Creates views for regulatory heatmap and command center dashboards.

**Views Created:**
- `prose.v_fragment_latest` - Current state of all fragments with metadata
- `audit.v_fragment_latest_risk` - Latest Shadow Agent assessment per fragment

---

### 007_gcc_heatmap_views.sql
**Purpose:** Risk rollup views for Command Center heatmaps.

**Views Created:**
- `audit.v_fragment_latest_risk` - Latest risk per fragment
- `prose.v_fragment_truth_coverage` - Truth linkage summary per fragment
- `prose.v_fragment_current` - Single pane of glass view
- `prose.v_section_risk_rollup` - Risk by eCTD section
- `prose.v_jurisdiction_risk_rollup` - Risk by jurisdiction

**Index Added:**
- `audit_logs_fragment_created_at_desc_idx` - Performance for latest log lookups

---

### 007_gcc_shadow_run_groups.sql
**Purpose:** Batch interrogation tracking for Shadow Agent runs.

**Tables Created:**
- `audit.shadow_run_groups` - Groups multiple interrogations into a single run

---

### 008_gcc_submission_snapshots.sql
**Purpose:** Freeze an exact set of fragment versions as a "Submission Snapshot".

**Types Created:**
- `prose.snapshot_status` - ENUM: DRAFT, FROZEN, SUBMITTED, ARCHIVED

**Tables Created:**
- `prose.submission_snapshots` - Snapshot header (name, jurisdiction, status)
- `prose.submission_snapshot_fragments` - Frozen fragment versions with metrics

**Triggers:**
- Prevent mutation once status leaves DRAFT

---

### 008_gcc_snapshot_exports.sql
**Purpose:** Immutable manifest records for frozen snapshots.

**Tables Created:**
- `prose.submission_snapshot_exports` - Export records with SHA-256 hashes

**Triggers:**
- Append-only enforcement (no UPDATE/DELETE)

---

### 009_gcc_esign_and_submission_gate.sql
**Purpose:** E-Signatures + submission gate enforcement for legally defensible records.

**Tables Created:**
- `audit.e_signatures` - Append-only signature manifestation records

**Triggers:**
- Gate enforcement: FROZEN→SUBMITTED requires all required approvals
- Attribution capture from session variables

**Functions:**
- `audit.check_submission_gate()` - Validates all requirements met

---

### 010_gcc_program_scoping_rls.sql
**Purpose:** Multi-program separation with database-enforced access control.

**Schemas Created:**
- `core` - Core entities (programs)
- `auth` - Authentication/authorization

**Tables Created:**
- `core.programs` - Program/asset registry
- `auth.user_program_memberships` - User-program access mapping

**RLS Policies:**
- Applied to all major tables (truth, prose, audit, etc.)
- Session-based filtering via `app.program_id`

**Functions:**
- `auth.global_program_id()` - Deterministic UUID for GLOBAL program
- `auth.current_user_programs()` - Get programs for current session user

---

### 011_gcc_config_bundles.sql
**Purpose:** Make Shadow Agent decisions reproducible by storing exact config bundles.

**Tables Created:**
- `audit.config_bundles` - Append-only config registry

**Content Stored:**
- Embedding model + version
- LLM model + version
- Persona settings
- Thresholds
- Prompt template hashes

**Invariant:** Config bundles are immutable (append-only).

---

### 012_gcc_retention_legal_hold.sql
**Purpose:** Implement regulated data lifecycle management.

**Schemas Created:**
- `retention` - Data retention management

**Tables Created:**
- `retention.policies` - Retention policy registry
- `retention.legal_holds` - Legal hold registry
- `retention.archive_manifests` - Hash-linked archive chain
- `retention.record_holds` - Record-level hold tracking

**Types Created:**
- `retention.hold_type` - LITIGATION, REGULATORY_INQUIRY, etc.
- `retention.archive_status` - PENDING, ARCHIVED, FAILED, RESTORED, HELD

**Functions:**
- `retention.is_under_legal_hold()` - Check if record is held
- `retention.get_retention_until()` - Calculate retention date
- `retention.prevent_physical_delete()` - Trigger to block DELETEs

**Views:**
- `retention.v_archive_eligible` - Records eligible for archival

**Invariant:** Archive manifests are immutable (hash chain integrity).

---

### 013_gcc_drift_monitoring.sql
**Purpose:** Scheduled drift detection, alerting, and quality control.

**Schemas Created:**
- `monitoring` - Drift monitoring infrastructure

**Tables Created:**
- `monitoring.drift_jobs` - Job scheduling and tracking
- `monitoring.drift_runs` - Individual run records
- `monitoring.drift_alerts` - Alert registry
- `monitoring.alert_thresholds` - Configurable thresholds

**Types Created:**
- `monitoring.job_status` - SCHEDULED, RUNNING, COMPLETED, FAILED, CANCELLED
- `monitoring.job_type` - FULL_DRIFT_SCAN, INCREMENTAL_DRIFT, etc.
- `monitoring.alert_severity` - INFO, WARNING, ERROR, CRITICAL

**Views:**
- `monitoring.v_drift_trends` - Drift trend analysis
- `monitoring.v_section_drift_summary` - Drift by section

---

### 014_gcc_regulatory_timeline.sql
**Purpose:** Track submission milestones, regulatory deadlines, and correspondence.

**Schemas Created:**
- `regulatory` - Regulatory workflow management

**Tables Created:**
- `regulatory.submission_types` - Registry of submission types (IND, NDA, etc.)
- `regulatory.submissions` - Per-program submissions
- `regulatory.milestones` - Submission milestones with deadlines
- `regulatory.correspondence` - Agency correspondence tracking
- `regulatory.agency_interactions` - Meeting/call log

**Types Created:**
- `regulatory.submission_status` - PLANNING through ARCHIVED

---

### 015_gcc_submission_package.sql
**Purpose:** Assemble complete eCTD submission packages with manifest generation.

**Schemas Created:**
- `ectd` - eCTD package assembly

**Tables Created:**
- `ectd.module_structure` - eCTD module definitions per ICH spec
- `ectd.packages` - Package assembly records
- `ectd.package_documents` - Documents in packages
- `ectd.package_validations` - Validation results

---

### 017_gcc_shadow_agent_rbac.sql
**Purpose:** Add dedicated shadow_agent role for interrogation service.

**Roles Created:**
- `gcc_shadow_agent` - Inherits reader + specific audit INSERT

**Grants:**
- INSERT on audit.concomitant_audit_logs
- SELECT on all truth/prose/adversarial/snapshot tables
- Access to heatmap and gate views

---

## Missing Migrations (Gaps)

| Number | Status | Notes |
|--------|--------|-------|
| 016 | Missing from GCC series | `016_perf_indexes.sql` exists but not GCC-prefixed |
| 018+ | Not created | Purge workflow, idempotency keys |

---

## Expected Invariants (CI Must Verify)

### Immutability Triggers (MUST EXIST)
- [ ] `trg_no_update_delete_concomitant_audit_logs` on `audit.concomitant_audit_logs`
- [ ] `trg_no_update_delete_clinical_truth_store` on `truth.clinical_truth_store`
- [ ] Append-only on `prose.smart_fragment_versions`
- [ ] Append-only on `audit.e_signatures`
- [ ] Append-only on `prose.submission_snapshot_exports`
- [ ] Append-only on `audit.config_bundles`
- [ ] Hash chain protection on `retention.archive_manifests`

### RLS Policies (MUST BE ENABLED)
- [ ] `truth.clinical_truth_store`
- [ ] `prose.smart_fragments`
- [ ] `prose.smart_fragment_versions`
- [ ] `prose.submission_snapshots`
- [ ] `audit.concomitant_audit_logs`

### Required Views (MUST EXIST)
- [ ] `prose.v_fragment_latest`
- [ ] `prose.v_fragment_current`
- [ ] `audit.v_fragment_latest_risk`
- [ ] `prose.v_section_risk_rollup`
- [ ] `retention.v_archive_eligible`

### Required Functions (MUST EXIST)
- [ ] `retention.is_under_legal_hold()`
- [ ] `audit.check_submission_gate()`
- [ ] `auth.global_program_id()`

---

## Migration Application Order

For a clean database, apply in this exact order:

```bash
001_gcc_core.sql
002_gcc_audit_immutability.sql
003_gcc_prose_versioning.sql
003_gcc_prose_versioning_verify.sql
004_gcc_enhanced_citations.sql
005_gcc_database_roles.sql
006_gcc_dashboard_views.sql
007_gcc_heatmap_views.sql
007_gcc_shadow_run_groups.sql
007_008_gcc_verify.sql
008_gcc_submission_snapshots.sql
008_gcc_snapshot_exports.sql
009_gcc_esign_and_submission_gate.sql
010_gcc_program_scoping_rls.sql
011_gcc_config_bundles.sql
012_gcc_retention_legal_hold.sql
013_gcc_drift_monitoring.sql
014_gcc_regulatory_timeline.sql
015_gcc_submission_package.sql
017_gcc_shadow_agent_rbac.sql
```

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-23 | Claude Opus 4.5 | Initial generation from repo audit |
