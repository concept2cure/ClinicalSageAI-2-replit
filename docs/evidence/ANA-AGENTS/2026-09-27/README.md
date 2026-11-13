# AnA runs multiple agents; Manual/Auto is a real run policy (row 74)

## 2026-11-13 F1 continuation — current activity and unreadable credential custody

The founder asked to continue the whole existing implementation after the Codespace demo publication. This
bounded repair moves **W1 / D2** under **F1** and starts from canonical `2a667bf51`. It adds no screen, source
file, route, table, provider, model or dependency and does not declare real model PQ or the Anna epic complete.

### What already exists

`client/src/concept2cure/v2/useAgentActivity.ts` reads the background investigation queue for the conversation,
eCTD co-author and RBM progress panels. The same file's project-team reader already uses the current
`authoringCurrentRead.ts` session guard and captured actor headers. The older background reader does not: a late
response or retained result can outlive an account change, and missing counters/items are coerced into an empty
success. Extend this reader with the existing ownership guard, strict canonical summary validation and serialized
polls. Preserve the default-off project-team presentation and its durable monitoring.

`server/services/connectors/connector-registry.ts` already encrypts all fourteen administration credential cards,
checks management authority and commits each change with its chained audit. Its prior-state decoder currently
maps both an absent card and unreadable ciphertext to no known old values. Rotation or revocation can then save
free text containing an old secret that could not be redacted. The existing gateway-account writer already
distinguishes unreadable prior state and withholds that free-text reason. Extend the connector writer in the same
way; keep key bytes, grant tombstones, current authority and audit atomicity intact. The existing connector
PGlite and conversation tests are the regression homes. Current aliases, hosts, contracts and full deletion
history were searched before edits; no deleted replacement was found.

Only executed regression, integration, compiler and publication results will be recorded as passing below.

**Credential repair verified:** six corrupt/wrong-tenant/wrong-provider rotation/revocation canary cases fail
against the original source. Independent review then found a decrypted malformed-shape edge; four actual AES
legacy/envelope cases fail against the first repair. The final three existing suites pass **90/90** (the owned
PGlite suite is **61/61**, included in that total), with zero changed-file lint errors or warnings. Recovery keeps
exact replacement bytes, valid grant identity, revoked tombstones, readable reasons and atomic rollback on audit
failure. Unsupported prior nested/nonstring shapes withhold the free-text reason without changing SDK decoding
or authority. Independent review reports no remaining in-scope finding. These fixtures use synthetic credentials;
no live customer/provider credential or external qualification is claimed.

**Activity repair verified:** the old background reader fails **23** new regression cases before the fix; the
complete existing conversation suite then passes **41/41**, with zero changed-file lint errors or warnings and no
material independent-review finding. The reader now masks data immediately across actor/access/session changes,
guards delayed JSON and dispatched actor headers, serializes/coalesces polls, stops hidden polling, and preserves
ordinary bearer refresh. Invalid summaries or failed reads clear prior data rather than fabricate empty success.
An adjacent run passes 63/65 checks; two Reporting same-reader refresh-notice expectations are being compared
against the baseline separately before any change to those tests. These counts overlap and are not summed.

**Adjacent current-session fixture repair.** The two Reporting notice failures also occur against pre-activity
commit `fc9fe8cf7`; the activity module is absent from their import graph. `Insights.tsx` already uses the shared
stable-session reader, so re-reading unchanged access retains the report rather than resetting it. Reconcile only
those two existing tests to require the current report/export DOM and request counts remain unchanged; preserve
the actual account-switch notice and every different-actor/permission/session/late-read negative control.

**Connector-use continuation.** The existing registry can recheck current user standing and audit a versioned
credential use, but its search wrappers drop the initiating actor. The knowledge-base route has authenticated
`authedUserId(req)`, AnA has `ctx.userId`, and asynchronous deep research retains its initiating `request.userId`.
Carry that trusted positive identity through the existing repository-search orchestration and both pre-auth and
post-auth credential checks. Missing/invalid foreground identity refuses; explicit server background identity is
distinct and never inferred from missing user context. Extend the existing standing check to legacy credential
uses too, without inventing a legacy grant or revision audit. Current upload already retains its requesting actor.
The actual scoped credential/audit boundary remains the authority, with no ambient global or request-body actor.

### Executed continuation results

