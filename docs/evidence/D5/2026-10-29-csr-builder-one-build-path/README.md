# D5: one CSR build path, and the builder authenticated at its own mount (2026-10-29)

Session `…01E8btkB`, D5 CSR-path lane. A hand-on from the CSR end-to-end lane
(`docs/work-orders/README.md`, its row: "`/api/csr-builder` has no
authenticateToken at the mount (500, not 401) and `POST /api/csr-builder/build`
is a second build entry beside `/api/csr/jobs`").

## What already exists

| Exists | Path | What it does |
|---|---|---|
| The CSR build users take | `POST /api/csr/jobs` (`server/routes/csr-jobs.ts`), started by `CsrBuildDraftControl` (`CsrBuildProgress.tsx`) on the Submission Center's CSR card | Writes a queued `csr_build_jobs` row bound to the retained run that holds the engine tables. The worker applies the section rule (`csr-job-runner.ts:197`, `csrSectionSelectionRefusal`). Its scope refusals are covered by `csr-project-scope.pglite.test.ts` |
| A second build path | `POST /api/csr-builder/build` (`csr-builder-routes.ts`) → `launchCSRBuild` (`server/services/csr-builder.ts`) | Drafted every requested section inside the request. It wrote no job (`id: Date.now()`) and bound no run. It had no client caller and no AnA caller, only its own test (`csr-build-scope-refusal.test.ts`) and one case in `csr-draft-source-honesty.test.ts` |
| The builder's mount | `register-clinical-intel-routes.ts`: `app.use('/api/csr-builder', csrBuilderRoutes.default)` | Had no `authenticateToken` of its own. The file's rule is that every mount carries one as the backstop (its IND comment, and `mount-routes.ts`) |
| What actually authenticated it | The same file, line 79: `app.use('/api', authenticateToken, rtmExportRoutes.default)` | Every `/api/*` request reaching the RTM export's `/api`-wide mount is authenticated there, inside that mount's own `try/catch` |
| Retired builder endpoints | `csr-builder-retired-endpoints.test.ts` (CSR slice 9, `b86433174`) | Pins the three model-figure endpoints and the second `/api/csr` mount as gone |

**The hand-on's "500, not 401" was not what production did.** A call without
a session was refused with a 401 by the RTM export's mount, before the builder
was reached. The real exposure was smaller: the builder relied on an unrelated
module for its authentication. If that import had failed (it is caught and
logged), the builder, which calls a model, would have been open. The new
"refuses a call without a session" case passed against the committed code for
that reason (`red.txt`). It stays as a regression check and is not offered as
red evidence.

## What changed

- **`POST /api/csr-builder/build` is retired.** It now answers 404. Its schema
  and imports are gone. The comment at its place names the replacement:
  `POST /api/csr/jobs` from the CSR card. `launchCSRBuild` stays: it is the
  CSR lane's module, and `csr-builder-scope-quota.test.ts` exercises it.
- **The builder carries its own `authenticateToken`** at its mount, as the file
  asks of every mount.
- **Tests:**
  - `csr-builder-retired-endpoints.test.ts` adds `build` to `RETIRED`, adds a
    case that the builder's mount includes `authenticateToken`, and adds a
    case that a session-less call is refused (401) before any builder
    handler. Its auth mock refuses a test header.
  - `csr-draft-source-honesty.test.ts`: its `/build` case now pins the
    retirement. The section rule it checked is pinned on the job path's rule
    itself (`csr-builder-e3-outline.test.ts`).
  - `csr-build-scope-refusal.test.ts` is deleted with its subject. The
    replacement's scope refusals are `csr-project-scope.pglite.test.ts`.

## Evidence: seen failing first

| Check | Red (`red.txt`, the committed route and bootstrap) | Green |
|---|---|---|
| `POST /api/csr-builder/build` answers 404 | fails: 400 (the route was live and validated the body) | passes |
| The builder no longer builds (honesty suite) | fails: 400 | passes |
| The builder's mount carries `authenticateToken` | fails: the mount had none | passes |
| The two files | 3 failed, 20 passed | 23/23 |
| Every suite reaching the builder routes, the builder service, the bootstrap or the CSR job path (57 files, `green.txt`) | — | 957 passed, 2 failed. Both failures are red on the committed code without this change |

The two failures that are not this change's (handed to the CSR end-to-end
lane):
- `tests/regulatory/csr-e3-overlay.test.ts` expects the market-specs CSR spine
  to be E3's sixteen headings and gets 119;
- `tests/unit/csr-jobs-routes.test.ts`: the sections reply now carries one
  more field than the test expects.

The files were last changed in `b265d6fc0` and `3b576cab9`.

## Disclosed (files another lane changed in the last 24 hours)

- `server/routes/csr-builder-routes.ts`: CSR slices 2 and 9 (`8cf9bd399`,
  `b86433174`); my own NCT change (`58b27d022`). The `/build` route, its schema
  and two imports were removed.
- `server/routes/__tests__/csr-builder-retired-endpoints.test.ts`: CSR slice 9.
  One `RETIRED` entry, an auth mock that can refuse, and two cases.
- `server/routes/__tests__/csr-draft-source-honesty.test.ts`: CSR slice 2
  (`8cf9bd399`). One case retargeted.
- `server/bootstrap/register-clinical-intel-routes.ts`: CSR slice 9
  (`b86433174`). One mount line and its comment.
