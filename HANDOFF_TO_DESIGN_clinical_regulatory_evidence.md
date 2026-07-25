# Handoff to Design — Clinical Regulatory Evidence

**Audience:** Claude Design (Phase 6 UX).
**Author:** backend (Phases 0–5 complete; Phase 7–8 in progress).
**Status of backend:** the evidence spine, CSR adapter, study-design evidence service, FDA CRL ingestion, the nine retrieval atom types, the five AnA tools, provenance registration and the §14 governance guards are built, tested (60 domain tests green) and on `claude/quality-assurance-module-tegqkr`. This document is the contract you build the UI against; it does **not** prescribe visual design.

> **One-line frame.** This is **not** a new product. It is FDA Complete Response Letter (CRL) intelligence woven into the *existing* CSR Intelligence, Study Design, AnA, precedent and retrieval surfaces. The UI should feel like those surfaces got smarter about "what has FDA objected to, and what does comparable evidence actually show" — never like a separate "CRL app."

---

## 0. The non-negotiable honesty rules (read first)

Every one of these is enforced in the backend; the UI must **present**, never **contradict** them. Violating them in the UI would misrepresent regulatory evidence to a sponsor.

1. **Precedent, never prediction.** No screen may say or imply "FDA will accept / approve," "N% approval probability," "this endpoint is FDA-approved (as a rule)," or "these completed trials were successful." The backend refuses to emit these (the §14 linter blocks them, and every atom is linted before it is stored). Show precedent and objections; let the user draw the conclusion.
2. **Absence of objection ≠ acceptance.** When there is no FDA finding on a topic, the copy is *"No FDA findings on record referencing X — absence of objection is not evidence of acceptance."* Do not render an empty objection list as a green "clear."
3. **Insufficient evidence is a first-class state.** Services frequently return `INSUFFICIENT` / `null` distributions / `unresolvedDataLimitations`. This is a **designed, honest** outcome, not an error or an empty state to hide. Give it a real, respectful treatment (see §7).
4. **No number without provenance.** Every metric carries a `MetricProvenance` envelope (numerator, denominator, missing count, inclusion criteria, filters, extraction method, verification status, date range). If you show the number, make its provenance reachable (tooltip/expander). Never show a bare percentage.
5. **No dose value, ever, from precedent.** The dose-strategy surface returns objections + a required-governing-calculation flag, never a recommended dose. Render the expert-review warning prominently.
6. **Design lessons are only shown when human-approved.** The backend never surfaces an unreviewed or rejected lesson. A lesson badge should convey it passed human review.

---

## 1. The four Phase-6 surfaces (from the plan)

These are the four UX targets. Each is a **view over the shared spine**, not a new data store.

| Surface | What it renders | Backend it consumes |
|---|---|---|
| **CSR Intelligence — regulatory-outcome dimension** | On an existing CSR/study, add "what FDA said" — the regulatory findings, requested actions, and the application outcome linked to this study. | `search_clinical_regulatory_evidence` (findings/outcomes), `trace_design_recommendation`, spine reads |
| **Study Design — evidence panel** | Beside the design builder: comparable design distributions, observed effects (with uncertainty), FDA objections to similar features, sample-size / dose / stress guidance. | `compare_proposed_design_to_precedent`, `explain_design_risk`, `stress_test_protocol`; services `benchmarkDesign`, `assessEndpointRegulatoryRisk`, `assessSampleSizeEvidence`, `assessDoseStrategy`, `simulateDesignWithRegulatoryStress` |
| **FDA CRL Library** | Browse/search the shared FDA CRL corpus: applications, findings by domain/discipline, requested actions, ICH-E3/CTD mapping, source page/excerpt. | spine reads over `cre_evidence_sources` (type `fda_crl`) + `cre_regulatory_findings` + `cre_regulatory_outcomes` |
| **Traceability view** | For any recommendation/claim, the evidence chain: proposed feature → comparable CSR endpoints → observed effects → FDA objections, each step inspectable with its source. | `trace_design_recommendation` |

**Phase 6 is yours; the backend for all four is done.** Predictions (Phase 7) are deliberately **not** surfaced through these yet — see §8.

---

## 2. The data model (what a record looks like)

All shapes are camelCase (the service adapters map from snake_case columns). TypeScript source of truth: `server/services/clinical-regulatory-evidence/types.ts`.

### 2.1 Visibility / tenancy (drives what a tenant may see)
- `organizationId: number | null` — **`null` = GLOBAL_PUBLIC** (the shared FDA CRL corpus, visible to every tenant); a concrete id = tenant-private.
- `visibilityClass: 'global_public' | 'tenant_private' | 'project_private'`.
- The UI should visually distinguish **shared FDA public record** from **this client's private evidence** (e.g. a "Public FDA record" chip vs a tenant chip). A tenant sees *both* their own and global-public; they must never see another tenant's private evidence.

