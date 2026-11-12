# Batch release crashed inside a hash, so it had never completed

**Package:** F1 (repairs: defects in shipped behaviour; no new screen, mount or table).
**Date:** 2026-11-09. **Completes:** `server/services/cmc/batch-release-evidence.ts`.
**Found:** rehearsing a client demo against `npm run dev` — pressing the act, not reading the code.

## The defect

`POST /api/cmc/batch-records/:id/release` answered **500** on every batch whose results were reviewed — the only
path that reaches a signature:

```
ReferenceError: require is not defined
    at sha256Hex (shared/canonical-json.ts:90)
    at stableHash (shared/canonical-json.ts:99)
    at evidenceFingerprint (server/services/cmc/batch-release-evidence.ts:174)
    at evaluateBatchForRelease (server/api/cmc/batchRecordRoutes.ts:426)
```

`shared/canonical-json.ts` reached `node:crypto` through a **dynamic `require`**, deliberately, so that a module
five client files import for `stableStringify` would not pull crypto into the browser bundle. `require` does not
exist in an ESM runtime, so the function could not run on the **server** either. Not a bundling edge case: it
failed in `npm run dev`.

**So batch release — a governed §11.50 act — has never completed in this runtime.**

## It was already known, and stepped around

`server/services/ana/skills/library/index.ts` hashes with `node:crypto` by hand and says why: *"rather than
shared/canonical-json's sha256Hex, which reaches crypto through `require` and so cannot run in the ESM production
bundle."* That lane avoided the trap and left it set.

## Why nobody had seen it

The Batch records tab was posting to `/api/cmc/batch-records/NaN/release`
(`docs/evidence/F1/2026-11-09-batch-row-identity/`) and getting a *different* 500. Two defects on one screen, each
hiding the other: the broken id meant nobody ever reached the broken hash.

## The change

| Where | What |
|---|---|
| `services/cmc/batch-release-evidence.ts` | imports `stableStringify` only and hashes with `node:crypto`, as the skills library already does |
| `shared/canonical-json.ts` | `sha256Hex` and `stableHash` **throw a named error** instead of a bare `ReferenceError`, naming what to do instead. A function that cannot run anywhere is worse than no function: its callers type-check and fail when used. `stableStringify` — the part both runtimes need — is untouched |

> **Superseded the same day** by `docs/evidence/F1/2026-11-09-canonical-json-hash-removed/`.
> Two things were wrong with that row. It pushed a red — this module's own suite exercises
> `stableHash` in two cases and I did not run it. And the argument in it ("its callers
> type-check and fail when used") argues past the fix: a *throwing* function still
> type-checks for a future caller, which fails in production. Both exports are now deleted,
> so such a caller is refused at compile time, and a tripwire refuses a hash put back here.

| `services/vault/document-catalog-governance.service.ts` | the **other** live caller, found by the contract case below and fixed the same way |

## A unit test could not have caught this, and did not

The value cases below **pass without the fix**: vitest's runtime provides `require`, so the dynamic require
resolves under test and fails only in the server's own ESM runtime. A unit test is the wrong instrument here, which
is exactly why this shipped. The evidence for the defect is therefore a measured 500 from the running server
(`01-live-500.txt`), not a red test — stated plainly rather than dressed up.

What *can* be held is the rule: **no server module takes its hash from `shared/canonical-json`.** That contract
case went red immediately and named the Vault catalog service
(`03-mutation-the-contract-finds-the-next-caller.txt`) — a second governed act that would have crashed the moment
it was used, found by the case rather than by a person reaching it.

## I edited another lane's file, and why

`services/vault/document-catalog-governance.service.ts` is the Vault lane's. Leaving it would have meant either a
red test on trunk or a known crash-on-use in a governed Vault act an hour before a client demo. The change is the
same four lines as the CMC one, adds no behaviour, and is reported in
`.design/claude-convergence/COORDINATION.md`. If that lane prefers a different shape, this is the smallest thing
to revert.

## What the fix turns the act into

| Request | Before | After |
|---|---|---|
| release, results reviewed, `meaning: responsibility` | **500** `require is not defined` | **400** `SIGNATURE_MEANING_CONFLICT` — *"A disposition that leaves the batch 'released' is signed with the meaning 'release', not 'responsibility'. Nothing was signed."* |
| the same, `meaning: release` | **500** | **200**, with a governed action id and a sha256 ledger chain |

The second row is the first governed batch release this runtime has completed.

## Gates

`tsc --noEmit` 0 errors. 7 cases: five on the fingerprint as a value (stable across key order, changes on a changed
result, a changed review flag, a changed criterion, a different count, and an answer for no results at all) and two
on the contract.
