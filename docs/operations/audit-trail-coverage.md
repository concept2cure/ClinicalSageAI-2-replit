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
| **Authoring section save**                          | `POST /api/authoring/sections/:id`                | `authoring.section.<op>`                 | ✓      | Final PR. Dual-write helper reflects `authoring_audit_trail` rows into central `audit_logs` with hashes only (full content stays in the rich table). |
| **510(k) workflow stage transition**                | `POST /api/510k-workflow/:projectId`              | `k510_workflow.transition`               | ✓      | Final PR. |
| **510(k) module pre-flight**                        | `POST /api/authoring-actions/module-preflight`    | `k510_workflow.preflight`                | ✓      | Final PR. Captures overall + blocker count. |
| **510(k) dossier pre-flight**                       | `POST /api/authoring-actions/dossier-preflight`   | `k510_workflow.preflight`                | ✓      | Final PR. |
| **510(k) ESG transmit**                             | `POST /api/510k/:projectId/esg/submit`            | `k510_workflow.transmit` / `..transmit.failed` | ✓ | Failed transmits logged separately. |
| **Predicate intelligence candidate status**         | `PATCH /api/predicate-intelligence/candidates/:id/status` | `predicate.candidate.status`     | ✓      | Final PR. Logged on 2xx upstream response via `logProxyMutation` helper. |
| **SE matrix patch**                                 | `PATCH /api/predicate-intelligence/se-matrix/:id` | `se_matrix.patch`                        | ✓      | Final PR. Same proxy-reflection pattern. |
| **Regulatory correspondence ingest**                | `POST /api/regulatory-correspondence/correspondence/intake` | `correspondence.ingest`        | ✓      | Issue + blocker counts captured. |
| **Response package compile**                        | `POST /api/regulatory-correspondence/response-packages` | `correspondence.response.compile`  | ✗      | Still gated on Claude Design brief #2; will land with the surface. |
| **Vault upload**                                    | `POST /api/vault/documents`                       | `vault.upload`                           | ✓      | Captures size, mime, classification, programId. |
| **Reviewer simulation run**                         | `POST /api/regulatory-graph/programs/:p/reviewer-simulation` | `reviewer_simulation.run`     | ✓      | Persisted runs only (dry runs not logged). |
| **Decision lineage write**                          | `POST /api/decision-lineage/...`                  | `decision_lineage.write`                 | ✓      | Pre-existing. |
| **Authentication events**                           | `/api/auth/login`, `/api/auth/refresh`, etc.      | `auth.login.success` / `auth.login.fail` etc. | ✓ | Pre-existing via `auth_audit_log` + `auditService`. |
| **Tenant data export**                              | `GET /api/tenant-export`                          | `tenant.export`                          | ✓      | Off-boarding artifact. Captures resource counts in details. |
| **Tenant attestation generate**                     | `GET /api/tenant-export/attestation`              | `tenant.attestation.generate`            | ✓      | HMAC-signed hash-chain integrity report. Captures attestation verdict (INTACT / BROKEN / EMPTY). |
| **AnA-initiated Q-Sub create**                      | AnA tool `q_sub.create` (chat)                    | `agent.ana.q_sub.create`                 | ✓      | Confirm + reason required. Reason captured in `details.agentReason`; `details.actorKind = 'agent:ana'`. |
| **AnA-initiated Q-Sub commitment toggle**           | AnA tool `q_sub.commitment.set_rolled_in`         | `agent.ana.q_sub.commitment.rolled_in` / `..rolled_out` | ✓ | Confirm + reason required. |
| **AnA-initiated section approve**                   | AnA tool `section.approve`                        | `agent.ana.section.approve`              | ✓      | Confirm + reason required. |
| **AnA-initiated pre-flight**                        | AnA tool `k510_workflow.preflight`                | `agent.ana.k510_workflow.preflight`      | ✓      | Read-only — no confirmation required. |
| **AnA-initiated ESG transmit**                      | AnA tool `k510_workflow.transmit`                 | `agent.ana.k510_workflow.transmit` / `..transmit.failed` | ✓ | Strict gate: confirm='yes-transmit' + reason ≥ 30 chars. |
| **AnA-initiated GSPR mapping upsert**               | AnA tool `gspr.mapping.upsert`                    | `agent.ana.gspr.mapping.upsert`          | ✓      | Confirm + reason. |
| **AnA-initiated post-market doc create**            | AnA tool `post_market.document.create`            | `agent.ana.post_market.document.create`  | ✓      | Confirm + reason. |
| **AnA-initiated post-market doc approve**           | AnA tool `post_market.document.approve`           | `agent.ana.post_market.document.approve` / `..approve.blocked` | ✓ | Blocked attempts also logged. |
| **AnA-initiated evidence-sufficiency assess**       | AnA tool `evidence_sufficiency.assess`            | `agent.ana.evidence_sufficiency.assess`  | ✓      | Confirm + reason; never dry-run. |
| **AnA-initiated reviewer simulation**               | AnA tool `reviewer_simulation.run`                | `agent.ana.reviewer_simulation.run`      | ✓      | Confirm + reason; persisted run. |
| **AnA-initiated predicate candidate status**        | AnA tool `predicate.candidate.set_status`         | `agent.ana.predicate.candidate.status`   | ✓      | Proxies through BFF to Python shadow; logs after upstream 2xx. |
| **AnA-initiated SE matrix patch**                   | AnA tool `se_matrix.patch`                        | `agent.ana.se_matrix.patch`              | ✓      | Proxies through BFF to Python shadow; logs fieldsChanged in details. |
| **AnA-initiated post-market doc update**            | AnA tool `post_market.document.update`            | `agent.ana.post_market.document.update`  | ✓      | Confirm + reason. |
| **AnA-initiated post-market doc validate**          | AnA tool `post_market.document.validate`          | `agent.ana.post_market.document.validate`| ✓      | Confirm + reason; lightweight, but the validation event is itself audited. |
| **AnA-initiated post-market doc supersede**         | AnA tool `post_market.document.supersede`         | `agent.ana.post_market.document.supersede`| ✓     | Confirm + reason. |
| **AnA tool policy update**                          | `PUT /api/ana-tool-policy`                        | `ana_tool_policy.update`                 | ✓      | Admin-only; previous + new policy captured in details so an auditor can replay the timeline. |

