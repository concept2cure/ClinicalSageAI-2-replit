# Concept2Cure Roadmap Inventory v4.0
> **Canonical Source:** `docs/roadmap/CONCEPT2CURE_MASTER_ROADMAP.md`  
> **GA Target Date:** March 28, 2026  
> **Current Sprint:** Phase 4.1 (Proof System — Enterprise Completion Gate)  
> **Status:** Phase 3: **Complete** | Phase 4: **In Progress**



## 🚦 Phase Status Dashboard

| Phase | Component | Status | Quality Gate | Blockers |
|-------|-----------|--------|--------------|----------|
| 0 | Environment | ✅ Complete | Passed | - |
| 1 | Database + RLS | ✅ Complete | Passed | - |
| 2 | Projects UX | ⚠️ Remediation | Failed A11y | Missing 508 compliance |
| 3 | Predictive AI | ✅ Complete | Passed | - |
| 3.5 | Multi-Agent | ✅ Complete | Passed | - |
| **4** | **Workflow Engine** | **🔄 In Progress** | **Pending** | **A11y, Testing, Security** |
| 5 | Intelligent Docs | ⏳ Blocked | - | Phase 4 completion |
| 6 | eCTD Export | ⏳ Blocked | - | Phase 4 completion |
| 7 | Mission Control | ⏳ Blocked | - | Phase 4 completion |
| 8 | HAQ Manager | ⏳ Blocked | - | Phase 4 completion |
| 9 | Data Ingestion | ⏳ Blocked | - | Vendor APIs |
| 10 | Validation | ⏳ Blocked | - | All prior phases |
| 11 | Marketplace | 🔮 Future | - | Post-GA |

## 🎯 Current Sprint Goals (Weeks 6-8)

### Week 6: Security & Performance
- [ ] Implement API rate limiting (Redis-backed)
- [ ] Add database indexes for workflow queries
- [ ] Integrate DOMPurify XSS protection
- [ ] Implement connection pooling

### Phase 4.1 Enhancement: Proof System (Weeks 6-9)
- [ ] Formal Compliance Graph compiler (DAG + invariants)
- [ ] Zero-Knowledge authorization proofs (privacy-preserving)
- [ ] Delta Verification Engine (compliance drift detection)
- [ ] Compliance Certificate generator (SNARK-ready proof object)
- [ ] Proof Explorer UI for certificate visualization

#### Phase 4.1 Completion Gate (Enterprise Grade, Audited)
**Rule:** Phase 4.2 is blocked until all Phase 4.1 acceptance criteria pass.

**Component Acceptance Criteria (must pass):**
- **Formal Compliance Graph**: deterministic DAG compilation, invariants validated, cycle detection, stable hashes; negative tests for malformed/partial workflows.
- **ZK Authorization Proofs**: role-scoped authorization statements, privacy-preserving public signals, failure on missing/invalid signatures, deterministic verification.
- **Delta Verification Engine**: baseline snapshot hashing, drift detection on workflow/state changes, explicit diff report, false-positive rate <1% in regression suite.
- **Compliance Certificate Generator**: immutable certificate schema, cryptographic binding to workflow run, reproducible proof bundle, verification round-trip succeeds.
- **Proof Explorer UI**: renders certificate + verification status, handles empty/error/loading, displays failure reasons, access controlled.

**Milestone Acceptance Criteria (must pass):**
- **M1 Graph Integrity**: DAG compiles from workflow definition, invariants + hashes validated, audit log entries created.
- **M2 Auth Proofs**: ZK auth proof emitted per approval/signature gate; negative tests for revoked/expired permissions.
- **M3 Drift Detection**: delta verification flags unauthorized step edits or data changes; audit trail includes diff summary.
- **M4 Certificate**: certificate generated on workflow completion; verification endpoint validates and times within SLA.
- **M5 UI + Ops**: Proof Explorer + dashboard entry points show verification; redacted logs; performance budgets met.

### Week 7: Accessibility & UI Polish (🔴 CRITICAL)
- [ ] WCAG 2.1 AA audit remediation
- [ ] Keyboard navigation for WorkflowTimeline
- [ ] Screen reader testing (NVDA, JAWS, VoiceOver)
- [ ] Color contrast validation (4.5:1 minimum)

### Week 8: Testing & Validation
- [ ] Playwright E2E suite (IND golden path)
- [ ] Unit test coverage >90% (workflow services)
- [ ] IQ/OQ/PQ documentation structure
- [ ] OpenTelemetry tracing implementation

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

| Role | Contact | Escalation |
|------|---------|------------|
| Engineering Lead | @lead-engineer | 24h |
| Compliance Officer | @compliance | 24h |
| Product Owner | @product | Business hours |
| Security Lead | @security | 24h |

---

*Last Updated: 2026-01-29 by Kimi Agent*  
*Next Review: Weekly Sprint Planning*
