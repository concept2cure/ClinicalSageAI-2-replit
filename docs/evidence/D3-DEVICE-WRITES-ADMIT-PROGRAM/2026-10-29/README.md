# Device writes ask whether the organization owns the project

Launch row D3, tenant isolation. Date 2026-10-29. Working tree over `fb562e76`. The three route files are the same at `bbe7971e`.

**Status: done for the five writes in these files that take a project id from the client.** Two AnA tools write the same
tables the same way. They are outside this slice's files and are handed on (below).

`ca88fa26` made the project-scoped reads of Pre-Sub, UDI and labeling ask `programInOrganization` first. It handed
on the writes (`docs/evidence/D2-ONE-ANA/2026-10-29/device-features-reach-three/README.md`, "Not changed here"). This
slice does the writes.

## What already exists

Re-verified at head before any change.

| Piece | Path | What it did | What it did not do |
|---|---|---|---|
| Ownership answer | `server/services/c2c/program-access.ts` `programInOrganization` | The one answer to "is this live project the organization's?". It throws `VerificationUnavailableError` when the lookup cannot run. | — |
| Single-source gate | `scripts/ci/check-program-ownership-single-source.mjs` (`npm run ci:program-ownership-single-source`) | Refuses an inline yes/no ownership query on `regulatory_programs` (SQL or Drizzle), and a helper named `programBelongsToOrg` or `ownsProgram`, outside `program-access.ts`. | It does not say where the call has to sit. A route-local wrapper that calls `programInOrganization` passes, and the gate's self-test lists exactly that call as allowed. |
| Reads (`ca88fa26`) | `server/routes/q-sub.ts` `GET /`; `server/routes/mdx-udi.ts` `GET /udi/summary`, `GET /udi`; `server/routes/mdx-labeling.ts` `GET /labeling` | With `program_id`, each calls `programInOrganization(pool, id, org)` first. 404 `{ error: 'Project not found' }` (`notFoundInTenant(res, 'Project')`) when the organization does not own it. 503 `VERIFICATION_UNAVAILABLE` (`respondVerificationUnavailable(res, log, 'The project ownership check', err)`) when the check cannot run. | — |
| Engineering read | `server/routes/mdx-engineering.ts` `GET /engineering/:programId` | Same call, 404 on refusal. | It has no 503 branch: a check that cannot run falls through to `serverError`, a 500. Not in this slice's files. |
| UDI writes | `server/routes/mdx-udi.ts` `POST /udi`, `PATCH /udi/:id` | Behind `requireEditorAccess`. The body's `programId` is an optional, nullable UUID. `patchBody = createBody.partial()`, so the PATCH takes it too. | Neither asked about the project. |
| Labeling writes | `server/routes/mdx-labeling.ts` `POST /labeling`, `PATCH /labeling/:id` | Same `programId` field, via `docPatch = docCreate.partial()`. | Neither asked about the project. Neither has a role gate (below). |
| Q-Sub create | `server/routes/q-sub.ts` `POST /`; `server/services/q-sub/q-sub.service.ts` `createQSubmission` | `programId` is a required UUID. The service calls `programInOrganization` before it inserts, and throws `TenantAccessError` on refusal, so no row is written. | The route answered that refusal with 403 "Project does not belong to this organization", and a check that could not run with 500. |
| Database keys | `migrations/20260507_mdx_beta_surfaces.sql`; `migrations/20260511_qms_and_labeling.sql`; `migrations/20261013b_qms_inspection_same_org_keys.sql` (all on `C2C_MIGRATION_FILES`) | `udi_records.program_id` references `regulatory_programs(id)` only. `labeling_documents` also has the validated same-organization key `(program_id, organization_id)`. `q_submissions.program_id` is `text`, with no key. | See `fk-probe.txt`: no key refuses a deleted project, and `udi_records` admits another organization's. |
| Other writers of the same tables | `server/services/ana/AnaToolExecutor.ts` `create_udi_record`, `create_labeling_document` | Insert into `udi_records` and `labeling_documents` with a model-supplied `program_id`. | No ownership check. Not in this slice's files. Handed on. |

