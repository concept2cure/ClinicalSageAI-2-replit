# Four stale fixtures held 16 tests red for three days, and one of them had
# switched off a gate that exists to catch a 100%-failing route

**Row:** D5 (Part 11: the governed write path is proven, and its proof actually
runs). **Session:** `…01P6GWSv`. **Date:** 2026-10-11.

## Why this was taken

The 275707c7 CI run was two days stale. Re-running its failures against the
current head (`56ceff4e`) gave **16 failures across 7 files**, from four
distinct causes. Every one of those files was last touched on **2026-10-08** by
session `…01DiJJAk` — three days and six CI runs earlier, so well outside the
24-hour hand-on window in `docs/work-orders/README.md`. Nobody was racing them.
A red trunk blocks every launch row (RULE 2), so they were taken here.

**None of the four was a production defect.** All four were fixtures that had
fallen behind code that was correct — which is the failure mode CI's own
comment at `.github/workflows/ci.yml:1137` already names: *"every one was a
fixture that had not kept up with a fail-closed guard someone added
deliberately. So each of those guards had shipped unverified."* Each fix below
therefore removes the hand-transcription that drifted, rather than re-typing a
new copy of it.

## The four causes

**1. A gate that could not load — and so was guarding nothing.**
`tests/schema-contract/biopharma-programs-router-columns.contract.test.ts`
declared `sponsor_address` and `ind_type` **twice** in its fixture DDL: two
lanes each transcribed migration `20261008b` into it at different positions,
each with its own comment citing that same migration, and a merge took both.
PGlite refused the CREATE TABLE with `column "sponsor_address" specified more
than once`, so the file threw at load.

This one mattered beyond the red: that gate exists because all three handlers in
`server/routes/biopharma/programs.ts` once selected five columns the table never
had, and *"every request to /api/biopharma, and to /api/biopharma/:id, failed
100% of the time with 500 INTERNAL_ERROR"*. For three days the gate that catches
that was dead. The duplicate block was removed, keeping the copy whose position
matches the Drizzle definition, so the fixture's own column-for-column pin
against `shared/schema/programs.ts` passes and the gate is faithfully guarding
the router again.

**2. A test fixture that hand-wrote columns a migration owns.**
`consumers.pglite.integration.test.ts` failed every case with `column
c.catalog_state does not exist`. The column is real — `migrations/
20261008e_document_catalog_attribution.sql`, and it IS on the applier
(`scripts/db/migration-set.mjs:3092`), so production was correct. The test's
hand-written `ALTER TABLE vault.document_catalog` added only the pre-`20261008e`
columns.

Fixed by having `disposition-fixture.ts` read and apply that migration from
disk, as it already does for the disposition migration — and **twice**, as it
already does there, since both files replay on every deploy (RULE 1) and
applying each twice is what proves them replay-safe. A fixture built from the
migration cannot drift from it again.

**3. Three suites each holding a private copy of a security hardening's
statement.** `report-os-{audit-recording,finalize-signature,delivery-recording}`
each declared

    const STAMP = "SELECT set_config('app.current_tenant_id', $1, true)";

while `setTenantContextTx` now pins the isolation switches in the same
statement (`server/db/sessionScope.ts`, `switchPinTerms`) so a governed
transaction cannot inherit a bypass. The hardening is right; three string
compares were stale.

Replaced by one `tenantStampSql()` exported from the suites' shared harness.
A **function**, not a constant: `switchPinTerms` reads `RLS_ENFORCE` at call
time, and the harness module is imported before the env is loaded, so a
constant froze `app.rls_enforce` at `''` and disagreed with the route for any
developer whose `.env` sets it on — which is why the first attempt at this fix
still failed, with `'on'` received against `''` expected. Called at assertion
time, the expectation and the route read the same environment: green with
`RLS_ENFORCE=on` (local `.env`) and with it off (as CI runs, with no `.env`).

What these suites pin is the **order** — BEGIN, the stamp, the domain writes,
the chain row, COMMIT — and the tenant the chain row carries, which each case
asserts separately. The stamp's own text is `server/db/sessionScope`'s subject.

**4. An outline pin that had not followed its guidance table, and a wizard
helper that assumed it made the first request.**
- `japan-us-nonclinical-outline-repairs.test.ts` asserted the 2.6 subtree twice:
  once derived from `CTD_AUTHORING_GUIDANCE` (passing) and once against a
  hardcoded 7-code list (failing). `CTD_AUTHORING_GUIDANCE` has gained ICH M4S
  §2.6.2's seven leaves — 2.6.2.1 Brief Summary through 2.6.2.7 Tables and
  Figures, each with an M4S citation and `parentCode` — and the outline projects
  them faithfully. The written-out pin is **kept** (a derived-only equality
  would pass vacuously against an emptied table) and corrected to the real
  14-code set, with a note that it follows the table and never the reverse.
