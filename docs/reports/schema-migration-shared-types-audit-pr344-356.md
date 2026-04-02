# Schema, Migrations & Shared Types Audit (PRs #344-#356)

**Audit Date:** 2026-04-02
**Scope:** 15 files across shared/schema, shared/types, shared/utils, db/migrations, and server/services
**Auditor:** Claude Code

---

## CRITICAL Findings

### F-01: `cmc-os.ts` NOT exported from `shared/schema/index.ts`

- **File:** `/home/user/ClinicalSageAI-2-replit/shared/schema/index.ts`
- **Lines:** Entire file (no reference to `cmc-os` anywhere)
- **Severity:** CRITICAL
- **Category:** BUG
- **Description:** `shared/schema/cmc-os.ts` defines 7 tables (`cmcSourceObjects`, `cmcModule3Sections`, `cmcSectionLineage`, `cmcContradictions`, `cmcAiCommandResults`, `cmcModule3SectionVersions`, `cmcProvenanceEvents`) but none are re-exported from `shared/schema/index.ts`. Any code importing these tables via `@shared/schema` will get `undefined`, causing runtime query failures.
- **Suggested fix:** Add `export * from './cmc-os';` to `shared/schema/index.ts`.

### F-02: `SUBMISSION_CENTER_ITEM_STATES` and `SubmissionCenterItemState` do not exist in their import source

- **File:** `/home/user/ClinicalSageAI-2-replit/shared/utils/communication-center-rules.ts`, lines 3-5
- **Severity:** CRITICAL
- **Category:** BUG
- **Description:** `communication-center-rules.ts` imports `SUBMISSION_CENTER_ITEM_STATES` and `SubmissionCenterItemState` from `'../types/communication-center'`, but neither is defined or exported from that file. This is a compile-time breakage: `validateSubmissionTransition()`, `validateSubmissionCenterInput()`, and the `SUBMISSION_STATUS_TRANSITIONS` map will all fail to resolve.
- **Suggested fix:** Add to `shared/types/communication-center.ts`:
  ```ts
  export const SUBMISSION_CENTER_ITEM_STATES = [
    'draft', 'preparing', 'ready_for_publish', 'published',
    'submitted_to_gateway', 'acknowledged_by_gateway',
    'accepted_by_authority', 'rejected_or_remediation',
  ] as const;
  export type SubmissionCenterItemState = (typeof SUBMISSION_CENTER_ITEM_STATES)[number];
  ```

### F-03: `submission_center_items` migration missing foreign key constraints

- **File:** `/home/user/ClinicalSageAI-2-replit/db/migrations/20260401_submission_center_items.sql`, lines 5-19
- **Severity:** CRITICAL
- **Category:** SECURITY
- **Description:** The `concept2cure_submission_center_items` table has `organization_id` and `project_id` columns but neither has a `REFERENCES` constraint. This means orphaned rows can exist pointing to deleted organizations or projects, and cascade deletes will not propagate. Every other table in the communication center migrations properly references `organizations(id)` and `projects(id)`.
- **Suggested fix:** Add `REFERENCES organizations(id) ON DELETE CASCADE` to `organization_id` and `REFERENCES projects(id) ON DELETE CASCADE` to `project_id`.

---

## HIGH Findings

### F-04: `Correspondence` type missing `organizationId`

- **File:** `/home/user/ClinicalSageAI-2-replit/shared/types/regulatory-correspondence.ts`, lines 86-109
- **Severity:** HIGH
- **Category:** INCOMPLETE
- **Description:** The `Submission` interface (line 70) includes `organizationId: number`, but the `Correspondence` interface does not. In a multi-tenant SaaS, every entity must carry tenant scoping. The SQL table `concept2cure_agency_communications` has `organization_id`, the TypeScript type `AgencyCommunicationEventRecord` in `communication-center.ts` has `organizationId`, but `Correspondence` is missing it.
- **Suggested fix:** Add `organizationId: number;` to the `Correspondence` interface.

### F-05: `ResponsePackage` type missing `organizationId` and `projectId`

- **File:** `/home/user/ClinicalSageAI-2-replit/shared/types/regulatory-correspondence.ts`, lines 140-149
- **Severity:** HIGH
- **Category:** SECURITY
- **Description:** `ResponsePackage` has no `organizationId` or `projectId`. Without tenant and project scoping, queries using this type cannot be properly scoped, risking cross-tenant data leakage.
- **Suggested fix:** Add `organizationId: number;` and `projectId: number;` to `ResponsePackage`.

