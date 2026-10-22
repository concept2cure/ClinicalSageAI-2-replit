# Reserve protocol before verifying approval independence

The actual native red baseline is retained in `../evidence/D2-PLATFORM-COMPLETION/2026-10-14/protocol-sod-reservation/baseline/`. A pending approver can commit a governed section edit while finalization waits for the protocol parent. The shared ceremony checked authorship before waiting and accepted the later author as an independent approver. A matching content digest does not prove independence.

## Bounded correction

Extend the existing server-owned `GovernedSignatureInput` with optional transaction preparation, called after BEGIN and tenant context but before the authorship check. Preparation may reserve the authoritative domain parent without writing content, lineage, a version or a governed action. Protocol finalization supplies its existing `lockProtocolForSignatureTx` parent reservation. Keep the shared SoD check before the domain write: the finalization snapshot itself otherwise makes an independent signer an author. No additional signing route or ceremony is introduced.

The transaction retains preparation, authorship verification, the existing finalization/completeness read, ledger pair and electronic signature together. Preparation errors roll back without calling the domain write or recording signature history. Existing meanings, signing authority, real password/MFA reauthentication, rate limits, canonical content binding and historical signatures stay governed by their existing policies.

## Required proof

Use fresh isolated native QA records and the actual restricted runtime. Queue writer before signer behind an explicit parent holder. Observe native blocking, commit the signer's genuine section edit, then require finalize403 `SEPARATION_OF_DUTIES` with no partial major version, sign action or signature. Retain the writer's real edit. Preserve the previously red protocol86/signature22 and its stored state hash unchanged. Include independent approval and author-authorship positives, refusal/rollback ordering and the existing protocol signing/export/race regressions.

This closes the observed protocol-finalization ordering gap only. Reviewer-disposition reservation, independent sharing/role revocation serialization and scientific or production qualification are separate boundaries.
