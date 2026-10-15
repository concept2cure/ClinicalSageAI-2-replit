# P0-8 anchor follow-ups (DP-04): written once, consulted on demand, aged, and the ledger closed to the runtime role

**Row:** D6 (D5 for the audit trail). **Follows:** `735ba0a7` (P0-8 anchor, DP-04 and DP-68) and its evidence
`../P0-8-anchor/`: the README's residuals, and the verifier's notes in
`../../2026-10-01-p0-8-forged-anchor-probe/`. **Verified at:** HEAD `0812a990`, 2026-10-01 14:34 UTC. All five
defects were present at that HEAD (red below).

## What was wrong

1. **An anchor could be overwritten, and the code said it could not.** `createS3AuditAnchorStore().put` sent a plain
   PutObject. The evidence bucket is versioned and object-locked. Object lock keeps every version, but it does not
   refuse a new version on an existing key, and the verifier reads the current version. The bucket policy did not
   refuse such a put either. Even so, `chain-anchor.ts` said *"Object lock means no one can change or delete an
   anchor"*, the store interface said *"put never overwrites in effect (object lock)"*, and the first README said
   *"Nobody can change or delete an anchor"*.
2. **The on-demand verifiers answered `ok` for a truncated chain.** Five places walk the chain, and none of them
   consulted the anchor or said that it had not:
   - `GET /api/c2c/actions/verify-chain`
   - `GET /audit-trail/seal-integrity` (`part11-compliance.ts`; there is no `/verify-integrity` route in that file,
     and this is its `audit_logs` verifier)
   - `verifyTenantChainOnAdminScope`, which serves the ledger, the signed export and the compliance reports
   - the licensing history's integrity block
   - `npm run ops:verify-audit-chain`

   With an anchored head deleted, each of them answered 200 `ok: true` / `verified` (`red/unit-on-demand-verifiers.txt`).
3. **A stale anchor raised nothing.** The sweep never looked at the latest anchor's age. A deployment whose anchor
   writes kept failing reported `ok` against an ever older anchor. Rows written after that anchor were covered by
   nothing, and only the failed write's own error line said so.
4. **The runtime role could write the archive ledger.** `APPEND_ONLY_TABLES` held `public.audit_log_archives` to
   SELECT, INSERT. On PostgreSQL 16.13, `app_service` inserted the forged row of DP-68 (`cutoff 2100-01-01`,
   1,000,000 rows): `ran (1 row(s))`. The deploy's grant audit called that posture clean
   (`red/dbtest-anchor-and-grants.txt`). The ledger's only writer is the archive door, which runs as
   `audit_archiver`, and that role holds INSERT itself.
5. **The deploy did not require `AUDIT_ANCHOR_BUCKET`.** The task definition production Terraform renders, with the
   variable removed, passed `deploy-aws.yml`'s own preflight shell: *"every check holds"*, exit 0
   (`red/preflight-accepts-a-task-without-AUDIT_ANCHOR_BUCKET.txt`). `.env.example` did not name the variable.

## What is true now

1. **Written once.**
   - `server/services/storage/s3-client.ts` gains `putS3ObjectOnce`. It is a conditional put
     (`IfNoneMatch: '*'`, `ChecksumAlgorithm: 'SHA256'`, no per-request encryption header).
   - The anchor store uses it (`chain-anchor.ts`). A put to an existing key gets S3's 412, and the error reaches
     the caller.
   - `terraform/modules/compliance-evidence/main.tf` adds `AnchorsAreWrittenOnce`. It is a **Deny, for every
     principal**, of `s3:PutObject` on `anchors/*` when `Null: {"s3:if-none-match": "true"}`. The statement has
     one condition key only, because a second key in the same `Null` block (AWS's own example form) is ANDed and
     narrows the Deny. Mutant K shows the test catching that.
   - Multipart uploads cannot carry the header, so none is possible under `anchors/`. An anchor is one small put.
   - **The provider question.** The repo pins `hashicorp/aws` 5.70.0 (`terraform/environments/production/.terraform.lock.hcl`).
     `terraform/stack` asks for `>= 5.0`. The bucket policy is a `jsonencode()` string that every provider version
     passes through, so no provider support is involved. S3 has evaluated `s3:if-none-match` in bucket policies
     since November 2024 (AWS "S3 now supports enforcement of conditional write operations"). The Terraform runs
     here used the mirror's 5.100.0 against a mocked provider. Nothing here proves AWS's evaluation; see
     residual 7.
   - **The overstatements are removed.** The `chain-anchor.ts` header, the store interface, the dbtest's memory
     store and the module header now say what holds and what does not:
     - Under COMPLIANCE, object lock keeps every version, and no one, root included, can delete a version or
       shorten its retention.
     - It does not refuse a new version. The conditional put and the Deny do.
     - A principal allowed `s3:DeleteObject` can hide an anchor behind a delete marker, and a conditional put to
       that key then succeeds. The task role is denied DeleteObject; an account administrator is not, and can
       also rewrite the bucket policy.
     - The verifier reads current versions only.
     - The "Not covered" note now names the forged newer anchor, under a new key, as reproduced.
2. **One head verdict for every on-demand verifier: `verifyChainHead` in `chain-anchor.ts`.**
   - It is `verifyAuditChainAnchor`, which gains `{ organizationId }` to compare one organisation's anchored head
     only, against the latest anchor. There is no second verifier.
   - Its verdict is `verified`, `broken`, or one of three statuses whose reason begins *"head not verified against
     the anchor"* and says the verdict is the chain walk only: `not_configured`, `not_anchored`, `unverifiable`.
   - A store or anchor that cannot be read **throws**, so each caller's own error path answers. That is never ok
     and never an empty result.
   - Reasons carry no bucket name and no configuration key.

   Each caller folds it in the same way, `ok = walk.ok && head.status !== 'broken'`, and carries `head`:

   | Verifier | Anchor bucket configured, head gone | No anchor bucket | Anchor unreadable |
   |---|---|---|---|
   | `verify-chain` (`server/routes/c2c/actions.ts`) | **409**, `ok: false`, `head.breaks` names the missing head | 200, walk verdict, `head.reason` "head not verified against the anchor…" | 500 `INTERNAL_ERROR` (logged). *Fix round: estate-wide for a platform administrator only; anyone else gets their own organisation, and 503 here.* |
   | `seal-integrity` (`server/routes/part11-compliance.ts`) | `data.ok: false`, `data.head.status: 'broken'` | `data.head` labelled | 500 envelope (`serverError`) |
   | licensing history (`server/routes/admin/licensing-history.ts`) | `status: 'broken'`, `reason: 'chain-head-broken'`, `head: 'broken'` | walk verdict kept, `head: 'not-verified'` | `unavailable` / `check-failed` |
   | tenant verdict (`server/services/audit/tenant-chain-verdict.ts`) | `ok: false` for **that organisation only** (scoped), `head` | `head` labelled | ~~throws, as a failed walk does~~ *Fix round (DP-72): the walk with `head.status: 'unavailable'` and `ok: null`* |
   | `ops:verify-audit-chain` (`scripts/ops/verify-audit-chain.mjs`) | `public.audit_logs` **broken**, exit 1 | `ok`, `head` labelled | `unverifiable`, "the anchor could not be read", exit 2 |

   The routes, the tenant verdict and the licensing history consult the anchor whenever the deployment sets
   `AUDIT_ANCHOR_BUCKET`, which Terraform sets in both containers. The ops script resolves it from its
   environment. `verifyAuditChains(client, env, { anchorStore })` takes an injected store for proofs. New:
   `scripts/ops/verify-audit-chain.d.mts`, the script's types for the TypeScript tests (the
   `provision-app-role.d.mts` pattern).