### F-06: `MailboxConnection` type missing `organizationId`

- **File:** `/home/user/ClinicalSageAI-2-replit/shared/types/regulatory-correspondence.ts`, lines 151-162
- **Severity:** HIGH
- **Category:** SECURITY
- **Description:** `MailboxConnection` stores OAuth tokens and sync state but has no tenant scoping field. A mailbox must be scoped to an organization.
- **Suggested fix:** Add `organizationId: number;` to `MailboxConnection`.

### F-07: `CorrespondenceIssue` type missing `organizationId` and `projectId`

- **File:** `/home/user/ClinicalSageAI-2-replit/shared/types/regulatory-correspondence.ts`, lines 111-138
- **Severity:** HIGH
- **Category:** SECURITY
- **Description:** `CorrespondenceIssue` has `correspondenceId` but no direct tenant/project scoping. While it can be scoped via the parent correspondence, the `operating-layer.ts` service uses it in queries that require `orgId` passed separately, meaning the type and usage are inconsistent. Since `CorrespondenceIssue` objects are returned standalone (not always nested), they should carry their own scoping.
- **Suggested fix:** Add `organizationId: number;` and `projectId: number;`.

### F-08: `cmc-os.ts` imports from non-barrel path `'../cmc-schema'`

- **File:** `/home/user/ClinicalSageAI-2-replit/shared/schema/cmc-os.ts`, line 3
- **Severity:** HIGH
- **Category:** QUALITY
- **Description:** The file imports `cmcProjects` from `'../cmc-schema'` (i.e., `shared/cmc-schema.ts`), which is a standalone file outside the `shared/schema/` directory. This file is not exported from `shared/schema/index.ts` either. If `cmc-schema.ts` is ever removed or refactored, `cmc-os.ts` breaks silently.
- **Suggested fix:** Either re-export `cmcProjects` from `shared/schema/index.ts`, or move `cmc-schema.ts` into the `shared/schema/` directory and reference it via the barrel.

### F-09: `operating-layer.ts` uses `Record<string, unknown>` return types for SQL queries

- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/regulatory-correspondence/operating-layer.ts`, lines 188-224
- **Severity:** HIGH
- **Category:** QUALITY
- **Description:** `readCanonicalDueSoonAndWorkload` returns `{ dueSoon: Array<Record<string, unknown>>; workload: Array<Record<string, unknown>> }`. This erases all type safety from the SQL query results. Consumers of this function get no compile-time guarantees about the shape of the data.
- **Suggested fix:** Define typed interfaces for the return shapes (e.g., `DueSoonItem { workItemId: string; ownerId: number; ... }` and `WorkloadSummary { ownerId: number; openTasks: number; ... }`).

---

## MEDIUM Findings

### F-10: Pervasive use of `Record<string, any>` in CMC service files

- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/cmc-module3-compiler.ts`, lines 6, 13, 49, 79
- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/module3Composer.ts`, line 16
- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/cmc-impact-contradiction-engine.ts`, line 10
- **Severity:** MEDIUM
- **Category:** QUALITY
- **Description:** `CmcSourceObject.sourcePayload`, `CompiledSection.deterministicJson`, `CanonicalSource.sourcePayload`, and function parameters all use `Record<string, any>`, violating the project's strict TypeScript standard. These are core data structures that flow through compilation, hashing, and persistence.
- **Suggested fix:** Define typed interfaces for each source type's payload shape (e.g., `DrugSubstancePayload`, `SpecificationPayload`, etc.) and use a discriminated union or generic.

### F-11: CMC migration uses `TIMESTAMP` without time zone, communication center uses `TIMESTAMPTZ`

- **File:** `/home/user/ClinicalSageAI-2-replit/db/migrations/20260401_cmc_convergence_os.sql` (all tables)
- **File:** `/home/user/ClinicalSageAI-2-replit/db/migrations/20260331_communication_center_scaffold.sql` (all tables)
- **Severity:** MEDIUM
- **Category:** QUALITY
- **Description:** The CMC migration uses `TIMESTAMP` (without time zone) for all `created_at`/`updated_at` columns, while the communication center migration uses `TIMESTAMPTZ` (with time zone). This inconsistency can cause subtle bugs when comparing timestamps across these systems, especially across time zones.
- **Suggested fix:** Standardize on `TIMESTAMPTZ` for the CMC tables. `TIMESTAMPTZ` is the PostgreSQL best practice.

