# The throwing hash was a red I pushed, and a trap I left set — both removed

**Row:** D1 (every gate green on trunk) · **Package:** F1 · **Date:** 2026-11-09

This corrects my own change of a few hours earlier, in `90d65c4ee`
(`docs/evidence/F1/2026-11-09-batch-release-fingerprint/`). Two things were wrong with it.

## What already exists

| Path | What it does today |
|---|---|
| `shared/canonical-json.ts` | `stableStringify`, the one deterministic JSON serializer. **84 importers**, every one of them taking `stableStringify` alone (`grep -rn canonical-json` + `import`) |
| `shared/__tests__/canonical-json.test.ts` | 14 golden vectors pinning that serializer's output, plus the key-order property the stored digests depend on |
| `server/services/cmc/__tests__/batch-release-fingerprint.test.ts` | The source-level contract that no server module hashes through this one. 7 cases, green |
| `scripts/ci/check-canonicalizers.mjs` | Holds the count of competing serializers at its baseline. Counts serializers, not hashes — unaffected by this change |

## The two defects in my own change

**1. I pushed a red.** `90d65c4ee` made `sha256Hex` and `stableHash` throw a named error. This
module's own suite exercises `stableHash` in two cases, and I never ran it — I ran the CMC and
Vault suites after the change, not `shared/`'s. `01-the-red-i-pushed.txt` is those two failures
on trunk.

**2. A function that throws is still a trap.** The reasoning in `90d65c4ee` was that "a function
that cannot run anywhere is worse than no function: its callers type-check and fail when used."
That argument is right and it argues past the fix I made. A *throwing* function still type-checks
for a **future** caller, which then fails in production at the moment it is used — exactly the
failure mode that cost a §11.50 signature path on the batch release route. A **deleted** function
refuses that caller at compile time instead.

There were zero callers left to protect: every one of the 84 importers takes `stableStringify`.

## The change

| Path | Change |
|---|---|
| `shared/canonical-json.ts` | `sha256Hex` and `stableHash` **deleted**. A dated header note records what went, why the throwing version was not enough, and names the three server call sites that now hash in two lines of their own — `batch-release-evidence.ts`, `ana/skills/library/index.ts`, `vault/document-catalog-governance.service.ts` |
| `shared/__tests__/canonical-json.test.ts` | The two `stableHash` cases rewritten. The key-order property is still pinned **at the digest level**, by a local `hash()` that writes out the sanctioned pattern — `createHash('sha256').update(stableStringify(value),'utf8')` — so the file demonstrates it rather than describing it. A content-sensitivity case was added. And a **tripwire**: `Object.keys(module)` must equal `['stableStringify']`, so a hash put back here under the same constraint, which would break the same way, is refused |

Deleting an export, per the working agreement: there is no single replacement path to name, because
hashing is two lines in each server module. The three that do it are named above and in the module
header. `stableStringify`, which is what makes those three digests comparable to each other, is
untouched.

## Verified by making it fail

`03-the-tripwire-refuses-a-reintroduced-hash.txt`: a `stableHash` appended to the module — with the
same `require('crypto')` that caused the original 500 — and the tripwire refusing it,
`expected [ 'stableHash', 'stableStringify' ] to deeply equal [ 'stableStringify' ]`. Then restored.

## Green

- `shared/__tests__/canonical-json.test.ts` — 21 passed (was 18 passed, 2 failed)
- `server/services/cmc/__tests__/batch-release-fingerprint.test.ts` — 7 passed
- `eslint` on both touched files — clean