Searches run:

- `router.(post|put|patch|delete)` over the three route files, and each handler's schema for a program or project field.
- `programInOrganization`, `isVerificationUnavailable` and `notFoundInTenant` over `server/routes/mdx-engineering.ts` and the three files.
- `INSERT INTO` / `UPDATE` of `udi_records` and `labeling_documents` across `server/`. Two writers outside the routes: the AnA tools above.
- `createQSubmission` callers: the route, `AnaToolExecutor.ts`, `server/services/ana-ri/mdx-command-handlers.ts`. The last two call the service, so they keep its check.
- Client callers of these writes in `client/src`: none. `Labeling.tsx` posts translations only, and no screen posts a Q-Sub.
- Route-local ownership wrappers (`requireProgramAccess` in `pccp.ts`, `standards.ts`, `evidence-sufficiency.ts` and others) and any shared one in `server/lib`, `server/middleware`, `server/services/c2c`. There is no shared one. The pattern is route-local.
- Every test that imports the three routers.

Nothing was rebuilt. Each write now asks the same `programInOrganization` the reads ask.

## The writes

Every write in the three files, and whether it takes a project id from the client:

| Route | Project id from the client | Before | After |
|---|---|---|---|
| `POST /api/mdx/udi` | `programId`, optional, nullable | Never asked. Another organization's project: **201, stored**. A deleted project: **201, stored**. A missing one: the key refused it, and the route answered **500**. | 404 "Project not found" for another organization's, a missing or a deleted project, and no INSERT is sent. 503 when the check cannot run. |
| `PATCH /api/mdx/udi/:id` | `programId`, via `.partial()` | The same, with 200: a record could be moved under another organization's project. | The same as the create. No UPDATE is sent. |
| `POST /api/mdx/labeling` | `programId`, optional, nullable | Never asked. The same-organization key refused another organization's and a missing project, and the route answered **500**. A deleted project: **201, stored**. | The same as UDI. |
| `PATCH /api/mdx/labeling/:id` | `programId`, via `.partial()` | The same, with 200. | The same as UDI. |
| `POST /api/q-sub` | `programId`, required | Asked, in `createQSubmission`. No row on refusal. **403** "Project does not belong to this organization". **500** when the check could not run. | 404 "Project not found", and 503, as the read does. Still no row. |

A write that names no project behaves as before. On UDI and labeling, a create with `programId` absent or `null`
stores an organization-level record (`program_id` NULL). A PATCH without the field leaves the project alone. A PATCH
with `null` unassigns it. None of these asks the ownership question. On Q-Sub the project is required, so a create
without one is still 422.

Writes that take no project id from the client, unchanged:

- `POST /api/mdx/udi/:id/submit-gudid`;
- `POST /api/mdx/labeling/:id/translations`, `PATCH /api/mdx/labeling/translations/:transId`, `POST /api/mdx/labeling/:id/symbols`, `DELETE /api/mdx/labeling/symbols/:symId`. Each is scoped by the caller's organization, and the two that take a document id check it with `requireDocInOrg`;
- `PUT /api/q-sub/:id/sections/:sectionKey` (gated by `getQSubDetail`, which walks the project to the organization), `PATCH /api/q-sub/commitments/:id/rolled-in` (the service walks commitment to organization).

## What changed

- **`server/routes/mdx-udi.ts`, `server/routes/mdx-labeling.ts`.**
  - Each file has a small route-local `admitProject(res, programId, orgId)`. It calls `programInOrganization`. With no project, or the organization's own live project, it says go on. Otherwise it has already answered 404 `notFoundInTenant(res, 'Project')`, or 503 `respondVerificationUnavailable(res, log, 'The project ownership check', err)`.
  - The create and the PATCH call it inside their `try`, before the INSERT or UPDATE.
  - The reads from `ca88fa26` call it too, so each file words the refusal in one place. Their behaviour is unchanged (`device-project-reads-admit-program.test.ts`, 20/20).
  - It is a wrapper around the one answer, not a second answer. `ci:program-ownership-single-source` passes.