### F-12: `cmc_documents` table has weak defaults and nullable columns that should be NOT NULL

- **File:** `/home/user/ClinicalSageAI-2-replit/db/migrations/20260401_cmc_convergence_os.sql`, lines 111-133
- **Severity:** MEDIUM
- **Category:** QUALITY
- **Description:** `organization_id` defaults to `1` instead of being a required field with a FK constraint. `project_id`, `content`, `file_path`, `metadata`, `compliance_score`, `compliance_metrics`, `drug_candidate_id`, `study_id`, `tenant_id`, `created_by`, and `last_modified_by` are all nullable with no FK references. For a regulated environment, `organization_id` and `project_id` should be NOT NULL with proper FK constraints.
- **Suggested fix:** Make `organization_id` NOT NULL with `REFERENCES organizations(id)`, make `project_id` NOT NULL with `REFERENCES cmc_projects(id) ON DELETE CASCADE`, remove the `DEFAULT 1` on `organization_id`.

### F-13: `cmc_document_links` and `cmc_document_collaborators` missing FK constraints

- **File:** `/home/user/ClinicalSageAI-2-replit/db/migrations/20260401_cmc_convergence_os.sql`, lines 145-160
- **Severity:** MEDIUM
- **Category:** BUG
- **Description:** `cmc_document_links.document_id` and `linked_document_id` have no `REFERENCES cmc_documents(id)`. `cmc_document_collaborators.document_id` also lacks a FK constraint. Without FK constraints, orphaned link/collaborator rows will accumulate when documents are deleted.
- **Suggested fix:** Add `REFERENCES cmc_documents(id) ON DELETE CASCADE` to all `document_id` and `linked_document_id` columns.

### F-14: Missing indexes on `cmc_contradictions`, `cmc_provenance_events`, and `cmc_section_lineage`

- **File:** `/home/user/ClinicalSageAI-2-replit/db/migrations/20260401_cmc_convergence_os.sql`
- **Severity:** MEDIUM
- **Category:** QUALITY
- **Description:** `cmc_contradictions` has no index on `(project_id, status)` which is the most common query pattern (find open contradictions for a project). `cmc_provenance_events` has no index on `(project_id, artifact_type, artifact_id)` for provenance lookups. `cmc_section_lineage` has no index on `(section_id)` or `(source_object_id)` beyond the FK implicit indexes.
- **Suggested fix:** Add composite indexes:
  - `CREATE INDEX ON cmc_contradictions(project_id, status);`
  - `CREATE INDEX ON cmc_provenance_events(project_id, artifact_type, artifact_id);`

### F-15: `response-package-compiler.ts` always marks evidence as `'missing'`

- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/regulatory-correspondence/response-package-compiler.ts`, lines 37-41
- **Severity:** MEDIUM
- **Category:** INCOMPLETE
- **Description:** The `evidenceChecklist` items are always created with `status: 'missing'`. The function never checks if evidence is actually satisfied. While the `readinessState` logic on line 45 depends on this status, the compiler has no mechanism to compare against existing artifacts, so every response package will permanently show `evidence_gap` readiness state.
- **Suggested fix:** Accept an optional `satisfiedEvidence: string[]` parameter and mark matching checklist items as `'satisfied'`.

### F-16: `coverLetterDraft` is a stub/placeholder string

- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/regulatory-correspondence/response-package-compiler.ts`, line 59
- **Severity:** MEDIUM
- **Category:** INCOMPLETE
- **Description:** The cover letter draft is a hardcoded template string: `"Response package for correspondence {id} addressing {n} issue(s)."`. This is not a real cover letter -- it provides no substance and would need to be completely rewritten by users.
- **Suggested fix:** Either route through the AI gateway for draft generation, or clearly mark this as `coverLetterPlaceholder` with a `coverLetterGenerated: false` flag so the UI can surface it as needing attention.

### F-17: `cmc_documents.tenant_id` column is redundant with `organization_id`

- **File:** `/home/user/ClinicalSageAI-2-replit/db/migrations/20260401_cmc_convergence_os.sql`, lines 128, 105-108
- **Severity:** MEDIUM
- **Category:** QUALITY
- **Description:** The migration adds `tenant_id TEXT` columns to `cmc_batch_records`, `stability_studies`, `quality_specifications`, `cmc_comparability_assessments`, and `cmc_documents`. But the system uses `organization_id INTEGER` as the tenant identifier everywhere else. Having both `organization_id` and `tenant_id` creates ambiguity about which column should be used for tenant scoping.
- **Suggested fix:** Choose one convention. If `organization_id` is the tenant scope (as used by all other tables), remove `tenant_id` or make it a computed/derived column. If `tenant_id` is needed for a different purpose, document the distinction.

