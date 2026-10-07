# Conversation-file adoption: verified bytes and protected capture

Date: 2026-10-07. Workstream: W3/D4, existing Projects → Data Room handoff.
Base: `1995c72c1` on `concept2cure-v2`. Contract: `ADOPTION-PLAN.md`.

## Bounded implementation

`POST /api/c2c/projects/:id/adopt` previously trusted upload metadata without
reading its bytes. A missing or altered file and a foreign storage path could
be captured as a project source, and an altered historical duplicate could be
reported already adopted. The endpoint now uses canonical `loadUploadedFile`
and requires its `integrity: verified` result. It uses existing `sha256Hex`
for the verified buffer identity, not an independent integrity engine.

Exact transaction order in `server/routes/c2c/projects.ts`:

1. `BEGIN`; unlocked organization/program/lead authorization read.
2. Canonical `lockDocumentDispositionProgram`: five-second local lock timeout
   and per-organization/program advisory lock, normalizing UUID case.
3. Program `FOR UPDATE` read; recheck existence and mutation authorization.
4. `LOCK TABLE public.cre_evidence_sources, public.file_uploads IN ROW EXCLUSIVE MODE`.
5. Initial eligible upload identity read. Missing recorded checksum still
   refuses with `409 FILE_IDENTITY_UNKNOWN` before a byte read.
6. Canonical tenant-scoped byte loader; require verified integrity.
7. Fresh upload read with `uploadedBinaryAvailableSql('f')` and `FOR SHARE OF f`;
   compare current file ID/path/checksum to the loaded identity and actual digest.
8. Existing scoped checksum lookup on the **same client**; historical duplicate
   semantics remain unchanged. Duplicate adoption rolls back and writes nothing.
9. Canonical `createSource(..., client)` and its capture audit, then the existing
   program-adoption audit, then `COMMIT`. Failures roll back and release the client.

The table reservation precedes every eligible identity read and follows the
withdrawal impact-table order. It covers organization-wide upload eligibility,
including a withdrawal associated with another program. It does not introduce
a dispositions-table-first lock inversion. These ordered checks are not an
independent-connection concurrency experiment.

Capture uses the verified upload path, canonical actual digest and buffer length,
plus the final fresh row's name/MIME. The actor is explicit `createdBy: userId`;
extraction is explicitly `pending`. Source/audit identity matches the verified
bytes; the original upload is neither changed nor deleted.

Safe loader failure mapping (no path, raw driver or digest details in responses):

| Failure | Response |
| --- | --- |
| Initial tenant-scoped metadata absent or ineligible | `404 FILE_NOT_FOUND` |
| Unknown/foreign/path-inconsistent canonical upload | `404 UPLOAD_NOT_FOUND` |
| Stored bytes missing | `410 UPLOAD_BYTES_MISSING` |
| Stored bytes do not match their recorded digest | `409 UPLOAD_INTEGRITY_FAILED` |
| Missing recorded checksum / unverifiable integrity | `409 FILE_IDENTITY_UNKNOWN` |
| Identity/availability changes at final locked read | `409 FILE_CHANGED` |

`findSourceByChecksum` gained only an optional fourth executor parameter and
uses `(exec ?? pool).query`. Its filters, ordering, historical/superseded-source
behavior, empty-checksum behavior and pool fallback are unchanged.

## RED → GREEN receipts

Before route/helper implementation:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run \
  server/routes/c2c/__tests__/projects-adoption.test.ts \
  server/services/clinical-regulatory-evidence/__tests__/source-checksum-executor.test.ts \
  --config vitest.config.ts --reporter=dot
```

**RED: 12 failed / 11 passed (23).** Altered and missing bytes wrongly returned
201; a foreign path wrongly returned 201; the loader, program/impact ordering
and final rechecks were absent; an altered duplicate returned 200; the supplied
checksum-lookup executor was ignored. Unchanged authorization, no-checksum and
rollback controls passed. After implementation: **GREEN: 23/23 passed**.

Final related-control run used the same options plus
`projects-authorization.test.ts`, `projects-closeout.test.ts`,
`projects-create.test.ts` and `source-version.test.ts`:
**6 files / 88 tests passed**, duration 13.01 seconds. Coverage includes loader
refusals, safe responses, final path/hash/eligibility changes, ordered locks,
actual buffer size/fresh metadata, capture pending status, source/capture-audit/
program-audit failure rollback, historical idempotency and authorization.

Scoped ESLint: tests **0 errors / 0 warnings**; `projects.ts` **0 errors / 5
warnings**, exactly its baseline count; `evidence-spine.service.ts` **0 errors /
5 warnings**, exactly its baseline count. No new callback complexity/length or
helper warnings, suppressions or baseline edits. `git diff --check` passes.

## Evidence limits and control-tower ownership

The dedicated tests exercise the real canonical loader, source writer and audit
call paths using query/filesystem doubles. They do not establish real database
atomicity, independent-connection withdrawal serialization, filesystem/symlink
immutability, staging/provider behavior or regulatory qualification. Audit
sealing is mocked; development audit/startup warnings are not qualification
receipts. The control tower owns actual-PGlite ordered-SQL/rollback checks,
founder lineage, integrated gates/build, exact-source GitHub TypeScript/lint,
review and publication. No full local TypeScript run, commit or push was made
by this worker.

Successful adoption means source capture with extraction pending, not parsing,
scientific qualification, curation, Vault filing, approval or submission. No
dependency, migration, new surface/tool or approval/export gate changed.
