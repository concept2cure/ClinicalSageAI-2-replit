# Concept2Cure Roadmap Inventory v5.0
> **Canonical Source:** `docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md`  
> **GA Target Date:** March 28, 2026  
> **Current Sprint:** Phase 4 Kernel (Next Execution Lane)  
> **Status:** Phase 3: **Complete** | Phase 4: **Complete** | A8: **Complete** | Phase 4 Kernel: **Active**



## 🚦 Phase Status Dashboard

| Phase | Component | Status | Quality Gate | Blockers |
|-------|-----------|--------|--------------|----------|
| 0 | Environment | ✅ Complete | Passed | - |
| 1 | Database + RLS | ✅ Complete | Passed | - |
| 2 | Projects UX | ✅ Complete | Passed | - |
| 3 | Predictive AI | ✅ Complete | Passed | - |
| 3.5 | Multi-Agent | ✅ Complete | Passed | - |
| 4 | Workflow Engine | ✅ Complete | Passed | - |
| 5 | Intelligent Docs | ✅ Complete | Passed | - |
| 6 | eCTD Export | ⏳ Blocked | - | Phase 4 Kernel |
| 7 | Mission Control | ⏳ Blocked | - | Phase 4 Kernel |
| **8** | **HAQ Manager** | **✅ Complete** | **Passed** | - |
| 9 | Data Ingestion | ⏳ Blocked | - | Vendor APIs |
| 10 | Validation | ⏳ Blocked | - | All prior phases |
| 11 | Marketplace | 🔮 Future | - | Post-GA |
| **4K** | **Phase 4 Kernel** | **🔄 In Progress** | **Pending** | - |

## 🎯 Phase 4 Kernel — Next Execution Lane

> The Phase 4 Kernel is the core orchestration and intelligence backbone.
> It encompasses five new innovations that every downstream phase depends on.

### 4K-1 Evidence Fabric
- [ ] Unified evidence graph (claims → sources → outcomes)
- [ ] Content-hash on every artifact version
- [ ] Hash-verified traceability links
- [ ] Evidence coverage dashboard

### 4K-2 Policy-as-Code Quality Gates
- [ ] Executable policy files (OPA/Rego-style)
- [ ] Auto-evaluation at workflow step transitions
- [ ] Gate enforcement (block advance on policy failure)
- [ ] Policy audit log

### 4K-3 Step DSL + Tool Registry
- [ ] Declarative Step DSL (YAML/JSON) for workflow definitions
- [ ] Tool Registry with version, capability, and audit metadata
- [ ] Tool invocation from step definitions (AI agents, validators, exporters)
- [ ] Step DSL schema validation

### 4K-4 Semantic Cache
- [ ] Embedding-similarity deduplication for LLM queries
- [ ] Configurable similarity threshold
- [ ] Cache hit/miss metrics dashboard
- [ ] 40-60 % API cost reduction target

### 4K-5 DOCX Workflow-Native Artifact Generation
- [ ] DOCX as first-class workflow artifact
- [ ] Diff / Redline: tracked-changes comparison between versions
- [ ] Manifest Hashing: embedded SHA-256 binding content + metadata + signatures
- [ ] Manifest hash recorded in audit trail and export release ledger

## ⚠️ Technical Debt Register

| Debt Item | Phase | Severity | Sprint | Owner |
|-----------|-------|----------|--------|-------|
| Missing aria-labels | 4.2 | 🔴 High | Week 7 | UI Team |
| Hardcoded LLM config | 3.5 | 🟠 Med | Week 6 | Backend |
| No DLQ for workflows | 4.1 | 🔴 High | Week 6 | Backend |
| Console.error in prod | 2 | 🟠 Med | Week 7 | UI Team |
| Missing query indexes | 1 | 🔴 High | Week 6 | DBA |
| No 508 compliance | 2 | 🔴 Critical | Week 7 | UI Team |

## 🏛️ Three Pillars Health

### Pillar 1: Trust Rails 🔐
- **Status:** ✅ Strong
- **Last Verified:** 2026-02-05
- **Enhancement:** Evidence Fabric + Manifest Hashing strengthen provenance

### Pillar 2: Workflow-as-Contract 📜
- **Status:** ✅ Strong (Phase 4 Kernel advancing)
- **Enhancement:** Step DSL + Policy-as-Code Quality Gates formalize contract enforcement

### Pillar 3: Submission-as-Asset 💎
- **Status:** 🔄 Strengthening
- **Enhancement:** DOCX as workflow-native artifact + Semantic Cache improve asset fidelity

## 🚨 GA Release Criteria (Must Pass)

- [ ] 0 Critical security vulnerabilities (Snyk/Dependabot)
- [ ] WCAG 2.1 AA compliance certificate
- [ ] E2E test coverage >80% (critical paths)
- [ ] Workflow engine load test: 1000 concurrent runs
- [ ] RLS penetration test: 0 tenant isolation failures
- [ ] Documentation: IQ/OQ/PQ complete
- [ ] Incident runbook tested (simulated outage)
- [ ] Accessibility audit report (third-party)
- [ ] Performance: Lighthouse >90 all categories
- [ ] Backup/Recovery tested (RPO <1 hour, RTO <4 hours)

## 📞 Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| Engineering Lead | @lead-engineer | 24h |
| Compliance Officer | @compliance | 24h |
| Product Owner | @product | Business hours |
| Security Lead | @security | 24h |

---

*Last Updated: 2026-02-05 by Copilot Agent*  
*Next Review: Weekly Sprint Planning*
