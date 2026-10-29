# Vault saved views: personal and organisation-wide

**Date:** 2026-10-29. **Base commit:** `73f5ec68e8` (`concept2cure-v2`, clean tree). All line numbers below were re-read at that commit.
**Launch row:** D2. **Workstream:** Vault, Veeva gap 7 (`docs/design/VEEVA_GAP_2026-10-22.md` §7, line 204).
**Name of the work (Rule 3, point 4):** *extend the saved-query store (`saved_precedent_queries`) to hold Vault saved views, put its creator on the deploy path, and reach it from the Vault find view.* This adds no new store, table, surface or UI file.
**Evidence:** `docs/evidence/D2-VAULT-SEARCH/2026-10-29-saved-views/README.md` (with its own "What already exists"), plus `red.txt` and `green.txt`. The directory sits beside `2026-10-22-find-view/` and `2026-10-22-facets/`.

---

## 1. Decision recorded

The founder decided on 2026-10-22 that Vault saved views are **both** personal and organisation-wide. It is already on record as **P-46** (`docs/LAUNCH_DEFINITION_OF_DONE.md:793-813`). This design records nothing.

P-46 fixes these points:
- A personal view is seen, renamed and deleted by its owner only.
- An organisation view is seen by every member.
- A view stores parameters, never results or counts.
- A view naming a project or a folder is re-scoped when it runs.
- A view can never hold a filter the search would refuse.
- No fixture store and no browser-only store.

P-46 left one question to this design: **who may create, rename and delete an organisation view.** §3.3 answers it. Recording that answer under P-46 is the lead session's call.

How this design reads "every member": an organisation **library** view (all accessible projects) is listed to every current member. An organisation **project** view is listed only to members who can currently open that project. This is P-46's own re-scoping rule ("a project the reader can no longer open contributes nothing") applied to the list.

### Choices this design makes where the two judges disagreed or left a question open

| # | Question | Decision | Why |
|---|---|---|---|
| C1 | Visibility vocabulary | `'private' \| 'org_public'`. The UI says "Personal" and "Organisation". | The repo already names these two states (`server/routes/c2c/project-sharing.ts:17,20`; `shared/schema.ts:5799`). Rule 3 applies to vocabularies too. |
| C2 | Organisation-manager predicate | Reuse `hasOrganizationProjectManagementRole` (`server/services/project-sharing-access.ts:39-41`). | Both designs proposed exporting a new one over `ORG_MANAGE_ROLES`. One is already exported and documented as "the canonical organization-wide project administration policy". `program-access.ts` is not touched. |
| C3 | `regulatory_programs_id_org_uq` | Create it when absent, inside the guarded block. | This is the idiom of all 11 files that use it (`grep -l regulatory_programs_id_org_uq migrations/`), each with an identical definition. In the set it never fires, because creators precede. In install-fresh's sorted overlay, 20260505 sorts before every other creator, so create-when-absent removes any dependence on sort order. Judge 2's "third creator" concern does not apply: there are already eleven. |
| C4 | Overlay ordering of 20260505 (before `20260524`, the creator of `regulatory_programs`) | Raise SQLSTATE `42P01` with "does not exist" in the message when `regulatory_programs` is absent. | install-fresh's `isMissingDep` (`scripts/db/install-fresh.mjs:1221-1223`) then defers the file to pass 2 instead of recording a hard failure (`:1284-1294`) and reporting INCOMPLETE. |
| C5 | One creator for the constraints | The SQL file only. The Drizzle model declares the columns and the plain index but no `check()` and no key. `updated_by` has no FK in either place. | Every constraint is added under a name guard. A developer's `drizzle-kit push` that drops one is undone by the next run of the set. `regulatory_programs` has no pushed model (`shared/schema/programs.ts` is not re-exported from `shared/schema.ts`), so the composite key cannot be declared in Drizzle anyway. |
| C6 | Timestamps | Convert `created_at`, `updated_at` and `last_run_at` to `timestamptz` (USING `AT TIME ZONE 'UTC'`), conditionally. | The new Vault statements are raw SQL through node-postgres, which parses a naive `timestamp` in the Node process's local zone. No `TZ` is set anywhere in the deploy (`grep TZ= Dockerfile* .github/workflows/deploy-aws.yml`: nothing). Drizzle has always written these columns as UTC wall-clock (`toISOString`). Session `now()` on the hosted database writes in its zone (GMT on Neon), so reading them as UTC is correct. |
| C7 | List endpoint | One admitted read, `GET /:id/saved-views`. It returns the library views plus the open project's views. | The find view exists only while a project is open (`Vault.tsx:1905`). Two reads would hide library views until "Accessible projects" is ticked. No library-only list route is built, because it would have no caller. |
| C8 | Folder filter versus library mode | "Accessible projects" is disabled while a folder filter is held, and the reason is shown. | Stripping the folder would silently widen the question (`vault-document-filter.ts:14-18`). Sending it would produce a 400 that `VaultLibraryResults` shows as a generic failure. |
| C9 | A creator later demoted out of a writing role | They may still **delete** or **unshare** their own organisation view. **Rename** and **changing parameters** of a shared view need a writing role. | Withdrawing a publication only narrows what colleagues see. Changing a published view is publishing. |
| C10 | Rollback window | Ship as two releases: R1 (expand) and R2 (Vault). See §2.0. | The previous image's precedent router has no surface predicate. |
| C11 | When the saved-views list is read | Lazily: only once the "Saved views" control has been opened. | A new always-on read would put a second `role="alert"` into the ~50 existing Vault client tests whose mocks do not answer it (e.g. `vaultSearchFilters.test.tsx:44-50` "stays the one alert"). It would also add a request to every Vault open. |
| C12 | PATCH shape | One operation per request: rename, share, or replace parameters. | Each operation then has one static UPDATE whose WHERE clause carries its own authority as bound booleans. |

---

## 2. What already exists

Searches run:
- `saved_views|saved_searches|saved_filters|savedView|savedSearch|saved-view` over `server/ shared/ client/src migrations/ db/migrations/ scripts/`: **no hits**.
- `savedPrecedentQueries|saved_precedent_queries` over the same roots: every hit is listed below.
- `git log --all --diff-filter=D` on `*ProjectsListFilters*`, `*AdvancedSearchPanel*`, `*SearchSurface.tsx`.
- `pgTable(` and `CREATE TABLE` names matching saved, preset, view or preference.

