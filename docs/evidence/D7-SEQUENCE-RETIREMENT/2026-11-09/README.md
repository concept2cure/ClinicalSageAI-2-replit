# P-86 C1: a sequence never filed is retired by its own signed act, and the database admits no other removal (row D7, 2026-11-09)

## The decision, and the rulings that bind this commit

- **P-86** (founder, 2026-11-01, `docs/LAUNCH_DEFINITION_OF_DONE.md`): a sequence that was never filed "may be
  retired by a signed, audited act, which frees its number, only while no production send is bound to it and it is
  not filed. The act reuses the filed-elsewhere baseline's existing removal of drafts. It goes under launch row D7
  (`Plan: L1`)."
- **P-108 item 2(a)** (founder, 2026-11-08): "A production attempt that records nothing reached FDA … is not a 'bound
  production send', so the sequence can be retired by P-86's signed act."
- **The coordinating session's rulings of 2026-11-02** (appended to the design): no new module; the act lives in an
  existing file of `server/services/submission-service/`; the holds; the `migration-set.mjs` turn.
- **The coordinating session's rulings of 2026-11-09:**
  - C1's scope as re-cut: the act lives in `filed-sequence-baseline.ts`.
  - Check 3, worded exactly as below.
  - Check 3b fails closed, with its own sentence.
  - The sequence's own signing chain (D2), not `signGovernedAct`.
  - All of the design's narrowings are kept.
  - C1b is owed, not built.
  - `Plan: L1`, with one progress line in `ONE_DESIGN_PLAN.md` §3a.
- **The design:** `docs/evidence/RIM/2026-11-08-designs/p86-retire-unfiled-sequence.design.md`, with its re-anchor
  addendum (`92c984c2f`).

## What already exists (RULE 3)

- **The removal this act reuses.** The filed-elsewhere declaration's removal of the empty drafts it replaces
  (`filed-sequence-baseline.ts`, `declareFiledBaseline`). It was a bare `UPDATE … SET deleted_at = NOW()`. It is now
  `liveSetRemoval`, the one statement both acts run.
- **The sequence's own signing chain:**
  - Gate 1 (`governedSignatureVerdict`) with its `payloadRefusal` hook;
  - `INTENT_MEANING_REFUSAL`;
  - `independentSignerRefusal`;
  - `recheckUnderSequenceLock`;
  - `voidingSignatureOnRefusal` (P-23);
  - `applySequenceChangeWithAudit`.

  These are the templates the Shadow Review waiver (P-34) and finding disposition (P-35) use on the same target.
  The signer's reason is read by `dispositionSignatureReason`.
- **What a send leaves behind** (F1 slices 1 and 2):
  - each sequence transmit is bound (`metadata.dispatchBinding`) and names its environment;
  - a production send refused before the wire writes a chained `TRANSMIT_BLOCKED` with `transmitted: false`
    (`recordBlockedSequenceTransmit`).
- **Freeing the number.** Step 4 (repair A, `2c0b4c8fe`): `createSequence` refuses only a **live** holder of a number.
- **Readers of a removed sequence.** Repair B (`cec19b461`) and `e4992a733` already read live sequences only, so
  D8 needs no new filter.
- **The precedent for the guard** is `migrations/20261029g_submission_filed_baselines.sql`: a deferred constraint
  trigger that admits a row only with its signature from the same transaction.
- **No removal of a sequence existed** in code apart from the baseline's (searched: `update(ectdSequences)` and every
  `UPDATE ectd_sequences … deleted_at` in `server/`, `scripts/` and `migrations/`).

## The change

### The act (`retireSequence`, `submission-service.ts`)

1. **The live sequence.** A sequence already retired is answered: "Sequence NNNN was retired on YYYY-MM-DD UTC by
   NAME. Nothing was changed."
2. **Gate 1** with intent `retire`:
   - the meaning is `responsibility` and only it;
   - the payload carries `notFiledElsewhere: true` and the statement, word for word:
     > Sequence NNNN has not been filed with the agency by any route: not by a send from this sequence, not as a
     > package sent from this platform, not from an export, and not by courier or any other route.
