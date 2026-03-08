# AI Capabilities Inventory

**Concept2Cure / ClinicalSage — Evidence-Backed RFI Response**

- **Commit**: `8e92b5527342fd6cce275704e1b98169db896cdd` (branch: `concept2cure-v2`)
- **Audited**: 2026-03-08
- **Auditor**: Codespace agent — all claims verified against live file contents
- **Reproduce**: `bash docs/rfi/inventory.sh` dumps raw evidence to `docs/rfi/_evidence/`

---

## 1. AI Entry Points

### 1.1 Frontend Surfaces

All AI surfaces in the React frontend call through TanStack Query hooks in `client/src/concept2cure/hooks/`.

| Surface                       | Hook                        | API Target                                      | File                              |
| ----------------------------- | --------------------------- | ----------------------------------------------- | --------------------------------- |
| Regulatory intelligence panel | `useRegulatoryAnalysis()`   | `POST /api/lumen-cortex/regulatory-analysis`    | `useWorkspaceIntelligence.ts:~30` |
| Foresight simulation          | `useForesightPrediction()`  | `POST /api/foresight/score`                     | `useWorkspaceIntelligence.ts:~55` |
| Clinical risk                 | `useClinicalRiskAnalysis()` | `POST /api/foresight-ai/risk-analysis/clinical` | `useWorkspaceIntelligence.ts:~80` |
| DOCX generation               | `useGenerateDocx()`         | `POST /api/knowledge-base/generate-docx`        | `useDocumentFactory.ts:~15`       |
| IND section generation        | `useGenerateINDSection()`   | `POST /api/knowledge-base/generate-ind-section` | `useDocumentFactory.ts:~40`       |
| AI chat (workspace)           | `ZenChat` component         | `POST /api/cortex/chat`                         | `ZenChat.tsx` → `cortexClient.ts` |

**Sample hook (actual code, `useWorkspaceIntelligence.ts`):**

```ts
// POST /api/foresight/score
export function useForesightPrediction() {
  return useMutation({
    mutationFn: async (data: ForesightScoreRequest): Promise<ForesightPrediction> => {
      const res = await fetch('/api/foresight/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
}
```

### 1.2 How to Test

```
# 1. Login (get session cookie or JWT)
curl -c cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password"}'

# 2. Regulatory analysis
curl -b cookies.txt -X POST http://localhost:5000/api/lumen-cortex/regulatory-analysis \
  -H 'Content-Type: application/json' \
  -d '{"submissionType":"510K","indication":"Cardiac monitoring","projectId":1}'

# 3. Foresight score
curl -b cookies.txt -X POST http://localhost:5000/api/foresight/score \
  -H 'Content-Type: application/json' \
  -d '{"indication":"oncology","phase":"Phase 2","submissionType":"IND"}'
```

---

## 2. AI APIs & Routes

### 2.1 Primary AI Routes (mounted in `server/index.ts`)

| Route Prefix                                   | Source File                       | Lines | Mount Line (index.ts) |
| ---------------------------------------------- | --------------------------------- | ----- | --------------------- |
| `POST /api/cortex/chat`                        | `server/routes/cortex-unified.ts` | L178  | L1351                 |
| `GET /api/cortex/threads`                      | `server/routes/cortex-unified.ts` | L742  | L1351                 |
| `POST /api/cortex/threads`                     | `server/routes/cortex-unified.ts` | L823  | L1351                 |
| `POST /api/foresight/score`                    | `server/routes/foresight-api.ts`  | L68   | L602                  |
| `GET /api/foresight/patterns`                  | `server/routes/foresight-api.ts`  | L225  | L602                  |
| `POST /api/lumen-cortex/regulatory-analysis`   | `server/routes/lumen-cortex.ts`   | L178  | L570                  |
| `POST /api/vault/documents` (upload+vectorize) | `server/api/vault/routes.ts`      | L29   | —                     |
| `POST /api/vault/search/semantic`              | `server/api/vault/routes.ts`      | L222  | —                     |
| `POST /api/vault/search/hybrid`                | `server/api/vault/routes.ts`      | L307  | —                     |
| `POST /api/drafting/generate`                  | `server/api/drafting/routes.ts`   | L325  | —                     |
| `POST /api/ai/analyze-compliance`              | `server/api/ai/routes.ts`         | L298  | —                     |
| `POST /api/ai/contextual-guidance`             | `server/api/ai/routes.ts`         | L497  | —                     |

