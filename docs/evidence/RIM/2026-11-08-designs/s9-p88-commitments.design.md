# S9 and P-88: a commitment's milestones, and the correction of a fulfilment signed in error

Designer for RIM (`session_011e42DEAR2U6W51Mjvgfgbt`). Read-only design, 2026-11-01. **Revised 2026-11-02** with
the nine review findings that stood (§7.1).

- **Read against:**
  - local HEAD `609ef94c7`;
  - `origin/concept2cure-v2` at `9483b4eb0`, re-fetched at `08debf4e0` while writing;
  - for the revision, `origin/concept2cure-v2` at `042293ade`.
- **What changed on origin by `042293ade`, for this design:**
  - the ledger gained decisions P-89 and P-90 and `approvedAdditions` for P-90 and P-91; no package's paths changed,
    so S9, S10 and L1 read as below (`s9-p88-probe/ledger-check-rev.out.txt`);
  - `server/services/ana/AnaToolExecutor.ts` changed elsewhere; `fulfill_regulatory_commitment` is at `:13502` on
    origin (`:13596` at local HEAD), with the same body;
  - none of the other files this design touches changed.
- **What changed on origin since `9483b4eb0`:** one COORDINATION row for another session, and that session's
  `legacy-importer/**` slice.
  - No file this design touches changed, and the ledger is unchanged.
  - Line numbers below are valid at both refs.
- **The founder's record has landed:** `5e3652dbf` ("P-86, P-87, P-88: the founder answers RIM's three questions").
  - It is in `docs/LAUNCH_DEFINITION_OF_DONE.md` §P-88, and the ledger's `decisions` gained P-86 to P-88.
  - So the commits below may cite P-88 now.
