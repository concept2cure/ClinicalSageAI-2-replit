# P0-8 (grant half): the runtime role could UPDATE and DELETE the append-only audit stores (DP-04, High)

**Row:** D6 (D5 for the audit trail). **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-04, the
`app_service` DELETE grant. The archive-bypass half closed in `054c1764` and the sweep half in `e8724680`. The
anchored chain head is still open (see "Not done").
**Verified at:** HEAD `c6f2028b` (2026-10-01 06:07 UTC). The commits that landed up to `0e58e794` while this item
was in progress touch none of its files. The earlier, interrupted attempt left nothing in the tree: no diff on the
named files and no evidence folder. This folder is the whole record.

## What was wrong

The grant recipe (`scripts/db/provision-app-role.mjs`) gives the runtime role full DML (`SELECT, INSERT, UPDATE,
DELETE`) on every table in `public`. Only the `audit` schema had an append-only ceiling. Most append-only records live
in `public`:

- `audit_logs` and `audit_events`;
- the archive door's ledger, `audit_log_archives`;
- `electronic_signatures`;
- the AnA turn record (`ana_turn_records`, `ana_record_blobs`);
- `authoring_audit_trail` and `doc_revisions`;
- the artifact signatures and lock snapshots.

As `app_service` on PostgreSQL 16.13, under RLS, in its own tenant (`red/`):

| What | Result at HEAD |
|---|---|
| table privileges on the 11 stores (`red/probe-as-app_service.txt` §1) | UPDATE **t**, DELETE **t** on 10 of 11. Only `audit.tamper_proof_log` was held to SELECT, INSERT |
| `UPDATE <store> … WHERE false` / `DELETE FROM <store> WHERE false` (§3) | **UPDATE 0 / DELETE 0** on every store: the role may run these statements, and only the absence of a row keeps the trigger from firing |
| `DELETE` / `UPDATE` of a real audit row (§4) | refused by the **trigger** (`P0A02` / `P0A01`), not by any privilege |
| the same row with the trigger out of the way: owner sets `session_replication_role = replica`, then `SET ROLE app_service` (`red/probe-trigger-out-of-the-way.txt`) | **UPDATE 1, DELETE 1**: the role rewrote and removed an audit row |
| `electronic_signatures` column UPDATE (§2) | every column updatable, including `signer_id`, `signature_hash`, `signed_at` |
| the deploy's grant audit, `node scripts/db/audit-runtime-grants.mjs --role app_service` (`red/audit-runtime-grants-app_service.txt`) | **"holds the recipe posture on all 1286 relations", exit 0**. It checked the ceiling in `audit` only |

The immutability triggers were the only control. A restore without triggers, a logical-replica apply, an
`ALTER TABLE … DISABLE TRIGGER` or a superseded trigger left the application's own credentials able to rewrite the
trail. The deploy's step 5/5 reported that estate as deployable.

## What is true now

- **The recipe withholds UPDATE, DELETE and TRUNCATE on every append-only store, from PUBLIC and from the runtime
  role**, after the blanket per-schema grant (`withholdAppendOnlyPrivileges`). It runs on every call of the recipe:
  install-fresh 7/8, deploy-migrate 4/5 (`ensureRuntimeRole`) and every harness provision. Each deploy therefore
  withholds the privileges again, and takes back a hand GRANT or a PUBLIC grant.
- **One governed UPDATE stays possible: signature revocation.** `persistGovernedSignatureRevocation` sets
  `superseded_by` and the verification column group. The recipe grants UPDATE on exactly those five columns, which
  are the ones `trg_electronic_signatures_immutable` admits. `signer_id`, `signature_hash` and the other attested
  columns are not updatable.
