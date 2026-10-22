# Capture extraction evidence — frozen persistence proof

## What already exists

`server/services/clinical-regulatory-evidence/data-room-processing.ts` already
extracts captures, pins original bytes, reuses byte/revision-bound cached text
and writes derived processing results into existing provenance JSON. Its SQL
already distinguishes new text from a failed reread that retains old text and
coverage. It does not yet persist the approved extraction evidence receipt or
clear an old receipt when replacement text carries none.

The state/store/sweep modules already admit scoped current captures and fence
writes with durable processing authorization. The existing recovery PGlite
fixture bootstraps those actual schema/guard rules. This suite extends that
fixture and actual processor; it does not replace either implementation.

## Frozen baseline

Contract: `d2920b45d`, parent `CONTRACT.md`. Production baseline:
`e79626c0849f0f8c2338b32f85d4bc69bccef8f5`.

Node 22.23.3, canonical `vitest.config.ts`, one worker, no parallel files,
4 GiB heap. `baseline-command.json` retains exact argv, environment overrides,
times, result and before/after source/test hashes. All bound inputs were
unchanged during execution. `baseline-red.txt` is unmodified combined output.

Result: **5 expected failures, 9 passing controls, 14 total; exit 1**.
The failures are missing fresh/cached persisted receipts, stale receipt
replacement, legacy-success stale clearing and failed/no-retained-text clearing.
Passing controls cover retained text retaining its receipt, legacy absence,
empty initial extraction, genuine authorization, tenant/current/workspace
admission, supersession during extraction and same-identity idempotency.

Retention/clearing cases prime a historical receipt independently in PGlite so
their assertions remain meaningful before the baseline ever writes a receipt.
Original source bytes deliberately differ from extracted Japanese/astral text,
proving the two SHA-256 identities are distinct. Source page labels are 3 and 7.
No imported future helper or missing-module failure is used.

The first equivalent baseline run is retained as `initial-baseline-*`. A
literal-type annotation was then added to the test's revision constant before
the final frozen run; both runs produced exactly 5 expected failures/9 controls.
Scoped ESLint with `--max-warnings=0` passed. `frozen-sha256.json` binds bytes.

Only extractor/original-loader/classification/profile I/O is mocked. Processing,
claims and SQL execute under embedded PGlite; no external database, actual OCR,
model, provider or government endpoint is called. No production, compiler or Git
mutation was performed by this test owner.
