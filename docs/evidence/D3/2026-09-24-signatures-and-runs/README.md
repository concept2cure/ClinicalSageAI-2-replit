# D3 — signed approvals and Submission Center runs inside the two-tenant contract

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-24. **Database:** PostgreSQL 16, provisioned from an empty
database by `scripts/db/provision-test-db.sh` (install-fresh + deploy-migrate)
at `0521402e`, script exit 0, 973 public tables. The runtime connects as
`app_service` — not superuser, no BYPASSRLS — with `app.rls_enforce=on`. Both
tables below have RLS enabled **and** FORCEd, are owned by `postgres`, and carry
`tenant_isolation_policy` keyed on `organization_id`. See `posture.txt`, read
from the catalog after every mutation was reverted.

**What this is not:** the row's closing evidence. D3 closes on the contract
passing against staging with the production image, which is owed with D1. This
is the same contract, on a from-blank local install, in the same posture.

## What was added, and why these two

`tests/db/two-tenant-application-rls.dbtest.ts` is the contract D3 names; its
header calls its domain list "the coverage number". Two launch-catalog stores
were missing from it:

| Domain | Table | Why it matters |
|---|---|---|
| `signatures` | `public.electronic_signatures` | 21 CFR Part 11 §11.50/§11.70. A cross-tenant read here is another company's signed approvals — the most consequential table in the contract. |
| `orchestrator_runs` | `public.submission_orchestrator_runs` | Submission Center: every sequence build. Keyed on `run_id`, not `id`. |

Each gets the contract's three shapes: list/filter/read/existence probe hides
tenant B from A; update and delete of B's row are an indistinguishable 404;
`WITH CHECK` refuses a row planted into B without leaking details. 23 → 29.

## Why signatures had been left out, and how they are in now

On 2026-09-19 signatures were deliberately excluded, on the record. The
`esign_block_mutation()` trigger refuses UPDATE and DELETE with no archive door
(unlike `audit_logs`, whose trigger allows `app.audit_archive_bypass`). A
fixture signature can therefore never be removed, and it pins its organization
and signer through foreign keys, so the teardown's user and org deletes failed
with 23503 and stranded every fixture after them.

The obstacle still holds. It is designed around, not worked around:

(In `tests/db/two-tenant-fixture.ts` since `26e30b87`; see below.)

- each fixture org has a **permanent signer** (fixed email, NULL
  `default_organization_id`, so the users-by-org delete never reaches it);
- each org has **one fixture signature**, looked up before it is inserted;
- teardown **no longer deletes the two reserved organization rows**, which the
  signatures reference. `beforeAll` already upserted them on every run, and no
  other file uses ids 90301/90302 (checked).

**Nothing disables the trigger.** §11.70 is enforced against this contract
exactly as against the product.

Repeat runs are stable: after runs 1, 2 and 3 there were exactly 2 fixture
signatures and 2 signers, 0 orchestrator runs and 0 per-run users left behind
(`green/contract-29-of-29-run2.txt`, `-run3.txt`).

## The evidence

| File | What it shows |
|---|---|
| `posture.txt` | Role flags, RLS/FORCE/owner and the policy expression for both tables, the §11.70 trigger enabled, and the permanent rows that exist by design. |
| `green/contract-29-of-29-run2.txt`, `-run3.txt` | **29 of 29**, twice in a row, proving the fixtures are reused rather than accumulated. |
| `red/mutation-A-rls-disabled-on-electronic_signatures.txt` | RLS off on that one table. **4 fail, 25 pass.** A lists B's signature (`expected [ '1', '2' ] to not include '2'`); a forged signature lands in B (`got 201`); update/delete return **500**. |
| `red/mutation-B-rls-disabled-on-submission_orchestrator_runs.txt` | RLS off on that one table. **4 fail, 25 pass.** A lists B's run; update/delete return **204** — A really modified and deleted B's run; a forged run lands in B (`got 201`). |
| `red/mutation-C-old-bare-else-forge-is-blind.txt` | The forge handler put back to its old shape, signatures' RLS off. **"signatures: WITH CHECK rejects planting a row" PASSES** while signatures have no RLS at all. See below. |
| `green/contract-29-of-29-after-mutations.txt` | **29 of 29** after every mutation was reverted and the posture re-read. |
| `green/contract-43-of-43-combined-with-report-os.txt` | **43 of 43**: this change merged with the concurrent Report OS cases, run together before landing. |

