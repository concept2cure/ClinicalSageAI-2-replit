# LX-20 / PF-02 (D2): a Data Room file is anchored to a project its organization owns, or it is not captured

`POST /api/chat/upload` (`server/routes/chat/upload.ts`) is the Data Room's capture
route. It accepted any `projectId` that looked like a UUID. So a file could be
anchored to another organization's project, or to one that does not exist or was
deleted. Its source identity (`cre_evidence_sources.client_program_id`) then named
a project that no one in the uploader's organization could open.

## The fix

- The project is resolved once, at the top of the handler.
- A UUID project must be a live project of the uploader's organization.
  `programInOrganization` is the canonical check, as in LX-20.
- Otherwise the upload is refused with 404 `PROJECT_NOT_FOUND`. This happens before
  the bytes are stored, the `file_uploads` row is written, or a source is created.
- The numeric workspace id-space and an upload with no project are unchanged. Both
  are PF-07 and PF-08, which carry founder decisions (see
  `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`).

## Evidence

- **`01-red.txt`** is the handler before the check, with the new test.
  Another organization's project is accepted: the response is not 404, and a
  source is created.
- **`02-green.txt`**:
  - that case is refused 404 with no INSERT, UPDATE or DELETE and no source;
  - the existing UUID-scoped case now models a project the organization owns, and
    is captured as before;
  - the three upload suites and the LX-00 walk pass: 42 tests, including the
    walk's capture hop, which uploads under an owned project.

**Lane:** the identity block is unclaimed; its window closed at 02:29Z on
2026-09-26. The retrieval-atom blocks belong to `…01DiJJAk`, and none of them was
touched.
