# Package-spine sweep — the skeptics' verdicts, verbatim

Each finding in `README.md` was handed to one adversarial verifier told to refute it: reproduce at HEAD with a probe on PGlite, the real route and the real packager; test the spec claim; check scope; give the smallest fix and its blast radius. These are their returns, unedited, kept here so the reasoning behind each fix (and each open item) lives on the branch, not in a session store. Probe directories were deleted by each verifier; the quoted output is what they printed.

Status of each finding is tracked in `README.md`; where a verdict and the README differ, the README (later) wins.

## Round 1 — F10, F14, F19, F11, F12

### F10 — confirmed (severity high, spec confidence high, reproduced True)

**Observed (probe output).**

Probe used PGlite, the real assemble route, the real packager and real recordFiledSequence, with the e2e harness seed and no toolchain. Probe file was tests/zz-probes/verify-f10/f10.probe.test.ts, now deleted. Result: 1 passed.

[F10] 0000 manifest entry for artifact 3: {"ctdSection":"3.2.P.1","fileName":"3-2-p-1-desc0003.pdf",...,"operation":"new",...,"leafKey":"artifact:artifact_desc0003@3.2.P.1","leafId":"leaf-3-2-P-1-3-2-p-1-desc0003","backbone":"index.xml"}

[F10] 0001 assemble: {"status":200,"summary":{"new":1,"replace":0,"append":0,"delete":1,"unchanged":2}}
(The new:1 is the empty-section placeholder s14.)

[F10] 0001 manifest: [{"op":"new",...,"fileName":"3-2-p-1-s14.pdf","leafKey":"section:14@3.2.P.1"},{"op":"delete","ctdSection":"3.2.P.1","fileName":"3-2-p-1-desc0003.pdf","leafKey":"(none)","href":"../0000/index.xml#leaf-3-2-P-1-3-2-p-1-desc0003"}]

[F10] fold after filed 0001: [...,{"key":"artifact:artifact_desc0003@3.2.P.1","seq":"0000","op":"new"},{"key":"section:14@3.2.P.1","seq":"0001","op":"new"}]
(The withdrawn document is still in the fold.)

[F10] fold IF delete carried leafKey: ["artifact:artifact_cover0001@1.2","artifact:artifact_co000002@2.5","section:14@3.2.P.1"]
(Counterfactual: with the key on the delete, the document drops out.)

[F10] 0002(a) re-withdraw: {"status":200,"summary":{...,"delete":1,"unchanged":3}}
The emitted leaf is <leaf operation="delete" modified-file="../0000/index.xml#leaf-3-2-P-1-3-2-p-1-desc0003" ...>, so the same leaf is deleted a second time.

[F10] 0002(b) re-map unchanged: {"status":409,"code":"NOTHING_TO_FILE","error":"Sequence 0002 would file nothing: all 3 of this package's leaves are already on file, byte for byte. ..."}

[F10] 0002(c) re-map edited: {"status":200,"summary":{"new":0,"replace":1,...}}
Manifest: [{"op":"replace","ctdSection":"3.2.P.1","modifiedFile":"../0000/index.xml#leaf-3-2-P-1-3-2-p-1-desc0003"}]

**The requirement.**

The rule the finding relies on is real.

Under ICH eCTD v3.2.2, `delete` takes a leaf out of the current view. replace, append and delete act on a current leaf, named through modified-file. Content brought back after a delete is filed as `new`. The repo's own contract says the same thing. The foldFiledState doc says "a leaf whose last operation was `delete` has been withdrawn and drops out entirely". The regional-packager.ts withdrawn-manifest comment says "Left out, the withdrawn leaf stayed on file for every later sequence" — the exact outcome reproduced here.

After one filed withdrawal through this route, three things go wrong:
- **(a)** The product files a second delete of a leaf already deleted at the agency.
- **(c)** It files the reintroduced document as a `replace` of the deleted leaf instead of `new`. Content is misfiled, and both (a) and (c) are lifecycle operations on a leaf that is no longer current.
- **(b)** It refuses a legitimate re-filing and tells the operator something untrue: "already on file, byte for byte".

Confidence is high that (b) is a defect and that (a) and (c) are lifecycle-invalid. Confidence is medium on the exact FDA validation-criteria number and severity that a validator would raise for (a) and (c). I cannot check the criteria table offline and I am not citing a code.

The leafKey mechanism itself is not invented. The packager already writes leafKey on withdrawn manifest entries when it is given one (regional-packager.ts:1219). The route simply never gives it one.

**Scope.**

In scope; not fixed; not a procurement gap.

- **Not fixed at HEAD (55dc7b93).** The last change to package-sequence-lifecycle.ts is ca636c7f, the Ghostscript-stage md5 fix, and nothing since touches delete keying. The sweep README lists F10 as "unverified".
- **Not a procurement gap.** No DTD, validator licence or ESG credential is involved; it is a pure code defect.
- **Owner.** The package-model spine lane (docs/work-orders/README.md row 58, session 01LjrcEe) owns server/services/ectd/package-sequence-lifecycle.ts and the assemble route's lifecycle block. The fix does not need the shared lifecycle-operator.ts.
- **Sequence spine (IND lane, 01TtwRHm) not affected today.** The only place in server/ that puts leafKey on packager input is submission-ops.ts:2482. The operator strips leafKey, and package-from-core.ts feeds operator output to the packager. So sequence-spine manifests carry no leafKey on any entry. Its separate fold (prior-sequence-loader.ts foldManifestRows) therefore keys uniformly on path, and a delete drops correctly there. That fold has the same latent `leafKey ?? path` asymmetry if that spine ever starts keying leaves. That belongs in a hand-off note to the IND lane, not an edit here.

Minor nuance: the 0000 key is `artifact:<artifactId string>@<code>`, not the database id. The operator stripping leafKey does not hurt new/replace leaves, because the route re-attaches the key from ctdLeaves. The defect is that nothing re-attaches it for deletes, and that the fold has no fallback for a delete without a key.

**Smallest correct fix.**

**1. The fix (one file).** In server/services/ectd/package-sequence-lifecycle.ts, `foldFiledState` (line 139), give a delete without a leafKey a path fallback, like the rest of this code:

```ts
if (leaf.operation === 'delete') {
  byKey.delete(key);
  if (!leaf.leafKey)
    for (const [k, p] of byKey)
      if (p.ctdSection === leaf.ctdSection && p.fileName === leaf.fileName) byKey.delete(k);
  continue;
}
```

This alone fixes (a), (b) and (c) — the re-withdrawal is refused as WITHDRAWAL_NOT_ON_FILE, and both re-filings come out as `new` — and it recovers histories already filed with deletes that have no key. It is safe:
- Within one sequence, planSequence already refuses filing and withdrawing the same path (WITHDRAWAL_CONTRADICTS_CONTENT), so a delete can only drop the document it withdraws.
- planSequence's withdraw lookup (`priorByPath`) already assumes a path is unique among current leaves.

**2. Forward fix (recommended, same lane, still no change to the shared operator).**
- `planSequence` returns leafKey on delete leaves. `priorByPath` is already in scope; add `...(l.operation === 'delete' && priorByPath.get(`${l.ctdSection}/${l.fileName}`)?.leafKey ? { leafKey } : {})` and `leafKey?: string` to `SequencePlan.leaves`.
- The route's `withdrawals.push` (submission-ops.ts:2576) adds `...(l.leafKey ? { leafKey: l.leafKey } : {})`.

`LeafBytes.leafKey` → package-leaf-bytes → the packager's withdrawn-manifest branch already carry it through. A future history then records the withdrawn document's identity.

**3. Tests (show each failing first).**
- Unit, in server/services/ectd/__tests__/package-sequence-lifecycle.test.ts: a keyed 0000 plus a delete without a key drops out; a keyed delete drops out.
- e2e, in tests/submission-ops-package-spine.pglite.e2e.test.ts: file 0000; withdraw and file 0001; then for 0002, the re-withdrawal is 409 WITHDRAWAL_NOT_ON_FILE, and re-mapping the unchanged document is 200 with new:1 and no modified-file.

**Blast radius.**

**Files changed**
- server/services/ectd/package-sequence-lifecycle.ts: the foldFiledState fallback; the planSequence return and SequencePlan type for the forward fix.
- server/routes/submission-ops.ts: one line in the lifecycle block's withdrawals push, forward fix only.

**Not changed:** lifecycle-operator.ts, regional-packager.ts, package-leaf-bytes.ts and governed-transmit.ts.

**Sequence spine (ectd-compile / package-from-core, prior-sequence-loader.ts):** not touched and not affected. Its manifests never carry leafKey, and it has its own fold.

**Behaviour change:** limited to packages whose filed history holds a withdrawal. After the change the withdrawn document leaves the prior state, so a later sequence:
- refuses a repeat withdrawal (WITHDRAWAL_NOT_ON_FILE),
- files a reintroduced document as `new` rather than `replace` or NOTHING_TO_FILE,
- counts one fewer leaf as unchanged.

**Tests pinning current behaviour:** none.
- 'a withdrawn leaf drops out' (package-sequence-lifecycle.test.ts:89) uses fixtures without keys and stays green.
- tests/submission-ops-assemble-routes.test.ts:950 checks the withdrawal's properties one by one, so an added leafKey does not break it. It never files 0001 and re-folds.
- No operator test checks exact leaf shapes.

New tests are needed as listed in the fix.

### F14 — confirmed (severity high, spec confidence high, reproduced True)

**Observed (probe output).**

Probe tests/zz-probes/verify-f14/f14.probe.test.ts (now deleted), 3/3 passed. Real parts: assemble route, packager, PGlite SQL, executeGovernedTransmit, the guarded getGateway wrapper, findActiveTransmittal, rollbackTransmittal, recordFiledSequence, and the real migrations/20260629_submission_transmittals_active_lock.sql applied to the table. Only the AS2 wire was a stand-in: an FdaEsgGateway subclass that writes the same transmittal row, pending then received. Part 11 signature persistence was stubbed.
Output:
F14> CONTROL re-assemble 0000 with nothing transmitted -> 200
F14> CONTROL same content, same sha256 on re-assembly? -> false
F14> STAGING outcome -> {"status":"received","transmittalId":1,"filedSequenceRecorded":true,"filedSequenceReason":"recorded","ledgerWriteFailed":false}
F14> filedSequences after STAGING -> [{"sequence":"0000","transmittalId":1,"leaves":3}]
F14> transmittals -> [{"id":1,"status":"received","env":"staging"}]
F14> re-assemble production 0000 -> 409 SEQUENCE_ALREADY_FILED | Sequence 0000 has already been transmitted for this package; a follow-up must carry the next sequence number.
F14> PRODUCTION send of same stored bundle -> GovernedTransmitRefusal ACTIVE_TRANSMITTAL (409): An active transmittal already exists for this package (id=1, status=received). Roll it back via POST /api/mdx/gateways/transmittals/1/rollback before re-transmitting.
F14> rollback staging -> rolled_back
F14> PRODUCTION outcome after rollback -> {"status":"received","transmittalId":2,"filedSequenceRecorded":true,"filedSequenceReason":"recorded"}
F14> filedSequences after PRODUCTION -> [{"sequence":"0000","transmittalId":1,"leaves":3}]
F14> assemble 0001 after staging-only 0000 -> 200 {"new":0,"replace":1,"append":0,"delete":0,"unchanged":2}
F14> 0001 leaves -> [{"ctdSection":"2.5","operation":"replace","modifiedFile":"../0000/index.xml#leaf-2-5-2-5-co000002"}]
Code at HEAD: governed-transmit.ts:669 gates the append on `input.packageId != null && !input.clientBundle && bundle.sequence` only. findActiveTransmittal (fda-esg.ts:1011-1019) and sub_trans_active_lock_idx both key on (organization_id, package_id, bundle_sha256) with no environment. Environment is stored only in the transmittal's metadata JSON. Extra finding: after rollback, the production send reports 'recorded' but writes nothing, because the idempotent append returns true while the history still names staging transmittal 1.

**The requirement.**

The rule is real. FDA ESG has separate Test and Production environments. Test-environment sends (connectivity checks, sample eCTD submissions) are not official regulatory submissions and put nothing on file in the application's lifecycle; only a production send files a sequence. The repo says the same about itself: types.ts:272-274 calls 'staging' "the gateway's pre-production endpoint (used by ops + AnA dry-run flows)"; bundle-leaf-security.ts:15-16 calls it "the agency's test system… the environment launch row D7 is judged in"; and recordFiledSequence's own docstring defines the history as "what this application has actually put on file". So a staging send, which the D7 flow and the AnA dry runs both use, makes the history false.

Harm: FDA is not told anything untrue by the staging send itself. The damage is to the lifecycle state, and nothing in the code removes a filedSequences entry.
(a) A production 0000 can never be re-assembled. Any change after the test (and finding changes is what testing is for), or the content-drift guard, forces re-assembly.
(b) The only thing left to file is 0001. Its plan treats 0000 as on file: the probe shows one `replace` whose modified-file points at ../0000/index.xml#…, with two leaves "unchanged". Sent to production, that is the application's first sequence. Its lifecycle reference points at a sequence FDA's production record does not have, which FDA validation flags as a high-severity lifecycle error, and the unchanged documents never reach FDA at all. That is misfiled content.
(c) The Part 11 sign payload and manifest for the test send record filedSequenceRecorded:true for sequence 0000, which is untrue.
I have high confidence in the rule and the internal harm. I have medium confidence in the exact FDA validation outcome of the 0001-first path, and I cite no criterion numbers.

The lock half holds but is minor. It fails safe (it refuses, it never misfiles). Rollback clears it, and re-assembly gives a new sha256 (observed false), so after the main fix it only blocks re-sending the same stored bundle.

**Scope.**

In scope and not fixed at HEAD. governed-transmit.ts last changed in 39d4b85a; the append was last touched in 09c4c15d and still has no environment check. It is a code defect, not a procurement gap: no DTD, validator licence or ESG credential is involved. Owner: the package-model spine lane, session …01LjrcEe8y3zUQxwX91zzTaM. docs/work-orders/README.md line 58 explicitly claims "governed-transmit's filed-sequence record". The IND demo lane (…01TtwRHm) does not own it.

Sequence spine, handed off and not probed: transmitSequence (submission-service.ts:1460-1473) sets dispatch_status from toDispatchStatus(result.status) whatever the environment ('received' becomes 'sent'). The filed-prior loader (prior-sequence-loader.ts:193) counts dispatch_status IN ('sent','acknowledged') as filed. So a staging transmitSequence probably marks its sequence as filed there too. That file belongs to the IND lane (…01TtwRHm), and submission-service.ts is also inside …01KnUGoX's PF-05 claim. Raise it with them; do not edit it from this lane.

**Corrected claim.**

Every observable in the claim holds as stated. Two refinements:
(1) The lock half is real but minor and fails safe. Rollback clears it, and re-assembly gives a new sha256, so once the filed history is fixed the lock only blocks re-sending the very same stored bundle.
(2) The production send after a rollback also reports filedSequenceRecorded:true/'recorded' for a write that did not happen, because the idempotent append returns true while the entry still names the staging transmittal.

**Smallest correct fix.**

One file: server/services/submission-gateways/governed-transmit.ts.

Inside the existing `if (input.packageId != null && !input.clientBundle && bundle.sequence)` block (line 669), add a first branch:

  if (environment !== 'production') { filedSequenceRecorded = 'not-applicable'; filedSequenceReason = 'test-environment'; }
  else if (!bundle.leafManifest?.length) { …unchanged… } else { …recordFiledSequence… }

Also add `| 'test-environment'` to the filedSequenceReason union (lines 375-379), and amend the filedSequenceRecorded doc comment ("'not-applicable' ONLY for a bundle that files no eCTD sequence") to cover a non-production send.

The check is `!== 'production'` so that anything unexpected fails closed. Keeping it inside the sequence branch leaves 'no-sequence' unchanged for bundles that file no sequence.

transmit-notices.ts needs no change: it warns only when filedSequenceRecorded === false, and a test send is not a failure. The sign payload and manifest then record 'not-applicable'/'test-environment', which is true.

Failing-first test: in tests/mdx-submission-gateway-transmit-bundle-guard.test.ts, a staging send of a sequence-bearing descriptor expects 'not-applicable'/'test-environment' and no `UPDATE c2c_submission_packages`. Optionally add a pglite e2e case in tests/submission-ops-package-spine.pglite.e2e.test.ts: staging send, then re-assemble 0000, expect 200.

Not part of the smallest fix (low severity, follow-up): environment in the active lock. Note on the fix sketch: amending `CREATE UNIQUE INDEX IF NOT EXISTS sub_trans_active_lock_idx` in place does nothing on deployed databases, because IF NOT EXISTS skips an existing index. That change would need a conditional drop and re-create keyed on pg_get_indexdef (Rule 1 corollary), plus environment in findActiveTransmittal. Rollback and re-assembly already clear the lock.

**Blast radius.**

Product code: only governed-transmit.ts, and only its filed-sequence block and the outcome type. Both callers pick the fix up: the HTTP route POST /api/mdx/gateways/:region/:gateway/transmit and the AnA esgTransmit handler (server/services/ana-ri/mdx-command-handlers.ts:827). The route already forwards filedSequenceReason.

Other spine: unaffected. transmitSequence does not call executeGovernedTransmit, and the shared guard (index.ts getGateway), packager, operator and vocab are untouched. Its own analogous dispatch_status issue is a separate hand-off.

Tests that pin current behaviour and must change, all in tests/mdx-submission-gateway-transmit-bundle-guard.test.ts:
- line 559-578, 'records the sequence it just filed…': sends environment:'staging' (line 567) and expects filedSequenceRecorded true plus the history write. Switch it to 'production'.
- line 601-628, 'leaf inventory is UNREADABLE…': sends 'staging' (line 618) and expects false/'no-usable-manifest'. Switch it to 'production'.
- line 580-590, 'no-sequence': unaffected if the check sits inside the sequence branch.
- The positive control at line 509 is titled "under production" but sends 'staging' (line 521). It asserts no filed fields, so it is unaffected, but its title should be corrected.

Unaffected:
- tests/submission-ops-assemble-routes.test.ts:1101 uses staging with a clientBundle, which skips the append.
- server/services/ana-ri/__tests__/mdx-command-handlers.test.ts mocks the outcome.
- tests/submission-ops-package-spine.pglite.e2e.test.ts calls recordFiledSequence directly.

### F19 — partial (severity high, spec confidence medium, reproduced True)

**Observed (probe output).**