`npm run test:db` on the same database after the change: 44 files, 572 tests,
all passing.

**Combined with a concurrent extension.** While this was being filed, another
D3 session landed 14 Report OS cases in the same file (`b4a22a78`,
`docs/evidence/D3/2026-09-24-report-os-tenant/`), taking it to 37. The two
auto-merged, and the combination had never run, so it was run before landing:
**43 of 43** (`green/contract-43-of-43-combined-with-report-os.txt`), with the
teardown still leaving 0 per-run users and 0 orchestrator runs behind. One
migration reached trunk after this database was provisioned,
`db/migrations/059_gcc_vector_embeddings.sql`; it touches neither table added
here, but the database is `0521402e` plus nothing, and that is stated rather
than implied.

### Why mutation A's 500 is itself evidence

The trigger is row-level, so it fires only on a row the statement can **see**.
In the green run, A's DELETE of B's signature matches zero rows — RLS hides it —
and the trigger never fires: 404. With the policy off, the same DELETE reaches
B's row and the trigger refuses it: 500. So the green run's 404 is the policy
at work, not the immutability trigger answering on its behalf. Without that
distinction a signature test could pass for the wrong reason.

### A defect in the contract itself: the forge handler could test the wrong table

The `POST /proof/:domain` handler (now in `tests/db/tenant-proof-routes.ts`) had explicit branches for five domains and a
bare `else` that **forged a risk item**. A domain added to the list without its
own branch would have planted a row into `risk_items`, been refused by *that*
table's policy, answered 404 — and passed, having tested nothing about its own
table.

Mutation C shows this happens. Under the old handler, with RLS removed from
`electronic_signatures`, the signatures `WITH CHECK` case passes. Under the new
handler it fails with a 201 (mutation A). Every domain now has an explicit
branch, and an unhandled domain answers 500 `UNHANDLED_DOMAIN`, which fails its
test instead of passing it.

## A second concurrent change: the route scaffolding moved

While this was being pushed, `610049af` moved the `/proof` routes and the
domain list out of the test file into `tests/db/tenant-proof-routes.ts` (to get
the file under the ESLint line limit), verbatim — which meant it carried the
five-domain list and the bare-`else` forge handler. The merge conflicted and
was resolved onto that structure, not against it: the domain list, maps and
forge-handler fix went into the new module, the fixtures and teardown into the
test file, and two of that commit's lines that prettier would have reflowed were
put back exactly as written, so the diff to its file is this change only.

Because the code the evidence above ran against had moved, the resolved version
was proven again on the same database:

| File | What it shows |
|---|---|
| `green/contract-43-of-43-resolved-onto-proof-routes-module.txt` | **43 of 43** on the resolved code, all six new domain cases present. |
| `red/mutation-B2-resolved-structure-rls-off-on-runs.txt` | RLS off on `submission_orchestrator_runs`, resolved code: **4 fail, 39 pass** — the moved handlers still catch the breach. |
| `red/mutation-D-forge-branch-removed-fails-not-passes.txt` | The `orchestrator_runs` forge branch deleted: its WITH CHECK case now **fails** (`got 500`, `UNHANDLED_DOMAIN`). Under the old handler the same deletion would have forged a risk item and passed. |
| `green/contract-43-of-43-forge-as-exhaustive-record.txt` | **43 of 43** after the final form below. |
| `red/mutation-E-forge-entry-removed-is-a-type-error.txt` | The final form: deleting the `orchestrator_runs` entry is `TS2741: Property 'orchestrator_runs' is missing … required in type 'Record<Domain, Forge>'`. The intact file has 0 errors. |

