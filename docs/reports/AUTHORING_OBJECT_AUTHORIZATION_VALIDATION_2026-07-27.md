# Authoring Object Authorization Validation Report

**Date:** 2026-07-27  
**Branch:** `openai/authoring-object-auth-p0-v2`  
**Pull request:** #1176  
**Status:** Draft; blocking CI and human security/compliance review pending

## Purpose

Record exactly what has been implemented and what has—and has not—been verified for the Concept2Cure authoring object-authorization P0.

This report is evidence bookkeeping, not a release declaration. A check is marked complete only when the repository contains direct code/test evidence. Runtime and full-suite claims remain pending until GitHub CI reports them.

## What changed

| Control area | Implementation |
|---|---|
| Durable authority | `doc_permissions` stores tenant-, document-, optional section-, principal-, role-, validity-, grant-, and revocation-level evidence |
| Tenant integrity | Composite foreign keys bind permissions to the declared tenant, document, and section |
| Creator authority | Database trigger seeds each document creator as `OWNER` and `AUTHOR` |
| Role boundaries | One canonical role/action matrix separates author, reviewer, approver, viewer, and owner authority |
| Mutation enforcement | Mandatory middleware evaluates exact object authority before legacy authoring mutation handlers run |
| Failure behavior | Missing actor/tenant, missing authority, immutable lifecycle, missing object, and unavailable policy storage have explicit deny outcomes |
| Permission administration | Owner/admin list, grant, and revoke endpoints expose attributable permission management |
| Readiness | Startup invariant refuses partial permission schema, constraints, trigger, or forced RLS |
| Documentation | `docs/architecture/AUTHORING_OBJECT_AUTHORIZATION.md` defines the canonical control contract |

## Code-derived invariants reviewed

The implementation directly expresses these invariants:

- authenticated organization membership does not itself confer authoring authority;
- mutation authorization is not feature-flag optional;
- authorization failure cannot fall through to a mutation;
- reviewer and approver authority requires a durable object grant;
- broad QA/RA organization roles do not confer implicit editing rights;
- a section-scoped grant cannot point at a section from another tenant or document;
- a document creator receives attributable owner and author grants in the database operation;
- a document retains at least one active owner;
- immutable lifecycle states reject content edits; and
- permission grants and revocations are attributable and reflected into the central audit service.

## Test evidence added

### Real-DDL integration suite

File: `server/services/authoring/__tests__/authoring-object-permissions.integration.test.ts`

Covered scenarios:

- creator `OWNER` and `AUTHOR` seeding;
- creator edit and permission-management authority;
- same-tenant unrelated-user denial;
- explicit reviewer and approver grants;
- no reviewer/approver edit escalation;
- section-scope isolation;
- cross-tenant foreign-key rejection;
- immutable-document edit denial; and
- final-owner protection.

### Middleware negative suite

File: `server/middleware/__tests__/authoringObjectAuthorization.test.ts`

Covered scenarios:

- non-authoring API requests are ignored by the shared `/api` mount;
- document creation reaches the database creator-seeding path;
- authorized author mutation succeeds;
- unrelated same-tenant mutation is denied;
- reviewer comment/review authority does not become edit authority;
- approver action authority does not become edit/delete authority;
- immutable document mutation is rejected;
- policy-store failure returns a fail-closed 503;
- missing verified principal or tenant context is rejected; and
- safe reads are not reclassified as mutations.

### Startup-invariant suite

File: `server/startup/__tests__/authoringAuthorizationInvariant.test.ts`

Covered scenarios:

- complete permission control passes;
- missing permission table fails;
- missing tenant-consistent constraints fail;
- missing creator-seeding trigger fails;
- missing enabled/forced RLS fails; and
- a deliberately absent optional authoring capability is distinguished from a partially provisioned one.

## Static review completed

- Root `AGENTS.md` was reviewed.
- No production dependency was added.
- No UI or navigation surface was changed.
- No direct LLM/provider client was added.
- No experimental service writes to regulated authoring tables.
- Existing audit, revision, workflow, signature, and authoring handlers remain in place after the new authorization boundary.
- The replacement PR is cut from known-good commit `33c89caff267a95b4829c6c710793c038c3a300c`.
- Superseded PR #1174 was closed after its branch tip was damaged by an erroneous connector overwrite; that damaged tip is explicitly excluded from review and merge.

## CI evidence pending

The following must be populated from GitHub checks before PR #1176 is made ready:

| Gate | Status | Evidence |
|---|---|---|
| Danger / PR policy | Pending | Fresh run required on PR #1176 head |
| Migration header guard | Pending | GitHub Actions |
| Duplicate-table DDL guard | Pending | GitHub Actions |
| Unbacked-table guard | Pending | GitHub Actions |
| Security-pattern guard | Pending | GitHub Actions |
| Proof tier | Pending | Schema contracts + golden journeys |
| Tenant column/type and isolation gates | Pending | GitHub Actions |
| Route ownership/mount audit | Pending | GitHub Actions |
| Typecheck no-regression | Pending | GitHub Actions |
| ESLint | Pending | GitHub Actions |
| Full test suite | Pending | GitHub Actions with PostgreSQL service |
| Production build | Pending | GitHub Actions |
| Human security/compliance review | Pending | Required reviewer approval |

## Deployment validation still required

Before release, exercise these probes against the migrated deployment:

1. document creator edits an owned section successfully;
2. unrelated user in the same tenant receives 403;
3. explicit reviewer can review/comment but cannot edit;
4. explicit section approver can approve that section but cannot edit;
5. user from another tenant cannot resolve or link the object;
6. approved/frozen document rejects edit with 409;
7. unavailable permission store rejects mutation with 503; and
8. grant and revoke events appear in the central audit trail.

## Known limitations and follow-up

- This P0 governs mutations. Safe-read visibility continues through existing route and tenant controls.
- The legacy opt-in helper remains physically present in the large authoring router but is forced inert on the canonical composition path. Deletion belongs in a separate router-decomposition PR after caller and mount verification.
- `server/db/ensureCoreTables.ts` retains its older authoring table-count description. The new dedicated startup invariant is the binding fail-closed authorization check in this PR. Synchronizing the general diagnostics list should be a small follow-up performed with a real patch-capable worktree, not a risky whole-file connector rewrite.
- Production-copy migration rehearsal and human security/compliance approval remain open release gates.

## Release conclusion

**Not ready to merge.** The code and targeted test evidence are present, but full repository CI, deployment probes, production-copy migration rehearsal, and human security/compliance approval remain outstanding.