3. **Separation of duties:** the sequence's creator never retires it.
4. **The signature's own reason.** One with no reason is refused.
5. **The facts**, judged before the lock and again under the sequence lock on the transaction:

   | Check | What keeps the sequence | Sentence (409 `SEQUENCE_NOT_RETIRABLE`) |
   |---|---|---|
   | 2a | Filed: `sent` or `acknowledged` (`isFiledDispatchStatus`) | "Sequence NNNN is on file with the agency (dispatch status 'sent'), so it cannot be retired. A correction is a new sequence numbered after it." |
   | 2b | A send in flight | "A send of sequence NNNN is in flight and not yet settled, so it cannot be retired now. …" |
   | 3 | A non-staging transmittal bound to it, unless a chained `TRANSMIT_BLOCKED` with `transmitted: false` names that attempt's signature (P-108 2(a)). A missing environment counts as production. A blocked row that names no signature proves nothing. When P-92's "released as not received" lands, checks 3 and 4 exclude it too (said in the code). | "A send of sequence NNNN to the agency's production environment is recorded on YYYY-MM-DD UTC, so it cannot be retired. …" (or "… with no environment named, so it is treated as a production send …") |
   | 4 | An `ECTD_TRANSMITTED` row outside staging (sends before bindings) | the same |
   | 3b | Its number sent to production as a package for the same application (program or application number, same region). This fails closed. | "Sequence NNNN was sent to the agency's production gateway in a package, and nothing records that the agency did not receive it, so it is not retired." |
   | 6 | IND records filed in it | "1 IND record is recorded as filed in sequence NNNN (an amendment). Retiring it would leave them filed in a sequence the agency never received, so it is not offered. Returning them to draft is not available yet." |
   | 5 | A live later sequence of the same submission and region. One that is kept is named with its reason; otherwise the highest is retired first. | "Sequence MMMM, numbered after NNNN, is kept (it is on file with the agency), so NNNN's number cannot be freed. …" / "… is still in use. Retire MMMM first: a number is freed only from the highest down." |
   | 5b | A filed twin of the same number whose record is read from compiles, by the filed fold's own read | "Another sequence NNNN of this submission is on file with the agency, and what it filed is read from the compiles numbered NNNN. …" |

   A read that fails answers `INVALID_STATE`: "Whether sequence NNNN can be retired could not be checked, so it was
   not retired. Try again." It is never a pass.
6. **The removal and its record, in one transaction:**
   - the instant is read after the locks (`clock_timestamp()`, to the millisecond);
   - `liveSetRemoval` writes it to `deleted_at`;
   - `writeChainedAuditRow` seals it as `occurred_at` (new optional `occurredAt`) on one `ECTD_SEQUENCE_RETIRED` row;
   - that row carries the reason in its column and in its details, with the signature, the meaning, the statement
     signed, the leaf-manifest digest, the staging transmittal ids and whether the number was freed;
   - the answer's `retiredAt` is the same instant.
7. **The signature is spent.** `ECTD_SEQUENCE_RETIRED` joins the spent list, so a second request is answered "already
   retired" and never voids the signature that did the act. A refusal voids the signature it was given (P-23).

### The database's rule (`migrations/20261109_ectd_sequence_removal_guard.sql`)

This is triggers only, and replay-safe (Rule 1).
- **G1, at COMMIT:** a removal stands only with one of two records:
  - (a) the `ECTD_SEQUENCE_RETIRED` row naming an executed `retire` sign action, whose live signature carries the
    meaning `responsibility` and was made by the row's actor;
  - (b) the filed-elsewhere declaration's signature, written by this transaction, naming the removed number.
- **G2, before update:**
  - a removed row is never changed or restored;
  - `sent`, `acknowledged` and `transmitting` are never removed;
  - a removal changes nothing else.
- **In the set:** directly after `20261108_report_bundle_register.sql`, above `UUID_TENANT_ISOLATION_NONPUBLIC`
  (`ci:migration-set-order` OK).

### Tests and fixtures

- **`_freeze-gate-fixture.ts`** gains the real table's `signer_id`, `signature_meaning`, `signature_type` and
  `created_at`. Its `sign()` records the signer and the meaning. This was done first, with no assertion changed.
  - `00-fixture/before.txt` and `after.txt` show its users: 84 = 84.
  - `refused-step-voids-signature.pglite.test.ts` adds the same columns for the real sign route, now with
    `IF NOT EXISTS`.
