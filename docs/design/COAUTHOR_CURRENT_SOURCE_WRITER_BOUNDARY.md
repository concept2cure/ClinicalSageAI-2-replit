# Co-Author current source snapshot writer boundary

Status: root-approved second W1/D2 writer contract on 2026-10-14, prepared from concept2cure-v2 HEAD 4997d35ebd6a17bfb33df7860195d832bc094921. Source release follows filing this document, but production implementation must wait for a retained meaningful old-writer RED and root's heavy-runner grant. Approval is not implementation or runtime qualification. The first Authoring READ increment remains separately owned and underway; its documented snapshot residual stays open until this writer repair is implemented and tested. No SQL, runner, provider, migration, role or grant was changed during preparation.

## Exact residual and caller inventory

- server/routes/coauthor.ts:249 is the only production direct takeAuthoringSnapshot caller. Its sourced POST requires regulatory-author and a stated changeReason, but delegates source authority to the current service.
- server/services/coauthor/coauthor-snapshot.ts:493 reads source status through the shared pool. Its own db.transaction assembles every saved section, checks saved references/workflow release and source seal, then writes/re-takes one aliased filing copy. The transaction explicitly uses repeatable read. No current source programme/document ACL admission appears in that path.
- client/src/concept2cure/v2/surfaces/placeIntoFilingCopy.ts:63 is the only production sourced POST caller, invoked by AuthoringPlaceIntoFiling. Its payload and receipt contract can stay unchanged. Its explicit-partial READ guard is a mitigation, not server authority.
- tests/lineage/founder-path-lineage.hops-filing.ts:71 is the sole direct test service caller. It currently omits the already-required reason and hides an incomplete audit actor behind as never.
- AnA's authoring-canonical-bridge loads sections for canonical revision projection, not this snapshot writer. Duplicate/review/dispatch paths do not call takeAuthoringSnapshot. Dispatch reads the resulting copy and pins. Preserve the assembler's optional-q ABI for those distinct callers; do not add a second source assembler or permission policy.

## Approved production ownership

Only server/routes/coauthor.ts and server/services/coauthor/coauthor-snapshot.ts need writer production changes. Reuse the incoming role-aware authoring-read-scope and current-program-access as released; do not independently edit their READ policy. requestDb, canonical seal/order/pin/alias/audit/assembler functions, schema and providers remain unchanged. Any later reservation-helper change must be separately justified/released rather than silently broadening this proposal.

Add a mandatory executor to the existing snapshot args:

```ts
type SnapshotDatabase = Pick<RequestDb, 'execute' | 'transaction'>;
takeAuthoringSnapshot({ ...existingArgs, executor: SnapshotDatabase });
```

The sourced route supplies exactly requestDb(req), resolved through the existing no-fallback request helper. One executor avoids a separately supplied q and transaction DB that could belong to different connections. queryableFromDrizzle supplies the query surface from that executor's actual transaction. The NodePg session uses the pinned LazyRequestDbClient rather than pool.connect because that client is not a Pool. Each current-access grant is minted/rechecked on the same transaction query adapter; no preview grant is transplanted between adapters. No default global executor or fabricated Express request is accepted. Tests must prove request context absence cannot consult a global pool.

Maintain SnapshotOutcome, source-derived title/body/status, written/created/aliasRecorded, 200/201/replaced, seal metadata and the existing stated reason. This is not a new route or client role/executor field.

## Transaction and admission order