3. **The anchor's age, every run** (`server/jobs/auditChainIntegritySweep.ts`).
   - `result.anchorAge` is `{ anchorKey, anchoredAt, hours, staleAfterHours: 48 }`. It is `null` when there was no
     anchor to read. It is also in every outcome log line (info, warn, error) and in the anchor store's reason
     ("… 24 hour(s) old").
   - An anchor **older than 48 hours** (`ANCHOR_STALE_AFTER_HOURS`; 48 h exactly is not) gives a new status,
     `stale`. It is in `INCIDENT_STATUSES`, so it raises the existing path: the error log, `emitWarning`, and the
     `[SECURITY]` webhook.
   - **A stale anchor does not block the next anchor.** The run verified every head the stale anchor names, and
     writing today's anchor is what closes the window. Any other incident still blocks it.
   - Precedence: `broken` beats `stale`, and `stale` beats `ok`/`unverifiable`.
   - `reportSweepOutcome` takes the anchor write and age as one argument, so the change adds no ESLint warning.
4. **The ledger is SELECT only for the runtime role** (`scripts/db/provision-app-role.mjs` and `.d.mts`).
   - `APPEND_ONLY_TABLES` gains a per-store `ceiling`, set to `['SELECT']` on `public.audit_log_archives`. It is
     the same mechanism as `updatableColumns`, not a second one.
   - `withholdAppendOnlyPrivileges` revokes `UPDATE, DELETE, TRUNCATE, INSERT` there. Every other store keeps
     exactly HEAD's statement.
   - `auditRuntimeRoleGrants` holds the store to its own ceiling, so INSERT there is **excess**, which fails
     deploy step 5, and SELECT alone is not a denial.
   - **The door still archives on real PostgreSQL** with `app_service` in the new posture: it deletes a 26-month-old
     row and its ledger row is there (`green/dbtest-anchor-grants-and-neighbours.txt`). As `app_service`, the DP-68
     forged INSERT is now `42501 permission denied for table audit_log_archives`.
5. **`AUDIT_ANCHOR_BUCKET` is required by the deploy.**
   - `.github/workflows/deploy-aws.yml` gains three things in the preflight: the variable in the `for VAR in` list,
     a comment entry (it is not a boot refusal, so the comment says what it costs), and a clause in the refusal
     message.
   - The stripped task definition is now refused, naming the variable. The rendered one is accepted
     (`green/preflight-refuses-a-task-without-AUDIT_ANCHOR_BUCKET.txt`).
   - The Terraform boot-contract test reads the list. Against a stack mutated to drop the variable, HEAD's list
     catches it in the P0-8 run only. The new list also fails `renders_the_boot_contract` and
     `staging_carries_every_name_the_deploy_preflight_requires`.
   - `.env.example` gains the variable after `AUDIT_CHAIN_CHECK_CRON=`, with a one-line comment.

## Red / green

