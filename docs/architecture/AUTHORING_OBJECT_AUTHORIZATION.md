# Concept2Cure Authoring Object Authorization

**Status:** Proposed implementation in PR #1174  
**Owner:** Concept2Cure platform governance  
**Scope:** Canonical `/api/authoring` document and section mutations  
**Decision date:** 2026-07-27

## Decision

Concept2Cure authoring mutations use one durable, tenant-safe object-permission model. Organization membership authenticates tenant participation, but does not by itself authorize a user to modify a governed document or section.

The canonical authorization decision is derived from:

1. the authenticated tenant and principal;
2. the exact document or section being acted upon;
3. an active durable grant in `doc_permissions`, except for the narrowly defined platform-administrator override;
4. the requested action; and
5. the current document lifecycle state.

Mutation authorization is mandatory and fail closed. A missing permission table, incomplete constraint set, unavailable policy query, missing tenant context, or missing authenticated principal cannot fall through to a write.

## Why this decision exists

The prior authoring router contained an opt-in section-permission helper controlled by `AUTH_ENFORCE_SECTION_PERMS`. That control was not a reliable production boundary because it could be disabled, depended on a non-canonical schema shape, and included broad role shortcuts unrelated to the exact document.

A regulated authoring system needs attributable, reviewable authority over the precise object being changed. Tenant membership alone is too broad; a general QA or regulatory role must not silently confer editing authority over every document in the organization.

## Canonical data model

`doc_permissions` stores an attributable grant with:

- `tenant_id`;
- `doc_id`;
- optional `section_id`;
- `principal_id` and optional normalized email;
- role;
- grantor and grant reason;
- validity window;
- revocation actor, time, and reason; and
- creation/update timestamps.

Composite foreign keys structurally require:

- the declared document to belong to the declared tenant; and
- a section-scoped grant to reference a section belonging to that same document and tenant.

Row-level security is enabled and forced on the permission table. The table is part of the atomic authoring subsystem rather than an optional side migration.

## Role and action contract

| Permission role | View | Edit | Comment | Review | Approve | Manage permissions |
|---|---:|---:|---:|---:|---:|---:|
| `OWNER` | Yes | Yes | Yes | Yes | Yes | Yes |
| `AUTHOR` | Yes | Yes | Yes | No | No | No |
| `REVIEWER` | Yes | No | Yes | Yes | No | No |
| `APPROVER` | Yes | No | Yes | Yes | Yes | No |
| `VIEWER` | Yes | No | No | No | No | No |

Reviewer and approver authority is explicit. Broad organization roles such as QA or regulatory-affairs membership do not create document authority without a durable grant.

A platform administrator may exercise the documented global override. This override is intentionally narrow and must remain attributable through the existing authenticated actor and audit systems.

## Creator ownership

The database seeds a new document’s creator as both:

- `OWNER`, for permission administration and lifecycle authority; and
- `AUTHOR`, for ordinary content editing.

The seeding trigger runs in the same database operation that creates the document. Existing document creators are backfilled idempotently during migration.

A document must retain at least one active owner. The service refuses revocation of the final active owner.

## Lifecycle restrictions

Content edits are denied when a document is in an immutable or terminal state, including:

- `APPROVED`;
- `FROZEN`;
- `LOCKED`;
- `SUBMITTED`;
- `EFFECTIVE`;
- `SUPERSEDED`;
- `OBSOLETE`; or
- `ARCHIVED`.

Approval, review, and comment behavior remains separately action-gated so lifecycle-specific routes can enforce their own signature, workflow, and evidence rules after object authorization succeeds.

## Request enforcement sequence

For an authoring mutation:

1. the existing platform authentication and tenant middleware resolves the verified actor and organization;
2. `authoringObjectAuthorization` confirms the request targets the canonical authoring path;
3. the middleware resolves the exact tenant-consistent document or section;
4. the policy service obtains active, unexpired grants for the actor and scope;
5. the role/action matrix and lifecycle state produce an allow or deny decision;
6. only an allowed request reaches the existing authoring handler; and
7. the existing authoring audit, revision, signature, and workflow controls continue normally.

