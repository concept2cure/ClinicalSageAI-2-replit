# Phase 4 Roadmap — Orchestration Kernel & Beyond

_Last updated: 2026-02-05_

## 📍 Navigation

This directory contains the **active implementation roadmap** for Concept2Cure's backend-first architecture.

### Core Documents

| Document | Purpose |
|----------|---------|
| **[ROADMAP.md](./ROADMAP.md)** | Master roadmap (backend-first, layers-intelligence-orchestration) |
| **[PHASE4_ORCHESTRATION_KERNEL.md](./PHASE4_ORCHESTRATION_KERNEL.md)** | Project orchestration spine (workflows, state machine, job runner) |
| **[EVIDENCE_FABRIC.md](./EVIDENCE_FABRIC.md)** | Provenance + trust layer (citations, chain-of-custody, shadow review) |
| **[DOCX_FACTORY.md](./DOCX_FACTORY.md)** | Document assembly system (templates, manifest, redline/diff) |
| **[NEXT_AGENT_INSTRUCTIONS.md](./NEXT_AGENT_INSTRUCTIONS.md)** | Immediate work packet (branching discipline, PR sequence) |

---

## 🎯 Current Phase: **Phase 4 — Orchestration Kernel**

**Status:** Ready for implementation  
**Foundation:** A8 async batch system (complete)  
**Next:** Domain spine + work graph + job runner

### Implementation Sequence

1. **PR 1:** Schema (clients/programs/projects + workflow tables)
2. **PR 2:** Kernel services + A8 bridge
3. **PR 3:** Seed workflow definition (end-to-end test)

---

## 📚 Relationship to Other Documentation

- **Previous unified roadmap** (`CONCEPT2CURE_UNIFIED_PROJECT_ROADMAP.md`) → archived for historical reference
- **Phase 4 roadmap** (this directory) → **active** implementation guide
- See [docs/PROJECT_DOCUMENTATION_INDEX.md](../PROJECT_DOCUMENTATION_INDEX.md) for complete documentation hierarchy

---

## 🤖 For AI Development Agents

When implementing features:
1. Read the relevant spec file FIRST
2. Follow branching discipline in NEXT_AGENT_INSTRUCTIONS.md
3. Create small, reviewable PRs (one concern per PR)
4. Emit audit events and maintain idempotency
5. Integrate with A8 worker (do not create new queues)