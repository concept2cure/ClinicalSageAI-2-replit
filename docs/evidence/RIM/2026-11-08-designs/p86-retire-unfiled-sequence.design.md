# P-86: retire an unfiled sequence by a signed, audited act that frees its number

- **Designer:** RIM (`session_011e42DEAR2U6W51Mjvgfgbt`), read-only, 2026-11-01.
- **Trees read:**
  - working tree at `609ef94c7`. Other builds are editing it now (F1 slice 1 has modified `prior-sequence-loader.ts`,
    `submission-gateways/index.ts`, `_freeze-gate-fixture.ts` and others). Those edits are designed against, not cited.
  - `origin/concept2cure-v2` at `7be209e9c`, fetched for this design. For every file this design touches, the cited
    lines are the same in both trees.
  - **Revision, 2026-11-02:** `origin/concept2cure-v2` at `042293ade`, which contains the founder-decision commit
    `5e3652dbf`. Seven review findings are folded in (§9.1). Every code fact a finding rests on was re-read there and
    in the working tree.
- **Inputs:**
  - the map, `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/decided/p86-retire.map.md` (R1–R11);
  - the re-plan, `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/rim-replan-2026-11-01.md`
    (§1.4, §2, steps 4, 8, 20, 29, 30, 31);
  - the older design, `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/retire-sequence.design.md`
    (written at `73005b856`), read only for its rules and its critique.
- **Scope.** Exactly what P-86 needs: the act, its database guard, its door, its precheck, MCP's word for it, the
  governed-verb pin, and one quiet disclosure on the Dispatch tab. Nothing else. §9 lists what was cut from the map
  and from the older design, and why.

---

## 0. The founder's decision

The coordinator's record of P-86 (2026-11-01):

> "P-86: an unfiled sequence with no production send bound may be retired by a signed, audited act, freeing its
> number. Plan: L1, row D7. Reuse the drafts' existing removal (the filed-elsewhere baseline's signed removal of
> drafts, server/services/submission-service/filed-sequence-baseline.ts around :197-201)."

The question it answers is the re-plan's §4 item 1:

> "Retiring an unfiled, dispatched sequence by a signed act (steps 29–31). Recommendation: allow it only when no
> production send is bound to the sequence, and file it under L1 row D7. … Why it is needed: after steps 2 and 4, a
> sequence whose test send found a content defect can be neither changed nor replaced without it."

**Where the record stands (revised 2026-11-02).** The founder-decision commit `5e3652dbf` is now on
`origin/concept2cure-v2` (an ancestor of `042293ade`). `docs/LAUNCH_DEFINITION_OF_DONE.md:1691-1704` there records
`### P-86 — A sequence that was never filed may be retired, by signature`:

> "Such a sequence may be retired by a signed, audited act, which frees its number, only while:
> - no production send is bound to it; and
> - it is not filed.
>
> The act reuses the filed-elsewhere baseline's existing removal of drafts. It goes under launch row D7 (`Plan: L1`).
> Nothing new is built beyond that act."

- It names no ceremony and no signature meaning, so D2 and D3 stand. §8 flag 2 still asks the coordinator about the
  ceremony.
- "It goes under launch row D7 (`Plan: L1`)" covers the act's only door for a person, so **C3 is filed under
  `Plan: L1`** as well (§9.1 finding 5).
- Its two conditions are the floor. D6's narrowings are listed in §8 flag 3. If the coordinator reads the record
  differently, the record wins.

**What each clause of the decision requires:**

| Clause | What it requires here |
|---|---|
| "an unfiled sequence" | Its `dispatch_status` is outside the one filed rule, `FILED_DISPATCH_STATUSES = ['sent','acknowledged']` (`server/services/submission-service/filed-dispatch.ts`). |
| "with no production send bound" | No transmittal bound to it (`metadata.dispatchBinding.sequenceId`, stamped by F1 slice 1) names an environment other than `staging`. A missing environment counts as production. |
| "retired by a signed, audited act" | A Part 11 signature with a declared meaning and a reason. The removal and its chained audit row commit in one transaction. |
| "freeing its number" | The row leaves the live set (`deleted_at`). Step 4's `createSequence` refuses only a **live** holder, so the number is free. The Builder derives the next number as the highest live number plus one (`SubmissionCenter.tsx:258-264`), so the freed number is reachable only when nothing live is numbered after it. |
| "Reuse the drafts' existing removal" | The statement at `filed-sequence-baseline.ts:197-202` becomes the one statement both acts run. One database guard admits both. |

---

## 1. What already exists (RULE 3), by path

### 1.1 The removal this act reuses

- **`server/services/submission-service/filed-sequence-baseline.ts`** (243 lines; `88229a87d`, session `01E8btkB…`):
  - `lockUsSequences` :129-145 locks the submission's live US sequences `FOR UPDATE OF s`.
  - `draftsReplaced` :147-163 refuses a fixed sequence (`BASELINE_FIXED`) and a covered sequence that holds leaves.
  - **The removal**, :197-202:
    `UPDATE ectd_sequences SET deleted_at = NOW(), updated_at = NOW() WHERE organization_id = $1 AND id = ANY($2::int[])`.
  - The signature manifest's act names the removed numbers, `removedDraftSequences` (:211). No `ectd_sequence` audit
    row is written per removed draft.
  - The file imports nothing from `submission-service.ts`. `submission-service.ts` already imports
    `sequenceCreationRefusal` from it (:105), so exporting the statement from here creates no import cycle.
- **`server/routes/submission-filed-baseline.ts`** :121-148 signs the declaration through `signGovernedAct`. The
  removal runs inside `run`, before the signature row is written.
- **`migrations/20261029g_submission_filed_baselines.sql`** :66-98, :114-120: a deferred `CONSTRAINT TRIGGER`. At
  COMMIT it requires a live governed-action signature written by the same transaction (`es.created_at = LOCALTIMESTAMP`)
  whose `signature_manifest -> 'act'` names the declaration. This is the precedent the guard follows.
- **Tests that pin the removal:**
  - `server/__tests__/routes/submission-filed-baseline.pglite.test.ts:190-199` ("removes an empty 'Start sequence 0000'
    draft, and the signed record names it");
  - `server/services/submission-service/__tests__/filed-baseline-effects.pglite.test.ts`.

### 1.2 The sequence's own signed acts (the chain this act joins)

All in `server/services/submission-service/submission-service.ts` (4,159 lines; already counted by the repo-health
ceiling).
- **Codes.** `SubmissionErrorCode` :123-141. `SUBMISSION_ERROR_STATUS` :162-194 is typed over the union, so a new code
  cannot ship unmapped. `server/routes/submissions.ts:102-110` `CODE_STATUS` spreads it.
- **Intents.** `SequenceSignatureIntent` :927-930 (freeze, dispatch, transmit, `shadow-waiver`,
  `shadow-finding-disposition`; no `retire`). `INTENT_LABEL` :933-939. `INTENT_MEANING_REFUSAL` :949-955.
- **Gate 1**, `governedSignatureVerdict` :979-1109. It checks, in order:
  1. an executed `sign` by this actor on this target;
  2. `payload.intent === step`;
  3. `requiresIndependence`;
  4. the intent's meaning rule;
  5. the `payloadRefusal` hook (:1030, P-35's);
  6. that the signature is neither spent nor void;
  7. that it is in force;
  8. that its basis is `ectd-sequence-leaf-manifest-sha256`;
  9. that the current digest matches.
- **Spending and voiding.** `signatureSpentBy` :1124-1140 (literal action list :1131-1132). P-23's
  `voidRefusedStepSignature` :1170-1231. `voidingSignatureOnRefusal` :1247-1268.
- **`applySequenceChangeWithAudit`** :1276-1323: BEGIN, `underLock`, the UPDATE (zero rows gives `noRowsRefusal`),
  `writeChainedAuditRow` on the same client, COMMIT. It takes no `reason` and returns nothing.
  `writeChainedAuditRow` (`server/services/auditService.ts:269-330`) writes `audit_logs.reason` only when it is given
  one.
  - **Its sealed time is the application's clock.** `const occurredAt = new Date().toISOString()` (:282) is taken
    after the caller's UPDATE. It goes into the sha256 chain and the HMAC seal (`computeAuditChainSealed`; the recipe
    is `{action, actor_id, target, payload_hash, occurred_at, previous}`, `server/services/audit/chain.ts:8-9`) and
    into the INSERT's `occurred_at` (timestamptz, `20260527_mutation_primitives.sql:90`).
  - The verifier re-derives `occurred_at` with `toISOString()` (`chain.ts:260-262`), so a sealed time has millisecond
    precision.
  - It never sets `created_at`. The deploy table's `created_at timestamp DEFAULT now()`
    (`migrations/0000_sweet_joseph.sql:185`) is outside the chain and the seal. The PGlite fixture has no `created_at`
    at all (`pglite-harness.ts:378-400`).
  - `BEGIN` runs before `underLock` (`submission-service.ts:1299-1300`), so a `NOW()` in the UPDATE is the time of
    BEGIN, which comes before any lock wait.
- **Separation of duties at the act.** `independentSignerRefusal` :2007-2022, through `assertSignerIsNotAuthor`
  (`server/services/governance/separation-of-duties.ts:640`). Authorship of a sequence is `created_by`.
- **`recheckUnderSequenceLock`** :2028-2050. It locks the submission `FOR SHARE` (`lockSubmissionPackageIdentity`
  without `forUpdate`), the sequence `FOR UPDATE … deleted_at IS NULL`, then the program. It re-asks the act's rule and
  re-derives the leaf-manifest digest.
- **The two templates** for a signed act that is not a transition:
  - P-34: `waiveShadowReview` :1991-2000 and `applyShadowReviewWaiver` :2052-2110;
  - P-35: `dispositionShadowFinding` :2133-2141 and `applyShadowFindingDisposition` :2143-2214, which reads the
    signature's own reason through `dispositionSignatureReason` (`server/services/ectd/shadow-finding-disposition.ts:302-309`).
  - Their doors: `server/routes/submissions.ts:1483`, :1514. The precheck door is :2050-2089
    (`governedPrecheckSchema`, `POST /sequences/:seqId/governed-precheck`).
  - Neither has an AnA or MCP door. That is pinned by `server/services/ana/__tests__/ana-cannot-waive-shadow-review.test.ts`
    and `ana-cannot-disposition-shadow-finding.test.ts`, which source-scan `server/services/ana` and `server/mcp`.
- **The sign route**, `server/routes/c2c/actions.ts`:
  - the target resolver :215-221 admits `ectd-sequence:<id>` only for a live row;
  - `assertSignerIsNotAuthor` :680 refuses the sequence's creator for any non-authorship meaning;
  - the intent is held only in the ledger payload (`c2c_ana_actions.payload`), not in the signature manifest.
- **`signerIndependenceOf`** (`separation-of-duties.ts:711`) asks the same check in advance. The readiness route uses
  it at `submissions.ts:2028-2029`.
- **`createSequence`** :685-728 refuses only the baseline's numbers today. Step 4 adds the live-number refusal and adds
  `isNull(deletedAt)` to `transitionSequence`'s CAS (:804-820).

### 1.3 Meanings

- `server/services/part11/signature-meanings.ts`:
  - `RELEASE_ACT_MEANINGS`, `DECISION_ACT_MEANINGS = ['approval','responsibility']`;
  - P-51's `'retirement'`, written for retiring a QMS controlled document.
- `client/src/concept2cure/_shared/esignMeanings.ts`: `retirement` is offered only where a dialog names it, worded "You
  withdraw this document from use". `responsibility` is worded "You take responsibility for this content".

### 1.4 What a send leaves behind (after F1 slices 1 and 2)

- **`submission_transmittals`** (`migrations/20260509_submission_gateways.sql:12-46`). It has no sequence column.
  - The caller writes `metadata.sequence` (the number) and `metadata.environment` (`submission-service.ts:2919`).
  - Slice 1 stamps `metadata.dispatchBinding {attemptId, organizationId, sequenceId, signatureActionId, bundleSha256}`
    server-side in the guard. FDA ESG rows already carry it.
  - A transmittal row exists only once a send reaches the gateway implementation, after the guard's pre-wire checks
    (`submission-gateways/index.ts` transmit, origin :244-327).
- **`ECTD_TRANSMITTED`** on the sequence (`submission-service.ts:2963-2990`) carries `environment`, `transmittalId`
  and `signatureActionId`. The receipt path writes the same action, with the receipt's environment
  (`fda-esg-receipts.ts:117-121`), and only for a live sequence (:110-111).
- **Slice 2:** a staging result leaves `dispatch_status = 'pending'`; a staging post-wire failure releases the claim. A
  test-sent sequence therefore reads `dispatched` / `pending`, with only staging transmittals bound to it. That is the
  D7 case P-86 serves.
- **The package spine's sends** (`server/services/submission-gateways/governed-transmit.ts`) are the platform's
  other route to the agency. They are not linked to `ectd_sequences`:
  - `agencyMetadata` (`governed-transmit-checks.ts:95-123`) stamps `metadata.sequence` (the bundle's number),
    `metadata.applicationId` (the package's recorded application number) and `metadata.environment` on the
    transmittal. The row carries `package_id` and the caller's `program_id`. **No `dispatchBinding` is written**: only
    `transmitSequence` passes one (`submission-service.ts:2922`).
  - **No `ECTD_TRANSMITTED` row is written.** That action is written only by `submission-service.ts:2969` and
    `fda-esg-receipts.ts:120`.
  - A production send is appended to the package's filed history (`recordTransmittedSequence`,
    `governed-transmit.ts:410-447`; production only, :425).
  - Outside dev and test, every such send names its package. A client descriptor is refused
    (`governed-transmit.ts:500-508`), and `package_id` is set from the input (:662-700).
  - **It is still reachable:**
    - `POST /api/mdx/gateways/:region/:gateway/transmit` (`server/routes/mdx-submission-gateway.ts:343`, mounted);
    - AnA's `k510_workflow.transmit` (`server/services/ana-ri/mdx-command-handlers.ts:795-830`, :1130), which takes
      `environment` 'staging' or 'production'.
  - The screen's package-transmit control was removed on 2026-10-17 (`GatewayTransmittals.tsx:6-14`). Packages
    already sent stay in the history.
  - The sequence spine never reads package transmittals or the package's filed history (`createSequence`,
    `filingOrderRefusal` :1460-1534, the transmit guard).
- **The filed fold reads a sequence's record by number** (`server/services/ectd/prior-sequence-loader.ts`,
  `readFiledManifestRows`, working tree :248-300; origin :215). For each live `sent`/`acknowledged` sequence, it reads
  the bound transmittal's `leafManifest` when one exists (slice 1). Otherwise it reads every non-rehearsal
  `ectd_compilations` row with `c.submission_id = $2 AND c.sequence_number = f.sequence_number`.
  - `ectd_compilations` has neither a sequence id nor a region (`shared/schema.ts:8851-8915`).
  - So a filed sequence read from compiles also reads the compiles of every other sequence of the submission with the
    same number, in any region.
  - Slice 1 keeps that read for every filed sequence with no bound `leafManifest`, which includes every send made
    before slice 1 (`f1-filed-is-what-was-sent.design.md`, step 2).
  - `loadFiledStateBySubmission` (:328-358, exported) answers, per live sequence number, whether that number is filed
    and what its record is read from (`basis: 'transmit' | 'compiles' | null`; slice 1 adds `basis`).