- **The deploy's grant audit holds each store to SELECT, INSERT, wherever the store lives.** `auditRuntimeRoleGrants`
  feeds the readiness contract at deploy-migrate 5/5, `provision.mjs` and the `db:audit-grants` CLI. TRUNCATE is now
  probed. UPDATE on a store column outside the carve-out is reported as `UPDATE(col)`. A missing carve-out column is
  reported as denied, because the revocation would then fail. A store the runtime role owns is a failure. A widened
  store fails the deploy by name (`green/readiness-refuses-hand-grant-app_service.txt`):
  `holds privileges beyond the append-only ceiling on: public.audit_events (TRUNCATE), public.audit_logs (DELETE)`.
- **The archive door still works for the role that calls it.** `audit_logs_archive_delete()` runs as
  `audit_archiver`, so `app_service` with no DELETE of its own still archives a 26-month-old row and its ledger row is
  written (`green/probe-archive-door-after.txt`; dbtest case).
- **The store list is tied to the boot's trigger list.** `APPEND_ONLY_TABLES` and
  `EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS` (P0-9a) are pinned to each other by a unit test. Any trigger-guarded table
  left off the store list needs a written reason:
  - `authoring_comments`: comments are resolved and threaded, which updates them;
  - `vault.documents`: workflow columns are updated.

  `audit_log_archives` is on the store list but not on the boot list.

The stores, in `APPEND_ONLY_TABLES`:

- `audit.tamper_proof_log`
- `public.audit_logs`
- `public.audit_log_archives`
- `public.audit_events`
- `public.electronic_signatures` (UPDATE allowed on its supersession columns only)
- `public.ana_turn_records`
- `public.ana_record_blobs`
- `public.authoring_audit_trail`
- `public.doc_revisions`
- `public.concept2cure_signatures`
- `public.concept2cure_submission_snapshots`

A census on 2026-10-01 covered `server/` and `shared/`: raw SQL, Drizzle `.update/.delete`, `ON CONFLICT DO UPDATE`
and `FOR UPDATE/SHARE`. No runtime path updates, deletes, truncates, upserts or row-locks any of these stores, apart
from the revocation UPDATE above. Cascades from a parent run as the referencing table's owner (PostgreSQL RI
semantics), so the authoring delete's 409 path is unchanged. It passed in the db tier.

## Red / green

| Check | Red (HEAD recipe and audit) | Green (this change) |
|---|---|---|
| `tests/db/append-only-store-grants.dbtest.ts` (PG16, per-run role from the real recipe + `app_service`) | **9 failed** / 4 passed (`red/dbtest-append-only-store-grants.txt`) | **13/13** (`green/dbtest-append-only-store-grants.txt`) |
| Unit tests: `provision-app-role-append-only.test.ts` (new), `provision-app-role.test.ts`, `readiness-contract.test.ts` | **9 failed** / 47 passed. HEAD's two scripts were put back for this one run (`red/unit-final-set-against-HEAD-scripts.txt`) | **56/56** (`green/unit-final-set.txt`) |
| `app_service` probe: privileges, `WHERE false` statements, a real row | UPDATE/DELETE held; statements run; trigger refuses (`red/probe-as-app_service.txt`) | held: SELECT, INSERT only; every statement **42501**; revocation UPDATE runs (`green/probe-as-app_service.txt`) |
| Trigger out of the way (replica mode) as `app_service` | **UPDATE 1, DELETE 1** | **42501** both (`green/probe-trigger-out-of-the-way.txt`) |
| Archive door as `app_service` | 1 deleted, ledger row (holds DELETE: t) | 1 deleted, ledger row (holds DELETE: **f**) |
| Grant audit CLI on `app_service` | exit 0 while holding DELETE on 10 stores | exit 0 in the new posture; **exit 1 naming both stores** after a hand GRANT; step-5 verdict REFUSED, then ok after REVOKE (`green/readiness-refuses-hand-grant-app_service.txt`) |
| Recipe as an RDS-shaped applier (LOGIN CREATEROLE NOSUPERUSER owner, throwaway DB, PUBLIC DELETE grant planted) | — | stores held to SELECT, INSERT; the PUBLIC grant was taken back; carve-out columns only; audit clean (`green/recipe-as-rds-shaped-applier.txt`) |

