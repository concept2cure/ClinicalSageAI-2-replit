# PR #148: targeted Data Room / ingestion / storage review

Read-only review of https://github.com/concept2cure/ClinicalSageAI-2-replit/pull/148 against study goals, 2026-10-14.

PR head: 09a38edb070029a26cbdfc1203dfb290ff4c0108. Base: 1fdddeab1e7c0697cabf67c8da6a88c53b9709d3. Current comparison: concept2cure-v2 HEAD 87b27c897c5d1be20b0527009bcaf425ebbf3af6. Selected-file git diff/show only; no checkout/branch/app changes. No deployed exploit or data read performed. Pure URL-construction reproduction executed locally with dummy host.

## Findings most relevant to regulated evidence quality

### 1. [P1] Vault reads claim a SHA-256 without verifying downloaded bytes

**Introduced in PR:** [server/services/vaultService.ts:161](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/server/services/vaultService.ts#L161). `streamVersion` reads sidecar, checks file exists, stats and streams it, then returns `sha256: meta.sha256` without hashing file content. The header promises "content hash verified on read" but no verification exists. The new IVDR binder downloads set X-Content-SHA256 to that value (PR `server/routes/ivdr-binder-routes.ts:953-959`, `:997-1009`).

**Trigger/impact:** stored PDF/DOCX/ZIP/manifest bytes changed or corrupted after generation while sidecar remains unchanged. Download silently returns altered bytes with original digest header. A regulatory pack's claimed sealed content identity is false; downstream consumers relying on recorded manifest digest cannot assume approved bytes were served.

**Current applicability:** the old service was deleted/consolidated, and tenancy improved. The integrity defect remains source-supported on local storage: current `server/services/storage/local-provider.ts:144-148` reads bytes but returns sidecar hash without comparison. Current `server/routes/ivdr-binder-routes.ts:953-959`, `:1001-1013` serves bytes/hash without recomputing and comparing against recorded pack digest. This is not a current cross-tenant finding. Local-storage deployment/runtime conditions were not inspected.

**Improvement:** one verified storage read contract that computes actual digest and validates it against version/pack identity before download/export; distinguish missing from integrity failure; preserve current tenant/sidecar checks and fail closed for regulated artifacts.

### 2. [P1 historical, fixed] A project ID can redirect the server-admin Shadow proxy outside its intended route

**Introduced in PR:** [server/routes/knowledge-base.ts:335](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/server/routes/knowledge-base.ts#L335). Decoded Express parameter interpolated into `/knowledge/project-context/${projectId}`, resolved using `new URL`, with shared X-Admin-Token automatically supplied (`:119`).

**Trigger/impact:** parameter decoding '../../admin' changes upstream pathname to '/admin'; authenticated external user reaches other GET endpoints under server-held admin authority. Pure local URL reproduction returned historical /admin; no network call made.

**Current applicability:** fixed at current `server/routes/knowledge-base.ts:873` via encodeURIComponent. Checked-in regression `server/routes/__tests__/knowledge-base-proxy-traversal.test.ts:47-59` demonstrates old traversal and `:63-87` pins safe form. Do not report as open current bug.

**Lesson for moat:** typed, server-admitted source identity and scoped connector contracts must be invariant across every retrieval surface, including legacy BFFs.

### 3. [P1 historical contract] Authenticated knowledge proxy does not authorize the caller's project before using shared admin credentials

**Introduced in PR:** [server/routes/knowledge-base.ts:292](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/server/routes/knowledge-base.ts#L292) and `:326-336`. Router authenticates JWT (`:38`), but project_id comes directly from body/path. It forwards read/write using one server admin token, with no organization/project admission. Historical Shadow endpoints accept only project_id (PR `shadow_service/shadow_service/router_knowledge.py:130-149`, `:175-190`); historical Python project store index is keyed solely by caller project string (PR `backend/knowledge_ingestion.py:360-367`, `:487`).

**Trigger/impact at PR implementation:** with Shadow enabled, authenticated caller names another project's ID to retrieve its context or ingest evidence into it. RLS cannot repair authorization in this filesystem-backed service: neither authenticated org nor user is sent to Shadow.

**Current applicability:** current proxy still mounted (`server/bootstrap/register-document-routes.ts:260`), JWT gate `knowledge-base.ts:122`; upload/context still proxy project-only with admin token (`:812-833`, `:848-877`). Historical Python filesystem implementation is no longer present in current checkout. Actual deployed Shadow contract/config and current access behavior unknown. Therefore current item is **authorization contract requiring validation**, not a verified live cross-tenant exploit.

**Improvement:** admit project with verified org/actor before proxy; send trusted scoped context; upstream must enforce same boundary. Zero-doc/failed-retrieval behavior must remain distinct.

### 4. [P2] Replacing born-digital PDF extraction with a required Python runtime regresses Node-only deployments

**Introduced in PR:** [server/services/unifiedDocumentIngestion.js:534](https://github.com/concept2cure/ClinicalSageAI-2-replit/blob/09a38edb070029a26cbdfc1203dfb290ff4c0108/server/services/unifiedDocumentIngestion.js#L534). Former PDFParser extraction replaced by Python bridge. If local FastAPI unavailable, fallback hardcodes .venv/bin/python3 unless PYTHON_PATH set (`:93`); spawn error resolves empty text/success false (`:171-180`), but PDF branch only logs failure and `extractContent` returns the empty text. No JS born-digital fallback remains. Further direct Python spawn has no timeout/kill/resource budget after HTTP timeout.

**Impact:** valid PDFs that previously parsed in Node become unreadable without independently provisioned .venv/FastAPI. Python/OCR hangs can hold caller indefinitely. The code treats extraction failure as a nonthrowing empty extraction, complicating trustworthy processing status.

**Current applicability:** Python bridge still present current file same `:53-184`, `:534`. It is not the current primary Data Room extractor, which uses OCR facade in data-room-processing.ts. Legacy knowledge-base extract-PDF fallback imports it at current `knowledge-base.ts:1671`, but passes wrong file property names (originalName/mimeType vs originalname/mimetype), then returns a success:true placeholder after fallbacks (`:1694-1702`). That latter bug is current, not attributable to PR #148 unless a separate diff confirms its introduction. Do not inflate primary Data Room impact.

**Improvement:** capability-aware extraction with Node text-first strategy, bounded fallback workers, explicit unreadable outcome/coverage, no successful content placeholder; use current canonical extraction contract.

## Historical surface vs current product

PR's `client/src/pages/vault/DataRoomPage.jsx` is added but PR git grep finds no importer besides its definition. It calls `/api/evidence/semantic-search` (`:122`) with localStorage org fallback 7, while no matching server endpoint found; insert action just console.logs (`:582-589`). It is demo/integration scaffold, not evidence that the PR shipped an end-to-end shared Data Room. Current legacy pages directory removed; current Project Data Room/Vault and sources panel are separate implemented surfaces. Treat screenshot/features as historical concepts unless runtime route wiring is demonstrated.

## Deferred concern, excluded from confident current findings

PR knowledge-base explicit CMC fetches filter only project ID (`:491-518`, `:797`), not authenticated org. Similar query shapes remain current (`:1050-1077`, `:1423`). Current RLS includes cmc_projects (server/db/__tests__/rlsMigrationShape.test.ts:95), and deployed tenant-context/DB role behavior was not tested. No current cross-tenant leak conclusion based solely on missing SQL predicate.

No full-PR review, fresh test suite or deployed authorization verification claimed.