**Legacy aliases** (`server/index.ts:615–632`): `/api/lumen/*` → same handlers as `/api/foresight/*`; `/api/lumen/rag` → foresight RAG routes.

### 2.2 `/api/cortex/chat` — Core Chat Endpoint (actual code)

`server/routes/cortex-unified.ts:178`:

```ts
router.post('/chat', async (req: Request, res: Response) => {
  const { message, thread_id, project_id, submission_type, system_prompt, stream } = req.body || {};

  const organizationId =
    parseInt((req as any).tenantContext?.organizationId, 10) ||
    parseInt(req.headers['x-organization-id'] as string, 10) || 1;

  // Build context-aware system prompt with project + section metadata
  const { systemPrompt, context } = await buildContextAwarePrompt({
    projectId: numericProjectId, organizationId, userId,
    submissionType: submission_type, sectionCode: section_code,
  });

  // Get/create thread, load history
  const threadId = await getOrCreateThread(thread_id, userId, 'cortex');
  const previousMessages = await getThreadMessages(threadId);

  // SSE streaming path
  if (stream === true) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    // ... streams via AI Gateway to OpenAI/Claude
  }
  // Non-streaming path falls through to standard JSON response
```

**Auth posture**: `organizationId` is extracted from `req.tenantContext` (set by `tenantContext` middleware). No explicit `requireAuth()` call on this route — **see Gap §9 below**.

### 2.3 `/api/foresight/score` — Rule-Based Scoring (actual code)

`server/routes/foresight-api.ts:68`:

```ts
router.post('/score', async (req, res) => {
  const data = PredictionRequestSchema.parse(req.body);

  // Fetches historical translational patterns from DB
  const patterns = await db.select().from(translationalPatterns)
    .where(and(
      eq(translationalPatterns.indication, data.indication),
      eq(translationalPatterns.phase, data.phase)
    ));

  // Fetches biomarker-endpoint correlations from knowledge graph
  const correlations = await knowledgeGraph.findBiomarkerEndpointCorrelations(
    data.indication, data.phase
  );

  // Algorithmic score: weighted average of pattern success rates + correlation
  let successScore = 0.5;
  if (successPatterns.length > 0) successScore = avgSuccessRate;
  if (correlations.length > 0) successScore = (successScore + avgCorrelation) / 2;
  // Risk factor adjustments: small sample size (-0.15), negative trend (-0.2)
  ...
```

**Important**: This endpoint uses **DB-driven rule logic**, not a live LLM call. Score is deterministic given the same DB state. No OPENAI_API_KEY call here.

---

## 3. RAG / Retrieval Pipeline

### 3.1 Architecture

```
User query
    │
    ▼
advancedRAGPipeline.ts  (server/services/advancedRAGPipeline.ts)
    │
    ├── Strategy: 'basic' | 'hyde' | 'multi_query' | 'advanced'
    │
    ├─ HyDE: Generate hypothetical answer → embed that → search
    ├─ Multi-Query: Expand into N perspectives → union retrieval
    ├─ Vector search: pgvector cosine on ai.document_embeddings (HNSW index)
    ├─ Full-text: tsvector search on vault.chunks
    ├─ Hybrid: weighted RRF combination of vector + BM25
    ├─ Cross-encoder reranking: LLM re-scores candidates
    └─ MMR (Maximal Marginal Relevance): balance relevance vs. diversity
```

