# RFI Response: Current State of AI + Proprietary Uniqueness

**Branch:** `concept2cure-v2`  
**Date:** 2026-02-23  
**Standard:** Every claim includes (a) file paths, (b) key code snippets, (c) routes/DB tables, (d) how to test.

---

## 1) AI Entry Points (UX + Routing)

### What Exists

| Surface | Component Path | Invocation | API Endpoint | Renders |
|---------|---------------|------------|--------------|---------|
| **Lumen Cortex Chat** | `client/src/components/LumenCortexChat.tsx` | Message send button (`Send`) | `POST /api/chat/send-message` | Markdown-rendered answer, model name, thread ID |
| **Portal V2 AI Assistant** | `client/src/portal-v2/components/ai-assistant/AIAssistant.tsx` | `<AIAssistant />` component mount | `POST /api/ai/assist` | Citations panel, confidence badges, feedback buttons (👍/👎), regenerate |
| **CERV2 AI Auto-Populate** | `client/src/pages/CERV2EditorAI.jsx` | "AI Suggest" / section fill button | `POST /api/cerv2/ai/suggest`, `POST /api/cerv2/ai/analyze-section` | Section text with placeholder tokens `[DEVICE NAME]`, template content |
| **Cortex Search Panel** | `client/src/portal-v2/components/cortex/CortexSearchPanel.tsx` | Search input | `POST /api/cortex/query` | Sources list with scores, answer, graph nodes |
| **Cortex Chat Widget** | `client/src/portal-v2/components/cortex/CortexChatWidget.tsx` | Floating widget | `POST /api/cortex/query` | Conversational answers with source cards |
| **CSR Chat Panel** | `client/src/components/csr/CSRChatPanel.tsx` | Chat pane in CSR Intelligence page | `POST /api/chat/send-message` | Streamed responses |
| **VaultConcierge AI** | `client/src/components/VaultConciergeAI.jsx` | Vault document context button | `POST /api/ai/assist` | Document-scoped assistance |
| **CoAuthor AI** | `client/src/pages/CoAuthor.jsx`, `client/src/pages/FulleCTDCoAuthor.jsx` | Section editor AI toolbar | `POST /api/cerv2/ai/suggest` | AI-generated section text, cite attachment |
| **AI Assistant V3** | `client/src/components/ai/AIAssistantV3.tsx` | Embedded coding/regulatory agent | `POST /api/ai/assist` | Multi-modal suggestions |

### Demo Mode / Fallbacks

**Present.** `server/routes/chat.ts` includes a `generateDemoResponse()` function (lines 66–275) that returns hardcoded responses when the AI Gateway fails or no API key is configured.

```typescript
// server/routes/chat.ts line 30
console.warn('[Lumen Cortex] AI Gateway initialization failed, using demo mode');

// Response includes model='lumen-cortex-demo' sentinel
let model = 'lumen-cortex-demo';
```

Similarly, `server/routes/cerv2-ai-routes.ts` returns static placeholder text (bracket tokens like `[DEVICE NAME]`) as the "suggestion" — this is labeled stub content in the route comments.

### Proof

```typescript
// client/src/portal-v2/components/ai-assistant/AIAssistant.tsx (simplified)
const handleSend = async () => {
  const res = await fetch('/api/ai/assist', {
    method: 'POST',
    body: JSON.stringify({ content: input, task: 'regulatory_review' })
  });
  const data = await res.json();
  // data.citations[] is rendered below the answer
};
```

### How to Test

```bash
curl -X POST http://localhost:5000/api/chat/send-message \
  -H 'Content-Type: application/json' \
  -d '{"message":"What are the 510k requirements?","thread_id":null}'
# Returns: { answer, thread_id, usage, model }
# model='lumen-cortex-demo' if no OPENAI_API_KEY configured
```

### Open Issues

- CERV2 AI suggest routes return **static placeholder text**, not live LLM content.
- Demo fallback is active any time AI Gateway fails — no user-visible indicator that demo mode is active (model name is in response JSON but not surfaced in UI).

---

## 2) AI API Inventory (Server)

### What Exists

#### Chat API (`server/routes/chat.ts`)

| Route | Method | Auth | Request Schema | Response Schema |
|-------|--------|------|---------------|-----------------|
| `/api/chat/send-message` | POST | Optional (user ID from session) | `{ message: string, thread_id?: string, file_id?: string, system_prompt?: string }` | `{ answer, thread_id, usage: {prompt_tokens, completion_tokens, total_tokens}, model }` |
| `/api/chat/upload` | POST | Optional | `multipart/form-data` OR `{ fileName, mimeType, fileSize }` | `{ fileId, fileName, message }` |
| `/api/chat/thread/:threadId` | GET | Optional | Path param | `{ thread_id, messages: [{role, content}], created_at }` |
| `/api/chat/thread/:threadId` | DELETE | Optional | Path param | `{ success, message }` |
| `/api/chat/health` | GET | None | — | `{ status, mode, timestamp, threadCount }` |

