# LX-20 (D2): a new Authoring document is anchored to a project its organization owns, or it is not created

**Principle:** every chain of governed records starts at one project of the client's
organization (`docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md` §0).
**Found by:** the lineage-plan critic (P2) and the project-anchoring scout
(`wf_9dedbf38-bee`).

## The defect

`createDocument` (`POST /api/authoring/docs`) checked only that `client_program_id`
*looked* like a UUID. Its comment reasoned that "cross-org mis-scoping is already
prevented downstream: every read is gated on tenant_id". Reads are gated. The
**anchor** was not: a document of organization A could be created naming
organization B's project, a project that does not exist, or a deleted one.

## The fix

- **`programInOrganization(db, programId, organizationId)`** is the canonical
  tenancy check. It lives in `server/services/c2c/program-access.ts`, beside the
  authorization check `canMutateProgram`, which leaves tenancy to its caller. It
  returns false for a malformed id, another organization's project, a missing one,
  and a deleted one.
- **`createDocument`** refuses with 404 "Project not found" before anything is
  written. It returns 404 rather than 403, so the caller learns nothing about
  another tenant's ids.
- **`resolveOpenProgram`**, the AnA canvas tool's check (`authoring-draft-tool.ts`),
  now calls the same function in place of its own copy.

## Evidence

- `01-red-before-fix.txt`: a foreign, a missing and a deleted project each give
  `kind: 'created'`.
- `02-green-after-fix.txt`: 4/4. Each is refused 404 with **no INSERT, UPDATE or
  DELETE issued**, and a malformed id is still refused 400.
- 30 dependent suites are green: the authoring, draft-tool and program-access
  users, all 11 golden journeys and the LX-00 walk, 297 tests. `tsc` is clean on the
  changed files.

## The remaining copies (LX-20, by owner)

About a dozen hand-written copies of the question remain, most ignoring
`deleted_at`. Each moves onto `programInOrganization` as its lane's window allows:

- `server/routes/chat/upload.ts`, which checks the format only (critic P2). This is
  the AnA client-files lane, `…01DiJJAk`.
- `server/services/vault/vault-ingest.service.ts:191`, which ignores `deleted_at`.
  Same lane.
- `server/services/authoring/authoring-from-draft.ts`, which checks the format only.
  This is `…01FSu2RL`'s window.
- `server/routes/c2c/projects.ts` ×6, `server/routes/c2c/actions.ts:158`,
  `server/routes/mdx-engineering.ts:157` and `innovation-routes.ts` `programBelongsToOrg`.

## Correction, 2026-09-26: two suites the dependent run missed

The line above about "30 dependent suites green" was incomplete. The
project-anchoring audit (`wf_9dedbf38-bee`, amendments §5) found a suite that
fails at HEAD, and a sweep of every suite that writes its own `regulatory_programs`
table found a second.

- **`tests/authoring-program-scope.pglite.test.ts`** answered 500 on create. Its
  database had no `regulatory_programs` table, so `programInOrganization` threw.
  - It now applies the real `migrations/20260524_program_workbench_schema.sql`
    and seeds its two projects in organization 1.
  - It gains an over-HTTP case: another organization's project is refused with
    404 and no document is written.
  - That case fails with 201 when the ownership check is disabled, and passes
    with it on.
- **`server/routes/__tests__/review-board-authoring-store.pglite.integration.test.ts`**
  failed to set up: its hand-written `regulatory_programs` had no `deleted_at`,
  which the check reads. The column is added, and all 8 tests pass.

Both were fixture gaps, not product defects: a create naming a project that its
database did not hold was, correctly, refused. Every suite that touches the check
(56 files) and every suite that writes its own program table (26 files) now
passes. The only exception is `authoring-section-commits-to-filing`, whose three
failures predate this change (fde9d704's mandatory reason; handed on, on the
board).
