# DMS Vault Audit + Competitive Plan (Veeva Vault / SharePoint)

> Status: SUPERSEDED
> Canonical: No
> Supersedes: —
> Superseded By: DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md
> Related Reports: VAULT_UI_HUMAN_EXPERIENCE_AUDIT_2026-03-25.md


_Date: 2026-03-25_

## 1) What our current Vault does today (in-repo audit)

### Product/UI capabilities observed
- Document Vault UI supports:
  - Upload, search, status filter, list/grid view, sorting, favorites, download.
  - Package-mode folder trees for `IND/eCTD`, `510(k)`, `PMA`, `CER`, and `NDA`.
  - Folder-level organization and CTD module labeling.
- Added in this sprint for beta readiness:
  - **Template document placeholders** per package mode (IND, 510(k), NDA) to pre-seed folder structures.
  - **Delete action** for authorized users.
  - **Append version action** (upload a new version into an existing vault document).
  - **Template visibility toggle** (`Show Templates` / `Hide Templates`).

### API/service capabilities observed
- Vault DMS API (filesystem fallback path) supports:
  - List/search documents by organization/project/workflow/user.
  - Upload/create document records.
  - Save version history and return audit trails.
  - Download/view document content.
  - Patch metadata and delete document.
- Data model already carries:
  - Metadata, tags, status, version history, audit trail entries, checksums.

### Access control observed
- Role-based permission checks exist in Portal V2 (`documents:read/write/delete`, etc.).
- Added in this sprint:
  - ANA 1.0 RI identity override to **admin-equivalent access** when identity role/email indicates ANA RI.

## 2) What a basic Veeva Vault competitive baseline typically includes

From public Veeva materials (quality docs + submissions publishing), a “basic competitive” baseline generally means:
- Controlled document lifecycle: draft → review → approval → effective.
- Strong metadata model and taxonomy controls.
- Versioning + immutable audit history.
- Submission-focused structures (RIM alignment, archive/publishing handoff).
- Workflow automation, role-based approvals, and training/change-control linkage (quality context).

## 3) What SharePoint does well (incumbent baseline)

In regulated teams, SharePoint commonly provides:
- Document libraries with metadata/content types.
- Version history and check-in/out controls.
- M365 retention/eDiscovery integration via Purview.
- Broad collaboration and enterprise familiarity.

But SharePoint generally needs additional design/customization to become submission-grade for IND/510(k)/eCTD programs.

## 4) Gap analysis vs “beta next week” objective

### Strengths already present
- Multi-package folder structures in UI.
- Core upload/search/version/audit pathways.
- Role-based permissions.
- Semantic/vector architecture pathways in advanced vault routes.

### Immediate gaps to close for beta
1. **Template depth**: Need full starter kits per submission type (not just top-level placeholders).
2. **Submission-aware metadata enforcement**: Required metadata fields differ by IND vs 510(k) vs PMA.
3. **Workflow hardening**: Explicit review/approval gates and role assignments per stage.
4. **Record locking + signature semantics**: Align to Part 11 expectations for approved/effective records.
5. **Operational readiness**: pilot org seed data, SOPs, in-product onboarding, success metrics.

## 5) Execution plan to reach beta usability next week

### Phase A (done in this commit)
- Expanded IND structure with pre-IND strategy folders.
- Added folder-level template placeholders to bootstrap project teams.
- Added delete + append-version actions in vault UI.
- Enabled ANA 1.0 RI elevated access path for control operations.

### Phase B (next 2-3 days)
1. **Template packs v1**
   - Build richer templates for:
     - IND: Form 1571/1572 narrative placeholders, protocol shells, CMC summaries.
     - 510(k): eSTAR-aligned section templates (admin + technical).
     - PMA/NDA/CER: minimum viable starter templates.
2. **Metadata contracts**
   - Required fields per package type (e.g., submission type, section, study ID, device predicate ref).
3. **ANA control surface**
   - Add AI-action endpoints for create/update/delete/append with audit reason codes.

### Phase C (remaining days before beta)
1. **Pilot hardening**
   - Seed one biotech demo program and one med-device demo program.
   - Validate complete upload→review→approve→download flow.
2. **Compliance checks**
   - Verify audit trail completeness for all write actions.
   - Confirm approved document lock behavior and immutable history.
3. **Go-live package**
   - Beta SOP (user roles, folder conventions, template usage).
   - Beta KPI dashboard: time-to-first-upload, template reuse rate, approval cycle time.

## 6) Recommended “must-have” beta acceptance criteria

- New project can be initialized in <10 min with package-specific folder + templates.
- ANA RI can create/update/delete/append versions with audit logs.
- Users can filter/search by package metadata and quickly find required section docs.
- Version history is visible and recoverable.
- Approved docs are protected from accidental edits and destructive operations.

## 7) Risks
- API surface mismatch across parallel vault route implementations.
- Incomplete template library could reduce perceived value in first beta sessions.
- Role mapping inconsistencies if identity provider roles are not normalized.

## 8) Recommended immediate next tickets
1. `vault-template-pack-expansion-v1`
2. `vault-metadata-contracts-by-submission-type`
3. `ana-ri-audit-reason-codes-and-action-endpoints`
4. `approved-doc-lock-policy-enforcement`
5. `beta-seed-programs-and-onboarding-runbook`