#### AI Assistance API (`server/routes/ai-assistance.ts`)

| Route | Method | Auth | Rate Limit | Request Schema | Response Schema |
|-------|--------|------|-----------|---------------|-----------------|
| `/api/ai/assist` | POST | Role-based (`setAIService` injection) | 10 req/60s per IP | `{ content: string, task?: 'regulatory_review'\|'compliance_check'\|'content_enhancement', documentType?, section? }` | `{ success, result, fallback?, metadata: { processingTime, contentLength } }` |
| `/api/ai/verify` | POST | Role-based | 20 req/60s per IP | `{ content: string, sources?: string[] }` | `{ success, verification: { credibilityScore, issues[], suggestions[], sources[] }, metadata }` |
| `/api/ai/health` | GET | None | — | — | `{ status, apiKeyConfigured, timestamp }` |

#### CERV2 AI Routes (`server/routes/cerv2-ai-routes.ts`)

| Route | Method | Auth | Request Schema |
|-------|--------|------|---------------|
| `/api/cerv2/ai/suggest` | POST | `requireEditorAccess` (roles: admin/owner/editor/super_admin) | `{ docType: 'cerv2_510k'\|'cerv2_pma'\|'cerv2_cer', sectionId, fieldId, context?: {deviceName, predicateDevice, indication, existingContent} }` |
| `/api/cerv2/ai/equivalence` | POST | `requireEditorAccess` | `{ deviceName, predicateDevice, predicateK?, similarities?, differences? }` |
| `/api/cerv2/ai/benefit-risk` | POST | `requireEditorAccess` | `{ docType, deviceName, benefits?, risks? }` |
| `/api/cerv2/ai/analyze-section` | POST | `requireEditorAccess` | `{ docType, sectionId, context? }` |
| `/api/cerv2/ai/templates/:docType` | GET | `requireEditorAccess` | Path param: `cerv2_510k\|cerv2_pma\|cerv2_cer` |
| `/api/cerv2/ai/health` | GET | None | — |

#### Cortex Query API (`server/routes/cortexQueryRoutes.ts`)

| Route | Method | Auth | Request Schema |
|-------|--------|------|---------------|
| `POST /api/cortex/query` | POST | Optional (org context) | `{ query: string, mode?: 'search'\|'generate'\|'advisory'\|'graph', options?: { retrievalStrategy, aiStrategy, limit, threshold, useReranking, filters }, context?: { projectId, submissionType } }` |
| `GET /api/cortex/stats` | GET | None | — |
| `GET /api/cortex/providers` | GET | None | — |
| `POST /api/cortex/embed` | POST | Optional | `{ text: string, model? }` |

**Response schema for `/api/cortex/query`:**
```typescript
{
  success: boolean;
  mode: string;
  query: string;
  results: {
    answer?: string;
    sources?: Array<{
      id: string;
      documentId?: string;
      chunkId?: string;
      locator?: string;
      pageNumber?: number;
      title: string;
      content: string;
      score: number;       // cosine similarity or rerank score
      atomType: string;
    }>;
    graph?: { nodes[], edges[] };
    advisory?: { riskLevel, recommendations[], relevantPatterns[] };
  };
  metadata: {
    processingTimeMs: number;
    tokensUsed: number;
    aiProvider?: string;
    aiModel?: string;
    retrievalStrategy?: string;
  };
}
```

#### Vector Search (`server/routes/vectorSearch.js`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `POST /api/vector-search` | POST | None | Embedding-based search against `document_chunks` table |
| `GET /api/vector-health` | GET | None | DB connection health |

#### Biotech RAG (`server/routes/biotech-rag.js`)

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `POST /ingest` | POST | None | Single document with chunking + embedding |
| `POST /ingest/batch` | POST | None | Up to 10 documents |
| `POST /search` | POST | None | `{ query, topK, minScore, searchMode: 'semantic'\|'keyword'\|'hybrid', filters }` |

#### Error Envelope

```json
{ "error": "string message", "code": "ERROR_CODE", "fallback": true }
```
HTTP codes used: 400 (bad input), 403 (insufficient permissions), 429 (rate limit), 500 (internal error).

### Retrieval-Grounded (Retrieve-First)

**Partially.** The `/api/cortex/query` route in `generate` mode calls `getRAGPipeline().retrieve()` before calling the LLM:

```typescript
// server/routes/cortexQueryRoutes.ts (simplified)
const ragContext = await ragPipeline.retrieve(query, retrievalOptions);
// Then feeds ragContext.documents into LLM prompt
const response = await gateway.route({ messages: [...systemMsg, ...contextMsg, userMsg] });
```

`/api/chat/send-message` does **not** perform retrieval — it calls the LLM directly with the system prompt and conversation history only.

`/api/ai/assist` and `/api/cerv2/ai/suggest` also call the LLM without retrieval.

### How to Test

```bash
# Retrieval-grounded query
curl -X POST http://localhost:5000/api/cortex/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"What are MDR post-market requirements?","mode":"generate","options":{"retrievalStrategy":"basic"}}'
```