### 2.2 EvidenceSource (a document/record of origin)
Key fields: `sourceType` (`csr | protocol | sap | fda_crl | fda_review_memo | fda_approval_package | trial_registry | publication | client_document`), `agency`, `applicationNumber`, `applicationType`, `product`, `indication`, `phase`, `sponsor`, `documentDate`, `officialUrl`, `linkedCsrReportId`, `linkedPrecedentId`, `ingestionStatus`, `extractionStatus`.

### 2.3 RegulatoryFinding (an FDA deficiency — the core CRL unit)
`findingDomain` (`clinical | cmc | nonclinical | biostatistics | clinical_pharmacology | labeling | safety | facility | other`), `findingCategory`, `fdaReviewDiscipline`, `findingText`, `normalizedSummary`, **`requestedAction`** (what FDA asked for), `severity`, `affectedCtdSection`, `affectedIchE3Section`, `affectedStudyDesignFeature`, `sourcePage`, `sourceExcerpt`, `explicitOrInferred` (`explicit | inferred`), `extractionConfidence` (0–1), `verificationStatus` (`unverified | verified | disputed`), `relatedStudyIds`.
- **UI:** show `normalizedSummary` as the headline, `findingText`/`sourceExcerpt` on expand, and always the `requestedAction`. Badge `explicitOrInferred` (an *inferred* finding is weaker evidence than an *explicit* one). Surface `sourcePage`/`affectedIchE3Section` as the citation.

### 2.4 RegulatoryOutcome (a record, not a verdict)
`outcomeType` (`application_submitted | refuse_to_file | information_request | major_amendment | crl | resubmission | approval | withdrawal | discontinuation | unresolved`), `outcomeDate`, `approvalDate`, `timeToResolutionDays`, `evidenceNote`, `verificationStatus`.
- **UI:** this is a factual timeline entry. Never phrase it as a probability. `crl` and `approval` are historical facts about *that* application.

### 2.5 DesignLesson (governed, human-approved guidance)
`lessonStatement`, `applicablePopulation`, `applicablePhase`, `modality`, `endpointType`, `supportingSourceIds[]`, `contradictingSourceIds[]`, `minimumEvidenceCount`, `evidenceQualityScore`, `humanReviewStatus` (`pending | approved | rejected`), `derivationMethod`, `modelVersion`.
- **UI:** only `approved` lessons reach you. Always show supporting **and** contradicting counts together; a lesson with contradicting precedent must display that tension, not hide it.

### 2.6 EvidenceRelationship (the traceability edges)
`fromEntityType/Id → toEntityType/Id`, `relationshipType` (e.g. `describes_study`, `reports_result`, `reviewed_in_application`, `deficiency_applies_to_study`, `requests_additional_study`, `resolved_by_evidence`, `potentially_related`), `isInferred`, `confidence`. `potentially_related` is always inferred and carries a confidence — render it as a soft/dashed link, visually weaker than an asserted edge.

---

## 3. Analytical result contracts (the Study-Design evidence panel)

Source of truth: `server/services/clinical-regulatory-evidence/study-design-evidence.service.ts`. These are what the panel renders.

- **`BenchmarkResult`** (`compare_proposed_design_to_precedent`): `numberOfStudies`, `numberWithUsableResults`, `designDistributions` *(`null` below the 5-study threshold — render "not enough comparable studies")*, `effectDistribution: {mean, sd, n} | null` *(`null` below 3 usable effects)*, `commonEndpoints`, `regulatoryFindings[]`, **`unresolvedDataLimitations[]`** *(always show these)*, `provenance`, `note`. **Never render a distribution when its field is `null`** — show the limitation instead.
- **`EndpointRiskResult`** (`explain_design_risk`): `supportingPrecedent[]`, `negativePrecedent[]` (CRL objections), `importantDifferences[]`, `unansweredQuestions[]`, `evidenceQuality` (`insufficient | limited | moderate | substantial`), `citations[]`, `note`. Present supportive and adverse precedent side by side; lead with `evidenceQuality`.
- **`SampleSizeEvidenceResult`**: `regulatoryConcerns[]`, `effectEvidence{observations,withStructuredEffect,scanned}`, `safetyDatabaseNote` (ICH E1 reminder in Phase 3), `guidance`, `provenance`. The **power number is computed elsewhere** from the client's assumptions — this surface supplies evidence + guidance, not a number.
- **`DoseStrategyResult`**: `regulatoryObjections[]`, `requiresGoverningCalculation: true`, **`expertReviewWarning`**, `guidance`, `citations[]`. Render as objections + a hard "needs a governing exposure–response calc + expert review" gate. **No dose value exists in this payload by design.**
- **`RegulatoryStressPlan`** (`stress_test_protocol`): `scenarios[]` each `{key, rationale, drivenBy: sourceIds[]}` + `simulatorHandoff` text. The scenarios are *which* stress tests are defensible (driven by FDA findings); the *magnitudes* and the run happen on the existing study-design simulator. Show each scenario with its driving FDA finding(s).

---

## 4. AnA-first actions (the five tools)