### `details.reasonReferencedArtifact` soft signal

Every `agent.ana.*` audit row carries a boolean
`details.reasonReferencedArtifact` flag. The shared gate at
`server/services/ana-ri/mdx-tool-policy.ts` runs the user-supplied
reason through a regex bank that detects citations of section numbers
(§6.1), Q-numbers (Q251142), K-numbers (K212284), commitment codes
(cm-1142-3), ISO / ASTM / CFR standards, and dates. Reasons that cite
at least one set the flag to `true`. Reasons that pass length checks
but cite nothing (e.g. "because the user asked") get `false`.

The flag is an audit signal, not a refusal — it lets an auditor filter
for low-quality justifications via:

```sql
SELECT created_at, action, details->>'agentReason' AS reason, user_id
FROM audit_logs
WHERE action LIKE 'agent.ana.%'
  AND details->>'reasonReferencedArtifact' = 'false';
```

To make use of the flag, every handler should pass it through:
`details.reasonReferencedArtifact: gate.reasonReferencedArtifact === true`.
As of this PR, `q_sub.create` is the canonical example; the remaining
handlers will be back-filled in a follow-up.

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

All high-value Part 11 paths are ✓ as of the final closure PR. Audit
coverage is now complete for every BETA-relevant governed mutation
except `correspondence.response.compile`, which is gated on Claude
Design brief #2 — the audit call will land alongside the surface.

The cross-cutting contract test
(`server/__tests__/security/audit-trail-contract.test.ts`) is the
regression net: any future PR that removes or forgets an audit call will
fail the test and surface the missing action code by name.

Remaining open items (none gate BETA):

1. **`correspondence.response.compile`** — landing alongside Brief #2.
2. **Vault upload + reviewer simulation** — listed as `?` in the table
   above; verify in a follow-up PR by reading the existing handlers.
3. **Audit-log retention policy** — define how long `audit_logs` and the
   tamper-proof chain are retained. Tracked under B7 hardening.
