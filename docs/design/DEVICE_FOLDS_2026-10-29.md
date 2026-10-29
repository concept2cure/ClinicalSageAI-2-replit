# Device folds: the remaining in-shell device "apps" into core (D2, 2026-10-29)

Founder direction, 2026-10-29: "We are moving most 'app' into core functionality and away from any out of process 'app'." On 2026-10-23 the founder made 21 device surfaces features of the client's project (`62a8d5e7`, `shared/constants/launch-scope.ts`, `MDX_PROJECT_FEATURE_SURFACE_IDS`).

Done on 2026-10-29:
- the map of the 21 (`9cf764e5`);
- device-tasks folded into Tasks (`2168fd56`);
- Pre-Sub, UDI and labeling reached inside the project (`ca88fa26`);
- human factors reached inside the project (`8658aa74`);
- device API claims narrowed (`11a7d5ce`).

This file is the plan for the rest, read at `96537cfe`. Line numbers are at that commit.

The placement map that governs these folds is `.design/client-journey/FUNCTION_PARITY.md`, `INFORMATION_ARCHITECTURE.md` §5 and `A2_10_REMAINING_FOLDS.md`. This file applies it; it does not replace it.

## The common checklist (from `2168fd56`; every fold does each step)

1. **Delete the source component** and any hook or test that nothing else imports. Grep for importers first.
2. **`mdx/MdxSurfaceHost.tsx`** (host-mounted ids only): the import (:41-57), the meta entry (:104-165), `ORGANIZATION_VIEWS` (:180-182), the publish call (:339-353) and the switch case (:357-445).
3. **Remove the id** from `mdx/surfaceIds.ts`, `v2/surfaceViews.ts` and `ui-surface-registry(.ui-v2).ts`. Move each `apiPrefixes` entry the target's screen now calls onto the target. `launch-scope-device-features.test.ts` fails a family that no screen calls; its `HOOKS` list changes too.
4. **`v2/registryModel.ts`:**
   - add the alias to `DEEP_LINK_ALIASES` (and `ALIAS_APPLIES` where a filter applies);
   - remove the id from `NAV_GROUP_OF`, `NAV_HIDDEN`, `SEGMENTS.focus`, `SURFACE_ACTIONS` and `SEGMENT_MODULES`.
5. **Remove the id** from `launch-scope.ts` and `mdx-project-features.ts` in the same commit, with a guard in `launch-scope.test.ts`.
6. **Catalogue (Rule 1):** take the id off the keep-list and upsert in `db/migrations/20260810_reconcile_module_catalog.sql`, and off the packaging row in `20260823_module_catalog_commercial_packaging.sql`. Amend both in place with a dated header. No DELETE; subscriptions are kept. Add fresh-database and replay cases to `catalog-module-claims.contract.test.ts`.
7. **The AnA target** in `shared/navigation/index.ts` stays and resolves through the alias. Re-register any surface actions on the target.
8. **Retarget the tour stops** in `shared/navigation/demo-scripts.ts`.
9. **CI:**
   - `check-ana-surface-context.mjs` `ID_BASELINE`: minus one per retired publisher;
   - `check-launch-scope-api.ts` `REAL.components`;
   - `dump-v2-surfaces.spec.tsx`;
   - `ProjectMdxWorkflow.test.tsx` `NO_PROJECT_DOOR`.
10. **A fold guard** modelled on `foldDeviceTasks.test.ts`. Red first, then mutations.
11. **Gates:**
    - ci:launch-scope, ci:launch-scope-api and its selftest;
    - ana-surface-context and surface-discoverability;
    - migration-drop-safety, migration-set-order and migration-deploy-path;
    - check:catalog-copy;
    - program-ownership-single-source and sql-interpolation.

**Tenant pattern:**
- When a request names a program, call `admitProject` (`server/lib/admit-project.ts`, over `programInOrganization`) before reading or writing anything.
- A program key is added the way `migrations/20261029_hf_engineering_files_program_key.sql` does it: nullable uuid, a same-organization FK `NOT VALID`, a partial index, placed before `UUID_TENANT_ISOLATION_NONPUBLIC`. Legacy rows keep NULL and never show under a project.
- Writes take `requireEditorAccess` (`43fb57cc`).

## F1. design-controls and risk into device-engineering (L, about 14-18 h)

