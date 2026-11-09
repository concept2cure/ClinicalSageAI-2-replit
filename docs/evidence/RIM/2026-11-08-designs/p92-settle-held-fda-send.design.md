# P-92: settle a held FDA send by a signed act, either way

- **Designer:** `p92-settle-held-send`, read-only, 2026-11-02. **Revised the same day** after a ten-finding review
  (§9.1). The revision folds every finding in, applied or rejected with the code that shows why.
- **Trees read:**
  - `origin/concept2cure-v2` at `a39c26ec3`, fetched for the first draft. Every file this design touches is unchanged
    between the map's tree (`4ea4b534e`) and `a39c26ec3`; `git diff --stat` shows only dose-optimization files and a
    two-line `COORDINATION.md` change.
  - **The revision re-read origin at `ffd2bd772`.** F1 slice 1 is now on origin (`090f62af1`, `72f2a942d`), and the
    founder's record of P-92 has landed (`1c48581ae` is an ancestor; §0 quotes it). Every `path:line` in this revision
    is on `ffd2bd772` unless it says "working tree". The lines of `fda-esg.ts`, `fda-esg-receipts.ts` and
    `submission-service.ts` cited here are unchanged from `72f2a942d`.
  - The working tree (`HEAD 72f2a942d`) now holds **F1 slice 2's** uncommitted edits (`fda-esg-receipts.ts`,
    `submission-service.ts`, `filed-dispatch.ts`, tests, `docs/runbooks/ectd-transmit-path.md`). They are designed
    against and never cited as shipped.
  - A blobless **full-history clone** (17,399 commits back to 2025-11-20), at
    `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/decided2/p92-fullclone.git`,
    for the RULE 3 deletion searches only (§1.7). The shared clone is shallow (15 roots, the oldest 2026-10-05) and was
    never unshallowed or otherwise touched.
- **Inputs:**
  - the map, `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/5d0b158e-991f-5354-8b6b-8cf5f02b467a/scratchpad/decided2/p92-settle-held-send.map.md`,
    re-verified (§1 marks what this design corrected);
  - F1 slice 1, slice 2, repairs A–C, P-86 and its coordinator rulings of 2026-11-02 01:19, and the P-93 map
    (`decided2/p93-one-gib.map.md` §7, §8);
  - the D7-record session's proposals, `docs/evidence/W5/2026-11-01/README.md` (A1–A5, DP-81 part 2), treated as input.
- **Scope.** The two signed acts, their precheck, their one door on the Dispatch tab, and the words that make the
  record honest on the two screens that list transmittals. Nothing else. §9 lists what was cut, and why.

---

## 0. The founder's decision

**The record has landed, and its words win.** `1c48581ae` is an ancestor of `origin/concept2cure-v2` (`ffd2bd772`).
The entry is `docs/LAUNCH_DEFINITION_OF_DONE.md:1828-1843`, quoted whole:

> ### P-92 — A held FDA send can be settled by a signed act, either way
>
> The founder, 2026-11-02, answering the coordinating session's question "An FDA ESG submission is stuck 'held': it
> was sent, but no signed MDN (delivery receipt) came back. Today nothing can settle it, because the rollback was
> removed on 10-17 as it contradicted what FDA held. May a signed act, with re-authentication and the agency's
> document kept in Vault, settle it?": **"Allow both."** The question was raised by the D7-record session (`015weq…`,
> `docs/evidence/W5/2026-11-01/README.md`, "For the founder" 1, item A5).
>
> - **What is decided.** A held send may be settled by one of two signed acts, each with re-authentication and the
>   agency's document retained in Vault and linked to the act:
>   - **recorded as received**, on Ack2 or Ack3 evidence from FDA;
>   - **released as not received**, only on FDA's written confirmation of non-receipt. The act states the
>     duplicate-filing risk to the signer before they sign.
> - **What is not decided.** No settlement without the agency document; no settlement by an unsigned action; the
>   removed rollback route stays removed.
> - **Owner.** RIM (`011e42…`), under F1, in the files it holds (`submission-service.ts`, `fda-esg-receipts.ts`).

**Reconciled with the coordinator's summary**, which the first draft worked from. The two agree on the acts, the
evidence, re-authentication, the Vault link, the stated risk and the removed route. The record adds three things the
summary lacked, and each now binds this design:
1. **"No settlement by an unsigned action."** The runbook's unsigned SQL settlement steps are retired on both spines
   (C1, §5.4 and §7 of `docs/runbooks/fda-esg-production-uat.md`). The disclosure no longer calls the MDN upload a
   settlement "without a signature" (§9.1 finding 8).
2. **The owner line** names the two files RIM holds. This design also edits other files, so it carries a file-and-holder
   table and asks the coordinator for each hold (§5.0).
3. **The question as asked** ("it was sent, but no signed MDN came back"). A send for which the platform already keeps
   FDA's signed MDN is therefore not one the record lets a signature settle (E4, §9.1 finding 1).

The record says nothing about binding the document's hash directly in the e-signature row, so the first draft's Q1 is
closed and §9 A1 stays rejected. It says nothing about a late receipt that contradicts a settlement; §3.3 and §8 Q7
handle that.

The question it answers is the D7 record's founder question 1 (`docs/evidence/W5/2026-11-01/README.md:114-121`).

| Clause | What it requires on the sequence spine |
|---|---|
| "a held FDA send" | A live sequence with `status 'dispatched'`, `dispatch_status 'transmitting'`, and a non-null claim (`transmit_signature_action_id` S, `transmit_attempt_id` A), whose claim is bound by exactly one FDA ESG transmittal (`metadata.dispatchBinding`). **The gateway has finished the attempt** (E5), and **no verified FDA answer to it is kept** on the platform (E4): the record's question is a send for which "no signed MDN came back". After slice 2, only a production attempt can be held. |
| "settled by a signed act, either way" | One Part 11 act with two outcomes, **recorded as received** and **released as not received**: a signature with a declared meaning and a reason. The state change and its chained audit row commit in one transaction. |
| "Each act needs re-authentication" | The signature is collected by `POST /api/c2c/actions/sign`, which re-authenticates (`'sign'` is in `HIGH_RISK_COMMANDS`, `server/routes/c2c/actions.ts:111`; `verifyReauth` at `:650-656`). One signature serves one act. |
| "the agency's document retained in Vault and linked to the act" | A live `vault.documents` row of this organization **and this project**, named by id and `content_hash` in the signed payload, re-read `FOR SHARE` in the act's transaction, and repeated in the act's chained audit row and on the transmittal. |
| "'Recorded as received' requires Ack2 or Ack3 evidence" | The signer declares which (`ack2` or `ack3`). The platform cannot verify either (§1.5), so every record of it says *attested, not verified*. It is offered only for a send whose own record shows an AS2 message left (E5b), on a document added to the Vault after the send (E6), and the statement names our AS2 Message-ID for the signer to match (§3.4). |
| "'Released as not received' requires FDA's written confirmation of non-receipt" | The document is FDA's written confirmation that this send did not arrive. |
| "must state the duplicate-filing risk to the signer before they sign" | One server-held statement, shown word for word in the disclosure and again in the signing dialog, and bound in the signed payload (compared exactly at the act). |
| "No settlement without the agency document" | Neither outcome is offered, signed or accepted without a resolvable Vault document. There is no other branch. |
| "the removed rollback route stays removed" | `POST /api/mdx/gateways/transmittals/:id/rollback` is not served again. Nothing writes `rolled_back` or calls `rollbackTransmittal`. Its three pins stay green. The runbook's hand-written "Manual rollback" (`fda-esg-production-uat.md` §7, the same effect by SQL) is retired too. |
| "no settlement by an unsigned action" | The signed act is the only way a person settles a held send. The runbook's unsigned SQL (§5.4's status patch to `ack1/2/3_received`, §7's `status = 'rejected'`) is retired **on both spines** (C1). Package-spine held sends then have no settlement until a signed one exists there: owed, and put to the coordinator (§7 item 12, §8 Q8). FDA's own signed MDN, verified by `ingestFdaAs2Receipt`, is FDA's signed answer, not a person's unsigned action. This design reads it so, and asks the coordinator to confirm (§8 Q10). |
| "Owner. RIM, under F1, in the files it holds" | `Plan: F1`. The rules sit in `fda-esg-receipts.ts` and `submission-service.ts`. Every other file is in the §5.0 table, with its holder and the hold asked for. |

---

## 1. What already exists (RULE 3), by path

### 1.1 Every way a sequence ends `'transmitting'`

The claim is `claimTransmitSlot` (`server/services/submission-service/submission-service.ts:2439-2487`): a
compare-and-set from NULL, `'pending'` or `'rejected'` to `'transmitting'` that stamps S and A and commits on its own.
`releaseTransmitSlot` (`:2494-2500`) runs only before the wire; its comment says the claim is otherwise "deliberately
left standing for a human to resolve". **P-92 is that human resolution.**

| # | How it is held (all post-wire: `attempt.reachedGateway = true`, `:2907`) | Its transmittal | Today's way out |
|---|---|---|---|
| H1 | **AS2 delivered, unconfirmed**: a 5xx, a reset after the whole request was written, an MDN that does not verify, or no MDN (`as2-transport.ts` `classifyVerifiedAs2Delivery` → `DELIVERED_UNCONFIRMED`; `fda-esg.ts` `recordDeliveredUnconfirmed`, `:563-578`). The `GatewayError` is not `refusedBeforeWire`, so the claim stands (`submission-service.ts:2938`). | `in_transit`, `error_message` "… FDA may hold it …"; `transmission_id` is the **reply's** `Message-ID` header when the reply carried one (`as2-transport.ts:893`, `trackingId`; written at `fda-esg.ts:569`), ours only after a reset | A verified MDN uploaded later (§1.2). Otherwise none. |
| H2 | A database failure after FDA answered 2xx (`fda-esg.ts` `recordTransmitFailure` with `sent`, `:601-602`). **If FDA's MDN verified, it is already kept**: `as2Receipt` with `verified: true` is written at `:837`, on its own statement, before the status write at `:856-860`. The catch at `:867` then writes `in_transit` (`recordDeliveredUnconfirmed`, `:566-571`); if that write also fails, the row keeps the `in_transit` of `:773`. A crash between `:837` and `:856` reaches the same state. | `in_transit`, possibly **with a verified positive `as2Receipt`** | Re-upload the kept MDN: `downloadAcknowledgment` serves a verified `as2Receipt` as `'agency'` (`fda-esg.ts:930-936`); `writeAs2Metadata` never adds it to `as2ReceiptHistory`, so the upload is not a duplicate, and `nextReceiptStatus('in_transit', 'received')` files the sequence. Nothing on screen says so. |
| H2′ | The mirror: a signed refusal is kept (`as2Receipt.verified` true for a signed 2xx refusal, `:526`), and a crash between `:837` and `:841`, or two failed writes, leave the row `in_transit`. (One failed `'rejected'` write does not: `sent` is nulled at `:840`, so `recordTransmitFailure` writes `'rejected'` again through its generic branch, `:613-617`.) | `in_transit` **with a verified negative `as2Receipt`** | Re-upload the kept MDN. |
| H3 | **FDA refused synchronously** (`REFUSED_BY_AGENCY`): a signed failed MDN (verified) **or any HTTP 4xx** (unverified; `as2-transport.ts:893-898`). The row is written `rejected` and a `GatewayError` is thrown (`fda-esg.ts:485-490`). That write sets no `transmission_id`; only an uploaded receipt fills ours in (`fda-esg-receipts.ts:88`, `COALESCE`). | `rejected`; `metadata.as2Receipt.verified` true only for the signed 2xx refusal (`as2ReceiptMetadata`, `fda-esg.ts:524-528`) | The signed refusal: upload the same MDN (`nextReceiptStatus` `matchingRejected`, `fda-esg-receipts.ts:58`). **The 4xx refusal: none** (map did not separate the two; corrected here). |
| H4 | The send went out, verified, and the §11.10(e) write failed (`applySequenceChangeWithAudit` rolled back, `:2947-2992`). | `received`, verified; `transmission_id` is **the MDN's own** Message-ID (`as2-transport.ts:939`, `fda-esg.ts:851-857`) | Re-upload the kept MDN. Nothing on screen says so. |
| H5 | An SFTP-branch hold from before 2026-09-23 (P-93 map §7: never connected; the module was never shipped). **Every one is a legacy claim (L).** Since 2026-09-23 both SFTP refusals release the claim (`index.ts:171-189`: `CredentialError` and `TransportError(NOTHING_TRANSMITTED)`; `fda-esg.ts:630-660`), and the binding columns arrived only on 2026-10-14. Corrected in revision (§9.1 finding 7). | `rejected`, `auth`/`transport`, `transport 'sftp'`, **no `dispatchBinding`** | **None**, and P-92 does not give one: E1 refuses L. The receipt path reads only `transport = 'as2'` (`fda-esg-receipts.ts:29`, `:70`). §8 Q11. |
| H5′ | **A bound SFTP-transport hold** (after 2026-10-14, a bundle over 1 GiB, `fda-esg.ts:749`): the gateway's own integrity read refused in the SFTP branch (`readVerifiedBundle`, `:782`, a `ValidationError` without the proof), or an unmarked failure of `resolveGatewayAccount`, `credentialsFor` or the `in_transit` write. Nothing left: `ssh2-sftp-client` is in neither `package.json` nor `package-lock.json`. Possible until P-93 retires the branch. | `rejected`/`gateway`, `transport 'sftp'`, bound, **no `metadata.as2`** | None. |
| H7, H8 | The gateway's own integrity read refused inside `gw.transmit` (H7), or `createTransmittalRow` failed outside its `try` (H8, `fda-esg.ts:759`). Nothing left the server. | H7 `rejected`/`gateway`, **no `metadata.as2`** (the read at `:811` comes before the binding at `:821`); H8 **no row** | None. |
| H9 | A crash mid-send. | `pending` (nothing left: `in_transit` is written before any byte, `fda-esg.ts:773`); `in_transit` **without** `metadata.as2` (a crash between `:773` and `:821`: nothing left); or `in_transit` **with** it (bytes may have left) | H1's for the last; none for the other two. |
| H10 | A non-FDA gateway's post-wire failure. | per gateway | None. Outside P-92 ("a held FDA send"). |
| L | **A legacy claim** from before `migrations/20261014_ectd_transmit_attempt_binding.sql`: S and A are NULL, and its transmittal has no `dispatchBinding`. H5 is a subset. | no binding | None. The migration's own rule: "Nullable for legacy rows; never infer a binding." |

After slice 2, a staging attempt never holds (slice 2 rules 2–3). Staging holds from before slice 2 remain (§8 Q5).

**What the row's own record proves, on AS2.** The receipt binding `metadata.as2 { messageId, mic, environment }` is
written "before any byte leaves this process" (`fda-esg.ts:821`), and a failure to write it carries
`NOTHING_TRANSMITTED` (`:695`). `writeAs2Metadata` and `dispatchBinding` were introduced in the same commit
(`e1f3fd425`, 2026-10-17: `git log -S` on each, over `fda-esg.ts`; its parent `4b0e3ff1e` is present, so this is
not a shallow boundary), so every row E2 can match comes from code that writes the
binding before the wire. **A bound AS2 row with no `metadata.as2` proves the POST never happened.** Our own AS2
Message-ID is always `metadata.as2.messageId`, read through `bindingOf` (`fda-esg-receipts.ts:17-23`), never
`transmission_id`, which holds the reply's or the MDN's identifier (H1, H4) or nothing (H3).

**While the attempt runs, the row looks held.** The claim is stamped at `submission-service.ts:2793`, before assembly.
The row is `pending` from `createTransmittalRow` (`fda-esg.ts:360-381`, already carrying `dispatchBinding` and
`metadata.environment`), then `in_transit` at `:773`. After that come the integrity read (`:811`), the envelope, the
binding (`:821`) and the POST (`:827`). The POST has only a socket idle timeout (`as2-transport.ts:694`, handled at
`:726`), and `attemptDelivery` adds no total deadline, so a large upload can run for hours. The gateway's later writes
are unconditional: `updateTransmittal` is `UPDATE … WHERE id = $n` (`fda-esg.ts:417-418`), and `writeAs2Metadata`
filters only on id, organization, region and gateway (`:689-698`). **Every way the attempt ends with the claim still
standing writes `error_message`** (`recordDeliveredUnconfirmed` `:566-571`; `recordTransmitFailure` `:603-616`; the
`REFUSED_BY_AGENCY` write `:485-490`), or a terminal status (`received` at `:856`, `rejected`). A bare `pending` or
`in_transit` row with no `error_message` is a crash, a failed failure-write, or **a send still on the wire**.
`writeAs2Metadata` does not touch `updated_at`, so during the POST `updated_at` is the `in_transit` write's.

**The signature S is left unspent on every held send.** No `ECTD_TRANSMITTED` row is written, and the transmit's
`voidingSignatureOnRefusal` declines to void once the gateway was reached (`:2685-2693`). Only the CAS on
`'transmitting'` stops S authorizing a second send, so **a settlement that releases the claim must spend S in the same
transaction** (§3.5).

### 1.2 What clears a held sequence today

