# Data / Knowledge / Memory Layer Audit

**Date:** 2026-03-24  
**Scope audited:** `server/`, `shared/`, and `shadow_service/` implementation surfaces relevant to ingestion, retrieval, memory, vector search, RAG, and knowledge graph behavior.

---

## Executive Assessment

The repository has **strong building blocks** for a modern data/knowledge/memory layer, but they are **fragmented across multiple stacks** (legacy chat memory, vault RAG, Phase-3 semantic vectors, client/project intelligence memory, and shadow-service evidence/retention controls).

### Maturity Snapshot

- **Data ingestion:** Good breadth of ingestion paths and workers, uneven normalization/governance.
- **Vector retrieval / RAG:** Advanced retrieval patterns exist (HyDE, multi-query, reranking, MMR, compression), but implementation consistency and operational hardening are incomplete.
- **Memory (short/long term):** Short-term memory and summary compression exist; long-term memory exists at client/project levels; cross-agent shared memory is not unified.
- **Knowledge graph:** Multiple graph implementations exist; no single canonical graph contract.
- **Structured forgetting:** Present in retention/purge governance (especially shadow_service), but not unified with conversational/application memory.

---

## Current State (What Exists)

## 1) Ingestion & Persistence

### Strengths

1. **Typed schema coverage for memory/vector layers**
   - `conversation_working_memory` supports compressed conversation state snapshots.
   - `document_vectors`, `rag_documents`, `rag_chunks`, `rag_queries`, and `rag_knowledge_graph` provide a broad substrate for retrieval and graph-style enrichment.
   - `client_memory_entries` and `project_memory_entries` support persistent profile/project memory.  

2. **Operational ingestion flows exist**
   - File extraction and entry creation are implemented for client/project memory ingestion.
   - A vault vectorization worker exists for chunking and embedding background processing.

3. **Retention/governance primitives exist in shadow service**
   - Retention policies, legal holds, archive manifests, and purge-request workflows are implemented.

### Gaps

- Multiple ingestion paths use different chunking/metadata conventions (risking drift in retrieval quality).
- Some extraction paths are heuristic-only and can produce low-precision “memory atoms.”
- No single ingestion contract enforces canonical metadata fields across all pipelines.

---

## 2) Vector Databases & Retrieval

### Strengths

1. **Advanced RAG pipeline implementation exists**
   - Retrieval supports strategy variants (`basic`, `hyde`, `multi_query`, `advanced`) plus reranking/MMR/context compression.
   - Tenant context injection is present for organization-scoped queries.
   - Citation persistence into evidence tables is partially wired.

2. **Multiple vectorized stores are modeled**
   - Vault chunk embeddings.
   - `document_vectors` (3072-d model track).
   - `rag_chunks` (1536-d model track).

### Gaps

- **Store/model fragmentation:** 1536d and 3072d vector spaces coexist with different services and no canonical router policy.
- **Potential quality/reliability defects in implementation surfaces:**
  - Legacy/parallel vector routes exist with inconsistent client wiring and likely dead-path risk.
  - Advanced pipeline source/schema assumptions differ from other vector subsystems.
- No unified retrieval quality dashboard (precision@k, hit-rate by corpus, latency by strategy).

---

## 3) Memory Layer (Short-term, Long-term, Session-Persistent)

### Strengths

1. **Short-term chat memory exists in two forms**
   - In-memory thread object service (`MemoryService`).
   - DB-backed thread/message storage with token-windowing helpers.

2. **Working-memory summarization exists**
   - Structured summary format with objective/facts/decisions/open questions/next actions.
   - Refresh thresholds are defined to prevent prompt explosion.

3. **Long-term contextual memory exists**
   - Client-level and project-level persistent intelligence profiles and memory entries.

### Gaps

- No **single memory orchestration layer** that merges:
  - live thread context,
  - working memory summaries,
  - client/project persistent memory,
  - retrieval evidence.
- Limited semantic retrieval over client/project memory entries despite embedding fields in schema.
- No explicit memory conflict resolution (supersession policy beyond status flags).

---

## 4) Knowledge / Semantic Graph

### Strengths

- Several graph-capable services and schemas are present:
  - GraphRAG route and data types.
  - Enterprise knowledge graph service patterns.
  - RAG knowledge graph table model.
  - Additional domain graph services (foresight/translational).

