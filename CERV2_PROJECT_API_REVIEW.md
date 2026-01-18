# CERV2 Project APIs — Broad Review (Post-Change)

**Scope:** This review covers the server-side project APIs used by the CERV2 module and adjacent modules, with emphasis on tenant isolation, license enforcement, auditability, and update safety. It summarizes current behavior after recent hardening and highlights remaining enterprise-grade gaps.

---

## 1) Current State (What is now enforced)

### ✅ Tenant Isolation & License Enforcement
- **Project list, read, create, update, and delete** routes now require a valid `organizationId` and enforce an **active license** before allowing access.
- **Client workspace scoping** can be applied at query time, preventing accidental cross-workspace exposure.

### ✅ Auditability for Lifecycle Events
- Project **create/update/delete** now emit **audit events** into `audit_events`, capturing:
  - `oldValues`, `newValues`, `changedFields`
  - actor metadata (`userName`, `userRole`, `ipAddress`, `userAgent`)
  - regulatory flags for compliance tracking

---

## 2) Remaining Gaps (Enterprise-Grade Expectations)

### A) Authentication & Identity
- **Missing server-side identity binding**: actor metadata is header-derived and not tied to authenticated user IDs.
- **No session enforcement**: routes rely on headers, not verified JWT/session data.

### B) Authorization (RBAC)
- **No resource-level permissions** beyond license checks.
- No enforcement of role-scoped actions (e.g., editor vs. reviewer vs. admin).

### C) Audit Integrity
- Audit events are non-blocking (good for availability) but could silently fail.
- No **tamper-evident hashing** or signature enforcement for regulated audit trails.

### D) Consistent Tenant Middleware
- Tenant parsing and validation should be centralized into middleware to prevent drift across routes.

### E) Data Validation & Schema Contracts
- Update schema allows partial project changes but doesn’t validate cross-field constraints.
- No validation for transitions (e.g., active → archived rules).

---

## 3) Next-Step Recommendations (Broad)

### Phase 0 (Immediate)
- Bind `organizationId` + `userId` from auth middleware and remove reliance on client headers.
- Add middleware for tenant + license enforcement to ensure consistent handling.
- Enforce workspace ownership on all mutating operations (create/update/delete).

### Phase 1 (Compliance)
- Implement audit hashing (e.g., hash chain) and require signatures for regulated transitions.
- Add “reason for change” input and persist it with updates.

### Phase 2 (RBAC)
- Add permission checks: `projects:read`, `projects:update`, `projects:delete`.
- Require explicit roles for destructive actions.

---

## 4) Risk Assessment

| Risk | Current State | Impact | Recommendation |
|------|---------------|--------|----------------|
| Header spoofing for actor metadata | Possible | Medium | Bind actor from auth session |
| Cross-tenant access | Mitigated | High | Move to middleware enforcement |
| Audit log integrity | Partial | High | Add tamper-evident chain + signatures |
| Unauthorized updates | Partial | High | RBAC enforcement |

---

## 5) Recommended Follow-On Tasks

1. Create a tenant + license enforcement middleware and apply across all project routes.
2. Introduce role-based checks on create/update/delete endpoints.
3. Add “reason for change” field to update endpoint and persist in audit metadata.
4. Bind actor metadata to authenticated user record from server-side auth.

---

**Status:** Review complete  
**Owner:** Platform Engineering  
**Revision:** 1.0