- **S9 is now recorded for RIM** (COORDINATION, "Who works where": "F1 slices 1–2, repairs A–C, then P-86, P-87, S10,
  S9 with P-88"). S10 passed to RIM on 2026-11-01.
- **Inputs, re-cut here:**
  - the map: `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/decided/p88-commitments.map.md`;
  - the commitments mapper's result in the workflow journal (`map:commitments`, agent `ad45cb1a64503ee96`);
  - the older design: `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/commitments-complete.design.md`;
  - the re-plan: `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/rim-replan-2026-11-01.md`, §1.5, §2, steps 25–28 and 36.
- **Probes written for this design:**
  - the ledger check, `s9-p88-probe/ledger-check.mjs`. Its output, `ledger-check.out.txt`, shows every commit below
    inside its package's paths, every `Completes:` path existing, and the four cross-package files outside S9.
  - the revised ledger check, `s9-p88-probe/ledger-check-rev.mjs`, run at `042293ade` against origin's ledger
    (`ledger-origin.json`). Its output, `ledger-check-rev.out.txt`, covers the revised list (C2r, C3 and C3m, C4v,
    and C6 with the organisation door). It shows `ProjectRespond.tsx`, `AnaToolExecutor.ts`,
    `letter-question-proposals.ts` and `ha-interactions.ts` all outside S9.
  - the successor-row probe, `s9-p88-probe/successor-probe.mjs`. Its output is `successor-probe.out.txt`.
  - Both are in `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/s9-p88-probe/`.
- **Baseline:** the six commitment suites that need no database are green on the working tree (6 files, 50 tests):
  - `ha-logic.test.ts`, `fulfilment-logic.test.ts`;
  - `commitment-fulfil-route.test.ts`;
  - `commitment-fulfilment-binder.test.ts`;
  - `letter-commitment-proposals.pglite.test.ts`;
  - `c2c-commitments-read-only.pglite.test.ts`.

---

## 0. The commits at a glance

| # | Re-plan step | Plan | Completes | Push |
|---|---|---|---|---|
| C1 | 25, S9-1: a commitment shows its milestones | S9 | `server/services/ha-interactions/ha-service.ts`, `client/src/concept2cure/v2/surfaces/CommitmentRow.tsx` | A, alone |
| C2 | 26, S9-2: add a milestone from the project; a fulfilment says which milestones it leaves unmet | S9 | `server/routes/commitment-fulfil-route.ts` | B |
| C2w | (26's host) | S10 | `client/src/concept2cure/v2/surfaces/CommunicationCenter.tsx` | B |
| C2r | (26's second host, only if Respond renders the row by push B) | S10 | `client/src/concept2cure/v2/surfaces/ProjectRespond.tsx` | B |
| C3 | 27, S9-3, part 1: a commitment recorded from the letter as the person saw it | S9 | `server/routes/c2c/agency-responses.ts` | B |
| C3c | named, S10: the letter's proposals, through the existing "Record a commitment" form | S10 | `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx` | B |
| C4 | 28, S9-4: met and withdrawn, unsigned types | S9 | `server/services/ha-interactions/ha-logic.ts` | B |
| C4v | (only if the coordinator agrees) the validation change control for C1–C4, documents only | L1 (row D4) | `docs/validation/URS-001-PROJECTS.md` | B |
| C5 | 36 commit 1, L1-3a: the correction | L1 (rows D2, D5) | `server/services/ha-interactions/fulfilment-record.ts` | C, alone |
| C6 | 36 commit 2, L1-3b: signed PMR, PMC and REMS milestone met and withdraw, and the organisation door's milestone lines | L1 (rows D2, D5) | `server/services/part11/governed-target-binders.ts` | D |
| C3m | 27, S9-3, part 2: the letter's schedule recorded as milestones, held behind C6 | S9 | `server/routes/c2c/agency-responses.ts` | D, after C6 |

The first draft's **C2o** and **C4o** (the organisation door's unsigned milestone routes under `Plan: L1`) are
dropped: P-88 assigns the unsigned milestone work to S9, and re-plan step 26 says the organisation door "stays as it
is" (§7.1, finding 6). The organisation door gains its milestone lines in C6, which re-plan step 36 lists
`server/routes/ha-interactions.ts` for.

**Who does them.** RIM does every commit, in this order, after:
- the re-plan's steps 1–24 that come before it;
- in particular F1 slice 2 (step 2), which extends `tests/db/commitment-fulfilment-evidence.dbtest.ts` that C1, C2,
  C4 and C5 also extend;
- S10's steps 5–7, 9 and 17, which change `readLetterSources`, the reader C3 calls.

**Before push B,** RIM checks whether D3-4 has landed. It runs `git grep -n "CommitmentRowView" origin/concept2cure-v2 --
client/src/concept2cure/v2/surfaces/` after a fetch. If `ProjectRespond.tsx` renders the row, C2r is in push B.

**Why the pushes are grouped this way.** Commits inside one push are never deployed apart. Each push closes a window
that a person would otherwise fall into:
- **Push B carries C2 to C4 together.** A milestone that can be added must also be recordable as met or withdrawn from
  the same deploy. Otherwise a commitment fulfilled in between freezes its milestones unmet for good (§7.1, finding
  1). The commit order stays the re-plan's (26, 27, 28), so C3 and C3c go in the same push.
- **A screen change counts only once it has been opened and used in the running app** (RULE 4):
  - C2 is reached once C2w (and C2r) pass the row's act to the dialog;
  - C3 is reached once C3c gives the letter's commitment routes their first client caller.
- **No milestone is written on a PMR, PMC or REMS until C6** (R-9). Every commitment an approval letter imposes is a PMR
  or a PMC (`shared/agency/letter-commitments.ts:31`, `LetterCommitmentType = 'pmr' | 'pmc'`). So step 27's schedule
  write is the one part of the re-plan that moves: it becomes C3m, in push D after C6. Everything else keeps its place.
  The coordinator is asked whether it prefers to move C3 and C3c whole to push D instead (§5, coordinator note).

---

## 1. The founder's decision

`docs/LAUNCH_DEFINITION_OF_DONE.md` §P-88, verbatim:

> ### P-88 — The commitments re-cut, confirmed under RULES 5 and 6
>
> The founder, 2026-11-01, on the RIM session's question, confirming all four points:
> 1. A fulfilment signed in error is corrected by set-once correction columns on the successor `regulatory_commitments`
>    row. No new table.
> 2. No purge role or `SECURITY DEFINER` function is added. The DELETE gap stays owed (P-41).
> 3. A milestone's "missed" is derived from its dates and never stored.
> 4. The signed PMR, PMC and REMS milestone acts and the correction go under launch rows D2 and D5 (`Plan: L1`), not
>    under new S9 paths.
>
> The unsigned milestone work for meeting commitments (listing, adding, met and withdrawn) is S9 and needed no decision.
>
> Nothing else in the plan changes.

**Also cited:**
- **P-41** (owed): "Correcting a fulfilment signed in error (§11.70 supersession, or a reopen) is owed."
  - Source: the header of `migrations/20261019_commitment_fulfilment_evidence.sql`, and the LDOD.
- **P-81:** extract commitments is a feature to finish ("AnA proposes, a person confirms, each commitment lands with
  its source, owner and due date, and shows as due work"). See plan §1b.
- **P-84:** S10's agency paths.

**How each commit cites the decisions.** A commit cites a decision in its message body only where it implements one
of that decision's points. A citation is how the decision's reach is traced later, and P-88 ends "Nothing else in the
plan changes".

| Commit | Cites | Why |
|---|---|---|
| C1 | P-88 point 3, and its S9 paragraph (listing) | missed is derived; milestones are listed |
| C2 | P-88's S9 paragraph (adding) | the unsigned add |
| C2w, C2r | nothing | they host step 26's act; no decision covers them |
| C3, C3m | P-81, P-84 | extract commitments, on S10's agency paths |
| C3c | P-81, P-84 | the first client of the letter's commitment routes |
| C4 | P-88 point 3, and its S9 paragraph (met, withdrawn) | the guard refuses a stored missed; the unsigned acts |
| C4v | nothing | a validation record |
| C5 | P-88 points 1, 2 and 4, and P-41 | the correction columns, no purge role, under L1 |
| C6 | P-88 point 4 | the signed milestone acts under L1 |

None carries a `Founder-Decision:` trailer, which is for `Plan: PLAN` only. The fulfilment acknowledgement in C2 (R-9)
follows the pattern of P-89, where each unverified figure is acknowledged one by one and re-checked in the act's own
transaction. P-89 is about figures in a signed document, not commitments, so no commit cites it.

---

## 2. The rules this work is held to

**Binding from CLAUDE.md**
- **RULE 0:** `concept2cure-v2` only.
- **RULE 1:** each migration is additive and `IF NOT EXISTS`. Every constraint is guarded by `pg_constraint`, and no
  constraint is replaced. Nothing another file creates is dropped. Triggers re-arm with `DROP TRIGGER IF EXISTS` plus
  `CREATE` on their own names. Each migration's set entry sits above the final sweep pair. A file amended in place
  carries a dated note. No table is added.
- **RULE 3:** complete what exists (§3).
- **RULE 4:** the row and the one dialog gain modes. There is no new card, panel, dialog, screen or stylesheet rule.
- **RULES 5/6:** each commit has `Plan:` and `Completes:` and stays inside its package's ledger paths. There is no new
  route file, mount, service file, table or AnA tool.
- **Part 11:** each signed act goes through `signGovernedAct`, with `contentBasis`. Every governed write has a reason
  and a chained ledger row (`recordGovernedAction`).
- **Fail closed:** a read in a form the screen does not recognise is an error, never a shorter list.

**Derived for this work** (the older design's D-1 to D-9 and D-13, re-cut by P-88)

- **R-1, missed is derived.** A milestone reads missed when all of these hold:
  - it is past its due date (the server's UTC day, as for overdue);
  - it is not met and not withdrawn;
  - its commitment is still open.

  Nothing stores missed:
  - the guard refuses a transition into it;
  - the 20260610 CHECK, which admits `missed`, is **not** narrowed (RULE 1, corollary 1);
  - a legacy stored `missed` reads by its dates.
- **R-2, a milestone is never edited or deleted by the app.** Its title and due date are fixed when it is added. One
  added or met in error is withdrawn with a reason; it stays on record and counts as neither met nor missed. DELETE
  stays open for the tenant purge (P-88 point 2), and that gap is owed.
- **R-3, milestones are added, met and withdrawn only while the commitment is open.** The routes hold this under lock,
  and the database guard holds it again.
- **R-4, met and withdrawn follow `fulfilmentRule`.**
  - A meeting commitment or other: a governed write with a reason; what met it may be named. This is S9 (C4).
  - A PMR, PMC or REMS: a Part 11 signature. This is L1 (C6).
  - Until C6, the database refuses met and withdraw on the signed types, so the system fails closed.
- **R-5, a correction never changes the corrected row** (P-88 point 1).
  - The commitment continues as a successor row: `open`, with the same type, words, basis, due date, submission,
    project and sources.
  - It carries the five set-once columns: `corrects_commitment_id` (UNIQUE), `lineage_root_id`, `correction_reason`,
    `corrected_by` and `corrected_at`.
  - The original fulfilment and its signature stay live and unchanged. The correction names the superseded signature
    in its digest and in its manifest act, not in a column.
- **R-6, one correction per row, and the lineage is linear.**
  - A row is superseded when another row's `corrects_commitment_id` names it. That is derived, never stored.
  - Every reader that lists commitments reads heads only: the rows no successor names.
- **R-7, milestones belong to the lineage root.**
  - A milestone added on a head is written on its root. The database refuses a milestone on a successor row.
  - Milestones are neither copied nor re-parented on a correction.
- **R-8, every write act is offered only to a person who may write, on a door that answers it.**
  - A read-only person is told once, at the list (the `AgencyResponses.tsx:646-649` precedent).
  - A person who may write but not sign is told why inside the dialog, before anything is typed (the shipped fulfil
    behaviour).
  - The server says which doors answer milestone acts. The commitments payload's `viewer.milestoneActs` is false on
    the organisation's door until C6, so the row offers no milestone act there. This is stated by the server, not a
    client conditional.
- **R-9, no milestone is written that cannot later be recorded, and no fulfilment freezes one silently.**
  - Until C6, `addMilestoneTx` refuses a milestone on a PMR, PMC or REMS. That covers both doors and the letter. A
    milestone that cannot be met or withdrawn is never created.
  - A fulfilment names each milestone it leaves unmet. The person confirms them, and the server re-reads them under the
    commitment's lock. Otherwise it is refused with `MILESTONES_UNMET`, and nothing is written. AnA's
    `fulfill_regulatory_commitment` cannot confirm, so it refuses whenever a milestone is unmet.
  - The routes hold this rule. The database admits a pending milestone on a signed type: the purge fixture inserts one
    on a PMC (`tests/db/agency-response-signed-approval.dbtest.ts:665`). §6 names this.

---

## 3. What already exists (RULE 3), by path

The map's §2 is the full inventory. It was verified for this design, and the items below are the ones these commits
change or depend on.

### 3.1 The database

**`migrations/20260610_ha_interactions_commitments.sql`**
- `regulatory_commitments` (`:65-85`):
  - type CHECK `pmr|pmc|rems|meeting_commitment|other`;
  - status CHECK `open|in_progress|submitted|fulfilled|overdue|waived|released`.
- `commitment_milestones` (`:87-102`):
  - `title`, `due_date`, status `pending|met|missed`, `completed_date` and `deleted_at`;
  - an FK to its commitment, but **no guard at all**.
- The map's probe (`decided/p88-probe/trunk-guards.out.txt`) shows the real DDL accepts all of these:
  - a milestone on a fulfilled commitment;
  - a milestone inserted as missed;
  - a milestone on another organisation's commitment;
  - a due date moved;
  - met with no recorder;
  - a soft delete and a hard delete.
- A bad date is PostgreSQL error 22008, which the organisation's door answers with a 500.

**`migrations/20261018b_agency_response_questions.sql:208-244`**
- Adds `project_id`, `source_communication_event_id` and `source_question_id`.
- `:142-158` holds the set-once withdrawal of a question (`withdrawn_at`, `withdrawn_by`, `withdrawal_reason`), which
  is the precedent for withdrawing a milestone.

**`migrations/20261019_commitment_fulfilment_evidence.sql` (P-41)** holds:
- the five `fulfilment_*` columns;
- `ectd_sequences_id_org_uq` (`:125`);
- the guarded same-organisation FKs (`:126-150`);
- the coherent CHECK (`:154-163`);
- the BEFORE guard (`:168-264`): the type is fixed on every row, and 16 listed columns are frozen once
  `fulfilment_recorded_at` is set;
- the deferred signed-fulfilment guard (`:270-321`), with its type list inline at `:282`;
- the arming preflight (`:326-340`).

It does **not** hold:
- a legacy fulfilled row (`fulfilment_recorded_at IS NULL`) can be reopened by a raw UPDATE;
- a recorded row accepts a value in a column it does not list;
- a hard DELETE is not refused (header `:87-90`).

**`migrations/20261029i_c2c_commitments_read_only.sql`** is the precedent for an INSERT, UPDATE and TRUNCATE guard
that leaves DELETE open for the purge (P-58).

**`scripts/db/migration-set.mjs`**
- The commitments entries are at `:3459` (20260610), `:3468` (20261018b), `:3478` (20261019) and `:3698`
  (20261029i).
- The last entry before the tail is `migrations/20261031_csr_study_data.sql` (`:3781`).
- The tail is `UUID_TENANT_ISOLATION_NONPUBLIC` (`:3782`), `CHILD_TABLE_PARENT_SCOPE` (`:3799`) and
  `TENANT_ISOLATION_SWEEP` (`:3810`).
- `ci:migration-set-order` pins the tail, existence and duplicates, not the order of the middle
  (`scripts/ci/check-migration-set-order.mjs`).
- `ci:migration-guard-order` needs a table's CREATE before any file that guards it. Both new files guard tables that
  20260610 creates earlier in the set.

**`scripts/ci/require-migration-headers.sh`** requires the `eCTD REGULATORY AUDIT CONTEXT` marker in every 2026-dated
file under `migrations/`, and CI runs it on changed files.

**The tenant purge**
- `server/services/tenant/tenant-offboarding.ts:1236-1247` deletes `commitment_milestones`, then
  `regulatory_commitments`, as the runtime role, one statement per table.
- The successor probe shows a one-statement DELETE passes a self-referencing NO ACTION FK. It also shows that the
  corrected row alone cannot be deleted while its successor exists, and that the successor alone can be (the owed
  gap, §6).

**What writes these tables**
- Every app write to `regulatory_commitments` goes through one of two functions:
  - `createCommitmentTx` (`ha-service.ts:190`), the only INSERT;
  - `fulfillCommitmentTx` (`:353`), the only UPDATE.
- The only INSERT into `commitment_milestones` is `addMilestoneTx` (`:384`).
- The only test fixture that writes a milestone inserts a pending one on an open commitment of its own organisation
  (`tests/db/agency-response-signed-approval.dbtest.ts:665`), so the new guard admits it.
- No code or test TRUNCATEs either table.

### 3.2 The server

**`server/services/ha-interactions/ha-service.ts`**
- `createCommitmentTx` (`:181-212`) refuses a soft-deleted source meeting (`:182-188`) and writes the provenance links
  `creates` and `supports`.
- `fulfilmentDateRefusal` (`:228-240`) is worded for fulfilment.
- `readCommitmentForFulfilment` (`:276-306`) is two literal statements, with an optional `FOR UPDATE OF rc`.
- `fulfillCommitmentTx` (`:330-362`) takes the lock, then checks the terminal status, type, evidence and date, then
  runs the UPDATE. **It never reads `commitment_milestones`.** The same holds for its two other callers:
  - `server/routes/commitment-fulfil-route.ts`, both signed and unsigned (`fulfilUnderLock`, `:245-293`);
  - AnA's `fulfill_regulatory_commitment` (`server/services/ana/AnaToolExecutor.ts:13596` at HEAD, `:13502` on origin,
    an S4 file). It refuses only PMR, PMC and REMS, so it fulfils meeting and other commitments without looking at
    their milestones. Its `catch` returns the refusal's sentence to the conversation.
- **`addMilestoneTx` (`:364-389`)** checks only that the commitment exists in scope. It takes no lock, accepts a
  terminal commitment and does not validate the date.
- **`listCommitments` (`:427-483`)** is two literal statements, with no milestones and no heads-only predicate.
- `listCommitmentsByInteraction` (`:494-501`) feeds `prepareMeetingPackage` (`:507-520`).
- Its callers are both doors and AnA's `review_commitment_portfolio` (`AnaToolExecutor.ts:11055`, via
  `listCommitments`, and `:13578`, via `prepareMeetingPackage`).

**`server/services/ha-interactions/ha-logic.ts`**
- `deriveCommitmentStatus` (`:38-44`) is the precedent for "derived, never stored".
- `SIGNED_FULFILMENT_TYPES` (`:91`), `fulfilmentRule` (`:111-114`), the digest `commitment-fulfilment/v1`
  (`:133-177`) and `fulfilmentRecordState` (`:190-212`).

**`server/services/ha-interactions/commitment-fulfilment.ts`**
- `FULFILMENT_CODE_STATUS` (`:71-77`).
- `resolveFulfilmentEvidenceTx` and `readEvidence`.
- `readSignatures` (`:485-506`), with the prefix `regulatory-commitment:` and the fulfilment basis hard-coded.
- `commitmentsForViewer` (`:588-616`), the allow-list projection.

**`server/services/ha-interactions/fulfilment-record.ts:40-81`:** `readCommitmentFulfilmentContent`, the one reader
the binder and the list share.

**`server/routes/commitment-fulfil-route.ts`** (449 lines, 21,595 bytes)
- `CommitmentDoor` (`:127-134`).
- `organisationViewerCapabilities` (`:137-146`). Its refusal is worded for fulfilment: "…cannot record a
  fulfilment".
- **`governedRequestWrite` (`:156-182`):** single entry; `create|update|resolve`.
- `answerFulfilmentFailure` (`:193-208`), `fulfilUnderLock`, `precheckFulfilment`, `signFulfilment` and
  `recordUnsignedFulfilment`.
- `fulfilmentOptionsRoute` (`:408-439`), which refuses a terminal row.
- `commitmentsForRequest` (`:446-449`), which returns no viewer.

**`server/routes/governed-signed-act.ts`**
- `signGovernedAct` (`:278-371`) declares its target before `run` and holds an advisory lock on it.
- The binder runs inside `persistGovernedSignSignature`, on the signing transaction, after `run`. So a correction
  binder sees the successor row `run` inserted.
- `contentBasis` (`:149`) refuses a binder fallback with `SIGNATURE_CONTENT_UNBOUND`.
- The reason is parsed by the same `governedReason` (trimmed) as the routes' bodies (`:109-114`), so a reason written
  to a column equals the manifest's top-level `reason` (`signature-persistence.ts:872`).

**`server/routes/ha-interactions.ts`, the organisation's door** (outside S9; under L1 or F1 only)
- Its own `governedMutation` (`:89-118`) and `fail()` (`:70-78`). `fail()` maps only `NOT_FOUND` (404),
  `INVALID_STATE` (409) and `BAD_INPUT` (400), and answers any other code with a 500.
- `ORG_DOOR` (`:304-309`); fulfil and options (`:311-312`).
- **`POST /commitments/:id/milestones` (`:314-325`)** writes `update` on `regulatory-commitment:<id>`, answers its own
  body, and has no client caller. Re-plan step 26 says it "is outside S9 and stays as it is".

**`server/routes/c2c/agency-responses.ts`, the project's door** (S9 and S10)
- `commitmentBody` (`:156-162`), whose `regulatoryBasis` is optional and free, and `refusal()` (`:238-262`).
- `visibleLetter(…, lock)` (`:260-266`, over `response-service.ts:129` `readLetter`). It locks only the `concept2cure_agency_communications` row; it does not lock
  the letter's data-room sources.
- `governedWrite` (`:276-291`, over `governedRequestWrite`) and `viewerCapabilities` (`:322-336`).
- GET `…/commitment-proposals` (`:409-419`).
- **POST `…/commitments` (`:425-449`):** records no schedule, checks no ref, and refuses no duplicate. It has no client
  caller.
- **POST `…/questions/:questionId/commitments` (`:595-624`), the question-level creator.**
  - It parses the same `commitmentBody`, so its basis is free.
  - It writes `source_communication_event_id` = this letter and `source_question_id` = the question.
  - Its client is the "Record a commitment" drawer in `AgencyResponses.tsx` (§3.3).
  - Because it sets the letter as source, `readLetterCommitmentProposals` reads its rows. But that read matches only a
    basis ending in ` · <ref>`. So a commitment recorded here with a hand-typed basis, such as `FDCA 505(o)(3)`, is
    invisible to a proposal of the same agency number.
- `projectDoor` (`:634-640`), the project list (`:642-659`), options (`:661-662`) and fulfil (`:664-665`).

**The letter**
- `shared/agency/letter-commitments.ts` (`e505e62fb`, S10): `splitLetterCommitments` returns
  `{ref, commitmentType, basis, text, milestones[{label, when, date}], dueDate}`, verbatim and model-free.
- `shared/agency/letter-commitments.ts:31`: `LetterCommitmentType = 'pmr' | 'pmc'`. Every commitment the letter's text
  yields is a signed type.
- `server/services/agency-responses/letter-question-proposals.ts:138-155`, `readLetterCommitmentProposals` (an S10
  file, outside S9):
  - one proposal per readable linked source per commitment (`:148-152`), each with its `sourceId`, `start` and `end`.
    A ref that two linked sources both list gives two proposals, and their schedules can differ;
  - `readLetterSources` (`:66-96`) reads each source's `extracted_text` live, in `linked_artifact_ids` order;
  - it matches a recorded commitment by `regulatory_basis` ending in ` · <ref>`;
  - it has no `deleted_at` or heads predicate.
- What can change between the GET a person read and the POST:
  - a linked source finishes processing and goes from no text to read, which adds proposals;
  - a source is soft-deleted, which removes them.

  No current path re-reads a source whose text was already read (`processingDisposition`,
  `server/services/clinical-regulatory-evidence/data-room-processing-state.ts:106-110`, answers `already_complete`
  before `retryFailed` is consulted), and `linked_artifact_ids` has no update path. The 20261008c header leaves
  `extracted_text` mutable on purpose, so that a source can be re-read.
- `server/services/agency-responses/response-service.ts:307-336`, `commitmentsOf`: a letter question's commitments,
  with no heads predicate.

**Reporting.** `server/services/report-os/research-compliance-report-providers.ts:125-129`, `ha.commitment_register`,
counts every row by status.

**Part 11**
- `server/services/part11/governed-target-binders.ts`: `commitmentFulfilmentBinding` (`:233-245`) and
  `CONTENT_BINDERS` (`:649-664`).
- `BINDING_BASIS` is in `signature-persistence.ts:114`, with `COMMITMENT_FULFILMENT_CONTENT` at `:162`.
- No other registry names the `regulatory-commitment` prefix (a grep across `server/`, `shared/`, `client/` and
  `scripts/`).

**The e-signature register.** `server/services/audit/compliance-reports/queries/electronic-signatures.ts:28-65` lists
each signature with its own target. A correction signature therefore appears as its own row, on
`regulatory-commitment-correction:<id>`.

**The ledger, and how it is read by target**
- `recordGovernedAction` (`server/routes/c2c/actions.ts:350-430`) splits a target into `table_name`/`record_id` and
  `target_type`/`target_id`. Each call writes one `audit_logs` row and one `c2c_ana_actions` row, and nothing limits it
  to one call per transaction.
- `governedRequestWrite` runs `run` on the same client before writing its own row, so `run` can write more rows.
- `signGovernedAct` writes its `sign` row only on the declared target (`governed-signed-act.ts:344-345`).
- The shipped fulfilment keys both of its forms on one target, `regulatory-commitment:<id>`: a signed fulfilment
  writes `sign` there and an unsigned one writes `resolve` (`commitment-fulfil-route.ts:360-361`, `:384`).
- **The audit trail is read by target.** `server/services/audit/signedAuditExport.ts:399-400` filters `audit_logs` by
  `table_name = resourceType` and `record_id = ANY(recordIds)`.
- `audit_logs` stores a hash of the payload; the payload itself is in `c2c_ana_actions`.
- `commitment_milestones` has no row-level audit trigger, so a milestone's creation is in the ledger only where a call
  writes it.

### 3.3 The client

**`client/src/concept2cure/v2/surfaces/CommitmentRow.tsx`** (276 lines; S9 only)
- The row types and their guards `isCommitmentRow` and `isCommitmentsPayload` (`:58-93`). Each row carries the
  server's `fulfilment.rule.signatureRequired` (`:22-26`, `:91`).
- `FulfilmentLines` (`:211-224`) and `attributionLine` (`:191-208`), which prints "signature {id}", a plan §2 retired
  pattern.
- `CommitmentRowView` (`:227-276`):
  - two `cc-btn sm` buttons;
  - an `onFulfil` prop only, and it is required (`:231`);
  - the raw `source_communication_type` on screen (`:249`).
- **Its hosts.** Today the only host is `CommunicationCenter.tsx` (`:806`, with the dialog at `:880`). D3-4 is specified
  to make Respond a second host (`.design/claude-convergence/D3.md:425-428`, "the same pair Communication uses";
  `BUILD_ORDER.md:173`, `:193`).
  - `ProjectRespond.tsx` renders no `CommitmentRowView` at `042293ade`.
  - D3-4 belongs to L4 (Wave 1b), which runs before RIM reaches S9 (`COORDINATION.md:47`). So Respond will probably
    host the row, through today's `onFulfil`, before C4.
  - `ProjectRespond.tsx` is in S10's paths and in D3's `Project*.tsx` glob, not in S9's.

**`client/src/concept2cure/v2/surfaces/CommitmentFulfilment.tsx`** (563 lines; S9 only)
- `CommitmentFulfilDialog` (`:468-563`): one mode, with `aria-label` hard-coded at `:506`, and one `cc-btn sm` (Remove,
  `:217`).
- Reusable as they are: `useFulfilSend`, `useFulfilForm`, `FulfilFields`, `FulfilSignature` (`EsignModal`) and
  `useFulfilFocus`.

**`client/src/concept2cure/v2/surfaces/CommunicationCenter.tsx`** (S10, and D6-2's layout)
- The two doors' reads (`:279-285`).
- The `fulfilling` state `{row, door}` (`:290`).
- "Record commitment", a `C2CForm` (`:292-308`, `:910-940`).
- The rows, keyed `${project_id ?? 'org'}-${id}` (`:805-813`).
- The `StateGuard` error hint "didn't respond…" (`:802`).
- The dialog mount (`:879-890`).

**`client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx`** (87 lines; S10) lists questions only. No client
calls the letter's commitment routes.

**`client/src/concept2cure/v2/surfaces/AgencyResponses.tsx`** (S10 and D6)
- Mounts `LetterQuestionProposals` (`:651-654`). Its "Record" reuses the existing Record-a-question form through
  `setAdding` (`LetterQuestionProposals.tsx:3-5`, "Record opens the same Record-a-question form").
- `:646-649` is the read-only precedent: "You can read the questions and responses on this letter. {viewer.writeRefusal}".
- **It already records a commitment from the letter, from a question:**
  - a "Record commitment" button on each question, for writers (`:334-337`, `onCommit(q)`);
  - the `committing` state, keyed to a question (`:399`);
  - `recordCommitment` (`:445-467`), which posts `${base}/questions/${committing.id}/commitments` with a free
    `regulatoryBasis`;
  - the `C2CForm` titled "Record a commitment" (`:836-855`), with the eyebrow "{ref} · commitment" and a free
    "Regulatory basis" field (`:848`).
  - `C2CForm` takes `default` on a field and a `notice` (`C2CForm.tsx:82`, `:112`; used at `AgencyResponses.tsx:734`).

**`client/src/concept2cure/v2/C2CForm.tsx`** is used, never edited (it is D0's).

**Classes, used and never edited**
- `btn ghost small` (`app-v2.css:198`, `:204`).
- `.sr-only` (`app-v2.css:1014`).
- `details.cc-q-hist` and `.cc-q-hist-list` (`commcenter-v2.css:163-167`), already used at `AgencyResponses.tsx:298`.
- `.cc-q-note` and `[data-tone="err"]` (`:150`, `:162`).
- `.cc-fulfil-line` (`:171-175`).
- `.de-h-eye` is now small, grey and in sentence case (`journey-v2.css:486`), so the dialog's eyebrow is not a retired
  pattern and stays.

**The stylesheet locks.** The `styles/**` lock is released (COORDINATION), but `commcenter-v2.css` is not an S9 path
and D6-2 is its next holder. No commit here edits a stylesheet.

### 3.4 Tests that exist and are extended

| Suite | Covers today |
|---|---|
| `server/services/ha-interactions/__tests__/ha-logic.test.ts` | status, urgency, readiness |
| `server/services/ha-interactions/__tests__/fulfilment-logic.test.ts` | rule, digest, record state |
| `server/routes/__tests__/commitment-fulfil-route.test.ts` | the fulfil refusal order and the signing budget |
| `server/services/part11/__tests__/commitment-fulfilment-binder.test.ts` | the `regulatory-commitment` binder |
| `server/services/agency-responses/__tests__/letter-commitment-proposals.pglite.test.ts` | proposals, verbatim, recorded, foreign letter |
| `tests/schema-contract/c2c-commitments-read-only.pglite.test.ts` | the pattern: the real DDL in PGlite, then replayed |
| `tests/db/commitment-fulfilment-database.dbtest.ts` | runtime role, RLS on: the type pin (`:55`), the frozen record, the purge (`:258`) |
| `tests/db/commitment-fulfilment-evidence.dbtest.ts` | both doors, the viewer, tenant isolation; F1 slice 2 extends it first |
| `server/routes/c2c/__tests__/project-write-gates.pglite.test.ts` and `support/project-write-gates-fixture.ts:116-118` | the census: every project write must be in `WRITES` (`:265-269`) |
| `server/middleware/__tests__/launch-scope-api-gate.test.ts:642-653` | the commitment paths answer launch |
| `client/src/concept2cure/v2/__tests__/commitmentFulfilment.test.tsx` | the dialog and the row (`:266` pins "signature {id}") |
| `client/src/concept2cure/v2/__tests__/communicationCommitmentsDoors.test.tsx` | the tab and both doors |
| `client/src/concept2cure/v2/__tests__/agencyResponsesLetterProposals.test.tsx` | question proposals |

### 3.5 History, and what landed since the older design

**History searches**
- `git log --all --diff-filter=D -- '*ommitment*' '*ilestone*' '*orrection*' '*ithdraw*'` finds three commits:
  - `7bc96a3e1` (c2c_commitments retired, P-39 step 2);
  - `776d9da46` (an unrelated device test);
  - `7df89f4f7` (tooling).
- `git log --all -S` finds nothing for `corrects_commitment_id`, `commitment_milestones_record_guard` or
  `deriveMilestoneState`.
- No milestone UI ever existed.
- The clone is shallow from 2026-10-05.

**Landed since the older design (`commitments-complete.design.md`, 2026-10-26)**
- Its item 3a: `7bc96a3e1`.
- Its item 4: `9e73fad98`.
- `signGovernedAct` gained `contentBasis`, `precheck` and `afterSign` (`84aada8f7`, `5985619e5`).
- Extract commitments on the letter side (`e505e62fb`).
- RULES 5 and 6, and packages S9 and S10 (P-78, P-80, P-81, P-84).
- D0-1 to D0-4.
- P-88 (`5e3652dbf`).

**Dropped from it** (re-plan §2; map §1):
- D-10 (it contradicts P-81) and D-11 (P-39 step 4 decides it);
- the corrections table and the purge role (P-88);
- the batched `governedRequestWrite` of `2bea758ba`, which will not land;
- the `.cc-btn sm` buttons and new `.cc-ms*` rules;
- AnA's tool (S4).

---

## 4. The commits, in order

**Every commit:**
- **Red first.** The failing test is written and its output saved, then each mutation is shown red on its own
  assertion.
- **Trailers:** `Plan:`, `Completes:` and the session attribution. The body cites only the decisions the commit
  implements, as the table in §1 lists them.
- **Evidence:** `docs/evidence/D2-COMMITMENT-MILESTONES/<date>/` (C1–C4, C6, C3m) or
  `docs/evidence/D2-COMMITMENT-CORRECTION/<date>/` (C5). Each README has a **"What already exists"** section and the
  "opened and used in the running app" record.
- **Gates:**
  - `node scripts/ci/check-one-design-plan.mjs --range origin/concept2cure-v2..HEAD`;
  - `npm run ci:one-product`;
  - `npm run audit:repo-health:ceiling`;
  - `ci:check-client-api-calls`, `ci:check-route-collisions` and `ci:launch-scope-api`;
  - for C4 and C5, also `ci:migration-drop-safety`, `ci:migration-set-order`, `ci:migration-guard-order`,
    `ci:migration-deploy-path` and `./scripts/ci/require-migration-headers.sh`;
  - the touched suites.
- **Before the first edit** of a file another session names, a fetch and a read of COORDINATION.

**Sizes after all the commits,** all under the 100,000-byte and 1,500-line ceiling:
- `commitment-fulfil-route.ts`: about 43 KB;
- `CommitmentFulfilment.tsx`: about 40 KB and 820 lines;
- `ha-service.ts`: about 37 KB;
- `commitment-fulfilment.ts`: about 38 KB.

### C1. S9-1: a commitment shows its milestones (re-plan step 25)

- **Plan:** S9
- **Completes:** `server/services/ha-interactions/ha-service.ts`, `client/src/concept2cure/v2/surfaces/CommitmentRow.tsx`
- **Cites:** P-88 point 3, and its S9 paragraph (listing).
- **Files:**
  - `server/services/ha-interactions/ha-logic.ts`, `ha-service.ts`, `commitment-fulfilment.ts`;
  - `client/src/concept2cure/v2/surfaces/CommitmentRow.tsx`;
  - tests.
- **Migration:** none.

**Server**
- `ha-logic.ts` gains `MilestoneState = 'pending' | 'missed' | 'met-unrecorded' | 'not-recorded'` and
  `deriveMilestoneState({ status, dueDate, headTerminal }, today)`. The first rule that applies wins:
  1. a stored `met` gives `met-unrecorded`, because nothing records a met yet;
  2. a terminal commitment gives `not-recorded`;
  3. a due date before today (`toDays`, the UTC day) gives `missed`;
  4. otherwise, `pending`.

  An undated milestone is never missed. A stored `missed` reads by its dates.
- `ha-service.ts` gains `listMilestones(client, orgId, commitmentIds)`:
  - one literal statement, with dates as text (`to_char(…, 'YYYY-MM-DD')`);
  - `organization_id = $1 AND commitment_id = ANY($2::int[]) AND deleted_at IS NULL`;
  - ordered by `due_date NULLS LAST, id`.
- `commitment-fulfilment.ts`, `commitmentsForViewer`: on the request's tenant-pinned client, it reads milestones once
  per answer, and each row's allow-list gains `milestones: [{ id, title, due_date, completed_date, state }]`.

**Client (`CommitmentRow.tsx`; behaviour, and the retired patterns on S9's own screen)**
- `isCommitmentRow` requires a `milestones` array of `{ id: number, title: string, state: string }`. A read without one
  is the tab's error state, never a shorter list.
- When there are milestones, a `MilestoneView` sits under the row body: `<details className="cc-q-hist"
  open={missed > 0}>` with an `<ol className="cc-q-hist-list">`.
- The row's `cc-btn sm` buttons become `btn ghost small`, because D6-2 deletes `.cc-btn*` after its last use.
- **Plan §2:**
  - `attributionLine` drops ", signature {id}" (`commitmentFulfilment.test.tsx:266` is updated);
  - the source line drops the raw `source_communication_type` and reads "made in the answer to Q3 in an agency
    letter".

**Words on screen**
- Summary: "Milestones · 3", or "Milestones · 3, 1 missed".
- Each item reads "{title}. Due 2027-03-31." or "{title}. No due date.", then one line:
  - pending: "Not yet met."
  - missed (`cc-q-note`, `data-tone="err"`): "Missed: not recorded as met by its due date."
  - met-unrecorded: "Recorded as met before milestones named what met them."
  - not-recorded: "Not recorded as met before this commitment was fulfilled." (or "waived", or "released").

**What a person sees**

| State | On the tab |
|---|---|
| No milestones | The row as today. Nothing is added. |
| Milestones, none missed | A closed "Milestones · 2" under the row. |
| One missed | The disclosure opens, and the missed line is in the error tone, in words. |
| A fulfilled commitment | Each unmet milestone reads "not recorded as met before…". None reads missed. |
| A read that lacks `milestones` | The tab's error state. No list is shown. |

**Red tests**
- **Unit (`ha-logic.test.ts`):**
  - past due on an open commitment is missed;
  - due today is pending;
  - undated is never missed;
  - a terminal commitment gives not-recorded;
  - a stored `missed` with a future date is pending;
  - a stored `met` is met-unrecorded.
- **PGlite**, new `server/services/ha-interactions/__tests__/commitment-milestones-list.pglite.test.ts`. It applies the
  real 20260610, 20261018b and 20261019 DDL with stub parents, as the map's probe `trunk-guards.mjs` does. It shows:
  - dates come back as text;
  - soft-deleted rows, another organisation's rows, and ids not asked for are all left out.
- **Real Postgres, runtime role, RLS on** (`commitment-fulfilment-evidence.dbtest.ts`):
  - both doors' GETs carry `milestones` with the derived state;
  - a past-due milestone reads `missed` while no row stores it;
  - another tenant reads none.
- **Client (`communicationCommitmentsDoors.test.tsx`, `commitmentFulfilment.test.tsx`):**
  - the list shows its milestones;
  - "Missed" is in words;
  - a payload row without `milestones` shows the error state;
  - no "signature" number is on screen.

**Mutations**
1. `due <= today`.
2. `headTerminal` dropped.
3. The shape guard accepts a missing `milestones`.
4. `deleted_at IS NULL` dropped.
5. The organisation predicate dropped.

### C2. S9-2: add a milestone from the project (re-plan step 26)

- **Plan:** S9
- **Completes:** `server/routes/commitment-fulfil-route.ts`
- **Cites:** P-88's S9 paragraph (adding).
- **Push:** B, with C2w, C2r (if needed), C3, C3c and C4.
- **Files:**
  - `server/routes/commitment-fulfil-route.ts`, `server/routes/c2c/agency-responses.ts`;
  - `server/services/ha-interactions/ha-service.ts`, `commitment-fulfilment.ts`;
  - `client/src/concept2cure/v2/surfaces/CommitmentRow.tsx`, `CommitmentFulfilment.tsx`;
  - tests.
- **Not edited:** `server/routes/ha-interactions.ts` (step 26: "stays as it is") and `server/services/ana/AnaToolExecutor.ts`
  (S4).
- **Migration:** none.

**Server**
- **`addMilestoneTx` is completed** (`ha-service.ts:369`). In order:
  1. the date is checked as yyyy-mm-dd and as a real date (`BAD_INPUT`);
  2. the commitment is read `FOR UPDATE` through `readCommitmentForFulfilment(…, { lock: true })` (`NOT_FOUND`);
  3. a terminal commitment is refused (`INVALID_STATE`);
  4. **until C6, a PMR, PMC or REMS is refused** (`INVALID_STATE`, R-9). The sentence is "A milestone of a PMR, PMC or
     REMS is recorded as met by an electronic signature, which this register does not take for milestones. Nothing was
     recorded." The rule is read from the row through `fulfilmentRule(type).signatureRequired`, never from a list in
     the route. C6 deletes this step;
  5. then the INSERT.

  `ha-interactions.ts`'s `fail()` maps all three codes it uses. So the organisation's door refuses them through its
  shipped route as soon as this commit lands, with no edit to that file:
  - a bad date answers 400, not 500;
  - a terminal commitment answers 409;
  - a PMR answers 409.
- **A fulfilment says which milestones it leaves unmet (R-9).** This is in this commit, because it is the first in which
  a person can add a milestone from the screen.
  - `ha-service.ts` gains `unmetMilestonesTx(client, orgId, commitmentId)`. It is one literal statement:
    `status <> 'met' AND deleted_at IS NULL`, ordered by `id`, returning `{ id, title }`. A legacy stored `missed`
    counts as unmet. C4 adds `withdrawn_at IS NULL`; C5 reads it on the lineage root.
  - `fulfillCommitmentTx` gains `leavesUnmet: number[] | null`. Under the commitment's `FOR UPDATE` lock, after the
    terminal check and before the UPDATE, it reads `unmetMilestonesTx`.
    - If any are unmet and `leavesUnmet` is not exactly their ids, as a set, it throws `MILESTONES_UNMET`. The
      sentence is "2 milestones of this commitment are not recorded as met: Final protocol submission; Final report
      submission. Record each as met or withdraw it first, or confirm them in the fulfilment. Nothing was recorded."
    - `addMilestoneTx` takes the same row lock, so the set cannot change between that read and the UPDATE.
  - `commitment-fulfil-route.ts`:
    - `fulfilBody` gains `leavesUnmet: z.array(z.number().int().positive().max(MAX_INT)).max(200).optional()`.
    - `precheckFulfilment` makes the same check read-only, after the type's rule and before the evidence. So a signer
      spends no password attempt and none of the signing budget on it.
    - `fulfilUnderLock` passes the list through.
    - The ledger payload, and for a signed type the manifest's `act`, gain `leavesUnmetMilestoneIds`. 20261019's
      deferred guard compares only `sequenceId`, `vaultDocumentId`, `vaultSha256` and `fulfilledDate` in the act
      (`:307-310`), so an added field does not disturb it. The `commitment-fulfilment/v1` digest is unchanged.
  - `commitment-fulfilment.ts`: `FULFILMENT_CODE_STATUS` gains `MILESTONES_UNMET: 409`, and `HaErrorCode` gains it.
  - **AnA, with no edit to `AnaToolExecutor.ts`.**
    - `fulfill_regulatory_commitment` calls `fulfillCommitmentTx` with no `leavesUnmet`. So it refuses whenever a
      milestone is unmet, and its `catch` returns the sentence to the conversation.
    - AnA cannot confirm what a fulfilment freezes, just as it cannot sign: the person does it on the screen.
  - The organisation's door reaches this through the shared fulfil route (`ha-interactions.ts:311`), which answers
    through `FULFILMENT_CODE_STATUS`.
- **The door says whether it answers milestone acts (R-8).**
  - `CommitmentDoor` gains an optional `milestoneActs?: boolean`. Optional, so `ORG_DOOR` (`ha-interactions.ts:304-309`)
    needs no edit and reads false.
  - The project door sets `milestoneActs: true`.
  - The commitments payload's `viewer` gains `milestoneActs = door.milestoneActs === true && canWrite`.
  - C6 sets the organisation's to true when it brings that door's milestone lines in.
- `commitment-fulfil-route.ts` gains `addMilestoneRoute(req, res, door)`.
  - **Refusal order:** 401; then 404 for the id (`commitmentIdOf`); then the strict body
    `{ title: trimmed 1–500, dueDate?, reason: governedReason }` (400 `VALIDATION`); then the date (400); then 404 when
    the commitment is not in the door or not visible; then 409 when it is terminal.
  - Written through `governedRequestWrite`, command `create`, target `commitment-milestone:<mid>`, payload
    `{ commitmentId, title, dueDate }`.
  - Answers 201 `{ success, data: { id, commitmentId, title, dueDate, state }, actionId, auditId, sha256Chain }`.
- `organisationViewerCapabilities`' refusal is now act-agnostic: "Your role can read commitments but cannot change
  them." The test that pins it is updated.
- `commitmentsForRequest(req, orgId, rows, door?)` returns `{ commitments, summary, viewer }`. When `door` is absent,
  it uses the organisation's capabilities with `milestoneActs: false`, so `ha-interactions.ts:292` gains `viewer` with
  no edit.
- `agency-responses.ts`:
  - gains `router.post('/projects/:projectId/commitments/:commitmentId/milestones', (req, res) =>
    addMilestoneRoute(req, res, projectDoor(req)))`, on the existing router (no route file, no mount);
  - `projectDoor` sets `milestoneActs: true`, and the project list passes `projectDoor(req)`.

**Client**
- **`CommitmentRow.tsx`:**
  - exports `CommitmentAct = { kind: 'fulfil' } | { kind: 'add-milestone' }`;
  - `CommitmentRowView` gains optional `onAct(act)` and `viewer`;
  - `isCommitmentsPayload` requires `viewer`, with a boolean `milestoneActs`.
  - "Add milestone" (`btn ghost small`, `aria-describedby` the row title) is shown only when all of these hold:
    - `onAct` and `viewer` are given;
    - `viewer.canWrite` and `viewer.milestoneActs` are true;
    - the commitment is open;
    - `c.fulfilment.rule.signatureRequired` is false (the server's rule on the row; C6 drops this condition).
  - With a `viewer` given and `canWrite` false, no write act is shown, "Record fulfilment" included (R-8).
  - With no `viewer` given (a host not yet updated), "Record fulfilment" behaves as today and nothing new is offered.
- **`CommitmentFulfilment.tsx`:**
  - `CommitmentFulfilDialog` takes `act` (default `{ kind: 'fulfil' }`) and an optional `viewer`.
  - Inside the same file, the body splits into the existing panel and an `AddMilestoneForm`, so no hook is called
    conditionally. For `add-milestone` the dialog renders D0's `C2CForm` (used, not edited). A ref ignores a second
    submit while one is in flight.
  - `useFulfilFocus` records, at open, `opener.closest('[data-focus-return]')`. On close it focuses the opener if it is
    still in the page, otherwise that element. The row's root and each milestone `<li>` carry `data-focus-return` and
    `tabIndex={-1}`.
  - Remove (`:217`): `cc-btn sm` becomes `btn ghost small`.
  - **The fulfil mode confirms what it leaves unmet (R-9).** When the row has unmet milestones (state `pending` or
    `missed`):
    - the panel shows a `<fieldset className="cf-seq">` with the legend "Milestones not recorded as met";
    - it lists each unmet milestone as "{title}. Due {date}." (or "No due date.");
    - it has one checkbox, `<label className="cf-seq-opt">`, the markup the sequence picker uses at `:160-167`
      (classes used, not edited).
    - The primary stays disabled until the box is checked. The body then sends `leavesUnmet`, the ids of exactly the
      listed milestones.
    - If the server's set differs, because a milestone was added or recorded meanwhile, the 409 sentence is shown in
      the dialog. The register reloads, so the list is read again.
    - With no unmet milestones, nothing is added and no `leavesUnmet` is sent.

**Words on screen** (the `C2CForm`, with no eyebrow)
- Title: "Add a milestone"
- Notice: "{type}: {description}" (for example "Meeting commitment: …"; a PMR, PMC or REMS offers no add until C6)
- Sub: "A dated step toward meeting this commitment, such as a final protocol submission. It reads missed once its due
  date passes."
- Fields: "Title" (required), "Due date", "Reason" (required).
- Governed: "Recorded with your reason in the audit trail."
- Submit: "Add milestone"

**Words on screen** (the fulfil mode, when milestones are unmet)
- Legend: "Milestones not recorded as met"
- Checkbox: "Record this commitment as fulfilled with these 2 milestones not met. Each then reads “Not recorded as met
  before this commitment was fulfilled”, and none can be recorded later." (One milestone: "with this milestone not
  met. It then reads … and cannot be recorded later.")

**What a person sees**

| Outcome | What happens |
|---|---|
| Added | Toast "Milestone added, with an audit entry." The drawer closes, the register reloads, the milestone reads "Not yet met.", and focus is back on "Add milestone". |
| Refused | Toast "Milestone not added: {server sentence}". The drawer stays open with the typed values. When the server's sentence does not end "Nothing was recorded.", the toast adds "Nothing was stored." |
| No answer, or an answer that confirms nothing | Toast "Whether the milestone was added could not be confirmed. The register was reloaded: check this commitment before adding it again." The register reloads. |
| Fulfilling with an unmet milestone | The fulfil dialog lists it, and "Record fulfilment" is disabled until the box is checked. Once it is fulfilled, the milestone reads "Not recorded as met before this commitment was fulfilled." |
| A PMR, PMC or REMS row | No "Add milestone" until C6. |

**The server's sentences**
- "Use yyyy-mm-dd for the due date. Nothing was recorded."
- "That due date does not exist. Nothing was recorded."
- "A milestone is added while its commitment is open; this one is fulfilled, waived or released. Nothing was recorded."
- "Give the milestone a title. (title) Nothing was recorded."
- The signed-type refusal and `MILESTONES_UNMET`, as above.

**Red tests**
- **Route unit (`commitment-fulfil-route.test.ts`):**
  - the refusal order; a terminal row refused before any write; the ledger target and command;
  - fulfil: `MILESTONES_UNMET` comes after the type's rule and before any password attempt or signing budget is spent.
- **PGlite (the C1 file):**
  - `addMilestoneTx` refuses fulfilled, waived and released commitments, and a bad date, before the INSERT;
  - it refuses a PMR, a PMC and a REMS;
  - `unmetMilestonesTx` counts pending and stored `missed`, and leaves out met, soft-deleted and other commitments'
    milestones.
- **Census (`project-write-gates-fixture.ts`):** gains
  `{ method: 'POST', path: `${P}/commitments/:commitmentId/milestones`, mode: 'write' }`. The census is red without it.
- **Launch gate (`launch-scope-api-gate.test.ts`):** `/api/concept2cure/projects/42/commitments/3/milestones` answers
  launch.
- **Real Postgres under RLS (`commitment-fulfilment-evidence.dbtest.ts`):**
  - the project door adds a milestone, and the list shows it pending;
  - a fulfilled commitment gives 409, and a bad date gives 400 (not 500);
  - a viewer is refused;
  - another organisation cannot add;
  - the ledger row is `create` on `commitment-milestone:<mid>`;
  - the list carries `viewer`, with `milestoneActs` true on the project door and false on the organisation's;
  - the organisation's shipped `POST /api/ha-interactions/commitments/:id/milestones` answers 409 on a PMR, 409 on a
    fulfilled commitment and 400 on a bad date. Nothing is written, and the file is unedited;
  - **fulfilling never freezes a milestone silently (finding 1's test):**
    - a meeting commitment with one pending milestone: an unsigned fulfil without `leavesUnmet` gives 409
      `MILESTONES_UNMET` and writes nothing;
    - the same with a stale `leavesUnmet`, after a second milestone was added, gives 409;
    - with exactly the unmet ids it gives 201, and the `resolve` row's payload names them;
    - a PMR holding a legacy pending milestone (a raw INSERT, as the purge fixture writes one) is refused on the signed
      path before any attempt is spent;
    - AnA's `fulfill_regulatory_commitment` on a meeting commitment with a pending milestone returns the refusal and
      writes nothing. The tool's handler is called from `tests/db`, and `AnaToolExecutor.ts` is unedited.
- **Client (`commitmentFulfilment.test.tsx`):**
  - the notice names the commitment;
  - a second click while busy posts nothing;
  - a lost response reads "could not be confirmed";
  - a refusal keeps the values;
  - no write act is shown for `viewer.canWrite === false`;
  - no "Add milestone" when `viewer.milestoneActs` is false, or on a row whose rule requires a signature;
  - fulfil with unmet milestones: the primary is disabled until the box is checked, and the body's `leavesUnmet` is
    exactly the listed ids.

**Mutations**
1. The terminal refusal dropped.
2. The date check dropped (the 500 returns).
3. The target `regulatory-commitment:`.
4. The `WRITES` entry left out.
5. `door.visible` dropped (a commitment from a restricted letter).
6. The row offers "Add milestone" to a viewer.
7. The `MILESTONES_UNMET` check dropped from `fulfillCommitmentTx` (the unsigned, signed and AnA cases go red).
8. `leavesUnmet` compared as a subset, not as an equal set (the stale-set case goes red).
9. The signed-type refusal in `addMilestoneTx` dropped (the PGlite and organisation-door cases go red).
10. `milestoneActs` read as `canWrite` alone (the organisation-door client case goes red).

### C2w. S10: the tab passes the row's act and the door's viewer to the one dialog

- **Plan:** S10
- **Completes:** `client/src/concept2cure/v2/surfaces/CommunicationCenter.tsx`
- **Cites:** none. It hosts step 26's act, which no decision covers.
- **Push:** B.
- **Files:** `CommunicationCenter.tsx`, `client/src/concept2cure/v2/__tests__/communicationCommitmentsDoors.test.tsx`.
- **The change** (behaviour only, about a dozen lines):
  - `fulfilling` becomes `{ row, door, act }`.
  - Rows get `onAct={(act) => setFulfilling({ row: c, door, act })}` and `viewer` for their door
    (`orgCommitState.data.viewer` or `projectCommitState.data.viewer`). `onFulfil` is no longer passed.
  - The dialog gets `act={fulfilling.act}` and that door's `viewer`.
  - For each door whose viewer cannot write and which has rows: one `<p className="cc-q-note">{viewer.writeRefusal}</p>`
    above the list (R-8).
  - The `StateGuard` error hint at `:802` becomes "The commitments register could not be read, or answered in a form
    this screen does not recognise. Nothing is shown rather than a partial list." The old hint claims "didn't
    respond", which a malformed body is not.
  - Later acts need no further change here, because the host passes `act` through without reading it.
  - Organisation rows offer no milestone act, because their door's `viewer.milestoneActs` is false (C2). The host does
    not test the door itself.
- **Tests:**
  - "Add milestone" posts to the project door, and the register reloads;
  - an organisation row shows no "Add milestone";
  - a viewer sees the sentence once and no write act;
  - a malformed body shows the new hint.
- **Mutation:** pass no `act`, so the dialog opens in fulfil mode, and the add test goes red.
- **Coordinate with:** the coordinator. `CommunicationCenter.tsx` is in L7/D6-2's layout, and whichever lands second
  rebases (D6.md §0). Send D3-4 the contract for the second host (Respond): `onAct`, `act`, `viewer`, and from C5 the
  lineage key.
- **Evidence:** C2's "opened and used in the running app" record is filed after push B.

### C2r. S10: Respond passes the row's act too (only if Respond hosts the row by push B)

- **Plan:** S10
- **Completes:** `client/src/concept2cure/v2/surfaces/ProjectRespond.tsx`
- **Cites:** none.
- **Push:** B, sent to the coordinator first, because D3 owns Respond's layout (`D3.md` §0) and `ProjectRespond.tsx` is
  in D3's `Project*.tsx` glob as well as S10's paths. It is not in S9's (`ledger-check-rev.out.txt`).
- **When:** only if the check before push B finds `CommitmentRowView` rendered in `ProjectRespond.tsx`. Otherwise
  D3-4 builds its host on the contract C2w sends it, and C2r does not exist.
- **The change:** the same as C2w's for the project door only, in behaviour and no layout:
  - Respond's `fulfilling` state carries `act`;
  - its rows pass `onAct` and the project door's `viewer`;
  - its dialog takes `act` and `viewer`;
  - `onFulfil` is no longer passed.
- **Tests:** the D3-4 Respond test, extended. "Add milestone" on Respond posts to the project door, and the read
  reloads.
- **Mutation:** pass `onFulfil` instead of `onAct`, so no milestone act shows and the test goes red.
- **Why it matters for C4:** C4 deletes `onFulfil` only when no host passes it (C4, client).

### C3. S9-3, part 1: a commitment recorded from the letter as the person saw it (re-plan step 27)

- **Plan:** S9
- **Completes:** `server/routes/c2c/agency-responses.ts`
- **Cites:** P-81, P-84.
- **Push:** B.
- **Files:** `server/routes/c2c/agency-responses.ts`, tests. `readLetterCommitmentProposals` is called unedited. Its
  file is S10's, not S9's.
- **Migration:** none.
- **What moved.** Step 27 also records the letter's schedule as milestones. Every letter commitment is a PMR or a PMC,
  and until C6 a milestone on those can be neither met nor withdrawn (R-9). So the schedule write is C3m, in push D
  after C6. This commit is the part of step 27 that is safe now: the server writes the letter's basis, bound to what
  the person was shown.

**Server**
- **POST `…/agency-communications/:eventId/commitments` only** takes:

  ```
  letterCommitmentBody = commitmentBody.extend({
    fromLetter: z.object({
      sourceId: z.number().int().positive().max(MAX_INT),
      ref: z.string().regex(/^\d{3,6}-\d{1,3}$/),
      start: z.number().int().min(0), end: z.number().int().positive(),
      milestones: z.array(z.object({ label: z.string().max(200), when: z.string().max(100) }).strict()).max(20),
    }).strict().optional(),
  })
  ```

  - `start`, `end` and `milestones` are exactly what the GET returned for that proposal.
  - When `fromLetter` is given, `regulatoryBasis` must be absent, because the server writes the letter's.
- **In the same `governedWrite` transaction,** when `fromLetter` is given:
  1. Lock the letter row. `visibleLetter(…, lock = true)` serialises two recordings of one letter.
  2. Read the bound source row `FOR SHARE`. This is one literal statement on `cre_evidence_sources`
     (`organization_id`, `id = fromLetter.sourceId`, `deleted_at IS NULL`), as `digest-access.ts:126` reads its rows.
     Its text cannot change under the comparison. If no row is found, because the source was removed or never was
     this organisation's, the answer is 409 `LETTER_TEXT_CHANGED`. The real-Postgres test runs as the runtime role, so
     a missing privilege fails red there.
  3. Re-read `readLetterCommitmentProposals(client, scope)`. A source refusal from re-plan steps 7 and 9 passes
     through in its own words.
  4. Take the proposals whose `ref` equals `fromLetter.ref`. If there are none, answer 404.
  5. If those proposals disagree, answer 409 `LETTER_COMMITMENT_AMBIGUOUS`. They disagree when they come from more
     than one source and differ in `commitmentType`, `basis` or the `(label, when)` list. Which schedule the agency set
     cannot then be told from the text. Identical copies of one letter do not disagree.
  6. The proposal at `fromLetter.sourceId` must exist. Its `start`, `end` and `(label, when)` list must equal the
     body's. Otherwise answer 409 `LETTER_TEXT_CHANGED`.
  7. If it is already recorded (`recordedCommitmentId` of any of the step-4 proposals), answer 409.
  8. If `commitmentType` differs from the letter's, answer 409.
  9. Call `createCommitmentTx` with `regulatoryBasis = commitmentBasisOf(c)` and the person's description and due
     date, prefilled from the letter in C3c.
- **The letter's marker is the server's alone.** On this letter's two by-hand creators, `regulatoryBasis` may not end
  in ` · ` followed by an agency number (`/ · \d{3,6}-\d{1,3}$/`). The creators are the letter's POST without
  `fromLetter` and the question-level POST (`:595-624`). The proposals' "recorded" match reads exactly that suffix. Two
  things follow:
  - nothing recorded by hand can pose as, or double, a commitment recorded from the letter's text;
  - a second recording through the form is refused.

  The organisation's `POST /api/ha-interactions/commitments` sets no letter as source, so the match never reads it.
- **The ledger:** one `create` row on `regulatory-commitment:<id>`. Its payload names `{ communicationEventId,
  fromLetter: { sourceId, ref, start, end } }`.
- **The success body** adds `milestones: []`. C3m fills it. The client words its toast from that array, so C3m needs no
  client edit.

**The server's sentences**
- 404: "That commitment is not in this letter's text, so its schedule cannot be read from it. Nothing was recorded."
- 409 `LETTER_TEXT_CHANGED`: "The letter's text changed since you read it. Reload the letter and check the commitment
  again. Nothing was recorded."
- 409 `LETTER_COMMITMENT_AMBIGUOUS`: "Commitment 4321-1 reads differently in two of this letter's files ({title},
  {title}), so which schedule the agency set cannot be told from the text. Nothing was recorded."
- 409: "Commitment 4321-1 is already recorded from this letter. Nothing was recorded." `4321-1` is the agency's own
  number.
- 409: "The letter records 4321-1 as a PMR, not a PMC. Nothing was recorded."
- 400: "A commitment recorded from the letter takes the letter's basis; leave the basis out. (regulatoryBasis) Nothing
  was recorded."
- 400, by hand: "A basis ending “· 4321-1” marks a commitment recorded from the letter's own text. Record it from
  “Commitments in this letter”, or give the basis without the agency's number. (regulatoryBasis) Nothing was
  recorded."

**Red tests**
- **PGlite (`letter-commitment-proposals.pglite.test.ts`):**
  - with the `4321-1` letter, recording `fromLetter` writes one commitment, with the letter's basis, and no milestone;
  - an unknown ref writes nothing;
  - a second recording gives 409;
  - a type mismatch gives 409;
  - after it, the proposal reads recorded.
  - **Bound to what was shown:** the bound source's `extracted_text` is rewritten between the GET and the POST (a raw
    UPDATE; the column is mutable by design), and the POST gives 409 `LETTER_TEXT_CHANGED` and writes nothing. The
    same holds when the body's `milestones` differ from the GET's.
  - **Ambiguity:** a second linked source lists `4321-1` with `06/2O29` in place of `06/2029`, and the POST gives 409
    `LETTER_COMMITMENT_AMBIGUOUS` and writes nothing. Two identical copies record normally.
  - **The marker:** the question-level POST and the letter's by-hand POST each refuse `FDCA 505(o)(3) · 4321-1`, and
    accept `FDCA 505(o)(3)`.
- **Real Postgres under RLS (`commitment-fulfilment-evidence.dbtest.ts`):**
  - one `create` ledger row, whose payload carries `fromLetter`;
  - another project's letter gives 404;
  - a person without read scope on the source gets re-plan step 7's refusal;
  - two concurrent recordings of one ref give one 201 and one 409;
  - a source soft-deleted between the GET and the POST gives 409 `LETTER_TEXT_CHANGED`;
  - the source row's `FOR SHARE` runs as the runtime role.

**Mutations**
1. An unknown ref accepted.
2. The duplicate refusal dropped.
3. The letter lock dropped (the concurrent test goes red).
4. The body's basis accepted.
5. The comparison with the body's `start`, `end` and `milestones` skipped (the rewritten-text case goes red).
6. The ambiguity check dropped (the two-source case goes red).
7. The marker refusal dropped on the question-level POST (its case goes red).

### C3c. S10: "Commitments in this letter", through the existing "Record a commitment" form (pushed with C3)

This is not a P-88 step. It is the first client of the letter's commitment routes (P-81, P-84), and C3 is reached only
through it.

- **Who:** RIM, which holds S10.
- **Plan:** S10
- **Completes:** `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx`
- **Cites:** P-81, P-84.
- **Push:** B.
- **Files:** `LetterQuestionProposals.tsx`, `AgencyResponses.tsx`, `agencyResponsesLetterProposals.test.tsx`.
- **The change:**
  - `LetterQuestionProposals.tsx` gains a second list, read from `GET …/commitment-proposals`, with "Record" on each
    unrecorded proposal and an `onRecordCommitment(p)` prop. This follows its own pattern for questions
    (`:3-5`, "Record opens the same Record-a-question form").
  - **No second drawer.** `AgencyResponses.tsx`'s existing `committing` state and its "Record a commitment"
    `C2CForm` (`:399`, `:836-855`) gain a letter-proposal variant:
    - `committing` becomes `{ kind: 'question'; q: AgencyQuestionView } | { kind: 'letter'; p: LetterCommitmentProposal }`;
    - the question variant is unchanged in words and fields;
    - the letter variant is that same form, with:
      - type, basis and schedule in its notice, not as fields, because the server writes the letter's and refuses a
        mismatch;
      - "What was committed" prefilled with the verbatim text;
      - "Due date" prefilled with the letter's date;
      - "Reason";
      - no "Regulatory basis" field.
  - `recordCommitment` branches on the variant:
    - the question variant posts `${base}/questions/:id/commitments`, as today;
    - the letter variant posts `${base}/commitments` with `commitmentType: p.commitmentType` and `fromLetter: {
      sourceId, ref, start, end, milestones: p.milestones.map(({ label, when }) => ({ label, when })) }`.
  - On a 409 `LETTER_TEXT_CHANGED` or `LETTER_COMMITMENT_AMBIGUOUS`, the drawer stays open with the sentence, and the
    proposals reload.
  - The `cc-btn sm` buttons in `LetterQuestionProposals.tsx` become `btn ghost small`.
- **Words on screen:**
  - lead: "In the letter: 2 commitments, found in its text without AI. Check each against the letter, then record it
    with a reason."
  - each item: "4321-1 · PMR, FDCA 505(o)(3). {text}. Final protocol submission 09/2026; final report submission
    06/2029.", then "Recorded", or a "Record" button (`aria-label` "Record 4321-1");
  - none found: "No postmarketing requirements or commitments were found in the letter's text. Record any by hand."
  - the letter variant's eyebrow: "4321-1 · from the letter". Title: "Record a commitment".
  - its notice: "PMR, FDCA 505(o)(3) · 4321-1, as the letter states it. Final protocol submission 09/2026; final report
    submission 06/2029."
  - its sub: "Recorded with the letter as its source and the agency's number as its basis. A commitment recorded by
    hand from a question on this letter is not matched to the agency's number: check the questions above before
    recording."
  - success, from the server's `milestones`: with none, "Commitment 4321-1 recorded from the letter, with an audit
    entry."; with some (from C3m), "Commitment 4321-1 recorded from the letter with its 2 milestones, with an audit
    entry."
- **Tests (`agencyResponsesLetterProposals.test.tsx`):**
  - the letter variant posts `fromLetter` exactly as the GET returned it, and no `regulatoryBasis`;
  - the question variant still posts to the question route with its free basis;
  - only one `C2CForm` is mounted at a time, and the screen has one record-a-commitment drawer;
  - a 409 `LETTER_TEXT_CHANGED` keeps the drawer open and reloads the proposals.
- **Mutations:** the letter variant sends `regulatoryBasis` (the server's 400 makes the test red); a second
  `C2CForm` is mounted for the letter (the one-drawer assertion goes red).
- **Coordinate with:** the coordinator (`AgencyResponses.tsx` is in L7/D6-2).

### C4. S9-4: met and withdrawn milestones, for unsigned types (re-plan step 28)

- **Plan:** S9
- **Completes:** `server/services/ha-interactions/ha-logic.ts`
- **Cites:** P-88 point 3, and its S9 paragraph (met and withdrawn).
- **Push:** B. It goes with C2, so that a milestone that can be added can, from the same deploy, be recorded as met or
  withdrawn (§0).
- **Doors:** the project door only. The organisation door's met and withdraw lines come with C6 (§7.1, finding 6).
- **Files:**
  - `migrations/<date>_commitment_milestones_met_withdrawn.sql` (new; `<date>` is the commit date);
  - `scripts/db/migration-set.mjs`;
  - `server/services/ha-interactions/ha-logic.ts`, `ha-service.ts`, `commitment-fulfilment.ts`;
  - `server/routes/commitment-fulfil-route.ts`, `server/routes/c2c/agency-responses.ts`;
  - `client/src/concept2cure/v2/surfaces/CommitmentRow.tsx`, `CommitmentFulfilment.tsx`;
  - `shared/schema/ha-interactions.ts` (a comment only);
  - tests.

**The migration**

*Header and placement*
- **Header:** the eCTD REGULATORY AUDIT CONTEXT block, in the 20261019 form:
  - Compliance: 21 CFR Part 11 §11.10(e); 21 CFR 314.81(b)(2)(vii);
  - Purpose: a milestone is met with its recorder, and what met it, or withdrawn with a reason; missed is never stored;
  - Integrity Risk Addressed: a milestone met with no attribution, or a missed one hidden by a stored state, a moved
    date or an edit;
  - Determinism Contract: missed is derived (`ha-logic.ts deriveMilestoneState`).
- **It then has these sections:**
  - WHAT IT ADDS;
  - WHAT THE DATABASE HOLDS;
  - "Held by the routes only": R-9, meaning no milestone on a signed type until C6 and a fulfilment that names what it
    leaves unmet;
  - "Not held": DELETE, owed under P-41 and P-88;
  - the replay notes.
- **Placement:** in `C2C_MIGRATION_FILES`, directly above `UUID_TENANT_ISOLATION_NONPUBLIC` and after
  `migrations/20261031_csr_study_data.sql`.
  - Its parents come earlier: 20260610 (`:3459`); 20261019 (`:3478`, `ectd_sequences_id_org_uq`); the submission core;
    and the Vault's shape.
  - Its set comment says: no table; columns, constraints and triggers on a table the sweep already polices; it drops
    nothing another file creates.
  - Ask the coordinator for the `migration-set.mjs` hold first. RIM released it in `32922d0e6`.

*Columns:* one `ALTER TABLE public.commitment_milestones`, each `ADD COLUMN IF NOT EXISTS`:
```
met_sequence_id INTEGER, met_vault_document_id UUID, met_vault_sha256 TEXT,
met_recorded_by INTEGER, met_recorded_at TIMESTAMPTZ,
withdrawn_at TIMESTAMPTZ, withdrawn_by INTEGER, withdrawal_reason TEXT
```
- Every existing row is NULL on all eight. The date met is the existing `completed_date`.

*Constraints:* each is guarded by `pg_constraint` inside one `DO` block, as 20261019 `:126-165` does. None is replaced,
so RULE 1 corollary 1 does not arise.
- `commitment_milestones_met_sequence_same_org_fk`: `(met_sequence_id, organization_id)` references
  `ectd_sequences (id, organization_id)`.
- `commitment_milestones_met_vault_fkey`, only when `to_regclass('vault.documents')` exists.
- `…_met_recorded_by_fkey` and `…_withdrawn_by_fkey`, to `users`.
- CHECK `commitment_milestones_met_coherent`:
  - a version and its pin go together;
  - the pin matches `^[0-9a-f]{64}$`;
  - a recorder and a time go together;
  - evidence only when recorded;
  - `status = 'met' OR met_recorded_at IS NULL`;
  - `met_recorded_at IS NULL OR completed_date IS NOT NULL`.
- CHECK `commitment_milestones_withdrawal_coherent`: all three withdrawal columns or none, and the reason is 8–2000
  characters after `btrim` (`GOVERNED_REASON_MIN`/`MAX`).
- Every existing row passes both CHECKs, including a legacy `met` with no recorder.

*The guard:* `public.commitment_milestones_record_guard()`, BEFORE INSERT OR UPDATE, with a BEFORE TRUNCATE statement
trigger that refuses. **DELETE is not refused** (P-88 point 2).
- Each refusal is a sentence that begins with its code.
- The parent commitment is read `FOR SHARE`, so a concurrent fulfilment is waited for and then seen.
- **INSERT:**
  - the milestone is `pending`, with no `completed_date`, `met_*`, `withdrawn_*` or `deleted_at`
    (`IMMUTABILITY_VIOLATION`);
  - the parent is live and of the same organisation (`MILESTONE_COMMITMENT_INVALID`; the plain FK does not compare
    organisations);
  - the parent is not terminal (`MILESTONE_COMMITMENT_CLOSED`).
- **UPDATE, on every row:**
  - `id`, `organization_id`, `commitment_id`, `title`, `due_date`, `created_by` and `created_at` are fixed;
  - `deleted_at` never changes, so legacy rows keep theirs;
  - a transition into `missed` is refused (`MILESTONE_MISSED_IS_DERIVED`), while a legacy stored `missed` can still be
    met or withdrawn;
  - `met` never reverts.
- **The move into `met`** requires:
  - the row is not withdrawn;
  - `met_recorded_by`, `met_recorded_at = now()` (not back-dated) and a `completed_date`;
  - the parent is not terminal;
  - evidence, if any, as 20261019 `:240-262` checks it: the same organisation, live, the agency received it
    (`dispatch_status IN ('sent','acknowledged')`, inline as 20261019 `:256` is), and the Vault version at its own
    hash.

  `met_*` and `completed_date` are written only in that update. After it, `status`, `completed_date` and `met_*` are
  frozen.
- **The withdrawal** requires `withdrawn_by`, `withdrawn_at = now()` and a reason. No other column changes except
  `updated_at`, and the parent must not be terminal. Once withdrawn, the whole row is frozen.
- **A parent of a signed type** (`pmr`, `pmc` or `rems`, inline as 20261019 `:282`): the move into met and the
  withdrawal are refused (`MILESTONE_SIGNATURE_REQUIRED`). C6 replaces this clause in place, so until then the system
  fails closed. A DB test pins the list equal to `SIGNED_FULFILMENT_TYPES`.

*Replay:*
- `CREATE OR REPLACE FUNCTION`, and `DROP TRIGGER IF EXISTS` plus `CREATE` on its own trigger names.
- Not mirrored in Drizzle, as 20261019's columns are not. `shared/schema/ha-interactions.ts:154` gains only a comment
  that `missed` is a read state.

**Server**
- **`ha-logic.ts`:**
  - `deriveMilestoneState` gains the inputs `recorded` and `withdrawn`, and the states `met` and `withdrawn`;
    `withdrawn` wins, then `met`;
  - `metLate(completedDate, dueDate)`;
  - `fulfilmentDateRefusal(date, today, noun)` gains the milestone wording.
- **`ha-service.ts`:**
  - `meetMilestoneTx`:
    1. the commitment `FOR UPDATE` (`NOT_FOUND`, terminal `INVALID_STATE`, signed `MILESTONE_SIGNED_TYPE`);
    2. the milestone `FOR UPDATE`, on that commitment (`MILESTONE_NOT_FOUND`), not withdrawn (`MILESTONE_WITHDRAWN`)
       and not met (`MILESTONE_ALREADY_MET`);
    3. one UPDATE with `met_recorded_at = now()`.
  - `withdrawMilestoneTx`, in the same order.
  - `unmetMilestonesTx` (C2) adds `withdrawn_at IS NULL`, so a withdrawn milestone is not asked about at fulfilment.
  - `listMilestones` adds the met and withdrawal fields, and the names through `public.actor_name` (as
    `listCommitments` does at `:455`). Withdrawn rows are listed.
- **`commitment-fulfilment.ts`:**
  - `FULFILMENT_CODE_STATUS` gains `MILESTONE_NOT_FOUND` (404), and `MILESTONE_ALREADY_MET`, `MILESTONE_WITHDRAWN` and
    `MILESTONE_SIGNED_TYPE` (409);
  - `readEvidence` also reads the milestones' met evidence, in the same batched read for each kind;
  - each milestone's view gains `met: { date, late, recordedBy, recordedAt, sequence, vaultVersion, state } | null` and
    `withdrawal: { by, at, reason } | null`.
- **`commitment-fulfil-route.ts`** gains `meetMilestoneRoute` and `withdrawMilestoneRoute`. Their refusal order is the
  fulfilment's:
  1. 401;
  2. 404 for either id;
  3. the strict body (met: `{ completedDate?, reason, evidence?, meaning?, password?, mfaToken? }`; withdraw:
     `{ reason, meaning?, password?, mfaToken? }`);
  4. the date;
  5. 404 when not in the door or not visible;
  6. 409 when terminal;
  7. 409 `MILESTONE_SIGNED_TYPE`;
  8. a password on an unsigned type, 400 `SIGNATURE_NOT_TAKEN`;
  9. evidence, read-only;
  10. then `governedRequestWrite`: met is `resolve` on `commitment-milestone:<mid>`, and withdraw is `update` on the
      same target with payload `{ withdrawn: true }` (the `agency-question` withdrawal precedent).

  `fulfilmentOptionsRoute`'s terminal refusal becomes act-agnostic, because the met mode reads it too: "That commitment
  is already fulfilled, waived or released. Nothing more can be recorded on it."
- **`agency-responses.ts`:** two literal lines, `…/commitments/:commitmentId/milestones/:milestoneId/met` and
  `…/withdraw`.

**Client**
- **`CommitmentRow.tsx`:**
  - Per milestone, for writers (`viewer.canWrite` and `viewer.milestoneActs`) on an open commitment whose rule takes no
    signature (`c.fulfilment.rule.signatureRequired` false):
    - "Record as met" (`aria-label` "Record as met: {title}") when it is not met;
    - "Withdraw" ("Withdraw: {title}") when it is not withdrawn, met ones included.
  - `CommitmentAct` gains `{ kind: 'milestone-met'; milestoneId }` and `{ kind: 'milestone-withdraw'; milestoneId }`.
  - **`onFulfil` is deleted only if no host passes it at commit time.** Before the commit, RIM runs `git grep -n
    "onFulfil=" origin/concept2cure-v2 -- client/src/` after a fetch.
    - If the grep finds no host passing it, because C2w and, where needed, C2r converted theirs, the prop goes.
    - If another host passes it, for example a Respond that D3-4 landed after push B was cut, `onFulfil` stays as the
      fulfil alias of `onAct`. It stays optional, `onAct ?? (() => onFulfil?.())`, so no host breaks
      `ci:pushed-typecheck`. That host is converted by an S10 commit like C2r, sent to the coordinator first, and
      `onFulfil` goes in the commit after it.
    - The evidence README records the grep's output.
- **`CommitmentFulfilment.tsx`:**
  - the panel gains the modes `milestone-met` and `milestone-withdraw`, through one `MODE_WORDS` record;
  - the dialog is named by its title (`aria-labelledby`), and the hard-coded `aria-label` at `:506` goes;
  - inside the dialog, `FulfilmentLines` has no links, so nothing navigates away from a typed reason;
  - the met mode reads `fulfilment-options` for its sequences and viewer;
  - the withdraw mode reads nothing and uses the `viewer` prop.

**Words on screen**
- **Met mode:**
  - title: "Record a milestone as met"
  - sub: "{type}: {description} · {title} · Due 2026-09-30." (or "No due date.")
  - date: "Date met", with the help "Leave it empty to record today."
  - when the date is after the due date: "This records the milestone as met after its due date."
  - reason: "Reason, and how the milestone was met"
  - governed: "Recorded with your reason in the audit trail. A milestone recorded as met cannot be changed; one recorded
    in error is withdrawn."
  - primary: "Record as met"
- **Withdraw mode:**
  - title: "Withdraw a milestone"
  - sub: "{type}: {description} · {title}"
  - reason: "Why this milestone is withdrawn"
  - governed: "Recorded with your reason in the audit trail. The milestone stays on record, marked withdrawn, and is
    counted neither as met nor as missed. If the step is still owed, add it again."
  - primary: "Withdraw milestone"
- **The row:**
  - "Met on 2026-10-20."
  - "Met by sequence 0004 of IND 123456, acknowledged by the agency." or "No sequence or document was named."
  - "Recorded by A Lee on 20 Oct 2026, 14:02."
  - when late: "Met after its due date of 2026-09-30."
  - withdrawn: "Withdrawn by A Lee on …: “Due date mistyped; added again as 2027-03-31.”" A met milestone keeps its met
    lines above this.
- **C2's form sub gains:** "Its title and due date cannot be changed once added; one added in error is withdrawn."
  This is true from this commit on, because the database holds it.
- **The fulfil mode's confirmation (C2)** now leaves out withdrawn milestones. Its words are unchanged.
- **Signed types:** no milestone act and no "coming later" text (plan §2).
- **The server's sentences:**
  - "That milestone is not on this commitment. Nothing was recorded."
  - "That milestone is already recorded as met. Nothing was recorded."
  - "That milestone was withdrawn. Nothing was recorded."
  - "Recording a milestone of a PMR as met, or withdrawing one, is an electronic signature. Nothing was recorded."
  - "A milestone cannot be met on a date that has not happened yet."

**What a person sees**

| Outcome | Met | Withdrawn |
|---|---|---|
| Recorded | Toast "Milestone recorded as met, with an audit entry." Focus goes to the milestone's `<li>`, because the opener is gone. | Toast "Milestone withdrawn, with an audit entry." Focus goes to the `<li>`. |
| Refused | The dialog stays open with "Not recorded as met: {sentence}". | "Not withdrawn: {sentence}" |
| Unconfirmed | "Whether the milestone was recorded as met could not be confirmed. The register was reloaded: check this milestone before recording it again." | "Whether the milestone was withdrawn could not be confirmed. The register was reloaded: check this milestone before withdrawing it again." |
| A person who may write but not sign (signed types only, from C6) | The authority sentence before anything is typed, and the primary is disabled. | The same. |

**Red tests**
- **Schema-contract PGlite,** new `tests/schema-contract/commitment-milestones-met-withdrawn.pglite.test.ts`. It
  applies the commitments files in `C2C_MIGRATION_FILES` order. The test's list is sorted by the set's index, so C5's
  file joins it in set order. It shows:
  - the file is in the set after 20261019 and above the tail;
  - INSERT as met, as missed or as withdrawn is refused; INSERT on a terminal parent, or on another organisation's
    commitment, is refused;
  - UPDATE of `title` or `due_date` is refused, and so is setting `deleted_at`, even on a past-due milestone;
  - a transition into missed is refused, while a legacy `missed` can still be met or withdrawn;
  - met with no recorder, a back-dated `met_recorded_at`, or evidence outside the met update is refused; so is
    another organisation's, an unfiled or a wrong-hash piece of evidence;
  - once met, the row is frozen except for the withdrawal; once withdrawn, it is frozen;
  - met or withdrawn on a signed-type parent is refused;
  - DELETE succeeds and TRUNCATE is refused;
  - the set applied twice changes nothing.
- **Real Postgres, runtime role, RLS on (`commitment-fulfilment-database.dbtest.ts`):**
  - the type pin is extended: for each of the five types, a raw met and a raw withdrawal are accepted exactly when the
    type is not in `SIGNED_FULFILMENT_TYPES`;
  - the purge (`:258`), with pending, met and withdrawn milestones, still erases the tenant.
- **Real Postgres, routes (`commitment-fulfilment-evidence.dbtest.ts`):**
  - a project's meeting commitment milestone is met, with a reason, naming a production-sent sequence of its program;
  - another program's sequence is refused before anything is written;
  - a sequence that F1 slice 2 left `pending` after a staging send is refused as evidence;
  - after a withdrawal the list reads withdrawn, neither met nor missed;
  - a PMR milestone gives 409 `MILESTONE_SIGNED_TYPE`;
  - the ledger is asserted by target and command;
  - a withdrawn milestone is not in the fulfilment's unmet set, and a met one is not either.
- **Census:** two `WRITES` entries. **Launch gate:** two paths, both on the project door.
- **Client:**
  - in each mode the dialog's accessible name equals its title;
  - no string says "fulfilment" in the milestone modes;
  - there is no navigation button inside the dialog;
  - the reason is required;
  - focus returns to the `<li>` after met.

**Mutations**
1. Refuse `missed` on every write, not only on a transition.
2. Drop the transition refusal.
3. Drop the parent-organisation check.
4. Let `due_date` change.
5. Let `deleted_at` be set.
6. Drop `met_recorded_at = now()`.
7. Drop the sha256 match.
8. Drop the signed-type refusal.
9. Drop `MILESTONE_ALREADY_MET`.
10. Refuse DELETE (the purge test goes red).
11. Restore the hard-coded `aria-label`.
12. Drop the `FOR SHARE` on the parent (a concurrent-fulfil DB test goes red).
13. `unmetMilestonesTx` without `withdrawn_at IS NULL` (the withdrawn case goes red).

### C4v. L1 (row D4), only if the coordinator agrees: the validation change control for C1–C4

- **Plan:** L1 (row D4, validation)
- **Completes:** `docs/validation/URS-001-PROJECTS.md`
- **Cites:** none.
- **Push:** B, but only if the coordinator agrees before push B (§5, coordinator note). Otherwise C5's L1 validation
  update records C1–C4 with the correction, and C4v does not exist.
- **Files:** `docs/validation/URS-001-PROJECTS.md`, `OQ-001-PROJECTS.md`, `RA-001-RISK-ASSESSMENT.md`,
  `VSR-001-VALIDATION-SUMMARY-REPORT.md`. **Documents only.** No code, route or test changes here. That is what keeps
  it a D4 validation record, not S9 work under L1.
- **The change:** the change control for C1 to C4, with C2w, C3c and C2r. `docs/validation/**` is in no S package's
  paths (`ledger-check.out.txt`, "validation docs under S9"). Numbers are re-read at commit. At `08debf4e0` they were
  URS-PROJ-015, OQ-PROJ-20, RA-001's next revision, and the VSR addendum after "D2 A2.10 change impact (2026-10-26)".
- **Why it is a question.** No plan-era commit has yet carried an S package's validation record (`git log
  origin/concept2cure-v2 --since=2026-10-31 -- docs/validation` is empty). So where it goes is the coordinator's call.

The first draft's C4o is dropped. Its two organisation-door lines are in C6. Its validation record is C4v or C5
(§7.1, finding 6).

### C5. L1-3a (rows D2, D5): correcting a fulfilment recorded in error (re-plan step 36, commit 1)

- **Plan:** L1
- **Completes:** `server/services/ha-interactions/fulfilment-record.ts`
- **Cites:** P-88 points 1, 2 and 4, and P-41.
- **Files:**
  - **migrations:** `migrations/<date>_commitment_fulfilment_correction.sql` (new), C4's migration (amended in place),
    `scripts/db/migration-set.mjs`;
  - **the commitments service:** `server/services/ha-interactions/ha-logic.ts`, `ha-service.ts`,
    `fulfilment-record.ts`, `commitment-fulfilment.ts`;
  - **routes:** `server/routes/commitment-fulfil-route.ts`, `server/routes/c2c/agency-responses.ts`,
    `server/routes/ha-interactions.ts`;
  - **Part 11:** `server/services/part11/governed-target-binders.ts`, `signature-persistence.ts`;
  - **the other readers:** `server/services/agency-responses/response-service.ts`, `letter-question-proposals.ts`,
    `server/services/report-os/research-compliance-report-providers.ts`;
  - **client:** `client/src/concept2cure/v2/surfaces/CommitmentRow.tsx`, `CommitmentFulfilment.tsx`,
    `CommunicationCenter.tsx`, and `ProjectRespond.tsx` if it hosts the row;
  - the four validation documents, and tests. Unless C4v landed in push B, the validation update records push B (C1 to
    C4, with C2w, C2r and C3c) as well as the correction.

**The migration: `migrations/<date>_commitment_fulfilment_correction.sql`**

*Header:* as for C4, with the Purpose "a fulfilment recorded in error is corrected by a successor row; the corrected row
and its signature are kept unchanged".

*Placement:*
- In the set **directly above C4's entry**, with a set comment saying why: C4's milestone guard, amended below, reads
  the lineage columns. The middle of the set is not date-ordered (`check-migration-set-order.mjs`).
- Placed above, the columns exist before the amended guard is replaced on the first deploy, and on a fresh database.
- Placed below, the successor probe (case 1b) shows that plpgsql accepts the guard at CREATE and fails the first
  milestone write with 42703. Between the two files of that first deploy, any milestone write would fail.

*Columns:* one `ALTER TABLE public.regulatory_commitments` with P-88's five, each `ADD COLUMN IF NOT EXISTS`:
`corrects_commitment_id INTEGER`, `lineage_root_id INTEGER`, `correction_reason TEXT`, `corrected_by INTEGER`,
`corrected_at TIMESTAMPTZ`.

*Indexes and constraints* (guarded; none replaced):
- `CREATE UNIQUE INDEX IF NOT EXISTS regulatory_commitments_id_org_uq ON (id, organization_id)`. This is additive,
  because `id` is already unique; the precedent is `ectd_sequences_id_org_uq`.
- `CREATE UNIQUE INDEX IF NOT EXISTS regulatory_commitments_corrects_once ON (corrects_commitment_id) WHERE
  corrects_commitment_id IS NOT NULL`. The probe (2b) refuses a second successor with 23505.
- `CREATE INDEX IF NOT EXISTS regulatory_commitments_lineage_root_idx ON (lineage_root_id) WHERE lineage_root_id IS NOT
  NULL`.
- Same-organisation composite FKs, NO ACTION: `(corrects_commitment_id, organization_id)` and
  `(lineage_root_id, organization_id)` both reference `regulatory_commitments (id, organization_id)`. The probe (2c)
  refuses another organisation's row with 23503.
- `corrected_by` references `users`.
- CHECK `regulatory_commitments_correction_coherent`:
  - all five or none;
  - `corrects_commitment_id <> id`;
  - the reason is 8–2000 characters after `btrim`.

*`public.regulatory_commitments_correction_guard()`,* a second BEFORE INSERT OR UPDATE trigger. 20261019's function and
triggers are untouched.
- **INSERT with `corrects_commitment_id`:** the corrected row is read `FOR UPDATE`. It must be:
  - in the same organisation, live and `fulfilled`;
  - not already corrected (a sentence, ahead of the 23505).

  The new row must be:
  - `open`, with no `fulfilled_date` or `deleted_at`;
  - a copy, `IS NOT DISTINCT FROM`, of the corrected row's `commitment_type`, `description`, `regulatory_basis`,
    `due_date`, `submission_id`, `project_id`, `source_interaction_id`, `source_communication_event_id` and
    `source_question_id`;
  - written with `lineage_root_id = COALESCE(corrected.lineage_root_id, corrected.id)`, `corrected_at = now()` and
    `corrected_by = created_by`.

  Otherwise `COMMITMENT_CORRECTION_INVALID`, with the clause named.
- **UPDATE:**
  - the five columns are fixed on every row;
  - a row that another row's `corrects_commitment_id` names refuses every UPDATE. This closes the legacy reopen for
    corrected rows, so a lineage never has two live heads;
  - a successor never gains `deleted_at`.

*`public.regulatory_commitments_signed_correction_guard()`* is a constraint trigger: AFTER INSERT, DEFERRABLE INITIALLY
DEFERRED, `WHEN (NEW.corrects_commitment_id IS NOT NULL)`.
- For a `pmr`, `pmc` or `rems` (inline), it requires a live `governed-action` signature that:
  - is on `'regulatory-commitment-correction:' || corrects_commitment_id`;
  - has the basis `commitment-fulfilment-correction-content-sha256`;
  - is by `corrected_by`, with meaning approval or responsibility;
  - meets 20261019's not-withdrawn predicates (`:303-305`);
  - was written by this transaction (`created_at = LOCALTIMESTAMP`);
  - has `signature_manifest ->> 'reason' = correction_reason`;
  - has `signature_manifest -> 'act' ->> 'successorCommitmentId' = NEW.id::text`.

  Otherwise `COMMITMENT_CORRECTION_SIGNATURE_REQUIRED`.
- The arming preflight follows 20261019 `:326-340`.

*C4's file is amended in place,* with a dated header note: "Amended <date> by L1-3a (P-88): milestones belong to the
lineage root".
- INSERT on a successor row is refused (`MILESTONE_NOT_ON_ROOT`).
- The terminal check for INSERT, met and withdraw reads the **head**: the row of `{root} ∪ {lineage_root_id = root}`
  that no row's `corrects_commitment_id` names.
- **The head is locked too, after the root.** After C5, a milestone's parent is always the lineage root, and the root
  of a corrected lineage is frozen. A fulfilment of a successor head updates only that head
  (`fulfillCommitmentTx`, `ha-service.ts:340-358`). So C4's `FOR SHARE` on the parent alone would never wait for it,
  and a plain subquery would read the head's last committed version.
  - The amended guard therefore reads the head as `SELECT h.id, h.status FROM regulatory_commitments h WHERE (h.id =
    root OR h.lineage_root_id = root) AND NOT EXISTS (SELECT 1 FROM regulatory_commitments s WHERE
    s.corrects_commitment_id = h.id) FOR SHARE`. It does this after the root's `FOR SHARE`, so the order is always root
    then head.
  - Under READ COMMITTED, a concurrent fulfilment of the head is then waited for, and the row read after the wait is
    the fulfilled version. The guard refuses with `MILESTONE_COMMITMENT_CLOSED`.
  - No deadlock follows:
    - a fulfilment locks only its head;
    - a correction locks the corrected row `FOR UPDATE`, plus the FK's `KEY SHARE` on the root, which does not conflict
      with `FOR SHARE`;
    - the milestone routes lock the URL's head `FOR UPDATE` first, and the same transaction's `FOR SHARE` on it is
      then already held.
  - A correction that commits while the guard waits on the corrected row leaves the guard reading the old head, which
    is fulfilled. It refuses, so this fails closed, and the person adds the milestone again on the open successor.

**Not held,** as the header and README say:
- The runtime role can DELETE a successor. The corrected row is then the head again (probe 2e). This is P-41's DELETE
  gap, kept owed by P-88, and a DB test pins it as "Not held".
- The corrected row itself cannot be deleted while a successor exists (probe 2d). The purge's one-statement DELETE
  passes (probe 2f).

**Server**
- **`ha-logic.ts`:** `COMMITMENT_CORRECTION_DIGEST_RECIPE = 'commitment-fulfilment-correction/v1'`, and
  `commitmentCorrectionDigest` over `[recipe, correctedCommitmentId, supersededFulfilmentDigest, supersededSignatureId,
  successorCommitmentId, reason]`.
- **`fulfilment-record.ts`:** `readCommitmentCorrectionContent(client, orgId, correctedIds)`, the one reader the binder
  and the list share. It returns the successor, root, reason, by and at, and:
  - the superseded digest, through `readCommitmentFulfilmentContent`;
  - the newest live fulfilment signature on the corrected row, or null.
- **`ha-service.ts`:**
  - **`createCommitmentTx`** gains `correctionOf: { correctedId, lineageRootId, reason }`. It then:
    - skips the live-meeting lookup, so a deleted source meeting does not block the correction;
    - writes the five columns;
    - writes provenance `corrected-by` from the corrected row to the successor, plus the usual `supports` link, and no
      `creates` link.
  - **`correctFulfilmentTx`:**
    1. reads the corrected row `FOR UPDATE` (`NOT_FOUND`, `NOT_FULFILLED`, `ALREADY_CORRECTED`);
    2. copies it through `createCommitmentTx`;
    3. maps a 23505 on `regulatory_commitments_corrects_once` to `ALREADY_CORRECTED`.
  - **Heads only,** as a literal `AND NOT EXISTS (SELECT 1 FROM regulatory_commitments s WHERE
    s.corrects_commitment_id = rc.id)`, in both `listCommitments` statements and in `listCommitmentsByInteraction`.
    That reaches AnA's portfolio tool and the meeting package with no edit to `AnaToolExecutor.ts`.
  - `lineage_root_id` is added to both list statements.
  - Milestones are read and added by `COALESCE(lineage_root_id, id)`, and the milestone routes resolve a head's root.
  - `unmetMilestonesTx` (C2) reads the lineage root's milestones, so fulfilling a successor head asks about the
    milestones that belong to it (R-7, R-9).
- **`commitment-fulfilment.ts`:**
  - `readSignatures` takes a target prefix and a basis;
  - each row gains `lineage_root_id` and `history`: one entry for each superseded row of its lineage, oldest first,
    `{ fulfilledDate, fulfilment: FulfilmentView, correction: { by, at, reason, signature, state } }`;
  - codes: `NOT_FULFILLED` and `ALREADY_CORRECTED`, both 409.
- **`commitment-fulfil-route.ts`, `correctFulfilmentRoute(req, res, door)`.** It follows the fulfil route's pattern:
  - **Refusal order:** 401; 404 id; the strict body `{ reason, meaning?, password?, mfaToken? }`; then, read-only, 404
    when not in the door or not visible, 409 `NOT_FULFILLED`, 409 `ALREADY_CORRECTED`, and 400 `SIGNATURE_NOT_TAKEN`
    (a password on an unsigned type).
  - **Signed:** `spendSigningAttempt`, then `signGovernedAct` with target `regulatory-commitment-correction:<id>`,
    `contentBasis: BINDING_BASIS.COMMITMENT_CORRECTION_CONTENT` and `DECISION_ACT_MEANINGS`.
    - Inside `run`, under the target's advisory lock: `correctFulfilmentTx`, then
      `recordGovernedAction({ command: 'create', target: 'regulatory-commitment:<successor>' })` on the same client.
    - The manifest act is `{ correctedCommitmentId, successorCommitmentId, lineageRootId, supersededSignatureId }`,
      read in the same transaction the binder reads.
  - **Unsigned:** the same two targets as the signed path, so both forms of one governed act are keyed alike. That is
    the shipped pattern for fulfilment (`sign` and `resolve` both on `regulatory-commitment:<id>`).
    - `governedRequestWrite`'s own row is command `create` on `regulatory-commitment-correction:<id>`, with payload
      `{ correctedCommitmentId, successorCommitmentId, lineageRootId }`.
    - Inside `run`, on the same client, `recordGovernedAction({ command: 'create', target:
      'regulatory-commitment:<successor>', payload: { correctsCommitmentId, lineageRootId } })` writes the successor's
      creation, as the signed path does.
    - A read of the audit trail by target then finds every correction on its correction target
      (`signedAuditExport.ts:399-400`), signed or not.
- **Routes:** `…/commitments/:commitmentId/correct-fulfilment` on the project door; `/commitments/:id/correct-fulfilment`
  on the organisation door; one `WRITES` entry; two launch paths.
- **Part 11:**
  - `BINDING_BASIS.COMMITMENT_CORRECTION_CONTENT = 'commitment-fulfilment-correction-content-sha256'`, beside
    `signature-persistence.ts:162`;
  - `CONTENT_BINDERS['regulatory-commitment-correction']`, a binder over `readCommitmentCorrectionContent`;
  - the `regulatory-commitment` binder is unchanged.
- **Readers made to read the register as it stands, each heads-only:**
  - `response-service.ts`, `commitmentsOf`;
  - `letter-question-proposals.ts`: the recorded match is heads only, with `deleted_at IS NULL`, so it names the
    successor;
  - `research-compliance-report-providers.ts`, `ha.commitment_register`: one literal heads-only count by status, plus
    overdue, in place of `countBy`. Without it the report counts a corrected commitment twice.

**Client**
- **`CommitmentRow.tsx`:**
  - "Correct fulfilment" on a fulfilled head, for writers (`CommitmentAct` gains `{ kind: 'correct' }`);
  - the `history` disclosure;
  - `isCommitmentRow` requires `lineage_root_id` and a `history` array.
- **`CommitmentFulfilment.tsx`:** the `correct` mode.
  - It reads nothing: the rule is the row's, and the viewer is the prop.
  - Signed, it goes through `FulfilSignature`/`EsignModal`.
  - It shows the fulfilment being corrected through `FulfilmentLines`, without links.
- **`CommunicationCenter.tsx`** (one line): rows are keyed `${project_id ?? 'org'}-${lineage_root_id ?? id}`. The row
  then stays mounted across a correction, and focus returns to its root (`data-focus-return`).
- **`ProjectRespond.tsx`**, if it hosts the row by then: the same one-line key, sent to the coordinator first, because
  D3 owns the layout. C5 is `Plan: L1`, so the path is in its package, but the layout hold is D3's. If D3-4 has not
  landed, its contract (C2w) already names the lineage key.

**Words on screen**
- **The correct mode:**
  - title: "Correct a fulfilment recorded in error"
  - sub: "{PMR}: {description}"
  - the record: "Fulfilled on 2026-10-01.", then its lines
  - reason: "Why the fulfilment was recorded in error"
  - governed, signed: "Correcting the fulfilment of a {PMR} is an electronic signature (21 CFR Part 11). The
    fulfilment and its signature stay on record, marked corrected. The commitment opens again with the same type, words
    and due date, and reads overdue if its due date has passed. Its milestones stay with it."
  - governed, unsigned: the same, with "Recorded with your reason in the audit trail." in place of its first sentence.
  - primary: "Sign correction" / "Correct fulfilment"
- **EsignModal:**
  - action: "Correct the fulfilment of {PMR}"
  - target: "{PMR}: {description}"
  - meta: "Your signature records that the fulfilment of 2026-10-01 was recorded in error. It stays on record; the
    commitment opens again. Your reason is recorded as why."
- **History on the row:**
  - summary: "History · 1 corrected fulfilment" (or "2 corrected fulfilments")
  - each item: "Fulfilled on 2026-10-01.", then the kept fulfilment's lines (its signature still reads as signed), then
    "Corrected by A Lee on 3 Nov 2026, 10:12 (responsibility): “Sequence 0003 was the protocol amendment, not the final
    report.”"
  - the verdict lines, in the error tone: "The signature on this correction does not match the record as it stands." /
    "…has been withdrawn." / "This correction is recorded, but no signature records it."
  - no signature numbers.
- **The server's sentences:**
  - "That commitment is not recorded as fulfilled, so there is no fulfilment to correct. Nothing was changed."
  - "That fulfilment was already corrected; the commitment that replaced it is on the register. Nothing was changed."
  - "A meeting commitment's fulfilment is corrected with a reason, not a signature. Nothing was changed."

**What a person sees**

| Outcome | What happens |
|---|---|
| Corrected | Toast "Fulfilment corrected. The commitment is open again, with an audit entry." The row stays where it was. It now reads open (or overdue) with "Record fulfilment", and "Add milestone" where the door and the type admit it (before C6, not on a PMR, PMC or REMS). "History · 1 corrected fulfilment" is below it, and its milestones are unchanged. Focus is on the row. |
| Refused | "Not corrected: {sentence}" in the dialog. |
| Unconfirmed | "Whether the correction was recorded could not be confirmed. The register was reloaded: check this commitment before correcting it again." |
| Cannot sign | The authority sentence before anything is typed. The primary is disabled. |

**Red tests**
- **Schema-contract PGlite,** new `tests/schema-contract/commitment-fulfilment-correction.pglite.test.ts`, applying the
  files in set order. It covers each guard clause:
  - the successor copies the due date, the words, the type and the sources;
  - a corrected row that is not fulfilled, a wrong root, a back-dated `corrected_at`;
  - a second correction;
  - an UPDATE of the five columns;
  - an UPDATE of a corrected row, including a legacy fulfilled one (the map's probe case);
  - a soft delete of a successor;
  - a signed correction at COMMIT with no signature, with a ledger-basis signature, or with another reason; and one
    accepted with the matching signature;
  - a milestone on a successor; a milestone guard that reads the head;
  - replayed twice.

  C4's schema-contract test, which lists its files by set order, now picks up this file too.
- **Real Postgres under RLS (`commitment-fulfilment-database.dbtest.ts`):**
  - the type pin for raw corrections;
  - the original row byte-identical;
  - the purge with a corrected lineage succeeds;
  - a runtime DELETE of a successor succeeds, pinned "Not held, owed (P-41, P-88)".
- **Real Postgres, routes (`commitment-fulfilment-evidence.dbtest.ts`):**
  - a signed PMR correction on the project door gives 201;
  - the list shows one row, the successor, with `history[0]` the original, still signed, and the correction signed;
  - the ledger holds `sign` on the correction target and `create` on the successor, in one transaction;
  - `commitmentsOf`, the register report and the meeting package read heads only;
  - the original signature is neither superseded nor revoked;
  - for both a signed PMR correction and an unsigned meeting-commitment correction: exactly one row on
    `regulatory-commitment-correction:<id>` (`sign` or `create`) and one `create` on `regulatory-commitment:<successor>`,
    in one transaction;
  - a deleted source meeting is still correctable;
  - the milestones stay on the root, and fulfilling and correcting again keep the root;
  - two concurrent unsigned corrections give one 201 and one 409;
  - **the head lock (finding 4's test):** on a corrected lineage, one session fulfils the successor and holds its
    transaction. Another session's raw milestone INSERT on the root then waits, and so does its met of a root
    milestone. When the first commits, the second is refused with `MILESTONE_COMMITMENT_CLOSED`. C4's single-row
    concurrent test stays as it is;
  - fulfilling a successor with a root milestone unmet gives 409 `MILESTONES_UNMET` unless it is confirmed;
  - a viewer is refused, and organisation B is isolated.
- **Unit:**
  - the binder (`commitment-fulfilment-binder.test.ts`): the new prefix binds the correction digest, never the
    fulfilment binder;
  - the route order: `ALREADY_CORRECTED` and `NOT_FULFILLED` before any attempt is spent;
  - a reason padded with spaces is written to `correction_reason` exactly as the manifest records it;
  - `server/routes/c2c/__tests__/governed-action.pglite.integration.test.ts`: `revoke-signature` and `reopen` cannot
    reach `regulatory-commitment-correction:` (`resolveTarget`, `c2c/actions.ts:152`, has no such case).
- **Client:**
  - the correct mode in each state (cannot sign, refused, unconfirmed);
  - no navigation button inside it;
  - the history summary and lines;
  - focus on the row after success;
  - "Correct fulfilment" is never shown on a history item.

**Mutations**
1. Heads-only removed from each reader, one at a time (`listCommitments`, `listCommitmentsByInteraction`,
   `commitmentsOf`, the proposals match, the report).
2. The successor's due-date copy check dropped.
3. The root check dropped.
4. `corrected_at = now()` dropped.
5. The deferred signed guard dropped.
6. The manifest-reason comparison dropped.
7. Sign on `regulatory-commitment:`.
8. Revoke the original signature.
9. The freeze on a superseded row dropped.
10. The successor's `create` ledger row dropped, on the signed path and on the unsigned path, one at a time.
11. The live-meeting check kept in correction mode.
12. The 23505 mapping dropped.
13. Rows keyed by `id` again (the focus test goes red).
14. The unsigned correction's own row written on `regulatory-commitment:<successor>` (the correction-target count goes
    red).
15. The head's `FOR SHARE` dropped from the amended guard (the corrected-lineage concurrent test goes red). This extends
    C4's mutation 12.

**Coordinate with:**
- the coordinator, for `migration-set.mjs` and `CommunicationCenter.tsx`;
- `01T2wooC…`, `01KnUGoX…` and `01E8btkB…`, for the Part 11 files;
- the Reporting lane (`011HLkY…`), for the providers file.

### C6. L1-3b (rows D2, D5): signed PMR, PMC and REMS milestone met and withdraw, and the organisation door's milestone lines (re-plan step 36, commit 2)

- **Plan:** L1
- **Completes:** `server/services/part11/governed-target-binders.ts`
- **Cites:** P-88 point 4.
- **Push:** D, with C3m after it.
- **Files:**
  - C4's migration (amended in place);
  - `server/services/ha-interactions/ha-logic.ts`, `ha-service.ts`, `fulfilment-record.ts`, `commitment-fulfilment.ts`;
  - `server/routes/commitment-fulfil-route.ts`, `server/routes/ha-interactions.ts` (re-plan step 36 lists it);
  - `server/services/part11/governed-target-binders.ts`, `signature-persistence.ts`;
  - `client/src/concept2cure/v2/surfaces/CommitmentRow.tsx`, `CommitmentFulfilment.tsx`;
  - the four validation documents, and tests.
- **The signed branch lives inside the shared handlers.** No new handler is written.
- **`addMilestoneTx`'s signed-type refusal (C2 step 4) is deleted.** From here on, a milestone on a PMR, PMC or REMS can
  be added, met and withdrawn, which closes R-9's first point. The row's "Add milestone" and milestone acts drop their
  `signatureRequired` condition.
- **The organisation door's milestone lines** (step 36's `ha-interactions.ts`):
  - `router.post('/commitments/:id/milestones', (req, res) => addMilestoneRoute(req, res, ORG_DOOR))` replaces the
    shipped handler at `:314-325`, and `milestoneSchema` goes;
  - two literal lines, `…/milestones/:milestoneId/met` and `…/withdraw`, both to the shared handlers with `ORG_DOOR`;
  - `ORG_DOOR` gains `milestoneActs: true`.

  The commit message names the contract change on the replaced POST. A malformed id answers 404, not 400. The ledger
  is `create` on `commitment-milestone:<mid>`, not `update` on `regulatory-commitment:<id>`. The answer is the shared
  body.
  - `requireEditorAccessForWrites` still gates the POSTs, and `governedMutation` stays for the meeting writes.
  - **Deletion record:** none. The path stays, and no capability is removed. The replaced handler's work is done by
    `addMilestoneRoute` (`commitment-fulfil-route.ts`). The evidence dbtest's organisation-door case proves it is
    reachable.
  - The shared handlers branch on `fulfilmentRule`, so these lines also serve the organisation's meeting commitments,
    which are unsigned. This follows from one implementation for two doors. It is not separate unsigned work. The
    coordinator is asked to confirm it reads as step 36's scope (§5). If not, `ORG_DOOR.milestoneActs` stays false
    and these lines wait.

**The migration: C4's file, amended in place** (a dated note: "Amended <date> by L1-3b (P-88): a PMR, PMC or REMS
milestone is met and withdrawn by signature")
- The BEFORE guard loses its signed-type refusal for met and for withdrawal.
- **Two deferred constraint triggers** replace it, each reading the parent's type inline:
  - **met:** `AFTER UPDATE WHEN (NEW.status = 'met' AND OLD.status IS DISTINCT FROM 'met')`. For a signed type, it
    requires evidence (`MILESTONE_EVIDENCE_REQUIRED`) and a live signature that:
    - is on `commitment-milestone:<id>`;
    - has the basis `commitment-milestone-content-sha256`;
    - is by `met_recorded_by` and was written by this transaction (`created_at = LOCALTIMESTAMP`);
    - has an act naming the same sequence, Vault version, sha256 and `completedDate` as the row.

    Otherwise `MILESTONE_SIGNATURE_REQUIRED`.
  - **withdrawal:** `AFTER UPDATE WHEN (OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL)`. For a signed type,
    it requires a live signature that:
    - is on `commitment-milestone-withdrawal:<id>`;
    - has the basis `commitment-milestone-withdrawal-content-sha256`;
    - is by `withdrawn_by` and was written by this transaction (`created_at = LOCALTIMESTAMP`);
    - has a manifest `reason` equal to `withdrawal_reason`.
- No column, table or role is added, and no constraint is replaced.

**Server**
- **`ha-logic.ts`:** two recipes:
  - `commitment-milestone/v1`: `[recipe, milestoneId, rootCommitmentId, commitmentType, title, dueDate, completedDate,
    sequenceId, sequenceNumber, submissionId, vaultDocumentId, vaultSha256]`;
  - `commitment-milestone-withdrawal/v1`: `[recipe, milestoneId, rootCommitmentId, title, dueDate, metDigest | null,
    supersededMetSignatureId | null, reason]`.

  The withdrawn met signature is named in the digest and the act, not in a column: P-88's own rule for the correction,
  applied here too.
- **`fulfilment-record.ts`:** the two readers.
- **Part 11:** two `BINDING_BASIS` entries and two binders, `'commitment-milestone'` and
  `'commitment-milestone-withdrawal'`.
- **`commitment-fulfil-route.ts`:**
  - the meet and withdraw handlers branch on `fulfilmentRule`, as fulfil does;
  - signed acts go through steps 1–9, then `spendSigningAttempt`, then `signGovernedAct` with `contentBasis`;
  - `MILESTONE_SIGNED_TYPE` goes;
  - a signed met requires evidence and a date (`EVIDENCE_REQUIRED` and `FULFILMENT_DATE_REQUIRED`, with milestone
    wording).
- **`commitment-fulfilment.ts`:** `readSignatures` reads both prefixes; the met view and the withdrawal view carry their
  signature and verdict state.

**Client**
- The row offers the milestone acts on signed types too.
- The met and withdraw modes sign through `FulfilSignature`/`EsignModal`.
- The signed lines read "Signed by J Smith on … (responsibility).", with no number.

**Words on screen**
- **Signed met:**
  - governed: "Recording a milestone of a {PMR} as met is an electronic signature (21 CFR Part 11). Your signature binds
    the milestone, its date and what met it. A milestone recorded as met cannot be changed; one recorded in error is
    withdrawn."
  - date help: "Your signature binds this date, so it is required."
  - missing evidence: "Name the sequence or the document that met this milestone."
  - primary: "Sign milestone"
  - EsignModal action: "Record milestone as met"; target: "{PMR}: {title}"; meta: "Your signature binds this milestone,
    the date and what met it: met on {date}{, after its due date of {due}}; {sequence or version words}."
- **Signed withdraw:**
  - governed: "Withdrawing a milestone of a {PMR} is an electronic signature (21 CFR Part 11). The milestone stays on
    record, marked withdrawn, with what met it and its signature if it was met. A withdrawn milestone is counted neither
    as met nor as missed. If the step is still owed, add it again."
  - primary: "Sign withdrawal"
  - EsignModal meta: "Your signature records that this milestone is withdrawn{, taking back its record as met on
    {date}}. Your reason is recorded as why."
- **Verdicts:** "The signature on this milestone does not match the record as it stands." / "…has been withdrawn." /
  "This milestone names what met it, but no signature records it." (and the same three for a withdrawal).

**Red tests**
- **The DB type pin** is now: accepted only with the matching signature.
- **Schema-contract:** each signed clause, in C4's test, picked up by set order.
- **Real Postgres:**
  - on the project door, a signed met naming a sequence, then a signed withdrawal. The list keeps the met lines and
    shows the withdrawal signed, and both signatures are live;
  - on the organisation door: add gives 201 with `data.id` and a `create` on `commitment-milestone:`; met and withdraw
    give 201, with the ledger target and command; a terminal commitment gives 409; a bad date gives 400; the list's
    `viewer.milestoneActs` is true;
  - a PMR milestone can now be added on both doors, and the C2 signed-type case is inverted;
  - the launch gate gains the organisation door's two new paths.
- **Unit:** the binder prefixes, the route order (no attempt spent before step 9), and the client's signed modes.

**Mutations**
1. A signed met with no evidence accepted.
2. The act's date comparison dropped.
3. Sign on `regulatory-commitment:`.
4. The withdrawal reason comparison dropped.
5. The withdrawal binder answering the met digest.
6. One organisation-door line left out (its case goes 404 and red).
7. The organisation's add routed back to `governedMutation` (the ledger assertion goes red).

### C3m. S9-3, part 2: the letter's schedule recorded as milestones (re-plan step 27, after C6)

- **Plan:** S9
- **Completes:** `server/routes/c2c/agency-responses.ts`
- **Cites:** P-81, P-84.
- **Push:** D, after C6. Or later. The coordinator may instead move C3 and C3c whole to this push (§5).
- **Files:** `server/routes/c2c/agency-responses.ts`, `server/services/ha-interactions/ha-service.ts`, `ha-logic.ts`,
  tests. No client edit: C3c words its success from the server's `milestones`.
- **Migration:** none.

**Server**
- **`letterMilestonesOf(c)`** is new in `ha-logic.ts` and pure.
  - A dated item gives `{ title: label, dueDate: date }`.
  - An item whose date is not a date gives `{ title: "{label}: {when}", dueDate: null }`, which is never missed.
- In C3's transaction, after `createCommitmentTx`:
  - `addMilestoneTx` is called for each item of `letterMilestonesOf(c)`, on the proposal bound in C3's step 6. That is
    exactly the schedule the person was shown.
  - Since C6, `addMilestoneTx` admits a PMR or PMC.
- **The ledger, one row per record (finding 3).** Inside `run`, after each `addMilestoneTx`, it calls
  `recordGovernedAction(client, { command: 'create', target: 'commitment-milestone:<mid>', reason, payload: {
  commitmentId, title, dueDate, fromLetter: { communicationEventId, sourceId, ref } } })`.
  - The commitment's own `create` row stays the act's row, and its payload gains `milestoneIds`.
  - A letter-created milestone is therefore audited on its own target from its creation, as one added from the project
    is (C2). Its title and due date are in its own payload.
- **The success body's `milestones`** is `[{ id, title, dueDate }]`.

**Red tests**
- **Unit (`ha-logic.test.ts`), `letterMilestonesOf`:** dated; undated; order kept.
- **PGlite (`letter-commitment-proposals.pglite.test.ts`):** with the `4321-1` letter, recording `fromLetter` writes one
  commitment and two pending milestones (2026-09-30 and 2029-06-30) in one transaction.
- **Real Postgres under RLS (`commitment-fulfilment-evidence.dbtest.ts`):**
  - each letter-created milestone has exactly one `create` row on `commitment-milestone:<mid>`, in the same transaction
    as the commitment's `create` row, and its payload holds its title and due date;
  - the commitment's row names `milestoneIds`;
  - a later signed met (C6) on such a milestone then reads, by target, as creation followed by met.

**Mutations**
1. The milestones written after COMMIT.
2. An undated milestone given today's date.
3. The per-milestone ledger row dropped (the count goes red).

Which copy of the schedule is used cannot be mutated observably: C3's ambiguity refusal admits several proposals of one
ref only when their schedules are identical.

---

## 5. Named, with who does them (not P-88's steps)

| Item | Who | Package and Completes | When |
|---|---|---|---|
| "Commitments in this letter" (C3c above) | RIM, which holds S10 | S10, `client/src/concept2cure/v2/surfaces/LetterQuestionProposals.tsx` | pushed with C3 |
| **Owned commitments as due work** (P-81: "lands with its … owner and due date, and shows as due work") | RIM, which holds S9 | S9, `server/services/tasking/source-task.ts`. The ledger check passes (`S9-5 named`). | After C5, so that its reader is heads-only and keyed on the root from its first commit |
| `create_regulatory_commitment` refuses rather than writes (`AnaToolExecutor.ts`) | the S4 holder (filing types, `011Fyq…`), through the coordinator | S4 | their order |
| The commitment register report's milestone counts (`total`, `met`, `missed`, `withdrawn`), from R-1's one rule, with a DB test pinning the row rule and the report predicate equal | the Reporting lane (`011HLkY…`) | under an open S or F package | after C4 |
| `ana-capability-registry.ts:611-632`: the `extract-commitments` and `track-commitments` descriptions claim EU, device, outbound and owner, which `letter-commitments.ts` does not read | RIM (S9) or the S4 holder | S9, `server/services/ana-capability-registry.ts` | with the due-work item |
| The R1 inventory's false positives: `/milestones` with caller `CommitmentFulfilment.tsx`, and the letter routes with caller `ConversationThread.tsx` (`docs/evidence/DESIGN/R1/2026-11-01-inventory/inventory.json:23837-23845`, `:14912`, `:14928`) | tell `01QoxbL…` | — | with push B: C2 makes the project door's `/milestones` its first real caller, and C3c does the same for the letter routes. The organisation's `/milestones` (`ha-interactions.ts:314`) stays without a caller until C6 |

The owned-commitments-as-due-work item covers:
- an `owner_user_id` column on `regulatory_commitments`, column-only, on the
  `agency_communication_questions.owner_user_id` precedent (`20261018b:126`);
- `reconcileSourceTasks`, keyed `regulatory-commitment:<lineage root>`, so a successor keeps its task;
- `deadline-radar.ts` reading heads and missed milestones instead of the writerless `regulatory_obligations`.

The organisation door's owner route is **owed and not allocated**. `server/routes/ha-interactions.ts` is outside S9,
and P-88's L1 allocation covers only the signed acts and the correction. Organisation-level commitments get an owner
only when the coordinator or the founder allocates that line. It is not carried under L1 here.

**The coordinator note** (sent before push B, with the `migration-set.mjs` hold request):
1. **Push grouping.** C2, C2w, C2r (if Respond hosts the row), C3, C3c and C4 go in one push (B), so that a milestone
   that can be added can be met or withdrawn from the same deploy.
2. **Step 27's schedule write moves behind C6 (C3m).** Every letter commitment is a PMR or a PMC, and until C6 those
   milestones can be neither met nor withdrawn. Would the coordinator rather move C3 and C3c whole to push D? That
   would avoid commitments recorded from a letter between push B and push D having no milestone rows.
3. **Validation.** Should C1–C4's change control travel as C4v, a documents-only `Plan: L1` (row D4) commit in push B?
   Or should it wait for C5's L1 update? No plan-era commit has carried an S package's validation record yet.
4. **The organisation door in C6.** Re-plan step 36 lists `ha-interactions.ts` for the signed acts. The shared
   handlers then also serve that door's unsigned meeting commitments. Does this read as step 36's scope? If not,
   `ORG_DOOR.milestoneActs` stays false and those lines wait for an allocation.
5. **Respond (D3-4).** If D3-4 lands before push B, C2r converts Respond's host under S10, inside D3's layout,
   behaviour only. C5's lineage row key is the same kind of change.

---

## 6. Owed and not held (stated in each README and migration header)

- **A hard DELETE by the runtime role** of a commitment, a milestone or a successor (P-41, kept by P-88 point 2).
  - Deleting a successor makes the corrected fulfilment the head again (probe 2e).
  - The repo has a role-free pattern: a DELETE guard keyed on `pending_deletion` and platform scope
    (`migrations/20261018_company_document_designs.sql:35-50`). It is recorded as found, and not built.
- **A legacy fulfilled row that no correction names** can still be reopened by a raw UPDATE. No route does this, and
  P-41's legacy gap is named.
- **PMR, PMC and REMS milestones before C6.**
  - No app path writes one: `addMilestoneTx` refuses them on both doors, and the letter's schedule waits for C3m.
  - The database admits a pending one, because the purge fixture inserts one on a PMC. So R-9's first point is held by
    the routes only until C6.
  - A legacy one, written through the organisation's API before C2, is listed (C1). Past due, it reads missed, which is
    true. It cannot be met or withdrawn until C6, and fulfilling its commitment requires the person to confirm it.
  - The row offers no act and no "coming later" text.
- **A fulfilment's confirmation of unmet milestones is held by the routes,** not the database. The 409 is in
  `fulfillCommitmentTx`, under the commitment's lock, which every app path goes through. A raw UPDATE by the runtime
  role can still fulfil past it, as it can today.
- **Commitments recorded from a letter between push B and push D** carry the letter's basis and number, but no
  milestone rows. The schedule is in the letter and in the words the person recorded. From C6 on, a person adds them by
  hand ("Add milestone"). The coordinator may avoid this by moving C3 and C3c to push D (§5).
- **A commitment recorded by hand cannot be matched to the agency's number.** This covers one recorded from a question
  on the letter, or through the letter's hand path, with its own basis. The letter's proposal then reads unrecorded,
  and "Record" would make a second row. C3 reserves the ` · <ref>` marker for the server, so no hand basis can pose as
  one. C3c's form says so before recording. A match by anything other than the marker would be inference, so none is
  made.
- **Organisation-level commitments offer no milestone act until C6.** Their door's `viewer.milestoneActs` is false
  (R-8). The shipped `POST /api/ha-interactions/commitments/:id/milestones` stays as it is (re-plan step 26). It has no
  client caller, and from C2 on it refuses terminal, signed-type and badly dated input.
- **The `--accent-100` focus rings** on `.cc-q-hist > summary` and `.cc-fulfil-link` (`commcenter-v2.css:165`,
  `:175`) measure 2.96:1, below the 3:1 a focus indicator needs. They are owed to D6-2, the sheet's next holder.
- **`.cc-btn*` in `CompanyLegalCommunicationLinks.tsx`** (no package): tell the coordinator.
- **Waive and release acts:** the CHECK admits them and nothing writes them. Not decided.

---

## 7. Critique and resolution

| Alternative | Rejected because |
|---|---|
| A `regulatory_commitment_corrections` table (older D-1, D-5) | P-88 point 1. The gate refuses a new table, and five set-once columns on the successor hold the same facts. |
| Reopening the fulfilled row in place | It needs 20261019's freeze loosened. It would rewrite what a live signature binds (§11.70), and the probe shows the legacy-row variant already happens unguarded. |
| The NOLOGIN purger role and a `SECURITY DEFINER` door (older D-14) | P-88 point 2. The DELETE gap stays owed. |
| Storing `missed`, or narrowing 20260610's CHECK | P-88 point 3. Narrowing an inline CHECK is a constraint replacement that would fail every deploy on a stray row (RULE 1, corollary 1). |
| The correction file placed **below** C4's, with the lineage-aware guard written there by `CREATE OR REPLACE` | That makes two definitions of one function in two files. Placed below while still amending C4's file in place, the probe (1, 1b) shows plpgsql accepts the guard at CREATE and fails the first milestone write with 42703. That is a window on the first deploy. Above C4's entry, with C4's file amended in place, closes it. |
| The milestone guard checks no commitment state, leaving it to the routes, so C5 adds a second trigger and amends nothing | The database would not hold R-3 from S9-4 to L1-3a, and C6 amends C4's file anyway. |
| One helper that registers every commitment route on both doors | It builds paths at run time, which hides them from `ci:check-route-collisions` (its stated blind spot). Literal per-door lines are the shipped pattern (`ha-interactions.ts:311-312`, `agency-responses.ts:661-665`). |
| Converging the organisation's milestone route under `Plan: L1` in the S9 pushes (the first draft's C2o and C4o) | Withdrawn in revision (§7.1, finding 6). P-88 gives L1 only the signed acts and the correction. Re-plan step 26 says the organisation door "stays as it is". The divergent body is never read by the client, because the server says the organisation door answers no milestone act (`viewer.milestoneActs`) until C6 brings its lines in. |
| The client deciding, from a list of its own, which doors have the route | That would be a temporary client conditional. The server states it per door (`viewer.milestoneActs`), and the row reads that, as it reads `canWrite`. |
| `aria-disabled` act buttons for a person who cannot write | D0 does not style `aria-disabled` (`app-v2.css:206` styles `:disabled`), so the button would look live and do nothing. The shipped precedent hides write acts and says why once (`AgencyResponses.tsx:646`). |
| A `viewer` on every row | It repeats one value per row. The payload carries the door's viewer, and the host, already edited in C2w, passes it on. |
| A `correction-options` GET route | The row carries the rule and the fulfilment being corrected, and the payload carries the viewer. The POST refuses again before any password attempt is spent. |
| A `withdrawal_superseded_signature_id` column (older D-13) | It would be a sixth kind of new column. P-88 put the correction's superseded signature in the digest and the act, and the milestone withdrawal does the same. |
| One ledger row for an unsigned correction, on the successor only (the first draft) | Withdrawn in revision (§7.1, finding 5). The signed path already writes the pair (`sign` on the correction target, `create` on the successor). The shipped fulfilment keys both of its forms on one target. A read by target would otherwise find no unsigned correction. Both paths now write the same two targets. |
| Copying or re-parenting milestones to the successor | A met milestone cannot be inserted as met (R-2), so a copy fragments the record. Re-parenting rewrites history. D-6 (the root) is what P-88 confirmed. |
| A database comparison of the act's `supersededSignatureId` | The binder reads it from the database on the signing transaction, in the same read `run` makes, so the digest already binds it. A unit test pins the act and the digest equal. |
| The e-signature register gaining `record_corrected_by` (older D-2) | A correction is its own signature row on its own target, so the register is not silent. It would add a concept to another lane's query. |
| "(open; its fulfilment was corrected)" on the letter's question line | Heads-only already makes the line true. The correction is shown in the row's History, where the person acts. |
| Add milestone in the dialog's own panel instead of `C2CForm` | The re-plan names `C2CForm`, the tab records a commitment through it, and only writers are offered it, so there is nothing for it to refuse before typing. |
| Renaming `CommitmentFulfilDialog` | That is churn in two hosts (Communication, and D3-4's Respond) for a name. |
| Any `.cc-*` rule, ring fix or new class | `commcenter-v2.css` is not an S9 path and D6-2 holds it next. The existing classes suffice. |
| The signed milestone acts (C6) moved before S9-3, to close the PMR window | The re-plan's order puts step 36 last, and that order binds. The window is closed instead by never writing a signed-type milestone before C6 (R-9). The one part of step 27 that would write one moves behind C6 (C3m). The coordinator may move C3 and C3c whole (§5). |
| Letting C4's guard admit a met on a terminal head, dated on or before its fulfilment (the critique's alternative) | It would change a milestone after its commitment was closed, and after a signature on that fulfilment bound the record as it stood. That breaks R-3. Requiring the person to confirm what the fulfilment leaves unmet keeps the closed record closed. |
| The body's basis accepted with `fromLetter` | The "recorded" match reads the basis, so a free basis would let the same ref be recorded twice. The server writes the letter's, and from C3 on the hand paths may not write the marker. |
| `fromLetter: { ref }` alone | Withdrawn in revision (§7.1, finding 2). The milestones would be what the server re-split at POST time, not what the person saw. A ref in two sources would be undefined. Re-plan step 37's precedent for questions binds `{ sourceId, start, end }`. |
| A sha256 of the proposal as the GET returned it, in place of its fields | Equivalent in what it binds, but a mismatch could not say which part changed. The fields are short, and the server compares them directly. |
| AnA's `facts.commitments` gaining milestones | Not needed by the decision. AnA's portfolio tool reads heads with no edit. |
| `deleted_at IS NULL` added in C3c | Nothing in the app soft-deletes a commitment. C5's heads predicate adds it where it matters. |
| A second "Record a commitment" drawer for the letter's proposals (the first draft's C3c) | Withdrawn in revision (§7.1, finding 7). `AgencyResponses.tsx` already has one (`:836-855`). The letter's proposals use it as a variant, as `LetterQuestionProposals` reuses the Record-a-question form. |
| Matching a hand-recorded commitment to a proposal by type, words or date | That is inference, and the register would then claim a match the agency's number does not make. The gap is named (§6), and the form says so. |
| C5 split into server and client commits | The re-plan defines step 36 as two commits. C5 may be split in one push if a reviewer prefers. |

### 7.1 Review findings, 2026-11-02, and their resolution

Nine findings stood after verification. Each was checked again against the code at `042293ade`. All nine are applied.
Where a part of a proposed fix was not taken, the code that decides it is named.

**1. Milestones frozen unmet by a fulfilment, and PMR milestones nobody can change** (major, correctness-part11).
Applied.
- *Confirmed:*
  - `fulfillCommitmentTx` (`ha-service.ts:330-362`) never reads `commitment_milestones`, and neither does AnA's tool
    (`AnaToolExecutor.ts:13596`, origin `:13502`).
  - C4's guard freezes milestones on a terminal parent.
  - Every letter commitment is a PMR or PMC (`letter-commitments.ts:31`).
- *Fix 1:* C2 to C4 go in one push, B (§0), with the re-plan's commit order kept.
- *Fix 2:* `addMilestoneTx` refuses a signed type until C6. That covers both doors with no edit to
  `ha-interactions.ts`, because its `fail()` maps `INVALID_STATE` to 409. The letter's schedule write moves behind C6
  as C3m. The alternative, moving C6 before C3, is put to the coordinator, because the re-plan's order binds (§5).
- *Fix 3:* taken as the confirmation. A fulfilment must name each unmet milestone, re-read under the commitment's lock
  (`MILESTONES_UNMET`, 409), and AnA refuses because it cannot name them (R-9, C2). Rejected: the alternative of
  admitting a met on a terminal head. It would change a closed record after a signature bound it (R-3; §7 table).
- *Fix 4:* the DB tests in C2 ("fulfilling never freezes a milestone silently").
- *Overstatement noted:* "every PMR" should read "every PMR with milestones fulfilled inside the window". It does not
  change the fix.

**2. C3 wrote titles and dates the person never saw, bound only by `ref`** (major, correctness-part11). Applied.
- *What `fromLetter` now carries:* `{ sourceId, ref, start, end, milestones: [{ label, when }] }`.
- *Under the letter lock, after the bound source is read `FOR SHARE`, the server refuses:*
  - a changed proposal (`LETTER_TEXT_CHANGED`);
  - a ref whose sources disagree (`LETTER_COMMITMENT_AMBIGUOUS`).
- *Tests:* a rewritten text, a soft-deleted source and a two-source ambiguity each write nothing.
- *Fix 4, adjusted:* the by-hand paths may not write the server's ` · <ref>` marker at all, rather than only "for a ref
  this letter proposes". This needs no read of the letter's sources on the hand path, and it covers the question-level
  creator too (finding 7).
- *Overstatement noted:* no current path re-reads a source's text (`data-room-processing-state.ts:106-110`). The
  changes that can happen are a source becoming readable or being soft-deleted, and the tests use those and a raw
  rewrite.

**3. Letter-created milestones had no ledger row of their own** (major, correctness-part11). Applied in C3m.
- One `recordGovernedAction` per milestone inside `run`, `create` on `commitment-milestone:<mid>`, with its title, due
  date and source.
- The commitment's row keeps `milestoneIds`.
- A DB test asserts exactly one creation row per milestone in the same transaction, and a mutation drops it.
- *Overstatement noted:* the commitment's row did name the ids. The audit gap was the milestone's own target and its
  values (`signedAuditExport.ts:399-400` reads by target).

**4. After C5 the guard's lock is on the root, not the head** (minor, correctness-part11). Applied in C5.
- The amended guard reads the head `FOR SHARE`, after the root.
- The no-deadlock reasoning and the fail-closed case are stated there.
- A corrected-lineage concurrent DB test is added, and mutation 15 extends C4's mutation 12.

**5. The unsigned correction was keyed differently from the signed one** (minor, correctness-part11). Applied in C5.
- `governedRequestWrite`'s row is `create` on `regulatory-commitment-correction:<id>`.
- `run` writes `create` on the successor.
- The evidence dbtest pins one row on each target for both paths, and the §7 table row that rejected this is
  withdrawn.

**6. C2o and C4o put S9's unsigned work under `Plan: L1`** (major, rules-scope). Applied.
- *Dropped:* C2o and C4o. `ha-interactions.ts` is unedited through S9, as step 26 says.
- *The organisation door through S9:* the server states per door whether milestone acts are answered
  (`CommitmentDoor.milestoneActs`, optional so `ORG_DOOR` needs no edit, and `viewer.milestoneActs`). The organisation
  door's lines come in C6, which step 36 lists the file for.
- *The owner route:* the "one L1 line" is removed from §5, and it is named as owed and not allocated.
- *Validation:* C4v, a documents-only L1 (D4) commit, is put to the coordinator. Without agreement, C5 carries it.
- *Overstatements noted:*
  - re-plan §4 does approve carrying `ha-interactions.ts` under L1 for steps 2, 4, 29, 30 and 36;
  - the first draft did give a reason for C2o.

  Neither makes C2o or C4o an allocation P-88 or the re-plan made.

**7. C3c added a second "Record a commitment" drawer, and the inventory missed the first** (major, rules-scope).
Applied.
- *Inventory:* §3.2 and §3.3 now name `AgencyResponses.tsx:334-337`, `:399`, `:445-467` and `:836-855`, and the
  question-level creator `agency-responses.ts:595-624`.
- *C3c:* it extends the existing `committing` form with a letter variant. It mounts no second drawer, and a test
  asserts there is one drawer.
- *The duplicate blind spot:* the marker is reserved on both hand paths (C3), the remaining inference gap is named in
  §6, and the form says so.
- *Qualification accepted:* a second `C2CForm` config is not clearly a new RULE 4 panel. The fix is taken for RULE 3
  and zero duplication.

**8. C4 deleted `onFulfil` assuming one host** (minor, rules-scope). Applied.
- *Confirmed:*
  - `onFulfil` is required today (`CommitmentRow.tsx:231`);
  - D3-4 is specified to host the row on Respond (`D3.md:425-428`);
  - `ProjectRespond.tsx` is outside S9 (`ledger-check-rev.out.txt`);
  - a stale host fails `ci:pushed-typecheck`.
- *C4:* it deletes `onFulfil` only after a grep finds no other host. Otherwise the prop stays as an optional alias.
- *C2r (S10):* it converts Respond in push B when Respond already hosts the row, sent to the coordinator first.
- *C5:* it carries the lineage key to Respond in the same way.

**9. P-88 was cited on commits that are not P-88 steps** (minor, rules-scope). Applied. §1's table cites P-88 only
where a commit implements one of its points.
- *As proposed:* C3, C3c and C3m cite P-81 and P-84, and C2w and C2r cite nothing.
- *Where the proposed fix was amended:*
  - C1 also cites P-88's S9 paragraph, because listing is in it;
  - C4 cites point 3 and the S9 paragraph, not point 4. Point 4 decides where the signed acts go (C6), not C4's
    refusal of them.

---

## 8. Validation, gates and evidence

**Validation.** It is carried under L1, because `docs/validation/**` is outside every S package's paths:
- C1 to C4, C2w, C3c and C2r are recorded by C4v in push B if the coordinator agrees, documents only (row D4).
  Otherwise C5's update records them.
- C5 records the correction.
- C6 records the signed milestone acts and the organisation door's lines, and C3m's schedule write in the same
  revision.
- Numbers are re-read at each commit. At `08debf4e0` the next free are URS-PROJ-015, OQ-PROJ-20, RA-001's next
  revision, and the VSR addendum after "D2 A2.10 change impact (2026-10-26)".

**Evidence directories**
- `docs/evidence/D2-COMMITMENT-MILESTONES/<date>/` (C1 to C4, with C2w, C2r and C3c) and `<date>-signed/` (C6, C3m);
- `docs/evidence/D2-COMMITMENT-CORRECTION/<date>/` (C5).

Each README holds:
- "What already exists";
- the red output and each mutation's output;
- the gate output;
- the "opened and used in the running app" record:
  - push B: add, fulfil with an unmet milestone confirmed, met and withdraw on a project meeting commitment;
    "Commitments in this letter" recorded through the one form; Respond too, if C2r is in;
  - C5;
  - C6: the signed acts on both doors;
- for C4, the `onFulfil` host grep's output.

## Coordinator rulings, 2026-11-02 01:19 (binding; they override anything above)

1. **C3 moves whole to after C6.** This covers C3 (the letter's commitment recorded with its parsed schedule), C3m and
   C3c (the letter variant of the existing drawer in `AgencyResponses.tsx`). A split leaves a parsed schedule nobody can
   act on. New order: C1, C2, C2w (with C2r), C4, C5, C6, then C3 with C3m and C3c.
2. **L7 behaviour edits are approved:**
   - `CommunicationCenter.tsx`: pass the row's act and viewer to the one dialog, and key rows by lineage root.
   - `AgencyResponses.tsx`: the letter variant of the existing drawer.

   D6-2 merges onto these.
3. **D3-4's Respond host takes the same contract** (onAct, act, viewer, lineage key). D3-4 has not started, so convert
   `ProjectRespond.tsx` in this push, behaviour only.
4. **The Reporting session (011HLkY) is active.** Carry the `research-compliance-report-providers.ts` heads-only count
   in the correction commit (C5). Tell 011HLkY the file and the commit hash when it lands.
5. **`governed-target-binders.ts` and `signature-persistence.ts` are free.** The coordinator records the hold when C5
   starts.
6. **`docs/validation/**` updates ride in C6 under `Plan: L1`,** if `ci:one-design-plan` admits them (L1's paths are
   `**`).
7. **`migration-set.mjs`** follows the same queue as P-86 (one holder at a time; the Reporting session's P-91 is also
   queued).