- **`server/routes/q-sub.ts`.** The create's catch maps `createQSubmission`'s `TenantAccessError` (its only throw, the project refusal) to `notFoundInTenant(res, 'Project')`, and `VerificationUnavailableError` to 503. The service is unchanged, so its AnA callers are unchanged.
- **Tests.**
  - New: `server/__tests__/routes/device-project-writes-admit-program.test.ts`. It runs the real `programInOrganization` and the real `createQSubmission` against a database double that records every statement. For each of the five writes:
    - another organization's project, a missing one and a deleted one: 404, and no write sent;
    - a check that cannot run: 503, and no write sent;
    - the refusal is the same status and body as the project read's;
    - the organization's own project: written under it, after the lookup.

    It also runs the eight no-project variants and the Q-Sub 422. 39 cases in all.
  - `server/__tests__/routes/q-sub.test.ts` and `server/__tests__/security/tenant-isolation-q-sub.contract.test.ts`: the create's cross-organization case now expects 404 "Project not found". It was 403. Each says so in a comment.

## Proof

- `baseline.txt`: every related suite at head, all green, and the gate.
- `red.txt`: the final test against the committed routes, **29 of 39 red**.
  - The tree already held the fix, so the test's imports of the three routers resolved to their committed text in
    scratch, through a vitest alias. The tree was not touched.
  - The harness was checked against an in-tree red run. On the first version of the test, run in the tree before any
    route changed, both gave 24 of 34.
  - Each UDI and labeling case sends its write under the foreign (`bbbb…`), missing (`cccc…`), deleted (`dddd…`) or
    unchecked id.
  - Q-Sub writes nothing, and answers 403 and 500.
  - The 10 that pass are the eight no-project variants, the Q-Sub 422, and the Q-Sub own-project create.
- `fk-probe.txt` and `fk-probe.sql`: the same tables, from the migrations' DDL, on a throwaway PostgreSQL 16. Organization 7 files a record under each kind of project. This is what the database alone did, and what the double does not model. The red run shows what each route sends. The probe shows which of those writes a key stopped, and that a deleted project gets through both tables.
- `green.txt`: each file run alone, all green.
  - The new test, 39/39. The reads, 20/20.
  - `q-sub.test.ts` 19/19 and `tenant-isolation-q-sub.contract.test.ts` 5/5.
  - `audit-trail-contract` 9/9 and `labeling-translations-shape` 3/3.
  - `tests/mdx-beta-surfaces-routes` 27/27 and `tests/mdx-qms-labeling-search-analytics-routes` 28/28. These two post UDI
    and labeling records with no project.
  - `q-sub.service` 5/5, `mdx-command-handlers` 43/43 and `ana-mdx-pen-scaffold` 16/16.
  - The gate and its self-test.
  - `baseline.txt` has eight of these at head. The new test's head run is `red.txt`. `mdx-command-handlers` and
    `ana-mdx-pen-scaffold` were run only after the change. They call the Q-Sub service, which did not change.
