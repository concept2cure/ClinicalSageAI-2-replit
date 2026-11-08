# RIM re-plan onto the one design plan (2026-11-01)

Session `session_011e42DEAR2U6W51Mjvgfgbt` ("RIM system build-out"). Written read-only against trunk **`609ef94c7`** on
`concept2cure-v2`. The mappers read **`d914c2618`**. The 17 commits since then change only coordination, design and
other lanes. Of the files this plan touches, one changed: `3cacf2e15` (Shadow Review, `session_017CFk…`) edited
`server/services/ectd/assess-dispatch-readiness.ts`, `SubmissionSeqWorkspaces.tsx` (+4 lines) and
`scripts/db/migration-set.mjs`. That commit is dated 2026-10-25 but landed today.

## Why this plan, and what binds it

The founder, today: *"Continue the RIM build out but now stay coordinated with this build and UI plan that must be
followed but you can add [to] it for your special work."*

These bind every step below:

- **CLAUDE.md RULE 3** (search first; complete, never rebuild).
- **RULE 4** (one product: no card, panel, screen or editor per capability).
- **RULE 5** (`docs/design/ONE_DESIGN_PLAN.md` and its ledger `docs/design/one-design-plan.json`).
- **RULE 6** (nothing new; every commit carries `Completes: <existing path>`).
- **The gate**, `scripts/ci/check-one-design-plan.mjs`, which refuses a commit that:
  - has no `Plan:`;
  - names an unknown or non-open package;
  - touches a file outside its package's paths (tests, `docs/evidence/**` and `.design/**` are always allowed);
  - adds an unapproved surface (`UI_SURFACES` id or `SURFACE_VIEWS` key), `/api` mount or `CREATE TABLE` of a new
    name;
  - adds a new route file under `server/routes|api`;
  - adds a new service (a new folder, or a new file directly under `server/services/`);
  - adds a new AnA tool name;
  - has no `Completes:`, or names a path that did not exist;
  - touches a plan file outside `Plan: PLAN` + `Founder-Decision`.
- **`.design/claude-convergence/COORDINATION.md` and `BUILD_ORDER.md`** (landed today, `b7c7cf9f0`, `c29c2aa85`,
  `609ef94c7`). They set what this session does:
  - **This session's lane.** RIM is "S5 behaviour, D7 layout (Submission Center)". It owns build-order lane
    **L9 Submission** (D7-A1, D7-A2, D7-A3, then the S5 eCTD 4.0 reach). L9 is Wave 1b, which opens after D0-4 is
    pushed, the `styles/**` lock row is deleted, and D5-0 has landed.
  - **This session's holds** (one session per file, plan §4.6): `scripts/db/migration-set.mjs` (recorded as "F1
    slice 1: an additive column for `ectd_compilations`"), and `prior-sequence-loader.ts`, `submission-service.ts`
    and `fda-esg-receipts.ts` (F1 slices 1 and 2).
  - **D0 locks** until its message: `design-system/**`, `client/src/concept2cure/v2/styles/**`, `AnswerLead.tsx`,
    `icons.tsx`, `C2CForm.tsx` and `dataConnect.tsx`. No step below edits them. Steps may use them as they are.
  - **S packages change behaviour, never layout.** Layout follows the D spec.
- **Decision numbers are the founder's alone** (the coordinator, 2026-11-01). Trunk's decisions run to **P-85**
  (`522316350`, today). The designs' "P-48", "P-49", "P-50" and "P-51" collide with trunk's QMS, training,
  training-grace and review-routing decisions. No step here cites or assigns a number.
- **The repo-health ceiling** (`audit:repo-health:ceiling` in `.husky/pre-push`). It counts files over 100,000 bytes or
  1,500 lines, and the count only goes down:
  - `server/routes/ectd-compile.ts` is at 99,526 bytes, so **474 bytes of headroom**.
  - `EctdCompile.tsx` is at 95,908 bytes (4,092 left).
  - `SubmissionCenter.tsx` (100,598) and `SubmissionSeqWorkspaces.tsx` (122,623) are already counted.

Two re-cut designs written today by this session already carry steps 1–3:
- `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/f1-filed-is-what-was-sent.design.md`
- `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/f1-test-send-is-not-a-filing.design.md`

This plan orders everything else around them.

---

## 1. What already exists on trunk, item by item

### 1.1 What the agency holds (the filed fold) and what transmit records

- **`server/services/ectd/prior-sequence-loader.ts`**
  - `readFiledManifestRows` (:204-228) is the one query behind the filed state. It reads every non-rehearsal
    `ectd_compilations` row with a `leaf_manifest` that joins, **by sequence number**, to a live `ectd_sequences` row
    whose `dispatch_status` is sent or acknowledged.
  - `foldManifestRows` (:296-367) applies each row as a delta: supersession by modified-file (P-42) and per-leaf
    history (`cd5fd2281`).
  - `loadFiledStateBySubmission` (:249-274) and `loadLatestPriorManifestBySubmission` (:153) both read it.
- **The defect, reproduced at `d914c2618`.**
  - (a) Phantom leaf. A leaf that only an earlier preview carried reads as on file. Probe output:
    `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/ectd-probe/phantom-leaf.trunk-d914c2618.out.txt`.
  - (b) Sent without a compile. A sequence sent with no compile row is missing from the record, so the next sequence
    binds against an empty prior state. Probe output:
    `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/ectd-probe/sent-without-compile.trunk-d914c2618.out.txt`.
  - Both feed the NEXT sequence's lifecycle operations through `package-from-core.ts:449-462` (row D7).
- **`server/services/submission-gateways/index.ts` (the guard, :244-327).**
  - It already proves the dispatch binding against the signature and the bundle SHA.
  - It keeps the exact bytes before the wire (`archiveSentPackage`, `3cab286e1`).
  - It stamps `metadata.sentPackage` and `metadata.gatewayAccount` server-side, after the caller's metadata.
  - It does not stamp the bundle's `leafManifest`, which it holds in `req.bundle`.
- **The transmittal row.** `fda-esg.ts:360-385` `createTransmittalRow` inserts `submission_transmittals` as 'pending'
  before the wire, with `dispatchBinding` {attemptId, sequenceId, signatureActionId, bundleSha256}. The REST helper
  (`rest-gateway-helpers.ts:85-112`) and CESP insert the guard's metadata without the binding.
  - The table is public, with `organization_id integer NOT NULL` and `metadata jsonb`
    (`migrations/20260509_submission_gateways.sql`).
  - Every later metadata writer merges rather than replaces: `fda-esg.ts:670` uses `jsonb_set`, `fda-esg-receipts.ts`
    spreads `current.metadata`, and the other two use `||`.
- **`ectd_sequences.transmit_attempt_id`** binds the sequence to the attempt that settled it.
- **What transmit does not record.** `transmitDispatchedSequence` (`submission-service.ts:2668-3010`) re-assembles at
  send time. It writes no compile row and no leaf manifest.
- **The view.** `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx` ("On file at the agency", mounted in
  `EctdCompile.tsx`) says it reads "the leaf manifests of the filed sequences".
- **This session's own stopped attempt 1** (columns on `ectd_compilations` plus a 'transmitted' row) is kept at
  `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/f1-slice1-attempt1/`.
  Keep it for its test scenarios only.

### 1.2 Test-environment sends on the sequence spine

- **`submission-service.ts`**
  - `toDispatchStatus` (:2331-2335) has no environment, so a successful staging send writes 'sent' at :2947.
  - `resendRefusal` (:2321-2329) then refuses the production send of the same sequence.
  - A staging post-wire failure stays 'transmitting'.
