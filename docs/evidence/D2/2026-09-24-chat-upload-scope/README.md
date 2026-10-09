# D2: chat upload under enforced RLS. Suspected defect checked, not present; guard added

**Row:** D2 (the launch catalog working in the production posture). This covers
the first step of AnA consuming a client's documents. **Workstream:** the AnA
client-files lane. **Date:** 2026-09-24. **Outcome: no defect.** This records a
check, not a fix.

## What was suspected, and why

`POST /api/chat/upload` is `multer(...).single('file')` followed by the handler
(`server/routes/chat.ts:87`), and it does not re-enter a tenant scope. Two other
multipart routes record that busboy's stream listeners drop the
AsyncLocalStorage scope, and they re-enter it: the Vault ingest route
(`server/routes/vault-ingest.ts`) and the authoring images route. Under
`RLS_ENFORCE=on` the pool refuses any unscoped query, so if the chat route lost
its scope, every chat upload would fail in production. The trigger was a
`FAIL-CLOSED … requires an active tenant scope` line in this lane's own db run.
That line came from `tests/db/document-catalog.dbtest.ts` calling the atom
writer directly with the superuser pool and no scope, so it was a test
artifact.

## What was found

`tests/db/chat-upload.dbtest.ts` mounts the **real** chat router behind the
**real** `establishRequestTenantScope`, and posts a file as `app_service` with
RLS enforced.

| File | Result |
|---|---|
| `green/db-chat-upload.txt` | 1 passed. The upload answers success and its `file_uploads` row is recorded for the tenant. The scope survives multer on this route. |
| `red/db-chat-upload-no-scope.txt` | The same test with the scope middleware removed: `500 {"code":"UPLOAD_ERROR"}`. So the test **can** detect a lost scope; it is not passing by default. The file was restored at once. |

## Why keep the test

No real-database test covered chat upload before this. It is the path by which a
client's document first reaches AnA. If a future change to multer, busboy or the
middleware order drops the scope here, uploads fail only in the production
posture, and this test is what would say so.

## Not covered

The governed-artifact and retrieval-atom branch runs only when a project is
attached. It embeds through an external provider, which a test must not call.