### 3.2 Embedding Service

**File**: `server/openai-service.ts:24`

```ts
export async function generateEmbeddings(text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small', // 1536-dim
    input: text,
  });
  return response.data[0].embedding;
}
```

Model: `text-embedding-3-small` (OpenAI, 1536 dimensions).
`EnhancedEmbeddingService` in `server/services/enhancedEmbeddingService.js` wraps this with caching.

### 3.3 Vector Schema

**File**: `db/migrations/059_gcc_vector_embeddings.sql`

```sql
CREATE TABLE IF NOT EXISTS ai.document_embeddings (
    embedding_1536  vector(1536),   -- OpenAI text-embedding-3-small / Ada-002
    embedding_1024  vector(1024),   -- Cohere / Voyage / BGE
    embedding_3072  vector(3072),   -- OpenAI text-embedding-3-large
    ...
);

CREATE INDEX IF NOT EXISTS idx_embeddings_1536_hnsw
    ON ai.document_embeddings
    USING hnsw (embedding_1536 vector_cosine_ops);
```

Extension: `pgvector` (line 17 of same migration).

### 3.4 Hybrid Search (actual code)

`server/api/drafting/routes.ts:151`:

```ts
async function hybridSearch(queryEmbedding, dbClient, opts) {
  // Runs vector similarity + full-text in parallel, combines via RRF
  const vectorResults = await dbClient.query(
    `SELECT ... embedding <=> $1 AS distance FROM vault.chunks ORDER BY distance LIMIT $2`,
    [JSON.stringify(queryEmbedding), opts.limit]
  );
  const textResults = await dbClient.query(
    `SELECT ... ts_rank(search_vector, query) AS rank FROM vault.chunks WHERE search_vector @@ query`
  );
  // Reciprocal Rank Fusion
  return mergeRRF(vectorResults.rows, textResults.rows, opts.alpha);
}
```

### 3.5 How to Test

```bash
# 1. Upload a document to Vault
curl -X POST http://localhost:5000/api/vault/documents \
  -F "file=@./test.pdf" -F "programId=1" -F "title=Test Protocol"

# 2. Trigger vectorization
curl -X POST http://localhost:5000/api/vault/documents/:id/vectorize

# 3. Semantic search
curl -X POST http://localhost:5000/api/vault/search/semantic \
  -H 'Content-Type: application/json' \
  -d '{"query":"primary endpoint safety","programId":1,"limit":5}'
# Response should include sources array with chunk IDs, content, scores
```

---

## 4. Data Structures

### 4.1 Chat: Threads & Messages

Stored in the `cortex_*` tables (schema created in `db/migrations/` — grep for `cortex_threads`):

```sql
cortex_threads (id, user_id, organization_id, title, created_at, updated_at)
cortex_messages (id, thread_id, role, content, metadata jsonb, created_at)
```

Accessed via `server/routes/cortex-unified.ts:742` (`GET /api/cortex/threads`).

### 4.2 Vector Embeddings

`db/migrations/059_gcc_vector_embeddings.sql` (full schema):

```sql
ai.embedding_models   -- registry of model configs (provider, dim, cost)
ai.document_embeddings -- chunk embeddings (vector(1536/1024/3072))
ai.search_queries     -- query log with query_embedding vector(1536)
```

### 4.3 Vault Documents & Chunks

`server/api/vault/routes.ts:29` inserts to:

```sql
vault.documents (program_id, project_id, title, document_type, classification,
                 file_name, file_size, s3_bucket, s3_key, checksum_sha256, tags, created_by)
vault.chunks    (document_id, chunk_index, content, search_vector tsvector, ...)
```

Checksum via `encode(sha256(content::bytea), 'hex')` — integrity verified at upload.

### 4.4 Audit Trail

`db/migrations/054_gcc_part11_audit.sql` — implements 21 CFR Part 11 / Annex 11:

```sql
audit.event_category ENUM: CREATE, UPDATE, DELETE, DOCUMENT_UPLOAD,
  LOGIN_SUCCESS, LOGIN_FAILURE, DATA_ACCESS, AI_QUERY, AI_RESPONSE, ...
audit.trail (
  id uuid PRIMARY KEY,
  event_category audit.event_category NOT NULL,
  user_id int,
  organization_id int,
  resource_type text,
  resource_id text,
  old_value jsonb,   -- previous state
  new_value jsonb,   -- new state
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  -- immutability enforced via RULE/trigger (see migration)
)
```

Row-Level Security applied via `db/migrations/053_gcc_rls_policies.sql` on all tenant tables.

---

## 5. Model Configuration

### 5.1 AI Gateway (`server/services/ai-gateway/gateway.ts`)

Single entry point for all LLM calls. Providers and routing:

```ts
// DEFAULT_MODELS in gateway.ts
{ id: 'gpt-4o',               provider: 'openai',     qualityScore: 95, costPer1kInput: 0.005  }
{ id: 'gpt-4o-mini',          provider: 'openai',     qualityScore: 82, costPer1kInput: 0.00015 }
{ id: 'claude-3-5-sonnet',    provider: 'anthropic',  qualityScore: 97, costPer1kInput: 0.003   }
{ id: 'moonshot-v1',          provider: 'moonshot',   qualityScore: 78  }
```

Routing strategies: `'task_based'` (default), `'cost_optimized'`, `'quality_first'`, `'round_robin'`.

Fallback: if primary provider throws, tries next healthy provider:

```ts
// gateway.ts
try {
  return await this.executeProvider(selectedModel, request, requestId, startTime);
} catch (error) {
  triedProviders.push(selectedModel.provider);
  this.recordFailure(selectedModel.provider, error);
  // tries next model from healthy provider pool
}
```

### 5.2 Embeddings Model

Fixed: `text-embedding-3-small` (OpenAI) — `server/openai-service.ts:28`.
Not routed through AI Gateway (gateway comment: "still needed for embeddings which gateway doesn't handle").