Expected denials are explicit:

| Condition | Response |
|---|---|
| Principal or tenant context missing | `401 AUTHORING_AUTHENTICATION_REQUIRED` |
| Object exists but actor lacks authority | `403 AUTHORING_OBJECT_FORBIDDEN` |
| Tenant-consistent object is not found | `404 AUTHORING_OBJECT_NOT_FOUND` |
| Document lifecycle disallows mutation | `409 AUTHORING_DOCUMENT_IMMUTABLE` |
| Authorization cannot be verified | `503 AUTHORING_AUTHORIZATION_UNAVAILABLE` |

## Permission administration API

The focused administration surface is:

- `GET /api/authoring/docs/:docId/permissions`;
- `POST /api/authoring/docs/:docId/permissions`; and
- `DELETE /api/authoring/docs/:docId/permissions/:permissionId`.

Only a document owner or platform administrator may use these routes. Grant and revoke activity is reflected into the central audit service with the actor, document, principal, role, scope, validity, and reason.

## Startup invariant

An enabled authoring capability must not mount when object authorization is partial. Startup verifies:

- `authoring_documents` exists;
- `doc_permissions` exists;
- role and validity constraints exist;
- tenant-consistent document and section foreign keys exist;
- the creator-seeding trigger exists; and
- row-level security is enabled and forced.

When the entire authoring subsystem is deliberately absent and configured optional, startup may continue without advertising a partially provisioned control. A mixed state remains a hard failure.

## Legacy-helper disposition

The legacy `AUTH_ENFORCE_SECTION_PERMS` helper is retired on the canonical production composition path. It remains physically present in the large legacy router only to avoid mixing router decomposition into this P0 security PR.

A later focused cleanup may delete the dead helper after caller and route-mount verification. It must not introduce another permission model.

## Security properties

The control is designed to preserve these invariants:

- default-deny mutations;
- no tenant identity from request body, query string, or arbitrary headers;
- no cross-tenant document or section grants;
- no implicit organization-wide QA/RA authoring access;
- no mutation when authorization storage is unavailable;
- no editing after an immutable lifecycle state;
- no ownerless document;
- attributable grants and revocations; and
- compatibility with existing audit, signature, revision, and workflow controls.

## Validation evidence

PR #1174 adds three proof layers:

1. real-DDL integration tests using the repository’s in-process PostgreSQL harness;
2. middleware negative tests for unauthorized, immutable, unauthenticated, and policy-unavailable requests; and
3. startup-invariant tests for missing tables, constraints, trigger, and forced RLS.

The PR remains draft until the repository’s blocking CI, typecheck, proof-tier, tenant-isolation, route-ownership, security-pattern, migration, and build gates are green.

## Deployment

1. Apply the atomic authoring subsystem migration.
2. Verify `doc_permissions`, composite constraints, creator trigger, and forced RLS.
3. Deploy the matching application revision.
4. Confirm the startup invariant passes.
5. Probe an authorized author edit, an unrelated same-tenant denial, an explicit reviewer action, an explicit approver action, and a policy-store failure.

## Rollback

The schema change is additive. The safe rollback is to roll back the application or temporarily disable the authoring capability while retaining permission data.

Dropping `doc_permissions` while the new application revision is active is prohibited because the startup invariant will fail and because bypassing the table would reopen the original authorization defect. Forward repair is preferred when a migration is partially attempted; atomic subsystem provisioning rolls back failed transactions.

## Deliberate non-goals

This decision does not cover:

- AnA command authorization;
- OpenAI provider-adapter modernization;
- collaboration-provider replacement;
- authoring UI redesign;
- broad read-visibility redesign;
- dependency upgrades;
- CI-policy changes;
- migration-authority consolidation; or
- deletion of legacy authoring routes.
