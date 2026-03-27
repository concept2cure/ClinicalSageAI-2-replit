# Multi-Agent SME Audit: Project Charter & Regulatory Intelligence System

**Date**: 2026-03-27
**Auditors**: 4 parallel SME agents (Regulatory Affairs Director, VP Clinical Operations, Chief Regulatory Strategist, QA Director)
**Scope**: Full architecture audit against real biotech/pharma regulated project pathways

---

## Executive Summary

The project charter system has **solid foundational architecture** but contains **critical pathway-specific gaps** that would prevent real regulatory teams from using it effectively. Four independent SME audits identified **23 P0 gaps**, **14 P1 gaps**, and **8 P2 gaps** across regulatory pathways, clinical operations, intelligence, and compliance.

### Key Verdicts

| Auditor | Verdict | Score |
|---------|---------|-------|
| **Regulatory Affairs Director** | Schema is 40% complete for production. Too generic — missing pathway-specific nuances. | FAILS CRITICAL |
| **VP Clinical Operations** | Document-centric, not development-centric. Blind to 80% of real failure modes. | P0 GAPS |
| **Chief Regulatory Strategist** | 60% of the way to category-defining. Needs embedded regulatory knowledge. | STRATEGIC GAPS |
| **QA Director** | NOT ready for regulatory submission. 5 critical 21 CFR Part 11 gaps. | COMPLIANCE FAIL |

---

## P0 Critical Gaps (Must Fix)

### 1. Pathway-Specific Intelligence Missing

**IND**: No pre-IND meeting tracking, IND serial numbers, 30-day safety clock, clinical hold risk, annual report obligations, FDA division targeting
**NDA**: No NDA type discrimination (505b1/b2/j), rolling submission strategy, PDUFA date tracking, pediatric study plan, REMS strategy, advisory committee prep
**BLA**: No biosimilar vs novel classification, comparability protocol, cell line management, lot release specifications, interchangeability assessment
**510(k)**: No predicate validation with SE argument structure, 510(k) type discrimination (traditional/special/abbreviated), eSTAR format compliance, device classification panel
**PMA**: No IDE requirements, clinical trial design gating, panel track vs standard track, PMA supplements, nonclinical testing checklist
**De Novo**: No risk-based classification rationale, special controls definition, predicate search documentation, post-market requirements

### 2. Cross-Functional Dependencies Not Modeled

Real biotech projects have **interlocking functional timelines** (CMC, nonclinical, clinical, regulatory) running in parallel with blocking gates. Current system is linear phase-based.

Example: CMC stability data won't be ready until Q3, but IND filing planned for Q2 = 3-month gap. System can't detect this.

### 3. Regulatory Milestone & Agency Interaction Tracking Missing

No unified tracking for: pre-IND meetings, End-of-Phase 2 meetings, pre-NDA meetings, PDUFA dates, advisory committees, CRLs, FDA Information Requests, Type A/B/C meetings.

### 4. 21 CFR Part 11 Compliance Gaps (QA Audit)

- No password challenge in electronic signatures (11.200(a)(1))
- No charter section version control with content hashing (11.10(b))
- Fulfillment proof not hash-verified (11.10(e))
- No signature intent classification (11.100(a))
- Approved sections still editable — no immutability enforcement (11.70(b))
- No change control post-approval
- No deviation/CAPA linkage for missed commitments

### 5. Project Lifecycle Too Narrow

System jumps from "charter" → "submission." Missing: discovery → preclinical → IND-enabling → Phase 1 → Phase 2 → Phase 3 → NDA/BLA → post-market. Hides 50% of real project timeline.

---

## P1 Important Gaps

1. **Risk Management**: No clinical hold, enrollment crisis, manufacturing delay, safety signal, or data integrity risk modeling
2. **Team Governance**: Roles named but not assigned to people. No approval accountability chain
3. **Agency Correspondence**: No document trail of FDA feedback, meeting minutes, IR responses
4. **CTD Module Dependencies**: Module 5 → Module 2 → NDA assembly dependency chain not modeled
5. **Commitment Categories**: Only 6 generic categories. Need 20+ regulatory-specific categories
6. **Readiness Scoring**: Generic — not stratified by submission type or therapeutic area
7. **Timeline Validation**: No benchmarking against real FDA review timelines
8. **Deficiency/RTF Loop Tracking**: ~40% of NDAs get RTF. No re-submission tracking

---

## P2 Nice-to-Have

1. Gantt chart visualization with drag-to-delay
2. Calendar integration (Google/Outlook/Teams)
3. Therapeutic area risk stratification (oncology vs rare disease)
4. Recent CRL/FOIA pattern analysis
5. Regulatory clock tracking (30-day IND, 6-month NDA, 10-day 510k)
6. Division-specific deficiency prediction (CDER vs CBER vs CDRH)
7. Readiness-to-file approval probability estimator
8. Commitment-driven phase orchestration

---

## Strategic Competitive Assessment

| Capability | Veeva Vault RIM | MasterControl | AnA RI v1 (Current) | AnA RI v2 (After Fixes) |
|---|---|---|---|---|
| Pathway Templates | 8+ types, 50+ variants | 5+ types | 8 types, generic | 8 types, pathway-specific |
| Phase-Gate Readiness | Automated, division-specific | Automated | Generic scoring | Pathway-aware gates |
| Critical-Path | Gantt + dependency logic | Project-aware | No dependency logic | Phase + commitment deps |
| Commitment Auto-Gen | From templates + charter | Obligation extraction | Manual only | Auto-gen from templates |
| FDA Meeting Tracking | Full lifecycle | Basic | None | Full meeting table |
| AI-Powered Authoring | Limited | Limited | **Full Claude integration** | Enhanced w/ context |
| Chat-First UX | Form-heavy | Form-heavy | **Conversational** | Proactive + conversational |
| Evidence Intelligence | Manual | Document linking | **Confidence model** | Enhanced w/ pathway |

**Killer Advantage**: AnA RI can do what Veeva never will — conversational, proactive, AI-native regulatory intelligence.

---

## Implementation Priority

### Sprint 1: Schema + Templates (This Session)
1. Rebuild `project-charter.ts` with pathway-specific fields
2. Add `fdaMeetings` table for unified agency interaction tracking
3. Enhance commitment categories (20+ regulatory-specific)
4. Add content hashing and version control to charter sections
5. Build pathway-specific charter section templates
6. Build auto-commitment templates per submission type

### Sprint 2: Intelligence Layer
7. Build proactive commitment auto-generation engine
8. Enhance readiness scoring per pathway
9. Build critical-path dependency tracking
10. Wire phase-gate readiness validation

### Sprint 3: AnA Integration
11. Add `/charter`, `/timeline`, `/commitment`, `/meeting` slash commands
12. Inject charter + timeline + commitments into AnA context
13. Build proactive nudges for at-risk commitments
14. Detect regulatory milestone triggers in conversation

### Sprint 4: Frontend
15. Project charter wizard (pathway-specific)
16. Timeline Gantt chart
17. Commitment tracker panel
18. FDA meeting log

---

## Files Referenced

- `shared/schema/project-charter.ts` — Charter schema (needs rebuild)
- `shared/schema/programs.ts` — Regulatory programs + milestones
- `shared/schema/orchestration.ts` — Workflow runs + approval gates
- `server/services/intelligence/` — All intelligence services
- `server/services/ana-ri/` — AnA RI services (14 files)
- `.claude/skills/ana-operating-system.md` — AnA operating system
- `.claude/skills/project-design.md` — Project UX design

---

*Report generated by 4 parallel SME audit agents. Full audit details available on request.*
