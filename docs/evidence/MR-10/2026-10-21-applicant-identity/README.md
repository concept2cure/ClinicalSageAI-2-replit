# W5 / D7 — complete recorded applicant identity on the sequence path

Status: source **accepted directly on canonical** at
`3c93f44f9cba7f9caf5e3d2e6829de70c3b3e912` on 2026-10-21, with all normal
push gates and a zero-error compiler. Evidence publication resumed 2026-10-23.
Human witnessing and agency acceptance are unexecuted.
Baseline: `b9a48ce7136b8eecb076126d22e387d4d1b0ba84`.
Contract: `docs/design/APPLICANT_IDENTITY_COMPLETION_2026-10-21.md`.

## Resumption update — 2026-10-23

The workspace was fast-forwarded to canonical `55f75b72f` before publication,
preserving 411 later commits. This packet's tests, build and exact native/browser
inputs qualify **3c93**, not the whole later product. `canonical-refresh.json`
records the ancestry and input drift; the original execution manifests are
retained. Later work already completed P-44 market-specific application numbers,
F18/F23 readiness convergence and the IND reference walkthrough/P-42 replace
binding. None is recreated here.

The two PreSTAR posture assertions described in the original broad diagnostic
were corrected by another session in `4d27ecc74` on 2026-10-22. A fresh replay
of that file passed **8/8** on the resumption anchor
(`verification/resumption-posture.log.gz`); enforcement remains a separate
decision. Original failed outputs remain historical evidence.

The GitHub snapshots contain failed checks. The resumption code-anchor snapshot
records Security Scan, Lint, Authenticated app smoke and Semgrep failures; this
packet does not claim remote CI or the full product is green. The current work
board remains authoritative for owners. P-44 explicitly hands non-US
application-number signature coverage to this identity lane; EMA slash handling
is a separate open completion. D7 still needs agency assets/accounts and an
accepted real-sponsor test sequence.

## What already exists

- `shared/schema/ind-master-data.ts`, `migrations/20260609_ind_master_data.sql`,
  `server/services/ind-master-data/ind-master-data-service.ts` and
  `server/routes/ind-master-data.routes.ts` provide the deployed, tenant-scoped
  sponsor registry with DUNS/contact fields and audit outcomes. No product
  client reaches these routes. Prior D7 evidence explicitly selects this
  registry as CAT2-02's intended home; duplicating its facts on programs would
  violate Rule 3.
  Its existing `signatory_name`/`signatory_title` already feed form authorized
  representative fields; the reached editor exposes them so the newly pinned
  program forms can be completed from recorded facts through the UI.
- `shared/schema/programs.ts`, `server/routes/ind-forms.routes.ts` and
  `client/src/concept2cure/v2/surfaces/IndFormsPanel.tsx` already record and edit
  program form facts inside Submission Center, but have no sponsor-record link.
  `server/services/ind-forms/form-context-assembler.ts` already maps sponsor
  records to forms; other forms/filing routes accept tenant-scoped sponsor IDs.
- `server/services/ectd/package-identity.ts` is the recorded application/name
  reader for compile, export, transmit and AnA. `run-package-identity.ts`
  supports explicitly labelled dry runs. Real sequence callers still provide
  `UNASSIGNED-ORG-*`; `core-to-packager.ts` and `package-from-core.ts` do not
  thread the existing packager contact shape.
- `server/services/ectd/regulatory-identifiers.ts` already implements DUNS,
  FDA application number and regulatory contact validation. The existing
  `regional-packager.ts` emits contacts and reports unresolved telephone type
  and other agency conformance gaps. Its DTD validator/gates/viewer remain
  authoritative; actual agency assets are absent.
- `server/routes/submission-ops.ts` has an audited per-package regulatory
  identity snapshot and invalidates stale bundles on change. It is a distinct
  package-spine scope. E*STAR and supply-chain DUNS records are distinct too.
- Existing session/project guards, audit receipts, migration deployment set and
  tenant sweeps must be reused. No new console, identity store or validator.
- `server/services/submission-package-orchestrator.ts` already owns assembly,
  signed snapshots and their bound digest. `ectd/signed-package-export.ts`
  verifies/projects them, `signed-manifest-covers-sequence.ts` compares live
  leaves only, and `release-signature-status.ts` composes coverage with the
  existing sequence signature fallback. Identity coverage extends this path;
  historical snapshot integrity verification remains valid.