### Open Issues

- `/api/chat/send-message` is not retrieval-grounded — pure LLM with no source citations.
- `biotech-rag.js` has its Drizzle schema imports commented out (`// import { ragDocuments, ragChunks ... } from '@shared/schema'`) — fallback placeholder objects used instead. Rate limiters also disabled.
- Tenant scoping on `/api/vector-search` and `/api/chat/send-message` is **not enforced** — no `org_id` filter applied.

---

## 3) Retrieval / RAG (What Is Actually Implemented)

### What Exists

**Files:**
- `server/services/advancedRAGPipeline.ts` — main retrieval service
- `server/services/enhancedEmbeddingService.ts` — embedding generation + caching
- `server/routes/cortexQueryRoutes.ts` — HTTP entry point

**Embedding Model:**
```typescript
// server/services/enhancedEmbeddingService.ts
export type EmbeddingModel =
  | 'text-embedding-3-small'  // 1536d — Default
  | 'text-embedding-3-large'  // 3072d — High quality
  | 'text-embedding-ada-002'; // 1536d — Legacy
```

**Retrieval Flow (step-by-step):**

```
User Query
  │
  ▼
1. Embed query via OpenAI text-embedding-3-small (1536d)
  │
  ▼
2. Strategy selection:
   ├── basic:      → cosine similarity search in cortex.atoms (pgvector HNSW index)
   ├── hyde:       → generate hypothetical answer → embed that → search with hyde embedding
   ├── multi_query:→ expand to 3 query variants → search each → merge+dedupe
   └── advanced:   → hyde + multi_query combined
  │
  ▼
3. Org/project scoping: WHERE org_id = $orgId (push-down on cortex.atoms)
  │
  ▼
4. Optional cross-encoder reranking (LLM-based, scores 0-10)
  │
  ▼
5. Optional MMR (Maximal Marginal Relevance) for diversity
  │
  ▼
6. Return RetrievedDocument[] with initialScore, rerankScore, finalScore
```

**DB search table:** `cortex.atoms` with `embedding_1536 vector(1536)` column and HNSW index.

```sql
-- db/migrations/073_cortex_prime_unified_brain.sql
CREATE INDEX IF NOT EXISTS idx_cortex_atoms_embedding1536
  ON cortex.atoms USING hnsw (embedding_1536 vector_cosine_ops);
```

**Secondary search table:** `document_chunks` (used by `vectorSearch.js`):
```sql
SELECT id, doc_id, doc_title, chunk_index, content,
       ectd_section, page_number, doc_type, region_tag,
       embedding <=> $1::vector as similarity_score
FROM document_chunks
ORDER BY embedding <=> $1::vector
LIMIT 5
```

### Example Response (from `/api/cortex/query`)

```json
{
  "success": true,
  "mode": "generate",
  "query": "What are MDR post-market requirements?",
  "results": {
    "answer": "Under EU MDR 2017/745, post-market surveillance requires...",
    "sources": [
      {
        "id": "uuid-1234",
        "documentId": "uuid-doc",
        "chunkId": "uuid-chunk",
        "locator": "section:3.2:page:14",
        "pageNumber": 14,
        "title": "EU MDR 2017/745 Guidance",
        "content": "Article 83 defines PMS obligations...",
        "score": 0.87,
        "atomType": "regulation"
      }
    ]
  },
  "metadata": {
    "processingTimeMs": 1240,
    "tokensUsed": 850,
    "aiProvider": "openai",
    "aiModel": "gpt-4o",
    "retrievalStrategy": "basic"
  }
}
```

### Citations Tied to Answer Claims?

**No** — sources are returned as "related documents" that were used as context for the answer, but there is no claim-level citation anchoring (i.e., no inline `[1]` / `[2]` markers tied to specific sentences in the answer).

### How to Test

```bash
curl -X POST http://localhost:5000/api/cortex/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"MDR clinical evaluation requirements","mode":"generate","options":{"retrievalStrategy":"hyde","useReranking":true}}'
```

### Open Issues

- HNSW index exists for 1536d but **not for 3072d** (pgvector dimension limit noted in migration comments).
- `document_chunks` table uses legacy `text-embedding-ada-002` embeddings; `cortex.atoms` uses `text-embedding-3-small`. Two parallel embedding spaces exist.
- No claim-level citation anchoring — sources are "related" not "cited."

---

## 4) Citations & Provenance (UI + DB)

### What Exists

**UI Components:**

| Component | Path | What It Renders |
|-----------|------|-----------------|
| `CERV2CitationManager` | `client/src/components/CERV2CitationManager.jsx` | Manual citation list; types: standard/guidance/regulation/literature/MDR; section linking; URL auto-detection for FDA/ISO/EU URLs |
| `AIAssistant` (portal v2) | `client/src/portal-v2/components/ai-assistant/AIAssistant.tsx` | `showCitations` toggle shows `message.citations[]`; each citation has title, type, relevanceScore, snippet |
| `CortexSearchPanel` | `client/src/portal-v2/components/cortex/CortexSearchPanel.tsx` | Source cards with score, content snippet, atom type |
| `RegulatoryConfidenceStrip` | `client/src/components/RegulatoryConfidenceStrip.jsx` | Visual strip showing FDA/EMA/ISO logos (cosmetic — not per-result confidence) |