---

## LOW Findings

### F-18: `cmc-os.ts` Drizzle schema uses `timestamp()` without `{ withTimezone: true }`

- **File:** `/home/user/ClinicalSageAI-2-replit/shared/schema/cmc-os.ts`, all tables
- **Severity:** LOW
- **Category:** QUALITY
- **Description:** The Drizzle ORM schema uses `timestamp('created_at')` which maps to `TIMESTAMP` without time zone, consistent with the SQL migration but inconsistent with platform best practice (`TIMESTAMPTZ`). This mirrors finding F-11.
- **Suggested fix:** Use `timestamp('created_at', { withTimezone: true })` throughout.

### F-19: `issue-parser.ts` keyword taxonomy has overly broad regex patterns

- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/regulatory-correspondence/issue-parser.ts`, lines 46-118
- **Severity:** LOW
- **Category:** QUALITY
- **Description:** The `safety` pattern (`/safety|adverse event|risk/i`) will match on the word "risk" appearing in any context (e.g., "at risk of delay" or "risk-benefit"). The `cmc` pattern (`/stability|specification|quality|cmc/i`) will match "quality" in any context. This will produce false-positive issue classifications.
- **Suggested fix:** Use word boundary anchors (`\b`) and more specific multi-word patterns to reduce false positives.

### F-20: `cmc-impact-contradiction-engine.ts` only checks 3 contradiction types

- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/cmc-impact-contradiction-engine.ts`, lines 9-51
- **Severity:** LOW
- **Category:** INCOMPLETE
- **Description:** The `detectContradictions` function only checks for `batch_rejected`, `comparability_risk`, and `stability_failure`. The input accepts `specifications`, `methods`, and `changeControl` arrays but never inspects them. For example, open change controls or methods without validation are not flagged.
- **Suggested fix:** Add contradiction checks for: specifications without acceptance criteria, unvalidated methods, open/unapproved change controls.

### F-21: `cmc-module3-compiler.ts` `sectionPath` is identical to `sectionKey`

- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/cmc-module3-compiler.ts`, lines 68-69
- **Severity:** LOW
- **Category:** QUALITY
- **Description:** `sectionPath` is always set equal to `sectionKey` (line 69). The schema distinguishes these as separate fields (`section_key` and `section_path`), but the compiler never generates a proper path (e.g., `module3/32s/32s41`).
- **Suggested fix:** Either generate proper eCTD paths for `sectionPath`, or remove the distinction and use a single field.

### F-22: `CanonicalActionTask` in `regulatory-operating-model.ts` uses `linkedArtifactIds` and `linkedSectionKeys` but `operating-layer.ts` uses `linkedSections` and `linkedArtifactIds`

- **File:** `/home/user/ClinicalSageAI-2-replit/shared/types/regulatory-operating-model.ts`, lines 44-45
- **File:** `/home/user/ClinicalSageAI-2-replit/server/services/regulatory-correspondence/operating-layer.ts`, lines 43-44
- **Severity:** LOW
- **Category:** QUALITY
- **Description:** The type definition uses `linkedArtifactIds: string[]` and `linkedSectionKeys: string[]`, but the service's `CanonicalTaskRecord` interface uses `linkedSections: string[]` instead of `linkedSectionKeys`. The naming inconsistency means these are not interchangeable types despite representing the same concept.
- **Suggested fix:** Align naming -- use `linkedSectionKeys` consistently, or have the service import the type from the shared types file.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3     |
| HIGH     | 6     |
| MEDIUM   | 8     |
| LOW      | 5     |
| **Total** | **22** |

### Top Priority Actions

1. **F-02** (CRITICAL): Add missing `SUBMISSION_CENTER_ITEM_STATES` const and type to `communication-center.ts` -- currently causes compile failure.
2. **F-01** (CRITICAL): Add `export * from './cmc-os'` to `shared/schema/index.ts` -- 7 tables are invisible to the app.
3. **F-03** (CRITICAL): Add FK constraints to `submission_center_items` migration.
4. **F-04/05/06/07** (HIGH): Add `organizationId` to all regulatory correspondence types for tenant scoping.
5. **F-11/18** (MEDIUM): Standardize on `TIMESTAMPTZ` across all migrations and Drizzle schemas.