- `newProjectWizardRegulatedChoices.test.tsx` read the create body from
  `apiRequest.mock.calls[0][2]`. Step 2 now asks the server which markets
  support the filing, so call 0 is `GET /api/submissions/market-support` and its
  body argument is `undefined` — hence
  `Cannot read properties of undefined (reading 'productType')`. The helper now
  finds the call by method and path, which also pins where the project is
  created, and waits for that call rather than for any call.

## Proof

| | Before | After |
|---|---|---|
| The 7 suites | 16 failed, 75 passed, 6 skipped | **97 passed** |
| …with `RLS_ENFORCE=off` (as CI runs) | 16 failed | **97 passed** |
| Proof tier (the Lint job's failing step) | 1 file failed / 120 passed, 1366 tests | **121 files / 1372 tests passed** |
| Regression over every touched area | — | **134 files / 1688 tests passed** |
| The 20 suites sharing `disposition-fixture` | — | **341 passed** |

- `red.txt`: the 16 failures on the current head, with the four causes.
- `green.txt`: the runs above, both enforcement postures.

**Each repaired gate was then shown still to bite** — the real risk when an
expectation is derived from production code is that it becomes a tautology:

| Deliberate break | Result |
|---|---|
| `setTenantContextTx` stops pinning the isolation switches | **8 failures** |
| `setTenantContextTx` drops the stamp entirely | **10 failures** |
| The nonclinical blueprint drops `2.6.2`, orphaning its 7 leaves | **1 failure**, `2.6.2.1 has no parent section` |
| The wizard posts the project to the wrong path | **4 failures**, `the wizard never posted the project` |

Each diagnostic patch was reverted from a scratch copy and `git diff --stat`
confirmed clean before moving on; no production file is changed by this commit.

Two assertions were **strengthened** while their files were open, both within
their own stated subject: the nonclinical suite now rejects an orphan leaf (a
leaf whose parent is absent renders under a heading the author never sees), and
the wizard helper now pins the create endpoint.

## Still red on this head, not this lane's

- **Production Image Boot** — "Build the provision and production images".
- **Blank DB Provisioning** — "Guardrails — what a tenant purge cannot reach
  (ratchet)", on the new table `stats_computation_runs`.

Both are recorded on the board rather than silently left.

## Hand-on: the 2.6 subtree is expanded asymmetrically

ICH M4S gives a written summary at 2.6.2 (Pharmacology), 2.6.4
(Pharmacokinetics) and 2.6.6 (Toxicology), and defines leaves under **each**.
Only 2.6.2's seven leaves are in `CTD_AUTHORING_GUIDANCE`; 2.6.4 and 2.6.6 have
none. That is an authoring-content gap for the lane expanding the table, not a
defect in what ships — both sections exist with their own guidance. It is named
here and on the board so the expansion is finished deliberately rather than
left half-done. This session did not add them: content expansion is that lane's
work, and RULE 2 keeps this one on D5.

---

## Addendum, same day: a fourth suite carried the same stale stamp

The sweep that found cause 3 matched on the statement as a bare quoted string
and so **missed `server/routes/__tests__/setup.test.ts`**, where it sits inside
a trace line with a params suffix:

    `execute SELECT set_config('app.current_tenant_id', $1, true) ["1"]`

One case — *"POST /initialize writes the org, its admin, and the org's own
workspace under the org's tenant, in one transaction"* — was still red for
exactly the reason cause 3 names. This is not a report-os suite, so it derives
the statement from `switchPinTerms` directly rather than importing the report-os
harness: 14/14 with enforcement on and off, and 1 failure when
`setTenantContextTx` drops the stamp, so the trace still pins the order.

A broader sweep then checked **every** test file mentioning
`set_config('app.current_tenant_id'` and classified each as an expectation or a
self-issued statement. Three others assert it —
`withTenantConnection-scope-before-checkout.test.ts` (a drift-tolerant
`TENANT_LOCAL_SQL_PREFIX`), `saved-precedent-queries.rls.test.ts` and
`stability-tenant-isolation.contract.test.ts` — and all three pass in both
postures: 17/17. `setup.test.ts` was the last one.