| Path | What it does today | What it does not do |
|---|---|---|
| `shared/schema.ts:18646-18682` `savedPrecedentQueries` | The **only** saved-query store. The model has `scope` as `json` (`:18663`), `userId` documented as "null for org-shared" (`:18656`), `hits`/`lastRunAt` cached results (`:18672-18674`), naive timestamps (`:18674-18676`), and indexes `spq_org_idx` and `spq_user_idx` (`:18678-18679`). | It has no surface, no visibility, no project and no updater. |
| `migrations/20260505_saved_precedent_queries.sql:10-24` | The SQL creator: `scope jsonb` (`:16`), with its own `BEGIN;`/`COMMIT;` (`:8`, `:26`). | **It is on no deploy path** (`scripts/ci/migration-deploy-path-baseline.json:36`). install-fresh runs push before the overlay (`install-fresh.mjs:24-31`), so deployed databases have the **pushed** shape (`json`, naive timestamps) and the overlay's CREATE was a no-op. It has no audit header. |
| `server/routes/saved-precedent-queries.ts`, mounted at `register-inline-routes.ts:44,1165` | Org-scoped CRUD on `requestDb(req)`. | `scopeSchema` is `.strict()` with precedent-only keys (`:49-60`). PATCH stores `hits` and `refresh` (`:70-78`). GET predicates on organisation only (`:87-91`). PATCH and DELETE predicate on id and organisation only, so any member edits another's row (`:166-170`, `:189-192`). POST and PATCH return the whole row (`:134-137`, `:170-174`), so new columns would change their bodies. The header's claim that "the global audit middleware writes audit_logs" (`:16-19`) is false: `auditLog` only console-logs (`server/middleware/enterprise-security.ts:712-737`). |
| `client/src/concept2cure/v2/surfaces/PrecedentEngine.tsx` | Lists, saves, applies and deletes (interface `:146`; list `:354-362`; save `:364-382`; apply plus `PATCH {refresh}` `:384-390`; delete `:392-400`). | It swallows a failed list read into an empty list (`:360`). The surface is outside the launch catalog (`ui-surface-registry.ts:784-791`; `launch-scope.ts:251`). |
| Precedent proofs | `server/routes/__tests__/saved-precedent-queries.rls.test.ts` (hand DDL with `scope json` at `:96-111`; RLS mirror; 0021 source asserts at `:259-273`). `tests/db/two-tenant-application-rls.dbtest.ts:116-140` on `tests/db/two-tenant-fixture.ts:166-180` (cleanup `:442`). `tests/regulatory-programs-routes.test.ts:333-379` (Drizzle mocked). `client/.../__tests__/microWireups.test.tsx:96-133`. | Nothing tests per-user visibility. |
| `server/services/mdx-health.service.ts:118` | Probes the table as `required: true`. A missing required table makes release status `not_ready` (`:103`). | — |
| `server/services/tenant/tenant-offboarding.ts:1106` `PURGE_CHILD_TABLES` | The tenant purge list. `regulatory_programs` is at `:1224`. | **It does not list this table**, which is residue in `docs/reports/purge-coverage-baseline.json:635`. |
| `server/services/vault/vault-document-filter.ts` | `VaultDocumentFilters` (`:43-53`); `VaultFilterRefusal` (`:55-60`); `VAULT_FILTER_PARAMETERS` (`:63-71`); folder checked against the project's cabinet and refused without one (`:117-125`); CTD codes normalised (`:128-133`); `parseVaultFilters` (`:147-170`, `processingStatus` refused `:153-158`); `readVaultSearchPaging` (`:183-191`); `parseLibrarySearchFilters` (`:200-210`); `parseProgramSearchFilters` (`:216-222`). | It has no inverse ("parsed filters back to query parameters"). |
| `server/services/vault/vault-search.ts:148-156, :212` | Binds only the verified accessible programs, intersects any narrowing with them, and re-checks scope after the read. | — |
| `server/routes/c2c/project-vault.ts` | `createProjectVaultRoutes` (`:1336`) with `installProjectRouteAccess` (`:1338`). `GET /search` (`:1348-1385`) sits before `GET /:id` (`:1391`). `GET /:id/search` (`:1818-1908`) runs `programInOrganization` (`:1843`) and the folder check (`:1847`). Owners are named through `public.actor_name` (`:1432`). | It has no saved views. There are **no** PATCH, PUT or DELETE routes on this router. |
| `server/routes/c2c/project-route-access.ts` | `sendProjectAccessFailure` with concealment (`:17-24`). `router.param('id')` admission (`:58-65`). Non-GET on `/:id/...` needs `GOVERNED_WRITE_ROLES` (`:37-52`). | — |
| `server/services/c2c/current-program-access.ts` | `readCurrentProgramActor` reads the database role, not the token (`:109-125`). `requireCurrentProgramAccess` (`:129-143`). `getCurrentAccessibleProgramScope` (`:147`). | — |
| Roles and actor | `GOVERNED_WRITE_ROLES` (`server/middleware/orgMembership.ts:509`); `governedActorId` (`:621-624`); `hasOrganizationProjectManagementRole` (`project-sharing-access.ts:39-41`); client `useVaultCanWrite` → `canGovernedWrite` (`VaultViewOnly.tsx:22-24`). | — |
| `client/.../surfaces/Vault.tsx` (filter-controls step **committed**) | `VaultFindFilterRow` (`:720-781`); body keyed by project (`:835-837`); `useVaultCanWrite` (`:862`); `q`, `findFilters`, `filterReset`, `leaveFind` (`:1158-1165`); `searching` (`:1413`); `includeEarlier` (`:1426`); `allProjects` (`:1429`); `searchPath` (`:1431-1434`); AnA context (`:1490-1589`); breadcrumb with search box and checkboxes (`:2021-2081`); filter row (`:2083-2089`); search alert (`:2090-2099`); library results (`:2106`). | It has no saved views and no folder control. A dimension with several values shows only its first value in the select. |
| `client/.../surfaces/VaultLibraryResults.tsx` | `VaultFindFilters` (`:63-70`, no `folderId`); `vaultFilterParams` (`:73-77`); library read (`:100-104`). | — |
| Migration machinery | `C2C_MIGRATION_FILES`: the last ordinary entry is `migrations/20261029d_vault_data_room_seals.sql` (`migration-set.mjs:3612`), followed by `UUID_TENANT_ISOLATION_NONPUBLIC` (`:3613`), `CHILD_TABLE_PARENT_SCOPE` (`:3630`) and `TENANT_ISOLATION_SWEEP` (`:3641`). Self-transacting files are not re-wrapped (`:3645`). | — |
| Not reusable | `report_definitions` and `report_subscriptions` (`shared/schema/report-os.ts:276`, `:216`): dashboard canvases and delivery schedules. `users.preferences` (`shared/schema.ts:2587`, `/api/users/me/preferences` at `users.ts:358-405`): it has no organisation key, so it cannot hold an organisation view. `innovation.workspace_presets` (`db/migrations/072_gcc_innovation_platform_core.sql:582`): non-public with a uuid organisation, so it carries no RLS under Rule 1. Deleted: `ProjectsListFilters.tsx` (`2895218b8b`), mdx `SearchSurface.tsx` (`e5a74a4dfa`) and `AdvancedSearchPanel.jsx` (`7a144fd1e4`, `3ea8cc863d`), all localStorage or fixtures. | — |

Reported defects in the precedent store that this design does **not** fix: §8, risk R5.

---

## 3. The design

### 3.0 Shape and release order

**R1, expand.** One commit, deployable on its own. No Vault route writes yet.
1. Amend `migrations/20260505_saved_precedent_queries.sql` in place (§3.2), list it on `C2C_MIGRATION_FILES`, and shrink the deploy-path baseline.
2. Update the Drizzle model in `shared/schema.ts:18646-18682` (§3.1).
3. Precedent router: add `surface = 'precedent'` to every statement, return the original ten columns, and correct the header (§3.7).
4. `mdx-health.service.ts:118`: change the role string only (§3.8).
5. Add `'saved_precedent_queries'` to `PURGE_CHILD_TABLES` before `'regulatory_programs'`, and shrink the purge-coverage baseline (§3.8).
6. Add the predicate guard test (T4).

**R2, Vault.** Requires R1 to be deployed.
1. `vaultFilterQuery` in `vault-document-filter.ts`.
2. `server/services/vault/vault-saved-views.ts`, a new server module (not UI).
3. Four routes on the Vault router.
4. Client changes in `Vault.tsx` and `VaultLibraryResults.tsx`.

Releases are by tag or dispatch (`.github/workflows/deploy-aws.yml:1-34`), and rollback returns to a named revision (`:1433-1451`). With R1 deployed first, a rollback from R2 lands on R1, which has the predicate. A rollback to a revision **older than R1** after Vault rows exist is unsafe in one respect, and the evidence README records it as an accepted constraint: the old precedent GET would list colleagues' personal views and the old PATCH/DELETE would let any member change them. In production this exposure is closed by default, because launch scope is on unless explicitly turned off (`launch-scope.ts:42-45`) and `/api/saved-precedent-queries` is claimed only by `precedent-intelligence` (`ui-surface-registry.ts:791`), which is outside `LAUNCH_SURFACE_IDS`. If R1 and R2 must ship in one tag, the README says so and the same constraint applies.

### 3.1 Store

**Table:** `public.saved_precedent_queries`, extended in place. The name is kept (risk R1).

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | unchanged |
| `organization_id` | integer NOT NULL → organizations | unchanged; literal in every statement |
| `user_id` | integer → users | Precedent: creator, may be NULL (legacy). **Vault: owner and accountable creator, never NULL** (CHECK). Never changes after insert. |
| `label` | text NOT NULL | Vault: 1-120 characters, not blank (CHECK) |
| `query` | text NOT NULL | Vault: the search text `q`; `''` allowed; at most 500 characters (CHECK) |
| `scope` | **jsonb** (was json where pushed) | Vault: `{"v":1,"filters":{…},"includeSuperseded":bool}` (below) |
| `hits` | integer NOT NULL DEFAULT -1 | Vault: must be -1 (CHECK) |
| `last_run_at` | **timestamptz** | Vault: must be NULL (CHECK) |
| `created_at`, `updated_at` | **timestamptz** NOT NULL DEFAULT now() | |
| `surface` | text NOT NULL DEFAULT `'precedent'` | **new**: `'precedent' \| 'vault'` |
| `visibility` | text NOT NULL DEFAULT `'org_public'` | **new**: `'private' \| 'org_public'`. The default records what precedent rows already are (every member sees them, `saved-precedent-queries.ts:87-91`). The Vault route never relies on the default; it requires the field. |
| `program_id` | uuid NULL | **new**: Vault project view → its project; NULL → library view. Always NULL for precedent. |
| `updated_by` | integer NULL | **new**: who last renamed, shared or re-parameterised a Vault view. No FK, as in `shared/schema.ts:204,228`; names are read through `public.actor_name`. |

**Vault `scope`.** Parameters only, keyed by the search's own parameter names (`VAULT_FILTER_PARAMETERS`). Values are stored exactly as `parseVaultFilters` normalised them, so the client sends them back verbatim:

```json
{ "v": 1,
  "filters": { "documentType": ["CSR"], "ctdSection": ["3.2.P"], "folderId": ["module-3"] },
  "includeSuperseded": false }
```

**Constraints.** All are named, added only when absent, and defined in this file alone (C5):

| Name | Definition | Refuses |
|---|---|---|
| `spq_surface_known` | `CHECK (surface IN ('precedent','vault'))` | unknown surfaces |
| `spq_visibility_known` | `CHECK (visibility IN ('private','org_public'))` | unknown visibilities |
| `spq_precedent_shape` | `CHECK (surface <> 'precedent' OR (visibility = 'org_public' AND program_id IS NULL))` | Any change to what a precedent row is. Widening it later must be a replacement conditional on `pg_get_constraintdef`; the file header says so. |
| `spq_vault_view_shape` | see SQL, §3.2 | A Vault row with no owner; a stored count or run time; a NULL, non-object or extra-keyed `scope`; filter keys outside the seven parameters; a folder in a library view; a blank or over-long label; an over-long query. Every term is NULL-safe, so the CHECK can never evaluate to NULL and pass. |
| `spq_program_same_org_fk` | `FOREIGN KEY (program_id, organization_id) REFERENCES public.regulatory_programs (id, organization_id) ON DELETE CASCADE` | A view naming another organisation's project, even through a route bug. CASCADE, not SET NULL: SET NULL would silently turn a project view into a library view, which widens it. MATCH SIMPLE, so library rows pass. Validated (no NOT VALID): every existing row has `program_id` NULL. |