I wrote two probes at HEAD ca636c7f and deleted them afterwards: tests/zz-probes/verify-f19/*.probe.test.ts. All 5 tests passed.

(1) Real assemble route, real packager, PGlite, the real recordFiledSequence and the real rollbackTransmittal:
[F19] re-assemble 0000 before anything is filed -> 200 ok
[F19] bundle A 0000 4d080224df7a CO md5 ec5f8dc7269204dd9fb20a800c685c9f leafId leaf-2-5-2-5-co000002
[F19] bundle B 0000 12c3ba79d52a CO md5 0346499e0c77c767582f474a7a2d7fa1 leafId leaf-2-5-2-5-co000002
[F19] recordFiledSequence(A) -> true ; recordFiledSequence(B) -> true
[F19] filedSequences: [{"sequence":"0000","sha256":"4d080224df7a","transmittalId":101,"coMd5":"ec5f8dc7269204dd9fb20a800c685c9f"}]
[F19] history holds A? true  holds B? false
[F19] assemble 0000 again after filing -> 409 SEQUENCE_ALREADY_FILED
[F19] assemble 0001 -> 200 {"new":0,"replace":1,"append":0,"delete":0,"unchanged":2}
[F19] 0001 modified-file = ../0000/index.xml#leaf-2-5-2-5-co000002 | leaf ID present in A index.xml? true | present in B index.xml? true
[F19] rollback -> rolled_back | transmittal row: rolled_back | filedSequences after rollback: [{"sequence":"0000","transmittalId":41}]
[F19] corrected 0000 after rollback -> 409 SEQUENCE_ALREADY_FILED | Sequence 0000 has already been transmitted for this package; a follow-up must carry the next sequence number.

(2) Real POST /api/mdx/gateways/fda/esg/transmit and real executeGovernedTransmit, with a stand-in gateway whose returned status the probe chooses:
[F19] gateway status 'in_transit' (SFTP deposit, no acknowledgement) -> HTTP 201, filedSequenceRecorded=true, reason=recorded, history=[{"sequence":"0000","transmittalId":6001}]
[F19] gateway status 'received' (AS2 MDN (Ack1)) -> HTTP 201, filedSequenceRecorded=true, reason=recorded, history=[{"sequence":"0000","transmittalId":6002}]
[F19] gateway status 'rejected' (a returned (not thrown) rejected status) -> HTTP 201, filedSequenceRecorded=true, reason=recorded, history=[{"sequence":"0000","transmittalId":6003}]

What the code shows:
- governed-transmit.ts:670-695 records the history with no check of result.status.
- fda-esg.ts checkStatus (l.706) only reads the stored row back. The file header says it "does not poll FDA for async ack1/ack2/ack3".
- rollbackTransmittal (l.886-990) writes only submission_transmittals.
- recordFiledSequence (package-content-change.ts:195-199) treats a sequence number already on file as "done" and returns true, without comparing sha256.
- The transmit lock sub_trans_active_lock_idx is unique on (organization_id, package_id, bundle_sha256), so a different bundle is not locked out.
- Transmit never reads the filed history; only the assemble route does (submission-ops.ts:2520).

**The requirement.**

Parts that HOLD:
(a) The FDA ESG acknowledgements come in three steps. The AS2 MDN (Ack1) means the ESG received the bytes. Ack2 means the bytes were delivered to the Center. Ack3 is the Center's load / technical-validation result. An SFTP PUT into /incoming/ is not an acknowledgement at all. The repo's own fda-esg.ts header says the same. High confidence.
(b) A sequence that fails FDA's high-severity technical validation is rejected. It is not loaded into the review archive, and the sponsor corrects it and resubmits. EU guidance says outright to reuse the same sequence number; I believe FDA practice and the Technical Conformance Guide say the same, but I cannot quote the FDA wording, hence medium confidence on that point.
(c) Whatever the numbering rule, a lifecycle computed against a sequence the agency never loaded is wrong, and the probe shows it:
- a replace points modified-file at ../0000/index.xml#leaf-2-5-2-5-co000002, a leaf FDA would not hold. That is a lifecycle validation error.
- a document carried only by the rejected sequence, and unchanged afterwards, is dropped from the next sequence as "unchanged". FDA cannot detect that absence, so the content is silently never filed.
The product offers no way out:
- the rejected number is refused (SEQUENCE_ALREADY_FILED);
- skipping a number is refused (SEQUENCE_OUT_OF_ORDER);
- for a rejected 0000 there is no in-product recovery at all.
The repo states the rule it breaks: recordFiledSequence's own doc says "called only when an agency gateway has accepted the bytes", and prior-sequence-loader says "ONLY WHAT THE AGENCY ACTUALLY HOLDS".

Parts that do NOT hold or are overstated:
(1) The fix sketch would un-file on rollback. That is wrong. rollbackTransmittal records a retraction on the platform only; its own result says "The agency still holds the transmitted bytes". An eCTD sequence the agency has loaded is permanent in its lifecycle, and corrections go in a new sequence. Un-filing on rollback would invite a duplicate-sequence rejection and re-file leaves as new. Only evidence that the agency did not load the sequence (a failed Ack3, or a technical-rejection notice) should un-file it.
(2) "Whatever result.status is" is literally true, but every gateway throws on failure. The only statuses a gateway actually returns are 'received' and 'in_transit', so the case that matters is (a).
(3) The second bundle under the same number can only happen through a race: re-assembling while the first transmit is in flight. Its effect is a false "recorded" report and a duplicate-number send, not routine corruption of the baseline.
(4) Recording at the transport receipt matches the sibling spine (dispatch_status 'sent' counts as filed) and is a defensible provisional default. The defect is that the record can never be reversed, not when it is written.

Severity: high, not critical. Today no FDA transport can deliver: the AS2 envelope is documented as non-conformant (no S/MIME), ssh2-sftp-client is missing from package.json, and the REST transport is unverified. Once a transport works, the other regions' REST gateways have the same "received" semantics, and any technical rejection leaves the package stuck.

**Scope.**

Not fixed at HEAD (ca636c7f). The last commit to these files was 09c4c15d on 2026-09-29 (the modified-file fix), which is unrelated.

Ack3 ingestion does not exist anywhere. This is a known gap that depends on procurement: the fda-esg.ts header names the missing ack poller, CMS/S-MIME support and MDN verification, all of which need ESG credentials and UAT. The "accepted on Ack3" half of the fix sketch is therefore blocked on procurement.

The rest is a code defect in this lane. docs/work-orders/README.md section 0 lists "Package-model spine — … governed-transmit's filed-sequence record", claimed by session_01LjrcEe8y3zUQxwX91zzTaM (row D7, W5). The defect covers the missing un-file path for an evidenced rejection, the sha-blind idempotency in recordFiledSequence, and the missing transmit-time check against the filed history and per-package in-flight lock.

The sequence spine (IND demo lane, 01TtwRHm) has the same "transport receipt counts as filed" gap, in files that lane owns:
- submission-service.ts toDispatchStatus runs once, at transmit;
- resendRefusal says "A correction is a new sequence";
- prior-sequence-loader folds 'sent' sequences.
That is a hand-off to that lane, not a change in this fix.

**Corrected claim.**

Confirmed:
- Governed transmit appends the filed history on any successful gateway return, the ESG AS2 MDN and a bare SFTP deposit included.
- Nothing ever revises an entry: no ack ingestion exists, and rollbackTransmittal changes only the transmittal row.
- recordFiledSequence reports true for a different bundle under an already-recorded number and keeps the first bundle's inventory.
- Consequence: after an agency technical rejection, the rejected sequence's number cannot be reused (SEQUENCE_ALREADY_FILED), skipping a number is refused (SEQUENCE_OUT_OF_ORDER), and the next sequence diffs against content the agency never loaded. modified-file then points into a sequence FDA does not hold, and documents only the rejected sequence carried are silently omitted.

Not confirmed or overstated:
- A rollback should NOT un-file: the agency still holds the bytes, and a loaded eCTD sequence is permanent.
- "Whatever result.status is" has no practical non-success case, because gateways throw.
- The second-bundle case needs a race: re-assembling while the first transmit is in flight.
- Severity is high, not critical: no FDA transport can currently deliver, and Ack3 ingestion is a known gap that depends on procurement.

**Smallest correct fix.**

1. recordFiledSequence (package-content-change.ts). When the sequence number is already in the history with a DIFFERENT sha256 and that entry is not rejected, stop returning true. Return a distinct outcome instead, either a 'conflict' value or false plus a reason. governed-transmit then reports filedSequenceReason 'sequence-already-filed-different-bundle', and transmit-notices.ts words it for the user. Write new entries with state: 'transmitted'.

2. governed-transmit.ts, before gw.transmit:
- Refuse with a 409 SEQUENCE_ALREADY_FILED when the package's filed history already holds bundle.sequence under a different sha256 (skipping rejected entries).
- When packageId is set, make the application-level active-transmittal check per (org, package) rather than per sha. A second active bundle for one package can only be the same sequence number, because planSequence refuses N+1 until N is recorded. This needs no migration; the DB index stays as the per-sha backstop.

3. Add one governed operator action, "record agency technical rejection". It requires re-auth, a reason, and the Ack3 or rejection notice as evidence. Under withPackageMetadataLock it sets state: 'rejected' on the filed entry and keeps the entry for audit. readFiledSequences skips rejected entries, so the fold excludes them and planSequence allows the number again. A future ack poller sets 'accepted' or 'rejected' through the same function.

Do NOT un-file on rollbackTransmittal. A rollback is a retraction recorded on the platform, not evidence that the agency did not load the sequence.

**Blast radius.**

Files:
- server/services/ectd/package-content-change.ts (recordFiledSequence result and state; a new mark-rejected function)
- server/services/ectd/package-sequence-lifecycle.ts (FiledSequence.state; readFiledSequences skips 'rejected')
- server/services/submission-gateways/governed-transmit.ts (pre-gateway refusal, per-package active check, a new member of the filedSequenceReason union)
- server/services/submission-gateways/transmit-notices.ts
- one new governed route (submission-ops.ts or mdx-submission-gateway.ts) plus a Submission Center control

No migration: the state lives in package metadata JSON.

Other spine: the shared packager, lifecycle operator, vocabulary and pre-transmit guard are untouched. The sequence spine keeps its own parallel gap, which is a hand-off to the IND demo lane.

Tests that pin current behaviour:
- tests/mdx-submission-gateway-transmit-bundle-guard.test.ts, "records the sequence it just filed…": status 'received' gives filedSequenceRecorded true. It still passes if state defaults to 'transmitted', because toMatchObject is a partial match.
- tests/submission-ops-package-spine.pglite.e2e.test.ts: fileTheStoredBundle expects recordFiledSequence to return true. It needs updating if the return type changes.
- server/services/ectd/__tests__/package-sequence-lifecycle.test.ts: the SEQUENCE_ALREADY_FILED and readFiledSequences cases. Add cases for rejected entries.
- server/services/ana-ri/__tests__/mdx-command-handlers.test.ts: asserts filedSequenceRecorded values.

### F11 — confirmed (severity medium, spec confidence medium, reproduced True)

**Observed (probe output).**

Probe: tests/zz-probes/verify-f11/f11.probe.test.ts. It used the real route, PGlite SQL, the real packager and ZIP, and the real recordFiledSequence. All 4 cases passed. The directory has been deleted.
[A] Artifact 3 unmapped. 0000 returned 200 with this manifest:
  new m1/us/1-2/cover-letter-cover0001.pdf key=artifact:artifact_cover0001@1.2
  new m2/2-5/2-5-co000002.pdf key=artifact:artifact_co000002@2.5
  new m3/3-2-p-1/3-2-p-1-s14.pdf key=section:14@3.2.P.1 id=leaf-3-2-P-1-3-2-p-1-s14
Validation: {"errorCount":0,"warningCount":1,"emptyLeafCount":1}. The one warning was SECTION-EMPTY, severity "warning".
Text of the shipped placeholder PDF: "Description and Composition (3.2.P.1) [EMPTY SECTION] Description and Composition (3.2.P.1)".
Its index.xml entry is <leaf operation="new" ... xlink:href="m3/3-2-p-1/3-2-p-1-s14.pdf" ID="leaf-3-2-P-1-3-2-p-1-s14"><title>Description and Composition (3.2.P.1)</title>. That title looks like a real document.
I filed 0000, re-mapped artifact 3 and assembled 0001. It returned 200 with {"new":1,"replace":0,"append":0,"delete":0,"unchanged":3}: "new m3/3-2-p-1/3-2-p-1-desc0003.pdf key=artifact:artifact_desc0003@3.2.P.1". There were no modified-file attributes. The only finding was "warning:MODULE-M1-MISSING", so nothing mentions the placeholder.
After filing 0001, the fold shows two current leaves at 3.2.P.1: "3-2-p-1-s14.pdf key=section:14@3.2.P.1 seq=0000" and "3-2-p-1-desc0003.pdf key=artifact:artifact_desc0003@3.2.P.1 seq=0001".
0002 with nothing changed: 409 NOTHING_TO_FILE.
[A2] 0001 with an explicit withdraw of the placeholder is accepted: 200 {"new":1,"delete":1,"unchanged":2}, "delete ../0000/index.xml#leaf-3-2-P-1-3-2-p-1-s14 key=undefined".
[B] Withdrawing the section's only document while it is still mapped: 409 WITHDRAWAL_CONTRADICTS_CONTENT, "...Unmap the artifact from this package, or drop the withdrawal."
After unmapping it: 200 {"new":1,"delete":1,"unchanged":2}, with "new m3/3-2-p-1/3-2-p-1-s14.pdf key=section:14@3.2.P.1" and "delete ../0000/index.xml#leaf-3-2-P-1-3-2-p-1-desc0003". Findings: warning:SECTION-EMPTY, errorCount 0.
[B2] Unmap, delete the now-empty section row, then withdraw: 200 {"new":0,"delete":1,"unchanged":2}. No placeholder.

**The requirement.**

FDA would not reject this, and it would not raise a validation error (high confidence):
- The placeholder is a valid 1.7 KB PDF leaf.
- ICH DTD 3.2 allows leaf* under any heading, several current leaves at one heading, and `new` at a heading that already has a leaf.
- No FDA eCTD validation criterion I know of judges what a leaf says. They catch zero-byte or corrupt files.

The real defect is in lifecycle and content. Under ICH v3.2.2 lifecycle only `replace` or `delete` supersedes a filed leaf; `new` adds one beside it. So:
- After 0001, FDA's current view of 3.2.P.1 holds two documents. One is titled "Description and Composition (3.2.P.1)" and says the section is empty; the other is the real description. The placeholder's claim is out of date but still current, and the agency is told something that is no longer true.
- A sequence meant only to withdraw a document also files a new document the sponsor never wrote. The operator gets only a warning.

EU Harmonised Technical Guidance for eCTD ("empty or missing eCTD sections") says documents stating "no relevant content" should not be placed in the eCTD structure, because they complicate lifecycle. I am confident that rule exists for the EU. I cannot quote an equally explicit FDA Technical Conformance Guide sentence, but it matches FDA practice (medium to low confidence).

The repo already applies this rule elsewhere:
- server/services/ectd/completeness.ts: "a submission-grade package must have zero placeholders".
- The other spine's server/services/ectd/leaf-source-resolver.ts:744: "An empty section is a GAP in the package, never a blank leaf".
- CLAUDE.md: "never fabricate".

completeness.ts also calls placeholders a Refuse-to-File / technical-rejection risk. That overstates it: Refuse-to-File does not apply to INDs, and no validation rule fires. Medium severity is right, not high.

**Scope.**

Not fixed at HEAD (ca636c7f). The placeholder code is still at server/routes/submission-ops.ts:2305-2311, 2385-2388, 2459-2462 and 2482-2484. `git log -S` traces it only to 39d4b85a, so it predates the sweep and the IND lane's 09c4c15d.

Not a procurement gap: this is how the code behaves, and it reproduces without DTDs, a validator or ESG.

It belongs to the package-spine lane (W5/D7). No lane in docs/work-orders/README.md §0 claims submission-ops.ts. The IND lane (01TtwRHm) owns ind-forms/*, ind-checklist-view-assembler and the seeds, and its sequence spine already refuses to build a leaf for an empty section.

Two corrections to how the claim is worded:
1. "Stays current forever" means nothing in the product supersedes or flags the placeholder. An explicit `withdraw` of it is accepted (A2), but 0001 raises no finding that would prompt one. Per F10 (delete leaves carry no leafKey), the system's own record would still show it as current even after that withdrawal.
2. The withdrawal sequence's placeholder can be avoided only by also deleting the now-empty section (B2). Nothing suggests that step, and the 409's own remedy text ("Unmap the artifact…") leads straight to the placeholder.

**Smallest correct fix.**

In the eCTD branch of POST /packages/:id/assemble (server/routes/submission-ops.ts around line 2385), handle `mapped.length === 0` like this:
- Push a `SECTION-EMPTY` warning to `placementFindings` ("<section label>: no artifact is mapped; this section files nothing in this sequence") and `continue`.
- Build no unit, no PDF, and no entry in `ctdLeaves` or `leafs`.
- Keep the `contentRows` push at lines 2305-2311 so the content fingerprint still changes when a section becomes empty.
- Delete the `!artifact` branches this makes dead: unitLabel (2391-2393), disc `s${section.id}` (2437-2439), the `[EMPTY SECTION]` markdown and empty-leaf bookkeeping (2459-2462), the title (2466), and the `section:` leafKey (2482-2484).
- Leave the non-eCTD branch (2355) alone.

Follow-up only if a history already holds a `section:<id>@<code>` leaf (filed before the fix; probably none at FDA, since ESG is not provisioned): `planSequence` should warn about each such placeholder that is still current at a code that now has real content, naming its {ctdSection, fileName} so it can be passed in `withdraw`. That withdrawal only clears it from the filed record once F10 is fixed.

**Blast radius.**

Files: only server/routes/submission-ops.ts, in the eCTD unit loop.

The other spine is unaffected. Its leaf-source-resolver already treats an empty section as a gap. The shared regional-packager, lifecycle-operator, package-sequence-lifecycle, controlled-vocab and governed-transmit are not touched.

Tests that pin the current behaviour and would need to change (all in tests/submission-ops-assemble-routes.test.ts):
1. "FAILS CLOSED on an unplaceable section" (~L580). It uses two EMPTY sections with unplaceable keys and expects 2 blocking LEAF-UNPLACED errors. After the fix they file nothing, so map artifacts into them to keep testing LEAF-UNPLACED.
2. The canonical-packager test (~L529-560). It expects leaves ['1.2','3.2.S.1','3.2.P.1','2.5'] and leafCount 4; both drop the 2.5 placeholder, giving 3. Its warningCount >= 1 still holds through the new SECTION-EMPTY finding.
3. The unchanged-leaf drop test (~L820-851). leafCount 3 and emptyLeafCount 1 for 0000 become 2 and 0.

Tests that are unaffected:
- The fingerprint test (~L440), because the empty-section content row is kept.
- tests/ectd-structural-validator.test.ts (the rule is kept).
- tests/submission-ops-preflight-routes.test.ts (the finding is mocked).
- tests/submission-ops-section-routes.test.ts:353 and tests/artifact-change-invalidates-bundles.contract.test.ts. They mention the placeholder only in a title or comment, and invalidation happens through the fingerprint.
- tests/submission-ops-package-spine.pglite.e2e.test.ts (every section is mapped).

One intended change in behaviour: an EMPTY section whose key cannot be placed no longer blocks transmit with LEAF-UNPLACED. If empty sections should block, that is a separate completeness rule.

### F12 — confirmed (severity medium, spec confidence medium, reproduced True)

**Observed (probe output).**

Probe: tests/zz-probes/verify-f12/f12.probe.test.ts (now deleted). It used the e2e template: the real assemble route, PGlite SQL, the real packager and ZIP, and recordFiledSequence. It ran at HEAD ca636c7f with a clean tree, and both cases passed.

Case A: assemble 0000 and file it, then `UPDATE concept2cure_artifacts SET ctd_section='2.7.3' WHERE id=2`, then assemble 0001 as 'Efficacy Supplement'.
- 0000 manifest: `'new 2.5/2-5-co000002.pdf key=artifact:artifact_co000002@2.5'` (plus the cover letter and 3.2.P.1).
- 0001 result: `"A 0001 status 200 lifecycle {"summary":{"new":1,"replace":0,"append":0,"delete":0,"unchanged":3},"omittedCount":2} validation counts {"errorCount":0,"warningCount":1,"infoCount":1}"`
- 0001 manifest: `[ 'new 2.7.3/2-5-co000002.pdf key=artifact:artifact_co000002@2.7.3' ]`
- 0001 backbone: `'index.xml: op=new href=m1/us/us-regional.xml modified-file=-', 'index.xml: op=new href=m2/2-7-3/2-5-co000002.pdf modified-file=-'`
- `"index.xml mentions m2/2-5/ ? false | has <m2-5 element ? false"`
- `"all findings 2 ["warning:MODULE-M1-MISSING","info:SUMMARY"]"` and `"findings naming the old copy / a move / a withdrawal: 0 []"`
- After 0001 is filed, the fold of what is current lists both copies: `'2.5/2-5-co000002.pdf (seq 0000) key=artifact:artifact_co000002@2.5'` and `'2.7.3/2-5-co000002.pdf (seq 0001) key=artifact:artifact_co000002@2.7.3'`.

Case B (control): the same move with an explicit `withdraw:[{ctdSection:'2.5',fileName:'2-5-co000002.pdf'}]`.
- Result: 200 `{"new":1,"delete":1,"unchanged":2}`. The backbone has `op=delete modified-file=../0000/index.xml#leaf-2-5-2-5-co000002` and `op=new m2/2-7-3`, so the explicit remedy is correct on the wire.
- But the manifest entry is `'delete 2.5/2-5-co000002.pdf key=-'`, and after filing, the current list STILL contains `'2.5/2-5-co000002.pdf (seq 0000) key=artifact:artifact_co000002@2.5'`. This reproduces the separate finding F10 along the way.

**The requirement.**

The lifecycle mechanics the finding relies on are real, and I am highly confident of them. In ICH eCTD v3.2.2, a leaf that a later sequence does not mention stays current, and replace/append/delete act on a leaf at its own heading. The ICH Q&A and the EU validation criteria are explicit that a document is relocated by a delete at the old heading plus a new leaf at the new one. FDA practice is the same as far as I know, but I cannot check the exact Technical Conformance Guide wording offline, so the FDA citation is medium confidence. The repo's own route comment (submission-ops.ts:2478) states the same rule.

What the package produces is valid and truthful:
- It emits a correct `new` at m2/2-7-3 and no cross-section replace.
- FDA would not reject it and would raise no high or medium validation error: two current leaves of the same content under two headings is valid eCTD.

The harm is to content currency:
- The agency's cumulative view keeps a current copy at 2.5 that the product's own content model no longer places there (the artifact now declares 2.7.3 only).
- Every later revision replaces only the 2.7.3 copy, so the 2.5 copy becomes a stale current document a reviewer can read.

"The operator must be told" is a product requirement, not an agency rule. It is supported by the route comment, the fail-closed principle, and the pinned unit test (package-sequence-lifecycle.test.ts:347). That test calls leaving the old copy on file "the honest answer until withdrawal exists here", and withdrawal now exists. The finding never claims rejection, so its medium severity is fair.

**Scope.**

In scope and not fixed at HEAD (ca636c7f): nothing in server/services/ectd, the submission gateways or submission-ops.ts detects a relocated artifact. It is not a procurement gap; this is pure plan logic. It belongs to the package-spine lane: docs/work-orders/README.md section 0 lists package-sequence-lifecycle.ts and the assemble route's lifecycle block as package-spine files, "Not the IND demo lane's files". planSequence is called only by the assemble route, and the shared computeLifecycleOperations needs no change.

Dependency: F10 (the filed delete carries no leafKey, so the fold never drops the withdrawn leaf) was reproduced by control case B. Until F10 is fixed, the remedy F12's fix would point the operator to does not clear the old copy from the product's record.

**Corrected claim.**

Every part of the claim holds. One clarification: the failure is a missing operator finding plus a stale current copy at the agency. It is not an agency rejection or validation error, because the emitted backbone is valid and truthful. The explicit remedy (`withdraw`) produces the right backbone, but because of F10 it does not remove the old copy from the product's own filed-state record.

**Smallest correct fix.**

Compute the relocations in planSequence and report them as findings in the route:

1. **planSequence** (server/services/ectd/package-sequence-lifecycle.ts): after `foldFiledState`, collect each prior leaf whose leafKey is `artifact:<id>@<oldCode>` when all of the following hold:
   - some desired leaf has key `artifact:<id>@<newCode>`, with newCode different from oldCode;
   - no desired leaf carries the prior's exact key, so the artifact is not still placed at the old code (legitimate dual placement stays silent);
   - the prior's path is not named in `params.withdraw`.

   Return these as `plan.relocated: [{ from: {ctdSection, fileName, sequenceNumber}, to: {ctdSection, fileName} }]`. This adds a field and changes no existing output.
2. **Assemble route** (submission-ops.ts lifecycle block, around line 2541): push one finding per entry, for example ruleId `LEAF-RELOCATED-OLD-COPY-CURRENT`. Its message names the filed copy (`2.5/2-5-co000002.pdf`, sequence 0000) and the exact entry to add: `withdraw: [{ ctdSection: '2.5', fileName: '2-5-co000002.pdf' }]`.
   - Use severity `error` so the bundle still assembles for inspection but the transmit gate blocks until the operator withdraws the old copy or re-maps the artifact. This matches the route's own "withdrawal and a new filing" rule.
   - Use `warning` instead if keeping both copies on purpose must stay transmittable.

Land this with or after F10: carry `leafKey` on the delete leaf in planSequence's returned leaves and in the route's `withdrawals.push`, and/or have foldFiledState drop the path match on a delete. Without F10, the finding re-fires on every later sequence after the operator complies. Worse, planSequence would accept a second withdrawal of a leaf already withdrawn.

**Blast radius.**

Files to change:
- server/services/ectd/package-sequence-lifecycle.ts: SequencePlan gains an additive `relocated` field.
- server/routes/submission-ops.ts: one finding push in the assemble lifecycle block.

The other spine is unaffected. planSequence has no other caller, and lifecycle-operator.ts, the packager and the vocabulary files are untouched.

Tests:
- server/services/ectd/__tests__/package-sequence-lifecycle.test.ts:347 ("moving a document to a DIFFERENT CTD section is not a replace across sections") pins today's behaviour. It stays green with an additive field because it uses toMatchObject on the summary. Its comment ("until withdrawal exists here") is stale and it should gain an assertion on `relocated`. It would break only if the fix were made a refusal.
- tests/submission-ops-package-spine.pglite.e2e.test.ts and tests/submission-ops-assemble-routes.test.ts have no move case and are unaffected. Probe case A is the right red-then-green pin to add to the e2e file.
- With `error` severity, governed transmit blocks the move case, by intent. No existing transmit test covers that case.

## Round 2 — F01, F04, F05, F07, F08, F13

### F01 — confirmed (severity high, spec confidence high, reproduced True)

**Observed (probe output).**

Probe: tests/zz-probes/verify-f01/f01.probe.test.ts (now deleted). It called the real shared packageEctdSubmission for FDA sequence 0000 with one 1.2 leaf and one 3.2.S.1 leaf, skipPdfaConversion, and read both backbones out of the ZIP. 1 passed.

PART A, what the ZIP contains at HEAD ca636c7f:
- index.xml has `ROOT TAG: <ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="3.2">`
- m1/us/us-regional.xml has `ROOT TAG: <fda-regional:fda-regional dtd-version="3.3" xml:lang="en" xmlns:fda-regional="http://www.ich.org/fda" xmlns:xlink="http://www.w3.org/1999/xlink">`

PART B, xmllint 2.9.14 --dtdvalid. The DTD is a reconstructed excerpt: the root ATTLIST says `xmlns:xlink CDATA #FIXED "http://www.w3c.org/1999/xlink"` and every other element is declared ANY, so the xlink value is the only thing being tested.
- index.xml as emitted, exit=3:
  - `element ectd: validity error : Element ectd namespace name for xlink does not match the DTD`
  - `... Value for attribute xmlns:xlink of ectd is different from default "http://www.w3c.org/1999/xlink"`
  - `... Value for attribute xmlns:xlink of ectd must be "http://www.w3c.org/1999/xlink"`
  - `Document ... does not validate`
- With only that value changed to w3c.org: exit=0.
- us-regional.xml shows the same three errors on `fda-regional` (exit=3); with only the value changed, exit=0.

PART C, the repo's own validator, validateDtdConformance(index.xml):
- as emitted: `[]`
- w3c.org variant: `["error:DTD_MISSING_XLINK_NS"]`

PART D, a namespace-aware reader bound to the w3c.org URI (as the ICH stylesheet must be to read DTD-valid documents), `count(//leaf/@xlink:href)`:
- index.xml as emitted: `0` (it is `2` when bound to w3.org); the w3c variant gives `2`.
- us-regional.xml: `0` as emitted, `1` for the w3c variant.

**The requirement.**

**The rule is real.**
- **ICH DTD (high confidence):** The ICH eCTD DTD 3.2 (ich-ectd-3-2.dtd) declares, on ectd:ectd: `xmlns:ectd CDATA #FIXED "http://www.ich.org/ectd"`, `xmlns:xlink CDATA #FIXED "http://www.w3c.org/1999/xlink"`, `dtd-version CDATA #FIXED "3.2"`. The non-W3C "w3c.org" spelling is a long-standing quirk kept for backward compatibility. Conforming index.xml files open with that value.
- **FDA DTD (medium-high confidence):** FDA's us-regional DTD declares the same #FIXED value. The repo's own extract of FDA's Module 1 backbone examples (docs/ectd/SPEC_DIGEST.md:17) shows `xmlns:xlink="http://www.w3c.org/1999/xlink"`. I could not reach the agency to re-read the DTD bytes, and they are not vendored.
- **Why it is an error:** XML 1.0 validity constraint "Fixed Attribute Default" says a #FIXED attribute must match its declared value when present. Any validating parser using the agency DTD (eValidator/Xerces, libxml2) reports it. The probe shows libxml2 doing so, and shows the error vanishes when only this value changes.

**What FDA would do.** The repo's digest of FDA eCTD Validation Criteria v4.5 (SPEC_DIGEST.md §3, line 90) lists "backbone valid against DTD" under HIGH severity ("blocks receipt"). So every index.xml and us-regional.xml from either spine would carry a High DTD error and face technical rejection. I did not verify the exact FDA criterion number.

**Secondary effect (medium/low confidence on which agency tools are namespace-aware).** A namespace-aware reader bound to the eCTD xlink URI finds no hrefs in our backbones (Part D). The ICH/FDA stylesheets the PIs reference would render leaves without links.

**Limit of the probe.** It used a reconstructed root ATTLIST, not the vendored DTD. The value inside the real DTD rests on spec knowledge plus the repo's FDA example, not on agency bytes.

**This is not allowed-but-unusual output.** The W3C-correct URI is exactly what the DTD forbids.

**Scope.**

**Not fixed at HEAD (ca636c7f).**
- regional-packager.ts:523 (buildFdaBackbone) and :715 (buildIndexXml) still emit w3.org; blame shows both lines unchanged since the history's boundary commit 613c6e00.
- No code in server/, client/src, shared/ or scripts/ uses w3c.org.
- The sweep README lists F01 as "unverified".

**Not a procurement gap, though procurement hides it.**
- The DTDs are absent: assets/ectd-dtd has only placeholder checksums, and the IND lane row says "Blocked: DTDs/ICH stylesheet (egress refused)". That is why no xmllint --dtdvalid has ever run.
- The defect itself is a wrong literal in shared code.
- Worse, the repo's structural gate encodes the wrong rule: ectd-validator-hardening.ts:308-313 raises DTD_MISSING_XLINK_NS unless the root says w3.org, and :295 suggests the same fix.
- Vendoring the DTDs would not fix anything. It would make the qualification harness's xmllint step fail every package.

**Lane.** regional-packager.ts and ectd-validator-hardening.ts are shared files and are not in the IND demo lane's (01TtwRHm) claimed file list.
- The package-model spine lane (01LjrcEe, claimed 2026-09-24, "Next: an adversarial pass over what this spine hands FDA") is the natural owner.
- The other spine is affected identically: its own evidence packages, docs/evidence/W5/2026-09-29-ind-ectd/packages/0000-index.xml:5 and 0000-m1_us_us-regional.xml:6, carry w3.org.
- In scope, but because the edit touches shared files, note it in the lane table for 01TtwRHm.
- None of the three files has a commit in the last 24h from another session; regional-packager.ts's last commit, ca636c7f, is this lane's.

**Smallest correct fix.**

1. **regional-packager.ts:** add one exported constant `ECTD_XLINK_NS = 'http://www.w3c.org/1999/xlink'`. Give it a dated comment: the ICH 3.2 and FDA 3.3 DTDs #FIX this non-W3C spelling, so do not "correct" it. Use it at :523 (buildFdaBackbone) and :715 (buildIndexXml).
2. **ectd-validator-hardening.ts:295/308/313:** require that same value, and report a present-but-w3.org declaration as its own wrong-value error rather than "missing". Without this, the repo's own gate flags every corrected backbone as error DTD_MISSING_XLINK_NS, as Part C shows. That blocks gatewayReady wherever validateEctdPackageHardened runs (submission-package-orchestrator.ts:1884/2607/2944, routes/submission-orchestrator.ts).
3. **assets/ectd-dtd/fixtures/index-valid.xml:28:** change to w3c.org.
4. **Pin it:** add a packager test asserting the root xmlns:xlink of index.xml and m1/us/us-regional.xml. Once DTDs are vendored, add an xmllint --dtdvalid check.

Same-family follow-ups outside the finding's file list:
- stf-generator.ts:130 emits w3.org on ectd:study. The ICH STF 2.2 DTD fixes it the same way (medium confidence).
- The EMA/PMDA/HC builders (:556/:592/:630) should be checked against their own DTDs when vendored; low confidence on what those declare, and their root elements have separate issues.
- Leave server/routes/ectd-compile.ts:1893: it is a non-transmissible eCTD 4.0 draft.

**Blast radius.**

**Files:**
- server/services/submission-gateways/regional-packager.ts (2 lines + constant)
- server/services/ectd/ectd-validator-hardening.ts (3 lines)
- assets/ectd-dtd/fixtures/index-valid.xml (1 line)
- optionally server/services/ectd/stf-generator.ts:130

**Other spine:** affected identically, and fixed by the same change through the shared packager. Leaf IDs, modified-file pointers, hrefs and checksums are untouched; only index-md5.txt changes, because index.xml bytes change.

**Nothing reads xlink by namespace URI**, so no reader breaks:
- no getAttributeNS or xlink-URI lookups in server/client/shared;
- qualification/qualify.ts:371 reads xlink:href by regex.

**Tests that pin current behaviour and must change:**
- server/__tests__/services/submission-orchestrator.test.ts:451-454 ("passes the vendored conformant backbone fixture with zero findings"): fails until index-valid.xml is updated. Its index-invalid expectation of DTD_MISSING_XLINK_NS still holds, because that fixture declares no xlink.
- tests/unit/ectd-validator-hardening-uncovered.test.ts:385-387, the `backboneOk` constant (w3.org): its uses at :430/:445/:459/:475 will pick up a new DTD error. Any assertion of a clean DTD bucket or of gatewayReady flips; update it to w3c.org.
- server/services/ectd/__tests__/stf-generator.test.ts:77: only if the STF is fixed too.

**Tests that need no change:**
- submission-orchestrator.test.ts:427/435 assert other codes with `.some()`.
- The input fixtures in client/src/concept2cure/v2/__tests__/ectdCompile.fixtures.ts:28/47, ectdCompileWithdrawal.test.tsx:26/40 and submission-gateways/__tests__/ectd-package-file-names.test.ts:13.
- The historical evidence snapshots under docs/evidence/.

**Separate path:** server/src/services/ectd.ts:45/61 is a legacy builder (ectd:index root), not on this spine. Check whether anything still reaches it.

### F04 — confirmed (severity high, spec confidence high, reproduced True)

**Observed (probe output).**

Probe tests/zz-probes/verify-f04/f04.probe.test.ts (real assemble route, PGlite SQL and real packager, copied from the package-spine e2e template; deleted afterwards). Result: "Tests 4 passed (4)", printing:
- 0000 (IND package, family 'ind'): <application-number application-type="fdaat4">123456</application-number> <submission-id submission-type="fdast1">0000</submission-id> <sequence-number submission-sub-type="fdasst1">0000</sequence-number>
- 0000 filed via recordFiledSequence, one artifact edited, then POST assemble {sequence:'0001', submissionType:'Original Application'} returned "status= 200" with <submission-id submission-type="fdast1">0001</submission-id> and <sequence-number submission-sub-type="fdasst1">0001</sequence-number>.
- Same POST with extra keys {submissionSubType:'amendment', subType:'Amendment', submissionId:'0000', fda:{submissionSubType:'amendment', submissionId:'0000'}} returned "status= 200" with identical output: fdast1 0001 / fdasst1 0001. The zod body drops the keys silently.
- POST {sequence:'0001', submissionType:'Efficacy Supplement'} on the IND package returned "status= 200" with application-type="fdaat4" ... <submission-id submission-type="fdast2">0001</submission-id>.
- The other spine's fda block, buildPackagerInputFromCore for an IND 'amendment' at 0003, is {"applicationType":"ind","submissionType":"original","submissionSubType":"amendment"}. Fed to packageEctdSubmission it gives <submission-id submission-type="fdast1">0003</submission-id> <sequence-number submission-sub-type="fdasst4">0003</sequence-number>.
- Control: with fda.submissionId:'0000' added, the packager emits <submission-id submission-type="fdast1">0000</submission-id> with fdasst4/0003. So the packager can carry the value, but no caller passes it.
The IND lane's own committed evidence shows the same contradictory pair: docs/evidence/W5/2026-09-29-ind-ectd/packages/0001-m1_us_us-regional.xml has <submission-id submission-type="fdast1">0001</submission-id><sequence-number submission-sub-type="fdasst4">0001</sequence-number>.

**The requirement.**

Element and attribute names check out: submission-id@submission-type (fdastN) and sequence-number@submission-sub-type (fdasstN). fdasst4 = Amendment is listed in controlled-vocab/cv-v3-data.ts as confirmed from FDA's own specs.

Semantics, from FDA's Module 1 spec v2.3 (us-regional DTD 3.3) and its Example Submissions document (high confidence): submission-id is the sequence number of the first submission of the regulatory activity a sequence belongs to. For the first sequence of an activity it equals the sequence number. Amendments and resubmissions carry the earlier number. The sub-type says what this sequence is within that activity. This is also why v3.3 has a submission-id separate from sequence-number (needed for grouped submissions), and it maps directly onto v4.0's submission vs submission-unit (CL13) model. The repo's SPEC_DIGEST example (presubmission 0001, submission-id 0001) is consistent with this.

IND follow-ups: protocol and information amendments under 21 CFR 312.30/312.31, and responses to FDA, are amendments to the IND's single regulatory activity. That means fdast1 Original Application, sub-type Amendment, submission-id = the IND's original sequence (0000). The IND lane's code makes the same type/sub-type mapping (core-to-packager.ts fdaSubmissionTypeFor, citing the M1 spec v2.3).

What the package spine sends instead: a second Original Application whose sub-type is Original, starting a new activity at 0001. The other spine sends an amendment that amends nothing (submission-id equals its own sequence). Both tell FDA something untrue in the admin block and would misgroup the sequence in FDA's records.

Supplements to an IND do not exist. Efficacy, CMC and labeling supplements are for approved NDAs/BLAs (21 CFR 314.70, 601.12), so fdaat4 + fdast2 is a false statement.

Where confidence drops to medium: whether FDA's v3.2.2 validation criteria raise a High error (technical rejection) for these exact pairs, as opposed to misfiling or an information request. I cannot recall the specific criterion numbers, and no validator is available here.

Nuance: output is correct for sequences that start an activity, such as a supplement's first sequence or an annual report. It is wrong for every amendment or resubmission, which on an IND is nearly every follow-up.

**Scope.**

Not fixed at HEAD (ca636c7f):
- regional-packager.ts:499-501 still defaults sub-type to 'original' and submissionId to input.sequence.
- assembleBody (submission-ops.ts:1952-1989) has no sub-type or submission-id field, and the fda block at :2693 passes only applicationType and submissionType.
- No commit since 2026-09-20 touches sub-type or submission-id.
- package-sequence-lifecycle.ts:303-306 records the belief that 'amendment' has no FDA carrier. It is a sub-type, not a submission type.

Not a procurement gap. The vocabulary (fdasst1-7) and the packager inputs (fda.submissionSubType, fda.submissionId) already exist; they are simply never wired or validated.

Lanes:
- In scope for the package-model spine lane (docs/work-orders/README.md §0, session 01LjrcEe, row D7/W5): the assemble route body, the lifecycle block and planSequence.
- The default in the shared packager and the missing submissionId in core-to-packager.ts belong to the other spine, the IND demo lane (01TtwRHm). Changing the packager breaks their amendments, so that half needs a hand-off.
- Out of both spines, same defect class: server/services/ind-lifecycle/ind-ectd-envelope.ts:84 always emits submission-id = sequenceNumber, pinned by ind-ectd-envelope.test.ts:30.

**Smallest correct fix.**

1. Route (in this lane), server/routes/submission-ops.ts:
   - Add two optional fields to assembleBody: submissionSubType (accept only values resolveSubmissionSubTypeCode resolves) and submissionId (/^\d{4}$/).
   - In the lifecycle block: for sub-types amendment, resubmission or application, require submissionId to be a sequence present in readFiledSequences(existingMetadata) and lower than the current sequence. Otherwise return 409 with the reason.
   - Pass both through the fda block at :2693.
   - Record both on the bundle descriptor and the filed record (package-content-change.ts) so later sequences can be checked against their activity.

2. Shared packager, regional-packager.ts:499-501:
   - Default submissionId to input.sequence only for sub-types original and presubmission.
   - For fdasst3, fdasst4 and fdasst5, throw ValidationError when submissionId is missing or not lower than the sequence (this also refuses an amendment at 0000).
   - Refuse sub-type original with a submissionId different from the sequence.

3. Application type vs submission type: add a deny-list of pairs that are certainly invalid, rather than a full allow-table whose exact contents I cannot vouch for:
   - IND (fdaat4) or DMF (fdaat5) with Efficacy, CMC, Labeling or REMS Supplement (fdast2/3/4/11).
   - Any non-IND application with IND Safety Reports (fdast9).
   Throw ValidationError in buildFdaBackbone, and mirror the check in the route's vocabulary.accepts so the operator gets a 409 listing the accepted terms.

The finding's own sketch ("any later sequence must state both") goes further than needed: a supplement's first sequence can correctly default to sub-type original with its own number.

**Blast radius.**

Files:
- server/routes/submission-ops.ts (assembleBody, lifecycle block, fda block)
- server/services/submission-gateways/regional-packager.ts (buildFdaBackbone, shared)
- optionally server/services/ectd/package-sequence-lifecycle.ts and package-content-change.ts (to record sub-type and submission-id)

Other spine: yes. Fix 2 makes every core-to-packager amendment throw, because fdaSubmissionTypeFor returns sub-type 'amendment' with no submissionId (core-to-packager.ts:218-240, fda block :320-328). It must land together with core-to-packager passing the activity's first sequence (0000 for an IND), coordinated with the IND lane (01TtwRHm). Their evidence 0001-m1_us_us-regional.xml shows the wrong value today.

Tests that pin current behaviour and would need to change:
- server/services/submission-gateways/__tests__/modified-file-leaf-id.test.ts:50: amendment with no submissionId; add '0000'.
- server/services/ectd/__tests__/core-to-packager-fda-admin.test.ts:134 and :177-178: emits an 'amendment' at sequence 0000; move it to 0001 with a submissionId.
- server/services/ectd/qualification/golden-fixtures.ts:169: the NDA lifecycle fixture uses sub-type amendment with no submissionId; add one, since qualification runs depend on it.

Tests affected by fix 3:
- tests/submission-ops-package-spine.pglite.e2e.test.ts:212, 226, 242: IND + 'Efficacy Supplement'.
- tests/submission-ops-assemble-routes.test.ts, about 10 posts between :771 and :1317: lockedPkg is family 'ind' (:191) with 'Efficacy Supplement'. Switch these to 'Original Application' + amendment + '0000', or to an NDA family.

Unaffected:
- package-sequence-lifecycle.test.ts, which has no application type, unless the deny-list is placed in planSequence.
- lifecycle-packaging.test.ts:179 (NDA + Efficacy Supplement).
- mdx-submission-gateway-transmit-bundle-guard.test.ts:632 (descriptor only).

### F05 — confirmed (severity high, spec confidence medium, reproduced True)

**Observed (probe output).**

Probe tests/zz-probes/verify-f05/f05.probe.test.ts ran at HEAD ca636c7f against the real PUT route, the real assemble route and packager, and PGlite. Package family 'ind' (and 'nda' for NDA021345), status locked, no identifiers stored before the PUT. 8/8 tests passed. Output:
[F05] usableIdentifier('applicationNumber', "IND123456") -> "IND123456" (also "IND-123456", "NDA021345", "BLA125742", "12345", "1234567", "000512" accepted unchanged; only "IND 123456" -> null)
[F05] PUT IND123456: status 200 stored="IND123456"
[F05] assemble IND123456: status 200 errorCount(s)=[0] ruleIds=[]
[F05] ... m1/us/us-regional.xml: <application-number application-type="fdaat4">IND123456</application-number>
[F05] assemble IND-123456: status 200 errorCount(s)=[0] ruleIds=[] -> <application-number application-type="fdaat4">IND-123456</application-number>
[F05] assemble NDA021345: status 200 errorCount(s)=[0] ruleIds=[] -> <application-number application-type="fdaat1">NDA021345</application-number>
[F05] assemble 12345: ... errorCount(s)=[0] -> <application-number application-type="fdaat4">12345</application-number>
[F05] assemble 1234567: ... errorCount(s)=[0] -> <application-number application-type="fdaat4">1234567</application-number>
The form placeholder is confirmed at GatewayTransmittals.tsx:118: placeholder 'e.g. IND123456'.
Extra finding: a second validator in the repo enforces the opposite rule. That is ectd-regional-rules.ts:354, FDA_APPLICATION_PREFIX = /^(IND|NDA|BLA|ANDA|DMF|DDT)-?\d{4,6}$/i, rule FDA-ESG-002, whose fix text reads "e.g., IND123456":
[F05] FDA-ESG-002 for "123456" -> error: Application number "123456" does not match valid FDA prefix (IND/NDA/BLA/ANDA/DMF/DDT + 4-6 digits)
[F05] FDA-ESG-002 for "IND123456" -> no finding
FDA-ESG-002 does not run on the package-spine assemble path (ruleIds=[] above) and does not run on ectd-compile or assemble-from-core.

**The requirement.**

I am highly confident in the rule itself. In us-regional DTD 3.3, the pathway is carried by the application-type attribute (fdaat1 NDA … fdaat4 IND, fdaat5 MF). The element text is the FDA-assigned number. FDA assigns six-digit numbers for NDA, ANDA, BLA, IND and DMF, written with leading zeros (NDA 021345, DMF 012345), and pre-assigned numbers are six digits too.

The repo's own vendored notes agree:
- docs/ectd/SPEC_DIGEST.md, extracted from FDA's Module 1 backbone examples v1.4, shows <application-number application-type="fdaat1">456789</application-number>.
- cv-v3-data.ts and SPEC_DIGEST quote M1 Addendum 1 building the server folder as type prefix + number ('nda456789'). That only works if the element holds the digits alone.
- The package-spine e2e test itself seeds '123456', and the IND lane ships BX-512 as '000512'.

So a backbone carrying 'IND123456', 'IND-123456', 'NDA021345', '12345' or '1234567' holds a wrong number. For the first three it repeats a pathway the attribute already states.

I am only moderately confident about how FDA reacts. A DTD-only check passes the value, because application-number is #PCDATA. The repo digest lists the High (blocks receipt) criterion "#5 application type/number mismatch between FDA form and us-regional.xml". Forms 1571 and 356h carry the number and the type separately, so a prefixed or wrong-length value would most likely trip that check and lead to technical rejection. Even if it did not, the sequence would not be associated with the right application. I cannot quote, offline, the criterion number that checks the six-digit format directly.

FDA-ESG-002's prefix requirement (with fix text "e.g., IND123456") has no basis I know of in the M1 specification, the ESG or the forms. It looks like the origin of the product's wrong example.

Either way, the product reports errorCount 0, which is untrue about the filing.

**Scope.**

The defect is open at HEAD ca636c7f (reproduced above; the working tree is clean apart from the deleted probe). It is a code and input-rule defect, not a procurement gap. Buying the DTDs would not catch it, because application-number is #PCDATA.

Ownership:
- The PUT /packages/:id/regulatory-identifiers route, the assemble identifier gate (server/routes/submission-ops.ts ~2025-2060 and ~2666-2690) and GatewayTransmittals.tsx belong to the package-spine (W5) lane.
- server/services/ectd/regulatory-identifiers.ts is SHARED with the IND lane (session 01TtwRHm). Its recordedApplicationId() calls usableIdentifier() and is used by server/routes/ectd-compile.ts and server/services/ectd/assemble-from-core.ts. So usableIdentifier must not be tightened.

Related items in other lanes (hand-offs, not part of F05):
1. ectd-regional-rules.ts FDA-ESG-002 enforces the opposite rule. It raises an error on the correct '123456' and passes 'IND123456'. It runs through validateEctdPackageHardened (submission-package-orchestrator, submission-orchestrator) and through ectd4-validator.validatePackage (ectd-export validate endpoints, MCP validation tool, AnaToolExecutor).
2. MissionControl.tsx:544 (the IND lane's program record) has the placeholder 'e.g. IND 123456'. With the space, usableIdentifier refuses the value, and recordedApplicationId silently falls back to the program code.

**Corrected claim.**

Every point of the claim holds as stated. One addition: the repo also contains a validator, ectd-regional-rules.ts FDA-ESG-002, that enforces the opposite of the correct rule. It requires the IND/NDA/BLA prefix and raises an error on '123456'. That is probably where the 'IND123456' example came from, and the fix should not leave two contradictory rules in the codebase.

**Smallest correct fix.**

Package spine only:

1. In regulatory-identifiers.ts, add new exports and nothing else: `export const FDA_APPLICATION_NUMBER_PATTERN = /^\d{6}$/;` and `fdaApplicationNumberProblem(v)`. The helper returns the expected-form message: "FDA application numbers are the six digits FDA assigned, with leading zeros and without the IND/NDA/BLA prefix (application-type carries the pathway): record 123456, not IND123456". Leave usableIdentifier and recordedApplicationId unchanged.

2. In the PUT /packages/:packageId/regulatory-identifiers route, after loading pkg: if deriveRegionAndFormat(pkg.packageFamily) gives region 'FDA' AND format 'ectd', refuse a value that fails the pattern. Return 400 REGULATORY_IDENTIFIER_INVALID with fields ['applicationNumber'] and that message. Never normalize the value. Gate on the ectd format, not on FDA alone: 510(k) families are FDA/estar and legitimately carry K-numbers.

3. In assemble, right after readRegulatoryIdentifiers (~line 2666): when isEctdFormat && packagerRegion === 'fda' && applicationNumber !== null && the pattern fails, push an error finding (e.g. FDA-APPLICATION-NUMBER-FORMAT) and add 1 to errorCount. This is the authoritative block, because the assemble body can override region and old stored values need catching. The governed transmit gate already hard-blocks on errors.

4. In GatewayTransmittals.tsx:118, change the placeholder to 'e.g. 123456' and the description to say "FDA: the six-digit number FDA assigned, no prefix".

Follow-up, separate change in the shared validator (same one-rule principle): invert FDA_APPLICATION_PREFIX in ectd-regional-rules.ts to /^\d{6}$/ and correct its fix text.

**Blast radius.**

Files changed:
- server/services/ectd/regulatory-identifiers.ts (additive exports only)
- server/routes/submission-ops.ts (PUT route and assemble gate)
- client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx

The other spine (ectd-compile, assemble-from-core, package-from-core) is untouched as long as usableIdentifier and recordedApplicationId stay charset-only. It already ships digits (BX-512 -> 000512).

Tests that pin the current behaviour and would need new fixtures:
- tests/submission-ops-regulatory-identifiers-routes.test.ts: accepts 'IND123456', '  IND123456  ', 'IND000001'.
- tests/submission-ops-assemble-routes.test.ts: REGULATORY 'IND123456', and 'IND999999' at line 356.
- tests/submission-ops-preflight-routes.test.ts: IDS 'IND123456', and 'IND999999' at line 413.
- client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx: submits 'IND123456' at lines 41 and 241. It should also gain a placeholder assertion.
- tests/submission-ops-artifact-mapping-routes.test.ts: has 'IND1' in metadata; affected only if that path assembles.

tests/submission-ops-package-spine.pglite.e2e.test.ts already uses '123456' and is unaffected.

If the FDA-ESG-002 follow-up is also done, it touches the orchestrator and validator paths and their fixtures that use 'IND123456': tests/unit/ectd4-validator-extensions.test.ts, ectd-validator-hardening-uncovered.test.ts, submission-package-orchestrator-*.test.ts, ectd-export-routes.test.ts, orchestrator-regional-skip-reason.test.ts, server/__tests__/services/submission-orchestrator.test.ts and others. Coordinate that with the owners of those paths.

### F07 — confirmed (severity high, spec confidence medium, reproduced True)

**Observed (probe output).**

Probe tests/zz-probes/verify-f07/f07.probe.test.ts (now deleted). It used the real routes, PGlite and the real packager; regional-packager.ts is unchanged from HEAD, and the parent's 4-line working-tree edit to submission-ops.ts does not touch this path. Output:
[F07] PUT regulatory-identifiers -> 200 {"applicationNumber":"123456","applicantId":"123456789","applicantName":"Acme Biologics Inc",...}
[F07] assemble -> 200 validation {"errorCount":0,"warningCount":0,"infoCount":1} format ectd
[F07] stored findings -> ["info:SUMMARY"]
[F07] evidence -> dtdStatus {"missing":["ich-ectd-3-2.dtd","us-regional-v3-3.dtd"],"selfContained":false}
[F07] m1/us/us-regional.xml <admin> block:
<admin>
      <applicant-info/>
    <application-set>
      <application>
        <application-information>
          <application-number application-type="fdaat4">123456</application-number> ...
[F07] entries -> ["m1/us/us-regional.xml","m1/us/1-2/cover-letter-cover0001.pdf","m2/2-5/2-5-co000002.pdf","index.xml","index-md5.txt","util/index-md5.txt"]
[F07] entries containing the DUNS / the company name -> {"123456789":[],"Acme Biologics Inc":[]}   (searched entry names, raw bytes and every inflated PDF stream)
[F07] <application> start tag -> <application>
[F07-direct] packageEctdSubmission({region:'fda', sponsorId:'123456789', sponsorName:'Acme Biologics Inc', fda:{applicationType:'IND'}}) gives the same <applicant-info/>, and hits -> {"123456789":[],"Acme Biologics Inc":[]}
Code: regional-packager.ts uses sponsorId and sponsorName only in the EMA, PMDA and HC builders (lines 564-565, 600-601, 638-639). fdaContactsBlock line 371: `if (!contacts.length) return '      <applicant-info/>';`. No production caller passes fda.contacts; the only caller that does is the qualification fixture golden-fixtures.ts:170.

**The requirement.**

The rule is real, as far as I can tell without the DTD. In FDA's us-regional DTD v3.3 (M1 Backbone Files Specification v2.x and its example us-regional.xml), admin = (applicant-info, application-set) and applicant-info = (id, company-name, submission-description?, applicant-contacts). id holds dun-and-bradstreet-number. applicant-contacts holds at least one applicant-contact = (applicant-contact-name[@applicant-contact-type], telephones/telephone[@telephone-number-type], emails/email). application carries application-containing-files (true|false), added in 3.3 for grouped submissions.

If that model is right, an empty <applicant-info/> and an <application> without the attribute both fail DTD validation of us-regional.xml. FDA's eCTD validation criteria treat an invalid regional backbone as a high-severity, rejection-class error. Even if the validator let it through, the backbone would not identify the applicant.

The product also states something untrue. REGULATORY-IDENTIFIER-MISSING and the PUT route's doc both say the backbone carries the applicant identity. The PUT also clears the 'stale' bundle when applicantId or applicantName changes, but for FDA those values appear in no file.

Confidence:
- High that applicant-info must carry the company name and contacts and must not be empty.
- Medium-high on the exact child element names and that DUNS is required.
- Medium that application-containing-files is #REQUIRED.
- Medium on the exact validation-criterion severity label. I cite no criterion number.

The DTD is not in the repo and agency hosts are unreachable. The repo's docs/ectd/SPEC_DIGEST.md shortens this block to '... telecom/email ...' and leaves out id and company-name, so the repo has no authoritative copy.

Related defect found while checking: fdaContactsBlock is non-conformant even when contacts are passed. It writes no id or company-name, and puts <email> and <telephone> directly under applicant-contact without the <telephones>/<emails> wrappers or telephone-number-type. It also puts email before telephone and makes both optional.

**Scope.**

In scope and not fixed at HEAD. The latest packager commits (ca636c7f, 09c4c15d) do not touch the admin block, and the probe reproduces the empty element at HEAD.

The IND lane already noticed it without fixing it: docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md (about line 1792) says "us-regional.xml carries an empty <applicant-info/> ... expect eValidator to name it". Their 2026-09-29 evidence (docs/evidence/W5/2026-09-29-ind-ectd/packages/0000-m1_us_us-regional.xml line 8) shows the same empty element, so the other spine has the same defect.

This is a code defect, not a procurement gap. The missing DTDs (dtdStatus.missing lists both) only explain why nothing local catches it; supplying them would detect the problem, not fix it.

Ownership:
- regional-packager.ts is shared and unclaimed in docs/work-orders/README.md §0.
- The route side (identifier PUT, assemble call, finding wording) is in the package-model spine lane (session 01LjrcEe).
- The packager change reaches the IND lane's callers, so it needs a hand-off entry for session 01TtwRHm.

**Corrected claim.**

The claim holds as stated at HEAD: the DUNS and company name appear in no file in the bundle, `<applicant-info/>` is always empty on this spine, `<application>` has no application-containing-files attribute, and errorCount is 0. It applies equally to the IND demo spine through the shared packager. It understates one thing: even the contacts path is not DTD-conformant, so passing fda.contacts alone would not fix it.

**Smallest correct fix.**

1. regional-packager.ts, buildFdaBackbone and fdaContactsBlock. Fail closed, the same way the builder already refuses an unresolved application type:
   - Emit `<applicant-info><id><dun-and-bradstreet-number>{sponsorId}</dun-and-bradstreet-number></id><company-name>{sponsorName}</company-name><applicant-contacts>…</applicant-contacts></applicant-info>`.
   - Emit each contact as `<applicant-contact><applicant-contact-name applicant-contact-type="fdaactN">…</applicant-contact-name><telephones><telephone telephone-number-type="…">…</telephone></telephones><emails><email>…</email></emails></applicant-contact>`. The telephone-number-type code must come from the M1 vocabulary; add it to controlled-vocab next to fdaact.
   - Write `<application application-containing-files="true">`.
   - Throw ValidationError instead of emitting `<applicant-info/>` when no contact has a name, phone and email.
2. regulatory-identifiers.ts and submission-ops.ts:
   - Add a regulatory contact (name, phone, email) to the recorded identifiers and the PUT body.
   - Count it in `missing` so REGULATORY-IDENTIFIER-MISSING blocks without it.
   - Require a 9-digit DUNS for FDA. The PUT currently accepts 'DUNS-123456789', which the e2e template itself records.
   - Pass `fda.contacts` to packageLeafBytes.
3. Until 1 and 2 land, change the REGULATORY-IDENTIFIER-MISSING message and the PUT doc so they no longer say the FDA backbone carries the applicant identity.

**Blast radius.**

Files:
- server/services/submission-gateways/regional-packager.ts
- ectd-packager/types.ts (contact fields)
- controlled-vocab (telephone-number-type codes)
- server/services/ectd/regulatory-identifiers.ts
- server/routes/submission-ops.ts (PUT body, assemble call, finding text)
- scripts/ci/check-fabricated-identity.mjs already covers `<company-name>`/`<id>` fallbacks, so the existing UNASSIGNED placeholders must keep saying "unassigned".

The other spine is affected. assemble-from-core.ts, package-from-core.ts, core-to-packager.ts and orchestrator-real-package.ts all call the same packager with sponsorId and sponsorName but no fda.contacts. Once the packager fails closed they are refused until they supply a contact, which breaks the IND demo path (D7 evidence) unless that lane makes the matching change.

Tests that build FDA packages without contacts and will likely need updating. I found these by grep and did not run them:
- tests/submission-ops-package-spine.pglite.e2e.test.ts (REGULATORY has applicantId 'DUNS-123456789' and no contact)
- server/services/submission-gateways/__tests__/fda-filing-identity.test.ts
- lifecycle-packaging.test.ts
- regional-backbone-dtd-path.test.ts
- pre-transmit-check.test.ts
- the qualification fixture golden-fixtures.ts:170 (its contact has no phone)

The client fixtures ectdCompile.fixtures.ts and ectdCompileWithdrawal.test.tsx hard-code `<admin><applicant-info/></admin>` as input strings. They will not break, but they record the non-conformant shape.

### F08 — confirmed (severity medium, spec confidence medium, reproduced True)

**Observed (probe output).**

Ran at HEAD d5059e98. The probe was tests/zz-probes/verify-f08/f08.probe.test.ts, now deleted. It used the real assemble route, the real packager and PGlite on an IND package (packageFamily 'ind'). Sequence 0000 was assembled and filed through recordFiledSequence, artifact 2 was edited, then POST assemble {sequence:'0001', submissionType:X} was sent for each word. The vitest output was:
{"word":"IND","status":200,"descriptorSubmissionType":"IND","applicationType":"fdaat4","backboneSubmissionType":"fdast9","subSubType":"fdasst1"}
{"word":"report","status":200,"descriptorSubmissionType":"report","backboneSubmissionType":"fdast5"}
{"word":"labeling","status":200,"descriptorSubmissionType":"labeling","backboneSubmissionType":"fdast4"}
{"word":"supplement","status":200,"descriptorSubmissionType":"supplement","backboneSubmissionType":"fdast2"}
{"word":"Safety","status":200,"backboneSubmissionType":"fdast9"}
{"word":"a","status":200,"backboneSubmissionType":"fdast1"}
{"word":"not an annual report","status":200,"backboneSubmissionType":"fdast5"}
{"word":"amendment","status":409,"code":"SUBMISSION_TYPE_UNKNOWN"}  (control: the refusal only fires when no substring overlaps)
{"word":"Efficacy Supplement","status":200,"backboneSubmissionType":"fdast2"}  (control: exact term)
F08_FILED [{"sequence":"0000","submissionType":"original"},{"sequence":"0001","submissionType":"supplement"}] backbone=fdast2
"Tests 1 passed (1)". Every value the finding claims appeared. Three extra cases also show the "refused with the list" promise fails: a single letter, a negation and the word 'Safety' each resolve to a code. Cause: controlled-vocab/index.ts:136 matches `description.includes(norm) || norm.includes(description)` and takes the first hit. submission-ops.ts:2525 passes that resolver as planSequence's `accepts`, and submission-ops.ts:2704 hands the raw word to the packager as fda.submissionType. Because fda.submissionType takes precedence at regional-packager.ts:480, the packager's own guard against the 'IND'→fdast9 mistake (its comment at :443-448) is bypassed on this route. The descriptor (:2849), the response (:2989), the filed history and the ledger record (governed-transmit.ts:683 and :716) all store the operator's word.

**The requirement.**

The requirement is real, though it is not a rule about how a tool maps words. In the FDA us-regional backbone (DTD 3.3, Module 1 spec v2.3), submission-id/@submission-type is a required coded attribute. Its value names the regulatory activity being filed: Original Application, Efficacy, CMC, Labeling or REMS Supplement, Annual Report, IND Safety Reports, Periodic Safety Reports and so on. FDA's eCTD Submission Types and Sub-Types guidance uses it to classify the submission. The repo's own notes say the same: docs/ectd/SPEC_DIGEST.md:51 maps it to a fixed code list (CL12).

Every word in the finding matches several codes. 'supplement' matches 4 (fdast2, 3, 4, 11), 'report' matches 3 (5, 9, 10) and 'labeling' matches 2 (4, 8). 'IND' is not a submission type at all; it is the application type. Picking the first match is a guess, and the repo itself names this guess as a defect at regional-packager.ts:443-448 ("Every orchestrator IND sequence ... declared itself an IND safety report"). It also breaks the form's promise at GatewayTransmittals.tsx:139 ("A term that cannot be filed is refused with the list") and CLAUDE.md's fail-closed rule.

What FDA would do (I am confident of this): 'IND' → fdast9 on an IND (fdaat4) is a valid code in a valid combination. It passes structural validation, so FDA is told an amendment is an IND safety report (21 CFR 312.32) and may misroute it. The product's records say "IND" or "supplement" while the backbone says something else, so the audit record of what was filed is untrue.

What I am less sure of: whether FDA's validation criteria reject 'supplement' or 'labeling' (fdast2, fdast4) on an IND as an invalid application-type/submission-type combination. I recall combination checks exist but cannot cite the criterion ID or severity, and that check is finding F04's ground. Partly offsetting all this: the loose match was a deliberate choice. planSequence's doc comment (package-sequence-lifecycle.ts:252-255) and its unit test (line 245) pin 'supplement' as accepted. That weakens "defect" only in the sense that the design was intended, not that it is correct.

**Scope.**

Not fixed at HEAD d5059e98. The resolver is unchanged in git log, and the probe reproduced on a clean tree. It is not a procurement gap: no DTD, validator licence or ESG credential is involved, only which code the code emits for a word. It belongs to the package-model spine lane (docs/work-orders/README.md:58, session 01LjrcEe8y3zUQxwX91zzTaM): "the assemble route's lifecycle block, governed-transmit's filed-sequence record". The resolver (controlled-vocab) and regional-packager.ts are shared with the IND demo lane's sequence spine. That spine feeds internal enum keys through core-to-packager.ts:324 ('original', 'annual', 'ind_safety_report'), which depend on the loose match and are pinned by core-to-packager-fda-admin.test.ts:76-80. So the fix must sit at the package-spine assemble boundary, not in resolveV3.

Overlap with F04: two things the probe also showed belong to F04, not F08. Every follow-up ships submission-sub-type fdasst1 ('Original'), and an IND package accepts 'Efficacy Supplement' because application type and submission type are never checked against each other.

**Smallest correct fix.**

1. In server/services/ectd/controlled-vocab/index.ts, add one canonical strict resolver beside resolveV3 and leave resolveV3 unchanged. It accepts the exact code, or the exact description compared case-insensitively after collapsing whitespace, '_' and '-'; anything else returns null:
   `export function resolveSubmissionTypeExact(v: string): V3Code | null`
2. In server/routes/submission-ops.ts (assemble), when submissionTypeTerms(region) is non-null (FDA), resolve the declared type once with the new function.
   - Pass `accepts: v => resolveSubmissionTypeExact(v) !== null` to planSequence at :2525. The existing SUBMISSION_TYPE_UNKNOWN refusal, with acceptedSubmissionTypes, then fires for 'IND', 'report', 'supplement' and the rest.
   - Pass the resolved code to the packager: `fda: { applicationType, submissionType: entry.code }` at :2704. resolveV3 passes a valid code through unchanged at index.ts:134, so no second loose resolution happens.
   - Store `submissionType: entry.description` and a new `submissionTypeCode: entry.code` on the descriptor at :2849. A 0000 with nothing declared becomes 'Original Application'/'fdast1'.
   - Non-FDA regions stay free text.
3. With that, governed-transmit.ts:683 and :716 record the canonical description with no change. Optionally also carry submissionTypeCode into the recordFiledSequence entry and the ledger facts.
4. Update planSequence's doc comment (package-sequence-lifecycle.ts:252-255), which says accepts must stay the loose resolver.

**Blast radius.**

Files: server/services/ectd/controlled-vocab/index.ts (one new export; resolveV3 untouched), server/routes/submission-ops.ts (assemble vocabulary, the packager's fda.submissionType, descriptor fields), server/services/ectd/package-sequence-lifecycle.ts (comment only), and optionally server/services/submission-gateways/governed-transmit.ts (carry the code). The client needs no change: the form text already promises refusal, and an empty field is not sent (GatewayTransmittals.tsx:329).

The other spine (sequence spine / ectd-compile / package-from-core, IND demo lane) is not affected. It still uses resolveSubmissionTypeCode with its enum keys, and regional-packager.ts is unchanged.

Tests that pin current behaviour:
- server/services/ectd/__tests__/package-sequence-lifecycle.test.ts:245 accepts 'supplement' and 'original' through a vocabulary built from the loose resolver. It stays green as a unit test but now contradicts the route; switch it to the strict resolver and move both words to the refused list.
- tests/submission-ops-assemble-routes.test.ts:733 expects `opts.fda.submissionType` to be 'Annual Report'. It becomes 'fdast5' if the code is passed; it is unchanged if the canonical description is passed instead.
- Unaffected: tests/submission-ops-package-spine.pglite.e2e.test.ts (uses the exact 'Efficacy Supplement'), core-to-packager-fda-admin.test.ts:76-80 and fda-filing-identity.test.ts:156 (resolveV3 unchanged), and client gatewayTransmittals.test.tsx:575.

Add a failing-first route test covering 'IND', 'report' and 'supplement' → 409 SUBMISSION_TYPE_UNKNOWN, and asserting that the descriptor and filed history carry 'Efficacy Supplement'/'fdast2' for an exact term.

### F13 — confirmed (severity medium, spec confidence medium, reproduced True)

**Observed (probe output).**

The probe was tests/zz-probes/verify-f13/f13.probe.test.ts, now deleted. It ran the real assemble route, real packager, real zip and PGlite at HEAD d5059e98. The package is an IND with sections form-1571 (maps to 1.1), cover-letter (1.2), 2.5 and 3.2.P.1. 4/4 tests passed.

[0000] Both Module 1 leaves are filed operation="new": m1-1-forms holds leaf-1-1-form-1571-form10004 and m1-2-cover-letters holds leaf-1-2-cover-letter-cover0001. Output: "admin <form> elements: (none)".

[A] Only the Clinical Overview is edited, then 0001 is assembled:
  status 200 lifecycle {"summary":{"new":0,"replace":1,"append":0,"delete":0,"unchanged":3},"omittedCount":3}
  zip entries ["m1/us/us-regional.xml","m2/2-5/2-5-co000002.pdf","index.xml","index-md5.txt","util/index-md5.txt"]
  regional backbone m1/us/us-regional.xml -> <m1-regional>\n\n  </m1-regional>
  validation errorCount 0 warningCount 1 findings ["warning:MODULE-M1-MISSING","info:SUMMARY"]

[B] Only the cover letter is edited:
  leafManifest [{"s":"1.2","op":"replace","mf":"../0000/m1/us/us-regional.xml#leaf-1-2-cover-letter-cover0001"}]
  <leaf operation="replace" modified-file="../../../0000/m1/us/us-regional.xml#leaf-1-2-cover-letter-cover0001" ... xlink:href="1-2/cover-letter-cover0001.pdf" ...>

[C] Only the 1571 is edited:
  <leaf operation="replace" modified-file="../../../0000/m1/us/us-regional.xml#leaf-1-1-form-1571-form10004" ... xlink:href="1-1/form-1571-form10004.pdf" ...>

Nothing on the transmit path checks for a cover letter or a 1571: a grep of governed-transmit.ts, mdx-submission-gateway.ts, package-content-change.ts, submission-ops.ts and ectd-structural-validator.ts found no match. MODULE-M1-MISSING is a warning, and it fires only when no m1 leaf ships at all. Transmit blocks only on errors.

**The requirement.**

The finding rests on three rules, which carry different confidence.

1. Every IND submission is accompanied by its own Form FDA 1571. Confidence: high. The form has a per-submission Serial Number field (21 CFR 312.23(e) serial numbering). Its box 11 lists every follow-up category: protocol and information amendments, safety reports, annual report, response to hold, general correspondence. FDA's form instructions require it with each IND submission. The repo agrees: server/services/ind/ctd/authoring-guidance.ts:28 says "mandatory cover form for every IND submission and every subsequent amendment". docs/ectd/SPEC_DIGEST.md lists "required fillable form (356h/2252/1571) missing" as HIGH severity, transcribed from FDA eCTD Validation Criteria v4.5. So an IND follow-up with no 1571 is deficient and plausibly rejected. I cannot confirm the rule number offline.

2. Each FDA sequence carries its own cover letter. Confidence: medium. FDA recommends a cover letter with every submission ("should"), and the repo's reasoning-engine/rule-data.ts:39 says 1.2 is required, granularityRule 'one-per-sequence'. I know of no FDA receipt-blocking validation rule for a missing cover letter. The repo's other spine (ectd-compile.ts:1757) treats it as a warning, "strongly recommended".

3. Per-submission cover letters and forms are filed with operation 'new', not 'replace'. Confidence: medium. FDA's Module 1 example, as transcribed in SPEC_DIGEST, files sequence 0001's 356h as operation="new" under a sequence-specific name. EU guidance says the same explicitly, and it is standard publisher practice. I know of no FDA validation error for a replace on a 1.2 or 1.1 leaf. That arm would not be rejected, but it tells FDA something untrue: the cumulative view would show the original IND's cover letter and 1571 as superseded by an amendment's.

The rules the finding relies on are real, not invented. The consequences differ by arm: a missing 1571 is a regulatory deficiency and possible rejection; a missing cover letter is a guidance deficiency; a replace misfiles the lifecycle record.

**Scope.**

In scope and not fixed at HEAD (d5059e98). origin/concept2cure-v2 is ahead only by a repo-health baseline commit (b831b708). git log on package-sequence-lifecycle.ts and lifecycle-operator.ts shows no change touching Module 1 lifecycle.

This is a code defect, not a procurement gap: it needs no DTD, validator licence or ESG credentials.

Owner: the package-model spine lane (session …01LjrcEe…, row D7/W5 in docs/work-orders/README.md §0). That lane claims package-sequence-lifecycle.ts and the assemble route's lifecycle block, where the fix belongs. lifecycle-operator.ts is shared with the IND demo lane (01TtwRHm) and does not need to change.

A related problem outside F13: the package spine never emits the DTD 3.3 admin submission-information/<form form-type="fdaft1"> element. The probe printed "admin <form> elements: (none)" even for 0000; the 1571 ships only as an <m1-1-forms> leaf. The repo's own transcription of FDA's M1 example puts the form leaf inside admin <form>. If FDA's fillable-form check keys on that element, sequence 0000 is affected too. It is worth filing as its own finding.

**Corrected claim.**

Both arms reproduce exactly as claimed. Two precisions on the requirement. The IND 1571-per-submission rule is firm, so a missing 1571 is a deficiency and possibly a high-severity FDA rejection. The cover letter per sequence is an FDA "should": a deficiency, not a receipt rejection. The replace arm is a misfiled lifecycle record (0000's letter or 1571 shown as superseded); I know of no FDA validation error it would raise. For the cover letter, the fix sketch's "error, not warning" is stricter than FDA's wording; for the IND 1571 it is justified.

**Smallest correct fix.**

Make the fix in the package spine only, leaving lifecycle-operator.ts unchanged.

(1) server/services/ectd/package-sequence-lifecycle.ts, planSequence:
- Add an optional caller-supplied `perSubmission?: (ctdSection: string) => boolean`.
- In a follow-up, take desired leaves that match it out of the computeLifecycleOperations call.
- If one is byte-identical to the leaf on file at that heading (prior.sourceMd5 ?? md5), omit it as today. Re-filing 0000's letter in 0001 would be wrong content.
- Otherwise emit it as operation 'new' with no modifiedFile, and add it to summary.new.
- Its prior leaf is never consumed, so the operator's unconsumed-prior loop counts 0000's letter as still on file.
- Leave the NOTHING_TO_FILE check over the combined result.

(2) server/routes/submission-ops.ts:
- At the planSequence call (~line 2521), pass `perSubmission` when the packager region is FDA: `s => s === '1.2' || s === '1.1' || s.startsWith('1.1.')`.
- After the plan is applied (~line 2601), for an FDA sequence other than 0000:
  - When no kept leaf sits at 1.1/1.1.x and packageFamily is 'ind', push an error finding, e.g. M1-FORM-1571-MISSING. Errors block transmit.
  - When no kept leaf sits at 1.2, push a finding, e.g. M1-COVER-LETTER-MISSING. FDA's wording is "should", and ectd-compile uses a warning. Fail-closed policy argues for an error; that choice is the lane's.

Prove each change failing first: an edited cover letter must currently come out as a replace, and an IND 0001 with no 1571 must currently show errorCount 0.

**Blast radius.**

Files changed: server/services/ectd/package-sequence-lifecycle.ts (planSequence) and server/routes/submission-ops.ts (the assemble lifecycle block and its findings). The packager and the controlled vocabulary are untouched.

Other spine: not affected by this fix. lifecycle-operator.ts, package-from-core.ts:336, ectd-compile.ts and AnaToolExecutor.ts:9409 are unchanged. The shared operator applies the same diff to any 1.2/1.1 leaf the sequence spine presents under an unchanged identity; package-from-core passes no leafKey, so identity is ctdSection/fileName. I did not verify whether that spine reuses cover-letter file names across sequences; that check belongs to the IND demo lane.

Tests that pin the current behaviour and must change:
- tests/submission-ops-assemble-routes.test.ts:763, "a changed leaf reaches the PACKAGER as a replace…". It uses the cover letter as its example and expects operation 'replace' with a modified-file into 0000. Move it to a Module 2/3 leaf, and add the inverse case: a cover letter is 'new' with no modified-file.
- tests/submission-ops-assemble-routes.test.ts:780. It expects an edited cover letter to give summary {replace:1, unchanged:1, new:0}; after the fix it becomes {new:1, replace:0, unchanged:2}.
- Re-check :817, :858 and :1296 in the same file if they file the cover letter in a follow-up.

Tests that should survive (they assert status, summary and leafManifest, not errorCount), but each will now carry the new blocking finding:
- tests/submission-ops-package-spine.pglite.e2e.test.ts:232, where an unchanged cover letter is still omitted (unchanged: 2).
- The three F10 withdrawal tests at :263–311.

server/services/ectd/__tests__/package-sequence-lifecycle.test.ts has no 1.1 or 1.2 cases, so it is unaffected; new unit tests go there.

## Round 3 — F00, F02, F03, F06, F15, F16, F17, F18

### F00 — confirmed (severity high, spec confidence high, reproduced True)

**Observed (probe output).**

Probe: tests/zz-probes/verify-f00/f00.probe.test.ts (now deleted). It ran the real POST /api/submission-ops/packages/pkg_e2e/assemble route on PGlite with the real packager, using artifacts at 3.2.S.4.1, 5.3.5.1, 2.7.3 and 3.2.S.4.9 plus a cover letter. Both tests passed. Output:

ASSEMBLE status 200
validation {"errorCount":0,"warningCount":0}
findings ["info:SUMMARY:5 leaf(s), 0 empty section(s), region FDA."]
leafManifest ["1.2 new","3.2.S.4.1 new","5.3.5.1 new","2.7.3 new","3.2.S.4.9 new"]
LEAF m2/2-7-3/2-7-3-probe0002.pdf  under: m2-common-technical-document-summaries > m2-7-clinical-summary
LEAF m3/3-2-s-4-1/3-2-s-4-1-probe0000.pdf  under: m3-quality > m3-2-body-of-data > m3-2-s-drug-substance
LEAF m3/3-2-s-4-9/3-2-s-4-9-probe0003.pdf  under: m3-quality > m3-2-body-of-data > m3-2-s-drug-substance
LEAF m5/5-3-5-1/5-3-5-1-probe0001.pdf  under: m5-clinical-study-reports > m5-3-clinical-study-reports > m5-3-5-reports-of-efficacy-and-safety-studies
element present? m3-2-s-4-control-of-drug-substance false | m3-2-s-4-1-specification false | m5-3-5-1- false | m2-7-3-summary-of-clinical-efficacy false
in-repo DTD-conformance errors on this index.xml: 0 []
in-repo DTD-conformance errors when the real ICH elements are present: 2 ["DTD_UNKNOWN_ELEMENT:Backbone element <m3-2-s-4-control-of-drug-substance> is not an ICH eCTD v3.2.2 ","DTD_UNKNOWN_ELEMENT:Backbone element <m3-2-s-4-1-specification> is not an ICH eCTD v3.2.2 heading el"]
isPlaceableCtdCode true for 3.2.S.4.9, 3.2.S.99, 5.3.5.9, 5.3.5.1.7, 2.7.9, 4.2.3.99 and 3.2.P.5.1.4 (each resolves to the shallow parent heading). Controls: 3.14 false, 3.2.X false, 1.99.99 false.
resolveArtifactPlacement(3.2.S.4.9) {"code":"3.2.S.4.9","source":"artifact"}

So every part of the claim reproduces, and one more defect appeared: the in-repo validator reports the real ICH elements as unknown. The cause is server/services/submission-gateways/ectd-packager/ich-headings.ts:56-59, whose comment says "the DTD defines no m3-2-s-4 element". That table is the only heading source for the emitter, the placement gate (isPlaceableSection) and the validator catalogue (ectd-validator-hardening.ts:121).

**The requirement.**

The headings exist (high confidence). The ICH eCTD v3.2.2 heading/element/folder table (spec Appendix 4) and ich-ectd-3-2.dtd define one heading element for every CTD section down to its lowest numbered level. Examples: 3.2.S.4 is m3-2-s-4-control-of-drug-substance, whose children run from m3-2-s-4-1-specification (folder 32s41-spec) to m3-2-s-4-5-justification-of-specification. 5.3.5.1 is m5-3-5-1-study-reports-of-controlled-clinical-studies-pertinent-to-the-claimed-indication. 2.7.3 is m2-7-3-summary-of-clinical-efficacy. Real index.xml files nest leaves this way. The repo comment saying the DTD has no m3-2-s-4 element is wrong. I am confident of the structure but not of every long-form spelling, so the names should be copied from the DTD, not from memory.

What FDA would see (medium confidence). As I recall the DTD, every heading's content model starts with leaf*, so a leaf at a parent heading is DTD-valid. I know of no FDA eCTD validation rule (high or medium) that fires on placement depth, so this is not a technical rejection. (The missing required attributes are a separate DTD issue, F02.) The harm is misfiling. FDA's review tools build the table of contents from the heading tree, so the 3.2.S.4.1 specification shows under 3.2.S, controlled pivotal studies under 5.3.5, and the efficacy summary as a generic 2.7 document. That conflicts with ICH M4 granularity. I recall that eCTD lifecycle cannot move a leaf to another heading with replace; the repo's own model (F12) also relocates by delete plus new. Each filed sequence therefore makes the misfiling permanent in the application's history.

A non-existent code should be refused (high confidence). This is the repo's own documented rule (section-to-ctd.ts header, invariant 2, and the route message at submission-ops.ts:2416: a non-existent code is reported UNPLACED, never guessed). The rule holds for 3.14, 3.2.X and 1.99.99, but not for any code below a shallow terminal heading. FDA never sees "3.2.S.4.9" as data; it only sees the folder name m3/3-2-s-4-9/. The document lands silently under 3.2.S, and the platform's leaf manifest and filed history record a section that does not exist.

Minor correction: in the ICH tree the gap is 1 to 2 levels, not 1 to 3 (for example 3.2.S.4.1 is 2 levels short; 5.3.5.1 and 2.7.3 are 1 level short). Low-confidence side note, not part of this verdict: the existing names m5-3-3-reports-of-human-pharmacokinetic-pk-studies, m5-3-4-reports-of-human-pharmacodynamic-pd-studies and m5-3-6-reports-of-post-marketing-experience may not match the DTD spelling. Check them when the DTD is added; if they are wrong, any 5.3.3, 5.3.4 or 5.3.6 leaf is DTD-invalid.

**Scope.**

Not fixed at HEAD (d5059e98). ich-headings.ts last changed in 9f43e7e9 (2026-09-26), and the shallow table and its wrong DTD note are unchanged.

This is a code defect, not a procurement gap. The ich-headings comment expects `xmllint --dtdvalid` to confirm placement once the DTD is vendored, but the DTD accepts a leaf at a parent heading, so vendoring it (it is still missing from assets/ectd-dtd/) would not catch this. The DTD is still a prerequisite for a reliable fix, because the roughly 200 element names should be copied from it.

Lane: the file is shared and neither lane claims it in docs/work-orders/README.md §0. The IND lane (01TtwRHm) owns ind-forms and related files, not the packager. The other spine has the same defect: docs/evidence/W5/2026-09-29-ind-ectd/packages/0000-index.xml puts a 3.2.S.4.2 leaf directly under <m3-2-s-drug-substance>. Coordinate with that lane.

Housekeeping: the probe directory is deleted and I changed no tracked files. git status shows four modified tracked files from another concurrent session (governed-transmit.ts, submission-orchestrator.test.ts, regional-backbone-dtd-path.test.ts, mdx-submission-gateway-transmit-bundle-guard.test.ts); I did not touch them.

**Corrected claim.**

The claim holds as stated, with two refinements. First, the gap is 1 to 2 levels, not 1 to 3. Second, the backbone stays DTD-valid and I know of no FDA validation error it triggers, so this is systemic misfiling that becomes permanent once filed, not a technical rejection. The probe also found more: the in-repo DTD-conformance validator flags the real ICH elements (m3-2-s-4-control-of-drug-substance, m3-2-s-4-1-specification) as DTD_UNKNOWN_ELEMENT, so a correctly built backbone would be reported as non-conformant.

**Smallest correct fix.**

All changes are in server/services/submission-gateways/ectd-packager/ich-headings.ts.

(1) Replace ICH_BACKBONE with the complete ICH v3.2.2 Module 2-5 heading tree. Copy it from the DTD after vendoring it into assets/ectd-dtd/, and add a test that the table and the DTD's element declarations match for m2-m5. buildIchModuleTree and headingPathFor already handle any depth, so regional-packager.ts needs no change.

(2) Make placement exact instead of falling back to the nearest ancestor. isPlaceableSection(code) should be true only when the code equals the section of a leaf-bearing heading in the tree. A deeper or unknown code should be unplaceable, and the finding (section-to-ctd.ts and submission-ops.ts ~2415) should name the valid child codes of the deepest matched ancestor, e.g. "3.2.S.4.9 is not an ICH heading; 3.2.S.4 has 3.2.S.4.1 to 3.2.S.4.5". With a strict terminal-only rule, codes such as 3.2.S.1, 5.3.5, 2.7 and 2.3 become unplaceable. That is a policy decision: either refuse them or keep a short allowlist where ICH granularity permits a document at that level.

Land this together with F02 (required attributes on the repeating parent headings m3-2-s, m3-2-p, m2-3-s, m2-3-p, m3-2-p-4, m2-7-3 and m5-3-5), because the deep headings nest under those parents. Both must land before the first real filing (D7), since lifecycle cannot move a filed leaf with replace.

**Blast radius.**

Files:
- ich-headings.ts: the table and the placement rule.
- section-to-ctd.ts and submission-ops.ts ~2415: finding text only; the logic flows through isPlaceableSection.
- ectd-validator-hardening.ts: no code change. Its catalogue is built from the table, so it stops rejecting real ICH elements.
- assets/ectd-dtd/fixtures/index-valid.xml: was generated from the shallow tree and needs deep placement.

Other spine: affected. Every packageEctdSubmission caller emits the same shallow tree today: package-from-core, assemble-from-core, core-to-packager, lifecycle-operator, orchestrator-real-package, qualification/qualify, pdfa-pipeline and AnaToolExecutor. The IND lane's exported index.xml would change, and any section key at a container code becomes unplaceable under a terminal-only rule.

Tests that pin current behaviour and must change:
- ectd-packager/__tests__/ich-headings.test.ts:
  - headingPathFor expectations for 3.2.S.1, 5.3.5.1 and 4.2.3.2.
  - "section-format tolerance" (expects m3-2-s-drug-substance, and M5.3.5.1 resolving to m5-3-5).
  - isPlaceableSection('3.2.S.1') and isPlaceableSection('m5.3.5') being true.
  - The buildIchModuleTree tests that expect a leaf directly inside <m3-2-s-drug-substance> (around lines 78-101).
- ectd/__tests__/section-to-ctd.test.ts:48 calls '3.2.S.1' and '5.3.5' "real terminal headings"; in ICH they are not.

Tests that need a re-check:
- The `toContain('<m3-2-s-drug-substance>')` assertions in package-leaf-bytes.test.ts:50 and :82, orchestrator-real-package.test.ts:45 and section-to-ctd.test.ts:195 survive this change but break once F02 adds attributes.
- The DTD_UNKNOWN_ELEMENT checks in orchestrator-real-package.test.ts:91 and submission-orchestrator.test.ts:474.

Unaffected: tests/submission-ops-package-spine.pglite.e2e.test.ts, because 2.5 and 3.2.P.1 are real leaf-bearing ICH headings.

### F02 — partial (severity high, spec confidence high, reproduced True)

**Observed (probe output).**

Probe: tests/zz-probes/verify-f02/f02.probe.test.ts. It used the real assemble route, real PGlite SQL and the real packager, with leaves at 2.3.S, 2.3.P, 2.7.3, 3.2.S.1 (two documents, substance A and substance B), 3.2.P.1 and 5.3.5.1. Run at HEAD d5059e98. The directory has since been deleted.

Output:
ASSEMBLE STATUS 200

HEADING OPENING TAGS:
<m1-administrative-information-and-prescribing-information>
<m2-common-technical-document-summaries>
<m2-3-quality-overall-summary>
<m2-7-clinical-summary>
<m3-quality>
<m3-2-body-of-data>
<m3-2-s-drug-substance>
<m3-2-p-drug-product>
<m5-clinical-study-reports>
<m5-3-clinical-study-reports>
<m5-3-5-reports-of-efficacy-and-safety-studies>

LEAF TITLES UNDER m3-2-s-drug-substance: ['Substance A general information — General Information (substance A) (3.2.S.1)', 'Substance B general information — General Information (substance B) (3.2.S.1)']

XMLLINT --dtdvalid. The DTD was permissive everywhere: ANY content, every observed attribute CDATA #IMPLIED, and xmlns:xlink not fixed, to keep F01 out. On top of that it carried only the reconstructed ICH 3.2 ATTLISTs for the F02 elements. Result:
EXIT 3
index.xml:29: element m3-2-s-drug-substance: validity error : Element m3-2-s-drug-substance does not carry attribute substance
index.xml:29: ... does not carry attribute manufacturer
index.xml:37: element m3-2-p-drug-product: validity error : ... does not carry attribute manufacturer
index.xml:37: ... does not carry attribute dosageform
index.xml:46: element m5-3-5-reports-of-efficacy-and-safety-studies: validity error : ... does not carry attribute indication
Document index.xml does not validate

CONTROL: the same index.xml with substance/manufacturer, dosageform/manufacturer and indication added gives xmllint EXIT 0.

The output never contains m2-3-s-drug-substance, m2-3-p-drug-product or m2-7-3-summary-of-clinical-efficacy. 2.3.S and 2.3.P leaves land directly under m2-3-quality-overall-summary, and 2.7.3 lands under m2-7-clinical-summary.

Code: ich-headings.ts:302 renders `<${h.element}>` with no attributes. buildIchModuleTree groups leaves by element name only (lines 276-283). EctdLeaf (ectd-packager/types.ts) and PackagerInput (regional-packager.ts:272) have no field for substance, manufacturer, dosage form or indication. The structural validator (ectd-validator-hardening.ts:317-330) checks leaf attributes only, never heading attributes.

**The requirement.**

The rule is real. In ICH eCTD DTD 3.2 (ich-ectd-3-2.dtd):
- m3-2-s-drug-substance and m2-3-s-drug-substance declare `substance` and `manufacturer` CDATA #REQUIRED.
- m3-2-p-drug-product and m2-3-p-drug-product declare `dosageform` and `manufacturer` #REQUIRED.
- m5-3-5-reports-of-efficacy-and-safety-studies and m2-7-3-summary-of-clinical-efficacy declare `indication` #REQUIRED.

Each of these elements is repeatable (`*`) in its parent. That is how the spec keeps one heading per substance+manufacturer, per product+dosage form+manufacturer, and per indication, so merging two substances under one bare heading misfiles content. A missing #REQUIRED attribute makes index.xml DTD-invalid. As far as I know, a DTD-invalid index.xml is a high-severity error in FDA's eCTD validation criteria and is grounds for technical rejection. I can't quote the criterion number offline.

This hits ordinary INDs: CMC under 21 CFR 312.23(a)(7) is filed in 3.2.S/3.2.P, so nearly every IND with CMC content produces an invalid backbone.

Two corrections to the finding:
- `product-name` is #IMPLIED (optional) in DTD 3.2, not required. Medium-high confidence.
- The Module 2 headings are not "emitted without attributes"; they are never emitted (see correctedClaim).

The xmllint run checked my reconstructed ATTLISTs, not the vendored DTD, because no ICH DTD is in the repo (assets/ectd-dtd has only a README, checksums and fixtures). It shows the attributes are absent. That the DTD requires them rests on my knowledge of the spec.

F01 (the xlink namespace) already makes every backbone invalid on its own. F02 is an independent blocker that remains after F01 is fixed.

**Scope.**

In scope.

- Not fixed at HEAD. Reproduced at d5059e98. ich-headings.ts last changed in 9f43e7e9 (2026-09-26), and no commit adds heading attributes.
- A code and data-model defect, not a procurement gap. Vendoring the ICH DTD (blocked by egress, per the IND lane row) would only let the qualification harness's xmllint step detect it. The packager has no field to carry the values.
- Ownership: the files are the shared packager (regional-packager.ts, ectd-packager/ich-headings.ts, ectd-packager/types.ts). No lane row in docs/work-orders/README.md section 0 names them. The package-model spine lane (this session, D7/W5) can take it, but must hand off or coordinate with the IND demo lane (01TtwRHm), whose sequence spine packages through the same code. regional-packager.ts's last commit (ca636c7f, 2026-09-30) is this lane's own.
- Overlaps F00: adding m2-3-s, m2-3-p, m2-7-3 and the deeper sub-headings needs the same attribute-keyed grouping. F00 and F02 should land as one change to ich-headings.ts.

**Corrected claim.**

What holds:
- m3-2-s-drug-substance, m3-2-p-drug-product and m5-3-5-reports-of-efficacy-and-safety-studies are emitted bare. They lack substance+manufacturer, dosageform+manufacturer, and indication, which DTD 3.2 declares #REQUIRED.
- Any index.xml containing them is DTD-invalid.
- Documents for different substances, products or indications merge under one heading (reproduced: substance A and B under one m3-2-s-drug-substance).

What does not hold:
- m2-3-s-drug-substance, m2-3-p-drug-product and m2-7-3-summary-of-clinical-efficacy are never emitted. 2.3.S/2.3.P/2.7.3 leaves sit directly under m2-3-quality-overall-summary and m2-7-clinical-summary, where the DTD allows leaves and requires no attributes. That is F00's misplacement, and it becomes F02 once F00 adds those headings.
- product-name is #IMPLIED (optional), not required.

**Smallest correct fix.**

1. Data carrier. Add `headingAttributes?: { substance?; manufacturer?; productName?; dosageForm?; indication? }` to EctdLeaf (ectd-packager/types.ts).

2. Heading spec and rendering, in ich-headings.ts:
- Add an `attributes: { name, required }[]` spec to the IchHeading entries:
  - m3-2-s-drug-substance: substance R, manufacturer R
  - m3-2-p-drug-product: product-name optional, dosageform R, manufacturer R
  - m5-3-5-reports-of-efficacy-and-safety-studies: indication R
  - m2-3-s, m2-3-p and m2-7-3 when F00 adds them.
- In buildIchModuleTree, key the grouping by element plus the attribute tuple, and render one sibling element per distinct tuple with escaped attribute values.

3. Fail closed. In buildIndexXml, throw ValidationError(`missing-heading-attribute:<section>:<attr>`) for any leaf whose heading's required attribute is absent, mirroring the existing unplaceable-section refusal. This includes delete leaves, which must reuse the filed tuple.

4. Populate the values in package-leaf-bytes.ts:
- Read c2c_package_sections.metadata (an existing JSON column, so no migration).
- Fall back to package metadata.regulatory { drugSubstance{name, manufacturer}, drugProduct{name, dosageForm, manufacturer}, indication }.
- Record the tuple in leafManifest/filedSequences so later sequences reuse identical values. Attribute values define the heading instance across the lifecycle.

5. Add a DTD_HEADING_MISSING_ATTR check next to the leaf-attribute check in ectd-validator-hardening.ts, because xmllint is inert while the DTD is not vendored.

**Blast radius.**

Files:
- server/services/submission-gateways/ectd-packager/types.ts
- server/services/submission-gateways/ectd-packager/ich-headings.ts
- server/services/submission-gateways/regional-packager.ts (buildIndexXml)
- server/services/ectd/package-leaf-bytes.ts
- server/services/ectd/package-content-change.ts (the filed manifest carries the tuple)
- server/services/ectd/ectd-validator-hardening.ts

Other spine: affected, because it is shared. The sequence spine calls the same packager through core-to-packager.ts, package-from-core.ts, assemble-from-core.ts and orchestrator-real-package.ts; AnaToolExecutor.ts and technical-file-packager.ts also appear among callers and should be checked. Under fail-closed, the IND demo lane's 3.2.S/3.2.P/5.3.5 packages are refused until core-to-packager supplies the values. Coordinate with 01TtwRHm.

Tests and fixtures that pin bare tags and need changing:
- server/services/ectd/__tests__/package-leaf-bytes.test.ts:50,51,82
- server/services/ectd/__tests__/orchestrator-real-package.test.ts:45,46
- server/services/ectd/__tests__/section-to-ctd.test.ts:195,196
- server/services/submission-gateways/ectd-packager/__tests__/ich-headings.test.ts:82,83,85,96-98
- tests/submission-ops-package-spine.pglite.e2e.test.ts: its 3.2.P.1 seed would be refused without dosageform/manufacturer metadata.
- assets/ectd-dtd/fixtures/index-valid.xml:42,67: labelled valid, but its bare m3-2-s and m5-3-5 headings are DTD-invalid against the real DTD.
- client/src/concept2cure/v2/__tests__/ectdCompile.fixtures.ts:36

### F03 — confirmed (severity medium, spec confidence medium, reproduced True)

**Observed (probe output).**

I wrote the probe tests/zz-probes/verify-f03/stf.probe.test.ts, ran it with `npx vitest run` (2/2 passed) and then deleted the directory. It used the real assemble route, real PGlite SQL and the real packager. The package was an IND for FDA with sections at 5.3.5.1 and 4.2.1.1. Each of those sections had section metadata {"studyId":…,"stfFileTag":"study-report-body"}.

Route run:
"[F03] assemble status 200"
"zip entries: m1/us/us-regional.xml, m1/us/1-2/cover-letter-cover0001.pdf, m5/5-3-5-1/5-3-5-1-csr000002.pdf, m4/4-2-1-1/4-2-1-1-pd0000003.pdf, index.xml, index-md5.txt, util/index-md5.txt"
"[F03] stf entries in zip: []"
"index.xml leaf hrefs: [\"m1/us/us-regional.xml\",\"m4/4-2-1-1/4-2-1-1-pd0000003.pdf\",\"m5/5-3-5-1/5-3-5-1-csr000002.pdf\"]"
"bundle.stf: null  STF/study findings: []"
"all finding ruleIds: [\"SUMMARY\"]"
- The section study metadata was ignored.
- No STF was produced.
- No warning was raised. The route runs only validateEctdLeafs. The hardening validator's STF_MISSING_STUDY_ID rule (auditStudyIdTagging) is never run on this spine.

Boundary control:
(a) packageLeafBytes, with studyId/stfFileTag cast onto the leaf: "[\"m1/us/us-regional.xml\",\"m5/5-3-5-1/csr-abc-101.pdf\",\"index.xml\",…]". No STF; the fields are dropped in the LeafBytes→EctdLeaf mapping at package-leaf-bytes.ts:165-173.
(b) packageEctdSubmission directly, with the same leaf: "m5/5-3-5-1/abc-101/stf.xml" is created and referenced in index.xml.

The generated stf.xml has this content:
`<ectd:study xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3.org/1999/xlink" dtd-version="2.6.1"> <study-id>ABC-101</study-id> <title>…</title> <study-category>clinical-study-report</study-category> <doc-content> <file-tag name="study-report-body"> <leaf operation="new" xlink:href="csr-abc-101.pdf">`

The uncommitted working-tree diff in regional-packager.ts (3 lines, F01) does not touch the STF code path, so this result reflects HEAD.

**The requirement.**

**The rule is real.** FDA requires a Study Tagging File for each study whose documents are filed in 4.2.x or 5.3.x, for CDER and CBER eCTD submissions. Sources: FDA's "eCTD Backbone Files Specification for Study Tagging Files" v2.6.1 and the eCTD Technical Conformance Guide. It is FDA-specific; EU and most other regions do not use STFs. The repo's market-submission-specs agrees (studyTaggingFiles: true only for FDA and one other market). It applies to INDs, the family this spine files: Module 4 tox and PD reports and 5.3.x protocols (file-tag protocol-or-amendment) are normally tagged.

**What happens without one.** The documents are still placed under their heading. But FDA's review tools group Modules 4 and 5 by study through the STF, so untagged reports are not attached to any study. That is reviewer misfiling, plus an FDA validation finding.

**What I cannot pin down.** I can't confirm the exact validation-criterion number or severity for "study report not referenced by any STF". I don't believe it is a High (technical-rejection) error for a PDF-only study. The study-data Technical Rejection Criteria (1734 ts.xpt, 1736 dm/define) locate datasets through the STF, but this spine ships no datasets. Medium severity fits.

**The fix sketch is wrong on one point.** It says to "generate via stf-generator.ts", but that generator's output does not match the ICH STF DTD (ich-stf-v2-2.dtd):
- The real structure is `<study-identifier>` (containing `<title>`, `<study-id>` and `<category name info-type>`) followed by `<study-document>`.
- In the real structure each `<doc-content xlink:href="../../../index.xml#<leafID>">` holds `<title>` and `<file-tag name info-type="ich"/>`. The generator instead nests `<leaf operation>` inside `<file-tag>`, and those leaves point at files rather than backbone leaf IDs.
- `dtd-version` should be "2.2", not "2.6.1".
- There is no `<study-category>` element.
- The xlink namespace is likely the ICH-fixed "http://www.w3c.org/1999/xlink" (see the repo's own note in ich-headings.ts).
- 'study-report-body' and 'sample-crf' are not ICH file-tags; the real ones are 'study-report' and 'sample-case-report-form'.
- FDA's naming convention is stf-<study-id>.xml.

I am highly confident about the structure and medium-confident about the namespace and naming. No STF DTD is vendored, so none of this can be validated locally.

**Scope.**

**Not fixed at HEAD.** stf-generator.ts was last touched in 9f43e7e9. package-leaf-bytes.ts has never carried study fields. Nothing in the log since 2026-09-28 mentions STF.

**Code defect, not a procurement gap.** Producing no STF at all is a code defect. Only DTD-validating an STF would need the vendored ich-stf DTD.

**Ownership:**
- In scope for this lane (…01LjrcEe, work-orders README line 58 claims package-leaf-bytes.ts and the assemble route): package-leaf-bytes.ts, whose only production caller is the assemble route, and the route itself.
- Shared with the IND lane (…01TtwRHm) and Ana's `generate_stf` tool: stf-generator.ts and regional-packager PASS 1.5 (lines 962-1016).
- The other spine (core-to-packager, package-from-core, assemble-from-core) also never sets studyId or stfFileTag. The only production setter is qualification/golden-fixtures.ts. So that spine has the same gap; that is the IND lane's call.

**Correction to the claim.** "The route never calls the STF generator" is literally true, but the packager it calls does call it. The real break is the LeafBytes contract: there are no study fields, packageLeafBytes forwards none and passes no studyMeta, and the route has no source for study identity.

**Corrected claim.**

This spine never produces a Study Tagging File, and nothing warns about it. The regional packager can generate STFs, but only for EctdLeaf entries that carry studyId and stfFileTag. LeafBytes has no such fields, packageLeafBytes drops them and passes no studyMeta, and the route has no source for study identity. So 4.2.x and 5.3.x reports ship untagged with only a SUMMARY finding. The fix sketch's "generate via stf-generator.ts" is not correct as stated, because that generator does not emit ICH STF DTD v2.2 structure or the ICH file-tag vocabulary.

**Smallest correct fix.**

**Smallest correct fix, in this lane, fail-closed: an STF-MISSING finding.**
- Where: the assemble route, next to the LEAF-UNAPPROVED and placement findings.
- When: region is fda and a shipping leaf (operation ≠ delete) has a ctdSection under 4.2.1–4.2.3, 5.3.1–5.3.5 or 5.3.7.
- Severity: error, so executeGovernedTransmit refuses the bundle (BUNDLE_VALIDATION_ERRORS).
- Message: the finding names the leaves and says that FDA requires a Study Tagging File for study reports and that this path cannot yet produce one.
- Why not just wire the generator: plumbing alone would swap "no STF" for "a malformed STF".

**Complete fix, which crosses into a shared lane:**
1. Add `studyId?` and `stfFileTag?` to LeafBytes, forward them in packageLeafBytes (around lines 165-173), and pass `studyMeta` through.
2. Have the route take study identity per section (section metadata), validated against an FDA STF file-tag vocabulary.
3. Rewrite stf-generator.ts to the ICH STF v2.2 shape. Each doc-content should point at `index.xml#<leaf ID>`, so the STF has to be generated after the backbone IDs are assigned.
4. Name the file stf-<studyid>.xml.

**Blast radius.**

**Fail-closed finding:** only server/routes/submission-ops.ts changes; the other spine is untouched. No current test should flip:
- tests/submission-ops-package-spine.pglite.e2e.test.ts uses only 2.5 and 3.2.P.1.
- tests/submission-ops-assemble-routes.test.ts:975 uses 5.3.5.1 only as a withdrawal, which the finding excludes.
- section-to-ctd.test.ts:185 and regional-backbone-readiness.test.ts call packageLeafBytes directly.

A new failing-first test is needed.

**Complete fix:**
- Changes package-leaf-bytes.ts (in lane).
- Changes the shared files stf-generator.ts and regional-packager.ts (PASS 1.5 and backbone-ID ordering), which affects the IND sequence spine and Ana's `generate_stf` tool.
- These pin the current nonconformant STF shape and would need to change:
  - server/services/ectd/__tests__/stf-generator.test.ts
  - server/services/submission-gateways/__tests__/stf-packaging.test.ts, which expects m5/5-3-5-1/study-001/stf.xml and the file-tags 'study-report-body' and 'sample-crf'
  - server/services/ectd/qualification/golden-fixtures.ts:147 and qualify.ts:469-474
  - the docs/ectd/README.md line 33 claim
- A schema or field for section study identity is needed. That is a data-model and product decision.

### F06 — confirmed (severity high, spec confidence medium, reproduced True)

**Observed (probe output).**

Probe: tests/zz-probes/verify-f06/f06.probe.test.ts, now deleted. It used the real assemble route, the real packager and PGlite SQL, built on the package-spine e2e harness. Sections were listed by sort_order as cover-letter (1.2), form-1571 (1.1), 2.5, debarment (1.3.3), and sequence 0000 was assembled (HTTP 200). Output:
[F06] m1-regional direct children, in order: ["m1-2-cover-letters","m1-1-forms","m1-3-3-debarment-certification"]
[F06] <submission-information> block: <submission-id submission-type="fdast1">0000</submission-id> <sequence-number submission-sub-type="fdasst1">0000</sequence-number> (no <form>)
[F06] <m1-regional> block: <m1-2-cover-letters><leaf ... ID="leaf-1-2-cover-letter-cover0001">...</m1-2-cover-letters> <m1-1-forms><leaf operation="new" checksum="932b79..." checksum-type="md5" xlink:href="1-1/form-1571-1571x0002.pdf" xlink:type="simple" ID="leaf-1-1-form-1571-1571x0002"><title>Form FDA 1571 — Form FDA 1571 (form-1571)</title></leaf></m1-1-forms> <m1-3-3-debarment-certification><leaf .../></m1-3-3-debarment-certification>
[F06] any form element / form-type attribute anywhere: false false
[F06] descriptor.regionalBackbone: {"region":"fda","file":"m1/us/us-regional.xml","regionConformant":true}
[F06] descriptor validation findings (ruleIds): ["info:SUMMARY"]
Control run with the 1.1 section re-ordered first: ["m1-1-forms","m1-2-cover-letters","m1-3-3-debarment-certification"]. So the emitted order is the package order.
Cause in code: buildFdaBackbone (regional-packager.ts:506-516) groups leaves in a Map keyed by heading, in first-seen leaf order, and writes each heading directly inside <m1-regional> with no sort and no parent elements. Heading names come from fda-regional-sections.ts, which contains only leaf-level CoU headings. classifyRegionalBackbone (regional-backbone-readiness.ts:73) returns regionConformant:true for any package where CONFORMANT_REGIONS has 'fda'. The route passes fda:{applicationType, submissionType} and never passes forms, so fdaFormsBlock is never reached. One nuance: <m1-1-forms> itself is emitted. The parent that is missing is the <form form-type> wrapper for 1.1, and for x.y.z headings the 1.x container (for example m1-3-administrative-information).

**The requirement.**

What I am confident about:
- **Ordering and nesting (medium-high).** In the FDA us-regional DTD 3.3, m1-regional is a sequence of optional headings in numeric order (m1-1-forms?, m1-2-cover-letters?, m1-3-administrative-information?, … m1-20-…?). Every eCTD backbone is a hierarchical table of contents, so a 1.x.y heading must sit inside its parents (m1-3-administrative-information > m1-3-3-debarment-certification; m1-6-meetings > m1-6-1-meeting-request). Two outputs are therefore DTD-invalid: m1-2-cover-letters before m1-1-forms, and m1-3-3-… directly under m1-regional.
- **Consequence.** A us-regional.xml that fails the DTD is a high-severity error under FDA's eCTD validation criteria, which means technical rejection. I am not citing a rule number from memory.
- **Reach.** Almost every real IND or NDA sequence has nested Module 1 content (1.3.x, 1.6.x, 1.12.x, 1.14.4.1 IB), so the nesting defect is not an edge case.

What I am less sure of:
- **Forms (medium).** I recall m1-1-forms as (form+), with form carrying form-type #REQUIRED (fdaftN) and wrapping the leaf; v2.3 replaced the old 1.1.x form headings with this attribute. But the repo's own docs/ectd/SPEC_DIGEST.md:32-41 puts <form form-type> inside admin <submission-information>, and fdaFormsBlock follows that digest. So the exact placement has to be settled against the vendored DTD.
- On either reading, this spine emits no form-type at all for the 1571, which contradicts section-to-ctd.ts:81-86 ("FDA's Module 1 (v2.3) files every form at 1.1 and tells them apart by form type").

The regionConformant:true claim is a code fact. The false statement goes to the operator and to the ECTD_REQUIRE_REGIONAL_BACKBONE gate, not to FDA. I could not run the real DTD or an agency validator: the DTD is not vendored and the agency hosts are unreachable.

**Scope.**

In scope, and not fixed at HEAD (d5059e98). The uncommitted working-tree diff from another session changes only the xlink namespace line in buildFdaBackbone, not the m1-regional body.

This is a code defect, not a procurement gap. The missing us-regional-v3-3.dtd (assets/ectd-dtd holds only README and checksums) only hides it: the qualification harness's xmllint DTD step would flag it once the DTD is vendored, and the assemble route does not run that step anyway.

Lane:
- The assemble route belongs to the package-model spine lane (session 01LjrcEe8…, row D7/W5).
- buildFdaBackbone, fda-regional-sections.ts and classifyRegionalBackbone are shared with the IND demo lane's sequence spine (session 01TtwRHm):
  - core-to-packager.ts:320-327 also passes no forms.
  - package-from-core.ts:221-229 reads submission_leaves with no ORDER BY.
- So that spine ships the same unordered, flat Module 1 and a 1571 with no form-type. The fix has to be coordinated with 01TtwRHm.

**Smallest correct fix.**

Make all four changes in shared code, together:

1. **Order and nest Module 1.** In buildFdaBackbone, replace the flat Map emission with a tree:
   - Derive each leaf's ancestor chain by numeric prefix (1.3.3 → 1.3 → root).
   - Name the containers from a small static table of DTD 3.3 container elements (m1-3-administrative-information, m1-3-1-applicant-information, m1-6-meetings, m1-12-other-correspondence, m1-14-labeling, m1-14-4-…, and so on). Take these names from the DTD.
   - Emit siblings sorted by component-wise numeric section order.
2. **Wrap 1.1 leaves as forms.** Put each one in <m1-1-forms><form form-type="fdaftN">leaf</form>:
   - Carry the form type on the leaf as a new optional EctdLeaf.formType. The route sets it from the section key (form-1571 → resolveFormTypeCode('1571') = fdaft1). core-to-packager sets it from document_type (form_1571).
   - Refuse a 1.1 leaf whose form type cannot be resolved. Do not default it; also drop fdaFormsBlock's `?? 'fdaft2'` (356h) fallback.
   - Settle where fdaFormsBlock writes (admin or m1-1-forms) against the DTD, so a leaf passed in both leaves and fda.forms is not written twice under one ID. By code reading, not probed: golden-fixtures.ts does pass it both ways today.
3. **Compute conformance from the structure.** Replace classifyRegionalBackbone's region-only true with a check on the built structure. Report false when any heading is out of order or not nested under its parent, or a 1.1 leaf has no form-type. Until steps 1–2 are verified with xmllint against the vendored us-regional-v3-3.dtd, report false whenever a nested heading or form is emitted.
4. **Prove it fails first.** Add an assemble e2e case with sections listed 1.2, 1.1, 1.3.3 and assert the DTD order, the nesting and the form-type.

**Blast radius.**

**Files:**
- server/services/submission-gateways/regional-packager.ts (buildFdaBackbone, fdaFormsBlock)
- server/services/ectd/controlled-vocab/fda-regional-sections.ts (container table, ancestor chain, ordering)
- server/services/ectd/regional-backbone-readiness.ts (classifyRegionalBackbone takes structural evidence)
- server/services/submission-gateways/ectd-packager/types.ts (EctdLeaf.formType)
- server/routes/submission-ops.ts (sets form type for 1.1 leaves)
- server/services/ectd/core-to-packager.ts (sets form type from document_type)

**Other spine:** yes, it is affected. ectd-compile and package-from-core go through the same builder and classifier, so the IND demo sequences' us-regional.xml changes shape. Coordinate with 01TtwRHm.

**Tests that pin current behaviour and must change:**
- server/services/ectd/__tests__/regional-backbone-readiness.test.ts, the test "fda: conformant, and EVERY Module 1 leaf sits under a published heading element". It pins regionConformant:true and treats m1-3-4-… and m1-6-1-… directly under m1-regional, plus bare 1571/3674 leaves under m1-1-forms, as correct.
- server/services/ectd/__tests__/dtd-bundler.test.ts:241 (conformant set = fda).
- server/services/submission-gateways/__tests__/pre-transmit-check.test.ts (regionConformant fixtures).
- server/services/ectd/controlled-vocab/__tests__/fda-regional-sections.test.ts (needs new parent-chain cases).
- server/services/ectd/qualification/golden-fixtures.ts (356h is passed in both leaves and fda.forms).

**Possibly affected, to check:** tests/routes/ectd-compile-spine.test.ts, tests/submission-ops-assemble-routes.test.ts and tests/mdx-submission-gateway-transmit-bundle-guard.test.ts. All three reference m1 headings or regionConformant.

Lifecycle `modified-file` pointers (backbone#ID) are unaffected: leaf IDs do not change.

### F15 — partial (severity medium, spec confidence high, reproduced True)

**Observed (probe output).**

Probe: tests/zz-probes/verify-f15/f15.probe.test.ts, now deleted. It ran against the real assemble route, real packager and zip, the stand-in Ghostscript, the real executeGovernedTransmit with getGateway's guard, the real findActiveTransmittal and the real lock index (loaded from the 20260629 migration file). Only the FDA ESG wire was replaced, by a stand-in that writes the same transmittal rows. Environment was 'production'. 4/4 ran.

CONTROL: `re-assemble 0000 twice, no transmit: {"a":{"status":200,"sha":"8846f57acde4"},"b":{"status":200,"sha":"5f93ebfdd614"},"shaDiffers":true}`

A, gateway returns (MDN received):
`A2 send: SENT status=received transmittal=1 sha=d590f343fee2 filedSequenceRecorded=true (recorded)`
`A3 re-send stored bundle: REFUSED ACTIVE_TRANSMITTAL (409)`
`A4 re-assemble 0000: {"status":409,"code":"SEQUENCE_ALREADY_FILED","error":"Sequence 0000 has already been transmitted for this package; ..."}`
Wire: 1 transmittal.

B, delivered but unconfirmed (gateway throws after the bytes left):
`B2 send: GatewayError: The bundle was delivered (HTTP 200) and FDA may hold it: transmittal 1 is recorded in transit, not rejected. Confirm receipt at FDA before any resend.`
`B2 filedSequences: [] rows: [{"id":1,"status":"in_transit"}]`
`B2b assemble 0001 instead: 409 NO_PRIOR_SEQUENCE Sequence 0001 is a follow-up, but nothing has been transmitted for this package yet. File sequence 0000 first...`
`B3 re-send SAME stored bundle: REFUSED ACTIVE_TRANSMITTAL (409)`
`B4 re-assemble 0000: {"status":200,"sha":"81a455d43302"} shaDiffers: true`
`B5 send re-assembled 0000: SENT status=received transmittal=2 sha=81a455d43302 filedSequenceRecorded=true (recorded)`
`B WIRE: [{"transmittalId":1,"sequenceInBackbone":"0000"},{"transmittalId":2,"sequenceInBackbone":"0000"}]`
`rows: [{"id":1,"status":"in_transit"},{"id":2,"status":"received"}] filedSequences: ["0000@81a455d43302#t2"]`

C, first send still in flight:
`C2 rows: [{"id":1,"status":"in_transit"}]`
`C3 re-assemble 0000 while first in flight: {"status":200} shaDiffers: true`
`C4 send re-assembled 0000: SENT status=received transmittal=2`
`C5 first send returns: SENT status=received transmittal=1 ... filedSequenceRecorded=true (recorded)`
Wire: two transmittals, both with sequence 0000.
`filedSequences: ["0000@1bc21096bfb1#t2"]` (transmittal 1 is reported "recorded" but is not in the record).

**The requirement.**

The rule is real, and the confidence differs by part.

High confidence:
- In ICH eCTD v3.2.2 the sequence number identifies each submission within an application and must be unique within it. FDA's us-regional v3.3 admin section carries that number as `<sequence-number>`.
- Sending 0000 twice to the same application (123456) is a duplicate sequence.
- FDA lets a sponsor reuse the number of a technically rejected sequence, so the repo is right to leave 'rejected' outside the lock.
- In the ESG ack chain, Ack1/MDN means the ESG received the message, Ack2 means the Center received it, and Ack3 means it loaded and validated. "Delivered, MDN not tied, or a timeout or 5xx after upload" is exactly the state in which FDA may hold 0000. The platform's own error text says "Confirm receipt at FDA before any resend", and the lock migration states its purpose as stopping a confused operator from double-shipping.

Medium confidence: exactly how FDA reacts. From memory, eCTD validation treats a sequence number already used in the application as an error, and the duplicate is technically rejected. I cannot quote the criterion number or its severity.

What FDA most likely sees: a rejected duplicate on the application record, not misfiled content.

It becomes worse when the content changes between the two sends:
- An edit clears the stored bundle.
- In state B, 0001 is refused with NO_PRIOR_SEQUENCE, which steers the operator back to 0000.
- The filed history then records the second bundle's leaves. If FDA kept the first, the next sequence is diffed against content FDA does not hold, and a changed document can be left out as "unchanged".

The operator is also told something untrue in state B: "nothing has been transmitted for this package yet", while transmittal 1 is in_transit.

The literal "received (MDN only)" scenario is refuted. governed-transmit appends the sequence to filedSequences as soon as gw.transmit RETURNS, whatever the returned status: AS2 'received' (probed) or the SFTP deposit's returned 'in_transit' (by code reading, same path). After that, planSequence refuses re-assembly with SEQUENCE_ALREADY_FILED.

**Scope.**

In scope, not fixed, not a procurement gap.

- **Not fixed:** HEAD is d5059e98. The working tree has uncommitted edits to governed-transmit.ts from another session (the F14 change: only production sends are filed). They do not touch the lock, and the probe used 'production', so the result holds for HEAD and for the working tree.
- **Code defect, not procurement:** no DTD, validator licence or ESG credential is involved.
- **Lane:** this is the package-model spine row in docs/work-orders/README.md section 0, claimed by …01LjrcEe ("governed-transmit's filed-sequence record"). executeGovernedTransmit and findActiveTransmittal are only called on this spine: server/routes/mdx-submission-gateway.ts:227 and the AnA eSTAR/510k transmit at mdx-command-handlers.ts:827.
- **IND/sequence spine (…01TtwRHm):** not affected and not needed. transmitSequence already takes a claim keyed on the sequence (claimTransmitSlot, a compare-and-set on ectd_sequences.dispatch_status).
- **Overlap with F19:** recordFiledSequence's `already` short-circuit returns true for a second bundle with the same sequence. Case C shows transmittal 1 reported "recorded" while the record names transmittal 2.
- **Side observation:** neither migrations/20260509_submission_gateways.sql (which creates submission_transmittals) nor 20260629_submission_transmittals_active_lock.sql is in C2C_MIGRATION_FILES. Both reach a database only through install-fresh's readdir of the root migrations tree. A database migrated only by deploy-migrate may lack even the sha-keyed backstop index.

**Corrected claim.**

What holds:
- The lock is keyed on (org, package, sha256), and it does refuse re-sending the same bytes.
- Re-assembly does produce a new sha256: from JSZip entry dates alone when the two assemblies are more than 2 s apart, and every time in production, because Ghostscript stamps dates and IDs.

What does not hold: the case where the earlier send ended with an MDN ('received') and the gateway returned. governed-transmit records 0000 as filed immediately, and re-assembling 0000 is refused 409 SEQUENCE_ALREADY_FILED. So the claim that nothing refuses it is wrong on the normal path.

The bypass is real in two states where the filed history does not yet know the sequence:
1. **Delivered but unconfirmed.** The gateway THROWS after the bytes left: a timeout or 5xx after upload, an MDN that cannot be tied to the message, or a database failure after a 2xx. The row stays in_transit. The same applies if recordFiledSequence itself fails.
2. **First send still in flight.** The row is pending or in_transit and gw.transmit has not returned.

In both states:
- Re-assembling 0000 is accepted. In state 1, trying 0001 instead is answered with "nothing has been transmitted ... File sequence 0000 first".
- The new bundle passes findActiveTransmittal and the unique index, because its sha differs.
- Sequence 0000 is transmitted a second time.
- The filed history records whichever send returned first. The other transmittal stays in_transit, or is reported "recorded" without being in the record.

Severity is medium, not high. The likely agency outcome is a rejected duplicate sequence. It rises to high only when the content changed between the two sends and FDA kept the first: the lifecycle baseline is then untrue, and a later sequence can leave out a changed document.

**Smallest correct fix.**

In executeGovernedTransmit (server/services/submission-gateways/governed-transmit.ts), for a package bundle, lock on the sequence as well as the bytes.

(a) Put the sequence on the transmittal row, taken from the stored descriptor:
```ts
metadata: {
  ...(input.metadata ?? {}),
  environment,
  ...(!input.clientBundle && bundle.sequence ? { sequence: bundle.sequence } : {}),
}
```
The gateways already read metadata.sequence. This also stops a caller-typed sequence reaching the SFTP path on this spine (F18).

(b) Next to the sha check, refuse 409 ACTIVE_TRANSMITTAL when a row exists that matches all of:
- organization_id and package_id;
- `metadata->>'sequence' = bundle.sequence`;
- `metadata->>'environment' = environment` (so a staging/ESG-test send never blocks production);
- `status IN ('pending','in_transit','received')`.

Implement it as an optional `{ sequence, environment }` on findActiveTransmittal, OR'ed with the sha match; governed-transmit is its only caller. Message: "Sequence 0000 is already at the agency or in transit as transmittal N; confirm receipt at FDA and roll it back before sending this sequence again."

This closes both reproduced paths: in B and C, transmittal 1's row is active before the second check runs.

Optional backstop for two simultaneous clicks. It is additive, not a RULE 1 amendment, and the sha index stays:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS sub_trans_active_sequence_lock_idx
  ON submission_transmittals (organization_id, package_id, (metadata->>'environment'), (metadata->>'sequence'))
  WHERE status IN ('pending','in_transit','received')
    AND package_id IS NOT NULL
    AND metadata ? 'sequence';
```
- Put it in a new file appended to C2C_MIGRATION_FILES, before the final sweep pair.
- Wrap it in a `to_regclass('public.submission_transmittals')` guard, because the table's creator is not on the deploy applier.
- Rows written before (a) carry no sequence, so they fall outside the index.

Honesty follow-up: the assemble route's NO_PRIOR_SEQUENCE text should not say "nothing has been transmitted" while an active production transmittal exists for the package.

Failing-first test: cases B and C of the probe, added to tests/submission-ops-package-spine.pglite.e2e.test.ts. The second send must be refused.

**Blast radius.**

**Files to change:**
- server/services/submission-gateways/governed-transmit.ts: the metadata.sequence write and the refusal.
- server/services/submission-gateways/fda-esg.ts: findActiveTransmittal gains an optional sequence/environment match. Its only caller is governed-transmit.
- Optional: a new migration file plus its scripts/db/migration-set.mjs entry.
- Optional: server/routes/submission-ops.ts, for the assemble message.

**Other spine: not affected.** transmitSequence, ectd-compile and package-from-core use claimTransmitSlot and call neither executeGovernedTransmit nor findActiveTransmittal. The shared gateways only see a metadata key they already read: the sequence spine already passes metadata.sequence.

**Second caller:** the AnA eSTAR/510k transmit (server/services/ana-ri/mdx-command-handlers.ts:827). Its bundles have no sequence, so it behaves as before.

**Tests that pin current behaviour and may need edits:**
- server/services/submission-gateways/__tests__/governed-transmit-signature.test.ts, governed-transmit-leaf-manifest.test.ts, governed-transmit-pretransmit-record.test.ts
- server/services/ana-ri/__tests__/mdx-esg-transmit-gateway.test.ts

These mock findActiveTransmittal or assert the gateway request metadata.

- tests/submission-ops-assemble-routes.test.ts: mocks the lock.
- tests/mdx-submission-gateway-transmit-bundle-guard.test.ts: currently being edited, uncommitted, by the F14 work. Coordinate before touching it.

**Tests that stay valid:** fda-esg-hardening.test.ts and fda-esg-ambiguous-delivery.test.ts read 20260629_submission_transmittals_active_lock.sql, and that file is not touched.

**Not touched:** controlled vocab, packager, operator.

### F16 — confirmed (severity medium, spec confidence medium, reproduced True)

**Observed (probe output).**

Probe tests/zz-probes/verify-f16/f16.probe.test.ts (deleted after the run). It ran the real FdaEsgGateway.transmit -> buildAs2Headers/signAs2Body/postAs2/classifyAs2Delivery over a real loopback mTLS server built with the repo's __tests__/support/mtls-pki. DB and readVerifiedBundle were stubbed the same way as2-delivery-outcome.test.ts stubs them. FDA_ESG_AS2_TO and FDA_ESG_STAGING_AS2_TO were left unset, and the request metadata carried center:'CDER', applicationType:'ind'. The stand-in endpoint answered with a forged, UNSIGNED multipart/report MDN ('Reporting-UA: not-fda'). It named our Message-ID and carried a deliberately wrong Received-Content-MIC.

Identical output for production and staging:
"as2To": "FDA-CESUB", "contentType": "application/octet-stream", "dispositionNotificationOptions": "signed-receipt-protocol=optional, pkcs7-signature; signed-receipt-micalg=optional, sha-256", headerNames [as2-from, as2-to, as2-version, connection, content-disposition, content-length, content-type, disposition-notification-options, disposition-notification-to, host, message-id, receipt-delivery-option, user-agent], "routingHeaders": [], "bodyIsRawBundleBytes": true, "bodyFirstBytes": "504b0304", "computedSignatureAppearsOnWire": false, "sha256MicOfWhatWasSent": "b0mEDUQXMhZTmj1KMfiHC2x+UtdwdWNHy7auIK1mFP8=", "micTheMdnClaimed": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "result": {"status": "received", "transmissionId": "<forged-mdn@not-fda>", "ackReceivedAtSet": true, "message": "FDA ESG AS2 transmit accepted. MDN: <forged-mdn@not-fda>."}, "transmittalStatusWrites": ["in_transit","received"]. Tests 2 passed (2).

Code: fda-esg.ts:126 `envFor(environment,'AS2_TO') ?? 'FDA-CESUB'`. fda-esg.ts:663 passes signAs2Body(...) as signaturePem, but buildAs2Headers (as2-transport.ts:470-484) never reads it and postAs2 posts the raw body. as2-transport.ts imports only createSign (no verify), and mdnRefusal (as2-transport.ts:451-453) states that "Received-Content-MIC and the MDN's own signature are still not verified".

**The requirement.**

Each part, from my knowledge of FDA ESG and RFC 4130; agency hosts are unreachable from here.

(1) S/MIME. FDA ESG AS2 gateway-to-gateway requires messages that are both signed and encrypted: a PKCS#7/CMS signature with the sponsor's registered certificate, encrypted to FDA's AS2 certificate. Confidence medium-high. The repo agrees: the fda-esg.ts header (lines 22-24) says "FDA ESG (Axway/Cyclone AS2) requires an S/MIME PKCS#7-signed message, so a real FDA endpoint would REJECT this envelope", and esg-production-setup.md:13 says the same. The UAT runbook line "FDA accepts TLS-protected AS2 in practice" (fda-esg-production-uat.md:450) is unsupported and contradicts the code. Expected FDA response today: an error MDN (for example insufficient-message-security or authentication-failed) or an HTTP refusal. The code records that as rejected, or as in_transit on a 5xx. So nothing is misfiled, but the AS2 path cannot complete a filing.

(2) AS2-To. As far as I know, FDA's AS2 identifiers are ZZFDA in production and ZZFDATST in test; 'FDA-CESUB' is not one of them. Confidence medium-high. The repo's own code agrees: e2b-icsr-message.ts:57 uses 'ZZFDA' as FDA's receiver, the as2-mdn-folding.test.ts fixture uses 'ZZFDATST', and icsr-gateway-transport.ts:45 says the agency AS2 id is "never defaulted". The same default applies to both environments, and the UAT runbook (line 46) tells operators to keep it. FDA would refuse the message as addressed to an unknown recipient. Correction: AS2-To is configurable per environment, and FDA has no per-Center AS2-To.

(3) Routing. ESG routes AS2 gateway-to-gateway messages to a Center through AS2 header attributes, X-Cyclone-Metadata-FDACenter and X-Cyclone-Metadata-FDASubmissionType (for example CDER or CBER with an eCTD type). Confidence medium. I cannot verify the exact value list or what ESG does when the attributes are absent. The risk is latent until S/MIME exists: the ESG-level MDN (Ack1) could accept a message that never reaches CDER or CBER, and checkStatus does not poll Ack2/Ack3, so the product would record 'received' and a filed sequence.

(4) MDN. Under RFC 4130 §7, non-repudiation of receipt requires the sender to verify the signed MDN and compare its MIC with the MIC of what was sent. Confidence high that this is AS2 practice; medium that FDA always returns signed MDNs. FDA would not reject a sponsor for skipping this. It is a sponsor-side integrity control. The probe shows an unauthenticated receipt becomes 'received' plus ackReceivedAt. A practical forgery needs a TLS peer trusted by the configured anchor, so the risk is misconfiguration or compromise rather than an open attack.

**Scope.**

In scope, and not fixed at HEAD d5059e98. The probe reproduced at HEAD, and neither fda-esg.ts nor as2-transport.ts has uncommitted edits.

Known parts: the missing S/MIME envelope and the unverified MDN are KNOWN, self-documented gaps. They are recorded in as2-transport.ts:14-25, fda-esg.ts:18-35, as2-transport.ts:451-453, fda-esg-production-uat.md:30-32 and 449-452, GA_OPS_PROCUREMENT_RUNBOOK B5 ("Resolve the PKCS#7 question with FDA during UAT") and the W5/2026-09-20 README. Closing them end to end depends partly on procurement: FDA's AS2 certificate, FDA's AS2 id and an ESG test account, all held by the founder. It also needs a CMS implementation: node-forge, pkijs and asn1js are not installed, so this means a new dependency or `openssl cms`.

New parts: the 'FDA-CESUB' default and the missing FDACenter/FDASubmissionType attributes are documented as gaps nowhere. The runbook actually endorses the default. Both are code defects that can be fixed now, except that the attribute value list has to be transcribed from FDA's ESG guide.

Ownership: this falls under the package-model spine lane's claimed "adversarial pass over what this spine hands FDA" (work-orders §0, session 01LjrcEe8y…), and no other lane claims fda-esg.ts or as2-transport.ts. as2-transport.ts is shared with the ICSR/FAERS AS2 path (icsr-gateway-transport.ts, B7). fda-esg.ts serves every FDA transmit caller, including the IND demo lane's (01TtwRHm, D7) sequence spine.

Adjacent, not part of F16:
- FDA_ESG_FDA_CERT_PATH is documented as FDA's AS2 encryption certificate (fda-esg.ts:105), but it is used only as the TLS `ca` (as2-transport.ts:703). Supplying FDA's real AS2 certificate would therefore fail the TLS handshake.
- The REST refusal text calls AS2 "the verified AS2 path" (fda-esg.ts:240), which is untrue.

**Corrected claim.**

All four defects named in the title reproduce at HEAD. Two qualifiers in the claim are inaccurate:

(a) AS2-To IS configurable per environment, through FDA_ESG_AS2_TO and FDA_ESG_STAGING_AS2_TO. The real defect is that, when the variable is unset, the code falls back to a made-up identifier, 'FDA-CESUB', the same for both environments. To my knowledge FDA's ids are ZZFDA in production and ZZFDATST in test, and the operator runbook tells operators to keep the default. FDA has no per-Center AS2-To; Center routing belongs in the X-Cyclone-Metadata-FDACenter and FDASubmissionType header attributes, which are indeed absent.

(b) The code does not accept "any" MDN. It accepts a 2xx response, on the TLS connection to the configured endpoint, whose MDN has an accepting disposition and names our Message-ID. What it never checks is the MDN's signature or its Received-Content-MIC.

The missing S/MIME envelope and the unverified MDN were already documented as known gaps. The 'FDA-CESUB' default and the missing routing attributes were not.

**Smallest correct fix.**

Two changes can land now; a third lifts the guard later.

(1) In fda-esg.ts:126, remove `?? 'FDA-CESUB'` and add FDA_ESG[_STAGING]_AS2_TO to `missing` so a missing value raises CredentialError, matching icsr-gateway-transport.ts. Fix the places that endorse the default: scripts/fda-esg-uat-smoke.ts:191/283 and docs/runbooks/fda-esg-production-uat.md:46/67/142/469-471.

(2) Fail closed. In FdaEsgGateway.transmit, before createTransmittalRow, refuse transport==='as2' with the typed UnverifiedTransportError the REST path already uses (fda-esg.ts:231-243). The refusal names what is missing: the S/MIME CMS sign+encrypt envelope, the FDACenter/FDASubmissionType attributes, and MDN signature and MIC verification. Also correct the "verified AS2 path" text at fda-esg.ts:240. Keep this guard in fda-esg.ts so the shared ICSR path is untouched. With the guard, no regulatory content leaves in an envelope known to be non-conformant, and no 'received' or filed-sequence record rests on an unauthenticated MDN. FDA rejects the current envelope anyway, so nothing that works today is lost.

(3) Lift the guard only when all of the following exist, proven by one round trip in FDA's ESG test environment:
- a CMS SignedData signature (sha-256, multipart/signed) wrapped in CMS EnvelopedData (AES) to FDA's AS2 certificate, sent as application/pkcs7-mime, with the AS2 certificate kept separate from the TLS trust anchor;
- X-Cyclone-Metadata-FDACenter and X-Cyclone-Metadata-FDASubmissionType taken from a required center and submission type on GatewayTransmitRequest, with no default and a refusal when absent;
- `signed-receipt-protocol=required`, with RECEIVED recorded only when the MDN's CMS signature verifies against FDA's AS2 certificate AND Received-Content-MIC equals the MIC computed over what was sent; otherwise the outcome is DELIVERED_UNCONFIRMED.

**Blast radius.**

Files:
- (1) and (2) touch only server/services/submission-gateways/fda-esg.ts, plus the smoke script and runbook.
- (3) also touches as2-transport.ts (buildAs2Headers, signAs2Body and mdnRefusal/classifyAs2Delivery). These are shared with server/services/ind-lifecycle/icsr-gateway-transport.ts, so change them behind an option or move ICSR in step with them. It also touches types.ts (a center field on GatewayTransmitRequest) and every request builder: governed-transmit.ts (which currently has uncommitted edits from another session), routes/mdx-submission-gateway.ts and the mdx-command-handlers.ts path.

Other spine: affected. Every FDA ESG transmit resolves to FdaEsgGateway through getGateway('fda','esg'), so the IND demo lane's sequence-spine transmit and the 510(k)/eSTAR MDX transmit inherit the refusal and the new required inputs. Coordinate with 01TtwRHm (D7).

Tests that pin current behaviour:
- Change (1) breaks the suites that rely on the default because they never set AS2_TO: as2-delivery-outcome.test.ts, fda-esg-ambiguous-delivery.test.ts and fda-esg-hardening.test.ts. Add the variable to their environment setup.
- Change (2) breaks every test that expects an AS2 'received' through FdaEsgGateway.transmit: those three suites plus server/services/ana-ri/__tests__/mdx-esg-transmit-gateway.test.ts. That test also asserts plaintext eSTAR bytes on the wire, which encryption in (3) would break as well.
- Change (3)'s MDN rule, if made in the shared classifier, also moves icsr-gateway-transport.test.ts, icsr-gateway-transport-after-send.test.ts, icsr-delivery-outcome.test.ts and as2-delivery-outcome.test.ts. Today those record unsigned, MIC-less MDNs as RECEIVED.

### F17 — partial (severity medium, spec confidence medium, reproduced True)

**Observed (probe output).**

Probe tests/zz-probes/verify-f17/f17.probe.test.ts (now deleted) used the real assemble route, the real packager and PGlite, copied from the e2e harness. It then called the real FdaEsgGateway.transmit with only postAs2, signAs2Body and the MDN verdict stubbed, so the wire headers were captured. Output at HEAD 39f2665e:
[F17] seq 0000 zip top-level entries: ["index-md5.txt","index.xml","m1/","m2/","m3/","util/"]
[F17] seq 0000 all entries: ["m1/us/us-regional.xml","m1/us/1-2/cover-letter-cover0001.pdf","m2/2-5/2-5-co000002.pdf","m3/3-2-p-1/3-2-p-1-desc0003.pdf","index.xml","index-md5.txt","util/index-md5.txt"]
[F17] any entry under 0000/ ? false
[F17] seq 0000 transmit status: received | Content-Disposition: attachment; filename="ectd.zip"
[F17] seq 0001 zip top-level entries: ["index-md5.txt","index.xml","m1/","m2/","util/"]
[F17] seq 0001 modified-file: ../0000/index.xml#leaf-2-5-2-5-co000002 | resolved against the zip root: ../0000/index.xml
[F17] seq 0001 transmit status: received | Content-Disposition: attachment; filename="ectd.zip"
The layout is fixed in code: regional-packager.ts:1041-1139 writes every entry at the zip root. fda-esg.ts:659-664 calls buildAs2Headers without a filename, so as2-transport.ts:480 defaults it to ectd.zip. The SFTP path (fda-esg.ts:540) names the file /incoming/<app>/<seq>/<transmissionId>.zip, so "always ectd.zip" is true of AS2 only. Seq 0001's lifecycle pointer ../0000/index.xml#… points outside its own archive. It resolves only if someone places the content in a 0001/ folder next to 0000/, which is exactly what the e2e test simulates at lines 255-257.

**The requirement.**

Holds: an eCTD v3.2.2 submission is a sequence folder. It is named with the 4-digit sequence number and holds index.xml, index-md5.txt, m1-m5 and util, and it sits under an application or identifier folder (ICH spec, folder organisation appendix). The lifecycle pointer modified-file="../0000/index.xml#ID" is a relative path that assumes sequence folders sit side by side. The repo's own notes say the same:
- docs/ectd/SPEC_DIGEST.md:55-65 documents the package as "NNNN/ index.xml …".
- validation-rule-corpus.ts:107-116 rests its high-severity rule on "sequence folders".
- The grouped-submission note (Addendum 1; ectd-packager/types.ts:42-44, regional-packager.ts:748-752) shows FDA's archive as <app folder>/<seq>/.
From memory, since agency hosts are unreachable: FDA ESG and Technical Conformance Guide instructions say an eCTD transmission is the application-number folder with the 4-digit sequence folder inside it, and FDA checks the sequence folder name against us-regional.xml. A payload of loose index.xml and m1..m5 has no sequence folder to load, so the likely result is a technical rejection rather than misfiled content.

Uncertain (why confidence is medium, not high):
- Which folder must be on top. FDA's ESG convention is, I believe, <application>/<sequence>/ with the sponsor supplying the application folder. The finding's "sequence folder at the top, application folder added by the agency" and its fix sketch '<sequence>/' may be one level short.
- How the application folder is named (123456 vs ind123456). I cannot confirm this here.

Does not hold: the payload name. I know of no FDA rule that names the AS2 payload after the application and sequence. Content-Disposition is informational, ESG routing does not use it, and docs/runbooks/fda-esg-production-uat.md:147-151 already lists it as an open assumption. That sub-claim describes unusual but allowed output.

**Scope.**

Not fixed at HEAD 39f2665e: no commit touches the zip root layout or the AS2 filename (git log grep). It is a code defect in the SHARED packager, not a procurement gap. Confirming FDA's exact application-folder name requires reading FDA's Technical Conformance Guide and ESG guide text, which no licence or credential stands in the way of.

Ownership: the D7 package-spine lane (this sweep) owns fda-esg.ts and its own use of the packager. regional-packager.ts is shared with the IND demo lane (session 01TtwRHm), whose spine is package-from-core, ectd-compile and AnA package_ectd_for_region, so the change has to be coordinated with or handed to that lane.

The problem is latent today. The AS2 envelope is already known not to be S/MIME (fda-esg.ts:18-35), so FDA would refuse the envelope before opening the payload. F17 would cause a rejection as soon as that gap closes. The 'ectd.zip' sub-claim is refuted as a defect: it is cosmetic and already flagged in the runbook.

**Corrected claim.**

Confirmed: every zip the packager produces has index.xml, index-md5.txt, m1-m5 and util at its root, with no sequence folder. That is the AS2 payload sent to FDA, on both spines.

What FDA most likely expects is <application folder>/<NNNN>/…, the sponsor-supplied application folder on top and the sequence folder inside it, rather than the finding's bare '<sequence>/' at the top. The exact application-folder name needs confirming against FDA's Technical Conformance Guide and ESG guide.

The payload filename is 'ectd.zip' only on the AS2 path; SFTP uses <transmissionId>.zip under /incoming/<app>/<seq>/. It breaks no FDA rule I know of, so it is not a defect, and the runbook already flags it.

**Smallest correct fix.**

The fix belongs in the packager. Re-wrapping the zip at transmit would send bytes that differ from the sha256 the transmit guard verified (readVerifiedBundle).

1. In packageEctdSubmission (regional-packager.ts), set const root = zip.folder(<root>)! and change the seven zip.file calls at lines 1041, 1046, 1081, 1091, 1130, 1138 and 1139 to root.file(...).
2. For <root>, use input.sequence for the ICH-level fix. For FDA, use `${applicationFolder}/${input.sequence}` once FDA's application-folder naming is confirmed from the Technical Conformance Guide and ESG guide.
3. Leave unchanged: backbone hrefs, checksums, the util/index-md5.txt relPaths (all relative to the sequence root) and modified-file '../0000/index.xml#…'. That pointer then resolves between sibling sequence folders.
4. Add one helper, sequenceRootOf(zip), which returns the prefix of the single <seq>/index.xml, and route every zip reader through it.
5. The emitUnzipped extraction then yields …/<seq>/index.xml, which is what an external validator expects.
6. AS2 filename: optional, and not required by any rule I know. If wanted, pass filename: `${applicationId}-${sequence}.zip` at fda-esg.ts:659.

**Blast radius.**

Production files that read the zip at its root and would need sequenceRootOf:
- regional-packager.ts (the writer and emitUnzipped)
- ectd-structural-validator.ts:279-370 (index.xml, the regional backbone and util/index-md5.txt at the root; the transmit guard runs on this)
- bundle-leaf-security.ts (entry scan)
- ectd/qualification/qualify.ts
- ectd/external-validator/fda-criteria-adapter.ts
- ectd/orchestrator-real-package.ts
- routes/ectd-compile.ts
- export/ReleaseHashGenerator.ts (check whether it reads packager zips)

The other spine is affected. package-from-core, assemble-from-core, ectd-compile and AnA package_ectd_for_region all call packageEctdSubmission, and ectd-compile.ts reads index.xml at the root. Every newly assembled bundle gets a new sha256, which is expected; bundles already on disk keep their bytes.

Tests that pin the root layout (22 files read file('index.xml'|'index-md5.txt'|'util/index-md5.txt'|'m1/us/us-regional.xml') at the root):
- tests/submission-ops-package-spine.pglite.e2e.test.ts:170-171, 251, 255-257 (these lines simulate the agency's 0001/ placement) and 310
- submission-gateways/__tests__/{lifecycle-packaging, regional-backbone-dtd-path, regional-backbone-referenced, delete-leaf-sink, stf-packaging, modified-file-leaf-id, encrypted-leaf-refused, fda-filing-identity}.test.ts
- ectd/__tests__/{lifecycle-rehearsal, lifecycle-declared-acts, withdrawal-approval-binding, export-application-identity, lifecycle-from-core, package-leaf-bytes, regional-backbone-readiness, section-to-ctd, core-to-packager-fda-admin}
- ana/__tests__/package-ectd-for-region-withdrawal.test.ts
- tests/ectd-backbone-checksums.test.ts
- tests/golden-journeys/submission-export-package.journey.test.ts

If the validator starts requiring a sequence root, the hand-built root-level fixtures in transmit-leaf-security, transmit-guard-reports-checks and ectd-package-file-names tests also change.

The AS2 filename change, if made, touches only fda-esg.ts:659. docs/runbooks/fda-esg-production-uat.md:147 would need updating, and no test pins that header.

### F18 — partial (severity low, spec confidence medium, reproduced True)

**Observed (probe output).**

Probe: tests/zz-probes/verify-f18/f18.probe.test.ts, now deleted. It ran the real FdaEsgGateway and the real executeGovernedTransmit at HEAD 39f2665e. Stubbed: db, PEM reads, the bundle-byte hash, the content fingerprint, recordFiledSequence, and ssh2-sftp-client (which is not installed). Result: 5/5 passed.

A1, gateway level, sequence '0001':
  appId="../../outgoing/IND999999" -> put(dest)=/incoming/../../outgoing/IND999999/0001/sftp-../../outgoing/IND999999-0001-1790823560948.zip status=in_transit ack=null
  appId="IND123456/../../etc" -> put(dest)=/incoming/IND123456/../../etc/0001/sftp-IND123456/../../etc-0001-1790823560948.zip
  appId="IND 1;rm" -> put(dest)=/incoming/IND 1;rm/0001/...

A2, sequence:
  seq="../x" -> ValidationError: Transmit requires the four-digit eCTD sequence number in metadata.sequence; nothing is sent without it. puts=0 insertRows=0
  "0001/.." and "00a1" gave the same result.

A3, the SFTP package: resolve: NOT RESOLVABLE (MODULE_NOT_FOUND); declared ssh2* deps: []

C1, real executeGovernedTransmit (package spine, production, >1 GiB). The stored descriptor has sequence '0001' and the package's regulatory.applicationNumber is 'IND123456'. The caller sent metadata {applicationId:'../IND999999', sequence:'0007'}. Output:
  "sftpPutDest": ["/incoming/../IND999999/0007/sftp-../IND999999-0007-1790823560955.zip"]
  "gatewayStatus": "in_transit"
  "filedSequenceRecorded": true, "filedSequenceReason": "recorded"
  "recordFiledSequenceCalls": [{"sequence":"0001","submissionType":"original","transmittalId":4242,...}]
  "transmittalUpdates": [["in_transit"],["in_transit","sftp-../IND999999-0007-1790823560955"]]

D1, the stub removed (what the deployed product does):
  TransportError: FDA ESG SFTP transport requires 'ssh2-sftp-client' package; nothing was sent. Install it (npm install ssh2-sftp-client) and retry. | transmitted=false puts=0 rowUpdates=[["in_transit"],["rejected","transport",...]]

**The requirement.**

This splits into two questions.

1) Is there an FDA rule about this path? None I can support. As far as I know, FDA ESG offers WebTrader (retired) or the NextGen web portal, AS2 gateway-to-gateway, and the NextGen API. I know of no FDA SFTP channel, no esg-sftp.fda.gov host, and no /incoming/<application>/<sequence>/ or /outgoing/ acknowledgement convention. The repo's own runbook says this transport was never exercised against live ESG (docs/runbooks/fda-esg-production-uat.md:4; line 76 gives the host only as "e.g. esg-sftp-test.fda.gov"). FDA files a submission by ESG account, center and the eCTD content (the us-regional.xml application number and the sequence folder), not by upload path. So "FDA would misfile" is not supported; my confidence in any harm on FDA's side is low. The "documented 1 GB AS2 limit" that sends bundles down this branch is also a figure I cannot confirm.

2) The rule the finding actually relies on is internal, and it is real (high confidence). The repo has exactly one identifier rule, and its header says a free-form application number "was a path-traversal / ill-formed-backbone vector". The SFTP branch skips it. Also, when the deposit path and tracking id disagree with the descriptor's sequence and application number that the filed history records, the platform's record of its own filing is wrong.

On "a bare deposit is not a filing": ESG sends Ack1 (gateway), Ack2 (center) and Ack3 (center load/validation). A sequence that fails a high-severity eCTD validation criterion is technically rejected and not loaded. So recording at PUT completion is premature (medium confidence). That is F19's rule, though, and AS2 also records at the MDN, which is equally before Ack3.

I put this at medium overall: high for the internal rule, low for any effect at FDA.

**Scope.**

Not fixed at HEAD 39f2665e. sftpApplicationId and the path builder are unchanged, and the parent's recent commits (F14) do not touch them.

The missing ssh2-sftp-client is already documented in the file (fda-esg.ts:34-35). It is tied to a procurement gap: the IND lane's row D7/W5 in docs/work-orders/README.md section 0 lists ESG credentials as blocked, and the SFTP channel itself is unverified with FDA. Adding the dependency is a product decision, not a code fix.

The "recorded as filed" part is F19 and should be fixed there.

fda-esg.ts is shared by both spines. The sequence spine reaches the same path builder with a caller-typed applicationId: server/routes/submissions.ts takes `applicationId: z.string().min(1).max(128)` from the request body, submission-service.ts:1259-1260 applies the same trim/UNASSIGNED-only check, and :1436 passes it as metadata.applicationId. So the traversal exists on both spines. That spine's sequence comes from the server (seq.sequenceNumber), so the sequence-mismatch half affects the package spine only. How the sequence spine sources applicationId belongs to the IND demo lane (session 01TtwRHm). The validation fix in fda-esg.ts below covers both spines.

The package-spine mismatch (governed-transmit.ts) is in this sweep's scope.

**Corrected claim.**

What holds:
- The SFTP remote path (fda-esg.ts:539-540) uses metadata.applicationId as typed by the caller. sftpApplicationId (fda-esg.ts:253-260) only trims it, requires it to be non-empty and refuses /^UNASSIGNED/. So '../', '/', spaces and ';' reach both the PUT destination and the stored transmissionId. This bypasses the repo's own identifier rule, REGULATORY_IDENTIFIER_PATTERN in server/services/ectd/regulatory-identifiers.ts.
- On the package spine both path values come from the route's free-form `metadata: z.record(z.unknown())` (mdx-submission-gateway.ts:183, passed on at governed-transmit.ts:678). Neither is ever compared with bundle.sequence or with the package's metadata.regulatory.applicationNumber, which is what was written into us-regional.xml. In C1 the file was deposited as 0007 under ../IND999999, but the filed history records 0001 for the package.
- governed-transmit.ts:720-721 calls recordTransmittedSequence whenever gw.transmit returns. So an SFTP PUT that returns 'in_transit' is recorded as filed. This is F19's root cause, not new here.
- ssh2-sftp-client is not in package.json, the lockfile or node_modules. fda-esg.ts:34-35 already says so.

What is refuted:
- The sequence cannot carry unexpected characters. requiredAgencyMetadata (types.ts:518) enforces ^\d{4}$ before any transmittal row exists.

Reach at HEAD:
- Because the module is absent, every FDA bundle over 1 GiB (bundles up to the 4 GiB gateway limit pass the pre-transmit size gate) is refused honestly before any connection: TransportError marked nothing-transmitted, row set to rejected/transport.
- The path traversal, the descriptor mismatch and "deposit recorded as filed" are therefore latent. They only happen once someone installs the module.

**Smallest correct fix.**

1) fda-esg.ts, sftpApplicationId (lines 253-260): use `const id = usableIdentifier('applicationNumber', req.metadata?.applicationId)` from '../ectd/regulatory-identifiers'. Refuse when it is null or matches /^UNASSIGNED/i, and pass NOTHING_TRANSMITTED on that ValidationError. It already runs before the row at :604, the same position as requiredAgencyMetadata. About 4 lines; it closes the traversal on both spines in one place.

2) governed-transmit.ts, package spine only: have loadStoredBundle also return usableIdentifier('applicationNumber', metadata.regulatory?.applicationNumber). When !input.clientBundle, make the descriptor authoritative at the gw.transmit call (:678):
- refuse with 422 (GovernedTransmitRefusal 'METADATA_DESCRIPTOR_MISMATCH') when the caller's metadata.sequence or applicationId is present and differs from bundle.sequence or the stored number;
- otherwise fill both from the descriptor before `environment`.

3) Do not add ssh2-sftp-client under this finding, and leave "deposit recorded as filed" to F19's fix (recordTransmittedSequence must not file a result that is not an agency receipt, or the filing must be reconcilable). Optional, and a product call rather than the smallest fix: refuse the >1 GiB branch before the row with UnverifiedTransportError('fda','esg','sftp',…), as the REST adapter already does.

**Blast radius.**

Files: server/services/submission-gateways/fda-esg.ts (sftpApplicationId only) and server/services/submission-gateways/governed-transmit.ts (loadStoredBundle and the gw.transmit metadata).

Other spine:
- Fix 1 also applies to the sequence spine's transmitSequence, which uses the same gateway. It only adds protection, and that spine's tests use 'IND123456', which matches the pattern.
- Fix 2 affects only the callers of executeGovernedTransmit: routes/mdx-submission-gateway.ts and the AnA 510(k) path in ana-ri/mdx-command-handlers.ts:827. FDA AS2 ignores both fields. Wherever a descriptor has no sequence, nothing is filled.
- Every region's gateway reads metadata.sequence through requiredAgencyMetadata. So fix 2 also corrects the same caller-vs-descriptor mismatch for EMA, PMDA, HC and the others on the package spine.

Tests that pin current behaviour:
- Fix 1 should require no test changes, but I did not run the suites. These look unaffected because they use 'IND123456' or other pattern-valid ids:
  - fda-esg-sftp-ack.test.ts
  - fda-esg-hardening.test.ts:356-369 ('UNASSIGNED-SEQ-9' is still refused)
  - refused-before-wire.test.ts
  - submission-service/__tests__/transmit-guard-refusal-releases-claim.test.ts
- For fix 2 (not run), re-run:
  - tests/submission-ops-package-spine.pglite.e2e.test.ts
  - submission-gateways/__tests__/governed-transmit-*.test.ts
  - ana-ri/__tests__/mdx-esg-transmit-gateway.test.ts
- If instead the >1 GiB branch is refused up front, these change: fda-esg-sftp-ack.test.ts, the SFTP-path block of fda-esg-hardening.test.ts, and the SFTP CredentialError and module-absent cases in transmit-guard-refusal-releases-claim.test.ts.

