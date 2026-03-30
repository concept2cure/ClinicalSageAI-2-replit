# Server Routes & Services Audit Report

**Date:** 2026-03-30
**Scope:** Recently added/modified server routes and services
**Auditor:** Claude Code

---

## CRITICAL Issues

### 1. Missing Route Mounts (Dead Routes)

**comment-routes.ts** and **hallucination-check.ts** export routers that are **never mounted** in `server/index.ts`.

| File | Line | Issue |
|------|------|-------|
| `server/routes/comment-routes.ts` | 637 | `export default router` -- never imported in `server/index.ts` |
| `server/routes/hallucination-check.ts` | 258 | `export default router` -- never imported in `server/index.ts` |

**Impact:** All comment CRUD routes (`GET/POST /documents/:id/comments`, `PATCH/DELETE /comments/:id`, `POST /comments/:id/replies`, `POST /comments/:id/address-with-ai`) and hallucination validation (`POST /validate-claims`) are completely unreachable. Any frontend code calling these endpoints will get 404s.

**Fix:** Add mount blocks to `server/index.ts`:
```typescript
app.use('/api', commentRoutes);           // comment-routes.ts uses /documents/:id/comments paths
app.use('/api/hallucination', hallucinationRoutes);
```

---

### 2. `jose` Module Not Installed -- Authoring Router Fails to Import

| File | Line | Issue |
|------|------|-------|
| `server/routes/authoring.router.ts` | 16-23 | `require('jose')` throws `MODULE_NOT_FOUND`, then line 22 rethrows, preventing the entire module from loading |

The code explicitly does:
```typescript
jose = require('jose');
if (!jose) throw new Error('JWT verifier library (jose) did not load');
```

Since `jose` is not installed (`npm ls jose` returns nothing), this `throw` fires at import time. The mount block in `server/index.ts` (line 4081) catches it silently:
```typescript
} catch (error) {
  console.error('Failed to mount Authoring Router:', error);
}
```

**Impact:** The **entire authoring router** (174KB, 5213 lines) is silently unavailable at runtime -- all document workflows, tracked change decisions, templates, export history, and compliance features under `/api/authoring/*` return 404. This includes the tracked change decision endpoints you specifically asked about.

**Fix:** Install `jose`: `npm install jose`

---

### 3. Connector Method Name Mismatches in `save-to-connector`

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1447 | Veeva: calls `(connector as any).uploadDocument?.(...)` but `VeevaVaultConnector` has `upload()` |
| `server/routes/knowledge-base.ts` | 1471 | SharePoint: calls `(connector as any).uploadDocument?.(...)` but `SharePointConnector` has `upload()` |
| `server/routes/knowledge-base.ts` | 1489 | OneDrive: calls `(connector as any).uploadDocument?.(...)` but `OneDriveConnector` has `upload()` |
| `server/routes/knowledge-base.ts` | 1507 | Google Drive: calls `(connector as any).uploadDocument?.(...)` but `GoogleDriveConnector` has `upload()` |
| `server/routes/knowledge-base.ts` | 1525 | Box: calls `connector.upload(fileBuffer, fileName, mimeType, folderPath)` but `BoxConnector` has `uploadDocument(options)` |

The method names are **inverted** for all 5 connectors:
- Veeva, SharePoint, OneDrive, Google Drive all define `upload(file, fileName, mimeType, folderPath)` but the route calls `uploadDocument(options)`
- Box defines `uploadDocument(options)` but the route calls `upload(file, fileName, mimeType, folderPath)`

The `?.()` optional chaining on the first four will silently return `undefined` instead of throwing, making the save appear to succeed (result has `undefined` for `id` and `url`).

**Fix:** For Veeva/SharePoint/OneDrive/Google Drive, call `connector.upload(fileBuffer, fileName, mimeType, folderPath)`. For Box, call `connector.uploadDocument({ name: fileName, buffer: fileBuffer, mimeType, folderId: folderPath })`.

---

### 4. `emitKBProvenanceEvent` Called with Wrong Parameter Names

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1956-1973 | In autodraft generate: passes `userId` and `action` instead of `actorId`, `eventType`, `eventAction` |

The function signature requires `eventType` (string, used in DB insert) and `eventAction` (string, used in DB insert). The call passes:
```typescript
{
  userId: user?.id,           // Not a valid parameter -- ignored
  action: 'autodraft_generate', // Not a valid parameter -- ignored
  // Missing: eventType, eventAction (required for DB insert)
}
```

**Impact:** The provenance insert will fail because `eventType` and `eventAction` are `.notNull()` in the schema. The `.catch(() => {})` silently swallows the error, so provenance for autodraft is silently lost.

---

## HIGH Issues

### 5. `processWithOCR` Called with Wrong Arguments

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1345 | OCR route: `ingestion.processWithOCR({ buffer, originalName, mimeType })` |

The actual method signature is `processWithOCR(fileBuffer: Buffer, fileType: string)` -- positional args, not an object.

**Impact:** When the analytics engine is down, the OCR fallback path passes an object where a Buffer is expected. `fs.writeFileSync(tempFile, fileBuffer)` in the ingestion service would write `[object Object]` to disk. The try/catch silently degrades to the "OCR unavailable" fallback.

---

### 6. `processDocument` Called with Mismatched Property Name

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1270-1273 | PDF extract route: passes `{ buffer, originalName, mimeType }` but `processDocument` reads `file.originalname` (lowercase `n`) |

