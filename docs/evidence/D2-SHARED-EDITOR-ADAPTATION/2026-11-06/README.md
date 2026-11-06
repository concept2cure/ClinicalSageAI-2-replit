# Shared project editor and Vault continuity

Package F1, launch row D2. Starting point:
`21a21849d7cfb8a35794489a87fad2b849c7011c`, `concept2cure-v2`.
Contract: `docs/design/SHARED_EDITOR_PROJECT_ADAPTATION_2026-11-06.md`.

## What already exists

The shared canvas/editor, project document start, filing outline, editor target,
Vault tree, source-import dialog, intake/adoption and file-to-Vault already own
this workflow. The design inventory records their paths, behavior and bounded
gaps. Complete these owners without another app, screen, editor or data store.

## Completed behavior

- Project definition remains the start. Existing functionality is reached inside
  that journey through the same canvas and editor; no app, per-type screen, API
  mount, service identity or store was added.
- Requirements follow the exact saved home or market filing. Unknown bindings,
  refused reads and unbound working documents remain distinct. Unbound documents
  retain the existing explicit home-filing editing-copy start.
- Filing navigation searches every admitted working copy with fresh headers and
  global code-first matching. Ambiguity, session changes and stale inventory do
  not open an unrelated document, including after an unsaved-edit decision.
- Vault carries recorded filing/section identities and artifact versions into the
  existing editor/source intake. Newly created imports are unbound; reused copies
  retain their saved bindings. Editing does not overwrite the captured original.
- Artifact copies disclose retained-version versus current-head-snapshot basis,
  hashes, provenance and limitations. Original approval/signature is not inherited;
  source revalidation, human adoption and machine qualification holds remain.
- Receiving-agency defaults use actual saved agency metadata. EU geography and
  legacy device rule keys do not become EMA authority. CER/MDR/IVDR legacy keys
  display the canonical EU / Notified Body label; manual editing remains available.

## Fresh verification

These cohorts overlap; their counts are not additive. All are fresh Nov 6 runs.