1. Retain the route's outer role/reason gates. Capture authenticated positive numeric org/actor IDs; source identity remains the actual saved UUID. Invalid non-string or malformed UUID source IDs refuse400; normalize valid UUID case. Old mock-only non-UUID fixtures become honest valid UUIDs, with a different valid missing-source UUID preserving404 controls.
2. Enter the request-bound writer transaction at READ COMMITTED. Remove the global pool status preview. Resolve the current active OU/user/org via the canonical current actor reader before source identity/status lookup.
3. Read source identity only (id, tenant_id, client_program_id, status, created_by), with exact tenant. Use the recorded programme, never a supplied module/title/text or destination programme guess. Positively admit its canonical unique project anchor/current sharing. Record the exact integer project ID. Missing/duplicate/deleted relationship retains canonical refusal; no metadata/body is read on failure.
4. Mint getCurrentAuthoringReadScope on that exact source. Require the source in documentIds, not merely sectionDocumentIds. A full VIEWER document grant is enough for source viewing only: the verified current OU role must independently satisfy existing roleClaimsSatisfy/expandRoleClaims(['regulatory-author']). A current OU viewer must refuse despite stale admin JWT claims. Do not invent an export/edit ACL rule or a new write-role allowlist.
5. For a legitimate NULL-program historical source, the exact service call opts into includeOrganizationDocuments only for its positively recorded NULL relationship. It still requires current active OU, whole-document ACL and actual regulatory-author authority. Default read-scope behavior remains false. NULL does not imply public/owner/approved/project association; selected/recorded non-NULL sources do not use this exception. Root may choose a stricter explicit caller option, but no permissive global default should be added.
6. Lock the actual source document FOR UPDATE, preserving the existing SOURCE_CHANGED409 state-race check. Verify its recorded programme still agrees with initial identity and re-admit current authority before source metadata/body. This prevents moving a source to another programme between admission and its lock from inheriting the old grant. Derive status via the existing snapshotStatusFor.
7. Read saved provenance only after whole-source admission. Build the verifier actor from the actual current user ID and current verified email. Current role supplies writer authority and audit role; req.user role/ALS never grants. Captured audit name/IP remain descriptive fields, and actor/createdBy identities must agree with the verified actor.
8. Keep verifySavedDraftSourceReferences before the canonical assembler, and preserve assertWorkflowImportRelease. Consider replacing the initial verify with the existing reserveSavedDraftSourceReferences where saved-reference stability must be retained until the copy receipt commits; it already uses the canonical disposition advisory lock, SHARE store reservation and exact imported-source verification. Review its lock ordering with the source document lock before adopting, and reverify retained references at final completion. Do not copy these rules or weaken current saved-binary/workflow holds.
9. Assemble all saved sections once, on actual transaction q, using defaultAuthoringBridgeDeps().loadDocumentSnapshot(q). Keep non-blank source refusal, exact seal byte/hash/title/ordered-section fidelity, same alias/copy ID, deleted-copy recreation, pinned-copy protection, allowed same-text status promotion, version preservation and audit reason unchanged.
10. Before transaction success returns, recheck current role/OU/email, exact whole-source ACL, exact source parent and exact project anchor on actual q, and retained source/reference/release conditions. Run this for every positive outcome, including unchanged written:false retakes, because they return the whole copy. Current committed sharing/ACL/role/anchor changes that the guard observes refuse the combined result. READ COMMITTED permits those changes to be seen; repeatable read would silently retain the earlier authority snapshot.
11. A late failure after alias/copy/version/audit writes MUST throw an internal rollback carrier containing a SnapshotRefusal. Convert it to SnapshotOutcome only outside the transaction. Returning a refusal object from the callback would COMMIT prior writes. Unknown failures retain the existing safe route500/log behavior; typed authority/policy unavailability receives safe503, never success-empty. Preserve existing initial canonical403/404/409 and existing state/seal/pin/refusal codes. Use a named generic503 for an observed late authority change, with no source labels or prose.

## Authority and concurrency limits

The source FOR UPDATE lock preserves the existing source-parent/state relationship and ordered capture contract. It does not reserve every programme sharing/ACL row. No new actor FOR SHARE locking is approved in this increment. Such locking can make an owner's role withdrawal wait; adopting it requires an explicit separate test design and release. Tests must not claim a committed withdrawal when the transaction is blocked. A canonical late read observes changes committed before it, not arbitrary revocation between the last read and COMMIT. No serializability or comprehensive sharing reservation is claimed.

Do not widen canonical permission SQL solely to assert stronger atomicity. A separately approved row-reservation improvement would need meaningful native races and compatibility with all sharing writers. Existing immutable seals, versions, genesis, audit trails and original source rows are never rewritten to manufacture a positive proof.

## Meaningful controls and exact test ownership

