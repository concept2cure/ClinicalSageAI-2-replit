# Package-spine sweep — implementation plans for the open findings

Two read-only planning passes (2026-10-01) checked a proposed fix against the code before any of it was written. They are kept verbatim because the remaining work (F19's agency-rejection action; F04 and F08; the hand-offs) is built from them. Parts already landed are marked in `README.md`. Line numbers are as of the pass and will drift.

## F19 — reconciling the filed record (agency technical rejection, one bundle per sequence)

I checked the proposed shape against the code. All five parts hold. Three need corrections, and the un-file path creates one new hazard the proposal doesn't cover. No migration is needed: package metadata is JSON, `submission_transmittals.status` is free text with no CHECK, `c2c_ana_actions.command` has been open vocabulary since `20260730_c2c_ana_actions_command_vocab.sql`, and `binding_basis` is free text.

### Verdict on the proposed shape

1. **`state` on the filed entry — validated, and only the reader needs to change.**
   - `foldFiledState` and `planSequence` only ever receive the reader's output. The one production call is `submission-ops.ts:2527`. Filtering inside `readFiledSequences` is enough; their signatures stay as they are.
   - Store `recordedAt`/`recordedBy`, not `rejectedAt`. The agency's rejection time is in its notice; the platform does not know it and would be making it up.
2. **Conflict outcome — validated, with a richer return.** Return a discriminated object that names the bundle holding the number (sha, transmittal). A boolean cannot say which bundle holds it, and `true` on a conflict is the defect itself. `'write-failed'` replaces `false`.
3. **Pre-transmit refusal — validated, with three corrections.**
   - Read the history from the SELECT `loadStoredBundle` already issues (`governed-transmit.ts:231-235`). A second SELECT breaks the pinned `expect(packageSelects).toEqual([[5, CALLER_ORG]])` (`tests/mdx-submission-gateway-transmit-bundle-guard.test.ts:536`) and gains nothing.
   - It does **not** close the case where both sends are in flight at once. That is F15 (unverified). Fixing it needs a transmit lock keyed on the sequence, and transmittal rows don't record the sequence. Part 2 makes that case visible after the fact; it does not prevent it.
   - The client's transmit-409 branch assumes every 409 is the active-transmittal lock (`GatewayTransmittals.tsx:336-344`). Without a code branch, it would tell the operator "transmittal #N is already active … Roll it back first". That advice is wrong here, because a rollback does not un-file.
   - **New hazard:** an assembly of N+1 already running, planned against N, would store its bundle after N is un-filed. Close it with a filed-history comparison where `submission-ops.ts:2865-2880` stores the bundle under the row lock. The same comparison catches a sequence being recorded during an assembly.
4. **Operator action — validated, with these changes:**
   - **Key it on the transmittal, not package+sequence.** Match the filed entry strictly by `transmittalId` (sha256 only when the entry has none). If the same sequence was sent twice and the agency loaded #1 but rejected duplicate #2, recording the rejection on #2 must not un-file #1.
   - **Put the route on the gateway router next to rollback** (`mdx-submission-gateway.ts:355-427`, same re-auth ceremony). Put the service next to `recordFiledSequence`.
   - **Evidence is a Vault document id.** The service reads it with `readVaultSource` (`server/services/regulatory/lifecycle-signature.ts:73`, tenant-scoped, not deleted, FOR SHARE; content hash frozen by `20260926_vault_documents_record_immutability`) and binds the e-signature to it with `BINDING_BASIS.VAULT_DOCUMENT_VERSION`. The precedent is the eSTAR filing signature bound to a Vault document (`estar-submission-service.ts:238-337`). An operator uploads the notice through `POST /api/vault/ingest`; no new upload path.
   - **Ruled out as evidence:**
     - `mdn_raw` is only the transport receipt.
     - `submission_validation_findings` rows are typed by the operator, not agency bytes.
     - A gateway status poll's raw response is not kept.
   - **Ceremony: governed `sign` with a declared meaning plus `persistGovernedActionSignature`, in ONE transaction under the package lock.** Rollback writes a ledger row only.
     - If the ledger or signature write fails, nothing is un-filed.
     - Do not reuse `recordPackageGovernedAction`: it deliberately keeps the mutation when the audit write fails, which is right after an irreversible send and wrong here.
   - **Also move the transmittal row to `validation_failed`.** That is the status every other gateway's poll already uses for an agency rejection (`ema-cesp.ts:378` and seven others). It also frees the same-bytes lock: the lock index predicate is `pending|in_transit|received` (`migrations/20260629…:23-25`).
   - **Clear a stored bundle whose sequence is above the rejected one.**
   - **Only the latest filed sequence can be rejected.** Three reasons:
     - `planSequence` only allows consecutive numbers (`package-sequence-lifecycle.ts:313-329`). Un-filing a sequence below one still on file leaves a gap that can never be filled: its number cannot be reused while a higher one is on file.
     - The later sequence's operations and `modified-file` pointers were planned against the rejected content. The record would claim the agency holds a sequence built on one it does not have.
     - A notice about 0001 is not evidence about 0002. Requiring reverse order makes each un-file carry its own notice.
5. **UI — `GatewayTransmittals.tsx`, not `SubmissionCenter.tsx`.** `SubmissionCenter.tsx` belongs to the other spine (`ectd_sequences`). No client surface shows `filedSequences` today. The transmittal log row's Rollback action (`ROLLBACK_FORM` → `C2CForm governed`, reason + password + TOTP) is the pattern to follow; the transmit form adds the §11.50 meaning select.

### (a) and (b): files, functions, types

**`/home/user/ClinicalSageAI-2-replit/server/services/ectd/package-sequence-lifecycle.ts`**
- L55-66: `FiledSequence` (the reader's output) is unchanged. Add:
```ts
export type FiledSequenceState = 'transmitted' | 'rejected';   // absent = 'transmitted' (pre-2026-10-01 histories)
export interface FiledSequenceRejection {
  recordedAt: string; recordedBy: number; reason: string;
  evidence: { vaultDocumentId: string; contentSha256: string };
  transmittalStatus: { previous: string; current: string };
  actionId: string; signatureId: number;
}
export interface FiledSequenceRecord extends FiledSequence { state?: FiledSequenceState; rejection?: FiledSequenceRejection }
/** The ONE predicate reader and writer share: only 'rejected' is off file. */
export function isRejectedFiling(e: unknown): boolean
```
- L104: in `readFiledSequences`, add `if (isRejectedFiling(e)) continue;` after the object check. Update the module and function docs.

**`/home/user/ClinicalSageAI-2-replit/server/services/ectd/package-content-change.ts`**
- Imports (L26-35):
  - `readFiledSequences` and `isRejectedFiling` from `./package-sequence-lifecycle`
  - `persistGovernedActionSignature` and `BINDING_BASIS` from `../part11/signature-persistence`
  - `readVaultSource` from `../regulatory/lifecycle-signature`
- **`recordFiledSequence`** (L178-209, doc L162-177):
```ts
export type FiledSequenceWrite =
  | { outcome: 'recorded' } | { outcome: 'already-recorded' }
  | { outcome: 'conflict'; filed: { sha256: string; transmittalId: number | null } }
  | { outcome: 'write-failed' };
```
  - Look up the existing entry with `!isRejectedFiling(h) && h.sequence === entry.sequence`.
  - Same sha → `already-recorded`. Different sha → `conflict`; nothing is written either way.
  - Otherwise append `{ ...entry, state: 'transmitted', filedAt }`.
  - catch → `write-failed`.
- **New** (after L209): `FiledSequenceRejectionRefusal`.
  - Fields: `code`, `httpStatus: 404|409|422`, `details`.
  - Codes:
    - `TRANSMITTAL_NOT_FOUND` (404)
    - `NOT_A_PACKAGE_TRANSMITTAL` (422)
    - `TRANSMITTAL_NOT_ON_FILE` (409)
    - `NOT_LATEST_FILED_SEQUENCE` (409, `details.later`)
    - `TRANSMITTAL_RECORDS_ACCEPTANCE` (409)
    - `EVIDENCE_NOT_FOUND` (422)
- **New:** `recordFiledSequenceRejection({ orgId, transmittalId, actorUserId, reason, meaning, evidenceDocumentId, authenticationMethod, secondFactorVerified, ipAddress })` returns `FiledSequenceRejectionOutcome`: `{ packageDbId, sequence, transmittalId, bundleSha256, transmittalStatus, evidence, staleBundleCleared: {sequence, sha256} | null, actionId, signatureId, recordedAt }`.
  1. **Before taking the lock:** `SELECT t.package_id FROM submission_transmittals t JOIN c2c_submission_packages p ON p.id=t.package_id AND p.org_id=t.organization_id WHERE t.id=$1 AND t.organization_id=$2`. This is needed because `withPackageMetadataLock` does not scope by org.
  2. **Inside `withPackageMetadataLock(packageDbId, async (current, client) => …)`** — throwing anywhere rolls back everything:
     - Re-read the transmittal FOR UPDATE.
     - Find the target in `readFiledSequences(current)`: by `transmittalId`, or by sha only when the entry's `transmittalId` is null.
     - If it is not the highest on-file sequence → `NOT_LATEST_FILED_SEQUENCE`.
     - If the status is `ack3_received | validation_passed | review_started | response_required | completed` → `TRANSMITTAL_RECORDS_ACCEPTANCE`.
     - `readVaultSource(client, orgId, evidenceDocumentId, { lock: true })` → `EVIDENCE_NOT_FOUND` if absent.
  3. **Ledger and signature (same transaction):**
     - `recordGovernedAction(client, { command: 'sign', target: 'submission:'+packageDbId, payload: { meaning, change: 'filed-sequence-rejected', sequence, transmittalId, bundleSha256, evidence, transmittalStatus, staleBundleCleared } })`.
     - `persistGovernedActionSignature`:
       - `binding: { digest: evidence.contentHash, basis: VAULT_DOCUMENT_VERSION, note }`
       - `manifestKind: 'governed-filed-sequence-rejection'`
       - extra manifest: sequence, transmittal and evidence id
  4. **Transmittal row:**
     - `in_transit | received | ack1_received | ack2_received` → `validation_failed`, `error_class 'validation'`, plus an error message.
     - Any other status keeps its status.
     - Always merge `metadata = COALESCE(metadata,'{}'::jsonb) || {technicalRejection:{…}}`.
  5. **Package metadata:**
     - Mark the raw entry `{ state: 'rejected', rejection }` and keep it.
     - If `current.bundle.sequence > target.sequence`, drop `bundle` and `preflight`.

**`/home/user/ClinicalSageAI-2-replit/server/services/submission-gateways/governed-transmit.ts`**
- **Imports:** L55 adds `readFiledSequences` and `type FiledSequence`.
- **Refusal codes:** L79-89 adds `'SEQUENCE_ALREADY_FILED'` (409).
- **`loadStoredBundle`:** L227-285 returns `{ bundle, filed: readFiledSequences(rows[0]?.metadata) } | null`. The call site at L437-444 keeps `let filed: FiledSequence[] = []`.
- **New check after L520** (before the content-fingerprint read):
  - Condition: `packageId != null && !clientBundle && bundle.sequence` and `filed.find(f => f.sequence === bundle.sequence)` has a different sha256.
  - Throws `GovernedTransmitRefusal('SEQUENCE_ALREADY_FILED', msg, 409, { code: 'SEQUENCE_ALREADY_FILED', sequence, filedSha256, filedTransmittalId, nextSequence })`.
  - The message must contain no API path, because the client's `serverMessage` drops infrastructure text.
- **Outcome type (L366-379):**
  - `filedSequenceReason`: `'recorded' | 'already-recorded' | 'no-sequence' | 'no-usable-manifest' | 'sequence-conflict' | 'write-failed'`
  - New field: `filedSequenceConflict: { sequence: string; filedSha256: string; filedTransmittalId: number | null } | null`
- **Recording the outcome (L681-694):**
  - `filedSequenceRecorded = outcome ∈ {recorded, already-recorded}`.
  - Map `conflict` to `sequence-conflict` and log `transmit-filed-sequence-conflict`.
- **Ledger facts:**
  - L714-719: `filedSequenceFacts` spreads `filedSequenceConflict` only when present, so it reaches both the sign payload and the signature manifest.
  - L820-828: return it.

**`/home/user/ClinicalSageAI-2-replit/server/services/submission-gateways/transmit-notices.ts`** (L31-61)
- Add `'filedSequenceConflict'` to the `Pick`.
- Conflict wording names the sequence and the holder's transmittal #, says two bundles were sent under one number and the agency will load at most one, says this one was not added, and tells the operator to confirm with the agency and raise it with an administrator.
- The other reasons keep the existing first sentence, which the AnA test regex depends on.

**`/home/user/ClinicalSageAI-2-replit/server/routes/mdx-submission-gateway.ts`**
- Header L6-14: list the new endpoint.
- Extract `SIGN_MEANINGS` and use it at L186.
- Transmit 201 body (L262-274): add `filedSequenceConflict`.
- **New** after L427: `POST /gateways/transmittals/:id/technical-rejection`.
  - Gated by `requireEditorAccess`.
  - zod body: `{ reason ≥8, meaning: enum(SIGN_MEANINGS), evidenceDocumentId: uuid, reauth? }`.
  - `verifyReauth` → 401 with `WWW-Authenticate`. `authenticationMethod` and `secondFactorVerified` use the same expressions as L240-241.
  - Success → `ok(res, outcome)`.
  - `FiledSequenceRejectionRefusal` → `clientError(res, e.httpStatus, e.message, { code: e.code, ...e.details })`.
  - Anything else → `serverError(…, 'transmit-technical-rejection')`.

**`/home/user/ClinicalSageAI-2-replit/server/routes/submission-ops.ts`**
- At L2196, hoist `const filedAtStart = readFiledSequences(existingMetadata)` and its key (`sequence:sha256` joined). Use `filedAtStart` at L2527.
- `discardCause` union becomes `'content_changed' | 'identifiers_changed' | 'filed_history_changed'`.
- In the lock callback, after L2868-2870: if the key computed from `current` differs from the start key → `'filed_history_changed'`.
- L2907-2910: add the message "The package's filed history changed while the bundle was being assembled (a sequence was recorded as filed, or a filing was recorded as rejected by the agency) … Assemble again."

**`/home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx`**
- `Transmittal` (L52-64): add `package_id?: number | null` and `metadata.technicalRejection?`.
- Extract `SIGN_MEANING_OPTIONS` (L237-243).
- Add `TECHNICAL_REJECTION_FORM(id)` after L260.
  - Title "Record the agency's technical rejection of transmittal #N".
  - Fields: evidenceDocumentId, reason, meaning (default `responsibility`), password, totp.
  - Sub-text says it is only for a sequence the agency did not load, that it is not a rollback, and that only the latest filed sequence qualifies.
- Dialog union (L274): add `{ rejection: number }`. Narrow the rollback callback at L607-609 with `'rollback' in dialog`.
- New `recordRejection` callback:
  - Close the drawer first.
  - 401 and other refusal toasts use `serverMessage(raw)`.
  - Success toast says the sequence is off the filed history and that the next assembly reuses its number; it also mentions a cleared stale bundle when there was one.
- Transmit 409 (L336-344): if `held?.code === 'SEQUENCE_ALREADY_FILED'`, toast `serverMessage(raw)`; otherwise keep the existing active-lock toast.
- Row actions (L719-723): add a "Technical rejection" button (`I.alertTriangle`) when `t.package_id != null`. Under the status (L710-711), show a line when `metadata.technicalRejection` is present.
- L791: render the right form for each dialog kind.

**Docs**
- `/home/user/ClinicalSageAI-2-replit/docs/runbooks/ectd-transmit-path.md` §2a (L139-148 and the refusal list at L172+): add the technical-rejection path, the transmit-time `SEQUENCE_ALREADY_FILED`, and the new filed-sequence reasons.
- Sweep README: move F19 to fixed, with failing-first output.

### (c) Existing tests that pin current behavior

| File:lines | What changes |
|---|---|
| `tests/submission-ops-package-spine.pglite.e2e.test.ts:152-162` (`fileTheStoredBundle`) | `expect(ok).toBe(true)` becomes `toEqual({ outcome: 'recorded' })`. The helper inserts a real `submission_transmittals` row and passes its id. DDL (L81-108) and seed DROP (L113) add `submission_transmittals` and `CREATE SCHEMA vault; vault.documents(id uuid, organization_id int, content_hash char(64), deleted_at timestamptz, created_by int)`. Add a `vi.mock` of `part11/signature-persistence` (spread the original, stub `persistGovernedActionSignature`). |
| `tests/mdx-submission-gateway-transmit-bundle-guard.test.ts:150-189` and `:266-270` | Harness only. `StoredPackage.filedSequences?` is passed through the package stub. `ledgerQuery` answers `/FOR UPDATE/` on `c2c_submission_packages` with `{ metadata: lockedHistory ? { filedSequences: lockedHistory } : {} }`. The assertions at :536, :569-577, :587-589, :620-639 and :655-667 keep passing (`toMatchObject` tolerates `state`). |
| `server/services/ana-ri/__tests__/mdx-command-handlers.test.ts:640, :679` | Not broken: `null` and `'append-failed'` fall into the default wording. Optionally correct them to `'recorded'` and `'write-failed'`. |
| `tests/mdx-submission-gateway-routes.test.ts:177-186, :212-217` | Add the new route to the auth-gate and role-gate tables. |

These do **not** change:
- `tests/submission-ops-assemble-routes.test.ts`: its `FOR UPDATE` mock returns the same history, so the keys are equal. None of the concurrency tests at :350-512 use `filedSequences`.
- `package-sequence-lifecycle.test.ts:47-66`.
- `gatewayTransmittals.test.tsx:160-173` and `:759-774`, as long as the new 409 branch checks `details.code`.

### (d) Failing-first tests to add

1. **`server/services/ectd/__tests__/package-sequence-lifecycle.test.ts`**
   - `readFiledSequences` skips a `state: 'rejected'` entry. Fails at HEAD.
   - `planSequence('0001')` over a history whose 0001 is rejected: no throw, and the replace's `modifiedFile` points into 0000. At HEAD it throws `SEQUENCE_ALREADY_FILED`.
2. **PGlite e2e**, new describe "a filing the agency technically rejected (F19)":
   - **B1:**
     - `recordFiledSequence` with a different sha under 0000 → `{ outcome: 'conflict', filed: { sha256, transmittalId } }`, and the history is unchanged.
     - The same sha → `already-recorded`.
     - At HEAD it returns `true`.
   - **B2a (failing-first evidence):** after 0000 and 0001 are filed, write `state: 'rejected'` on 0001 via SQL. Assembling 0001 then gives 200, `summary {replace:1, unchanged:2}`, and the pointer lands under `0000/` (reuse the assertion at L251-258). Assembling 0002 gives 409 `SEQUENCE_OUT_OF_ORDER`. At HEAD, assembling 0001 is 409 `SEQUENCE_ALREADY_FILED`.
   - **B2b:** the same through `recordFiledSequenceRejection`. Assert:
     - the entry has `state 'rejected'` and the evidence hash
     - the transmittal status is `validation_failed`
     - the signature mock received `binding.basis 'vault-document-version-sha256'` with the Vault hash
     - the ledger received `command: 'sign'`
   - **B3:** rejecting 0000 while 0001 is filed → `NOT_LATEST_FILED_SEQUENCE`. Metadata deep-equals its previous value, the transmittal is unchanged, and the signature mock is not called.
   - **B4:** evidence from another org, or a deleted document → `EVIDENCE_NOT_FOUND`, nothing written.
   - **B5:** a stored 0002 bundle is cleared when 0001 is rejected.
   - **Optional pin:** `rollbackTransmittal` leaves 0001 filed. It passes before and after.
3. **Bundle-guard** (use `environment: 'production'` so F14 doesn't invalidate it):
   - **C1:** the history holds 0001 under a different sha → 409, `details.code 'SEQUENCE_ALREADY_FILED'`, `filedTransmittalId`, and `transmitFn` not called. At HEAD: 201.
   - **C2:** a rejected 0001 in the locked history → 201, and the UPDATE appends a new 0001 entry. At HEAD: no write.
   - **C3:** `transmitFn` sets `lockedHistory` (another 0001 recorded during the send) → 201, `filedSequenceRecorded false`, reason `'sequence-conflict'`, the warning names transmittal #, and the sign payload carries the reason. At HEAD: `true` / `'recorded'`.
4. **`tests/submission-ops-assemble-routes.test.ts` D1:** modeled on :373-391. `packageLeafBytesFn.mockImplementationOnce` swaps in a history with a new 0001. Expect 409 `{code:'STALE_ASSEMBLY', gate:'filed_history_changed'}`, `updateSet` null, `unlink` called once, ledger cause recorded. At HEAD: 200 and stored.
5. **`tests/mdx-submission-gateway-routes.test.ts`:**
   - Viewer → 403.
   - No password → 401, and `connectFn` is never called.
   - Transmittal not in tenant → 404 with `details.code`.
6. **`gatewayTransmittals.test.tsx`:**
   - The button posts the correct body and the toast says the sequence is off file. The `C2CForm` mock needs a branch for the new title.
   - A 409 with `details.code SEQUENCE_ALREADY_FILED` shows the server's sentence, not "already active".

### (e) Risks and blast radius

- **AnA `esgTransmit`** (`mdx-command-handlers.ts:724-968`): no code change.
  - `mapTransmitError` passes `GovernedTransmitRefusal` through generically (L984-993): `error = 'SEQUENCE_ALREADY_FILED'` and `data = details`, which names an existing transmittal, not a new identifier.
  - The conflict notice reaches it through `transmitOutcomeNotices` (L895-899).
  - AnA gets no command for recording a rejection; it stays a human governed action (RULE 2).
- **Sequence spine:**
  - Untouched: `prior-sequence-loader.ts`, `submission-service.ts`, `package-from-core.ts`.
  - `transmitSequence` writes `packageId: null` (`submission-service.ts:1432`), so the new route refuses its transmittals. The F19 analogue on that spine stays a hand-off.
- **Rollback** (`fda-esg.ts:886-984`): unchanged and does not un-file.
- **Transmittal status `validation_failed`:**
  - It frees the same-bytes lock and stays rollbackable.
  - Live polls on EMA, HC, PMDA and the others can overwrite the status later, but never the filed history.
  - The new action works on any gateway, unlike rollback, which is FDA-only.
- **Behavior change:** a stored bundle that conflicts with the filed history, which used to transmit and be reported "recorded", is now refused. F15 remains open.
- **F14 edits the same block** (`governed-transmit.ts:663-695`); do the two changes one after the other.
- **No undo:** a rejection recorded by mistake has no reinstate action. It is mitigated by re-auth, an e-signature bound to the notice's hash, latest-only, and refusing transmittals the agency accepted; the residual risk should be named.
- **Locking and failure:**
  - Lock order is package row, then transmittal row. Nothing holds them in the reverse order (governed transmit and rollback each hold only one), so there is no deadlock.
  - A signer whose identity cannot be resolved → the signature write throws, and the whole transaction rolls back (fail closed).

### Sequencing

1. Reader predicate and the d1 tests.
2. `recordFiledSequence` union, B1, and the helper fix.
3. governed-transmit and notices, with C1-C3.
4. The assemble store comparison, with D1.
5. The rejection service and route, with B2-B5 and the route tests.
6. The UI, with the client tests.
7. Runbook and sweep README with WITHOUT/WITH output.

#### Critical Files for Implementation
- /home/user/ClinicalSageAI-2-replit/server/services/ectd/package-content-change.ts
- /home/user/ClinicalSageAI-2-replit/server/services/submission-gateways/governed-transmit.ts
- /home/user/ClinicalSageAI-2-replit/server/services/ectd/package-sequence-lifecycle.ts
- /home/user/ClinicalSageAI-2-replit/server/routes/mdx-submission-gateway.ts
- /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx

## F04, F05, F07, F08 — the FDA admin block

I have what I need. The plan follows.

## Plan: F04, F05, F07, F08 on the package-model spine

### 0. Facts that change the brief

**1. The verifier's model of `<id>` is wrong.** Egress to fda.gov is blocked here. I found two independent public copies of FDA's `us-regional-v3-3.dtd` through GitHub code search: `vrushabh-rajaghatta/regos …/EPIC-007a/spec/` and `chirix33/regbridge …/fda-cder-ectd-322-public-standards-v1/assets/`. Both declare:
   - `applicant-info (id, company-name, submission-description?, applicant-contacts)`
   - `<!ELEMENT id (#PCDATA)>`. There is **no `dun-and-bradstreet-number` element**. The DUNS is the text of `<id>`.
   - `applicant-contact (applicant-contact-name, telephones, emails)`. Both wrappers are mandatory, in that order.
   - `telephone telephone-number-type CDATA #REQUIRED`
   - `application application-containing-files (false | true) #REQUIRED`
   - `submission-information (submission-id, sequence-number, form?)`. That allows at most one form; this belongs to F20 and is out of scope here.

   These are third-party copies. The vendoring policy in `assets/ectd-dtd/README.md` still requires checking them against FDA's own file once the DTD is vendored. The qualification harness's xmllint row (`qualify.ts:290`) does that automatically.

**2. `telephone-number-type` codes are not in the repo.** Nothing in controlled-vocab, SPEC_DIGEST or the golden fixtures has them. A third-party copy of FDA's `telephone-number-type.xml` v1.1 (AsOf 20121101) reads `fdatnt1` Business / `fdatnt2` Fax / `fdatnt3` Mobile. That is not a citable source. Writing any code before FDA's file is vendored would be fabrication, so it is a blocked step (Step 5).

**3. Sub-types cannot be inferred.** The same third-party register quotes FDA's *eCTD Submission Types and Subtypes* (Tables 1–2):
   - "If the submission … is creating a new regulatory activity, the submission-id should match the sequence number."
   - Subsequent amendments to the original application carry sub-type `amendment` and the original's sequence as submission-id.

   It also evidences `fdasst2`/`3`/`4` = presubmission/application/amendment. FDA's own examples open an activity with `application`, and example #23 opens one with `report`. So `application` does not continue an activity.

   **New item F21 (unverified):** the default `fdasst1` "Original" for 0000 is the repo's own inference (`cv-v3-data.ts:16-19`). It needs FDA's sub-type list. No code change is planned for it.

**4. FDA-ESG-002: hand it off, do not fix it here.**
   - The file is `ectd-regional-rules.ts:104-108`. The regex `FDA_APPLICATION_PREFIX = /^(IND|NDA|BLA|ANDA|DMF|DDT)-?\d{4,6}$/i` is at `:354` and the finding at `:522-533`.
   - The package spine never evaluates it. The assemble route uses `validateEctdLeafs` and the transmit side uses `pre-transmit-check`.
   - Its consumers are `ectd-validator-hardening.ts:205`, which feeds `routes/submission-orchestrator.ts`, `routes/submission-sign-release.ts` and `submission-package-orchestrator.ts`, plus `ectd4-validator.ts:795`.
   - No §0 row claims any of these. The shallow history shows no edit since the 2026-09-28 import.
   - Fixing it changes the orchestrator spine's `gatewayReady` verdict and its tests: `ectd-validator-hardening-uncovered.test.ts:307,378` and `submission-orchestrator.test.ts:358-389`.

**5. Edit windows.** `submission-ops.ts` is inside `…01KnUGoX`'s 24-hour window until **2026-10-02 00:22 UTC**. Their commit `1ec8ea49` touches POST `/packages` at about `:238-243`; none of this plan's hunks overlap it. Either wait, or land and disclose. Every other file this plan touches is outside any window.

**6. What would break the IND lane today if the packager failed closed:**
   - Missing submission-id on an amendment breaks:
     - every amendment, response or variation from `core-to-packager.ts:226-228`, `:320-328`;
     - `core-to-packager-fda-admin.test.ts:177-180`, which runs an amendment at sequence 0000;
     - the qualification lifecycle golden at `golden-fixtures.ts:166-171` → `qualify.ts:486`.
   - Missing contacts breaks:
     - `assemble-from-core.ts:650-652`, `package-from-core.ts:246-262`, `orchestrator-real-package.ts:181-200` and `AnaToolExecutor.ts:9097-9127`;
     - the golden contact at `:170`, which has no phone.
   - The deny-list and explicit-value checks break no current caller.

### 1. Decisions

- **Enforcement lives at the route now.** The shared packager gets only non-breaking changes: conformant markup, the deny-list, and refusal of explicitly contradictory values. Failing closed on missing values in the packager is Step 6, after hand-offs H1–H4.
- **Deviation from the "smallest fix": `submissionSubType` is required on every FDA follow-up.** An optional field that defaults to Original is F04 itself for any operator who leaves it blank. The route already requires `submissionType` for the same reason (`SUBMISSION_TYPE_REQUIRED`). Sequence 0000 keeps its default.
- **Sub-type resolution is strict as well,** for the same reason as F08: the loose resolver turns "orig" into Original and "app" into Application.
- **One submission-id rule table** lives in `shared/` and is used by the route, the packager and the client:

  | Sub-type | submission-id | Default |
  |---|---|---|
  | Original | must equal this sequence | this sequence |
  | Amendment, Resubmission | a filed sequence lower than this one | required, no default |
  | Presubmission, Application, Report, Correspondence | this sequence or a filed lower sequence | this sequence |

- **All identifier problems produce one finding.** `REGULATORY-IDENTIFIER-MISSING` lists every problem, including FDA format and the missing contact. Every one of them is fixed by the PUT, so the client's existing clear-on-PUT behaviour (`IDENTIFIERS_RULE`) stays correct. The missing telephone vocabulary gets a separate finding, `FDA-ADMIN-VOCABULARY-MISSING`, because a PUT does not fix it.

### 2. Steps

Each step is one commit, failing test first. Evidence goes in `docs/evidence/W5/2026-09-30-package-spine-sweep/README.md` as a WITHOUT/WITH run per step.

#### Step 1 — F07a: conformant applicant-info in the shared packager (non-breaking; lands first)

`regional-packager.ts`:
- Replace `fdaContactsBlock` (`:369-389`) with `fdaApplicantInfoBlock(input, contacts)`. Call it at `:503`.
- Emit, in this order:
  - `<id>{escapeXml(input.sponsorId)}</id>`
  - `<company-name>{escapeXml(input.sponsorName)}</company-name>`
  - `<applicant-contacts>` only if a contact was supplied. For each contact:
    - `<applicant-contact-name applicant-contact-type=…>`
    - `<telephones><telephone>` only if it has a phone
    - `<emails><email>` only if it has an email
- Nothing is invented: no placeholder contact, ever.
- At `:527`, write `<application application-containing-files="true">`.
- `resolveContactTypeCode(c.type) ?? 'fdaact1'` becomes a `ValidationError` with rule `FDA-CONTACT-TYPE-UNKNOWN`. No caller passes an unknown type; the golden fixture passes `'regulatory'`.
- Do not write `telephone-number-type`. A code comment points to Step 5.

Also update the docs on `PackagerInput.sponsorId`/`sponsorName` (`:281-284`) and `FdaRegionalAdmin` (`ectd-packager/types.ts:80-100`).

This step makes today's `REGULATORY-IDENTIFIER-MISSING` text ("the backbone must carry … applicant identity") true for FDA, so no wording fix is needed in between. IND-lane backbones gain `<id>UNASSIGNED-ORG-n</id>` and `<company-name>UNASSIGNED (organization n)</company-name>`, which pass `check-fabricated-identity`.

**Failing test first.** New file `server/services/submission-gateways/__tests__/fda-applicant-info.test.ts`, using xmldom on the real packager:
1. `<id>` text is `123456789` and `<company-name>` is present.
2. Contact child order is name → telephones/telephone → emails/email.
3. `application-containing-files="true"`.
4. An unknown contact type throws `ValidationError`.
5. With no contact: `id` and `company-name` are present and `applicant-contacts` is absent.

Red today: `<applicant-info/>`, and email written before telephone. No existing test pins this markup.

#### Step 2 — F08: strict resolver, and the record states the declared identity

**`controlled-vocab/index.ts`.**
- Add a private `resolveV3Strict` right after `resolveV3` (`:130-138`):
  - Normalise both sides: lower-case, collapse `[\s_-]+` to a space, trim.
  - Accept only an exact code or an exact description.
- Export `resolveSubmissionTypeCodeStrict` and `resolveSubmissionSubTypeCodeStrict` next to `:145` and `:172`.
- The loose `resolveV3` is untouched; the sequence spine depends on it.

**Route.**
- At `:2525`, `accepts` uses the strict resolver.
- At `:2704`, `fda.submissionType` gets the **code**. Sequence 0000 with no type gets `fdast1`.
- `submissionSubType: 'fdasst1'` and `submissionId: sequence` are passed explicitly. They equal today's defaults, so the output does not change; Step 3 replaces them.
- The descriptor (`:2848-2849`) and the response (`:2988-2989`) record:
  - `submissionType`: the canonical term for FDA, otherwise as today;
  - `submissionTypeCode`, `submissionSubType`, `submissionSubTypeCode`, `submissionId`, each null outside FDA.

**Plumbing** (done once here, so the filed record shows F04 honestly until Step 3):
- `FiledSequence` (`package-sequence-lifecycle.ts:56-66`) gains the four optional fields. `readFiledSequences` (`:98-120`) reads them leniently: codes checked with `isValidV3Code`, submissionId against `/^\d{4}$/`. A malformed field is dropped; the entry is kept.
- The `recordFiledSequence` entry type (`package-content-change.ts:180-190`) gains the same fields.
- `governed-transmit.ts`:
  - `ResolvedBundle` fields at `:152-157`;
  - `loadStoredBundle` shape checks at `:270-271`;
  - `recordTransmittedSequence` passes the fields at `:433-439`;
  - `filedSequenceFacts` at `:740-745` gains `submissionSubType` and `submissionId`, in both the sign payload and the manifest.
- Update `planSequence`'s doc at `:252-256`: `accepts` is the strict resolver, and say why.

**Failing tests first.**
- `controlled-vocab.test.ts`:
  - accepts `Efficacy Supplement`, `efficacy_supplement`, `fdast2`;
  - returns null for `IND`, `report`, `supplement`, `labeling`, `original`.
- `package-sequence-lifecycle.test.ts`:
  - new: "refuses the loose words" (each gives `SUBMISSION_TYPE_UNKNOWN`);
  - new: `readFiledSequences` reads the identity fields.
- `submission-ops-assemble-routes.test.ts`: a 0001 with type `'IND'` returns 409 (today it returns 200 and is coded fdast9).
- `mdx-submission-gateway-transmit-bundle-guard.test.ts`: the filed record and the manifest carry `submissionTypeCode`, `submissionSubType` and `submissionId`.

**Existing tests to update.**
- `package-sequence-lifecycle.test.ts`:
  - `FDA_VOCAB` at `:40-45` becomes strict; rewrite its comment.
  - `:245`: move `'supplement'` and `'original'` into the refusal test.
- `submission-ops-assemble-routes.test.ts:733`: `opts.fda.submissionType` is `'fdast5'`.
- E2e helper `fileTheStoredBundle` (`:152-162`): copy the identity from the stored descriptor, as governed transmit does.

**Intended consequence:** `'original'` on 0000 is now refused; the accepted term is `Original Application`.

#### Step 3 — F04: deny-list, sub-type and submission-id (route, plumbing values, client)

**New shared table** `shared/regulatory/fda-submission-sub-types.ts`:
- `FDA_SUBMISSION_SUB_TYPES`: `{ code, term, v4Code, submissionId }`, using the rule table in §1.
- `submissionIdRuleOf(codeOrTerm)`: exact match.
- `cv-v3-data.ts:60-68` derives `V3_SUBMISSION_SUB_TYPE` from it with identical values; a deep-equality test pins the seven rows.

**New `controlled-vocab/fda-filing-rules.ts`** (re-exported from `index.ts`):
- `fdaSubmissionTypeRefusal(appCode, typeCode)`:
  - fdaat4 (IND) or fdaat5 (master file) with fdast2, fdast3, fdast4 or fdast11 → refused, citing 314.70/601.12 (and 314.420 for master files);
  - any non-IND application with fdast9 → refused, citing 312.32.
  - fdast7, fdast8 and fdast10 for an IND are *candidates only*, pending regulatory review.
- `fdaSubmissionTypeTermsFor(appCode)`.
- `checkFdaSubmissionIdentity({ sequence, subTypeCode, submissionId, allowUnstatedContinuation })`.

**Packager** (`:475-501`):
- Throw a `ValidationError` for a denied pair.
- An explicit sub-type that does not resolve now throws. Today it silently becomes `fdasst1`.
- Run `checkFdaSubmissionIdentity` with `allowUnstatedContinuation: true`. That refuses Original with an id other than its own sequence, and an id that is not lower than the sequence. A missing id on an amendment keeps today's fallback until Step 6.

**`package-sequence-lifecycle.ts`.**
- New codes on `SequenceLifecycleRefusal` (`:187-206`): `SUBMISSION_TYPE_NOT_FOR_APPLICATION`, `SUBMISSION_SUB_TYPE_REQUIRED`, `SUBMISSION_SUB_TYPE_UNKNOWN`, `SUBMISSION_ID_REQUIRED`, `SUBMISSION_ID_NOT_FILED`, `SUBMISSION_ID_WRONG_ACTIVITY`, `ORIGINAL_APPLICATION_ALREADY_FILED`.
- A 4th constructor argument `{ acceptedSubmissionSubTypes?, filedSequences? }`.
- New `assertSubmissionTypeForApplication(appCode, term)` and `resolveFdaSequenceIdentity({ sequence, submissionType, submissionSubType, submissionId, filed })`.
- Helpers for legacy history:
  - `filedSubmissionTypeCode(f)` = recorded code, else strict match of the term, else fdast1 when the entry is 0000 typed `'original'`;
  - `filedActivityOf(f)` = `f.submissionId ?? f.sequence`. Every pre-change backbone declared its own number (`regional-packager.ts:501`).
- Checks, in order:
  - the sub-type is present (on a follow-up) and known;
  - the submission-id rule from the table;
  - a named id is a filed sequence lower than this one;
  - that sequence opened its activity (`filedActivityOf` equals its own number);
  - its type code equals this sequence's type code;
  - an Original Application + Original follow-up is refused when an fdast1 sequence is already filed.

**Route (`submission-ops.ts`).**
- New body fields at `:1959-1996`:
  - `submissionSubType: z.string().trim().min(1).max(40).optional()`
  - `submissionId: z.string().regex(/^\d{4}$/).optional()`
- After `:2187`: if either field is sent and the assembly is not FDA eCTD, answer 400 `FIELD_NOT_FOR_REGION`.
- Lifecycle block (`:2514-2547`), all inside the existing `try`:
  1. compute `appCode = resolveApplicationTypeCode(pkg.packageFamily)`;
  2. call `assertSubmissionTypeForApplication`;
  3. call `planSequence` with `terms = fdaSubmissionTypeTermsFor(appCode)` (the deny-list mirrored into the vocabulary) and the strict `accepts`;
  4. call `resolveFdaSequenceIdentity`.
- The catch spreads the new data fields onto the 409.
- `fda` block (`:2704`): the identity codes and the submission-id.

**Client.**
- `C2CForm.tsx`:
  - add `optionsFrom?: (values) => options` to `C2CFormField` (`:20-39`);
  - render it in the select branch (`:169`);
  - in `effectiveValues` (`:51-58`), blank a select value that is not among its current options, so a stale choice is never sent.
- `GatewayTransmittals.tsx`, `ASSEMBLE_FORM` (`:124-151`):
  - `submissionType` placeholder becomes "e.g. Original Application". The desc says FDA uses exact terms and that an IND or master file has no supplements.
  - New `submissionSubType`: a select of `FDA_SUBMISSION_SUB_TYPES` terms.
  - New `submissionId`: a select whose `optionsFrom` reads the chosen package's `metadata.filedSequences` from GET `/packages` (it already returns full rows):
    - "this sequence — opens a new regulatory activity";
    - plus each filed lower sequence, labelled "0000 · Original Application · Original";
    - only the filed ones for Amendment and Resubmission.
  - `submissionId` uses `derive` to show the sequence itself, read-only, when the sub-type is Original.
  - It falls back to a four-digit text field when the package list could not be loaded, like `PACKAGE_FIELD`.
  - `PackageOption` (`:83`) gains `metadata?`.
  - The `assemble` body (`:508-516`) sends both fields.
  - The success toast at `:548` says "files as Original Application · Amendment of the activity 0000 opened".

**Failing tests first.**
- Unit tests for `fda-filing-rules` and for `resolveFdaSequenceIdentity`, one case per code.
- Packager, in `fda-filing-identity.test.ts`:
  - IND + Efficacy Supplement throws;
  - Original + id `0000` at sequence `0002` throws;
  - an amendment naming `0003` at sequence `0002` throws.
- Assemble route:
  - IND + Efficacy Supplement → 409 `SUBMISSION_TYPE_NOT_FOR_APPLICATION`, and the accepted list has no supplements;
  - the tuple reaches the packager as `{ fdast1, fdasst4, '0000' }` and lands on the descriptor;
  - no sub-type → `SUBMISSION_SUB_TYPE_REQUIRED`;
  - id `0007` → `SUBMISSION_ID_NOT_FILED` with the filed sequences listed;
  - Original Application + Original → `ORIGINAL_APPLICATION_ALREADY_FILED`;
  - EMA + sub-type → 400.
- E2e on the real packager: `us-regional.xml` contains `<submission-id submission-type="fdast1">0000</submission-id>` and `submission-sub-type="fdasst4">0001`. Red today: `0001` and `fdasst1`.
- Transmit guard: the filed record carries Amendment/0000.
- Client: the new fields, the body sent, `optionsFrom`/`derive`.
- New `c2cFormOptionsFrom.test.tsx`.

**Existing tests to update.**
- `submission-ops-assemble-routes.test.ts`:
  - add `const IND_AMENDMENT = { submissionType: 'Original Application', submissionSubType: 'Amendment', submissionId: '0000' }` and use it at `:771, 807, 844, 871, 886, 922, 954, 974, 1317`;
  - `:727`: add `submissionSubType: 'Report'`;
  - `:747`: `acceptedSubmissionTypes` contains `Original Application`, not `Efficacy Supplement`.
- `submission-ops-package-spine.pglite.e2e.test.ts:212, 226, 242, 272, 277, 292, 305`: use the tuple.
- `package-leaf-bytes.test.ts:144-145`: change `'ind'` to `'nda'`.
- `gatewayTransmittals.test.tsx`:
  - `:505`: placeholder matches `/Original Application/`;
  - `:549-559`: send and assert the tuple.

#### Step 4 — F05 and F07b: identifiers, contact and findings (route and client; requires Step 1)

**`regulatory-identifiers.ts`** (additive; `usableIdentifier` behaviour and `REGULATORY_IDENTIFIER_FIELDS` unchanged):
- `FDA_APPLICATION_NUMBER_PATTERN = /^\d{6}$/` and `DUNS_NUMBER_PATTERN = /^\d{9}$/`.
- Charset-only contact patterns.
- Factor the XML-carriage check out of `:60-73` so contact fields reuse it.
- `usableContact`, `readRegulatoryContact(metadata)` and `fdaIdentifierProblems({ applicationNumber, applicantId, contact })`. This is the one rule used at both boundaries.

**PUT route.**
- Body (`:2025-2030`) gains `contact: { name, phone, email }`, optional at the zod level.
- Contact format problems answer 400 with fields such as `contact.email`.
- After the package lookup (`:2057`), FDA eCTD families answer 400 `REGULATORY_IDENTIFIER_INVALID` for a value that is not six digits, a DUNS that is not nine digits, or no contact. Nothing is ever normalized.
  - "FDA eCTD family" = new helper `fdaEctdApplicationType(family)`, placed next to `deriveRegionAndFormat` (`:1882`): the family derives to FDA/ectd **and** resolves to an fdaat code.
  - So 510(k) and eSTAR keep K-numbers, and `maa` is not caught.
- Store `regulatory.contact`. `changed` (`:2072`) includes the contact. The ledger (`:2087-2099`) records `previous.contact` and `contact`, consistent with Part 11 from→to; flag this for the data-protection reviewer.

**Assemble.**
- At `:2677-2688`, for FDA eCTD, one `REGULATORY-IDENTIFIER-MISSING` finding:
  - Paths first, exactly as today, then `regulatory.contact` when missing (so the regex at `:693` still matches).
  - Then the FDA format sentences.
  - The text says the backbone carries `<application-number>` and `<applicant-info>` (the D-U-N-S number in `<id>`, the company name, a regulatory contact with a telephone and an e-mail).
- When a contact is passed, add `FDA-ADMIN-VOCABULARY-MISSING` (error): FDA's `telephone-number-type.xml` is not vendored, so the backbone is not DTD-valid, and re-recording identifiers does not fix it. Step 5 removes it.
- Pass `fda.contacts: [{ type: 'Regulatory', name, phone, email }]` at `:2704`.
- Include the contact in the drift check (`:2659`, `:2871-2875`).

**Client.**
- `IDENTIFIERS_FORM` (`:108-123`):
  - `applicationNumber` placeholder becomes `e.g. 123456`. The desc says: six digits with leading zeros and no prefix for FDA eCTD; a K-number for 510(k)/eSTAR.
  - `applicantId` placeholder becomes `e.g. 123456789`, with a DUNS desc.
  - New `contactName`, `contactPhone` ("Business telephone") and `contactEmail` fields.
  - The sub-copy mentions the contact.
- `recordIdentifiers` (`:435-437`) sends `contact` when any of the three is filled.

**Failing tests first.**
- PUT:
  - `IND123456` → 400, nothing written, not rewritten;
  - a `510k` package with `K123456` → 200;
  - `DUNS-123456789` → 400;
  - no contact on an `ind` package → 400 `fields: ['contact']`;
  - a `pmda` family is exempt;
  - a contact change clears the stale bundle.
- Assemble:
  - a stored `IND123456` produces a finding that names six digits;
  - the contact reaches `opts.fda.contacts`;
  - a missing contact is named in the finding;
  - the vocabulary finding is raised;
  - a contact changed during assembly gives `STALE_ASSEMBLY`.
- E2e: `<id>123456789</id>`, `<company-name>` and the contact appear in the real `us-regional.xml`.
- Client: the placeholders, and the contact sent.

**Existing tests to update.**
- `submission-ops-assemble-routes.test.ts`:
  - `REGULATORY` at `:189` becomes `'123456'`, `'123456789'`, plus a contact;
  - `:356`, `:363`, `:488`, `:552-554`;
  - the success case asserts exactly one error, `FDA-ADMIN-VOCABULARY-MISSING`, until Step 5.
- `submission-ops-regulatory-identifiers-routes.test.ts`:
  - `GOOD` at `:87-92` gets a contact;
  - `:170`, `:174`, `:180`;
  - `previous` `toEqual` at `:182` and `:208-210` gains `contact`;
  - the locked or stored fixtures at `:198` and `:217` need the same contact so `changed` stays false;
  - `:250-252`, `:263`.
- E2e `REGULATORY` at `:110`.
- `gatewayTransmittals.test.tsx:41` and `:241`.
- `submission-ops-preflight-routes.test.ts`: nothing to change. Preflight never reads identifiers, so `IDS` at `:150` is inert.
- File hand-off H5 (FDA-ESG-002) in the same commit.

#### Step 5 — F07c: telephone-number-type (BLOCKED on JM providing FDA's file)

- Vendor FDA's `telephone-number-type.xml` under `assets/ectd-dtd/fda-valid-values/`, with a checksum and a runbook entry in `ectd-dtd-vendoring.md`.
- Transcribe `V3_TELEPHONE_NUMBER_TYPE` into `cv-v3-data.ts`. Add it to `V3ListId` and `V3_CODE_LISTS` (`:104-118`), and add a strict `resolveTelephoneNumberTypeCode`.
- `FdaApplicantContact` gains `phoneType`. The packager writes the attribute; a value that does not resolve throws.
- The route passes `'Business Telephone Number'`, and the vocabulary finding is removed. The success test flips back to `errorCount 0`.
- Failing test first: parse the vendored XML and assert the transcription matches it row for row.

#### Step 6 — Packager fails closed (coordinated, after H1–H4)

- Drop `allowUnstatedContinuation`: an amendment or resubmission with no id throws `FDA-SUBMISSION-ID-REQUIRED`.
- An FDA backbone with no complete contact throws `FDA-APPLICANT-CONTACT-MISSING`.
- Whichever lane lands second runs all caller suites.

### 3. Hand-off notes (for `docs/work-orders/README.md`, new section "Found by the package-model spine lane (`…01LjrcEe`), handed on")

**H1 → IND lane `…01TtwRHm` (F04 on the sequence spine).**
- `core-to-packager.ts:218-240,320-328`: amendments, responses and variations get sub-type `amendment` with no `submissionId`, so `us-regional.xml` declares each one the first sequence of a new activity. Pass `fda.submissionId` = the IND's first sequence: the lowest `ectd_sequences.sequence_number` of the original activity, which is 0000 here.
- Before Step 6:
  - `core-to-packager-fda-admin.test.ts:177-180`: use sequence 0001 and expect submission-id 0000.
  - `golden-fixtures.ts:166-171`: add `submissionId: priorSequence` when the golden is a lifecycle sequence.
- The NDA journey (`drug-nda-ectd.journey.test.ts:720`) files 0001 typed `original`, which declares a second Original Application. Your spine has no check for this.
- `fdaSubmissionTypeFor` codes any sequence with a safety-report leaf as fdast9 whatever the application type. After Step 3 the packager refuses that for a non-IND.
- `annual` → sub-type `original` is unverified. FDA's example #23 reportedly uses `report`.

**H2 → IND lane (F07 on the sequence spine).**
- Pass `fda.contacts` from `buildPackagerInputFromCore`.
- Enforce FDA formats at your boundary using the new shared predicates. `usableIdentifier` stays charset-only.
- `recordedApplicationId` falls back to the program code, which is never an FDA number.
- The comment at `assemble-from-core.ts:440-445` (that `<id>`/`<company-name>` are written) was false for FDA until Step 1.
- The golden contact at `:170` needs a phone.

**H3 → unclaimed (orchestrator spine):** `orchestrator-real-package.ts:181-200` passes no contacts.

**H4 → AnA lane:** `AnaToolExecutor.ts:9097-9127` (`package_ectd_for_region`) has no sub-type, id or contact arguments.

**H5 → unclaimed (FDA-ESG-002):**
- Change the regex at `:354` to `/^\d{6}$/`.
- The fix text at `:531` should read "record the six digits FDA assigned, e.g. 123456".
- The orchestrator tests listed in §0 need review.

**H6 → unclaimed:** `ind-lifecycle/ind-ectd-envelope.ts` is a second us-regional envelope builder that always writes submission-id = sequence. This is a zero-duplication item.

**H7 → JM/founder:** vendor FDA's `us-regional-v3-3.dtd`, `telephone-number-type.xml` and the submission-sub-type list. This unblocks Step 5 and settles F21.

Seen in passing, not in scope:
- The transmit form asks for `submissionType` again ("e.g. original") for AS2 metadata (F16).
- `fdaFormsBlock` can emit more than one `<form>`, but the DTD allows at most one (F20).

#### Critical Files for Implementation
- /home/user/ClinicalSageAI-2-replit/server/routes/submission-ops.ts
- /home/user/ClinicalSageAI-2-replit/server/services/submission-gateways/regional-packager.ts
- /home/user/ClinicalSageAI-2-replit/server/services/ectd/package-sequence-lifecycle.ts
- /home/user/ClinicalSageAI-2-replit/server/services/ectd/controlled-vocab/index.ts (plus new `fda-filing-rules.ts` and `shared/regulatory/fda-submission-sub-types.ts`)
- /home/user/ClinicalSageAI-2-replit/client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx

