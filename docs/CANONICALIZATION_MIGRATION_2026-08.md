# Canonicalization migration — how to re-point 15 call sites without breaking a signature

**Owns: the mechanism and the per-site disposition for ledger L46 and L55.** The ledger says
what is open; this says how to close it. Measured on `concept2cure-v2`, 2026-08-14.

---

## The problem in one paragraph

Fifteen modules canonicalize JSON for hashing, each with its own copy of the function.
`shared/canonical-json.ts` is now the single correct one and `ci:canonicalizers` refuses a
sixteenth, but the fifteen existing call sites are still on their own copies. The obvious
next step — point them all at the shared module — is the one thing that cannot be done
directly: **a digest is only comparable to another digest produced by the same serializer.**
Re-pointing a site that verifies stored content against a stored hash invalidates every
record it has ever written. For a §11.10(e) signed export, "re-derive the hashes" is not
available: the signature is the artifact, and re-signing it retroactively is precisely the
thing a tamper-evident record exists to make impossible.

That is why this cannot be one migration. It is three, and which one a site needs is
decided by a single question.

## The question that classifies every site

> **Does anything recompute this digest from stored content and compare it to a stored
> digest?**

- **No, the digest is written and never recomputed** → re-point today. Nothing compares
  across the boundary, so old rows keep old hashes and new rows get new ones, and no
  verification exists to break.
- **No, but the digest is a key** (cache, dedup, seed) → re-point today. A changed key is a
  cache miss or a fresh derivation, which is self-healing.
- **Yes** → re-pointing breaks history. Version it (below) before touching the serializer.

## The mechanism for the sites that need one

Do **not** re-derive stored hashes, and do not re-sign anything. Record which serializer
sealed each digest, and verify with that one.

```ts
// Write path — stamp the version alongside the digest.
const canonVersion = 2;                        // 1 = the module's own legacy copy
const hash = stableHash(payload);              // shared/canonical-json.ts

// Verify path — verify with the serializer that sealed it.
const expected = record.canonVersion === 1
  ? legacyCanonicalize(record.body)            // the old copy, kept, frozen, deprecated
  : stableHash(record.body);
```

Three properties make this the right shape here:

1. **Nothing historical changes.** Records sealed under v1 verify under v1, for as long as
   they are retained. No re-derivation, no re-signing, no verification gap — which is the
   only answer that survives a Part 11 conversation.
2. **The legacy copy becomes inert rather than live.** It stays on disk to verify old
   records and is never called on a write path. `ci:canonicalizers` keeps counting it, which
   is correct: it is still a second serializer, and the baseline should not pretend otherwise
   until the last v1 record ages out.
3. **It is small.** One integer column per table and one branch per verify path. The cost is
   in deciding, not in typing — which is the pattern this codebase keeps rediscovering.

Where a manifest already carries a `hashAlgorithm` field (the audit export does), the
version belongs beside it rather than in a new column. **No table currently carries such a
tag**, which is the actual gap: the platform records *which hash function* it used and never
*which serializer fed it*, and the serializer is the half that was written fifteen times.

---

## Per-site disposition

### Class A — DONE (6 sites, baseline 15 → 9)

The digest is written and never recomputed, or it is a key whose change is self-healing.
All six are now on `shared/canonical-json.ts`; `ci:canonicalizers` reads 9.

| Site | Why it is free |
|---|---|
| `stats/compute-cache.ts` | In-memory LRU key. A changed key is one cache miss. |
| `ana/agentic-loop.ts` (`callKey`) | In-process tool-call dedup. Never persisted, never crosses a request. |
| `routes/chat/provenance.ts` | Writes `snapshot_hash_sha256` on INSERT only; nothing selects it back to compare. **Do this one first** — it is the copy that maps `null` to the empty string and emits output that is not valid JSON. |
| `evidence-sufficiency.service.ts` | Digest is computed per call and returned, not stored against. |
| `intelligence-engine/reviewer-simulator.service.ts` | Same. |
| `audit/audit-archive.service.ts` | Compares a locally-computed checksum to what the S3 sink echoes back, within one call. Both sides move together. |