The product is AnA-first: the primary path is the user asking AnA, which calls these tools. The surfaces above are the *rendered* forms of the same data. Tool names + inputs (source: `server/services/ana/AnaToolDefinitions.ts`):

1. **`search_clinical_regulatory_evidence`** — `{indication?, phase?, query?, entity_types?: ['studies'|'findings'|'outcomes'|'lessons'], limit?}` → the spine search. The FDA CRL Library and CSR regulatory-outcome dimension are views over this.
2. **`compare_proposed_design_to_precedent`** — `{indication*, phase?, endpoint?, design_type?, modality?, population?, comparator?}` → `BenchmarkResult`.
3. **`explain_design_risk`** — `{feature*, indication?, phase?}` → `EndpointRiskResult`.
4. **`stress_test_protocol`** — `{indication*, phase?, endpoint?}` → `RegulatoryStressPlan`.
5. **`trace_design_recommendation`** — `{entity_type*: source|study|finding|outcome|design_lesson, entity_id*}` → the evidence chain for the traceability view.

**UI implication:** each surface should offer an "Ask AnA about this" affordance that maps to the matching tool, and conversely AnA's answers should deep-link into these surfaces. Same data, two doors.

---

## 5. Retrieval atoms (semantic discovery — mostly invisible plumbing)

The backend materializes nine `lower_snake_case` atom types into `lumen_data_atoms` (the corpus AnA already searches via `ragRouter`): `csr_design_feature`, `csr_result_observation`, `csr_safety_signal`, `csr_execution_limitation`, `fda_regulatory_finding`, `fda_requested_action`, `regulatory_outcome`, `design_lesson`, `contradictory_precedent`.
- **You don't render atoms directly.** They make CRE evidence *discoverable by meaning* inside AnA's normal retrieval, so an open-ended question surfaces regulatory evidence alongside everything else.
- Population is per-tenant and idempotent (`npm run cre:atoms -- --org <id>`, or incrementally as CSRs are adapted). If you show an evidence "coverage" indicator anywhere, it should reflect the spine records, not atom counts.

---

## 6. Provenance & citation display

Every surfaced item can be attributed through the unified provenance envelope (`server/services/evidence/provenance.ts`). Two CRE sources are registered:
- **`fda_crl`** — "FDA Complete Response Letter," authority `primary`, with the standing caveat *"a record of deficiencies at a point in time… precedent, not a prediction of any future decision."*
- **`clinical_regulatory_evidence`** — derived design lessons, authority `secondary`, caveat *"precedent-based guidance, not a prediction of acceptance."*

Render the caveat with the evidence; render the citation (`officialUrl`, `applicationNumber`, `sourcePage`, `affectedIchE3Section`) as the stable handle.

---

## 7. Empty / insufficient states (design these deliberately)

Because honesty is enforced, these states are common and important:
- **Insufficient evidence** → the literal backend string is *"Insufficient structured evidence to estimate this reliably."* Treat as a confident, neutral state with a "why" (the `unresolvedDataLimitations` / `note`), not a failure.
- **Below distribution threshold** (`designDistributions`/`effectDistribution` `null`) → show counts + "need ≥5 studies / ≥3 usable effects to report a distribution."
- **No objections found** → the absence-≠-acceptance line, never a green pass.
- **Inferred (not explicit) findings** → visually weaker; label them.

---

## 8. Boundaries — what is NOT in scope for these screens yet

- **Predictions/probabilities (Phase 7)** are being routed through the honest calibrated risk model and are **not** exposed through these surfaces. Do not add any "likelihood of approval" UI; if a number ever appears here it will come through a governed, calibrated path with its own display contract (a later handoff).
- **CRL document upload/ingestion UI** is not requested here; ingestion is a backend/ops path (`crl-ingestion.service`). These surfaces are read/analyze.
- **Editing FDA findings** — the shared FDA corpus is a public record; tenants annotate/link, they do not edit the global record.

---

## 9. Pointers

- Types: `server/services/clinical-regulatory-evidence/types.ts`
- Spine service (reads): `server/services/clinical-regulatory-evidence/evidence-spine.service.ts`
- Study-design evidence (panel contracts): `server/services/clinical-regulatory-evidence/study-design-evidence.service.ts`
- CSR adapter: `server/services/clinical-regulatory-evidence/csr-adapter.service.ts`
- CRL ingestion: `server/services/clinical-regulatory-evidence/crl-ingestion.service.ts`
- Retrieval atoms: `server/services/clinical-regulatory-evidence/retrieval-atoms.service.ts`
- Governance (honesty rules): `server/services/clinical-regulatory-evidence/governance.ts`
- AnA tools: `server/services/ana/AnaToolDefinitions.ts` (search for `search_clinical_regulatory_evidence`)
- Architecture map: `docs/architecture/CLINICAL_REGULATORY_EVIDENCE_DISCOVERY.md`

Questions on any contract → ask; the backend shapes are stable but I can extend a result payload if a surface needs a field it doesn't yet carry.
