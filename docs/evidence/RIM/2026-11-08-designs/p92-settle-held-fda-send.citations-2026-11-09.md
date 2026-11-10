# P-92 design re-verification: citations, stale statements, proof-of-non-sending

- **Design:** `docs/evidence/RIM/2026-11-08-designs/p92-settle-held-fda-send.design.md` (§0–§7, §9.1; its new §10 is
  read but has no line citations).
- **Base:** `ffd2bd772` (the design's tree). **Today's trunk:** `bc7ffda39` (2026-11-09 08:26 UTC). HEAD moved during
  this check from `36292f57f` to `bc7ffda39`; the only change between them is the design's own §10 and the P-99 design
  (`git diff --stat 36292f57f bc7ffda39`: two `.design.md` files), so every code line below holds on both.
- **Working tree caveat:** `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx` and `styles/coverage-v2.css` carry
  **uncommitted** edits in the shared checkout (D7 §A.4 layout work: `ProjectScopeToggle`, `ProjectBack`). Every
  `SubmissionCenter.tsx` line below is read from the committed blob (`git show bc7ffda39:…`), never the working tree.
- **Method:** each cited range was mapped through `git diff -U0 ffd2bd772 bc7ffda39 -- <file>` hunks, then the code at
  the new lines was read. Commits that touched each file: `git log --oneline ffd2bd772..bc7ffda39 -- <file>`.
- **Status:** SAME (same code, same lines) · MOVED (same code, new lines; lines inserted inside a range that do not
  change what is cited count as MOVED, with a note) · CHANGED (meaning differs: quoted) · GONE (removed).

---

## 1. Citation table, by file

### `server/services/submission-service/submission-service.ts` (4159 → 4731 lines)

Touched by: `5c5b89836` (TRANSMIT_BLOCKED), `eac69256c` (F1 slice 2), `63e51b02e`, `facc62cba` (transmit signature names
its environment), `2c0b4c8fe` (repair A), `b21dbdffa`, `96ca836e5`, `17463713f` (P-93), `b14086c7d` (P-108 3(b)),
`2b79ca12e`, `466c8f7bb` (P-86 C1).

| Cited (design §) | Today | Status | Note |
|---|---|---|---|
| `:123-140` `SubmissionErrorCode` (§1.3) | `:141-161` | CHANGED (additive) | adds `'AUDIT_UNCONFIRMED'` (`:147`, 5c5b89836) and `'SEQUENCE_NOT_RETIRABLE'` (`:161`, P-86). P-92's `HELD_SEND_NOT_SETTLEABLE` still absent. |
| `:162-188` `SUBMISSION_ERROR_STATUS` (§1.3) | `:182-216` | CHANGED (additive) | `AUDIT_UNCONFIRMED: 503` (`:188`), `SEQUENCE_NOT_RETIRABLE: 409` (`:213-215`). |
| `:927-930` `SequenceSignatureIntent` (§1.3) | `:990-994` | CHANGED (additive) | `\| typeof SEQUENCE_RETIREMENT_INTENT` (P-86). |
| `:933-939` `INTENT_LABEL` (§1.3) | `:997-1004` | CHANGED (additive) | `[SEQUENCE_RETIREMENT_INTENT]: 'retirement'`. |
| `:949-955` `INTENT_MEANING_REFUSAL` (§1.3) | `:1014-1021` | CHANGED (additive) | `[SEQUENCE_RETIREMENT_INTENT]: retirementMeaningRefusal` (`:1020`). |
| `:979-1109` `governedSignatureVerdict` (§1.3) | `:1064-1194` | MOVED | one line inside changed: see `:1035-1043`. |
| `:1029-1030` `payloadRefusal` hook (§1.3) | `:1114-1115` | MOVED | |
| `:1035-1043` spent or void (§1.3) | `:1120-1128` | CHANGED | `if (spentBy === SIGNATURE_VOIDED_ACTION \|\| spentBy === 'TRANSMIT_BLOCKED')` (`:1122`): a transmit signature recorded as blocked before the wire now reads as **void**. |
| `:1063-1074` in force (§1.3) | `:1148-1159` | MOVED | |
| `:1075-1086` leaf digest (§1.3) | `:1160-1171` | MOVED | |
| `:1124-1139` `signatureSpentBy` (§1.3) | `:1209-1225` | CHANGED | literal list now `'SEQUENCE_FROZEN', 'SEQUENCE_DISPATCHED', 'ECTD_TRANSMITTED', ${SHADOW_REVIEW_WAIVED_ACTION}, ${SHADOW_FINDING_DISPOSITIONED_ACTION}, ${SIGNATURE_VOIDED_ACTION}, 'TRANSMIT_BLOCKED', ${ECTD_SEQUENCE_RETIRED_ACTION}` (`:1216-1218`). |
| `:1131-1132` the literal list (§3.3) | `:1216-1218` | CHANGED | as above (two entries added: 5c5b89836, 2b79ca12e). |
| `:1170-1231` `voidRefusedStepSignature` (§1.3) | `:1256-1347` | CHANGED | refactored: `voidRefusedStepSignature(sig: RefusedStepSignature, refusal, context = null)` (`:1256-1266`), `unvoidableSignature` (`:1279-1305`), `voidSignatureRecords` (`:1309-1347`); `'voided'` only when Gate 1 can read the void (`:1342`). |
| `:1247-1268` `voidingSignatureOnRefusal` (§1.3) | `:1364-1391` | CHANGED | 4th parameter `testSend: { refusedBeforeWire?, voided?, context? }` (`:1368-1379`); for `step === 'transmit'` refused before the wire it writes a chained `TRANSMIT_BLOCKED` row (`:1388`, `recordBlockedSequenceTransmit` `:1410-1427`, `writeBlockedTransmitEvent` `:1429-1447`). |
| `:1276-1323` `applySequenceChangeWithAudit` (§1.3) | `:1459-1516` (doc from `:1449`) | CHANGED | takes `audit.reason` (`:1484`, written `:1505`); `params: unknown[] \| ((at: string) => unknown[])` (`:1468`, instant read after locks `:1490-1491`); returns `{ occurredAt }` (`:1509`). Still sets no tenant context. No `afterUpdate`. (P-86, 2b79ca12e.) |
| `:1712-1744` `precheckGovernedStep` (§1.3) | `:1992-2024` | CHANGED | signature now `step: Exclude<SequenceSignatureIntent, typeof SEQUENCE_RETIREMENT_INTENT>` (`:1994-1995`). |
| `:1991-2000` `waiveShadowReview` (§1.3) | `:2272-2281` | MOVED | |
| `:2007-2022` `independentSignerRefusal` (§1.3) | `:2288-2303` (fn `:2288-2301`) | MOVED | |
| `:2028-2050` `recheckUnderSequenceLock` (§1.3) | `:2309-2331` | MOVED | |
| `:2133-2214` P-35 disposition (§1.3) | `:2539-2620` | MOVED | |
| `:2321-2329` `resendRefusal` (§1.6, §3.3) | `:2728-2736` | MOVED | text unchanged; still prints `(dispatch status '${dispatchStatus}')`. |
| `:2331-2335` `toDispatchStatus` (§1.5) | `:2754-2759` | CHANGED | `function toDispatchStatus(status: string, environment: string)`; `if (environment !== 'production') return 'pending';` (slice 2). |
| `:2439-2487` `claimTransmitSlot` (§1.1) | `:2863-2911` (fn `:2863-2910`) | MOVED | |
| `:2472` the claim's CAS (§3.3, §9.1#5) | `:2896` | MOVED | |
| `:2494-2500` `releaseTransmitSlot` (§1.1) | `:2922-2930` (doc `:2912-2921`) | CHANGED | returns `Promise<boolean>` ("Whether this call released the claim"); doc adds "Two exceptions: … refusedBeforeWire … and a send to the agency's test environment, … released once its signature is void (releasedTestSend …)". |
| `:2685-2693` transmit's `voidable` (§1.1) | `:3162-3182` | CHANGED | `if (attempt.testSendClaim) return true;` (`:3168`): a staging send failed after the wire **is** voided, then released (`releasedTestSend` `:3238-3254`). Production unchanged. |
| `:2690` dynamic import (§3.7) | `:3169` | MOVED | (also `:3057`, `:3315`, `:3495`; none imports `fda-esg-receipts.ts`). |
| `:2793` claim stamped (§1.1, §9.1#2) | `:3350` | MOVED | |
| `:2907` `reachedGateway = true` (§1.1) | `:3461` | MOVED | |
| `:2937` dynamic import (§3.7) | `:3495` | MOVED | |
| `:2938` claim stands unless `refusedBeforeWire` (§1.1 H1) | `:3496` | MOVED | new `else if (environment !== 'production') attempt.testSendClaim = attemptId;` (`:3499`). |
| `:2947-2992` post-wire `applySequenceChangeWithAudit` (§1.1 H4) | `:3507-3558` | MOVED (additive) | rollback-on-audit-failure unchanged; `toDispatchStatus(result.status, environment)` (`:3509`), details add `dispatchStatus`, `testSend`. |

### `server/services/submission-gateways/fda-esg.ts` (1241 → 1098 lines)

Touched by: `edd225c02` only (P-93: SFTP branch retired, 1 GiB refusal).

| Cited (design §) | Today | Status | Note |
|---|---|---|---|
| `:27-28` WebTrader retired (§1.2, §5 C1) | `:29-30` | MOVED | list item renumbered "3." → "2.". |
| `:360-381` `createTransmittalRow` (§1.1, §9.1#2) | `:326-345` | CHANGED | `createTransmittalRow(req: GatewayTransmitRequest)`: no `transport` parameter; the INSERT writes the literal `'as2'` (`:338`). |
| `:378` `dispatchBinding` in metadata (§6) | `:341` | MOVED | |
| `:417-418` `updateTransmittal` unconditional (§1.1, §7 #13, §9.1#2) | `:380-381` | MOVED | |
| `:485-490` REFUSED_BY_AGENCY write (§1.1 H3, §9.1#4) | `:448-453` | MOVED | |
| `:513-514` `possibleAs2Delivery` 4xx (§3.2 E5b) | `:476-477` | MOVED | |
| `:524-528` `as2ReceiptMetadata` (§1.1 H3) | `:487-491` | MOVED | |
| `:526` `verified` (§1.1 H2′) | `:489` | MOVED | |
| `:563-578` `recordDeliveredUnconfirmed` (§1.1 H1) | `:526-541` | MOVED | |
| `:563-571` (§9.1#1) | `:526-534` | MOVED | |
| `:566-571` (§1.1) | `:529-534` | MOVED | |
| `:569` `transmissionId` (§1.1 H1, §9.1#4) | `:532` | MOVED | |
| `:601-602` `sent` branch (§1.1 H2) | `:564-565` | MOVED | |
| `:603-616` `recordTransmitFailure` writers (§1.1) | `:566-579` | MOVED | |
| `:613-617` generic `'rejected'` (§1.1 H2′) | `:576-580` | MOVED | |
| `:630-660` SFTP refusals release the claim (§1.1 H5) | — | **GONE** | `transmitViaSftp` (credential check, `ssh2-sftp-client` import, connect/put) deleted in `edd225c02`. Replacement: the launch-ceiling refusal before any row, `throw new ValidationError(\`Refusing to transmit to FDA: ${overCeiling}. Nothing was sent.\`, [], NOTHING_TRANSMITTED)` (`:650-653`). |
| `:689-698` `writeAs2Metadata` (§1.1) | `:586-595` | MOVED | |
| `:695` binding write → `NOTHING_TRANSMITTED` (§1.1, §9.1#3) | `:592` | MOVED | |
| `:749` `useSftp` switch at > 1 GiB (§1.1 H5′, §3.4) | — | **GONE** | `const useSftp = normalizedReq.bundle.sizeBytes > 1_073_741_824` removed (`edd225c02`); replaced in place by `:650-653`. |
| `:759` `createTransmittalRow` outside the try (§1.1 H8) | `:654` | CHANGED | `const transmittalId = await createTransmittalRow(normalizedReq);` (no transport arg). Still outside the `try` (`:662`), so H8 stands. |
| `:773` `in_transit` before any byte (§1.1, §5 T6, §9.1#2) | `:668` | MOVED | |
| `:782` `readVerifiedBundle` in the SFTP branch (§1.1 H5′, §9.1#7) | — | **GONE** | deleted with the SFTP branch (`edd225c02`); the AS2 read remains at `:671`. |
| `:811` integrity read (§1.1 H7, §9.1#3) | `:671` | MOVED | |
| `:821` AS2 binding before any byte (§1.1, §9.1#3) | `:681` | MOVED | |
| `:827` the POST (§1.1) | `:687` | MOVED | |
| `:837` verified `as2Receipt` write (§1.1 H2, §3.2 E4, §9.1#1) | `:697` | MOVED | |
| `:840` `sent = null` on refusal (§1.1 H2′) | `:700` | MOVED | |
| `:841` `recordAs2Outcome` (§1.1 H2′) | `:701` | MOVED | |
| `:851-857` MDN id → `transmission_id` (§1.1 H4, §9.1#4) | `:711-717` | MOVED | |
| `:856` / `:856-860` `'received'` write (§1.1) | `:716` / `:716-720` | MOVED | |
| `:867` catch (§1.1 H2) | `:727` | MOVED | |
| `:871-893` `checkStatus` (§1.5) | `:731-753` | MOVED | comment rewritten (no SFTP `/outgoing/` poller); still returns the stored row. |
| `:930-936` verified `as2Receipt` served as `'agency'` (§1.1 H2, §3.2 E4) | `:787-793` | MOVED | |
| `:955-1150` rollback machinery (§1.2) | `:812-1007` | MOVED | `RollbackNotPermittedError` `:843`, `ROLLBACKABLE_STATUSES` `:861`. |
| `:1049-1150` `rollbackTransmittal` (§1.2) | `:906-1007` | MOVED | |
| `:1202` `findActiveTransmittal` null for null `package_id` (§3.3, §9.1#5) | `:1059` | MOVED | (fn `:1047`). |

### `server/services/submission-gateways/fda-esg-receipts.ts` (132 → 139 lines)

Touched by: `eac69256c` (F1 slice 2) only.

| Cited (design §) | Today | Status | Note |
|---|---|---|---|
| `:17-23` `bindingOf` (§1.1, §3.2 E5b, §3.4) | `:18-24` | MOVED | |
| `:27-40` verification (§1.2) | `:28-41` | MOVED | |
| `:29` `transport = 'as2'` (§1.1 H5) | `:30` | MOVED | |
| `:42-50` actor (§1.2) | `:43-51` | MOVED | |
| `:52-61` `nextReceiptStatus` (§1.2) | `:53-62` | MOVED | |
| `:58` `matchingRejected` (§1.1 H3) | `:59` | MOVED | |
| `:59` the 409 throw (§3.3, §9.1#5) | `:60` | MOVED | |
| `:64-96` `ingestFdaAs2Receipt` (§1.2) | `:65-97` | CHANGED (additive) | result carries `environment: binding.environment` (`:78`, `:94`; type `:15-16`). |
| `:68` tenant context (§1.2) | `:69` | MOVED | |
| `:70` lock `FOR UPDATE`, `transport = 'as2'` (§1.1 H5, §1.2) | `:71` | MOVED | |
| `:75` duplicate branch (§3.3) | `:76` | MOVED | |
| `:86-92` the only writes (§3.3, §9.1#5) | `:87-93` | MOVED | |
| `:88` `transmission_id = COALESCE(…)` (§1.1 H3, §9.1#4) | `:89` | MOVED | |
| `:100-104` `dispatchBindingOf` (§1.2, §3.2 E2) | `:101-105` | MOVED | |
| `:105-132` `resolveReceiptSequence` (§1.2) | `:106-139` | CHANGED | `const next = environment !== 'production' ? 'pending' : status === 'received' ? 'sent' : 'rejected';` (`:114-115`): a staging receipt settles its attempt to `'pending'` and leaves S and A on the row (the UPDATE at `:131-133` sets only `dispatch_status`). |
| `:110-111` sequence lock (§1.2) | `:117-118` | MOVED | |
| `:116-123` spend S (§1.2, §3.3) | `:123-130` | CHANGED (minor) | `environment` now the local (`:114`, may be undefined) instead of a cast. |
| `:117` its spent list (§3.5) | `:124` | MOVED | still `'SEQUENCE_FROZEN','SEQUENCE_DISPATCHED','ECTD_TRANSMITTED','GOVERNED_SIGNATURE_VOIDED'`: **not** `TRANSMIT_BLOCKED` or the retirement action, unlike `signatureSpentBy` (`submission-service.ts:1216-1218`). |
| `:124-126` CAS on (S, A) (§1.2) | `:131-133` | MOVED | `$3` is now `next`, which may be `'pending'`. |
| `:129-131` `already-resolved` read (§3.3) | `:136-138` | MOVED | |

### `server/services/submission-gateways/as2-transport.ts` (944 lines, untouched)

| Cited | Today | Status |
|---|---|---|
| `:694` idle timeout; `:726` handler (§1.1, §9.1#2) | same | SAME |
| `:893` `trackingId`; `:893-898` 4xx → REFUSED_BY_AGENCY (§1.1 H1, H3, §9.1#4) | same | SAME |
| `:939` MDN `receiptId` (§1.1 H4, §9.1#4) | same | SAME |

### `server/services/submission-gateways/index.ts` (427 → 434 lines; `026c0e96f`, `edd225c02`)

| Cited | Today | Status | Note |
|---|---|---|---|
| `:171-189` (§1.1 H5, §9.1#7) | `:171-189` (`refusedBeforeWire` doc `:173-199`, fn `:200-207`) | CHANGED | `:183` read "the FDA SFTP client-module refusal"; now "FDA ESG's launch-ceiling refusal, P-93". The SFTP refusal no longer exists. |

### `server/routes/submissions.ts` (`76adba84d` zod 4, `4da5d362a`)

| Cited | Today | Status | Note |
|---|---|---|---|
| `:102-110` `CODE_STATUS` (§1.3) | same | SAME | |
| `:1483` P-34 door (§1.3, §3.7) | `:1492` | MOVED | handler at `:1495`. |
| `:1514` P-35 door (§1.3, §3.7) | `:1523` | MOVED | handler at `:1526`. |
| `:2050-2089` governed-precheck (§1.3) | `:2059-2098` | MOVED | handler `:2081`. |
| `:2056` step enum (§1.3) | `:2065` | MOVED | the enum itself is at `:2068` (it was `:2059` at base: the citation was 3 lines off already). |

### `server/routes/mdx-submission-gateway.ts` (`76adba84d`, no shift)

| `:571` as2-receipt route (§1.2) | same | SAME | (the `router.post` is at `:570`; off by one at base too) |
|---|---|---|---|
| `:573-580` tombstone (§1.2) | same | SAME | |
| `:583-645` technical rejection (§1.2) | same | SAME | |

### `docs/runbooks/fda-esg-production-uat.md` (`edd225c02`)

| Cited | Today | Status | Note |
|---|---|---|---|
| `:276-307` §5.4 status patch (§1.2) | `:271-302` | MOVED | |
| `:325-365` §7 rollback (§1.2) | `:320-360` | CHANGED (copy) | "or the SFTP PUT lands in `/incoming/` (`fda-esg.ts:307`)" removed (`:322-324`); the manual SQL is unchanged. |
| `:335-341` "Manual rollback" SQL (§1.2) | `:330-336` | MOVED | |
| `:418-420` §9 manual patches (§1.2) | `:439-441` | MOVED | |
| (new, uncited) | `:362-416` §8 "A sequence over 1 GiB is refused before signing (P-93)", with read-only queries for SFTP rows (`:396-404`) and `'transmitting'` sequences (`legacy_unbound`, `:406-413`) | — | P-93's runbook edit has landed (C9 order). |

### Unchanged files (no commit since `ffd2bd772`): all SAME

| File | Cited lines (design §) |
|---|---|
| `server/routes/c2c/actions.ts` | `:111`, `:650-656` (§0, §1.3), `:620-718`, `:633`, `:215-221` (§1.3), `:104-111` (§1.2) |
| `server/services/part11/signature-persistence.ts` | `:922-933`, `:866-884` (§1.3) |
| `server/services/ectd/filed-sequence-rejection.ts` (406 lines) | `:147-165`, `:247-259` (§1.2), `:84-92` (§1.5) |
| `server/services/ectd/shadow-finding-disposition.ts` | `:302-309` (§1.3) |
| `server/routes/governed-signed-act.ts` / `server/services/part11/governed-signature-ceremony.ts` | `:278` / `:227` (§1.3) |
| `server/services/regulatory/lifecycle-signature.ts` | `:73-88` (§1.4) |
| `shared/schema/submissions.ts` | `:60` (§1.4) |
| `client/src/concept2cure/mdx/surfaces/OfficialEstarAttachments.tsx` | `:116` (§1.4) |
| `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx` | `:128-131` (§1.4, §7 #11), `:149-157` (§1.6, C2), `:554`, `:584-586` (§1.6), `:586` (C2) |
| `server/services/submission-gateways/types.ts` | `:80-82` (§1.5) (file touched by `edd225c02` elsewhere; no shift) |
| `server/routes/mdx-analytics.ts` | `:97` (§1.5) |
| `server/services/ana-ri/mdx-command-handlers.ts` | `:725-830` (§7 #12, §9.1#8) (touched by `edd225c02` elsewhere; no shift) |
| `tests/mdx-submission-gateway-signing-authority.test.ts` | `:142` (§1.2) |
| `client/src/concept2cure/v2/__tests__/gatewayTransmittalsReadOnly.test.tsx` | `:63-66` (§1.2) |
| `tests/mdx-submission-gateway-transmit-bundle-guard.test.ts` | `:811-838` (§1.2) |
| `.design/claude-convergence/D7.md` | `:127-201` (§1.6), `:164-196` (§5.0) |
| `.design/claude-convergence/COORDINATION.md` (cited as `COORDINATION.md`) | `:8` (§5.0) |
| `docs/evidence/AUDIT-REMEDIATION/2026-10-14/agency-assets/fda-as2-guide.txt` | `:147-155` (§1.5, §3.4), `:344-345` (§1.5) |
| `docs/LAUNCH_DEFINITION_OF_DONE.md` (touched, P-92 block not shifted) | `:1828-1843` (§0, §9.1#8), `:1841-1842` (§5 C1). **Amended by P-108 at `:2239-2279`.** |
| `docs/evidence/W5/2026-11-01/README.md` (touched by `79f4e38a5`, no shift) | `:114-121` (§0, §8 Q10), `:89-92` (§7 #8), `:38` (§1.8) |
| migrations | `20260509_submission_gateways.sql:39`, `20260926_vault_documents_record_immutability.sql:135-136` (§3.2 E6, §9.1#6) |

### Other changed files

| File / cited | Today | Status | Note |
|---|---|---|---|
| `server/services/auditService.ts:269-330` (§1.3) | `:285-346` | MOVED (additive) | `writeChainedAuditRow` gains `occurredAt` (`sealedInstant` `:277-283`; P-86). |
| `server/services/auditService.ts:300-327` reason write (§1.3) | `:316-343` | MOVED | |
| `server/services/submission-gateways/__tests__/fda-esg-hardening.test.ts:592` the one rollback caller (§1.2) | `:587` (call at `:595`) | MOVED | `edd225c02`. |
| `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx:432-460` `VaultVersionPicker` (§1.4) | `:457-485` (fn `:458`) | MOVED | |
| `…/VaultLibraryResults.tsx:350-359` `PickedVaultVersion` (§1.4) | `:375-384` (interface `:376-386`) | MOVED | |
| `shared/constants/domain/vault-taxonomy.ts:74`, `:121` (§1.4) | `:75`, `:122` | MOVED | |
| `client/src/concept2cure/_shared/components/EsignModal.tsx:131-205` (§1.6) | `:131-206` | MOVED (additive) | `commitRefusal` may be a function of the meaning (`:157-159`, B7). `renderMeaningDetails` `:149`, `signedRows` `:155` unchanged. |
| `client/src/concept2cure/v2/styles/app-v2.css:3924-3929` `.pj-more` (§1.6) | `.pj-more` rules `:4042-4048` | MOVED | the cited range was already 6 lines off at base (`.pj-more` was `:3930-3936`). New `.pj-more` selectors since: `.pj-objective :is(…, .pj-more)` (`:1328`) and `.pj-main .pj-sec > .pj-more` (`:4000`). |
| `docs/evidence/RIM/2026-11-08-designs/p93-sequence-size-limit-retire-sftp.design.md:618-623`, `:676-680` (§6, §8 Q11) | — | CHANGED | not on origin at `ffd2bd772` (added `b0bb8dccc`); today those lines list P-93's C-commit deletions and red tests. The revised P-93 design (§6.1, `:750-801`) agrees with P-92: "cannot settle the ones this section named, because none of them is bound"; P-93's removing commit `edd225c02` does not name P-92. |

### `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` (`cf231e9e9`, `eac69256c`, `8f837f5ed`)

| Cited | Today | Status | Note |
|---|---|---|---|
| `:85-92` `SeqRow` (§1.6) | `:87-94` | MOVED | still no `dispatchStatus`. |
| `:1735` `TransmitReadiness.dispatchStatus` (§1.6) | `:1769` | MOVED | |
| `:1835` raw "Dispatch status" (§7 #11) | `:1870` | CHANGED | `['Dispatch status', dispatchStatusWords(t.dispatchStatus)]`; `'transmitting'` reads "a send is in flight and not yet confirmed; confirm at the agency before sending again" (`:1760-1764`). |
| `:1874-1937` `DossierTransmissions` (§1.6) | `:1911-1980` | CHANGED (copy) | each row adds " to the agency's test/production environment" and, for staging, "(a test send is not a filing)" (`:1956-1960`); raw status chip and `error_message` unchanged (`:1949`, `:1961`). |
| `:1946-2013` `TransmitPanel` (§1.6) | `:1989-2061` | CHANGED (copy) | environment options and the button ("File sequence N with the agency" / "Send sequence N to …"). |
| `:2003` the held line (§1.6, §4) | `:2051` | MOVED | still `Transmit is not available: {clause(blockedBy)}.` with `resendRefusal`'s raw token. |
| `:2015-2030` `PackageAndTransmit` (§1.6) | `:2063-2078` | MOVED | |
| `:2032+` `DispatchWorkspace` (§1.6) | `:2080+` | MOVED | |

### `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx` (committed blob; `0b33248ba`, `68c27e09f`, `eac69256c`, `facc62cba`)

| Cited | Today | Status | Note |
|---|---|---|---|
| `:294-301` `GovernedFlow`, `GOVERNED_LABEL`, `GOVERNED_PAST` (§1.6) | `:308-315` | MOVED | |
| `:788-812` `precheckRefusal` (§1.6) | `:876-900` | MOVED | |
| `:814-831` `requestGoverned` (§1.6) | `:902-919` | MOVED | |
| `:844-900` `runGoverned` (§1.6) | `:932-989` | CHANGED (additive) | sign payload adds `...transmitEnvironmentField(f)` (`:946`). |
| `:888` notice with signature id (§7 #11) | `:977-978` | MOVED | |
| `:914` "Request failed. Nothing was sent." (§7 #1) | `:1009` | CHANGED | `throw new Error(\`${clause(done.error ?? 'The server did not confirm the transmit; check the transmittal list before sending again')}.${after}\`)`: "Nothing was sent." is no longer appended (`eac69256c`). |
| `:920` transmit notice with signature id (§7 #11) | `:1016-1018` | CHANGED (shape) | `transmittedSentence(…, \`signed by … server-confirmed under signature ${signatureActionId}\`)`: still prints the id. |
| `:939`, `:960` notices (§7 #11) | `:1037`, `:1058` | MOVED | |
| `:1744-1745` `DispatchWorkspace` key (§1.6) | `:1830-1831` | MOVED | |
| `:1910-1962` the `EsignModal` mount (§1.6) | `:1996-2048` (mount `:1998`) | CHANGED (additive) | transmit target line is `transmitTargetLine(flow.transmit)` (`:2017`); `targetMeta` still prints `ectd-sequence:${flow.seq.id}` (`:2008`). No `renderMeaningDetails`/`signedRows` passed. |

### Count (unique cited ranges, as listed above)

| SAME | MOVED | CHANGED | GONE | Total |
|---|---|---|---|---|
| 49 | 94 | 31 | 3 | 177 |

Each distinct cited range counts once (a range cited in several sections is one row). By file:
`submission-service.ts` 17 MOVED / 15 CHANGED; `fda-esg.ts` 32 MOVED / 2 CHANGED / 3 GONE (`:630-660`, `:749`,
`:782`); `fda-esg-receipts.ts` 17 MOVED / 3 CHANGED; `as2-transport.ts` 5 SAME; `index.ts` 1 CHANGED;
`routes/submissions.ts` 1 SAME / 4 MOVED; `mdx-submission-gateway.ts` 3 SAME; UAT runbook 3 MOVED / 1 CHANGED;
unchanged-files table 40 SAME; other changed files 9 MOVED / 2 CHANGED; `SubmissionSeqWorkspaces.tsx` 5 MOVED / 3
CHANGED; `SubmissionCenter.tsx` 7 MOVED / 4 CHANGED. Many "CHANGED" rows in `submission-service.ts` are additive (a
new intent, code or list entry beside what the design cites); the ones that change P-92's own plan are
`:1035-1043`, `:1124-1139`/`:1131-1132`, `:1247-1268`, `:1276-1323`, `:1712-1744`, `:2331-2335`, `:2494-2500` and
`:2685-2693`.

---

## 2. Statements no longer true on today's trunk

### §0 and §1.1 (how a sequence ends `'transmitting'`)

1. **"After slice 2, only a production attempt can be held" (§0 table), "After slice 2, a staging attempt never holds"
   (§1.1 :109), E3 "(Pre-slice-2 rows only)".** False. A staging send that fails after the wire is released only when
   its signature void reaches a record Gate 1 reads (`releasedTestSend`, `submission-service.ts:3238-3254`); otherwise
   `TEST_SEND_STILL_HELD` (`:3216-3217`: "the sequence stays held as transmitting until a person resolves it"). The
   runbook says so (`docs/runbooks/ectd-transmit-path.md:175-183`: "A test hold is not a held send under P-92").
   Coordinator C3 (design §10.1) routes them to slice 2's runbook query.
2. **"`releaseTransmitSlot` (:2494-2500) runs only before the wire".** Now also releases a voided test send after the
   wire, and returns whether it released (`submission-service.ts:2912-2930`, `:3244-3245`).
3. **H5 citations** `index.ts:171-189` and `fda-esg.ts:630-660`: the SFTP refusals no longer exist (`edd225c02`);
   `index.ts:183` now names the launch-ceiling refusal. The historical claim (pre-2026-09-23 SFTP holds are L) stands.
4. **H5′ "a bundle over 1 GiB, `fda-esg.ts:749`" … "`readVerifiedBundle`, :782" … "Possible until P-93 retires the
   branch".** P-93 has retired it: `:749` and `:782` are GONE; `createTransmittalRow` writes only `'as2'`
   (`fda-esg.ts:338`); an over-1-GiB package is refused before any row (`:650-653`). No new H5′ can occur; old
   `transport = 'sftp'` rows remain (runbook query `fda-esg-production-uat.md:396-404`). And every SFTP attempt
   "ended before `connect()`" (P-93 design `:753-757`; `edd225c02` message: "No image ever shipped the module"), so H5′
   is a **proven-never-left** row: P-108 1(b) applies to it.
5. **H5/L "the binding columns arrived only on 2026-10-14".** The migration file is dated 10-14; it and its code
   (`e1f3fd425`) reached trunk 2026-10-17 (P-93 design `:766-777`; UAT runbook `:397`, `:407`). P-108 2(c) uses 10-14.
6. **H2 "`nextReceiptStatus('in_transit', 'received')` files the sequence".** Only for a production binding now
   (`fda-esg-receipts.ts:114-115`).

### §1.2 (what clears a held sequence today)

7. **Slice 2's release rule is missing.** Two new exits exist: (a) a staging post-wire failure is voided then released
   (`submission-service.ts:3162-3196`, `:3238-3254`); (b) a verified staging MDN settles the attempt to `'pending'`
   (`fda-esg-receipts.ts:109-115`), leaving S and A on the row (`:131-133` sets only `dispatch_status`). Neither
   applies to a production hold. `fda-esg-receipts.ts` is 139 lines, not 132, and slice 2 is on trunk (not "slice 2's
   hold").
8. **P-86 now refuses a held sequence twice:** check 2b ("A send of sequence N is in flight and not yet settled … Record
   the agency's receipt, or wait for the send to settle", `filed-sequence-baseline.ts:444-447`) and the database
   trigger `SEQUENCE_FILED_NOT_REMOVABLE` for `'transmitting'` (`migrations/20261109_ectd_sequence_removal_guard.sql:154-158`).

### §1.3, §1.5 (machinery)

9. **"`applySequenceChangeWithAudit` … takes no `reason`".** It takes `audit.reason` (`:1484`, `:1505`), a `params`
   function of the act's instant (`:1468`, `:1490-1491`) and returns `{ occurredAt }` (`:1509`) (P-86). §3.3's "P-86
   D4 adds the same; whichever lands first" is done; only `afterUpdate` remains. It still sets no tenant context.
10. **`signatureSpentBy`'s list** now includes `'TRANSMIT_BLOCKED'` and `ECTD_SEQUENCE_RETIRED_ACTION`
    (`:1216-1218`), and Gate 1 reads `TRANSMIT_BLOCKED` as void (`:1122`). `fda-esg-receipts.ts:124` lacks both, so a
    shared `spendTransmitSignature` must pick one list.
11. **`toDispatchStatus(status)`** is now `toDispatchStatus(status, environment)` (`:2754-2759`); §3.3's one-argument
    call does not compile and must pass `'production'`.
12. **"No trigger guards either table" (§1.5).** `ectd_sequences` has `ectd_sequences_removal_guard` (BEFORE UPDATE,
    `WHEN (OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL)`) and the deferred `ectd_sequences_removal_recorded`
    (`20261109_ectd_sequence_removal_guard.sql:170-183`). They do not fire on P-92's live-row UPDATE, and there is still
    no CHECK on either status column.
13. **`precheckGovernedStep(…, step: SequenceSignatureIntent, …)`** is now `Exclude<…, typeof SEQUENCE_RETIREMENT_INTENT>`
    (`:1994-1995`).

### §3.2 E-rules that depend on SFTP or `transport`

14. **E2 "No `transport` filter, because bound SFTP-transport holds (H5′) exist and are releasable on FDA's letter".**
    Still no transport filter is needed for legacy rows, but under P-108 1(b) an H5′ release cites the platform's own
    proof, not FDA's letter; and no new `'sftp'` row can be written (`fda-esg.ts:338`).
15. **E5b's "SFTP" arm** now only meets legacy rows. Coordinator C4 (§10.1) will turn H3's 4xx arm, with a proven
    pinned peer, into a transport refusal that releases (a separate F1 repair, not landed); E5b's 4xx clause then
    covers only unproven peers.

### §3.4 ("released over the size")

16. **"over the size FDA's channel takes … read from P-93's one constant once P-93 lands, and until then
    `transport = 'sftp'`, which `fda-esg.ts:749` sets"; statement "larger than FDA's documented channel takes".**
    P-93 has landed. Its one constant is `LAUNCH_SEQUENCE_MAX_BYTES = 1024 ** 3`
    (`server/services/ectd/ectd-regional-rules.ts:402`), whose comment says "It is NOT an agency limit … no message
    states it as FDA's: it is Concept2Cure's launch scope" (`:395-398`); P-108 2(b): "never call 1 GiB FDA's limit".
    The refusal clause is `launchSequenceSizeRefusal` (`:410-421`): "the package is X GiB, and at launch Concept2Cure
    sends packages of up to 1 GiB to FDA". Its sentences: readiness/transmit, "Refusing to transmit: <clause>. The
    sequence is dispatched, so its leaves can no longer be changed, and it cannot be sent as it is."
    (`submission-service.ts:1787-1795`, via `withPackageSizeRefusal` `:2999-3017`); the gateway, "Refusing to transmit
    to FDA: <clause>. Nothing was sent." (`fda-esg.ts:652`). `:749` is GONE. The H5′ release statement must also drop
    "FDA has confirmed in writing" (P-108 1(b)) and need not say it is stranded (P-108 2(a)).

### §3.3, §3.5, §3.7 (effects, estimates)

17. **§3.7 estimates:** `fda-esg-receipts.ts` is 139 lines (not 132), so "under 340 lines after" starts from 139;
    `submission-service.ts` is 4731 lines; the cited dynamic imports are `:3169`, `:3495` (and `:3057`, `:3315`), and
    none imports `fda-esg-receipts.ts`. §3.7 omits a file P-92 now must edit: `filed-sequence-baseline.ts`
    (`boundProductionSend`, checks 3/4, `:327-354`, whose note says "When P-92's 'released as not received' is built,
    checks 3 and 4 exclude a released attempt too"; and check 2b's sentence, `:446`). Check 4 counts **any**
    non-staging `ECTD_TRANSMITTED` (`:346-353`), which P-92's release writes for S, so the exclusion must cover it.
18. **§3.3 "`releaseTransmitSlot` gains an optional query surface"**: still possible, but it now returns a boolean
    that `releasedTestSend` relies on (`:3244-3245`).

### §5.0 (holders)

19. Slice 2 (`eac69256c`), repair A (`2c0b4c8fe`), B (`cec19b461`), C (`0f5db6192`), P-93 (`b21dbdffa`, `edd225c02`,
    `96ca836e5`, `17463713f`), P-94 (`380fa4782`, then P-108 3(b) `b14086c7d`, `217f50153`), P-86 C1 (`2b79ca12e`,
    `466c8f7bb`) and P-99 C1 (`27b901c49`, `refuseCompileOfSequenceOnFile` `server/routes/ectd-compile.ts:303-323`) are
    on trunk. "Slice 2's edits are in the working tree now" is false for `fda-esg-receipts.ts`,
    `fda-esg-receipts.pglite.test.ts`, `ectd-transmit-path.md`, `SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx`,
    `As2ReceiptUpload.tsx`, `dossierTransmissions.test.tsx`. Holds on `submissions.ts` and `GatewayTransmittals.tsx`
    are granted and C2 lands under F1 now (coordinator C6, §10.1). Missing row: `filed-sequence-baseline.ts` (P-86's).
    P-86 C2 (its route) has not landed. `SubmissionCenter.tsx` has uncommitted D7-A layout edits in the shared
    checkout; D7-A2 is still not on trunk (`fb447dddc`: "C3 waits for D7-A2").

### §6 (composition)

20. **P-86 row:** "not yet built" (C1 landed); "Released → … P-86 checks 3 and 4 refuse. So a released sequence … is
    sent again, never retired" and "A released one over 1 GiB (H5′) … is stranded" are contrary to P-108 2(a) and to
    P-86's code note (`filed-sequence-baseline.ts:327-330`). "P-93's design says 'P-92's signed act is the only way
    out' (`:618-623`, `:676-680`)" is no longer true (P-93 design `:750-801`). Check 2b's sentence is P-92's to change
    (P-86 landed first). Today check 3 excludes only an attempt with a chained `TRANSMIT_BLOCKED`, `transmitted false`,
    naming its signature (`:336-340`).
21. **P-93 row:** landed; the runbook edit order (C9) is satisfied; "stays stranded under P-86 check 3" is superseded
    by P-108 2(a).
22. **P-94 row:** onboarding uploads are no longer placed in a sequence (P-108 3(b), `b14086c7d`; route removed
    `217f50153`), so there is no "unapproved onboarding leaf" refusal for a re-send to meet.
23. **Repairs A–C row:** all three landed (not "A next").

### §4, §7, §8

24. §4's "needs the coordinator's recorded ruling" (C6 gave it). §8 Q2–Q11 are answered (P-108 1(a)-(c), 2(a), 2(c);
    coordinator C2-C6, C9), so §7 items 3, 4, 5, 6, 8, 12, 15 change from "owed/asked" to "decided".
25. **§7 #1** "`runTransmit` says 'Request failed. Nothing was sent.' (`SubmissionCenter.tsx:914`)": it now says
    "Request failed." without "Nothing was sent." (`:1009`, `eac69256c`). The route still answers a `GatewayError` with
    500 `'Request failed.'` (it has no `code`; `server/routes/submissions.ts:126-134` and the 500 at the end of
    `fail()`), so the gateway's own sentence still does not reach the screen.
26. **§7 #11** "`TransmitFacts` prints the raw 'Dispatch status' (`:1835`)": false (`dispatchStatusWords`, `:1870`).
    The held line itself (from `resendRefusal`) still shows the raw `'transmitting'`.
27. **§7 #3, §8 Q3** "a release still asks for FDA's letter": amended by P-108 1(b) (`docs/LAUNCH_DEFINITION_OF_DONE.md`
    P-108 item 1(b)).

---

## 3. P-108 1(b): what an FDA ESG transmittal row records about "nothing left"

Paths are `bc7ffda39`. **No column of `submission_transmittals` holds a structured "transmitted: false" marker.** The
proof flag `NOTHING_TRANSMITTED` (`types.ts:583`) lives only on the thrown error (`TransportError.transmitted`
`types.ts:482-490`, `ValidationError.transmitted` `:586-597`, `UnverifiedTransportError.transmitted` `:512-514`) and is
read once, in memory, by `refusedBeforeWire` (`index.ts:200-207`). What persists is listed below.

### 3.1 Positive records (something was written that says nothing went out)

| Record | Written at | What it proves | Caveat |
|---|---|---|---|
| **Chained `TRANSMIT_BLOCKED` audit row** on `ectd_sequence:<id>`: `transmitted: false`, `reasonCode 'pre_wire_refused' \| 'approved_package_changed'`, `signatureActionId`, `reason 'Transmission was refused before any package reached the agency.'` | `submission-service.ts:1441-1446` (`writeBlockedTransmitEvent` `:1429-1447`), called from `voidingSignatureOnRefusal` `:1388` when the transmit was refused before the gateway or with a marked error, and after a `transmitted: false` result (`:3194`) | The strongest record: structured, chained, names the signature (one signature = one attempt). P-86 check 3 already relies on it (`filed-sequence-baseline.ts:336-340`). | Not on the transmittal (it names no transmittal or attempt id). It is written only for an attempt refused before the wire, whose claim is never taken or is released (`:3384`, `:3419`, `:3438`, `:3455`, `:3496`), so a held attempt never has one. |
| `error_message` text of a `NOTHING_TRANSMITTED` error, `status 'rejected'`, `error_class 'transport'` (via `recordTransmitFailure` `fda-esg.ts:571-574`): "AS2 signing/encryption preparation failed. Nothing was transmitted." (`:675`); "The original AS2 binding could not be persisted. Nothing was transmitted." (`:592`); NOT_DELIVERED: "… Nothing reached FDA: the request was never released to an authenticated FDA server (…), or FDA's TLS layer refused it. …" (`:440-446`) | as cited | The code's own statement, persisted. The first two are before the binding (`:681`) and the POST (`:687`): **no message formed / refused before the wire**. | Unstructured text only. `error_class 'transport'` is **not** distinctive: a proof-less `TransportError` after the POST also lands there ("The tenant-bound AS2 receipt binding could not be persisted.", `:590`, `:593`, when `sent` is null). NOT_DELIVERED means "never reached an authenticated FDA server" (`as2-transport.ts:805-816`), which includes the server's TLS refusal alert after the request was released (`:660-666`): refused **at** the wire, not strictly before it. Each of these releases the claim, so a held row carries one only if the release write then failed (`submission-service.ts:3496` throws, `voidable` sees an unmarked error). |
| `status 'rejected'`, `error_class 'auth'` (`CredentialError`) | `fda-esg.ts:567-570`; throw sites `:161`, `:194`, `:254`, `:277`; `gateway-accounts.ts:164`, `:197`, `:204` | The one structured column value that is distinctive: only `CredentialError` writes `'auth'`, and every site raises it before any request is opened (audited in `__tests__/refused-before-wire.test.ts`, per `index.ts:186-189`). | Releases the claim too (`index.ts:203`), so not a held send. |
| `transport = 'sftp'` (legacy rows only) | written by the retired `createTransmittalRow(…, transport)` (base `fda-esg.ts:360-381`); never written since `edd225c02` (`:338`) | Nothing could leave: `ssh2-sftp-client` was never in `package.json`/lockfile, and the image ran `npm ci --omit=dev` (P-93 design `:753-757`; `edd225c02` message). | A **deployment fact**, not a row record. The row's own `error_message`/`error_class` vary (`'auth'`, `'transport'` "requires 'ssh2-sftp-client' package; nothing was sent", or `'gateway'` from `readVerifiedBundle`). |

No positive record exists **on the row** for the unmarked pre-wire failures that do hold a claim: `readVerifiedBundle`'s
`ValidationError` without the proof (`bundle-integrity.ts:37-75`, called at `fda-esg.ts:671`; H7); a non-credential
error from `resolveGatewayAccount` (`:666`) or a certificate file read in `credentialsFor` (`:137-138`, `:170`,
`:212-214`); a failed `in_transit` write (`:668`). Each is written `'rejected'`, `error_class 'gateway'`, with the raw
cause (`:575-579`), indistinguishable by columns from a post-wire generic failure.

### 3.2 Absence-based inferences (no record; conclusive only through code order)

| Absence | Why it implies nothing left | Why it is not a record |
|---|---|---|
| **No `metadata.as2`** on an AS2 row bound by `metadata.dispatchBinding` | The binding `{ messageId, mic, micAlgorithm, environment }` is written by an awaited `writeAs2Metadata` (`fda-esg.ts:681`) before `attemptDelivery(() => postAs2(…))` (`:687`), "before any byte leaves this process" (`:680`); the Message-ID is minted at `:672`. `createTransmittalRow` writes `as2: undefined` (`:341`), and no later writer removes it (`writeAs2Metadata` uses `jsonb_set`, `:588`; the receipt ingest spreads `...current.metadata`, `fda-esg-receipts.ts:83`). Its write failure, DB error **or** zero rows (`:590` is caught at `:591`), is always rethrown for `'as2'` as the marked `TransportError` (`:592`): yes, distinctly marked. This is P-108's "no message formed". | It is the absence of a record. It holds only for rows from code since `e1f3fd425` (the binding and `dispatchBinding` arrived together) and only for `transport = 'as2'`. If `recordTransmitFailure`'s own write fails after the binding failure, the marked error is replaced by the DB error (`:727` awaits it), the row stays `'in_transit'` with no `metadata.as2` and no `error_message`, and the claim stands: then this absence is the **only** evidence. `fda-esg-receipts.ts` `bindingOf` refuses such a row any receipt (`:18-24`, "cannot be attached by guessing"). |
| `status = 'pending'` | `in_transit` is written (`:668`) before any byte. | Absence of a later write (a crash, or a failed `in_transit` write whose failure-write also failed). |
| **No transmittal row** for a bound attempt (H8) | `createTransmittalRow` precedes everything that sends (`:654`, outside the `try`). | Nothing records the attempt at all; a missing row is equally a non-FDA route, a read failure or a legacy claim. |

**Not proof of anything:** `transmission_id IS NULL` (H3's refusal write sets none, `:448-453`, though bytes left;
`checkStatus`'s "never transmitted", `:743-745`, overstates it); `http_status IS NULL` (a reset after the whole request
was written is DELIVERED_UNCONFIRMED with no status, `as2-transport.ts:884-886`); no `metadata.as2Receipt` (any failed
attempt); `metadata.sentPackage` (kept by the guard before any send, `index.ts:328`).

**Short answer.** The only positive, structured, chained proof is `TRANSMIT_BLOCKED` (`submission-service.ts:1441`),
and it never exists for a held attempt because it accompanies a claim release. On the transmittal row, positive proof
is only the error text of a `NOTHING_TRANSMITTED` error (plus `'auth'`), which a held row carries only after a failed
release. For the held cases P-108 1(b) targets (H7, H9 before the binding, failed failure-writes), the platform's
"proof" is the **absence** of `metadata.as2` (or a `'pending'` status, or no row), which is conclusive only by code
order. Legacy `'sftp'` rows rest on a deployment fact outside the row.

---

## 4. Item 4: functions present today

`server/services/submission-service/submission-service.ts` (4731 lines at `bc7ffda39`):

| Name | Lines | Note |
|---|---|---|
| `releaseTransmitSlot` | `:2922-2930` | returns `Promise<boolean>` |
| `claimTransmitSlot` | `:2863-2910` | `setTenantContextTx` `:2870`; spent check under the lock `:2877-2881`; CAS `:2891-2898` |
| `resendRefusal` | `:2728-2736` | (`TRANSMITTING_STATUS` `:2726`) |
| `sequenceTransmitReadiness` | `:3039-3118` | `resendRefusal` at `:3101`; P-93 `withPackageSizeRefusal` at `:3105` |
| `applySequenceChangeWithAudit` | doc `:1449`, fn `:1459-1516` | `params` as function `:1468`; `audit.reason?` `:1484`, written `:1505`; returns `{ occurredAt }` `:1509` |
| `signatureSpentBy` | `:1209-1225` | literal list `:1216-1218` (8 entries incl. `'TRANSMIT_BLOCKED'`, `${ECTD_SEQUENCE_RETIRED_ACTION}`) |
| `INTENT_MEANING_REFUSAL` | `:1014-1021` | |
| `voidingSignatureOnRefusal` | `:1364-1391` | 4-arg; TRANSMIT_BLOCKED at `:1388` |
| `precheckGovernedStep` | `:1992-2024` | `(id: number, step: Exclude<SequenceSignatureIntent, typeof SEQUENCE_RETIREMENT_INTENT>, ctx: { organizationId: number; userId: number }, opts: GovernedPrecheckOptions = {}): Promise<GovernedStepPrecheck>` (`:1992-1998`) |

`server/services/submission-gateways/fda-esg-receipts.ts` (**139 lines**): `bindingOf` `:18-24`; `nextReceiptStatus`
`:53-62`; `ingestFdaAs2Receipt` `:65-97`; `dispatchBindingOf` `:101-105`; `resolveReceiptSequence` `:106-139`.