**When No Sources Exist:**  
The `AIAssistant` component hides the citations panel when `message.citations` is empty/null. No explicit "no sources found" messaging.

### DB Provenance Storage

**`cortex.atoms`** stores source documents:
```sql
source_type TEXT,        -- e.g. 'cortex_search', 'local_text_match', 'pdf_ingest'
content_hash TEXT,       -- SHA-256 of content for deduplication
structured_data JSONB    -- arbitrary provenance metadata
```

**`cortex.traces`** stores per-query provenance:
```sql
context_atom_ids UUID[], -- which atoms were used as context
output_atom_ids UUID[],  -- atoms produced by this trace
input_data JSONB,        -- includes the original query
output_data JSONB        -- includes the generated answer
```

**`ai_provider_audit_log`** (`db/migrations/20260125_ai_provider_audit_log.sql`):
```sql
request_hash VARCHAR(64), -- SHA-256 of request for deduplication
organization_id UUID,     -- tenant scoping
provider, model, task_type, input_tokens, output_tokens, cost
```

### Copy/Export Includes Provenance?

**Not confirmed.** CERV2 export routes (`server/routes/cerv2-export-routes.ts`) serialize document content. Whether source/citation metadata is included in export output is not verified in the current implementation.

### How to Test

```sql
-- Check recent traces with context atoms
SELECT t.id, t.input_data->>'query' as query, t.context_atom_ids, t.output_data
FROM cortex.traces t
ORDER BY t.created_at DESC LIMIT 5;
```

### Open Issues

- No inline citation anchoring in generated answers (see Section 3).
- `RegulatoryConfidenceStrip` is cosmetic (logo strip) — not per-result confidence.
- Export provenance inclusion is unverified.

---

## 5) "Regulatory Atoms" / Knowledge Graph

### What Exists

**Schema:** `db/migrations/073_cortex_prime_unified_brain.sql`

**`cortex.atoms`** — Universal Knowledge Nodes

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `atom_type` | TEXT | `chunk`, `entity`, `prediction`, `pattern`, `biomarker`, `regulation`, `agent_output`, `outcome` |
| `content` | TEXT | Full text content |
| `embedding_1536` | vector(1536) | OpenAI text-embedding-3-small |
| `embedding_3072` | vector(3072) | OpenAI text-embedding-3-large |
| `parent_atom_id` | UUID | Hierarchical parent |
| `source_document_id` | UUID | Source document reference |
| `structured_data` | JSONB | Arbitrary structured metadata |
| `confidence` | FLOAT | 0.0–1.0 |
| `source_type` | TEXT | How atom was created |
| `org_id` | UUID | Tenant isolation |
| `content_hash` | TEXT | SHA-256 dedup |

**`cortex.edges`** — Reasoning Relationships

| Column | Type | Description |
|--------|------|-------------|
| `edge_type` | TEXT | `supports`, `contradicts`, `derives_from`, `cites`, `version_of`, `part_of`, `validates`, `refutes` |
| `strength` | FLOAT | 0.0–1.0 |
| `evidence_text` | TEXT | Supporting text |
| `confidence` | FLOAT | 0.0–1.0 |

**Atom Creation Methods:**
1. **Ingestion** — `POST /ingest` in `biotech-rag.js` chunks PDFs/docs, embeds chunks, stores as `atom_type='chunk'`
2. **AI Extraction** — `cortexPrimeService` can create `entity`, `pattern`, `prediction` atoms from LLM output
3. **Manual** — `POST /atoms` in `cortexRoutes.ts` with `requireOrgAccess` auth

**Graph Traversal:**
```typescript
// server/routes/cortexRoutes.ts
router.post('/traverse', requireAuth, requireOrgAccess, async (req, res) => {
  // startAtomId, edgeTypes[], maxDepth (1-10), minStrength
  const graph = await cortex.traverseGraph(startAtomId, edgeTypes, maxDepth, minStrength);
  // Returns { nodes[], edges[] }
});
```

### Count Metrics

Live counts require DB access. Schema supports per-org partitioning via `org_id`.

### How to Test

```bash
curl -X GET http://localhost:5000/api/cortex/stats
# Returns counts per atom_type for the requesting org
```

### Open Issues

- Atom ingestion pipeline in `biotech-rag.js` has commented-out schema imports — atoms may not be persisted to DB correctly.
- No UI for browsing/editing the knowledge graph directly (CortexKnowledgeGraph component exists: `client/src/portal-v2/components/cortex/CortexKnowledgeGraph.tsx` but wiring to backend unverified).

---

## 6) Hallucination Mitigation / Verification