- **The receipt path**, `server/services/submission-gateways/fda-esg-receipts.ts` (132 lines; slice 2's hold):
  - `ingestFdaAs2Receipt` (`:64-96`), behind `POST /api/mdx/gateways/transmittals/:id/as2-receipt`
    (`server/routes/mdx-submission-gateway.ts:571`, `recordAs2Receipt` in `server/routes/mdx-as2-receipt.ts`). It
    verifies the uploaded MDN against the pinned certificate, Message-ID and MIC (`:27-40`), requires governed write
    membership (`:42-50`), sets tenant context (`:68`), and locks the transmittal `FOR UPDATE` (`:70`). It is not a
    Part 11 signature and asks for no re-authentication: the cryptography is the proof.
  - `resolveReceiptSequence` (`:105-132`, private): validates the binding with `dispatchBindingOf` (`:100-104`), locks
    the sequence (`:110-111`), spends S with `ECTD_TRANSMITTED` when unspent (`:116-123`, source
    `agency-signed-receipt-reconciliation`), and moves `'transmitting'` on **(S, A)** (`:124-126`).
  - `nextReceiptStatus` (`:52-61`) refuses a receipt that conflicts with the retained state (409
    `AS2_RECEIPT_STATE_CONFLICT`).
  - **Lock order: the transmittal, then the sequence.**
- **`server/services/ectd/filed-sequence-rejection.ts`** (406 lines), the "failed Ack3" act, door
  `POST /api/mdx/gateways/transmittals/:id/technical-rejection` (`mdx-submission-gateway.ts:583-645`). **Package spine
  only:** `packageOfTransmittal` (`:147-165`) refuses a transmittal with no `package_id`, which is every sequence-spine
  transmittal (`submission-service.ts` passes `packageId: null`). It never touches `ectd_sequences`. It is the
  platform's precedent for an agency document in Vault linked to a signed act: `readEvidence` (`:247-259`) reads
  `readVaultSource(…, { lock: true })` and binds `content_hash`. The sequence spine has **no** technical-rejection act
  (§7 item 6).
- **The removed rollback route.**
  - Tombstone, `server/routes/mdx-submission-gateway.ts:573-580`: "removed 2026-10-17 (app audit, round 3). It set a
    transmittal the agency had received or acknowledged to 'rolled_back' here while the agency still held it, a record
    that contradicts the agency's, and no screen called it once Gateway transmittals became a read-only log. A filing is
    taken back by a withdrawal sequence, sent from Submission Center."
  - **Why it would not have helped anyway:** `rollbackTransmittal` (`fda-esg.ts:1049-1150`) updated only
    `submission_transmittals`. It never touched `ectd_sequences`, so it never released a held sequence.
  - **History search, re-run in the full clone (§1.7):**
    - `git log --full-history --diff-filter=D` finds no deleted rollback file: the route was a handler inside a kept
      file.
    - `git log -S'transmittals/:id/rollback' -- server/routes/mdx-submission-gateway.ts` finds the removing commit,
      **`6ef0ef121`** (2026-10-17, "D2: remove the transmittal rollback route", parent `9246389d6`), and the route's
      creation in `102706671` (2026-06-29). The first draft named `a811b0d83`: that was the shallow clone's boundary,
      not the removal (corrected, §9.1 finding 10). The removing message names the replacement for taking a filing
      back: "a withdrawal sequence, sent from Submission Center (sequence type 'withdrawal', routes/submissions.ts)".
      It also keeps `rollbackTransmittal` "for that spine [the package spine], which production refuses".
  - **Pins that keep it removed:** `tests/mdx-submission-gateway-signing-authority.test.ts:142`;
    `client/src/concept2cure/v2/__tests__/gatewayTransmittalsReadOnly.test.tsx:63-66`;
    `tests/mdx-submission-gateway-transmit-bundle-guard.test.ts:811-838`.
  - What remains is unreachable: `rollbackTransmittal`, `RollbackNotPermittedError`, `ROLLBACKABLE_STATUSES`
    (`fda-esg.ts:955-1150`, one caller, `fda-esg-hardening.test.ts:592`), the `transmittal_rollback` command
    (`actions.ts:104-111`), and the `rolled_back` token. P-92 neither uses nor deletes them.
- **Manual, unsigned SQL** in `docs/runbooks/fda-esg-production-uat.md`: §5.4 (`:276-307`) patches statuses to
  `ack1_received`/`ack2_received`/`ack3_received` after reading WebTrader (retired April 2025, `fda-esg.ts:27-28`); §7
  (`:325-365`) is a manual "rollback" that writes `status = 'rejected'`, `error_message 'Manual rollback …'` (`:335-341`).
  On the package spine either write drops the row out of `sub_trans_active_lock_idx` (`pending|in_transit|received`)
  and frees a resend with no signature. §9 (`:418-420`) accepts manual patches. **The record forbids every one of them
  as a settlement ("no settlement by an unsigned action"), on both spines.** C1 retires them (§5, C1 docs).

### 1.3 The sequence's signed-act machinery (the chain both outcomes join)

1. **Sign:** `POST /api/c2c/actions/sign` (`makeHandler('sign')`, `server/routes/c2c/actions.ts:620-718`): a reason of
   at least 8 characters (`:633`), a meaning from the closed vocabulary, `checkSigningAuthority` before the credential,
   `verifyReauth` (`:650-656`), the `ectd-sequence:<id>` resolver for a live row only (`:215-221`), and
   `assertSignerIsNotAuthor` (separation of duties). `writeMutation` writes the ledger pair; its audit row hashes the
   whole payload. `persistGovernedSignSignature` (`server/services/part11/signature-persistence.ts:922-933`) writes the
   `electronic_signatures` row bound to the sequence's leaf-manifest digest; its manifest carries `auditSha256Chain`
   and `reason` (`:866-884`), so the signature points at the ledger row whose hash covers the payload.
2. **Act:** a sequence route with `{ signatureActionId }`, through Gate 1, `governedSignatureVerdict`
   (`submission-service.ts:979-1109`): the actor's executed `sign` on the target, intent, independence,
   `INTENT_MEANING_REFUSAL` (`:949-955`), the `payloadRefusal` hook (`:1029-1030`), spent or void (`:1035-1043`),
   in force (`:1063-1074`), and the leaf-manifest digest unchanged (`:1075-1086`).

Around Gate 1, all in `submission-service.ts`:
- `SequenceSignatureIntent` (`:927-930`), `INTENT_LABEL` (`:933-939`).
- `signatureSpentBy` (`:1124-1139`), whose action list is a literal.
- `voidRefusedStepSignature` (`:1170-1231`) and `voidingSignatureOnRefusal` (`:1247-1268`): P-23, a refused act voids
  its signature.
- `applySequenceChangeWithAudit` (`:1276-1323`): BEGIN, `underLock`, the UPDATE (zero rows is the caller's
  `noRowsRefusal`), `writeChainedAuditRow` on the same client, COMMIT. It takes no `reason` and sets **no tenant
  context** (the receipt path and `claimTransmitSlot` call `setTenantContextTx`,
  `server/services/tenant/governed-tenant-context.ts`; without it, once `app.rls_enforce` is on, a write to
  `submission_transmittals` or a read of `vault.documents` sees zero rows).
- `recheckUnderSequenceLock` (`:2028-2050`): submission lock, sequence `FOR UPDATE`, program lock, the act's recheck,
  and the leaf digest again.
- `independentSignerRefusal` (`:2007-2022`).
- `precheckGovernedStep` (`:1712-1744`), door `POST /api/submissions/sequences/:seqId/governed-precheck`
  (`server/routes/submissions.ts:2050-2089`, step enum at `:2056`).
- **Templates:** P-34 `waiveShadowReview` (`:1991-2000`, door `submissions.ts:1483`) and P-35
  `dispositionShadowFinding` / `applyShadowFindingDisposition` (`:2133-2214`, door `submissions.ts:1514`): one intent,
  the decision in the payload, the signature's own reason read by `dispositionSignatureReason`
  (`server/services/ectd/shadow-finding-disposition.ts:302-309`). Neither has an AnA or MCP door
  (`server/services/ana/__tests__/ana-cannot-waive-shadow-review.test.ts`, `ana-cannot-disposition-shadow-finding.test.ts`).
- `writeChainedAuditRow` (`server/services/auditService.ts:269-330`) already writes `audit_logs.reason` when
  `entry.reason` is given (`:300-327`).
- **The route's status map:** `SUBMISSION_ERROR_STATUS` (`:162-188`), typed over `SubmissionErrorCode` (`:123-140`) so
  an unmapped code cannot ship; `routes/submissions.ts` `CODE_STATUS` (`:102-110`) spreads it.

`signGovernedAct` exists twice (`server/routes/governed-signed-act.ts:278`; `server/services/part11/governed-signature-ceremony.ts:227`).
Neither runs Gate 1, the sequence's spent/void ledger or P-23 (§9 A1).

### 1.4 How Vault retains an agency document and links it to an act

- `readVaultSource` (`server/services/regulatory/lifecycle-signature.ts:73-88`): a `vault.documents` row by id and
  organization, `deleted_at IS NULL`, optionally `FOR SHARE`, returning `content_hash`. It does not check the project.
  `vault.documents.program_id` (uuid) names the project; `submissions.program_id` (uuid, `shared/schema/submissions.ts:60`)
  names the submission's.
- Bytes and hash are immutable (`migrations/20260926_vault_documents_record_immutability.sql`); deletes are soft
  (`deleted_at`); the retention sweep is inert, because nothing writes `retention_until`
  (`migrations/20260906b_vault_legal_holds.sql`). **Nothing stops a later soft delete of a document a signed act cites**
  (§7 item 7).
- **Picking a document:** `VaultVersionPicker` (`client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx:432-460`,
  `programId` scoping) shows title and version, never an id, and hands back `PickedVaultVersion { id, title, version,
  current, programId, contentHash }` (`:350-359`). Callers: `CommitmentFulfilment.tsx`, `OfficialEstarAttachments.tsx:116`.
  The technical rejection instead asks for a typed UUID (`GatewayTransmittals.tsx:128-131`), the retired pattern.
- **Where-used:** `server/services/vault/vault-where-used.ts` lists placements, eSTAR uses, CMC evidence and section
  citations. It does not list a document cited by a signed act (neither the technical rejection's nor this one's).
- `cre_evidence_sources` is the Data Room's source catalog (`migrations/20260726_cre_source_program_scope.sql`), not
  agency correspondence. Not used.
- Taxonomy: document type `CORRESPONDENCE`, "Agency correspondence" (`shared/constants/domain/vault-taxonomy.ts:74`,
  `:121`). Not required by the act (§9 A12).

### 1.5 Ack2 and Ack3: what the platform parses or stores

- **FDA's source in the repository**, `docs/evidence/AUDIT-REMEDIATION/2026-10-14/agency-assets/fda-as2-guide.txt`:
  "ACK2 is sent upon successful unpacking and delivery to center. ACK3 is generated by some Centers for validation
  results. ACK2 and ACK3 are sent to the industry AS2 gateway" (`:147-155`); they arrive asynchronously, at the
  sponsor's own AS2 server (`:344-345`). The guide gives no ACK2 or ACK3 format.
- **Parsed:** only the synchronous or uploaded MDN (`classifyVerifiedAs2Delivery`, `as2-cms.ts`). There is no inbound
  AS2 endpoint and **no ACK2 or ACK3 parser**. `checkStatus` returns the stored row (`fda-esg.ts:871-893`).
- **Stored:** the tokens `ack1_received`, `ack2_received`, `ack3_received` (`server/services/submission-gateways/types.ts:80-82`).
  **No code writes them**; the runbook's manual SQL is the only writer. Readers: `nextReceiptStatus` (keeps them),
  `toDispatchStatus` (`submission-service.ts:2331-2335`: `ack3_received` → `'acknowledged'`, anything else unrefused →
  `'sent'`), `filed-sequence-rejection.ts:84-92`, `server/routes/mdx-analytics.ts:97`.
- `submission_transmittals.status` and `ectd_sequences.dispatch_status` are TEXT with **no CHECK** anywhere in
  `migrations/` or `db/migrations/` (searched for both, 2026-11-02). No trigger guards either table.
- `sub_trans_active_lock_idx` (`migrations/20260629_submission_transmittals_active_lock.sql`) is unique on
  `(organization_id, package_id, bundle_sha256)` for `pending|in_transit|received`. Sequence-spine rows have a NULL
  `package_id`, so it never binds them.

### 1.6 The client today

- **Dispatch tab:** `DispatchWorkspace` (`SubmissionSeqWorkspaces.tsx:2032+`) → `PackageAndTransmit` (`:2015-2030`) →
  `TransmitPanel` (`:1946-2013`). The panel reads `governed-precheck { step: 'transmit' }`. A held sequence reads
  "Transmit is not available: a transmit of this sequence is already in flight (dispatch status 'transmitting'). …"
  (`:2003`, from `resendRefusal`, `submission-service.ts:2321-2329`: a raw token on screen). `TransmitReadiness`
  carries `dispatchStatus` (`:1735`). `SeqRow` (`:85-92`) does not.
- `DossierTransmissions` (`:1874-1937`) lists the project's transmittals in the region, with the raw status chip,
  "not acknowledged" from `ack_received_at`, and `error_message`.
- `SubmissionCenter.tsx`: `GovernedFlow`, `GOVERNED_LABEL`, `GOVERNED_PAST` (`:294-301`), `precheckRefusal`
  (`:788-812`), `requestGoverned` (`:814-831`), `runGoverned` (`:844-900`, sign then `ownAct`), the one `EsignModal`
  mount (`:1910-1962`, whose `targetMeta` prints `ectd-sequence:${id}`). `DispatchWorkspace` is keyed
  `${seq.id}:${seq.status}:${readinessBump}` (`:1744-1745`), so a bump re-reads the panel.
- `EsignModal` (`client/src/concept2cure/_shared/components/EsignModal.tsx:131-205`) already takes `renderMeaningDetails`
  and `signedRows`; the Submission Center mount passes neither today.
- **Gateway transmittals** (`GatewayTransmittals.tsx`, the organization's read-only log): "Record agency MDN"
  (`As2ReceiptUpload.tsx`, 62 lines) on every FDA ESG row (`:554`); `technicalRejectionNote` (`:149-157`) prints a
  quiet line from `metadata.technicalRejection` under the status (`:584-586`), the precedent for a note read from
  transmittal metadata. **The Dispatch tab offers no receipt upload.**
- **Layout:** D7-A1 and D7-A2 (`.design/claude-convergence/D7.md:127-201`) have not landed (no D7-A commit on origin).
  `.pj-more` is styled only under `[data-work-area]`, `.pj-main` or `.pj-side` (`styles/app-v2.css:3924-3929`).

### 1.7 Searches run

- **Code** (`git grep` on origin, `server/`, `client/`, `shared/`): `non-receipt`, `held send`, `held-send`,
  `heldSend`, `settleHeld` → 0. Writers of `ack2_received`/`ack3_received` outside the runbook → 0.
- **History:** `git log --all -S` on `settleHeldSend`, `HELD_SEND`, `heldSend`, "released as not received" → 0;
  `held-send` and `non-receipt` → only `1f8fd9839` (the D7 record README).
- **Deletions, first draft (not evidence).** `git log --all --diff-filter=D` on `*ollback*`, `*Rollback*`, `*eceipt*`,
  `*Ack*`, `*etract*` in the shared clone → 0. That clone is shallow (`git rev-parse --is-shallow-repository` → `true`,
  15 roots, the oldest 2026-10-05), and `COORDINATION.md` "Known caveats" requires unshallowing before any deletion
  search. Even inside its depth the search missed `7df89f4f7` (2026-10-16) for `*eceipt*` without `--full-history`, and
  the case-sensitive `*Ack*` would miss `esg_ack_poller.py`. **Withdrawn as RULE 3 evidence** (§9.1 finding 10).
- **Deletions, re-run for the revision** in the blobless full clone (17,399 commits, back to 2025-11-20; never in the
  shared tree):
  `git -c gc.auto=0 log --full-history --diff-filter=D --name-only -- 'server/**' 'client/**' 'shared/**' 'scripts/**' 'docs/runbooks/**'`,
  filtered case-insensitively for `ack|poller|webtrader|esg|rollback|receipt|mdn|retract|transmittal`. The relevant hits:

  | Deleted | Commit | What it was | Bearing on P-92 |
  |---|---|---|---|
  | `server/utils/esg_ack_poller.py` (71 lines), `server/routes/acks.py`, `server/tasks/esg_tasks.py`, `server/utils/esg_submitter.py` | `87d13d7cd` (2026-03-25, "BETA audit — remove mock data route + 127 dead Python files") | A poller that fetched ACK1/ACK2/ACK3 files over SFTP, read `//submissionStatus` from the ACK2 XML, set a Python `INDSequence.status` ("ESG ACK2 Success", "Centre Receipt"), and kept `ack1_path`…`ack3_path`; a read route over them | An **automated, unsigned** status update in a deleted Python model, never a signed settlement. Its ACK2 XPath cites no FDA source, so it is no format on file (§9 A4 unchanged). Nothing to reach or restore: the model, the SFTP `/outgoing/` channel and the language are gone. |
  | `server/services/esgPush.js` (`b6e991501`, 2026-04-04), `server/services/esgService.js` (`e1dca6e3d`, 2026-04-04), `client/src/components/EsgSubmit.jsx` (`83fa7f6cf`, 2026-04-01) | dead-code purges | Earlier ESG submitters | No settlement or acknowledgement act. |
  | `server/routes/esgSubmissionRoutes.ts` (`c6d7295a8`, 2026-08-13), `server/services/ESGSubmissionService.ts` (`89c83f58a`, 2026-08-14) | 510(k) convergence onto `governed-transmit.ts` | A simulated transmit ("SIMULATED-NOT-SENT") with an `acknowledgmentNumber` field | Converged onto `submission-gateways/`; no settlement act. |
  | `client/src/concept2cure/submission/surfaces/Transmittals.tsx` | `2895218b8` (2026-08-04) | A transmittal list whose only control asked AnA about a row | No settlement control (grep for rollback, ack2, ack3, receipt, settle: none). |

  And the rollback route's removal, `6ef0ef121` (§1.2). Its full diff is readable in the full clone
  (`git show 6ef0ef121`): six files, the route handler, the sign-ceremony baseline entry and its pins.
- **Conclusion.** No signed settlement of a held send by an agency document has ever existed, in the full history. Ack
  handling existed once, as an unsigned automated poller in the deleted Python universe, and is not restored. Every
  part P-92 needs exists. The work is a **completion** of the sequence's signed acts (`submission-service.ts`) and of
  the FDA receipt reconciliation (`fda-esg-receipts.ts`), reached from the existing Dispatch tab. The evidence README's
  "What already exists" repeats these commands, the clone's depth and these results (C1).

### 1.8 The D7 record's proposals, verified (input, not given)

| Item | Verdict |
|---|---|
| Row `:38` (held send) | Holds, corrected: H2, H2′ and H4 can be settled today by re-uploading the kept MDN (unsaid on screen); H3's 4xx arm, H5′, H7–H9 and L (H5 among them) cannot be settled even with an MDN. |
| A1 (tell the signer the truth) | Holds, corrected: `REFUSED_BY_AGENCY` also throws a `GatewayError` (H3), where FDA's endpoint answered, so mapping every `GatewayError` to `OUTCOME_UNKNOWN` would say "may hold it" of a refusal. **Not P-92's** (§7 item 1). |
| A2 (others are told) | Building blocks exist; not verified that an `ectd_sequence` task opens the Dispatch tab. Not P-92's (§7 item 2). |
| A3 (a receipt door on the Dispatch tab) | Holds, and **not reached by P-92** (revised, §9.1 finding 8). P-92 did not decide it, and the record's "no settlement by an unsigned action" needs the coordinator's confirmation that FDA's verified MDN is outside it (§8 Q10). P-92's disclosure says in words where FDA's signed receipt is recorded today (Gateway transmittals, "Record agency MDN") and adds no upload. A3 stays its own F1 item (§7 item 14). |
| A4 (`LatestSequence.dispatchStatus`) | Partly verified. D3's file. Not P-92's (§7 item 2). |
| A5 | Decided: P-92. |
| DP-81 part 2 | Holds, independent. P-92 writes neither `as2Receipt` nor `mdn_raw`, so the two commute in `fda-esg-receipts.ts`. |

---

## 2. The rules this design is held to

- **RULE 0.** `concept2cure-v2` only.
- **RULE 1.** No migration. The new transmittal metadata key is jsonb; the statuses written (`ack2_received`,
  `ack3_received`, `rejected`, `pending`, `sent`, `acknowledged`) are existing TEXT values with no CHECK (§1.5).
  Nothing in `shared/schema*` or `scripts/db/migration-set.mjs`.
- **RULE 3.** §1 is the "What already exists" section; the evidence README repeats it.
- **RULE 4.** No card, panel, screen or tab. The door is words and one `<details>` inside the existing `TransmitPanel`;
  the record is one line on two existing lists.
- **RULE 5/6.** Every commit carries `Plan: F1` (the coordinator's filing, and the record's owner line) and
  `Completes:` existing paths. No new route file, service file, table, mount or AnA tool. The two new route handlers
  sit in the mounted `server/routes/submissions.ts` router (the P-34/P-35 precedent). **No new non-test file** (the
  coordinator's ruling for P-86, 2026-11-02 01:19, applied here too). No code is deleted. Two unsigned runbook
  procedures are retired by the record's own words (C1). Every file outside the record's two is in §5.0, with its
  holder and the hold asked for.
- **Part 11.** A signed act with a declared meaning (§11.50), re-authentication at signing (§11.200), the signer's
  reason in `audit_logs.reason` and in the chained details (§11.10(e)), chained rows in the act's transaction, and the
  agency's document retained in Vault, named by id and hash in the signed payload, the act's audit row and the
  transmittal (§11.70 linking through the chain).
- **Fail closed; never fabricate an agency response.** The act records a person's attestation over FDA's own document.
  Every record of it carries `verified: false` and says so in words. A read that fails is never a refusal or a pass.
  A legacy claim is never matched by guess. **FDA's verified answer is never discarded and never signed over.** If
  one is already kept, no signature settles the send (E4). If one arrives after a settlement and contradicts it, it is
  kept, audited and shown, and a resend is held (§3.3); which record wins is the founder's (§8 Q7).

---

## 3. The design

### 3.1 The ceremony: the sequence's own two-step chain

1. **Sign.** `POST /api/c2c/actions/sign` on `ectd-sequence:<id>`, meaning `responsibility`, the signer's reason,
   and this payload:
   ```
   { intent: 'held-send-settlement', meaning: 'responsibility', outcome: 'received' | 'not-received',
     transmittalId, transmitAttemptId,
     evidence: { vaultDocumentId, sha256, kind: 'ack2' | 'ack3' | 'fda-non-receipt-confirmation' },
     statement }
   ```
   `transmittalId`, `transmitAttemptId`, `sha256` and `statement` come from the precheck answer, never from client code.
2. **Act.** `POST /api/submissions/sequences/:seqId/held-send/settle { signatureActionId, outcome }`, through Gate 1
   with intent `held-send-settlement` and a `payloadRefusal` (§3.6), inside `voidingSignatureOnRefusal` (P-23).

- **One intent, the outcome in the payload,** as P-35 carries its disposition. Gate 1's `payloadRefusal` makes a
  "received" signature unusable for a release, and the reverse.
- **Meaning `responsibility`, only.** `INTENT_MEANING_REFUSAL['held-send-settlement']` refuses any other: "settling a
  held send is signed with the meaning responsibility". The signer answers for a record of what FDA holds. It approves
  no content and releases nothing to the agency. The sign route's `assertSignerIsNotAuthor` and the act's
  `independentSignerRefusal` keep the sequence's creator from settling its send.
- **The document is linked in four places:** the signed payload (the sign's chained audit row hashes it; the signature
  manifest names that row by `auditSha256Chain`); `ECTD_HELD_SEND_SETTLED`'s chained details; `ECTD_TRANSMITTED`'s
  details for S; and `submission_transmittals.metadata.heldSendSettlement`. The `electronic_signatures` row binds the
  leaf manifest, not the document's hash directly: the hash is covered through the chain. §9 A1 is the stated fallback
  if the record requires the direct binding.

### 3.2 Eligibility: one pure rule, read three times (precheck, act, under the lock)

`readHeldSend(q, organizationId, seq)` reads the facts; `heldSendRefusal(facts, outcome)` judges them (pure). A read
failure is `INVALID_STATE`: "Whether sequence NNNN's held send can be settled could not be checked, so nothing was
changed. Try again." Refusals are `HELD_SEND_NOT_SETTLEABLE` (409) unless noted.

| # | Check | Refusal sentence |
|---|---|---|
| E1 | The sequence is live, `status 'dispatched'`, `dispatch_status 'transmitting'`, and S and A are both non-null. | Not transmitting: "Sequence NNNN has no held send to settle. Nothing was changed." S or A null (row L): "Sequence NNNN's held send was claimed before the platform bound each send to its signature, so which transmission it was cannot be read, and it is not settled by guess. Nothing was changed." |
| E2 | Exactly one `submission_transmittals` row with `organization_id = $org`, `region 'fda'`, `gateway 'esg'`, `metadata->'dispatchBinding'->>'sequenceId' = $id::text` and `->>'attemptId' = A::text`, whose binding passes `dispatchBindingOf` (`fda-esg-receipts.ts:100-104`) with `signatureActionId = S`. **No `transport` filter**, because bound SFTP-transport holds (H5′) exist and are releasable on FDA's letter. (H5 itself is L and is refused at E1; corrected, §9.1 finding 7.) Two or more throw `INVALID_STATE` (fail closed, as slice 1's fold does). | None: "No FDA transmission is recorded for sequence NNNN's held send, so there is no FDA answer to settle it with. Only a held send to FDA is settled here. Nothing was changed." (H8, H10.) |
| E3 | Production: `metadata.environment === 'production'`, and `metadata.as2.environment`, when present, equal. A missing environment refuses. | "Sequence NNNN's held send went to FDA's test environment, which is not a filing, so it is not settled here. Nothing was changed." (Pre-slice-2 rows only, §8 Q5.) |
| E4 | **No verified FDA answer to this send is kept on the platform**, whatever the status column says: refuses **both** outcomes when `status = 'received'` **or** `metadata.as2Receipt.verified === true`. This covers H2 and H2′ (`in_transit` with a verified MDN kept at `fda-esg.ts:837`), H3's signed refusal and H4. Revised, §9.1 finding 1: the first draft read the status alone and offered a release against FDA's verified receipt. | "FDA's signed answer to this send is already kept on the platform, so it is not settled by a signature here. On Gateway transmittals, download FDA's answer from this send's row and record it with 'Record agency MDN', which checks FDA's signature on it and records the send by FDA's own answer. Nothing was changed." (The download is `downloadAcknowledgment`, which serves a verified `as2Receipt` as `'agency'`, `fda-esg.ts:930-936`.) The precheck sets `receiptUpload: true` in this state. |
| E5 | **The attempt has ended, and is not settled.** (a) The status is one of `pending`, `in_transit`, `received`, `rejected`, and `metadata.heldSendSettlement` is absent. (b) **The gateway has finished**: `status IN ('received','rejected')`, or `error_message IS NOT NULL` (every post-wire failure writer sets it, §1.1), or the row has been quiet for 24 hours (`now() - updated_at >= interval '24 hours'`; a crash, H9, or a failed failure-write). Revised, §9.1 finding 2: without (b) a settlement could land during a live send and the gateway's unconditional writes would then overwrite it. | Settled: "Sequence NNNN's held send is already settled (recorded as received, or released, on DATE). Nothing was changed." In progress: "This send of sequence NNNN may still be in progress, so it is not settled yet. Nothing was changed. If the platform hears nothing more of it, it can be settled after TIME." (TIME is `updated_at` plus `HELD_SEND_QUIET_PERIOD`, one constant in `fda-esg-receipts.ts`, in DATE's form.) |
| E5b | **Received needs a send that left.** `transport = 'as2'`, the AS2 binding passes `bindingOf` (`metadata.as2.messageId` a string, `fda-esg-receipts.ts:17-23`), the status is not `pending`, and the row is not a refusal FDA's endpoint gave when the send was made (`status 'rejected'` with `http_status` 400–499: `possibleAs2Delivery` counts it as not delivered, `fda-esg.ts:513-514`). Refuses H7, H9 before the binding, H5′ and the 4xx arm of H3 for **received**; release stays offered. Revised, §9.1 finding 3. | No binding, SFTP or `pending`: "The platform's record shows this send never left the platform, so an FDA acknowledgement cannot be for it. Nothing was changed." The 4xx arm: "FDA's AS2 endpoint refused this send when it was made, so FDA did not unpack it and an acknowledgement cannot be for it. Nothing was changed." |
| E6 | The evidence: `readVaultSource(q, org, id, { lock })`, plus one read of `vault.documents.program_id, created_at` by id and organization: `program_id = submissions.program_id` for this sequence's submission; its `content_hash` is 64 hex and equals `payload.evidence.sha256`. A submission with no project refuses. **And the document can be FDA's answer to this send** (revised, §9.1 finding 6): its `created_at` is not earlier than the transmittal's `submitted_at` (both from the database clock: `submitted_at` is `NOT NULL DEFAULT now()`, set at row creation, before any byte, `migrations/20260509_submission_gateways.sql:39`; `created_at` is record-immutable, `migrations/20260926_vault_documents_record_immutability.sql:135-136`); and neither its id nor its `content_hash` is cited by `metadata.heldSendSettlement` on **another transmittal bound to the same sequence**. | "The FDA document is not a retained document in this project's Vault, or it changed after it was signed. Add FDA's document to the project's Vault and choose it. Nothing was changed." No project: "This submission is not in a project, so no project Vault holds FDA's document. Nothing was changed." Earlier or reused: "This document was in the Vault before this send was made, or it already settled another send of sequence NNNN, so it cannot be FDA's answer to this one. Nothing was changed." |
| E7 | `kind` matches the outcome: `ack2`/`ack3` for received, `fda-non-receipt-confirmation` for not-received. | `VALIDATION` (400): "An Ack2 or Ack3 records a send as received; FDA's written confirmation of non-receipt releases it." |
| E8 | The signer is not the sequence's creator (`independentSignerRefusal`) and holds signing authority (the sign route). | `FORBIDDEN` / the sign route's 403 |

At the precheck only, E8 is advice: the overview answer carries `signerRefusal` so the screen can say it before
anyone signs (S4).

**The order of the rules.** E1, E2, E3, E4 and E5 judge the send and refuse both outcomes. E5b judges received only.
E6 and E7 judge the chosen document. E5(b)'s quiet period is a stated bound, not a proof: an AS2 POST that is still
running more than 24 hours after its `in_transit` write would pass it. That residual, and the two code changes that
would close it, are named in §7 item 13.

### 3.3 Effects (one transaction)

`applySequenceChangeWithAudit` gains two optional fields, both additive and unused by every other caller:
`audit.reason` (P-86 D4 adds the same; whichever lands first adds it) and `update.afterUpdate(client)`, which runs on
the same client after the UPDATE affected a row and before the chained row. A throw in either rolls everything back.

**`underLock`, in this order:**
1. `setTenantContextTx(client, organizationId)` (§1.3: the helper sets none).
2. The transmittal `FOR UPDATE` (by E2's id, org, `region 'fda'`, `gateway 'esg'`). **The transmittal first**, as
   `ingestFdaAs2Receipt` takes it, so a receipt upload and a settlement cannot deadlock.
3. `recheckUnderSequenceLock` (submission, sequence `FOR UPDATE`, program), whose `recheck` re-reads E1–E7 on the
   transaction's client (E4's kept receipt, E5's ended predicate, E5b's binding and E6's time and reuse checks
   included), re-reads the Vault row `FOR SHARE`, recomputes the statement and compares it with the payload's,
   exactly; then the leaf digest again.

| | Recorded as received | Released as not received |
|---|---|---|
| `ectd_sequences` UPDATE | `dispatch_status = toDispatchStatus(kind === 'ack3' ? 'ack3_received' : 'ack2_received')` (Ack2 → `'sent'`, Ack3 → `'acknowledged'`; the one projection reused). CAS: id, org, `status 'dispatched'`, `deleted_at IS NULL`, `'transmitting'`, S, A. **A is kept**, so slice 1's fold reads A's bound `leafManifest` as what is on file. | `releaseTransmitSlot`'s own statement, run on the transaction's client: `releaseTransmitSlot` gains an optional query surface (default `pool`), so there is one statement, not a copy. `'pending'`, S and A nulled, CAS on `'transmitting'`, S, A. |
| `afterUpdate` (1): the transmittal | CAS on the judged status: `status = 'ack2_received' \| 'ack3_received'`, `metadata = metadata \|\| jsonb_build_object('heldSendSettlement', $1::jsonb)`, `updated_at`. Zero rows throw `INVALID_STATE` ("the transmission changed while this settlement was recorded"). | The same, with `status = 'rejected'`. **Never `rolled_back`.** |
| `afterUpdate` (2): spend S | `ECTD_TRANSMITTED` naming S, written when unspent, through **one function shared with the receipt path**: `resolveReceiptSequence`'s spend (`fda-esg-receipts.ts:116-123`) moves into `spendTransmitSignature(client, …)` in the same file, called by both. Details: `signatureActionId: S`, `transmitAttemptId: A`, `transmittalId`, `status: 'ack2_received' \| 'ack3_received'`, `environment 'production'`, `region 'fda'`, `gateway 'esg'`, `source 'held-send-settlement'`, `settlementSignatureActionId: T`. | The same, `status: 'not-received'`. The attempt did reach the gateway; without this row **S would authorize a second send**. S is spent, not voided: P-23 voids a refused act's signature, and S's act was performed. |
| The act's chained row (spends T) | `ECTD_HELD_SEND_SETTLED` on `ectd_sequence:<id>`, `audit_logs.reason` = the signature's reason (`dispositionSignatureReason`; none refuses `GOVERNED_REQUIRED`). Details: `outcome`, `signatureActionId: T`, `signatureId`, `meaning`, `reason`, `statement`, `evidence { vaultDocumentId, sha256, kind, verified: false }`, `transmittalId`, `transmitAttemptId: A`, `transmitSignatureActionId: S`, `environment`, `dispatchStatus { from, to }`, `transmittalStatus { from, to }`, `boundDigest`. | the same |
| Untouched | `error_message`, `error_class`, `ack_received_at`, `as2`, `as2Receipt`, `as2ReceiptHistory`, `mdn_raw`, `dispatchBinding`, `leafManifest`, `sentPackage` | the same |

`metadata.heldSendSettlement` = `{ outcome, kind, vaultDocumentId, sha256, verified: false, settledAt, settledBy,
signatureActionId: T }`, merged with `||` as every other writer of that column does (slice 1 relies on it).

`signatureSpentBy`'s literal list (`:1131-1132`) gains `ECTD_HELD_SEND_SETTLED`. Without it, a repeated POST after a
settlement is refused and `voidingSignatureOnRefusal` then voids T, a signature that performed an act (P-86 D5's trap).

**A late FDA receipt, after a settlement.** Revised, §9.1 finding 5. The first draft refused a contradicting receipt
with 409 and kept nothing, because `nextReceiptStatus` throws (`fda-esg-receipts.ts:59`) before the only writes
(`:86-92`). It also left the resend open: after a release the sequence is `'pending'` with no claim, `resendRefusal`
lets `'pending'` through (`submission-service.ts:2321-2329`), the claim's CAS admits it (`:2472`), and
`findActiveTransmittal` returns null for a null `package_id` (`fda-esg.ts:1202`). Now:
- **Consistent receipts** are recorded as today.
  - After "received" on Ack2, a positive MDN is kept (`nextReceiptStatus` keeps `ack2_received`), and the sequence
    answers `already-resolved`.
  - After "received" on Ack3, `resolveReceiptSequence`'s read (`:129-131`) would answer `unreconciled` for an
    `'acknowledged'` sequence. So `already-resolved` is widened, in one line, to "the claim still names S and A and the
    sequence is filed" (`isFiledDispatchStatus`).
  - After a release, a negative MDN is recorded (`matchingRejected`). The sequence is untouched (`unreconciled`: A was
    nulled).
- **A contradicting verified receipt is kept, never thrown away.** That is a positive MDN after a release, or a
  negative one after "received". In `ingestFdaAs2Receipt`, after the binding check and before `nextReceiptStatus`:
  when `current.metadata.heldSendSettlement` is present and the verified status contradicts its outcome, the receipt
  is appended to `as2ReceiptHistory` with `contradicts: <outcome>`. `as2Receipt`, the status, `mdn_raw` and the
  settlement are untouched: the signed record stays as signed, and FDA's answer sits beside it. The existing
  `recordGovernedAction` `'transition'` row is written on `submission-transmittal:<id>`, with `from` equal to `to` and
  a payload naming `contradicts`, the receipt's `sha256` and `originalMessageId`. Then the transaction **commits**, and
  the call throws `FdaAs2ReceiptRefusal('AS2_RECEIPT_CONTRADICTS_SETTLEMENT', 409, sentence)`. A re-upload of the same
  bytes takes the duplicate branch (`:75`); when the matching history entry carries `contradicts`, that branch answers
  the same 409 and writes nothing.
  - After a release: "FDA's signed receipt shows it received this send of sequence NNNN, which was released as not
    received on DATE. The receipt is kept with the send's record. Sequence NNNN is not sent again: FDA may already
    hold it. Contact FDA before anything else is done with it."
  - After "received": "FDA's signed answer refuses this send of sequence NNNN, which was recorded as received on DATE.
    The answer is kept with the send's record, and the sequence stays recorded as received until that is decided."
    Which record then wins is the founder's question (§8 Q7). The first draft called this case "correct and closed";
    it is not.
- **The resend is held** while FDA's signed receipt contradicts a release. `releasedSendReceivedRefusal(q, org,
  sequenceId)` in `fda-esg-receipts.ts` answers a sentence or null. It reads any bound FDA ESG transmittal of the
  sequence (`dispatchBinding.sequenceId`, any attempt) whose `heldSendSettlement.outcome` is `'not-received'` and whose
  `as2ReceiptHistory` holds a verified entry with `contradicts: 'not-received'`. Two places call it:
  - `sequenceTransmitReadiness`, right after `resendRefusal`, so the refusal comes before anyone signs;
  - `claimTransmitSlot`, under its sequence lock, after the spent check, as `DISPATCH_BLOCKED`.

  Sentence: "FDA's signed receipt shows it already received sequence NNNN's send of DATE, which was released as not
  received. Sequence NNNN is not sent again. Nothing was signed or sent." A read failure there refuses ("Whether
  sequence NNNN may be sent again could not be checked, so nothing was sent").

### 3.4 The statements (one source, server-held)

`heldSendStatement(outcome, kind, facts)` in `fda-esg-receipts.ts` is the only place the words exist. The precheck
returns it, the disclosure and the dialog show it word for word, the payload binds it, `ECTD_HELD_SEND_SETTLED`
repeats it. `DATE` is the transmittal's `submitted_at` ("3 November 2026 at 14:05 UTC").

**The identifier is always our own AS2 Message-ID**, `metadata.as2.messageId`, read through `bindingOf`
(`fda-esg-receipts.ts:17-23`), **never `transmission_id`**. That column holds the reply's `Message-ID` (H1), the MDN's
own (H4), or nothing (H3), so the first draft would have had the signer attest an intermediary's or the MDN's
identifier as the send's (revised, §9.1 finding 4). It is an agency-facing identifier, not a record key: FDA's Ack2,
Ack3 and non-receipt letters cite the message the sponsor sent. Under E5b every "received" statement has one. A
release on a row with no binding (H5′, H7, H9 before the binding) says instead "No AS2 message was formed for this
send." and gives no identifier.

- **Received, Ack2:** "FDA's Ack2 for the send of sequence NNNN on DATE (AS2 message ID X) is the document chosen from
  this project's Vault. It shows that FDA unpacked sequence NNNN and delivered it to the center. Sequence NNNN is
  recorded as received by FDA: it is on file with FDA and is not sent again. The platform did not verify this
  acknowledgement; the record rests on this document and this signature."
- **Received, Ack3:** the same, with "It reports the center's validation result for sequence NNNN, and that result
  accepts it. Sequence NNNN is recorded as received by FDA and acknowledged by the center: …". (FDA's words, `fda-as2-guide.txt:147-155`.)
- **Released (the duplicate-filing risk, in words):** "FDA has confirmed in writing that it did not receive the send of
  sequence NNNN on DATE (AS2 message ID X); that confirmation is the document chosen from this project's Vault.
  Releasing the send lets sequence NNNN be sent again, under a new signature. If FDA did receive the first send after
  all, sending sequence NNNN again files it twice: FDA would hold two copies of sequence NNNN, and may refuse the second
  or require it to be corrected. Release it only on FDA's written confirmation." With no binding, "(AS2 message ID X)"
  becomes "; no AS2 message was formed for this send".
- **Released, over the size FDA's channel takes** (H5′: `bundle_size_bytes` above P-93's limit, read from P-93's one
  constant once P-93 lands, and until then `transport = 'sftp'`, which `fda-esg.ts:749` sets exactly above 1 GiB). The
  second sentence changes, because P-93 refuses the re-send: "Releasing the send frees its record and its signature,
  but sequence NNNN is larger than FDA's documented channel takes, so it cannot be sent again as it is." The risk
  sentence stays: "If FDA did receive the first send after all, any later filing of sequence NNNN's content files it
  twice: FDA would hold two copies, and may refuse the second or require it to be corrected." Revised, §9.1 finding 7:
  the first draft promised a re-send that P-93 refuses.

A cleared precheck answer without a statement is unreadable on the client ("Whether the server would accept this could
not be checked"), as P-86 C3 does.

### 3.5 Signature spending, in one place

- S (transmit): spent by `ECTD_TRANSMITTED` in both outcomes. A fresh send needs a fresh transmit signature.
- T (settlement): spent by `ECTD_HELD_SEND_SETTLED`.
- A refused settlement voids T (`voidingSignatureOnRefusal`), including a lost race with a receipt upload.
- `fda-esg-receipts.ts`'s spent list (`:117`) is unchanged: it asks only whether S is spent.

### 3.6 Gate 1's `payloadRefusal` for this intent (sync; the evidence is compared after it)

It refuses unless `payload.outcome` equals the act's `outcome`, `payload.transmittalId` equals E2's row,
`payload.transmitAttemptId` equals A (a signature for attempt A never settles A′ after a release, a resend and a second
hold), `payload.evidence.kind` passes E7, and `payload.statement` is a non-empty string. After Gate 1 and again under
the lock: `payload.evidence.vaultDocumentId`/`sha256` equal E6's live row, and `payload.statement` equals
`heldSendStatement(...)` recomputed from the locked facts, exactly. Each mismatch is `GOVERNED_REQUIRED` in words, with
no record key or API path: "The signature does not settle this held send: it names another attempt of sequence NNNN.
Sign the settlement again from the Dispatch tab."

### 3.7 Where the code goes (existing files only)

| File | Change |
|---|---|
| `server/services/submission-gateways/fda-esg-receipts.ts` (132 lines) | Beside the reconciliation that already settles held sends: `readHeldSend` (E1–E5b, reusing `dispatchBindingOf` and `bindingOf`), `heldSendRefusal` (pure), `HELD_SEND_QUIET_PERIOD`, `heldSendStatement`, `markHeldSendSettled(client, …)` (the transmittal CAS and merge), `spendTransmitSignature` (moved out of `resolveReceiptSequence`, no copy), the contradicting-receipt keep and its 409 in `ingestFdaAs2Receipt` and its duplicate branch, `releasedSendReceivedRefusal`, and the one-line `already-resolved` widening. Estimated under 340 lines after. Imported dynamically by `submission-service.ts`, as that file already imports the gateway module (`:2690`, `:2937`); types with `import type`. |
| `server/services/submission-service/submission-service.ts` | `HELD_SEND_SETTLEMENT_INTENT` and `HELD_SEND_SETTLED_ACTION`; `SequenceSignatureIntent`, `INTENT_LABEL` ("settlement of the held send"), `INTENT_MEANING_REFUSAL`; `HELD_SEND_NOT_SETTLEABLE: 409` in `SubmissionErrorCode` and `SUBMISSION_ERROR_STATUS`; `signatureSpentBy`'s list; `precheckGovernedStep`'s step; `settleHeldSend` = `voidingSignatureOnRefusal(applyHeldSendSettlement)`; `applySequenceChangeWithAudit`'s `reason` and `afterUpdate`; `releaseTransmitSlot`'s optional query surface; `releasedSendReceivedRefusal` called in `sequenceTransmitReadiness` (after `resendRefusal`) and in `claimTransmitSlot` (under the sequence lock, `DISPATCH_BLOCKED`); `resendRefusal`'s `'transmitting'` sentence (copy only, after slice 2): "A send of this sequence is held. It was handed to the agency's gateway and no verified answer has settled it, so the agency may hold it; it is not sent again until the send is settled." |
| `server/routes/submissions.ts` | `governedPrecheckSchema` step enum `+ 'held-send-settlement'`, optional `outcome`, `evidenceDocumentId` (uuid), `evidenceKind`, refined (a document needs an outcome; received needs a kind). One handler `POST /sequences/:seqId/held-send/settle` beside `:1483` and `:1514`, `limiter`, `requireRole(AUTHOR)`, schema `{ signatureActionId, outcome }`. The router is already mounted. |
| `server/services/ana/__tests__/ana-cannot-settle-held-send.test.ts` (new **test**) | The P-35 source scan over `server/services/ana` and `server/mcp`. |

The precheck answer for this step:
```
{ step, cleared, refusal, heldSend: {
    sequenceNumber, sentAt, as2MessageId | null, transmittalId, attemptId, transport,
    receiptUpload: boolean,                 // AS2 transport and an AS2 binding: FDA's signed MDN for this message can be
                                            // recorded on Gateway transmittals (true also when one is already kept, E4)
    outcomes: { received: string | null, 'not-received': string | null },   // null = offered
    signerRefusal: string | null,
    statement?: string, evidence?: { vaultDocumentId, sha256 } } }   // only with outcome + document (+ kind), when cleared
```
`as2MessageId` is `metadata.as2.messageId` through `bindingOf`, the same value the statement names; there is no
`transmissionId` field.
`cleared` is "some outcome is offered" without an outcome, and "this outcome, on this document, would be accepted"
with one.

---

## 4. Where the person does it

**Proposed: on today's layout, inside `TransmitPanel` on the Dispatch tab, as words and one quiet `<details>`, under
`Plan: F1`, before D7-A2. This needs the coordinator's recorded ruling** (§5.0, §8 Q9), because C2 goes past slice
2's "copy only" hold in two files whose Dispatch section D7-A2 restructures. If the coordinator declines, C2 is filed
under `Plan: L1` (row D7) after D7-A2, as P-86 C3 is, and **C1 waits with it** (the act is never on trunk without its
door). The arguments for landing first, put to the coordinator rather than decided here:

1. **A held production send has no exit today** for H1 without a signed MDN, and none at all for H3's 4xx arm, H5′,
   H7–H9. It can be neither re-sent (`resendRefusal`), retired (P-86 check 2b), nor filed. Waiting for D7-A2 (which
   waits on D7-A1 and D0) would leave the server act with no door, and an act with no door is not done (RULE 4).
2. **`TransmitPanel` is where the held state is already said** (`:2003`). D7-A2 does not restructure the panel's
   internals: step 10 retitles "Package and transmit" as a `.pj-sec-h`, and step 8 moves the select. P-86 deferred
   because its disclosure sits at the foot of `DispatchWorkspace`, which D7-A2 does restructure; this one does not.
3. **No class, stylesheet, component file or D0-locked file.** `<details className="pj-more">` gets its look when
   D7-A1 adds `data-work-area`; until then it is a plain disclosure. It reuses `VaultVersionPicker`, the one
   `EsignModal` mount and `btn ghost small`. It does **not** mount `As2ReceiptUpload` (A3 is not reached, §1.8).
4. **D7-A2's acceptance gains one check, through the coordinator:** the held-send disclosure survives the move. RIM
   holds D7-A2's layout lane (L9, `COORDINATION.md` "Who works where"), so the two land in one session, in order.

---

## 5. The commits, in order

Both are `Plan: F1`. Each message body cites P-92 and launch row D7. **C1 and C2 are pushed together**, so the act is
never on trunk without its door. If the coordinator files C2 under L1 after D7-A2 (§4, §8 Q9), C1 waits with it.

### 5.0 Coordination: every file, its holder, and the hold asked for (send before each commit's first edit)

The record scopes the work to "the files it holds (`submission-service.ts`, `fda-esg-receipts.ts`)". Every other file
is listed here and asked for through the coordinator (`COORDINATION.md:8`: "Send it your package, step and file list
before you change a file that another package's spec also names"). F1's ledger paths are `**`, so the plan gate would
not refuse any of these files; the holds are about one session per file, not the gate. Holders are read on origin at
`ffd2bd772`.

| File | Holder now | Commit | Action |
|---|---|---|---|
| `server/services/submission-service/submission-service.ts` | RIM (F1 slice 2 hold; repair A next) | C1 | Same session, after slice 2 and repair A are pushed. P-86 C1/C2 and P-93 share the file: whichever lands second rebases (§6). |
| `server/services/submission-gateways/fda-esg-receipts.ts` | RIM (F1 slice 2 hold; slice 2's edits are in the working tree now) | C1 | Same session, after slice 2 is pushed. |
| `server/routes/submissions.ts` | unheld; the coordinator's 01:19 ruling 2 grants it to **P-86 C1** only | C1 | **Ask the coordinator for the hold** for P-92 C1 (the precheck enum and one handler). Sequence it with P-86 C2's handler. |
| `docs/runbooks/fda-esg-production-uat.md` | unheld; **P-93 §8 also edits it** | C1 | Tell the coordinator. RIM holds P-93 too, so the two are sequenced in one session; whichever lands second rebases. |
| `docs/runbooks/ectd-transmit-path.md` | unheld on origin; **F1 slice 2 edits it in the working tree now** | C1 | After slice 2 is pushed; tell the coordinator. |
| `server/services/submission-service/__tests__/_freeze-gate-fixture.ts` | F1 slice 1 (RIM), now on origin | C1 tests | Optional fields only; slice 1's and slice 2's tests unchanged. |
| `server/services/submission-gateways/__tests__/fda-esg-receipts.pglite.test.ts` | RIM (slice 2 edits it in the working tree) | C1 tests | After slice 2 is pushed. |
| new tests: `held-send-settlement.pglite.test.ts`, `submissions-held-send-settlement.test.ts`, `ana-cannot-settle-held-send.test.ts`, `dispatchHeldSend.test.tsx` | — | C1, C2 | New test files only (the coordinator's 01:19 ruling: no new non-test file). |
| `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` | RIM, **copy only** (slice 2); its Dispatch section is restructured by **D7-A2** (`.design/claude-convergence/D7.md:164-196`, step 10), RIM's L9 lane | C2 | **Ask the coordinator to widen the hold beyond copy** (one function, one `<details>`, the picker, two radios) **and to rule that C2 lands under F1 before D7-A2.** If declined: C2 under `Plan: L1` after D7-A2. |
| `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx` | RIM, copy only (slice 2); **MDX journey `01P6GW…`'s open M4 request** (a per-row pathway door, `COORDINATION.md` holds table); **P-86 C3** edits the same branches | C2 | The same widening and ruling. Sequence M4, P-86 C3 and P-92 C2 through the coordinator: different parts of the file; whichever lands second rebases on a fresh fetch. |
| `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx` | unheld; outside D7's ledger paths | C2 | **Ask the coordinator for the hold** (one note function, beside `technicalRejectionNote`). |
| `client/src/concept2cure/v2/__tests__/dossierTransmissions.test.tsx`, `gatewayTransmittalsReadOnly.test.tsx` | unheld | C2 tests | With their surfaces' holds. |
| `As2ReceiptUpload.tsx` | RIM, copy only (slice 2) | — | **Not touched** (A3 not reached, §1.8). |

### C1: the two signed acts, their precheck and their door on the server

- **Title:** "F1: a held FDA send is settled by a signed act, received or released (P-92)"
- **Trailers:** `Plan: F1`; `Completes: server/services/submission-service/submission-service.ts`;
  `Completes: server/services/submission-gateways/fda-esg-receipts.ts`; `Completes: server/routes/submissions.ts`.
- **Files:** those three, with the holds of §5.0.
  - `docs/runbooks/ectd-transmit-path.md`: an "A held send" section under §3. It gives the ways out, in order: FDA's
    verified MDN (recorded on Gateway transmittals, including one the platform already keeps), then the signed
    settlement. It adds read-only queries for rows H5/L, H5′, H7, H8 and for a send whose release FDA's receipt
    contradicts.
  - `docs/runbooks/fda-esg-production-uat.md`: **§5.4's status patch and §7's "Manual rollback" are retired on both
    spines**, under the record's "no settlement by an unsigned action" and "the removed rollback route stays removed".
    §9's acceptance of manual patches goes with them.
    - Replaced on the sequence spine by `settleHeldSend`, door `POST /api/submissions/sequences/:seqId/held-send/settle`,
      proven reachable by `dispatchHeldSend.test.tsx` and `held-send-settlement.pglite.test.ts`.
    - Recording FDA's own signed MDN stays on Gateway transmittals ("Record agency MDN", `ingestFdaAs2Receipt`).
    - Taking back a filing that went out wrong is a withdrawal sequence, sent from Submission Center (sequence type
      `'withdrawal'`, `server/routes/submissions.ts`), as the route's removing commit `6ef0ef121` says.
    - **On the package spine there is no signed settlement yet.** The runbook says so, names §7 item 12, and gives no
      SQL. WebTrader was retired in April 2025 (`fda-esg.ts:27-28`).
  - Evidence: `docs/evidence/D7-HELD-SEND-SETTLEMENT/2026-11-0x/README.md`. Its "What already exists" repeats §1,
    including the full-clone deletion searches (commands, depth, results; §1.7).
  - Tests.
- **Migration:** none (§2).
- **Needs:** slices 1 and 2 pushed, repair A pushed (same file), the holds of §5.0. The P-92 record is on origin and
  was re-read for this revision (§0).
- **Deletes:** no code. Two unsigned runbook procedures are retired, as above. Retiring them without a package-spine
  replacement is not a session's cleanup. It is the founder's decision, in the record's words ("no settlement by an
  unsigned action"; `docs/LAUNCH_DEFINITION_OF_DONE.md:1841-1842`). The commit message quotes it and names:
  - the replacements, by path;
  - the gate tests;
  - the full-clone history search for the runbooks' earlier settlement and ack machinery (§1.7: `esg_ack_poller.py`
    and its siblings, deleted in `87d13d7cd`; the rollback route, `6ef0ef121`).

  The coordinator is told before C1 (§8 Q8).
- **Red tests (saved red before the change):**
  - `server/services/submission-service/__tests__/held-send-settlement.pglite.test.ts` (new), on
    `_freeze-gate-fixture.ts` (slice 1's, now on origin) and the receipts harness. **Every fixture row is shaped as the
    gateway writes it**: an AS2 hold carries `metadata.as2 { messageId, mic, environment }`, and its `transmission_id`
    is set **different** from `as2.messageId` (the reply's identifier, H1); a finished attempt carries
    `error_message`; H7, H9-before-binding and H5′ carry no `metadata.as2`.
    - **T1** Received on Ack2: sequence `'sent'`, A kept; transmittal `ack2_received`, `heldSendSettlement` with
      `verified: false`, and `dispatchBinding`, `leafManifest`, `as2`, `error_message` unchanged; one `ECTD_TRANSMITTED`
      naming S (source `held-send-settlement`) and one `ECTD_HELD_SEND_SETTLED` naming T with `audit_logs.reason`;
      a transmit with S is refused; slice 1's fold lists A's leaves as on file.
    - **T2** Received on Ack3: sequence `'acknowledged'`, transmittal `ack3_received`.
    - **T3** Released: sequence `'pending'`, S and A null; transmittal `rejected`, never `rolled_back`; a transmit with
      S is refused (spent); a fresh transmit signature claims a new attempt A′, and the fold does not read A.
      **T3b** Released on an H5′ row (bound, `transport 'sftp'`, over 1 GiB, no `metadata.as2`): admitted, and its
      statement carries the over-size sentence and "no AS2 message was formed", never "can be sent again".
    - **T4** Each of E1–E8 refused with its sentence, the sequence and transmittal unchanged:
      - E1: not `'transmitting'`; a legacy claim (L), **fixtured as an SFTP row** (`transport 'sftp'`, `rejected`,
        `auth`, S and A null, no `dispatchBinding`), which pins H5's real behaviour: refused.
      - E2: no bound row (H8); two bound rows (throws); a non-FDA binding.
      - E3: staging.
      - E4, for **both** outcomes: `in_transit` with a verified positive `as2Receipt` (H2); `in_transit` with a
        verified negative one (H2′); `received`, verified (H4); `rejected` with a verified refusal (H3 signed). Each
        answers the one E4 sentence, and the precheck's `receiptUpload` is true.
      - E5: already settled; **an attempt still in progress**, for each outcome (`pending` and then `in_transit`, with
        no `error_message` and `updated_at` within the quiet period). The same rows once the clock passes the quiet
        period are admitted for release, and refused for received by E5b.
      - E5b, for received: `pending`; H7 (`rejected`/`gateway`, no `metadata.as2`); H9 before the binding
        (`in_transit`, no `metadata.as2`, past the quiet period); H5′; H3's 4xx arm (`rejected`, `http_status 403`).
        Release is admitted on each.
      - E6: a deleted, other-org, other-project or changed-hash document; a submission with no project; **a document
        whose `created_at` is earlier than the transmittal's `submitted_at`**; **a document already cited by
        `heldSendSettlement` on another attempt of the same sequence**, by id, and by a re-uploaded copy with the same
        `content_hash`. Admitted: the same document cited on **another sequence's** settlement.
      - E7: the wrong kind. E8: the creator signs; meaning `approval`.
    - **T5** Payload: another attempt, another transmittal, another document or hash, another outcome, and a statement
      altered by one character are each refused, and T is voided. **The identifier:** the precheck's `as2MessageId`,
      the statement, the sign payload's `statement` and `ECTD_HELD_SEND_SETTLED`'s details all carry
      `metadata.as2.messageId`, and none carries the row's `transmission_id`.
    - **T6** A race: a receipt upload settles first; the settlement is refused under the lock and T is voided. The
      reverse: the receipt answers `already-resolved` (Ack2 and Ack3) or `unreconciled` (release). **A live send:**
      `gw.transmit` is suspended after the `in_transit` write (`fda-esg.ts:773`) by a stubbed `postAs2` that waits on a
      latch. For each outcome, a settlement (precheck, and act with a valid signature) is refused with the in-progress
      sentence and changes nothing. Released, the attempt then completes, and the sequence and transmittal are as the
      gateway alone leaves them.
    - **T7** Late receipts.
      - After a release, a verified positive MDN answers 409 with the contradiction sentence. It is **kept**: it is
        appended to `as2ReceiptHistory` with `contradicts: 'not-received'`, and one `'transition'` audit row with
        `from = to` is written. `as2Receipt`, the status, `mdn_raw` and `heldSendSettlement` are unchanged.
      - The same bytes again answer the same 409 and write nothing.
      - `sequenceTransmitReadiness` then refuses with the resend sentence, and a transmit under a fresh signature is
        refused in `claimTransmitSlot` (`DISPATCH_BLOCKED`, its signature voided by P-23), with no claim and no
        transmittal row.
      - After a release, a verified negative MDN is recorded and moves no sequence.
      - After "received", a verified negative MDN answers 409 with its sentence and is kept the same way; the sequence
        stays filed.
    - **T8** The audit write fails: the sequence, the transmittal and `ECTD_TRANSMITTED` all roll back.
    - **T9** A repeated POST after success is refused, and T is not voided (it is spent).
    - **T10** Nothing writes `rolled_back`; the rollback route is still not served (the existing pins, run).
    - **T11** With `app.rls_enforce = 'on'` in the harness, the act still finds its transmittal and its document
      (tenant context is set).
  - `server/routes/__tests__/submissions-held-send-settlement.test.ts` (new, on
    `submissions-shadow-finding-disposition.test.ts`'s pattern): the precheck enum and refinement, the act's schema,
    `HELD_SEND_NOT_SETTLEABLE` → 409, an uncoded error → 500.
  - `server/services/submission-gateways/__tests__/fda-esg-receipts.pglite.test.ts`: the existing cases (slice 2's
    included) stay green after `spendTransmitSignature` moves and the contradiction branch is added; a receipt on a
    transmittal with no `heldSendSettlement` takes exactly today's path.
  - `server/services/ana/__tests__/ana-cannot-settle-held-send.test.ts` (new).
- **Mutations (each shown red on its own assertion, then restored byte for byte):**

  | Mutation | Goes red |
  |---|---|
  | Drop the (S, A) CAS on the sequence | T5 (other attempt), T6 |
  | The release does not write `ECTD_TRANSMITTED` for S | T3 "S cannot transmit again" |
  | The release writes `'sent'` or keeps A | T3 |
  | The statement is compared loosely (trimmed or prefix) | T5 (one character) |
  | The evidence is not re-read under the lock | T4 changed hash |
  | The project check is dropped from E6 | T4 other project |
  | Drop E3 | T4 staging |
  | **E4 reads the status only** (the first draft's rule) | T4 E4 `in_transit` + verified positive, `in_transit` + verified negative |
  | E4 refuses only not-received on `received` | T4 E4 `received` verified, for received |
  | **Drop E5's ended predicate** (b) | T4 E5 in progress; T6 live send |
  | E5's quiet period counts from `submitted_at` | T4 E5 in progress (`submitted_at` older than the quiet period, `updated_at` within it) |
  | **Drop E5b's binding check** | T4 E5b H7, H9 before the binding, H5′ |
  | Drop E5b's 4xx rule | T4 E5b 4xx arm |
  | Drop E5b's pending rule | T4 E5b `pending` |
  | **The statement reads `transmission_id`** | T5 identifier |
  | **Drop E6's `created_at` check** | T4 E6 earlier document |
  | E6's reuse check spans the organization | T4 E6 admitted other-sequence case |
  | Drop E6's reuse check | T4 E6 reused id, reused hash |
  | E2 filters `transport = 'as2'` | T3b (the H5′ release) |
  | **The contradicting receipt is refused before any write** (the first draft's 409) | T7 kept, audit row |
  | Drop `releasedSendReceivedRefusal` from `claimTransmitSlot` | T7 transmit refused |
  | Drop it from `sequenceTransmitReadiness` | T7 readiness refused |
  | The duplicate branch ignores `contradicts` | T7 same bytes again |
  | `ECTD_HELD_SEND_SETTLED` missing from the spent list | T9 |
  | Accept `approval` | T4 meaning |
  | Drop `setTenantContextTx` | T11 |
  | The transmittal is locked after the sequence | T6 (the receipt-first ordering test deadlocks or times out) |
- **What a person sees after C1 alone:** the held line reads "Transmit is not available: a send of this sequence is
  held. It was handed to the agency's gateway and no verified answer has settled it, so the agency may hold it; it is
  not sent again until the send is settled." That is why C1 is pushed with C2.

### C2: the door, in the Dispatch tab, and the record on both lists

- **Title:** "F1: settle a held FDA send from the Dispatch tab (P-92)"
- **Trailers:** `Plan: F1`; `Completes: client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`;
  `Completes: client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`;
  `Completes: client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx`.
- **Files:** those three and client tests. No new component file, no stylesheet, no D0-locked file, no layout change.
- **Migration:** none.
- **Needs:** C1; slice 2 pushed (its copy hold on `SubmissionSeqWorkspaces.tsx` and `SubmissionCenter.tsx`); **the
  coordinator's recorded ruling** that C2 lands under `Plan: F1` before D7-A2, with the holds widened beyond copy and
  `GatewayTransmittals.tsx` granted (§5.0, §8 Q9); and the coordinator's sequencing with the MDX journey's M4 request
  and P-86 C3 in `SubmissionCenter.tsx` (different parts of the file). Without the ruling, C2 is `Plan: L1` after
  D7-A2, and C1 waits with it.
- **`SubmissionSeqWorkspaces.tsx`:**
  - `GovernedKind` gains `'held-send-settlement'`; `GovernedPrecheck` gains `heldSend?`; a `SettlementRequest` type
    (`outcome`, `evidenceDocumentId`, `evidenceKind`, `documentLabel`).
  - `DispatchWorkspace`'s `onGoverned` gains a trailing `settlement?` argument; `PackageAndTransmit` and `TransmitPanel`
    gain `onSettle(req)`, wired as `onGoverned(seq, 'held-send-settlement', undefined, undefined, undefined, req)`.
  - In `TransmitPanel`, when `t.dispatchStatus === 'transmitting'`, directly under the held line:
    `<details className="pj-more" data-testid="held-send">` with `<summary>Settle the held send…</summary>`. A function
    in the same file, `HeldSendSettlement`, holds its states. On every open it asks
    `governed-precheck { step: 'held-send-settlement' }`; it keeps no answer across a close.
  - `DossierTransmissions`' row type gains `metadata.heldSendSettlement?` and reads `metadata.as2ReceiptHistory[].contradicts`; the row adds one clause after the existing
    ones (S9).
- **`SubmissionCenter.tsx`:** `GOVERNED_LABEL['held-send-settlement'] = 'Settling a held send'`, `GOVERNED_PAST = 'settled'`.
  `precheckRefusal` also returns the answer's `heldSend` (P-86 C3 makes the same change for `retirement`; whichever
  lands second rebases). `requestGoverned` puts `statement`, `sha256`, `transmittalId`, `attemptId` and `sentAt` in the
  flow; a cleared answer without them is unreadable. `runGoverned` re-asks the precheck and refuses when the statement
  differs from the one the dialog shows ("What you would state changed since this dialog opened. Nothing was signed;
  close it and open it again."), then signs with §3.1's payload. `ownAct['held-send-settlement'] = runSettlement`: it
  posts `{ signatureActionId, outcome }` and accepts success only on `settled === true && sequenceId === f.seq.id &&
  outcome === f.settlement.outcome`; any other answer throws the server's words; `finally` bumps `readinessBump`.
  The `EsignModal` branch for this kind:

  | Prop | Value |
  |---|---|
  | `action` | "Record sequence 0001 as received" / "Release sequence 0001's held send" |
  | `targetMeta` | `${regL(region)} · settles the held send of 3 November 2026; nothing is sent to FDA`, **without** the shared `ectd-sequence:` key |
  | `meanings`, `defaultMeaning` | `['responsibility']`, `'responsibility'` |
  | `renderMeaningDetails` | "By signing, you state:" and the statement as one quoted paragraph |
  | `signedRows` | `[{ label: 'FDA document', value: '<title>, version <n>' }, { label: 'Stated', value: statement }]` |
- **`GatewayTransmittals.tsx`:** `heldSendSettlementNote(t)` beside `technicalRejectionNote` (`:149-157`), same markup,
  rendered under the status (`:586`). Its row type gains `metadata.heldSendSettlement?` and reads `metadata.as2ReceiptHistory[].contradicts`. No control is added; the log
  stays read-only.
- **Words on screen, by state** (calm, factual; no record keys, enum values or signature ids):

  | State | What the person sees |
  |---|---|
  | S0 held, closed | The held line (C1's sentence after "Transmit is not available:"), then the closed disclosure "Settle the held send…". |
  | S1 reading | "Checking how this send can be settled…" (`role="status"`). |
  | S2 offered | "Sequence 0001 was sent to FDA on 3 November 2026 at 14:05 UTC, and the platform holds no verified answer from FDA to it." (True by E4: the precheck offers an outcome only when no verified answer is kept.) Then, only when `receiptUpload`: "If FDA's signed receipt (its MDN) for this send arrives, record it on Gateway transmittals with 'Record agency MDN', which checks FDA's signature on it." No upload control here (A3 is not reached, §1.8). Then: "Otherwise, settle it by signature, on FDA's own document added to this project's Vault." Two `btn ghost small` choices, each with one line under it: **"Record as received"** — "On FDA's Ack2 or Ack3 for this send. Sequence 0001 is then on file with FDA and is not sent again." **"Release as not received"** — "On FDA's written confirmation that this send did not arrive. Sequence 0001 can then be sent again, under a new signature." (For an over-size H5′ row the release line is the statement's: "…frees its record and its signature; sequence 0001 is larger than FDA's documented channel takes, so it cannot be sent again as it is.") |
  | S2a choosing | `VaultVersionPicker` (this project), label "Find FDA's document in this project's Vault". For received, "Which acknowledgement is it?" with two radios: "Ack2: FDA unpacked it and delivered it to the center" and "Ack3: the center's validation result". On a choice: "Checking this document…", then "By signing, you would state:" and the server's statement, quoted. For a release that statement carries the duplicate-filing risk. Then the sign button, `btn ghost small`: "Sign: record sequence 0001 as received" or "Sign: release sequence 0001's send". |
  | S3 not offered | The server's sentence (§3.2) as `role="note"`, no button. When only one outcome is refused, the other stays offered and the refused one shows its sentence in place of its button. |
  | S4 the creator | "You created sequence 0001, so you cannot sign this. Another person with signing authority signs it." No sign button; the Gateway transmittals sentence stays. |
  | S4b no signing authority | "Settling a held send by signature needs signing authority." No sign button; the Gateway transmittals sentence stays. |
  | S5 read failed | "How this send can be settled could not be checked. Close this and open it again to retry." Never "nothing to settle". |
  | S6 signing | The one signature dialog with the props above: reason, password, and the code when enrolled. |
  | S7 refused at the act | The server's sentence inline, ending "The signature given for this settlement of the held send is now void; sign again for a new attempt." |
  | S8 settled | The page notice: "Sequence 0001 is recorded as received by FDA, on its Ack2 kept in the Vault, signed by A. Signer (responsibility)." or "Sequence 0001's held send is released as not received, on FDA's written confirmation kept in the Vault, signed by A. Signer (responsibility). It can be sent again, under a new signature." No signature id. The panel re-reads: received shows "Transmit is not available: sequence was already transmitted …" (the filed line), released shows the transmit form again. |
  | S9 the two lists | `DossierTransmissions`: "… · recorded as received on FDA's Ack2, by signature, 4 November 2026" or "… · released as not received on FDA's written confirmation, by signature, 4 November 2026", after the kept `error_message`. Gateway transmittals: "recorded as received by signature · FDA's Ack2 · 4 November 2026" / "released as not received by signature · FDA's written confirmation · 4 November 2026" under the status. **When a kept history entry carries `contradicts`** (§3.3), both lists add one clause after it: "· FDA's signed receipt, kept 5 November 2026, shows it was received" or "· FDA's signed answer, kept 5 November 2026, refuses it". |
  | S10 resend held | When `releasedSendReceivedRefusal` answers, the transmit panel shows its sentence through the existing readiness refusal line, and no transmit form. |
  | S11 in progress | E5's in-progress sentence, as S3, with the time after which it can be settled. No button. |

  Keyboard: the `<summary>` is focusable and Enter opens it; a refusal at the click is shown inside the disclosure and
  receives focus. No motion is added.
- **Red tests:**
  - `client/src/concept2cure/v2/__tests__/dispatchHeldSend.test.tsx` (new, on `dispatchWorkspaceFreezeGate.test.tsx`'s
    pattern): S0–S9 render; the disclosure appears only for `'transmitting'`; the statement is one string from the
    precheck through `renderMeaningDetails`, `signedRows` and the sign payload; meanings are `['responsibility']`; a
    changed statement at sign time signs nothing; the sign POST then the act POST carry §3.1's bodies; a 200 that is
    not a settlement is not a success; no `/\b[a-z-]+:\d+\b/` and no signature or action id in the notice or the
    dialog's target line; the Gateway transmittals sentence appears only when `receiptUpload`; **no
    `As2ReceiptUpload` is mounted and no copy says "without a signature"**; S2's opening line is shown only with an
    offered outcome; S10 and S11 render the server's sentences.
  - `client/src/concept2cure/v2/__tests__/dossierTransmissions.test.tsx`: the two settlement clauses and the two
    contradiction clauses.
  - `client/src/concept2cure/v2/__tests__/gatewayTransmittalsReadOnly.test.tsx`: the note and the contradiction clause
    render; still no
    "Rollback" control and no new button.
  - `submissionCenterLifecycleQa.test.tsx` and `submissionCenterGovernedWorkspaces.test.tsx` unchanged and green.
- **Mutations:**

  | Mutation | Goes red |
  |---|---|
  | The client renders its own copy of the statement | one-string assertion |
  | Offer `approval` | meanings assertion |
  | Keep the `ectd-sequence:` key in this branch's `targetMeta` | no-key assertion |
  | Treat any 200 as settled | not-a-success assertion |
  | Sign without re-asking the precheck | changed-statement assertion |
  | Render the disclosure for any dispatch status | only-when-transmitting assertion |
- **Done** only when opened and used in the running app (RULE 4), on a local database seeded with a production-shaped
  held row by the pglite fixture's statements, never against FDA: both outcomes signed, the panel and both lists read
  after. The evidence carries screenshots of S0, S2, S2a (each outcome), S6, S8 and S9.

---

## 6. How P-92 composes with the work that lands first

| Work | Composition |
|---|---|
| **F1 slice 1** (guard stamps `dispatchBinding`, `leafManifest`; the fold reads the bound transmittal) | E2 reads the binding (FDA ESG rows carried it before slice 1, `fda-esg.ts:378`). "Received" keeps A, so the fold reads A's `leafManifest`, which is what was sent; a send held before slice 1 has none, and the fold falls back to compiles (`basis: 'compiles'`). The `\|\|` merge keeps both stamps. |
| **F1 slice 2** (staging is never a filing; staging post-wire failures release; production stays `'transmitting'` "until a receipt settles them") | P-92 is the second way out for exactly those production holds. E3 refuses staging. P-92 edits `resendRefusal`'s copy and `fda-esg-receipts.ts` only after slice 2 is pushed (its hold). |
| **Repairs A–C** | A and P-92 share `submission-service.ts` (one session, in order). B: P-92's precheck uses its own read, not `assessSequenceDispatchReadiness`. C: none. |
| **The receipt path** | A verified MDN stays the first way out (S2), recorded on Gateway transmittals; where the platform already keeps one, E4 sends the person there instead of to a signature. The two race on the transmittal lock and the `'transmitting'` CAS; the loser is refused. `spendTransmitSignature` is shared, not copied. A receipt that contradicts a settlement is kept, audited and answered 409 (§3.3); a receipt on a transmittal with no settlement takes exactly today's path. DP-81 part 2 (moving an earlier `as2Receipt` into history, not overwriting `mdn_raw`) commutes with this: P-92 writes neither `as2Receipt` nor `mdn_raw`, and its keep appends to `as2ReceiptHistory` only. |
| **The gateway's own writes** (`fda-esg.ts`, not in the record's two files) | Unchanged. E5's ended predicate keeps a settlement off a live attempt. Beyond the quiet period the residual is named, with two candidate fixes outside these files (§7 item 13). |
| **P-86** (retire an unfiled sequence; not yet built) | P-86 check 2b refuses `'transmitting'`. **P-92 settles first.** Received → filed, so P-86 check 2a refuses. Released → `'pending'`, but its production transmittal stays bound and `ECTD_TRANSMITTED` names production, so P-86 checks 3 and 4 refuse. **So a released sequence of 1 GiB or less is sent again, never retired.** A released one over 1 GiB (H5′) can be neither sent (P-93) nor retired (check 3), and is stranded: P-93 design §9 question 2, §8 Q4 here. A pre-binding hold (L, H5 among them) is refused by P-92 at E1, by P-86 at check 2b, and by the receipt path, so **no signed or verified way out exists for it**. P-93's design says "P-92's signed act is the only way out" for those rows (`p93-sequence-size-limit-retire-sftp.design.md:618-623`, `:676-680`); that is wrong, and the P-93 lane is told (§8 Q11). Check 2b's sentence names the settlement once both exist ("Settle the held send from the Dispatch tab, or record FDA's signed receipt"), in whichever lands second, wherever the coordinator's 01:19 ruling places P-86's rules. Shared edits, whichever lands first adds and the second rebases: `SequenceSignatureIntent`, `INTENT_LABEL`, `INTENT_MEANING_REFUSAL`, `signatureSpentBy`'s list, `SubmissionErrorCode`, `precheckGovernedStep`, `applySequenceChangeWithAudit`'s `reason`, `governedPrecheckSchema`; client `GovernedKind`, `GOVERNED_LABEL`/`PAST`, `precheckRefusal`'s extra return, `ownAct`, the `EsignModal` branches, `DossierTransmissions`. P-86's G2 guard (refusing a removal while `'transmitting'`) is consistent. |
| **P-93** (over 1 GiB out of scope; `transmitViaSftp` and `ssh2-sftp-client` retired) | No new SFTP hold can occur once P-93 lands. **Two kinds of existing SFTP hold, corrected** (§9.1 finding 7). (a) H5, before 2026-09-23: every one is L, so P-92 refuses it at E1, and P-93's removing commit must not name P-92 as its remedy (§8 Q11). (b) H5′, bound, after 2026-10-14: E2 has no transport filter, so it is releasable on FDA's letter. Its statement says it cannot be sent again as it is, and it stays stranded under P-86 check 3 (§8 Q4). P-93 never measures a held send (`resendRefusal` comes first). After a release of 1 GiB or less its size check passes. The over-size statement reads P-93's one size constant once P-93 lands. Both edit `docs/runbooks/fda-esg-production-uat.md` (P-93 §8; P-92 retires §5.4 and §7): sequence them in RIM's one session. |
| **P-94** (an unapproved onboarding leaf is refused at readiness and transmit) | No shared rule. After a release, the re-send is judged by P-94's refusal like any send. |
| **Filing order at transmit** (D7 record item 1, RIM's, not yet built) | After a release, the re-send is judged by it once it lands. P-92 does not judge filing order at the release (§9 A9). |

---

## 7. Owed, and named (not fixed by P-92)

1. **A1: the signer is told the truth at hold time.** `runTransmit` says "Request failed. Nothing was sent." for the
   very send P-92 settles (`SubmissionCenter.tsx:914`; `GatewayError` has no `code`, so `fail()` answers 500). A
   separate F1 repair (RIM; `routes/submissions.ts`, `SubmissionCenter.tsx`), with the §1.8 correction: answer the
   gateway's own sentence, `OUTCOME_UNKNOWN` only for the delivered-unconfirmed arm. Recommended before C2.
2. **A2** (others are told) and **A4** (`LatestSequence.dispatchStatus` for D3's Submit step), as the D7 record says.
3. **Held with nothing sent** (H5′, H7, H8, H9 on `pending` or before the binding): the platform's own record proves
   no byte left. E5b now refuses "received" on each, but a release still asks for FDA's letter (§8 Q3). F1
   candidates: `createTransmittalRow` inside the `try` or marked pre-wire; `readVerifiedBundle`'s refusals inside the
   gateway carrying `NOTHING_TRANSMITTED` when no connection was opened. (H5 is L: item 15.)
4. **H3's HTTP 4xx refusal** leaves the sequence `'transmitting'` although FDA's endpoint answered and refused. An F1
   candidate: record it `'rejected'` at the post-wire write, as a verified refusal is by upload (§8 Q6).
5. **Legacy claims (L)** cannot be settled by P-92 ("never infer a binding"). The runbook query (C1) shows whether any
   exist; D7 records that no real sequence has reached FDA, and the GA evidence shows FDA ESG unconfigured, so zero is
   expected but not proven.
6. **The sequence spine has no technical-rejection act** (a failed Ack3). A sequence recorded as received on Ack2
   whose Ack3 later fails stays filed (§8 Q2).
7. **The Vault side of the link.** `vault-where-used.ts` does not list a document cited by a signed act (this one's or
   the technical rejection's), and nothing stops a later soft delete of it. Owed to the Vault package (D6 layout through
   the coordinator): the read of `heldSendSettlement`/`technicalRejection` evidence ids, a "Used as FDA evidence for …"
   line, and a guard (a trigger, so a migration) refusing a soft delete of a cited document. A record guard on
   transmittal metadata is already owed to S5 by slice 1.
8. **Which record wins when FDA's verified answer contradicts a signed settlement** (revised, §9.1 finding 5). P-92
   now keeps the receipt, audits it, shows it on both lists and holds a resend after a contradicted release. It does
   not re-open either settlement. That is the founder's question (§8 Q7). The first draft deferred keeping the bytes to
   DP-81 part 2, which never touches the 409 path (`docs/evidence/W5/2026-11-01/README.md:89-92`); that deferral was
   wrong and is withdrawn.
9. **Non-FDA held sends (H10)** have no way out.
10. **An SFTP deposit reads as filed on deposit** (`toDispatchStatus('in_transit')` is `'sent'`, H6). P-93 retires the
    path; the runbook query belongs to P-93.
11. `rollbackTransmittal` and its types are unreachable (an R1/F1 question with its own history search);
    `TransmitFacts` prints the raw "Dispatch status" (`:1835`, D7-A2 copy); the technical rejection asks for a typed
    UUID (`GatewayTransmittals.tsx:128-131`, an F1 copy repair onto `VaultVersionPicker`); the sibling notices print
    signature ids (`SubmissionCenter.tsx:888`, `:920`, `:939`, `:960`). P-92 adds none of these and fixes none.
12. **Package-spine held sends have no settlement** once the runbook's unsigned SQL is retired (C1). The package spine
    is still reachable in production through AnA's `k510_workflow.transmit` (`server/services/ana-ri/mdx-command-handlers.ts:725-830`, through
    `executeGovernedTransmit` with a `packageId`; P-86 design §1.4). A post-wire failure there leaves its transmittal in
    `sub_trans_active_lock_idx`. A signed settlement on that spine would complete `filed-sequence-rejection.ts`'s
    pattern (`packageOfTransmittal`, `readEvidence`). It is owed, and put to the coordinator (§8 Q8): extend P-92 to the
    package spine under F1, or record that the spine is retired from production first.
13. **The race beyond the quiet period.** E5's 24-hour quiet period is a bound, not a proof. A POST still running after
    it would let a settlement commit, and the gateway's unconditional writes (`updateTransmittal`,
    `fda-esg.ts:417-418`) would then overwrite the settled status. Two candidate F1 repairs close it, both in files
    outside the record's two, so neither is taken here:
    - `updateTransmittal` refuses to write over a row carrying `heldSendSettlement`
      (`AND NOT (metadata ? 'heldSendSettlement')`, with a zero-row write recorded as the gateway's own error);
    - a total deadline on the AS2 POST in `as2-transport.ts`, which makes the quiet period a proof.

    Put to the coordinator (§8 Q9).
14. **A3, a receipt door on the Dispatch tab** (D7 record), stays its own F1 item. It is not reached by P-92 (§1.8). It
    includes recording a verified receipt the platform already keeps (H2, H2′, H4) without a download and re-upload.
15. **Pre-binding holds (L, H5 among them) have no way out at all**: no receipt (the SFTP rows), P-92 refuses them
    (E1, "never infer a binding"), and P-86 check 2b refuses `'transmitting'`. The C1 runbook query counts them on each
    deployed database. Zero is expected (D7 records no real FDA send; FDA ESG is unconfigured in the GA evidence) but
    not proven. The decision does not settle the case: founder, through the coordinator (§8 Q11).

---

## 8. Questions back (only where the decision does not settle it)

- **Q1 (coordinator). Closed.** The record is on origin and quoted in §0. It requires "the agency's document retained
  in Vault and linked to the act", not the document's hash in the e-signature's own binding, so §9 A1 stays rejected.
- **Q2 (founder).** A failed Ack3 on the sequence spine. May "recorded as received" rest on an Ack2 when the Ack3 later
  reports a failure, and what records that technical rejection on a sequence? Today nothing does (§7 item 6). This
  design binds the Ack3 statement to "that result accepts it", so a failed Ack3 cannot be used to record receipt.
- **Q3 (founder).** "No settlement without the agency document" applied to sends the platform's own record proves never
  left (H5′, H7, H8, H9 on `pending` or before the binding). The decision's words require FDA's letter for a release,
  and this design asks for it. E5b already refuses "received" on these rows. The P-93 map names the burden: asking FDA to
  confirm non-receipt of something never sent. Is a narrower path wanted? (H5 itself is L: Q11.)
- **Q4 (coordinator, with P-93 §9 question 2).** A released sequence is never retirable under P-86 (its production
  send stays bound). Is that the reading of P-86's record ("no production send is bound to it")?
  - A released sequence of 1 GiB or less can be sent again. If it has a content defect, the only way on is to send it
    and correct it in a later sequence.
  - A released sequence over 1 GiB (H5′) can be neither sent (P-93) nor retired (P-86 check 3), and its number blocks a
    replacement (`filingOrderRefusal`). The release statement says it cannot be sent again as it is. The stranding
    itself is P-93's question 2 and needs the same answer.
- **Q5 (coordinator).** Sequences held on staging before slice 2 are refused by E3, and slice 2 does not touch existing
  rows. Recommended: slice 2's runbook query covers them, and a person applies slice 2's release rule once.
- **Q6 (coordinator).** H3's 4xx arm (§7 item 4): an F1 repair, or left to P-92's release on FDA's letter?
- **Q7 (founder; new in revision).** A verified FDA answer that contradicts a signed settlement: FDA's signed receipt
  after a release, or FDA's signed refusal after "recorded as received". Which record wins?
  - P-92's record does not say.
  - This design keeps FDA's answer beside the signed record, audits it and shows it on both lists. After a contradicted
    release it refuses any resend of the sequence. It changes neither settlement.
  - Recommended: FDA's verified answer wins, by a second signed act that re-opens the settlement, with the verified
    receipt as its evidence.
- **Q8 (coordinator; new).** Package-spine held sends (§7 item 12). The record forbids an unsigned settlement, so C1
  retires the runbook's SQL on that spine too. Should P-92's act be extended to the package spine under F1 (completing
  `filed-sequence-rejection.ts`'s pattern), or is the package spine first retired from production (AnA's
  `k510_workflow.transmit`)? Until then a package-spine hold has no way out. That is fail closed, and the coordinator
  should know it before C1.
- **Q9 (coordinator; new).** Holds and timing (§5.0):
  - the hold on `server/routes/submissions.ts`, beside P-86's;
  - the hold on `GatewayTransmittals.tsx`;
  - widening RIM's copy-only holds on `SubmissionSeqWorkspaces.tsx` and `SubmissionCenter.tsx`;
  - a recorded ruling that C2 lands under `Plan: F1` before D7-A2. If the ruling is declined, C2 goes under L1 after
    D7-A2, and C1 waits with it;
  - sequencing with M4 and P-86 C3;
  - the two candidate repairs of §7 item 13, both outside RIM's files.
- **Q10 (coordinator; new).** Confirm that recording FDA's own signed MDN (`ingestFdaAs2Receipt`, verified against the
  pinned certificate and the MIC) is outside "no settlement by an unsigned action". This design reads it as FDA's
  signed answer, not a person's unsigned act (the founder's question was framed as "no signed MDN came back",
  `docs/evidence/W5/2026-11-01/README.md:114-121`). If the coordinator reads it otherwise, the receipt path itself needs
  a founder decision. That is beyond P-92 and stops C1.
- **Q11 (founder, through the coordinator; new).** Pre-binding holds (L), every pre-2026-09-23 SFTP hold (H5) among
  them, have no way out: no receipt, P-92 refuses them ("never infer a binding"), and P-86 check 2b refuses them.
  - Is a narrower path wanted? For example, a signed act that names the transmittal explicitly, on FDA's letter.
  - Expected count: zero.
  - The P-93 lane is told now that **P-93's removing commit must not name P-92 as the remedy for those rows**
    (`p93-sequence-size-limit-retire-sftp.design.md:618-623`, `:676-680`).

---

## 9. Critique and resolution

| # | Alternative or risk | Resolution |
|---|---|---|
| A1 | **The technical rejection's composition** (route `verifyReauth` + `recordGovernedAction('sign')` + `persistGovernedActionSignature` binding the document as `VAULT_DOCUMENT_VERSION`) | Rejected as the default. It binds the hash directly, but it is a second ceremony on `ectd-sequence:<id>` outside Gate 1: no one-use ledger, no P-23 void, no leaf binding, no independence at the act, and a second client path beside `runGoverned`. The chain covers the hash through the ledger. The record (§0) does not require the direct binding, so Q1 is closed and this stays rejected. |
| A2 | Reinstate the rollback route, or write `rolled_back` | Forbidden by P-92, contradicts the agency's record, and never released a sequence anyway. |
| A3 | New status tokens (`not_received`, `held`) or columns | A migration and tokens no reader knows. Existing tokens plus `metadata.heldSendSettlement` say it; every filed reader is an allow-list. |
| A4 | Parse Ack2/Ack3, or match the document's text to the Message-ID | No format in any FDA source on file; a guess would be a fabricated rule, and RULE 6 forbids a new parser. The deleted Python poller (`esg_ack_poller.py`, `87d13d7cd`, §1.7) read `//submissionStatus` from an ACK2 file, but it cites no FDA source and was deleted with its model, so it is no format on file and is not restored. The statement shows our AS2 Message-ID (`metadata.as2.messageId`) so the signer can match it; the record says "attested, not verified". |
| A5 | An inbound AS2 receiver for async ACK2/ACK3 | A new integration (RULE 6). |
| A6 | The door on Gateway transmittals beside the technical rejection | That screen is the organization's read-only log; a settlement is the sequence's act and moves the sequence. One door, on the Dispatch tab; the log gains only a note, as for the technical rejection. |
| A7 | Two intents and two audit actions | Equivalent in safety; P-35's one intent with a discriminator is the precedent and keeps one spent-list entry. |
| A8 | Void S on release (P-23) | S's act was performed (it reached the gateway). It is spent by `ECTD_TRANSMITTED`, not voided. |
| A9 | Refuse a release while a later sequence is filed or in flight (the map's E8) | Rejected. It narrows the decision and would strand the sequence for good (no re-send, no retirement). Filing order belongs to the re-send, through the transmit's own rule (D7 record item 1). |
| A10 | Overwrite `error_message` with the settlement | Rejected. The column is the only record of the held state's words; it is kept, and both lists print the settlement from metadata after it. |
| A11 | Set `ack_received_at` | Rejected. It is when an agency acknowledgement was received; the settlement's time is not FDA's. The Vault holds FDA's document; the log's "ACK" download stays disabled for these rows. |
| A12 | Require the Vault document type `CORRESPONDENCE` | Rejected. It is metadata the person sets, so it adds a refusal and no integrity; the signer attests what the document is, and the hash pins it. |
| A13 | Infer a legacy claim's transmittal by number and project | Rejected: `migrations/20261014_ectd_transmit_attempt_binding.sql` says "never infer a binding". Named (§7 item 5). |
| A14 | A new `held-send-settlement.ts` beside the service | Rejected: the coordinator's ruling for P-86 (no new service file). The rules sit in `fda-esg-receipts.ts`, beside the reconciliation that already settles held sends. |
| A15 | Fold A1 (the truthful hold-time message) into P-92 | Not needed by the decision; a separate F1 repair, recommended before C2 (§7 item 1). |
| A16 | Defer the door to D7-A2, as P-86 does | Put to the coordinator, not decided here (§4, §8 Q9). If declined, C2 goes under L1 after D7-A2 and C1 waits with it. |
| A17 | Accept a late positive MDN after a release as a status change (flip the transmittal back to `received`) | Still rejected: it would re-open a signed release by an upload and put `received` beside a `'pending'` sequence. **Revised:** the receipt is no longer thrown away. It is kept in `as2ReceiptHistory` with `contradicts`, audited, and shown on both lists, and the resend is held (§3.3). Which record wins is §8 Q7. |
| A18 | Let AnA propose or perform the settlement | A chat turn cannot collect a password (`ana-cannot-sign`). Pinned out like P-34 and P-35. |
| A19 | Add `settle` to `GOVERNED_VERB_PATTERN` | Not needed: no surface action reaches the act, and the AnA source scan pins it. |
| R1 | **Risk: the signer attaches an Ack for another send.** | The statement names the sequence, the send's time and **our** AS2 Message-ID (`metadata.as2.messageId`, never `transmission_id`; §3.4). "Received" is refused unless the platform's record shows an AS2 message left and FDA's endpoint did not refuse it at the time (E5b). The document must be in this project's Vault, added after this send was made, and not already used to settle another send of the sequence (E6). The residual risk is the attestation's, and the record says so. |
| R2 | **Risk: a settlement races a receipt upload, or the live send itself.** | Both take the transmittal lock first; the `'transmitting'` CAS on (S, A) decides; the loser is refused and its T voided (T6). A send still on the wire is refused by E5's ended predicate (T6 live send). The residual beyond the quiet period is §7 item 13. |
| R3 | **Risk: RLS enforcement turns the act into zero-row refusals.** | `setTenantContextTx` first in `underLock`; T11 runs with enforcement on. |
| R4 | **Risk: S authorizes a second send after a release.** | S is spent in the release's own transaction (T3); a fresh transmit needs a fresh signature. |
| R5 | **Risk: a released sequence lands at FDA twice.** | The risk is stated in words before signing, bound in the signature, and repeated in the audit row. The release needs FDA's written confirmation and is refused while the platform keeps FDA's verified answer (E4). A late verified positive MDN is kept, and **the resend is refused** at readiness and at the claim (T7). |
| R6 | **Risk: the unsigned runbook steps outlive the decision.** | Retired on both spines in C1. The package-spine gap is named (§7 item 12, §8 Q8), not filled with SQL. |

### 9.1 Review findings of 2026-11-02, and how each was resolved

Ten findings survived the review's skeptics. Each was re-checked against `origin/concept2cure-v2` at `ffd2bd772`
(the cited lines of `fda-esg.ts`, `fda-esg-receipts.ts` and `submission-service.ts` are unchanged since `72f2a942d`),
and against the full-history clone for finding 10. None was rejected outright. Three are applied with a narrowing
that the code supports, and the narrowing is stated in the row.

| # | Finding (severity) | Resolution | Where in this design |
|---|---|---|---|
| 1 | E4 checks only the status column, so a release, or a "received", can be signed against FDA's verified MDN that the platform already holds (major) | **Applied.** Confirmed in code: `as2Receipt` with `verified: true` is written at `fda-esg.ts:837`, on its own statement, before the `'received'` status write at `:856-860`. A failed status write (catch `:867` → `recordDeliveredUnconfirmed` `:563-571`) or a crash leaves `in_transit` with the verified receipt, and the claim stands. E4 now reads `status = 'received'` **or** `as2Receipt.verified === true` and refuses both outcomes, with one sentence that sends the person to "Record agency MDN" (which already moves `in_transit` to received or rejected, and is not a duplicate because `writeAs2Metadata` never adds to `as2ReceiptHistory`). `receiptUpload` is true there. S2's opening line is true by construction. **Narrowed, as the skeptic found:** (a) the mirror case (verified refusal, row `in_transit`) arises from a crash between `:837` and `:841` or two failed writes, not from one failed `'rejected'` write, because `sent` is nulled at `:840` (H2′); (b) on H4 a signed "received" would not have overwritten `as2Receipt` (§3.3 leaves it untouched). H4 is refused anyway, because a kept verified answer is not a send for which "no signed MDN came back" (§0). | §0 clause table and reconciliation 3; §1.1 H2, H2′; §3.2 E4; precheck `receiptUpload`; C1 T4 (four E4 cases), mutations "E4 reads the status only", "E4 refuses only not-received on received"; C2 S2. |
| 2 | Nothing separates a held send from one still on the wire, so a settlement can land mid-send and the gateway then overwrites it (major) | **Applied.** Confirmed: the claim is stamped before assembly (`submission-service.ts:2793`); the row is `pending` with `dispatchBinding` and `environment` already set (`fda-esg.ts:360-381`), then `in_transit` (`:773`); the POST has only an idle timeout (`as2-transport.ts:694`, `:726`); `updateTransmittal` is unconditional (`:417-418`). E5 gains the ended predicate (terminal status, or `error_message IS NOT NULL`, which every post-wire failure writer sets, or a 24-hour quiet period since `updated_at`), in the precheck and under the lock, with the in-progress sentence. **Stated limit:** the quiet period is a bound, not a proof (`writeAs2Metadata` does not touch `updated_at`), so the residual and two candidate repairs outside the record's files are named, not hidden. The skeptic's note that no genuine FDA document can exist for a live send is recorded: the race needs a wrong attestation, and the old S2 wording invited one. | §1.1 "While the attempt runs"; §3.2 E5 and "The order of the rules"; §3.3 step 3; C1 T4 E5, T6 live send, mutations "Drop E5's ended predicate", "quiet period counts from `submitted_at`"; C2 S11; §7 item 13; R2. |
| 3 | "Recorded as received" is accepted for an attempt the platform's own record proves never left (major) | **Applied.** Confirmed: on AS2 the binding `metadata.as2` is written before any byte (`fda-esg.ts:821`), its write failure carries `NOTHING_TRANSMITTED` (`:695`), and `writeAs2Metadata` and `dispatchBinding` share their introducing commit `e1f3fd425` (not a shallow boundary). H7 (`readVerifiedBundle`, `:811`, a `ValidationError` without the proof) and H9 before the binding have no `metadata.as2`, yet passed the old E1–E7. New E5b: received requires `transport = 'as2'`, a binding through `bindingOf`, a status other than `pending`, and not a 4xx refusal at send time. **The 4xx part is kept, with its own sentence:** a 4xx means FDA's AS2 endpoint (or a proxy before it) refused the message, so FDA never unpacked it, and no Ack2 can follow. That holds whether or not the 4xx was FDA's. Release stays offered on each. | §1.1 "What the row's own record proves", H7, H9; §3.2 E5b; C1 T4 E5b, mutations "Drop E5b's binding check", "4xx rule", "pending rule"; §7 item 3; R1. |
| 4 | The signed statement's "AS2 message ID" comes from `transmission_id`, which usually is not the send's AS2 Message-ID (major) | **Applied.** Confirmed: `transmission_id` is the reply's `Message-ID` (`as2-transport.ts:893`, `fda-esg.ts:569`), the MDN's own (`as2-transport.ts:939`, `fda-esg.ts:851-857`), or unset for H3 (`fda-esg.ts:485-490`; only `fda-esg-receipts.ts:88` fills ours in). `heldSendStatement` and the precheck's `as2MessageId` (renamed from `transmissionId`) now read `metadata.as2.messageId` through `bindingOf`. A release without a binding says "no AS2 message was formed for this send". | §1.1 H1, H3, H4 and "What the row's own record proves"; §3.4; precheck answer; C1 fixture note, T5 identifier, mutation "The statement reads `transmission_id`"; §9 A4, R1. |
| 5 | A verified MDN that contradicts a settlement is refused with 409 and thrown away, and the contradicted record stays in place (major) | **Applied, in full.** Confirmed: `nextReceiptStatus` throws (`fda-esg-receipts.ts:59`) before the only writes (`:86-92`); after a release, `resendRefusal`, the claim CAS (`submission-service.ts:2472`) and `findActiveTransmittal` (`fda-esg.ts:1202`) all let a second send through. The first draft's deferral to DP-81 part 2 was wrong (that item never touches the 409 path). Now a contradicting verified receipt is kept in `as2ReceiptHistory` with `contradicts`, audited with the existing `'transition'` row (`from = to`), committed, then answered 409. Its duplicate is answered the same way. `releasedSendReceivedRefusal` holds the resend in `sequenceTransmitReadiness` and in `claimTransmitSlot`. The "received, then refused" case is no longer called closed: kept the same way, and put to the founder (§8 Q7). All in existing files, and none is a new route, service or table. | §3.3 late receipts; §3.7 both rows; C1 T7, mutations (contradiction keep, both resend holds, duplicate branch); C2 S9, S10; §7 item 8; §8 Q7; §9 A17, R5. |
| 6 | E6 accepts any live Vault version in the project, including one that predates the send or already settled another attempt (minor) | **Applied, narrowed as the skeptic showed.** E6 refuses a document whose `created_at` is earlier than the transmittal's `submitted_at` (both database-clock; `submitted_at` set at creation, before any byte, `migrations/20260509_submission_gateways.sql:39`; `created_at` record-immutable, `migrations/20260926_vault_documents_record_immutability.sql:135-136`; one read of the row, no migration). The reuse check is limited to **other transmittals bound to the same sequence**, by id or `content_hash`. Organization-wide reuse is rejected because it would refuse one genuine FDA letter that confirms non-receipt of two held sends of different sequences. Within one sequence no genuine reuse exists: a letter for A predates A′, so it cannot cover A′. The "indexed" citation in the finding is irrelevant (a partial index on another predicate) and is not relied on. | §3.2 E6 and its sentence; §3.3 step 3; C1 T4 E6 (earlier document, reused id, reused hash, admitted other-sequence case), mutations "Drop E6's `created_at` check", "reuse check spans the organization", "Drop E6's reuse check"; R1. |
| 7 | H5 (SFTP holds) cannot be settled by P-92: every SFTP hold is a legacy claim that E1 refuses, yet P-92 and P-93's design both name P-92 as its way out (major) | **Applied, with the skeptic's correction.** Confirmed: since 2026-09-23 both SFTP refusals release the claim (`index.ts:171-189`), and S/A arrived only on 2026-10-14, so every pre-2026-09-23 SFTP hold is L, refused at E1. H5 is restated as a subset of L. "So H5 is covered" is struck, and so are T4's H5 case and §6's P-93 row. **Not applied as written:** the finding's "drop the E2-filters-as2 mutation". Bound SFTP-transport holds after 2026-10-14 do exist (H5′: `readVerifiedBundle` in the SFTP branch, `fda-esg.ts:782`, or an unmarked failure), so E2 keeps no transport filter, and the mutation now goes red on T3b, an H5′ release. T4's L case is fixtured as an SFTP row, which pins the real refusal. The release statement no longer promises a re-send of an over-size sequence. The coordinator and the P-93 lane are told that pre-binding strandings have no way out (§8 Q11), and that P-93's removing commit must not name P-92 as their remedy. | §1.1 H5, H5′, L; §3.2 E2; §3.4 over-size statement; C1 T3b, T4 E1, mutation "E2 filters `transport = 'as2'`"; §6 P-86 and P-93 rows; §7 items 3, 15; §8 Q3, Q4, Q11. |
| 8 | The founder's record has landed, but §0 still worked from the summary; its clause "no settlement by an unsigned action" was not honoured (major) | **Applied.** §0 quotes `docs/LAUNCH_DEFINITION_OF_DONE.md:1828-1843` whole and reconciles it with the summary. Q1 is closed. (a) The runbook's §5.4 status patch and §7 "Manual rollback" are retired on **both** spines in C1. The first draft kept them for the package spine "which production refuses", which is half true: AnA's `k510_workflow.transmit` reaches `executeGovernedTransmit` with a `packageId` in production (`server/services/ana-ri/mdx-command-handlers.ts:725-830`; P-86 design §1.4). Package-spine holds are then owed and put to the coordinator (§7 item 12, §8 Q8), never filled with SQL. (b) A3's upload reach is dropped from C2, and no copy says a send is settled "without a signature". The disclosure says where FDA's signed MDN is recorded. The coordinator is asked to confirm that the verified ingest is outside the clause (§8 Q10). (The finding's "the removed rollback route's effect" is loose: the route wrote `rolled_back`, the runbook writes `rejected`. Both are unsigned settlements, and the conclusion stands.) | §0; §1.2 runbook bullet; §1.8 A3; §2 RULE 5/6; C1 files and deletes; C2 S2, S4, S4b, tests; §7 items 12, 14; §8 Q1, Q8, Q10; R6. |
| 9 | No file-and-holder table, and C2 adds UI to a D7-spec file under Plan F1 beyond the "copy only" hold, with no coordinator ruling (minor) | **Applied.** §5.0 lists every file, its holder on `ffd2bd772`, its commit and the action, in P-86's format. The record's owner line is quoted. §4 no longer decides "not deferred" on its own argument: it proposes and asks for a recorded ruling, and gives the fallback (C2 under `Plan: L1` after D7-A2, with C1 waiting). The holds asked for are `submissions.ts`, `GatewayTransmittals.tsx` and the widening of the two Submission Center holds. **Noted from the skeptic:** only `fda-esg-production-uat.md` is shared with P-93; COORDINATION's "behaviour, never layout" rule is written for S packages, not F1, so the ask is about holds and timing, not that rule; and the coordinator has already filed P-92 under F1. | §2; §4; §5.0; C2 Needs; §8 Q9; §9 A16. |
| 10 | The RULE 3 deletion searches ran on a shallow clone, so "0 deletions" is not evidence (minor) | **Applied.** The searches were re-run in a blobless full clone in the scratchpad (17,399 commits, back to 2025-11-20), with `--full-history` and case-insensitive patterns. The shared clone was never unshallowed. They found what the shallow clone hid: `esg_ack_poller.py` and its Python siblings (`87d13d7cd`, 2026-03-25), earlier ESG submitters (`b6e991501`, `e1dca6e3d`, `83fa7f6cf`, `c6d7295a8`, `89c83f58a`), and the old transmittal list (`2895218b8`). Each is recorded with its bearing; none was a signed settlement, so the conclusion holds and is now evidenced. The rollback route's real removing commit is `6ef0ef121` (parent `9246389d6`), not `a811b0d83` (a shallow boundary), and its diff is readable there. The evidence README repeats the commands, the depth and the results. | Header "Trees read"; §1.2 history search; §1.7; C1 evidence and deletes; §9 A4. |

---

## 10. Answers since this design (appended 2026-11-09)

The questions of §8 are answered. The coordinator's answers are coordination, not founder decisions; the founder's are
recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md` under P-108. Where an answer changes this design, §10.3 says how; the
re-cut that applies them is recorded there, with the tree it was checked against.

### 10.1 The coordinating session's answers, 2026-11-08

- **Q10 (its C2): confirmed.** FDA's own signed MDN, verified against the pinned certificate and the MIC, is the
  agency's signed answer. It is outside "no settlement by an unsigned action".
- **Q5 (C3): yes.** Slice 2's runbook query finds the staging holds, and a person applies slice 2's release rule once.
- **Q6 (C4): yes, with a condition.** H3's 4xx arm is recorded as a *transport refusal*, never as the agency's
  rejection, and only when the TLS peer was the configured, pinned endpoint. The status line and the body's digest are
  kept as evidence, and a resend is allowed. If the peer is not proven, the sequence stays in transit, for P-92's act.
  F1, after slice 2: a repair of its own, not one of P-92's commits.
- **Q8 (C5): P-92 is not extended to the package spine.** P-103 (founder, 2026-11-05) retired the
  `/api/submission-ops/packages/*` path, so the sequence is the one filing path. A package-spine held send goes to the
  runbook's escalation; the expected count is zero. The deployed count query is added beside P-92's.
- **Q9 (C6): holds granted** on `server/routes/submissions.ts` and `GatewayTransmittals.tsx` while P-92 is built.
  **C2's held-send disclosure lands under F1 now, not after D7-A2:** an unannounced held send is an honesty defect. It is
  one quiet line and a door made of existing components (the AnswerLead or note pattern, no new card). Both files are
  RIM's, so the order inside them is RIM's.
- **C9: the order is accepted:** slice 2, (b), A, P-93, P-94, P-86, P-92 with P-99, then P-96. Shared helpers land with
  the first commit that needs them; P-93's runbook edit comes before P-92's. `AnaToolDefinitions.ts` and the AnA
  executor sit inside the Anna-runtime epic, which P-105 gives to `01KZK3…` alone: P-92 edits neither (its AnA pin is a
  test that reads them).

### 10.2 The founder's answers: P-108, 2026-11-08 ("Accept all three" and "Accept all three")

- **1(a), Q2.** Once an Ack3 has arrived, "received" needs the Ack3 to accept. A failed Ack3 after an Ack2 is recorded as
  a technical rejection, which means completing `filed-sequence-rejection.ts` for the sequence spine, under F1.
- **1(b), Q3. Amends P-92.** For a send the platform's own record proves never left (no message formed, refused before
  the wire), a signed release cites that proof, not FDA's written confirmation of non-receipt, since FDA cannot confirm
  a send it never got.
- **1(c), Q7.** If FDA's verified answer later contradicts a signed settlement, FDA's answer wins, through a second
  signed act that re-opens it. Both records are kept, and resends are refused meanwhile.
- **2(a), Q4.** A production attempt that records nothing reached FDA (released as not received on FDA's written
  confirmation, or refused before any connection) is not a "bound production send", so the sequence can be retired by
  P-86's act. P-86 C1 (landed) excludes only an attempt a chained `TRANSMIT_BLOCKED` proves blocked; its note at
  `boundProductionSend` (`filed-sequence-baseline.ts`) says P-92's release joins that exclusion.
- **2(c), Q11.** No settlement path is built for a legacy hold older than the per-attempt binding of 2026-10-14. The
  runbook escalates if one is ever found (expected zero). E1's refusal stands.

### 10.3 The re-cut that applies them (2026-11-09, on trunk after P-86 C2 and C3, `dd9a78374`)

This section binds where §0–§9 differ. The line citations of §1–§9 are as of `ffd2bd772`. They were each re-read at
`bc7ffda39` (2026-11-09 08:26 UTC): 132 citations, 67 the same, 47 moved, 18 changed, 3 gone. The table is kept beside
this design as `p92-settle-held-fda-send.citations-2026-11-09.md`. Since then:
- P-86 C2 (`7ba85e00c`) added 81 lines to `submission-service.ts`: +5 before about `:2410`, and +81 after it.
- It added 32 lines to `filed-sequence-baseline.ts` and 31 to `server/routes/submissions.ts`.
- `fda-esg.ts`, `fda-esg-receipts.ts`, `as2-transport.ts` and both runbooks are unchanged.

Each commit below re-reads its own citations before its first edit.

#### A. What the answers change

1. **A second ground for a release: the platform's own proof that nothing left (P-108 1(b)).** The founder's P-92
   record required FDA's written confirmation of non-receipt. P-108 1(b) amends it: "for a send the platform's own record
   proves never left, a signed release cites that proof, not FDA's written confirmation". So the "not-received"
   outcome has two evidence kinds:
   - `fda-non-receipt-confirmation`, as §3: FDA's letter, retained in the project's Vault, judged by E6;
   - **`platform-proof`**: no document. The proof is read by the server, under the lock, and never typed by the
     signer.

   **What counts as proof (E9, new).** E2's row is `transport = 'as2'` and carries **no AS2 identity**: `bindingOf`
   fails, because `metadata.as2.messageId` is absent.
   - **Why that is proof, by code order.** Since `e1f3fd425` (on trunk 2026-10-17), and in today's code:
     - the row is created first, binding `dispatchBinding` and writing `as2: undefined` (`fda-esg.ts:326-345`, `:654`);
     - `in_transit` is written (`:668`);
     - the AS2 identity is minted (`:672`) and written, awaited, "before any byte leaves this process" (`:680-681`);
     - only then is the request built and posted (`:687`).

     A failure to write the identity is marked `NOTHING_TRANSMITTED` (`:590-592`). Nothing later removes it: its
     writer is a `jsonb_set` (`:588`), and the receipt path spreads the metadata it read (`fda-esg-receipts.ts:83`).
   - **Why every bound row comes from code with that order.** `dispatchBinding` and the pre-wire identity arrived in the
     same commit. E1 already refuses an unbound hold (P-108 2(c)).
   - **What the proof covers.** H7, H9 before the binding, the unmarked pre-wire failures (a non-credential account or
     certificate read, a failed `in_transit` write), and a failed failure-write after any of them. Status `pending`
     falls inside E9.
   - **What is not proof:**
     - no transmittal row at all (H8): absence of a record, equally a read failure. E2 still refuses it;
     - `transmission_id IS NULL`;
     - `http_status IS NULL`;
     - no `as2Receipt`;
     - a `TRANSMIT_BLOCKED` row. Such a row never exists for a held attempt: it accompanies a released claim
       (`submission-service.ts:1393` today).
   - **Legacy bound SFTP rows (H5′).** Every SFTP attempt ended before `connect()`, because no image ever shipped
     `ssh2-sftp-client` (`edd225c02`; P-93 design §6.1). That is a fact of the code's history, not of the row. Whether
     it is "the platform's own record" in P-108 1(b)'s sense is asked in B below. Until the answer comes, an H5′ row is
     released only on FDA's letter. This fails closed.

   **E7, extended:** `platform-proof` is valid only for "not-received", and only while E9 holds. E6 does not apply to
   it: no Vault document is chosen, and none is linked.

   **The statement** (`heldSendStatement`, §3.4):
   > "The platform's own record shows that the send of sequence NNNN on DATE never left this platform: no AS2 message was
   > formed for it, and this platform forms that message before any byte is sent. FDA cannot confirm a send it never
   > received, so no FDA document is cited. Releasing the send lets sequence NNNN be sent again, under a new signature.
   > If this record is wrong and FDA did receive the first send, sending sequence NNNN again files it twice: FDA would
   > hold two copies, and may refuse the second or require it to be corrected."

   The duplicate-filing risk stays in words, as P-92's record requires.

   **What is recorded.** The payload's evidence is `{ kind: 'platform-proof', proof: 'no-as2-message', transmittalId }`.
   `ECTD_HELD_SEND_SETTLED` and `metadata.heldSendSettlement` record the same, with the row's `transport`, `status` and
   `created_at` as read under the lock. There is no `vaultDocumentId` or `sha256`. `payloadRefusal` (§3.6) checks the
   kind against E9 as it checks E7.

2. **The over-size release statement goes** (§3.4's fourth bullet).
   - P-93 has landed: a package over 1 GiB is refused before any row (`fda-esg.ts:650-653`), and `createTransmittalRow`
     writes only `'as2'` (`:338`), so no new H5′ can occur.
   - P-108 2(b): 1 GiB is never called FDA's limit. The constant is Concept2Cure's launch scope
     (`LAUNCH_SEQUENCE_MAX_BYTES`, `ectd-regional-rules.ts:395-402`).
   - P-108 2(a): a released sequence can be retired, so it is not stranded.

   A legacy H5′ row's release uses the standard release statement on FDA's letter, or on E9's ground if B1 is answered
   yes. A further sentence quotes `launchSequenceSizeRefusal`'s clause (`:410-421`) when its bundle exceeds the
   constant.
3. **A contradicting verified FDA answer wins, through a second signed act (P-108 1(c)).** §3.3's handling of a late
   receipt stands: it is kept, never thrown, with `contradicts`, and resends are held by `releasedSendReceivedRefusal`.
   Re-opening it is a new commit, **C3**:
   - intent `held-send-reopen`, meaning `responsibility`;
   - offered only while a verified `as2ReceiptHistory` entry carries `contradicts`;
   - the signed payload names the settlement's signature T and the receipt's `sha256`;
   - the act sets the sequence to what FDA's verified answer says. After a release that FDA's positive MDN contradicts,
     that is `toDispatchStatus(<the MDN's status>, 'production')`. After "received" that FDA's refusal contradicts, it
     is the technical rejection of item 4.

   Both records are kept: `heldSendSettlement` gains `reopenedBy`. Resends stay refused until C3's act or FDA's answer
   settles it. Until C3 lands, §3.3's sentences stand.
4. **Ack3 decides once it has arrived (P-108 1(a)).** "Received" on an Ack3 requires that the Ack3 accepts (the
   statement already says so). A failed Ack3 after an Ack2 is recorded as a technical rejection: that completes
   `filed-sequence-rejection.ts` for the sequence spine, as **C4** under F1. Until C4 lands, the "received, Ack2"
   statement adds: "No Ack3 for this send is on the platform. If one arrives and does not accept sequence NNNN, it is
   recorded as a technical rejection."
5. **A released attempt is not a bound production send (P-108 2(a)).** C1 edits `filed-sequence-baseline.ts`:
   - `boundProductionSend` (check 3, `:345-360` today) excludes a transmittal whose `heldSendSettlement.outcome` is
     `'not-received'`, on either ground;
   - check 4 excludes the `ECTD_TRANSMITTED` row that spends S with `status: 'not-received'` and
     `source 'held-send-settlement'`;
   - check 2b's sentence ("Record the agency's receipt, or wait for the send to settle") adds "or settle it from the
     Dispatch tab" once C2 lands.

   Red cases go in `sequence-retirement.pglite.test.ts`, on P-86's fixture. The code note in `boundProductionSend`
   already names this step.
6. **Legacy holds (P-108 2(c)).** No settlement path is built for a hold older than the per-attempt binding. E1's
   refusal stands, and the runbook escalates if one is ever found (expected zero).
7. **The coordinating session's rulings:**
   - C4: H3's 4xx arm becomes a transport refusal only with a proven pinned peer. That is its own F1 repair, not one
     of P-92's commits; E5b's 4xx clause then covers only an unproven peer.
   - C5: the package spine is not settled. The runbook adds its deployed count query beside P-92's.
   - C6: the holds on `server/routes/submissions.ts` and `GatewayTransmittals.tsx` are granted. C2's held-send line
     lands under F1, with C1.
   - C9: the order is respected.
8. **The precheck is answered at the route,** as P-86 C2 does for `retire`. `precheckGovernedStep` is at complexity
   15, and today takes `Exclude<SequenceSignatureIntent, typeof SEQUENCE_RETIREMENT_INTENT>`. The route sends
   `held-send-settlement` and `held-send-reopen` to their own functions.

#### B. Questions back (to the coordinating session)

1. **H5′ under P-108 1(b).** Answered in §10.4: yes, under four conditions.

#### C. Statements in §0–§9 that are no longer true, and what replaces them

1. **Staging holds** (§0, §1.1, E3). A staging send that fails after the wire is released once its signature's void
   reaches a record Gate 1 reads (`releasedTestSend`). Otherwise it is held as `TEST_SEND_STILL_HELD`, and slice 2's
   runbook query finds it (coordinator C3). E3 stays: it refuses them here.
2. **`toDispatchStatus`** takes the environment (`toDispatchStatus(status, environment)`, slice 2). Every call P-92
   makes passes `'production'`.
3. **`signatureSpentBy`'s list** now includes `'TRANSMIT_BLOCKED'` and `ECTD_SEQUENCE_RETIRED_ACTION`, and Gate 1 reads
   `TRANSMIT_BLOCKED` as void. The shared `spendTransmitSignature` asks Gate 1's own question, not
   `fda-esg-receipts.ts`'s shorter list, and P-92 adds `ECTD_HELD_SEND_SETTLED` and `ECTD_HELD_SEND_REOPENED`.
4. **`applySequenceChangeWithAudit`** already takes `audit.reason`, a `params` function of the act's instant, and
   returns `{ occurredAt }` (P-86). Only `afterUpdate` remains to add. It still sets no tenant context, so §3.3 step 1
   stands.
5. **"No trigger guards either table"** (§1.5). `ectd_sequences` has P-86's removal guard and its deferred record check
   (`migrations/20261109_ectd_sequence_removal_guard.sql`). Neither fires on P-92's live-row UPDATE (both are
   `WHEN … deleted_at …`), and there is still no CHECK on either status column.
6. **P-86 refuses a held sequence twice:** check 2b, and the trigger's `SEQUENCE_FILED_NOT_REMOVABLE` for
   `'transmitting'`. A settlement ends both refusals: received files the sequence, and a release returns it to
   `'pending'`, which A.5 then lets P-86 retire.
7. **The SFTP refusals** (H5's `index.ts:171-189`, `fda-esg.ts:630-660`, `:749`, `:782`) are gone (`edd225c02`). The
   historical claim that SFTP holds before the binding are L stands.
8. **The binding date.** The binding migration is dated 2026-10-14. It and its code reached trunk on 2026-10-17
   (`e1f3fd425`). P-108 2(c) says 10-14, and E1 tests the binding's presence, not a date.
9. **`fda-esg-receipts.ts` is 139 lines,** not 132. A verified staging MDN settles its attempt to `'pending'` and
   leaves S and A (`:114-115`). Not a production hold.
10. **§3.7's file list adds `filed-sequence-baseline.ts`** (A.5) and is otherwise unchanged.
11. **§5.0's holders.** These are on trunk:
    - slice 2;
    - repairs A to C;
    - P-93 (`b21dbdffa`, `edd225c02`, `96ca836e5`, `17463713f`);
    - P-94 with P-108 3(b) (`b14086c7d`, `217f50153`);
    - P-86 C1 to C3;
    - P-99 C1;
    - D7-A1 and D7-A2.

    `SubmissionSeqWorkspaces.tsx` and `SubmissionCenter.tsx` are RIM's under L9. C2's held-send line follows D7-A2's
    layout: a quiet line where the send is told, and a `.pj-more` door beside the one verdict, built from existing
    components.
12. **§6's composition:**
    - **P-86:** a released sequence is retirable (A.5). P-93's "only way out" is gone (P-93 design §6.1).
    - **P-94:** onboarding uploads are no longer placed in a sequence (P-108 3(b)), so no such refusal can meet a
      re-send.
13. **§7:**
    - **Item 1:** `runTransmit` now says "Request failed." without "Nothing was sent." (`eac69256c`). The route still
      answers a `GatewayError` with a bare 500, so the gateway's own sentence still does not reach the screen. Still
      owed.
    - **Item 11:** `TransmitFacts` says the dispatch status in words (`dispatchStatusWords`). The held line from
      `resendRefusal` still prints the raw `'transmitting'`; C2 replaces it.
    - **Items 3, 4, 5, 6, 8, 12 and 15:** they asked; they are now decided by 10.1, 10.2 and this section.

#### D. The commits, re-cut

All four are under F1. C1 and C2 are pushed together. Before each commit's first edit, RIM sends the coordinating
session its file list.

| | What | Files |
|---|---|---|
| **C1** | The settlement act with both outcomes and all three evidence kinds (E1 to E9), its precheck answered at the route, the door. `afterUpdate`. The shared `spendTransmitSignature`. A.5 in P-86's checks. The runbook's two count queries. Red-first: §5's tests, plus E9's cases (an `as2`-transport bound row with no identity is released on proof; one with an identity is not; an SFTP row is not, until B1), plus A.5's retirement cases. | `submission-service.ts`, `fda-esg-receipts.ts`, `server/routes/submissions.ts`, `filed-sequence-baseline.ts`, `docs/runbooks/fda-esg-production-uat.md`, `docs/runbooks/ectd-transmit-path.md`, and their tests |
| **C2** | The held send told in the Dispatch tab (one quiet line), and the door: the precheck's statement, Responsibility only, no record key; the platform-proof ground shown as the server's sentence, with no document picker. The line on Gateway transmittals. | `SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx`, `GatewayTransmittals.tsx`, client tests |
| **C3** | The re-open act (A.3). | `fda-esg-receipts.ts`, `submission-service.ts`, `submissions.ts`, client |
| **C4** | The technical rejection on a failed Ack3 after an Ack2, completing `filed-sequence-rejection.ts` for the sequence spine (A.4). | `filed-sequence-rejection.ts`, `fda-esg-receipts.ts`, tests |

Separately, under F1 and not P-92's: the coordinating session's C4 repair (H3's 4xx arm with a pinned peer).

### 10.4 B1 answered: a bound legacy SFTP row is proven never to have left, under four conditions (2026-11-09)

The coordinating session answered B1: **yes, with the proof made explicit and checkable.** A bound legacy-SFTP attempt
counts as "the platform's own record proves it never left" (P-108 1(b)) only when all four conditions hold. Each is
applied as follows.

**(a) The proof is reproducible from the repository.** It is held: the search and its output are kept beside this
design as `p92-settle-held-fda-send.b1-sftp-search-2026-11-09.txt`, and anyone can rerun them.
- **Scope.** `origin/concept2cure-v2`'s full history, unshallowed (19,239 commits back to 2025-11-20), and every tag
  (`v1.0.0`).
- **The search.**

  ```
  git log --oneline -S'ssh2-sftp-client' origin/concept2cure-v2 --tags -- \
    ':(glob)**/package.json' ':(glob)**/package-lock.json' ':(glob)**/npm-shrinkwrap.json' \
    ':(glob)**/yarn.lock' ':(glob)**/pnpm-lock.yaml'
  ```

  It finds no commit, so the package was never added to or removed from any manifest or lockfile at any depth. The
  same is true for the bare `ssh2-sftp` and for its transport, `"ssh2"`.
- **A positive control.** The same search finds `node_modules/express` in `package-lock.json`, so the search works.
- **No other way in.** No Dockerfile, CI workflow, deploy script or shell script ever mentions `ssh2`.
- **The deploy path.**
  - `.github/workflows/deploy-aws.yml` runs on tags `v*` and `rc-*`, or on dispatch;
  - it builds `Dockerfile.optimized --target production` (`:396`);
  - that image installs with `npm ci --legacy-peer-deps --omit=dev` (`Dockerfile.optimized:159`), which installs
    exactly the lockfile.

  So no deployed image ever held the module.
- **What the code did without it.** The retired branch (`edd225c02^:server/services/submission-gateways/fda-esg.ts`,
  `:640-662`, the throw at `:657`) loaded the module by a dynamic `import()`, and on failure threw "FDA ESG SFTP transport requires
  'ssh2-sftp-client' package; nothing was sent.", marked `NOTHING_TRANSMITTED`. The `connect()` call comes after that
  import (`:670`). Without the module there is no client to connect, so no version could have connected.

**(b) The row is the legacy SFTP gateway, and nothing on it says bytes reached anyone.** E9′ checks this under the
lock. E2's bound row must have:
- `transport = 'sftp'`;
- no `metadata.as2` and no `metadata.as2Receipt`;
- `transmission_id IS NULL`, `ack_received_at IS NULL` and `mdn_raw IS NULL`;
- a status of `pending`, `in_transit` or `rejected`. It is never received, `ack2_received` or `ack3_received`.

Any one of these failing refuses the ground. Such a row keeps FDA's letter as its only ground, which fails closed.

**(c) The statement names the ground in words, and keeps the risk sentence:**
> "The send of sequence NNNN on DATE used the SFTP route to FDA, and no connection to FDA could be made for it: the
> platform never shipped the SFTP client that route needed. FDA cannot confirm a send it never received, so no FDA
> document is cited. Releasing the send lets sequence NNNN be sent again, under a new signature. If this record is
> wrong and FDA did receive the first send, sending sequence NNNN again files it twice: FDA would hold two copies, and
> may refuse the second or require it to be corrected."

The payload's evidence is `{ kind: 'platform-proof', proof: 'sftp-client-never-shipped', transmittalId }`.

**(d) The ground is narrow.**
- It applies to `transport = 'sftp'` only.
- E9's `no-as2-message` ground applies to `transport = 'as2'` only.
- Any other transport, or any row with an unknown outcome that fails E9 or E9′, still needs FDA's letter.

`payloadRefusal` checks the proof kind against the row's transport.

**C1's red cases add:**
- a bound SFTP row with no receipt is released on `sftp-client-never-shipped`;
- one with a `transmission_id`, an `as2Receipt` or a received status is not;
- an AS2 row never takes the SFTP proof, and an SFTP row never takes the AS2 one.

The evidence README carries (a)'s search and its output again, run at the commit, so a reviewer can compare them.

### 10.5 C3 and C4, before any code (2026-11-09, read at `f71ca16bb4`)

This section binds C3 and C4 where §10.3 differs. The coordinating session agreed (2026-11-09): design first, this file
the only edit until it has read this section, and C4 before C3. It asked this section to settle three things: the
package-spine half of `filed-sequence-rejection.ts`, the number and retirement rules after a failed Ack3 (from FDA's own
text), and the act's signature and evidence. Each is below. One of them is not settled in this session (§10.5 D), and
one defect in what C1 landed was found on the way (§10.5 B).

#### A. What already exists (RULE 3), by path

1. **The sequence's dispatch statuses** are `pending`, `transmitting`, `sent`, `acknowledged` and `rejected`
   (`filed-dispatch.ts:4-8`; the schema comment at `shared/schema/submissions.ts:119` leaves out `transmitting`). No
   CHECK constrains them. Only `sent` and `acknowledged` are filed (`filed-dispatch.ts:30-36`).
   `toDispatchStatus(status, environment)` (`submission-service.ts:3154-3159`) maps a transmittal status: not production
   to `pending`; `rejected` or `validation_failed` to `rejected`; `ack3_received`, `validation_passed` or `completed` to
   `acknowledged`; anything else to `sent`.
2. **`rejected` on the sequence today.**
   - Its one FDA writer is the receipt path: a verified negative production MDN, while the sequence is `transmitting`
     under the same signature and attempt (`fda-esg-receipts.ts:125`, `:137-139`). FDA ESG's transmit never returns
     `rejected`; its refusals throw and leave the sequence `transmitting` (`fda-esg.ts:447-453`, `:717-722`).
   - It can be sent again under the same number: `resendRefusal` returns null for it (`submission-service.ts:3126-3136`),
     the claim accepts it (`:3294-3301`), and dispatch re-authorization accepts it (`:2220`).
   - P-86 keeps its number: check 3 (`boundProductionSend`, `filed-sequence-baseline.ts:350-375`) finds its bound
     production transmittal, and check 4 its `ECTD_TRANSMITTED` row. So it cannot be retired.
   - The screen says "rejected by the agency" (`CommitmentRow.tsx:115-120`, through `dispatchStatusWords`,
     `SubmissionSeqWorkspaces.tsx:1829-1832`).
3. **Ack2 and Ack3.** Nothing parses or stores FDA's acknowledgements. `GatewayStatusResult.ackLevel` is declared and
   never written (`types.ts:349`). The transmittal statuses `ack2_received` and `ack3_received` are written for FDA only
   by C1's settlement (`submission-service.ts:2844`, `:2880`), which keeps the evidence kind (`ack2` or `ack3`) in
   `heldSendSettlement`. `validation_failed` is never written for FDA.
4. **A contradicting receipt** (`fda-esg-receipts.ts:330-357`). Two pairs only: a release (`not-received`) that FDA's
   positive MDN contradicts, and "received" that FDA's negative MDN contradicts. The entry is kept in
   `as2ReceiptHistory` with `contradicts`, its bytes (`bodyBase64`), `verified: true` and the uploader; the status,
   `as2Receipt`, `mdn_raw`, the settlement and the sequence are untouched, and the upload answers 409. Resends are
   held only for the first pair (`releasedSendReceivedRefusal`, `:360-372`); in the second the sequence is `sent` or
   `acknowledged`, which `resendRefusal` already refuses.
5. **The package-spine technical rejection** (`server/services/ectd/filed-sequence-rejection.ts`, 406 lines; test
   `server/services/ectd/__tests__/filed-sequence-rejection.test.ts`). It is keyed on a transmittal with a
   `package_id`, takes the latest entry of `c2c_submission_packages.metadata.filedSequences` off file
   (`state: 'rejected'`), moves an awaiting status to `validation_failed`, writes `metadata.technicalRejection`, and
   signs over the notice's Vault hash (`persistGovernedActionSignature`, `VAULT_DOCUMENT_VERSION`).
   - **Its way in is live.** `POST /api/mdx/gateways/transmittals/:id/technical-rejection`
     (`mdx-submission-gateway.ts:600`) is mounted (`register-inline-routes.ts:1203`), and the launch gate passes it on
     purpose: `launch-scope-api-gate.test.ts:222-241` (2026-10-17, F12 and LX-13) refuses the package *transmit* and
     keeps "the log, its status poll, its ACK and the signed technical rejection". Its client door is Gateway
     transmittals' "Record a technical rejection", offered only on a row with a `package_id`
     (`GatewayTransmittals.tsx:150`, `:406`).
   - **What can still reach it:** no new package transmittal in production (the package transmit is refused there
     since 2026-10-17), but every package transmittal written before then. P-103 retired
     `/api/submission-ops/packages/*` only; it does not touch `/api/mdx/gateways`.
   - **So the package-spine half has a live caller.** It is not retired by C4. This comes back to the coordinating
     session (§10.5 E, question 1).
   - Sequence-spine sends are written with `packageId: null` (`submission-service.ts:3874`), so that door is never
     offered for them, and nothing on the sequence spine reads `isRejectedFiling`
     (`package-sequence-lifecycle.ts:81`); the fold reads `dispatch_status IN ('sent','acknowledged')`
     (`prior-sequence-loader.ts:103`, `:316`, `:565`).
6. **Not found.** `held-send-reopen`, `HELD_SEND_REOPEN`, `ECTD_HELD_SEND_REOPENED`, `reopenedBy`, and any sequence-spine
   technical rejection (`technical rejection`, `TECHNICAL_REJECTION`, `technicalRejection`, `rejectedByAgency`,
   `ECTD_SEQUENCE_REJECTED`, `sequence_rejected`), searched in `server`, `shared`, `client/src`, `migrations` and
   `scripts`. The only hits are this design, the package spine, and the held-send statement's promise
   (`fda-esg-receipts.ts:304-306`). `git log --all --diff-filter=D -- '*rejection*' '*Rejection*'` finds only an
   unrelated seeder (`a0f4d73a9f`).

#### B. A defect in what C1 landed: a release that FDA's receipt contradicts can be retired

P-108 1(c) says resends are refused while FDA's verified answer contradicts a settlement. C1 holds the resend
(`releasedSendReceivedRefusal`), but P-86's check 3 excludes every transmittal whose settlement is `not-received`
(`filed-sequence-baseline.ts:355`), and check 4 excludes the settlement's own `ECTD_TRANSMITTED` row (`:369`), whether or
not a verified contradicting receipt is kept beside it. So, shown red on 2026-11-09 at 16:56 UTC against `f71ca16bb4`'s
code, by a test kept outside the repository until this repair is cleared (built on
`held-send-settlement.pglite.test.ts`'s setup), on both grounds of a release, FDA's letter and the platform's own proof:

1. a production send is released as not received (C1);
2. FDA's signed MDN arrives and shows it received; it is kept with `contradicts: 'not-received'` (C1, T7);
3. P-86's act retires the sequence, and its number is freed, though FDA holds a sequence under it. The precheck
   cleared, the act answered retired, and the row's `deleted_at` was set. The test moves into
   `sequence-retirement.pglite.test.ts` with the repair, red first there as well.

**The repair, first and alone (F1):** checks 3 and 4 exclude a release only while no verified entry of that
transmittal's `as2ReceiptHistory` carries `contradicts: 'not-received'`, the same test `releasedSendReceivedRefusal`
makes. P-86's sentence for it, in words: "FDA's signed receipt shows it received sequence NNNN's send of DATE, which was
released as not received, so it cannot be retired. Contact FDA before anything else is done with it." Red first in
`sequence-retirement.pglite.test.ts` (the retire act and its precheck), on P-86's fixture. Files:
`filed-sequence-baseline.ts` and that test. It lands before C4, under its own push window.

#### C. C4: FDA's failed Ack3, recorded on the sequence

**What it records.** FDA's Ack3 for a send the platform records as received (the sequence `sent`), reporting that the
center did not accept sequence NNNN. It completes `filed-sequence-rejection.ts` for the sequence spine: the rule, the
statement and the record's shape go in that file, beside the package spine's, sharing `ACCEPTANCE_STATUSES`,
`AWAITING_AGENCY_STATUSES` and `REJECTED_BY_AGENCY`. The act joins the sequence's own signing chain, as C1's does.

**Eligibility (R1 to R7), one pure rule, read at the precheck, at the act, and again under the locks:**
- R1. The sequence is `sent`. `acknowledged` refuses: an Ack3 that accepted it is already on record (the package spine's
  acceptance refusal). `rejected` refuses: already recorded. Any other status: nothing on file to reject.
- R2. Its production send is one transmittal bound to the sequence's last claim (signature and attempt, C1's E2), FDA
  ESG, not staging. Two refuse (fail closed); none refuses.
- R3. That transmittal's status is an awaiting one (`received`, `ack1_received`, `ack2_received`). An acceptance status
  refuses.
- R4. Latest only: no later sequence of the same submission is `dispatched` with a send in flight or on file
  (`transmitting`, `sent`, `acknowledged`). It was planned against this one, and its rejection is recorded first.
- R5. The evidence is FDA's Ack3, a document in this project's Vault, as C1's E6 judges it: this organization's and
  this project's, not deleted, not dated before the send, and not the evidence of another settlement or rejection.
- R6. The signer is not the sequence's creator (C1's E8), and the meaning is responsibility.
- R7. The send's own record does not contradict it: no verified negative MDN is pending a C3 decision for it.

**The signature and the evidence (the coordinating session's third point).** As C1: the statement and the evidence
are read by the server, quoted to the signer, signed, and compared word for word under the transmittal's and the
sequence's locks. The Vault document is read `FOR SHARE` in the signing transaction, and its content hash is part of
the signed payload.
- **The Ack3 is absent** (deleted, not in this project's Vault, or another organization's): R5 refuses before signing
  ("FDA's Ack3 for sequence NNNN must be a document in this project's Vault. Upload it there and choose it."), and the
  act refuses again under the lock. A refused act voids its signature (P-23).
- **Its bytes changed** after the statement was read: the hash under the lock differs from the signed one, the act
  refuses ("The chosen document changed after it was quoted. Nothing was recorded; look at it again and sign anew."),
  and the signature is void.
Both are red-first cases.

**Effects, one transaction:** the sequence `sent` to `rejected`; the transmittal's status to `validation_failed`, with
`metadata.technicalRejection` in the package spine's shape (sequence, recordedAt, recordedBy, reason, evidence,
transmittalStatus, actionId, signatureId); a chained `ECTD_TECHNICAL_REJECTION_RECORDED` row with the meaning and the
reason; the signature spent (`signatureSpentBy` and `spendTransmitSignature` gain the action). Nothing is deleted.

**The statement**, server-held, one source:
> "FDA's Ack3 for the send of sequence NNNN on DATE is the document chosen from this project's Vault. It reports that
> the center did not accept sequence NNNN. Sequence NNNN is recorded as rejected by FDA: it is no longer on file with
> FDA." Then the number sentence, which waits on §10.5 D.

**The door.** A send recorded as received is told in the Dispatch tab today. Beside it, a closed `.pj-more` door,
"Record FDA's technical rejection…", built from C2's components: the precheck's statement, the existing Vault picker,
Responsibility only, no record key. Without it the act is unreachable (RULE 5), so C4 carries its door and is pushed
as one, as C1 and C2 were. Route: `POST /sequences/:seqId/technical-rejection` in `server/routes/submissions.ts`, its
precheck answered at the route (A.8).

**Files:** `server/services/ectd/filed-sequence-rejection.ts`, `submission-service.ts`, `server/routes/submissions.ts`,
`SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx`, `gatewayLabels.ts`, their tests, and an evidence folder. No
table, mount or route file. `fda-esg-receipts.ts` only if R7 needs a shared reader.

#### D. The number and retirement rules: FDA's text is not yet in hand

The coordinating session asked for FDA's own text on whether a technically rejected sequence counts as received, and
whether its number is reused on resubmission, and will not rule from memory. This session could not read it:
`www.fda.gov` is outside this environment's network policy, and the change that would allow it was not approved.

What a web search returned (excerpts as the search tool quoted them, **not verified against the documents, with no
page, section or version checked**):
- *Specifications for eCTD v4.0 Validation Criteria* (`https://www.fda.gov/media/179723/download`): for several
  rejections, "You may resubmit using the original sequence number of the submission"; for others, a new, unique
  sequence number is required.
- *Specifications for eCTD Validation Criteria* (v3.2.2, `https://www.fda.gov/media/87056/download`): reuse of "the
  original sequence number of the submission" after a rejection, and a separate rejection, "The sequence number used in
  your submission has already been submitted to the application."
- FDA's "Update on eCTD Submissions" presentations (`https://www.fda.gov/media/189612/download`): duplicate sequence
  numbers are the most common rejection; "Even if a submission is withdrawn, FDA continues to keep the sequence."

If the documents say what the excerpts say, the rule depends on the rejection's own validation code: most technical
rejections are resubmitted under the same number, and a rejection for a duplicate number needs a new one. The platform
does not parse the Ack3, so it cannot tell which code applies.

**Until the text is read and cited, C4 changes no number or retirement rule (fail closed to what exists):**
- the sequence becomes `rejected`, which today can be sent again under its own number (§10.5 A.2), and the statement
  says so, naming that FDA's notice decides whether that number can be used again;
- P-86 keeps refusing to retire it (check 3 still finds the bound production send). Its sentence, in words: "Sequence
  NNNN was sent to FDA on DATE and rejected by FDA, so it is on FDA's record and cannot be retired. A correction is sent
  again as sequence NNNN or as a new sequence, as FDA's notice says."
- Neither is final until the source is quoted with its version and section.

#### E. C3: the re-open, and a correction to §10.3 A.3

**A correction, owed to the coordinating session.** §10.3 A.3 says that after "received", FDA's refusal re-opens to
"the technical rejection of item 4", and I asked for C4 first on that basis. But the FDA answer in that arm is a
**negative MDN**: FDA's AS2 gateway refusing the message, not the center's Ack3. The receipt path records that answer
as `rejected` on both rows (§10.5 A.2), never as `validation_failed` or `technicalRejection`. Two ways to build it:
- **(i) Apply FDA's answer as it stands** (recommended): the re-open writes what the receipt path would have written
  had FDA's answer arrived before the settlement. That is the sequence `toDispatchStatus(<MDN status>, 'production')`
  and the transmittal the MDN's status, with `as2Receipt` and `mdn_raw` from the kept entry. That is P-108 1(c)'s
  "FDA's answer wins" read literally, and it keeps "technical rejection" meaning the Ack3 only. C3 then needs nothing
  from C4, and the order between them is free.
- **(ii) C4's record with a second evidence kind:** the verified negative MDN kept on the transmittal. That widens C4
  to a non-Ack3 evidence and names an AS2 refusal a technical rejection.

**The act under (i).** Intent `held-send-reopen`, meaning responsibility, an independent signer.
- **Offered only while** a verified `as2ReceiptHistory` entry of the settled transmittal carries `contradicts`, and the
  sequence is where the settlement left it: `pending` with no claim after a release, or `sent`/`acknowledged` after
  "received".
- **The signed payload** names the settlement's signature and the kept entry's `sha256`, both compared under the
  locks.
- **Arm (a), a release FDA's positive MDN contradicts:** the sequence `pending` to `sent`; the transmittal to
  `received`, with `as2Receipt`, `mdn_raw` and `ack_received_at` from the entry, as the receipt path writes them.
- **Arm (b), "received" FDA's negative MDN contradicts:** the sequence to `rejected`; the transmittal to `rejected`.
- **Both:** `heldSendSettlement` gains `reopenedBy` (actor, time, signature, the entry's `sha256`), set once; the
  settlement is never removed. A chained `ECTD_HELD_SEND_REOPENED` row; the signature spent.
- **Refused, in words, with the runbook's escalation:** a sequence no longer where the settlement left it (sent again
  before FDA's answer arrived, or retired before the repair of §10.5 B). FDA may then hold two copies, and that is for
  a person and FDA, not an act.
- **The door:** where C2 tells the contradicting answer (the Dispatch tab's transmissions row), a closed door "Re-open
  the settlement on FDA's answer…", with the precheck's statement, Responsibility only.
- **Files:** `fda-esg-receipts.ts`, `submission-service.ts`, `server/routes/submissions.ts`, `SubmissionSeqWorkspaces.tsx`,
  `SubmissionCenter.tsx`, `gatewayLabels.ts`, tests, evidence. No table, mount or route file.

**Questions back to the coordinating session:**
1. The package-spine technical rejection keeps a live caller (§10.5 A.5): historical package transmittals, through
   Gateway transmittals. Keep it beside C4's sequence-spine act, or retire it (its rows then have no way to record a
   rejection)?
2. C3's arm (b): (i) or (ii)?
3. FDA's text (§10.5 D): allow `www.fda.gov` in this environment, or supply the two specifications, so the number rule
   can be cited. Until then C4 lands with the fail-closed rule above, or waits: which?
4. §10.5 B's repair: one small F1 commit, before C4, under its own window?