## Existing database tests that touch audit stores

There are 59 files: `grep -l audit_logs`, plus every dbtest naming another store or the recipe, listed in the output
header. Run together with `app_service` in the new posture: **807 passed, 7 failed in 5 files**
(`green/db-tier-audit-files-new-posture.txt`). An A/B run put HEAD's recipe and posture back and re-ran the five
files (`green/db-tier-failures-AB.txt`).

| File | Cause |
|---|---|
| `tests/db/two-tenant-application-rls.dbtest.ts`: `audit_logs` and `signatures` "update and delete of tenant B are indistinguishable not-found" | **This change.** The test-only proof routes (`tests/db/tenant-proof-routes.ts`) PATCH/DELETE every domain as the runtime role. Those statements are now refused with 42501, which their handlers answer 500; the same file's POST handler already answers 42501 as an opaque 404. The fix is a file outside this item: `proposed-tenant-proof-routes.diff` maps 42501 to 404 in PATCH and DELETE. With it, the file passes **29/29** in a scratch tree (`green/two-tenant-with-proposed-proof-route-change.txt`). **Fixed in the tree in the fix round below**, with a narrower change than that diff. |
| `tests/db/master-licensing-console.dbtest.ts`: "under a PER-USER scope …" | Load-dependent. It passes alone in the new posture (`db-tier-failures-AB.txt`) and in HEAD's. |
| `server/mcp/__tests__/mcp-account-standing.dbtest.ts`, `tests/db/vault-version-checkin.dbtest.ts`, `tests/db/vault-versions.dbtest.ts` | **Fail identically in HEAD's posture**, so they are unrelated to this change: a session ending mid-consent, and VR-08 lineage triggers absent on this database. |

P1-24's `domain-history-append-only.dbtest.ts` passes 31/31. Its five stores are deliberately not in
`APPEND_ONLY_TABLES` yet (see "Hand-ons").

## The local database

`c2c_testdb` is shared with the other implementers. `app_service` there was moved to the new posture by the deploy's
own step-4 function, `ensureRuntimeRole`, run as the owner (`green/deploy-step4-ensureRuntimeRole-app_service.txt`,
06:14 UTC). For the A/B window it was returned to HEAD's posture by HEAD's own step-4 recipe (06:21 UTC), and then
moved back once that run finished (about 06:23 UTC).

Before each step-4 run, a check confirmed the recipe would change nothing else for `app_service`: no unreviewed
definer function executable and no unreadable table. Every probe row was written inside a rolled-back transaction
under tenant 92808. No `dbtest_p08_*` or `p08_*` role, audit row or ledger row remains (checked).

No migration was touched, so `ci:migration-set-order` and `ci:migration-drop-safety` do not apply, and the migration
manifest does not need regenerating for this item.

## Gates

`green/gates.txt`:
- `ci:audit-logs-fixture` OK.
- `ci:tenant-isolation` exit 0, with 0 candidates in this item's files.
- `check-unrun-tests` OK: 0 unrun, so the new dbtest and unit file are reachable.
- `check-db-test-isolation` OK.
- ESLint on the four TypeScript files: 0 errors, 0 warnings. HEAD's two edited test files also had 0.
- `scripts/**` is outside ESLint's scope by config.

Neighbouring unit suites, 384/384 (`green/neighbour-unit-suites.txt`):
- the SCRAM pin;
- the archive door on PGlite;
- the deploy-migration mechanism contract;
- the immutability-trigger list.

## Commands

```
# probes (as app_service; and as the owner for the replica-mode one)
psql "$APP_DATABASE_URL" -X -v ON_ERROR_STOP=0 -f probe-as-app_service.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=0 -f probe-trigger-out-of-the-way.sql
psql "$APP_DATABASE_URL" -X -v ON_ERROR_STOP=0 -f probe-archive-door.sql
# tests
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run server/db/__tests__/provision-app-role.test.ts \
  server/db/__tests__/readiness-contract.test.ts server/db/__tests__/provision-app-role-append-only.test.ts
TEST_DATABASE_URL=… APP_DATABASE_URL=… RLS_ENFORCE=on \
  npx vitest run --config vitest.db.config.ts tests/db/append-only-store-grants.dbtest.ts
# the deploy's grant audit
DATABASE_OWNER_URL=… node scripts/db/audit-runtime-grants.mjs --role app_service
```