**Indexes.** Keep `spq_org_idx` and `spq_user_idx`. Add `spq_vault_list_idx ON (organization_id, surface, program_id)`: plain columns, also declared in Drizzle under the same name. No unique-label index: an expression index breaks push introspection (`install-fresh.mjs:14-21`), and a plain one would fail on existing duplicate precedent labels.

**RLS.** Unchanged: `tenant_isolation_policy` with FORCE comes from `migrations/0021_enable_rls_everywhere.sql` on install-fresh databases, or from the tail sweep (`db/migrations/20260801_tenant_isolation_sweep.sql`, which adds a policy only where none exists). That policy isolates organisations.

Personal-versus-organisation isolation *inside* an organisation is enforced in the application by a literal predicate, `(visibility = 'org_public' OR user_id = $actor)`. No request-wide user GUC exists to build a policy on. Two things guard it:
- the mechanical scan in T4;
- every Vault statement lives in one module.

**Drizzle model**, replacing `shared/schema.ts:18646-18682`. Every import is already present at `:12-34`.

```ts
/** The organisation's saved queries: precedent searches (surface 'precedent',
 *  PrecedentEngine) and Vault saved views (surface 'vault', P-46). A row stores
 *  search parameters only. Constraints and the project key are SQL-only
 *  (migrations/20260505_saved_precedent_queries.sql); see
 *  docs/design/VAULT_SAVED_VIEWS_2026-10-29.md. Every reader predicates on
 *  surface (saved-view-store-predicates.test.ts). */
export const savedPrecedentQueries = pgTable('saved_precedent_queries', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').references(() => organizations.id).notNull(),
  /** Creator. Precedent: may be null (legacy). Vault: the owner, never null. */
  userId: integer('user_id').references(() => users.id),
  surface: text('surface').$type<'precedent' | 'vault'>().default('precedent').notNull(),
  visibility: text('visibility').$type<'private' | 'org_public'>().default('org_public').notNull(),
  /** Vault project view: its project. Null: library view, and always for precedent. */
  programId: uuid('program_id'),
  label: text('label').notNull(),
  query: text('query').notNull(),
  scope: jsonb('scope').$type<PrecedentQueryScope | VaultSavedViewScope | null>(),
  /** Precedent only: cached hit count; -1 for every Vault row. */
  hits: integer('hits').default(-1).notNull(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: integer('updated_by'),
}, (table) => ({
  orgIdx: index('spq_org_idx').on(table.organizationId),
  userIdx: index('spq_user_idx').on(table.userId),
  vaultListIdx: index('spq_vault_list_idx').on(table.organizationId, table.surface, table.programId),
}));
```

`PrecedentQueryScope` is the existing inline type. `VaultSavedViewScope` is `{ v: 1; filters: Partial<Record<VaultFilterParameter, string[]>>; includeSuperseded: boolean }`.

**How precedent keeps working:**
- Existing rows backfill through the defaults to `surface='precedent'` and `visibility='org_public'`, which satisfies `spq_precedent_shape`.
- The router's inserts name `surface` and `visibility` explicitly.
- Every router statement gains the surface predicate.
- POST and PATCH return exactly the ten original columns.
- `PrecedentEngine.tsx` reads `id, label, query, scope` (`:146`) and needs no change.

### 3.2 Migration: exact SQL

Amend `migrations/20260505_saved_precedent_queries.sql` in place. It is the table's only creator, so Rule 1's "amend the creator" applies. Every statement is additive or conditional, and **nothing is dropped**. The whole file after the change:

```sql
-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure regulatory evidence and governed workflow platform
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: The organisation's saved queries: precedent searches and Vault saved
--          views (personal or organisation-wide). A row stores search parameters
--          only. It is not a governed record and changes none.
--
-- eCTD/CTD Context:
--   - Module(s): none directly. A Vault view re-reads Module 1-5 documents through
--     the governed Vault search, under the reader's current access, when applied.
--   - Integrity Risk Addressed: a saved view caching results or counts
--     (spq_vault_view_shape); a project view naming another organisation's
--     project (spq_program_same_org_fk).
--
-- Determinism Contract:
--   - Replay-safe: CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, and type
--     changes, constraints and indexes applied only when absent. Nothing is dropped.
--   - Existing precedent rows keep their content and read as surface 'precedent',
--     visibility 'org_public' (what they already are: every member sees them).
--
-- Notes:
--   - AMENDED IN PLACE 2026-10-29 (D2, Vault saved views, P-46;
--     docs/design/VAULT_SAVED_VIEWS_2026-10-29.md), under CLAUDE.md Rule 1:
--       * put on the deploy path (C2C_MIGRATION_FILES); it was install-fresh only;
--       * adds surface, visibility, program_id, updated_by;
--       * scope json -> jsonb, and created_at/updated_at/last_run_at -> timestamptz
--         read as UTC, each only where the column still has the old type
--         (install-fresh's drizzle push made scope json and the timestamps naive);
--       * adds spq_surface_known, spq_visibility_known, spq_precedent_shape,
--         spq_vault_view_shape, spq_program_same_org_fk and spq_vault_list_idx;
--       * removes nothing.
--   - spq_precedent_shape fixes precedent rows to visibility 'org_public' and no
--     project. Widening it is a replacement conditional on pg_get_constraintdef
--     (Rule 1, first corollary), never an unconditional DROP/ADD.
--   - This file is the only creator of the CHECKs and the project key (the Drizzle
--     model declares none), so a developer push that drops one is undone by the
--     next run of the set.
--   - Ordering: install-fresh's overlay reaches this file before
--     20260524_program_workbench_schema.sql. The key block raises 42P01 while
--     regulatory_programs is absent, which the overlay defers to its next pass.
-- =============================================================================
-- Originally (2026-05-05): mirrors shared/schema.ts savedPrecedentQueries; backs
-- the PrecedentSurface "Saved queries" panel.

BEGIN;

CREATE TABLE IF NOT EXISTS saved_precedent_queries (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id),
  user_id          integer REFERENCES users(id),
  label            text NOT NULL,
  query            text NOT NULL,
  scope            jsonb,
  hits             integer NOT NULL DEFAULT -1,
  last_run_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  surface          text NOT NULL DEFAULT 'precedent',
  visibility       text NOT NULL DEFAULT 'org_public',
  program_id       uuid,
  updated_by       integer
);

CREATE INDEX IF NOT EXISTS spq_org_idx  ON saved_precedent_queries (organization_id);
CREATE INDEX IF NOT EXISTS spq_user_idx ON saved_precedent_queries (user_id);

ALTER TABLE saved_precedent_queries ADD COLUMN IF NOT EXISTS surface text NOT NULL DEFAULT 'precedent';
ALTER TABLE saved_precedent_queries ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'org_public';
ALTER TABLE saved_precedent_queries ADD COLUMN IF NOT EXISTS program_id uuid;
ALTER TABLE saved_precedent_queries ADD COLUMN IF NOT EXISTS updated_by integer;

DO $spq_types$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'saved_precedent_queries'
                AND column_name = 'scope' AND data_type = 'json') THEN
    ALTER TABLE public.saved_precedent_queries ALTER COLUMN scope TYPE jsonb USING scope::jsonb;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'saved_precedent_queries'
                AND column_name = 'created_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE public.saved_precedent_queries
      ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'saved_precedent_queries'
                AND column_name = 'updated_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE public.saved_precedent_queries
      ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'saved_precedent_queries'
                AND column_name = 'last_run_at' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE public.saved_precedent_queries
      ALTER COLUMN last_run_at TYPE timestamptz USING last_run_at AT TIME ZONE 'UTC';
  END IF;
END
$spq_types$;

DO $spq_keys$
BEGIN
  IF to_regclass('public.regulatory_programs') IS NULL THEN
    RAISE EXCEPTION 'relation "public.regulatory_programs" does not exist (saved views project key); apply its creator first'
      USING ERRCODE = 'undefined_table';
  END IF;
  IF to_regclass('public.regulatory_programs_id_org_uq') IS NULL THEN
    CREATE UNIQUE INDEX regulatory_programs_id_org_uq
      ON public.regulatory_programs (id, organization_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_surface_known') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_surface_known CHECK (surface IN ('precedent', 'vault'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_visibility_known') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_visibility_known CHECK (visibility IN ('private', 'org_public'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_precedent_shape') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_precedent_shape
      CHECK (surface <> 'precedent' OR (visibility = 'org_public' AND program_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_vault_view_shape') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_vault_view_shape CHECK (surface <> 'vault' OR (
            user_id IS NOT NULL
        AND hits = -1
        AND last_run_at IS NULL
        AND COALESCE(jsonb_typeof(scope), '') = 'object'
        AND COALESCE(jsonb_typeof(scope -> 'filters'), '') = 'object'
        AND COALESCE(jsonb_typeof(scope -> 'includeSuperseded'), '') = 'boolean'
        AND COALESCE((scope - 'v' - 'filters' - 'includeSuperseded') = '{}'::jsonb, false)
        AND COALESCE(((scope -> 'filters') - 'documentType' - 'classification' - 'evidenceKind'
                      - 'folderId' - 'placementStatus' - 'ctdSection' - 'lifecycleStage') = '{}'::jsonb, false)
        AND (program_id IS NOT NULL OR NOT COALESCE((scope -> 'filters') ? 'folderId', false))
        AND btrim(label) <> ''
        AND char_length(label) <= 120
        AND char_length(query) <= 500));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.saved_precedent_queries'::regclass AND conname = 'spq_program_same_org_fk') THEN
    ALTER TABLE public.saved_precedent_queries
      ADD CONSTRAINT spq_program_same_org_fk
      FOREIGN KEY (program_id, organization_id)
      REFERENCES public.regulatory_programs (id, organization_id)
      ON DELETE CASCADE;
  END IF;

  IF to_regclass('public.spq_vault_list_idx') IS NULL THEN
    CREATE INDEX spq_vault_list_idx
      ON public.saved_precedent_queries (organization_id, surface, program_id);
  END IF;
END
$spq_keys$;

COMMIT;
```