- Credential actor propagation: **198/198** across ten existing suites. Eleven original failures demonstrate
  missing actor attribution, revocation during the real use audit reaching transport, and legacy standing gaps.
  Final PGlite/Drive fixtures prove zero OAuth/search sends after audit-time revocation, no search after
  authentication-time revocation, current standing for legacy credentials, and explicit active-organization
  background use. Trusted route/tool/queued-job actors survive awaits; spoofed or missing foreground actors fail.
- Measured estimate producer: **189/189** across five existing suites. Original producer and durable-ledger tests
  fail before implementation. The real child runner and RunCoordinator/PGlite fixture record three observations,
  both optional aggregate groups, immutable idempotent replay and audit-before-projection. Controlled durations
  explicitly distinguish lazy imports, ledger and advisory time from actual check samples. These substituted
  transport/timing fixtures are not provider latency or real model qualification evidence.
- Current-activity/estimate/Reporting/Summary UI: **134/134** across four existing suites. Six old-format cases and
  the historical Summary case fail before their respective repairs. The live estimate counts down inside its
  measured window, uses seconds without an invented minute floor and withdraws when overdue; Summary preserves
  an explicit as-recorded value/timestamp across elapsed time and reload. The two unrelated Reporting failures
  were reproduced against the pre-activity module, then reconciled without weakening account-change controls.

These runs overlap earlier component counts and are not summed. Independent reviews found no remaining
in-scope issue in the credential reason, actor propagation, activity ownership or estimate producer paths.
All changed paths have no lint errors and no warning-count growth; the existing knowledge-base/executor warning
counts remain 46/93. No baseline, model admission, privacy, approval, signing or filing gate is loosened.
Full merged compiler, normal publication and actual demo-runtime checks remain the final acceptance steps.

**Measured-time continuation.** The existing `WorkerEstimate` contract and team UI can display recorded estimates,
but no production writer populates them. `sub-agent.ts` already declares three aggregate deterministic checks,
plus optional source-span and stored-source-claim groups; `sub-agent-stream.ts`, `run-events.ts` and `turn-plan.ts`
already carry their measured counters into immutable progress receipts. Extend those same paths with monotonic
elapsed observations of each whole deterministic check, including its scoped deterministic reads, with one
consistent timing boundary. Exclude import, parent hold, ledger and subsequent model/advisory time. Three usable
assessed observations and a known positive remaining count are required; errors, unavailable checks, invalid
timing and lifecycle transitions clear the estimate. The range is an explicitly approximate observation-based
estimate of remaining checks, never calibrated provider p95, worker completion or project/filing readiness.
Persist the estimate in the idempotent audited snapshot before projection; preserve the existing aggregate-count
granularity and replay. The existing sub-agent and coordination tests are its regression homes. No retired
fixture progress bar or constant ETA is restored. The released formatter must avoid rounding a sub-minute
estimate into an invented one-minute lower bound, count down only within the actual observation window and
withdraw expired/future or inconsistent measurements. The existing `TurnSummary.tsx` forensic rows need an
explicit as-recorded estimate and timestamp, preserving immutable numeric history without a live countdown claim.
Its existing `turnSummary.test.tsx` is the additional regression home; the live team panel shares `useNow` and
stops its clock when that measured window ends or the panel is hidden.

## Original delivery record — 2026-09-27

Founder-directed on 2026-09-27. This lane moves no D-row, and it is recorded
on the work-order board as the founder's explicit exception to RULE 2.