### What already exists

- **design-controls** (`v2/surfaces/DesignControls.tsx`):
  - `GET /api/design-controls` is organization-only (`server/routes/design-controls.routes.ts:32-63`).
  - The POST takes no program and has no editor gate (:74-124).
  - `c2c_design_controls` has no program column (`db/migrations/20260717_design_controls_store.sql`).
  - There is no catalogue row and no AnA target.
- **risk** (`v2/surfaces/Risk.tsx`):
  - It reads `/api/mdx/risk-items` with no program (:154), so a project shows the organization's register.
  - Add hazard sends no programId.
  - "Accept residual" is a plain status PATCH with no reason and no signature (:505, :769), while the tour calls it "a signed human judgment" (`demo-scripts.ts:310`).
  - `mdx-risk-management.ts` never checks program ownership on reads (:114-139). It stores the body's programId unchecked (:163, :210). Its writes have no editor gate.
  - `risk_items.program_id` has a single-column FK (`migrations/20260507_mdx_beta_surfaces.sql:61`).
- **Target** (`mdx/surfaces/EngineeringSurface.tsx`, over `GET /api/mdx/engineering/:programId`, which admits the project since `ad0b119b`):
  - Risks are read per project. The trace is read per organization (`mdx-engineering.ts:247`), so the screen hides it.
  - The heatmap is residual only, the risk list shows 4 rows, and there are no writes.

### Parity (real today unless marked)

- **design-controls:**
  - the trace matrix: partial;
  - gap breakdown, "close the first gap", the §7.3 checklist, add-input and per-row Ask AnA: missing;
  - the "store not provisioned" state: present;
  - record V&V: not real.
- **risk:**
  - the register: partial (this project only, 4 rows);
  - the 5×5 matrix: partial (residual only);
  - hazard drawer, metrics, add hazard, add control and accept residual: missing;
  - AnA driving the matrix: missing (registered on `risk`);
  - verification-of-effectiveness evidence: not real.

### Work

1. Tenant safety:
   - `design-controls.routes.ts` takes `program_id` through admitProject, reports `meta.scope`, and takes an editor gate on the POST;
   - `mdx-risk-management.ts` runs admitProject on GET, POST, PATCH and risk-summary, with editor gates;
   - a program key on `c2c_design_controls`, on the hf pattern;
   - optionally, a same-org FK on `risk_items`.
2. "Accept residual" becomes a signed act through the repo's ceremony (`signGovernedAct`, or `verifyReauth` + `persistGovernedActionSignature`, as `ci:sign-ceremony` requires).
3. `mdx-engineering.ts:247` filters the trace by program.
4. EngineeringSurface gains:
   - the trace, checklist, gap action and add-input form;
   - the initial/residual toggle, drawer and metrics;
   - the hazard and control forms, sending programId.
   `risk.*` AnA actions move to device-engineering.
5. The fold: aliases `risk` and `design-controls` → `device-engineering`.

**Decisions:**
- rows with no project stay NULL (the hf precedent) or get an "assign to this project" act;
- grant mapping for organizations holding `risk` but not `device-engineering`.

## F2. ivd-completeness into device-diagnostics (M, about 6-8 h)

### What already exists

- `v2/surfaces/IvdCompleteness.tsx` reads `/api/ivd-completeness/completeness` for the organization.
  - The route reads four tables by organization only, although each has `program_id` (`ivd-completeness-routes.ts:163-237`).
  - GSPR is LIMIT 1 per organization, and its table keys on `project_id TEXT`.
- The embedded `IvdAssessmentWorkbench` is project-scoped and governed. Its store, `migrations/20260610_ivd_assessments.sql`, is on no deploy applier.
- **Target:** `mdx/surfaces/IvdSurface.tsx`, with per-program panels and no completeness or PER panel.

### Work

1. The route runs admitProject and filters all five reads.
2. The family board moves into IvdSurface as its readiness panel, with `IvdAssessmentWorkbench` mounted there.
3. `20260610_ivd_assessments.sql` goes on `C2C_MIGRATION_FILES` before the sweep, and the baseline shrinks.
4. admitProject on the `ivd-assessments.ts` list.
5. Then the fold: alias to `device-diagnostics`.

