# RR1a — the review route's server half (D2, 2026-10-29)

Slice RR1a of `docs/design/REVIEW_ROUTING_2026-10-23.md` (committed at `9995d10e6`). Launch row **D2**, Veeva gap 4. Server only: **no visible change** (the form and `REVIEW_ROUTE_REQUIRED` are RR1b). Split at the guard as §6 allows:

| Commit | What |
|---|---|
| `ee4e7d3c7` | RR1a-i: migration, route columns, the guard on every task writer and create path, `createTaskInTx`/`assignTaskInTx`, sweep and my-work |
| `153952507` | RR1a-i reds (writers, create paths, trigger) |
| `3ecb4cda4` | RR1a-ii: route header writer, `routeStanding`, `validateRouteMember`, Vault send / routed sign / withdraw / return / exits, round read |
| `7b388ee8d` | Complexity refactor, no behaviour change |
| this commit | Evidence |

## What already exists

Every piece below was found and reused or extended; nothing was rebuilt beside itself.

| Existing piece | Path | Today | What RR1a did |
|---|---|---|---|
| Task store | `unified_tasks` (`shared/schema.ts`) | inbox, assignee, due date, reminders | Five route columns; a route member is a task row (design §2.1) |
| Task create | `POST /api/tasks/tasks` (`server/routes/taskManagement.routes.ts`) | insert + `task.create` row on one tx | Extracted to `createTaskInTx` (`server/services/tasking/create-task.ts`); the route calls it |
| Reassignment | `assignTask` (`server/services/tasking/task-assignment.ts`) | named / workload handoff | Extracted `assignTaskInTx`; every handoff now clears the due-soon/overdue markers (B11) |
| State machine | `server/services/tasking/task-state-machine.ts` | legal transitions | `isRouteTask`, `refuseRouteTaskWrite`, `refuseRouteColumnsInInput` |
| Every generic task writer | PATCH status, PATCH assign, auto-assign, DELETE, dependencies, link (`unifiedTaskService.linkTasks`, under its lock), regulatory status, AnA update (`server/services/ana-ri/command-executor.ts`), cascade (`task-side-effects.ts`) | wrote any row they could admit | Each refuses a route member (409 `ROUTE_TASK_OWNED_BY_ROUTE`); the cascade skips it |
| Create paths | POST /tasks, bulk, from-template, `createUnifiedTask`/POST /unified, AnA create, rules `create_task`, blueprint milestones | silently dropped or would spread unknown keys | Each refuses input naming a route column (400 `ROUTE_COLUMNS_NOT_ADMITTED`) |
| Due sweep / my work | `server/jobs/taskDueSweep.ts`, `server/services/tasking/my-work.ts` | swept and triaged blocked tasks | A blocked route member is not reminded and reads `waitingOn` |
| Task project | `server/services/tasking/task-project.ts` | `authoring_document` only | `canonical_document` tells its program's project |
| Vault lifecycle routes | `server/routes/document-lifecycle.ts` | start, `/sign` (review only), `/advance` | Routed `/sign`, route on `advance {to:'in_review'}`, `ROUTE_APPROVAL_BY_SIGN`, `/:id/review-route`, `/withdraw`, `/return` (`document-lifecycle-review-route.ts`) |
| Signing ceremony | `signingPrecheck`, `reverifiedSigner`, `recordLifecycleSignature` in the router | one ceremony | Reused as-is, handed to the routed sign-off; the signature payload carries `routeId` |
| Review sign-off column | `canonical_documents.review_signature`, `recordReviewSignature`, `reviewSignatureRefusal` (`canonicalDocumentStore.ts`) | one per round | Unchanged: the review-*completing* signature is written there, so the gate and every reader keep their meaning |
| Orchestrator | `documentLifecycleOrchestrator.ts` | pure transitions | Unchanged; the last approval advances through it with `applySignature` returning the recorded signature |
| Approver SoD | `vaultApprovalRefusal` (`vault-lifecycle-record.ts`) | the round's recorded reviewer | Covers every review signature on the content digest from any route (B9) |
| Authorship | `resolveTargetAuthors` (`separation-of-duties.ts`) | creator and uploader | Reused by `validateRouteMember` |
| Signing authority | `isSigningAuthorized` | org-role policy | Reused (`MEMBER_CANNOT_SIGN`) |
| Project access | `readProgramAnchorRow`, `canAccessReportProject` | the admission `assignTask` uses | Reused (`MEMBER_NO_PROJECT_ACCESS`) |
| Governed ledger | `recordGovernedAction` | chained pair | `review-route.send/.withdraw/.return` on the subject |
| Check-in | `vault-version-checkin.ts`, `vault-ingest.service.ts` | new version supersedes head | Withdraws the head's open route, "Superseded by version N" |
| Lifecycle read | `readVaultLifecycles` (`server/services/vault/vault-lifecycle.ts`) | stage, one review, one approval | Adds `round` (every member, printed names, signatures' meaning/UTC time, this org only) |

New files, each the one implementation of its capability: `migrations/20261023_review_routes.sql`, `server/services/review/review-route.ts` (writes), `review-route-standing.ts` (reads), `review-route-member.ts` (validator), `server/routes/document-lifecycle-review-route.ts` (the routed handlers).

## Red → green

| Behaviour | Test | Red | Green |
|---|---|---|---|
| PATCH status, PATCH assign, auto-assign, DELETE, dependencies (each end), cascade skip | `server/routes/__tests__/route-task-guard.pglite.integration.test.ts` | `red/guard-writers-and-creates.txt` | `green/guard-and-unit.txt` |
| Regulatory status, link (each end), POST /unified, `createUnifiedTask` | `route-task-guard-unified.pglite.integration.test.ts` | same | same |
| AnA update, AnA create, rules `create_task`, blueprint milestones | `server/services/ana-ri/__tests__/route-task-guard-creators.pglite.integration.test.ts` | same + `red/guard-rules-create-task.txt` | same |
| POST /tasks, bulk, from-template | `route-task-guard.pglite.integration.test.ts` | same | same |
| Reassign clears markers (B11) | same | same | same |
| Blocked route task not swept, "waiting" in my-work | `server/jobs/__tests__/taskDueSweep-route.pglite.test.ts` | same | same |
| Trigger: raw UPDATE (7 columns), DELETE, INSERT, `task_dependencies`, `cross_module_task_links`, as `app_service` under RLS | `tests/db/review-route-guard.dbtest.ts` | `red/trigger-dropped.txt` (triggers dropped) | `green/dbtests.txt` |
| Send refusals (no reason, no approver, each validator refusal, withdrawn route's reviewer as approver), 2 reviewers + 1 approver, `/advance→approved` refused, signature not on this route, withdraw after complete, `ROUTE_WITHDRAWN`, every Vault exit, round read, concurrency, cross-tenant | `tests/db/review-route-vault.dbtest.ts` | `red/vault-route.txt` | `green/dbtests.txt` |
| `canonical_document` project | `server/services/tasking/__tests__/task-project.pglite.test.ts` | `red/task-project-canonical.txt` | `green/guard-and-unit.txt` |
| `ci:migration-set-order` fails after the final pair | gate | `red/migration-set-order-after-final-pair.txt` | `gates.txt` |
| `ci:migration-drop-safety` fails on a narrowed constraint | gate | `red/migration-drop-safety-narrowed.txt` | `gates.txt` |
| Only `review-route.ts` sets the route-writer setting | `server/services/review/__tests__/route-writer-setting.gate.test.ts` | its second case injects a rogue setter and sees the gate fail | `green/guard-and-unit.txt` |

Pins that are green by design in the red run: the remind route (writes nothing on the row), the module sync (insert-only), and `routeStanding throws` (a new module).

Acceptance (`pg_policies` showing `review_routes` is policed, and a Rule 1 replay): `replay-and-policies.txt`.

## How the database tests were run

The scratchpad env script did not exist (the container was replaced). A fresh CI-shaped database was built with `scripts/db/provision-test-db.sh` (install-fresh + deploy-migrate, pgvector installed, `app_service` NOSUPERUSER NOBYPASSRLS), then renamed to the recorded-disposable name the Vault fixture requires (`platform_ci_vault_fixture_rr1a`, `C2C_VAULT_LEGACY_FIXTURE_DATABASE`), and run with `RLS_ENFORCE=on`, `TEST_DATABASE_URL` as the owner and `APP_DATABASE_URL` as `app_service`. The migration reached it through `deploy-migrate`, twice. Unit tests ran with `RLS_ENFORCE=off`.

## Decisions taken where the design could not be built as written

1. **Withdraw after the review is complete leaves review.** §2.10 says withdraw clears `review_signature` on the same transaction and leaves the record in review. The append-only guard on `canonical_documents` (`migrations/20260925_canonical_documents_append_only.sql`) admits clearing that column only on `in_review → authoring`. RR1a does not weaken a Part 11 guard: a withdraw before the review is complete leaves the record in review (a route can be re-sent on it); a withdraw after it moves the record to authoring through the existing revision transition. The design's tests hold.
2. **RR1a sends parallel reviewers and one approver.** Sequential steps and several approvers are RR2's red tests; they are refused (`ROUTE_SHAPE_NOT_AVAILABLE`) until then. `routeStanding` already computes steps and quorum generally.
3. **The module sync writes no existing row** (insert-only through `createUnifiedTask`, a fixed column list), so it has no row-level refusal; its guard is `createUnifiedTask`'s. Pinned, not red.
4. **The member key is composite** `(organization_id, review_route_id) → review_routes(organization_id, id)`, not the design's single-column FK, so a task can never name another organization's route.
5. **The trigger also guards `blocks` and `cross_module_task_links`**, the other half of a link, which the design's list left out.
6. `canonicalDocumentStore.ts` and `documentLifecycleOrchestrator.ts` needed no change: the routed path writes `review_signature` once, on completion, and advances through the existing orchestrator.

## Pre-existing failures seen, not caused by RR1a

- `ci:tenant-isolation:no-regression`: five findings in `_coauthor-current-source-fixture.ts`, `_task-management-governed-harness.ts` and `vault-search.ts`, files RR1a does not touch (`gates.txt`).
- `tests/lineage/founder-path-lineage.pglite.test.ts`: the same 8 failures with RR1a-ii's code reverted (hop 6 ingest, "invalid byte sequence 0x00").
- `tests/schema-contract/tenant-isolation-sweep.contract.test.ts` stops at `20261027_cdi_public_reference_seed.sql`, before this file; `authoring-section-commits-to-filing.contract.test.ts` and three `tests/regulatory` content tests fail on CSR/skills content.
- `tests/db/project-vault-secondary-access.dbtest.ts` needs a second declared QA connection this environment does not have.