| Slice | What it fixes | Commit | Evidence | Status |
|---|---|---|---|---|
| S0 | Two calls of one tool in one step swapped their results in the transcript | `97465528b` | `S0-tool-result-pairing/` | landed |
| SG | A mid-call Stop counted as a provider failure and could mark Anthropic unhealthy for every tenant | `b4efbe63c` | `SG-abort-not-a-provider-failure/` | landed |
| S1 | A turn the round limit cut short read as finished | `85cb5654b` | `S1-stopped-reason/` | landed. Shown end to end with a stand-in model (`E2E-stand-in/`, scenario 1); a live-model capture still needs a model key |
| S2 | Home's engine pill was never sent; any enabled model could be pinned without an approved-models entry, and a refused pin was dropped silently | `b4cd68746` | `S2-honest-controls/` | landed. Shown end to end with a stand-in model (`E2E-stand-in/`, scenario 6) |
| S3 | The primitives S4 and S5 stand on (loop `stopWhen`/`roundCap`/`'replan'`, executor options, the pause wait moved into one shared `createRunHold`, `holdForPerson`/`endHeldRun`, the model-call refusal scope, wrapper rule 0), all off for callers that do not opt in; and two honesty fixes: a failed read no longer makes `check_dossier_consistency` answer "no issues", and `project_knowledge_search` has a model-free mode | `eeedc6231` | `S3-primitives/` | landed. No user-visible surface |
| S4 | There was no Manual/Auto. Now `run_policy` is read by the stream's budget, stop directive, hold and checkpoint, and never by the approval gate. Manual holds before each further step and runs it only on a person's answer. A hold nobody answers ends the turn, and a hold that cannot be made fails closed. Every unrun held step is on the record and in the dossier. Auto runs to 20 rounds / 15 min of work / 40 min in all, and never approves. A separate "Between steps" control, and the run-control strip on the conversation screen. A 45-point review was worked through, red first | `eb62b566c` | `S4-manual-auto/` | landed. Shown end to end with a stand-in model (`E2E-stand-in/`, scenarios 2-5); a live-model capture still needs a model key |
| H1 | AnA's default (cost-tier) model could be one with no approved-models entry | `03dea50b7` | `H1-default-model-governed/` | landed |
| H2 | `check_dossier_consistency` said "clean" when nothing was compared | `eea56da2c` | `H2-dossier-check-not-applicable/` | landed |
| ADR | The lane's product decisions, made under the founder's delegation | `39b3027cc` | `docs/adr/0015-ana-autonomy-sub-agents-and-model-governance.md` | accepted |
| H3 | ADR-0015 §3–§5 in the gateway: every served model is its own approved entry; high-risk drafting in production needs a passed PQ; no tenant-less calls in production | `e2258d07a` | `H3-gateway-governance/` | landed |
| H4 | Numerical integrity and document reconciliation said "clean" with nothing compared | `ba0d373b4` | `H4-nothing-checked-is-not-clean/` | landed |
| D4 | The PQ could have passed without its rag component running; the rag blocker was misdescribed | `e41504ec7` | `docs/evidence/D4/2026-09-28-pq-rag-*` | landed; five items handed to `…01VB8JEG` |
| E2E | S1, S2, S4 on the real server, database and UI with a scripted stand-in model | `0b5937f97` | `E2E-stand-in/` | 6 scenarios shown; findings F1–F4 recorded (F1, a declined action fed back as a failure, is next) |
| F1 | A person's decline was fed back to the model as a failure to work around ("try an alternative tool") and shown as AnA failing | `ab2693c56` | `F1-decline-not-a-failure/` | landed |
| §6 / F6 | With a v2 project open, AnA could not search it ("No active project is in context") | `c17340bfc` | `P6-search-open-project/` | landed; PF-10's F1–F8 decided |
| S5a | Sub-agent ceilings; the verification readers, where nothing compared is never clean; `labelsCompared` on the integrity check | `32133a57f` | `../2026-10-05/S5a-limits-and-readers/` | landed. Not yet reachable: `run_agent` is S5c |
| S5b (1) | The non-stream loop ran a tool on `{}` when its arguments were lost in transport (four doors, and the child loop next) | `f01a6c0be` | `../2026-10-05/S5b-lost-input-guard/` | landed; declared behaviour change for send-message, ana-intelligence, ana-realtime, deep investigation |
| S5b (2) | The sub-agent child loop: read-only, model-refusing tools, child ⊆ parent, high-risk governed model calls, turn/round/org/process caps, token/round/active-time budgets, the person's pause and Stop, never-throw | `bc75a68c0` | `../2026-10-05/S5b-child-loop/` | landed; not yet reachable (`run_agent` is S5c) |
| S5c (1) | Three model egresses beside `gateway.route()` (LiteLLM router branch, cross-encoder reranker, RAG response cache) did not refuse inside a sub-agent's scope | `89af17351` | `../2026-10-05/S5c-chokepoint-guards/` | landed |
| S5c (2a) | `run_agent` defined and classified; offered only to a hosting turn whose tenant policy was read strictly; `'incomplete'` in the trace | `3e6b74b7e` | `../2026-10-05/S5c-run-agent-defined/` | landed; not yet offered (no caller hosts) |
| S5c (2b) | Sub-agents become reachable: the stream hosts `run_agent` (host only on a hosting turn, the parent's round on a child's pause, `agent_event` frames, no record-only trace to the model, the child's own tools as the only evidence, `'incomplete'` said plainly and not retried), and `/api/agent-swarm` is retired | `1d19566c` | `../2026-10-05/S5c-stream-hosting/` | landed; off in production until the S7 capture |
| S6–S7 | Client agent rows, live two-agent capture, ledger cost read | — | — | not started; S7 needs a model key |


## 2026-11-06 continuation — P-104 architecture v0.5

This dated continuation extends the agents recorded above. Its current source is `a2f9264a5`, private HTTP/index
and transmission refusal repairs are `5c5b89836`, and the roadmap is `docs/design/ONE_DESIGN_PLAN.md` §1d. The
full expanded spike remains acceptance pending. No new source file, screen, mount, table, tool or dependency was
introduced by this continuation.

### What already exists

- `ana/sub-agent.ts`, `AnaToolExecutor.ts` and `agentic-workflow-tools.ts`: the bounded read-only child loop and
  existing `run_agent` host. They now reach durable assignment, progress, report, peer and refusal receipts before
  their projections. Children cannot approve, lock or transmit.
- `ana/run-events.ts`, `run-control.ts`, `turn-plan.ts` and `turn-record.ts`: existing run/event/record homes.
  Chained audit plus record blobs are authoritative; lossy run mirrors and UI are projections. Opaque in-process
  source/capture capabilities cannot be minted from model JSON or copied metadata.
- `AnaWorkPanel.tsx`, `ConversationThread.tsx` and `useAgentActivity.ts`: existing conversation work view, extended
  with a default-off Show team toggle. Counters require measured totals; unavailable completion time stays unknown.
- `projects/schedule-of-events/service.ts`, `tasking/task-planning.ts` and `c2c/charter-objectives.ts`: existing
  project goal/task graph, now monitored using canonical charter versions and strict dependency/source/review heads.
  Filing observations are non-authorizing; the final canonical release gate still runs at the actual action.
- `ana-context-router.ts`, `client-intelligence.ts`, `shared/ana/skills.ts` and `WhatAnaRemembers.tsx`: existing owner
  profile, rule and memory surfaces. Corrections, versions, conflicts and revocation remain owner-only. Generic
  prompt builders omit private prose; protected opaque capsules expand only in final SDK parameters.
- `chat-thread-helpers.ts`, AnA history/record routes and `security/field-encryption.ts`: existing chat/storage/crypto
  homes. Private runs/messages/whole turn bundles use tenant KMS custody, owner admission and immutable hash/chain
  checks. Generic history readers receive placeholders. Current-key changes hold new seals; old exact ciphertext
  retains its own authorized historical key. Older immutable records predating the boundary are not claimed cleaned.
- `intelligence/ana-failure-learning.ts`, QMS controls and account Skills bundles: existing learning/review/install
  paths. Only fixed generic class/count cohorts enter reviewed learning, with audited consent, exact immutable QMS
  artifact/signatures and explicit client installation. Historical global raw wisdom remains quarantined.

### Verification and limits

| Boundary | Actual result | What it establishes |
|---|---|---|
| Running browser | 18 team + 10 private-rule checks | Real authenticated endpoints, durable fixtures, keyboard/default-off behavior, owner CRUD/reload and 390px layouts; no provider simulation presented as PQ. |
| Runtime | 20 tests | Registered parallel workers, actual SQL sources, durable coordination/cancellation/refusals, private external/write holds and safe wire data. |
| Private SQL/AES | Latest 34 tests | Owner/admin separation, whole encrypted capture/history, immutable source checks, revoked rules, malicious peer data and two-turn tenant-key rotation. |
| Gateway SDK seam | 24 tests | Private text appears only in final SDK parameters; generic routing/dispatch/audit has no canary; prepared-payload SHA matches actual parameters. Copied capabilities/lineage, revoked admission, frontier tier changes and demo/cache/stream responses are refused. Network I/O is substituted. |
| Private owner/pool profile | 30 native + 11 omission tests | Real non-bypass RLS, current owner CRUD/version/retry guards, missing unique-index convergence and truthful generic-context omission. |
| Private UI/telemetry | 45 tests | Owner/session fencing, exact intent receipts, uncertain save reconciliation and request/response body suppression. |
| Shared learning | 260 focused + 16 native QMS | Audited contribution policy, closed classes/counts, current cohort/signatures, explicit install and fresh loader admission. |
| Database deployment | 462 migrations + 49 native RLS | Canonical replay and actual non-superuser/non-bypass row security after owner-index repair. |
| Project monitor | 158 focused tests | Objective/task/dependency/source/review head binding and honest unknowns; no task-percent claim of filing approval. |
| Canonical transmission repair | 107 checks | One-byte signed-manifest mutation voids approval and durably records TRANSMIT_BLOCKED; audit failure releases nothing. This is not approval of a final ZIP bitstream. |

Counts overlap broader runs and must not be summed. Source fixtures identify synthetic KMS/SDK/authentication
boundaries; the cryptography, SQL, RLS, hash/audit verification and canonical service paths execute where stated.
The real model registry has 16 pending PQ entries: no live model qualification, customer key grant, deployed
provider terms or scientific correctness is asserted. Automatic private reflection remains held until its captured
lifetime is proven. Exact final-ZIP approval and the joined ordinary AnA draft/checker/human/freeze gate are being
verified separately; component tests do not close the expanded spike.

Run the named existing suites with Vitest and one worker; native `.dbtest.ts` suites use `vitest.db.config.ts`
against a disposable canonical PostgreSQL database under the provisioned non-bypass runtime role. Current detailed
session logs and browser captures are in `/workspace/scratch/anna-*` and `/workspace/scratch/private-*`; they contain
synthetic fixtures only. Final merged compiler, build, pre-push and remote publication receipts follow after success.


### Final integrated source checks before publication

The merged component consolidation passes **844 tests in 41 suites**; its 30 database-only cases are skipped in
that command and pass separately on native PostgreSQL. The consolidation used the installed Node 24 runtime;
individual native/SDK/build and canonical compiler/release checks use the repository's Node 22 runtime. A later
child-denial delta passes 5 cases, including actual audit INSERT failure and no second model call.

The joined native authoring fixture now passes **21/21**, with actual non-bypass RLS/JWT/bcrypt: ordinary AnA
unverified genesis, a real child freeze attempt with durable refusal, saved independent check, assigned human
finding decisions, an actual qualification hold, full canonical human rewrite/lineage, fresh review and reviewer
signature, then author freeze bound to the exact saved document SHA. Separate CSR scientific-evidence denial
remains tested. Qualification component fixtures pass **52/52**, including refusal of legacy model-name-only
records and calls without actual gateway request identity. No fixture claims a passed real model PQ.

`75c351e96` records the denial and fixture/lint repairs. The final ordinary AnA gate additionally checks immutable
successful noncached/nondeterministic gateway delivery against the exact retained turn, original actor/project and
current repository-controlled qualified pin. Generic displayed provenance and old provider/model strings confer
no release authority. The production client/server and both standalone audit/qualification verifiers build. The
mandatory changed-source lint checks pass with zero errors and a net reduction of four warnings. Final canonical
compiler, pre-push and confirmed remote receipt remain the publication gate.


### Canonical synchronization and combined source checks

The first complete publication attempt passed every mandatory gate, including the full zero-baseline compiler
with **zero errors**, then Git refused the update because canonical work advanced. `43fe4a8e2` merges that editor,
source and credential work. `cd23db47c` preserves both sets of protections at all five SDK sites, composes team and
native source checkpoints, and registers the actual admitted native selection in run authority inherited by child
calls. The additional joined regressions prove that a changed team anchor blocks parent follow-up and changed
native facts block the child before its first provider call. Their source/admission/retained/coordination SQL runs;
the QMS collector is an explicitly bounded database fact producer, not a complete QMS or model qualification.

Combined validation passes **42 SDK checkpoint tests**, **34 private SQL/AES tests**, **11 stream tests**,
**82 authoring component tests** and **21 native workflow tests**. The merged production client/server build and
standalone verifiers build. The final SDK terminal-error helper rerun also passes 42/42 with no added source lint
warning. Later canonical drafting-panel changes merge without touching the team/private surfaces and pass 32/32.
The encrypted-family/monitor rehome meets the unchanged size ceilings and preserves 63 private/SDK/runtime plus
275 monitor/graph regression checks. Current administration reauthentication passes 25 cases, including revoked
authority before password checking; QMS error envelopes pass 15 ceremony cases and the unchanged disclosure guard.
These runs overlap and must not be summed. Final merged publication is retried with the normal hooks.


The second complete publication attempt, on `5277bb277`, also passed all gates and the full zero-error compiler,
then lost a remote ref race to `772a1238a`. The later merge retains the CSR/read/editor fixes. New incoming checks
pass 112 backend and 46 UI cases; source callbacks, private custody and strict qualification remain intact. The
coordination file records the requested publication window and continued normal retry. Remote acceptance is still
pending; neither a green hook nor a rejected push is described as publication.