- **T15, the bare soft-deletes on real PostgreSQL**, now run with triggers off for their own transaction, as
  `review-route-guard.dbtest.ts` lays a row:
  - `tests/db/vault-where-used.dbtest.ts` (the removed sequence it lays);
  - `tests/db/sequence-number-once.dbtest.ts`, both the removed-0000 case and the racing removal.

  Without this, the guard would refuse each of them at COMMIT.
- **`server/db/pglite-harness.ts`** gains `applySequenceRemovalGuard`, applied from disk, opt-in.

## Proof

| File | What it shows |
|---|---|
| `00-fixture/before.txt`, `after.txt` | the fixture widened with no assertion changed: its six PGlite users, 84 pass before and after |
| `01-red.txt` | at `785f56d73`, with the tests in place: the rules, the act and the guard do not exist (9 unit cases fail; both PGlite files fail to load) |
| `02-green.txt` | the submission-service, ectd, submission-gateways, audit, MCP, AnA submission-tool, submissions-route and IND-lifecycle suites, and the filed-elsewhere baseline's route test: 3846 pass in 310 files, none fail |
| `03-mutations/` | 28 mutations, each red on its own case, each file restored byte for byte |
| `04-real-postgres/` | added after C1 landed (below): T13 on two real connections, the three dbtests on a database provisioned as CI provisions it, and five mutations red there |

The tests:
- `sequence-retirement.pglite.test.ts`, 21 cases, the real act with the guard applied:
  - retired with staging sends only, the row otherwise unchanged, and `getSequence` then answers NOT_FOUND;
  - one instant across `retiredAt`, `deleted_at` and the sealed `occurred_at`;
  - a legacy duplicate is retired with `numberFreed: false`;
  - a second request is answered "already retired", and its signature stays in force;
  - every check's refusal, with the row left live and no record written;
  - P-108 2(a): an attempt proven blocked is admitted; a blocked row that names no signature is not;
  - 3b admits a package sent to staging, one of another application, and one of another region;
  - Gate 1: wrong intent, wrong meaning, missing flag, missing statement, a statement off by one character, the
    creator, and no reason;
  - P-23: the void, and the void signature refused afterwards;
  - an unreadable fact gives "could not be checked";
  - the recheck under the lock refuses a production send recorded after the first read.
- `sequence-removal-guard.pglite.test.ts`, 11 cases:
  - G1: a bare removal refused; the retirement record admitted; records naming another act, another meaning or
    another actor refused; the baseline's removal admitted;
  - G2: restoring or editing a removed row refused; `sent`, `acknowledged` and `transmitting` refused even with a
    record; a removal that changes the row refused;
  - the migration's status list equals `[...FILED_DISPATCH_STATUSES, 'transmitting']`;
  - replay leaves the two triggers, still guarding.
- `sequence-retirement-rules.test.ts`, 9 cases:
  - the refusals' order and wording;
  - the statement;
  - the payload and the meaning;
  - an unreadable audit instant refused before any query.

**Gates:**
- `ci:migration-set-order`, `ci:migration-guard-order`, `ci:migration-drop-safety`, `ci:migration-deploy-path`;
- `ci:json-operator-types`, `ci:runtime-ddl`, `ci:sql-interpolation` (the action name is a parameter);
- `ci:discarded-audit-write`, `ci:sign-ceremony`.

All OK. ESLint: no file gained a warning (`submission-service.ts` 7 = 7, `auditService.ts` 5 = 5, `pglite-harness.ts`
1 = 1, the rest 0).

## Owed, and named (not done here)

- **C1b:** returning IND records filed in a sequence to draft. Owed, not built (the coordinating session, flag 4). It
  is listed in D7's open items under RIM's row.
- **C2** (the door) and **C3** (the screen) landed together after D7-A2, as the coordinating session ruled. See the two
  sections below.