### What Exists

**Verifier endpoint:** `POST /api/ai/verify` in `server/routes/ai-assistance.ts`

```typescript
const verifyRequestSchema = z.object({
  content: z.string().min(1).max(50000),
  sources: z.array(z.string()).optional()
});
// Response:
// { success, verification: { credibilityScore, issues[], suggestions[], sources[] }, metadata }
```

This calls the injected `AIProviderRouter` to evaluate content credibility — it is an LLM-based check, not a deterministic verifier.

**No retrieval-grounded verifier pass** — there is no step that checks generated claims against a retrieved corpus and labels them "supported" / "unsupported."

### Guardrails

| Guardrail | Implemented | Location |
|-----------|-------------|----------|
| Rate limiting (in-memory) | ✅ | `server/routes/ai-assistance.ts` lines 34–52 |
| Role-based auth on sensitive routes | ✅ | `server/routes/cerv2-ai-routes.ts` `requireEditorAccess` |
| Input length limits | ✅ | Zod schemas: `max(50000)` on content |
| No external browsing enforcement | **Not implemented** | No firewall/allowlist for LLM web access |
| Allowed sources enforcement | **Not implemented** | No source allowlist; LLM uses training knowledge |
| Disclaimer messaging | **Partial** | Demo mode returns hardcoded responses with no disclaimer |

### How to Test

```bash
curl -X POST http://localhost:5000/api/ai/verify \
  -H 'Content-Type: application/json' \
  -d '{"content":"The device meets all ISO 13485 requirements.","sources":[]}'
```

### Open Issues

- No claim-level verification — the `/verify` endpoint asks the LLM to assess content credibility, which is itself an LLM opinion.
- No "allowed sources only" enforcement — LLM can hallucinate regulatory citations.
- No conflict detection between generated content and a verified corpus.

---

## 7) Audit Trail + Part 11 Touchpoints for AI

### What Exists

**Primary audit table:** `ai_provider_audit_log` (`db/migrations/20260125_ai_provider_audit_log.sql`)

```sql
CREATE TABLE ai_provider_audit_log (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(50) NOT NULL,       -- 'openai', 'anthropic', 'moonshot'
  model VARCHAR(100) NOT NULL,
  task_type VARCHAR(50) NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  cost DECIMAL(10,6) NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  organization_id UUID,                -- tenant isolation
  user_id UUID,
  project_id UUID,
  request_hash VARCHAR(64) NOT NULL,   -- SHA-256 fingerprint
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**`GatewayAuditLogger`** in `server/services/ai-gateway/audit.ts` writes to this table on every AI Gateway call. It captures:
- Provider + model used
- Token counts (input/output)
- Latency
- Success/failure + error message
- org_id, user_id, project_id
- SHA-256 request hash

**Cortex execution log:** `cortex.traces` stores per-inference records including:
- `input_data` (prompt/query)
- `output_data` (response)
- `context_atom_ids` (retrieved sources)
- `token_count`, `execution_ms`
- `user_id`, `org_id`

**Chat thread audit:** `chat_messages` table stores every user and assistant message with `thread_id`, `role`, `content`, `model`, `tokens_used`.

### AI Actions Emitting Audit Events

| AI Action | Event Type | Location | Payload Shape |
|-----------|-----------|----------|---------------|
| Any LLM call via Gateway | `ai_provider_audit_log` row | `GatewayAuditLogger.log()` in `server/services/ai-gateway/audit.ts` | `{ provider, model, taskType, inputTokens, outputTokens, latencyMs, cost, success, organizationId, userId, requestId }` |
| Chat message sent/received | `chat_messages` row | `server/services/chat-thread-helpers.ts` `saveChatMessage()` | `{ threadId, role, content, model, tokensUsed }` |
| Cortex query execution | `cortex.traces` row | `server/services/cortexPrimeService.ts` | `{ threadId, inputData, outputData, contextAtomIds, tokenCount, executionMs }` |
| File upload | `file_uploads` row | `server/routes/chat.ts` | `{ id, userId, originalName, mimeType, fileSize, storagePath }` |

### Immutable + Tenant-Scoped?

- `ai_provider_audit_log`: `organization_id` column provides tenant scoping. No `UPDATE`/`DELETE` triggers — effectively append-only at the application layer, but no DB-level immutability constraint.
- `cortex.traces`: `org_id` provides tenant scoping. Same caveat — no DB-level write-once enforcement.
- `chat_messages`: Stored per-thread; no org isolation on the `chat_messages` table itself.

**User accepting AI text into document** — this event is **not** explicitly audited. There is an `authoring_audit_trail` table (used in `server/routes/authoring.router.ts`) but it does not currently capture AI-to-document acceptance events.

### How to Test

```sql
SELECT * FROM ai_provider_audit_log ORDER BY timestamp DESC LIMIT 10;
SELECT * FROM cortex.traces ORDER BY created_at DESC LIMIT 5;
```

### Open Issues

- No DB-level immutability (no triggers preventing UPDATE/DELETE on audit rows).
- "User accepts AI text into document" not audited.
- `chat_messages` table lacks `org_id` — all chat history shares a single namespace.

---

## 8) Document Authoring Integration (CoAuthor + Exports)

### What Exists

**CoAuthor Pages:**
- `client/src/pages/CoAuthor.jsx` — basic CoAuthor UI
- `client/src/pages/FulleCTDCoAuthor.jsx` — full eCTD coauthor with section navigation
- `client/src/pages/RealCoAuthor.jsx` — production CoAuthor with real DB persistence

**How AI Is Applied:**

The CERV2 editor calls `POST /api/cerv2/ai/suggest` with `{ docType, sectionId, fieldId, context }`. The returned placeholder text is inserted into the section field. No streaming or real-time generation — response is synchronous JSON.

**Sources Attached to Content:**  
`CERV2CitationManager` (`client/src/components/CERV2CitationManager.jsx`) allows manual citation attachment to sections. Citations store: `{ id, type, title, authors, year, url, source, sectionId }`. These are stored in component state — persistence to DB depends on whether the parent page saves them via the CERV2 document save endpoint.

**Versioning + Diff:**
- `server/routes/cerv2-versions.ts` exists — provides version CRUD.
- Whether diff computation persists to DB: not verified in this audit.
- `authoring_audit_trail` table captures section-level changes via `server/routes/authoring.router.ts`.

**Export / Serialization:**

`server/routes/cerv2-export-routes.ts` provides document export. Export pipeline does not currently include source/citation metadata or checksums based on route inspection. The `CERV2CitationManager` citations are component-local state — they must be explicitly saved before export to be included.

### How to Test

```bash
# Get CERV2 section AI suggestion
curl -X POST http://localhost:5000/api/cerv2/ai/suggest \
  -H 'Content-Type: application/json' \
  -d '{"docType":"cerv2_510k","sectionId":"se","fieldId":"se_discussion","context":{"deviceName":"MyDevice","predicateDevice":"PredicateK123456"}}'
