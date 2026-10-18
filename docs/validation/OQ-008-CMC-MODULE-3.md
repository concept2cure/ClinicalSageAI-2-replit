# OQ-008 — Operational Qualification protocol: CMC / Module 3

| Field | Value |
|---|---|
| Document ID | OQ-008 |
| Version | 0.4 |
| Status | **DRAFT — UNSIGNED, NOT EXECUTED** |
| Parent | VMP-001 §5; requirements URS-007 |
| Runner (the executable protocol) | `tests/validation/oq/cmc/run.mjs` (steps 19–33 in `tests/validation/oq/cmc/steps-filing.mjs`, which it imports) |
| Record | `docs/evidence/W3/<date>/OQ-CMC/OQ-008-execution-record.md` (generated on execution; does not exist) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.4 | 2026-10-18 | Claude | OQ-CMC-36 added for URS-CMC-024 (the ICH Q1E verdict). |
| 0.3 | 2026-10-18 | Claude | OQ-CMC-34 and OQ-CMC-35 added for URS-CMC-023 (the signing ceremony on every register that has a signed state). Four earlier steps corrected: OQ-CMC-26 and OQ-CMC-29 were passing on evidence that observed nothing, and OQ-CMC-04's expected prose did not match what it asserted — see `docs/evidence/CMC-M3-GA/2026-10-18/04-oq-008-runner/`. |
| 0.2 | 2026-10-18 | Claude | **The runner exists.** `tests/validation/oq/cmc/run.mjs` + `steps-filing.mjs` implement every step below, declaring each step's kind so an execution record prints the kind this protocol declares (`ci:validation-traceability`). Two steps added for the controls landed the same day: OQ-CMC-32 (URS-CMC-021, the §11.10(e) operator on every register create) and OQ-CMC-33 (URS-CMC-022, the approver is not one of the people who entered the records). Still not executed under the W3 posture — see §3 and §4. |
| 0.1 | 2026-10-12 | Claude | First protocol, written as CMC / Module 3 joined the launch catalog (decision P-28). The steps are drawn from the behaviour the shipped code shows under the staff simulation (`scripts/dev/cmc-staff-simulation.sh`, 158 checks green against a real server on 2026-10-12) and from the slice evidence under `docs/evidence/CMC-M3-GA/`. **No runner exists and nothing here has been executed under the W3 production posture.** |

## 1. Method

