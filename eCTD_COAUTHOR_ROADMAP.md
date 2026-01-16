# eCTD Co-Author Development Roadmap

## Goal
Build an eCTD Co-Author system that matches and surpasses weave.bio's solution, focusing on AI-driven efficiency, compliance, and user experience.

## Status: IN PROGRESS (Enterprise IND Build)
This document is the execution roadmap for an enterprise-ready IND authoring + eCTD publishing product. Several items below exist as partial UI, prototypes, or mocked backends; the objective of this plan is to close the gaps to a true biotech-office deployment.

## Reality Check (Jan 2026)
- The actively served frontend is the Vite app under `client/`.
- The editor stack is split between a TipTap-based editor (feature-flagged) and a legacy safe-mode editor.
- “Validation” and “Export package” exist as early flows, but do not yet meet submission-grade, Part 11-grade expectations (immutable audit trails, e-signatures, sequence lifecycle, configurable rule packs, reproducible publishing).

## Target Outcomes
- **Regulated collaboration**: review cycles, comments/tasks, section ownership/locking.
- **21 CFR Part 11 / Annex 11**: immutable audit trail, e-signatures, role-based access, reason-for-change.
- **eCTD 4.0 publishing**: sequence lifecycle operations, backbone + metadata, validation reports, reproducible export.

## Non-Goals (for initial enterprise release)
- Full real-time multi-user co-editing in the same document (Google-Docs style) unless required by a specific pilot.
- Global regional publishing parity (EMA/PMDA/etc.) in v1; focus is FDA IND with an architecture that can extend.

## Phase 0: Foundation (Weeks 1–2)
**Goal:** stabilize the “document-as-a-record” model so everything else (audit, signatures, publishing) is reliable.

- [ ] Single source of truth for documents (API + DB), with version history and server-side persistence
- [ ] Canonical document format (TipTap JSON preferred) + conversion boundaries (PDF/HTML/Docx) documented
- [ ] Standard event taxonomy for audit logging (document.create/edit/save/validate/export, smartTag.insert/update)
- [ ] Minimal admin scaffolding (org/workspace/user role context)

**Acceptance criteria**
- Every document save creates a version record with: author, timestamp, diff/patch pointer, and reason-for-change (can be optional in v0 but must be supported).
- TipTap mode is the “submission-grade” path; legacy safe mode remains available but clearly labeled as limited.

## Phase 1: IND Office Pilot (Weeks 3–6)
**Goal:** make daily IND writing viable for a biotech team (writer + reviewers + QA).

- [ ] Commenting + assignments tied to anchors (paragraph/SmartTag/section)
- [ ] Review cycle state machine: Draft → In Review → Approved → Locked
- [ ] Section ownership + optional section locks
- [ ] Reference library v1 (dedupe, required fields, attachment storage policy, citation insertion)
- [ ] SmartTag quality gates: required provenance fields, clear status (“draft/verified/outdated”), and “what changed” messaging

**Acceptance criteria**
- Reviewers can leave anchored comments, assign to owners, and mark resolved; audit trail records these actions.
- An Approved document cannot be edited without changing state and capturing reason-for-change.

## Phase 2: Part 11 / Annex 11 Compliance (Weeks 7–12)
**Goal:** reach “inspection-ready records” for authoring + approvals.

- [ ] Append-only audit events (server-controlled) with exportable reports
- [ ] Reason-for-change capture for regulated edits
- [ ] Electronic signatures: signer identity, signature meaning (author/review/approve), timestamp, and signed record hash
- [ ] RBAC/ABAC permissions model (org/workspace/doc/section) + least privilege defaults
- [ ] Retention and integrity controls (tamper evidence, backup/restore procedure documented)

**Acceptance criteria**
- An auditor can reconstruct: who changed what, when, why, and under which role/permission.
- Approvals are e-signed and bound to an immutable document version (hash), with a human-readable signature manifest.

## Phase 3: eCTD 4.0 Publishing for FDA IND (Weeks 13–20)
**Goal:** reproducible submission package generation with sequence lifecycle support.

- [ ] Submission workspace: sequences, lifecycle operators (new/replace/delete/append), and leaf metadata management
- [ ] Backbone/metadata generation pipeline (eCTD 4.0 framing), with deterministic output
- [ ] Validation rule packs (structure + content + references + SmartTag provenance) at submission level
- [ ] Export package artifacts: submission bundle + validation report + signature manifest

**Acceptance criteria**
- A “Generate Submission Package” action produces the same bundle given the same inputs (deterministic, versioned).
- Validation reports are archived with the submission record and can be produced for QA/inspection.

## Phase 4: Enterprise Integrations & Scale (Weeks 21+)
**Goal:** make it deployable in regulated biotech IT environments.

- [ ] SSO (OIDC/SAML) + SCIM provisioning
- [ ] External DMS connectors (Veeva Vault / SharePoint / Box) and controlled-copy workflows
- [ ] Performance and scale hardening (large docs, thousands of SmartTags, bulk validation)
- [ ] Monitoring, alerts, and admin dashboards (usage, errors, audit export)

**Acceptance criteria**
- Tenant isolation is validated; permissions are enforced end-to-end.
- The system meets uptime, audit export, and performance SLAs required for office rollout.

## Near-Term “Begin Now” Work (Next 5 Working Days)
1. **PRD + Compliance Matrix**: confirm Part 11 scope (e-sig, audit, retention), roles, and required reports.
2. **Schema proposal**: draft Drizzle tables for `document_versions`, `audit_events`, `signatures`, `comments`, `tasks`, `permissions`.
3. **Audit event pipeline v1**: server-controlled append-only write path; start capturing save/validate/export + SmartTag mutations.
4. **Submission model spike**: define “submission workspace + sequence” entities and expected export artifacts.

## Definition of Done (Enterprise Build)
- Every regulated action produces an audit event.
- Every approval is an e-signature bound to an immutable version hash.
- Every export is reproducible, versioned, and validated, with report artifacts stored.