| Boundary | Result | Receipt |
| --- | --- | --- |
| Target channel, exact filing intent and legacy compatibility | 39 tests | `checks/target-green.txt.gz` |
| Shared editor, current context, held navigation, CSR compatibility and market starts | 8 suites / 119 tests | `editor/receipt.json` |
| Vault source intake, save/filing continuity and newer session/read behavior | 12 suites / 313 tests | `frontend/receipt.json` |
| Exact outline, home/market/unbound context and omitted market scope | 3 suites / 52 tests | `catalogue/receipt.json` |
| Recorded agency and current template compatibility | 7 suites / 419 tests | `catalogue/receipt.json` |
| Binary isolation and Vault identity projection | 5 suites / 77 tests | `server/binary-vault-receipt.json` |
| Artifact preview/create/reuse/drift, persisted source verification and release holds | 35 actual SQL tests | `server/artifact-source-receipt.json` |
| Related source/governance regression | 4 suites / 91 tests | `catalogue/receipt.json` |
| Incoming project-layout compatibility at `e533082d63` | 9 suites / 102 tests | `checks/incoming-project-compatibility.txt.gz` |
| Merged Vault compatibility at `67348a526c` | 7 suites / 96 tests | `frontend/incoming673/receipt.json` |
| Merged backend sensitivity/source/connector compatibility | 6 suites / 168 tests | `catalogue/incoming-backend-receipt.json` |
| Merged editor compatibility, composed result | 6 unchanged suites / 112 tests plus corrected conversation suite / 9 tests | `editor/incoming-merge-receipt.json` |
| Latest project-team/Respond compatibility | 3 suites / 33 tests | `editor/d3-compatibility-receipt.json` |
| Latest task/project admission compatibility | 6 suites / 117 tests | `server/task-project-compatibility-receipt.json` |
| Final ordinary-task/project admission compatibility at `965084590c` | 6 suites / 116 tests | `server/ordinary-task-compatibility-receipt.json` |
| Final shell/conversation compatibility, composed result | 5 unchanged suites / 54 tests plus affected-file rerun / 14 tests | `editor/latest-six-compatibility-receipt.json` |
| Incoming authoring write-access and source-copy compatibility at `53b9f15d8f` | 3 suites / 65 tests | `server/authoring-acl-compatibility-receipt.json` |
| Incoming lineage hardening and existing route attribution | 49 mutation tests; 22 guarded paths; 207 launch-boundary tests | `catalogue/lineage-hardening-receipt.json` |
| Confirmed project reads, editor and filing continuity; composed result | 3 unchanged suites / 63 tests plus 4 corrected-file suites / 53 tests | `editor/scoped-list-compatibility-receipt.json` |
| Confirmed project reads through existing Vault and source-start owners | 3 suites / 43 tests | `frontend/scoped-read-contract/receipt.json` |
| Incoming unified-task/project admission and source intake at `b86b489405` | 5 suites / 164 tests | `server/unified-task-compatibility-receipt.json` |
| Incoming UK CTA and recorded-agency integration at `b86b489405` | 8 suites / 152 tests | `catalogue/uk-cta-integration-receipt.json` |
| Existing project rail and command palette | 1 suite / 16 tests | `editor/final-rail-compatibility-receipt.json` |
| Incoming credential administration UI at `7d771e124a` | 3 suites / 44 tests | `frontend/incoming7d-admin/receipt.json` |
| Incoming gateway/account compatibility; composed result | 5 unchanged suites / 67 tests plus connector-only retry / 38 tests | `server/gateway-account-compatibility-receipt.json` |
| Existing startup and CSR/AnA qualifier compatibility | 27 Node tests | `checks/launcher-compatibility.json` |
| Final SDK source, cancellation and qualified-pin boundary | 9 suites / 250 tests; genuine source and continuation REDs retained | `catalogue/final-wire-current-source-receipt.json` |
| Incoming regional saved-template/advisory composition at `8dbc9d589f` | 8 suites / 404 tests | `catalogue/regional-context-integration-receipt.json` |
| Incoming RBM subject identity/index contract | 1 suite / 13 tests | `server/rbm-identity-compatibility-receipt.json` |
| Native Quality tasks and project links at `f6127e7223` | 8 suites / 93 tests | `server/quality-task-compatibility-receipt.json` |
| Native Quality frontend/source flows; composed result | 6 unchanged suites / 102 cases plus affected-suite rerun / 15 cases | `frontend/incoming-quality/receipt.json` |
| Native Quality source/report admission; composed result | 12 unchanged suites / 172 cases plus affected-suite rerun / 76 cases | `catalogue/quality-source-report-integration-receipt.json` |
| Native selected-source stream dispatch | Owner 2 suites / 22 tests; separate unchanged targeted rerun 2 suites / 22 tests | `server/native-quality-dispatch-receipt.json`, `catalogue/native-dispatch-followup-receipt.json` |
| Composed SDK/source/placement/derivative merge verification at `e5a1536fa0` | 11 unchanged suites / 341 cases plus checkpoint-file rerun / 35 cases; SQL proof 37 cases | `catalogue/e5-merge-resolution-receipt.json` |
| Source-import/tenant compatibility; composed result | 8 unchanged suites / 129 cases plus governance rerun / 30 cases | `server/e5-source-tenant-compatibility-receipt.json` |
| Incoming review/admin/CSR frontend compatibility | 8 suites / 197 tests; 29 unchanged inputs bridged to merge | `frontend/incominge5/receipt.json` |
| Incoming current Quality records, report freshness and task ownership at `7a23ed73ca` | 9 suites / 147 tests | `catalogue/incoming7a/receipt.json` |
| Incoming project message receipts and RBM selection ownership | 4 suites / 47 tests; 2 Node files / 11 cases | `frontend/incoming7a/receipt.json` |
| Protected nonclinical inputs, recorded-number composers and current source reads | 8 suites / 140 tests | `server/incoming7a/nonclinical-source-compatibility-receipt.json` |
| Running actual components with explicitly synthetic HTTP | 12 checks / 45 stable pins | `ui/browser-result/result.json` |
| Running local application and native PostgreSQL, no API interception | Both 510(k) and IND journeys passed | `ui/live-result/result.json` |
| Independent scope and source-governance review at `e533082d63` | No scoped blocker at that checkpoint; 22 historical runtime pins | `review/security-review.json` |
| Incoming project read/write guard integration review at `53b9f15d8f` | No scoped production blocker; 9 selected source pins; read-only review | `review/incoming-53b-security-review.json` |
| Incoming UK CTA/task integration review at `b86b489405` | No scoped blocker; 17 review pins; component refresh and native scope explicitly distinguished | `review/incoming-b86-security-review.json` |
| Incoming credential-wave review and final repair closure | Initial blocker retained; later independent review closes both SDK timing gaps at `f4295889ca` | `review/final-sdk-boundary-security-review.json` |
| Incoming regional/RBM integration review at `8dbc9d589f` | No scoped blocker; 13 checked owners; existing SDK guards unchanged | `review/incoming-8dbc-security-review.json` |
| Incoming native Quality review and dispatch closure | Incoming stream blocker preserved; later pinned closure verifies both provider-call hooks | `review/incoming-f612-security-review.json`, `review/native-stream-dispatch-security-review.json` |
| Composed P104 source/tenant/owner/derivative review | No scoped blocker; 28 checked owners; no full spike/model/deployment acceptance | `review/incoming-e5-security-review.json` |
| Current Quality/protected nonclinical integration review at `7a23ed73ca` | No scoped blocker; 20 checked owners; read-only review | `review/incoming-7a-security-review.json` |
| Browser continuity after the final canonical merge | All 45 component and 30 native recorded hashes match; no new run or writes | `ui/final-bridge.json` |