### Gaps

- **Too many overlapping graph abstractions** without a canonical “truth graph” interface.
- Inconsistent backend assumptions (tables/schema names differ across services).
- No unified graph ingestion and reconciliation pipeline (entity resolution, deduplication, edge confidence management).

---

## 5) Shared Memory Pools for Multi-Agent Collaboration

### Current State

- There is **collaboration context** (threads, project/client contexts, orchestration artifacts), but not a dedicated shared-memory pool optimized for concurrent multi-agent write/read semantics.

### Missing

- No explicit:
  - agent identity + role-scoped memory partitions,
  - consensus/merge protocol for conflicting agent writes,
  - attribution and trust scores at memory-atom level in app-layer memory (outside shadow evidence controls).

---

## 6) Structured Forgetting

### Current State

- Shadow service has strong retention/hold/archive/purge governance and automated sweep jobs.

### Missing

- Conversation and application memory layers are not fully connected to retention classes and forgetting policies.
- No memory-tiered decay strategy (e.g., ephemeral → summary → canon) across all memory stores.

---

## What Is Missing (Priority View)

## P0 — Unification / Reliability

1. **Canonical Data-Memory Contract**
   - One normalized metadata envelope for all ingested chunks/atoms.
2. **Single Retrieval Router**
   - Route all RAG calls through one policy engine selecting corpus + embedding space + strategy.
3. **Memory Orchestrator Service**
   - Deterministically compose short-term history + working memory + persistent memory + retrieved evidence.

## P1 — Quality / Governance

4. **Memory Conflict & Supersession Engine**
   - Versioned memory atoms with explicit supersedes/contradicts links.
5. **Unified Observability**
   - Retrieval quality, memory hit-rate, stale-memory alerts, and strategy-level latency/cost dashboards.
6. **Graph Canonicalization**
   - One graph API and one canonical edge schema with confidence/version lineage.

## P2 — Multi-agent & Forgetting Modernization

7. **Shared Multi-Agent Memory Pool**
   - Workspace/project scoped, with ACL + attribution + merge policy.
8. **Structured Forgetting Across App Layer**
   - TTL/decay and retention policy hooks for conversational and client/project memory tables.

---

## Enhancement Plan (Enhance Existing, Don’t Rebuild)

## Phase A (2–4 weeks): “Unify what already exists”

1. **Introduce a `MemoryContextAssembler` service**
   - Compose context from:
     - chat window (`chat_messages`),
     - latest `conversation_working_memory`,
     - top semantic matches from `client_memory_entries` / `project_memory_entries`,
     - top RAG evidence chunks.
   - Use existing tables and route outputs into current chat/RAG flows.

2. **Standardize embedding policy by corpus**
   - Keep current stores but enforce a policy map (e.g., `vault=1536`, `doc_vectors=3072`) and block cross-space comparisons without projection.

3. **Normalize ingestion metadata**
   - Add shared metadata schema fields (source, section, page, extraction_method, confidence, timestamps, org/project/thread ids).
   - Backfill via migration scripts for major tables.

## Phase B (4–8 weeks): “Collaboration + memory quality”

4. **Activate semantic retrieval for client/project memory entries**
   - Existing embedding columns already support this; implement retrieval endpoints and plug into context assembly.

5. **Add memory atom lifecycle states + links**
   - Reuse status patterns (`active`, `superseded`, `archived`) and add deterministic links (`supersedes_id`, `contradicts_id`).

6. **Create shared-memory workspace view**
   - Materialized/virtual view that merges relevant memory atoms across agents by project.

## Phase C (8+ weeks): “Structured forgetting and graph hardening”

7. **Attach retention classes to app memory tables**
   - Reuse shadow retention semantics; map memory categories to retention policy + legal hold behavior.

8. **Canonical graph adapter**
   - Keep existing graph services but place a compatibility adapter with one edge schema and confidence normalization.

9. **Measure quality continuously**
   - Add offline eval harness for retrieval quality and hallucination suppression using stored citation/evidence traces.

---

## Bottom Line

The platform is **not missing fundamentals**; it is missing **unification and policy coherence**. The fastest path to enterprise-grade Data/Knowledge/Memory is to standardize and orchestrate the **existing** components (schemas, RAG pipeline, working memory, client/project memory, and retention controls) rather than replacing them.

