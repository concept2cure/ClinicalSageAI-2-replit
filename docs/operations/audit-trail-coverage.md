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
| **Q-Submission create**                             | `POST /api/q-sub`                                 | `q_sub.create`                           | ✓      | This PR. |
| **Q-Sub commitment rolled-in toggle**               | `PATCH /api/q-sub/commitments/:id/rolled-in`      | `q_sub.commitment.rolled_in` / `..rolled_out` | ✓ | This PR. |
| **E-signature sign event**                          | `POST /api/esignature/sign`                       | `esignature.sign`                        | ✓      | This PR. Hash + IP + UA in details. |
| **Evidence Sufficiency assess (persisted)**         | `POST /api/evidence-sufficiency/programs/:programId/assess` | `evidence_sufficiency.assess`  | ✓ | This PR. Dry runs are NOT logged. |
| **eSTAR / 510(k) section edit**                     | `POST/PATCH /api/cerv2-sections/...`              | `section.edit`                           | ✗      | Missing in route layer. Add via service-side wrapper. |
| **eSTAR section approval / sign-off**               | `POST /api/cerv2-sections/:id/approve`            | `section.approve`                        | ✗      | Required for OQ §W2 step 5. |
| **GSPR mapping upsert**                             | `POST /api/gspr/programs/:programId/mappings`     | `gspr.mapping.upsert`                    | ✗      | One mutation; ~10 LOC to add. |
| **Post-Market document create**                     | `POST /api/post-market/documents`                 | `post_market.document.create`            | ✗      |       |
| **Post-Market document update**                     | `PATCH /api/post-market/documents/:id`            | `post_market.document.update`            | ✗      |       |
| **Post-Market document approve**                    | `POST /api/post-market/documents/:id/approve`     | `post_market.document.approve`           | ✗      | High priority — Part 11. |
| **Post-Market document validate**                   | `POST /api/post-market/documents/:id/validate`    | `post_market.document.validate`          | ✗      |       |
| **Authoring section save**                          | `POST /api/authoring/sections/:id`                | `authoring.section.save`                 | ◐      | Writes `authoring_audit_trail`; needs reflection in central `audit_logs`. |
| **510(k) workflow stage transition**                | `POST /api/510k-workflow/transition`              | `k510_workflow.transition`               | ✗      |       |
| **510(k) pre-flight invocation**                    | `POST /api/510k-workflow/preflight`               | `k510_workflow.preflight`                | ✗      |       |
| **510(k) ESG transmit**                             | `POST /api/510k-workflow/transmit`                | `k510_workflow.transmit`                 | ✗      | Most consequential mutation in the system. Must be ✓ before BETA. |
| **Predicate intelligence candidate status**         | `PATCH /api/predicate-intelligence/candidates/:id/status` | `predicate.candidate.status`     | ✗      | Currently a proxy passthrough; the BFF should log even when the shadow handles the write. |
| **SE matrix patch**                                 | `PATCH /api/predicate-intelligence/se-matrix/:id` | `se_matrix.patch`                        | ✗      |       |
| **Regulatory correspondence ingest**                | `POST /api/regulatory-correspondence/ingest`      | `correspondence.ingest`                  | ✗      |       |
| **Response package compile**                        | `POST /api/regulatory-correspondence/responses/compile` | `correspondence.response.compile`  | ✗      | Cover-letter §-pull this PR — caller path still needs the audit. |
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

To take this map from the current "✓ where I touched / ✗ everywhere else"
state to fully ✓:

1. **W6** — Add audit calls for the high-value Part 11 paths still ✗:
   `section.approve`, `post_market.document.approve`,
   `k510_workflow.transmit`, `correspondence.ingest`. ~1 day.
2. **W7** — Add audit calls for the ✗ medium-value paths:
   `gspr.mapping.upsert`, all post-market document mutations, predicate
   candidate status, SE matrix patch, response.compile. ~2 days.
3. **W8** — Reflect `authoring_audit_trail` writes into the central
   `audit_logs` table via a dual-write helper. ~0.5 day.
4. **W9** — Land the cross-cutting test that asserts every governed
   mutation writes one (and only one) audit row. ~1 day.

Total to fully ✓: ~4-5 days, owner TBD.