| Behaviour | Red (unfixed code, final tests) | Green |
|---|---|---|
| 1. Conditional put: `IfNoneMatch '*'`; a second put to a key is refused (412) and the first anchor stays (`chain-anchor.test.ts`) | fail: no `IfNoneMatch` (`red/unit-anchor-sweep-grants.txt`) | pass (`green/unit-suites.txt`) |
| 1. Bucket policy denies every principal a put under `anchors/` without `s3:if-none-match`, on one condition key (`evidence.tftest.hcl`) | **fail**, 4/5 (`red/terraform-evidence-module-test.txt`) | 5/5 (`green/terraform-evidence-module-test.txt`) |
| 2. Five verifiers, anchor configured and head gone (`chain-head-on-demand.test.ts`, 5 cases) | all 5 answer ok (`red/unit-on-demand-verifiers.txt`) | broken, 409, `chain-head-broken`, org 7 only |
| 2. Five verifiers, no anchor bucket (5 cases) | no label anywhere | each says "head not verified against the anchor" |
| 2. Anchor unreadable: verify-chain and the ops script (2 cases) | 200 ok, ops script `ok` | 5xx, ops script `unverifiable` |
| 2. PostgreSQL 16.13 (`chain-anchor.dbtest.ts` 13 and 14): real truncation, `verifyChainHead` estate-wide and per organisation, the ops script on that database | `verifyChainHead is not a function` (`red/dbtest-anchor-and-grants.txt`) | 16/16 (`green/dbtest-anchor-grants-and-neighbours.txt`) |
| 3. Age reported (24 h), 48 h exactly not stale, 49 h `stale` incident with the alert **and** a fresh anchor, stale and broken, stale beside another incident, no anchor gives `anchorAge: null` (`auditChainIntegritySweep.test.ts`, 6 cases) | all 6 fail | pass |
| 4. Unit: ledger `ceiling: ['SELECT']`; recipe revokes INSERT there only; audit reports INSERT as excess, SELECT alone as clean, nothing as denied (`provision-app-role-append-only.test.ts`, 3 cases) | 3 fail | pass |
| 4. PostgreSQL: per-run role from the real recipe and `app_service` after deploy step 4. Ledger SELECT only; forged INSERT is 42501; the door still archives; the audit agrees with the catalog (`append-only-store-grants.dbtest.ts`) | **6 fail**, forged insert `ran (1 row(s))` | 14/14 |
| 5. Preflight's own shell against the rendered task definition without `AUDIT_ANCHOR_BUCKET` | **accepted**, exit 0 | **refused**, "missing required production env: AUDIT_ANCHOR_BUCKET", exit 1; the rendered one is accepted |
| 5. Stack mutant without the variable: boot-contract runs that read the list | only the P0-8 run fails (`red/terraform-stack-mutant-…HEAD-preflight-list.txt`) | the two preflight-derived runs fail too (`green/terraform-stack-mutant-…new-preflight-list.txt`) |
| 5. `terraform test`, `terraform/stack` | — | this change alone (scratch export of HEAD): **43/43**; the combined shared tree, with another lane's uncommitted stack tests: **52/52** |

**The check made to fail.** Each test was run against the unfixed code, with the outputs listed above. Mutants of
this change were each run and then restored, with the files compared byte for byte afterwards (`red/mutant-*.txt`):

| Mutant | Caught by |
|---|---|
| K: the Deny's `Null` block also names `s3:if-match` (ANDed, narrower) | module test, second assertion |
| L: `stale` is not an incident | sweep: 49 h case; stale beside another incident |
| M: a stale anchor blocks the next anchor | sweep: "a fresh anchor is still written" |
| N: exactly 48 h counts as stale | sweep: "at exactly 48 hours" |
| O: `organizationId` ignored, so one tenant is broken by another's truncation | on-demand: "broken for the truncated organisation only" |
| P: with no anchor bucket the head reads `verified` | on-demand: all five "walk only" cases |

## Gates, lint, types and neighbours

- **Gates** (`green/gates.txt`, final tree). These exit 0:
  - `check:security-patterns`
  - `ci:server-error-leaks`
  - `ci:sign-ceremony`
  - `ci:unreferenced-modules`
  - `ci:untracked-imports`, which checks the push range only. `chain-head-on-demand.test.ts` and
    `verify-audit-chain.d.mts` are new and must be committed with the rest.
  - `ci:tenant-entry-points`
- **`ci:tenant-entry-points`** first failed on this change: the sweep's digest went from `47d9d558076a0e31` (the
  baseline, equal to HEAD's file) to `de1b136742403cf7`.
  - I re-read the justification. Scope and stores are unchanged, nothing new is read from a tenant, and nothing
    new is written. It holds.
  - I appended a dated "Re-read" sentence and refreshed the digest by hand with the gate's own recipe, not
    write-baseline. That is 2 lines in `docs/reports/tenant-entry-points-baseline.json` (`green/ci-tenant-entry-points.txt`).
- **Two gates exit 1, for reasons outside this item's files:**
  - `ci:launch-scope-api`, on another lane's untracked `client/src/concept2cure/v2/surfaces/ClaudeConnectorSetting.tsx`
    (`/api/tenant-config/:p/claude-connector` unmapped).
  - `ci:compose-boot-contract`. It was already red at HEAD with 6 MCP_* problems
    (`red/ci-compose-boot-contract.HEAD-list.txt`, the checker run unchanged in a scratch tree with HEAD's
    workflow). It now has 8: this change adds `AUDIT_ANCHOR_BUCKET` for both Compose files (residual 1).
- **Not applicable:** no migration was added or changed, so `ci:migration-set-order`, `ci:migration-drop-safety` and
  the manifest do not apply.
- **ESLint** (`green/eslint-compare.txt`): HEAD content against the working file, per file. **0 new warnings, 0
  errors**:
  - `actions.ts` keeps its 5, `part11-compliance.ts` its 6, `licensing-history.ts` its 3, and the sweep test its 1.
  - The new test file has 0.
  - `scripts/**` is outside ESLint's scope by config.
