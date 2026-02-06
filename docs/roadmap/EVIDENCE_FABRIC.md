# Phase 5: Evidence Fabric — Intelligent Document System
> **Version:** 1.0 | **Created:** 2026-02-06 | **Status:** PLANNED  
> **Parent:** [CONCEPT2CURE_MASTER_ROADMAP.md](./CONCEPT2CURE_MASTER_ROADMAP.md)  
> **Depends On:** Phase 4 (Orchestration Kernel)

---

## Purpose

Phase 5 builds the **Evidence Fabric** — a traceability-first document intelligence layer that:

1. Links every claim in a regulatory document to its **evidentiary source**
2. Propagates changes through dependent documents **automatically**
3. Provides **compliance scoring** per section/document/submission
4. Generates **traceability matrices** (RTM) from the living data graph
5. Bridges orchestration step outputs to **document sections**

---

## Architecture Overview

```
                    ┌─────────────────────────────────┐
                    │       Evidence Fabric            │
                    │                                  │
  Orchestration ──▶ │  Claims ◄──▶ Sources             │
  Step Outputs      │    │                             │
                    │    ▼                             │
                    │  Sections ◄──▶ Traceability      │
                    │    │            Matrix            │
                    │    ▼                             │
                    │  Documents ──▶ Compliance Score   │
                    └─────────────────────────────────┘
                              │
                              ▼
                    Trust Rails (hash-chain audit)
```

---

## Core Concepts

### Evidence Graph

| Entity | Definition | Example |
|--------|-----------|---------|
| **Source** | Raw evidentiary document (CSR, protocol, literature) | Protocol v2.1.pdf |
| **Claim** | Atomic assertion extracted from a source | "Primary endpoint met (p < 0.001)" |
| **Section** | eCTD section or document fragment | Module 2.7.3 Summary of Clinical Efficacy |
| **Link** | Typed edge between claim and section | `supports`, `contradicts`, `references` |
| **Score** | Quantified traceability/compliance metric | 0.87 (87% of claims traced to sources) |

### Change Propagation

When a source document is updated:
1. **Detect** — identify which claims reference the changed source
2. **Assess** — score the impact (minor text change vs. endpoint change)
3. **Propagate** — flag downstream sections that reference affected claims
4. **Notify** — alert reviewers via orchestration step (human_approval gate)

---

## Planned Schema (Evidence Layer)

```sql
-- Schema: evidence (new)
evidence.sources          — ingested documents with content_hash
evidence.claims           — extracted claims with source_id FK
evidence.claim_links      — claim ↔ section edges (typed)
evidence.traceability_snapshots — point-in-time RTM snapshots
evidence.compliance_scores — per-section/document scores

-- Bridge to orchestration
-- Step outputs reference claim IDs
-- Document generation steps consume claim_links
```

### Key Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Hash-chained sources** | Every source version has `content_hash` (SHA-256) |
| **Immutable claims** | Claims are versioned, never mutated in-place |
| **Bidirectional links** | claim → section and section → claim are both queryable |
| **Incremental scoring** | Scores recompute only for affected subgraph, not entire submission |
| **Program-scoped RLS** | Same `app.current_program_id` pattern as orchestration |

---

## Planned Components

### Backend Services

| Service | Purpose | Location |
|---------|---------|----------|
| `ClaimExtractor` | AI-powered claim extraction from sources | `shadow_service/shadow_service/evidence/` |
| `TraceabilityEngine` | Link management + RTM generation | `shadow_service/shadow_service/evidence/` |
| `ComplianceScorer` | Section/document scoring logic | `shadow_service/shadow_service/evidence/` |
| `ChangePropagationService` | Detect + propagate source changes | `shadow_service/shadow_service/evidence/` |

### API Endpoints (Planned)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/evidence/sources` | Ingest a source document |
| `GET` | `/evidence/sources?program_id=` | List sources for a program |
| `POST` | `/evidence/claims/extract` | Extract claims from a source |
| `GET` | `/evidence/claims?source_id=` | List claims by source |
| `POST` | `/evidence/links` | Link a claim to a section |
| `GET` | `/evidence/rtm?program_id=` | Generate traceability matrix |
| `GET` | `/evidence/scores?program_id=` | Compliance scores by section |

### UI Components (Planned)

| Component | Purpose | Surface |
|-----------|---------|---------|
| Traceability View | Visual claim-to-section graph | Center Pane |
| RTM Table | Regulatory traceability matrix | Artifact Panel |
| Compliance Heatmap | Section-level scoring overlay | Right Panel |
| Change Impact Panel | Propagation alerts + review queue | Right Panel |

---

## Integration with Phase 4 (Orchestration)

### Step Type Mapping

| Orchestration Step | Evidence Action |
|--------------------|-----------------|
| `ingest_protocol` (task) | Creates `evidence.sources` row + triggers claim extraction |
| `extract_claims` (ai_review) | Populates `evidence.claims` from source |
| `ai_review_batch` (batch_job) | Reviews claims against truth store, creates `evidence.claim_links` |
| `generate_outline` (document_gen) | Consumes `evidence.claim_links` to build section structure |

### Workflow Context Flow

```
Step 1 output: { source_id: "...", page_count: 42 }
    ↓
Step 2 output: { claim_ids: ["...", "..."], claim_count: 15 }
    ↓
Step 3 output: { batch_id: "...", review_summary: {...} }
    ↓
Step 4 output: { document_id: "...", sections: [...] }
```

---

## Dependencies

### Upstream (Required)
- Phase 4 Orchestration Kernel (workflow execution) ✅
- `truth.clinical_truth_store` (shadow_service existing table)
- `prose.smart_fragments` (shadow_service existing table)

### Downstream (Enables)
- Phase 6: eCTD Co-Author (consumes traced claims for drafting)
- Phase 7: Mission Control (displays compliance scores on dashboard)
- Phase 10: Validation (RTMs are submission artifacts)

---

## Acceptance Criteria

- [ ] Every claim traces back to a source with `content_hash`
- [ ] Source update triggers change propagation to linked sections
- [ ] RTM can be exported as CSV/PDF for regulatory submission
- [ ] Compliance scores update incrementally (< 1s for single claim change)
- [ ] All evidence entities scoped by `program_id` with RLS
- [ ] Append-only audit for link creation/deletion