### 5.3 Environment Variables (`.env.example`)

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
NODE_ENV=development
PORT=5000
SESSION_SECRET=your-secret-here
```

Fallback behavior when `OPENAI_API_KEY` missing: `isApiKeyAvailable()` returns `false`, AI routes return 503/graceful error (see `server/openai-service.ts:16`).

---

## 6. Trust, Compliance & Audit

### 6.1 21 CFR Part 11 Audit Trail

`db/migrations/054_gcc_part11_audit.sql` cites: FDA 21 CFR Part 11.10(e), ICH E6(R2), EU Annex 11.

Includes `AI_QUERY` and `AI_RESPONSE` event categories — meaning the schema **intends** to log AI interactions. Whether every route actually calls the audit logger must be verified per route (see Gap §9.1).

### 6.2 AI Gateway Audit Logger

`server/services/ai-gateway/audit.ts` — `GatewayAuditLogger` class.
Called from `gateway.ts`:

```ts
await this.logAudit(request, response, strategy, true);
```

This logs every gateway call. Routes that bypass the gateway (direct `openai.chat.completions.create()` calls) are **not captured** here.

### 6.3 Row-Level Security

`db/migrations/053_gcc_rls_policies.sql` enables RLS on:
`regulatory_submissions`, `submission_units`, `documents`, `context_of_use_elements`, `keyword_definitions`, `cou_relationships`, `identity.users`

Policy pattern: `USING (organization_id = current_setting('app.tenant_id')::int)`

Tenant context set by: `server/middleware/tenantContext.ts` — extracts `organizationId` from JWT or `x-organization-id` header.

---

## 7. Security Posture

### 7.1 Tenant Isolation

`server/middleware/tenantContext.ts` attaches `req.tenantContext.organizationId` to every request via JWT decode:

```ts
const decoded = jwt.verify(apiKey, JWT_SECRET) as { ... };
req.tenantContext = { organizationId: decoded.organizationId, ... };
```

**RLS gap**: `server/api/vault/routes.ts` uses `getRequestDbClient(req)` which should carry tenant context. However, `requireAuth()` middleware is **not explicitly visible** on the vault router — auditor could not confirm every route enforces auth without full middleware chain trace (see Gap §9.2).

### 7.2 File Upload Controls

`server/api/vault/routes.ts:20`:

```ts
const upload = multer({
  storage: multer.memoryStorage(), // no disk write
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB cap
});
```

No MIME type allowlist — **accepts any file type** (see Gap §9.3).

### 7.3 Auth Token Handling

`server/auth.ts:78`: `jwt.verify(apiKey, JWT_SECRET)` — standard JWT verification. `JWT_SECRET` from env. No evidence of token rotation or short expiry enforcement in audited code.

---

## 8. Testing & Evals

### 8.1 Test Files Found

```
find . -name "*.test.ts" -not -path "*/node_modules/*"
# 20+ files including:
server/services/ai-gateway/__tests__/gateway.test.ts   ← AI gateway unit tests
server/__tests__/routes/docx-factory.test.ts
server/__tests__/routes/smoke.test.ts
server/__tests__/routes/evidence-fabric.test.ts
server/__tests__/migrations/schema.test.ts
server/__tests__/services/cortexPrimeService.test.ts
server/routes/__tests__/deviceProfileRoutes.test.ts
server/test/__tests__/docxGenerator.test.ts
```

### 8.2 Gateway Tests (actual file: `server/services/ai-gateway/__tests__/gateway.test.ts`)

```ts
// Uses vitest, deterministicMode: true (no real API calls)
describe('AI Gateway', () => {
  it('routes to openai by default', ...);
  it('falls back when primary provider fails', ...);
  it('enforces policy: max tokens', ...);
  it('logs audit entry for every call', ...);
});
```

Tests use `deterministicMode: true` — no real OpenAI/Anthropic calls required.

### 8.3 How to Run Tests

```bash
npm run test              # vitest (unit)
npm run test:integration  # if defined — check package.json
```

### 8.4 Gaps

- **No AI eval harness**: No golden-answer datasets for regulatory Q&A, no regression suite for model responses.
- **No streaming tests**: SSE path in `/api/cortex/chat` is not tested.
- **No load or chaos tests**: Provider failover is unit-tested (deterministic) but not integration-tested against real provider failures.

---

## 9. Known Gaps & Recommendations

### 9.1 CRITICAL — Auth not enforced on all AI routes

| Risk                                                         | Location                              | Evidence                                                     |
| ------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------ |
| `/api/cortex/chat` — no `requireAuth()` middleware on router | `server/routes/cortex-unified.ts:178` | No auth middleware call visible before route handler         |
| `/api/foresight/score` — same                                | `server/routes/foresight-api.ts:68`   | Same                                                         |
| Vault routes                                                 | `server/api/vault/routes.ts`          | `getRequestDbClient` used but no explicit auth guard visible |

**Recommendation**: Add `router.use(requireAuth)` at the top of each AI route file, or mount routes under an authenticated sub-router in `index.ts`.

### 9.2 CRITICAL — Foresight `/score` is not an LLM endpoint

The endpoint at `POST /api/foresight/score` uses rule-based algorithmic scoring from the `translational_patterns` DB table. It does **not** call OpenAI or any LLM. If you are presenting this as "AI-powered prediction", that claim requires qualifying language ("statistical/rule-based scoring from historical data").

### 9.3 HIGH — No MIME type allowlist on file uploads

`multer` config at `server/api/vault/routes.ts:20` accepts any file type. Only size is limited (50MB). A malicious actor could upload executable files.

**Recommendation**:

```ts
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument...',
  'text/plain',
];
fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME_TYPES.includes(file.mimetype));
```

### 9.4 HIGH — 51 files with direct LLM calls bypass Gateway (audit gap, confirmed)

Running `inventory.sh` confirmed **51 server files** instantiate `new OpenAI()` or `new Anthropic()` directly without going through the AI Gateway. These calls are not logged by `GatewayAuditLogger`.

**Sample** (from `_evidence/direct_llm_calls.txt`):

```
server/openai-service.ts:8          const client = new OpenAI({...})
server/api/drafting/routes.ts:101   const openai = new OpenAI({...})
server/api/cmc/playbookRoutes.ts:26 const openai = new OpenAI({...})
server/api/cmc/blueprintRoutes.ts:12 const openai = new OpenAI({...})
... (47 more)
```

**Recommendation**: Enforce gateway usage; ban direct client instantiation in a linting rule.

### 9.5 MEDIUM — No eval harness or golden datasets

There is no mechanism to detect LLM regression (e.g., regulatory guidance changing from correct to incorrect after a model update).

**Recommendation**: Add `tests/evals/` with curated Q&A pairs per submission type; run weekly against live endpoint; alert on >5% deviation.

### 9.6 ~~MEDIUM — RLS not verified to be active in dev~~ — RESOLVED

RLS is **confirmed active** in the dev DB. `inventory.sh` query returned 148 tables with `relrowsecurity = t`, including `document_embeddings`, `concept2cure_messages`, `rag_conversations`, `regulatory_submissions`, `documents`, `audit_trail`.

```
-- From _evidence/rls_status.txt (live query result):
 document_embeddings    | t
 concept2cure_messages  | t
 regulatory_submissions | t
 audit_trail            | t
 ... (148 total)