- **Types** (`green/typecheck-targeted.txt`): a scratch tsconfig, deleted afterwards, with this item's TypeScript
  files and the repo's ambient declarations, checked transitively. It is never the full project. There are
  **0 errors in this item's files**. 4 remain, all "Property 'dbClient'/'identity' does not exist on type
  'Request'" in unchanged middleware, whose Express augmentations live outside that program.
- **Neighbours.** Unit: 25 files, **336/336** (`green/unit-suites.txt`). They cover everything that imports a
  changed module or mocks `tenant-chain-verdict`: the licensing, part11 and compliance-report routes, the ledger
  read gate, the export scope, the authoring and turn-record pglite suites, the archive door, the storage layer and
  readiness. PostgreSQL:
  - `chain-anchor`, `append-only-store-grants`, `chain-concurrency` and `part11-audit-store`: **42/42**.
  - `licensing-history`, `actor-names` and `compliance-reports` (the verifiers for real, no anchor bucket):
    **39/39** (`green/dbtest-verifier-neighbours.txt`).
  - Not this item's files (`green/neighbour-dbtests-not-owned.txt`): `two-tenant-application-rls` passes.
    `turn-record-purge-door` fails 5:
    - **1 is caused by this change.** It asserts INSERT on every `APPEND_ONLY_TABLES` store; see residual 2.
    - 4 are this database's own state: `public.purge_tenant_turn_records` does not exist in `c2c_testdb`.

## The shared environment

- **`app_service` in `c2c_testdb` was moved to the new posture** by the deploy's own step-4 function,
  `ensureRuntimeRole`, run as the owner at 14:50 UTC (`green/deploy-step4-ensureRuntimeRole-app_service.txt`), as
  the P0-8-grants lane did.
  - A pre-check in the same minute showed the new recipe would change one thing only, INSERT on the ledger.
    Nothing was in excess elsewhere, nothing was denied, and no unreviewed SECURITY DEFINER function was
    executable.
  - Ledger privileges went from `{"s":true,"i":true}` to `{"s":true,"i":false}`.
  - Every probe row was written in a rolled-back transaction. The anchor dbtest created and dropped its own
    database and role.
- **The temp filesystem filled at about 14:46 UTC.** The cause was my scratch Terraform JSON stream of 567 MB plus
  three provider caches of 675 to 692 MB each. One of my own edits, to `licensing-history.ts`, was truncated
  mid-write. I restored it from HEAD; it had no other change since 09-23. Then I re-applied the edit and checked
  every other file I had written. The space was freed at once.
  - Other lanes writing at that moment may also have hit ENOSPC.
  - My orphaned provider processes (17, in my own `TF_DATA_DIR`) were stopped.
- **Terraform lock files.**
  - `terraform/modules/compliance-evidence`: none before, removed after each run.
  - `terraform/stack`: absent at 14:39. At 14:40 another lane's lock file was present, and my first run
    **removed it**. I had made the removal unconditional, which was my mistake. I made it conditional afterwards.
    The later run found a lock present and left it in place. No lock file of mine remains.
- **Files another lane touched within 24 hours:**
  - `.env.example` and `deploy-aws.yml`: `…01SuVLo2`, 13:09 and 13:25.
  - `server/routes/c2c/actions.ts`: `…01471vSK`, 07:03.
  - `server/routes/part11-compliance.ts`: `…015oLV2v`, 08:55.

  This item's hunks there are small and do not overlap theirs. `terraform/stack/tests/boot_contract.tftest.hcl`
  carries another lane's uncommitted +192 lines, which I did not touch. The combined-tree run includes them.

## Commands

```
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable' RLS_ENFORCE=on \
       APP_DATABASE_URL='postgresql://app_service:…@127.0.0.1:5432/c2c_testdb?sslmode=disable'
npx vitest run server/services/audit/__tests__/chain-anchor.test.ts server/jobs/__tests__/auditChainIntegritySweep.test.ts \
  server/services/audit/__tests__/chain-head-on-demand.test.ts server/db/__tests__/provision-app-role-append-only.test.ts
npx vitest run --config vitest.db.config.ts server/services/audit/__tests__/chain-anchor.dbtest.ts \
  tests/db/append-only-store-grants.dbtest.ts
# Terraform: TF_CLI_CONFIG_FILE=<scratchpad>/p011v2/tfrc TF_DATA_DIR=<scratchpad>/p08f/… terraform init -backend=false
cd terraform/modules/compliance-evidence && terraform test
cd terraform/stack && terraform validate && terraform test
node scripts/ops/terraform-preflight-proof.mjs --td-json docs/evidence/…/inputs/api-td.without-AUDIT_ANCHOR_BUCKET.json
```

The two task definitions in `inputs/` were rendered from HEAD's `terraform/stack` (mocked provider; the run
`renders_the_boot_contract`). The stripped one differs only by `AUDIT_ANCHOR_BUCKET`.

## What remains

1. **`ci:compose-boot-contract` now also wants `AUDIT_ANCHOR_BUCKET` in both Compose stacks.** It reads the same
   preflight list, and it is not this item's file. Proposed change in `scripts/ci/check-compose-boot-contract.mjs`:
   - add `const COMPOSE_EXCUSED = ['AUDIT_ANCHOR_BUCKET'];`
   - in `checkService`, after `names` is built: `for (const n of COMPOSE_EXCUSED) names.delete(n);`
   - add a header bullet under "Excused for Compose": *"AUDIT_ANCHOR_BUCKET. A Compose stack has no object-locked
     evidence bucket, and the anchor store reaches AWS S3 only. The sweep reports the anchor 'not configured' and
     never verified; it is not a boot refusal."*
   - add a self-test case asserting it is not required.

   The alternative, `AUDIT_ANCHOR_BUCKET: ${AUDIT_ANCHOR_BUCKET:?…}` in `docker-compose.yml` and
   `docker-compose.beta.yml`, would make every self-host provide an AWS object-locked bucket. That is a product
   decision. Separately, the gate was already red for MCP_* (`42842480`).