- **Correction, after C1 landed.** This section said the real-PostgreSQL cases were not run "because this container
  has no PostgreSQL server". That was wrong twice: a PostgreSQL 16 server was running here, and T13's file had not been
  written at all. Both are closed in `04-real-postgres/`, in a commit of their own:
  - **T13** (`sequence-retirement-lock.pg.test.ts`, on `freeze-gate-row-lock.pg.test.ts`'s pattern; skipped without
    `TEST_DATABASE_URL`, run in CI's sharded job, which sets it). The real `retireSequence` on two connections:
    - a creation of 0001 holding the submission first: the retirement of 0000 waits, then refuses, naming 0001;
    - a retirement held 500 ms at its sequence row: `deleted_at` equals the audit row's `occurred_at`, both at least
      500 ms after the wait was seen; and a creation of the freed 0000 waits for it, then takes the number.

    The creation side replays `createSequence`'s transaction, because `createSequence` reads
    `public.submission_filed_baselines` by its qualified name and the suite works in a schema of its own.
    `T13-green.txt`; three repeated runs green; no schema left behind. Four mutations, each red on its own case
    (`mutation-T13-M1` to `M4`): the removal stamped `NOW()`, the audit row on its own clock, no refusal under the
    lock, and the submission not locked (both cases).
  - **The three dbtests**, on a throwaway database provisioned as CI's job does (`install-fresh.mjs`, then
    `deploy-migrate.mjs`, which applied this migration; G1 is deferrable and initially deferred there):
    `vault-where-used`, `sequence-number-once` and `review-route-guard`, 33 of 33 (`dbtests-green.txt`). With the
    removed-0000 row laid with triggers on, the guard refuses it at COMMIT with `SEQUENCE_REMOVAL_UNRECORDED`
    (`mutation-T15-bare-removal-with-triggers-on.txt`): T15's fixture change is what lets those tests lay a removed row.
- **T12, the baseline's own route test under the guard.** Case (b) is proven at SQL level by the guard test's
  "admits the filed-elsewhere declaration's removal" case. The route test (`submission-filed-baseline.pglite.test.ts`)
  is the baseline lane's file and was not edited.

---

## C2: the door, the precheck, MCP and the verb pin (`05-door/`)

Built and held unpushed on 2026-11-09 by the coordinating session's ruling (b), "no door without its screen". It was
re-applied on the trunk after D7-A2 and re-run there.

### What already exists (RULE 3)

- **The governed precheck:**
  - `POST /api/submissions/sequences/:seqId/governed-precheck` answers each governed step's gates before anyone signs
    (`precheckGovernedStep`). It already served freeze, dispatch, transmit, the waiver and the disposition.
  - `precheckGovernedStep` is at complexity 15. So `retire` is answered at the route by its own function, not by
    another branch there.
- **The act and its rules** are C1's: `retireSequence`, `retirementRefusal`, `retirementStatement` and
  `retirementPayloadRefusal`.
- **The signer check** is the sequence spine's `signerIndependenceOf`, already read by the Dispatch tab.
- **MCP:** `c2c_get_sequence_status` and `c2c_list_sequences` (`server/mcp/tools/catalog.ts`) read live sequences
  only. A retired id answered "not found".
- **The verb pin** is `GOVERNED_VERB_PATTERN` (`shared/navigation/surface-actions.ts`). It keeps a governed act out of
  AnA's hands on a screen.

### The change

- **The door:** `POST /api/submissions/sequences/:seqId/retire { signatureActionId }`, inside the existing submissions
  router (`requireRole(AUTHOR)`, limiter), calling C1's `retireSequence`.
- **The precheck:** `retire` joins its step enum. `precheckSequenceRetirement` answers:
  - what keeps the sequence, in the act's own words, and then whether this person may sign. The creator gets "You
    created sequence NNNN, so you cannot sign its retirement. Another person with signing authority signs it."
    Unresolved and unverified creators each get their own true sentence;
  - the test sends it keeps (by UTC day), and whether the number is freed;
  - the statement, word for word.

  It changes nothing.
- **A duplicate number's refusal** (`createSequence`) now names the way out: "A sequence never sent to the agency's
  production environment can be retired from its Dispatch tab, which frees its number. Nothing was created."
- **MCP:** a retired id is answered as retired, with when, by whom, the meaning and the reason. A removed id with no
  retirement is "not in use; no retirement is recorded". A failed read of that record is a refusal, never "not in
  use". The list says it lists sequences in use.
- **The verb pin:** `retire` is a governed verb. `ana-cannot-retire-sequence.test.ts` shows no AnA tool reaches the
  door.

### Proof

