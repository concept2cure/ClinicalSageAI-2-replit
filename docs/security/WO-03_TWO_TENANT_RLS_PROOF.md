# WO-03 — two-tenant RLS proof

The executable proof is `tests/db/two-tenant-application-rls.dbtest.ts`. It runs
after the normal blank-database installer and deploy migration, connects the
application pool through `APP_DATABASE_URL`, authenticates real JWTs, re-checks
real `organization_users` membership, and lets the production request-scope
middleware set and clear the Postgres tenant settings.

## Coverage matrix

| Domain / entry point                                                             | Attack                                                   | Expected result                                                | Observed assertion                       |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| Projects (`GET /proof/projects`)                                                 | list and attacker-controlled `q` filter                  | A row only; foreign filter empty                               | 200 with A id; B id absent / empty       |
| Project context (`GET /actual/mdx/projects/:id/industry-profile`)                | normal product endpoint with Tenant B program id         | null-safe not found in caller's tenant                         | A profile returned; B profile is `null`  |
| Saved precedent queries (`GET`/`PATCH`/`DELETE /actual/saved-precedent-queries`) | normal regulatory-content list and cross-tenant mutation | B absent; mutations indistinguishable not found                | B absent; 404/404; B row survives        |
| Projects (`GET`/`HEAD /proof/projects/:id`)                                      | direct-id read and existence probe                       | indistinguishable not found                                    | 404 / 404                                |
| Projects (`PATCH`/`DELETE`)                                                      | cross-tenant mutation                                    | indistinguishable not found; row survives                      | 404 / 404; B subsequently reads 200      |
| All three domains (`POST`)                                                       | forge a row carrying Tenant B's organization id          | `WITH CHECK` denial, opaque response, no row planted           | 404 with generic error only              |
| Documents (same verbs)                                                           | authored/regulatory content read, infer, update, delete  | same contract                                                  | same executable assertions               |
| Audit logs (same verbs)                                                          | sensitive operational-record read, infer, update, delete | same contract                                                  | same executable assertions               |
| Runtime/catalog                                                                  | superuser, `BYPASSRLS`, enforcement, RLS/force/policy    | false, false, `on`, true, true, policy count > 0               | exact catalog assertions                 |
| Pool reuse                                                                       | A request, B request, raw checkout                       | no tenant or role remains on checkout; no rows visible         | empty GUCs and zero visible fixture rows |
| Negative controls                                                                | Tenant B context; owner query (controlled, read-only)    | B sees only B; owner sees both, so wrong/missing scoping fails | B-only ids; owner count = 2              |

The API proof returns only identifiers and generic error codes. Sensitive
fixture bodies are never serialized into responses, assertion messages, or
logs.

## Execution status

A proof only counts once the suite has actually run. As merged, this suite had
zero completed executions: the PR landed before any check started, its only CI
runner (Integration Tests → `npm run test:db`) was skipped on the composed
branch's unrelated Lint failures, and its original teardown ran a bare
`DELETE FROM audit_logs` that the deploy path's append-only trigger
(`trg_audit_logs_no_delete`, P0A02) aborts — so its first real run would have
failed. The teardown now uses the trigger's authorized
`app.audit_archive_bypass` door like the sibling dbtest suites. Cite a specific
green Integration Tests run on `concept2cure-v2`, not this document, as the
evidence that the proof has executed.

## Residual risk

This is a representative proof, not an enumeration of every tenant entry
point. Project, document, and audit-log rows cover the project/workspace,
authored/regulatory, and sensitive operational classes. Other tenant tables,
background jobs, system-scope admin routes, UUID-native policies, websocket
paths, exports, object storage, search indexes, caches, and third-party
connectors remain outside this work order and require their own entry-point
tests. Static RLS coverage CI continues to detect newly provisioned tenant
tables that lack a policy.