**Impact:** The fallback extraction path would log `"Starting processing: undefined"` and potentially fail on filename-based operations. The try/catch silently degrades to the final fallback.

---

### 7. `db.execute()` Called with Incompatible Arguments

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1596-1599 | `db.execute({ sql: '...', args: [...] } as any)` -- Drizzle ORM's `execute()` takes a `sql` tagged template literal, not an object with `sql`/`args` properties |

**Impact:** `getConnectorCredentials()` will always throw at runtime on the Drizzle call, falling through to the catch block. Connector credentials from the DB will never be loaded; only env var fallback works.

---

### 8. Missing `contentHash` and `organizationId` in Artifact Version Insert (AutoDraft)

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1945-1953 | `concept2cureArtifactVersions` insert missing `contentHash` (.notNull()) and `organizationId` (.notNull()) |

The schema requires both fields:
- `contentHash: text('content_hash').notNull()`
- `organizationId: integer('organization_id').notNull()`

The insert only provides `artifactId`, `version`, `content`, `changedBy` (wrong column name -- schema has `createdById`), and `changeDescription`.

**Impact:** Every autodraft artifact version insert will fail with a NOT NULL constraint violation. The `.catch(() => {})` silently swallows it.

---

### 9. `pdf.js-extract` Not Installed

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1757 | `await import('pdf.js-extract')` -- package not in `node_modules` |

**Impact:** IND AutoDraft PDF extraction always falls through to the `[PDF file: ... Text extraction unavailable.]` fallback. Users uploading PDFs to AutoDraft get no text extraction. The dynamic import is in a try/catch so it degrades gracefully but silently.

---

## MEDIUM Issues

### 10. API Response Envelope Inconsistency

None of the three audited route files use the `sendSuccess()`/`sendError()` envelope pattern from `concept2cure.ts`:

| File | Issue |
|------|-------|
| `server/routes/knowledge-base.ts` | Uses raw `res.json()` / `res.status(N).json({ error: ... })` throughout |
| `server/routes/comment-routes.ts` | Uses raw `res.json()` / `res.status(N).json({ error: ... })` throughout |
| `server/routes/hallucination-check.ts` | Uses `res.json({ success: true, data: ... })` -- closer but not using `sendSuccess`/`sendError` helpers |

**Impact:** Inconsistent error shapes for frontend consumers. The frontend's `apiRequest()` may expect a specific envelope format.

---

### 11. Missing Tenant Scoping in `save-to-connector`

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1396 | `orgId = user?.organizationId || user?.orgId || 1` -- falls back to hardcoded org ID `1` |

**Impact:** If the user object is missing org context (e.g., corrupted JWT), operations default to org ID 1, potentially cross-tenant. The hardcoded `1` is a security risk.

---

### 12. Missing Handlers for Declared Job Types

| File | Line | Issue |
|------|------|-------|
| `server/services/automation/scheduled-jobs.ts` | 25-27 | `compliance_sweep` and `external_data_refresh` are declared as valid `ScheduledJobType` but no handler is registered |

**Impact:** If these jobs are ever scheduled (e.g., via `registerDefaultSchedules`), Bull will process them and hit `throw new Error('Unknown job type: ...')`, marking the job as failed after 3 retries.

---

### 13. `vault_dms` Connector Missing `organizationId` in Version Insert

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1541-1546 | `concept2cureArtifactVersions` insert cast as `any`, missing `organizationId`, `contentHash`, `content` (uses variable `content` which is HTML string from request body) |

**Impact:** The version insert will fail on NOT NULL constraints. Silently caught.

---

## LOW Issues

### 14. In-Memory AutoDraft Session Store Not Cluster-Safe

| File | Line | Issue |
|------|------|-------|
| `server/routes/knowledge-base.ts` | 1634-1645 | `autoDraftSessions = new Map()` -- in-memory, lost on restart, not shared across cluster workers |

**Impact:** If the server uses PM2 clustering or restarts between upload and generate calls, the session is lost. Consider using Redis or DB-backed sessions.

---

### 15. Scheduled Jobs: `compliance_sweep` Not in Default Schedule But Declared

The `registerDefaultSchedules()` function (line 284) registers `data_freshness_check`, `dependency_staleness_audit`, and `automation_digest` but not `compliance_sweep` or `external_data_refresh`. These types exist but are unreachable without custom scheduling.

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 4 | Unmounted routes (2), jose missing (authoring router dead), connector method mismatches (5 connectors) |
| HIGH | 5 | Wrong function args (processWithOCR, processDocument), wrong Drizzle API, missing NOT NULL fields, missing npm package |
| MEDIUM | 4 | Missing sendSuccess/sendError envelope, hardcoded org fallback, missing job handlers, vault_dms schema violations |
| LOW | 2 | In-memory session store, unused job types |

### Priority Fixes

1. **Install `jose`** -- restores the entire authoring router
2. **Mount `comment-routes` and `hallucination-check` in `server/index.ts`**
3. **Fix connector method names** in `save-to-connector` (swap `upload`/`uploadDocument`)
4. **Fix `emitKBProvenanceEvent` call** in autodraft generate (use correct param names)
5. **Fix artifact version inserts** to include `contentHash` and `organizationId`
6. **Install `pdf.js-extract`** or provide alternative PDF extraction for autodraft
7. **Fix `processWithOCR` and `processDocument` call signatures**
8. **Fix `db.execute` call** in `getConnectorCredentials` to use Drizzle `sql` template