- Mutations. Each was applied to the working-tree file, run, and restored. The restored file's sha256 matched the
  backup each time, and `git diff` then showed only this slice's changes. Each red is confined to its target.

  | File | Mutation | Red |
  |---|---|---|
  | `mutation-M1.txt` | `POST /udi` skips `admitProject` | 6, all `POST /api/mdx/udi` |
  | `mutation-M2.txt` | `PATCH /udi/:id` skips it | 6, all `PATCH /api/mdx/udi/:id` |
  | `mutation-M3.txt` | `POST /labeling` skips it | 6, all `POST /api/mdx/labeling` |
  | `mutation-M4.txt` | `PATCH /labeling/:id` skips it | 6, all `PATCH /api/mdx/labeling/:id` |
  | `mutation-M5.txt` | Q-Sub create answers `TenantAccessError` with 403 again | 4 in the new test, plus 1 each in `q-sub.test.ts` and the contract test |
  | `mutation-M6.txt` | Q-Sub create drops the 503 | 2 |
  | `mutation-M7.txt` | `createQSubmission`'s ownership check removed | 6, with rows written under `bbbb…`, `cccc…`, `dddd…` and, unchecked, `aaaa…` |
  | `mutation-M8.txt` | UDI `admitProject` asks but ignores the answer | 8 writes, 4 reads |
  | `mutation-M9.txt` | labeling `admitProject` ignores the answer | 8 writes, 2 reads |
  | `mutation-M10.txt` | UDI `admitProject` drops its 503 | 4 writes, 2 reads |
  | `mutation-M11.txt` | labeling `admitProject` drops its 503 | 4 writes, 1 read |

  M7's file, `q-sub.service.ts`, is not this slice's to edit, even for a moment. So the route's import of the service
  resolved to a mutated copy in scratch, through the same alias harness. Its control, an unmutated copy through the same
  harness, is 39/39.
- `eslint.txt`: each changed file at head and now, with plain `npx eslint`. `mdx-udi.ts` keeps its two warnings at head: the summary read's length, now 146 lines (it was 149), and the create's complexity, now 25 (it was 24). The other files have none.
- Type check: `tsc --noEmit` over the six changed files and everything they import, exit 0 (`typecheck.txt`).
- `npm run ci:program-ownership-single-source` passes, and so does its self-test.

## Not done

- **The AnA tools write the same tables unchecked.** `create_udi_record` and `create_labeling_document` (`server/services/ana/AnaToolExecutor.ts`) insert the model's `program_id` with no ownership check. They have the same gap and the same key behaviour as the routes did. They are also a second writer of each table beside the route. Not in this slice's files.
- **The labeling writes have no role gate.** The UDI writes sit behind `requireEditorAccess`. `POST`/`PATCH /api/mdx/labeling` and the translation and symbol writes have none, and the mount in `register-inline-routes.ts` adds none, so a viewer can write labeling documents.
- **The Q-Sub create's status moved from 403 to 404.** No client calls it today, and the AnA paths call the service directly. Two test assertions were updated to match.
- **The check and the write are separate statements.** A project soft-deleted between them can still receive the row. The reads and `mdx-engineering.ts` have the same window. `programInOrganization` has a `forShare` option for a write that runs in one transaction. These writes use the pool.
- **Project sharing inside an organization** is not applied here, as on the reads.
- **`labeling_documents.artifact_id`** is client-supplied and has no key ("fk into concept2cure_artifacts" is a comment only). The same kind of gap, for a different parent.
- **`mdx-engineering.ts`** answers 500, not 503, when its ownership check cannot run.

## One refusal helper (the lead, on commit)

mdx-udi.ts and mdx-labeling.ts each had a byte-identical `admitProject`. It now lives once, in `server/lib/admit-project.ts`. Each route keeps a one-line delegate that passes its own logger, so the call sites are unchanged. After the move: the writes 39/39, the reads 20/20, `tests/mdx-beta-surfaces-routes` 27/27, and `ci:program-ownership-single-source` OK. mdx-udi.ts keeps head's two warnings; the other two files have none.

## Correction (the same day)

The hand-on above, that AnA's `create_udi_record` and `create_labeling_document` insert a model-supplied `program_id` with no ownership check, was wrong. It read only the handler bodies. Every AnA handler is registered through `registerToolHandler` (AnaToolExecutor.ts ~586-622), which runs `foreignProgramRefusal` (`programInOrganization`) and `writeRoleRefusal` before the handler. `ana-tools-and-role-gate/` pins this with a test: removing the wrapper's check sends both INSERTs under a foreign id. That folder also adds the missing role gate on the labeling writes.