```

### Open Issues

- AI suggestions in CERV2 are **static placeholder text**, not LLM-generated content.
- Citation persistence to DB from CoAuthor not confirmed.
- Export does not include citation/source metadata or checksums.
- No diff rendering in UI for AI-modified vs. original section content.

---

## 9) Storage Model for AI Interactions

### What Exists

| Stored Item | Table | Key Fields |
|-------------|-------|-----------|
| **Prompts (user messages)** | `chat_messages` | `thread_id`, `role='user'`, `content`, `model`, `tokens_used` |
| **AI responses** | `chat_messages` | `role='assistant'`, `content`, `model`, `tokens_used` |
| **Provider + model used** | `ai_provider_audit_log` | `provider`, `model`, `task_type` |
| **Token counts** | `ai_provider_audit_log` | `input_tokens`, `output_tokens` |
| **Latency + cost** | `ai_provider_audit_log` | `latency_ms`, `cost` |
| **Request fingerprint** | `ai_provider_audit_log` | `request_hash` (SHA-256) |
| **Retrieved source snapshot** | `cortex.traces` | `context_atom_ids[]` (references, not snapshot copy) |
| **AI output atoms** | `cortex.traces` | `output_atom_ids[]` |
| **Full query + response** | `cortex.traces` | `input_data JSONB`, `output_data JSONB` |
| **Confidence** | `cortex.traces` | `confidence FLOAT` |
| **Claim breakdown** | **Not stored** | No per-claim decomposition |

### Example `chat_messages` Row Shape

```sql
INSERT INTO chat_messages (thread_id, role, content, model, tokens_used, created_at)
VALUES ('uuid-thread', 'assistant', 'Based on 21 CFR 820...', 'gpt-4o', 347, NOW());
```

### Example `ai_provider_audit_log` Row

```sql
INSERT INTO ai_provider_audit_log
  (id, provider, model, task_type, input_tokens, output_tokens, latency_ms, cost,
   success, organization_id, user_id, project_id, request_hash)
VALUES
  (gen_random_uuid(), 'openai', 'gpt-4o', 'chat', 524, 347, 1240, 0.00728,
   true, 'org-uuid', 'user-uuid', 'project-uuid', 'sha256hash...');
```

### What Is Not Stored

- **Claim breakdown** — no per-sentence or per-claim confidence/provenance.
- **Retrieval snapshot copy** — `cortex.traces.context_atom_ids` references atom IDs but does not snapshot the content at query time. If atoms are updated later, the historical context cannot be reconstructed exactly.
- **CERV2 AI suggestions** — the static placeholder text returned by cerv2-ai-routes is not logged to any audit table.

### How to Test

```sql
SELECT cm.thread_id, cm.role, LEFT(cm.content, 100), cm.model, cm.tokens_used
FROM chat_messages cm ORDER BY cm.created_at DESC LIMIT 5;

