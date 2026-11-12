# P-99 C2's citations, re-verified at `dbeb901b17`

- **Design:** `docs/evidence/RIM/2026-11-08-designs/p99-restore-unrecorded-sequence.design.md`. Lines 1-996 are the
  2026-11-02 text, written against `a6d74b6d0`. Lines 997-1030 were appended by `bc7ffda39`. "Design L" below is a line
  of that file.
- **Trees:**
  - The design's tree is `a6d74b6d0`.
  - The earlier re-verification was against `bc7ffda39` (kept in the RIM session's working notes, not in the
    repository; this file supersedes it for C2).
  - This check is against `HEAD` = `dbeb901b17` (local `concept2cure-v2`). `git diff --stat 621a046eb4
    origin/concept2cure-v2` was checked for every file C2 edits: origin's 46 newer commits touch none of them (only
    `.design/claude-convergence/COORDINATION.md`, outside C2's code).
- **Scope.** Only what C2 depends on:
  - design §1 (L71-250);
  - §3.0 (L274-301) and all of §3.1 (L303-410);
  - §3.3 (L529-552);
  - §3.4's rows for `sent-package-read.ts`, `filed-sequence-pointers.ts`, `prior-sequence-loader.ts`,
    `submission-gateways/index.ts` + `types.ts`, `submission-service.ts` and `routes/submissions.ts` (L559-565);
  - §3.5 (L570-584);
  - §5's C2 bullet (L656-730).

  §3.2 (the statement), C3, C4 and §3.4's C1 row (`cmc/submission-spine.ts:129-175`, L558) are skipped. §3.5 and §5 C2
  cite no `path:line`; their path-only references are checked in §3 below.
- **Method:**
  1. Every `path:line` token in the in-scope lines was extracted mechanically, by `awk` over the design file. That
     gives 121 distinct (path, range) citations. A citation the design repeats is one row, with every design line
     listed.
  2. Each base line was mapped to HEAD through the hunks of `git diff -U0 a6d74b6d0 HEAD -- <path>`. Any cited line
     inside a hunk, or an insertion inside the range, flagged the row for reading.
  3. The code at HEAD was read at every mapped line of every file changed since `bc7ffda39`. The base side was read for
     each flagged row.
  4. For files unchanged since `bc7ffda39`, `git diff --quiet bc7ffda39 HEAD` passes for all of them together, and each
     mapped start line was spot-read at HEAD.
- **Changed since `bc7ffda39` among the cited files:**
  - `submission-service.ts` and `routes/submissions.ts`: `7ba85e00c3` (P-86 C2), `950e0dca97` (P-92 C1), `b149f7e267`
    (P-92 C4) and `87cf40648a` (P-92 C3).
  - `fda-esg-receipts.ts`: `950e0dca97`, `f71ca16bb4` and `87cf40648a`.
  - `SubmissionSeqWorkspaces.tsx`: `f52cc3be22` (D7-A2a), `a66c04fa56` (D7-A2b), `e5f8232246` (P-86), `130327d9c8`
    (P-92 C2), `b149f7e267` and `87cf40648a`.
  - `.design/claude-convergence/COORDINATION.md`.

  Every other cited file is byte-identical between `bc7ffda39` and HEAD.
- **Statuses:**
  - **SAME:** same line, same code.
  - **MOVED:** new line, same code. A change only in wording, comments or position is named in the note.
  - **CHANGED:** the code in the cited range now differs in substance (members, parameters, behaviour). The note quotes
    HEAD and says whether the design's sentence about it still holds.
  - **GONE:** the code no longer exists.
- **Short paths:**
  - `loader` = `server/services/ectd/prior-sequence-loader.ts`.
  - `svc` = `server/services/submission-service/submission-service.ts`.
  - `gw/` = `server/services/submission-gateways/`.
  - `reader` = `server/services/legacy-importer/filed-sequence-reader.ts`.
  - `pointers` = `server/services/legacy-importer/filed-sequence-pointers.ts`.
  - `routes/submissions.ts` = `server/routes/submissions.ts`.
  - `SSW` = `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`.

## Counts

| Status | Count |
|---|---|
| SAME | 65 |
| MOVED | 35 |
| CHANGED | 21 |
| GONE | 0 |
| **Total** | **121** |

The 21 CHANGED rows break down as follows (counted from the table rows by script):

- **CHANGED for the first time since `bc7ffda39`, where the earlier file had MOVED (5):**
  - `claimTransmitSlot`;
  - `governedPrecheckSchema`;
  - the governed-precheck route;
  - `PackageAndTransmit`;
  - `DossierTransmissions`.
- **CHANGED at `bc7ffda39` and changed again since (10):**
  - `SequenceSignatureIntent`, `INTENT_LABEL` and `INTENT_MEANING_REFUSAL`;
  - `signatureSpentBy` and its list;
  - `applySequenceChangeWithAudit`, which gained `afterUpdate`;
  - `precheckGovernedStep`;
  - `fda-esg-receipts.ts:116-123`, now `spendTransmitSignature`;
  - `COORDINATION.md`;
  - `TransmitPanel`.
- **CHANGED at `bc7ffda39`, with nothing new since (6):**
  - `fda-esg.ts` `createTransmittalRow`;
  - the ECTD_TRANSMITTED write, `svc:2952-2992` and its details `svc:2966-2991`;
  - `voidingSignatureOnRefusal`;
  - `mdx-sent-package.ts`;
  - `writeChainedAuditRow`.

The earlier file's row "No P-86 route was added" (`routes/submissions.ts:1517`) is no longer true: P-86's door is
`:1524`.

---

## 1. Citations

