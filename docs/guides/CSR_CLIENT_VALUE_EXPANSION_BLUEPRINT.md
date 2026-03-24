# CSR Client Value Expansion Blueprint

## Goal

Translate CSR ingestion capability into tangible client value: faster protocol planning, better evidence-backed decisions, and measurable ROI.

## 1) Productized Outcomes (What clients pay for)

1. **Protocol Benchmark Packs**
   - For each indication + phase, auto-generate benchmark distributions (sample size, duration, endpoint patterns, dropout risk).
2. **Regulatory Confidence Briefs**
   - Summarize Canada-relevant precedent evidence with source traceability and confidence scoring.
3. **Submission Readiness Early-Warnings**
   - Flag likely weaknesses before dossier assembly (insufficient endpoint support, weak comparator history).
4. **Portfolio Signal Dashboards**
   - Show sponsor-specific and indication-specific trend intelligence over time.

## 2) Data-to-Value Pipeline Layers

1. **Acquisition**: ingest direct PDF CSRs + metadata.
2. **Harvest**: atomize evidence sections and metadata.
3. **Normalization**: map indications/endpoints to controlled vocabularies.
4. **Reasoning**: retrieval + scoring + recommendation generation.
5. **Delivery**: client-facing metrics and explainable outputs.
6. **Feedback**: capture edits/outcomes to improve next recommendations.

## 3) Client-Facing KPIs

- **Freshness KPI**: median days since last harvested CSR.
- **Coverage KPI**: # indications with >= N CSR exemplars.
- **Confidence KPI**: % recommendations with >=2 supporting precedents.
- **Impact KPI**: reduction in protocol revision cycles.
- **Speed KPI**: time from question to evidence-backed brief.

## 4) 90-Day Expansion Plan

### Days 1-30
- Increase Canada direct-PDF manifest coverage.
- Enforce strict provenance and PDF validation in ingestion.
- Start publishing weekly client-value metrics snapshots.

### Days 31-60
- Add endpoint and indication ontology normalization.
- Release “Protocol Benchmark Pack v1” for top therapeutic areas.
- Add quality scoring to intelligence atoms.

### Days 61-90
- Launch “Regulatory Confidence Briefs” in client workspace.
- Add human feedback capture loop (accept/reject/edit reasons).
- Measure business impact with before-vs-after cycle-time tracking.

## 5) Definition of Higher Value

You will know this expansion is working when clients can answer:

- "What worked in comparable Canadian studies?"
- "What is the fastest defensible protocol design path?"
- "Where is our submission most likely to be challenged, and why?"

...with linked evidence, confidence levels, and actionable next steps in minutes rather than weeks.


## 6) Hardening Checklist (Before Client Rollout)

- Validate manifest URLs are direct PDFs (`--strict-pdf-only`) in preflight checks.
- Block publication if diagnostics score < 70.
- Require atom evidence text minimum length and provenance hash presence.
- Add weekly automated test run for ingestion + metrics + brief generation.
- Add on-call alert when freshness score drops below 70 for two consecutive runs.