| File | What it shows |
|---|---|
| `01-red.txt` | 21 cases failing, 52 passing in the seven suites, before the code |
| `02-green-seven-suites.txt` | 73 of 73, re-run on the trunk after D7-A2 |
| `03-green-broad.txt` | `server/services/submission-service`, `server/mcp`, `shared/navigation`, the submissions route tests and the AnA case: 802 pass and 4 skip (the real-PostgreSQL files without `TEST_DATABASE_URL`), in 81 files |
| `04-T7-green-real-postgres.txt` | `tests/db/sequence-number-once.dbtest.ts` on the deploy-shaped database: 4 of 4, T7 among them (the duplicate's refusal names retirement) |
| `05-dbtests-with-c2.txt` | the three dbtests with C2 present, 33 of 33 |
| `mutations/` | ten mutations, each red on its own case, each file restored: M1 `retire` not a precheck step; M2 no creator branch; M3 MCP's retired branch dropped; M4 `retire` not a governed verb; M5 AnA reaches the act; M6 the precheck omits the statement; M7 an unreadable record read as "not in use"; M8 an unresolved creator called authorship; M9 the signer judged before what keeps the sequence; M10 the duplicate's sentence dropped (T7, real PostgreSQL) |

ESLint: no file gained a warning (`submission-service.ts` 7 = 7, `submissions.ts` 1 = 1, `surface-actions.ts` 1 = 1,
`catalog.ts` and `filed-sequence-baseline.ts` 0). The new test files have none.

## C3: on screen, at the foot of the Dispatch tab (`06-screen/`)

### What already exists (RULE 3)

- **The Dispatch tab:**
  - `DispatchWorkspace` (`SubmissionSeqWorkspaces.tsx`), a `.pj-sec` since D7-A2, with the one verdict;
  - its disclosure primitive `.pj-more` and `btn ghost small` (`app-v2.css`);
  - `blockerForDisplay`, which keeps record keys off the page.
- **The one governed chain:** `SubmissionCenter.tsx`:
  - `precheckRefusal` → `requestGoverned` → `runGoverned`, whose `ownAct` table already ran transmit, the waiver and
    the disposition after the signature;
  - the one `EsignModal` mount. `EsignModal` already takes `meanings`, `renderMeaningDetails` and `signedRows`. It
    renders in place, inside the v2 scope, so v2's `.tl-spec-k` and `.sc-mb` apply in it.
- **The transmissions list:** `DossierTransmissions` marked "(this one)" by the **number** a transmittal carried. Each
  send since F1 slice 1 also records `metadata.dispatchBinding.sequenceId`, and the list route returns the whole
  `metadata`.
- **Nothing on screen retired a sequence before this.** The searches: "retire", "Retire sequence", `retire` in
  `GovernedKind`, `/retire` callers in `client/`.

### The change

- **`SubmissionSeqWorkspaces.tsx`:**
  - `GovernedKind` gains `retire`, and `GovernedPrecheck` gains `retirement`. `retirementOf` accepts an answer only
    with its statement.
  - **`RetireSequence`:** `<details className="pj-more" data-testid="retire-sequence">`, "Retire sequence NNNN…". It is
    the last block of the Dispatch section, **outside the readiness read**, and closed by default.
    - Each open asks the precheck again, and no answer is kept across a close.
    - A toggle event that does not change the state asks nothing. jsdom fires one when `open` is set, and a browser
      may too.
  - **The disclosure's states:**
    - S1: "Checking whether sequence NNNN can be retired…".
    - S2 offered: what retiring does; the test sends it keeps ("its test send of YYYY-MM-DD UTC", "its N test sends",
      or nothing); whether the number becomes free; "Retirement cannot be undone."; then `btn ghost small` "Retire
      sequence NNNN".
    - S3 and S4: the server's sentence as a note, with record keys in words, and no button.
    - S5: "Whether sequence NNNN can be retired could not be checked. Close this and open it again to retry." It never
      says "cannot be retired".
  - **The button** asks once more. Only a cleared answer opens the signature. A refusal or an unreadable answer at the
    click is said inside the disclosure, focused, ending "Nothing was signed."
  - **`DossierTransmissions`** marks each row by its binding:
    - "(this one)";
    - "(another sequence numbered NNNN)";
    - an unbound row of the same number: "(this number)".
  - **The coordinating session's request of 2026-11-09:** Validation's "Explain the findings (AI)" goes from
    `sp-primary` to `btn ghost small`, keeping its spark. The work area now has one orange fill, the header's (D0 §7
    check 2).