### `server/services/ectd/prior-sequence-loader.ts` (no commit since base)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 76 | `loader:303-369` readFiledManifestRows | `:303-369` | SAME | |
| 76 | `loader:316` | `:316` | SAME | |
| 78 | `loader:327-331` | `:327-331` | SAME | |
| 78 | `loader:352` | `:352` | SAME | |
| 78 | `loader:372-375` sameAgency | `:372-375` | SAME | |
| 79 | `loader:363` | `:363` | SAME | |
| 79 | `loader:356-361` | `:356-361` | SAME | |
| 80 | `loader:333-340` | `:333-340` | SAME | |
| 80 | `loader:365` | `:365` | SAME | |
| 80 | `loader:366` | `:366` | SAME | |
| 81 | `loader:169-231` loadLatestPriorManifestBySubmission | `:169-231` | SAME | |
| 82 | `loader:227-243` | `:227-243` | SAME | The refusal text is `:240-241`, as quoted. |
| 85 | `loader:400-432` loadFiledStateBySubmission | `:400-432` | SAME | |
| 86 | `loader:250` FiledRecordBasis | `:250` | SAME | |
| 87 | `loader:454-483` foldManifestRows | `:454-483` | SAME | |
| 87 | `loader:435` MODIFIED_FILE | `:435` | SAME | |
| 531 | `loader:323-331` the transmittal arm | `:323-331` | SAME | |

### `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx`

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 88 | `:86-91` notFoldedReason | `:86-91` | SAME | |
| 89 | `:118-128` compilesLine | `:118-128` | SAME | |
| 89 | `:119` | `:119` | SAME | `s.filed && s.basis !== 'transmit'` |
| 89 | `:147-165` leadLine | `:147-165` | SAME | |

### `server/services/audit/audit-archive.service.ts`, `migrations/20260509_submission_gateways.sql`

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 92 | `audit-archive.service.ts:1-36` | `:1-36` | SAME | |
| 98 | `20260509_submission_gateways.sql:39` | `:39` | SAME | `submitted_at timestamptz NOT NULL DEFAULT now()`. As the earlier file found, `bundle_sha256` is nullable on both trees (`:24`). |

### `gw/fda-esg.ts`, `gw/rest-gateway-helpers.ts`, `gw/ema-cesp.ts`

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 98 | `fda-esg.ts:360-381` createTransmittalRow | `:326-344` | CHANGED | As at `bc7ffda39`: `async function createTransmittalRow(req: GatewayTransmitRequest): Promise<number> {` (`:326`), with `'as2'` literal (`:338`). The transport parameter is gone (P-93). The design's claim holds: a pending row is written before any connection. |
| 100 | `fda-esg.ts:378` | `:341` | MOVED | Identical: `JSON.stringify({ ...(req.metadata ?? {}), dispatchBinding: binding ?? undefined, as2: undefined, as2Receipt: undefined, as2ReceiptHistory: [] })`. |
| 98 | `rest-gateway-helpers.ts:85-114` | `:85-114` | SAME | |
| 100 | `rest-gateway-helpers.ts:110` | `:110` | SAME | |
| 98 | `ema-cesp.ts:255-275` | `:255-275` | SAME | |
| 100 | `ema-cesp.ts:271` | `:271` | SAME | |