SELECT request_hash, provider, model, input_tokens, output_tokens, cost, success
FROM ai_provider_audit_log ORDER BY timestamp DESC LIMIT 5;
```

### Open Issues

- No content snapshot in traces — atom content could change after the query.
- CERV2 AI stub responses not audited.
- `chat_messages` lacks `org_id` for tenant isolation.

---

## 10) Config / Model Selection

### What Exists

**Models configured in `server/services/ai-gateway/gateway.ts`:**

| Model ID | Provider | Context | Quality | Default Enabled |
|----------|----------|---------|---------|----------------|
| `gpt-4o` | openai | 128k | 95 | ✅ (requires `OPENAI_API_KEY`) |
| `gpt-4o-mini` | openai | 128k | 82 | ✅ |
| `claude-3-5-sonnet-20241022` | anthropic | 200k | 97 | ✅ (requires `ANTHROPIC_API_KEY`) |
| `claude-3-haiku-20240307` | anthropic | 200k | 80 | ✅ |
| `moonshot-v1-128k` | moonshot | 128k | 85 | ❌ (requires `KIMI_API_KEY` or `MOONSHOT_API_KEY`) |
| `moonshot-v1-32k` | moonshot | 32k | 83 | ❌ |

**Embedding models (`server/services/enhancedEmbeddingService.ts`):**
- `text-embedding-3-small` (1536d) — **default**
- `text-embedding-3-large` (3072d) — high quality
- `text-embedding-ada-002` (1536d) — legacy (used in `vectorSearch.js`)

**Environment variables (`.env.example`):**
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
KIMI_API_KEY=...   (or MOONSHOT_API_KEY)
```

**Routing strategies (`server/services/ai-gateway/types.ts`):**
- `task_based` — route by task type → provider capabilities
- `cost_optimized` — cheapest model meeting quality threshold
- `latency_optimized` — fastest provider
- `quality_optimized` — highest quality model (default for `regulatory_review`)
- `round_robin` — distribute evenly
- `explicit` — caller-specified provider/model

**Fallback logic:** If the selected provider fails, `AIGateway` tracks `ProviderHealth` per provider and retries with an alternate healthy provider. Fallback model is not surfaced to the user — the `model` field in responses will show the fallback model used.

### How to Test

```bash
curl http://localhost:5000/api/cortex/providers
# Returns list of enabled providers and their health status

curl http://localhost:5000/api/cortex/stats
# Returns aggregate usage stats
```

### Open Issues

- Moonshot/Kimi is disabled by default — needs explicit env var to activate.
- No user-facing indicator when fallback model is used.

---

## 11) Performance + Scaling

### What Exists

**Response time (estimated from code — no benchmarks in repo):**

| Operation | Estimated Latency | Notes |
|-----------|------------------|-------|
| Plain chat (`/api/chat/send-message`) | 1–4 seconds | Single LLM call, no retrieval |
| Retrieval-grounded (`/api/cortex/query` basic) | 2–6 seconds | 1 embed + pgvector search + 1 LLM call |
| HyDE retrieval (`strategy: 'hyde'`) | 4–10 seconds | 1 LLM call for hypothesis + embed + search + 1 LLM call |
| Multi-query + reranking | 8–20 seconds | 3 embed calls + 3 searches + rerank LLM + answer LLM |
| Demo mode | <100ms | Pre-baked string matching, no network |

**Caching:**
- `EnhancedEmbeddingService` has an in-memory LRU cache for embeddings (keyed by content hash).
- No Redis or distributed cache — caching is per-process and lost on restart.
- `ai_provider_audit_log.request_hash` enables deduplication detection but no cache lookup is implemented against it.

**Job Queue / Async Processing:**
- Batch ingestion in `biotech-rag.js` (`POST /ingest/batch`) handles up to 10 documents sequentially in-request.
- No persistent job queue (no Bull/BullMQ, no Celery workers in the Node.js layer).
- Python `backend/celery_config.py` exists — indicates Celery is used in the Python backend, not the Node.js server.

### How to Test

```bash
# Measure cortex query latency
time curl -X POST http://localhost:5000/api/cortex/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"510k device classification","mode":"generate"}'
```

### Open Issues

- No distributed caching (in-memory only).
- No async job queue in Node.js layer for long-running operations.
- No benchmarks or SLA targets defined in codebase.

---

## 12) Test Harness / Evaluation

### What Exists

**Test infrastructure:**
- `package.json` `"test"` script: `jest --config scripts/jest.config.js && vitest run --config vitest.config.ts`
- `server/__tests__/` — Jest tests for server-side logic
- `server/routes/__tests__/` — Route-level tests: `deviceProfileRoutes.test.ts`, `fda510k-test.ts`, `product-audit.test.ts`, `ssoRoutes.test.ts`
- `tests/` directory with integration tests
- `vitest.config.ts` for client-side unit tests

**AI-specific tests:**
- `server/services/ai-gateway/__tests__/` — Gateway unit tests
- No RAG quality evaluation scripts in repo
- No citation coverage metrics
- No hallucination rate benchmarks

