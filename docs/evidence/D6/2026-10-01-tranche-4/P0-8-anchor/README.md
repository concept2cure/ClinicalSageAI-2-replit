# P0-8 (anchor half): nothing outside the database recorded the audit chain's head (DP-04, High)

**Row:** D6 (D5 for the audit trail). **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-04, "no chain head
is anchored outside the database, so truncating the newest rows is undetectable". The archive door closed in
`054c1764`, the sweep in `e8724680`, the runtime grant in the P0-8 grant half (`../P0-8-grants/`). This is the last
open part of P0-8.
**Verified at:** HEAD `0e58e794` (2026-10-01 06:37 UTC). The defect was still present (red below). The earlier,
interrupted attempt at this item left nothing in the tree: no diff on any named file, no untracked file, and no
evidence folder. This folder is the whole record.

## What was wrong

The chain walk (`walkAuditChain`, `server/services/audit/chain.ts`) proves that every `audit_logs` row derives from
the row before it. It cannot see the newest rows removed: what remains is still a valid chain that ends earlier.
Nothing outside the database recorded where each organisation's chain ended. Anyone past the immutability triggers
could therefore delete the newest rows, or rewrite the tail and re-chain it with the published recipe, without
detection. Examples: a restore without triggers, a logical-replica apply, `session_replication_role = replica`, or
`DISABLE TRIGGER`.

Shown at HEAD on PostgreSQL 16.13 (`red/dbtest-chain-anchor.txt`, case 1, which passes there): four rows are
written through the canonical writer. The two newest are deleted with the triggers out of the way. Then
`verifyAuditChain(…, { tenantId: 7 })` returns **`ok: true, rowsChecked: 2`**. In the sweep at HEAD, a truncated
chain gives **`ok: true`** (`red/unit-sweep-and-anchor-store.txt`: "expected true to be false"). There is no anchor
store, no anchor verdict and no anchor write. The Terraform gave the task role nothing usable in the evidence bucket.
Its grant was the bucket ARN, so object actions matched no object, while `s3:ListBucket` listed every key, including
CloudTrail's. No container named an anchor bucket (`red/terraform-stack-test.txt`).

## What is true now

- **The anchor** (`server/services/audit/chain-anchor.ts`, new, 376 lines) writes every organisation's chain head
  as one JSON object. Per organisation it records the id, the head row's id, `chain_seq`, `sha256_chain`, the
  number of chained rows at or before the head, and the head's time. The object also records the time of the
  anchor. The heads and counts come from one statement, so they share one snapshot. The format is
  `c2c.audit-chain-anchor/1`. The key is dated and sorts in time order:
  `anchors/audit-chain/YYYY/MM/DD/<iso>-<rand>.json`. The object goes to the object-locked compliance evidence
  bucket, which has COMPLIANCE retention for 2,555 days in production. Nobody can change or delete an anchor in
  that period, the application included.
- **The verifier** compares the database against the **latest** anchor and returns one of four verdicts:
  - `head_missing`: the anchored head row is gone. This is truncation of the head.
  - `head_differs`: the row is there, but its hash, chain position or tenant has changed.
  - `rows_missing`: there are fewer chained rows at or before the head than were anchored.
  - `rows_added`: there are more. A row has been back-dated into the anchored span.

  Any of these makes the result **broken**. When no anchor exists, the result is `not_anchored`, which the sweep
  reports as "not verified". It is never ok. An anchor that records no head is `unverifiable`.
- **Archive deletions are told apart from tampering.** The only DELETE path is `audit_logs_archive_delete()`, and
  its ledger `audit_log_archives` spans organisations, so a shortfall it accounts for cannot be attributed per
  organisation. Such a shortfall is reported as `archived` and gives `unverifiable`, neither ok nor tampering. The
  rule is narrow: rows missing before an intact head, or a head older than the batch's cutoff, and only up to the
  rows the ledger recorded. A missing recent head is never put down to the archive, because of the 24-month floor
  (case 7; mutant B). **Corrected in the fix round:** as first written, the verifier did not enforce that floor;
  only the door did, and one forged ledger row defeated it. See "Fix round", DP-68.