2. **`tests/db/turn-record-purge-door.dbtest.ts`** asserts INSERT on every store, so it now fails on
   `public.audit_log_archives`. It is not this item's file. Exact change in the first case:
   - read the ceiling with `jsonb_to_recordset($2::jsonb) AS t(schema text, name text, ceiling jsonb)`, and select
     `t.ceiling`;
   - then use `const wrong = rows.filter((r) => !r.s || r.i !== (r.ceiling ?? ['SELECT', 'INSERT']).includes('INSERT') || r.u || r.d || r.t)`.
3. **`scripts/ops/terraform-preflight-proof.mjs` cannot run at HEAD.** It is not this item's file, and the cause
   predates this change.
   - `terraform test -json -verbose` on HEAD's stack (43 runs) writes 593,594,131 bytes. Node's string limit is
     536,870,888, so `spawnSync` throws `ERR_STRING_TOO_LONG`.
   - The CI job `preflight-proof` (`terraform-tests.yml`) will fail the same way.
   - Fix: send the child's stdout to a temporary file (`stdio: ['ignore', fd, 'pipe']`) and parse it line by line,
     keeping only the `test_state` line of `renders_the_boot_contract`.
4. **The walk-only label does not yet reach every page.**
   - The tenant verdict's consumers pick fields (`ok`, `rowsChecked`, `brokenAt`), so a head break reaches them as
     `ok: false`, but `head` does not. The consumers are `audit-trail-ledger.routes.ts` `meta.chain`,
     `audited-export.ts` `walkTenantChain`, `signedAuditExport` and `compliance-reports/integrity-checks.ts`.
     Proposed: carry `head: v.head` (or `headVerified` plus `head.reason`) beside `ok`.
   - `LicensingHistoryPanel.tsx` should render `integrity.head`. For `not-verified`: *"The newest entries were not
     checked against the record kept outside the database."* It also needs copy for the reason token
     `chain-head-broken` (*"An entry the record outside the database names is missing or changed."*). Its default
     detail text now shows for that token.
   - All of these files belong to other lanes.
5. **A forged newer anchor is still not covered.** That is the probe's item 1, outside this item's scope: the task
   role can write an anchor under a new key after a truncation, and only the latest anchor is compared. The
   remedies are in `docs/evidence/D6/2026-10-01-p0-8-forged-anchor-probe/`: check every anchor's heads, or
   check monotonically per organisation, and read versions and delete markers (`s3:ListBucketVersions`,
   `s3:GetObjectVersion`). One more step would close the delete-marker path for every principal short of a
   policy rewrite: a Deny of `s3:DeleteObject` on `anchors/*` to `"*"`.
6. **The first README overstates.** `../P0-8-anchor/README.md` lines 36 and 178 still say nobody can change or
   delete an anchor. This README supersedes them. That earlier evidence record was not edited.
7. **Not exercised against live AWS.** Three things are unproven here:
   - S3's evaluation of `s3:if-none-match` in this bucket policy;
   - a conditional put together with object lock and an SDK checksum;
   - 412 on a second put.

   On the first staging deploy, check four things with `aws s3api put-object` as the task role. A put under
   `anchors/` without `--if-none-match` should be AccessDenied. With `--if-none-match '*'` on a new key it should
   succeed. The same key again should give 412. The next day's sweep log should show `audit_logs.anchor` `ok`
   with an `anchorAge` near 24.
8. **Smaller points.**
   - A deployment whose first anchor is never written stays `unverifiable`, a warning, with no age and no
     incident. The failed write logs an error each day.
   - The age is read from the anchor body's `anchoredAt`; S3's `LastModified` is not consulted.
   - `verify-chain` answers a generic 500 when the anchor cannot be read; a 503 with its own code would be calmer.
   - Each on-demand call lists `anchors/audit-chain/`. That is about 3 keys a day, around 7,700 over seven years,
     or 8 list pages. The licensing view memoises for 30 s; the ledger and export pages do not.
9. **The register.** The P0-8 row of `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` lists these
   five as "in flight". The control tower should update it.

## Files

- **Changed:**
  - `server/services/audit/chain-anchor.ts`
  - `server/services/storage/s3-client.ts`
  - `server/jobs/auditChainIntegritySweep.ts`
  - `server/routes/c2c/actions.ts` (verify-chain only)
  - `server/routes/part11-compliance.ts` (seal-integrity only)
  - `server/routes/admin/licensing-history.ts`
  - `server/services/audit/tenant-chain-verdict.ts`
  - `scripts/ops/verify-audit-chain.mjs`
  - `scripts/db/provision-app-role.mjs` and `.d.mts`
  - `terraform/modules/compliance-evidence/main.tf` and `tests/evidence.tftest.hcl`
  - `.github/workflows/deploy-aws.yml` (preflight list, its comment entry, its message)
  - `.env.example` (2 lines)
  - `docs/reports/tenant-entry-points-baseline.json` (the sweep entry: re-read and digest)
  - Tests: `chain-anchor.test.ts`, `chain-anchor.dbtest.ts`, `auditChainIntegritySweep.test.ts`,
    `provision-app-role-append-only.test.ts`, `tests/db/append-only-store-grants.dbtest.ts`
- **New:**
  - `server/services/audit/__tests__/chain-head-on-demand.test.ts`
  - `scripts/ops/verify-audit-chain.d.mts`
  - this folder

