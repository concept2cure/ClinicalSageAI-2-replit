# Complete non-US application-number release coverage

Workstream W5 / D7. Baseline `dd749f3e56f1d9055b19067e90680d70bf9a9fb9` on 2026-10-23.
Evidence `docs/evidence/W5/2026-10-23-nonus-release-identity/`.
Direct canonical branch only; root owns commits/pushes. No dependency, schema,
store, validator, approval engine, region vocabulary or enforcement-default change.

## What already exists

- `shared/regulatory/region-identity.ts` is the canonical agency/region resolver.
  No new region table or support claim is needed.
- `server/services/ectd/package-identity.ts` already reads same-tenant program,
  sponsor and P-44 submission/market application numbers; its version-1 snapshot,
  equality check and program/sponsor share-lock helper are canonical. Snapshot
  projection currently carries FDA facts; it has no region projection or
  submission-number lock. DUNS/contact are FDA facts, not other agencies' IDs.
- `server/services/submission-service/market-application-number.ts`, the existing
  `/api/submissions/:id/application-number` routes and `ProjectMarkets.tsx` /
  `MarketApplicationNumber.tsx` already record the market number with reason,
  authority and chained audit. A changed existing number is refused after a
  sequence fixes it. That policy stays; no second editor or writer is needed.
- `server/services/part11/ectd-sequence-binding.ts` already captures FDA identity
  with the exact legacy sequence-content digest. Non-US signatures remain
  leaf-only. `signature-persistence.ts` stores the derived proof after caller
  metadata. `sequence-release-signature.ts` already distinguishes proven
  identity-only staleness from tamper, without rewriting historical rows.
- `run-package-identity.ts`, `submission-package-orchestrator.ts`,
  `signed-package-export.ts`, `signed-manifest-covers-sequence.ts` and
  `release-signature-status.ts` already capture, hash, export and compare signed
  package snapshots. Their identity requirement is currently US-only.
- `assemble-from-core.ts`, `package-from-core.ts`, `core-to-packager.ts` and
  `orchestrator-real-package.ts` already pass captured proofs and echo them.
  Scalar/proof consistency checks and export propagation are currently FDA-only.
- `submission-service.ts` already rechecks governed binding under locks, captures
  transmit identity, checks bytes at the pre-wire boundary, releases refused
  claims and permits independent re-signing of an explicitly unsent FDA dispatch.
  Non-US packageability still uses placeholder dry-run identity and transmit
  falls back to a mutable identity read.
- `SubmissionSeqWorkspaces.tsx` and `SubmissionCenter.tsx` already reach the
  server-owned renewal eligibility through the existing Part 11 sign-and-act
  chain. Text is generic; no new approval control is required.
- P-44 explicitly hands non-US application-number signature coverage to this
  identity lane (`docs/evidence/D2-ONE-ANA/2026-10-22/p44-market-application-number/README.md`).
  EMA slash handling and the unknown-region home-number heuristic are separate.
- Code searches covered application/market number, identity, captured snapshots,
  signature coverage, dispatch authorization, routes, services, UI and tests.
  `git log --all --diff-filter=D` over package identity, sequence binding,
  signature coverage and market-number names found no deleted replacement.


## Contract and limits

1. Reuse `RecordedPackageIdentitySnapshot` version 1. Extend the existing capture
   helper with optional `{ region?: string | null }`. Default/FDA captures remain
   byte-compatible. A recognized non-US region captures program, application
   number, applicant sponsor pointer and applicant name; FDA-only applicantId
   and contact fields are canonical nulls. This does not make a DUNS another
   agency's identifier. Clone calls over an already captured proof may keep the
   existing default. Capture is not a new validator.
2. Every recognized sequence region gets captured proof in the existing binding
   and retains `sequenceContentDigest`. Unknown regions cannot establish release
   identity: use the existing honest ledger fallback/refusal, never a guessed
   region or leaf-only approval. FDA digest recipes stay unchanged. Derivation
   reads the sequence's actual submission/region through the P-44 reader.