### 1.5 IND records marked filed in a sequence

`markSafetyReportFiled` (`server/services/ind-lifecycle/ind-safety-report-persistence.ts:127-147`) and its amendment and
annual-report twins (`ind-amendment-persistence.ts:108`, `ind-annual-report-persistence.ts:139`) write
`status 'filed', sequence_id`. They do this when the IND route **creates** the sequence (`server/routes/ind-lifecycle/filing.routes.ts:249, :365, :413`).
The overdue feed skips every `filed` row.

### 1.6 The client

- **`client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`:**
  - `GOVERNED_LABEL` / `GOVERNED_PAST` :294-301;
  - `precheckRefusal` :788, `requestGoverned` :814-830;
  - `runGoverned` :844-900, with `ownAct` :868;
  - the one `EsignModal` mount :1912-1962. Its `targetMeta` (:1922) prefixes every kind with
    `` `${regL(flow.seq.region)} · ectd-sequence:${flow.seq.id} · …` ``;
  - the sibling success notices (:888, :920, :939, :960) end "server-confirmed under signature ${actionId}". That is
    a `c2c_ana_actions` id, `act_<uuid>` (`migrations/20260527_mutation_primitives.sql:25`);
  - the selection rule :573.
  - The plan's retired patterns (`docs/design/ONE_DESIGN_PLAN.md:235`, :241) include "ids, enum values, table or
    function names and snake_case on screen". The plan says "Nobody adds these."
    - D7.md §A.4 (D7-A1 steps 1-7) has no notice or copy pass.
    - D7-A2 strips record keys only from blocker sentences (`.design/claude-convergence/D7.md:189-191`, regex
      `/\b[a-z-]+:\d+\b/`).
  - `EsignModal` (`client/src/concept2cure/_shared/components/EsignModal.tsx:131-180`) already takes `meanings`,
    `defaultMeaning`, `targetMeta`, `renderMeaningDetails` and `signedRows`.
- **`client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`:**
  - `GovernedKind` :1726;
  - `DossierTransmissions` :1874-1937, which marks "(this one)" by **number** (`filed === sequenceNumber`);
  - `DispatchWorkspace` :2032-2404. Its content renders only after the readiness read succeeds.
- **`.design/claude-convergence/D7.md` §A2 steps 8-10:** the Working-sequence select moves to the context row,
  workspaces become `.pj-sec`, and the governance paragraph becomes `<details className="pj-more">`. D7.md adds no
  component file. `.pj-more` and `btn ghost small` exist in `client/src/concept2cure/v2/styles/app-v2.css`.

### 1.7 AnA and MCP

- **`server/mcp/tools/catalog.ts`:**
  - `c2c_list_sequences` :92-130 answers "has no sequences yet" when the live list is empty;
  - `c2c_get_sequence_status` :132-200 answers "Sequence not found for this organization." for a removed row.
- **`GOVERNED_VERB_PATTERN`** (`shared/navigation/surface-actions.ts:93-94`) has no `retire`.
  - The map's probe (`/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/decided/p86-probe/verb.mts`)
    found none of the 103 registered surface actions matching `\bretire\b`.
  - The pattern's test is `shared/navigation/__tests__/surface-actions.test.ts:80-101`.
- **AnA's only "retire" today is QMS:** `retire_qms_document` (explain-only, `server/services/ana/skills/library/quality-systems.ts:199`).
  No AnA or MCP source names a sequence retirement.

### 1.8 Precedents for the guard and its fixtures

- **Same-transaction signature guards:** `migrations/20261019_commitment_fulfilment_evidence.sql` :280-340, with its
  column-precondition `DO` block, and `20261001_qms_document_signature_required.sql`.
- **`ci:migration-drop-safety`** (`scripts/ci/check-migration-drop-safety.mjs:211-222`) accepts a file that drops and
  re-creates its own trigger.
- **`server/db/pglite-harness.ts:759-805`** `createIndPgliteDb` applies `20261029g` whenever `submissionCore` is set.
  Two `submissionCore` suites soft-delete or un-delete sequences with bare SQL
  (`shadow-review-coverage.pglite.test.ts:211`, `submissions-request-current-access.pglite.test.ts:74`), so the new
  guard is applied there only behind an **opt-in flag**.
- **Bare soft-deletes on real PostgreSQL:** `tests/db/vault-where-used.dbtest.ts:149` only. Its fix follows the
  precedent `SET LOCAL session_replication_role = replica` (`tests/db/cmc-agency-questions-converged.dbtest.ts:171`).
- **No migration in the set UPDATEs `ectd_sequences`.** The only ALTER is `20261014_ectd_transmit_attempt_binding.sql:22`
  (ADD COLUMN IF NOT EXISTS). A replayed file therefore never trips the guard.

### 1.9 Searches run

- `git log --all --diff-filter=D --name-only -- '*etire*' '*Retire*'` finds only `.claude/skills/gstack/…/retired-command*`
  (unrelated).
- `git log --all -S` for `retireSequence`, `ECTD_SEQUENCE_RETIRED`, `SEQUENCE_NOT_RETIRABLE`, `SequenceRetirement` and
  `applySequenceRetirement` finds 0 commits each. A grep of `server`, `shared` and `client` finds none.
- The clone is shallow (4,048 commits from `0c2943f1b`, 2026-10-05).
- **Conclusion.** No retire act on a sequence ever existed in visible history. Every part it needs exists (1.1–1.8), so
  the act is a **completion** of the sequence's signed acts. It is not a new capability.

---

## 2. Decisions

### D1. The effect: soft-deleted, through the baseline's own statement

- **The shared statement.** The statement at `filed-sequence-baseline.ts:197-202` is exported from where it lives as:

  ```ts
  /** The one way a sequence leaves the live set: the drafts a filed-elsewhere
   *  declaration replaces, and a retired sequence (P-86). `at` is the instant
   *  the retirement takes after its lock (below); the baseline passes none. */
  export function liveSetRemoval(organizationId: number, ids: readonly number[], at: string | null = null) {
    return {
      text: `UPDATE ectd_sequences
                SET deleted_at = COALESCE($3::timestamptz, NOW()), updated_at = COALESCE($3::timestamptz, NOW())
              WHERE organization_id = $1 AND id = ANY($2::int[]) AND deleted_at IS NULL
          RETURNING id, deleted_at`,
      params: [organizationId, [...ids], at],
    };
  }
  ```

  - The declaration runs it with `q.query(text, params)`. `$3` is always bound, as `null` for the baseline, so the
    baseline's removal and its time (`NOW()`) are unchanged.
  - The retirement passes `text` and, as `params`, a function of the instant,
    `(at) => liveSetRemoval(org, [id], at).params`. `applySequenceChangeWithAudit` calls it with the instant it takes
    after the lock (below). (Revised 2026-11-02, §9.1 finding 3. The first version had no `at` and used `NOW()`.)
  - `AND deleted_at IS NULL` and `RETURNING` change nothing for the baseline: its rows were locked live in the same
    transaction.
- **Nothing else on the row changes.** `status`, `dispatch_status`, `transmit_signature_action_id` and
  `transmit_attempt_id` stay as they were. The row records what the sequence was when it was retired.
- **The time: one instant, the sealed one (revised 2026-11-02, §9.1 finding 3).**
  - **Why not `NOW()`.** `NOW()` is the time of BEGIN, which comes before `underLock`. The lock can wait: on the
    submission `FOR SHARE`, behind step 4's `createSequence` or a baseline holding it `FOR UPDATE`; and on the
    sequence row, behind a leaf write or a transmit claim. The sealed §11.10(e) time is the audit row's `occurred_at`,
    which `writeChainedAuditRow` takes from the application clock after the UPDATE (`auditService.ts:282`). The two
    differ always, by as long as any wait lasts, and by a whole UTC date when the wait spans 00:00 UTC.
  - **The instant.** After `underLock` (the locks and the recheck), on the transaction's client,
    `applySequenceChangeWithAudit` reads `SELECT date_trunc('milliseconds', clock_timestamp()) AS at`, and takes
    `at.toISOString()`. Millisecond precision is required: the chain verifier re-derives `occurred_at` with
    `toISOString()` (`chain.ts:260-262`), so a microsecond value would break the chain. The driver already returns a
    JavaScript `Date`, which holds milliseconds; `date_trunc` keeps the database's own reading equal to it. Only the
    ISO string is used afterwards, never the raw column text.
  - **One value, three places.**
    - the UPDATE's `$3`, so `deleted_at` is that instant;
    - `writeChainedAuditRow`'s new optional `entry.occurredAt`. When present, it is used in place of
      `new Date().toISOString()` and normalised with `new Date(v).toISOString()`; an invalid value throws, and the
      transaction rolls back;
    - the answer's `retiredAt`.
  - The instant is taken only when `update.params` is a function (the retirement). Every existing caller passes an
    array and is unchanged.
  - `applySequenceChangeWithAudit` returns `{ rows, occurredAt }`; existing callers ignore it.
  - `deleted_at` is not sealed itself. It equals the sealed `occurred_at`, and T8 and T13 pin that.
- **The number.**
  - It is free once no live row of the submission and canonical region holds it. Step 4 refuses only a live holder.
  - Eligibility (D6, check 5) makes it the highest live number, so the Builder's derived "Start sequence NNNN" offers
    it again.
  - The baseline's numbers stay taken regardless (`sequenceCreationRefusal`).
- **No reinstatement.**
  - G2 (D9) refuses clearing `deleted_at`.
  - `revoke-signature` on a retired target answers `TARGET_INVALID`, because the resolver (`actions.ts:215-221`)
    admits only live rows.
  - This is stated in the evidence, not changed.

### D2. The ceremony: the sequence's own chain, not `signGovernedAct`

1. **Sign.** `POST /api/c2c/actions/sign` on `ectd-sequence:<id>` with payload
   `{ intent: 'retire', meaning: 'responsibility', notFiledElsewhere: true, statement: <D6's statement, word for word> }`
   and the signer's reason. The statement's text comes from the precheck answer (C2), never from client code.
2. **Act.** `POST /api/submissions/sequences/:seqId/retire { signatureActionId }`. It passes Gate 1 with intent
   `retire`, and runs inside `voidingSignatureOnRefusal`.

This is the ceremony P-34 and P-35 already use on the same target. "Reuse the drafts' removal" is honoured at the
removal (D1) and at the guard (D9), not at the ceremony. §9 A1 gives the reasons. If the recorded P-86 text requires
`signGovernedAct`, apply §9 A1's stated alternative.

### D3. Meaning: `responsibility`, and only it

- `INTENT_MEANING_REFUSAL.retire` refuses any other meaning: "retiring a sequence is signed with the meaning
  responsibility".
- `requiresIndependence` already refuses an authorship meaning.
- **Not `approval`:** it would read as approving the content.
- **Not `release`:** nothing is released.
- **Not P-51's `retirement`:**
  - its dialog text is "You withdraw this document from use";
  - "withdraw" is a filed eCTD sequence type (`withdrawal`);
  - widening its wording would edit `esignMeanings.ts`, which QMS shares.
- `responsibility` matches what the signer does: they answer for taking an unfiled package out of use.

### D4. Reason

- The reason is the signature's own, read by the existing `dispositionSignatureReason`
  (`shadow-finding-disposition.ts:302-309`).
- A signature with no reason is refused (`GOVERNED_REQUIRED`).
- The reason is written to `audit_logs.reason`, through a new optional `audit.reason` on
  `applySequenceChangeWithAudit`, passed to `writeChainedAuditRow`.