## Hand-ons (files outside this item)

1. **`tests/db/tenant-proof-routes.ts`.** *Done in the fix round below, with a narrower change than this diff;
   this entry is kept as first filed.* Apply `proposed-tenant-proof-routes.diff`. Without it,
   `two-tenant-application-rls.dbtest.ts` fails 2 cases on CI's `test:db`, whose database deploy-migrate builds with
   this recipe.

   The file's header (lines ~52–59) says a cross-tenant UPDATE/DELETE on signatures "reaches the trigger … with the
   policy off". That stays true for the owner. For the runtime role, `audit_logs` and `signatures` now refuse by
   privilege before RLS. The RLS evidence for those two domains is the read/list/existence probes and the POST
   WITH CHECK probe.
2. **P1-24 (`migrations/20261001_domain_history_append_only.sql`, uncommitted).** Once it lands, add its five stores
   to `APPEND_ONLY_TABLES` in `scripts/db/provision-app-role.mjs`:
   - `workflow_history`
   - `document_audit_logs`
   - `regulatory_audit_logs`
   - `c2c_ana_actions`
   - `authoring_signatures`

   In the same change, make `refused()` in `tests/db/domain-history-append-only.dbtest.ts` accept
   `/IMMUTABILITY_VIOLATION|permission denied/`, or run that file's mutation legs as the owner. They were left out
   here because that dbtest asserts the trigger's message from the runtime role, which a withheld privilege would
   change to 42501.
3. **The D5 AnA-record lane (`…session_01T2wooC`, claimed 2026-10-01 03:11).** Its item (2), "P0-8 grant half: the
   runtime role holds no UPDATE/DELETE/TRUNCATE on the append-only record tables, and `auditRuntimeRoleGrants`
   fails on one", is delivered here for `ana_turn_records`, `ana_record_blobs` and `authoring_audit_trail`.
   That lane's turn-record erasure at purge must go through its NOLOGIN definer door. The runtime role no longer
   holds DELETE there.

## Not done