## Fix round (2026-10-01, after verification)

The verifier confirmed four must-fix findings against the change above. Each is fixed here, red first. Red and
green outputs are under `red/fix-round/` and `green/fix-round/`. The tree is HEAD `01b1020c` plus this item (and
other lanes' uncommitted edits in the shared tree).

### What was wrong

1. **IAM-26: `verify-chain` gave every signed-in user the estate.** The router is mounted behind `authMiddleware`
   only (`server/bootstrap/register-inline-routes.ts`). The route checked only that a user id and an organisation
   id existed, then walked every organisation's chain on an `app_super_admin` connection.
   - It returned the estate-wide first break.
   - It also returned `head.breaks[]`, new in this item, naming every broken organisation, its head row id and its
     row counts.
   - Each call also listed the anchor prefix and read the latest anchor from S3.
   - The estate walk and its break leaked before this item; `head.breaks` widened it.
2. **DP-71: the head verdict never reached a reader.**
   - **(a) Licensing panel.** The panel did not know the reason `chain-head-broken`. Its detail fell through to *"The
     verification could not be completed"* under the headline *"A break was found in the record chain"*.
     `head: 'not-verified'` was never rendered, so with no anchor bucket it still said *"Record chain and seals
     verified"*.
   - **(b) The tenant verdict's readers.** `verifyTenantChainOnAdminScope` returned `head`, and every reader dropped it:
     - the ledger's and a document history's `meta.chain`;
     - `walkTenantChain` (the turn-record and authoring exports, and the compliance reports);
     - the signed export manifest's `auditLogsChain`;
     - the integrity attestation's chain row.

     With no anchor bucket they said `intact` with no caveat. With a head break they said `broken`, and the
     attestation's detail was the string `null`.
3. **DP-72: a tenant's own audit trail depended on one estate-wide object.** `verifyTenantChainOnAdminScope` let
   any error from the anchor read propagate: S3, KMS, or `AuditAnchorMalformedError` on the lexically greatest key.
   - The ledger route answered 500 *"Failed to read audit ledger"*, for every tenant. A document's history did the
     same.
   - One malformed or future-dated object under `anchors/`, which the task role can write, was enough to cause it.
   - Before this item those reads were database-local.
4. **NEIGHBOUR-RED.** `tests/db/turn-record-purge-door.dbtest.ts` asserted INSERT on every append-only store. It
   failed on `public.audit_log_archives`, whose ceiling is now SELECT (`red/fix-round/dbtest-turn-record-purge-door.txt`).

### What is true now

1. **`verify-chain` is scoped to the caller** (`server/routes/c2c/actions.ts`).
   - **A platform administrator gets the estate-wide verdict**, as before, labelled `scope: 'estate'`.
     "Platform administrator" is decided by `resolvePlatformAdmin(req)` in `server/middleware/requirePlatformAdmin.ts`,
     the guard's own answer. It admits super_admin, platform_admin, support, the owner's e-mail allowlist for a
     password session, and an active `platform_role_grants` row. It denies on a database error.
   - **Anyone else gets their own organisation's verdict**, labelled `scope: 'organization'`. It comes from
     `verifyTenantChainOnAdminScope(orgId)`, the verdict the ledger states:
     - the walk filtered to that organisation;
     - the head scoped to it, so another organisation's break is not compared and not returned;
     - the walk's break redacted by `breakForTenant` (`audited-export.ts`), so another organisation's row is "another
       organization";
     - no estate `tenants` count.
   - **Anchor unreadable.** For a platform administrator the error still throws, so the answer is 500. For anyone
     else, `ok: null` becomes **503 `AUDIT_ANCHOR_UNREADABLE`**, *"The audit chain could not be verified, so no result
     is given."*
   - **Why the route is not simply admin-only:** OQ-VAULT-08 and the projects OQ (`tests/validation/oq/*/run.mjs`)
     call it as an ordinary validation user and expect 200 `ok: true`. They now verify their own organisation.
   - The body still carries the anchor's object key (`head.anchorKey`). It is a dated key and names no
     organisation.
2. **The tenant verdict carries the head to every reader.**
   - **Licensing panel** (`client/src/concept2cure/v2/surfaces/licensing/LicensingHistoryPanel.tsx`):
     - The reason `chain-head-broken` has its own headline, *"The end of the record chain does not match its
       anchor"*. Its detail says that a copy of the chain's newest entry is kept outside the database, and that the
       entry is missing or changed, so entries may have been removed or rewritten at the end of the record. It adds
       that the entries shown were re-derived and still match one another, which is why rows can still read *Chain
       verified*.
     - `head: 'not-verified'` on a verified store adds one line: *"The newest entries were not checked against the
       copy kept outside the database, so entries removed from the end of the record would not show here."*
       (`headCaveat`).
   - **Ledger and a document's history** (`server/routes/audit-trail-ledger.routes.ts`):
     - `AuditLedgerChainVerdict` gains `head`, and `ok` is `boolean | null`.
     - One helper, `chainVerdictOf`, now builds `meta.chain` for both readers. This replaces two copies of the same
       object literal.
   - **`walkTenantChain`** (`server/services/audit/audited-export.ts`) carries `head`. On `ok: null` its reason is
     the head's reason. It feeds the turn-record and authoring exports and the reports;
     `compliance-reports/types.ts` `TenantChainWalk` gains `head`.
   - **Signed export** (`server/services/audit/signedAuditExport.ts`):
     - The manifest's `auditLogsChain` gains `head`. The field is optional and covered by the version-2 signature;
       exports sealed earlier have none.
     - `ok: null` gives `status: 'unverified'` with the head's reason.
     - `AuditExportDeps.verifyAuditLogsChain` is typed `TenantChainVerifier`.
   - **Integrity attestation** (`compliance-reports/queries/audit-trail-integrity.ts`):
     - An intact row reads *"Every chained row re-derives from its predecessor; head verified against the latest
       anchor (…)"*, or *"…; head not verified against the anchor: …"*.
     - A head break gives the head's reason and its breaks (this organisation's only) as JSON, never `null`.
     - A walk break alone keeps its JSON detail unchanged; `integrity-report.test.ts` parses it.
