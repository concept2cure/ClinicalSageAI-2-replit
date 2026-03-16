# AI Capabilities Inventory

Evidence-backed inventory for Concept2Cure / ClinicalSage.

- Branch: `concept2cure-v2`
- Generated: 2026-03-08
- Evidence script: `docs/rfi/inventory.sh`
- Raw outputs: `docs/rfi/_evidence/`

## 1. AI Entry Points

### What Exists

- Frontend AI entry points are implemented as hooks in:
  `client/src/concept2cure/hooks/useWorkspaceIntelligence.ts` and `client/src/concept2cure/hooks/useDocumentFactory.ts`.
- Main user actions:
  `useRegulatoryAnalysis`, `useForesightPrediction`, `useClinicalRiskAnalysis`, `useGenerateDocx`, `useGenerateINDSection`.

### Proof

- `client/src/concept2cure/hooks/useWorkspaceIntelligence.ts:119`
  `useRegulatoryAnalysis()` calls `POST /api/lumen-cortex/regulatory-analysis`.
- `client/src/concept2cure/hooks/useWorkspaceIntelligence.ts:176`
  `useForesightPrediction()` calls `POST /api/foresight/score`.
- `client/src/concept2cure/hooks/useWorkspaceIntelligence.ts:200`
  `useClinicalRiskAnalysis()` calls `POST /api/foresight-ai/risk-analysis/clinical`.
- `client/src/concept2cure/hooks/useDocumentFactory.ts:36`
  `useGenerateDocx()` calls `POST /api/knowledge-base/generate-docx`.
- `client/src/concept2cure/hooks/useDocumentFactory.ts:68`
  `useGenerateINDSection()` calls `POST /api/knowledge-base/generate-ind-section`.

### How To Test

```bash
curl -b cookies.txt -X POST http://localhost:5000/api/lumen-cortex/regulatory-analysis \
  -H 'Content-Type: application/json' \
  -d '{"query":"510(k) gaps for SaMD"}'

curl -b cookies.txt -X POST http://localhost:5000/api/foresight/score \
  -H 'Content-Type: application/json' \
  -d '{"phase":"Phase 2","indication":"oncology"}'

curl -b cookies.txt -X POST http://localhost:5000/api/knowledge-base/generate-docx \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","content":"<p>Hello</p>"}' --output out.docx
```

### Gaps / Risks

- Hooks are well defined, but there is no single centralized frontend inventory map of AI actions.
- Some flows depend on backend services that may be unavailable in local dev (DOCX shadow service).

## 2. AI APIs & Routes

### What Exists

- AI routes are mounted in `server/index.ts` under these prefixes:
  `/api/cortex`, `/api/lumen-cortex`, `/api/foresight`, `/api/foresight-ai`.

### Proof

- `server/index.ts:570` mounts `/api/lumen-cortex`.
- `server/index.ts:602-604` mounts `/api/foresight`, `/api/foresight-ai`, `/api/foresight-feedback`.
- `server/index.ts:615-632` mounts legacy aliases `/api/lumen`, `/api/lumen-ai`, `/api/lumen/rag`.
- `server/index.ts:1351` mounts `/api/cortex`.
- `server/routes/cortex-unified.ts:178` defines `POST /chat`.
- `server/routes/cortex-unified.ts:742` defines `GET /threads`.
- `server/routes/foresight-api.ts:68` defines `POST /score`.
- `server/routes/lumen-cortex.ts:178` defines `POST /regulatory-analysis`.

### How To Test

```bash
curl -s http://localhost:5000/api/cortex/health
curl -s http://localhost:5000/api/lumen-cortex/health

curl -b cookies.txt -X POST http://localhost:5000/api/cortex/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"summarize IND risks","stream":false}'
```

### Gaps / Risks

- Legacy aliases increase surface area and can drift from canonical docs.
- Route authentication posture is inconsistent across files (see section 7 and section 9).

## 3. RAG / Retrieval Pipeline

### What Exists

- Retrieval logic includes vector + full-text + reranking capabilities.
- Dedicated advanced pipeline exists in `server/services/advancedRAGPipeline.ts`.

### Proof

