# P-94: an onboarding upload is not released until it is approved

- **Designer:** `p94-onboarding-approved`, read-only, 2026-11-02.
- **Tree read:** `origin/concept2cure-v2` at `a0e39fffb` for the first draft. **Revised 2026-11-02 against
  `f3b0418ed`** (fetched for the revision, §11.4). Between the two, the founder's record `1c48581ae` and F1 slice 1
  (`090f62af1`) landed. Of the files cited below, only two changed:
  - `server/routes/submissions.ts` gained three lines at :105-107, so every cite after :102 moves by +3. The cites
    below are the new ones.
  - `server/services/submission-gateways/index.ts` is slice 1's guard. P-94 does not touch it.

  `leaf-source-resolver.ts`, `leaf-document-resolver.ts`, `dispatch-readiness.ts`, `assess-dispatch-readiness.ts`,
  `dispatch-gate.ts`, `assemble-from-core.ts`, `submission-service.ts`, `MarketBlockers.tsx` and
  `SubmissionSeqWorkspaces.tsx` are unchanged. Every `path:line` below is on `f3b0418ed`.
- **Input:** the RULE 3 map `decided2/p94-onboarding-approved.map.md`. Each of its load-bearing claims was re-read on
  origin. Four corrections are listed in §11.3.
- **Working tree at the revision:** it now holds **F1 slice 2's** uncommitted edits, among them
  `submission-service.ts`, `fda-esg-receipts.ts`, `filed-dispatch.ts` and `_freeze-gate-fixture.ts`. C1 edits none of
  them. C2 (§5.6, only if Q0 answers "literal") edits `submission-service.ts`, so it lands after slice 2.
- **Package:** F1, assigned by the coordinator. Launch row **D7** (One real sequence).

---

## 0. Answer first

1. **No approval act exists for `ctd_onboarding_documents`.** Its `status` is a processing status, written
   `'uploaded'` and never changed. The row records no uploader. So the store cannot say "approved", and this design
   does not invent a way for it to.
2. **What can approve an uploaded file already exists: the Vault's controlled-document approval.** It is signed and
   re-authenticated, its audit is chained, and it is bound to the exact bytes (`vaultVersionNotTransmittable`). The
   person reaches it on existing screens: upload to the Vault, review and approve, place the approved version, remove
   the upload's leaf.
3. **The change is one per-store verdict, read by the two readers that already carry every other store's verdict.**
   No gate, route, screen, table or migration changes.
   - The verdict: `onboardingUploadNotTransmittable()`, in `server/services/ectd/leaf-source-resolver.ts`, beside
     `renderedLeafNotTransmittable`.
   - Reader 1 is the readiness resolver: it raises `DOCUMENT_NOT_APPROVED`, a release blocker, before anyone signs.
   - Reader 2 is the assembler: it counts the leaf `unfinalized`, and `assembledTransmitBlockers` refuses it at
     freeze, dispatch and transmit.
   - This is how `bc2fa3b8c` (2026-10-30) made an assembled CSR file unreleasable.
4. **Under this design an upload never clears in place.** It is replaced by its approved Vault version. That is
   reading (A), and it is the fail-closed floor. Reading (B) would let the same bytes, approved through the Vault's
   existing act, clear the upload. The record's words, "goes through the same approval as an authored one", lean
   toward (B). So (A) against (B) goes back through the coordinator (§10 Q1). Either answer changes only the body of
   the one function.
5. **The record says "placed", and this design does not settle that alone.** The founder's record is on origin now
   (§1). It says an uploaded leaf is approved "before it can be placed in a sequence". On origin, no store refuses an
   unapproved document at placement. The record's own next sentence, and its owner line, describe readiness and
   transmit refusing an unapproved upload "as they do an unapproved authored leaf", and today that leaf is placed
   first and refused at release. So **Q0 goes to the coordinator before C1: is "placed" literal?**
   - **If it is literal,** C2 (§5.6) refuses, in `upsertLeaf`, a leaf that would ship an upload's content. A
     withdrawal of a filed upload stays open. Under (A) that means no upload can be placed again, which is Q3's
     outcome, so C2 carries a deletion record.
   - **If it is not,** the coordinator's ruling is quoted in C1's body, and C2 is not built.
6. **Commits.** C1 (the two readers) is the same code under either answer to Q0, and it lands after Q0 is answered,
   because its comments and body state which reading governs. Its trailers are `Plan: F1` and
   `Completes: server/services/ectd/leaf-source-resolver.ts`. C2 lands only on a "literal" answer, after slice 2,
   with `Completes: server/services/submission-service/submission-service.ts`. F1 slice 1 is already on origin
   (`090f62af1`).

---

## 1. The founder's decision

The record is on origin. `1c48581ae` ("P-92 to P-95: the founder answers the D7-record session's four questions", `Plan: PLAN`, with `Founder-Decision:` trailers P-92 to P-95) is an ancestor of
`origin/concept2cure-v2`, which `git merge-base --is-ancestor` confirms. Word for word,
`docs/LAUNCH_DEFINITION_OF_DONE.md:1857-1865`:

> ### P-94 — An onboarding upload is approved before it can be filed
>
> The founder, 2026-11-02, answering "A PDF uploaded during onboarding (`ctd_onboarding_documents`) has no approval
> state, so it can be filed without anyone approving it. Must an onboarding upload be approved before it can be
> filed?": **"Yes, approve first."** Raised by the D7-record session ("For the founder" 4).
>
> - **What is decided.** An uploaded leaf goes through the same approval as an authored one before it can be placed in
>   a sequence. Readiness and transmit both refuse an unapproved upload, as they do an unapproved authored leaf.
> - **Owner.** RIM for readiness and transmit (F1); the approval itself uses the existing approval act, nothing new.

**The record's words win over this design and over the coordinator's summary.** The summary said "before it can be
filed" and "exactly as they refuse an unapproved authored leaf". The record differs in three places, and each bears
on the design.

| The record says | What it settles | What it leaves open |
|---|---|---|
| "the approval itself uses the existing approval act, nothing new" | **(C) is refused by the record itself** (§4): no new act on the upload row. | *Which* existing act. For an uploaded file there is one: the Vault's (§2.4). Both (A) and (B) use it. |
| "goes through the same approval as an authored one" | The upload is approved, not merely replaced. That leans toward (B), where the upload's own bytes go through the Vault's act and the upload leaf then clears. Under (A) the upload leaf never goes through any approval. It is removed, and a different document is placed. | §10 Q1, re-asked as (A) against (B). |
| "before it can be **placed** in a sequence" | Read literally, an approval check at placement. On origin no store has one (§2.2). | **§10 Q0.** It conflicts with three parts of the same record: (1) the heading and the founder's own question and answer, which say "filed"; (2) "as they do an unapproved authored leaf", because an unapproved authored leaf is placed today and refused at release; (3) the owner line, which names "readiness and transmit" and no placement owner. |

The question the founder answered is item 4 of the D7 record (`docs/evidence/W5/2026-11-01/README.md:126-127`):
*"An uploaded PDF leaf (`ctd_onboarding_documents`) carries no approval state, so it is released without one. Must an
onboarding upload be approved before it can be filed?"* The D7-record session proposed no implementation for it.
That claim holds on origin (§2.6).

---

## 2. What already exists (RULE 3), by path

### 2.1 The store: `ctd_onboarding_documents`

| Path | What it does | What it does not do |
|---|---|---|
| `migrations/0007_ctd_onboarding_pipeline.sql:36-60` | Creates the table. Columns: `id`, `uuid`, `ctd_project_id`, `organization_id`, `file_name`, `file_size`, `mime_type`, `storage_path`, `ctd_module`, `ctd_section`, `section_title`, `document_type`, `status DEFAULT 'uploaded'`, `extraction_confidence`, `extracted_data`, `validation_errors`, timestamps. | It has no approver, reviewer, signature or uploader column. **It is on no deploy applier.** `scripts/ci/migration-deploy-path-baseline.json` lists it as a file that "no deploy applies … install-fresh applies them to a new database only". No other migration creates the table. |
| `shared/schema/ctd-projects.ts:69-101` | The Drizzle mirror. `status` is commented `uploaded, processing, extracted, validated, error`. | No approval vocabulary. |
| `server/db/pglite-harness.ts:481-489` | The test table: `id, organization_id, file_name, file_size DEFAULT 0, mime_type, storage_path, created_at`. | No `status` and no `ctd_project_id`. This design needs neither. |
| `server/services/ctd-ingestion-service.ts:166-206` `uploadCTDDocument` | The only writer. It inserts with `status = 'uploaded'`. | It writes no audit row and records no uploader. `git grep` for `UPDATE ctd_onboarding_documents`, `ctd_onboarding_documents SET` and `update(ctdOnboardingDocuments` finds nothing: **no code changes the row after insert**. |
| `server/routes/ctd-onboarding.ts:114` `POST /api/ctd/projects/:id/upload` (mounted `server/bootstrap/register-document-routes.ts:414`, `authMiddleware` only) | Multer disk upload, `assertUploadSafe`, then `uploadCTDDocument`. The routes are `GET /projects`, `GET /projects/:id`, `POST /projects/:id/upload`, `/validate` and `/detect-section`. | There is **no client caller in any history** (`git log --all -S "api/ctd/" -- client` is empty). There is **no download route**, so the platform cannot hand the bytes back. The project creator was retired by `fb73f05f8`. |