### Class B — version first, then re-point (6 sites)

Each recomputes from stored content and compares to a stored digest. Each needs the version
tag before the serializer changes.

| Site | What breaks without a version tag |
|---|---|
| `resolution/receipt-store.ts` | `sha256Hex(canonicalJson(row.receipt_body)) === row.receipt_hash` — every existing receipt fails integrity check. |
| `report-os/sealing/seal.ts` | `verifySeal` recomputes the content hash; every sealed report reads as modified. |
| `part11/signature-persistence.ts` | Normalizes the signature payload. Persisted §11 signatures stop matching. |
| `tenant-export/attestation-report.service.ts` | Verifies chain links across stored rows. |
| `ivdrPackManifest.ts` + `workers/ivdr-pack-worker.ts` | The byte-identical pair. Re-point **together, in one commit** — they hash the same manifest from the service and the worker, so a split migration makes them disagree, which is the exact failure this whole row is about. |

### Class C — fix the defect first, then treat as Class B (3 sites)

Re-pointing these also *changes what they mean*, because the current output is wrong.
Sequencing matters: fix, ship, then version, then re-point — so the correctness fix is not
tangled with the migration in one diff.

| Site | The defect |
|---|---|
| `audit/signedAuditExport.ts` (**L55**) | `JSON.stringify(manifest, Object.keys(manifest).sort())` — the second argument is a key allow-list applied at every depth, not a sort. `queryFilters`, `chainIntegrity` and `compliance` all sign as `{}`. Two exports with different date ranges, one with a valid chain and one broken at row 4, produce byte-identical signed manifests. |
| `part11ComplianceService.ts` | `canonicalize` sorts only the top level; nested objects keep insertion order, so one signature payload canonicalizes two ways. |
| `stats/rng.ts` (`seedFromObject`) | Not wrong, but load-bearing for a reproducibility claim: it derives a simulation seed. Callers already accept an explicit seed and fall back to derivation only when none is given — so the durable fix is that any run whose result is retained **carries its explicit seed**, after which the derivation is Class A. |

---

## Suggested order

1. ~~**Class A, one commit.**~~ **Done.** Six sites, no decisions, and `provenance.ts` — the
   copy producing invalid JSON — is on the correct serializer. Baseline 15 → 9.
2. ~~**L55, on its own.**~~ **Done.** `manifestVersion` sits beside `hashAlgorithm`; new
   exports are version 2 and signed over the whole manifest, pre-fix exports resolve to
   version 1 and still verify against the original expression. **This is the version-tag
   mechanism in miniature — copy its shape for step 3.**
3. ~~**The version-tag mechanism, once.**~~ **Done.** `shared/versioned-digest.ts` —
   `sealCanonical` for the write path, `canonicalAsSealed` / `verifyAsSealed` for the verify
   path, and `readCanonVersion` making the "absent means version 1" decision in one place so
   it cannot be made differently at six call sites. The legacy serializer is a required
   argument rather than optional: a site with stored digests always has one, and a site
   without does not need this module at all — it should call `stableStringify` directly.
4. **Class B, site by site, IVDR pair together.** Each is now mechanical.
5. **`part11ComplianceService` and the seed question last** — both need a product answer
   (which signatures are in scope; which simulations must reproduce) more than they need code.

**What ends this work:** `ci:canonicalizers` at 1 — the shared module — plus however many
frozen legacy copies are still needed to verify unexpired records, each named `-legacy` and
each unreachable from a write path. That is the honest end state, and it is worth writing
down now: the count does not go to zero while retained records sealed under v1 exist, and a
gate that demanded zero would be asking for the records to be broken.

## What not to do

- **Do not re-derive stored hashes.** For anything signed it defeats the purpose, and for
  anything audited it is indistinguishable from tampering.
- **Do not re-point a Class B site "carefully" without the version tag.** There is no
  careful version of it; the digest either reproduces or it does not.
- **Do not split the IVDR pair.** They agree today only because they are byte-identical.
- **Do not delete a legacy copy while records it sealed are still retained.** Freeze it,
  name it, and leave it in the baseline where the gate can see it.