- Existing `sequence-release-signature.ts` treats changed digest as invalid;
  existing release sign-now logic refuses tamper, and dispatched lifecycle has
  no reopen/renewal path. Review reproduced legitimate identity edits stranding
  an unsent dispatched FDA sequence. Safe renewal completes that same dispatch
  action with current authority/signature/gates and explicit unsent eligibility.
  Changed leaf content remains invalid; old signatures remain untouched.
- `SubmissionCenter.tsx` already runs the governed sign-and-act chain and owns
  readiness refresh. A suspected renewal refresh gap was refuted: its existing
  sequence reload remounts the workspace and refreshes the assessment. A
  redundant proposed refresh line was removed; continuation tests prove the
  working path, including refusal behavior.

Inventory covered applicant/sponsor/identity/DUNS/regulatory-contact routes,
services, tables, AnA, client and unreachable callers, plus deleted-history
searches for these names, ind-master-data and Sponsor/sponsor. No deleted
replacement was found. The design records the paths and limitations in full.

## Evidence to record

Failing-first refusal and binding tests, tenant/role/audit/session cases,
adapter and real package bytes, replayable native migration proof, browser
exercise of the existing panel, build/compiler and normal direct canonical
push gates. Human witnessing and agency qualification must stay unexecuted
until actually performed; no full Stage 4/D7 closure claim.

## Completed product connection

The existing Module 1 forms panel reaches sponsor CRUD and explicitly binds the
selected registry record to the program. Application number, existing program
address/IND type and the binding save with a required reason, exact revision
and atomic chained audit. Registry edits retain their existing explicit
ancillary audit outcomes and require exact PATCH revisions. Draft registry facts
may remain incomplete; FDA package creation refuses missing or malformed facts.

Compile, export, AnA, readiness and transmit share the same recorded identity.
The existing adapter carries the contact into actual package XML. Captured FDA
identity binds sequence signatures and orchestrator signed snapshots; a changed
identity cannot be sent using earlier approval. Intact historical snapshots
retain their original verification recipe but do not prove current FDA coverage.
Fresh/unfinished FDA releases without captured proof refuse signing and require
reassembly with recorded applicant facts.

An unsent dispatched FDA sequence can renew its existing dispatch authorization
with a new independent signature and current gates. Identity-only staleness
requires unchanged sequence/leaf content and intact attributed proof; changed
leaves remain invalid. In-flight/sent states refuse renewal, including races.
The existing Builder sign action exposes only explicit server eligibility.

Review also corrected stale form-check results after saves/reloads/late replies,
malformed check answers, later-investigator gaps, recorded signatory loss and
unchanged-revision receipts. No parallel registry, identity store, console,
packager, signature engine or validator was introduced.


## Executed verification

The following are separate, overlapping cohorts, not a sum of unique tests.
Their scoped input pins are checked against qualified source **3c93** in
`verification/source-pin-verification.json`.

| Scope | Executed result | Evidence |
| --- | --- | --- |
| Existing sponsor registry routes/service | 48 passed / 3 files | `registry/README.md` |
| Program facts, forms and context | 97 passed / 4 files after the lock-reader correction | `program/README.md` |
| Recorded identity, adapters and package inputs | 88 passed / 10 files; final capture replay 42 / 2; type-boundary replay 27 / 1 | `core/README.md` |
| Compile, AnA, gates, transmit and renewal | 260 passed / 19 files; later compatibility replay 12 / 2; type-boundary replay 31 / 3 | `callers/README.md` |
| Orchestrator signed snapshots, export and coverage | 239 passed / 12 files; final parent-coverage replay 32 / 2 | `snapshots/README.md` |
| Existing UI/forms/filing/dispatch continuation | 132 passed / 12 files | `ui/README.md` |
| Actual governed signature persistence and digest proof | 70 passed / 5 files; final actual-writer replay 13 / 1 | `signature/final-five-suites.log.gz`, `signature/compiler-correction.log.gz` |
| Native PostgreSQL 16.15 | 8 migration/tenant/revision/snapshot/locking/ZIP checks; actual freeze-lock suite 2 / 1 | `native/result.json`, `native/freeze-row-lock.log.gz` |
| Chromium on actual components | 11 stages; 7 deliberate synthetic writes; no page errors | `browser/result/result.json` and screenshots |
| Production client/server/audit-verifier build | Passed on the source anchor recorded in `build.json` | `build.log.gz` |

