# Concept2Cure Roadmap Inventory v4.0

> **Canonical Source:** `docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md`
> **GA Target Date:** March 28, 2026
> **Current Sprint:** Phase 5 (Intelligent Document System)
> **Status:** Phase 3: **Complete** | Phase 4: **Complete**

## 🚦 Phase Status Dashboard

| Phase | Component           | Status          | Quality Gate | Blockers               |
| ----- | ------------------- | --------------- | ------------ | ---------------------- |
| 0     | Environment         | ✅ Complete     | Passed       | -                      |
| 1     | Database + RLS      | ✅ Complete     | Passed       | -                      |
| 2     | Projects UX         | ⚠️ Remediation  | Failed A11y  | Missing 508 compliance |
| 3     | Predictive AI       | ✅ Complete     | Passed       | -                      |
| 3.5   | Multi-Agent         | ✅ Complete     | Passed       | -                      |
| **4** | **Workflow Engine** | **✅ Complete** | **Passed**   | -                      |
| 5     | Intelligent Docs    | ⏳ Pending      | -            | -                      |
| 6     | eCTD Export         | ⏳ Blocked      | -            | Phase 5 completion     |
| 7     | Mission Control     | ⏳ Blocked      | -            | Phase 5 completion     |
| 8     | HAQ Manager         | ⏳ Blocked      | -            | Phase 5 completion     |
| 9     | Data Ingestion      | ⏳ Blocked      | -            | Vendor APIs            |
| 10    | Validation          | ⏳ Blocked      | -            | All prior phases       |
| 11    | Marketplace         | 🔮 Future       | -            | Post-GA                |

## 🎯 Current Sprint Goals (Phase 5 — Intelligent Document System)

### Phase 5 Objectives (Week 7)

- [ ] Unified doc editor (Tiptap) wired to artifacts
- [ ] Traceability linking UI for anchors/xrefs
- [ ] Change propagation engine for downstream artifacts
- [ ] Compliance rules engine for document checks

### Acceptance Criteria

- [ ] Artifact editor loads with version history and audit trail
- [ ] Traceability links render and resolve to evidence pointers
- [ ] Change propagation flags impacted sections deterministically
- [ ] Compliance rules produce findings with stable hashes

## ⚠️ Technical Debt Register

| Debt Item             | Phase | Severity    | Sprint | Owner   |
| --------------------- | ----- | ----------- | ------ | ------- |
| Missing aria-labels   | 4.2   | 🔴 High     | Week 7 | UI Team |
| Hardcoded LLM config  | 3.5   | 🟠 Med      | Week 6 | Backend |
| No DLQ for workflows  | 4.1   | 🔴 High     | Week 6 | Backend |
| Console.error in prod | 2     | 🟠 Med      | Week 7 | UI Team |
| Missing query indexes | 1     | 🔴 High     | Week 6 | DBA     |
| No 508 compliance     | 2     | 🔴 Critical | Week 7 | UI Team |

## 🏛️ Three Pillars Health

### Pillar 1: Trust Rails 🔐

- **Status:** ✅ Strong
- **Last Verified:** 2026-01-29
- **Gap:** Document watermarking for exports

### Pillar 2: Workflow-as-Contract 📜

- **Status:** 🔄 In Progress
- **Gap:** Dead Letter Queue, Circuit breakers

### Pillar 3: Submission-as-Asset 💎

- **Status:** ⚠️ Partial
- **Gap:** Asset state machine not enforced in UI (soft states only)

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

| Role               | Contact        | Escalation     |
| ------------------ | -------------- | -------------- |
| Engineering Lead   | @lead-engineer | 24h            |
| Compliance Officer | @compliance    | 24h            |
| Product Owner      | @product       | Business hours |
| Security Lead      | @security      | 24h            |

---

_Last Updated: 2026-02-04 by Copilot_
_Next Review: Weekly Sprint Planning_