As OQ-001 §1: a run identity that is an ordinary organisation member (the
author), a second tester-supplied identity holding signing authority (the
signer, read from `OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD` /
`OQ_SIGNER_TOTP_SECRET` by `tests/validation/lib/credentials.mjs`), and a
third read-only identity (the viewer). The signer must differ from the author.
RLS enforcing, a non-owner runtime role, launch scope enforced.

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
| OQ-CMC-02 | URS-CMC-001 | scripted | as the viewer: every register read, then every register write | each read 200; every write 403, and no row written |
| OQ-CMC-03 | URS-CMC-002 | prerequisite | create the IND programme (`productType: drug`, an agency application number) and register the small-molecule drug substance, drug product, method, specification, batches and stability under it | 201 each; every row carries the programme and the organisation |
| OQ-CMC-04 | URS-CMC-002 | scripted | as the author of organisation A: read and write a register under organisation B's programme | the read names no record of that programme (404 / 403, or 200 with nothing); the write refused, no row written |
| OQ-CMC-05 | URS-CMC-003 | scripted | read `cmc_source_objects` for the programme after the register writes | one canonical source per recorded register row; no Module 3 section row yet |
| OQ-CMC-06 | URS-CMC-004 | scripted | `POST /api/cmc/module3-os/compile/:programme` | 200; the core §3.2.S / §3.2.P / 3.1 / 3.3 sections, the emittable 3.2.A appendices and US 3.2.R; each section's completeness is the compiler's and matches what the registers hold |
| OQ-CMC-07 | URS-CMC-004 | scripted | compile a programme with no recorded CMC data | 409, naming the registers to record first; nothing written |
| OQ-CMC-08 | URS-CMC-005 | scripted | compile the biologic programme | 409 `CMC_PRODUCT_CLASS_OUT_OF_SCOPE`; nothing composed; the refusal names ICH Q6B and Document editor & authoring |
| OQ-CMC-09 | URS-CMC-005 | scripted | set the programme's type to NDA and compile; then a substance recording neither route nor biological origin | 409 `CMC_APPLICATION_OUT_OF_SCOPE`, then 409 `CMC_MODALITY_NOT_ESTABLISHED`; nothing composed |
| OQ-CMC-10 | URS-CMC-006 | scripted | refresh a section with a body claiming `completeness: 100, missingInputs: []` | the stored record is the composer's; the body's claim is not written |
| OQ-CMC-11 | URS-CMC-007 | scripted | approve a section with no reason; then with a 7-character reason | 400 `REASON_REQUIRED` naming the field; nothing read or written; the short reason refused |
| OQ-CMC-12 | URS-CMC-007 | **credentialed** | as a member without signing authority: approve a section | 403 `ESIGNATURE_NO_AUTHORITY`; no signature row |
| OQ-CMC-13 | URS-CMC-007 | **credentialed** | as the signer: approve a section with a wrong password; then with the password and a fresh authenticator code | 401 then 200; the section is `approved`; one `electronic_signatures` row with the signer, the meaning and the bound digest; a chained audit row; a version snapshot |
| OQ-CMC-14 | URS-CMC-007 | scripted | recompute the bound digest from the stored section version | recomputed digest = the signature row's |
| OQ-CMC-15 | URS-CMC-008 | **credentialed** | as the signer: approve a section sending the content hash read before a recompile | 409 `SECTION_CHANGED`; nothing signed |
| OQ-CMC-16 | URS-CMC-009 | scripted | run the contradiction sweep; resolve a finding; re-run the sweep; change the underlying data; re-run | the sweep reports what it examined; the resolution survives the re-run; the changed data raises a new finding; a finding the data no longer shows is cleared |
| OQ-CMC-17 | URS-CMC-009 | **credentialed** | resolve a **critical** finding as a member, then as the signer | 403 `ESIGNATURE_NO_AUTHORITY` with the row still open and no audit row; then resolved with a reason and a chained row |
| OQ-CMC-18 | URS-CMC-010 | scripted | the final-export gate with one section unapproved; with a critical contradiction open; with an approved section made stale; with every blocker cleared | 409 each time, naming the blocker; 200 only when all are clear |
| OQ-CMC-19 | URS-CMC-011 | **credentialed** | place the approved Module 3 into the programme's IND sequence; then into a sequence of another submission; then retry the first with the same key | 200 with one leaf per placed section; the foreign sequence refused; the retry idempotent (no second leaf) |
| OQ-CMC-20 | URS-CMC-011 | scripted | as a member without the regulatory-author role: place | 403; no leaf written |
| OQ-CMC-21 | URS-CMC-012 | scripted | as the runtime role: UPDATE and DELETE on `cmc_module3_section_versions` and `cmc_provenance_events` | each refused by the database |
| OQ-CMC-22 | URS-CMC-013 | **credentialed** | release a batch over QC results that are not recorded; then not reviewed; then recorded and reviewed; then release it again; then edit the released record; then create a batch already `released` | 409, 409, 200 with the signer as `released_by`, 409, 409, 409 |
| OQ-CMC-23 | URS-CMC-013 | **credentialed** | approve a specification, then edit its content | the approval is withdrawn with the reason recorded, not silently kept |
| OQ-CMC-24 | URS-CMC-014 | scripted | the ICH compliance check, QbD, control strategy, process capability, shelf-life, trending, poolability and dissolution comparison for the programme; then each for a programme of another organisation | each cites the guideline revision and the records it judged; each 404 for the foreign programme |
| OQ-CMC-25 | URS-CMC-015 | unscripted | the Overview and Module 3 build screens for the programme, and for a programme with nothing recorded | the approvals, portfolio, build state and the gate's own readiness verdict are shown; an uncomputed figure says so; a never-swept programme is not reported as swept and clear |
| OQ-CMC-26 | URS-CMC-016 | scripted | read the posture a turn needs, then `start_intelligence_flow` for `cmc` and for a kind that reaches no record | the CMC interview starts; the other is refused `LAUNCH_SCOPE`, naming where its answers would have gone. Both are AnA tools, reachable only through a turn: without a configured provider and `LAUNCH_SCOPE_ENFORCE` the step records *not executed* |
| OQ-CMC-27 | URS-CMC-017 | **credentialed** | sign the sequence's release, then place a further Module 3 leaf, then read the dispatch gate | after the new leaf the release reads as no release signature for that sequence, and signing the sequence again is offered |
| OQ-CMC-28 | URS-CMC-018 | scripted | the dispatch readiness of an original IND sequence carrying Module 1 only; then with 3.2.S and 3.2.P placed; then with a cross-referenced DMF and its Letter of Authorization | blocked, citing 21 CFR 312.23(a)(7) and (b) and naming both remedies; clear once placed; clear by reference, and the verdict says what it rests on |
| OQ-CMC-29 | URS-CMC-019 | scripted | a path the CMC screens call, and the one prefix under `/api/cmc` the surface registry does not claim (`/api/cmc/projects`), with launch scope enforced | the called path served; the unclaimed path 403 `LAUNCH_SCOPE`. With `LAUNCH_SCOPE_ENFORCE` off the step records *partly executed* rather than reading the served response as a pass |
| OQ-CMC-30 | URS-CMC-020 | scripted | an orchestrator run over the programme before approval and after the gate opens; and a run carrying inline CMC data | before: no Module 3, and the run says the gate refused it; after: Module 3 carried; inline data 400 `INLINE_CMC_SOURCES_REFUSED` |
| OQ-CMC-32 | URS-CMC-021 | scripted | record one row in each register, then read the chained audit trail for the programme | one `cmc.register.create` row per recorded row, naming the operator, the register and the record; none anonymous |
| OQ-CMC-33 | URS-CMC-022 | scripted | as the author who recorded the registers: approve a section; then with the meaning `authorship` | 403 `SEPARATION_OF_DUTIES` naming why; then 400 `APPROVAL_IS_NOT_AUTHORSHIP`; nothing signed either time |
| OQ-CMC-34 | URS-CMC-023 | scripted | on each of analytical methods, process validation and comparability: create with the register's signed word (and its signer and date) in the body, then edit an ordinary record into it; then create a QC result already carrying `reviewedBy` | each refused 409 naming the governed path that does record it; nothing written, and no signer or date set |
| OQ-CMC-35 | URS-CMC-023 | scripted | sign each of the three through the path its refusal named: with no reason, with a reason but no re-authentication, with both but without the thing the signature accepts, then with everything; then edit the signed record | 400, then 401, then 409 naming what is missing, then 200 with the status, the signer and the date set and one `electronic_signatures` row bound to the chained audit row; the edit 409 `SIGNED_RECORD` |
| OQ-CMC-36 | URS-CMC-024 | scripted | record four programmes: a shelf-life claim within the long-term coverage, one beyond it, one beyond it with no accelerated study, and one whose claim is free text that states no period; read the ICH compliance verdict for each | Q1E `pass`, then a finding naming the months claimed and the months covered, then a second finding that Q1E admits extrapolation only on accelerated data, then `not_evaluated` quoting the text it could not read — never a pass. The clinical-trial verdicts cite 21 CFR 312.23(a)(7)(ii) |
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
   later step is run against — signed, as decision P-28 requires before CMC is
   described as validated. The runner creates those records; it cannot vouch
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
