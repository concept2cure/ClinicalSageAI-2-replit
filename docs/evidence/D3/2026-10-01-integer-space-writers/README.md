# PF-03 (D3): writers in the integer space check the projects row is the caller's

Plan: `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §PF-03. A scouting
workflow, with a skeptic per claim (`wf_39bf69be-ba3`), confirmed each defect
open at HEAD and reachable in production.

## The defect

The legacy integer project id (`projects.id`, the key `concept2cure_artifacts`,
`c2c_submission_packages` and the Data Room source identity hang from) was taken
from the request or from the model's tool input and written as given. The one
existing key, `project_id → projects(id)`, proves the project exists, not that it
is the writer's organization's. So a record of organization A could be filed
under organization B's project. The Artifacts Center then showed B's project
code and name to A.

## The fix: one check everywhere

`projectBelongsToTenant` (`server/services/cmc/project-membership.ts`) is the
one membership check. It answers for a live program or a `projects` row of the
organization. Each writer asks it first, on its own connection or transaction,
before anything is written. A lookup that cannot complete throws, and nothing is
written.

| Writer | Reached from | Refusal |
|---|---|---|
| `server/routes/chat/upload.ts` (numeric project; the UUID half was PF-02) | `POST /api/chat/upload` | 404 `PROJECT_NOT_FOUND`, before the bytes are stored |
| `server/routes/submission-ops.ts` `POST /packages` | Submission Ops | 404 `PROJECT_NOT_FOUND` |
| `server/services/ana-ri/command-executor.ts` `createSubmissionPackage` | AnA `create_submission_package` (governed action) | `PROJECT_NOT_FOUND`, rolled back before the INSERT and the signature |
| `server/services/ana/artifactVersionStore.ts` `upsertDocumentArtifactVersionTx` | the stream's draft save (`post-processing.ts`) and `commit_document_revision` (`document-spine.ts`) | `ArtifactProjectNotFoundError`, before the locking SELECT, so the caller's transaction rolls back |

The version store is the choke point for both AnA draft paths. So
`post-processing.ts`, claimed by `…019ZvHmh` on the board, did not need
editing. Its hand-copied anchor SELECT remains, and is handed to that lane.

The reader is `server/routes/artifacts-center-routes.ts`. Its project join is
now `p.organization_id = a.organization_id`, so an artifact under another
organization's id shows `proj_<id>` and never that organization's code or name.

## Tests

- `tests/routes/chat-upload-source-identity.test.ts`: a numeric project of
  another organization is 404, with no source and no write. The three upload
  suites admit their fixture project through the membership mock; its SQL is
  proven on PGlite (`server/services/cmc/__tests__/project-membership.pglite.test.ts`).
- `tests/submission-ops-package-project.pglite.test.ts`: the real router on real
  SQL, with the package tables lifted from `0002_phase15_submission_ops.sql`.
  - An own project gets the package and its sections.
  - Another organization's project, and one that does not exist, are 404 with
    no package and no section.
- `server/services/ana-ri/__tests__/ana-governed-command-signature.pglite.integration.test.ts`:
  another organization's project is refused with no package and no signature.
  The fixture gains `regulatory_programs`, which the membership check reads.
- `server/routes/__tests__/artifacts-center-foreign-project.pglite.test.ts`: the
  real route on real SQL. An own project shows its code; a foreign one shows
  `proj_20`, and the response never contains its code or name.
- `server/services/ana/__tests__/artifact-version-store.pglite.integration.test.ts`:
  another organization's project and a missing one both throw
  `ArtifactProjectNotFoundError`, and the artifact and version counts are
  unchanged. Three version-store suites seed the project row their drafts are
  filed under.

## Red, then green

Each source file was restored to trunk and its new test run against it:

- `01-red-chat-upload.txt`: the numeric refusal fails.
- `02-red-submission-ops.txt`: both 404 cases fail.
- `03-red-ana-package.txt`: the refusal fails.
- `04-red-artifacts-center.txt`: the foreign case fails.
- `05-red-version-store.txt`: the refusal fails.

`06-green.txt`: **105 files, 1596 tests pass** (1 skipped). That is every
upload, submission-ops, AnA command, Artifacts Center, version-store,
document-spine and AnA stream suite, plus the founder-path walk.

## Found on the way

- `c2c_package_sections.updated_at`, like `audit_events.updated_at`, is declared
  in `shared/schema.ts` and laid down by `drizzle-kit push`. No migration adds
  it. Handed to the audit/D3 lane with the other.
- The database still admits a cross-organization `project_id` from any writer
  not listed here (`concept2cure_artifacts` has eleven). The durable fix is
  PF-04's pattern on the integer key, a NOT VALID same-organization composite
  key. That is next.

## Handed on

- `approve_import` and `save_document_to_vault` (`AnaToolExecutor.ts`) → the D6
  lane `…01471vSK`, whose claim covers model-supplied record ids.
- The anchor SELECT copy in `post-processing.ts` → `…019ZvHmh`.