### AI Quality Metrics

**None implemented.** No:
- Citation coverage rate (% of answers with sources)
- Retrieval precision/recall metrics
- Hallucination rate tracking
- A/B test framework for model comparison (schema hints exist in `db/migrations/077_gcc_self_evolving_intelligence.sql` for prompt A/B testing, but not wired to evaluation tooling)

### How to Test

```bash
npm test
# Runs Jest (server) + Vitest (client)
```

### Open Issues

- **No AI eval harness exists** for quality metrics.
- No golden dataset for regression testing of AI responses.
- No CI gate on AI output quality.

---

## 13) Known Gaps (No Sugar-Coating)

### What Is Real and Production-Grade

- ✅ **AI Gateway** (`server/services/ai-gateway/`) — multi-provider routing (OpenAI, Anthropic, Moonshot), health tracking, audit logging, policy enforcement, deterministic mode for testing.
- ✅ **`ai_provider_audit_log` table** — comprehensive per-call audit log with org/user/project scoping, token counts, cost, latency. Meets 21 CFR Part 11 logging requirements at the record level.
- ✅ **`cortex.atoms` + `cortex.edges` schema** — well-designed knowledge graph schema with pgvector HNSW indexing, org-level tenant isolation, multiple atom types.
- ✅ **`advancedRAGPipeline.ts`** — implements HyDE, multi-query, cross-encoder reranking, MMR. Code is production-quality.
- ✅ **`enhancedEmbeddingService.ts`** — batch embedding with in-memory caching, retry logic, multiple model support.
- ✅ **LumenCortexChat UI** — polished conversational UI with markdown rendering, thread persistence, model display.
- ✅ **Portal V2 AIAssistant** — citation panel, feedback buttons, regenerate.
- ✅ **Role-based auth on sensitive AI routes** (CERV2 AI routes).
- ✅ **Input validation with Zod** on all AI endpoints.
- ✅ **Rate limiting** on `/api/ai/assist` and `/api/ai/verify` (in-memory, not Redis).

### What Is Partial

- ⚠️ **Retrieval-grounded answers** — only available via `/api/cortex/query`. The primary chat endpoint (`/api/chat/send-message`) is pure LLM with no retrieval.
- ⚠️ **Citation UI** — citations rendered in Portal V2 AIAssistant but are "related sources," not claim-anchored. CERV2CitationManager is manual-only.
- ⚠️ **Versioning + diff** — routes exist (`cerv2-versions.ts`) but completeness of diff persistence is unverified.
- ⚠️ **Tenant isolation in chat** — `cortex.atoms` and `ai_provider_audit_log` have `org_id`; `chat_messages` and `document_chunks` (vectorSearch) do not.
- ⚠️ **`biotech-rag.js`** — schema imports commented out, rate limiters removed; ingestion pipeline may not persist atoms to DB correctly.
- ⚠️ **Audit completeness** — gateway calls are audited; "user accepts AI text into document" is not.

### What Is Missing

- ❌ **Claim-level citation anchoring** — no inline `[1][2]` tied to specific sentences in AI answers.
- ❌ **AI eval harness** — no citation coverage, hallucination rate, or retrieval precision metrics.
- ❌ **Retrieval snapshot** — `cortex.traces` stores atom IDs but not atom content at query time; historical faithfulness reconstruction is impossible if atoms change.
- ❌ **"User accepts AI text" audit event** — not captured.
- ❌ **Export provenance** — citation/source metadata not included in CERV2 exports.
- ❌ **DB-level immutability** on audit tables (no write-once triggers).
- ❌ **Distributed cache** for embeddings (in-memory only, per-process).
- ❌ **Async job queue** in Node.js for long RAG operations.
- ❌ **Content checksums in exports** — no SHA-256/hash on exported document content.

### What Is Still Risky (Even If "Working")

- 🔴 **CERV2 AI suggestions are static placeholder text** — `POST /api/cerv2/ai/suggest` returns hardcoded bracket-token templates, not LLM-generated content. If a user treats this as AI-assisted content for a submission, it is a regulatory risk.
- 🔴 **Demo mode silent fallback** — when AI Gateway fails, chat falls back to hardcoded demo responses without any clear indicator to the user. A user may submit demo-mode content as real AI analysis.
- 🔴 **No hallucination guardrails on allowed sources** — the LLM can cite non-existent regulations or misnumbered standards. No source allowlist enforcement exists.
- 🔴 **`chat_messages` lacks `org_id`** — all tenant chat history is co-mingled in one table; a bug in thread ID handling could expose another tenant's conversation history.
- 🟡 **Rate limiting is in-memory** — in a multi-process/multi-instance deployment, rate limits are per-process only; burst attacks can exceed intended limits.
- 🟡 **pgvector 3072d index missing** — if 3072d embeddings are used, searches fall back to sequential scan (no HNSW), which will be extremely slow at scale.

---

*Generated by code audit of `concept2cure-v2` branch. Last updated: 2026-02-23.*
