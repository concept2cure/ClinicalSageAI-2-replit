# D3 — one program-ownership check

**Date:** 2026-10-01 · **Row:** D3 (tenant isolation proven) · **Directed by:** the founder, 2026-10-01: *"remedy and cure that issue and choose … the best path for the product, for the platform, for our clients … then continue and move on only after that is done."*

## The decision

"Is this program the caller's organization's?" has one answer on the server: `programInOrganization` (`server/services/c2c/program-access.ts`).

- **A program is a row of `regulatory_programs`.** That is the one project identity the Projects surface creates.
- **It must belong to the caller's organization.** That is an integer organization id; a digit string is read as that number.
- **It must not be deleted.** The Projects surface already 404s a deleted project on its own page (`projects.ts`, the main read). The one exception is a caller that opts in by name with `{ includeDeleted: true }`. Today only legal holds do, because a hold must reach a project's records whatever state the project is in.
- **The id must look like a UUID.** Anything else is refused without querying.
- **A check that cannot run throws `VerificationUnavailableError`** (the shared vocabulary in `server/lib/verification-outcome.ts`). "Could not tell" is never "not yours". A route that distinguishes the two answers 503.
- **It runs on the connection the caller already reads on.** That is the request's own client, the shared pool (which applies the request's tenant scope under `RLS_ENFORCE=on`), or a function returning one. No row-level-security bypass is used; the organization is a predicate of the query.

`npm run ci:program-ownership-single-source` refuses a second copy. It runs in `.husky/pre-push` and in `ci.yml` with its self-test.

## What was there

LX-20 made `programInOrganization` canonical on 2026-09-25. Measured at `ae3b3d47e`, there were **51 copies again, in 37 files**:

| Copy | What it actually asked |
|---|---|
| `innovation-routes.ts` `programBelongsToOrg` | An OR over `programs`, `core.programs` and `regulatory_programs`, inside `SET LOCAL app.bypass_rls = 'true'`. Nothing in the server writes `programs` or `core.programs`; both are empty on a deploy-migrated database. `core.programs` is keyed by a **uuid** organization, which no tenant has. The bypass was a no-op: `regulatory_programs`' policy does not read `app.bypass_rls`. It admitted deleted projects. Callers: the innovation routes, AnA's tool wrapper (`tool-record-scope.ts`), `get_submission_readiness_twin`, and the MDX phase-2 command handlers. |
| `rbm/site-risk-engine.ts` `programBelongsToOrg` | Whether the caller held **RBM records naming the program**, not whether it owns it. `rbm_*.program_id` has no foreign key, so a KRI naming another tenant's program passed. An owner whose study had no RBM records yet was refused its own. |
| `pdev-routes.ts` `programBelongsToOrg`, `mdx-ivdr.ts` `ownsProgram`, `dossier-map.routes.ts` `programExists`, the program arm of `cmc/project-membership.ts` | The right question, written again. Most admitted deleted projects. |
| 17 inline SQL copies, 26 inline Drizzle copies | Route and service gates in Projects, project vault, Vault ingest and placement, legal holds, IVDR, engineering, CER, CAPA/MDR, PMCF, Q-Sub, process development, evidence fabric, predicate intelligence, SE matrix, defense packet, DOCX factory, standards, PCCP, change propagation, regulatory graph, industry context, and AnA's predicate shadow call. Most admitted deleted projects. The Drizzle copies answered a non-UUID id with a Postgres cast error (500) instead of a refusal. |

## What changed

- `program-access.ts` changed in four ways:
  - it throws `VerificationUnavailableError` when the check could not run;
  - it adds the `includeDeleted` opt-in;
  - it reads a digit-string organization as a number;
  - it accepts a function that returns the connection.