- **The anchored chain head (P0-8's other remaining half).** No chain head is written outside the database, so
  truncating the newest rows as the owner is still undetectable. That needs its own item.
- **A boot-time grant re-audit.** The deploy (5/5) refuses a widened store. A hand GRANT made after a deploy is not
  seen until the next deploy, or until someone runs `db:audit-grants`. The server boot checks the triggers (P0-9a),
  not the grants. A proposed follow-up: call `auditRuntimeRoleGrants(pool, current_user)` from
  `assertAuditImmutabilityForProduction`, so the boot refuses on a store's `excess` or `ownedAppendOnly`.
- **Trigger-guarded tables outside the boot's trigger list keep the runtime role's UPDATE/DELETE**, behind their
  triggers:
  - `compliance.audit_trail` and `compliance.electronic_signatures` (writes go through definer functions);
  - `charter_audit_events`, `device_audit_trail`, `evidence_chain_records`, `signing.signature_manifests`,
    `submission_orchestrator_steps`, `regulatory_harmonization.audit_log*`;
  - `truth.clinical_truth_store`, `prose.smart_fragment_versions`, `discovery.assay_results`,
    `registry.reconciliation_findings`, `intelligent_docs.*`.

  Each needs the same census before it joins the list. The pin makes adding one a one-line change.
- Seen in passing, unrelated: the db tier logs `column "organization_id" of relation "tamper_proof_log" does not
  exist` from `TamperProofAuditLog.log`. The local `audit.tamper_proof_log` lacks a column the writer now sends.

## Fix round (2026-10-01, adversarial verifier)

**What was wrong.** The verifier's one must-fix: the co-change to `tests/db/tenant-proof-routes.ts` was filed as a
diff, not applied. Its PATCH and DELETE proof handlers run UPDATE and DELETE as the runtime role and did not catch
42501. Since this item, the role holds no such privilege on `audit_logs` or `electronic_signatures`, so both handlers
answered 500. `two-tenant-application-rls.dbtest.ts` therefore failed 2 cases in the tree. CI's `test:db` builds its
database with this recipe, so it would have gone red. The item's acceptance line, "every existing dbtest that writes
audit rows still passes", was not met in the tree.

**What is true now.** `tests/db/tenant-proof-routes.ts` is changed in the tree. The change is narrower than
`proposed-tenant-proof-routes.diff`, for two reasons, and each is shown by a mutation run below.

1. **The 404 mapping is scoped.** `privilegeWithheld(domain, op)` reads `APPEND_ONLY_TABLES` from the recipe, so the
   store list is not restated. It is true for:
   - every DELETE on an append-only store;
   - every UPDATE on an append-only store outside that store's `updatableColumns`.

   `mutateOr404` answers 404 for a 42501 only when `privilegeWithheld` is true. Any other error still propagates and
   answers 500, including a 42501 on a table the product does update.

   The filed diff mapped every 42501 to 404. Under that diff, a runtime role that lost UPDATE on `projects` passed
   the proof as "indistinguishable not-found" (M2). That is an error rendered as an empty result.
2. **signatures' PATCH writes `verification_status`, not `signature_purpose`.** `verification_status` is a revocation
   carve-out column, and the only UPDATE the runtime role still holds on that table. So RLS is still what keeps
   tenant A off B's row, and the case still proves it.

   Under the filed diff, the PATCH was refused by privilege before RLS was reached. With the policy off it still
   answered 404 (M1), so the case proved nothing about RLS. With `verification_status`, the policy-off run reaches
   the §11.70 trigger and answers 500, as the file's header said of the pre-P0-8 posture.

The file's header has a dated note. It says which cases now prove the privilege rather than RLS: audit_logs' PATCH
and DELETE, and signatures' DELETE. For these, no statement is left for RLS to scope.

### Red / green

| Run | Red | Green |
|---|---|---|
| `two-tenant-application-rls.dbtest.ts` on `c2c_testdb`, `app_service` in the new posture | Proof routes at HEAD `bf83e12b`: **2 failed** / 27 passed. `audit_logs` and `signatures` "update and delete … indistinguishable not-found": *expected 404, got 500* (`red/fix-round-two-tenant-at-new-posture.txt`) | Proof routes as changed: **29/29** (`green/fix-round-two-tenant-at-new-posture.txt`) |
| Positive control: both variants, no mutation (scratch DB) | — | filed diff 29/29; applied 29/29 (`green/fix-round-scratch-positive-controls.txt`) |
| **M1**: RLS disabled on `public.electronic_signatures` (scratch DB) | Filed diff: signatures "update and delete" case **passes**, so it no longer sees RLS (`red/fix-round-M1-filed-diff-signatures-rls-off.txt`) | Applied: that case **fails**, *expected 404, got 500*: the UPDATE reached B's row and the trigger refused it (`green/fix-round-M1-applied-signatures-rls-off.txt`) |
| **M2**: `REVOKE UPDATE ON public.projects FROM app_service` (scratch DB) | Filed diff: **29/29**, the lost privilege is masked as not-found (`red/fix-round-M2-filed-diff-projects-update-revoked.txt`) | Applied: projects "update and delete" **fails**, *expected 404, got 500* (`green/fix-round-M2-applied-projects-update-revoked.txt`) |
| Item suites re-run at the new HEAD `bf83e12b` | — | Unit: 56/56 (`green/fix-round-unit-final-set.txt`). `append-only-store-grants.dbtest.ts` plus `report-os-tenant-from-session.dbtest.ts`, the other user of the two-tenant fixture: 27/27 (`green/fix-round-dbtests-append-only-and-fixture-neighbour.txt`) |

In M1, other cases fail in both variants: the RLS catalog check, the signatures list/read probes and WITH CHECK.
Those failures belong to those cases. The row above is about the update/delete case only.

### Where the runs were made

The mutation runs used a throwaway database, `c2c_p08_scratch`: a `pg_dump`/`pg_restore` of `c2c_testdb` on the same
cluster, so the same `app_service` role in the new posture. It was dropped afterwards. The shared database was not
mutated.

Each variant ran from a scratch tree outside the repo:
- `client`, `server`, `shared`, `scripts` and `node_modules` were symlinks to the repo;
- the two-tenant test, its fixture and `tests/setup.db.ts` were copies;
- `tenant-proof-routes.ts` was either HEAD's file with `proposed-tenant-proof-routes.diff` applied, or a copy of the
  tree file. Each output header records the file's sha256 prefix; the applied one is `3247861e37eaf37b`.

### Commands

```bash
DB='TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable APP_DATABASE_URL=postgresql://app_service:…@127.0.0.1:5432/c2c_testdb?sslmode=disable RLS_ENFORCE=on'
env $DB npx vitest run --config vitest.db.config.ts tests/db/two-tenant-application-rls.dbtest.ts
env $DB npx vitest run --config vitest.db.config.ts tests/db/append-only-store-grants.dbtest.ts tests/db/report-os-tenant-from-session.dbtest.ts
npx vitest run server/db/__tests__/provision-app-role.test.ts server/db/__tests__/readiness-contract.test.ts server/db/__tests__/provision-app-role-append-only.test.ts
npx eslint tests/db/tenant-proof-routes.ts      # exit 0, no output
# mutations, on the scratch copy only:
psql "$SCRATCH" -c 'ALTER TABLE public.electronic_signatures DISABLE ROW LEVEL SECURITY'   # M1, re-enabled after
psql "$SCRATCH" -c 'REVOKE UPDATE ON public.projects FROM app_service'                      # M2, re-granted after
```

`proposed-tenant-proof-routes.diff` is kept as filed, because the M1/M2 filed-diff runs used it. The applied change is
the tree file.

## Reconciled onto trunk, 2026-10-01 13:40 UTC

While this item was in review, the D5 lane landed the grant half on trunk (`06152498`: `APPEND_ONLY_TABLES` of ten
stores, `withdrawAppendOnlyWrites`, and a proof-route change that answered every 42501 with 404). One
implementation is kept (zero duplication). What this item adds on top of trunk's:

- `electronic_signatures` joins the stores, with `updatableColumns` (the revocation columns
  `persistGovernedSignatureRevocation` writes): the runtime role can no longer DELETE or TRUNCATE a signature, nor
  UPDATE any column the 11.70 trigger does not admit. The recipe (`withholdAppendOnlyPrivileges`) withholds and
  re-grants by column; the audit (`auditRelation`) reads column grants. Trunk's `withdrawAppendOnlyWrites` is removed;
  its test cases are covered by `provision-app-role-append-only.test.ts` (trunk's "cannot append → denied" case is
  ported into it).
- `tests/db/tenant-proof-routes.ts`: a 42501 answers 404 only where the recipe withholds that privilege
  (`privilegeWithheld`); any other 42501 is a 500. Trunk's blanket mapping is removed (mutation M2 above: a lost
  privilege passed as "not found").
- The store list is pinned to the boot's trigger list. Trunk added two boot-required stores that admit governed
  UPDATEs, `concept2cure_thread_comments` (a retraction) and `cre_evidence_sources` (status and one-way columns);
  they are listed as not append-only, with the reason.

Re-run on the merged tree: unit 57/57 (`provision-app-role`, `provision-app-role-append-only`,
`readiness-contract`); real PostgreSQL 43/43 (`append-only-store-grants`, `two-tenant-application-rls`).
