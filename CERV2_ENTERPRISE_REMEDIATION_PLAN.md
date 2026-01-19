# CERV2 Medical Device & Diagnostic Module — Enterprise Remediation Plan

**Purpose:** Convert the current CERV2 Medical Device & Diagnostic module from MVP/mock-grade implementation into enterprise-grade software suitable for regulated environments (FDA 510(k), EU MDR, 21 CFR Part 11, HIPAA, GDPR).

This plan is organized by **domain**, with **phased execution**, **acceptance criteria**, and **key artifacts**. It is based on current architectural gaps observed in the module (e.g., localStorage reliance, missing APIs, weak security controls) and expands into enterprise expectations for regulated medical device platforms.

---

## 1) Executive Summary (What must change)

**Current MVP indicators:**
- Client-side persistence (localStorage), in-memory backend maps, and missing audit/traceability layers.
- Missing or partial endpoints for projects, submissions, document management, and compliance logging.
- Lack of RBAC, license enforcement, Part 11 audit trails, and encryption controls.
- Monolithic UI component with heavy inline logic and debug logging.

**Enterprise target state:**
- **Server-side persistence** with strong tenancy isolation, versioning, and audit trails.
- **Full regulatory compliance baseline** (Part 11, HIPAA, GDPR) with secure identity, RBAC, and immutable audit logging.
- **Well-structured domain architecture**: separated modules, reusable services, and testable units.
- **Operational readiness**: observability, SLA-defined performance, disaster recovery, and audit-ready documentation.

---

## 2) Phased Delivery Plan (Priority Order)

### Phase 0 — Stabilization & Baseline Controls (Week 0–2)
**Goal:** Stop data loss, prevent cross-tenant leakage, and establish guardrails.

**Key Workstreams**
1. **Tenant Isolation & Session Security**
   - Enforce organization + workspace headers server-side.
   - Add session/token validation to all CERV2 endpoints.
   - Block access to CERV2 if license is invalid.

2. **Persistence Baseline**
   - Add a database-backed project store for CERV2 projects.
   - Remove reliance on localStorage for canonical state.

3. **Foundational Auditing**
   - Implement minimal audit log entries for project create/update/delete and document export.

**Acceptance Criteria**
- Access to CERV2 requires authenticated, licensed user within a valid tenant.
- CERV2 project state survives browser reset and is available on another device.
- Audit records exist for any mutating change.

**Artifacts**
- Auth middleware enforcement, tenant guards, initial audit log schema.

---

### Phase 1 — Core Enterprise Data Layer (Week 2–5)
**Goal:** Establish durable, auditable, versioned data lifecycle.

**Key Workstreams**
1. **Project & Submission Services**
   - CRUD for projects, submissions, and documents.
   - Server-generated identifiers and timestamps.
   - State machine for workflow progression.

2. **Versioning & Change Control**
   - Version history for project state and document edits.
   - Immutable audit logs for all versions.

3. **Attachment Storage**
   - Structured file storage (S3/GCS/local equivalent) with metadata + checksum.

**Acceptance Criteria**
- Version history is queryable per project and per document.
- Every edit has a timestamp, user identity, and diff/summary.
- Attachments are persisted and retrievable with integrity checks.

**Artifacts**
- DB schemas for projects, submissions, documents, versions, and audit logs.
- Service layer interfaces and domain models.

---

### Phase 2 — Compliance & Security Hardening (Week 5–8)
**Goal:** Close regulatory compliance gaps.

**Key Workstreams**
1. **21 CFR Part 11**
   - Immutable audit trails.
   - Electronic signatures with identity verification.
   - Tamper-evident logs and change control history.

2. **HIPAA/GDPR**
   - Encrypt data at rest and in transit.
   - Data minimization, retention policies, and export/delete tools.

3. **RBAC & Least Privilege**
   - Role-based permissions for all endpoints and UI actions.
   - Separate clinical authors, reviewers, and admins.

**Acceptance Criteria**
- Audit trails are immutable and queryable by time, user, and object.
- Electronic signatures are captured and tied to specific document versions.
- Permissions are enforced across API and UI.

**Artifacts**
- Compliance policy documents, audit log schema, signature workflows.

---

### Phase 3 — UI Refactor & Workflow Reliability (Week 8–12)
**Goal:** Convert monolithic UI into maintainable, testable modules.

**Key Workstreams**
1. **Component Decomposition**
   - Break CERV2Page into domain panels (Device, Predicate, Literature, CER, Export, etc.).
   - Migrate logic into hooks/services.

2. **State Management**
   - Standardize state layer with server sync and optimistic updates.
   - Strict schema validation on load/save.

3. **Workflow Continuity**
   - Enforce workflow transitions and stage gating via backend rules.

**Acceptance Criteria**
- Each major workflow step is isolated into a testable component.
- Any stage transition is validated by server-side rules.
- UI state reloads consistently across sessions.