- It is repeated in the row's details, so the payload hash covers it. `payload_hash` covers `new_values`, not the
  `reason` column.

### D5. Audit action

**`ECTD_SEQUENCE_RETIRED`** on `ectd_sequence:<id>`.
- It is written by `writeChainedAuditRow` in the removal's transaction (`applySequenceChangeWithAudit`).
- **Details**, all from facts judged under the lock:
  - `description` ("Sequence NNNN retired by Part 11 e-signature (responsibility)");
  - `reason`, `signatureActionId`, `signatureId`, `meaning`, `notFiledElsewhere: true`, and `statement`, the exact
    words signed (D6). The chained `payload_hash` therefore covers what was stated;
  - `submissionId`, `sequenceNumber`, `region`, `type`, `status`, `dispatchStatus`, `transmitAttemptId`;
  - `boundDigest` (Gate 1's leaf-manifest digest);
  - `stagingTransmittalIds`, `leafCount`, `numberFreed`.
- **Spending.** `signatureSpentBy`'s list (:1131-1132) gains `ECTD_SEQUENCE_RETIRED`. Without it, a repeated POST after
  a retirement is refused as "already retired" inside `voidingSignatureOnRefusal`, and
  `voidRefusedStepSignature` would then find the retirement's own signature unspent and **void it**. Test C1-T9 pins
  this.
- `fda-esg-receipts.ts`'s own list is not changed. A retired sequence is answered `unreconciled` before that list is
  read (:110-111).

### D6. Eligibility

**Where the rules live.** A pure `retirementRefusal(facts)` and `readRetirementFacts(q, seq, organizationId)`, in
`server/services/submission-service/sequence-retirement.ts`. This is a new file holding the retire act's new rules. It
sits inside the existing service folder, as re-plan step 29 allows, so that `submission-service.ts` does not grow by
them. Nothing moves out of `submission-service.ts` (§9.1 finding 6). Each query carries the tenant predicate. A read
failure is `INVALID_STATE`: "Whether sequence NNNN can be retired could not be checked, so it was not retired. Try
again." It is never a refusal or a pass.

The checks, in order:

| # | Check (read) | Refusal sentence (`SEQUENCE_NOT_RETIRABLE`, 409) |
|---|---|---|
| 1 | The row is live (`getSequence`). A removed row with a retirement record answers `INVALID_STATE`. | "Sequence NNNN was retired on YYYY-MM-DD UTC by NAME. Nothing was changed." |
| 2a | `isFiledDispatchStatus(dispatch_status)` | "Sequence NNNN is on file with the agency (dispatch status 'sent'), so it cannot be retired. A correction is a new sequence numbered after it." |
| 2b | `dispatch_status = 'transmitting'` | "A send of sequence NNNN is in flight and not yet settled, so it cannot be retired now. Record the agency's receipt, or wait for the send to settle, then look again." |
| 3 | A transmittal with `t.organization_id = $org AND t.metadata->'dispatchBinding'->>'sequenceId' = $id::text AND COALESCE(t.metadata->>'environment','') <> 'staging'` | "A send of sequence NNNN to the agency's production environment is recorded on YYYY-MM-DD UTC, so it cannot be retired. A correction is a new sequence numbered after it." With no environment recorded: "… is recorded on YYYY-MM-DD UTC with no environment named, so it is treated as a production send …" |
| 3b | **The package spine's production sends of this number for this application** (added 2026-11-02, §9.1 finding 1). A `submission_transmittals` row with `t.organization_id = $org AND t.package_id IS NOT NULL AND COALESCE(t.metadata->>'environment','') <> 'staging' AND t.metadata->>'sequence' = $number AND (t.program_id = $submissionProgramId OR t.metadata->>'applicationId' = $applicationNumber)`, then kept only when `canonicalRegionOf(t.region) === canonicalRegionOf(seq.region)` (in code; the helper is not SQL). `$submissionProgramId` is `submissions.program_id`. `$applicationNumber` is `readSubmissionPackageIdentity(q, org, submissionId, { region: seq.region }).applicationNumber` (`server/services/ectd/package-identity.ts:292-345`), the same number `transmitSequence` stamps. When that number is unresolved, the program match alone applies, and the evidence says so. | "Sequence NNNN of this application was sent to the agency's production environment as a package on YYYY-MM-DD UTC. That number is on file with the agency, so sequence NNNN cannot be retired. A correction is a new sequence numbered after it." With no environment recorded: "… as a package on YYYY-MM-DD UTC with no environment named, so it is treated as a production send. …" |
| 4 | An `audit_logs` row with `tenant_id = $org`, `table_name = 'ectd_sequence'`, `record_id = $id::text`, `action = 'ECTD_TRANSMITTED'` and `COALESCE(new_values::jsonb->>'environment','') <> 'staging'`. This covers sends from before slice 1 that carry no binding. | The same sentences as check 3. |
| 5 | A live sequence of the same submission and canonical region (`canonicalRegionOf`) whose number is higher. Each one is judged by checks 2–4, 3b and 6, read for all of them in one query per check (`= ANY($ids)`; 3b with `= ANY($numbers)`). | Every later one would pass: "Sequence MMMM, numbered after NNNN in this submission, is still in use. Retire MMMM first: a number is freed only from the highest down." Any later one would not (on file, in flight, sent to production, sent as a package, or holding filed IND records): "Sequence MMMM, numbered after NNNN, is kept (it is on file with the agency), so NNNN's number cannot be freed. Place the corrected content in a new sequence after MMMM." The bracket names MMMM's own reason. The sentence never tells a person to retire a sequence that cannot be retired. |
| 5b | **A filed twin read from compiles** (added 2026-11-02, §9.1 finding 2). `loadFiledStateBySubmission(q, { organizationId, submissionId })` (`prior-sequence-loader.ts:328`, slice 1's `basis`). Refuse when its `sequences` entry for NNNN has `basis === 'compiles'`. That holds exactly when a live `sent`/`acknowledged` sequence of this submission numbered NNNN has no bound transmittal carrying a `leafManifest`, so the fold reads every compile numbered NNNN, including this sequence's. The check reuses the fold's own read, so there is no second copy of its predicate. It has **no region filter**, because the fold's compile join has none (`ectd_compilations` carries no region). A throw from the fold (an unreadable stored manifest) is a read failure: `INVALID_STATE`, never a pass. | "Another sequence NNNN of this submission is on file with the agency, and what it filed is read from the compiles numbered NNNN. A compile names no sequence, so this sequence's compiles cannot be kept out of that record, and sequence NNNN cannot be retired." |
| 6 | `ind_safety_reports`, `ind_amendments` and `ind_annual_reports` with `organization_id = $org AND sequence_id = $id AND status = 'filed'` | "2 IND records (a safety report and an amendment) are recorded as filed in sequence NNNN. Retiring it would leave them filed in a sequence the agency never received, so it is not offered. Returning them to draft is not available yet." |

**The attestation, bound in the signature (revised 2026-11-02, §9.1 finding 1).**
- **One statement, one source.** `retirementStatement(sequenceNumber)` in `sequence-retirement.ts` is the only place
  its words exist:

  > "Sequence NNNN has not been filed with the agency by any route: not by a send from this sequence, not as a package
  > sent from this platform, not from an export, and not by courier or any other route."

  - It names the platform's own package route. The earlier text ("by any route outside this platform") left out the
    one route D6 relied on the statement to cover.
  - The precheck answer carries it (`retirement.statement`, C2).
  - The dialog shows it word for word in `renderMeaningDetails` and `signedRows` (C3). The client holds no copy.
- **Bound in the payload.** The sign payload carries `notFiledElsewhere: true` and `statement`.
  `retirementPayloadRefusal(sequenceNumber)` is Gate 1's existing `payloadRefusal` hook. It refuses unless
  `payload.notFiledElsewhere === true` and `payload.statement === retirementStatement(sequenceNumber)`, compared
  exactly. Its refusal reads: "the signature does not carry the statement for sequence NNNN, word for word: "<the
  statement>"".
- **Recorded.** The ledger row (`c2c_ana_actions.payload`) holds the words signed. The `ECTD_SEQUENCE_RETIRED` details
  repeat them (D5), so the chained `payload_hash` covers what was stated. A boolean alone did not record what the
  signer saw.
- **What the checks can and cannot see.**
  - The platform reads its own sends: the sequence's bound transmittals (3), its `ECTD_TRANSMITTED` rows (4), and the
    package spine's production sends of the same number for the same application (3b).
  - Exports and couriers leave no record that can be linked. The signer's statement is the honest basis for those,
    and the audit row records it.
  - 3b reads the package spine. The spine takes no lock the retirement shares, so a package send that starts during
    the retirement is seen only by the under-lock recheck if it has already written its row. The statement covers the
    rest.

**Where the checks run.**
- At the precheck: advice, which also adds the signer-independence sentence.
- At the act, before the lock.
- Again under the row lock, inside `recheckUnderSequenceLock`'s `recheck`, on the transaction's client.

**Locks.**
- The retirement holds the submission `FOR SHARE` and the sequence `FOR UPDATE`.
- Step 4's `createSequence` takes the submission `FOR UPDATE`. A creation of a later sequence and a retirement therefore
  serialize in either order, and check 5 reads after the lock.
- The baseline takes the submission and its sequences `FOR UPDATE`, so it serializes too.

### D7. What happens to what the sequence carries

| Carried | What happens |
|---|---|
| Leaves (`submission_leaves`) | Unchanged, not soft-deleted. Every leaf writer runs under `lockSequenceForLeafWrite` (`deleted_at IS NULL`), so none can change them. Every leaf reader goes through a live read, so they stop showing. The co-author filing-copy pin and Vault where-used release, by design, so the corrected document can be placed again. The audit row's `boundDigest` and `leafCount` record what they were. |
| Compiles (`ectd_compilations`) | Unchanged. They stay in the compile history. **Corrected 2026-11-02 (§9.1 finding 2):** the filed fold reads compiles by (submission, number) for a filed sequence with no bound `leafManifest`, so a retired sequence's compiles *would* be read under a filed twin of the same number. Check 5b refuses the retirement in exactly that case. With 5b, the fold does not read a retired sequence's compiles. At retirement, no filed sequence of its number is read from compiles. Afterwards, a later filing of that number (the replacement 0000′) is sent after slice 1, so its bound transmittal carries a `leafManifest` and is read from that. Retirement never changed what the fold reads anyway, because nothing deletes a compile; 5b keeps the act from claiming otherwise. The fold's key is residual §6.16, for S5's one fold (step 34). |
| Transmittals (staging only, by check 3) | Unchanged. `dispatchBinding.sequenceId` keeps naming the retired id. A late receipt is recorded on its transmittal and answers `unreconciled` for the sequence. The Gateway log keeps listing them. On a replacement's Dispatch tab they no longer read "(this one)" (C3). |
| Signatures | The freeze, dispatch and transmit signatures stay in `electronic_signatures`, unaltered (§11.70) and already spent. The retirement's signature is spent by `ECTD_SEQUENCE_RETIRED`, which names its `signatureId` and `signatureActionId`. |
| Its number | Free (D1). |

### D8. Readers: which must ignore a retired sequence, and what each does

| Reader | Today, for a row with `deleted_at` set | Change for P-86 |
|---|---|---|
| `listSequences`, `getSequence`, `listLeaves`, `lockSequenceForLeafWrite` (`submission-service.ts` :730, :749, :3498) | live only (`getSequence` answers NOT_FOUND) | None. Every act path fails closed on a retired id. |
| The filed fold (`prior-sequence-loader.ts` :94, :260, :340, :480) | live only, but its compile branch is keyed by (submission, number) | None. A retired sequence was never filed, so it is never a filed row of the fold. Its compiles could be read under a filed twin of the same number that is read from compiles; check 5b refuses that case (D7, corrected 2026-11-02). |
| `filingOrderRefusal` (:1460-1534), `recheckUnderSequenceLock`, `claimTransmitSlot` (:2468), the governed freeze and dispatch UPDATE (:1912-1915) | live only | None |
| The sign resolver (`actions.ts:215-221`), the binder (`ectd-sequence-binding.ts:41-43`) | live only | None. No new signature on a retired target. |
| Receipts (`fda-esg-receipts.ts:110-131`) | live only, answers `unreconciled` | None |
| `assessSequenceDispatchReadiness` (`assess-dispatch-readiness.ts:776-779`) | **no filter** | **Step 8** adds `isNull(deletedAt)` before C1. AnA, MCP, IND `submission.routes.ts:57` and `submissions.ts` dispatch-qc read it. |
| IND routes (`ind-lifecycle/sequence.routes.ts`) | through `getSequence`: not found | None. P-87 deletes the diff and manifest handlers; there is no shared line. |
| MCP `c2c_get_sequence_status` | "Sequence not found for this organization." | **C2:** says retired, when, by whom, the meaning and the reason. |
| MCP `c2c_list_sequences` | "has no sequences yet" | **C2:** "has no sequence in use". The description says that a retired sequence is reported by the status tool. |
| `DossierTransmissions` (`SubmissionSeqWorkspaces.tsx:1874-1937`) | "(this one)" by number | **C3:** marks by binding |
| Rehearsal, release signature, project hold, compile history, document submit | match by number, or count live rows | Named residuals (§6), not changed |

### D9. The database guard (trigger-only, RULE 1)

**The file.** `migrations/2026110x_ectd_sequence_removal_guard.sql` (date of the build).
- It is inserted into `C2C_MIGRATION_FILES` after `20261029g_submission_filed_baselines.sql` and before
  `UUID_TENANT_ISOLATION_NONPUBLIC`.
- It creates no table, column or backfill, and DROPs no other file's object.
- It uses `CREATE OR REPLACE FUNCTION`, and `DROP TRIGGER IF EXISTS` plus `CREATE` of **its own** two triggers, as
  `20261019` does. An in-place amendment of a WHEN clause therefore takes effect on replay.
- Its header carries a dated note and the warning: "a future backfill of `ectd_sequences` must carry
  `WHERE deleted_at IS NULL`; a removed row refuses every change."
- A `DO` block raises if a column the functions read is missing:
  - `audit_logs`: `tenant_id`, `table_name`, `record_id`, `action`, `actor_id`, `new_values`;
  - `electronic_signatures`: `organization_id`, `signed_target`, `signature_type`, `binding_basis`, `signer_id`,
    `signature_meaning`, `signature_manifest`, `superseded_by`, `is_valid`, `verification_status`, `created_at`;
  - `c2c_ana_actions`: `id`, `org_id`, `command`, `target`, `state`, `payload`;
  - `submission_filed_baselines`: `id`, `organization_id`, `submission_id`, `declared_by`.
  This follows `20261019` :323-340.

**G1 `ectd_sequences_removal_recorded`.** `CREATE CONSTRAINT TRIGGER … AFTER UPDATE ON public.ectd_sequences
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)`. Its function
(`SET search_path = pg_catalog, public`) re-reads the row at COMMIT and admits it in one of two cases.

- **(a) The retirement.** All of these hold:
  - an `audit_logs` row with `tenant_id = org`, `table_name = 'ectd_sequence'`, `record_id = id::text` and
    `action = 'ECTD_SEQUENCE_RETIRED'`;
  - its `new_values::jsonb->>'signatureActionId'` names a `c2c_ana_actions` row with `org_id = org`, `command 'sign'`,
    `target 'ectd-sequence:'||id`, `state 'executed'` and `payload::jsonb->>'intent' = 'retire'`;
  - an `electronic_signatures` row on that target, with:
    - `signature_manifest::jsonb->>'actionId'` equal to that action;
    - `signature_type 'governed-action'`;
    - `binding_basis 'ectd-sequence-leaf-manifest-sha256'`;
    - `signature_meaning 'responsibility'`;
    - `signer_id` equal to the audit row's `actor_id`;
    - live: `superseded_by IS NULL`, `is_valid IS DISTINCT FROM false`, and `verification_status` not revoked or voided.
- **(b) The baseline's removal of drafts.** An `electronic_signatures` row joined to a `submission_filed_baselines` row
  `b` of the same organisation and submission, where:
  - `signed_target = 'submission-filed-baseline:'||b.id`;
  - `signer_id = b.declared_by`;
  - `signature_type 'governed-action'`;
  - `binding_basis 'filed-sequence-baseline-content-sha256'`;
  - the signature is live, with `created_at = LOCALTIMESTAMP`;
  - `(signature_manifest->'act'->'removedDraftSequences')::jsonb @> jsonb_build_array(NEW.sequence_number)`.

  `signGovernedAct` writes the signature after `run`, and the check runs at COMMIT, so the shipped declaration commits
  unchanged.
- **Otherwise:** `SEQUENCE_REMOVAL_UNRECORDED`, `ERRCODE integrity_constraint_violation`, with HINT "Retire it from its
  Dispatch tab in the Submission Center, which signs it."
- **Why case (a) needs no "written by this transaction" clause.** G2 makes a removal happen once per row, and sequence
  ids are never reused. So the one `ECTD_SEQUENCE_RETIRED` row for an id is the record of that id's only removal. The
  PGlite `audit_logs` fixture also has no `created_at` (`pglite-harness.ts:378-400`).

**G2 `ectd_sequences_removal_guard`.** `BEFORE UPDATE ON public.ectd_sequences FOR EACH ROW WHEN (OLD.deleted_at IS NOT
NULL OR NEW.deleted_at IS NOT NULL)`. Live-row updates skip it. It refuses:
- any change to a removed row (`to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)`), including clearing `deleted_at`:
  `SEQUENCE_REMOVED_IMMUTABLE`;
- a removal when `OLD.dispatch_status IN ('sent','acknowledged','transmitting')`: `SEQUENCE_FILED_NOT_REMOVABLE`. The
  list is `FILED_DISPATCH_STATUSES` plus `transmitting`, pinned equal by test C1-T14;
- a removal that changes any other column than `deleted_at` and `updated_at`: `SEQUENCE_REMOVAL_CHANGES_ROW`.

**Not guarded:** INSERT, DELETE, TRUNCATE, and leaves (§6).

---

## 3. The rules this design is held to, as applied

- **RULE 0.** Every commit is on `concept2cure-v2` and pushed there only.
- **RULE 1.** C1's migration is trigger-only and replayable. It is placed before the final sweep pair and amended in
  place, never by a later DROP. There is no unique index on (submission, region, number): a deployed tenant may hold
  duplicates, and `ADD CONSTRAINT` would fail every deploy.
- **RULE 3.** §1 is the "What already exists" section. Each commit's evidence README copies it, and each commit names
  its work as a completion.
- **RULE 4.**
  - No new card, panel, screen, component file or stylesheet edit.
  - The act lives in the existing Dispatch workspace as a native `<details className="pj-more">`.
  - Signing uses the one `EsignModal` mount.
- **RULE 5 and RULE 6.**
  - C1, C2 and C3 are all `Plan: L1` (paths `**`, row D7). The founder's record puts the act under "launch row D7
    (`Plan: L1`)" (`LAUNCH_DEFINITION_OF_DONE.md:1703`), and C3 is the act's only door for a person. Revised
    2026-11-02 from `Plan: S5` (§9.1 finding 5). Precedents for screen work under L1 are `ae3681cb9` (P-89, with its
    `AuthoringFilingBar.tsx`) and `3cacf2e15` (D7 work on `Submission*.tsx`).
  - Each commit carries `Completes:` with existing paths. C1 also names the folder its new file goes in
    (`Completes: server/services/submission-service`, plan §5.3, `ONE_DESIGN_PLAN.md:346-347`).
  - Nothing the gate counts is added: no surface, no mount (`/api/submissions` exists), no table, no route file, no AnA
    tool.
  - **The one new non-test file** is `sequence-retirement.ts`. It holds the retire act's new rules, placed inside the
    existing service folder `server/services/submission-service/` as re-plan step 29 allows, so that the 4,159-line
    `submission-service.ts` does not grow by them. It is new code, not a split: nothing moves out of
    `submission-service.ts`. `check-one-design-plan.mjs` :174-178 admits a new non-test file in an existing service
    folder.
- **Part 11.**
  - The signature carries a declared meaning (§11.50) and a reason, after re-authentication at the sign route.
  - It is bound to the leaf manifest (§11.70).
  - The act writes a chained audit row in the removal's transaction (§11.10(e)). The row's sealed `occurred_at` and the
    sequence's `deleted_at` are one instant, taken after the lock (D1).
  - The words the signer states are in the signed payload and in the chained details (D6).
  - A refused act voids its signature (P-23).
  - The database refuses an unrecorded removal (G1).
  - The task's general wording names `signGovernedAct`. This act uses the sequence's existing chain instead, for the
    reasons in §9 A1, flagged in §8.
- **Fail closed.**
  - A read failure is never a pass.
  - A missing environment counts as production.
  - A read-back failure never turns a committed act into a refusal: the answer comes from `RETURNING` and the act's
    own variables.
- **Each commit message body cites P-86.** `Founder-Decision:` is used only by `Plan: PLAN`. This session assigns no
  number.

---

## 4. The commits, in order

**Common to every commit:**
- **Red first.** Each new test is shown failing before its change, saved under `01-red/`.
- **Mutations.** Each is shown red on its own assertion, saved under `03-mutations/`.
- **Evidence:** `docs/evidence/D7-SEQUENCE-RETIREMENT/2026-11-0x/README.md`, with "What already exists" copied from §1.
  The README names `sequence-retirement.ts` as it is: the retire act's new rules, placed in the existing
  `server/services/submission-service/` folder so that `submission-service.ts` does not grow. It never calls it a
  split (§9.1 finding 6).
- **Gates:**
  - `node scripts/ci/check-one-design-plan.mjs --range origin/concept2cure-v2..HEAD`;
  - `npm run ci:one-product`;
  - `npm run audit:repo-health:ceiling`;
  - the touched suites.
- **Before the first edit,** fetch, read `.design/claude-convergence/COORDINATION.md`, and send the coordinator the
  package, step and file list (§7).

### C1 (re-plan step 29, L1-2a): the act and its database guard

- **Title:** "D7: retire an unfiled sequence by a signed act, on the drafts' own removal (P-86)"
- **Trailers:** `Plan: L1`, `Completes: server/services/submission-service` (the folder the new file goes in, plan
  §5.3; precedent `3cacf2e15`'s `Completes: server/services/shadow-review`),
  `Completes: server/services/submission-service/submission-service.ts`,
  `Completes: server/services/submission-service/filed-sequence-baseline.ts`,
  `Completes: server/services/auditService.ts`.
- **Files** (L1 is `**`):

  | File | Change |
  |---|---|
  | `server/services/submission-service/filed-sequence-baseline.ts` | Export `liveSetRemoval` (D1, with the optional instant). :197-202 runs it with `at = null`. |
  | `server/services/submission-service/sequence-retirement.ts` (**new file: the retire act's new rules, inside the existing service folder; nothing moves into it from `submission-service.ts`**) | `SEQUENCE_RETIREMENT_INTENT = 'retire'`, `ECTD_SEQUENCE_RETIRED_ACTION`, `retirementStatement(sequenceNumber)`, `readRetirementFacts` (checks 1–6 with 3b and 5b), `retirementRefusal`, `retirementPayloadRefusal`, `retirementMeaningRefusal`, `retiredSequenceRecord(q, org, id)` (the removed row plus its `ECTD_SEQUENCE_RETIRED` row, with the signer's name through `resolveActorNames`, `server/services/tenant/actor-names.ts`), and the sentences. It imports `filed-dispatch.ts`, `shared/regulatory/region-identity`, `shared/utils/utc-day.ts`, `server/services/ectd/package-identity.ts` (`readSubmissionPackageIdentity`, 3b) and `server/services/ectd/prior-sequence-loader.ts` (`loadFiledStateBySubmission`, 5b). None of these imports `submission-service.ts`, and this file never does, so there is no cycle. |
  | `server/services/submission-service/submission-service.ts` | See the list below. |
  | `server/services/auditService.ts` | `AuditLogEntry` gains optional `occurredAt`. `writeChainedAuditRow` uses it, normalised with `new Date(v).toISOString()` and throwing on an invalid value, in place of `new Date().toISOString()` (:282). With no `occurredAt`, every existing caller writes exactly the row it wrote before. |
  | `migrations/2026110x_ectd_sequence_removal_guard.sql` (new) | D9 |
  | `scripts/db/migration-set.mjs` | The entry, with a set comment naming P-86 and the backfill warning. |
  | `server/db/pglite-harness.ts` | An opt-in `{ sequenceRemovalGuard: true }`. It needs `submissionCore` and `governedSigning`, and refuses otherwise. It applies the migration after `20261029g`. |

  The changes to `submission-service.ts`:
  - `retire` joins `SequenceSignatureIntent`, `INTENT_LABEL` ('retirement') and `INTENT_MEANING_REFUSAL`;
  - `SEQUENCE_NOT_RETIRABLE: 409` joins the code union and `SUBMISSION_ERROR_STATUS`;
  - `ECTD_SEQUENCE_RETIRED` joins the `signatureSpentBy` list;
  - `applySequenceChangeWithAudit` gains `audit.reason`, accepts `update.params` as a function of the instant (D1:
    when it is one, the instant is read after `underLock` and passed to both the UPDATE and `writeChainedAuditRow` as
    `occurredAt`), and returns `{ rows, occurredAt }`;
  - new exports `retireSequence(input, ctx)` and `readRetiredSequence(id, ctx)`, plus the private
    `applySequenceRetirement`.
- **The act, `applySequenceRetirement`, in order:**
  1. `getSequence`. On NOT_FOUND, `retiredSequenceRecord`: a recorded retirement gives check 1's `INVALID_STATE`;
     otherwise NOT_FOUND stands.
  2. `governedSignatureVerdict(sig, 'ectd-sequence:'+id, ctx, 'retire', retirementPayloadRefusal(seq.sequenceNumber))`.
     A refusal gives `GOVERNED_REQUIRED`, on the P-34 wording: "A valid e-signature is required: sign
     ectd-sequence:ID via POST /api/c2c/actions/sign with intent 'retire', the meaning responsibility,
     notFiledElsewhere: true and the statement the precheck gives, then pass its actionId. Refused: …".
  3. `independentSignerRefusal` gives FORBIDDEN for the creator.
  4. `dispositionSignatureReason`. A null reason gives `GOVERNED_REQUIRED`: "The signature records no reason, so
     sequence NNNN was not retired; sign again with your reason."
  5. `readRetirementFacts` on the pool, then `retirementRefusal`, which gives `SEQUENCE_NOT_RETIRABLE`.
  6. `applySequenceChangeWithAudit`:
     - `underLock: recheckUnderSequenceLock(…, act: 'retirement', recheck: re-read facts on the client, re-apply
       retirementRefusal)`;
     - `text` from `liveSetRemoval(org, [id])`, and `params: (at) => liveSetRemoval(org, [id], at).params`. The instant
       is read after the lock and the recheck (D1);
     - `noRowsRefusal`: "Sequence NNNN changed while its retirement was being recorded, so it was not retired.";
     - the audit row is D5's, sealed with `occurredAt` = the same instant.
  7. The answer: `{ retired: true, sequenceId, sequenceNumber, region, retiredAt, signatureActionId, signatureId,
     meaning: 'responsibility', reason, numberFreed }`, from `RETURNING` and the act's own variables. `retiredAt` is the
     instant, which equals `deleted_at` and the sealed `occurred_at`.
  8. The whole runs inside `voidingSignatureOnRefusal(…, step: 'retire')`. A refusal ends with the existing sentence
     " The signature given for this retirement is now void; sign again for a new attempt."
- **Migration:** yes. Trigger-only (D9).
- **Red tests:**

  | Id | File | Asserts |
  |---|---|---|
  | T1 | new `server/services/submission-service/__tests__/sequence-retirement.pglite.test.ts`, on `_freeze-gate-fixture.ts` | A `dispatched`/`pending` 0000 whose only bound transmittals are staging is retired. `deleted_at` is set and nothing else changed. The `ECTD_SEQUENCE_RETIRED` row has `reason` in the column and in the details, the signature ids, `meaning`, `notFiledElsewhere`, `stagingTransmittalIds` and `numberFreed: true`. Then `createSequence` 0000 succeeds (step 4 present). `getSequence` of the old id answers NOT_FOUND. |
  | T2 | same | Refusals: 2a `sent`, 2a `acknowledged`, 2b `transmitting`, 3 a production-bound transmittal, 3 a bound transmittal with no environment, **3b a package-spine transmittal (`package_id` set, no `dispatchBinding`, `metadata {sequence: '0000', applicationId: <the program's number>, environment: 'production'}`, no `ECTD_TRANSMITTED` row), 3b the same with no environment, 3b matched by `program_id` alone**, 4 an `ECTD_TRANSMITTED` with `environment 'production'` and no transmittal, 5 a live unfiled 0001 ("Retire 0001 first"), 5 a filed 0001, a `transmitting` 0001 and a live unfiled 0001 whose number was sent as a package (each the "is kept" sentence), **5b a `sent` twin 0000 of the same submission with no bound `leafManifest` (read from compiles), plus a non-rehearsal compile numbered 0000**, 6 a filed IND safety report. Each answers its sentence, and the row stays live. **Admitted, by the same file:** a 3b package transmittal of 0000 that is `staging`, one of another application and program, and one of another region; and a 5b `sent` twin whose bound transmittal carries a `leafManifest` (read from what was sent). |
  | T3 | same | A duplicate live 0000 (inserted by bare SQL, as a legacy tenant could hold) is retired, with `numberFreed: false`. The twin is live and **unfiled** (`pending`), so check 5b does not apply; the filed, compile-read twin is T2's 5b case. |
  | T4 | same | Gate 1: intent `freeze` refused; meaning `approval` refused; `notFiledElsewhere` missing refused; **`statement` missing refused, and a `statement` that differs from `retirementStatement('0000')` by one character refused (the earlier "outside this platform" text among them)**; the creator refused (FORBIDDEN, with the sign row inserted by the fixture); no reason refused. On success, the `ECTD_SEQUENCE_RETIRED` details carry `statement` equal to `retirementStatement('0000')`. |
  | T5 | same | P-23: a refused retirement voids its signature, and the same signature is then refused as void. |
  | T6 | same | A read failure of the facts (the IND table renamed inside the test transaction) answers `INVALID_STATE` "could not be checked" and changes nothing. |
  | T7 | same | The under-lock recheck. The test wraps `readRetirementFacts` so that its first call (the pre-lock read) returns its facts, then inserts a production transmittal bound to the sequence. The act is refused by the recheck under the lock, and the row stays live. |
  | T8 | same | **One instant, the sealed one.** The test's `readRetirementFacts` wrapper reads `now()` on its under-lock call and waits 25 ms. Then the answer's `retiredAt`, the row's `deleted_at` and the `ECTD_SEQUENCE_RETIRED` row's `occurred_at` (the sealed field, not `created_at`) are one instant at millisecond precision, at least 25 ms after that `now()` (the time of BEGIN). `verifyAuditChain` (`server/services/audit/chain.ts:727`) over the tenant reports no break. |
  | T9 | same | After a retirement, a second POST with the same `signatureActionId` answers "was retired on … by …", and the retirement's signature stays in force (`verification_status` not `voided`; no `GOVERNED_SIGNATURE_VOIDED` row). |
  | T10 | new `server/services/submission-service/__tests__/sequence-retirement-rules.test.ts` (unit) | `retirementRefusal` order and sentences, 3b and 5b among them; no bare date (each ends " UTC"); the meaning and payload refusals; `retirementStatement('0000')` names "as a package sent from this platform" and does not contain "outside this platform". **`auditService` unit:** `writeChainedAuditRow` with `occurredAt` writes and chains that value; without it, it writes `new Date().toISOString()` as before; an invalid `occurredAt` throws before any INSERT. |
  | T11 | new `server/services/submission-service/__tests__/sequence-removal-guard.pglite.test.ts` (flag on) | A bare `UPDATE … SET deleted_at = now()` is refused at COMMIT (`SEQUENCE_REMOVAL_UNRECORDED`). A forged `ECTD_SEQUENCE_RETIRED` naming a `freeze`-intent signature is refused. Un-removal is refused. An edit of a removed row is refused. Removing a `sent` row is refused even with a record. A removal that also sets `status` is refused. The baseline's removal is admitted. Applying the migration twice leaves two triggers. |
  | T12 | `server/__tests__/routes/submission-filed-baseline.pglite.test.ts` | Re-run with `sequenceRemovalGuard: true`. "Removes an empty draft" commits **under** the guard. |
  | T13 | new `server/services/submission-service/__tests__/sequence-retirement-lock.pg.test.ts`, on `freeze-gate-row-lock.pg.test.ts`'s pattern | Two connections. A retirement of 0000 and a creation of 0001 serialize: whichever commits first, the other sees it (a refused retirement, or a creation after it). **With the second connection holding the sequence row `FOR UPDATE` for 500 ms before releasing it, the retirement's `deleted_at` equals its audit row's `occurred_at` on real PostgreSQL, and both are at least 500 ms after the retirement transaction's `now()`.** |
  | T14 | in T11 | G2's list equals `[...FILED_DISPATCH_STATUSES, 'transmitting']`, read from `filed-dispatch.ts`. |
  | T15 | `tests/db/vault-where-used.dbtest.ts:149` | The bare soft-delete runs inside `BEGIN; SET LOCAL session_replication_role = replica; …; COMMIT`, with a comment that a removed sequence is now made only by a recorded act. Fixture change only; the file's owner is told (§7). |

  `_freeze-gate-fixture.ts` gains, on its `sign()`, an optional extra payload and the `signer_id`,
  `signature_meaning` and `signature_type` columns. It is a test file, edited only after F1 slice 1 pushes its own
  changes to it (§7).
- **Mutations** (each red on its own assertion):

  | Id | Mutation | Goes red |
  |---|---|---|
  | M1 | drop check 2a | T2 sent |
  | M2 | drop check 2b | T2 transmitting |
  | M3 | drop check 3 | T2 production-bound |
  | M4 | treat a missing environment as staging | T2 no-environment |
  | M5 | drop check 4 | T2 audit-only |
  | M6 | drop check 5 | T2 0001 |
  | M6b | check 5 without judging the later sequence (always "Retire MMMM first") | T2 filed and transmitting 0001 |
  | M7 | drop check 6 | T2 IND |
  | M8 | drop the under-lock recheck | T7 |
  | M9 | drop `retirementPayloadRefusal` | T4 attestation |
  | M10 | drop `INTENT_MEANING_REFUSAL.retire` | T4 approval |
  | M11 | drop `ECTD_SEQUENCE_RETIRED` from the spent list | T9 |
  | M12 | drop the `reason` pass-through | T1 reason column |
  | M13 | drop G1 case (b) | T12 |
  | M14 | the act writes no audit row | T1, refused at COMMIT by G1 |
  | M15 | drop G2's removed-row clause | T11 un-removal |
  | M16 | drop G2's filed clause | T11 sent |
  | M17 | drop check 3b (2026-11-02) | T2 package-spine production send |
  | M17b | check 3b treats a missing environment as staging | T2 package-spine no-environment |
  | M17c | check 5 judges later sequences without 3b | T2 0001 sent as a package |
  | M18 | drop check 5b (2026-11-02) | T2 compile-read filed twin |
  | M18b | check 5b refuses any filed twin, whatever its basis | T2 admitted twin read from what was sent |
  | M19 | `retirementPayloadRefusal` checks only `notFiledElsewhere` | T4 one-character statement |
  | M20 | `liveSetRemoval` ignores `$3` (`deleted_at = NOW()`) | T8, T13 |
  | M21 | `writeChainedAuditRow` ignores `entry.occurredAt` | T8, T13, T10 auditService |
  | M22 | the instant read before `underLock` (right after BEGIN) | T8 (later than the BEGIN `now()` plus the wait) |
- **Extra gates:** `ci:migration-set-order`, `ci:migration-guard-order`, `ci:migration-drop-safety`,
  `ci:migration-deploy-path`, `ci:json-operator-types`, `ci:runtime-ddl`, `ci:sql-interpolation`,
  `ci:discarded-audit-write`, `ci:sign-ceremony`. The act writes no sign ledger row; it consumes one.
- **Words on screen:** none. This commit has no client change. The server sentences are D6's and the act's.
- **What a user sees:** nothing new until C3.
- **Depends on:** F1 slice 1 (bound environment on every bound transmittal; the fold's per-number `basis`, read by
  check 5b), slice 2 (a staging send leaves `pending`),
  step 4 (live-number refusal; CAS `isNull`, without which G2 would turn a raced transition into an exception), and
  step 8 (readiness live only).
- **Size:** medium.

### C2 (re-plan step 30, L1-2b): the door, the precheck, MCP, the verb pin

- **Title:** "D7: the retire door, its precheck, and MCP's word for a retired sequence (P-86)"
- **Trailers:** `Plan: L1`, `Completes: server/routes/submissions.ts`, `Completes: server/mcp/tools/catalog.ts`,
  `Completes: shared/navigation/surface-actions.ts`.
- **Files:**
  - **`server/routes/submissions.ts`:**
    - `POST /sequences/:seqId/retire`, beside :1514, with `limiter` and `requireRole(AUTHOR)`, body
      `{ signatureActionId: string(1..128) }`, and a header comment in the P-34 style naming the sign step, the codes
      and "no AnA tool reaches this door";
    - `governedPrecheckSchema.step` gains `'retire'`.
  - **`server/services/submission-service/submission-service.ts`:**
    - the `precheckGovernedStep` `'retire'` branch. It returns
      `{ step, cleared, refusal, retirement: { sequenceNumber, stagingSends: [{ sentOn }], numberFreed, statement } }`,
      where `statement` is `retirementStatement(sequenceNumber)`, the words the dialog shows and the signature carries
      (D6), and where
      `refusal` is D6's sentence, or, for the viewer who created it (`signerIndependenceOf` gives `author` or
      `unresolved`): "You created sequence NNNN, so you cannot sign its retirement. Another person with signing
      authority signs it.";
    - `createSequence`'s step-4 duplicate sentence gains: "A sequence never sent to the agency's production
      environment can be retired from its Dispatch tab, which frees its number." (Step 4's design asks for this once
      P-86 exists.)
  - **`server/mcp/tools/catalog.ts`:**
    - `c2c_get_sequence_status`: on NOT_FOUND, `svc.readRetiredSequence`. A recorded retirement answers ok: "Sequence
      0000 (fda) was retired on 2026-11-0x UTC by A. Signer (responsibility). Reason: …. It is kept as history; it is
      not sent, filed or built on." A removed row without a record answers: "Sequence 0000 (fda) is not in use; no
      retirement is recorded for it." Any other id keeps the existing refusal.
    - `c2c_list_sequences`: the empty sentence becomes "Submission #N has no sequence in use.", and the description
      adds "Sequences in use only; c2c_get_sequence_status reports a retired one."
    - Neither names the act, its route, its intent, its module or its audit action. The pin below scans `server/mcp`.
  - **`shared/navigation/surface-actions.ts`:** `GOVERNED_VERB_PATTERN` gains `retire`.
- **Migration:** none.
- **Red tests:**

  | Id | File | Asserts |
  |---|---|---|
  | T1 | new `server/services/ana/__tests__/ana-cannot-retire-sequence.test.ts`, the P-34 template | No AnA tool whose name matches `/retire/i` mentions a sequence. No source under `server/services/ana` or `server/mcp` matches `/retireSequence\b\|applySequenceRetirement\|ECTD_SEQUENCE_RETIRED\|SEQUENCE_RETIREMENT_INTENT\|sequence-retirement['"\`]\|sequences\/:seqId\/retire\|sequences\/\$\{[^}]+\}\/retire\|['"\`]retire['"\`]/`. The QMS strings (`'retire_qms_document'`, "retire the sop") do not match. Shown red by adding one `retireSequence` import to `AnaToolExecutor.ts`. |
  | T2 | new `server/routes/__tests__/submissions-sequence-retire.test.ts`, on `submissions-shadow-review-waive.test.ts`'s pattern | 400 on a bad body; the service is called with `{ sequenceId, signatureActionId }`; `SEQUENCE_NOT_RETIRABLE` maps to 409, `GOVERNED_REQUIRED` to 403, FORBIDDEN to 403, `INVALID_STATE` to 409. |
  | T3 | `server/routes/__tests__/submissions-leaf-remove-and-precheck.test.ts` | `step: 'retire'` is accepted and passed through. |
  | T4 | T1 of C1's pglite suite, extended | The precheck answers `cleared: true` with `stagingSends`, `numberFreed` and `statement` (equal to `retirementStatement('0000')`) for the D7 case. It answers the author sentence for the creator, and D6's sentence otherwise. It changes nothing. |
  | T5 | new `server/mcp/__tests__/sequence-status-retired.test.ts` | The retired, removed-without-record and foreign-organisation answers; the list's empty sentence. |
  | T6 | `shared/navigation/__tests__/surface-actions.test.ts:80-101` | `submissions.retire-sequence` joins the bad list; the good list stays green. |
  | T7 | step 4's pglite test | The duplicate refusal names retirement. |
- **Mutations:**

  | Id | Mutation | Goes red |
  |---|---|---|
  | M1 | drop `'retire'` from the schema enum | T3 |
  | M2 | drop the author branch | T4 creator |
  | M3 | drop the MCP retired branch | T5 |
  | M4 | drop `retire` from the pattern | T6 |
  | M5 | import `retireSequence` into an AnA file | T1 |
  | M6 | the precheck omits `statement` | T4 |
- **Words.** The MCP sentences above, and the `createSequence` sentence. No screen.
- **What a user sees:**
  - an MCP client asking about a retired id is told it was retired, with when, by whom and why;
  - a person creating a duplicate number is told retirement exists.
- **R1 inventory.** The new POST has no client caller until C3. Push C2 and C3 together, as two commits in one push.
- **Size:** small to medium.

### C3 (re-plan step 31, filed under L1 row D7 by P-86's record): on screen, on D7-A2's layout

- **Title:** "D7: retire a sequence from the foot of the Dispatch tab (P-86)"
- **Trailers:** `Plan: L1`, `Completes: client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`,
  `Completes: client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`. The message body cites P-86 and launch row D7.
  (Revised 2026-11-02 from `Plan: S5`, §9.1 finding 5. L1's paths are `**`, so the ledger needs no change.)
- **Files:** those two and client tests. **No new component file, no stylesheet edit, no D0-locked file.**
- **Needs:** D7-A2 (step 20) landed, so the select is on the context row and the workspaces are `.pj-sec`.
- **`SubmissionSeqWorkspaces.tsx`:**
  - **Types.** `GovernedKind` gains `'retire'`, and `GovernedPrecheck` gains `retirement?` (with `statement`).
  - **The disclosure.** `<details className="pj-more" data-testid="retire-sequence">` is the **last block of
    `DispatchWorkspace`, outside the readiness conditional**, so a sequence whose readiness read fails can still be
    retired. It is closed by default.
    - Its `<summary>` reads "Retire sequence NNNN…".
    - On open, it asks `POST governed-precheck { step: 'retire' }`, and it asks again on every open. `SeqRow` carries
      no `dispatchStatus` (`SubmissionSeqWorkspaces.tsx:85-92`), so the disclosure keeps no answer across a close.
    - States are below.
    - The button calls `onGoverned(seq, 'retire')` **only after its own fresh precheck clears**. A refusal at the click
      is shown inside the disclosure as `role="status"` and receives focus; it is never shown off screen.
    - No tinted box, no chip, no id.
  - **`DossierTransmissions`** gains a `sequenceId` prop. Its one caller (`SubmissionSeqWorkspaces.tsx:2009`) passes
    `seq.id` beside `seq.sequenceNumber`. Its row type gains `metadata.dispatchBinding?: { sequenceId?: number }`. The
    list route already returns the whole `metadata` (`server/routes/mdx-submission-gateway.ts`,
    `GET /api/mdx/gateways/transmittals`). It marks each row:
    - `t.metadata?.dispatchBinding?.sequenceId === sequenceId` reads "(this one)";
    - a binding to another id with the same number reads "(another sequence numbered NNNN)";
    - an unbound row of the same number reads "(this number)".
- **`SubmissionCenter.tsx`:**
  - `GOVERNED_LABEL.retire = 'Retirement'`, `GOVERNED_PAST.retire = 'retired'`.
  - **The statement travels from the precheck.** `precheckRefusal` (:788) also returns the answer's `retirement`.
    `requestGoverned` (:814-830) puts `retirement.statement` in the flow as `flow.statement`. A cleared `retire`
    answer without a `statement` counts as unreadable: "Whether the server would accept this could not be checked".
  - `runGoverned`'s sign payload adds `notFiledElsewhere: true, statement: f.statement` when `f.kind === 'retire'`.
    The server compares the words exactly (D6). The client holds no copy of the text.
  - `ownAct.retire = runRetire`. It posts `POST /api/submissions/sequences/:id/retire { signatureActionId }` and
    accepts success only on `retired === true && sequenceId === f.seq.id`. Then it sets the notice and bumps the
    sequences. On any other answer it throws the server's words, which the modal shows.
  - The `EsignModal` branches for `retire`:

    | Prop | Value |
    |---|---|
    | `action` | "Retire sequence" |
    | `targetMeta` | `` `${regL(flow.seq.region)} · takes the sequence out of use; nothing is sent to the agency; cannot be undone` ``. **The retire branch is built without the shared `ectd-sequence:${flow.seq.id}` key** (:1922), so no record key is on screen (§9.1 finding 4). The other kinds keep theirs (§6.18). |
    | `defaultMeaning` | `'responsibility'` |
    | `meanings` | `['responsibility']` |
    | `renderMeaningDetails` | "By signing, you state:" followed by `flow.statement` as one quoted paragraph, word for word (D6). |
    | `signedRows` | `[{ label: 'Stated', value: flow.statement }]`, the same string. |

- **Words on screen, by state:**

  | State | What the person sees |
  |---|---|
  | S0 closed | At the foot of Dispatch, quiet: "Retire sequence 0000…". |
  | S1 reading | "Checking whether sequence 0000 can be retired…" (`role="status"`). |
  | S2 offered | One paragraph: "Retiring takes sequence 0000 out of use. Nothing is sent to the agency. Its leaves, compiles, its test send of 2026-10-30 UTC and its signatures stay recorded as history; it is no longer listed, built on or sent. Its number, 0000, becomes free, so a corrected sequence 0000 can then be started from the Builder. Retirement cannot be undone." Then `btn ghost small` "Retire sequence 0000". With no sends, the test-send clause is omitted; with several: "its 3 test sends". With `numberFreed: false`: "Another sequence 0000 is in use, so the number stays taken." |
  | S3 not offered | The server's sentence (D6) as a plain `role="note"`, and no button. |
  | S4 the creator | "You created sequence 0000, so you cannot sign its retirement. Another person with signing authority signs it." No button. |
  | S5 read failed | "Whether sequence 0000 can be retired could not be checked. Close this and open it again to retry." No button. Never "not retirable". |
  | S6 signing | The one signature dialog, as in the props table above: action "Retire sequence", the target line ("FDA (US) · takes the sequence out of use; nothing is sent to the agency; cannot be undone"), meaning Responsibility only, the statement ("By signing, you state: “Sequence 0000 has not been filed with the agency by any route: not by a send from this sequence, not as a package sent from this platform, not from an export, and not by courier or any other route.”"), reason, password and code. |
  | S7 refused at the act | The dialog shows the server's sentence inline, ending "The signature given for this retirement is now void; sign again for a new attempt." Nothing changed. |
  | S8 retired | The page notice: "Sequence 0000 is retired, signed by A. Signer (responsibility). Its number is free: start sequence 0000 again from the Builder." (or "Sequence 0000 is retired, signed by A. Signer (responsibility). Another sequence 0000 is in use, so the number stays taken."). **No signature id and no record key** (plan §2's retired patterns, §9.1 finding 4). The signature's id stays in the audit trail and in the act's answer, and is not shown, not even in a `title`. The sequence leaves the picker, and the selection falls to a remaining sequence, as today. When none remains, the Builder offers "Start sequence 0000". The sibling notices (:888, :920, :939, :960) still print their ids. That is not changed here, and no existing pass removes it (§6.18). |
  | S9 the replacement 0000′, Dispatch | Under "Transmissions and acknowledgements", the old staging sends read "Transmittal #12 · sequence 0000 (another sequence numbered 0000) … (staging)". |

- **Red tests:**

  | Id | File | Asserts |
  |---|---|---|
  | T1 | new `client/src/concept2cure/v2/__tests__/dispatchWorkspaceRetire.test.tsx`, on `dispatchWorkspaceFreezeGate.test.tsx`'s pattern | S0–S5. The disclosure renders when the readiness read fails. The button is absent in S3, S4 and S5. A refusal at the click is shown inside the disclosure and focused. |
  | T2 | same | The modal offers only Responsibility and shows the statement. The precheck's `statement`, the text in `renderMeaningDetails`, the `signedRows` value and the sign payload's `statement` are one string. The sign POST carries `{ intent: 'retire', meaning: 'responsibility', notFiledElsewhere: true, statement }`, then the act POST carries `{ signatureActionId }`. A cleared precheck without `statement` opens no dialog. S8's notice appears. **Neither the S8 notice nor the dialog's target line matches `/\b[a-z-]+:\d+\b/` or contains the act's `actionId` or `signatureId`.** S7's server sentence appears inline. A 200 without `retired: true` is not a success. |
  | T3 | same | `DossierTransmissions`' three markings. |
  | T4 | `client/src/concept2cure/v2/__tests__/submissionCenterLifecycleQa.test.tsx` | The existing freeze, dispatch and transmit flows are unchanged. |
- **Mutations:**

  | Id | Mutation | Goes red |
  |---|---|---|
  | M1 | move the disclosure inside the readiness conditional | T1 failed read |
  | M2 | offer `approval` | T2 |
  | M3 | drop `notFiledElsewhere` from the payload | T2 |
  | M4 | mark "(this one)" by number | T3 |
  | M5 | treat any 200 as success | T2 |
  | M6 | put "server-confirmed under signature ${actionId}" back in S8's notice | T2 no id |
  | M7 | the retire branch keeps the shared `ectd-sequence:${id}` prefix in `targetMeta` | T2 no record key |
  | M8 | the client renders its own copy of the statement instead of `flow.statement` (the earlier "outside this platform" text) | T2 one string |
- **Done** only when opened and used in the running app (RULE 4). A test-sent 0000 is retired, 0000 is started again,
  and the replacement's Dispatch tab is read. Screenshots of S0, S2, S6, S8 and S9 go in the evidence. Keyboard: the
  `<summary>` is focusable, and Enter opens it. Reduced motion: no motion is added.
- **Size:** small to medium.

---

## 5. Order and dependencies

1. **Land first:** F1 slice 1 (step 1), slice 2 (step 2), step 4, step 8, then D7-A1 and D7-A2 (steps 19 and 20).
2. **C1** after step 8, and after S9-4 (step 28), which inserts into `migration-set.mjs` first (item 5).
3. **C2 and C3** pushed together, after C1 and after D7-A2. All three are `Plan: L1` (row D7).
4. **P-87** (step 35) touches `ind-lifecycle/sequence.routes.ts` and two `server/services/` files that this design does
   not touch. The two can land in either order.
5. **P-88 and S9 share one file with this design: `scripts/db/migration-set.mjs`** (corrected 2026-11-02, §9.1
   finding 7). The earlier "shares no file" was false.
   - S9-4 (step 28, `s9-p88-commitments.design.md` C4, :764, :782, :788) and P-88's correction (step 36, that
     design's C5, :1031, :1288) each insert a column-only migration directly above `UUID_TENANT_ISOLATION_NONPUBLIC`.
     So does C1 (D9).
   - **One hold.** All three are RIM's, so RIM asks the coordinator once for the `migration-set.mjs` hold before
     step 28, and keeps it through step 36, or asks again before each if the coordinator prefers.
   - **One order, the re-plan's:** step 28's entry, then C1's, then step 36's. Each goes directly above
     `UUID_TENANT_ISOLATION_NONPUBLIC`, after any entry an earlier step added. They alter and guard different tables
     (`commitment_milestones` at step 28, `regulatory_commitments` at step 36, `ectd_sequences` here; that design
     :889, :1154), so the order does not change what any file does.
   - **Each commit re-reads the tail after a fetch** and before its edit. `ci:migration-set-order` pins the tail.

---

## 6. Owed, and named (not fixed here)

1. **IND records filed in the sequence.** Retirement is refused (check 6). Returning those records to draft in the
   retirement's transaction (the map's C1b) is owed. Until then, a sequence the IND lifecycle created with filed
   records cannot be retired. The coordinator decides whether D7 needs it. The D7 0000 started in Submission Center has
   none.
2. **Rehearsal by number** (`prior-sequence-loader.ts:381-410`). When a replacement 0000′ has no compile yet,
   rehearsing 0001 reads the retired 0000's latest compile. This is validation advice only: the filed path reads the
   bound transmittal after slice 1. It goes to S5 (step 34).
3. **The release signature, by number** (`release-signature-status.ts:341-400`). A run signed over the retired 0000
   could be matched to a replacement with identical leaves. Dispatch still needs the replacement's own Gate 1
   signatures. Low; S5.
4. **The project hold** (`server/routes/c2c/projects.ts:1924-1934`). A project whose only frozen or dispatched sequence
   was retired is no longer held from deletion, which is a soft delete that keeps every row. Handed to the coordinator,
   who holds the file.
5. **Compile history by number.** EctdCompile lists a retired sequence's compiles under the same number as its
   replacement's. The compile-to-sequence link was dropped by the re-plan (§2). S5.
6. **DELETE and TRUNCATE** of `ectd_sequences` and `submission_leaves` are not guarded, as P-41 and P-88 leave the
   commitments' DELETE gap. There is no purge role and no SECURITY DEFINER function.
7. **The leaves of a retired sequence have no database guard.** Every application writer refuses them
   (`lockSequenceForLeafWrite`), and the audit row's `boundDigest` makes a later change detectable.
8. **Legacy staging-`sent` sequences** (sent before slice 2) are `sent`, so they are not retirable. Slice 2's runbook
   query finds them, and a person decides. They become retirable only after a recorded correction of
   `dispatch_status`.
9. **A production attempt that never connected** leaves a production transmittal row, so it blocks retirement. This is
   fail closed, and no act here clears it.
10. **Duplicate live numbers under a live later sequence.** Check 5 has no exemption for them. Retire the later one
    first.
11. **`createSequence` accepts a number that leaves a gap**, before or after a retirement. This is pre-existing. A freed
    number is reachable in the Builder only when it is the highest, which check 5 ensures.
12. **The document submit route** (`server/routes/c2c/documents.ts` `POST /:id/submit`, which has no client caller)
    accepts a dispatched, unsent sequence as filing evidence, so its ledger can name a sequence later retired. This is a
    pre-existing defect: a test-sent sequence was never a filing. It is owed to S1's owner: accept only the filed set
    (`filed-dispatch.ts`).
13. **AnA's own sequence reads** answer "not found" for a retired id. That is honest. MCP and the audit trail say
    "retired".
14. **No history view on screen.** Retired sequences are not listed in the picker, and there is no retired record view.
    Their record is the notice at the time, the audit trail, MCP, and the replacement's transmissions list. A history
    view is S5's, if the founder wants one.
15. **The baseline's removal writes no `ectd_sequence` audit row per draft**, only its signature manifest. This is
    unchanged; it is not P-86's.
16. **The filed fold keys compiles by (submission, number)** (added 2026-11-02, §9.1 finding 2). A filed sequence with
    no bound `leafManifest` is read from every compile of its number, in any region of the submission, including a
    twin's. This predates P-86, and nothing deletes a compile, so retiring a twin never changed what the fold reads.
    Check 5b keeps the act from sealing that state under a false "no longer built on". It goes to S5's one fold
    (step 34). The compile-to-sequence link was dropped by the re-plan (§2), so the fix there is a founder or
    coordinator question, not this design's.
17. **Package-spine filings are invisible to the sequence spine** (added 2026-11-02, §9.1 finding 1). This predates
    P-86. A Submission Center sequence 0000 that was never retired can still be sent to production as a second 0000
    of a number the package spine already filed for the same application. `createSequence`, `filingOrderRefusal`
    and the transmit guard never read package transmittals or the package's filed history. Check 3b refuses only the
    retirement. It does not stop that send. Owed to F1 (the transmit guard refuses a production send of a number
    already in a package's filed history for the same application), through the coordinator.
18. **The sibling notices and dialog lines still print ids** (added 2026-11-02, §9.1 finding 4). The other
    governed acts' success notices (`SubmissionCenter.tsx:888`, :920, :939, :960) end "server-confirmed under
    signature act_…". Every other kind's `targetMeta` (:1922) prints `ectd-sequence:<id>`.
    That is plan §2's retired pattern, already on screen. C3 adds no instance and changes none: they are other acts'
    copy. D7.md §A.4 (D7-A1) has no copy pass that removes them, and D7-A2 strips record keys only from blocker
    sentences. Owed to the D7 screen package (RIM holds `SubmissionCenter.tsx` under L9). The coordinator is told, so
    that D7.md gains the step.

---

## 7. Coordination (send before each commit's first edit)

| File | Holder now (origin `7be209e9c`) | Commit | Action |
|---|---|---|---|
| `submission-service.ts` | RIM (F1 slice 2 hold) | C1, C2 | Same session. Start after slice 2 and step 4 are pushed. |
| `filed-sequence-baseline.ts` | unheld; author `01E8btkB…` | C1 | Message through the coordinator: an export plus a one-line call; behaviour unchanged, pinned by T12. |
| `scripts/db/migration-set.mjs` | unheld (released in `32922d0e6`) | C1 | Ask the coordinator for the hold, the same one S9-4 (step 28) and P-88's correction (step 36) need. Insert after step 28's entry, directly above `UUID_TENANT_ISOLATION_NONPUBLIC` (§5 item 5). Re-read the tail after a fetch. |
| `server/db/pglite-harness.ts` | unheld | C1 | Additive flag; tell the coordinator. |
| `server/services/submission-service/__tests__/_freeze-gate-fixture.ts` | F1 slice 1 (RIM), modified in the working tree now | C1 | Edit only after F1 slice 1 pushes; rebase on a fresh fetch. Its `sign()` gains optional fields only, so slice 1's tests are unchanged. (Added 2026-11-02, §9.1 finding 7.) |
| `server/services/auditService.ts` | unheld | C1 | Optional `occurredAt` only; every existing caller unchanged. Tell the coordinator. (Added 2026-11-02, §9.1 finding 3.) |
| `tests/db/vault-where-used.dbtest.ts` | Vault owner | C1 | Fixture change only, through the coordinator. |
| `server/routes/submissions.ts`, `server/mcp/tools/catalog.ts` | unheld | C2 | Tell the coordinator. |
| `shared/navigation/surface-actions.ts` | unheld; busy | C2 | Rebase on a fresh fetch. |
| `SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx` (C3 is `Plan: L1`) | RIM (L9: D7-A1/A2; slice 2 copy); `017CFk…` (`ShadowRunCoverage`); `01T2wooC…` | C3 | After D7-A2. Message `017CFk…` and `01T2wooC…`. |
| `SubmissionCenter.tsx` | MDX journey `01P6GW…`, open request to RIM: "M4 needs a per-row pathway door in `SubmissionCenter.tsx` (`onOpenPathway`)" (`origin/concept2cure-v2:.design/claude-convergence/COORDINATION.md:30`, from `4bef8ac4f`) | C3 | Sequence M4 with C3 through the coordinator. They touch different parts of the file: M4 adds a per-row door, and C3 adds the retire branches of `GOVERNED_LABEL`, `runGoverned`, `ownAct` and the `EsignModal` props. Whichever lands second rebases on a fresh fetch. (Added 2026-11-02, §9.1 finding 7.) |

---

## 8. Flags for the coordinator

1. **The decision record is on trunk now** (`5e3652dbf`, an ancestor of `042293ade`;
   `LAUNCH_DEFINITION_OF_DONE.md:1691-1704`). It names no ceremony and no meaning, and it files the act under L1 row
   D7 (§0). Resolved; re-read it once more before C1 in case it is amended.
2. **The ceremony.** The task's general wording says "signed governed acts via signGovernedAct". This act uses the
   sequence's existing two-step chain (D2; §9 A1). Confirm it, or apply A1's alternative.
3. **Eligibility narrows the decision's words, and never widens them:**
   - checks 2b (in flight), 3b (the number was sent to production as a package for the same application), 4 (legacy
     send record), 5 (top-down), 5b (a filed twin read from compiles) and 6 (IND records);
   - the attestation, now with its words in the signed payload.
   Each is the minimum for "unfiled" to be true and "freeing its number" to hold in the product. 3b goes beyond "no
   production send is bound to it". It reads a send bound to no sequence, because the agency already holds that
   number for the application, so the number is not free. If the coordinator reads the record otherwise, it wins.
4. **C1b (reopen IND records)** is owed, not built (§6.1). Decide whether D7 needs it.
5. **A P-number collision.**
   `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/designs/f1-filed-is-what-was-sent.design.md:177`
   calls F1 slice 2 "decision P-86". Slice 1's and slice 2's commits and READMEs must not carry that phrase.
6. **Two pre-existing gaps found by the review** are named, not fixed: §6.17 (the transmit guard does not read
   package-spine filings, for F1) and §6.18 (sibling notices print ids, for D7's screen package; D7.md has no step for
   it).

---

## 9. Critique and resolution: the alternatives rejected

| # | Alternative | Decision | Why |
|---|---|---|---|
| A1 | **Sign through `signGovernedAct`** (one step, as the baseline does), as the task's general wording says | Rejected | (1) **Zero duplication.** A sequence already has one ceremony: five acts sign `ectd-sequence:<id>` through `/api/c2c/actions/sign` and Gate 1. A second ceremony on the same target would be a parallel path. (2) **Separation of duties.** `signGovernedAct` does none (`governed-signed-act.ts:69-72`). On this target the sign route refuses the creator for every non-authorship meaning (`actions.ts:680`). A one-step act would write a creator's `responsibility` signature on a target whose own route refuses it. (3) **An ordering trap.** `run` executes before `persistGovernedSignSignature`, and the binder reads the sequence `deleted_at IS NULL`. A removal in `run` makes the leaf-manifest binding fall back and refuse (`SIGNATURE_CONTENT_UNBOUND`); only `afterSign` would work. (4) **The client** has one path to a sequence signature (`requestGoverned` → `EsignModal` → `runGoverned`); a one-step POST would be a second. (5) The chain already has P-23 voiding, the digest re-checked under the lock, and `ownAct`. **Alternative if the record requires it:** `signGovernedAct` on `ectd-sequence:<id>`, with `contentBasis: ECTD_SEQUENCE_LEAF_MANIFEST`, the removal and audit row in `afterSign`, `assertSignerIsNotAuthor` in `precheck` and `run`, and G1 case (a) changed to the same-transaction signature, as case (b). Everything else stands. |
| A2 | A `retired` status, or a new retirement table | Rejected | Every reader filters `deleted_at` already (D8). A status would leave the row live to all of them, keep its number taken and need every reader changed. A table is refused by RULE 6 and is not needed: the audit row is the record. |
| A3 | P-51's `retirement` meaning | Rejected | D3: "withdraw this document" is QMS wording, and "withdrawal" is a filed eCTD sequence type. Narrowing it would edit the shared `esignMeanings.ts`. |
| A4 | `approval` or `release` beside `responsibility` | Rejected | Nothing is approved or released. One meaning keeps the record unambiguous. |
| A5 | Eligibility exactly as the decision's words (filed set plus bound production transmittal) | Rejected, narrowed | Without 2b, a send in flight could be retired under it. Without 4, a legacy production send that the agency rejected (`rejected`, no binding) is retirable. Without 5, a retired 0000 under a live 0001 is "free" but unreachable in the Builder, and 0001's lifecycle loses its prior. Without 6, a 15-day IND safety report stays "filed" in a sequence the agency never gets, and leaves the overdue feed. |
| A6 | Reopen the IND records in the same act (the map's C1b; the older design's R-6) | Deferred, owed | It is not needed for the D7 case. It writes three more tables and three audit actions. §6.1. |
| A7 | Bind `dispatchStatus` and `transmitAttemptId` in the signature payload (old critique #6; the map's R7) | Rejected | Eligibility is re-judged under the row lock. A send that starts in the window makes the row `transmitting` and is refused. A staging send that completes in it leaves the sequence eligible, and the signer's statement still holds. The leaf manifest the signature binds is the content. |
| A8 | An attestation checkbox | Rejected | The statement sits inside the one ceremony (`renderMeaningDetails`, `signedRows`), and the payload field is checked by Gate 1. Signing is the act of stating. |
| A9 | `SequenceRetirement.tsx`, or any panel or card (old design) | Rejected | RULE 4. D7.md adds no component file. A `pj-more` in `DispatchWorkspace` is the pattern. |
| A10 | A retired-sequences list (`GET …/sequences/retired`), a picker optgroup and a retired record view (the map's C2 option and C3) | Deferred | Not needed by the decision. The notice, the audit trail, MCP and the replacement's transmissions say what happened. §6.14. |
| A11 | Keep the retired id selected after the act (old critique #32) | Rejected with A10 | Without a retired view there is nothing to show. The notice states the outcome, and the existing fallback selects a live sequence. |
| A12 | A leaf guard on `submission_leaves` (old R-13, the map's G3) | Rejected | It adds a lookup to every leaf write. Every application writer already refuses, and the audit row's digest detects a change. §6.7. |
| A13 | A DELETE and TRUNCATE guard with a purge exemption (old R-13) | Rejected | P-88: no purge role, no SECURITY DEFINER function. §6.6. |
| A14 | The old design's deferred trigger as written | Replaced | It refused the baseline's shipped removal. G1 case (b) admits it, and T12 pins that. |
| A15 | A "written by this transaction" clause on the retirement's audit row (`created_at = LOCALTIMESTAMP`) | Not needed | G2 makes removal once-only, and ids are not reused, so the one retirement row is this removal's record. The PGlite fixture has no `created_at`. Against a database-level actor, the clause adds nothing. |
| A16 | SoD in the guard (`signer_id <> created_by`; the map's G1) | Rejected | The sign route and the act enforce it. The guard proves the signed record exists, as the baseline's and the commitments' guards do. |
| A17 | Move the removal into a new shared helper file (the map's `takeSequencesOutOfLiveSet`) | Rejected | Exporting it from where it lives is the literal reuse, and needs no new import in the baseline. |
| A18 | All the rules inside `submission-service.ts` | Rejected | The act's new rules go in a new file inside the existing service folder, as re-plan step 29 allows, so the 4,159-line `submission-service.ts` does not grow by them. It keeps the pure rules unit-testable. (Revised 2026-11-02: this is not a split, and P-34's and P-35's rule modules were new files in `server/services/ectd/`, not splits either; `c3ff59ae6`, `3624fe667`. §9.1 finding 6.) |
| A19 | A unique index on (submission, region, number) | Rejected | RULE 1, corollary 1: duplicates may exist on a deployed tenant. Step 4 enforces it in code. |
| A20 | The retirement takes the submission `FOR UPDATE` (old critique #3, #17) | Not needed | `FOR SHARE` already conflicts with step 4's `FOR UPDATE`. T13 shows the serialization. |
| A21 | Refuse drafts; retire only dispatched sequences | Rejected | The decision covers any unfiled sequence. After step 4, a draft's number is otherwise held forever. |
| A22 | Retire from the Builder's Sequences row | Rejected | The re-plan places it on Dispatch, where sends and their state are shown. |
| A23 | The old design's test-endpoint verdicts, `test-sent`, `dispatch-status.ts` and `test-environment-sends.ts` | Dropped | Re-plan §2. They are restated on trunk's facts as checks 2–4. |
| A24 | A broad `SEQUENCE_RETIRED` refusal across about 12 readers (old R-17), and a retired-leaves MCP read | Dropped | Every reader already fails closed with "not found" (D8). MCP's status is the one reader that must say "retired", and it does so from the audit row. |
| A25 | The old critique items kept here | Kept | #2 (IND records, as a refusal), #4 (attestation), #11 and #20 (top-down with a kept-dependant sentence), #12 (one clock: `deleted_at` equals the audit row's sealed `occurred_at`, one instant taken after the lock; revised 2026-11-02, it said `created_at`), #37 (closed disclosure), #38 (refusal shown in place), #48 (transmissions by binding), #49 (the answer from `RETURNING`). |

### 9.1 Review findings, 2026-11-02: each applied, with the code it rests on

Seven findings survived review. Each was re-read against `origin/concept2cure-v2` at `042293ade` and the working tree
at `609ef94c7`. All seven are applied. Where a finding's proposed fix was wrong in a detail, the code that shows it is
named and the fix is corrected. None is rejected.

| # | Finding (severity) | Decision | What changed, where | The code it rests on |
|---|---|---|---|---|
| 1 | The "not filed elsewhere" statement left out the platform's own package sends, and no check read them, so a number already filed at FDA could be freed and filed again (major) | **Applied, with three qualifications.** (a) The root cause predates P-86: the sequence spine never reads package-spine filings, so an unretired Submission Center 0000 can still go to production as a second 0000. 3b refuses the retirement only; that send is §6.17, owed to F1. (b) 3b goes beyond the record's "no production send is bound to it", so it is listed as a narrowing (§8 flag 3). (c) It is reachable only through the raw API or AnA's 510(k)-labelled transmit, so it is fixed as a real gap, but "major" overstates it. | §1.4 (the package spine, by path); D6 check 3b, with its refusal sentences; check 5 judges later sequences by 3b too; the attestation rewritten as one statement, `retirementStatement`, with no client copy; the payload carries `statement`, compared exactly by `retirementPayloadRefusal`; D5 details carry it, so the chained `payload_hash` covers it; D2's payload; C2's precheck returns it; C3 renders it in `renderMeaningDetails` and `signedRows` from the flow; tests C1-T2 (3b cases, admitted cases), C1-T4 and C1-T10 (statement), C2-T4, C3-T2; mutations C1 M17, M17b, M17c, M19, C2 M6, C3 M8; §6.17; §8 flags 3 and 6. | `governed-transmit-checks.ts:95-123` (`metadata.sequence`, `applicationId`, `environment`); `submission-service.ts:2922` (the only `dispatchBinding`); `submission-service.ts:2969` and `fda-esg-receipts.ts:120` (the only `ECTD_TRANSMITTED` writers); `governed-transmit.ts:410-447`, :425 (production sends go into the filed history); `governed-transmit.ts:500-508` (no client descriptor outside dev and test, so `package_id IS NOT NULL` holds); `mdx-submission-gateway.ts:343` and `mdx-command-handlers.ts:795-830`, :1130 (still reachable); `package-identity.ts:292-345` (the submission's application number for the region, which `transmitSequence` stamps); `submissions.program_id` (`shared/schema/submissions.ts:60`). |
| 2 | D7 claimed the filed fold never reads a retired sequence's compiles; false for a filed twin of the same number read from compiles (minor) | **Applied, with two corrections to the proposed check.** (a) The check has **no region filter**, because the fold's compile join has none: `ectd_compilations` carries neither a region nor a sequence id. A "same canonical region" filter would miss a twin in another region that the fold still reads. (b) The check **reuses the fold's own read**, `loadFiledStateBySubmission(...).sequences[].basis === 'compiles'`, so it adds no second copy of the fold's "what was sent" predicate (zero duplication). The overstatement is noted too: nothing deletes a compile, so retiring the twin never changed what the fold reads, and only made a false claim permanent. 5b refuses so that the record does not say "no longer built on" when that is untrue. | §1.4 (the fold reads by number); D6 check 5b and its sentence; D7's compiles row corrected; D8's fold row corrected; T3 states that its twin is unfiled; C1-T2 5b case and its admitted case (a twin read from what was sent); mutations M18, M18b; §6.16 (S5 step 34); C1's dependency on slice 1's `basis`. | `prior-sequence-loader.ts:248-300` (working tree: `JOIN ectd_compilations c ON c.organization_id = $1 AND c.submission_id = $2 AND c.sequence_number = f.sequence_number`, and `NOT EXISTS (SELECT 1 FROM sent x WHERE x.sequence_number = f.sequence_number)`); origin :215; `shared/schema.ts:8851-8915` (no region, no sequence id); `loadFiledStateBySubmission` :328-358 (exported; `basis` per number); `f1-filed-is-what-was-sent.design.md` step 2 (compiles kept for sends before slice 1). |
| 3 | "One instant" was checked against the wrong timestamp: `deleted_at` was BEGIN's `NOW()`, not the time sealed into the audit row (minor) | **Applied.** One instant, `date_trunc('milliseconds', clock_timestamp())`, is read on the transaction's client after `underLock`. It is passed to the UPDATE (`liveSetRemoval`'s `$3`), to `writeChainedAuditRow` as a new optional `occurredAt`, and to the answer as `retiredAt`. One detail is added that the finding did not name: the value must have millisecond precision, because the chain verifier re-derives `occurred_at` with `toISOString()`. | §1.2 (the sealed time, BEGIN before the lock); D1 "The time", rewritten; `liveSetRemoval` gains the optional instant, with the baseline binding `null`; `applySequenceChangeWithAudit` takes `params` as a function of the instant and returns `{ rows, occurredAt }`; C1 adds `server/services/auditService.ts` (optional `occurredAt`; trailer and §7 row); act step 6 and 7; T8 (25 ms wait, `occurred_at`, chain verified), T10 (`auditService` unit), T13 (500 ms row lock, `occurred_at`); mutations M20, M21, M22; A25 #12 corrected. | `submission-service.ts:1299-1300` (BEGIN, then `underLock`, then the UPDATE); `auditService.ts:282` (`new Date().toISOString()` after the UPDATE, into `computeAuditChainSealed` and `occurred_at`); `audit/chain.ts:8-9` (the chain covers `occurred_at`, not `created_at`) and :260-262 (re-derived with `toISOString()`); `0000_sweet_joseph.sql:185` (`created_at` outside the seal); `pglite-harness.ts:378-400` (no `created_at`); `shared/schema/submissions.ts` (`deleted_at` is timestamptz). |
| 4 | S8's notice put a new signature id on screen, a retired pattern, and deferred its removal to a "D7-A1 copy pass" that does not exist (major) | **Applied.** | §1.6 (the plan's retired pattern, the siblings, D7.md's actual steps); C3's `targetMeta` for retire is built without `ectd-sequence:<id>`; S6 shows the real target line; S8 has no id ("Sequence 0000 is retired, signed by A. Signer (responsibility). …"), and the false "D7-A1's copy pass" sentence is removed; C3-T2 asserts that no `/\b[a-z-]+:\d+\b/` key and no action or signature id appear; mutations C3 M6, M7; §6.18 names the siblings' ids as owed to D7's screen package, with the coordinator told that D7.md has no such step. | `ONE_DESIGN_PLAN.md:235`, :241; `SubmissionCenter.tsx:888`, :920, :939, :960 (siblings) and :1922 (the shared `ectd-sequence:${flow.seq.id}` prefix); `.design/claude-convergence/D7.md` §A.4 (D7-A1 steps 1-7: no notices) and :189-191 (D7-A2 strips keys from blocker sentences only); `migrations/20260527_mutation_primitives.sql:25` (`act_<uuid>`). |
| 5 | C3 was filed under `Plan: S5`, but the decision puts the act under L1 (minor) | **Applied, on the founder's record alone. The layout argument is rejected.** COORDINATION.md:30 calls a new per-row door in `SubmissionCenter.tsx` "Behaviour and copy, no layout". Plan §3 binds only a queued package's files, and D7 is open. Re-plan step 22 itself adds `pj-more` disclosures under S5. So the quiet disclosure is not a layout breach, and a change of package would not cure one anyway. | §0 (the record, quoted); §3 (all three commits under L1, with the precedents); C3's heading, title ("D7: …"), trailers (`Plan: L1`; the body cites P-86 and row D7); §5 item 3; §7's row. | `LAUNCH_DEFINITION_OF_DONE.md:1703` on origin ("It goes under launch row D7 (`Plan: L1`)"); `docs/design/one-design-plan.json` (L1 paths `**`); precedents `ae3681cb9` (P-89, `Plan: L1`, with `AuthoringFilingBar.tsx`) and `3cacf2e15` (`Plan: L1`, `SubmissionSeqWorkspaces.tsx`). |
| 6 | RULE 6: `sequence-retirement.ts` was called a split, but the commit did not name the folder, and the file is new code (minor) | **Applied.** The file is described as what it is everywhere. C1 gains `Completes: server/services/submission-service`. | §3 RULE 5/6 bullet; D6 "Where the rules live"; C1's trailers and file row; §4's evidence note for the README; A18 corrected (P-34's and P-35's modules were new files in `server/services/ectd/`, not splits). | `ONE_DESIGN_PLAN.md:346-347` (a split names its folder in `Completes:`); `git show --name-status c3ff59ae6` (`A server/services/ectd/shadow-review-waiver.ts`) and `3624fe667` (`A server/services/ectd/shadow-finding-disposition.ts`); `check-one-design-plan.mjs:174-178` (admits the file; it checks only that each `Completes:` path existed before the commit, :208); `3cacf2e15` (a folder in `Completes:` as precedent). |
| 7 | §5.5 said P-88 shares no file, but both designs insert into `migration-set.mjs`, and §7 omitted two live claims (minor) | **Applied.** The mitigations are noted: all three migration commits are RIM's, so there is one hold; and the MDX M4 line (`4bef8ac4f`, 22:35:59 UTC) arrived after §7 was read at `7be209e9c`. | §5 item 2 (C1 after step 28) and item 5 (one hold, the order step 28 → C1 → step 36, the tail re-read); §7 rows for `migration-set.mjs` (shared hold), `_freeze-gate-fixture.ts` (after F1 slice 1 pushes) and `SubmissionCenter.tsx` (MDX `01P6GW…` M4, sequenced with C3). C1's fixture note says the same. | `s9-p88-commitments.design.md:197-205`, :764, :782, :788 (C4, step 28), :1031, :1288 (C5, step 36), :889 and :1154 (the tables they alter); `rim-replan-2026-11-01.md:711-737` (steps 28 and 29 both list `migration-set.mjs`); `origin/concept2cure-v2:.design/claude-convergence/COORDINATION.md:30` (M4 → RIM); `git status` (`_freeze-gate-fixture.ts` modified). |

**Reviser's note, not a finding.** §0 and §8 flag 1 are updated because `5e3652dbf` has landed. The recorded text
names no ceremony or meaning, so D2, D3 and §9 A1 stand unchanged.

## Coordinator rulings, 2026-11-02 01:19 (binding; they override anything above)

1. **No new `sequence-retirement.ts`.** RULE 6's gate refuses a new service file, and P-86 has no approvedAdditions
   entry. The retire act goes in one of two places:
   - an existing file in `server/services/submission-service/` (for example beside the baseline's removal in
     `filed-sequence-baseline.ts`); or
   - a split out of `submission-service.ts` into the same folder.

   For a split, the commit names what moved, and what moved must be existing code, not the new act. Re-cut C1's file
   list accordingly, and drop the "new code in the existing folder" wording.
2. **Holds.** These are granted when C1 starts:
   - `filed-sequence-baseline.ts`;
   - `server/db/pglite-harness.ts`;
   - `tests/db/vault-where-used.dbtest.ts` (nobody holds Vault's DB tests);
   - `server/routes/submissions.ts`, `server/mcp/tools/catalog.ts`, `shared/navigation/surface-actions.ts`.
3. **`scripts/db/migration-set.mjs`** has one holder at a time, in queue order. The Reporting session (P-91: three
   report_bundle tables) is also queued. Ask the coordinator when ready, and never edit it without the recorded hold.
