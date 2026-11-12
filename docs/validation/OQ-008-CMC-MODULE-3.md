# OQ-008 — Operational Qualification protocol: CMC / Module 3

| Field | Value |
|---|---|
| Document ID | OQ-008 |
| Version | 0.14 |
| Status | **DRAFT — UNSIGNED, NOT EXECUTED** |
| Parent | VMP-001 §5; requirements URS-007 |
| Runner (the executable protocol) | `tests/validation/oq/cmc/run.mjs` (steps 19–33 in `tests/validation/oq/cmc/steps-filing.mjs`; 34–36 in `steps-registers.mjs`; 37–41 in `steps-attribution.mjs`; 42 in `steps-correspondence.mjs`) |
| Record | `docs/evidence/W3/<date>/OQ-CMC/OQ-008-execution-record.md` (generated on execution; does not exist) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.10 | 2026-10-19 | Claude | OQ-CMC-42 after review: DELETE and TRUNCATE probed as the runtime role, each rolled back; the owner of the question's response set with a reason and read back in the Module 3 view. |
| 0.9 | 2026-10-19 | Claude | OQ-CMC-42 added for URS-CMC-030 (agency questions on Module 3 are the letter's record; the earlier CMC question file is read-only), implemented in `steps-correspondence.mjs`. |
| 0.8 | 2026-10-19 | Claude | OQ-CMC-41 added for URS-CMC-029 (the composed section states whether its shelf-life claim was signed for). |
| 0.7 | 2026-10-19 | Claude | OQ-CMC-40 added for URS-CMC-028 (the stability close-out under a signature). Steps 37–40 moved into `steps-attribution.mjs` as `steps-registers.mjs` passed the 500-line cap. |
| 0.6 | 2026-10-19 | Claude | OQ-CMC-39 added for URS-CMC-027 (no verdict and no filing for a programme the organisation does not hold). |
| 0.5 | 2026-10-18 | Claude | OQ-CMC-37 and OQ-CMC-38 added for URS-CMC-025 and URS-CMC-026 (every register edit records who changed it; the record's history is readable against the record). |
| 0.4 | 2026-10-18 | Claude | OQ-CMC-36 added for URS-CMC-024 (the ICH Q1E verdict). |
| 0.3 | 2026-10-18 | Claude | OQ-CMC-34 and OQ-CMC-35 added for URS-CMC-023 (the signing ceremony on every register that has a signed state). Four earlier steps corrected: OQ-CMC-26 and OQ-CMC-29 were passing on evidence that observed nothing, and OQ-CMC-04's expected prose did not match what it asserted — see `docs/evidence/CMC-M3-GA/2026-10-18/04-oq-008-runner/`. |
| 0.2 | 2026-10-18 | Claude | **The runner exists.** `tests/validation/oq/cmc/run.mjs` + `steps-filing.mjs` implement every step below, declaring each step's kind so an execution record prints the kind this protocol declares (`ci:validation-traceability`). Two steps added for the controls landed the same day: OQ-CMC-32 (URS-CMC-021, the §11.10(e) operator on every register create) and OQ-CMC-33 (URS-CMC-022, the approver is not one of the people who entered the records). Still not executed under the W3 posture — see §3 and §4. |
| 0.1 | 2026-10-12 | Claude | First protocol, written as CMC / Module 3 joined the launch catalog (decision P-28). The steps are drawn from the behaviour the shipped code shows under the staff simulation (`scripts/dev/cmc-staff-simulation.sh`, 158 checks green against a real server on 2026-10-12) and from the slice evidence under `docs/evidence/CMC-M3-GA/`. **No runner exists and nothing here has been executed under the W3 production posture.** |
| 0.11 | 2026-11-10 | W3 (`…01QoxbLc`) | **First executed, then revised** at the re-execution for GA (VSR-001 §21). The 2026-11-10 first execution of v0.10 (`docs/evidence/W3/2026-11-10/OQ-CMC/`, 19 pass, 9 fail, 5 deviation, 9 not executed) is the red record. **Runner defects.** OQ-CMC-02, -12 and -20 named an identity and acted with the run session. They now act as `OQ_VIEWER` and `OQ_MEMBER` (`requireIdentity`, `tests/validation/lib/credentials.mjs`), and OQ-CMC-02 also makes the viewer's write. OQ-CMC-02 read `GET /api/cmc/specifications`, which is no route: the specification and batch-record lists are `/:projectId`. OQ-CMC-13 matched binding basis `cmc-module3-section-version`, which no row carries (the product writes `…-sha256`, since 2026-08-14). It also required a bound digest the by-target read does not return. OQ-CMC-14 now reads the bound digest and the stored version snapshot as the runtime role and recomputes the digest with the product's recipe, because no product read serves either. OQ-CMC-22's release sends its `decision`, which the route has always required. OQ-CMC-33, -35 and -40 re-authenticate the run identity with a fresh authenticator code (`runReauth`); with the password alone they were answered 401 `REAUTH_TOTP_REQUIRED` before the control under test. OQ-CMC-30 records its deviation only on a server that says it is a development build (a report-only CSP), and a failure anywhere else. **Decisions after v0.10.** OQ-CMC-23: since `d9060a85e2` (2026-11-08) and P-110 item 1 (2026-11-09) a specification is approved only when the method it names, by the register's name, is in the project's register and validated or shown suitable under signature. The fixture names the method by its title and records its Q2 package (OQ-CMC-03), and the step validates it through the register's signed act first. OQ-CMC-36: since `ef71545c8e` (2026-10-22) the composition boundary holds at every CMC entry point, so each Q1E programme records its small-molecule drug substance before the compliance read. **§1:** the run identity is OQ-001's, an organisation admin (it authors the reference records). Launch scope refuses unattributed API paths, as production does by default (`LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`, OQ-CMC-29). |
| 0.12 | 2026-11-10 | W3 (`…01QoxbLc`) | Revised after the whole-package re-execution at head (`docs/evidence/W3/2026-11-10/re-execution/first-pass/OQ-CMC/`: 31 pass, 3 fail, 5 deviation, 3 not executed). All seven changes are runner defects; the product is unchanged. **OQ-CMC-18** looked for the word *approv* in the gate's sentence. The sentence names one blocker, the first in the gate's own precedence (`server/services/cmc/final-export-gate.ts`, since 2026-09-05), and `data` carries every blocker's count. The gate refused 409 with 20 of 21 sections unapproved and named the three sections with no source lineage. The step now reads the unapproved count from `data` and requires the sentence to name a blocker `data` confirms. URS-CMC-010 says each blocker is named: the sentence names one and the counts name the rest, which is recorded for the CMC owner. **OQ-CMC-19** matched a submission to its programme by `projectId`; `GET /api/submissions` names it `programId`. The step recorded *no submission spine* for a programme that had one, and OQ-CMC-20, -27 and -28 were not executed behind it. It also sent the sequence without its submission, which the route requires (400). With both fixed the placement is refused 409 by the final-export gate, which is the designed answer: the reference records compose sections the compiler scores incomplete, and those cannot be approved. The step records that refusal and no leaf as a deviation. The positive placement, OQ-CMC-27 and OQ-CMC-28 need a fixture whose every section can be approved; it is owed. **OQ-CMC-20** named `OQ_MEMBER` as the identity without the regulatory-author role. A member holds that role (`ORG_ROLE_FUNCTIONAL_GRANTS`, `server/middleware/auth.ts`, since 2026-09-02) and was answered by the gate, not by the role. The step is the viewer's, and depends on the approval, not on a completed placement. **OQ-CMC-29** probed `/api/cmc/projects/:id/process-capability`, which is claimed today, and recorded the served answer as `LAUNCH_SCOPE_API_UNATTRIBUTED=report`, a posture it never read (the server ran `enforce`). Every route the core CMC router registers is claimed at `97a0fec5cf`, so the probe is now a path under `/api/cmc` that names no register; the gate answers it before routing. A served probe is a failure. **OQ-CMC-33** took the first unapproved section, an incomplete one, and met the completeness refusal (409) before the separation of duties. It now takes a complete section. **OQ-CMC-18 and -19** also state what the runner executes: each row named further cases (the gate with a contradiction open, with a stale section and all clear; a placement into another submission's sequence) that no version of the runner has executed. They are owed. **OQ-CMC-41**'s close-out sent the password alone; it sends a fresh authenticator code as OQ-CMC-33, -35 and -40 do since v0.11. |
| 0.13 | 2026-11-10 | W3 (`…01QoxbLc`) | **The steps behind an approvable Module 3 are executed for the first time** (`docs/evidence/W3/2026-11-10/re-execution/OQ-CMC/`: 41 pass, 0 fail, 2 deviation, 0 not executed, of 43; the v0.12 record is kept at `re-execution/v0.12/OQ-CMC/`). New: OQ-CMC-03b, a second programme whose 23 records, each entered through its register route, compose 21 complete sections. Rewritten on it: OQ-CMC-17 (a batch rejected under signature raises the critical finding), OQ-CMC-19 (every section approved, the gate passed, Module 3 placed, one leaf per section), OQ-CMC-20, OQ-CMC-27 and OQ-CMC-28. Two runner defects stood behind steps that had never run: OQ-CMC-17 and OQ-CMC-27 each called a route the product does not serve. The product was not changed. Server code `d8ab1a1922`; the other protocols' records are at `97a0fec5cf`. After the execution the runner was edited twice for the lint limits, with no effect on what it sends: an escape character removed from three failure messages, and the record list split into two functions (the same 23 records in the same order; the list's SHA-256 is unchanged, `1189…ef5d`). |
| 0.14 | 2026-11-12 | W3 (`…01QoxbLc`) | **Re-executed after a product repair** (`docs/evidence/W3/2026-11-10/re-execution/OQ-CMC/`: 41 pass, 0 fail, 2 deviation, 0 not executed, of 43; the v0.13 record is kept at `re-execution/v0.13/OQ-CMC/`). v0.13 recorded, for the CMC owner, that a repeat of an identical placement rewrote every filing document and stopped a release signature clearing the sequence. That is repaired (`server/services/cmc/place-module3-into-submission.ts`): an unchanged repeat writes nothing. OQ-CMC-19 now asserts it. OQ-CMC-27 changes the content the way a programme does (the product's shelf life is edited, the stale sections are re-approved, the changed section is placed) and so also observes the gate with approved sections made stale, the last case OQ-CMC-18's row owed. Server code: `31047492b7` with the repair applied and not yet committed at execution; the other protocols' records are at `97a0fec5cf`. |

## 1. Method

As OQ-001 §1: the run identity (OQ-001's, an organisation admin; the
author of the reference records), a second tester-supplied identity holding signing authority (the
signer, read from `OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD` /
`OQ_SIGNER_TOTP_SECRET` by `tests/validation/lib/credentials.mjs`), and a
third read-only identity (the viewer), and a member with no signing authority
(`OQ_MEMBER`; v0.11: the steps that need one act as it, not as the run
identity). The signer must differ from the author. RLS enforcing, a non-owner
runtime role, launch scope enforced, and unattributed API paths refused as
production refuses them by default (`LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`).

**The programme under test** is a small-molecule US IND, which is what this
app composes (URS-CMC-005). A second programme, recorded as a biologic, is
created to show the composition refusal; it is the simulation's step 3c.

**Credentialed steps.** A section approval, a specification approval, a batch
release, a shelf-life close-out, a QC second-person review, a critical
contradiction resolution and the placement into a sequence are signing acts
(§11.50, §11.200). Each needs the signer's own credential, which the author's
session does not carry; absent the credential the step is recorded as a
deviation *not executed — credential not supplied* and every dependent step is
not-executed. No password or authenticator secret is written to a record.

**Digest recomputation.** The section-version snapshot's bound digest is
recomputed from the stored section record and compared with the
`electronic_signatures` row, as OQ-006 §1 recomputes the QMS document digest.

## 2. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-CMC-01 | URS-CMC-001 | scripted | `GET /api/cmc/drug-substances` anonymous | 401/403 |
| OQ-CMC-02 | URS-CMC-001 | scripted | as the viewer (`OQ_VIEWER`): every register's list for the programme, then a drug-substance write (v0.11) | each read 200; the write 403, and no row written |
| OQ-CMC-03 | URS-CMC-002 | prerequisite | create the IND programme (`productType: drug`, an agency application number) and register the small-molecule drug substance, drug product, method, specification, batches and stability under it | 201 each; every row carries the programme and the organisation |
| OQ-CMC-03b | URS-CMC-002 | prerequisite | create a second small-molecule US IND programme and enter, through the register routes, every record a complete Module 3 needs (23 records: `tests/validation/oq/cmc/complete-programme.mjs`); compile | each record created under the programme; 21 sections, each complete with nothing missing (v0.13) |
| OQ-CMC-04 | URS-CMC-002 | scripted | as the author of organisation A: read and write a register under organisation B's programme | the read names no record of that programme (404 / 403, or 200 with nothing); the write refused, no row written |
| OQ-CMC-05 | URS-CMC-003 | scripted | read `cmc_source_objects` for the programme after the register writes | one canonical source per recorded register row; no Module 3 section row yet |
| OQ-CMC-06 | URS-CMC-004 | scripted | `POST /api/cmc/module3-os/compile/:programme` | 200; the core §3.2.S / §3.2.P / 3.1 / 3.3 sections, the emittable 3.2.A appendices and US 3.2.R; each section's completeness is the compiler's and matches what the registers hold |
| OQ-CMC-07 | URS-CMC-004 | scripted | compile a programme with no recorded CMC data | 409, naming the registers to record first; nothing written |
| OQ-CMC-08 | URS-CMC-005 | scripted | compile the biologic programme | 409 `CMC_PRODUCT_CLASS_OUT_OF_SCOPE`; nothing composed; the refusal names ICH Q6B and Document editor & authoring |
| OQ-CMC-09 | URS-CMC-005 | scripted | set the programme's type to NDA and compile; then a substance recording neither route nor biological origin | 409 `CMC_APPLICATION_OUT_OF_SCOPE`, then 409 `CMC_MODALITY_NOT_ESTABLISHED`; nothing composed |
| OQ-CMC-10 | URS-CMC-006 | scripted | refresh a section with a body claiming `completeness: 100, missingInputs: []` | the stored record is the composer's; the body's claim is not written |
| OQ-CMC-11 | URS-CMC-007 | scripted | approve a section with no reason; then with a 7-character reason | 400 `REASON_REQUIRED` naming the field; nothing read or written; the short reason refused |
| OQ-CMC-12 | URS-CMC-007 | **credentialed** | as a member without signing authority (`OQ_MEMBER`, v0.11): approve a section | 403 `ESIGNATURE_NO_AUTHORITY`; no signature row |
| OQ-CMC-13 | URS-CMC-007 | **credentialed** | as the signer: approve a section with a wrong password; then with the password and a fresh authenticator code | 401 then 200; the section is `approved`; one `electronic_signatures` row with the signer, the meaning and the bound digest; a chained audit row; a version snapshot |
| OQ-CMC-14 | URS-CMC-007 | scripted | as the runtime role (`DATABASE_URL_RUNTIME`): read the signature row's bound digest and the approved version's stored snapshot; recompute the digest (v0.11) | basis `cmc-module3-section-version-sha256`; recomputed digest = the signature row's |
| OQ-CMC-15 | URS-CMC-008 | **credentialed** | as the signer: approve a section sending the content hash read before a recompile | 409 `SECTION_CHANGED`; nothing signed |
| OQ-CMC-16 | URS-CMC-009 | scripted | run the contradiction sweep; resolve a finding; re-run the sweep; change the underlying data; re-run | the sweep reports what it examined; the resolution survives the re-run; the changed data raises a new finding; a finding the data no longer shows is cleared |
| OQ-CMC-17 | URS-CMC-009 | **credentialed** | on the second programme (OQ-CMC-03b): reject a batch under signature (meaning `responsibility`) and sweep; read the final-export gate; resolve the **critical** finding as a member, as the signer with no reason, then as the signer with one (`PATCH /api/cmc/module3-os/contradictions/:id/resolve`, `resolutionNote`) | the sweep records one critical finding and the gate answers 409 counting it; 403 `ESIGNATURE_NO_AUTHORITY`, then 422 `REASON_REQUIRED`, with the row still open and no audit row naming it; then resolved, with a chained row and the chain reported ok (v0.13) |
| OQ-CMC-18 | URS-CMC-010 | scripted | the final-export gate with one section approved and the rest not | 409; `data` counts the unapproved sections; the sentence names a blocker `data` confirms (v0.12). The three further cases the row named until v0.11 are observed in other steps' records: a critical contradiction open (OQ-CMC-17, 409 counting it), every blocker cleared (OQ-CMC-19, 200) and approved sections made stale (OQ-CMC-27, 409 counting and naming them; v0.14) |
| OQ-CMC-19 | URS-CMC-011 | **credentialed** | on the second programme: validate the method under signature, compile, sweep, approve each of the 21 sections as the signer, read the final-export gate; create the IND sequence; place naming another submission, then into its own; then place again | every approval 200 and the gate 200; a placement naming another submission is refused and writes no leaf; 200 with one leaf per section; the repeat 200 with every section reported unchanged on its own filing document: no leaf and no document written (v0.14; until the 2026-11-12 repair a repeat rewrote every filing document) |
| OQ-CMC-20 | URS-CMC-011 | scripted | as the viewer, who holds no regulatory-author role (`OQ_VIEWER`, v0.12; `OQ_MEMBER` in v0.11): place the second programme's Module 3 into its sequence (v0.13: a placement that would otherwise succeed) | 403; no leaf written |
| OQ-CMC-21 | URS-CMC-012 | scripted | as the runtime role: UPDATE and DELETE on `cmc_module3_section_versions` and `cmc_provenance_events` | each refused by the database |
| OQ-CMC-22 | URS-CMC-013 | **credentialed** | release a batch over QC results that are not recorded; then not reviewed; then recorded and reviewed; then release it again; then edit the released record; then create a batch already `released` | 409, 409, 200 with the signer as `released_by`, 409, 409, 409 |
| OQ-CMC-23 | URS-CMC-013 | **credentialed** | validate the specification's method on its register under signature; approve the specification; then edit its content (v0.11) | the method validated; the approval 200; the approval is withdrawn with the reason recorded, not silently kept |
| OQ-CMC-24 | URS-CMC-014 | scripted | the ICH compliance check, QbD, control strategy, process capability, shelf-life, trending, poolability and dissolution comparison for the programme; then each for a programme of another organisation | each cites the guideline revision and the records it judged; each 404 for the foreign programme |
| OQ-CMC-25 | URS-CMC-015 | unscripted | the Overview and Module 3 build screens for the programme, and for a programme with nothing recorded | the approvals, portfolio, build state and the gate's own readiness verdict are shown; an uncomputed figure says so; a never-swept programme is not reported as swept and clear |
| OQ-CMC-26 | URS-CMC-016 | scripted | read the posture a turn needs, then `start_intelligence_flow` for `cmc` and for a kind that reaches no record | the CMC interview starts; the other is refused `LAUNCH_SCOPE`, naming where its answers would have gone. Both are AnA tools, reachable only through a turn: without a configured provider and `LAUNCH_SCOPE_ENFORCE` the step records *not executed* |
| OQ-CMC-27 | URS-CMC-017 | **credentialed** | as the signer: sign the second programme's sequence for dispatch (`POST /api/c2c/actions/sign`, intent `dispatch`); place Module 3 again unchanged; change the product's shelf life, read the gate, compile, re-approve what lost its approval, and place; read the release verdict at each point | signed and bound to the current leaf manifest, clearing the release; an unchanged placement leaves it clearing; the edit makes approved sections stale and the gate refuses 409 until they are re-approved; once the changed section is placed the signature no longer clears the sequence and the verdict says to sign the current content (v0.14) |
| OQ-CMC-28 | URS-CMC-018 | scripted | the dispatch verdict of the first programme's original IND sequence, which carries no Module 3; then of the second programme's, where Module 3 is placed | blocked for 3.2.S and for 3.2.P, each finding citing 21 CFR 312.23(a)(7) and (b) and naming both remedies; no such finding once placed (v0.13). The third case, clearance by a cross-referenced DMF with its Letter of Authorization, is not executed by the runner and is owed |
| OQ-CMC-29 | URS-CMC-019 | scripted | a path the CMC screens call, and a path under `/api/cmc` that names no register and no surface claims (`/api/cmc/unclaimed-probe`, v0.12), with launch scope enforced | the called path served; the unclaimed path 403 `LAUNCH_SCOPE`. With `LAUNCH_SCOPE_ENFORCE` off the step records *partly executed*; with it on, a served probe is a failure (v0.12) |
| OQ-CMC-30 | URS-CMC-020 | scripted | an orchestrator run over the programme before approval and after the gate opens; and a run carrying inline CMC data | before: no Module 3, and the run says the gate refused it; after: Module 3 carried; inline data 400 `INLINE_CMC_SOURCES_REFUSED` |
| OQ-CMC-32 | URS-CMC-021 | scripted | record one row in each register, then read the chained audit trail for the programme | one `cmc.register.create` row per recorded row, naming the operator, the register and the record; none anonymous |
| OQ-CMC-33 | URS-CMC-022 | scripted | as the author who recorded the registers: approve a complete section other than the approved one (v0.12); then with the meaning `authorship` | 403 `SEPARATION_OF_DUTIES` naming why; then 400 `APPROVAL_IS_NOT_AUTHORSHIP`; nothing signed either time |
| OQ-CMC-34 | URS-CMC-023 | scripted | on each of analytical methods, process validation and comparability: create with the register's signed word (and its signer and date) in the body, then edit an ordinary record into it; then create a QC result already carrying `reviewedBy` | each refused 409 naming the governed path that does record it; nothing written, and no signer or date set |
| OQ-CMC-35 | URS-CMC-023 | scripted | sign each of the three through the path its refusal named: with no reason, with a reason but no re-authentication, with both but without the thing the signature accepts, then with everything; then edit the signed record | 400, then 401, then 409 naming what is missing, then 200 with the status, the signer and the date set and one `electronic_signatures` row bound to the chained audit row; the edit 409 `SIGNED_RECORD` |
| OQ-CMC-36 | URS-CMC-024 | scripted | record four programmes, each with its small-molecule drug substance (v0.11): a shelf-life claim within the long-term coverage, one beyond it, one beyond it with no accelerated study, and one whose claim is free text that states no period; read the ICH compliance verdict for each | Q1E `pass`, then a finding naming the months claimed and the months covered, then a second finding that Q1E admits extrapolation only on accelerated data, then `not_evaluated` quoting the text it could not read — never a pass. The clinical-trial verdicts cite 21 CFR 312.23(a)(7)(ii) |
| OQ-CMC-37 | URS-CMC-025 | scripted | edit one record in each of three registers — a serial one, a uuid one, and one moved by two fields at once — then send the same body again; then edit a record that does not exist; read each record's chained history back | one act per edit that moved something, each naming the actor, the fields that moved and both values; the repeat body adds no act; the unknown record is a 404 that adds none; every act is sealed into the tenant chain, and the ledger's own chain verdict is `ok` |
| OQ-CMC-38 | URS-CMC-026 | scripted | read the change history through the product's own route for each edited record, then ask it for a record that does not exist and for a register that keeps no history; read the specifications register's own history route | the create and each edit in order with the person, the fields and both values; 404 for the unknown record; 404 naming the registers that do keep one — never an empty history; the specifications route still answers 200. Cross-tenant refusal is evidenced outside this run (no second organisation is provisioned for an OQ run) |
| OQ-CMC-39 | URS-CMC-027 | scripted | ask for an ICH compliance verdict, a QbD derivation and a control strategy, and file a container closure, a comparability assessment and a material specification, under three programme ids the organisation does not hold — one well-formed uuid naming nothing, one malformed id, and (when supplied) one of a second tenant — then the same six under the run's own programme; and one create with no programme at all | each read 404 stating nothing was assessed and each create 409 naming the programme as not this organisation's, with nothing written; the same six succeed under the run's own programme; the create with no programme is accepted as an organisation-wide record |
| OQ-CMC-40 | URS-CMC-028 | scripted | create a study already COMPLETED with a shelf life, then close an ordinary study out by PUT; then sign the close-out with no reason, with a reason but no re-authentication, with both but no shelf life recorded, with a shelf life but no results pulled, and with everything; then edit the closed-out study and close it out again | the create and the PUT each refused 409 naming POST /api/cmc/stability-studies/:id/close-out with nothing stored; then 400, then 401, then 409 naming the missing shelf life, then 409 naming the absent results; then 200 with COMPLETED, the signer and the date set and one `electronic_signatures` row; the edit after is 409 and a second close-out is 409 already COMPLETED |
| OQ-CMC-41 | URS-CMC-029 | scripted | record the same shelf-life claim, the same three pull-point results and the same condition on two programmes, close one out under a signature, and compose §3.2.P.8 for each | both sections state the period and the data it is subject to review of; the signed one reads *accepted on a signed study close-out* and the running one *recorded on a study that has not been closed out under signature* — the only difference between the two sections |
| OQ-CMC-42 | URS-CMC-030 | scripted | POST and PATCH `/api/cmc/agency-questions`; as the runtime role (`DATABASE_URL_RUNTIME`), INSERT, UPDATE, DELETE and TRUNCATE on `reg_questions`, each in a transaction rolled back; log a response-required letter on the programme and record a question on it at §3.2.P.7 with a reason; set its owner to a member of the organisation with a reason; read the programme's Module 3 questions | 410 `CMC_QUESTION_FILE_READ_ONLY` twice with the earlier file's counts unchanged; the database refuses all four statements (42501); 201 for the question; 200 for the owner; the Module 3 read lists it at §3.2.P.7 from the question itself, unanswered, not overdue, with that owner. The owner role's refusal (the trigger) is evidenced outside this run, which holds no owner connection: `tests/db/cmc-agency-questions-converged.dbtest.ts`. Without `DATABASE_URL_RUNTIME` the database half is a deviation, *not executed*. Withheld letters are evidenced outside this run (no legal-role identity is provisioned for an OQ run): `tests/db/cmc-agency-questions-converged.dbtest.ts` |
| OQ-CMC-31 | URS-CMC-001, URS-CMC-022 | ad-hoc | the tester records anything observed that no step above covers | reviewer judgment |

## 3. Execution record

**None.** This protocol has not been executed. Executing it requires the W3
production posture (RLS enforcing, non-owner runtime role, launch scope
enforced, a credentialed second signer) at one commit beside IQ-001 and
OQ-001…007.

## 4. What is owed before signature

**The runner is done** (2026-10-18): `tests/validation/oq/cmc/run.mjs` with
`steps-filing.mjs` and `signed-acts.mjs`, on the pattern of the Projects and QMS
runners. What a run of it needs, and what remains after one:

1. **The identities.** Beyond the run identity (an ordinary member, the author
   of the reference records), a run observes its negatives only with:
   `OQ_SIGNER_*` — a second identity holding signing authority, which every
   credentialed step uses and which must not be the author;
   `OQ_MEMBER_*` — an identity WITHOUT signing authority or the
   regulatory-author role (OQ-CMC-12, OQ-CMC-20);
   `OQ_VIEWER_*` — a read-only identity (OQ-CMC-02);
   `DATABASE_URL_RUNTIME` — the non-owner runtime role, so the append-only
   refusal of OQ-CMC-21 is observed from the connection that is actually
   refused rather than from an owner session.
   A step whose identity is absent records a deviation *not executed —
   credential not supplied*, and every dependent step is not-executed. That is
   the designed behaviour, not a pass.
2. **OQ-007 for Reporting & analytics**, the seventh app, which has no
   protocol or runner. "OQ-001…007" in decision P-28 names a set that is not
   yet complete.
3. **Execution** under the posture in §1, at one commit with IQ-001 and
   OQ-001…007, and the record filed under `docs/evidence/W3/<date>/OQ-CMC/`.
4. **A named expert's verification of the reference records** — the substance,
   product, specification, batch and stability data OQ-CMC-03 creates and every
   later step is run against, and the 23 records of the second programme
   (OQ-CMC-03b, `tests/validation/oq/cmc/complete-programme.mjs`) — signed, as
   decision P-28 requires before CMC is described as validated. The runner creates those records; it cannot vouch
   for them, and nothing in it claims to.
5. **TM-001 regenerated** from that execution, and VSR-001 §8 amended with the
   result.

Until items 2 to 5 are done, nothing in the product or its documentation
describes CMC / Module 3 as validated.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