- **`SubmissionCenter.tsx`:**
  - `GOVERNED_LABEL.retire` "Retirement", `GOVERNED_PAST.retire` "retired".
  - `precheckAnswer` carries the precheck's statement into the flow. A cleared `retire` answer without one opens no
    dialog: "Whether the server would accept this could not be checked — the answer carried no statement to sign."
  - The signature's payload adds `notFiledElsewhere: true` and the server's `statement`. The client holds no copy of
    the text.
  - `runRetire` posts the act. Success is only `retired === true` for this sequence id, and the sequences are read
    again whatever the answer. The notice reads "Sequence NNNN is retired, signed by NAME (responsibility). Its number
    is free: start sequence NNNN again from the Sequences tab." (or "Another sequence NNNN is in use, so the number
    stays taken."). There is **no signature id and no record key**.
  - **The signing words** move into `governedSigning` / `retirementSigning`, so the one mount spreads them. The other
    kinds' words are unchanged. The retire branch has:
    - "Retire sequence";
    - the target line "FDA (US) · takes the sequence out of use; nothing is sent to the agency; cannot be undone",
      with no record key;
    - Responsibility only;
    - "By signing, you state:" (`.tl-spec-k`), with the statement in a `<q>` below it, set off from "Reason for this
      action" (`.sc-mb`);
    - a signed row "Stated" with the same words.

### Departures from the design, each found by the walk or the tests

1. **"from the Builder" became "from the Sequences tab".** The design's S2 and S8 said a corrected 0000 is started
   from the Builder. The Builder offers no start. With no sequence it says to create 0000 elsewhere, and "Start
   sequence 0000" is on the Sequences tab. That line ("…from the Sequences workspace first") now says "from the
   Sequences tab first", so the notice and the line under it agree (`found/second/`).
2. **The statement has a label and a gap.** In the first walk it ran in body size into "Reason for this action" with
   no gap. It now has a caption label and a gap, from v2's own classes. The dialog's `.es-field` classes were tried
   first; `ci:undefined-css-classes` reads only v2's stylesheets and refused them. No stylesheet was changed.
   `found/third/` shows the result.
3. **S9 is not visible in the running app yet.** The transmissions list is under Transmit, which opens once a sequence
   is dispatched, and a corrected 0000 is a draft. T3 pins the three marks. The walk could not show a dispatched
   replacement: that needs the freeze and dispatch signatures through a gate this demo's 0000 does not clear.
4. **The walk's 0000 had no test send.** A send to the agency's test environment needs a dispatched sequence and
   gateway credentials, which this container does not have. S2's test-send clause ("its test send of 2026-10-30 UTC",
   "its 3 test sends") is pinned by T1. The design's "Done" names a test-sent 0000; that part is owed to an
   environment with staging credentials.

### Proof

**Running app** (`found/`, `capture.cjs`, `probes-*.json`). This is D7-A2's method, on the same throwaway database and
biotech demo, with two people of one organisation: the account that created 0000, and an independent signer made with
`scripts/seed-admin.mjs` (password in a 600 file, never printed).

- **The first walk, 31 captures, 1440 and 390, light and dark:**
  - S0 closed; S2 offered; S6 the dialog, unsigned; S4 as the creator;
  - the signed retirement, once (1440, light);
  - after it: Dispatch with no sequence, and the Sequences tab offering "Start sequence 0000";
  - 0000 started again;
  - the replacement's Dispatch, where its own creator now sees S4.