**Artifacts**
- Component architecture map, refactor plan, updated client service layer.

---

### Phase 4 — Operations & Scale (Week 12–16)
**Goal:** Ensure reliability and production readiness.

**Key Workstreams**
1. **Observability**
   - Structured logs, metrics, traces.
   - Alerting for API errors, security events, and performance regressions.

2. **Performance**
   - Pagination, lazy loading, caching, and background processing.
   - Load testing for 500+ concurrent users.

3. **Disaster Recovery**
   - Automated backups, restore testing, and retention policies.

**Acceptance Criteria**
- Target SLA and SLOs achieved under load.
- RTO/RPO targets validated via recovery drills.

**Artifacts**
- Monitoring dashboards, runbooks, and DR policies.

---

## 3) Detailed Workstreams (Expanded)

### A) Data Persistence & Lifecycle
- **Replace localStorage** with server state for all projects, device profiles, predicates, literature data, and workflow stages.
- **Schema-driven persistence**: define canonical schema for project state with validation and migrations.
- **Versioning**: snapshot changes by user, time, and feature module.
- **Audit hooks** for every create/update/delete and export action.

### B) Security & Compliance
- **Authentication**: token-based sessions with expiry, refresh, and revocation.
- **Authorization**: RBAC with fine-grained scopes (read/write/export/sign).
- **Encryption**: field-level encryption for sensitive fields; encrypted file storage.
- **Part 11**: signatures and audit logs bound to immutable artifacts.
- **Data governance**: retention and deletion workflows, export for portability.

### C) Workflow Orchestration & Validation
- **Workflow state machine** in the backend with validation rules.
- **Stage gating**: only allow transitions when required data is validated.
- **Document generation**: server-side generation with traceable inputs and outputs.

### D) Testing Strategy
- **Unit tests** for service logic and validators.
- **Integration tests** for APIs with tenant isolation.
- **E2E tests** for CERV2 workflow and regression coverage.
- **Security tests**: role enforcement, token expiry, audit integrity.

### E) UX & Product Quality
- **Form validation** consistent across stages.
- **Loading and error states** standardized.
- **Accessibility**: WCAG AA compliance and keyboard navigation.
- **Telemetry** for user journey friction and feature usage.

---

## 4) Proposed Enterprise Reference Architecture

**Client**
- Domain modules for Device Intake, Predicate Analysis, Literature, CER, Submissions.
- Service layer with strict API contracts.
- Feature flags and role-based rendering.

**API Layer**
- Versioned REST endpoints.
- Auth middleware and tenant guards.
- Validation and schema enforcement.

**Data Layer**
- Projects, submissions, documents, versions, audit logs.
- Object storage for attachments.
- Queue processing for AI generation and document exports.

**Observability**
- Structured logs, metrics, tracing.
- Security incident alerting.

---

## 5) Immediate Next Actions (Recommended)

1. **Implement CERV2 project persistence APIs** (projects, submissions, documents).
2. **Wire license validation and RBAC** in UI + API.
3. **Add audit log schema and emit logs on all writes.**
4. **Refactor CERV2Page into feature modules and remove localStorage as source of truth.**
5. **Establish compliance baseline (Part 11 + HIPAA).**

---

## 6) Deliverables Checklist (Enterprise Readiness)

- [ ] Auth & tenant isolation enforced at API level
- [ ] License validation gating CERV2 access
- [ ] Audit trail with immutable logs
- [ ] Project/document persistence with versioning
- [ ] Role-based access control
- [ ] Document signatures + tamper evidence
- [ ] Data encryption (at rest + in transit)
- [ ] Formal compliance documentation (Part 11, HIPAA, GDPR)
- [ ] Monitoring and incident response runbooks
- [ ] CI quality gates and test coverage targets

---

## 7) Appendix — Suggested API Endpoints (Draft)

```
POST   /api/cerv2/projects
GET    /api/cerv2/projects
GET    /api/cerv2/projects/:id
PATCH  /api/cerv2/projects/:id
DELETE /api/cerv2/projects/:id

POST   /api/cerv2/projects/:id/submissions
GET    /api/cerv2/projects/:id/submissions
GET    /api/cerv2/submissions/:id
PATCH  /api/cerv2/submissions/:id

POST   /api/cerv2/documents
GET    /api/cerv2/documents/:id
PATCH  /api/cerv2/documents/:id
GET    /api/cerv2/documents/:id/versions
POST   /api/cerv2/documents/:id/sign

GET    /api/cerv2/audit-log
```

---

## 8) Appendix — Example Audit Log Fields

```
id
timestamp
user_id
tenant_id
object_type (project/submission/document)
object_id
action (create/update/delete/export/sign)
version
metadata
hash
```

---

**Owner:** Engineering & Compliance
**Status:** Proposed
**Revision:** 1.0