- **`fda-esg-receipts.ts` `resolveReceiptSequence`** (:105-132) also writes 'sent' for a staging MDN (:108).
- **The rule already exists on the package spine** (sweep F14, `governed-transmit.ts:422-429`: a non-production
  send records nothing). `docs/runbooks/ectd-transmit-path.md:140-145` says "Filed means transmitted to production".
- **Every filed reader is an allow-list** of 'sent'/'acknowledged' (`filed-dispatch.ts`, `filingOrderRefusal`,
  `commitment-fulfilment.ts`, `routes/c2c/documents.ts`, the commitment trigger in
  `migrations/20261019_commitment_fulfilment_evidence.sql`, and the client).
- **The Dispatch tab's `TransmitPanel`** (`SubmissionSeqWorkspaces.tsx:1942-2010`) defaults to "Staging (agency test)".
- **Nothing on trunk adds a test-send state.** No commit since `73005b856` changed either writer.

### 1.3 eCTD completion (the earlier `ectd-complete.design.md`)

- **The history half of gap 6.2 is on trunk** (`cd5fd2281`): each leaf's filed acts, shown as one line in
  `EctdFiledState.tsx`.
- **Not on trunk:**
  - each leaf's source document and version (the manifest entry, `sequence-manifest.ts:27-64`, records none);
  - the withdrawn documents;
  - sent-at and sent-by;
  - honest error states;
  - the declared filed-elsewhere baseline (`filed-sequence-baseline.ts`, `88229a87d`), which the view does not read;
  - reopening a recorded compile (`EctdCompile.tsx` `CompilationHistoryTable` :648 renders the live compile only).
- **The second fold, `package-sequence-lifecycle.ts:231` `foldFiledState`,** is unchanged since `8e2d0bd98`. It is
  reached only from an assemble endpoint that no screen calls. Work-orders row 167 claims it for
  `01LjrcEe8y3zUQxwX91zzTaM`.
- **The IND `/sequence/:id/diff`, `/manifest` and their PDFs, plus dispatch-gate's embedded manifest**
  (`server/routes/ind-lifecycle/sequence.routes.ts:74-230`) have no caller and are unclaimed. They read the mutable
  `submission_leaves`.
- **Reusable as they stand:**
  - `readSubmissionLeafSourceEvidence` (`submission-leaf-source-evidence.ts:300`);
  - `VaultVersionViewer.tsx` (`VersionViewButton`);
  - `SOURCE_VERDICT` and `pinVerdict` (`SubmissionSeqWorkspaces.tsx:522`, :545);
  - `moduleOfSectionKey` (`required-sections.ts:101`);
  - `compareSectionCode` (`shared/regulatory/section-code.ts:140`).
- **Layout.** The D7 spec (`.design/claude-convergence/D7.md`, step D7-A3) owns the layout of `EctdCompile.tsx` and
  `EctdFiledState.tsx`. That lane is now this session's (L9).

### 1.4 Retiring a sequence

- **No retire act exists.** A grep for `SEQUENCE_RETIRED`, `retireSequence` and `SequenceRetirement` finds nothing.
- **The only signed removal from the live set** is the filed-baseline declaration, which soft-deletes empty, undispatched
  US drafts (`filed-sequence-baseline.ts:146-162`, :197-201).
- **The patterns to copy:** the two non-transition signed acts on a sequence, P-34 (`shadow-review-waiver.ts`) and
  P-35 (`shadow-finding-disposition.ts`), with their endpoints in `server/routes/submissions.ts:1483`, :1514.
- **Shipped defects found while reading** (each verified at `609ef94c7`):
  - `createSequence` (`submission-service.ts:685-728`) refuses only filed-baseline numbers. There is no unique index on
    (submission, region, number), so **two live 0000 sequences can exist**, and the fold joins compiles by number.
  - `transitionSequence`'s CAS (:803-820) has no `deleted_at` predicate.
  - `assessSequenceDispatchReadiness` (`assess-dispatch-readiness.ts:778-779`) reads the sequence with no `deleted_at`
    filter. AnA, MCP and the IND route call it.
  - `server/routes/ind-lifecycle/shared.ts:54-91` `fail()` maps four codes. `GOVERNED_REQUIRED`, `DISPATCH_BLOCKED` and
    the rest of `SUBMISSION_ERROR_STATUS` (`submission-service.ts:162`) answer 500.

### 1.5 Commitments

- **Done on trunk:**
  - `c2c_commitments` converged and made read-only (`7bc96a3e1`, P-39 step 2);
  - `haq_session` retired (`9e73fad98`, P-39 step 4);
  - P-41 fulfilment, signed for PMR/PMC/REMS (`commitment-fulfil-route.ts`, `ha-interactions/{ha-logic,commitment-fulfilment,fulfilment-record}.ts`);
  - extract commitments on the letter side (`e505e62fb`, Plan S10: `shared/agency/letter-commitments.ts`, GET
    commitment-proposals and POST commitments in `server/routes/c2c/agency-responses.ts:409-449`).
- **P-39 step 4 already decides `lifecycle_obligations`** (deferred, destination corrected). Its Reporting readers are
  owed by the Reporting lane.