The native browser walk opened each exact filing section from Vault, edited it
with a reason, saved through the real route, checked saved content/hash and audit
reason, reloaded, and reopened from Vault. Exactly two seeded section PATCHes were
made in the final qualified run (twelve across six completed local qualification
runs). This is separate from the component fixture's four simulated intake POSTs.
Existing file-to-Vault/release behavior is covered by the linked tests, not claimed
as native controlled-release or agency-submission acceptance.

The production build completed successfully on Node 22 with all selected runtime
input hashes unchanged. Their count is in `qualification.json`. Final repository
gate/typecheck output is recorded in the
root qualification receipt: every pre-push gate passed, including zero type
errors against the unchanged zero baseline. Lint has no new warning sites; existing
warnings and non-blocking companion-filename scan notices remain disclosed.

## Provenance and limits

The earlier environment was replaced before its local increment was published.
Its lost counts/checkpoints do not qualify this tree. Repairs were reconstructed
against current canonical owners; newer CSR, Vault and project-page changes were
preserved. Canonical advancement `21a21849d7` → `e533082d63` was a fast-forward,
with its project compatibility run recorded above.

The subsequent `67348a526c` advance was merged with no conflicts, preserving its
Vault project chooser, inspector names, upload privacy and P-104 runtime changes.
Affected compatibility cohorts, a rebuilt application and refreshed native and
component browser runs qualify the combined inputs. Earlier owner receipts retain
their exact checked hashes; they are not silently relabeled as later runs.
The independent security receipt likewise retains its `e533082d63` scope;
subsequent Workbench/Vault changes are covered by the incoming compatibility
receipts and refreshed browser qualification, not by relabeling that review.

The later `57b13c599d` advance was also merged intact. Its project-team/inbox reads
and task/project admission are covered by the two latest compatibility receipts.
The build and 45/23-pin browser receipts were refreshed after that merge.
The final `965084590c` advance, including `29a1b5ddb1`, was merged intact,
preserving saved-conversation routing, licensing and ordinary-task admission.
The final build and native walk were repeated on the combined tree. All 45
component-fixture inputs remained unchanged and were rechecked against it.
The task cohort passed all 116 tests. One shell case initially failed to find its
button within the existing wait, then passed unchanged alone and in its full
14-test file. The composed 68-test result retains the initial failure and is not
represented as a fresh all-six-suite green run; its cause remains unproven.

The `53b9f15d8f` advance was then merged intact, preserving project write
authorization, confirmed project-list reads, strengthened lineage checks and
existing stored-run route attribution. Its source-copy/access cohort passed
65 tests without fixture changes. Incoming guard review found no scoped
production blocker. The native proof adds the two newly exercised guard owners
to its 25 pins; unchanged component pins alone are not treated as exercising them.
Six older editor/Vault fixtures omitted the now-required confirmed result or row
project identity. Only their DTO fields were corrected, preserving every
assertion and production guard. The four corrected editor suites passed 53 tests;
with three unchanged passing suites this composes 116 cases, not a fresh
seven-suite rerun. The separate three-suite Vault/source-start run passed all
43 tests. Original failures and exact fixture diffs remain in their receipts.