- **A tenant-scoped connection is refused.** `connectionIsTenantScoped`, now exported from `chain.ts` rather than
  copied, refuses a scoped connection for both writing and verifying. Such a connection would see only a subset of
  the chain and call it the chain. The sweep runs under `runWithSystemTenantScope` (`app_super_admin`), so in
  production it sees every tenant.
- **The daily sweep** (`server/jobs/auditChainIntegritySweep.ts`; there is no second scheduler) adds the store
  `audit_logs.anchor`. It verifies against the latest anchor first, then checks every other store. It writes the
  next anchor **only when the run found no incident**. If any store is broken, missing or in error, nothing is
  written, and the last good anchor stays the reference. A tampered state is therefore never anchored (mutant C).
  If `AUDIT_ANCHOR_BUCKET` is unset, the store reads `unverifiable` with the reason "anchor not configured …", in
  production and everywhere else, and is never `ok` (mutant D). A broken anchor raises the existing alert path: the
  error log, `process.emitWarning` and the `[SECURITY]` webhook. The alert carries organisation and row ids and
  counts, never content. A failed anchor write is logged as an error and reported in `result.anchorWrite`; it is not
  swallowed. On demand, `runAuditChainIntegrityCheck()` runs the same verify-then-anchor sequence, and
  `writeAuditChainAnchor` and `verifyAuditChainAnchor` are exported.
- **One S3 client.** `server/services/storage/s3-client.ts` (new, 47 lines) builds the client and provides the
  paginated listing and the object read. The vault provider (`s3-provider.ts`) now uses them; its own constructor,
  `listKeys` and `readJson` were moved there, so there is no parallel copy. The anchor store uses the same
  functions. A put sets `ChecksumAlgorithm: 'SHA256'`, because object lock requires an integrity checksum. It sends
  no per-request encryption header, so the bucket's own KMS key applies.
- **Terraform.**
  - `terraform/modules/compliance-evidence` takes `anchor_writer_role_arn`. When it is set, the bucket policy lets
    that role put and get `anchors/*` and list the bucket with `s3:prefix` `anchors/*`.
  - An explicit **Deny** stops the role from deleting, unlocking, re-policing or re-lifecycling any evidence:
    `DeleteObject`, `DeleteObjectVersion`, `PutObjectRetention`, `PutObjectLegalHold`, `BypassGovernanceRetention`,
    `PutBucketObjectLockConfiguration`, `Put`/`DeleteBucketPolicy` and `PutLifecycleConfiguration`.
  - The key policy lets the role call `GenerateDataKey` and `Decrypt` on the evidence key, through S3 only.
  - The module gains two outputs: `anchor_prefix` and `object_lock`. The `evidence_bucket` output now reads the
    configured `bucket`, which is the same value as `id` once the bucket exists and is known at plan.
  - `terraform/stack/main.tf` passes the task role and sets `AUDIT_ANCHOR_BUCKET` in both containers' environment,
    because both run the sweep. It also narrows the task role's own S3 grant on the evidence bucket from the whole
    bucket to `anchors/*`.

## Red / green