### `server/services/submission-service/submission-service.ts` (4 commits since `bc7ffda39`; +826/-19)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 99 | `svc:2439-2487` claimTransmitSlot | `:3665-3715` | CHANGED | New since `bc7ffda39` (P-92 C1, `950e0dca97`): `const releasedHold = await releasedSendHold(q, organizationId, sequenceId, null); if (releasedHold) throw new SubmissionError('DISPATCH_BLOCKED', releasedHold);` (`:3684-3686`). The design's claim holds: it still writes S and A (`:3696-3704`). |
| 100 | `svc:2922` dispatchBinding, top-level | `:4283` | MOVED | Identical. |
| 100 | `svc:2919-2920` metadata | `:4280-4281` | MOVED | Identical. |
| 103 | `svc:2952-2992` ECTD_TRANSMITTED, written "in the transaction that writes 'sent'" | `:4321-4365` | CHANGED | As at `bc7ffda39`. The status written is `const dispatchStatus = toDispatchStatus(result.status, environment);` (`:4316`), and `toDispatchStatus` returns `'pending'` when `environment !== 'production'` (`:3556-3561`). |
| 284 | `svc:2966-2991` ECTD_TRANSMITTED details | `:4335-4364` | CHANGED | The details insert `dispatchStatus,` and `...(environment !== 'production' ? { testSend: TEST_SEND_FILES_NOTHING } : {}),` (`:4351-4352`). Rule 2's keys are still written. Rule 2's row set has also changed: other code now writes ECTD_TRANSMITTED (see (g)). |
| 184 | `svc:979+` governedSignatureVerdict | `:1099+` | MOVED | |
| 184 | `svc:927-930` SequenceSignatureIntent | `:1014-1021` | CHANGED | Now `\| typeof SEQUENCE_RETIREMENT_INTENT \| typeof HELD_SEND_SETTLEMENT_INTENT \| typeof TECHNICAL_REJECTION_INTENT \| typeof HELD_SEND_REOPEN_INTENT;`. P-92's three intents are new since `bc7ffda39`. |
| 185 | `svc:933-939` INTENT_LABEL | `:1024-1034` | CHANGED | Adds `'retirement'`, `'settlement of the held send'`, `'record of the technical rejection'` and `'re-opening of the settlement'`. |
| 185 | `svc:949-955` INTENT_MEANING_REFUSAL | `:1044-1056` | CHANGED | Adds `retirementMeaningRefusal`, plus three P-92 entries that accept only `m === 'responsibility'` (`:1052-1055`). |
| 185 | `svc:957` payloadRefusal hook | `:1058-1059` | MOVED | `type SignaturePayloadRefusal` |
| 186 | `svc:1124-1139` signatureSpentBy | `:1244-1261` | CHANGED | See the next row. |
| 186 | `svc:1131-1132` the literal action list | `:1251-1254` | CHANGED | Now `… ${SIGNATURE_VOIDED_ACTION}, 'TRANSMIT_BLOCKED', ${ECTD_SEQUENCE_RETIRED_ACTION}, ${ECTD_HELD_SEND_SETTLED_ACTION}, ${ECTD_TECHNICAL_REJECTION_RECORDED_ACTION}, ${ECTD_HELD_SEND_REOPENED_ACTION})`. There is a second copy, `SIGNATURE_SPENDING_ACTIONS` (`gw/fda-esg-receipts.ts:156-157`), which lacks the last two. |
| 186 | `svc:1247+` voidingSignatureOnRefusal | `:1400+` | CHANGED | As at `bc7ffda39`: a fourth parameter `testSend: { refusedBeforeWire?, voided?, context? } = {}` (`:1404-1415`). The claim (P-23's wrapper) holds. C2 does not use it: the re-derivation is unsigned. |
| 187 | `svc:1276-1323` applySequenceChangeWithAudit, "no `reason`, no `afterUpdate`, no tenant context" | `:1495-1559` | CHANGED | `reason?: string` (`:1526`, written `:1548`, P-86 `2b79ca12e`). `afterUpdate?: (client: PoolClient) => Promise<void>` (`:1524`, run `:1540`, P-92 C1 `950e0dca97`). It still sets no tenant context: callers call `setTenantContextTx` first in `underLock` (`:2878`, `:3101`, `:3272`). Two of the design's three "no"s are now false. See (h). |
| 188 | `svc:2007` independentSignerRefusal | `:2331` | MOVED | |
| 188 | `svc:2028` recheckUnderSequenceLock | `:2352` | MOVED | |
| 188 | `svc:1712-1744` precheckGovernedStep | `:2035-2067` | CHANGED | `step: Exclude<SequenceSignatureIntent, typeof SEQUENCE_RETIREMENT_INTENT \| typeof HELD_SEND_SETTLEMENT_INTENT \| typeof TECHNICAL_REJECTION_INTENT \| typeof HELD_SEND_REOPEN_INTENT>` (`:2038`). Each newer act has its own precheck function, dispatched in the route (`routes/submissions.ts:2214-2226`). The design's "`precheckGovernedStep`'s step `'sent-record'`" (L564) goes against that pattern. The comment at `:2037` ("its precheck comes with its door (C2)") is stale: P-86 C2 landed (`precheckSequenceRetirement`). |
| 189 | `svc:123` SubmissionErrorCode | `:145` | MOVED | The union now also has `SEQUENCE_NOT_RETIRABLE`, `HELD_SEND_NOT_SETTLEABLE`, `TECHNICAL_REJECTION_NOT_RECORDABLE` and `HELD_SEND_NOT_REOPENABLE` (`:165-168`). |
| 189 | `svc:162` SUBMISSION_ERROR_STATUS | `:199` | MOVED | The same four codes, each 409 (`:232-237`). |
| 226 | `svc:2321` resendRefusal | `:3528` | MOVED | Wording only. The stored status is no longer quoted: "Sequence was already transmitted[ and the agency acknowledged it]; it is not sent again. A correction is a new sequence." (`:3533-3535`). It is still the source of the panel's "Transmit is not available: …". |

### `server/services/submission-gateways/index.ts` (no commit since `bc7ffda39`)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 100 | `index.ts:345` | `:352` | MOVED | `dispatchBinding: req.dispatchBinding ?? undefined,` |
| 101 | `index.ts:328` archiveSentPackage | `:328` | SAME | `:333-335`, after it, re-resolve the account (`resolveGatewayAccountForUse`). |
| 101 | `index.ts:344` sentPackage | `:351` | MOVED | |
| 102 | `index.ts:154-164` sentLeafManifest | `:154-164` | SAME | |
| 102 | `index.ts:346` leafManifest | `:353` | MOVED | |
| 356 | `index.ts:163` buildLeafManifest | `:163` | SAME | |
| 550 | `index.ts:341-347` server-stamped metadata | `:348-354` | MOVED | Identical. See (f). |

### `gw/sent-package-archive.ts`, `gw/sent-package-read.ts` (no commit since base)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 101, 122 | `sent-package-archive.ts:45-83` | `:45-83` | SAME | |
| 124 | `sent-package-archive.ts:27-33` SentPackageRecord | `:27-33` | SAME | |
| 125 | `sent-package-read.ts:42-91` readSentPackage | `:42-91` | SAME | |
| 126, 309 | `sent-package-read.ts:58` | `:58` | SAME | `await requireCurrentProgramAccess(q, { … programId: row.program_id });` |
| 127 | `sent-package-read.ts:29-38` sentPackageRecordOf | `:29-38` | SAME | |
| 127 | `sent-package-read.ts:64-67` | `:64-67` | SAME | |
| 128 | `sent-package-read.ts:68-71` | `:68-71` | SAME | |
| 128 | `sent-package-read.ts:84-86` | `:84-86` | SAME | |
| 129 | `sent-package-read.ts:87-89` | `:87-89` | SAME | |

### `gw/fda-esg-receipts.ts` (3 commits since `bc7ffda39`; +335/-8)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 194, 308 | `fda-esg-receipts.ts:42-50` requireReceiptActor | `:44-52` | MOVED | Identical (at `bc7ffda39` it was `:43-51`). See (i). |
| 103 | `fda-esg-receipts.ts:116-123` receipt reconciliation's ECTD_TRANSMITTED write | `:133-136` (call), `:160-171` (write) | CHANGED | New since `bc7ffda39` (P-92 C1). The inline spend-check and write became `export async function spendTransmitSignature(client, p)` (`:160-171`). It is called here with `details: { ...receipt, transmitAttemptId, status, environment, region: 'fda', gateway: 'esg', source: 'agency-signed-receipt-reconciliation' }` (`:133-136`). P-92's settlement also calls it (`svc:2900-2904`) and writes an ECTD_TRANSMITTED row with `source: 'held-send-settlement'`, `status: 'not-received' \| <toStatus>` and no `packageSha256`. `next` is `'pending'` for a non-production receipt (`:124-125`). |

### `server/routes/mdx-sent-package.ts`, `.design/claude-convergence/COORDINATION.md`

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 130 | `mdx-sent-package.ts:26-51` | `:29-54` | CHANGED | As at `bc7ffda39`: `readSentPackage(requestPgClient(req), …)` (`:37`), where it used to pass the pool. The claim holds: it is still the only caller (`git grep readSentPackage`: the module and this route). |
| 137 | `COORDINATION.md:48` (Stage 9 lane, "holds no file") | `:162` | CHANGED | The row was rewritten again; it was `:134` at `bc7ffda39`. It now carries D6 `ab29caae`, a → RIM note on the round-trip tests, and the 2026-11-08/09 trunk hand-offs. The claim holds: it still ends "done on push; holds no file. `prior-sequence-loader.ts` (RIM's) was not edited." |

### `server/services/legacy-importer/filed-sequence-reader.ts` and `filed-sequence-pointers.ts` (no commit since `bc7ffda39`)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 138 | `reader:705-708` readFiledSequenceArchive | `:708-711` | MOVED | |
| 327 | `reader:705` | `:708` | MOVED | |
| 139 | `reader:657-678` readFiledSequences | `:660-681` | MOVED | |
| 139 | `reader:121-129` FiledSequenceLeaf | `:121-129` | SAME | |
| 140 | `reader:456-465` | `:457-466` | MOVED | indexChecksumRefusal |
| 140 | `reader:509-537` | `:510-538` | MOVED | readRegional |
| 142 | `reader:374-399` leafFile | `:375-400` | MOVED | |
| 142 | `reader:326-343` leafHead | `:327-344` | MOVED | |
| 143 | `reader:356-371` leafAct | `:357-372` | MOVED | |
| 144 | `reader:168-170` isComplete | `:168-170` | SAME | |
| 148 | `reader:420-424` withdrawal keeps `fileName: ''`, `md5: ''` | `:421-425` | MOVED | |
| 145 | `pointers:62-82` bindPointers | `:93-113` | MOVED | |
| 147 | `pointers:119-122` outsideArchive | `:152-155` | MOVED | |
| 353 | `pointers:98-101` withdrawal takes the named leaf's section, name and md5 | `:129-132` | MOVED | It is in `keepBound` (`:118-134`), which `bindPointers` calls at `:101`. |

### Docs and the round-trip test (no commit since `bc7ffda39`)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 149 | `FILED_SEQUENCE_READER_2026-11-01.md:119-146` | `:124-151` | MOVED | |
| 154 | `FILED_SEQUENCE_READER_2026-11-01.md:163-164` | `:168-169` | MOVED | |
| 150 | `__tests__/filed-sequence-reader-round-trip.test.ts:12-17` | `:12-17` | SAME | |

### `gw/regional-packager.ts`, `ectd-packager/leaf-id.ts`, `lifecycle-operator.ts`, `sequence-manifest.ts`, `section-code.ts`, `ectd-sequence-binding.ts`, `package-sequence-lifecycle.ts` (no commit since base)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 157 | `regional-packager.ts:1500` | `:1500` | SAME | `ctdSection: p.leaf.ctdSection,` |
| 158 | `regional-packager.ts:130-142` | `:130-142` | SAME | |
| 167 | `regional-packager.ts:896` | `:896` | SAME | `ref.id = assign(leaf);` |
| 169 | `regional-packager.ts:143-149` | `:143-149` | SAME | |
| 169 | `regional-packager.ts:201-219` | `:201-219` | SAME | |
| 171, 333 | `regional-packager.ts:213` | `:213` | SAME | |
| 171, 333 | `regional-packager.ts:219` | `:219` | SAME | |
| 174 | `regional-packager.ts:107` | `:107` | SAME | `export { leafIdSlug, baseLeafId, createLeafIdAssigner, buildMd5Index, studyFolderSlug, commonDir };` |
| 344 | `regional-packager.ts:1304-1324` | `:1304-1324` | SAME | |
| 345 | `regional-packager.ts:883-899` | `:883-899` | SAME | |
| 166 | `ectd-packager/leaf-id.ts:39-41` | `:39-41` | SAME | |
| 166 | `ectd-packager/leaf-id.ts:54-64` | `:54-64` | SAME | |
| 159 | `lifecycle-operator.ts:135-138` | `:135-138` | SAME | |
| 159 | `lifecycle-operator.ts:237-250` | `:237-250` | SAME | |
| 160 | `sequence-manifest.ts:98-116` | `:98-116` | SAME | |
| 355 | `sequence-manifest.ts:98` | `:98` | SAME | |
| 170 | `shared/regulatory/section-code.ts:95` | `:95` | SAME | `ctdFolderSlug` |
| 170 | `section-code.ts:115` | `:115` | SAME | `normalizeCtdCode` |
| 183 | `part11/ectd-sequence-binding.ts:50-69` | `:50-69` | SAME | |
| 183 | `ectd-sequence-binding.ts:12-25` | `:12-25` | SAME | |
| 239 | `package-sequence-lifecycle.ts:187` | `:187` | SAME | |

### `server/routes/submissions.ts` (4 commits since `bc7ffda39`; +139/-2)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 190 | `:2053` governedPrecheckSchema | `:2165` | CHANGED | The line is the same. The schema's step enum now has `'retire', 'held-send-settlement', 'technical-rejection', 'held-send-reopen'` (`:2181`). It already has `evidenceDocumentId: z.string().uuid().optional()` (`:2192`, P-92), with a refine that refuses it unless `outcome` is given or `step === 'technical-rejection'` (`:2198-2201`). The design adds `evidenceDocumentId` for `'sent-record'` (L565), so it has to share that field and widen that refine. |
| 191 | `:2072` POST governed-precheck | `:2206` | CHANGED | The line is the same. The handler now routes `'retire'`, `'held-send-reopen'`, `'technical-rejection'` and `'held-send-settlement'` to their own functions (`precheckSequenceRetirement`, `precheckHeldSendReopen`, `precheckTechnicalRejection`, `precheckHeldSendSettlement`, `:2214-2226`). Only the other five steps reach `precheckGovernedStep` (`:2227-2234`). |
| 191, 565 | `:1486` P-34 waive | `:1496` | MOVED | |
| 191, 565 | `:1517` P-35 disposition | `:1629` | MOVED | Four signed-act handlers now sit between the two: P-86 `POST /sequences/:seqId/retire` (`:1524`), and P-92 `held-send/settle` (`:1551`), `held-send/reopen` (`:1574`) and `technical-rejection` (`:1598`). Each takes a `z.object({ signatureActionId, … })` with `limiter, requireRole(AUTHOR)` and dynamically imports `submission-service`. |

### `server/services/auditService.ts` (no commit since `bc7ffda39`)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 192 | `:269-330` writeChainedAuditRow | `:285-346` | CHANGED | As at `bc7ffda39`: `const occurredAt = sealedInstant(entry.occurredAt);` (`:298`), P-86. The claim holds. |
| 192 | `:300-327` the reason column | `:316-343` | MOVED | |

### `server/routes/ectd-compile.ts` (no commit since `bc7ffda39`)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 213 | `:350-371` spineForRequest | `:268-289` | MOVED | |
| 214 | `:1309-1336` | `:1309-1336` | SAME | |
| 215 | `:858` draft-backbone INSERT | `:853` | MOVED | |
| 215 | `:1314` | `:1314` | SAME | |

The lines stand. §1.6's sentence around them does not; see §2.

### `client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` (6 commits since `bc7ffda39`; +724/-111)

| Design L | At `a6d74b6d0` | At HEAD | Status | Note |
|---|---|---|---|---|
| 224 | `SSW:2032+` DispatchWorkspace | `:2714+` | MOVED | `onGoverned` now also carries `settlement?: SettlementRequest \| RejectionRequest` (`:2723`). |
| 224 | `SSW:2015` PackageAndTransmit | `:2240` | CHANGED | `({ sub, seq, acts, canSign }: { …; acts: DispatchActs; … })`, where it used to take `onTransmit`. It still renders `TransmitPanel` when `seq.status === 'dispatched'` (`:2245-2246`). |
| 225 | `SSW:1946-2013` TransmitPanel | `:2160-2237` | CHANGED | It takes `acts: DispatchActs` (`:2160-2161`). It still asks `governed-precheck { step: 'transmit' }` (`:2167`) and says "Transmit is not available: {clause(blockerForDisplay(blockedBy))}." (`:2224`). It now also hosts P-92's doors: `HeldSendSettlement` when `t.dispatchStatus === 'transmitting'` (`:2231`), and `TechnicalRejection` when `t.dispatchStatus === 'sent' && … region === 'fda'` (`:2233`). |
| 226 | `SSW:1874` DossierTransmissions | `:2066` | CHANGED | `({ programId, region, seq, onReopen })`, where it used to take `sequenceNumber`. It now carries P-92 C3's reopen. The claim holds: it still lists the region's transmittals (`/api/mdx/gateways/transmittals?program_id=…&region=…`, `:2071-2074`). |

---

## 2. In-scope claims with no line of their own, now false at HEAD

1. **§1.6 (L215-220), "Nothing refuses a sequence that is already sent … finds 0 lines".**
   - This is false since C1 (`27b901c49`; its real-PostgreSQL case is HEAD `dbeb901b17`).
   - `refuseCompileOfSequenceOnFile` is at `ectd-compile.ts:303-323`. It reads
     `SELECT dispatch_status FROM ectd_sequences …` (`:309`) and answers 409 `ECTD_SEQUENCE_ON_FILE` (`:321`). It is
     called at `:713`.
   - `server/services/ectd/assemble-from-core.ts` and `package-from-core.ts` still read no dispatch status (0 lines).
     `cmc/submission-spine.ts:314` reads one, for another purpose.
2. **§1.7 (L231-232), "D7-A1 and D7-A2 have not landed. P-92 proposes its door … inside `TransmitPanel`".**
   - D7-A1 (`c023b17ae0`), D7-A2a (`f52cc3be22`) and D7-A2b (`a66c04fa56`) landed on 2026-11-09, after `bc7ffda39`.
   - P-92's doors are in `TransmitPanel` (`SSW:2231`, `:2233`).
   - P-92 C4's technical-rejection door shows for a `'sent'` FDA sequence. §4's "the two never show together" (L596,
     outside this scope) is therefore no longer true for an FDA sequence.
3. **§1.5 (L196-208), P-92's and P-86's pieces "planned".** They are now code:
   - `afterUpdate` (`svc:1524`);
   - `setTenantContextTx` first in `underLock` (`svc:2878`);
   - transmittal first, then the sequence (`svc:2879-2881`);
   - the record merged with `||` (`gw/fda-esg-receipts.ts:323-324`, `heldSendSettlement`);
   - one precheck function per act (`routes/submissions.ts:2214-2226`);
   - P-86's door (`routes/submissions.ts:1524`).

   "Whichever lands first adds each optional field": both fields P-99 needs from `applySequenceChangeWithAudit`
   (`audit.reason`, `update.afterUpdate`) exist now.
4. **§1.8 (L242-244), "This clone is shallow … must be re-run in a full-history clone".**
   - This clone is not shallow now: `git rev-parse --is-shallow-repository` returns `false`. It has 19,354 commits and
     2 roots, the oldest dated 2025-11-20.
   - The deletion search was re-run on full history:
     `git log --all --diff-filter=D --name-only -- '*rederiv*' '*sent-record*' '*sent-manifest*' '*filed-record*' '*statement*'`.
     It finds 0 paths. The glob was checked against `*Editor*`, which lists deleted editors.
5. **Wrong at the design's tree as well: §1.4 (L144), "20 refusal codes".** `FiledSequenceRefusalCode` has 21 literal
   codes plus `BackboneProblemCode` (`reader:87-109`), at both trees.
6. **Wrong at the design's tree as well: §1.3 (L129), "Every refusal says nothing was downloaded".** Two refusals do
   not say it: `TRANSMITTAL_NOT_FOUND` (`sent-package-read.ts:52`) and `SENT_PACKAGE_NOT_KEPT` (`:60-63`). See (a).

## 3. Path-only references in §3.5 and §5 C2

- **These exist at HEAD:**
  - `gw/__tests__/transmit-records-what-was-sent.test.ts`;
  - `gw/__tests__/sent-package-storage-stub.ts`;
  - `server/services/submission-service/__tests__/_freeze-gate-fixture.ts`;
  - `server/services/ectd/__tests__/filed-state-what-was-sent.pglite.test.ts`;
  - `tests/db/ectd-filed-state-view.dbtest.ts` (changed by HEAD's C1 commit);
  - `server/services/ana/__tests__/ana-cannot-disposition-shadow-finding.test.ts`;
  - `docs/runbooks/ectd-transmit-path.md`;
  - `packageEctdSubmission` (`gw/regional-packager.ts:1023`).
- **These do not exist yet, as expected:** `sent-record-rederive.test.ts`, `sent-record-rederive.pglite.test.ts`,
  `submissions-sent-record.test.ts`, `ana-cannot-restore-sent-record.test.ts` and `docs/evidence/D7-SENT-RECORD-RESTORED/`.
- **`SequenceTransmitReadiness`** (`svc:3739-3761`) has no `sentRecord` field yet.

---

## 4. Answers a-l

**a. `readSentPackage`** (`gw/sent-package-read.ts:42-91`). It enforces project read access:

- It calls `requireCurrentProgramAccess(q, { organizationId, userId, programId: row.program_id })` (`:58`).
- That function throws `ProgramReadAccessError` 403 `PROJECT_PERMISSION_DENIED` when `canAccessReportProject` fails
  (`server/services/c2c/current-program-access.ts:129-143`).

It returns `Promise<{ record: SentPackageRecord; bytes: Buffer; programId: string }>` (`:45`, returned at `:90`):

- **bytes:** the file's bytes.
- **storage version id:** `record.storageVersionId`.
- **sha:** `record.sha256`. It is checked equal to the row's `bundle_sha256` (`:64-67`), and the bytes' length and
  SHA-256 are re-verified against the record (`:87-89`).
- **Its other fields:** `record.provider`, `record.sizeBytes` and `record.filename`.

What it refuses:

- `TRANSMITTAL_NOT_FOUND` 404 (`:52`);
- `SENT_PACKAGE_UNSCOPED` 409 when the row has no `program_id` (`:53-56`);
- `SENT_PACKAGE_NOT_KEPT` 404 (`:60-63`);
- `SENT_PACKAGE_MISMATCH` 409 (`:64-67`);
- `SENT_PACKAGE_TOO_LARGE` 413 over `getMaxGovernedExportBytes()` (`:68-71`);
- `SENT_PACKAGE_STORE_UNAVAILABLE` 503 (`:76-78`);
- `SENT_PACKAGE_INTEGRITY` 409 (`:79-80`, `:87-89`);
- `SENT_PACKAGE_MISSING` 409 (`:84-86`).

Not every refusal says nothing was downloaded, which the design claims at both trees (L129). `TRANSMITTAL_NOT_FOUND`
says "Transmittal not found.", and `SENT_PACKAGE_NOT_KEPT` ends "The agency holds what it received." Every other refusal
ends with `NOTHING` = "Nothing was downloaded." (`:40`). Its only caller is `server/routes/mdx-sent-package.ts:37`,
through `requestPgClient(req)`.

**b. `readFiledSequenceArchive(buffer)`** exists at `reader:708-711`. The design's `:705` is now `:708`.

- It runs `assertZipWithinLimits(buffer)`, then `readFiledSequences(await JSZip.loadAsync(buffer))`.
- It returns `FiledArchive { sequences: FiledSequence[] (ascending); refusals: FiledSequenceRefusal[] }` (`:157-162`).
  The archive-level refusals are duplicate numbers (`:674`).

Per sequence (`FiledSequence`, `:131-155`):

- **Identity:** `root`, `sequence`, `regionalBackbone`, `region: 'fda'|'ema'|'pmda'|null` and `application {number,
  applicationType, submissionType, applicant}`.
- **`leaves: FiledSequenceLeaf[]`:** `SequenceLeafManifestEntry` plus `operation`, `leafId`, `backbone`, `archivePath`
  and `heading` (`:121-129`). A refused leaf is not in `leaves`.
- **`refusals: FiledSequenceRefusal[]`:** each is `{code, message, path?, leafId?}` (`:111-118`).
- **`unreferenced: string[]`.**
- **`outsideArchive: string[]`:** the leaf IDs whose modified-file or reused file names a sequence the archive does not
  hold (`:149-154`). They are pushed at `pointers:153`.
- **`isComplete`:** true when there are no refusals and no `outsideArchive` entries (`:168-170`).

**c. `bindPointers`** is exported at `pointers:93-113` (the design's `:62-82`).

- It walks the sequences in order. `bindPointer` (`:138-161`) resolves each modified-file; `keepBound` (`:118-134`)
  records it.
- The design's `:98-101` is now `:129-132`, inside `keepBound`: a withdrawal takes `href = bound.canonical`, and
  `Object.assign(l, { ctdSection, fileName, md5 })` from the named leaf.
- A pointer into a sequence the archive lacks is pushed to `outsideArchive` with only its canonical form (`:151-155`).

`bindToFiledState` exists nowhere in `server/` or `client/`. In the whole tree it is only in the design file. Its
history is the single commit `b0bb8dccc3`, which adds the design docs.

**d. `MODIFIED_FILE`** (`loader:435`) is a module `const`, not exported. Its one use is `dropNamedLeaf` (`loader:514`).
The other pointer parsers:

- **The packager:** `MODIFIED_FILE_NAMES_A_LEAF` (`gw/regional-packager.ts:907-908`). It is a non-exported `const`, used
  as a shape test at the packaging sink (`:1102`).
- **The qualification harness:** `unresolvedModifiedFiles` in `server/services/ectd/qualification/qualify.ts`
  (`:179-215`). It uses the inline regex `/^((?:\.\.\/)+)([^/]+)\/([^#]+)#(.+)$/` (`:200`) after extracting the
  attribute (`:198`).
- **The reader's own resolution:** `split('#')` with `intoSibling` and `BACKBONE_PATH` (`pointers:140-143`, `:55-63`,
  `:33`). `LEAF_ID` (`pointers:36`) mirrors MODIFIED_FILE's ID group.

The hand-off text (`docs/design/FILED_SEQUENCE_READER_2026-11-01.md:168-169`) says "the three pointer parsers" and does
not name them by path. `reader:49-51` says the fold binds with MODIFIED_FILE and leaves it untouched.

**e. The fold's transmittal arm** (`loader:323-331`, unchanged). The SQL is:

```
JOIN submission_transmittals t
  ON t.organization_id = $1
 AND lower(t.metadata -> 'dispatchBinding' ->> 'attemptId') = f.transmit_attempt_id::text
 AND t.metadata -> 'dispatchBinding' ->> 'sequenceId' = f.id::text
 AND t.metadata -> 'dispatchBinding' ->> 'signatureActionId' = f.transmit_signature_action_id
```

The manifest is selected as `CASE WHEN jsonb_typeof(t.metadata -> 'leafManifest') = 'array' THEN (t.metadata ->
'leafManifest')::json END` (`:324`). `f` is the sequences with `dispatch_status IN ('sent','acknowledged')` and
`deleted_at IS NULL` (`:310-318`).

Counting happens in JS:

- Each transmittal row joins `read.sent` only if `sameAgency(read.region, row.transmittal_region)` (`:352`).
- `read.sent.length > 1` throws "Sequence N is bound to more than one transmittal …" (`:356-361`), whether or not the
  rows carry manifests.
- `read.sent[0]?.leaf_manifest != null` gives basis `'transmit'` (`:362-363`).
- Otherwise (zero bound rows, or one row with no array manifest), every non-rehearsal compile gives basis `'compiles'`
  (`:364-365`).
- Otherwise one row with basis `'none'` (`:366`).

`export type FiledRecordBasis = 'transmit' | 'compiles';` (`:250`). `'none'` is internal only: `basis: FiledRecordBasis |
'none'` (`:258`). `loadFiledStateBySubmission` maps every non-transmit basis to `'compiles'` (`:424`).

**f. The guard's stamps** (`gw/index.ts:348-354`). After `...(req.metadata ?? {})`, it stamps:

- `gatewayAccount`, always set;
- `sentPackage`, always set: declared `let sentPackage: SentPackageRecord` (`:281`) and assigned by `archiveSentPackage`
  (`:328`);
- `dispatchBinding: req.dispatchBinding ?? undefined` (`:352`);
- `leafManifest: sentLeaves` (`:353`). `sentLeafManifest` returns `undefined` when there is no `dispatchBinding`
  (`:155`), and otherwise `buildLeafManifest(req.bundle.leafManifest)` (`:163`).

So the keys stamped `undefined` today are `dispatchBinding` and `leafManifest`, on an unbound transmit. None of
`leafManifestDerivation`, `sentRecordStatement` or `restoredBinding` is stamped. P-92's `heldSendSettlement` is not
stamped either.

FDA ESG's own `createTransmittalRow` also overwrites `as2`, `as2Receipt` (`undefined`) and `as2ReceiptHistory: []`
(`gw/fda-esg.ts:341`). The REST helpers and EMA CESP store the metadata they receive verbatim (`:110`, `:271`). The
public route reaches the guard: `mdx-submission-gateway.ts:380-389` → `executeGovernedTransmit` → `getGateway(...)
.transmit` (`gw/governed-transmit.ts:661-662`). The comment in `types.ts:291-293` lists the four guard keys.

**g. ECTD_TRANSMITTED in `transmitSequence`** (`svc:4335-4364`). The details keys are, in order:

- `region`;
- `gateway`;
- `transmittalId: result.transmittalId` (`:4343`);
- `transmissionId`;
- `packageSha256: assembled.bundle.sha256` (`:4345`);
- `recordedPackageIdentity`;
- `status: result.status` (`:4347`);
- `environment` (`:4348`);
- `dispatchStatus` (`:4351`);
- `testSend` when the send is not production (`:4352`);
- `signatureActionId` (`:4353`);
- `preTransmitFailedChecks`, `preTransmitWarnings`;
- `sentPackage` (`:4360`);
- `...withWaiverReliedOn`.

The write runs in `applySequenceChangeWithAudit` with `dispatch_status = toDispatchStatus(…)` (`:4316`, `:4328-4329`).

Two other writers now produce ECTD_TRANSMITTED rows on `ectd_sequence`, both through `spendTransmitSignature`
(`gw/fda-esg-receipts.ts:160-171`). It writes only when S is not already spent under `SIGNATURE_SPENDING_ACTIONS`.

- **The receipt path** (`:133-136`): `transmittalId`, `receiptSha256`, `originalMessageId`, `userId`,
  `transmitAttemptId`, `status`, `environment`, `region`, `gateway`, `source: 'agency-signed-receipt-reconciliation'`
  and `signatureActionId`.
- **P-92's settlement** (`svc:2900-2904`): `transmitAttemptId`, `transmittalId`, `status: 'not-received' |
  'ack2_received' | 'ack3_received'`, `environment: 'production'`, `region`, `gateway`, `source:
  'held-send-settlement'`, `settlementSignatureActionId` and `signatureActionId`.

Neither carries `packageSha256`.

P-86 already filters this row set at act time. It excludes `environment = 'staging'` and settlement `'not-received'` rows
(`server/services/submission-service/filed-sequence-baseline.ts:374-379`). That is precedent for rule 2's "non-refused".

**h. `applySequenceChangeWithAudit`** (`svc:1495-1559`). Its signature:

```
async function applySequenceChangeWithAudit(
  update: { text: string; params: unknown[] | ((at: string) => unknown[]); noRowsRefusal?: string;
            underLock?: (client: PoolClient) => Promise<void>; afterUpdate?: (client: PoolClient) => Promise<void> },
  audit: { organizationId: number; userId: number; action: string; resourceId: number; details: Record<string, unknown>; reason?: string },
): Promise<{ occurredAt: string | null }>
```

- It accepts `audit.reason` (`:1526`, written at `:1548`; P-86 `2b79ca12e`).
- It accepts `update.afterUpdate` (`:1524`, run after the UPDATE and before the chained row, `:1540`; P-92 C1
  `950e0dca97`).
- It sets no tenant context itself.

**i. The receipt path's gate.**

- `GOVERNED_WRITE_ROLES` is defined at `server/middleware/orgMembership.ts:511` and imported at
  `gw/fda-esg-receipts.ts:8`.
- `requireReceiptActor` is at `:44-52`. It calls `readCsrProjectActor(client, organizationId, userId)`, then
  `GOVERNED_WRITE_ROLES.has(role.toLowerCase())`. Without the role it refuses 403 `AS2_RECEIPT_WRITE_DENIED`; a
  `CsrScopeError` gives the same code with "Current active organization membership is required".
- It runs at `:71` inside `ingestFdaAs2Receipt`, after `BEGIN` and `setTenantContextTx` (`:70`).
- It is an organization-membership role check, not project access. The design pairs it with `readSentPackage`'s
  project check (L307-309).

**j. `sentPackageRecordOf`** is at `gw/sent-package-read.ts:29-38` (exported; its only caller is `:59`). It accepts only:

- `storageVersionId`: a UUID;
- `provider`: non-empty;
- `sha256`: 64 lowercase hex characters;
- `sizeBytes`: a safe integer ≥ 0;
- `filename`: matching `^[a-z]+-[a-z0-9_]+-[0-9a-f]{64}\.zip$`.

Anything else is null.

The shape is `SentPackageRecord { storageVersionId, provider, sha256, sizeBytes, filename }`
(`gw/sent-package-archive.ts:27-33`), returned by `archiveSentPackage` (`:45-83`, return at `:76-82`). The guard stamps
it as `metadata.sentPackage` (`gw/index.ts:351`). It is repeated as `sentPackage` in ECTD_TRANSMITTED's details
(`svc:4360`), and structurally on the result type (`gw/types.ts:342`). It is read only by `readSentPackage`
(`metadata->'sentPackage'`, `:47`).

**k. `loadLatestPriorManifestBySubmission`** (`loader:169-231`). Its signature:

```
export async function loadLatestPriorManifestBySubmission(
  pool: PoolLike,
  args: { organizationId: number; submissionId: number; currentSequence: string },
): Promise<{ priorSequenceNumber: string; leaves: PriorLeaf[] }>
```

- It returns empty when any argument is missing (`:174-176`).
- It throws `unrecordedRefusal` for any `'none'` row (`:227-228`).
- `PriorLeaf` carries `leafId`, `backbone`, `sequenceNumber`, `md5` and `href` (`lifecycle-operator.ts:31-93`). That is
  enough for §3.1.2 step 3.

`unrecordedRefusal` (`loader:234-243`) produces:

- "Sequence N was" (one sequence), or "Sequences A, B and C were" (several);
- then " sent to the agency, but nothing on record says what it/they carried: no record of the send, and no compile.
  What is on file cannot be read, so nothing was bound against it."

It has no door sentence yet.

**l. The P-99 names.** These are in 0 files under `server/` or `client/` at HEAD:

- `deriveSentLeafManifest`, `rederiveSentRecord`, `sendTransmittal`, `readSentRecordFacts`, `sentRecordRefusal`;
- `restoredBinding`, `leafManifestDerivation`, `sentRecordStatement`;
- `SENT_RECORD_NOT_RESTORABLE`, `ECTD_SENT_RECORD_REDERIVED`, `'sent-record'`;
- also `bindToFiledState`.

The near-variants are also absent from code: bare `sent-record` and a word-bounded `sentRecord` (which excludes
`ConsentRecord`). In the whole tree, each name appears only in the design file.

`git log --all --oneline -S'<name>'` was run on the full, non-shallow history:

- Each name has exactly 1 commit: `b0bb8dccc3`, "Plan progress (P-100) …", 2026-11-08. It adds 15 design docs and no
  code.
- `restoredBinding` also has `bc7ffda39`, the design's appended answers.

No code with any of these names has ever existed.