**The final form of the fix.** The ESLint warning ratchet (CI only) showed the
two new branches took `mountTenantProofRoutes` to 121 lines (limit 100): +1
warning, attributed to this change by `--since origin/concept2cure-v2`. Moving
the forge SQL out of the function into `forgeFor: Record<Domain, Forge>` fixed
that (delta 0) and made the defect impossible rather than caught: a domain with
no forge entry no longer reaches a runtime 500, it does not compile. So the
runtime `UNHANDLED_DOMAIN` path of mutation D is superseded by mutation E.

The full ratchet also reads 6433 against a baseline of 6431 without this change
(6434 with the +1 above, removed before landing). That +2 is on trunk already
and is not from this work; it is recorded, not chased, because it is outside D3.

## A third concurrent change: the fixture moved too

Before this could land, `26e30b87` split the contract again: the fixture
(constants, tokens, provisioning, teardown) went to `tests/db/two-tenant-fixture.ts`,
shared by `two-tenant-application-rls.dbtest.ts` and a new
`report-os-tenant-from-session.dbtest.ts`. Resolved onto that structure: the
permanent signers, the signature and run seeds and the teardown changes are in
the shared fixture; the domain list and forge record stay in
`tests/db/tenant-proof-routes.ts`.

That commit states "Afterwards no fixture org remains." With signatures in the
contract that property cannot hold — a §11.70 signature is permanent and
references its org — so it is retired explicitly, in a comment where the
organizations delete used to be, rather than broken silently. No other suite
can collide with the two kept rows: every other `tests/db` suite reserves its
own id band (90001–92149, none overlapping 90301–90302), and the one that
deletes by slug matches `dbtsi-%`.

| File | What it shows |
|---|---|
| `green/contract-45-of-45-every-suite-on-the-fixture.txt` | After `6ea13fd7` added a third suite on the same fixture (`traceability-update-boundary.dbtest.ts`) and three tables to its teardown: all three suites together, **45 of 45** (29 + 14 + 2), with the two org rows kept. |
| `green/contract-43-of-43-on-shared-fixture-two-files.txt` | Both files on the shared fixture: **43 of 43** (29 + 14), all six new cases present; afterwards 0 per-run users, 0 runs, 0 memberships left in the fixture orgs. ESLint ratchet `--since`: no file changed its warning count. |

## Permanent rows this work left in the scratch database, stated plainly

The local `c2c_d3` database now permanently holds **3** signatures in the
fixture orgs: the 2 fixtures, and 1 that mutation A planted into org B through
the disabled policy. §11.70 makes it undeletable, which is the trigger working.
It is a scratch database, dropped and rebuilt by the next
`provision-test-db.sh`. Tenant B's list does return that row, but no assertion
depends on it: every check names a specific fixture id. Nothing was planted
anywhere else. Mutations B and C planted nothing that survived teardown (0
orchestrator runs left in the fixture orgs).

## Still asserted, not proven

- **Staging.** The row closes there, with the production image, owed with D1.
- **`capa_records`, `complaints`, `mdr_events`, `capa_actions`,
  `vigilance_events`** carry no `organization_id` and no RLS. Their isolation is
  service-layer only: every query in `capaMdr.service.ts` joins
  `regulatory_programs` and filters on organization (all 24 query sites checked
  on 2026-09-19). That is asserted, and cannot enter this contract without a
  policy that joins through the parent. The CAPA surface is not in the launch
  catalog, so it is recorded here rather than worked on.
- Three other tables named `electronic_signatures` exist in non-public schemas
  (`cognitive_audit`, `compliance`, `regulatory_harmonization`; read from
  `pg_tables` on this database). This contract covers
  `public.electronic_signatures`. That is the table the canonical writer
  reaches: `server/services/part11/signature-persistence.ts` issues an
  **unqualified** `INSERT INTO electronic_signatures`, and as `app_service` that
  name resolves to `public` — `search_path` is `"$user", public`, no role or
  database setting overrides it, there is no `app_service` schema, and the
  server sets no `search_path` at runtime (the one mention in `server/` says so).
  An unqualified name is only as safe as that search path; a schema named
  `app_service`, or a role-level `search_path` change, would silently point
  signing at another table.