| Check | Red (unfixed code) | Green (this change) |
|---|---|---|
| Truncate the newest rows, then walk (`chain-anchor.dbtest.ts` 1) | walk `ok: true, rowsChecked: 2`: the defect | same, by design: the walk cannot see it; the anchor does |
| Anchor, then verify an intact chain with rows appended (2) | module absent: fail | `ok`, 2 organisations, anchor JSON matches the DB head |
| Anchor, then delete the head and the row before it (3) | fail | **`broken`**: `head_missing`, 4 anchored, 2 now; plain DELETE refused by the trigger first |
| Rewrite the head and re-chain it so the walk passes (4) | fail | walk `ok`; anchor **`broken`**: `head_differs` |
| Delete a row before an intact head (5) | fail | **`broken`**: `rows_missing`, 4 anchored, 3 now |
| No anchor written (6) | fail | `not_anchored`: "no anchor has been written", never ok |
| Archive door removes 2 old rows, then the head is truncated (7) | fail | `unverifiable` (`archived`, not tampering); after truncation **`broken`** |
| Tenant-scoped connection (8) | fail | refuses to anchor or verify; nothing written |
| Sweep: unconfigured in production | `ok: true`, no anchor store | `audit_logs.anchor` `unverifiable`, "anchor not configured … AUDIT_ANCHOR_BUCKET"; nothing written |
| Sweep: verify first, then write to `s3://c2c-prod-part11-evidence/anchors/audit-chain/` | fail | verify before write (call order); written |
| Sweep: anchor broken | `ok: true` | incident, `[SECURITY]` alert, firstFailure = row id, **no new anchor** |
| Sweep: another store broken, the anchor unreadable, the write failing | fail | no anchor written over an incident; read error = incident; write failure reported |
| S3 store: dated key, checksum, no SSE override; latest across 2,500 keys / 3 pages; a refused listing throws; 10 malformed anchors refused | module absent | 18 cases pass |
| Terraform `the_audit_chain_head_is_anchored_in_the_object_locked_evidence_bucket` | **fail**: no env var, no outputs, no grants, no Deny, whole-bucket identity grant, no key statement | **pass**; stack 26/26 (32/32 with P0-11's concurrent edits); module suite 4/4; preflight proof holds |

Files: `red/dbtest-chain-anchor.txt`, `red/unit-sweep-and-anchor-store.txt`, `red/terraform-stack-test.txt` (all
three use the **final** test files against a reconstruction of the unfixed code: the HEAD sweep swapped in and
`chain-anchor.ts` moved aside, or for Terraform the HEAD `main.tf` and module in a scratch copy; then restored).
Green: `green/dbtest-chain-anchor.txt` (8 plus the 4 existing `chain-concurrency` cases),
`green/unit-sweep-anchor-storage.txt` (83), `green/terraform-stack-test.txt`,
`green/terraform-stack-test.combined-tree.txt`, `green/terraform-evidence-module-test.txt`,
`green/terraform-preflight-proof.txt` (the rendered task definition carries
`AUDIT_ANCHOR_BUCKET=c2c-prod-part11-evidence`), `green/terraform-preflight-proof.combined-tree.txt`.

### Each check made to fail (mutants of this change, `red/mutant-*.txt`)

| Mutant | Caught by |
|---|---|
| A: a missing head is not a break | dbtest 3 and 7 |
| B: the archive excuses any missing head, without limit | dbtest 7 |
| C: the anchor is written over an incident | sweep: truncated-chain, unreadable-anchor and other-store-incident cases |
| D: an unconfigured anchor reads `ok` | sweep: "not configured" case |

## Gates and neighbours

`green/gates.txt` lists the gates run, and every one exits 0: `ci:tenant-isolation:no-regression` (8 = baseline),
`ci:discarded-audit-write`, `ci:dead-audit-catch`, `ci:server-error-leaks`, `ci:runtime-ddl`,
`ci:json-operator-types`, `ci:session-scoped-rls-bypass`, `ci:fixture-fallback`, `ci:no-mock-in-prod-routes`,
`ci:fabricated-identity`, `ci:unreferenced-modules`, `check:security-patterns` and `ci:untracked-imports`.
`ci:untracked-imports` checks the push range only. `s3-client.ts` and `chain-anchor.ts` must be committed with the
files that import them.

ESLint on the item's files (`green/eslint.txt`) gives 0 errors and 1 warning. The warning is the pre-existing
`describe` in the sweep test: 175 lines at HEAD and 153 now. Its setup moved into `setUpSweep()`, and the anchor
cases are their own `describe`.

`green/neighbour-unit-suites.txt` covers 54 files: everything that imports the S3 SDK, the storage layer, the sweep
or `audit/chain`, plus `server/services/{audit,vault}`. 728 tests pass. One file fails:
`server/routes/__tests__/authoringFileToVault.pglite.integration.test.ts` (4 tests), with
`relation "organization_retention_settings" does not exist`. That comes from the P1-22-org lane's uncommitted edit
to `server/services/vault/vault-ingest.service.ts`, not from this change.

`green/env-var-docs.txt`: `ci:env-var-docs` matches only `process.env.NAME`. `AUDIT_ANCHOR_BUCKET` is read as
`env.AUDIT_ANCHOR_BUCKET` in `resolveAuditAnchorStore(env = process.env)`, the same shape as
`resolveAuditChainSweepPosture(process.env)`, so the gate does not see it. A pass there proves nothing about this
variable. The `.env.example` line is proposed below.

## Commands

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run server/jobs/__tests__/auditChainIntegritySweep.test.ts \
  server/services/audit/__tests__/chain-anchor.test.ts server/services/storage/__tests__/
TEST_DATABASE_URL=… APP_DATABASE_URL=… RLS_ENFORCE=on npx vitest run --config vitest.db.config.ts \
  server/services/audit/__tests__/chain-anchor.dbtest.ts server/services/audit/__tests__/chain-concurrency.dbtest.ts
cd terraform/stack && terraform init -backend=false && terraform validate && terraform test
cd terraform/modules/compliance-evidence && terraform init -backend=false && terraform test
node scripts/ops/terraform-preflight-proof.mjs
```

The dbtest creates and drops its own database (`p08_anchor_<hex>`) and writes nothing to the shared `c2c_testdb`.
No migration was added, so the migration manifest does not need regenerating. The Terraform lock files written by
`init` were deleted.

## Not done, and why

1. **`.env.example`** is not this item's file, and it carries another lane's uncommitted edit (DP-33). Proposed
   addition after `AUDIT_CHAIN_CHECK_CRON=`:
   ```
   # The object-locked evidence bucket where the daily sweep anchors every organisation's
   # audit_logs chain head (anchors/audit-chain/…) and against whose latest anchor it verifies
   # the database (security plan P0-8; server/services/audit/chain-anchor.ts). Unset: the anchor
   # is reported "not configured" and never verified. Terraform sets it to the evidence bucket.
   AUDIT_ANCHOR_BUCKET=
   ```
2. **The deploy preflight does not require `AUDIT_ANCHOR_BUCKET`.** `.github/workflows/deploy-aws.yml` is not this
   item's file. Proposed: add it to the preflight's `for VAR in …; do` list. The boot contract test reads that list,
   so it would then require the variable in both containers automatically. Until then a deploy without it boots,
   and the sweep reports "anchor not configured" every day, which is honest but not refused.
3. **A forged newer anchor.** The task role writes anchors, so a compromised task could write a newer anchor that
   matches a truncated chain, and the verifier checks only the latest anchor. The role cannot change or remove an
   older anchor: object lock forbids it and the Deny backs that up. Every write is a CloudTrail data event on the
   evidence bucket. Closing this fully needs either verification against every anchor in a window or an anchor
   writer outside the task. Either is a follow-up.
4. **On demand** means the exported `runAuditChainIntegrityCheck()`, `writeAuditChainAnchor()` and
   `verifyAuditChainAnchor()`. No CLI or route is wired: `scripts/ops/verify-audit-chain.mjs` and `package.json` are
   not this item's files. Proposed: add an `ops:anchor-audit-chain` script that runs `runAuditChainIntegrityCheck()`
   and exits non-zero unless `ok`.
5. **Not exercised against live AWS.** The Terraform runs against a mocked provider. A real S3 PutObject under
   default COMPLIANCE retention with an SDK-computed SHA-256 checksum, and KMS use via S3 with bucket keys, are not
   proven here. The first staging deploy should show an object under `anchors/audit-chain/` and, the next day,
   `audit_logs.anchor` `ok` in the sweep log.
6. **Three anchors a day.** Both API tasks and the worker run the sweep at 02:00, so three anchors are written each
   day. The keys are unique, so this is harmless, and every run verifies first.
7. **The archive door still makes the chain walk report `broken`.** The first row left after an archived prefix does
   not derive from genesis. This is pre-existing and noted in DP-04. The anchor reports such shortfalls as
   `unverifiable`, not as tampering.

## Files

Changed: `server/jobs/auditChainIntegritySweep.ts`, `server/jobs/__tests__/auditChainIntegritySweep.test.ts`,
`server/services/audit/chain.ts` (one `export`), `server/services/storage/s3-provider.ts`,
`terraform/modules/compliance-evidence/{main,variables}.tf`, `terraform/stack/main.tf`,
`terraform/stack/tests/boot_contract.tftest.hcl`.

New: `server/services/audit/chain-anchor.ts`, `server/services/storage/s3-client.ts`,
`server/services/audit/__tests__/chain-anchor.test.ts`, `server/services/audit/__tests__/chain-anchor.dbtest.ts`,
this folder.

Touched within 24 hours by another lane (the founder's 2026-10-01 order): `terraform/stack/main.tf` and
`terraform/stack/tests/boot_contract.tftest.hcl`. Both were last committed `09-30 23:36` (`5e1a7204`,
session_0194UQPxy9Er2ibRAjog8Ven), and the P0-11 lane is **editing them right now**, uncommitted (AI provider keys:
`openai_enabled`, `anthropic_api_key`). Both sets of hunks coexist, and the combined tree passes 32/32. The control
tower should commit the two lanes' hunks deliberately. Every other file was last touched 09-24 or 09-25.

## Fix round (2026-10-01, after adversarial verification)

The verifier found two must-fix defects. Both reproduced on the item's first-round tree at HEAD `55518c70`. Each
was shown red first, then fixed. Evidence is in `fix-round/red/` and `fix-round/green/`.

### DP-68 (DP-04 residual, High): a forged archive-ledger row excused a truncated head

**What was wrong.** The first round claimed that a missing recent head is never put down to the archive, because of
the 24-month floor. The verifier never enforced that floor.

- `archivedSince` read `max(cutoff)` and `sum(row_count)` from every `audit_log_archives` row archived after the
  anchor.
- `splitByArchive` then excused a missing head whenever the head was older than that cutoff.
- The floor lived only in the door: `audit_logs_archive_delete()` refuses a cutoff later than `now() - 24 months`.
- The ledger is append-only but not door-only. The runtime role holds SELECT and INSERT on it (`APPEND_ONLY_TABLES`
  in `scripts/db/provision-app-role.mjs`). No CHECK ties `cutoff` to the floor. An owner past the triggers can write
  anything.

So one INSERT (`row_count` 1000000, `cutoff` 2100-01-01) turned `broken` into `unverifiable`. The sweep does not
count `unverifiable` as an incident, so it then wrote a fresh anchor over the truncation. The next day's check
against that anchor reads `ok`.

**What is true now** (`chain-anchor.ts`: `archiveAllowance`, `splitByArchive`).

- **A ledger row counts only if the door could have written it.** It must meet three conditions:
  - it was archived after the anchor;
  - it was archived no later than the verifier's clock (`now`, a new third parameter of `verifyAuditChainAnchor`,
    defaulting to `new Date()`; the database's clock is not used);
  - its `cutoff` is at least 24 months before its own `archived_at`, which is the door's own check.
- **A head is excused only if it is older than `min(latest counted cutoff, now - 24 months)`.** The two filters
  already imply this cap. It stays as the stated invariant, so relaxing either filter cannot reopen head excusal:
  mutants E and F leave case 9 green only because of the cap.
- **The 24-month window is one constant, `AUDIT_ARCHIVE_HOT_WINDOW`.** A unit test pins it to the door's `v_floor`
  declaration in `db/migrations/20260617_audit_logs_immutability.sql`, so the verifier and the door cannot drift
  apart.
- **The sweep behaves as before.** An anchor that is `unverifiable` because of an archived shortfall still does not
  block the next anchor. Blocking it would stop anchoring for good after one legitimate archive batch. The sweep's
  header now says so, and says where the bound lives.

| Check (`chain-anchor.dbtest.ts`) | Red (first-round verifier) | Green |
|---|---|---|
| 9a: the reported forgery (`archived_at now()`, `cutoff 2100-01-01`) after the newest 2 of 4 rows are removed | **`unverifiable`**, breaks `[]`, archived `[head_missing]` | **`broken`**, `head_missing` 4→2, archived `[]` |
| 9b: forged `archived_at now() + 30 months`, `cutoff now() + 6 months` (24 months before its own stamp) | **`unverifiable`** | **`broken`** |
| 10a: the 9a forgery after a row is removed before an intact head | **`unverifiable`** (`rows_missing` excused) | **`broken`**, `rows_missing` 4→3 |
| 10b: the 9b forgery, `rows_missing` | **`unverifiable`** | **`broken`** |
| 11: a ledger row that keeps the door's rules (`cutoff now() - 24 months 1 day`), recent head removed | `broken` (passes) | `broken` (passes). Pins that a head inside the window is never excused, whatever the ledger says |
| 12: a dormant organisation (every row older than 24 months) archived through the real door | `unverifiable`, archived `[head_missing]` (passes) | same (passes). The fix does not over-correct |
| 1 to 8 | as in the first round | pass |

The forged rows are written by a role created for the suite. It holds only USAGE on `public` and SELECT and INSERT on
`audit_log_archives`, which is the runtime role's grant there. The role is dropped after the suite, and none was left
behind (checked).

Red: `fix-round/red/DP-68-dbtest-chain-anchor.txt` (4 failed, 10 passed). Green:
`fix-round/green/DP-68-dbtest-chain-anchor.txt`: the anchor dbtest 14/14 plus the `chain-concurrency` and
`part11-audit-store` dbtests, 26/26 in all.

| Mutant of the fix (`fix-round/red/mutant-*.txt`) | Caught by |
|---|---|
| E: a ledger row counts whatever its cutoff | 10a |
| F: a ledger row dated after the verifier's clock counts | 10b |
| G: neither the cutoff filter nor the cap (the first-round rule) | 9a, 10a |
| H: a missing head is never excused (over-correction) | 12 |
| I: the ledger excuses nothing (over-correction) | 7, 12 |
| J: the cap alone removed | **none.** The two filters imply the cap, because a counted cutoff ≤ its `archived_at` − 24 months ≤ now − 24 months. This is recorded so that the cap is not mistaken for something tested on its own. |

The first attempt at G removed the only reference to `$3`. PostgreSQL then refused the statement with a parameter-type
error, and 11 cases failed for that reason, not because of the mutant. That run was discarded, and G was re-run with
`$3` still referenced.

### INF-34 (Medium, CI honesty): `ci:tenant-entry-points` was red

**What was wrong.** The sweep's content changed, but the baseline digest (`bdfe7fa89f25d1b5`) was still the HEAD
file's. The gate, which runs at `.github/workflows/ci.yml:701`, exited 1. The first round's gate list left this gate
out, yet said "every one exits 0".

**What is true now.**

- The justification was re-read against the new code and amended: a "Re-read 2026-10-01" passage was appended. It
  records that the sweep now reads every organisation's chain head through `chain-anchor.ts`. It writes only
  identifiers, hashes, counts and times, to the object-locked evidence bucket. It still runs under the system scope,
  still refuses a tenant-scoped connection, and still deliberately ignores entitlement: a suspended or purged
  tenant's head is exactly the one whose truncation must be detected.
- The digest was refreshed to `503f4b7993f678cf`, computed by the gate's own recipe over the final file.
- The entry was edited by hand, not with `--write-baseline`, because this tranche's rules forbid write-baseline
  scripts. Run in this shared tree, the script would also have re-hashed any other lane's in-flight sweep. The diff
  is that one entry: 2 lines.

Red: `fix-round/red/INF-34-tenant-entry-points.txt` (exit 1, "CHANGED since justification"). Green:
`fix-round/green/INF-34-tenant-entry-points.txt` (exit 0, digests equal).

### Gates, suites and lint after the fix round

- **`fix-round/green/gates.txt`** reruns the first round's 13 gates plus `ci:tenant-entry-points`. Thirteen exit 0.
  `ci:untracked-imports` exits 1 on four imports, all from other lanes' in-flight files and none from this item:
  `server/api/cmc/{batchRecordRoutes,routes,specificationRoutes}.ts` import `./cmc-signer`, and
  `server/routes/chat/send-message.ts` imports `./retrieval-evidence-block`.
- **`fix-round/green/unit-suites.txt`:** 112/112 across 8 files. They cover the anchor store and parser, the new
  hot-window pin, the sweep, the storage layer, and the archive door's own suites (`audit-archive.test.ts` and
  `audit-archive-delete-door.pglite.integration.test.ts`).
- **`fix-round/green/eslint.txt`:** 0 errors and 0 warnings on this round's files.
- **`fix-round/green/terraform-stack-test.combined-tree.txt`:** 32/32. The fix round changed no Terraform; this run
  confirms the stack as the tree now stands. The lock file was removed afterwards.

### Residuals after the fix round

1. **A ledger row that keeps the door's rules is still believed.** Such a row can be written by an owner past the
   triggers, or by the runtime role, which holds INSERT. It can still do two things:
   - make rows missing before an intact head read `unverifiable` rather than `broken`;
   - excuse a missing head older than 24 months.

   Neither reaches `ok`. The first is also a chain-walk break: removing a row before an intact head breaks
   derivation, and re-chaining the tail changes the head (`head_differs`). The sweep writes no anchor over a walk
   break. The ledger's `locator` and `sha256` are not checked against the cold archive. That is the remaining gap,
   and it matters only for heads older than 24 months.
2. **Proposed, not this item's files.** Withhold INSERT on `public.audit_log_archives` from the runtime role in the
   `APPEND_ONLY_TABLES` list of `scripts/db/provision-app-role.mjs`. That file belongs to the P0-8-grants lane: it is
   uncommitted, and its last commit was 09-30 23:25, `session_01J935DZwfFEardJCv85SJds`. The door runs as
   `audit_archiver`, which holds INSERT itself, so the runtime role needs SELECT only. Optionally, add a BEFORE
   INSERT trigger on `audit_log_archives` that refuses `current_user <> 'audit_archiver'`, so that only the door
   writes the ledger. It should be amended in place into `20260617_audit_logs_immutability.sql` with a dated header
   note (CLAUDE.md Rule 1).
3. **Clock skew fails closed.** A real ledger row is stamped by the database clock and checked against the
   verifier's clock. If the database clock runs ahead of the verifier by more than the gap between an archive batch
   and the sweep, that batch's shortfall reads `broken`.
4. **`occurred_at` stands in for `created_at`.** The anchor records the head's `occurred_at`, but the door tests
   `created_at`. The writer stamps both at write time. A head written with an `occurred_at` back-dated past the
   window, and later removed alongside a ledger row that keeps the door's rules, would be excused.

### Commands (fix round)

```
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable' RLS_ENFORCE=on \
       APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable'
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run --config vitest.db.config.ts \
  server/services/audit/__tests__/chain-anchor.dbtest.ts server/services/audit/__tests__/chain-concurrency.dbtest.ts \
  tests/db/part11-audit-store.dbtest.ts
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run server/services/audit/__tests__/chain-anchor.test.ts \
  server/jobs/__tests__/auditChainIntegritySweep.test.ts server/services/storage/__tests__/ \
  server/services/audit/__tests__/audit-archive.test.ts \
  server/services/audit/__tests__/audit-archive-delete-door.pglite.integration.test.ts
npm run ci:tenant-entry-points
```

### Files (fix round)

- **Changed:** `server/services/audit/chain-anchor.ts`, `server/services/audit/__tests__/chain-anchor.dbtest.ts`,
  `server/services/audit/__tests__/chain-anchor.test.ts` and `server/jobs/auditChainIntegritySweep.ts` (header
  only), plus the one `server/jobs/auditChainIntegritySweep.ts` entry in
  `docs/reports/tenant-entry-points-baseline.json`.
- **Touched within 24 hours by another lane:** `docs/reports/tenant-entry-points-baseline.json`. Its last touch was
  10-01 03:08, merge `700ef10a`, which has no session trailer. Its last content change was 09-30 23:41, `0f317d69`
  (Trunk CI Lint, `session_01DiJJAkasGVrccrxjhYyjxG`).
- **Not touched by another lane within 24 hours:** `auditChainIntegritySweep.ts` was last touched 09-25 01:40. The
  anchor module and its tests are new and untracked.
- **Migration manifest:** no migration was added or changed, so nothing needs regenerating.
