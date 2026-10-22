# Project/Vault current parent access: independent repair proof

This extends the frozen 2026-10-13 baseline in
`../../2026-10-13/project-vault-parent-access/` (5 native controls passed,
7 actual privacy failures). It does not overwrite that evidence or modify its
retained native rows, bytes, relationships or chained audits.

Canonical owned tests:

- `server/routes/c2c/__tests__/project-vault-parent-access.pglite.integration.test.ts`
- `tests/db/project-vault-parent-access.dbtest.ts`

The native test uses actual JWT authentication and the actual Projects,
preceding document-disposition and Vault routers. Owner credentials provision
uniquely tagged invented QA data only; authenticated reads/writes use the real
non-owner `app_service` role with RLS enforcement on, no superuser/bypass grants.
It installs no schema, role or substitute policy. No provider results or query
results are mocked. The filesystem spy calls through to actual retained bytes.

The disposable native database is `platform_ci_native_recheck_20261013`, served
by PostgreSQL 16 on local port 55432. It is distinct from the shared browser
database and the root's fresh-installer databases. Each run uses a fresh QA
organization and tag; rows/bytes/audits remain retained. The fixture ledger lists
the initial complete and partial runs, with no tokens or passwords.

## Final result

**43 native tests and 35 PGlite tests pass, zero skipped; scoped ESLint reports
zero errors and zero warnings.** Native43 finished at 01:05UTC on 2026-10-14
after the root's actual canonical1299/1299 migration replay, not a test-only
equivalent schema. The final PGlite35 rerun also passes after the new document
identity guard. Source/document records, bytes and governed audits are retained.

Vault and CRE have native ENABLE/FORCE flags. The actual restricted runtime
reads an explicit NULL-tenant `global_public` source, refuses NULL-tenant private
and foreign-tenant globally classified rows, and cannot INSERT a global source,
UPDATE it or DELETE it. Complete original rows remain equal after the attempts.
The unexpected-insert path is transactionally rolled back; no write capability
was substituted for public read admission.

Actual recorded Vault fixtures with NULL or foreign integer organization keys
are present under a currently accessible program. Their download requests
produce named409 `VAULT_TENANT_RECONCILIATION_REQUIRED` or generic404
`PROJECT_NOT_FOUND` before filesystem reads/audit writes. The originals remain
unchanged. Tree, full-text search and Project record cards omit both identities
and titles while still returning the legitimate document. This proves the
nullable retained-row boundary rather than inferring it from policy text.

Logs `native-41-after-canonical-replay-green.txt` and
`native-43-recorded-vault-tenant-green.txt` retain the complete successful runs;
`native-replayed-rls-catalog.txt` records canonical policy/owner/flag facts, and
`proved-source-sha256.txt` identifies tested source. This file does not claim
that a superuser owner is constrained by FORCE or independently claim a fresh
installer run. Root separately owns fresh-install validation.

## Observed results before schema repair

- PGlite: **35 passed, zero skipped**. Actual SQL and canonical full-text
  migration; includes owner/member/pending-reviewer/public controls, every
  private Project/Vault GET family, missing/duplicate/deleted/archived anchor
  behavior, current actor status, failed verification, paging/count and
  viewer-read versus lead-write downgrade. This is not an RLS proof.
- Native: **38 passed, 2 failed, zero skipped** out of 40 in the retained run.
  All seven native privacy failures from the baseline are now green.
- The two remaining native failures are actual schema facts: Vault has RLS
  enabled but `relforcerowsecurity=false`; the CRE integer tenant policy masks
  the exact `organization_id IS NULL AND visibility_class='global_public'`
  source that production readers correctly select. Neither failure is waived.
- A genuine valid native relationship setup found raw string JWT IDs passed
  into the new numeric actor service. The production owner normalized Vault
  writer actor propagation; the actual valid201 relationship control now passes.
- Fixture errors were corrected without weakening production protections:
  original insert now records final byte hash instead of changing an immutable
  hash; a missing-anchor QA program supplies its mandatory product name;
  Authoring creator OWNER grants come from the canonical insert trigger; the
  compare positive uses two real retained versions instead of same-version422.

Passing native checks include exact authorized bytes/hash and one actual read
plus download audit; private denial has no read or audit; accessible IDs precede
portfolio/library pagination and counts; current revoked membership401;
viewer lead403 with unchanged status/audit; role change between request admission
and transaction admission403; forbidden cross-private source adoption403 with
no source bytes/audit/target capture and original source binding retained;
creator-only unbound adoption201 and same-target replay200; relationship/history
projection omits a private counterpart while the original audit payloads and
hashes remain unchanged; whole-document Authoring grants expose record cards
while a grant to one section exposes no whole-document identity/title.

Native duplicate-anchor proof preserves the actual canonical unique index and
expects23505, then verifies the original single anchor. The PGlite legacy probe
separately proves duplicate-row409 admission rather than selecting a lowest ID.

## Narrow durable schema corrections under root ownership

Vault's creator is `db/migrations/044c_gcc_vault_schema.sql`. The existing durable
reconciliation is `migrations/20260905_vault_documents_organization_id.sql`, whose
header and `scripts/db/migration-set.mjs` explicitly deferred FORCE. In-place
ENABLE/FORCE amendments in both entry paths preserve current policies,
grants, table ownership, nullable quarantine and retained records. The canonical
program-first UUID resolver precedes the durable reconciliation. A superuser
owner is not proof that FORCE constrains a non-superuser owner; this evidence
only claims actual restricted runtime enforcement and catalog flags.

CRE needs a read-only exception for exact null-tenant plus `global_public`, not
an exception for NULL alone or for foreign tenant records carrying that class.
The expanded native test includes a raw restricted SELECT positive and
both classification negatives, plus actual runtime INSERT/UPDATE/DELETE refusal
with unchanged original rows and rollback of any unexpectedly accepted insert.

The root applied the actual canonical amendments and replay before the green
runs. Intermediate red logs remain as evidence of the failures the tests catch.

## Commands

Use Node22 and the configured local owner/runtime URLs (not recorded here):

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/routes/c2c/__tests__/project-vault-parent-access.pglite.integration.test.ts
node node_modules/vitest/vitest.mjs run --config vitest.db.config.ts tests/db/project-vault-parent-access.dbtest.ts
node node_modules/eslint/bin/eslint.js tests/db/project-vault-parent-access.dbtest.ts server/routes/c2c/__tests__/project-vault-parent-access.pglite.integration.test.ts
```

No compiler/build, baseline allowance, branch/worktree, commit or push was run
by the independent native test owner.