**Whether an approval act exists for it: no.** No route, service, AnA tool or MCP tool writes an approval for this
store, and `FinalizedStatusStore` (`leaf-source-resolver.ts:187-191`) does not name it.

### 2.2 How an upload becomes a sequence leaf

| Step | Path | What it does |
|---|---|---|
| Vocabulary | `server/services/ectd/leaf-document-tables.ts:31-50` | The table is in `RESOLVABLE_DOCUMENT_TABLES`: placeable and integer-keyed. |
| Placement doors | `PUT /api/submissions/sequences/:seqId/leaves` (`server/routes/submissions.ts:1190`); AnA `place_into_sequence` (`server/services/ana/submission-center-tool-defs.ts:950-975`, whose `document_table` enum is `PLACEABLE_DOCUMENT_TABLE_LIST`); MCP `File draft into sequence` (`server/mcp/tools/governed.ts:43`) | All three reach `upsertLeaf` (`submission-service.ts:3675`). **No client screen places an upload.** The client's placement doors write `coauthor_documents` or `vault_documents`. |
| Write-side check | `submission-service.ts:3185-3198` (`LEAF_SOURCE_VERIFIERS.ctd_onboarding_documents`), called through `verifyLeafSource` (:3298-3312) | An org-scoped row read (FORBIDDEN otherwise). The pin is `sha256(bytes)`, and the byte read fails soft (null pin). **Like every store's verifier (:3121-3226), it does no approval check.** Today an unapproved document may be placed. That is practice, not a founder decision. P-22 (`LAUNCH_DEFINITION_OF_DONE.md:318-322`) decides validation against release. It implies that unapproved *Vault* leaves are placed ("Publishers validate while final approvals are still being collected"), but it never decides placement. The code states the practice in the Vault branch of `upsertLeaf` (:3827-3829): "Preserve ordinary draft placement". |
| A withdrawal goes through the same verifier | `upsertLeaf` computes `documentContentSha256` through `verifyLeafSource` for **every** lifecycle op (:3784-3791), with no lifecycle filter. `PUT /leaves` accepts `lifecycleOp: 'delete'` (`submissions.ts:235`), and so does AnA's `place_into_sequence` (`lifecycle_op` enum). On an update, the stored op is kept unless one is given (:3882). | A delete leaf naming a filed upload is the real case: `withdrawal-approval-binding.pglite.test.ts:401` and `:456` (upload 700). The readers never judge a delete: `contentFindings` returns nothing for one (`dispatch-readiness.ts:527`), and the assembler filters delete-only references out (`leaf-source-resolver.ts:423,431`). **So any refusal at placement must exempt a delete, or a filed upload can never be withdrawn** (§5.6). |
| Readiness read | `server/services/ectd/leaf-document-resolver.ts:202-221` | Returns `found`, `storedSha256` and `reason`. **It sets no `notTransmittable`**, unlike coauthor (:159), rendered (:172), unified (:198), c2c sections (:245) and Vault (:297). It does not check that the file is a PDF; the Vault lookup does (:288-292). |
| Assembly | `server/services/ectd/leaf-source-resolver.ts:570-617` (the onboarding branch of `materializeLeafSources`) | It requires `application/pdf`, readable bytes and `%PDF-`, stages the raw bytes and counts `materialized` (:615). **It never calls `noteUnfinalized`**, unlike coauthor, unified, Vault (:735), rendered (:795) and c2c sections. |
| Packaging | `server/services/ectd/core-to-packager.ts:311-375` | Pure leaf-to-file mapping. It knows nothing of approval. Not touched. |
| The Builder's read | `server/services/ectd/submission-leaf-source-evidence.ts:247-271` (`onboarding`), served by `GET /api/submissions/sequences/:seqId/leaves` (`submissions.ts:1154-1166`) | It answers an upload as `content: 'undetermined'` (`SOURCE_BINARY_CONTENT_UNVERIFIED`), so the Builder's cell reads **"Source evidence undetermined"**. It reads a Vault PDF the same way (:223). No gate reads it (route comment :1152: "Governed dispatch remains its separate canonical assessment"). Not touched. |

### 2.3 The one rule for an unapproved authored leaf (what P-94 reuses)

It has two inputs. Each is computed per store by one verdict function, and every release step reads them.

**Input 1: the readiness verdict, read before any signature.**
- The per-store verdicts:
  - `notFinalizedStatus(status, store)` (`leaf-source-resolver.ts:286-299`) for the authored stores;
  - `renderedLeafNotTransmittable` (:306-310);
  - `vaultVersionNotTransmittable` (`server/services/vault/vault-lifecycle.ts:163-200`).
- `resolutionFromStoreLookup` (`leaf-document-resolver.ts:403-436`) carries `notTransmittable` on every found
  document, resolved or `content_changed`.
- `contentFindings` (`server/services/ectd/dispatch-readiness.ts:526-566`) turns it into code `DOCUMENT_NOT_APPROVED`,
  severity `warning`, `blocksRelease: true`. It is not raised on a delete or a missing document (:527). The message:
  *"Leaf "T" (S) points at `<table> <id>`, which is not yet approved (`<verdict>`). Validation does not wait for
  approval, but only approved documents are released: freeze, dispatch and transmit refuse this sequence until the
  document is approved."*
- `releaseBlockers` counts it. `evaluateReleaseApprovalGate` (`server/services/ectd/dispatch-gate.ts:90-107`) gives
  the sentence: *"1 leaf points at a document not yet approved. Only approved documents are released, so freeze,
  dispatch and transmit refuse this sequence until each is approved."*
- `assess-dispatch-readiness.ts` composes it into `freezeGate`, `gate` and `dispatchGateOnSigning`.

**Input 2: the assembler's count, re-checked at the irreversible steps.**
- `noteUnfinalized` (`leaf-source-resolver.ts:469`) records the leaf.
- `assembledTransmitBlockers` (`server/services/ectd/assemble-from-core.ts:135-166`) gives the sentence: *"N leaf
  document(s) are not approved (`<label>: <verdict>`; …)"*. Items are joined with `'; '`.

**Where the two inputs refuse (all on origin, none edited by P-94):**

