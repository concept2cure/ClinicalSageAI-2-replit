# CSR narrative reference consistency — F1 repair

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `e3b05b8c0c2d0bc4ea17fb7e4ca75f4f8830400c`  
Launch workstream: D2/W1, existing CSR-to-Authoring/export verification.

## What already exists

- `server/services/csr/csr-narrative-landed.ts`: reads section 14.3.3 in
  bounded slices; checks its saved SHA-256; matches stored patient narratives
  page by page; builds the existing source reference used by Authoring.
- `server/services/csr/csr-narrative-store.ts`: tenant/job-scoped paging and
  persistence. The previous write-ownership repair is retained unchanged.
- `server/services/csr/narrative-section.ts`: the canonical block formatter.
- `shared/canonical-json.ts` and `shared/csr-narrative-reference.ts`: canonical
  source digests and the existing reference schema; reused unchanged.
- `server/services/authoring/csr-narrative-reference-import.ts`: turns a
  verified reference into the one editor's source origin; rejects mismatch.
- `server/services/csr/csr-assembly-narratives.ts`: the existing PDF leaf
  renderer consumes the same walker and refuses a leaf with findings.
- `server/services/csr/__tests__/csr-narrative-reference.pglite.test.ts`:
  existing reference/import/assembly tests, including 1,500 narratives.

## Confirmed defect

The reader verified the section's content hash at the first read, but later
slices were selected only by tenant/job/section. A replacement revision could
supply those slices to a receipt holding the original revision's hash.

The final check reread only the per-subject store digest. A change to the
landed opening or section row alone did not change that digest. Consequently,
an opening edit, appended text or deleted section after the last narrative
page could still produce a `verified` reference to obsolete section content.
The zero-subject case also skipped any page checks.

The shared walker verified individual narratives and byte-for-byte block
matches, but did not recompute the full streamed section hash. A mixed stream
could therefore match current rows without matching the initially admitted
section SHA-256.

## Repair in the existing reader

1. Pin every text slice to the originally verified `content_hash`. A later
   revision returns no matching slice, using the existing mismatch path rather
   than an extra exception that could interrupt renderer cleanup.
2. Recompute the section SHA-256 incrementally: original opening, then each
   matched narrative block. A mismatch becomes a blocking finding for both
   the reference reader and existing PDF renderer.
3. After the store-digest recheck, reread the section's database-verified
   hash, length and opening. Missing, changed or corrupted source cannot get
   a verified receipt, including an opening-only, zero-narrative section.

No whole-section text is selected, copied or accumulated by the repair. The
walk retains its existing 50-row page limit. There is one additional bounded
metadata read/database hash verification at the end, not a whole-section
hash query for every page. No production service, route, table, queue,
dependency, UI or source-reference schema was added.

This is coherent-source verification on the caller's connection/snapshot,
not a new transaction or lock. A reference is not permission to ignore later
source changes; existing import fingerprinting, final governance and assembly
placement still apply. Clinical correctness, human review and model PQ remain
separate. An already opened PDF writer may have received blocks before a
finding; the existing renderer closes and removes an invalid leaf instead of
filing it.

## Exact changes

- `server/services/csr/csr-narrative-landed.ts` (only production file).
- `server/services/csr/__tests__/csr-narrative-reference-consistency.test.ts`.
- `server/services/csr/__tests__/csr-narrative-reference-consistency.pglite.test.ts`.
- This evidence directory.

## Executed before/after regression evidence

Node 22.16.0 / TypeScript 5.8.3. The committed offline adapter transpiles and
executes the exact TypeScript suite with `node:test`. The actual reader,
walker, block formatter, reference schema and canonical serializer execute;
only the suite's declared SQL/store boundaries are deterministic substitutes.
The baseline reader and unchanged collaborator files were copied through the
GitHub connector and verified against their Git blob hashes.

| Same suite | Tests | Pass | Fail | Skip |
|---|---:|---:|---:|---:|
| Original baseline | 17 | 7 | 10 | 0 |
| Patched source | 17 | 17 | 0 | 0 |

`execution.json` records each case and captured-output hashes.
`transpile.json` records the exact changed TypeScript blob hashes and zero
syntax/transpilation diagnostics. That is not a repository type-check.

Cases include unchanged and multi-page reads, tenant-scoped absence,
zero-subject output, initial and final corruption, individual narrative
hashes, store changes, replacement revisions, changed openings, appended
text, deleted sections and mismatched reconstructed section hashes.

Reproduce with Node 22 and the existing TypeScript dev dependency:

```sh
node --test docs/evidence/D2-CSR/2026-11-03-narrative-reference-consistency/offline-runner.cjs
CSR_REFERENCE_BASELINE=1 node --test docs/evidence/D2-CSR/2026-11-03-narrative-reference-consistency/offline-runner.cjs
```

The second command intentionally fails ten regression cases. A shallow clone
needs the baseline commit. The local run used `CSR_REFERENCE_BASELINE_FILE`
to identify the connector-retrieved baseline; the adapter validates its Git
blob identity before use. It never changes application behavior.

## Still required — not passed here

Native Vitest, six PGlite SQL cases, the existing import/assembly/PDF suites,
full TypeScript/build/pre-push checks, security/browser CI and live Neon/model
and CSR export acceptance remain open. The local environment had Node and
TypeScript but not the repository's installed test dependencies; GitHub DNS
failed and the npm cache held no Vitest/PGlite packages. No credential,
customer data, Neon setting or deployment was changed.

```sh
npx vitest run \
  server/services/csr/__tests__/csr-narrative-reference-consistency.test.ts \
  server/services/csr/__tests__/csr-narrative-reference-consistency.pglite.test.ts \
  server/services/csr/__tests__/csr-narrative-reference.pglite.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

The SQL suite uses the reader's actual SQL and a minimal synthetic schema; it
is not a full migration or production-RLS test. Native acceptance should also
race edits through separate authorized connections under the application's
actual isolation level, confirm changed sources block import/placement, and
open the resulting editor document and exported PDF. Queued CI is not a pass.

Rollback: revert the single repair commit through ordinary change control.
No migration or data backfill exists. Reversion restores the known stale
reference problem and does not qualify the earlier behavior.