Notes the builder verifies against the evidence:
- **Operator precedence.** Binary `-` binds tighter than `->`, `?` and `=`, so `(scope -> 'filters')` and the comparisons are parenthesised.
- **NULL safety.** `surface`, `hits`, `label` and `query` are NOT NULL, and every jsonb term is wrapped in `COALESCE`. The CHECK is therefore TRUE or FALSE for every row and never NULL.
- **First deploy.** Existing rows are precedent rows with default values and NULL `program_id`, so every constraint validates.
- **Locks.** The type changes rewrite a small table once and are no-ops after that. The top-level `ADD COLUMN IF NOT EXISTS` and the original `CREATE INDEX IF NOT EXISTS` take brief locks on each replay, as many set files do. The set's `lock_timeout` and retry bound them (`migration-set.mjs:3656-3701`).

**Place in `C2C_MIGRATION_FILES`:** immediately after `'migrations/20261029d_vault_data_room_seals.sql'` (`:3612`) and before `UUID_TENANT_ISOLATION_NONPUBLIC` (`:3613`). If later entries land first, it still goes directly above the tail. Comment:

```js
  // Saved queries and Vault saved views (D2, P-46, 2026-10-29;
  // docs/design/VAULT_SAVED_VIEWS_2026-10-29.md): saved_precedent_queries, its
  // only creator, previously install-fresh only (deploy-path baseline). Amended
  // in place: surface, visibility, program_id, updated_by; scope -> jsonb and
  // timestamps -> timestamptz where still old; four CHECKs and a same-org
  // project key ON DELETE CASCADE. After organizations/users (push) and
  // regulatory_programs (20260524, index 1); creates regulatory_programs_id_org_uq
  // when absent, as 20260926b does. Public with organization_id INTEGER NOT NULL,
  // so the sweeps below police it. Every statement guarded; no DROP.
  'migrations/20260505_saved_precedent_queries.sql',
```

**Baseline.** Run `node scripts/ci/check-migration-deploy-path.mjs --write-baseline`, which removes `:36`. It must be in the same commit, because a stale entry fails (`check-migration-deploy-path.mjs:146-153`).

**Gates the change must pass:**
- `ci:migration-set-order`: the tail stays last.
- `ci:migration-guard-order`: the table and its guards come from one file, and regulatory_programs' creator is at index 1.
- `ci:install-fresh-overlay-deps`: the dependencies are push tables and a root-tree table.
- `ci:migration-drop-safety`: no DROP, no `DROP CONSTRAINT`, so neither NARROWED nor REPEATED applies.
- `ci:migration-deploy-path`.
- `ci:column-reachability`: columns via top-level `ADD COLUMN`, the `CREATE TABLE` body and the push surface.
- `ci:json-operator-types`: `scope` is jsonb in the model and is retyped by the migration.
- `require-migration-headers.sh`: the header marker is present.
- `db:sync-manifest:check`: not affected, since it covers `db/migrations/`.

### 3.3 Visibility and authority

The actor is always `governedActorId(req)` (`orgMembership.ts:621-624`). With no numeric actor the request is refused with 403 `PROJECT_ACTOR_REQUIRED`, and a view is never written ownerless (`ci:fabricated-identity`).

The role is always the **current database role**: `readCurrentProgramActor` (`current-program-access.ts:109-125`), or the admission's `actor.role`. Inside mutations it is read `forShare: true`, so a demotion takes effect on the next request.

- `writer` = `GOVERNED_WRITE_ROLES.has(role)` (`orgMembership.ts:509`). This is the same set the client's `useVaultCanWrite` reads.
- `manager` = `hasOrganizationProjectManagementRole(role)` (`project-sharing-access.ts:39-41`): admin, super_admin, owner, manager, approver.

| Action | Personal view (`private`) | Organisation view (`org_public`) |
|---|---|---|
| See it in the list | Owner only. Others get no row, and 404 `SAVED_VIEW_NOT_FOUND` by id, so its existence is never disclosed. | Every current member. A project view is listed only to members with current access to that project. |
| Create | Any current active member, **viewers included**: a viewer can search, and a personal view is that search remembered. A project view also needs read admission to the project. | `writer` (and project admission for a project view). Otherwise 403 `SAVED_VIEW_PUBLISH_DENIED`. |
| Rename | Owner | Creator while `writer`, or `manager` |
| Change parameters (`q`, filters, `includeSuperseded`) | Owner | Creator while `writer`. A manager may not: the creator's name would stay on a definition they did not write. |
| Share (private → org) | Owner while `writer` | n/a |
| Make personal (org → private) | n/a | Creator, any current role (C9) |
| Delete | Owner | Creator, any current role (C9), or `manager` |
| `programId` | Immutable. Changing scope means saving a new view. | Immutable |

Any other member trying to change an organisation view gets 403 `SAVED_VIEW_NOT_YOURS`, with the message "Only the person who saved this view, or an organisation manager for a rename or delete, can change it. Nothing was changed."

The list returns per-view booleans `mine`, `canEdit`, `canRename`, `canShare` and `canDelete`, computed on the server from this table, so the client never restates role rules. `savedViewAuthority(row, actor)` is a pure function in the service and is unit-tested over the table.

### 3.4 Audit: a preference, not a governed record

Recommendation: **no `writeChainedAuditRow`.**