- Every copy above now calls it, and the three `programBelongsToOrg` helpers, `ownsProgram` and `programExists` are deleted. These are internal helpers, not user-facing capabilities; every route they guarded still guards, through the canonical check.
- **RBM.** `readProgramSites` asks the canonical check. `store_missing` (RBM tables absent, so ownership cannot be checked) becomes `ownership_unverifiable`, because ownership no longer reads the RBM store. Its operator message says it is not a permission decision.
- **Innovation routes.** `guarded` answers 503 for `VerificationUnavailableError` as it does for `GuardUnavailableError`. The innovation routes no longer read `programs` or `core.programs`.
- The gate is `scripts/ci/check-program-ownership-single-source.mjs`, with `package.json` scripts, a `.husky/pre-push` step and a `ci.yml` step.

Reads that load a program's own fields (its name, type, metadata, lead, creator) scoped to the organization are reads, not copies of the check, and are unchanged. Examples: `separation-of-duties.ts`, `governed-document-binding.ts`, `module3-compile.ts`, `submissions.ts`, `estar-administrative-data.ts`.

## What a user can notice

- A **deleted project** is now refused (404/403) on every surface that guards on a program, as its own page already was. Before, about 40 sub-routes and tools still served or wrote under it.
- A **non-UUID program id** is refused rather than answered with a 500.
- An **RBM study owner** can recompute site risk before any RBM record exists for the study.
- **Legal holds** still reach a deleted project's records.

## Proof (each red first, then green)

| Check | Red | Green |
|---|---|---|
| The gate, on the tree before the migration | `red-gate-at-ae3b3d47e.txt`: 51 copies, exit 1 | `green-gate.txt`: none; self-test catches 10 shapes and passes 6 reads |
| As the production runtime role (non-superuser, NOBYPASSRLS, `RLS_ENFORCE=on`) on a deploy-migrated database: `tests/db/program-ownership.dbtest.ts` | `red-dbtest-rbm-before-fix.txt`: 2 of 8 fail on the old RBM check. Tenant B, holding a KRI that names tenant A's program, got `{ ok: true, rows: [] }` (a healthy study with no sites). Tenant A was refused its own program. | `green-dbtest.txt`: 8/8 |
| The new and changed unit tests, run against the source **before** this change (source stashed, tests kept) | `red-unit-against-HEAD-source.txt`: 14 fail | `green-unit.txt`: 124/124 in 7 files |
| Every test file that imports a changed file | — | `green-related-441-files.txt`: 436 files, 7033 tests pass (1 file, 3 tests skipped as before) |

### Two corrections made while proving it

1. **What the RBM defect actually was in production.** I expected the old RBM check to leak tenant A's site rows to tenant B. It did not: `site_intel.sites`' own policy (`core.can_access_program`, which resolves the program through `core.programs`) hides them for every tenant. So the defect was "not yours" reported as "a healthy study with no sites", the collapse that module's header says it exists to prevent. The application check is now right regardless of that second line.
2. **One migrated copy changed connection.** In `mdx-industry-context.ts`, `db` was a local request client, and the scripted migration first passed the shared pool. A test (`mdx-industry-profile-role-gate.test.ts`) caught it. The route now passes `requestPgClient(req)`. Every other file was checked for the same pattern; none had it.

## Handed on (not in this change)

1. **Site Intelligence cannot hold a site for any real project.** `site_intel.sites.program_id` references `core.programs(id)`, which nothing writes, so `INSERT INTO site_intel.sites` (`server/api/site-intel/routes.ts`) fails its foreign key for every `regulatory_programs` id. Under enforced RLS its read policy also returns nothing for them. RBM site risk can therefore never be derived for a real study. This is the RBQM lane's.
2. **`identity.can_access_program` honours `app.bypass_rls = 'true'`.** That is a session-settable bypass on `site_intel.*`. It belongs to the session-scoped-RLS-bypass ratchet's owner.
3. **`public.programs` and `core.programs` have no writer in the server.** They are read only by the unmounted innovation services (`compliance-guardrails-sdk-service.ts`, `regulatory-delta-radar-service.ts`, `evidence-confidence-heatmap-service.ts` and others) and by `outcome-*` joins. Retiring them is a schema change under RULE 1 and a product call; it is not made here.
4. The innovation router's other guards (templates, rules, profiles, child resolvers) still run `guardQuery` with `SET LOCAL app.bypass_rls`. Whether `innovation.*` policies read it was not measured here.
