# Canonical upload byte-persistence refusal

Date: 2026-10-07. Workstream: existing W3/D4 Projects/Data Room intake.
Base: published `0d15907bb` on the only branch, `concept2cure-v2`.
Contract: `UPLOAD-DURABILITY-PLAN.md`. This receipt covers the bounded local
implementation and focused checks, not a full D4 release verdict.

## Defect and change

`server/routes/chat/upload.ts` previously caught `fs.mkdir`/`fs.writeFile`
failure as non-fatal. It then inserted upload metadata, extracted the
in-memory bytes and could create an ingested/extracted Data Room source,
artifact/provenance and retrieval atom before answering 200 `status: ready`.
The source's `storedArtifactRef` could therefore point to bytes that were
never stored successfully.

Only the existing persistence block/comment changed in production. Both
storage operations remain awaited, after the existing scanner and project
ownership checks and before upload metadata or downstream work. Failure now
returns HTTP 503 with this generic response:

```json
{"error":"The file could not be stored. Try again.","code":"UPLOAD_STORAGE_FAILED"}
```

No file ID, path, digest, driver error or success/capture fields are returned.
The already-enforced nonempty-buffer check makes the removed persistence
guard redundant. Format, tenancy, extraction, classification, versioning,
capture and retrieval code is unchanged. No cleanup, dependency, migration,
tool, integration or client surface was added.

## RED then GREEN

New regression: `server/routes/__tests__/chat-upload-durability.test.ts`.
The real mounted chat router receives multipart requests, runs its canonical
upload-safety middleware and calls the unchanged upload handler. Controlled
scanner, filesystem, database and downstream service fixtures keep tests off
provider networks, persistent databases and the upload filesystem. The real
project-ownership helpers run against the controlled query fixture.

```sh
npx vitest run --config vitest.config.ts server/routes/__tests__/chat-upload-durability.test.ts
```

Before the production edit: **6 failed / 5 passed (11 total), 13.77 seconds**.
All six storage-refusal cases incorrectly returned 200; UUID cases reached
source/atom entrypoints and numeric cases reached artifact/provenance paths.
The five success and upstream-refusal controls already passed.

After the production edit: **11 passed / 11, 14.53 seconds**.

| Case | Observed/asserted result |
| --- | --- |
| `mkdir` rejects, UUID/numeric/no-project | Safe 503; `writeFile` never runs; no downstream consequence |
| `writeFile` rejects, UUID/numeric/no-project | Safe 503 after directory creation; no downstream consequence |
| Successful UUID-project upload | Exact original buffer, tenant storage path and raw-byte SHA-256 preserved; source and retrieval response remain successful |
| Successful no-project upload | Bytes, metadata and extraction succeed; no Data Room source or atom is claimed |
| Successful numeric-workspace upload | Existing artifact/provenance, source and atom paths remain reached |
| Scanner rejects | Refused before storage or downstream work |
| Project ownership fails | Existing 404 before storage or downstream work |

For storage refusals, the regression permits ownership SELECTs but asserts
no mutating SQL and zero extraction, governed-context, artifact-provenance,
source lookup/create/supersession, classification or retrieval-atom calls.
The generic response is checked exactly, including injected private
filesystem error/path/digest not appearing in it. The source helper mocks
prove that their capture/audit entrypoints are never reached; this test does
not independently assess their internal transactions or audit implementation.

## Static checks

```sh
npx eslint server/routes/chat/upload.ts server/routes/__tests__/chat-upload-durability.test.ts
git diff --check
```

ESLint: **0 errors**. New test: **0 warnings**. Upload handler: **4 warnings**,
unchanged from the baseline (function length, complexity, two existing depth
warnings); complexity decreased from 78 to 76. No suppressions or baseline
changes. `git diff --check` passed. Integrated regressions, build, publication
and exact-source checks are owned by the control tower; no worker commit or
push, and no full local TypeScript check was run.

## Limits

- A rejected write can leave a directory or partial orphan bytes. This change
  intentionally does not delete ambiguous filesystem state.
- A fulfilled `writeFile` is not proof of fsync/crash durability, filesystem
  immutability or filesystem/database atomicity.
- Later database, extraction, source, provenance and embedding failure
  behavior and transaction boundaries are unchanged. Upload atoms remain
  explicitly bounded prefixes rather than whole-file indexing.
- This closes a prerequisite defect in existing upload intake. It does not
  create or verify a connector-to-original-bytes import callback, provider
  credentials/account access, or live connected-repository import.
