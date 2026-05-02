# Audit trail — governed-mutation coverage map

**Status:** Living document. **Owner:** Backend stream. **Last revised:** 2026-05-01.

## Why this exists

21 CFR Part 11 §11.10(e) demands an "independent, time-stamped, tamper-
evident audit trail" for every governed mutation. This file maps each
BETA-relevant mutation surface to its audit coverage so an auditor — or
the next backend engineer — can verify the trail is complete in one pass.

The central writer is `auditService.logAction` (`server/services/auditService.ts`),
which dual-writes:

1. The Drizzle `audit_logs` table (queryable via ORM).
2. The tamper-proof hash-chain log via `TamperProofAuditLog`.

Action codes follow the pattern `<resource>.<verb>` (lowercase, dot-
separated). The verb is the business event, not the HTTP verb.

## Coverage table

Status legend:
- ✓ — covered, action code listed, BETA-ready
- ◐ — partial (separate audit table, e.g. `authoring_audit_trail`); needs central reflection
- ✗ — gap; must close before BETA

| Surface                                             | Path                                              | Action code                              | Status | Notes |
|-----------------------------------------------------|---------------------------------------------------|------------------------------------------|--------|-------|
| **Q-Submission create**                             | `POST /api/q-sub`                                 | `q_sub.create`                           | ✓      | Q-Sub PR. |
| **Q-Sub commitment rolled-in toggle**               | `PATCH /api/q-sub/commitments/:id/rolled-in`      | `q_sub.commitment.rolled_in` / `..rolled_out` | ✓ | Q-Sub PR. |
| **E-signature sign event**                          | `POST /api/esignature/sign`                       | `esignature.sign`                        | ✓      | Hash + IP + UA in details. |
| **Evidence Sufficiency assess (persisted)**         | `POST /api/evidence-sufficiency/programs/:programId/assess` | `evidence_sufficiency.assess`  | ✓ | Dry runs are NOT logged. |
| **eSTAR / 510(k) section create**                   | `POST /api/cerv2-sections/`                       | `section.create`                         | ✓      | This PR. |
| **eSTAR / 510(k) section edit**                     | `PATCH /api/cerv2-sections/:sectionId`            | `section.edit`                           | ✓      | This PR. Reflects `cerv2_section_versions` into central log. |
| **eSTAR section approval / sign-off**               | `PATCH /api/cerv2-sections/:sectionId` (status → validated/approved) | `section.approve`     | ✓      | This PR. Fires only on transition into approval state. |
| **eSTAR section delete**                            | `DELETE /api/cerv2-sections/:sectionId`           | `section.delete`                         | ✓      | This PR. |
| **GSPR mapping upsert**                             | `POST /api/gspr/programs/:programId/mappings`     | `gspr.mapping.upsert`                    | ✓      | This PR. |
| **Post-Market document create**                     | `POST /api/post-market/programs/:programId/documents` | `post_market.document.create`        | ✓      | This PR. |
| **Post-Market document update**                     | `PATCH /api/post-market/documents/:id`            | `post_market.document.update`            | ✓      | This PR. |
| **Post-Market document approve**                    | `POST /api/post-market/documents/:id/approve`     | `post_market.document.approve` / `..approve.blocked` | ✓ | This PR. Blocked attempts logged separately. |
| **Post-Market document validate**                   | `POST /api/post-market/documents/:id/validate`    | `post_market.document.validate`          | ✓      | This PR. |
| **Post-Market document supersede**                  | `POST /api/post-market/documents/:id/supersede`   | `post_market.document.supersede`         | ✓      | This PR. |
| **Authoring section save**                          | `POST /api/authoring/sections/:id`                | `authoring.section.save`                 | ◐      | Writes `authoring_audit_trail`; central reflection still TODO. |
| **510(k) workflow stage transition**                | `POST /api/510k-workflow/transition`              | `k510_workflow.transition`               | ✗      |       |
| **510(k) pre-flight invocation**                    | `POST /api/510k-workflow/preflight`               | `k510_workflow.preflight`                | ✗      |       |
| **510(k) ESG transmit**                             | `POST /api/510k/:projectId/esg/submit`            | `k510_workflow.transmit` / `..transmit.failed` | ✓ | This PR. Failed transmits logged separately for the audit timeline. |
| **Predicate intelligence candidate status**         | `PATCH /api/predicate-intelligence/candidates/:id/status` | `predicate.candidate.status`     | ✗      | Currently a proxy passthrough; the BFF should log even when the shadow handles the write. |
| **SE matrix patch**                                 | `PATCH /api/predicate-intelligence/se-matrix/:id` | `se_matrix.patch`                        | ✗      |       |
| **Regulatory correspondence ingest**                | `POST /api/regulatory-correspondence/correspondence/intake` | `correspondence.ingest`        | ✓      | This PR. Issue + blocker counts captured in details. |
| **Response package compile**                        | `POST /api/regulatory-correspondence/response-packages` | `correspondence.response.compile`  | ✗      |       |
| **Vault upload**                                    | `POST /api/vault/upload`                          | `vault.upload`                           | ?      | Verify in follow-up. |
| **Reviewer simulation run**                         | `POST /api/regulatory-graph/reviewer-simulations` | `reviewer_simulation.run`                | ?      | Verify in follow-up. |
| **Decision lineage write**                          | `POST /api/decision-lineage/...`                  | `decision_lineage.write`                 | ✓      | Pre-existing. |
| **Authentication events**                           | `/api/auth/login`, `/api/auth/refresh`, etc.      | `auth.login.success` / `auth.login.fail` etc. | ✓ | Pre-existing via `auth_audit_log` + `auditService`. |