New actual-SQL focused suite: server/routes/__tests__/coauthorSnapshotCurrentAccess.pglite.integration.test.ts, plus a non-test local fixture only if needed to keep setup readable. Native owner should add tests/db/coauthor-snapshot-current-access.dbtest.ts on the explicitly approved isolated target; this preparation adds neither file.

New cases should first capture RED against the unchanged current writer, then GREEN without assertion weakening:

- Programme-sharing denial and document ACL denial independently; foreign source; missing source; current OU viewer with full source VIEWER ACL and stale admin token; inactive/removed OU; expired/revoked ACL; changed email-based grant.
- Exact section-only grant over one admitted section plus hidden sibling markers: refuse before any section assembly/provenance/full copy, and no alias/copy/version/audit change. Genuine full-document positive must still create/re-take; a whole document with no saved prose must retain422.
- Legitimate NULL-program source with explicit current full ACL positive versus same source without ACL and selected-program conflict; no guessed parent/project.
- Missing request q and failed current policy store: exact safe refusal, no shared pool fallback, no label/prose/no metadata assembly.
- Deferred real source/metadata read followed by actual SQL programme sharing, full ACL, role/email/OU or unique-anchor transfer: late refusal leaves snapshot, aliases, versions and audit state unchanged. PGlite establishes SQL/rollback logic only. Native uses another connection with actual committed changes and records that the owner mutation settled. Avoid mutations blocked by source/actor locks; no DDL/trigger bypass to fabricate a race.
- A late failure injected only after the real retake writes its superseded version and audit event must prove transaction rollback of ALL those rows. Keep original source/genesis/seal/history unchanged. Audit-persistence failure must still roll back its copy mutation.
- Preserve positive DRAFT snapshot, exact approved/frozen seal, unchanged retake written:false, deleted-copy recreation, one alias per source, pinned text/title409, allowed identical-text promotion, immutable filed pin, current saved-binary reference hold and workflow human-adoption/model-qualification holds.

Existing narrow suites requiring request-context/current-authority fixture adaptation:

- server/routes/__tests__/coauthorSnapshotFromSource.test.ts
- server/routes/__tests__/coauthorSnapshotStatus.test.ts
- server/routes/__tests__/coauthorSnapshotSeal.test.ts
- server/routes/__tests__/coauthorSnapshotSeeds.test.ts
- server/routes/__tests__/coauthorSnapshotPinnedByLeaf.pglite.test.ts
- tests/lineage/founder-path-lineage.hops-filing.ts (direct caller ABI only), qualified through its existing founder suite.

All five route suites currently omit req.dbClient. They need a real request-shaped fixture executor and actual current active membership/source full ACL for their intended positive actors. Do not blanket grant every fixture or mock a canonical allow decision. FromSource's source-state/ABA hook currently sits on the pooled status preview; move the observer to a real supplied identity/lock boundary, preserving its status, seal and original assertions. Its source setup lacks users.email, document.created_by and full ACL fixtures. PinnedByLeaf/Seal/Seeds also need actual current actor/ACL tables/rows. Status is a mocked status/response unit, not DB authority proof; its logical non-UUID IDs need honest valid UUIDs if strict validation is adopted.

Founder helper must provide the existing stated reason, a complete CoauthorAuditActor (current seeded actor name/role/IP) without as never, and explicit request-bound executor. Its existing harness already makes request clients for HTTP routes; no alternate pool authorization shortcut is needed.

## Explicit adjacent residuals / no publication overclaim

Coauthor GET/list/session, unsourced create/PUT/DELETE, batch drafting, other canonical projections, and dispatch/mutation privacy remain separate owners. In particular filingCopyPins can disclose existing leaf/sequence labels in its canonical409; legacy cross-programme/unanchored placements and concurrent leaf placement/pinning should be independently reviewed rather than silently changed in this source-admission increment. upsertLeaf still performs global source-pin/program reads before its mutation transaction; the snapshot repair does not qualify that adjacent writer or reserve every new leaf reference. No full platform privacy, filing readiness, agency compliance or approval result follows from this bounded proposal.

No runners were executed for this preparation, and no new vulnerability runtime reproduction is claimed. All prior source/native/browser proof belongs to its exact retained phase.