The `b86b489405` advance was also merged intact: UK CTA preparation remains
medicinal, cited and scoped to its actual IRAS channel; it does not grant source
or write authority. Its eight integration suites passed 152 tests. Unified-task
admission/source intake passed 164 tests, and the unchanged rail/palette suite
passed 16. These required no source or fixture changes. The changed shared
registry is one of the 45 component pins, so the component qualification is
refreshed for this merge. At that stage the previous native receipt retained its
`637737bb13` checkpoint and 25 unchanged selected owners; it did not qualify new UK CTA, AnA preparation,
unified-task behavior or all transitive registry changes.

The `7d771e124a` advance was preserved as well, including sourced Skills policy,
credential custody/redaction, immutable model/PQ checks, account-canon transactions
and startup/build repairs. Its changes intersect none of the 45 component or
25 native selected pins. Their original checkpoints remain explicit; these
receipts do not qualify the new credential/model/AnA paths. Administration passed
44 tests, and startup/qualifier compatibility passed 27. Gateway/account coverage
composes five passing suites/67 cases with an unchanged connector-only retry/38
cases after an initial setup timeout; it is not a fresh six-suite green run.

Review of that advance found a source-authorization gap across new credential
awaits. Actual SDK stubs reproduced 12 failures with 16 cases already passing.
A separate platform continuation reproduced three cancellation/PQ failures with
81 passing cases. The bounded repair keeps the captured source hook private,
revalidates it after credential waits, and checks cancellation/qualified evidence
synchronously at all five actual SDK call sites. Source refusals remain safe and
terminal, without retries or provider-health failures. Final nine-suite execution
passed all 250 tests; lint retained its existing 26 warnings with no growth.
Only two existing production owners and three existing tests changed. Two older
provider-error identity assertions now require the incoming exact sanitized
HTTP-400 status/message and reject raw identity; source-refusal assertions remain.
The incoming blocked review is preserved, with a separate final closure receipt.

The `8dbc9d589f` advance was then merged intact. Both template owners auto-merged,
preserving actual saved-agency admission while attaching the validated regional
and section advisory context. Eight targeted suites passed 404 cases, with no
source or fixture correction required. The existing RBM key/index repair passed
13 cases, preserves NULL-distinct legacy records and refuses conflicting rows
without deleting them. No native schema change was applied. The two SDK guards
and all 45/25 selected browser inputs remain unchanged; the earlier browser
checkpoints do not qualify the new regional advisory or RBM behaviors.

The `f6127e7223` advance was preserved next. Native Quality records now feed the
existing project catalogue, tasks, source notices and report computation. Task
integration passed 93 tests. Frontend coverage composes six unchanged passing
suites/102 cases with a 15-case affected-suite rerun; source/report coverage
composes twelve unchanged passing suites/172 cases with a 76-case affected-suite
rerun. Neither is presented as a fresh all-suite green run. Two old fixtures were
aligned with explicit unbound headers and exact safe 403 source denial, while
retaining all production guards and source/no-body assertions.

Review found that the newly appended native source facts lacked a dispatch
checkpoint in the stream. The bounded repair captures authenticated scope and
the exact admitted native identities/facts once, re-reads that same set before
both initial and follow-up model calls, and refuses missing/changed/unavailable
context. It preserves zero-native behavior and existing SDK/model/cancellation
checks. The two-suite RED retained fourteen failures and eight passes; the final
run passed all 22 cases, and a separate unchanged targeted rerun passed 22 again.
These overlapping runs are not added together. Independent review verified the
stable digest/text identity, mixed/truncated context, admitted-set capture and
both route forwards. The earlier blocked review remains, with a separate closure.
No supported new Quality-report-to-artifact-registry transfer was found; source
intake did not substitute artifact scope for native per-record access policy.
The 45/25 browser inputs remain unchanged and their historical checkpoints do not
qualify new native Quality behavior. P100 project-door/QP3/mobile and other-owner
parity remain with their existing owners.

The `e5a1536fa0` advance was then integrated, including the P104 continuation,
recorded nonclinical composition and startup/CSR polling changes. Four SDK/SQL
conflicts were resolved by composing both parents: tenant/owner/private source
authority, the T3 ceiling, exact derivative custody/reinjection and embedding
controls remain, along with captured source guards and synchronous final
cancellation/PQ checks. Three exact SQL primitive caller registrations were
retained without changing a baseline. Verification composes eleven unchanged
passing suites/341 cases with a 35-case checkpoint-file rerun; it is not a fresh
twelve-suite green run. Legitimate extra source-check stages explain eight old
fixture stage/count failures, with terminal/no-retry/SDK-zero assertions retained.

