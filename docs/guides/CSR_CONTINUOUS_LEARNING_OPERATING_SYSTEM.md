# CSR Continuous-Learning Operating System (Canada Expansion)

## Objective

This guide defines how we continuously ingest Canadian CSR evidence, harvest structured insights, and feed those insights into AnA intelligence without manual uploads.

## Current State (as of March 23, 2026)

We have a **working ingestion loop**, but not a fully closed-loop operating system yet.

### What exists now

1. **Acquisition layer**
   - Batch imports from Health Canada (with optional live-feed fetch fallback to synthetic generation).
2. **Harvest layer**
   - Structured CSR JSON emitted to `data/processed_csrs/`.
   - Intelligence atoms appended to `data/knowledge_structure/ana_csr_intelligence_atoms.jsonl`.
3. **Persistence layer**
   - `csr_reports` + `csr_details` tables capture normalized trial metadata.
4. **Orchestration layer**
   - Scheduler coordinates recurring import and enrichment tasks.

## Missing Layers to Reach a Full Operating System

A full learning OS needs all layers below to be operational and monitored:

1. **Source trust + provenance layer (missing/partial)**
   - Per-record provenance signatures, source snapshots, and reproducibility hash.
2. **Quality control layer (missing)**
   - Automated validation for schema drift, deduplication, outlier checks, and red-flag quarantine.
3. **Knowledge normalization layer (partial)**
   - Medical ontology mapping (MedDRA/SNOMED/ATC), canonical endpoint taxonomy.
4. **Reasoning-ready retrieval layer (partial)**
   - Embeddings + hybrid retrieval indexed directly from intelligence atoms.
5. **Feedback learning layer (missing)**
   - Capture AnA answer quality outcomes, clinician edits, and regulatory reviewer corrections.
6. **Governance + policy layer (partial)**
   - Data retention policies, region-specific handling, explainability traces for every generated insight.
7. **Observability + SLO layer (missing)**
   - Ingestion success SLOs, freshness SLOs, drift dashboards, and alerting.
8. **Value measurement layer (missing)**
   - KPIs linking newly ingested Canadian CSRs to protocol recommendation quality and decision speed.

## Minimum Next Steps

1. Add provenance hash + raw payload snapshot per imported trial.
2. Add QC scoring and reject low-confidence records before ingestion to intelligence atoms.
3. Build a nightly atom-to-vector indexing job and retrieval eval benchmark.
4. Capture AnA user feedback and close the loop into retraining/rule updates.

## Definition of Done for "Full OS"

We can claim full OS coverage when:

- Fresh Canadian CSR evidence is ingested automatically.
- Every record is provenance-backed and QC-scored.
- Intelligence atoms are retrievable with monitored quality.
- User/regulatory feedback drives measurable model and rule improvements.
- Reliability and value KPIs are visible on a production dashboard.