- **Milestones.** The `commitment_milestones` table and one writer exist (`ha-service.ts:364-389` `addMilestoneTx`;
  the organisation door's POST `/commitments/:id/milestones`, `server/routes/ha-interactions.ts:314-325`). The rest
  is missing:
  - no client caller;
  - no reader (`listCommitments` :427);
  - no project-door twin;
  - no met or withdraw act;
  - no refusal for a terminal commitment or a bad date.
- **Not on trunk:**
  - correcting a fulfilment signed in error (P-41 says it is owed);
  - any client caller of the letter's commitment routes;
  - an owner column;
  - commitments as due work (`deadline-radar.ts` reads the writerless `regulatory_obligations`).
- **AnA's `create_regulatory_commitment`** (`AnaToolExecutor.ts:11106-11141`) is held as `hiddenApp`. It would still
  write if admitted.

### 1.6 Question proposals (G3) and this session's slice 3

- **`shared/agency/letter-questions.ts` (G3, 84 lines)** is the one model-free splitter. Its callers are the inbox
  proposals (`server/services/agency-responses/letter-question-proposals.ts`, GET .../question-proposals) and AnA's
  `draft_fda_ir_response`.
- **The client:** `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx` renders inside `AgencyResponses.tsx`.
- **The oracle run on trunk's splitter.**
  - Oracle: `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/redteam/oracle-g3.mts`.
  - Report: `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/redteam/g3-report.txt`.
  - Result: 1,261 inputs and 3,288 violations, with 741 inputs failing.
  - Largest clauses: P2-furniture 747, P5-control 670, P1-foreign heading 540, P6-merged 408, P3-duplicate 375.
- **The three harms a person meets on shipped behaviour:**
  1. **Repeated numbers are marked "Recorded".** `sameQuestionRef` matches by number. In `fda-crl.pdf` and
     `ema-loq.docx`, recording one "1" marks every "1" "Recorded", and the POST refuses the rest as
     DUPLICATE_QUESTION. The deficiencies are never tracked.
  2. **Control characters are proposed and accepted.** VT, BEL and FF pass through. The response-package DOCX
     (`response-package-docx.ts`) then fails XML parsing; probe:
     `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/slice3-harvest/probe-docx.mts`.
  3. **A withdrawn number is still offered.** The proposals route drops withdrawn questions before matching, so the
     panel offers Record and the POST refuses it.
- **Further gaps in the read.** `readLetterSources` checks no disposition, currency or extraction coverage. It also
  skips the person's own source read scope (`source-read-access.ts getCurrentReadableSourceScope`). Three regexes parse
  one `cre_source` ref.
- **Slice 3 (`2bea758ba`, in the object store only, not on trunk).**
  - Its splitter v3 grammar and its source-admission sequence are worth porting.
  - Its table (`20261019c`), route (`agency-question-proposals.ts`) and panel (`AgencyQuestionProposals.tsx`) are
    refused under RULE 4 and RULE 6.
  - Its own README says 69 adversarial inputs still broke it. Its text-removing parts are therefore not ported.

---

## 2. Dropped: already done, or superseded

| What | Why |
|---|---|
| F1 slice 1 **attempt 1**: columns `sequence_id`, `transmit_attempt_id`, `sent_package` on `ectd_compilations`; the 'transmitted' compile row; `server/services/ectd/transmitted-manifest-record.ts`; the `shared/schema.ts` columns; the transmit hook through `submission-service.ts`; `20261101_ectd_compilations_transmitted_record.sql` | RULE 3, zero duplication: the transmittal row is already the pre-wire, attempt-bound record of the send (`3cab286e1`). The fix needs no migration (RULE 1) and no new file (RULE 6). It also frees `migration-set.mjs` and `submission-service.ts` for other work. |
| `ectd-complete.design.md` D-1 (`record_kind`, `sequence_id`, `package_record` columns; `compilation-record.ts`; `filed-state-view.ts`) | Superseded by the same transmittal record. The filed-state logic goes into the existing `prior-sequence-loader.ts`. |
| A read-only "latest compile of each sent sequence" fix | Wrong: transmit re-assembles and sends no compile, so nothing proves the latest compile went out. |
| `test-environment-send.design.md`'s 'test-sent' token, the test-resolution route, `ECTD_TEST_SEND_RESOLVED`, `test-environment-sends.ts`, and moving `filed-dispatch.ts` to `shared/constants/dispatch-status.ts` | RULE 6. 'pending' plus the transmittal and audit rows already record a test send, and every filed reader is an allow-list. `filed-dispatch.ts` stays in its folder. |
| MR-10 step 8(iii): drive test ACKs into `dispatch_status` | Contradicts F14. Amended in step 2. |
| The designs' decision numbers P-48, P-49, P-50, P-51 | They collide with trunk, and P-85 is also taken now. No session assigns a number. |
| Commitments item 3a (converge `c2c_commitments`) and item 4 (retire `haq_session`) | Done: `7bc96a3e1` and `9e73fad98`. |
| Commitments D-10 (deactivate the extract and track seed rows) | Contradicts P-81: extract commitments is a feature to finish. |
| Commitments D-11 (re-classify `lifecycle_obligations`) | Decided by P-39 step 4. |
| Commitments' new table `regulatory_commitment_corrections` | A completion does it instead: set-once correction columns on the successor `regulatory_commitments` row (`corrects_commitment_id` UNIQUE, `lineage_root_id`, `correction_reason`, `corrected_by`, `corrected_at`) in a column-only migration. |
| Commitments D-14: the NOLOGIN purger role and the SECURITY DEFINER purge function | Nothing new. The DELETE gap stays named as owed (P-41). |
| Rebasing commitments onto `2bea758ba`'s batched `governedRequestWrite` | That commit will not land. Use trunk's single-entry signature. |
| Commitments' `.cc-btn sm` and new `.cc-ms*` rules in `commcenter-v2.css` | The stylesheet is D0- and D6-held, and D6-2 deletes `.cc-btn*`. Use D0's `btn ghost small` and the existing `.cc-q-hist` disclosure. |
| Slice 3's own surface and storage: the table `20261019c`, `letter-positions.ts`, the excerpt digest, `planConfirmation`, `confirmProposalsTx`, the route `agency-question-proposals.ts`, the panel `AgencyQuestionProposals.tsx`, batched `governedRequestWrite`, the pause toggle and the proposal error codes | They serve a table, a route and a panel that RULE 4 and RULE 6 refuse. |
| Slice 3's capture changes: the `capture-extraction-evidence` recipe change, `pagesForOffsets`, `pdf-page-joiner.ts`, the `extractDocumentText` joiner pin, and the state field and `extractionCoverageComplete` in `shared/data-room-processing-status.ts` | Trunk's `readCaptureExtractionEvidence` already holds the page spans. The joiner is pdf-parse's default and is matched by a regex. |
| Slice 3's furniture *removal* (segments) | Removal is where its unfixed breaks were. Furniture is **flagged** (the question is not offered) until the oracle is green. |
| Slice 3's alpha and PMDA numbering families, and letter order by position | New grammar, not a G3 defect. Order by position needs stored positions, which means a table (refused) or new columns. On trunk, `compareQuestionRefs` already gives the letter's order. |
| Slice 3's `data-room-source-reader.ts` | A new file in another folder. Export the existing admission sequence from `authoring-assembly-sources.ts` instead (step 7). |
| `retire-sequence.design.md`'s new `SequenceRetirement.tsx` | D7.md adds no component file. The act becomes a quiet `pj-more` disclosure at the foot of `DispatchWorkspace`, on D7-A2's layout. |
| `retire-sequence.design.md`'s deferred trigger as written | It would refuse at COMMIT the shipped filed-baseline removal of drafts and its fixtures. It must admit that removal. |
| `retire-sequence.design.md`'s "P-48" prerequisites (`dispatch-status.ts`, `test-environment-sends.ts`, 'test-sent', `recordedEndpointVerdict`) | Restated on trunk's facts: no production transmittal is bound to the sequence, and `dispatch_status` is outside the filed set. |
| `ectd-complete.design.md`'s `leafSourceVerdict.ts`, its `ectd-v2.css` edits, and on-screen attempt, compilation and row ids or tinted warning boxes | `leafSourceVerdict.ts` matches no package (export from `SubmissionSeqWorkspaces.tsx` instead). The stylesheet is D0- and D7-held. The ids and warning boxes are plan §2 retired patterns. |
| Splitting `ectd-compile.ts` into a new file under `server/routes/` | The gate refuses a new route file. Move logic into an existing `server/services/ectd/` file instead. |
| Item 4 of `ectd-complete.design.md` (delete the IND diff and manifest routes) as a session act | Retiring a capability is the founder's (R1). It goes to the founder (§4) and is not deleted before. |
| `question-extraction.design.md`, `ectd-viewer.design.md`, `commitment-fulfilment.design.md`, `cmc-questions-convergence.design.md` | Superseded or landed, in order: G3 `7f5a68c14` plus this harvest; `EctdCompile`/`EctdFiledState` (RULE 3's own example); P-41; `c5168933d`. |
| The coordinator's hold of `scripts/db/migration-set.mjs` "for an additive column on `ectd_compilations`" | No longer needed. Released, and asked for again before steps 14 and 28. |

---

## 3. The steps, in order

Ordered by value to a small biotech filing a US IND, then by risk. Live defects in shipped behaviour (F1) come first.
Each step is one reviewed commit.

**Paths checked.** Every S5, S9, S10 and D7 step's file list and each `Completes:` path was checked against the ledger at
`609ef94c7`, with the gate's own `globToRegExp`. All are inside, and every package is open. F1, L1 and R1 are `**`.
- Script: `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/replan-check/check.mjs`
- Output: `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/replan-check/check.out.txt`

**Every step does the following:**

1. **Before touching a file another spec or session names:** read `COORDINATION.md` after a fetch, and send the
   coordinator the package, step and file list.
2. **Red first.** Write the failing test before the change and save its output. Run each mutation and show it red on
   its own assertion.
3. **Evidence.** File it under `docs/evidence/<ROW>-…/2026-11-0x-…/README.md`, with a **"What already exists"**
   section (RULE 3).
4. **Trailers:** `Plan: <ID>`, `Completes: <path>` (one or more, each existing before the commit) and the session
   attribution.
5. **Gates:**
   - `node scripts/ci/check-one-design-plan.mjs --range origin/concept2cure-v2..HEAD`
   - `npm run ci:one-product`
   - `npm run audit:repo-health:ceiling`
   - for migrations, also `npm run ci:migration-drop-safety` and `ci:migration-set-order`
   - the touched suites
6. **Files.** Never touch a D0-locked file. An S step changes behaviour, never layout.
7. **A screen change counts as done only when it has been opened and used in the running app** (RULE 4).

### Steps 1–8: F1 repairs of shipped behaviour

**1. F1-1: what the agency holds is what was sent** (phantom leaf, and sent without a compile)
- **Package:** F1
- **Completes:** `server/services/ectd/prior-sequence-loader.ts`, `server/services/submission-gateways/index.ts`
- **Design:** `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/f1-filed-is-what-was-sent.design.md`
- **The guard:**
  - stamps `metadata.leafManifest` (through `buildLeafManifest`) and `metadata.dispatchBinding` server-side, beside
    `sentPackage`;
  - strips a caller-supplied copy of either;
  - refuses a bound transmit that has no `leafManifest`, before the wire.
- **`readFiledManifestRows`:**
  - reads, for each sent or acknowledged sequence, the one transmittal whose `dispatchBinding.attemptId` equals
    `transmit_attempt_id` and whose `sequenceId` equals the sequence's id;
  - throws on two matches;
  - falls back to compiles, labelled `basis: 'compiles'`, only when no such record exists.
- **`loadFiledStateBySubmission`:** reports each sequence's basis, and counts a sequence filed when it has a transmit
  record.
- **The view:** copy only.
- **Files:**
  - `server/services/submission-gateways/index.ts`
  - `server/services/submission-gateways/types.ts` (comment or type only)
  - `server/services/ectd/prior-sequence-loader.ts`
  - `server/routes/ectd-compile.ts` (the filed-state handler only; a pass-through within the 474 bytes)
  - `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx` (copy only)
  - tests: new `server/services/ectd/__tests__/filed-state-what-was-sent.pglite.test.ts`, plus
    `tests/db/ectd-filed-state-view.dbtest.ts`, `server/services/submission-gateways/__tests__/sent-package-kept.test.ts`,
    `fda-esg-receipts.pglite.test.ts` and `client/src/concept2cure/v2/__tests__/ectdFiledState.test.tsx`
  - evidence: `docs/evidence/D7-ECTD-FILED-STATE-VIEW/2026-11-01-filed-is-what-was-sent/`
  - All are F1 (`**`).
- **Coordinate with:**
  - the coordinator `01JbQU…` (hold rows);
  - `01E8btkB…` (guard);
  - `01KnUGoX…` (fold and view, `cd5fd2281`).
- **Size:** medium.

**2. F1-2a: a test-environment send is not a filing** (the two writers)
- **Package:** F1
- **Completes:** `server/services/submission-service/submission-service.ts`,
  `server/services/submission-gateways/fda-esg-receipts.ts`
- **Design:** `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/f1-test-send-is-not-a-filing.design.md`
- **The rule:**
  - A staging result writes `dispatch_status='pending'` at the post-wire write.
  - A staging MDN moves the sequence to 'pending' in `resolveReceiptSequence`.
  - A staging post-wire failure releases the claim through `releaseTransmitSlot`.
  - `resendRefusal` and the claim CAS agree.
  - A new case: staging send, then a fresh production signature, then a production send files.
- **Files:**
  - those two
  - `server/services/submission-service/filed-dispatch.ts` (header comment only)
  - `docs/runbooks/ectd-transmit-path.md` (with the query that finds sequences a staging send marked 'sent')
  - `docs/work-orders/MR-10-ectd-conformance-and-transmission.md` (step 8(iii))
  - tests: `refused-step-voids-signature.pglite.test.ts`, `fda-esg-receipts.pglite.test.ts`,
    `transmit-refusals.test.ts`, `tests/db/commitment-fulfilment-evidence.dbtest.ts`
  - evidence: `docs/evidence/D7-TEST-ENVIRONMENT-SEND/2026-11-01/`
- **Coordinate with:** the coordinator; `01E8btkB…`; `01471vSK…`.
- **Size:** medium.
- **Depends on:** step 1, so the fold never reads a staging transmittal as filed.

**3. F1-2b: the words for a test send**
- **Package:** F1
- **Completes:** `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`
- **The words:**
  - `TransmitPanel`'s button names where the package goes.
  - After a test send, a plain sentence: "Sent to the agency's test environment on <date>. A test send is not a
    filing; 0000 can still be filed."
  - `transmittedSentence` and `notTransmittedSentence` say the environment in words.
- **Files:**
  - `SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx` and `As2ReceiptUpload.tsx` (copy only; no class, markup or
    layout change)
  - `client/src/concept2cure/v2/__tests__/submissionCenterLifecycleQa.test.tsx`
- **Coordinate with:**
  - the coordinator;
  - `017CFk…` (`3cacf2e15` touched `SubmissionSeqWorkspaces.tsx` today);
  - `01T2wooC…` (`SubmissionCenter.tsx`).
  
  D7-A1 and D7-A2 (this session's lane) rebase on it later.
- **Size:** small.

**4. F1-3: one live sequence per number**
- **Package:** F1
- **Completes:** `server/services/submission-service/submission-service.ts`
- **The change:**
  - `createSequence` refuses a number that a live sequence of the same submission and region already holds. It
    checks under `lockSubmissionPackageIdentity(…, { forUpdate: true })` (already imported at :98), beside the
    filed-baseline check.
  - `transitionSequence`'s CAS gains `isNull(deletedAt)`.
- **No unique index.** A deployed tenant may already hold duplicates, and `ADD CONSTRAINT` would fail every deploy
  (RULE 1, corollary 1). The evidence carries a count query for an operator.
- **Files:**
  - `submission-service.ts`
  - a new PGlite test (two concurrent creates of 0000: one refused; a soft-deleted row cannot transition)
  - evidence: `docs/evidence/D7-SEQUENCE-NUMBER-ONCE/2026-11-0x/`
- **Coordinate with:** `01E8btkB…` (`filed-sequence-baseline.ts`, `createSequence`); the coordinator.
- **Size:** small.
- **What it leaves open.** After steps 2 and 4, a sequence whose *test* send found a content defect can be neither
  corrected (it is frozen) nor replaced (its number is held). The refusal says so plainly. The founder question on
  retiring a sequence (§4, item 1) goes out with this step.

**5. F1-4a: no control character reaches the response package** (harvest H1)
- **Package:** F1
- **Completes:** `server/services/agency-responses/response-logic.ts`
- **The change:**
  - `forbiddenCharacter`: C0 controls except TAB, LF and CR, plus U+FFFE and U+FFFF.
  - The POST `questionBody` refuses it.
  - A proposal that holds one is not offered, with the character and its line named.
  - `response-package-docx.ts` refuses, naming the question, for rows recorded before the rule, instead of writing an
    invalid DOCX.
- **Files:**
  - `response-logic.ts`, `response-package-docx.ts`
  - `server/routes/c2c/agency-responses.ts`
  - `server/services/agency-responses/letter-question-proposals.ts`
  - `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx` (the reason)
  - tests: `response-logic.test.ts`, `letter-question-proposals.pglite.test.ts`, a DOCX test
- **Coordinate with:** the coordinator (assign S10 to RIM); `011Dpx…` (G3's author).
- **Size:** small.
- **Measure first.** Form feed is 420 of the oracle's 670 control findings. Most sit at page edges that step 17 flags
  anyway. Run the oracle to measure how many otherwise-clean questions this alone stops offering, and record the
  number.

**6. F1-4b: a repeated or withdrawn number is said, not offered** (H5 minimum, H2)
- **Package:** F1
- **Completes:** `server/services/agency-responses/letter-question-proposals.ts`
- **Repeated numbers:**
  - A proposal counts as recorded by its number only when that number is unique in the letter.
  - Proposals that share a number are not offered, with one sentence: record each under a distinct reference, such
    as its section name.
- **Withdrawn numbers:**
  - The route passes withdrawn questions into the matching.
  - A withdrawn number reads "N was withdrawn on <date>; this letter cannot record another N", with no Record button.
- **Files:**
  - `letter-question-proposals.ts`
  - `server/routes/c2c/agency-responses.ts`
  - `LetterQuestionProposals.tsx`
  - tests: `letter-question-proposals.pglite.test.ts`, `client/src/concept2cure/v2/__tests__/agencyResponsesLetterProposals.test.tsx`
- **Coordinate with:** the coordinator; `011Dpx…`.
- **Size:** small.

**7. F1-4c: proposals read only what the person may read** (H13)
- **Package:** F1
- **Completes:** `server/services/authoring/authoring-assembly-sources.ts`
- **The change:**
  - Export its inline admission sequence unchanged: program access, then the person's source read scope, then the
    read, then the re-check.
  - `readLetterSources` uses it.
  - Commitment proposals share the read, so they are covered too.
- **Red first:** a person without read scope on the letter's source gets its words today.
- **Files:**
  - `authoring-assembly-sources.ts`
  - `letter-question-proposals.ts`
  - tests (both proposal pglite suites)
- **Coordinate with:** the coordinator; `011Dpx…`. Nobody has committed to `authoring-assembly-sources.ts` since
  2026-10-18.
- **Size:** small to medium.

**8. F1-5: readiness answers only for a live sequence**
- **Package:** F1
- **Completes:** `server/services/ectd/assess-dispatch-readiness.ts`
- **The change:** the sequence read (:778-779) gains `isNull(ectdSequences.deletedAt)`. A sequence removed by the filed
  baseline is answered as not found, by name, for AnA, MCP and the IND route.
- **Files:** `assess-dispatch-readiness.ts`, a pglite test.
- **Coordinate with:** `017CFk…` (edited this file in `3cacf2e15` today).
- **Size:** small.

### Steps 9–11: S10 completions of G3 (nothing new)

**9. S10-1: check the letter's source before reading it** (H3)
- **Package:** S10
- **Completes:** `server/services/agency-responses/letter-question-proposals.ts`
- **Uses:** trunk's `getSource`, `sourceHasGroundingText`, `sourceReadView` and `readExtractionCoverage`.
- **Refusals,** each with its own sentence and next step:
  - data withdrawn;
  - replaced;
  - superseded;
  - excluded;
  - failed;
  - not yet read, with "Check again";
  - an OCR read that covered only part of the letter.
- **'no-text' splits** into its three cases.
- **Files:**
  - `letter-question-proposals.ts`
  - `LetterQuestionProposals.tsx`
  - both proposal pglite suites, the client test
- **Coordinate with:** the coordinator; `011Dpx…`.
- **Size:** small to medium.

**10. S10-2: one reading of a letter's source reference** (H9)
- **Package:** S10
- **Completes:** `shared/agency/letter-questions.ts`
- **The change:**
  - One `cre_source` parser and builder, with bounded digits, in that existing file. No new file.
  - A malformed reference is said, not ignored.
  - `refuseForeignLetterSources` moves beside `readLetterSources` and runs on the request's client.
  - GET .../questions calls `compareQuestionRefs` instead of its inline copy.
- **Files:**
  - `shared/agency/letter-questions.ts`
  - `server/routes/c2c/communication-center.ts`, `server/routes/c2c/agency-responses.ts`
  - `letter-question-proposals.ts`
  - `client/src/concept2cure/v2/surfaces/AgencyInbox.tsx` (behaviour only)
  - tests
- **Coordinate with:** the coordinator (`AgencyInbox.tsx` is in its L7 lane for D6-2; whichever lands second
  rebases); `011Dpx…`.
- **Size:** small.

**11. S10-3: the proposals say what they read, and what they did not** (H10, H11)
- **Package:** S10
- **Completes:** `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx`
- **The words:**
  - Name the numbering forms that are read, and that (1), a., i. and unnumbered requests are not.
  - An OCR caution.
  - The full words in a disclosure, not a 220-character clip with a tooltip.
  - Each "not offered" reason, with its button described by it.
- **The limits:**
  - over 20,000 characters, not offered;
  - at most 200 listed, with a sentence.
- **Styling:** the existing `cc-q-*` classes and D0's `btn ghost small`. No stylesheet edit.
- **Files:** `LetterQuestionProposals.tsx`, `letter-question-proposals.ts`, tests.
- **Coordinate with:** the coordinator.
- **Size:** small.

### Steps 12–14: S5 server completion of "On file at the agency", and its record guard

**12. S5-1: each filed leaf names its source document and version** (`ectd-complete` D-2, server)
- **Package:** S5
- **Completes:** `server/services/ectd/sequence-manifest.ts`
- **The change:**
  - `SequenceLeafManifestEntry` carries the placement's source identity (Vault document and version).
  - `core-to-packager.ts`, `leaf-source-resolver.ts` and `regional-packager.ts` (:1476 `bundle.leafManifest`) fill it.
  - So from step 1 on, the compile row and the transmittal record both carry it. Older rows carry none, and the view
    says so.
  - The evidence README corrects `cd5fd2281`'s hand-off: the core path's manifest is S5's, not `package-leaf-bytes.ts`.
- **Files:**
  - `server/services/ectd/sequence-manifest.ts`, `core-to-packager.ts`, `leaf-source-resolver.ts`
  - `server/services/submission-gateways/regional-packager.ts`
  - tests and evidence
- **Coordinate with:**
  - `01E8btkB…` (`core-to-packager.ts`, `6e3918f45`);
  - the coordinator;
  - the unattributed `1e928c801` (`regional-packager.ts`), through the coordinator.
- **Size:** medium.

**13. S5-2: "On file at the agency", complete on the server**
- **Package:** S5
- **Completes:** `server/services/ectd/prior-sequence-loader.ts`
- **`loadFiledStateBySubmission` gains:**
  - each leaf's source verdict, through `readSubmissionLeafSourceEvidence`;
  - the withdrawn documents with their history;
  - each sequence's sent-at, sent-by and environment, from its bound transmittal;
  - module order, through `moduleOfSectionKey` plus `compareSectionCode`;
  - the declared filed-elsewhere baseline, read through `filed-sequence-baseline.ts` `readCurrentFiledBaseline`
    (imported, unchanged).
- **The route stays a pass-through.** If it maps fields today, move the mapping into the loader in this commit so
  `ectd-compile.ts` does not grow past its 474 bytes.
- **Files:**
  - `prior-sequence-loader.ts`, `server/routes/ectd-compile.ts`
  - tests: `tests/db/ectd-filed-state-view.dbtest.ts`, pglite
- **Coordinate with:** the coordinator; `01E8btkB…` (baseline).
- **Size:** medium.

**14. L1-1: what was sent cannot be rewritten** (record guard, row D7)
- **Package:** L1
- **Completes:** `server/services/submission-gateways/index.ts`
- **The guard.** A trigger-only migration, with no table, that refuses:
  - an UPDATE that changes or removes a set `metadata.leafManifest` or `metadata.dispatchBinding` on
    `submission_transmittals`;
  - an UPDATE of `leaf_manifest` on `ectd_compilations`;
  - TRUNCATE of either.
- **Placement and form:**
  - Insert it before the final sweep pair (`ci:migration-set-order`).
  - Use the replayable `CREATE OR REPLACE FUNCTION` with drop and create of its own trigger. It drops nothing another
    file creates (RULE 1).
- **Why L1, not S5.** If the PGlite harness must learn the trigger, `server/db/pglite-harness.ts` is outside S5. L1
  (`**`) carries it. The step is honest under row D7 (Part 11 §11.10(c)).
- **Files:**
  - `migrations/2026110x_ectd_sent_record_guard.sql`
  - `scripts/db/migration-set.mjs`
  - `server/db/pglite-harness.ts` (if needed)
  - `tests/db/*`
- **Coordinate with:**
  - the coordinator: ask for the `migration-set.mjs` hold again, since `017CFk…`, `01KnUGoX…`, `014DhFkp…` and others
    edit it;
  - `01E8btkB…`.
- **Size:** medium.

### Steps 15–18: G3's grammar, completed to the oracle

**15. S10-4: the order rule, conservative** (H4)
- **Package:** S10
- **Completes:** `shared/agency/letter-questions.ts`
- **Refusals,** each naming the line:
  - a gap;
  - a list starting above 1;
  - a restart with no heading above it;
  - another numbering form above the list;
  - a wrapped "2." after an unfinished sentence.
- **How:** a per-question `notOffered` field or a refusal outcome. The text stays one verbatim slice.
- **Files:** `letter-questions.ts`, `shared/agency/__tests__/letter-questions.test.ts`, the oracle re-run in evidence.
- **Coordinate with:** the coordinator; `011Dpx…`.
- **Size:** medium.

**16. S10-5: headings, closings, sign-off and responses** (H6)
- **Package:** S10
- **Completes:** `shared/agency/letter-questions.ts`
- **The rules:**
  - A heading-shaped line before the next number is not part of the question.
  - Where that cannot be told, the question is not offered.
  - A closing phrase that another question follows does not cut the question.
  - "FDA Response:" ends a question.
  - Nothing after the sign-off is read.
  - A line that falls in no question makes the one before it not offered.
- **Source:** the grammar functions come from slice 3's `question-labels.ts`, into this file.
- **Files:** as for step 15, plus `letter-question-proposals.ts` if the outcome shape changes.
- **Coordinate with:** the coordinator.
- **Size:** medium.

**17. S10-6: page furniture flagged, from the receipt's page spans** (H7, H8)
- **Package:** S10
- **Completes:** `server/services/agency-responses/letter-question-proposals.ts`
- **Page spans:** read through `readCaptureExtractionEvidence`, bound to the row's checksum and never to the receipt's
  own claim.
- **What makes a question not offered,** with the line and rule named:
  - a page number;
  - a Reference ID;
  - the pdf-parse joiner;
  - letterhead;
  - a running header;
  - an application number with a second sign.
- **Nothing is removed.**
- **Files:** `letter-question-proposals.ts`, `shared/agency/letter-questions.ts`, tests.
- **Evidence:** re-run `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/redteam/run-g3-all.mts`
  and file the drop in violations as D2 evidence.
- **Size:** medium.

**18. F1-6: AnA's IR draft carries the cautions and the whole list** (H12)
- **Package:** F1
- **Completes:** `server/services/ana/AnaToolExecutor.ts`
- **The change, in `draft_fda_ir_response` only:**
  - each question carries its "not offered" caution;
  - "nothing found" says why;
  - the silent `slice(0, 50)` goes, or is said.
- **Files:** `AnaToolExecutor.ts` (an S4 path, so F1), its test.
- **Coordinate with:** `011Fyq…`, which holds this file for the `generate_document` handler. Take the file only when
  it releases it.
- **Size:** small.

### Steps 19–23: lane L9 (Submission Center layout) and the S5 screen work on it

These start when Wave 1b opens (D0-4 pushed, the `styles/**` lock row deleted, D5-0 landed), ahead of any later step.

**19. D7-A1: Submission Center** (header, starters, context row, tabs, portfolio)
- **Package:** D7
- **Completes:** `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`
- **Files,** per `.design/claude-convergence/D7.md` §0 and `BUILD_ORDER.md` L9:
  - `SubmissionCenter.tsx`, `SubmissionProgramAnchor.tsx`
  - `styles/coverage-v2.css` 450–470, and the `sc-ws` alias in `app-v2.css` (the per-sheet holder's turn)
- **Coordinate with:** the coordinator (sheet turns).
- **Size:** medium.

**20. D7-A2: the sequence workspaces and the one verdict**
- **Package:** D7
- **Completes:** `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`
- **Needs:** D0-4 (`AnswerLead emphasis`) and step 19.
- **Files:** `SubmissionSeqWorkspaces.tsx`, `SequenceAssembleTestPackage.tsx`, `SubmissionRequiredDeliverables.tsx`,
  `DispatchReadiness.tsx`, and the `.dr2-*` head rules.
- **Coordinate with:** the coordinator; `017CFk…` (`ShadowRunCoverage` in this file).
- **Size:** medium to large, as D7.md sets it.

**21. D7-A3: Compile & export**
- **Package:** D7
- **Completes:** `client/src/concept2cure/v2/surfaces/EctdCompile.tsx`
- **Files:** `EctdCompile.tsx`, `EctdCompileReference.tsx`, `EctdModuleReadiness.tsx`, `EctdCompileDtdEvidence.tsx`,
  `EctdFiledState.tsx`. Step 15 of D7.md: `.pj-sec` sections without `pj-card-h` bands.
- **Size:** medium.

**22. S5-3: "On file at the agency", complete on screen**
- **Package:** S5
- **Completes:** `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx`
- **On D7-A3's layout:**
  - each document's source and version, through the existing `VersionViewButton` and `SOURCE_VERDICT`/`pinVerdict`
    (exported from `SubmissionSeqWorkspaces.tsx`);
  - withdrawn documents and a document's history in `<details className="pj-more">`;
  - sent-at and sent-by;
  - the basis line from step 1;
  - an error read as an error, not "didn't respond";
  - its own `moduleOf` replaced by the shared helpers.
- **Files:** `EctdFiledState.tsx`, `SubmissionSeqWorkspaces.tsx` (exports only), `ectdFiledState.test.tsx`.
- **Size:** small to medium.

**23. S5-4: the eCTD 4.0 preview reach**
- **Package:** S5
- **Completes:** `client/src/concept2cure/v2/surfaces/EctdCompileReference.tsx`
- **The change:** a client caller of the existing `POST /api/ectd/v4/forward-compat` (D7.md §A.4 step 12). It adds no
  route.
- **Size:** small.

### Steps 24–28: low-value repairs, then commitments

**24. F1-7: IND lifecycle routes answer the service's own status**
- **Package:** F1
- **Completes:** `server/routes/ind-lifecycle/shared.ts`
- **The change:** `fail()` maps codes through `SUBMISSION_ERROR_STATUS`.
- **Files:** `shared.ts`, `routes.contract.integration.test.ts`.
- **Coordinate with:** `014DhFkp…` (`350d1639d`); `01E8btkB…` (`8d7faa5f0`).
- **Size:** small.

**25. S9-1: a commitment shows its milestones**
- **Package:** S9
- **Completes:** `server/services/ha-interactions/ha-service.ts`
- **The change:**
  - `listCommitments` returns each commitment's milestones.
  - `deriveMilestoneState` in `ha-logic.ts`: 'missed' is derived, never stored.
  - `CommitmentRow.tsx` lists them, read-only.
- **Files:** `ha-service.ts`, `ha-logic.ts`, `client/src/concept2cure/v2/surfaces/CommitmentRow.tsx`, tests.
- **Coordinate with:** the coordinator (assign S9 to RIM); `011Dpx…`.
- **Size:** small.

**26. S9-2: add a milestone from the project**
- **Package:** S9
- **Completes:** `server/routes/commitment-fulfil-route.ts`
- **The change:**
  - A shared add-milestone handler beside the fulfil handler, and its project-door twin in
    `server/routes/c2c/agency-responses.ts`, on the existing mounted routers.
  - `addMilestoneTx` refuses a terminal commitment and an invalid date, so both doors refuse.
  - "Add milestone" goes through the existing `C2CForm`, used and not edited.
  - The organisation door's route in `server/routes/ha-interactions.ts` is outside S9 and stays as it is.
- **Files:** `commitment-fulfil-route.ts`, `agency-responses.ts`, `ha-service.ts`, `CommitmentRow.tsx`, tests.
- **Size:** small to medium.

**27. S9-3: a letter's schedule is recorded with its commitment**
- **Package:** S9
- **Completes:** `server/routes/c2c/agency-responses.ts`
- **The change:** POST .../agency-communications/:eventId/commitments also records the parsed
  `LetterCommitment.milestones` as pending milestones, through `addMilestoneTx`, in the same transaction.
- **Files:** `agency-responses.ts`, `ha-service.ts`, `letter-commitment-proposals.pglite.test.ts`.
- **Coordinate with:** `011Dpx…` and the coordinator (S10's letter side).
- **Size:** small.

**28. S9-4: met and withdrawn milestones** (unsigned types)
- **Package:** S9
- **Completes:** `server/services/ha-interactions/ha-logic.ts`
- **The change:**
  - A column-only migration adds set-once met-evidence and withdrawal columns and a guard. It creates no table.
  - Met and withdraw for `meeting_commitment` and `other`, through `governedRequestWrite` (single entry).
- **Migration placement:** amend nothing. Insert before the final sweep pair.
- **The PGlite harness.** If it must learn the columns, `server/db/pglite-harness.ts` is outside S9. Test on real
  PostgreSQL (`tests/db/**`), or carry that one file in an F1 commit.
- **Files:** `migrations/2026110x_commitment_milestone_met_withdrawn.sql`, `scripts/db/migration-set.mjs`,
  `ha-logic.ts`, `ha-service.ts`, `commitment-fulfil-route.ts`, `agency-responses.ts`, `CommitmentRow.tsx`,
  `CommitmentFulfilment.tsx` (a mode of the one dialog), tests.
- **Coordinate with:** the coordinator (the `migration-set.mjs` hold again).
- **Size:** medium.

### Steps 29–37: after a founder decision, or low value

**29. L1-2a: retiring an unfiled sequence, the act and its database guard** (only after §4 item 1)
- **Package:** L1, row D7
- **Completes:** `server/services/submission-service/submission-service.ts`
- **The act:**
  - A retire intent and act beside the P-34 and P-35 acts.
  - Eligibility: no production transmittal is bound to the sequence, and `dispatch_status` is outside the filed set.
  - The signature meaning is the one the founder decides.
- **The guard:** a trigger-only guard that admits the filed-baseline's signed removal of drafts
  (`filed-sequence-baseline.ts:197-201`) and that removal's fixtures.
- **Placement:** the rules sit in `submission-service.ts` or a split file inside `server/services/submission-service/`.
- **Files:** `submission-service.ts`, `filed-sequence-baseline.ts` (admitted by the guard only), a migration,
  `migration-set.mjs`, `server/db/pglite-harness.ts`, tests.
- **Coordinate with:** `01E8btkB…`; the coordinator; `017CFk…`.
- **Size:** medium.

**30. L1-2b: retiring a sequence, its endpoint and precheck**
- **Package:** L1
- **Completes:** `server/routes/submissions.ts`
- **The change:** POST `/sequences/:seqId/retire` and the precheck step in the existing router, under the existing
  `/api/submissions` claim. MCP's `c2c_get_sequence_status` says "retired".
- **Files:** `submissions.ts`, `server/mcp/tools/catalog.ts`, `shared/navigation/surface-actions.ts`
  (`GOVERNED_VERB_PATTERN`), tests.
- **Size:** small to medium.

**31. S5-5: retiring a sequence, on screen**
- **Package:** S5
- **Completes:** `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`
- **The change, after step 20:**
  - a quiet `pj-more` "Retire sequence NNNN…" at the foot of `DispatchWorkspace`;
  - signing through `SubmissionCenter.tsx`'s existing `EsignModal`;
  - retired sequences as an optgroup in the one picker.
- **Size:** small to medium.

**32. S5-6: reopen a recorded compile, the server read**
- **Package:** S5
- **Completes:** `server/routes/ectd-compile.ts`
- **The change:** first move the `/history` query's shaping into the existing `server/services/ectd/compile-placement.ts`.
  Then add GET one compilation in `ectd-compile.ts`, with a net byte change of zero or less.
- **Size:** small to medium.

**33. S5-7: reopen a recorded compile, the client**
- **Package:** S5
- **Completes:** `client/src/concept2cure/v2/surfaces/EctdCompile.tsx`
- **The change:**
  - Split `EctdCompiledPackage.tsx` out of `EctdCompile.tsx` (same folder; RULE 6 "split, don't add").
  - Compilation history opens a record in a `pj-more`, with the same `BackboneView`, `LifecycleView` and
    `CompiledPackageView`.
  - Fix `PackageFacts`' untrue sentence (:495).
- **Size:** medium.

**34. S5-8: one fold**
- **Package:** S5
- **Completes:** `server/services/ectd/package-sequence-lifecycle.ts`
- **The change:**
  - `foldFiledState` converges onto the exported `foldManifestRows`, keeping both matching rules: the P-42 pointer and
    the F10 path.
  - `readFiledSequences` refuses an unreadable entry instead of dropping it.
- **Before starting:** check work-orders row 167's claim (`01LjrcEe…`) through the coordinator. The value to a core
  US IND is low; the only reach is an endpoint no screen calls.
- **Size:** medium.

**35. R1-1: retire the unreached IND diff and manifest routes** (only after §4 item 2)
- **Package:** R1
- **Completes:** `server/routes/ind-lifecycle/sequence.routes.ts`
- **The change:** delete the four GETs and dispatch-gate's embedded manifest, with `ind-sequence-diff.ts` and
  `ind-package-manifest.ts`, and record the deletion on `a639c5c4f`'s template. The replacement for the outcome, by
  path, is `EctdFiledState.tsx` and `EctdCompile.tsx`'s lifecycle view.
- **Coordinate with:** `01QoxbL…` (R1 inventory).
- **Size:** medium.

**36. L1-3: signed PMR/PMC/REMS milestone acts, and the correction P-41 owes** (only after §4 item 3)
- **Package:** L1, rows D2 and D5
- **Completes:** `server/services/ha-interactions/fulfilment-record.ts`
- **The change:**
  - The correction is recorded on the successor commitment row's set-once columns. No new table.
  - Signed met and withdraw.
- **Files:**
  - `server/services/part11/governed-target-binders.ts`, `signature-persistence.ts`
  - `server/routes/ha-interactions.ts`
  - `server/services/audit/compliance-reports/queries/electronic-signatures.ts`
  - `commitment-fulfil-route.ts`, `CommitmentFulfilment.tsx`, a column-only migration
- **Split** into two commits: the correction, then the signed milestone acts.
- **Coordinate with:** the coordinator; `01T2wooC…` and `01KnUGoX…` (part11).
- **Value:** low for an IND-stage biotech, because PMRs and PMCs come after approval.
- **Size:** large overall, as two commits.

**37. S10-7 (optional): where the words came from** (H14)
- **Package:** S10
- **Completes:** `server/routes/c2c/agency-responses.ts`
- **The change:**
  - An optional `fromLetter {sourceId, start, end}` on POST .../questions.
  - The server re-reads the admitted slice and requires the words to equal it.
  - `recordSourceSpan` records lineage.
  - No new route or table.
- **Size:** medium.

### Handed to other lanes

| Item | Goes to | Why |
|---|---|---|
| The Reporting readers of `lifecycle_obligations` (`research-compliance-report-providers.ts:116`, :186; `compute-run.ts:197`; `report-engine.ts:77-100`) | The Reporting lane, under F1 | P-39 step 4 owes it to them. Correct P-39's "on no applier": `install-fresh` applies `20260610_lifecycle_obligations.sql`. |
| `create_regulatory_commitment` refuses rather than writes (`AnaToolExecutor.ts:11106-11141`) | The S4 owner, through the coordinator | An S4 file, held by `011Fyq…`. |
| "Commitments in this letter" (the client of `e505e62fb`'s routes), the owner column, and owned commitments as due work (`source-task.ts`, `deadline-radar.ts`) | `011Dpx…`'s stated next step, unless it hands them over | Same files as steps 25–27. Its key: a commitment task keys on the commitment's lineage root, so a corrected successor keeps its task. |

---

## 4. What only the founder can approve

**approvedAdditions: none.**

No step adds anything the gate counts:
- no `UI_SURFACES` or `SURFACE_VIEWS` entry;
- no mount (`/api/submissions`, `/api/ectd-compile`, `/api/ha-interactions` and `/api/concept2cure/projects` are
  already registered);
- no `CREATE TABLE` (migrations 14, 28, 29 and 36 add columns, functions or triggers only);
- no route file;
- no service (every new non-test file is a split inside an existing folder);
- no AnA tool.

**No ledger path change is asked.** S5 does not reach `server/services/submission-service/**`, `server/services/part11/**`
or `server/routes/ha-interactions.ts`. A completion carries them instead: under F1 for shipped defects, and under L1
for the D2, D5 and D7 launch rows (steps 2, 4, 29, 30, 36).

**The founder's words today cover asking, not the record.** "Continue the RIM build out … you can add [to] it for your
special work" covers proposing additions to the plan for RIM's work. RULE 5 still records each one as a
`Plan: PLAN` commit with a `Founder-Decision` trailer naming the item, as P-84 and P-85 did ("Approve both"). This plan
needs none. If a step finds that it does need one, it stops and asks, naming the item.

**Product decisions only the founder makes.** Each is asked as a short question with a recommendation. The next free
number at `609ef94c7` is P-86, and the founder's record assigns it.

1. **Retiring an unfiled, dispatched sequence by a signed act** (steps 29–31).
   - Recommendation: allow it only when no production send is bound to the sequence, and file it under L1 row D7.
   - Which signature meaning: P-51's "retirement" (written for QMS documents) or "responsibility".
   - The guard admits the filed-baseline's removal of drafts.
   - Today's words "you can add [to] it for your special work" cover asking for it.
   - Why it is needed: after steps 2 and 4, a sequence whose test send found a content defect can be neither changed
     nor replaced without it.
2. **Retire the unreached IND routes (R1)**: `GET /sequence/:currentId/diff` and `/diff/pdf`,
   `GET /sequence/:seqId/manifest` and `/manifest/pdf`, and the manifest embedded in `POST /sequence/:seqId/dispatch-gate`
   (step 35).
   - Plan §1 goal 2 and RULE 5: a capability with no UI caller is reached or retired by the founder.
   - The replacement for the outcome is the filed state and the compile lifecycle view.
3. **Commitments, re-cut onto trunk** (steps 28 and 36).
   - Confirm that a correction is recorded on the successor commitment row's set-once columns (no new table).
   - Confirm there is no purge role or SECURITY DEFINER function.
   - Confirm that 'missed' is derived.
   - Confirm that the signed acts go under L1 (rows D2 and D5), so S9 gains no paths.
   - These confirm `commitments-complete.design.md`'s D-1 to D-9 and D-13 to D-15, which were taken under the
     2026-10-18 delegation, before RULE 5 and RULE 6.

**To tell the founder with step 2, not to ask:**
- A staging post-wire failure releases the claim, because nothing a test environment holds is a filing.
- Sequences a staging send already marked 'sent' are not corrected by migration. The runbook gives the query, and a
  person decides. Per D7, none has reached FDA.

---

## 5. Messages to the sessions whose files overlap a step

These are sent before each step's first edit. The exact texts are in the structured result of this workflow step.

- **The coordinator `session_01JbQUvBxcGHdBgkgAydQKpx`:**
  - the hold changes;
  - S9 and S10 recorded for RIM;
  - the L9 lane unchanged;
  - no P-numbers from this session.
- **`session_017CFkfG9BWXkZddxgGjkoFY`:** `SubmissionSeqWorkspaces.tsx`, `assess-dispatch-readiness.ts`,
  `migration-set.mjs`.
- **`session_011Fyq3hXwhNNFu8ihPmBuWc`:** `AnaToolExecutor.ts`, the `draft_fda_ir_response` handler only.
- **`session_011DpxUyQmE1enma4gTjcfBy`:** G3's files and the letter side of commitments.
- **`session_01KnUGoX3g4R4FWKWGc2sTbN`:** the fold and the filed-state view.
- **`session_01E8btkB8mcLirW4rNvsMNxK`:** the guard, transmit, `createSequence`, `core-to-packager.ts`.
- **`session_01471vSKg1KXj3ijXDiyvXGX`:** `submission-service.ts`.
- **`session_014DhFkpvJw8G8WhJpJW8Cpy`:** `ind-lifecycle/shared.ts` and its contract test.
- **`session_01QoxbLdKp1MgbXvCfgSkkJr`:** the IND routes as an R1 retirement.
- **`session_01T2wooCZu46W7msw4TJuuzr`:** `SubmissionCenter.tsx`.

---

## 6. Known gaps this plan leaves named

- **The named-prior path.** `loadPriorSequenceManifest` still finds the submission through a compile row. A sequence
  sent with no compile is refused there, which fails closed.
- **Non-FDA transmittal records.** Until step 1, REST and CESP transmittals carry no binding. After it, the guard
  stamps the binding for every gateway. Older non-FDA rows read from compiles, labelled.
- **No unique index on sequence numbers.** Step 4 refuses duplicates in code. An index waits for an operator's count of
  existing duplicates.
- **Who holds S9 and S10.** `COORDINATION.md` lists no holder for either. Steps 5–7, 9–11, 15–17 and 25–28 start only
  after the coordinator records RIM on them, or names another holder.
