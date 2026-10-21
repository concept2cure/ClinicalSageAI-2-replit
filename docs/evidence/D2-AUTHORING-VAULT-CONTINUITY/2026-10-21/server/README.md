# Existing authoring / Vault server continuity

Canonical scope: `concept2cure-v2`, local/Codespaces. Root reported current base
`bd24ecb4c` after disjoint incoming AnA work. No Git, compiler, build, provider,
migration or deployment action was performed by this worker.

The existing authoring filer now captures and locks one fixed header projection
at both reads. It compares the actual timestamp values and all captured identity,
rendering, provenance, template and governed binding fields before recording the
export. The saved-section check remains. The existing canonical Vault INSERT
mints its candidate UUID at appended bind `$31`; only the returned matching UUID
proves creation. Reused admissions refuse reconciliation before placement,
recording or approval, and unverified receipts never authorize compensation.

A confirmed reversal requires the actual tenant/project/row match and committed
chained audit. Missing rows, changed scope, failed audit and unacknowledged
cleanup return `OUTCOME_UNKNOWN`. Lost recording COMMIT or ROLLBACK
acknowledgements retain the admitted row. The ingest protects bytes before
attempting COMMIT and retains them for an uncertain rollback. An empty-pre-read
UPSERT that returns another admission's row now discards its unheld fresh upload
through the existing reference-protecting discard helper.

The argument/result/filing types were mechanically moved to
`vault-ingest-types.ts` and re-exported by the same canonical service to stay
within the existing file limit. Callers retain the same import path. The only
other fixture correction adds the already-shipped `organizations.settings`
prerequisite to the existing approval-carry fixture; no production DDL changed.

## Verification

- Initial RED: **24 failed, 45 passed, 2 existing TODOs**. Production hashes were
  captured before edits and checked again before implementation.
- First correction GREEN: **69 passed, 2 TODOs**.
- Additional RED: **3 failed, 57 passed** for raced-upload cleanup and recording
  COMMIT/ROLLBACK acknowledgement loss; production hashes again retained.
- Canonical ingest acknowledgement RED: **2 failed, 11 passed, 2 TODOs** over
  actual PGlite SQL followed by a deliberately lost acknowledgement.
- Expanded regression initially exposed **10 failing approval-carry cases**:
  `organizations.settings` was absent from that fixture. This failure is retained.
- Final expanded regression: **136 passed, 11 files, 1 retained TODO**, exit 0.
  It covers existing route filing, byte-bound approval, founder lineage, signing
  order, Vault conflict/type/lineage refusal and the new snapshot/admission cases.
- Final strict lint: **0 errors / 0 warnings** for the six other changed files.
  Canonical ingest: **0 errors / 2 inherited warnings** (large existing function;
  complexity 84). The all-file strict-zero diagnostic exits 1 and is retained;
  ordinary scoped ingest lint exits 0. No warning baseline was changed. Root
  owns comparison against canonical.

Root removed only the stale first parity TODO after independently qualifying the
existing mounted File to vault → Open in Vault → placement chain. The remaining
historical re-filing/supersession TODO and missing Vault governance lineage
assertion remain explicit. No historical version number or lineage was guessed.

`*.receipt.json` records actual argv, exits, reported Vitest timing, source-pin
scope and raw/gzip SHA-256. Final lint receipts include directly captured start
and finish timestamps and verified source hashes before and after execution.
`freeze.json` and `final-source.sha256` pin all seven final source files. The
compressed logs are the raw outputs; their uncompressed hashes are recorded in
`log-inventory.json`. Intermediate diagnostics that lacked complete source/time
snapshots are labelled as such rather than reconstructed. The initial missing
binary attempt (exit 127) is also retained.

The fixture seams are explicit: storage/PDF/OCR boundaries are controlled;
PGlite executes real SQL/transactions, but the pre-read miss and lost replies
are statement-timing seams, not native multi-connection race qualification.
The broader third-party use race between admission and recording is outside
this increment. No live provider behavior, agency delivery or human acceptance
is claimed.