## Action-code taxonomy

### Resource prefixes (canonical)

```
q_sub                  Q-Submission family
esignature             21 CFR Part 11 e-signature
evidence_sufficiency   Pillar-scoring assessment
section                eSTAR / 510(k) / CER section
authoring              Section authoring (separate table today; reflect here)
gspr                   GSPR Annex I mapping
post_market            Post-market documents (PMS, PMCF, complaints)
k510_workflow          510(k) workflow state machine
predicate              Predicate-intelligence write (proxy + write reflection)
se_matrix              Substantial Equivalence matrix
correspondence         Regulatory correspondence (AI letters)
reviewer_simulation    Red-team reviewer simulation
vault                  Document vault writes
decision_lineage       Governance decisions
auth                   Authentication events
```

### Verbs (canonical)

`create | update | delete | save | approve | validate | transition |
preflight | transmit | sign | rolled_in | rolled_out | compile | ingest |
upsert | patch | run | login.success | login.fail`

Custom verbs are allowed; record them here and reuse before inventing new ones.

## Required fields per audit-log call

When `auditService.logAction` is called from a route handler, supply at minimum:

```ts
auditService.logAction({
  tenantId: req.user.organizationId,            // REQUIRED — never null
  userId: req.user.id,                          // REQUIRED unless system action
  action: 'resource.verb',                      // REQUIRED — from taxonomy above
  resourceType: 'snake_case_resource_kind',     // REQUIRED
  resourceId: String(idOfThingChanged),         // REQUIRED
  ipAddress: req.ip,                            // RECOMMENDED
  userAgent: req.headers['user-agent'],         // RECOMMENDED
  details: { /* business-meaningful diff */ },  // RECOMMENDED — never include secrets
});
```

Calls are **fire-and-forget** by default (`void auditService.logAction(...)`).
The audit writer never throws and never blocks the response, so a transient
audit-write failure must not surface to the user. Failures are captured in
the `audit-service` logger.

## Test invariant

A future cross-cutting test should run every governed mutation against a
seeded fixture and assert exactly one `audit_logs` row was written per
mutation, with the canonical action code. That test does not exist yet —
it lands as part of C7 closure.

## Closure plan

The high-value Part 11 paths (transmit, section approve, post-market
approve, correspondence ingest) and all post-market / GSPR mutations
landed in the second backend PR. What remains:

1. **510(k) workflow stage transitions + pre-flight** — `k510_workflow.transition`
   and `k510_workflow.preflight`. Find the current handlers (likely on
   `510k-workflow-routes.ts`) and add the same pattern as the transmit
   handler. ~0.5 day.
2. **Predicate-intelligence proxy reflection** — `predicate.candidate.status`
   and `se_matrix.patch`. The BFF currently forwards to the shadow without
   logging; add a log call after a 2xx response. ~0.5 day.
3. **Response package compile** — `correspondence.response.compile`. Add
   the audit call once the response surface lands (gated on Claude Design
   brief #2). ~0.25 day during that PR.
4. **Authoring audit-trail dual-write** — reflect `authoring_audit_trail`
   into the central `audit_logs` via a service-side helper. ~0.5 day.
5. **Cross-cutting per-mutation test** — assert every governed mutation
   writes one (and only one) `audit_logs` row. ~1 day.

Total remaining to fully ✓: ~2-3 days, owner TBD.
