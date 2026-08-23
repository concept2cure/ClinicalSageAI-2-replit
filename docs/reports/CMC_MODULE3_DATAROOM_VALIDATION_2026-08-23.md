# CMC ↔ Module 3 ↔ Data Room Unification — Validation Report (2026-08-23)

Validates the work order
(`docs/plans/CMC_MODULE3_DATAROOM_UNIFICATION_WORK_ORDER_2026-08-23.md`)
against a live server on a freshly provisioned database, plus the unit and
route suites. Everything below was observed, not asserted.

## 1. Live end-to-end simulation — 27/27 checks pass

`scripts/dev/cmc-staff-simulation.sh` drives the real API as each CMC role,
against `npx tsx server/index.ts` + local Postgres 16 (fresh
`install-fresh` + migration set + pgvector). Final run: **27 passed, 0
failed**. The flow it proves, in role order:

| # | Role → action | Observed |
|---|---|---|
| 0-1 | Sign-in; rail entitlement verdicts | 200; `cmc` resolves entitled |
| 2 | Regulatory lead creates the program | 201; submission spine linked, PM anchor created (`projectAnchorCreated: true`) |
| 3-5 | Process dev / analytical / QC capture (DS, method, QC result) | 200 each — after the `organizationId`-in-body fix these accept the exact payloads the UI sends |
| 6 | QA sets the specification | 201 (the table now exists — see §3) |
| 7-8 | Stability study; batch record | 200 / 201 (batch after the dead-spine FK drop) |
| 9 | Governed change with `cmcProjectId` | 201; `module3WriteThrough: "recorded"` |
| 10 | Build-state before compile | **200** with `artifactRegistry: linked` — this exact call 500'd (22P02) for every wizard-created program before the spine resolver |
| 11 | Compile | 17 sections compiled, **17 bridged artifacts, 0 skips** — before the fix: 0 artifacts, silently |
| 12/12b | Contradiction sweep; resolve with note | 200 (the sweep 500'd unconditionally before — imagined columns, no tenant scope) |
| 13-14 | Export gate and placement, unapproved | both **409**, zero leaves written — fail closed, same verdict from one shared gate |
| 15 | 17 section approvals, Part 11 re-auth each | 200 × 17 |
| 16 | Export gate | passed |
| 17-19 | Sequence created; **placement** | **17 leaves placed** at `m3.1 … m3.2.S.x … m3.2.P.x … m3.3`, `coauthor_documents`-backed, sha-pinned |
| 20 | IND checklist | all 17 M3 sections visible as `approved` with blueprint titles — CMC data reaches the IND readiness screen |
| 21 | Data room | "Module 3 (CMC)" branch lists the 17 governed artifacts by CTD section; an upload with `documentType: MODULE_3` appears in "Uploaded files" |
| 22 | Second governed change | write-through `recorded` → section stale → **gate refuses again** ("1 section(s) went stale after approval") |

## 2. Suites and gates

- Affected suites: 19 test files / 132 tests pass (`server/api/cmc`,
  `server/services/cmc`, cmc-changes routes, project-vault branches, ana-ri
  lineage pglite). Earlier in the change set: 31 files / 286 tests across the
  client CMC suites, registry model, vault branches.
- Full `tsc --noEmit -p tsconfig.check.json`: clean.
- ESLint on every changed file: 0 errors (warnings pre-existing).
- Verified-by-failing: the rail test fails on the pre-change tree; the
  build-state test's pool mock throws 22P02 on any non-integer artifact-spine
  parameter (a regression to the raw TEXT id fails exactly like production
  did); gate-refusal tests run before the pass path; placement refusal was
  observed live before approvals (steps 13-14) and again after staleness
  (step 22).

## 3. Defects found ONLY by the live simulation (all fixed in this change set)

The mocked suites could never see these; the simulation §W8 demanded exists
now as a repeatable script because of them.

1. **Register bodies required `organizationId`** — every generated insert
   schema (`createInsertSchema`) required it; the routes stamp it from the
   session after parse; the UI rightly never sends it. Every register create
   in the product answered 400. Fixed: `.omit({ organizationId: true })` on
   all seven body schemas.
2. **`bridgeCompileToArtifact` wrote `'system'` into integer
   `created_by_id`** — every bridge failed on a conformant database and the
   old catch-and-warn hid it. Fixed: `createdById` option threaded from all
   six callers; NULL when no actor.
3. **`quality_specifications` had no provisioning path at all**, and
   **`cmc_batch_records`** lacked the columns its routes write plus carried an
   FK to the dead `cmc_projects` spine (the same FK migration 0017 dropped
   from the OS tables). Fixed: `migrations/20260823_cmc_register_store_parity.sql`.
4. **The contradiction sweep queried imagined columns with no tenant scope**
   (`method_name`, `study_name`, `project_id` on org registers; no org filter
   anywhere — a cross-tenant read on the shared uuid space). Fixed: real
   columns, org scoping on every query, uuid-guarded project filters,
   `status as "validationStatus"` per the engine's contract.
5. **`server/api/cmc/types.js` deletion broke server boot** — the earlier
   "zero importers" check missed five relative `./types.js` imports. Restored
   in `1228b9f7`; the lesson is recorded there.

## 4. Repo state

All work is committed directly to `concept2cure-v2` and pushed (Rule 0 — no
PRs, no side branches): rail promotion `d1d11096`, spine heal + placement
`e7d2878b`, data room `61d92da7`, change-control convergence `20352159`,
coherence `bf6a12b6`, docs `efaa2ee3`, `types.js` restore `1228b9f7`, and the
simulation-driven fixes in this commit.

## 5. Remaining gaps, honestly stated

- `module3BuildStateRoutes` still duplicates `getModule3BuildStatus`'s
  derivation (pre-existing; both now share the one spine resolver — full
  convergence is follow-up work).
- The IND lifecycle screen (`IndLifecycle.tsx`) is org-scoped (`rows[0]`)
  while CMC surfaces are program-scoped; the placed leaves appear correctly,
  but program context still does not travel across that seam.
- `window.C2C_PROJECT` does not survive a page reload (shell-level,
  pre-existing).
- Browser-level responsive verification of the rail entry was not run in
  this pass; the rail markup path is the existing `navItem` renderer with no
  new layout, and the registry/entitlement tests cover the logic. Screenshot
  verification remains open.
- `ENTITLEMENTS_ENFORCE` ships `off` and the `cmc` catalog row is
  unrestricted (`tiers: []`), so every org resolves entitled — deliberate
  (commercial gating = set tiers on the catalog row; per-tenant off = the
  existing admin toggle).
