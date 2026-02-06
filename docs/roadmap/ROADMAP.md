# Concept2Cure Roadmap (Backend-First)

_Last updated: 2026-02-05_

This roadmap is optimized for **layers, intelligence, and orchestration first**. UI is treated as a thin client that lights up once the backend "factory" is stable.

---

## Current State (What's Done)

### A8 — Async Review Batch System ✅ COMPLETE (Merged to `main`)
- Async batch processing + external worker mode
- Worker production readiness (health/ready/metrics)
- Reliability hardening (backoff+jitter, poison-batch, max inflight)
- Multi-worker safety (atomic claim via `FOR UPDATE SKIP LOCKED`, `claimed_by`, `failed_reason`)
- Ops control plane (cancel / requeue / list) + worker cancel compliance
- Ops dashboard + token-gated admin ops + audit attribution (`admin_actor`, `request_id`)
- E2E smoke scripts: async e2e + ops smoke

**Net result:** the job system is now "boring" (good). It can run long workflows safely and be operated without guesswork.

---

## North Star

Build a **Regulatory Factory OS**:
1) **Orchestration Kernel** (state machine + job runner)  
2) **Evidence Fabric** (provenance, citations, chain-of-custody)  
3) **Agent Tools** (ingest, reason, draft, validate, assemble)  
4) **Artifact Factory** (DOCX/PDF/eCTD outputs)  
5) **Thin UI** (only when the system is dependable)

---

## Phase 4 — Project Orchestration Kernel (THE SPINE) ⏳ NEXT

### 4.1 Domain Spine (multi-tenant)
- `clients → programs → projects`
- RBAC/RLS boundaries and audit logging
- "Program Context" object (everything downstream depends on)

### 4.2 Work Graph (state machine for regulatory assets)
- `workflow_defs` (templates) + `workflow_runs` (instances) + `step_runs` (audit/idempotency)
- Step status: `PENDING → RUNNING → COMPLETED/FAILED/CANCELLED`
- Idempotency via `input_hash` (re-run safe)

### 4.3 Generic Job Runner (dispatch layer)
- Executes step actions reliably, updates `step_runs`
- Retries/backoff policy for transient failures
- Emits events for compliance + ops (this plugs into the A8 worker)

### 4.4 Step DSL + Tool Registry (innovation)
- Define steps as a **small DSL** (JSON/YAML) with typed inputs/outputs
- Tool registry: `INGEST_FILE`, `AI_DRAFT`, `VALIDATE_RULESET`, `GENERATE_DOCX`, etc.
- Versioned workflow definitions (reproducibility)

### 4.5 Quality Gates (innovation)
- "Policy-as-code" checks run as steps (e.g., required sections present, citations attached)
- Hard gates (block progression) vs soft gates (warn + allow)
- Auto-generated "readiness score" per project/run

**Deliverable:** a backend that can spawn and track 50–500 steps per project without UI complexity.

---

## Phase 5 — Evidence Fabric (TRUST LAYER) ⏳ NEXT AFTER KERNEL

This is the differentiator: every claim has a source, every output is explainable.

### 5.1 Evidence Graph
- Evidence nodes: `CSR excerpt`, `guideline`, `labeling`, `protocol`, `analysis output`
- Claim nodes link to evidence with offsets + hashes
- Confidence + rationale fields (per agent/tool)

### 5.2 Provenance + Chain-of-Custody (innovation)
- Cryptographic hashes for ingested files and derived artifacts
- Immutable audit ledger entries for: ingest, transform, draft, validate, export
- "Explain this paragraph" → returns exact evidence set + transformations

### 5.3 Semantic Cache (innovation)
- pgvector for embeddings + a cache layer (e.g., Redis) for repeated retrievals
- Deterministic retrieval mode for compliance runs

**Deliverable:** the system can defend outputs in audits and internal reviews.

---

## Phase 6.5 — DOCX Factory (ARTIFACT MUSCLE) ⏳ IN PARALLEL

DOCX generation is not a button; it's a **workflow step** (kernel-powered).

### 6.5.1 Template Model
- Template = layout + style tokens + placeholders + rules
- Placeholder types: text, tables, figures, citations, appendices
- Section ownership: maps to workflow steps (e.g., "M2.5 Draft Complete → Assemble DOCX")

### 6.5.2 Assembly Engine
- Composes sections into DOCX deterministically
- Tracks artifact manifest: inputs, versions, evidence bundle, hashes

### 6.5.3 Diff + Redline (innovation)
- Generate "delta packages" between versions (what changed and why)
- Redline view for reviewers (even if UI is later, artifact-level diff is immediate value)

**Deliverable:** exportable deliverables that are reproducible and auditable.

---

## Phase 7 — Intelligence Modules (AGENTS + ANALYTICS) ⏳ AFTER KERNEL/EVIDENCE

Backend-first modules, wired as tools in the registry:
- Ingestion & normalization (CSR, protocol, labels, guidance)
- RegIntel validator (policy-as-code + LLM justification)
- Comparator intelligence (precedent matching + risk deltas)
- Statistical planning utilities (power/SAP scaffolds)
- "Adversarial reviewer" simulation (find weaknesses before regulators do) (innovation)

---

## Phase 8 — Thin UI & Project Workbench (DEFERRED)

UI should *reflect* the orchestration kernel, not invent its own process.
- Project view: runs/steps, readiness score, blockers, artifact versions
- Evidence explorer: claims → citations → source excerpts
- Ops console: already started (A8-7); expand once kernel exists

---

## Immediate Next Instructions for the Codespace AI Dev Agent

**Goal:** Ship Phase 4 Kernel foundations in small PRs (no UI work).

1) **Schema PR:** Domain Spine + Work Graph tables + indexes + RLS stubs  
2) **Service PR:** `JobRunner` skeleton (idempotency + dispatch + events)  
3) **Workflow Seed PR:** 1 workflow_def for "Async Review Batch" that exercises the runner  
4) **Integration PR:** Wire JobRunner to A8 worker (queue step_runs as batches)

If we do only one thing next: **Step 1 + Step 2**.

---