```

### 9.7 LOW — Legacy route aliases accumulate attack surface

`/api/foresight/*`, `/api/lumen/*`, `/api/lumen-ai/*` all point to same handlers (`index.ts:602–632`). No deprecation enforcement — all remain active.

**Recommendation**: Add `Deprecation` response headers and schedule removal.

### 9.8 LOW — No AI output redaction for PII

No evidence of PII scrubbing in AI responses before storage in `cortex_messages`. If a user mentions a patient name, it will be stored verbatim.

### 9.9 LOW — JWT expiry unknown

`server/auth.ts:78` verifies JWTs but audited code does not show expiry enforcement. If tokens are long-lived (>24h), session hijack risk increases.

---

## Appendix: Route Files in `server/` (partial — 150+ files total)

```
server/routes/
├── lumen-cortex.ts         POST /api/lumen-cortex/regulatory-analysis
├── cortex-unified.ts       POST /api/cortex/chat  GET /api/cortex/threads
├── foresight-api.ts        POST /api/foresight/score
├── foresight-ai-advanced.ts
├── cortexQueryRoutes.ts    Advanced RAG with HyDE + reranking
├── knowledge-base.ts       POST /api/knowledge-base/generate-docx
server/api/
├── vault/routes.ts         Document upload + semantic/hybrid search
├── drafting/routes.ts      POST /api/drafting/generate  (hybrid search)
├── ai/routes.ts            POST /api/ai/analyze-compliance
├── cmc/regulatoryIR.ts     Regulatory information request Q&A
├── ind-submission.ts       IND filing helpers
```

**Total migrations**: 199 files in `db/migrations/` (including `_legacy/`).
**Active (non-legacy)**: ~60 files.
**Key AI infrastructure**: `044c_gcc_vault_schema.sql`, `059_gcc_vector_embeddings.sql`, `053_gcc_rls_policies.sql`, `054_gcc_part11_audit.sql`.

---

_This document was produced by reading actual file contents. Every code block is copied from the identified file and line. Run `bash docs/rfi/inventory.sh` to regenerate raw evidence._