- `server/services/advancedRAGPipeline.ts:1-20` declares HyDE, multi-query, cross-encoder reranking, MMR.
- `server/services/advancedRAGPipeline.ts:231-235` references reranking step.
- `server/services/advancedRAGPipeline.ts:385-393` builds rerank prompt and routes via AI router.
- `server/api/drafting/routes.ts:151` defines `hybridSearch(...)`.
- `server/openai-service.ts:24-31` uses embedding model `text-embedding-3-small`.

### How To Test

```bash
curl -b cookies.txt -X POST http://localhost:5000/api/vault/search/semantic \
  -H 'Content-Type: application/json' \
  -d '{"query":"primary endpoint","programId":1,"limit":5}'

curl -b cookies.txt -X POST http://localhost:5000/api/vault/search/hybrid \
  -H 'Content-Type: application/json' \
  -d '{"query":"IND Module 2","programId":1,"limit":5}'
```

### Gaps / Risks

- No formal evaluation harness for retrieval quality (precision/recall over benchmark sets).
- Reranking depends on live LLM availability and cost budget.

## 4. Data Structures (DB + Storage)

### What Exists

- Vector and retrieval schema in migration `059_gcc_vector_embeddings.sql`.
- Vault document/chunk storage used by `server/api/vault/routes.ts`.
- Audit and RLS schema in migrations `054` and `053`.

### Proof

- `db/migrations/059_gcc_vector_embeddings.sql:16` enables `pgvector` extension.
- `db/migrations/059_gcc_vector_embeddings.sql:85` creates `ai.document_embeddings`.
- `db/migrations/059_gcc_vector_embeddings.sql:103` defines `embedding_1536 vector(1536)`.
- `db/migrations/059_gcc_vector_embeddings.sql:259-260` creates HNSW index.
- `server/api/vault/routes.ts:29` handles document upload into `vault.documents` domain.
- `server/api/vault/routes.ts:222` and `:307` handle semantic and hybrid search.

### How To Test

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/clinicalsage?sslmode=disable" \
psql "$DATABASE_URL" -c "\dt ai.*"

DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/clinicalsage?sslmode=disable" \
psql "$DATABASE_URL" -c "\d+ ai.document_embeddings"
```

### Gaps / Risks

- Cross-module schema breadth is large; ownership boundaries are not clear in one place.
- Some features reference columns that may not exist in all environments (seen in runtime logs previously).

## 5. Model Configuration

### What Exists

- Central AI gateway with multi-provider model registry and fallback.
- Embeddings still use direct OpenAI client in `openai-service.ts`.

### Proof

- `server/services/ai-gateway/gateway.ts:36` defines `DEFAULT_MODELS`.
- `server/services/ai-gateway/gateway.ts:38-70` includes `gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet`.
- `server/services/ai-gateway/gateway.ts:97-110` includes Moonshot models.
- `server/services/ai-gateway/gateway.ts:228` and `:246` call `recordFailure(...)` during fallback attempts.
- `server/services/ai-gateway/gateway.ts:766` loads `KIMI_API_KEY` / `MOONSHOT_API_KEY`.
- `.env.example:18-19` defines `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`.

### How To Test

```bash
grep -n "DEFAULT_MODELS\|recordFailure\|KIMI_API_KEY" server/services/ai-gateway/gateway.ts
grep -n "OPENAI_API_KEY\|ANTHROPIC_API_KEY" .env.example
```

### Gaps / Risks

- Gateway is not universally enforced; many direct provider instantiations bypass it.
- No single policy file maps task -> approved model for compliance review.

## 6. Trust, Compliance, Audit

### What Exists

- Part 11-focused audit migration and event taxonomy.
- Gateway-level audit logger exists.

### Proof

- `db/migrations/054_gcc_part11_audit.sql:2` migration title indicates Part 11 enhancement.
- `db/migrations/054_gcc_part11_audit.sql:6-7` references FDA 21 CFR Part 11 and Annex 11.
- `db/migrations/054_gcc_part11_audit.sql:27` creates `audit.event_category` enum.
- `server/services/ai-gateway/index.ts` exports `GatewayAuditLogger`.

### How To Test

```bash
grep -n "Part 11\|event_category" db/migrations/054_gcc_part11_audit.sql
grep -n "GatewayAuditLogger" server/services/ai-gateway/index.ts server/services/ai-gateway/gateway.ts
```

### Gaps / Risks

- Presence of audit schema does not prove every AI endpoint writes complete prompt/output/action trails.
- Direct non-gateway model calls can bypass centralized gateway audit logging.

## 7. Security Posture

### What Exists

- Tenant context middleware and RLS migration are present.
- Vault uploads use in-memory processing with file-size limit.

### Proof

- `server/middleware/tenantContext.ts:1-60` defines tenant context middleware and request augmentation.
- `db/migrations/053_gcc_rls_policies.sql:2` defines RLS migration.
- `db/migrations/053_gcc_rls_policies.sql:115` enables RLS on `identity.users`.
- `server/api/vault/routes.ts:20-22` uses `multer.memoryStorage()` and 50MB max file size.
- `server/api/vault/routes.ts:11` uses `getRequestDbClient(req)` for tenant-aware DB access.

### How To Test

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/clinicalsage?sslmode=disable" \
psql "$DATABASE_URL" -c "SELECT relname, relrowsecurity FROM pg_class WHERE relrowsecurity = true ORDER BY relname LIMIT 20;"

grep -n "memoryStorage\|fileSize\|getRequestDbClient" server/api/vault/routes.ts
```