Source/tenant coverage composes eight unchanged passing suites/129 cases with a
30-case governance rerun. The old fixture lacked `audit_logs.chain_seq`; isolated
PGlite reproduced SQLSTATE42703, then the existing canonical migration corrected
only its bootstrap. Every adoption/model/CSR/source assertion and production
independent-check hold remains. The separate frontend run passed 197 tests and
bridged all 29 selected inputs to the completed merge. Independent review records
deterministic checks separately from semantic, scientific and full-spike acceptance.

That advance changed the native `authoring.router.ts` pin. The native walk was
therefore refreshed at `d6cb7f9a9e`, with five exercised tenant-infrastructure
owners added (30 pins total) and direct JPEG quality35. Both actual journeys
passed; the sixth completed run adds exactly two content PATCHes, for twelve
across six runs. Old637 evidence is historical, not relabeled. The retained
component run stays at5283 with all45 selected hashes unchanged. Neither browser
receipt qualifies broad worker isolation, review/signature, credential/model,
scientific or deployed acceptance.

The later `7a23ed73ca` advance was preserved in a clean merge at `e802750f45`.
It binds nonclinical drafting to protected project study records, keeps current
Quality records and report/task ownership explicit, and retains message delivery
receipts and current RBM file/paste selection. Targeted owner checks and a separate
read-only review cover the changed boundaries. No source, test or runner correction
was required for this merge. All 45 component and 30 native recorded browser inputs
match exactly; `ui/final-bridge.json` preserves the original checkpoints and limits
without claiming another browser run. The application was rebuilt and the normal
repository gate repeated on the combined source inputs.

The final automatic `9ecf9bed29` repository-health report refresh changed only
two `docs/reports` files. It was preserved after the compiler passed. The complete
13,212-input source digest is unchanged; the metadata bridge records the original
`7a23ed73ca` gate base, and plan, size, tracked-import and credential checks cover
the final publication tree. No source baseline or acceptance requirement was changed.

The already qualified pre-regional increment is retained as immutable Git
checkpoint `3d9879dfc7b7bbb6b595705c03f3773a01f5ed6d`, tree
`3304e84f8b7f1c2d26fcb3f0e9b75caa1a5c629d`. Creating that object changed no branch;
the eventual canonical publication retains it alongside subsequent canonical work.
The later fully checked Quality/source increment is also retained as checkpoint
`34f97c9529e3a29c4b3f4a9120f8af99315f9288`, tree
`e0ed72bc61fee500d5cc2d425592368984e9136b`, including the first checkpoint as a
parent. It likewise changed no branch ref.

The final source inventory is captured after the frozen source commit before
the normal full pre-push run, then compared afterward. Its digest scope and
timing are explicit in `checks/source-freeze-proof.json`; it replaces no gate.
Raw tool-output logs are preserved verbatim, including terminal whitespace;
format checks apply to code and authored documents, not rewritten log captures.

Genuine REDs and corrected test-fixture assumptions are distinguished in the
owner receipts. In particular, current canonical binary creation already left an
unnamed filing unbound; the explicit forceUnbound option reinforces that contract,
and the pre-option SQL qualification was already green. The final omitted-market-
scope defect was reproduced before deriving scope from the verified selection.

The first full compiler pass found seven type errors in two test fixtures: a null
optional error and an unknown HTTP-send input. Only fixture types changed; the
writing tests and all 35 artifact SQL tests passed again. The merged conversation
test also assumed an ambient filing-outline read for an explicitly unbound copy;
its canonical DTOs and that obsolete read expectation were corrected, preserving
all conversation identity and absence-of-filing assertions. Raw failures and
bounded reruns are retained; the typecheck baseline stays zero.

The native application ran as app_service with RLS and launch scope enabled, on a
fresh locally provisioned PostgreSQL database and synthetic projects. Its explicit
development login does not qualify IAM/MFA. Database/schema/storage readiness was
green; overall readiness remained 503 because no AI provider was configured. No
AI request, gateway transmission or external message was used for this proof.

Full roadmap convergence (including S11/S12), every client/type combination,
scientific MDX automation, native concurrent editing, controlled release, live
filing and deployed acceptance remain outside this bounded repair's claims.
