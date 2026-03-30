# Hosting Cost, Responsiveness, and Beta Deployment Efficiency Audit

Date: 2026-03-29
Scope: `client/`, `server/`, `services/`, `shadow_service/`, dependency manifests.

## Method
- Static repo audit (no production traffic traces provided).
- Build step attempted with `npm run build` but failed due to missing local Vite binary (dependencies not installed in environment).
- Source inspection focused on bundle risk, startup/cold-path behavior, query/data-shape risk, polling/queues/logging, and document processing paths.

## 1) Top cost drivers

1. **Very large frontend surfaces likely driving JS parse/compile + memory costs on weak beta hosts.**
   - Multiple single-file UI modules are very large (e.g. ~1.1MB `ComprehensiveCMCPlatformClean.jsx`, ~731KB `CoAuthor.jsx`, ~392KB `CERV2Page.jsx`).
   - Even with lazy-loading, these files increase long-tail route latency and can create expensive client CPU/memory spikes on first use.

2. **Over-broad dependency footprint and provider overlap.**
   - Runtime dependencies include many overlapping SDKs and stacks (OpenAI + Anthropic + Google + HuggingFace + LangChain; multiple DB client stacks; multiple date and PDF stacks).
   - Larger install/deploy image, cold start I/O, and higher vulnerability/maintenance surface.

3. **Eager server startup imports with broad route/service registration.**
   - `server/index.ts` imports and registers many route families and services at process boot.
   - `server/routes.ts` mounts many modules and requires additional heavy routes/services at startup.
   - This pattern increases cold start and memory RSS in beta environments.

4. **Polling-heavy UX in monitoring/security views.**
   - 30s and 60s intervals across multiple hooks/views can multiply backend load per connected user.

5. **In-process background loops and AI-heavy semantic processing.**
   - `clinical-intelligence-service` starts interval queue processing in-process and performs embedding + semantic extraction work that can be CPU/token intensive.

6. **Potentially unbounded in-memory collections and file-backed log scans.**
   - In-process caches/queues/sets and JSONL log read-all patterns can grow with uptime and tenant volume.

## 2) Top responsiveness risks

1. **Large route payloads with no pagination guardrails in submission center endpoints.**
   - `/submission-center/tasks` returns all matching tasks and joins project fields; no explicit `LIMIT` by default.
   - `/submission-center/projects` similarly returns full result set and aggregated counts.

2. **UI polling against endpoints that can return broad datasets.**
   - Activity monitor polls task + proof audit data every 30s in live mode.
   - Cortex health polling every minute is fine alone, but aggregate polling from multiple widgets can stack.

3. **Main-thread expensive client rendering/computation risk in large components.**
   - Massive JSX modules strongly suggest expensive render paths and reconciliation costs.

4. **Monolithic server bootstrap path.**
   - Broad imports/mounting at startup increases time-to-first-request after deploy/scale-to-zero resumes.

5. **Document ingestion/extraction paths process full file buffers synchronously in request/service context.**
   - PDF, DOCX, XLSX extraction paths can be memory-heavy and block request latency if not backgrounded.

## 3) What can be removed safely (high-confidence candidates)

1. **Duplicate/overlapping utility stacks (pick one per concern):**
   - `bcrypt` vs `bcryptjs`
   - `dayjs` vs `date-fns`
   - `pg` + `postgres` + Prisma client (likely more than needed concurrently)
   - `dompurify` + `isomorphic-dompurify`

2. **Provider sprawl for beta phase:**
   - Keep one primary LLM provider and one fallback; defer additional providers until post-beta validation.

3. **Legacy/duplicate route surfaces where canonical route already exists.**
   - Audit duplicated project/task endpoints and legacy route registrations.

> Safe-removal rule: verify import references and runtime feature flags before uninstall.

## 4) What should be lazy-loaded