| Step | Path | Code and sentence |
|---|---|---|
| Freeze and dispatch, the precheck before signing and the transition | `submission-service.ts:1634-1655` `governedContentGates` | `DISPATCH_BLOCKED`: *"Dispatch gate blocks frozen: …"* / *"… dispatched: …"* |
| Freeze and dispatch package gate | `submission-service.ts:1546-1601` `assertSequencePackageable` | `DISPATCH_BLOCKED`: *"Refusing to freeze: … Transmit would refuse this package, and once the sequence is frozen its leaves can no longer be changed."* |
| Transmit precheck, before the password | `submission-service.ts:2575-2655` `sequenceTransmitReadiness` (:2638) | `refusal`: *"Dispatch gate blocks transmit: …"* |
| Transmit Gate 2 | `submission-service.ts:2743-2747` | `DISPATCH_BLOCKED`, the same sentence. Refused before the gateway; the signature is voided (P-23). |
| Transmit re-check after assembly | `submission-service.ts:2873-2886` | `DISPATCH_BLOCKED`: *"Transmit blocked — … A transmitted sequence must carry every placed leaf, and only approved documents."* `releaseTransmitSlot` runs first. |
| Reported, not refused | `server/routes/ectd-compile.ts:1118-1158` (the compile's `leftOut`); `POST /sequences/:seqId/assemble` → `SequenceAssembleTestPackage.tsx:87` (*"N not approved"* and the blockers verbatim); `POST /sequences/:seqId/technical-file/assemble` (`submissions.ts:1741-1833`, `unfinalized` in its report) | The same words. The device technical file reports an unapproved authored leaf and does not refuse it. |
| The gateway guard | `server/services/submission-gateways/index.ts` | **No approval check.** Approval is decided before `gw.transmit`. F1 slice 1 holds this file. P-94 does not touch it. |

**What a person reads today for an unapproved authored leaf:**

| Where | Text |
|---|---|
| Validation and Dispatch | The finding message and the gate sentence above. |
| Submit step (`client/src/concept2cure/v2/surfaces/MarketBlockers.tsx:51`) | *"Approve “T” (section S). Only approved documents are released."* No act button (`readinessFindingActs.ts`). |
| Builder cell (`SubmissionSeqWorkspaces.tsx:533-545`) | *"not approved: <the Builder reader's reason>"* for a draft authored document. For a binary source (a Vault PDF or an upload) it reads *"Source evidence undetermined"* (§2.2). |

### 2.4 What already exists that can approve an uploaded file: the Vault

| Path | What it does |
|---|---|
| `server/routes/vault-ingest.ts` (`POST /api/vault/ingest`), `client/src/concept2cure/v2/useVaultUpload.ts` | It uploads a file into `vault.documents`, recording its SHA-256 and uploader and writing a hash-chained Part 11 audit row. Its header calls it "the one document-upload path". |
| `server/routes/document-lifecycle.ts` (`/api/regulatory/documents`: `POST /`, `/:id/sign`, `/:id/advance`) | Review, the signed review and approval. Every sign-off re-verifies the signer (`reverifySigner`, `checkSigningAuthority`) and appends one chained event. |
| `client/src/concept2cure/v2/surfaces/VaultLifecycle.tsx` | The Vault screen's review route, signing and approval, through the shared `EsignModal` (meaning, reason, password, authenticator). |
| `server/services/vault/vault-lifecycle.ts:163-200` `vaultVersionNotTransmittable` | A version is releasable only when it is at a steady stage, current, and approved **for these bytes** (`content_hash = stagedSha256`). |
| `client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx` | Places the approved Vault version into the sequence (`PUT …/leaves`). |
| `SubmissionSeqWorkspaces.tsx` "Remove leaf" → `DELETE /api/submissions/sequences/:seqId/leaves/:leafId` (`submissions.ts:1215`) | Removes the upload's leaf, with a reason (`LEAF_REMOVED`), on a sequence that can still change. |

So a person already has the whole path on existing screens: Vault upload → review and signed approval → place that
version → remove the upload's leaf. **Nothing is built for it.**

### 2.5 Other readers of the assembler's count (they change wording only, by the same rule)

- `server/services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core.ts:297,468` (the device technical file)
  reads `unfinalized` into its report. Its `ready` does not depend on it (:203).
- `server/services/shadow-review/shadow-review-input.ts:216` reads only `byKey` and `unresolved`, so it is unaffected.

### 2.6 The D7 record's claim, verified

| Claim | On origin |
|---|---|
| `README.md:126-127`: "An uploaded PDF leaf carries no approval state, so it is released without one." | **Holds.** The readiness lookup sets no verdict and the materializer notes nothing. `dispatch-readiness.ts:172-174` says so itself: "Absent for a store with no approval state (rendered files, uploads)". That comment has been stale for rendered files since `bc2fa3b8c`. |
| `README.md:49`: readiness and transmit agree on unapproved leaves (fixed). | **Holds.** Both read the same per-store verdict, which is why P-94 is one function. |
| A proposal for P-94 | None. It was a question. |

### 2.7 Searches run

- `git grep` on origin for `ctd_onboarding_documents`, `ctdOnboardingDocuments`, `UPDATE ctd_onboarding_documents`,
  `ctd_onboarding_documents SET`, `/api/ctd/`, `notTransmittable`, `noteUnfinalized`, `materializeLeafSources`,
  `resolveLeafDocument`, `unfinalized`, `sourceDocument`.
- `git log --all --diff-filter=D` over `*ctd-onboarding*`, `*ctdOnboarding*`, `*CtdOnboarding*`, `*ctd-ingestion*`,
  `*OnboardingDocument*`, `client/**/*CTD*`, `client/**/*Onboarding*` and `server/**/*ctd*` (the map's search). It
  finds `3c394edb3` and `7a7428755`. Neither held an approval.
- Not the same thing: `POST /api/onboarding/ingest` and `/commit` (`OnboardingIngest.tsx`) are account onboarding.
  They never write this table.
- Added for the revision:
  - `grep -n "placed\|placement"` and the `### P-` headings of `docs/LAUNCH_DEFINITION_OF_DONE.md` on origin. No
    founder decision puts an approval check at placement for any store. P-14 (:232) decides program anchoring, P-22
    (:318) decides validation against release, and P-94 (:1857) is the first to name placement.
  - `git grep "'ctd_onboarding_documents'"` outside tests. Its only placement doors are the three above. The only
    other client reference, `SubmissionRequiredDeliverables.tsx:44`, validates a source reference and places nothing.
  - `upsertLeaf`'s lifecycle handling (:3784-3791, :3882, :3966, :4028). `artifact-approval-act.ts` is "the governed
    approval act" for `concept2cure_artifacts` (P-95), which is not a leaf source (`leaf-document-tables.ts:31-50`). So
    the only existing approval act that can approve an uploaded file is the Vault's.

---

## 3. The rules this design is held to

| Rule | How it is met |
|---|---|
| RULE 0 | Commit and push `concept2cure-v2` only. |
| RULE 1 | No migration. The `0007` table is untouched. |
| RULE 3 | §2. The work is **completing** the release rule for one store that it missed. Nothing is rebuilt. |
| RULE 4 | No card, panel or screen. The refusal appears in the existing Validation, Dispatch and Submit screens, which already print it. |
| RULE 5/6 | C1: `Plan: F1`, `Completes: server/services/ectd/leaf-source-resolver.ts`. One new export inside an existing file. No new route file, service file, table, mount or AnA tool. Nothing is deleted. C2 (only on a "literal" Q0): `Completes: server/services/submission-service/submission-service.ts`. It adds one refusal inside `upsertLeaf` and nothing new. It narrows a placement door, so its body carries the deletion record (§5.6). |
| One rule, never a second copy | One verdict string, from one function, read by the two existing readers and, under C2, by the placement refusal. No gate learns the store's name. C2's refusal names the store at the one write choke point, as the Vault's legal refusal already does there (`submission-service.ts:3830`). |
| P-22 | P-22 decides validation against release, not placement (§2.2). The finding is a `blocksRelease` warning, so Validated is not held. Whether placement is refused is P-94's own question (Q0), not P-22's. |
| Part 11 | P-94 adds no act. The approval it relies on is the Vault's, which is signed, re-authenticated, carries a reason, writes a chained audit and keeps the document retained. The leaf removal is the existing reasoned `LEAF_REMOVED`. A refusal after signing voids the signature, as today (P-23). |
| Fail closed, never fabricate | The verdict never clears in place. Nothing infers approval from a processing status. No agency answer is involved. |

---

## 4. What "approved" means for an onboarding upload

The store cannot answer the question (§2.1), and inventing an approval for it is refused. The design therefore takes
the one approval that exists for an uploaded file, the Vault's:

- **(A), built here as the floor.** An upload is never approved in place. Its file is approved by becoming a Vault
  version, through the Vault's own signed approval. That version is placed, and the upload's leaf is removed.
  - It fails closed under every answer to Q1. (B) only loosens it, and only in the one function.
  - It needs no new rule, no cross-store binding and no fixture beyond the upload row.
  - **Its weak point is the record's wording.** "An uploaded leaf goes through the same approval as an authored one"
    reads as the upload being approved. Under (A) the upload leaf goes through no approval: it is replaced.
- **(B), asked again (§10 Q1).** The same bytes, approved through the Vault's existing act in this organization's
  Vault in the onboarding project's program, clear the upload. The upload's own bytes then go through "the same
  approval", using "the existing approval act". This is the reading the record's words lean toward. It adds no act,
  table or route, but it does add a rule, binding two stores by hash, which the coordinator rules on.
- **(C), refused by the record.** "The approval itself uses the existing approval act, nothing new"
  (`LAUNCH_DEFINITION_OF_DONE.md:1865`). A new approval act on `ctd_onboarding_documents` is exactly that. It would
  also need new columns and a new signed act (RULE 6, an `approvedAdditions` entry), and, because the table is on no
  applier, a guarded file in `C2C_MIGRATION_FILES` (RULE 1).

---

## 5. The change

### 5.1 One verdict, in `server/services/ectd/leaf-source-resolver.ts`, after `renderedLeafNotTransmittable` (:310)

```ts
/**
 * Whether an uploaded file (ctd_onboarding_documents) may be released. P-94, founder 2026-11-02
 * (docs/LAUNCH_DEFINITION_OF_DONE.md): "An uploaded leaf goes through the same approval as an authored
 * one ... Readiness and transmit both refuse an unapproved upload, as they do an unapproved authored leaf."
 * The builder writes here the coordinator's answer to whether placement is refused too (design Q0). The
 * store holds no approval: its status is a processing
 * status, written 'uploaded' and never changed, and the row names no uploader. So an upload never clears
 * here. The approval that exists for an uploaded file is the Vault's (vaultVersionNotTransmittable),
 * reached by placing the approved Vault version instead. Read by the readiness resolver
 * (leaf-document-resolver) and by the assembler below, so Validation, Dispatch, freeze and transmit say it
 * in one wording. No ';' or ':' in it: assembledTransmitBlockers joins items with '; ' after 'label: '.
 */
export function onboardingUploadNotTransmittable(): string {
  return 'an uploaded file with no approval of its own, so approve it in the Vault and place that version instead';
}
```

It is a function, not a constant, so that (B) can grow arguments without changing the two call sites' shape.

### 5.2 Reader 1, readiness: `leaf-document-resolver.ts`

- In the found branch of `INTEGER_LOOKUPS.ctd_onboarding_documents` (:216-220), add
  `notTransmittable: onboardingUploadNotTransmittable()`.
- Extend the import at :72.
- `resolutionFromStoreLookup` already carries the field, and `contentFindings` already raises it. No other edit.

### 5.3 Reader 2, assembly: `leaf-source-resolver.ts`, the onboarding branch

After `materialized++` (:615) and before `continue`, add:

```ts
// P-94: staged is not approved. An upload has no approval of its own (onboardingUploadNotTransmittable).
noteUnfinalized(doc.fileName || `ctd_onboarding_documents:${documentId}`, onboardingUploadNotTransmittable());
```

This follows the Vault branch (:723-735): first stage, then judge.
- A non-PDF, unreadable, mislabelled or cross-tenant upload stays `unresolved` only, so it is never counted twice.
- A delete-only reference is filtered out before the loop (:431), so a withdrawal of a filed upload is never judged.

### 5.4 Comments made true, in the same commit

- `leaf-source-resolver.ts:9-11`: the header line for uploads adds "never approved in place (P-94); released only as
  an approved Vault version".
- `leaf-document-resolver.ts:45-49`: the approval paragraph adds `onboardingUploadNotTransmittable` for an upload.
- `dispatch-readiness.ts:172-174`: "Absent for a store with no approval state (rendered files, uploads) and on
  resolutions built before this field existed" becomes "Absent on resolutions built before this field existed".
  After P-94, every store the resolver reads gives a verdict.

### 5.5 Not changed, and why

- `submission-service.ts`, `assess-dispatch-readiness.ts`, `dispatch-gate.ts`, `assemble-from-core.ts`,
  `core-to-packager.ts`, `ectd-compile.ts`, the gateway guard and every route are unchanged. Each refusal in §2.3
  already reads the two inputs.
- `upsertLeaf` is unchanged **by C1**. Whether placement of an upload is refused is Q0, not P-22 (§2.2). On a
  "literal" answer, C2 (§5.6) changes it, in a separate commit.
- `submission-leaf-source-evidence.ts` (the Builder's reader) is unchanged. It already never reads an upload as
  finalized.
- The client is unchanged. Validation, Dispatch and the test package print the server's words. The Submit step's
  sentence is generic (§9 item 1).
- There is no migration, and the harness table needs no column.

### 5.6 C2, only if Q0 answers that "placed" is literal: the placement refusal, in `upsertLeaf`

**Where, and why not in the verifier.** The critique proposed `LEAF_SOURCE_VERIFIERS.ctd_onboarding_documents`
(`submission-service.ts:3185`). That place is wrong. The verifier takes `(documentId, organizationId)`, and
`upsertLeaf` calls it for every lifecycle op, deletes included (§2.2). A refusal there would refuse the **withdrawal**
of an upload FDA already holds (`withdrawal-approval-binding.pglite.test.ts:401`, `:456`). That would leave a filed
document impossible to withdraw. So the refusal goes in `upsertLeaf`, beside the Vault's legal refusal (:3827-3836, the `if` at :3830),
and runs **after** tenancy, so a foreign upload still answers FORBIDDEN first. It judges the op the row will carry:
- the insert branch uses `input.lifecycleOp ?? 'new'` (:3966);
- the update branch uses `input.lifecycleOp`, or when none is given the stored op, which `:3882` keeps. That op is
  read under the sequence lock by the branch's own `prev` select (:3864-3874), which gains `lifecycleOp`.

The one pure helper, exported from `leaf-source-resolver.ts` beside the verdict (no new file):

```ts
/** P-94: why a placement of `table` with `op` is refused, or null. A delete is never refused: withdrawing a
 *  filed upload stays open, as readiness (dispatch-readiness.ts:527) and the assembler (:423) never judge one. */
export function onboardingPlacementRefusal(table: string | null | undefined, op: string | null | undefined): string | null {
  if (table !== 'ctd_onboarding_documents') return null;
  if ((op ?? 'new').trim().toLowerCase() === 'delete') return null;
  return `An uploaded file is approved before it can be placed in a sequence (P-94). This one is ${onboardingUploadNotTransmittable()}. Nothing was placed.`;
}
```

`upsertLeaf` throws `SubmissionError('VALIDATION', sentence)` (400) at both sites. It loads the helper the way it
already loads `leafSourceKey` (`await import('../ectd/leaf-source-resolver')`, :1489). Under (B) the helper gains the
pin and the program, both of which `upsertLeaf` already holds (`documentContentSha256` :3784,
`submissionProgramId` :3722).

**What it does to the three doors.** All three reach `upsertLeaf`, so the sentence reaches each of them verbatim:
- REST `PUT /leaves`;
- AnA `place_into_sequence`, whose description already says "surface that refusal verbatim";
- MCP.

The enums keep the store, because a delete may still name it. The MCP tool admits no delete
(`governed.ts` `lifecycle_op` is `new | replace | append`), so its `ctd_onboarding_documents` entry can never succeed
under (A). Its holder removes it (§9 item 7).

**It is a narrowing of a user-facing door, so C2's body carries the deletion record** (working agreement):
- **What is removed:** placing new upload content into any sequence, eCTD or device technical file alike, under
  (A). Under (B), only placing an upload whose bytes are not approved in the Vault.
- **The replacement, by path:**
  - `client/src/concept2cure/v2/surfaces/VaultPlaceIntoSubmission.tsx`, for the Vault upload, approval and placement;
  - for an agent, the MCP tool's `vault_document_id` (`server/mcp/tools/governed.ts:42`).

  **AnA has no replacement.** Its `place_into_sequence` handler passes no `documentUuid`
  (`server/services/ana/AnaToolExecutor.ts:9989-10002`), so `upsertLeaf` refuses a Vault leaf from it (`submission-service.ts:3766-3771`, "must carry document_uuid").
  Under C2, AnA relays P-94's sentence, which names the Vault, and the person places the version on the Vault
  screen. Giving AnA's existing tool a uuid input is a completion for its holder, not part of P-94 (§9 item 8).
- **The history search:** `git log --all --diff-filter=D` over `*VaultPlace*`, `*ctd-onboarding*`, `*ctdOnboarding*`,
  `*ctd-ingestion*` and `*OnboardingDocument*`, with its output in the README.
- **The reach proof:** `server/services/ectd/__tests__/placement-vault-leaf-parity.pglite.test.ts` (Vault placement
  through `upsertLeaf`) and `client/src/concept2cure/v2/__tests__/vaultPlaceIntoSubmission.test.tsx`. Before C2, the
  builder confirms that the Vault placement reaches every submission type an upload reached (eSTAR, MDR/IVDR
  technical file). If one is not reached, C2 stops and that goes to the coordinator.

**Red tests (C2):**

| # | File | Case |
|---|---|---|
| T6 | `server/services/submission-service/__tests__/leaf-source-tenancy.pglite.test.ts` | Placing this organization's own upload with op `new` (and with no op) is refused with the helper's sentence. No `submission_leaves` row and no `LEAF_CREATED` audit row is written. Under C2 the existing "refuses another organization's upload" case (:161) is unchanged: FORBIDDEN still comes first. |
| T7 | Same file | Placing a `delete` leaf naming this organization's upload is **accepted**, as is ` DELETE ` (the normalization). An update of that delete leaf's title, with no op given, is accepted (the stored op is judged). |
| T8 | `server/services/ectd/__tests__/leaf-source-resolver.test.ts` | The helper, pure: null for every other table, null for a delete, and the sentence containing `onboardingUploadNotTransmittable()` otherwise. |
| — | `server/services/submission-service/__tests__/leaf-document-table-allowlist.test.ts:107-134` and `:204-232` | **An existing guard changes, and the deletion record names it.** Its comment says that narrowing the allowlist "would make … device uploads (ctd_onboarding_documents) throw on every placement". The allowlist itself is unchanged, because a delete must stay writable. The case's upload entry is placed as a `delete`, and one added assertion shows that a `new` is refused by P-94's sentence and not by `unplaceableDocumentTableMessage`. |

**Mutations (C2):**
- μ8: the refusal in the verifier instead. It turns T7 red.
- μ9: the delete exemption dropped. It turns T7 and the `withdrawal-approval-binding` controls red.
- μ10: the refusal before tenancy. It turns the existing foreign-upload case red, because the code changes from
  FORBIDDEN.
- μ11: the update branch judges `input.lifecycleOp` only. It turns T7's title update red.

---

## 6. The commits

### C1. `F1: an onboarding upload is not released until an approved Vault version replaces it (P-94)`

- **Trailers:** `Plan: F1` and `Completes: server/services/ectd/leaf-source-resolver.ts`, then the session's
  `Co-Authored-By` and `Claude-Session` lines. The body:
  - quotes P-94 as recorded (`LAUNCH_DEFINITION_OF_DONE.md:1863-1865`, `1c48581ae`);
  - quotes the coordinator's answers to Q0 and Q1 word for word, with their dates;
  - cites launch row D7 and the precedent `bc2fa3b8c`.

  It does not say that placement stays allowed unless the coordinator's Q0 answer says so.
- **Files:**
  - `server/services/ectd/leaf-source-resolver.ts` (the export, the assembler line, the header comment);
  - `server/services/ectd/leaf-document-resolver.ts` (one field, the import, the comment);
  - `server/services/ectd/dispatch-readiness.ts` (comment only);
  - `server/services/ectd/__tests__/leaf-source-resolver.test.ts` (T1, T2);
  - `server/services/ectd/__tests__/leaf-document-resolver.pglite.test.ts` (T3);
  - `server/services/ectd/__tests__/assess-dispatch-readiness.vault-leaf.pglite.test.ts` (T4);
  - `docs/evidence/W5/2026-11-02-p94-onboarding-upload-approved/`, holding `README.md` (with "What already exists",
    the decision quoted, the runs and the mutations), `red.txt` and `green.txt`.
- **Migration:** none.
- **Before the first edit:**
  - the record is on origin (it is, `1c48581ae`) and the builder re-reads it (§1);
  - **the coordinator has answered Q0 and Q1** (§10). C1's code is the same under every answer, and its words are
    not;
  - slice 1 is on origin (it is, `090f62af1`), and the working tree is clean of slice 2's edits;
  - the coordinator has recorded a hold on the three source files (none is held today).
    `assess-dispatch-readiness.vault-leaf.pglite.test.ts` sits beside RIM's repair-B file. It is the same lane, so the
    two are sequenced, not raced.

### C2 (only on a "literal" Q0). `F1: an uploaded file is approved before it can be placed in a sequence (P-94)`

- **Trailers:** `Plan: F1` and `Completes: server/services/submission-service/submission-service.ts`.
- **Files:**
  - `submission-service.ts` (two call sites in `upsertLeaf`, and `prev` gains `lifecycleOp`);
  - `leaf-source-resolver.ts` (`onboardingPlacementRefusal`);
  - the tests T6–T8 and the allowlist case (§5.6);
  - the evidence README, which gains the deletion record.
- **Before the first edit:**
  - C1 is on origin;
  - slice 2 is on origin, and the coordinator releases `submission-service.ts` to this commit;
  - the Vault reach for every submission type is checked (§5.6).
- **Migration:** none.

#### Red tests (extend existing files; run on the committed resolvers first and save `red.txt`)

| # | File | Case | Red today because |
|---|---|---|---|
| T1 | `leaf-source-resolver.test.ts`, the case at :228 ("materializes a PDF ctd_onboarding_documents upload AS the leaf") | Also asserts `res.unfinalized === 1` and `res.unfinalizedSections` `toEqual([{ sectionCode: 'Signed Form 1571.pdf', status: onboardingUploadNotTransmittable() }])`. The staged-bytes and md5 assertions are kept. | `unfinalized` is 0 and the export does not exist. |
| T2 | Same file, the cases at :248, :260, :272 and :284 (non-PDF, mislabelled, missing, cross-tenant) | Each also asserts `res.unfinalized === 0`: an unusable upload is reported once, as unresolved. | Green today. It is the guard for μ3. |
| T3 | `leaf-document-resolver.pglite.test.ts` (harness `leafSources: true`, which has the table). New `it`: stage a PDF in a tmp dir, insert an upload row, and place a leaf pinned to its sha256. | `resolveLeafDocument(…, ORG)` gives `status: 'resolved'`, `pin: 'match'` and `notTransmittable === onboardingUploadNotTransmittable()` (equality, not a pattern). The same row read under another organization is `missing`, with no `notTransmittable`. | `notTransmittable` is undefined. |
| T4 | `assess-dispatch-readiness.vault-leaf.pglite.test.ts`, a new `it` beside :232 (the Vault `DOCUMENT_NOT_APPROVED` case), on its `seedSequence` and `seedLeaf` | A sequence with one PDF upload leaf at 1.1 (bytes staged on disk). It asserts:<br>- exactly one `DOCUMENT_NOT_APPROVED` at that section, `severity 'warning'`, `blocksRelease: true`, message containing `not yet approved (${onboardingUploadNotTransmittable()})`;<br>- `validationErrors === 0` (Validated is not held, P-22);<br>- `releaseBlockers === 1`;<br>- `freezeGate`, `gate` and `dispatchGateOnSigning` each not cleared, with blockers matching `/1 leaf points at a document not yet approved/` and not `/error-severity validation finding/`.<br>The red signal is the **blocker text**, not `cleared`. | There is no `DOCUMENT_NOT_APPROVED` at 1.1 (0 where 1 is expected), `releaseBlockers` is 0, and no gate blocker matches `/1 leaf points at a document not yet approved/`. The `cleared === false` assertions pass today, and only for another reason: this file's fixture runs no Shadow Review, so every gate is already blocked by that (the case at :201-222 asserts it). |

T4 is the end-to-end proof for the freeze, dispatch and transmit prechecks and Gate 2, which all compose this
assessment. T1, together with `assembledTransmitBlockers`'s own tests, is the proof for the package gate and the
transmit re-check.

**Controls (unchanged and green):**
- `withdrawal-approval-binding.pglite.test.ts:446-523` (moved by +3 since `a0e39fffb`): the delete of upload 700,
  including "upload bytes rotated" (:516).
- `rendered-csr-assembly-not-released.pglite.test.ts`, `leaf-source-resolver-vault-finalized.test.ts`,
  `placement-vault-leaf-parity.pglite.test.ts` and `dispatch-readiness.test.ts:176-189` (pure; uploads stay in the
  placeable vocabulary).
- `server/services/pathway-engines/__tests__/assemble-technical-file-multisource.test.ts`: its upload has no row, so
  it stays unresolved.
- `server/services/submission-service/__tests__/leaf-source-tenancy.pglite.test.ts` and
  `leaf-document-table-allowlist.test.ts`: placement is unchanged **by C1**. C2 changes the allowlist case (§5.6).

**Optional T5.** `server/services/submission-service/__tests__/freeze-gate-binding.pglite.test.ts`: a freeze
precheck on a sequence with an upload refuses *"Dispatch gate blocks frozen: 1 leaf points at a document not yet
approved …"*. Add it only if its fixture can stage the file cheaply. T4 already covers the verdict that precheck
reads.

#### Mutations (each must turn a named test red; record in the README)

| μ | Mutation | Caught by |
|---|---|---|
| μ1 | Drop `notTransmittable` from the resolver's upload lookup | T3, T4 |
| μ2 | Drop the assembler's `noteUnfinalized` | T1 |
| μ3 | Move `noteUnfinalized` before the PDF, bytes and header checks | T2 |
| μ4 | `onboardingUploadNotTransmittable` returns `null` / `''` | T1, T3, T4 |
| μ5 | Inline a different literal in one reader (two copies drift) | T1 or T3 (equality with the export) |
| μ6 | Raise it as an error (`UNRESOLVED_DOCUMENT`) instead of a release warning | T4 (`validationErrors`, code, severity) |
| μ7 | Count a delete-only upload (drop the `shipsContent` filter, `leaf-source-resolver.ts:431`) | `withdrawal-approval-binding` (existing) |

#### Runs

- T1–T4 and the controls by path (`npx vitest run …`);
- the `server/services/ectd` and `server/services/submission-service` suites;
- `npm run typecheck`;
- the pre-push gates, all expected unaffected: `ci:one-design-plan`, `ci:one-product` and
  `ci:migration-drop-safety`.

Never `deploy-migrate` and never `tests/db` from this lane without the coordinator.

#### Words on screen after C1 (server words; no client edit)

| Where | Text |
|---|---|
| Validation tab and the Dispatch tab's findings | *"Leaf "Signed Form 1571" (1.1) points at ctd_onboarding_documents 50, which is not yet approved (an uploaded file with no approval of its own, so approve it in the Vault and place that version instead). Validation does not wait for approval, but only approved documents are released: freeze, dispatch and transmit refuse this sequence until the document is approved."* |
| Release gate, on Dispatch and in every precheck | *"1 leaf points at a document not yet approved. Only approved documents are released, so freeze, dispatch and transmit refuse this sequence until each is approved."* |
| Freeze or Dispatch, before the password | *"Dispatch gate blocks frozen: 1 leaf points at a document not yet approved. …"* (and *"… dispatched: …"*) |
| Transmit, before the password, **including a sequence dispatched before P-94** | *"Dispatch gate blocks transmit: 1 leaf points at a document not yet approved. …"*. This comes from `sequenceTransmitReadiness`'s `gate` (`submission-service.ts:2611-2638`), whose assessment is computed fresh on every read, whatever the sequence's status. |
| Transmit with a signature taken before C1 landed | The same sentence, thrown at Gate 2 (`submission-service.ts:2742-2746`) as `DISPATCH_BLOCKED`. That happens before `claimTransmitSlot` (:2793) and `assembleSequence` (:2816), and the signature is voided (P-23, `voidingSignatureOnRefusal` :2686). |
| Transmit after assembly | **No person sees this one for an upload.** `assembledTransmitBlockers` (:2873-2886) would print *"Transmit blocked — 1 leaf document(s) are not approved (Signed Form 1571.pdf: …). …"* only if the two readers disagreed, because a dispatched sequence's leaves cannot change between Gate 2 and assembly. It is defence in depth, and T1 is its proof. The README does not record it as words on screen. |
| Dispatch tab, "Assemble a test package" | *"1 not approved"* among the counts, and the blocker above on its own line. |
| Submit step | *"Approve “Signed Form 1571” (section 1.1). Only approved documents are released."* (unchanged, §9 item 1) |
| Builder cell | *"Source evidence undetermined"* (unchanged; the same as a Vault PDF) |

The copy is calm and factual, names the act in plain words and has no exclamation. "the Vault" is the client's own
name for the screen.

---

## 7. What a person sees, state by state

| State | What they see | What they do |
|---|---|---|
| **Placing an upload** (only under C2, on a "literal" Q0) | REST, AnA or MCP answers, before anything is written: *"An uploaded file is approved before it can be placed in a sequence (P-94). This one is an uploaded file with no approval of its own, so approve it in the Vault and place that version instead. Nothing was placed."* A withdrawal (`delete`) of a filed upload is still placed. | Upload the file to the project's Vault, approve it, and place that version (VaultPlaceIntoSubmission). |
| **Draft sequence, upload placed** (by API, AnA or MCP before C2, or at any time without C2; no screen places one) | The Builder cell reads "Source evidence undetermined". Validation shows the warning; the sequence may still read Validated. Dispatch shows the release-gate blocker. The Submit step lists "Approve …". Freeze refuses before the password. | Upload the same file to the project's Vault, send it for review and approve it (VaultLifecycle, signed and re-authenticated). Place that version (VaultPlaceIntoSubmission). Remove the upload's leaf ("Remove leaf", with a reason). The finding clears with the leaf. |
| **The person no longer holds the file** | The same. | The platform has no download route for an upload (§2.1), so the bytes cannot come back from this store. The person obtains the file from its source. (B) has the same need. §9 item 5. |
| **Frozen or dispatched before P-94, never sent** | Transmit refuses before the password. Its leaves cannot change. | Once P-86 lands, retire it (an unsent sequence is retirable) and place the Vault versions in a new sequence. Until then nothing moves it. |
| **Held send** (`transmitting`, production, slice 2) | P-94 changes nothing here. A receipt or P-92 settles it. | P-92. |
| **Released as not received (P-92), or rejected by FDA**, carrying an upload | The re-send is refused before the password, P-86 refuses retirement, and the leaves cannot change. **A dead end** (§10 Q2). | The founder decides. |
| **Filed** (recorded as received, or sent before P-94), carrying an upload | The filed record is unchanged: slice 1's fold reads the bound transmittal. Validation now shows the upload as "not yet approved". That is the truth about what was filed, and it is the same as an authored document whose approval lapsed after filing. | Nothing. A correction is a new sequence. |
| **Staging send** | Refused like production. Gate 2 does not read the environment, as for an authored leaf. | As in the draft state. |
| **Device technical-file export** | Its report counts the upload in `unfinalized`. It does not refuse it, as it does not refuse an unapproved authored leaf. | None required. |

**After C1 lands, no new sequence carrying an upload can be locked.** Freeze refuses it at both the gate and the
package check. So the locked states above are legacy only, and the probe in §10 Q2 sizes them.

---

## 8. Composition with the work that lands first, and with P-92, P-86 and P-93

| Work | How P-94 composes |
|---|---|
| **F1 slice 1** (the guard stamps `leafManifest` and `dispatchBinding`; the fold reads the bound transmittal) | **On origin** (`090f62af1`). No shared file. Every P-94 refusal happens **before** `gw.transmit`, so a refused attempt is never stamped. |
| **F1 slice 2** (a staging result leaves the sequence `'pending'`; a staging post-wire failure releases the claim; a production post-wire failure stays `'transmitting'`) | No file shared with C1. P-94 refuses before the wire in every environment. A held send is untouched by P-94 until the sequence is sent again. **C2 shares `submission-service.ts` with slice 2**, whose edits sit uncommitted in the working tree now, so C2 lands after slice 2 is on origin, on the coordinator's release of the file. C2's lines (`upsertLeaf`) are far from slice 2's (transmit, claim, receipt), so it rebases rather than conflicts. |
| **Repair A** (one live sequence per number) | None. |
| **Repair B** (readiness only for a live sequence, `assess-dispatch-readiness.ts`) | P-94 does not edit that file. Its test file gains T4. Both are RIM's, so the coordinator orders them. |
| **Repair C** (IND routes map service codes) | The IND routes answer from the same assessment. After C, the upload's `DISPATCH_BLOCKED` reaches them as the mapped status, with the same sentence. |
| **The receipt path** (`fda-esg-receipts.ts`) | None. A receipt settles what was sent. P-94 judges what is about to be sent. |
| **P-92 and P-86, with each other** | P-86 check 2b refuses `'transmitting'`, so P-92 (or a receipt) settles a held send first. Recorded as received means filed, and P-86 2a refuses. Released means `'pending'` with a production transmittal still bound, so P-86 checks 3 and 4 refuse. A released sequence is sent again, never retired (P-92's Q4). |
| **P-94 with P-92 and P-86** | P-92's settlement does not read `assessSequenceDispatchReadiness` (its E1–E8 read the held send), so P-94 never blocks a settlement. The re-send after a release (or after a rejection) runs readiness, and P-94 refuses it if the sequence carries an upload. P-86 refuses its retirement. That is the dead end of §10 Q2, and it is **P-92's Q4 made concrete**: "the only way on is to send 0001" fails when 0001 carries an upload. **This design does not propose widening P-86 to clear it** (§10 Q2, §11.4 finding 2). P-92 keeps open that a released send reached FDA: its release statement says "sending sequence NNNN again files it twice", and a late verified MDN is kept and holds the resend. After a P-86 retirement, the receipt path answers `unreconciled` for the non-live sequence (P-86 design, the receipts row of its §6 table), so the "at FDA twice" sentence would not even appear. C2 changes nothing here, because a locked sequence's leaves are never placed again. |
| **P-93** (over 1 GiB refused in `sequenceTransmitReadiness`) | No shared rule. Both appear in the same precheck `refusal` chain. P-94's comes through `gate`, ahead of the size and gateway refusals. |
| **P-95** (review before approval, `artifact-approval-act.ts`) | Different store (`concept2cure_artifacts`). No overlap. |
| **RIM re-plan step 12** (S5-1, lineage per filed leaf; touches `leaf-source-resolver.ts`) | The same lane. P-94 lands first (a few lines in one branch), and step 12 rebases. |

---

## 9. Owed, and named (not fixed by P-94)

1. **The Submit step's sentence names an act the upload cannot take.** `findingSentence`
   (`MarketBlockers.tsx:51`) says "Approve “T”" for every `DOCUMENT_NOT_APPROVED`. Under (A) an upload is replaced,
   not approved. The server's sentence, which says so, sits behind the finding's detail. The fix is a copy and
   behaviour change in a Submit-step file, for every store. It belongs to the D7 layout lane or the coordinator.
2. **Readiness does not check that an upload is a PDF.** The Vault lookup does (`leaf-document-resolver.ts:288-292`).
   After P-94, readiness refuses a non-PDF upload as "not yet approved", while freeze names it as unresolved. Both
   refuse, but readiness names the lesser reason. This is a small F1 repair for RIM.
3. **The defect class.** An absent `notTransmittable` reads as releasable (`contentFindings`), and an assembler branch
   without `noteUnfinalized` ships as approved. After P-94, every store the resolver reads gives a verdict. A drift
   test over `RESOLVABLE_DOCUMENT_TABLES`, or failing closed on `undefined`, would stop the next store slipping
   through. Whether to build it is the coordinator's call.
4. **Stale comments seen.** `submission-service.ts:2836-2859` ("vault/onboarding" as external);
   `assemble-from-core.ts:96` and `assemble-technical-file-from-core.ts:93` (uploads unresolved); and
   `leaf-source-resolver.ts:21-25` (Vault unresolved). Each goes to its holder. Step 12 edits the last file next.
5. **The upload store's own gaps.** It records no uploader and no audit row, it has no client caller and no download
   route, and it is on no deploy applier. That is §10 Q3, not P-94.
6. **The D7 record's item 4** (`docs/evidence/W5/2026-11-01/README.md:126-127`) is marked decided, citing C1, by the
   D7-record lane or the coordinator.
7. **The MCP tool's description** (`server/mcp/tools/governed.ts:30-36`) names only Vault and co-author documents,
   while its enum admits uploads. Under C2 and (A), that enum entry can never succeed, because the tool admits no
   `delete`. Its holder removes it, or keeps it with the refusal named in the description.
8. **AnA cannot place a Vault version.** `place_into_sequence`'s schema (`submission-center-tool-defs.ts:950-975`)
   and its handler (`AnaToolExecutor.ts:9974-10020`) carry no `document_uuid`, so a Vault leaf from AnA is refused at
   `upsertLeaf`'s key-space check. Its description, and `skills/library/submissions.ts:307`, still say a Vault pointer
   "cannot be materialised" and is "an error at dispatch". That has been false since 2026-09-17
   (`leaf-document-tables.ts:37-48`). Under C2 these steer AnA away from the one replacement path. Completing the
   existing tool (a uuid input, the corrected description) is for its holder. P-94 does not wait for it.

---

## 10. Questions back (only where the decision does not settle it)

- **Q0 (coordinator, before C1). Is "placed" in P-94 literal?** The record (`LAUNCH_DEFINITION_OF_DONE.md:1863`) says
  an uploaded leaf is approved "before it can be placed in a sequence". The same record says "filed" in its heading
  and in the founder's question and answer. It refuses at readiness and transmit "as they do an unapproved authored
  leaf", which today is placed first (§2.2), and its owner line names "readiness and transmit" only.
  - **(P1) Literal.** C2 (§5.6) refuses, in `upsertLeaf`, a leaf that would ship an upload's content, and keeps a
    withdrawal open. Under (A) no upload can be placed again. That is Q3's outcome reached through P-94, and it
    covers eCTD and device technical files alike. C2 carries a deletion record, and AnA has no replacement door (§9
    item 8). It treats an upload unlike an unapproved authored or Vault leaf, which stay placeable. The record asks
    for that if read literally.
  - **(P2) "Placed" means "filed".** The coordinator records the ruling, citing the heading, the founder's answer, the
    record's "as they do an unapproved authored leaf" and its owner line. C2 is not built. C1 alone meets the record.

  The design recommends nothing between (P1) and (P2). The record's words decide, and only the coordinator, or the
  founder through the coordinator, can say which words govern. C1 is the same code under both.
- **Q1 (founder, through the coordinator). What does "approved" mean for an onboarding upload: (A) or (B)?**
  Nothing in its store can approve it, and the row has no uploader, so P-18 (the author is not the approver) cannot
  even be judged in place. The record settles part of this: "the approval itself uses the existing approval act,
  nothing new". So the act is the Vault's, and (C) is refused. It leaves (A) against (B). Its "goes through the same
  approval as an authored one" leans toward (B), because under (A) the upload leaf itself is never approved.
  - **(A), built by C1 as the floor:** only a Vault version is approved. The upload is replaced on existing screens.
    It fails closed. With (P1) it makes the upload unplaceable.
  - **(B):** the same bytes, approved through the Vault's existing act in this organization's Vault in the onboarding
    project's program, clear the upload. With (P1) it makes an upload placeable once its bytes are approved. It would
    reuse:
    - `vaultVersionNotTransmittable`;
    - the program join that `submission-leaf-source-evidence.ts:248-251` already uses
      (`ctd_onboarding_projects.project_id → projects.regulatory_program_id`);
    - the per-program `content_hash` index (`migrations/20260906c_vault_documents_content_hash_idx.sql`).

    Its cost: a cross-store binding by hash, which is a new rule even though it is built from existing parts. The
    leaf's lineage would name the upload while the approval sits on a Vault record linked only by hash. The function
    becomes `async (q, organizationId, uploadSha256, programId)`; both readers already hold the hash, and C2's call
    site holds the pin and the program. **It is the only reading that clears the dead end in Q2 without a P-86
    change.**
  - **(C), refused by the record:** a new approval act on the upload row (§4).
- **Q2 (founder). The legacy dead end.** Take a sequence locked before P-94 that was sent to production, was then
  released as not received (P-92) or rejected by FDA, and carries an upload. It can be neither re-sent (P-94),
  retired (P-86 checks 3 and 4) nor changed. The options, in the order the design recommends:
  - **(ii) Reading (B). Recommended.** The number is kept, and the re-send carries the same bytes as the first send.
    If FDA did receive the first send after all, the duplicate is the one P-92's release statement already put to
    the signer before they signed ("sending sequence NNNN again files it twice"), and of identical content.
  - **(i) Accept it.** The number is never sent, and the next sequence takes the content. That leaves a gap in the
    numbering the agency sees, which is the founder's regulatory call. The next sequence is refused by
    `filingOrderRefusal` (`submission-service.ts:1460-1530`) wherever it files a lifecycle key that the stranded
    sequence also files, because the stranded sequence is locked and not filed.
  - **Not offered: P-86 admitting a sequence released as not received.** The first draft offered this as (iii). It is
    struck, because it carries a risk the founder was not told about:
    - P-86's act frees the number: `deleted_at` is set, and `createSequence` refuses only a live holder (P-86 design,
      the "freeing its number" row of §0).
    - The remedy then places the Vault versions in a new sequence, which takes the freed number with **different**
      content.
    - P-92 keeps open that the released send reached FDA. Its release statement says so, and a late verified
      positive MDN is kept and holds the resend (P-92 design §3.3, R5).
    - After a retirement, that late MDN answers `unreconciled` for the non-live sequence (P-86 design, the receipts
      row of its §6 table). FDA could then hold two different packages under one sequence number, and no sentence
      would say so.
    - It would also reverse the recorded P-86 condition "no production send is bound to it"
      (`LAUNCH_DEFINITION_OF_DONE.md:1691-1704`) and P-86 checks 3 and 4.

    If the founder wants that path anyway, it must keep the released number **reserved**: retired, never freed. That
    is not P-86's act and needs its own founder decision.

  **First the coordinator sizes it** on each deployed database, read-only (not run here; no database in this
  session):

  ```sql
  SELECT s.status, s.dispatch_status, count(*) AS upload_leaves
    FROM submission_leaves l
    JOIN ectd_sequences s ON s.id = l.sequence_id AND s.organization_id = l.organization_id
   WHERE l.document_table = 'ctd_onboarding_documents' AND l.deleted_at IS NULL
     AND lower(trim(l.lifecycle_op)) <> 'delete' AND s.deleted_at IS NULL
   GROUP BY 1, 2;
  ```

  If `to_regclass('public.ctd_onboarding_documents')` is null, no such leaf can exist, because the write-side
  verifier's read would fail. If the query returns no locked row when C1 lands, the dead end cannot arise, because
  C1 stops any new upload from being locked (§7), and Q2 closes as moot.
- **Q3 (founder, R1; P-94 does not wait for it).** The upload route has never had a client caller, its project
  creator was retired, and the Vault calls itself the one upload path. Under (A) and (P2) an upload can be placed but
  never released. Should `ctd_onboarding_documents` stop being a placeable leaf source? Its replacement by path would
  be `VaultPlaceIntoSubmission.tsx`, with the deletion record naming the history search and the reach test. **Under
  (A) and (P1), C2 reaches Q3's outcome for new content** while keeping the store in the vocabulary for withdrawals
  and for leaves already placed. What would then be left of Q3 is the upload route and the table themselves.

---

## 11. Critique and resolution

### 11.1 Alternatives rejected

| # | Alternative | Why not |
|---|---|---|
| X1 | Add the store to `FinalizedStatusStore` with an empty approved set, so `notFinalizedStatus` itself answers (literally "the same function") | `status` is a processing vocabulary, so its word ("uploaded") would print as the approval verdict and name no act. The harness table has no `status` column, so the fixture would need editing. And it invites an ungoverned `UPDATE … SET status = 'approved'` to "approve" an upload, which is exactly the fail-open P-29 closed for `locked`. The one rule is the release rule (finding, `releaseBlockers`, the gates, `unfinalized`). Per-store verdicts are per store by design, and there are three already. |
| X2 | Refuse at placement **instead of** at readiness and assembly | It would miss uploads already placed, and the record names readiness and transmit. A refusal at placement **beside** the readers is not rejected. It is C2, built if Q0 answers "literal" (§5.6). The first draft rejected it "on P-22". That was a misreading, since P-22 decides validation against release and not placement (§2.2), and it is struck (§11.4 findings 1 and 4). |
| X9 | C2's refusal inside `LEAF_SOURCE_VERIFIERS.ctd_onboarding_documents` (the critique's proposal) | The verifier has no lifecycle op, and `upsertLeaf` calls it for deletes too (`submission-service.ts:3784-3791`; `PUT /leaves` accepts `delete`, `submissions.ts:235`). The withdrawal of a filed upload (`withdrawal-approval-binding.pglite.test.ts:401`, `:456`) would be refused, which would trap a document FDA holds. Mutation μ8 shows it. |
| X3 | Refuse only at transmit (Gate 2 or the guard) | The decision names readiness. A refusal after the password wastes a signature. The guard is slice 1's file, and approval is decided before `gw.transmit`. |
| X4 | An onboarding branch in `contentFindings` or `assembledTransmitBlockers` | A second copy of the rule, with a store name in a gate. |
| X5 | Build (B) now | It is a new cross-store binding, which is the coordinator's or founder's ruling to make, even though the record's words lean toward it (Q1). (A) fails closed meanwhile. |
| X6 | A new approval act on the upload row (C) | Refused by the record ("the existing approval act, nothing new"), and by RULE 6 and RULE 1 (§4). |
| X7 | Change the Builder's reader so its cell says "not approved" | Not needed for the decision, and it would treat an upload unlike a Vault PDF, which reads "Source evidence undetermined" too. The approval verdict for both appears on Validation, Dispatch and Submit. |
| X8 | Fail closed on an absent `notTransmittable` for every store | Broader than the decision, and it touches every resolution. Named in §9 item 3. |

### 11.2 Self-critique

- **"until the document is approved" does not literally fit an upload under (A).** The shared sentence
  (`dispatch-readiness.ts:559-560`, `dispatch-gate.ts:103-104`) promises approval of the document, but an upload is
  replaced, not approved. *Resolution:* the verdict inside the parentheses names the act ("approve it in the Vault and
  place that version instead"). The shared sentence stays one sentence for every store (the record: "as they do an unapproved authored leaf"). Under (B) it
  becomes literally true.
- **The verdict names an act a locked sequence forbids** ("place that version instead"). *Resolution:* after C1 no
  upload can be locked (§7). The legacy locked cases are sized by Q2's probe and released by P-86 when unsent. The
  verdict is per document and must not branch on the sequence's state.
- **Is a function returning a constant over-built?** It is the seam (B) would change, and the call sites keep their
  shape. It costs nothing.
- **Is T4 in the right file?** `assess-dispatch-readiness.vault-leaf.pglite.test.ts` is the DB-bound assessor's test
  of per-store verdicts and already holds the Vault `DOCUMENT_NOT_APPROVED` case to mirror. It has the table
  (`leafSources: true`). A new test file was rejected (RULE 6 favours extending). The file name says "vault-leaf", so
  T4 sits in its own `describe('… an uploaded file', …)`.
- **Does P-94 change anything that already passed?** Yes, intentionally: a sequence frozen or dispatched before P-94
  that carries an upload is refused at transmit from the day C1 lands. This matches how VR-14 and `bc2fa3b8c` landed
  (FD5: nothing is grandfathered). The probe makes it visible before landing.
- **"As they do an unapproved authored leaf", across environments.** The authored rule refuses in staging too, and so does this one. Slice 2's
  "a test send is not a filing" is about what a send records, not about what may be sent.

### 11.3 Corrections to the map (`decided2/p94-onboarding-approved.map.md`)

1. **The Builder row (map §2.3, §4) is wrong.** The Builder's cell does not read `resolveLeafDocument`. It reads
   `readSubmissionLeafSourceEvidence` (`submissions.ts:1163`), which answers an upload as `undetermined`, so the cell
   reads "Source evidence undetermined" before and after P-94. It never reads "not approved: …".
2. **The map's verdict string contained a ';'.** `assembledTransmitBlockers` writes each section as
   `label: verdict` and joins them with `'; '` (`assemble-from-core.ts:158-160`). Its callers join the blockers with
   `'; '` again (`submission-service.ts:1593`, `:2884`). A ';' inside a verdict therefore makes the list ambiguous.
   The wording here has neither ';' nor ':'.
3. **The map missed two readers of the count.** The device technical file's report and the Dispatch tab's test
   package ("N not approved") now count the upload, by the same rule (§2.5, §6 words).
4. **T3 moves** to the resolver's own test file (`leaf-document-resolver.pglite.test.ts`, which has the table). T1
   and T3 each compare with the export, so the two readers' equality still holds.

The map's other claims were re-read on origin and hold: the store and its single writer, no update anywhere, the two
readers' omissions, every refusal site and its wording, the Vault path, the D7 record's claim, and the composition
with slice 1, slice 2, repairs A–C, P-92, P-86, P-93 and P-95.

### 11.4 Review findings, round 2 (2026-11-02), and how each was resolved

These were read against `origin/concept2cure-v2` at `f3b0418ed`, where `1c48581ae` has landed. Each finding was
checked against the code before it was applied.

| # | Finding (severity) | Resolution | Where |
|---|---|---|---|
| 1 | The P-94 record is on origin, and its words ("placed in a sequence", "the same approval as an authored one", "the existing approval act, nothing new") contradict the design's placement rule and lean toward (B) (major) | **Applied.** The record is quoted word for word, and the stale "not on origin" text and the old Q0 are gone. A new Q0 asks the coordinator, before C1, whether "placed" is literal. The P1 branch is C2. The P2 branch is a recorded ruling. Q1 is re-asked as (A) against (B), saying that the record leans toward (B). (C) is closed as refused by the record's "nothing new". **Not applied as written:** the finding's placement of the refusal in `LEAF_SOURCE_VERIFIERS.ctd_onboarding_documents`. The verifier runs for deletes (`submission-service.ts:3784-3791`; `PUT /leaves` takes `delete`, `submissions.ts:235`; AnA's enum carries `delete`), so it would refuse the withdrawal of a filed upload (`withdrawal-approval-binding.pglite.test.ts:401`, `:456`). C2 refuses in `upsertLeaf` instead, after tenancy, with a delete exemption and with the stored op judged on an update (X9, μ8–μ11). Also not applied: the finding's "record that this narrows P-22". Finding 4 shows P-22 does not decide placement, so C2 narrows practice, not P-22. | §0 items 4–6; §1; §2.2 (write-side and withdrawal rows); §3; §4; §5.5; §5.6; §6 C1 and C2; §10 Q0, Q1, Q3; §11.1 X2, X5, X6, X9 |
| 2 | Q2 option (iii) offered the founder a path to two different packages at FDA under one sequence number, without stating the risk (major) | **Applied.** (iii) is struck from the options. It survives only as a "not offered" note stating the risk, built from P-92's own words and P-86's behaviour: (a) the number is freed (`deleted_at`; `createSequence` refuses only a live holder); (b) the new sequence carries different content; (c) P-92 keeps open that the released send reached FDA; (d) after a retirement a late MDN answers `unreconciled`, so nothing would say so; (e) it would reverse P-86's recorded condition. If the founder wants it anyway, the number must stay reserved, which is not P-86's act and needs its own decision. The options are reordered: (ii), reading (B), is recommended, because it keeps the number and re-sends identical bytes under P-92's stated risk. (i) comes next, with its `filingOrderRefusal` limit named. The §8 P-94/P-92/P-86 row says the design does not propose widening P-86. | §8; §10 Q2 |
| 3 | The evidence wording and T4's red rationale describe refusals no one sees and a cause that is not the cause (minor) | **Applied.** The words table's row "Transmit after assembly (a sequence dispatched before P-94)" was wrong. A dispatched sequence is refused before the password by `sequenceTransmitReadiness`'s fresh `gate` (`submission-service.ts:2611-2638`). A signature taken before C1 is refused at Gate 2 (:2742-2746), before the claim (:2793) and the assembly (:2816), and is voided (:2686, P-23). The table now has those two rows, and the post-assembly sentence is marked as defence in depth that no person sees and the README does not record. This also matches §7's "Transmit refuses before the password". T4's "All three gates clear on this leaf" was false: the fixture runs no Shadow Review, so the gates are blocked today for that reason (`assess-dispatch-readiness.vault-leaf.pglite.test.ts:201-222`). The red reason now names the missing finding, `releaseBlockers` 0 and the missing blocker text, and the blocker text is the stated red signal. T4's assertions were already right; only the reason changes. | §6 T4; §6 words table |
| 4 | The record has landed, and the design contradicted its placement clause on the strength of a misread P-22 (critical) | **Applied.** P-22 (`LAUNCH_DEFINITION_OF_DONE.md:318-322`) decides validation against release. It only implies that unapproved *Vault* leaves are placed, and no founder decision puts or removes an approval check at placement (§2.7 search). "An unapproved document may be placed (P-22)" (§2.2), "placement … stays allowed (P-22)" (§5.5), §3's "not validation or placement" and X2's P-22 reason are all removed. Today's placement of unapproved documents is stated as practice, with the code that shows it (:3121-3226, :3827-3829). The record's internal tension ("placed" against "the same approval as an authored one", "as they do an unapproved authored leaf", the "filed" heading and the owner line) is surfaced as Q0, not settled. Of the finding's two ways forward, (i), ask before C1, is taken, and (ii), the placement refusal, is designed as C2 for a "literal" answer. C2 carries the deletion record the finding asks for, and the hold on `submission-service.ts` (slice 2's file now). **One further fact found while applying it:** AnA's `place_into_sequence` carries no `document_uuid` (`AnaToolExecutor.ts:9989-10002`), so AnA cannot place a Vault version. C2's deletion record therefore names no AnA replacement and says so (§5.6, §9 item 8). | §0; §1; §2.2; §2.7; §3; §5.5; §5.6; §6; §9 items 7–8; §10 Q0; §11.1 X2 |

**How P-92 and P-86 compose with P-94 after this revision.** Nothing changes for a held send. P-86 check 2b refuses
`'transmitting'`. P-92 settles a held send, or a receipt does. P-94 never reads the held send. After a release, a
sequence carrying an upload is refused at readiness by C1, and P-86 refuses to retire it (checks 3 and 4). C2 does not
touch it, because its leaves are locked. That dead end goes to the founder as Q2, with (ii) recommended. P-86 is
not widened.
