# CERv2 — Medical Device & Diagnostics Roadmap

## Vision
Regulatory Workbench that turns evidence into defensible claims, standards coverage, outcomes substantiation, authored CER, and audit-ready eCTD exports.

## North Star + KPIs
- North Star: time from “Program created” → “Export-ready package”
- % claims fully substantiated (evidence + outcome + rationale + signoff)
- % standards covered (requirements with evidence artifacts)
- # preflight failures per export
- time-to-audit-response

## Current Status
- **A8 (HAQ Manager / Communication Hub): ✅ Complete**
- **Next Execution Lane: Phase 4 Kernel** (see below)

## Epics
0. Platform Hardening (security, audit, tenant isolation) ✅
1. Program Workbench + Evidence Objects ✅
2. Claims Matrix Generator ✅
3. Consensus Standards Navigator ✅
4. Outcomes Substantiation ✅
5. Co-Author (TipTap) + Citations + Section Readiness ✅
6. Preflight + Export + Regulatory Build Ledger ✅
7. UX Polish: Command Palette, Global Search, Activity Timeline ✅
8. HAQ Manager / Communication Hub ✅

## Phase 4 Kernel — Next Execution Lane

> The **Phase 4 Kernel** is the core orchestration and intelligence backbone
> that all downstream features (docs, export, mission control) depend on.
> It encompasses the workflow execution engine plus five new innovations.

### 4K-1 Evidence Fabric
Unified evidence graph that links claims → sources → outcomes across every
module. Every artifact version carries a content-hash and every link is
hash-verified so traceability is cryptographically provable.

### 4K-2 Policy-as-Code Quality Gates
Compliance rules expressed as executable policy files (OPA/Rego-style).
Quality gates are evaluated automatically at each workflow step transition;
a step cannot advance until all policy assertions pass.

### 4K-3 Step DSL + Tool Registry
A declarative Step DSL (YAML/JSON) that defines workflow steps, their
preconditions, effects, and the tools (AI agents, validators, exporters)
they invoke. The Tool Registry catalogues every available tool with version,
capability, and audit metadata.

### 4K-4 Semantic Cache
LLM-aware caching layer that deduplicates semantically equivalent queries
(embedding similarity > threshold). Reduces API spend by 40-60 % and
drops p95 response time below 1 s for repeat/near-repeat prompts.

### 4K-5 DOCX Workflow-Native Artifact Generation
DOCX becomes a first-class workflow artifact:
- **Diff / Redline**: automatic tracked-changes comparison between
  artifact versions.
- **Manifest Hashing**: every generated DOCX includes an embedded
  SHA-256 manifest binding content, metadata, and signatures into a
  single verifiable hash — the same hash recorded in the audit trail
  and export release ledger.

## Definition of Done (global)
- Backed by schema + migrations
- API validated and tenant-scoped
- Audit logged
- UI has empty/error/loading states
- Tests added
- Export artifacts deterministic
