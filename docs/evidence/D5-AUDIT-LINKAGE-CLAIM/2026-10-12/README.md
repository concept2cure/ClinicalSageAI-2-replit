# D5 — the audit attestation now says which check it ran

**Row:** D5 (Part 11 evidence)
**Workstream:** W3b
**Finding closed:** HS-1008-7 (`docs/evidence/reviews/2026-10-08/honest-state.md`)
**Date:** 2026-10-12
**Head before:** `5c18e32f0`

## The defect

The compliance report's audit-trail integrity section attested:

> **Every one of 3 rows carries a hash linked to its predecessor.**

That reads as cryptographic linkage. It is what the **sibling verdict on the
same page** genuinely verifies — `audit_logs hash chain` says *"Every chained
row re-derives from its predecessor"*, and it is a chain walk that recomputes.

The `audit_events` check behind the quoted sentence does neither:

1. It **never recomputes `record_hash`** from the row's content, so a row whose
   content was altered while its stored pointers were kept consistent passes it.
2. Its break condition required `row.previous_hash !== null`:

```ts
if (row.previous_hash !== prevHash && prevHash !== null && row.previous_hash !== null) {
  brokenLinks++;
}
```

   A row whose `previous_hash` is NULL **although its predecessor was hashed** —
   so it is not the chain's genesis; it claims no predecessor while one exists —
   fell through that condition as a verified link, and the snapshot reported
   `intact` over it.

Two verdicts side by side, in a regulator-facing document, in near-identical
language, backed by checks of very different strength. A reader has no way to
tell them apart.

## What changed

### The sentence states which check ran

```
All 3 rows carry a record_hash and each previous_hash matches its predecessor.
Row content is not re-derived, so this verifies the chain's links and not the
rows' contents.
```

A test asserts the sibling `audit_logs` verdict still reads *"re-derives from
its predecessor"* and that this one does **not** — if both ever read the same
again, that test fails.

### An unplaceable row is no longer a verified link

`snapshotChainIntegrity` now counts a NULL `previous_hash` after a hashed
predecessor as `unlinkedEntries` and returns `unverified` with the reason,
rather than letting it pass.

**It is reported `unverified`, not `broken`,** and that distinction is
deliberate. `broken` asserts a mismatch was *found*; here none was — the row
simply cannot be placed in the chain. The module already had `unverified` with a
`reason` for exactly this shape (it is what `unhashedEntries > 0` returns), so
this follows the house vocabulary rather than inventing a verdict. Precedence is
preserved: a genuine mismatch is still `broken`, and unhashed rows still take
the reason when there are any, because that is the larger gap.

The chain's own genesis row — the first row of an organisation's chain, where
`prevHash` is legitimately null — is not counted unlinked. That has its own
test, because a careless fix would have flagged the first row of every chain.

### Scope: this closes the wording, not the derivation

The full re-derivation **already exists in this repository**, over the same
table, in `routes/part11-compliance.ts` — which recomputes `record_hash` from
each row's fields (with a raw-timestamp fallback) and whose own wording, *"Full
re-computation of SHA-256 hash chain from database records"*, is therefore
accurate. I checked that route rather than assuming, because the finding's
severity depends on it.

So this is a duplicated capability at two strengths, and the zero-duplication
answer is to migrate the export's check onto the re-derivation. That is a larger
change than the finding scopes (different query shapes, different tenancy
handling, and a verdict that would newly be able to report content tampering),
and it is not done here. **Until it is, the report states what this check
verified.** The auditor's own recommended fix was this wording.

## A correction to my own first reading

I initially believed the sentence also miscounted — that "every one of
`totalEntries` rows" was wrong because unhashed rows are skipped. It is not:
`status: 'intact'` is only returned when `unhashedEntries === 0`, so
`totalEntries === hashedEntries` on that branch. I checked the branch before
writing the claim anywhere. The defect is narrower than I first thought and is
exactly what the auditor described.

## Verified by making each check fail

| Suite | Against pre-fix code | Against the fix |
|---|---|---|
| `server/services/audit/__tests__/chain-integrity-unlinked-rows.test.ts` | **2 failed / 5 passed** | **7 passed** |
| `server/.../compliance-reports/__tests__/integrity-report.test.ts` | **1 failed / 11 passed** | **12 passed** |

Three failures across both files, all of them the new behaviour, with 16 cases
passing against the pre-fix code.

**Two of my controls were initially weak and I fixed them.** The
"correctly-linked chain is intact" and "genesis row" cases asserted
`unlinkedEntries === 0`, a field that is simply *absent* pre-fix — so they
failed for the field's absence rather than for any behaviour, which is not what
a control is for. They now assert only what the fix leaves unchanged
(`status`, `brokenLinks`), and pass in both directions.

## Repo-wide gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run ci:internals-in-copy` | no new occurrences, 0 baselined |
| `npm run check:microcopy` | OK — 476 customer-facing files |
| `npm run ci:discarded-audit-write` | no new occurrences |
| `server/services/audit` + the tenant-export attestation + the Part 11 chain-honesty route suite | **34 files / 410 tests passed** |

## The last finding from the 2026-10-08 review — confirmed already closed

**HS-1008-8** (row D5) — `generatedAt` stamped at each render, so re-rendering a
stored run yields a different content hash.

I first wrote here that confirming it needed a database this container does not
have. That was wrong: it is a static read of the two `renderReport` call sites,
and I did it. **Both halves were already closed**, on 2026-10-01, in
`824500920` — a week *before* the review that reported it. See
`../../D5-REPORT-SEAL-TIMESTAMP/2026-10-12/` for the readings.