- **What the probes read:**
  - no script error and no overflow, page or document, on any capture;
  - one orange fill in the work area (the header's "New submission"), plus the dialog's own controls;
  - the dialog offers Responsibility only, with no record key; the statement renders between `open-quote` and
    `close-quote`;
  - the notice: "Sequence 0000 is retired, signed by Dana Signer (responsibility). Its number is free: start sequence
    0000 again from the Sequences tab.", with no record key, and no `act_` id anywhere in the page's HTML;
  - keyboard: the summary takes focus, and Enter opens it.
- **The database after:**
  - sequence 25 removed;
  - one `ECTD_SEQUENCE_RETIRED` row on `ectd_sequence:25`, the signer's: chained, with the stated reason, the meaning,
    the statement and the signature in its values, and its `occurred_at` equal to the row's `deleted_at`;
  - a new 0000 (26) live.
- **Kept from the first walk:** its probes (`found/probes-*.json`, all 31) and the five captures the final walk does
  not repeat: 0000 started again, and the replacement's Dispatch tab. The rest were superseded by the final walk on
  the final code.
- **The second walk** (`found/second/`, 10 captures; its S8 notice and its probes are kept): the replacement 0000′
  retired with the roles reversed, its creator now the other person. It shows the aligned "no sequence" line at every size and theme. There are two
  `ECTD_SEQUENCE_RETIRED` rows, one per signer, and no live sequence in the submission.
- **The final walk** (`found/third/`, 27 captures), on the exact code committed. One person starts a fresh 0000. The
  other, independent of it, is walked through S0, S2 and S6 at every size and theme; the starter sees S4. The other
  person signs, and the after-states are captured.
  - **Visibility is tested by `elementFromPoint`**, not by boxes (the coordinating session, 2026-11-09). The summary,
    the Retire button, the creator's note, the statement's paragraph, the dialog's sign button and the S8 notice each
    hit at every size and theme.
  - Under the open dialog, the page's controls are covered by its overlay, as a modal should be.
  - No script error and no overflow; the keyboard check holds; no `act_` id anywhere in the page.
  - The database holds four `ECTD_SEQUENCE_RETIRED` rows across the walks. Each was signed by the person who did not
    create that sequence.

**Tests:**
- `01-red.txt`: the 23 cases written first, all failing before the code. T3's first failure was its own fixture: a
  draft sequence lists no transmissions. It was made dispatched before the code was written. M4 is what shows T3
  catches marking by number.
- `dispatchWorkspaceRetire.test.tsx`, 23 cases. T1 covers S0–S5, the failed readiness read, each open and each click,
  and focus. T2 is through the real Submission Center: Responsibility only; one string across the precheck, the
  dialog, the signed row and the sign payload (the test's server statement is deliberately not the production text);
  the act's body; no record key or id in the notice or target line; S7 inline; three kinds of 200 that are not a
  success; and a statement-less answer opening no dialog. T3 covers the three marks.
- `dossierTransmissions.test.tsx`: its bound row is marked by its binding.
- `validationExplainNarrates.test.tsx`: the Explain button is ghost with its spark, and the Validation workspace has no
  orange fill.
- The Submission Center, Dispatch, Validation, Shadow Review, Builder and sequence suites, T4's lifecycle QA among them:
  92 files and 997 cases, all passing on the committed code (`02-green-client.txt`).
- `03-typecheck.txt` (0 errors), `04-lint.txt` (the counts) and `05-gates.txt` (the eleven design and copy gates, all
  OK) are on the same code.

**Mutations** (`mutations/`): thirteen, each red on its own case and each file restored, re-run on the final code.

| Id | Mutation |
|---|---|
| M1 | the disclosure inside the readiness conditional |
| M2 | `approval` offered |
| M3 | `notFiledElsewhere` dropped |
| M4 | "(this one)" by number |
| M5 | any 200 is success |
| M6 | the signature id back in the notice |
| M7 | the record key in the target line |
| M8 | the client's own copy of the statement |
| M9 | the click refusal not focused |
| M10 | no fresh precheck at the click |
| M11 | the answer kept across a close |
| M12 | a statement-less answer cleared |
| M13 | the Validation fill put back |

**Typecheck** 0 errors. **ESLint:** `SubmissionSeqWorkspaces.tsx` 7 = 7, `SubmissionCenter.tsx` 5 = 5 (its complexity
fell from 161 to 149), and the new test 0.

### Seen, not changed here

- **The Sequences tab's "Start sequence 0000" is a second orange fill** beside the header's "New submission", and it
  carries a spark though it asks nothing of AnA (D0 §7 check 2; D0 §8.1). This predates P-86. It is reported to the
  coordinating session for the next D7 commit, not folded into C3.
- **The folder is `06-screen/`, not `05-screen/`** as first told to the coordinating session. `05-door/` holds C2's
  evidence.

- **The sibling notices still print ids.** Freeze, dispatch, transmit, the waiver and the disposition end "…
  server-confirmed under signature act_…". Every other kind's target line prints `ectd-sequence:<id>`. That is the
  plan's retired pattern, owed to the D7 copy pass (design §6.18). C3 adds no instance.