3. **The head step is caught; the walk is not** (`server/services/audit/tenant-chain-verdict.ts`).
   - When `verifyChainHead` throws, the error is logged and the head becomes
     `{ status: 'unavailable', verified: false, breaks: [] }`. Its reason is *"head not verified against the anchor:
     the anchor could not be read, so this verdict is not verified"*.
   - `ok` is then `null`: not verified, neither ok nor broken. A walk break still makes it `false`.
   - The ledger and a document's history return their entries with that verdict.
   - The operator verifiers keep throwing: `verify-chain` for a platform administrator, `ops:verify-audit-chain`
     and the sweep. They call `verifyChainHead` directly.
   - New types: `TenantChainHead` (the head statuses plus `unavailable`); `TenantChainVerification` (`ok: boolean |
     null`, `head`); and `TenantChainVerifier`, which accepts a verifier with no head (an injected one in tests).
4. **The purge-door case holds each store to its own ceiling** (`tests/db/turn-record-purge-door.dbtest.ts`). This is
   the verifier's exact change: it reads `ceiling` from `APPEND_ONLY_TABLES` and requires INSERT exactly where the
   ceiling allows it. The case title says so.
   - Made to fail on real PostgreSQL inside rolled-back transactions (`red/fix-round/purge-door-check-made-to-fail.txt`).
     A GRANT of INSERT on the ledger is caught (`["public.audit_log_archives"]`). So is a REVOKE of INSERT on
     `audit_logs` (`["public.audit_logs"]`). Both read `[]` after rollback.

### Red / green

| Behaviour | Red (unfixed code, final tests) | Green |
|---|---|---|
| IAM-26: an org admin of organisation 8 gets organisation 8 only, nothing of 7, no `tenants`; another organisation's walk break is not named; a platform administrator gets `scope: 'estate'` (3 cases, `chain-head-on-demand.test.ts`) | 3 fail: 409 with org 7's break; raw `brokenAt` with `their-row`; no `scope` (`red/fix-round/unit-readers-verify-chain.txt`) | pass (`green/fix-round/unit-readers-verify-chain.txt`) |
| DP-71 (b), no anchor bucket: ledger, document history, export walk, signed manifest, attestation row each say "head not verified against the anchor" (5 cases) | 5 fail: no `head` anywhere | pass |
| DP-71 (b), organisation 7's head gone: ledger `head.breaks`, export walk, manifest `head.breaks`, attestation detail names the row (not `null`), organisation 8's ledger names nothing of 7 (5 cases) | 5 fail; attestation detail `"null"` | pass |
| DP-72, anchor unreadable: tenant verdict `ok: null` + `unavailable`; the ledger and a document's history still return their entries; export walk, manifest (`unverified`) and attestation (`not verified`) give the reason (4 cases) | 4 fail: `AuditAnchorMalformedError` thrown through `readAuditLedger` / `readRecordAuditHistory` | pass |
| DP-72 guard: a failing walk still throws; both verify-chain callers still answer 5xx for an unreadable anchor (3 cases) | pass (unchanged behaviour) | pass |
| DP-71 (a): `chain-head-broken` headline and detail, no "could not be completed"; `not-verified` caveat; no caveat when `verified` (3 cases, `licensingHistory.test.tsx`) | 2 fail (`red/fix-round/client-licensing-panel.txt`) | 16/16 (`green/fix-round/client-licensing-panel.txt`) |
| NEIGHBOUR-RED (PostgreSQL 16.13) | the ceiling case fails, `['public.audit_log_archives']` | passes. The other 4 still fail: `public.purge_tenant_turn_records` is absent from `c2c_testdb` (`green/fix-round/dbtest-turn-record-purge-door.txt`) |

The three panel cases moved into their own `describe` after the red run, because ESLint's
`max-lines-per-function` flagged the longer block. Their assertions are unchanged.

**Mutants of this round**, each run and then restored, with the files compared byte for byte (`red/fix-round/mutant-*.txt`):

| Mutant | Caught by |
|---|---|
| Q: `verify-chain` estate-wide for everyone | IAM-26: organisation 8 admin; another organisation's break |
| R: the tenant path returns the raw walk break | IAM-26: "said to be there, not named" |
| S: the walk's error is caught along with the head's | DP-72: "a walk that fails still fails" |
| T: an unreadable anchor reads `ok: true` | 5 cases, including the member's verify-chain 5xx |
| U: the attestation prints `null` for a head break | DP-71: the attestation's chain row |
| V: the panel caveat shows whatever the head | DP-71 (a): "adds no such caveat when the newest entries were checked" |
| W: the ledger drops `head` | 5 ledger and history cases |

### Gates, lint, types and neighbours (fix round)

- **Gates** (`green/fix-round/gates.txt`). These exit 0:
  - `check:security-patterns`
  - `ci:server-error-leaks`
  - `ci:sign-ceremony`
  - `ci:unreferenced-modules`
  - `ci:untracked-imports`
  - `ci:tenant-entry-points`
