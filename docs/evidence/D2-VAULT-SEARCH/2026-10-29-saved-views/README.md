# D2: Vault saved views, release 1 (expand): the one saved-query store holds Vault views, on the deploy path

**Launch row:** D2. **Workstream:** Vault, Veeva gap 7 (saved views). **Founder decision:** P-46 ("Both": personal and
organisation-wide, 2026-10-22). The authority question P-46 left open is answered in the design (§3.3) and recorded
under P-46.
**Design:** `docs/design/VAULT_SAVED_VIEWS_2026-10-29.md` (two independent designs, two adversarial judges; both
judges chose "extend", 7.5 against 5 and 4.5).
**Naming (Rule 3):** this *extends* the saved-query store (`saved_precedent_queries`), *puts its creator on the deploy
path*, and *fixes* its precedent router so it can share the table. No store, table, surface or UI file is added.

This is **release 1 of 2**. R1 is deployable on its own and writes no Vault view. R2 (the Vault routes and the find
view's controls) needs R1 deployed first, so that a rollback from R2 lands on a precedent router that already filters
by surface (design §3.0).

## What already exists

| Path | What it did | What it did not do |
|---|---|---|
| `migrations/20260505_saved_precedent_queries.sql` | The table's only SQL creator. | It was on **no deploy path** (`scripts/ci/migration-deploy-path-baseline.json`). Deployed databases got the table from install-fresh's drizzle push (`scope json`, naive timestamps), so the file's own `jsonb` never applied. |
| `shared/schema.ts` `savedPrecedentQueries` | The model: label, query, scope, cached hits. | No surface, visibility, project or updater. `userId` said "null for org-shared", which nothing honoured. |
| `server/routes/saved-precedent-queries.ts` | Org-scoped CRUD on the request connection. | Every statement predicated on organisation only: the GET would list other members' personal Vault views once they existed, and PATCH/DELETE would change them. POST and PATCH returned the whole row. Its header claimed an audit row the middleware never writes. |
| `server/services/tenant/tenant-offboarding.ts` `PURGE_CHILD_TABLES` | The tenant purge. | It did not name this table: a purged tenant's precedent searches survived (residue in `docs/reports/purge-coverage-baseline.json`). |
| `server/services/mdx-health.service.ts` | Probes the table as required. | — |

No other saved-view store exists (searches in the design, §2). The deleted views (`ProjectsListFilters`, `AdvancedSearchPanel`,
mdx `SearchSurface`) were browser-only or fixtures.

## What changed

- **The creator, amended in place** (Rule 1), with a dated header: adds `surface` (`'precedent' | 'vault'`), `visibility`
  (`'private' | 'org_public'`, the repo's own vocabulary), `program_id`, `updated_by`.
  - It retypes `scope` to jsonb and the timestamps to timestamptz (read as UTC), each only where the column still has
    the old type.
  - It adds named CHECKs:
    - `spq_surface_known` and `spq_visibility_known`;
    - `spq_precedent_shape`: a precedent row is organisation-wide with no project;
    - `spq_vault_view_shape`: a Vault row has an owner, no stored count or run time, a parameters-only scope with the
      seven filter keys, no folder in a library view, and a bounded label and query.
  - It adds `spq_program_same_org_fk`: a project view names its own organisation's project, ON DELETE CASCADE.
  - Nothing is dropped. Each constraint is added only when absent.
  - While `regulatory_programs` is absent it raises 42P01, which install-fresh's overlay defers to its next pass.
- **On the deploy path:** listed in `C2C_MIGRATION_FILES` directly above the tenant tail. The deploy-path baseline
  shrinks by that one entry.
- **The model** declares the new columns and the list index. Constraints stay SQL-only, so a developer's push that
  drops one is undone by the next run of the set.
- **The precedent router:**
  - Every read, update and delete is predicated on `surface = 'precedent'`, and inserts name it.
  - Bodies carry exactly the ten columns they always did.
  - The false audit claim is corrected.
- **The purge** names the table before `regulatory_programs`, and the purge-coverage baseline drops it from residue.
  The health probe's role string names both uses.

## Verified by making the checks fail

| Test | What it proves | Red (file) |
|---|---|---|
| T1 `tests/schema-contract/saved-views-store-replay.pglite.test.ts` | On the pushed, SQL and empty shapes: three replays reach one shape, and the third changes nothing (`relfilenode` stable). Precedent rows are kept and read as what they were (their instants read as UTC). Fifteen refusals plus the cross-organisation key are refused. Valid views are accepted, and a project delete takes only its views. The overlay deferral, 42P01 with nothing left behind. A copy with one name guard removed fails on its second replay. | `red-T1.txt`: **8 of 8** at the old file. |
| T3 `server/routes/__tests__/saved-precedent-queries.rls.test.ts` (extended; now on the real migrations) | The precedent GET lists only precedent rows with exactly the keys it always had. POST and PATCH return the ten precedent columns. PATCH and DELETE of a Vault view are 404 and leave it untouched. The RLS and 0021 cases still pass. | `red-T3-T4-T8.txt`: the old router **lists another user's personal view** (`V-theirs`), returns 14 keys, and lets PATCH of a Vault view succeed (200). |
| T4 `server/services/vault/__tests__/saved-view-store-predicates.test.ts` | Only allowed files name the table. Every precedent chain carries the surface predicate. The future Vault module's SQL carries the organisation, the surface and the owner arm. A selftest shows each missing predicate reported. | The old router: four chains without the predicate. |
| T8 `server/services/tenant/__tests__/tenant-purge-saved-views.pglite.test.ts` | A purge takes the tenant's precedent searches, library views and project views; the other tenant keeps its three. | The old list: the purged tenant's rows survive, and the store is not on the list. |

**Gates:** these pass: `ci:migration-deploy-path`, `ci:migration-set-order`, `ci:migration-guard-order` (and selftest),
`ci:install-fresh-overlay-deps` (and selftest), `ci:migration-drop-safety` (and selftest), `ci:column-reachability`,
`ci:json-operator-types`, `ci:drizzle-tenant-scope`, `ci:sql-interpolation`, `ci:server-error-leaks` and
`ci:fabricated-identity`.

**Regression:** 21 files, 284 tests pass, covering the program routes, the PrecedentEngine wireups, every tenant purge
test and the export-covers-purge contract. The schema-contract suite and typecheck results are in `green-R1.txt`.

## What R2 adds (next)

`vaultFilterQuery` (parsed filters back to query parameters), `server/services/vault/vault-saved-views.ts`, four routes on the Vault
router (`GET /:id/saved-views`, `POST /saved-views`, `PATCH` and `DELETE /saved-views/:viewId`), and the find view's
"Saved views" control in `Vault.tsx` (read lazily, honest states, apply, save, rename, share, delete). Tests T5, T6, T7 and T9 cover them.

---

# Release 2, server half: the Vault routes (2026-10-29)

**What changed:**

- `server/services/vault/vault-saved-views.ts` is a new **server module** (not UI). It holds every statement on the store for `surface = 'vault'`.
  - **Statements:** each names the organisation, the surface and the owner arm literally (T4 holds that), with bound values only (`ci:sql-interpolation` starts the file at 0).
  - **Authority:** `savedViewAuthority` is the design's §3.3 table, unit-tested.
  - **Validation:** `validateViewParameters` runs the search's own parsers, so a view can never hold a filter the search refuses. A refusal is the search's own object. `processingStatus` is left to the parser, so its refusal is identical too.
  - **Listing:** `listSavedViews` re-checks every stored view against the current vocabularies and cabinet. A view that no longer applies says so (`applies: false` with the refusal); its stored values are never rewritten.
- `vaultFilterQuery` and `VAULT_FILTER_PARAMETER_NAMES` in `vault-document-filter.ts`: parsed filters back to the search's own parameters, so `parse(query(parse(x))) = parse(x)`.
- **Four routes** on the existing Vault router:
  - `GET /:id/saved-views` behind project admission;
  - `POST /saved-views`;
  - `PATCH` and `DELETE /saved-views/:viewId`, in one transaction: lock the row the reader may see, re-admit its project, check authority, and repeat it in the statement as bound booleans.
  - A failed read is `500 SAVED_VIEWS_UNAVAILABLE` ("This is not an empty list."), never `views: []`.

**Verified by making it fail:**

| Test | What it proves | Red |
|---|---|---|
| T5 `server/routes/c2c/__tests__/project-vault-saved-views.pglite.integration.test.ts` | Through the real router, on the real store, with current roles: a personal view is its owner's alone and not disclosed. An organisation view is listed to members and changed only by its creator; a manager renames or deletes but does not re-parameterise; a viewer saves for themselves only; a demoted creator can still withdraw. A project view is listed and saved only behind its project's admission. Seven filter refusals deep-equal the search's. A project list, an empty view, a stored count and a missing visibility are refused. CTD codes are normalised and only parameters are stored. A view whose folder left the cabinet says `applies: false`. A failed read is an error. | `red-T5.txt`: **17 of 17** fail against trunk's router (no routes). |
| T6 `server/services/vault/__tests__/vault-saved-views.test.ts` | The round trip; the refusals; the cabinet read only when a folder is asked; the §3.3 authority table, row by row. | `vaultFilterQuery` and `savedViewAuthority` did not exist. |
| T4 (extended) | The Vault module's every statement carries the organisation, the surface and the owner arm. An INSERT names the organisation in its column list. | — |

**Gates:** these are green: typecheck (`tsc --noEmit`, exit 0), the ESLint warning ratchet, `ci:sql-interpolation`, `ci:server-error-leaks` and `ci:fabricated-identity`. The c2c route and Vault service suites pass: 140 files, 2,361 tests. The schema-contract suite passes: 117 files, 1,656 tests.

**Next:** the find view's "Saved views" control in `Vault.tsx`. It reads lazily, keeps honest states, and offers apply, save, rename, share and delete (T9).