1. **Server route modules** currently imported eagerly in `server/index.ts` and `server/routes.ts`.
   - Convert low-traffic/heavy modules to lazy registration via dynamic import on first hit (or split into separate worker/service process).

2. **Very large client pages/components** that are still imported via large parent trees.
   - Split `ComprehensiveCMCPlatformClean.jsx`, `CoAuthor.jsx`, `CERV2Page.jsx`, and oversized editor panels into sub-chunks by tab/feature.

3. **Heavy processing libs** (`pdf-parse`, `mammoth`, `exceljs`, PDF render libs) should remain dynamic and run in worker/background contexts when possible.

## 5) What should be cached

1. **Submission center API results** with short TTL + conditional revalidation.
   - Cache project/task summaries (tenant-scoped keys) for dashboard views.

2. **Proof audit list responses** for polling views.
   - ETag/If-None-Match or cursor-based incremental fetch to avoid repeated full payloads.

3. **Parsed document artifacts and embedding outputs.**
   - Cache extraction results by file hash to avoid recomputation.

4. **Server-side expensive read models** for dashboards (materialized or pre-aggregated).

## 6) What should move to background jobs

1. **Semantic document processing** in `clinical-intelligence-service` (embedding + analysis chain).
2. **Large file parsing/extraction** from request paths where currently synchronous or near-request lifecycle.
3. **Report/PDF generation and export workflows** (ensure queue concurrency caps + bounded retries).
4. **Periodic scanners/schedulers** should run in a dedicated worker process, not API web process.

## 7) What will matter most for beta hosting cost

1. **Reduce always-on web dyno memory and startup path** (lazy imports, move heavy loops off web process).
2. **Control polling amplification** (switch to SSE/WebSocket where practical; throttle tab-hidden/background polling).
3. **Trim dependency graph** before beta (faster CI/build/deploy, smaller containers, fewer cold-start penalties).
4. **Enforce query pagination and payload limits** on task/project/activity endpoints.
5. **Bound queues/caches/log retention** to avoid runaway memory/disk over long-running beta tenants.

## 8) Exact files to change (priority order)

### A. Frontend bundle/responsiveness
- `client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx` (split by tabs/features)
- `client/src/pages/coauthor/CoAuthor.jsx` (split editor, sidebar, AI panel)
- `client/src/pages/csr/CERV2Page.jsx` (split predicates/reporting/export panes)
- `client/src/concept2cure/ZenApp.tsx` (reduce root orchestration weight; keep route-level boundaries thin)
- `client/src/portal-v2/components/monitoring/ActivityMonitor.tsx` (reduce polling fanout, incremental fetch)
- `client/src/portal-v2/hooks/useCortex.ts` (conditional polling/backoff/tab-visibility aware)
- `client/src/portal-v2/hooks/useSecurityContext.tsx` (session check optimization + shared timer strategy)

### B. Server startup/cold-path and data shape
- `server/index.ts` (defer heavy route/service imports; isolate boot-critical path)
- `server/routes.ts` (reduce eager mounts/requires; split legacy routes)
- `server/routes/submissionCenter.routes.ts` (add pagination/limits/filters, narrow selected columns)
- `server/routes/workflow.ts` (consider incremental audit feed API shape)

### C. Background jobs, logging, bounded growth
- `server/services/clinical-intelligence-service.ts` (move queue processing to dedicated worker, bounded queue/backoff)
- `server/services/client-intelligence-memory.ts` (stream/chunk extraction, hash-based cache, worker offload)
- `server/export_logger.ts` (rotation/retention + avoid full-file scans for reads)

### D. Dependency and deployment hygiene
- `package.json` (remove duplicate libs, trim provider sprawl, align DB/PDF/date stacks)
- (Optional) `vite.config.ts` (bundle analyzer plugin and stricter chunk budgets in CI)

## Evidence notes (selected)
- Build command failed in this environment: `vite: not found` when running `npm run build`.
- Root repository footprint is ~200MB.
- Frontend/server include multiple very large source files and many route/service modules.