**Decision:** grant mapping (`FUNCTION_PARITY.md:751`).

## F3. device-vault into Vault (L, about 10-14 h)

### What already exists

- `mdx/surfaces/VaultSurface.tsx` reads `/api/mdx/vault?program_id`: all of the project's `concept2cure_artifacts`, with versions and audit. That route has no ownership check on `program_id`.
- **Target:** `v2/surfaces/Vault.tsx` over `project-vault.ts`, behind `installProjectRouteAccess`.
  - It lists artifacts only where `ctd_section LIKE '3.%'`.
  - Versions, history and hash cover uploads only.

### Work

1. A "Drafted by AnA" branch over every non-archived artifact (hash, author, version).
2. Versions and audit reads for artifact leaves, under project route access.
3. A status breakdown and Ask AnA on those leaves.
4. In the same change as artifacts-center (`FUNCTION_PARITY.md:674-685`).

**Risk:** every client uses Vault.

## F4. device-analytics into Reporting & analytics (M, about 5-7 h)

### What already exists

- `mdx/surfaces/AnalyticsSurface.tsx` reads `/api/mdx/analytics`, which is organization-wide and not access-scoped.
  - Its KPIs count every program, drug projects included.
  - Three facets are null, and the facet routes have no caller.
- **Target:** `v2/surfaces/Insights.tsx` over `/api/insights-canvas/overview`, scoped by `getAccessibleReportProjectIds`.

### Work

A device section in the overview (status counts, pace, acceptance rate) over accessible projects only.

**Decision:** the tier. device-analytics is professional; insights is standard.

## F5. device-validation (S) and device-submission (L) into Submission Center

### What already exists

- Both live in `mdx/workbench/Workbench.tsx`, over `c2c_submission_packages` and `c2c_blockers`. Their only creator, `migrations/0002_phase15_submission_ops.sql`, is on no deploy applier.
- **Target:** Submission Center's device table over `estar_submissions`, which is on the set and admits the project.
- Validation's "Pass" for low-severity blockers is a defect and is not carried.

### Work

- **Validation:** delete, if its organization-wide list is dropped. That is decision 2.
- **Submission, after decision 1:**
  1. one store, migrating with `to_regclass` guards;
  2. a status filter;
  3. a per-row gate from EstarFilingPanel's readiness;
  4. an event history (an additive public table);
  5. repoint AnA's `create_submission_package`.

## F6. device-workstream into Projects (A2.10; S-M, about 3-5 h)

### What already exists

- `mdx/surfaces/Overview.tsx` renders from the host's `default:` branch.
- The `mdx` alias already lands on filtered Projects.
- The Client Review Room is not verified against the program (`mdx-client-review.ts:5-23`).

### Work

1. Render activity in both Projects views.
2. Alias to `projects` with the MDX filter.
3. The host never draws Overview.

## Ordering

1. **F1 first.** It does the most for the filing path and needs no founder decision:
   - the risk file and design-control trace feed every device submission;
   - today a project shows the organization's risk register;
   - "Accept residual" claims a signature it doesn't take.
2. **F2 and F5-validation** alongside.
3. **F3** (with artifacts-center), then **F4**.
4. **F5-submission** as soon as the founder chooses the store. It has the largest filing-path effect.
5. **F6** when its decisions land.

The product files of the folds don't overlap. The checklist edits do (launch-scope.ts, `ID_BASELINE`, the migration-set insertion point, the tours, the host), so build in parallel and land each fold's checklist commit one after another.

## Founder decisions

1. One device-filing store (`FUNCTION_PARITY.md:173`). The evidence favours `estar_submissions`: it is on the deploy set, and the package store's creator is not.
2. Whether to keep an organization-wide blocker list over `c2c_blockers`.
3. The tier for device-analytics.
4. Grant mapping for risk → device-engineering and ivd-completeness → device-diagnostics. New grants are barred (`A2_10_REMAINING_FOLDS.md:64-66`).
5. The device-workstream strip figures and the Client Review Room.

## Not determined

- Whether `c2c_submission_packages` and `c2c_blockers` exist on deployed databases.
- Which organizations hold the source grants, and how many rows have no project. There is no production database here.
- Whether a global mutation middleware writes the audit rows that DesignControls and the risk route promise.
- How design-controls is entitled, since it has no catalogue row.