Failing-first logs and unsuccessful diagnostic/preflight attempts are retained,
not relabelled as passing executions. The native proof applies the actual IND
master migration and additive program binding migration twice to an isolated
existing program-spine scaffold; it does not claim a full fresh deployment.
Its ZIP is produced by the real adapter/packager from synthetic recorded facts.
The browser uses intercepted synthetic API records, actual forms/dispatch
components and the current canonical CSS. It observes the governed dispatch
callback; actual backend signature/audit persistence is qualified separately.
Screenshots were inspected. No agency transmission or human witnessing occurred.

The broad backend diagnostic covered 163 files / 2,219 tests (2,163 passed,
17 failed, 37 skipped, 2 todo, plus two failing hooks). It ran while focused
integration was still finishing and initially lacked the required real xmllint.
`verification/backend-broad-summary.json` classifies every failure and targeted
replay. Real xmllint replay passed 38 / 3; the isolated hook/qualification replay
passed 14 / 2. Real-schema fixture gaps and the renewal test-double protocol gap
were corrected and replayed in the cohorts above. **Two then-existing Stage 11 posture
assertions failed in that original diagnostic**: `submission-gate-posture.test.ts` still assumes PreSTAR
assets are absent although they predate this slice. Test, assets, registry and
checksums are byte-identical to the starting baseline; proof and history are in
`verification/preexisting-posture-*`. That test deliberately calls for a posture
re-decision when assets arrive. This identity integration neither weakened the
assertions nor changed enforcement defaults. The later correction and fresh
8/8 replay are recorded above. The full backend suite is not claimed green.

## Normal publication and review

The first push was cancelled before compilation to incorporate concurrent
canonical work by ordinary merge. The next normal push refused a standalone
lock-only ownership-shaped query before reaching TypeScript. The correction
reuses the existing full-facts reader's program-only `FOR UPDATE`, preserving
canonical authority, exact revision CAS, lock order and atomic audit. The
unchanged ownership gate/selftest, 97 affected tests and one-file lint pass.
The refused log and final pins are in `program/`; the source was rebuilt.
The subsequent full compiler refused six type errors. The correction reuses
the canonical binding type, keeps an unknown dispatch state ineligible, names
an absent program as null at the existing claim boundary, and explicitly casts
deliberately malformed test input through `unknown`. Focused writer, identity,
renewal and transmit replays accompany the normal compiler retry; the original
refusal is retained in `verification/source-push-compiler-refusal.log.gz`.
No hook, gate, baseline or production dependency was relaxed for this slice.
Concurrent canonical changes, including an unrelated SQL baseline reduction,
were preserved by ordinary merges.

`review/resolutions.md` records the independent review findings and their
resolutions. `qualification.json` and `publication.json` record actual accepted
source and normal compiler/push outcomes; GitHub CI snapshots are observations,
not a claim that queued or running checks passed. `artifact-manifest.json`
pins the packet's files, excluding itself.

## Reproduction and remaining witness

Use Node 22 and the repository's existing dependencies. Worker READMEs record
their focused commands. The native probe is `native/check.ts`, taking an
explicit `APPLICANT_PROOF_DATABASE_URL` for an isolated disposable PostgreSQL
fixture. Start with a fresh empty database named `applicant_identity`: the
probe first proves the binding is absent, then replays the migration internally.
`native/image.txt` records the qualified image. The browser harness is
`browser/server.mjs`, `browser/probe.tsx` and `browser/check.mjs`; run the checker
against its own local Vite host with Chromium and the indicated Playwright
runtime. Its record fixtures are explicitly synthetic.

`HUMAN_CHECK.md` remains **unexecuted**. Use approved test records, current
membership and independent authorized reviewers in the target test environment.
Legal/agency asset prerequisites, telephone-number-type vocabulary, DTD-derived
heading/form conformance, real agency corpus qualification and deployment/pilot
witness evidence remain open. This packet completes the recorded identity
connection; it does not close all Stage 4/CAT2-02 or D7 acceptance.
