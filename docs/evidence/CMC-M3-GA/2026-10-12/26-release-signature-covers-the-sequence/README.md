# A release signature clears the dispatch only when it covers the leaves that ship

Rows **D2** and **D5** (21 CFR Part 11 §11.70). GA plan item 1, first half
(decision 2026-10-05): *bind release signatures to the sequence's leaves*.

## The defect

The dispatch transmits the **submissions spine**: a sequence's ordered
`submission_leaves`. `assess-dispatch-readiness` computes every other gate from
exactly those rows.

The orchestrator release signature is taken over a **different artifact**. A run
composes its own leaf manifest in memory and freezes it into the signed
snapshot; `submission-package-orchestrator.ts` contains **no write to
`submission_leaves` at all**. `resolveSignedPackageForExport` then verifies that
signature by recomputing the bound digest *from the frozen snapshot* — which
catches an edit to the snapshot and, by construction, cannot notice that the
sequence's live leaves have since become something else.
`signed-package-export.ts` says so in its own header: a caller that wants bytes
"must re-render deterministic leaves and check each one against
`descriptor.leaves[i].checksum` before shipping". The dispatch gate is such a
caller, and it did not.

So a verified release over run R cleared the dispatch gate for the sequence R
named, whatever that sequence held by dispatch time — leaves placed, replaced
or withdrawn after signing included. **Placing Module 3 into a signed sequence
is one such change, and it is the ordinary CMC path.** The signature did not
bind what would ship, which is the one thing §11.70 asks of it.

The orchestrator spine answers **first** and its `signed` stands, so the second
spine — whose digest *does* bind the full `submission_leaves` rows — never got
consulted.

## The fix

**`signed-manifest-covers-sequence.ts`**, one module, asked by the resolver
before it returns `signed`.

- **What is compared.** Every leaf on both sides, by normalized section code
  and lifecycle operation, plus the **eCTD index-md5** wherever both sides carry
  one for the same leaf. The two checksums are the same contract — `ECTDLeaf`
  documents its as "MD5 per eCTD spec", `submission_leaves.checksum` as "MD5 of
  the leaf's RENDERED bytes — the eCTD index-md5 contract" — so a difference is
  a real difference in the bytes that would ship.
- **One vocabulary.** The orchestrator composes `m3.2.S.1`; the leaf rows hold
  `3.2.S.4.2` and `m1.us.cover`. The same rule is applied to both sides:
  lower-cased, a single leading `m` dropped when a digit follows. A code the
  rule does not recognise is compared as it stands, never guessed at.
- **Honest about what it corroborated.** The checksum column is nullable, so a
  clear answer reports `corroboratedLeaves` out of `leafCount` rather than a
  blanket "verified", and a leaf only one side fingerprinted is matched on
  identity without inventing a mismatch.
- **The same rows the signing digest covers.** Live rows only, this
  organisation only, `ORDER BY section_code, id` — as
  `deriveGovernedTargetBinding` reads them for `ectd-sequence:<id>`. Every
  lifecycle operation is included: a `delete` leaf is part of what ships.
- **Divergence is `unsigned`, not `invalid`.** The orchestrator's signature is
  intact over its own package; what is false is the claim that it covers *this*
  sequence. `unsigned` is also the only verdict `resolveReleaseSignatureStatus`
  falls through to the sequence spine on — so the remedy (sign the sequence
  that is about to be transmitted, which binds its leaf manifest) stays one
  governed click away via `signingNowResolvesRelease`. `invalid` would both
  accuse an intact signature of tampering and leave the operator nothing to do.
- **Fail closed.** A live-leaf read that cannot run returns `unknown`, reported
  as `undetermined` — never as an empty sequence and never as `signed`. Nothing
  is offered on it.
- **Nothing silently unchecked.** A caller that supplies no `sequenceId` cannot
  have the live leaves read, and the detail string says exactly that instead of
  letting a clear verdict imply a check that did not run.

## Red, then green

- **New** (`release-signature-covers-sequence.test.ts`, 18 tests). On the
  previous resolver (`red-before.txt`) **7 fail** — every resolver case:
  - a verified signature over content the sequence no longer holds cleared the
    dispatch;
  - an unreadable sequence read `signed`;
  - a stale run won over a covering one (`expected 'run-newest-stale' to be
    'run-covering'`);
  - a clear verdict claimed no caveat (`expected 'verified against run run-a
    for sequence 0001' to match /was not checked/`).

  After (`green-after.txt`): **18 pass** — including the pure cases for a leaf
  only on one side, a changed index-md5, the two vocabularies, lifecycle
  operations, duplicate leaves, and an absent checksum.
- **Wider** (`green-wider-ectd.txt`): every eCTD suite passes — 90 files,
  1,145 tests.
- **The IND Module 3 requirement's reach, fixed** (`green-validated-honesty.txt`).
  `sequence-validated-honesty.pglite.test.ts` builds an original IND and
  expected it to validate cleanly; since D2 2026-10-05 such a sequence owes
  3.2.S and 3.2.P, so 11 of its 14 cases failed. Its fixture now carries every
  section the regulation requires — **Module 3 derived from the gate's own
  `originalIndModule3Headings`**, not restated, so it cannot drift — and the
  missing-section case asserts the count from those lists and names the Module 3
  findings and 312.23(a)(7). 14 pass.

## Not this change

Two suites are red on `concept2cure-v2` with none of this applied, verified by
stashing the whole change and re-running:

- `server/services/__tests__/artifact-signed-target-binding.test.ts` — 5 cases,
  `ARTIFACT_ACT_CONTRACT` where `ARTIFACT_CHANGED` is expected. The artifact act
  contract, another lane's.
- `server/routes/__tests__/setup.test.ts` — 1 case, a `set_config` tenant call
  in first-run setup. Another lane's.

## Not yet

The rest of GA plan item 1 — refusing inline `cmcSources` outside development,
retiring the orchestrator's `m3.compose` / `m3.refine` / `m3.appendices` /
`m3.regional` steps and `POST /m2/qos`, narrowing `ectd-compile`'s
`/api/submission-orchestrator` claim, and pinning
`module3-narrative-builder.ts`'s `useAI` unreachable from a launch route — is
the second half. This change makes the orchestrator's parallel Module 3 unable
to clear a dispatch; the second half removes it.