- **`ci:launch-scope-api` exits 1**, still only on another lane's untracked `ClaudeConnectorSetting.tsx`
  (`/api/tenant-config/:p/claude-connector` unmapped).
- **No migration** was added or changed.
- **ESLint** (`green/fix-round/eslint-compare.txt`, HEAD content against the working file): **0 new warnings, 0
  errors** in the 11 files.
  - `actions.ts` keeps its 5, `signedAuditExport.ts` its 1, and `LicensingHistoryPanel.tsx` its 2.
  - Every other file has 0.
- **Types** (`green/fix-round/typecheck-targeted.txt`): a scratch tsconfig, deleted afterwards. It covered this
  round's files and two callers of changed signatures: `audit-trail-routes.ts`, which passes the tenant verifier to
  the signed export, and `project-vault.ts`. **0 errors in this round's files.** 8 remain, all in unchanged files:
  - the same 4 Express `Request` augmentation errors as before;
  - 4 TS7016 errors for `jsonwebtoken` and `qrcode`, whose `@types` packages are absent from this `node_modules`.
    They are reached through `project-vault.ts`.
- **Unit** (`green/fix-round/unit-suites.txt`): **44 files, 546/546**. That is the previous 25, plus:
  - the ledger route;
  - the vault document history (route and pglite);
  - `audited-export`;
  - the signed-export suites (canonicalisation, key id, audit_logs pglite);
  - every compliance-report suite;
  - the two unverified-verdict gates;
  - `requirePlatformAdmin`;
  - the client licensing and signed-row tests.
- **PostgreSQL** (`green/fix-round/dbtests.txt`): `chain-anchor`, `append-only-store-grants`, `licensing-history`,
  `actor-names`, `compliance-reports` and `turn-record-purge-door` give **72 pass, 4 fail**. The 4 are the purge-door
  cases that need `public.purge_tenant_turn_records`, which this database lacks.

### What remains after the fix round

1. **Three client surfaces read `meta.chain` and do not yet render `head` or `ok: null` in words.** They belong to
   other lanes. The server now gives them both. Proposed changes:
   - **`client/src/concept2cure/v2/surfaces/Vault.tsx` `ChainVerdict`** (about lines 343-368). It renders anything
     not `ok` as *"Audit chain check failed … has a break"*, so `ok: null` reads as a break.
     - Add `head?: { status: string; reason: string }` to `HistoryShape['chain']`, and `ok: boolean | null`.
     - When `chain.ok === null`, render *"The audit chain was not verified: {head.reason}. The entries below are what
       is recorded."* as a warning, not an alert.
     - When `chain.ok` and `head && head.status !== 'verified'`, append *"The newest entries were not checked against
       the copy kept outside the database."*
   - **`client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` `readChainVerdict` / `chainSummary`** (about lines
     914-965).
     - `ok: null` already reads `unverified`, but with the words *"returned no chain verdict"*. Use `head.reason`
       when present.
     - `ok: false` with no `brokenAt` and `head.status === 'broken'` reads *"Hash chain breaks at entry unknown"*.
       Render *"The end of the chain does not match its anchor: {n} anchored head(s) missing or different"*.
     - `ok: true` with `head.status !== 'verified'` should carry the same caveat.
   - **`client/src/concept2cure/v2/surfaces/Part11Console.tsx` `ledgerVerdictOf` / `ledgerLine`** (about lines 92-102
     and 218-227).
     - `ok: null` already reads *"UNKNOWN — not verified, and not intact"*, which is right.
     - Add the head caveat for `ok: true` and the head words for `ok: false` without `brokenAt`.
2. **Each tenant read still reaches S3.** A ledger read, a document history read, a tenant verify-chain or an export
   lists `anchors/audit-chain/` and reads the latest anchor. A short memo of the latest anchor would bound that, as
   the licensing view does with 30 s. Since DP-72, an S3 outage no longer fails these reads; they say "not
   verified".
3. **The security register.** IAM-26, DP-71 and DP-72 are new rows for
   `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`. `grep verify-chain docs/security` finds nothing,
   so the route is in no baseline. The control tower should record them.
4. Residuals 1, 3, 5, 6, 7 and 8 above stand. Residual 2 is done in this round. Residual 4 is done for the server
   readers and the licensing panel; the rest of it is item 1 here.

### Files changed in the fix round

- `server/routes/c2c/actions.ts` (verify-chain: scope, redaction, 503)
- `server/services/audit/tenant-chain-verdict.ts` (head step caught; `TenantChainHead`, `ok: boolean | null`)
- `server/routes/audit-trail-ledger.routes.ts` (`AuditLedgerChainVerdict.head`, `chainVerdictOf`)
- `server/services/audit/audited-export.ts` (`walkTenantChain` carries `head`)
- `server/services/audit/signedAuditExport.ts` (`auditLogsChain.head`, `ok: null` → `unverified`)
- `server/services/audit/compliance-reports/types.ts` (`TenantChainWalk.head`)
- `server/services/audit/compliance-reports/queries/audit-trail-integrity.ts` (head in the chain row)
- `client/src/concept2cure/v2/surfaces/licensing/LicensingHistoryPanel.tsx`
- Tests:
  - `server/services/audit/__tests__/chain-head-on-demand.test.ts` (19 new cases: 17 red, 2 guards green on both; 2 retitled)
  - `client/src/concept2cure/v2/__tests__/licensingHistory.test.tsx` (3 new cases)
  - `tests/db/turn-record-purge-door.dbtest.ts` (the ceiling case)
- This README, and `red/fix-round/`, `green/fix-round/`.