3. Existing snapshot hashing/integrity stays compatible with historical absent
   fields. Historical proof-free non-US records remain verifiable historically,
   but cannot establish current coverage. Existing legacy/identity-only stale
   classification permits a new independent authorization only with unchanged
   sequence/leaf content and intact proof. Leaf changes, bad hashes, malformed
   proof, wrong parent/region or unexplained mismatches remain invalid/refused.
4. Require captured identity for new and resumed real known-region orchestrator
   releases; incomplete/mismatched facts require reassembly. Reuse the current
   dry-run refusal. Snapshot coverage compares actual sequence parent AND region
   and projected current identity. FDA-only completeness rules apply only to US;
   other regions require existing recorded number/name rules. Unknown region is
   unreadable coverage, never positive leaf-only coverage.
5. Thread captured proof through existing export/assembly/package functions for
   all known regions. When proof is supplied, verify program/application/name
   against actual package scalars for all regions. Keep FDA ID/contact checks
   FDA-only. Optional non-FDA regional IDs retain their current contract and
   cannot be filled from the FDA DUNS. No contact/ID authority is invented.
6. Extend the existing `lockRecordedPackageIdentity` helper with optional fourth
   argument `{ submissionId?: number }`: under the caller's sequence lock, lock
   the same-tenant submission FOR SHARE before program/sponsor, validate its
   program anchor against the captured program, then keep program/sponsor order.
   Real freeze/dispatch/claim capture passes actual submissionId. The market
   writer already takes submission FOR UPDATE and makes only plain sequence
   reads; preserve that writer and its fixed-number policy, avoiding reverse
   row-lock ordering. No transaction is held across gateway network work.
7. Governed packageability judges captured recorded facts for every known
   region. Explicit user test-package/dry-run paths remain clearly dry. Real
   transmit requires the claim-captured identity, packages it, checks proof echo
   plus fresh digest at the pre-wire boundary and records it in existing
   metadata/audit for all recognized regions. Release claims on every pre-wire
   refusal. A later edit cannot alter immutable captured bytes.
8. Extend the existing unsent dispatch renewal eligibility from FDA to recognized
   regions with new content-bound proof. Current authority, independent signer,
   full gates, dispatch-status CAS and spent-signature recheck remain required.
   Null/pending/rejected are eligible; undefined/unknown/in-flight/sent/ack states
   remain refused. Generic lifecycle transitions stay forward-only. The existing
   UI uses server eligibility and refreshes through its existing chain.
9. Preserve P-44 number-edit immutability, FDA historical digest compatibility,
   agency gates, default flags, tenant isolation and append-only signature history.
   No EMA slash or home-market semantic change, agency qualification claim,
   automatic retry, new UI surface or placeholder in a real release.

## Verification and ownership

Fail first on non-US number changes leaving digest/coverage unchanged, missing
proof clearing a real sign, borrowed parent/region, mutable transmit identity and
missing renewal reachability. Keep FDA compatibility and tamper cases. Test
missing non-US DUNS/contact as allowed, missing number/name as refused. Verify
actual emitted package inputs/bytes, independent renewal/audit/claim rollback,
exact row-lock serialization on native PostgreSQL where feasible, existing UI
continuation and session guards. Archive executed input hashes; distinguish
scoped cohorts from full-suite claims. Build and unchanged normal push/compiler
checks before direct canonical publication; human witness remains unexecuted.

- Core worker: package-identity, sequence binder, existing assembly/export/core
  package projection/consistency and focused tests. Public helper interfaces above.
- Snapshot worker: run identity, orchestrator snapshot/sign boundary, signed
  coverage/export, release-status compatibility, focused tests.
- Caller worker after interfaces acknowledged: submission service, existing
  dispatch UI comments/tests and current-parent continuation, focused native/
  PGlite transmit/renewal tests. No market-number writer changes.
- Root: contract/board, independent review, integrated/native/browser proof,
  lint/build/compiler, ordinary merges and direct canonical publication.