### Gaps / Risks

- No MIME allowlist in vault upload route.
- Cannot assert from file scan alone that every AI route has explicit auth middleware.

## 8. Testing & Evals

### What Exists

- Unit tests exist for AI gateway behavior, policy engine, and audit logger.
- Broader route/service tests exist across server.

### Proof

- `server/services/ai-gateway/__tests__/gateway.test.ts:85` `describe('AIGateway', ...)`.
- `server/services/ai-gateway/__tests__/gateway.test.ts:137` deterministic mode tests.
- `server/services/ai-gateway/__tests__/gateway.test.ts:238` policy engine tests.
- `server/services/ai-gateway/__tests__/gateway.test.ts:323` audit logger tests.
- Evidence script output (`docs/rfi/_evidence/test_files.txt`) enumerates test files.

### How To Test

```bash
npm run test -- server/services/ai-gateway/__tests__/gateway.test.ts
bash docs/rfi/inventory.sh
```

### Gaps / Risks

- No standardized AI eval dataset / rubric for output quality regression.
- No explicit SSE streaming regression tests for `/api/cortex/chat` stream mode.

## 9. Known Gaps & Recommendations

### What Exists

- Clear opportunities to tighten security, governance, and reproducibility were identified from current code.

### Proof

- Auth ambiguity:
  `server/routes/cortex-unified.ts:178` and `server/routes/foresight-api.ts:68` show route handlers but no nearby explicit `router.use(requireAuth)` in those files.
- Gateway bypass:
  `docs/rfi/_evidence/direct_llm_calls.txt` lists direct `new OpenAI` / `new Anthropic` outside gateway.
- Upload filtering:
  `server/api/vault/routes.ts:20-22` sets size limits only; no MIME `fileFilter`.
- Alias sprawl:
  `server/index.ts:615-632` maps legacy `/api/lumen*` aliases.

### How To Test

```bash
# Regenerate objective evidence
bash docs/rfi/inventory.sh

# Review direct provider bypasses
head -40 docs/rfi/_evidence/direct_llm_calls.txt

# Review auth-related references
head -80 docs/rfi/_evidence/auth_middleware.txt
```

### Gaps / Risks (Prioritized)

1. CRITICAL: enforce auth middleware consistently on all AI routers.
2. CRITICAL: route all model calls through AI Gateway for consistent audit/policy.
3. HIGH: add MIME allowlist + content scanning on upload endpoints.
4. HIGH: formalize model governance matrix (task, model, fallback, rationale).
5. HIGH: remove or hard-deprecate legacy API aliases.
6. MEDIUM: add AI eval harness with golden sets and pass/fail thresholds.
7. MEDIUM: add integration tests for stream mode and provider failover.
8. MEDIUM: add one "capability manifest" file mapping UI actions -> endpoint -> model -> audit event.
9. LOW: standardize route-level OpenAPI/JSON schema responses.
10. LOW: add automated check that RLS remains enabled on protected tables in CI.

---

This inventory intentionally excludes unverified claims. Every bullet above references a current file path or generated evidence artifact.