- **Part 11 scope.** 21 CFR 11.10(e) requires audit trails for operator actions that create, modify or delete electronic records kept under predicate rules (11.1(b); FDA's 2003 Scope and Application guidance). A saved view is a stored set of retrieval parameters. Creating, renaming or deleting one creates, changes or deletes no record a predicate rule requires.
- **No access is granted.** Applying a view re-reads governed records through the governed search, under the reader's current access, so a view can neither grant nor widen access.
- **Annex 11.** EU GMP Annex 11 §9 asks for a risk-based audit trail of GMP-relevant changes, and a view is not GMP-relevant data.
- **No stale copy.** The database refuses a view that carries results (`spq_vault_view_shape`), so a view can never become a stale copy of governed content.
- **Cost.** A chained row takes a per-tenant chain position (`auditService.ts:269-299`) that every Part 11 write contends for. It would also put UI configuration into the trail inspectors read.
- **Consistency with the repo.** `users.preferences` is merge-patched with no audit (`users.ts:399-405`). This table is not added to `check-regulated-delete-audit.mjs`'s REGULATED list.

Accountability that does exist:
1. `user_id`, the creator, which never changes.
2. `updated_by` and `updated_at`, written on every mutation and shown in the list ("renamed by Dana"). A manager's rename of a colleague's view is therefore visible to everyone who sees it.
3. A `createScopedLogger('vault-saved-views')` info line per mutation, carrying `orgId`, `actorId`, `viewId`, `action`, `visibility` and the fields changed. Never the `q` text or filter values.

The same change corrects the false claim at `saved-precedent-queries.ts:16-19`.

**The trigger to revisit**, written into this design: the day a saved view drives a governed act (a review queue, a report definition, a QMS periodic-review selection, a submission placement set), it becomes a governed record. Each mutation then runs in a transaction with `writeChainedAuditRow`, in the shape `withProjectWriteReservation` already uses (`project-route-access.ts:90-104`), and versioning is added.

### 3.5 Routes

All four routes are on the existing Vault router, `createProjectVaultRoutes` (`project-vault.ts:1336`), mounted at `/api/c2c/project-vault`. That prefix is claimed by Vault (`ui-surface-registry.ts:310`), which is in the launch catalog.

- **Path parameter.** The view id is `viewId`, never `id`, so `router.param('id')` never runs project admission on a numeric view id.
- **Collisions.** None: the router has no PATCH, PUT or DELETE routes, and no one-segment POST.
- **Where the statements live.** `server/services/vault/vault-saved-views.ts`. The handlers stay thin, and statements run on `requestPgClient(req)`, or on `requestConnectable(req).connect()` inside a transaction. Never on `pool`.
- **Envelopes** match the router: `{ success: true, data }` and `{ success: false, error, message, ... }`.
- **Errors** never echo `err.message` (`ci:server-error-leaks`).
- **SQL** is literal with bind parameters only (`ci:sql-interpolation`; the new module starts at 0, and `project-vault.ts` does not move from its baseline).

**Wire shape**

```ts
type SavedVaultView = {
  id: number; label: string; visibility: 'private' | 'org_public';
  programId: string | null;            // null: library view
  q: string;
  filters: Partial<Record<'documentType'|'classification'|'evidenceKind'|'folderId'|'placementStatus'|'ctdSection'|'lifecycleStage', string[]>>;
  includeSuperseded: boolean;
  createdBy: { userId: number; name: string | null };
  updatedBy: { userId: number; name: string | null } | null;
  createdAt: string; updatedAt: string;  // ISO, from timestamptz
  mine: boolean; canEdit: boolean; canRename: boolean; canShare: boolean; canDelete: boolean;
} & ({ applies: true } | { applies: false; refusal: VaultFilterRefusal });
```

**`GET /:id/saved-views`**: the open project's views plus the library views.
- Admission comes through `router.param('id')`. A concealed project answers 404 `PROJECT_NOT_FOUND` and discloses no labels. A failed admission answers 503 `PROJECT_ACCESS_UNAVAILABLE`.
- The actor and role come from `res.locals.currentProgramAccess.actor`.

```sql
SELECT v.id, v.label, v.query, v.scope, v.visibility, v.program_id::text AS program_id,
       v.user_id, v.updated_by, v.created_at, v.updated_at,
       COALESCE(c.name, c.email) AS created_by_name,
       COALESCE(u.name, u.email) AS updated_by_name
  FROM saved_precedent_queries v
  LEFT JOIN LATERAL public.actor_name(v.user_id) c ON TRUE
  LEFT JOIN LATERAL public.actor_name(v.updated_by) u ON TRUE
 WHERE v.organization_id = $1 AND v.surface = 'vault'
   AND (v.visibility = 'org_public' OR v.user_id = $2)
   AND (v.program_id IS NULL OR v.program_id = $3::uuid)
   AND ($4::int IS NULL OR v.id = $4)
 ORDER BY (v.visibility = 'private') DESC, lower(v.label), v.id
```

- `$4` is NULL for the list. The same statement re-reads one row by id after a create or a change, so there is one wire mapper.
- Every row is re-validated (§3.6) to set `applies`.
- Response: 200 `{ success: true, data: { programId, views: SavedVaultView[] } }`.
- On a read failure: 500 `SAVED_VIEWS_UNAVAILABLE`, "Saved views could not be read. This is not an empty list." It is never `views: []`.

**`POST /saved-views`**

Body, zod `.strict()`:

```ts
{ label: string,                // trimmed, 1..120
  visibility: 'private' | 'org_public',   // required, no default
  programId: string | null,     // uuid, or null for a library view; required
  q: string,                    // trimmed, 0..500; required
  filters: Record<string, string[]>,  // values ≤200 chars, arrays ≤100 (the parser applies the 20 cap)
  includeSuperseded: boolean }  // required
```

Validation, in order:
1. Schema failure: 422 `VALIDATION_FAILED` with details. Top-level `hits`, `refresh`, `results` or `scope` are refused here.
2. Actor and admission:
   - project view: `requireCurrentProgramAccess(requestPgClient(req), { organizationId, userId, programId })` at read level, so viewers may save personal views. Failures go through `sendProjectAccessFailure(res, err, true)`, which conceals as 404.
   - library view: `readCurrentProgramActor`.
3. `visibility='org_public'` without `writer`: 403 `SAVED_VIEW_PUBLISH_DENIED`, "Your role can save views for yourself only. Nothing was saved."
4. Filters, through the search's own parsers:
   - project: `parseProgramSearchFilters(filters, () => resolveVaultView(programId, orgId, requestPgClient(req)))` (`vault-document-filter.ts:216-222`; `vault-filing.service.ts:495`);
   - library: `parseVaultFilters(filters)`, which refuses a folder with the search's own message (`:120`).
   - A refusal comes back as 400 `{ success: false, ...refusal }`, byte-identical to `GET /:id/search` or `GET /search` for the same parameters. This includes `processingStatus` → `UNSUPPORTED_PARAMETER`.
5. Any filter key not among `Object.values(VAULT_FILTER_PARAMETERS)`: 400 `UNSUPPORTED_PARAMETER` naming the key. For `programId` the message is "A library view spans the projects you can access when it is run; it does not store a project list."
6. No `q` and no filter: 422 `EMPTY_VIEW`, "A view with no search text and no filter selects nothing, so it was not saved." This mirrors `EMPTY_QUERY` (`project-vault.ts:1361-1363`, `:1834-1838`).

Insert, with `scope = { v: 1, filters: vaultFilterQuery(parsed.filters), includeSuperseded }`:

```sql
INSERT INTO saved_precedent_queries
       (organization_id, user_id, surface, visibility, program_id, label, query, scope, hits, updated_by)
VALUES ($1, $2, 'vault', $3, $4::uuid, $5, $6, $7::jsonb, -1, $2)
RETURNING id
```

Then the row is re-read and returned as 201 `{ success: true, data: SavedVaultView }`.

**`PATCH /saved-views/:viewId`**
- `viewId` must match `/^[1-9]\d{0,9}$/` and be at most 2147483647, else 404 `SAVED_VIEW_NOT_FOUND`.
- Body: exactly one of these three, each `.strict()`; anything else is 422:
  - `{ label }`, rename;
  - `{ visibility }`, share or make personal;
  - `{ q, filters, includeSuperseded }`, replace parameters (all three required).

The handler runs one transaction on `requestConnectable(req).connect()`:
1. `BEGIN`; `actor = readCurrentProgramActor(client, { organizationId, userId, forShare: true })`.
2. Pre-read:
   ```sql
   SELECT id, user_id, visibility, program_id::text AS program_id
     FROM saved_precedent_queries
    WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
      AND (visibility = 'org_public' OR user_id = $3)
      FOR UPDATE
   ```
   No row gives 404 `SAVED_VIEW_NOT_FOUND`. That covers another tenant's row, a precedent row and someone else's personal view.
3. If the row has a `program_id`: `requireCurrentProgramAccess(client, { …, programId: row.program_id, forShare: true })`. Failure gives a concealed 404.
4. Authority per §3.3. Failure gives 403 `SAVED_VIEW_NOT_YOURS` or `SAVED_VIEW_PUBLISH_DENIED`.
5. For a parameter change: re-validate exactly as POST steps 4-6, against the row's own scope (project or library).
6. The one statement for the operation. Authority is repeated as bound booleans (`$writer`, `$manager`), so a race cannot widen it:
   ```sql
   -- rename
   UPDATE saved_precedent_queries SET label = $4, updated_by = $3, updated_at = now()
    WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
      AND ((user_id = $3 AND (visibility = 'private' OR $5::boolean))
           OR (visibility = 'org_public' AND $6::boolean))
   RETURNING id
   -- replace parameters
   UPDATE saved_precedent_queries SET query = $4, scope = $5::jsonb, updated_by = $3, updated_at = now()
    WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
      AND user_id = $3 AND (visibility = 'private' OR $6::boolean)
   RETURNING id
   -- share / make personal
   UPDATE saved_precedent_queries SET visibility = $4, updated_by = $3, updated_at = now()
    WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
      AND user_id = $3 AND ($4::text = 'private' OR $5::boolean)
   RETURNING id
   ```
   Zero rows gives a rollback and 403 `SAVED_VIEW_NOT_YOURS`.
7. `COMMIT`; re-read; 200 `{ success: true, data: SavedVaultView }`.

**`DELETE /saved-views/:viewId`**: the same transaction, pre-read and re-admission as PATCH, then:

```sql
DELETE FROM saved_precedent_queries
 WHERE id = $1 AND organization_id = $2 AND surface = 'vault'
   AND (user_id = $3 OR (visibility = 'org_public' AND $4::boolean))
RETURNING id
```

The response is 200 `{ success: true, data: { id } }`.

**Errors on every route**

| Status | Code | When |
|---|---|---|
| 403 | `FORBIDDEN` | No organisation context, as everywhere in this router (`:1349-1350`). |
| 403 / 404 / 409 / 503 | `PROJECT_ACTOR_REQUIRED`, `PROJECT_ACTOR_ACCESS_DENIED`, `PROJECT_NOT_FOUND`, `PROJECT_ANCHOR_UNRESOLVED`, `PROJECT_ACCESS_UNAVAILABLE` | Via `sendProjectAccessFailure`; concealed on views. |
| 422 | `VALIDATION_FAILED`, `EMPTY_VIEW` | |
| 400 | `INVALID_FILTER`, `UNSUPPORTED_PARAMETER` | The search's own refusal objects. |
| 404 | `SAVED_VIEW_NOT_FOUND` | Absent, other tenant, precedent row, another person's personal view. |
| 403 | `SAVED_VIEW_PUBLISH_DENIED`, `SAVED_VIEW_NOT_YOURS` | |
| 500 | `SAVED_VIEWS_UNAVAILABLE`, `SAVED_VIEW_NOT_SAVED` | The second says "The view was not saved. Nothing was changed." |

**Shared helper**, added to `vault-document-filter.ts`:
- `vaultFilterQuery(filters: VaultDocumentFilters)`: the parsed filters as the search's own parameters. It is the inverse of the parser's reading.
- `VAULT_FILTER_PARAMETER_NAMES = Object.values(VAULT_FILTER_PARAMETERS)`.

### 3.6 Run-time re-scoping

The server never runs a view and never stores what one returns.
- The database forces `hits = -1` and `last_run_at IS NULL`.
- The Vault routes accept no `hits`, `refresh` or results field.
- Applying a view is client state: `q`, filters, `includeSuperseded`, and library versus project. The **existing** search routes then run under current access.

1. **Library view.** `GET /search` builds the accessible set fresh (`getCurrentAccessibleProgramScope`, `project-vault.ts:1360`). The search binds only permitted programs and re-checks after the read (`vault-search.ts:148-156`, `:212`). A project the reader lost contributes nothing. Library views store no program list (refused at save, and by the CHECK's filter-key allowlist), so there is no stale list to narrow.
2. **Project view.**
   - It is listed only through `GET /:id/saved-views`, behind `router.param('id')`. Lost access means a concealed 404, and labels are not disclosed.
   - Applying it runs `GET /:id/search` behind the same admission.
   - Mutations re-admit the row's project inside their transaction.
   - A soft-deleted project is inadmissible, so its views are invisible. A hard-deleted project cascades its views away.
3. **Folder.** `GET /:id/search` re-checks `folderId` against the project's current cabinet (`vault-document-filter.ts:117-125`, `:216-222`). A folder no longer in the cabinet is 400 `INVALID_FILTER`, never a dropped filter.
4. **Vocabulary drift.**
   - The list re-runs the same parser on every stored view: `parseVaultFilters(filters, { view })` for project views, with the view resolved at most once per request and only if a stored view holds a folder; `parseVaultFilters(filters)` for library views.
   - A view that would now be refused is returned with `applies: false` and the refusal. Stored values are never rewritten.
   - A `scope` that cannot be read returns `applies: false` with refusal `{ error: 'INVALID_FILTER', parameter: 'scope', message: "This view's stored parameters cannot be read." }`. The list does not fail and does not fabricate.
5. **Project membership** of a project view is pinned by the composite key, so even a route bug cannot store another tenant's project.

### 3.7 Precedent router: exact change (R1)

`server/routes/saved-precedent-queries.ts`:
- `const PRECEDENT_COLUMNS = { id, organizationId, userId, label, query, scope, hits, lastRunAt, createdAt, updatedAt }` (Drizzle column refs).
- GET (`:87-91`): `.where(and(eq(savedPrecedentQueries.organizationId, orgId), eq(savedPrecedentQueries.surface, 'precedent')))`.
- POST (`:124-134`): values add `surface: 'precedent', visibility: 'org_public'`; `.returning(PRECEDENT_COLUMNS)`.
- PATCH (`:166-170`): the WHERE adds `eq(savedPrecedentQueries.surface, 'precedent')`; `.returning(PRECEDENT_COLUMNS)`.
- DELETE (`:189-192`): the WHERE adds the same predicate.
- Header (`:16-19`) becomes: "No audit row is written. These are saved search parameters, not governed records (docs/design/VAULT_SAVED_VIEWS_2026-10-29.md §3.4). The table also holds Vault saved views (surface 'vault'). Every statement here is predicated on surface = 'precedent', and saved-view-store-predicates.test.ts holds that."
- Nothing else changes: `scopeSchema`, the GET mapping, status codes and envelopes. Response bodies stay byte-identical.

### 3.8 Purge and health probe (R1)

- **Purge.** `tenant-offboarding.ts`: insert `'saved_precedent_queries'` before `'regulatory_programs'` (`:1224`, next to `'vault_data_room_seals'` `:1223`), with the comment: "Saved queries and Vault saved views (P-46): the tenant's own search parameters. Before regulatory_programs, whose delete would cascade project views; library views and precedent rows have no cascade and are reached only here."
- **Purge baseline.** Remove the table from `docs/reports/purge-coverage-baseline.json` (`:635`, `count` − 1). Regenerate it with `node scripts/ci/check-purge-coverage.mjs --write-baseline` against an install-fresh plus deploy-migrate database, or edit the one entry by hand and let CI's `ci:purge-coverage` (`ci.yml:1874`) confirm. The baseline must not be regenerated before the list entry exists: the new cascade alone would report the table covered while library and precedent rows survive.
- **Health probe.** `mdx-health.service.ts:118`: the table stays probed and `required: true`. The role string becomes `'PrecedentSurface saved queries and Vault saved views'`. Nothing else changes.

### 3.9 Client: existing files only (R2)

Only two files change: `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx` (the find view's contract file) and `client/src/concept2cure/v2/surfaces/Vault.tsx`. No CSS changes. Only defined classes are used: `vd-filters`, `vd-filter`, `vd-filter-l`, `vd-filter-note`, `c2c-input`, `vd-crumb`, `vd-search`, `vd-dr-err`, `scaf-note` (`coverage-v2.css:930-952`, `misc-surfaces-v2.css:475`, `app-v2.css:2230`), which keeps `ci:undefined-css-classes` green. Calls go through `apiRequest` and `useLiveData`, which keeps `ci:unauthenticated-fetch` green.

**`VaultLibraryResults.tsx`**
- `VaultFindFilters` (`:63-70`) gains `folderId?: string[]`. `vaultFilterParams` already iterates keys generically, so a held folder reaches the project search.
- New `SavedVaultView` and `SavedViewsShape` types, with an `isSavedViewsShape` `ShapeGuard`. A malformed body is an error, never an empty list.
- New `savedViewKey({ q, filters, includeSuperseded, library })`: one canonical string built from the sorted `vaultFilterParams`, so "changed" is computed one way.

**`Vault.tsx`**

(a) **State**, beside `findFilters` (`:1162-1165`): `viewsOpen`, `viewsEpoch`, and `appliedView: SavedVaultView | null`. `leaveFind` also clears `appliedView`. A project switch remounts the body (`:835-837`), which clears everything.

(b) **Lazy read (C11).**
- `viewsPath = viewsOpen && projectId ? '/api/c2c/project-vault/' + encodeURIComponent(projectId) + '/saved-views' : null`.
- `useLiveData(viewsPath, [viewsPath, viewsEpoch], isSavedViewsShape)`.
- Opening the Vault issues no saved-views request.

(c) **Control.** A `vd-crumb` button "Saved views" (`aria-expanded`, `aria-controls="vd-saved-views"`) after the "Accessible projects" label (`:2073-2081`). While open, a `VaultSavedViews` function component (declared inside `Vault.tsx`) renders directly under the breadcrumb, before `VaultFindFilterRow` (`:2083`), as `<div className="vd-filters" id="vd-saved-views" role="group" aria-label="Saved views">`:
- A `vd-filter` select labelled "Saved view", with `<optgroup label="Mine">` and `<optgroup label="Organisation">`.
- Option text is the label, plus " · all projects" for a library view, plus " · by <createdBy.name or 'a former member'>" for others' organisation views. A view with `applies: false` reads "<label> (no longer applies)".
- An **Apply** button: a separate action, so arrowing through the select changes nothing.
- Buttons shown only when the selected view's flags allow them: **Rename** (`canRename`), **Share with organisation** / **Make personal** (`canShare`), **Update view** (`canEdit`), **Delete** (`canDelete`).
  - Update view is enabled only when the selected view is the applied one, the find state differs, and the scope matches. Otherwise the button is disabled with a visible reason, e.g. "This view searches one project; save a new view to search accessible projects."
- **Save current search…**, enabled only while `searching` (`:1413`). Otherwise it is disabled and shows "Type a search or choose a filter, then save it as a view."
- For an organisation view the user cannot edit, a note: "Shared by <name>." Plus "Renamed by <name>." when `updatedBy` differs from `createdBy`.

(d) **Apply.**
- If `applies: false`: show "“X” no longer applies: <refusal.message>. Nothing was changed." in `vd-filter-note role="status"`, and change nothing. Never a partial apply.
- Otherwise:
  - `setAllProjects(v.programId === null)`
  - `setQ(v.q)`
  - `setFindFilters(v.filters)`
  - `setIncludeEarlier(v.includeSuperseded)`
  - `setFilterReset(n => n + 1)`, which re-seeds the CTD draft from `value.ctdSection` (`:725`)
  - `setAppliedView(v)`
- The existing `searchPath` or `VaultLibraryResults` then runs, with its existing loading, error and empty states.

(e) **Breadcrumb.** The current crumb (`:2041-2046`) is prefixed "View “<label>”", with " (changed)" once `savedViewKey(current) !== savedViewKey(appliedView)`.

(f) **Save form**: inline, no dialog, no new file.
- A "Name" input (maxLength 120), prefilled from `findSubject` (`:1437`).
- Radios "Only me" and "Everyone in the organisation". The second is disabled when `!canWrite` (`:862`) with the visible reason "Your role can save views for yourself only." When enabled it carries the note "Everyone in the organisation sees this view's name."
- **Save** and **Cancel**.
- Request: POST `{ label, visibility, programId: allProjects ? null : projectId, q: trimmedQ, filters: findFilters, includeSuperseded: includeEarlier }`.
- On 201: bump `viewsEpoch`, set and select the view, and show `role="status"` "Saved “X”."
- On 4xx: show `serverMessage(j)` verbatim (the search's own refusal). Nothing changes optimistically.

(g) **Rename**: an inline input, then PATCH `{ label }`. **Share / Make personal**: PATCH `{ visibility }`. **Update view**: PATCH `{ q, filters, includeSuperseded }`.

(h) **Delete**: an inline confirm group.
- Organisation view: "Delete “X” for everyone in the organisation? Documents are not affected."
- Personal view: "Delete your view “X”? Documents are not affected."
- Buttons "Delete view" and "Cancel". On success: bump the epoch, and clear `appliedView` if it was the deleted view.

(i) **Honest states**
- Loading: the select is disabled and reads "Loading saved views…".
- Failed read (error or guard failure): `vd-dr-err role="alert"` "Saved views could not be loaded. This is not an empty list.", with a **Try again** button that bumps `viewsEpoch`. The select and Save stay disabled.
- Verified empty: a disabled option "No saved views yet."
- Mutation failure: `role="alert"` with `redactInternals(serverMessage(j) ?? …)`. It persists until the next action; there are no timed toasts.

(j) **Folder and library mode (C8).** While `findFilters.folderId?.length`, the "Accessible projects" checkbox is disabled, with an adjacent note: "A folder is one project's cabinet. Remove the folder filter to search accessible projects."

(k) **No hidden filters.** `VaultFindFilterRow` (`:720-781`) gains an optional `folderLabel(id)` prop, fed from the tree's folder labels. It renders a line "Also filtering by:" with one removable `vd-crumb` per dimension the selects cannot show:
- any `folderId`;
- more than one value in Type, Filing, Classification, Evidence kind or CTD section;
- a `lifecycleStage` set equal to no `VAULT_STAGE_CHOICES[i].stages`.

This holds for any source of filters, not only views.

(l) **AnA context** (`:1490-1589`). The find-view facts gain `savedView: appliedView ? { label, visibility, scope: programId ? 'project' : 'library', changed } : null`. There is no new AnA action.

`PrecedentEngine.tsx`: no change.

---

## 4. Tests first

Each test is written first and its red run is captured in `red.txt` with the reason. Gates are shown failing on the case they exist to catch.

Build order and red checkpoints:
1. **HEAD**: T1, T2, T4, T6, T8 are red for their intended reason.
2. **After R1 step 1** (migration and model): T3 is red for its intended reason.
3. **After R1**: T1-T4 and T8 are green.
4. **R2 server**: T5, T6, T7 are green.
5. **R2 client**: T9 is green.

| # | File | What it proves | Red at HEAD because |
|---|---|---|---|
| T1 | `tests/schema-contract/saved-views-store-replay.pglite.test.ts` (new; patterned on `nonconforming-products-program-key.pglite.test.ts`) | Setup: stub `organizations` and `users`; real `migrations/20260524_program_workbench_schema.sql` (two organisations, one project each). Three starting shapes: **(a) pushed**, the Drizzle model at HEAD (`scope json`, naive timestamps, no new columns); **(b) SQL**, HEAD's 20260505 (`scope jsonb`); **(c) empty**. Seed precedent rows with `user_id` NULL, `scope` NULL, an object scope, duplicate labels and a known naive timestamp. Apply `FILE`, **taken from `C2C_MIGRATION_FILES`**, three times. Assertions: (1) the file is in the set, after 20260524 and before `UUID_TENANT_ISOLATION_NONPUBLIC`; (2) the shape is identical after replays 1, 2 and 3: `scope` jsonb and timestamps timestamptz in all three shapes; `relfilenode` unchanged from replay 2 to 3, so the type blocks are no-ops; on (b) the scope block is a no-op on the first run; (3) precedent rows are kept with `surface='precedent'` and `visibility='org_public'`, and their instants equal the seeded naive value read as UTC; (4) refusals: a vault row with `hits=3`; with `last_run_at` set; with `user_id` NULL; with `scope` NULL; with `scope` missing `filters`; with `scope` holding an extra `hits` key; with filters holding `programId`; a library vault row with `folderId`; a blank label; a precedent row with visibility `private`; a precedent row with `program_id`; `surface='x'`; `visibility='personal'`; and an organisation-1 row naming organisation 2's program (23503); (5) valid library and project vault rows are accepted; deleting the project cascades its project views and keeps library views; (6) **overlay deferral**: in BEGIN/ROLLBACK as the overlay runs it, the file on a database **without** `regulatory_programs` fails with code `42P01` and a message matching `/does not exist/`, and leaves no new columns; the same file succeeds after 20260524; (7) **mutation**: a copy of the file with one constraint's name guard removed fails on its second replay (42710). | The file is not in the set (assertion 1). On (a), `scope` stays json and the timestamps stay naive. No `spq_*` constraint exists. (6) expects 42P01, but HEAD's file succeeds. |
| T2 | gates (`green.txt`) | `ci:migration-deploy-path`, `ci:migration-set-order`, `ci:migration-guard-order` (and selftest), `ci:install-fresh-overlay-deps` (and selftest), `ci:migration-drop-safety` (and `:selftest`), `ci:column-reachability`, `ci:json-operator-types`, `require-migration-headers.sh`, `ci:drizzle-tenant-scope`, `ci:sql-interpolation`, `ci:server-error-leaks`, `ci:fabricated-identity`, `ci:program-ownership-single-source`, `ci:undefined-css-classes`, `ci:unauthenticated-fetch`. **Shown failing:** `ci:migration-deploy-path` with the baseline line left in (stale entry, `:146-153`); `require-migration-headers.sh` with the marker removed. | The set does not include the file, and the baseline still lists it. |
| T3 | `server/routes/__tests__/saved-precedent-queries.rls.test.ts` (extended) | The hand DDL (`:96-111`) is replaced by stub parents, 20260524 and the real `FILE`. Seed vault rows: user 10's private view, user 11's private view, an `org_public` view. Assertions: the precedent GET returns **only** precedent rows, with exactly the keys `[id,label,query,scope,hits,lastRunAt,userId,createdAt,updatedAt]`; the POST body's `data` keys are exactly the ten original columns; PATCH and DELETE of a vault id return 404 and leave the row unchanged; the existing org-scoping, RLS-mirror and 0021 source cases still pass. Also green, unchanged: `tests/regulatory-programs-routes.test.ts:333-379`, `microWireups.test.tsx:96-133` and the two-tenant precedent case. | Its intended red is captured **after R1 step 1**: the GET lists the vault rows, including another user's personal view, and PATCH and DELETE of vault ids return 200 and 204. At HEAD it fails only in setup (no `surface` column). This is stated in `red.txt`. |
| T4 | `server/services/vault/__tests__/saved-view-store-predicates.test.ts` (new; the mechanical guard) | Scans every non-test `.ts` under `server/` for `saved_precedent_queries` or `savedPrecedentQueries`. Allowed files only: the precedent router, `vault-saved-views.ts`, `mdx-health.service.ts` (existence probe) and `tenant-offboarding.ts` (purge by organisation); any other file fails by name. In the precedent router, every `.from`, `.update` or `.delete` chain on the table must contain `eq(savedPrecedentQueries.surface, 'precedent')`, and every `.insert` must contain `surface: 'precedent'`. In the Vault module, every SQL literal naming the table must contain `organization_id = $`, `surface = 'vault'`, and, for SELECT, UPDATE and DELETE, the owner arm (`user_id = $`), with `visibility = 'org_public' OR` on reads. **Selftest:** the same checker run on inline fixture strings, each missing one predicate, must report each one. | The precedent router's four statements carry no surface predicate. |
| T5 | `server/routes/c2c/__tests__/project-vault-saved-views.pglite.integration.test.ts` (new; on the `project-vault-parent-access.pglite.integration.test.ts` harness: org 7, PRIVATE and PUBLIC programs, `h.failAccessRead`) | Setup applies `FILE` and `migrations/20260929_actor_names.sql` onto the stubs it checks for, and asserts `to_regprocedure('public.actor_name(integer)')` is not null. Cases: (a) personal: user 5's library view is invisible to user 20; user 20's PATCH and DELETE give 404; user 5 renames and deletes it. (b) organisation: user 20 (member) sees it with `mine=false` and all four edit flags false; user 20's PATCH `{label}` gives 403 `SAVED_VIEW_NOT_YOURS`; a manager's rename gives 200 with `updatedBy`=manager; the manager's parameter replace gives 403; the manager's DELETE gives 200. (c) viewer: an `org_public` POST gives 403 `SAVED_VIEW_PUBLISH_DENIED` and no row; a `private` POST gives 201; the viewer's share gives 403. (d) demoted creator: a member creates an `org_public` view and is demoted to viewer; rename gives 403; make-personal gives 200; DELETE gives 200. (e) project scope: as unassigned user 20, `GET /PRIVATE/saved-views` gives 404 with no label in the body; a POST with `programId` PRIVATE gives 404 and no row; PUBLIC's list includes library views plus PUBLIC's views and none of PRIVATE's. (f) **parity, table-driven:** `classification=BOGUS`, `ctdSection=abc`, `placementStatus=x`, 21 values, `processingStatus`, `folderId` on a library view, a folder outside the cabinet; each goes to POST and to the matching `/search` route, and the status, `error`, `parameter` and `allowed` must be deep-equal. (g) `programId` inside filters gives 400 `UNSUPPORTED_PARAMETER`; no `q` and no filter gives 422 `EMPTY_VIEW`; a body with `hits` gives 422; missing `visibility` gives 422. (h) normalisation: `m3.2.p` is stored as `3.2.P` and duplicates collapse. (i) run time: save a project view with a valid folder, change the project's `product_type` so its cabinet differs; the list returns `applies:false` with the folder refusal, and `GET /:id/search` with the stored parameters gives 400. (j) the stored row has `hits=-1` and `last_run_at` NULL. (k) `failAccessRead` gives 503 with an error code and never `views:[]`. (l) the precedent GET lists none of these rows. (m) authority literal: a role downgrade between the pre-read and the UPDATE, simulated by binding `writer=false`, updates 0 rows and gives 403. | The routes do not exist (404 from Express). |
| T6 | `server/services/vault/__tests__/vault-document-filter.test.ts` (extended) | `vaultFilterQuery` outputs only keys from `VAULT_FILTER_PARAMETERS`; `parse(query(parse(x)))` deep-equals `parse(x)`; CTD codes stay normalised. `savedViewAuthority` over the §3.3 table. | `vaultFilterQuery` and `savedViewAuthority` are not exported. |
| T7 | `tests/db/vault-saved-views-tenant.dbtest.ts` (new; on `tests/db/two-tenant-fixture.ts`, as its header asks; the fixture seeds one `org_public` and one `private` vault view per tenant with `TAG`-prefixed labels, and the existing cleanup at `:442` deletes them) | On real PostgreSQL, as `app_service` with RLS enforcing, through the real Vault router: tenant A never lists B's views; A's PATCH and DELETE of B's ids give 404 and B's rows are intact; A's POST naming B's program gives 404 and no row. Catalog: `relrowsecurity`, `relforcerowsecurity` and `tenant_isolation_policy` are present on the table after install-fresh plus the set. | The fixture insert fails, because the columns are absent. |
| T8 | `server/services/tenant/__tests__/tenant-purge-saved-views.pglite.test.ts` (new) | `purgeTenant` for organisation A leaves zero rows of A in the table, across precedent rows, private library views and organisation project views. Organisation B is untouched. The purge completes, with no 23503. | A's precedent rows survive: the table is not in `PURGE_CHILD_TABLES`. |
| T9 | `client/src/concept2cure/v2/__tests__/vaultSavedViews.test.tsx` (new test file; harness of `vaultSearchFilters.test.tsx` with `_vault-surface-fixtures`) | Opening the Vault issues **no** `/saved-views` request; opening "Saved views" issues `GET /api/c2c/project-vault/<PID>/saved-views`. A failed read shows the alert "could not be loaded. This is not an empty list." and never "No saved views yet"; Try again re-reads. Mine and Organisation groups render. Applying a project view fills the box, the selects and include-earlier, and the next search URL carries exactly the stored parameters. Applying a library view ticks "Accessible projects" and reads `/search` with no `folderId`. An `applies:false` view changes nothing and shows its refusal. Flags hide Rename and Delete. Save is disabled when not searching, and "Everyone in the organisation" is disabled with its reason for a read-only user. The POST body equals the current state. A refused save shows the server message, which persists. A change after applying shows "(changed)", and Update view sends PATCH with parameters. A held folder disables "Accessible projects" with its reason and appears in "Also filtering by". | No control exists. |

**Evidence beyond the tests.** Run install-fresh and then deploy-migrate on a blank database, and record:
- the overlay's pass lines, showing 20260505 deferred in pass 1 and applied in pass 2, with no INCOMPLETE;
- the table's final columns and constraints;
- deploy-migrate's second run with an unchanged shape.

---

## 5. What is left out (deliberately)

- Default or pinned views, ordering, folders of views, sharing to named people or teams.
- Deep links to a view (`?view=`) and an AnA `vault.apply-view` action.
- Subscriptions, alerts on new matches, saved result sets, counts or run history. The database refuses these for Vault rows.
- Library views narrowed to chosen projects. `/search` accepts `programId`, but no control offers it, and storing project lists would need per-project re-scoping in the list.
- A folder control in the find view. The API and the store accept `folderId`; the find view only shows and removes one.
- An administrator override on personal views. Nobody but the owner ever sees one, and it changes no governed content.
- Label uniqueness, per-user or per-organisation caps, optimistic concurrency (edits are last-write-wins), and list paging.
- Chained audit rows and versioning (see the trigger in §3.4).
- Renaming the table.
- Any change to `PrecedentEngine` or to the precedent router's semantics beyond the surface predicate.
- Converging `users.preferences`, `report_definitions` or `workspace_presets`. They are different capabilities.
- Saved views on any other surface. Adding one later is a `pg_get_constraintdef`-conditional replacement of `spq_surface_known`.

---

## 6. Risks

- **R1. Misnamed table.** `saved_precedent_queries` now holds Vault views. A rename is a Rule 1 change to its creator and to every reader, in one change. It is deferred; the file header and the Drizzle JSDoc say what the table holds.
- **R2. Privacy inside an organisation is enforced in the application only.** No per-user GUC exists, so RLS isolates organisations only. A reader that omits the owner arm leaks personal views to colleagues, though never across tenants. Mitigations:
  - T4 fails on any new file touching the table, and on any statement missing a predicate;
  - every Vault statement lives in one module;
  - T3 and T5 pin both routers.
- **R3. Rollback past R1** after Vault rows exist re-exposes personal views through the old precedent router (§3.0). It is closed by default in production by launch scope, and recorded in the evidence README.
- **R4. First-deploy rewrites.** The type changes rewrite a small table under ACCESS EXCLUSIVE, once, bounded by the set's lock handling. Naive timestamps are read as UTC; that assumption holds for Drizzle writes, and holds for `now()` where the database session is in UTC/GMT.
- **R5. Precedent defects reported, not changed:**
  - its GET shows every member's rows (organisation-shared by design);
  - any member may PATCH or DELETE a precedent row;
  - PATCH stores `hits` and `refresh`;
  - `user_id` may be NULL;
  - `PrecedentEngine` swallows a failed GET into an empty list (`:360`);
  - the router is mounted without explicit auth middleware at `register-inline-routes.ts:1165`.

  The surface is outside the launch catalog.
- **R6. SQL-only constraints on developer databases.** `drizzle-kit push` on a developer database may drop the SQL-only CHECKs and key, as it can for `protocol_documents`. The next run of the set restores them.
- **R7. Free-text labels.** An organisation library view's label is seen by every member, whatever their project access, so a label can name a project the reader cannot open. The save form says so ("Everyone in the organisation sees this view's name.").
- **R8. Hard deletes.** A manager's delete of a colleague's view leaves only the log line. That is acceptable for a preference; revisit it at the §3.4 trigger.
- **R9. Vocabulary drift** leaves stored views `applies:false` until their owner updates them. This is intended: a view is never rewritten silently.
- **R10. An unbounded list.** An organisation with very many views pays for it on each open of the control.
- **R11. Shifting line numbers.** `Vault.tsx` and the set are edited by concurrent sessions, so cited lines move. Insert the set entry directly above the tail, wherever the tail is.
- **R12. Rule 2.** This is a completion inside the Vault find view on row D2, with P-46 on record. It adds no surface, module or integration outside the catalog.

### Files touched

**R1**
- `migrations/20260505_saved_precedent_queries.sql` (amended in place)
- `scripts/db/migration-set.mjs` (entry above the tail)
- `scripts/ci/migration-deploy-path-baseline.json` (remove `:36`)
- `shared/schema.ts:18646-18682`
- `server/routes/saved-precedent-queries.ts`
- `server/services/mdx-health.service.ts:118`
- `server/services/tenant/tenant-offboarding.ts` (before `:1224`)
- `docs/reports/purge-coverage-baseline.json`
- `server/services/vault/__tests__/saved-view-store-predicates.test.ts` (new test)
- `tests/schema-contract/saved-views-store-replay.pglite.test.ts` (new test)
- `server/routes/__tests__/saved-precedent-queries.rls.test.ts`
- `server/services/tenant/__tests__/tenant-purge-saved-views.pglite.test.ts` (new test)

**R2**
- `server/services/vault/vault-document-filter.ts`
- `server/services/vault/vault-saved-views.ts` (new server module)
- `server/routes/c2c/project-vault.ts`
- `client/src/concept2cure/v2/surfaces/VaultLibraryResults.tsx`
- `client/src/concept2cure/v2/surfaces/Vault.tsx`
- `server/routes/c2c/__tests__/project-vault-saved-views.pglite.integration.test.ts` (new test)
- `server/services/vault/__tests__/vault-document-filter.test.ts`
- `tests/db/vault-saved-views-tenant.dbtest.ts` (new test)
- `tests/db/two-tenant-fixture.ts`
- `client/src/concept2cure/v2/__tests__/vaultSavedViews.test.tsx` (new test)

**Docs, on build**
- `docs/evidence/D2-VAULT-SEARCH/2026-10-29-saved-views/{README.md,red.txt,green.txt}`
- `docs/evidence/D2-VAULT-SEARCH/2026-10-22/README.md:94` ("What remains" item 3)
- `docs/design/VEEVA_GAP_2026-10-22.md:204`
- `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md:48,556,693` (P-46 lifts the §6 exclusion for the Vault)
- Route-mount and ownership reports, regenerated only if CI asks.