# Biopharma submission-pathways assurance + BLA 351(a) crown-jewel backend

Date: 2026-06-04 · Branch: `concept2cure-v2`

This report answers two questions, grounded in a full study of the live code
(not the stale `design-system/` mirror):

1. Do the four submission-pathway workstreams — NDA · 505(b), BLA · 351(a),
   MAA · EU centralized, JNDA · Japan — have their regulatory intelligence,
   templates, and side-AnA support **fully defined**?
2. Is the BLA · 351(a) "crown jewel" (analytical similarity, comparability,
   immunogenicity) **robust on the back end**?

---

## 1. Assurance — where the four pathways actually stand

**Nav + API: all four are first-class.** `client/src/concept2cure/biopharma/data/nav.ts`
defines `nda`, `bla`, `maa`, `jnda` (plus `precedent`), and
`server/routes/biopharma/programs.ts` recognizes all four program types
(`BIOPHARMA_TYPES = ['IND','NDA','BLA','MAA','JNDA','DE_NOVO']`). The shared
`Pathway.tsx` surface renders all four. So the workstreams exist — but that is
the shallowest layer.

**Depth is uneven (1 = thin … 5 = production):**

| Dimension | NDA 505(b) | BLA 351(a) | MAA EU | JNDA Japan |
|---|---|---|---|---|
| Nav + API type | 5 | 5 | 5 | 5 |
| Submission pyramid (task tree) | 5 | 5 | 5 | **was 1 → now 5** |
| Regulatory intelligence (CRL/RTF/risk) | ~4 | 2 (reuses NDA wholesale) | 2 (Day 120/180 only) | 1 |
| Templates / rule-pack outlines | 4 | 3 (no biologics-specific outline) | 3 (reuses CTA) | 1 (CTN only) |
| Side-AnA capabilities | 4 | **was 2 → now 4** | 3 | 2 |
| **BLA science engines** | n/a | **was 1 → now 4** | — | — |

**Two concrete defects found (both now addressed):**

- **JNDA was orphaned.** `services/regulatory/SubmissionPyramidEngine.ts` handled
  510K/IND/NDA/BLA/PMA/MAA/DE_NOVO and **threw on `JNDA`**, while a usable
  `PMDA_SHONIN` pyramid sat unused in `globalPyramids.ts`. A Japan program had a
  nav item, an API type, and AnA suggestion pills — but no task scaffold.
- **The BLA crown jewel was labels, not computation.** `biologics-intelligence-service.ts`
  is a good *knowledge* service (it knows 351(a) vs 351(k), modality
  considerations, biosimilar requirement checklists, what studies to run) but
  returns **guidance strings only**. There was no engine that ingests measured
  attribute data and *computes/defends* a similarity, comparability, or
  immunogenicity conclusion; `cmc_comparability_assessments` is a narrative-only
  CRUD table; immunogenicity had no data model at all.

The regulatory-intelligence and template layers remain NDA/FDA-heavy; MAA is
partial and JNDA thin (see the roadmap in §4). The crown jewel was the priority
and is built; the rest is sequenced below.

---

## 2. What shipped this pass (backend only — no UI)

The biotech crown jewel is now real computation, not strings.

### Engines (`server/services/biologics/`, pure + deterministic)
- **`statistics.ts`** — dependency-free biostatistics: descriptive stats,
  normal CDF/quantile (Acklam), Student-t CDF (regularized incomplete beta) and
  quantile (bracketed Newton), Welch two-sample CI, TOST equivalence, quality
  ranges, Wilson and Newcombe proportion intervals.
- **`analytical-similarity.ts`** — FDA tiered framework: Tier 1 equivalence
  (EAC = ±1.5·σ_R, 90% CI), Tier 2 quality range (mean_R ± k·σ_R, % within),
  Tier 3 min–max; per-CQA verdicts + overall conclusion.
- **`comparability.ts`** — ICH Q5E pre/post-change: per-attribute verdict,
  standardized shift (in σ), high-criticality equivalence, overall conclusion
  and a bridging recommendation (analytical-sufficient vs non-clinical/clinical).
- **`immunogenicity.ts`** — tiered ADA/NAb incidence with Wilson CIs, comparative
  between-arm difference (Newcombe), and an FDA risk-based tier
  (likelihood × consequence) with rationale.
- **`regulatory-risk.ts`** — biologics-specific BLA filing-risk engine. Maps
  CMC/clinical readiness signals plus the conclusions of the three engines above
  onto RTF/CRL failure modes (21 CFR 601.2; ICH Q5A/Q5E/Q6B/Q1A; FDA
  immunogenicity & process-validation guidance), with cited per-finding triggers,
  mitigations, and RTF/CRL risk bands. This is the layer that stops BLA from
  reusing the small-molecule NDA risk model wholesale.

### Persistence + API (`server/routes/biopharma/bla-workbench.ts`, `/api/biopharma/bla/*`)
- `POST /analytical-similarity`, `POST /comparability`, `POST /immunogenicity`,
  `POST /filing-risk` (compute, optionally persist when a `programId` is supplied).
- `GET /assessments`, `GET /assessments/:id`.
- `POST /assessments/:id/sign` — governed 21 CFR Part 11 sign-off writing the
  SHA-256-chained `audit_logs` + `c2c_ana_actions` ledger via the shared
  `recordGovernedAction` primitive, in one transaction.
- Migration `migrations/20260604_bla_workbench.sql` — `c2c_bla_assessments`
  (org- + program-scoped, FK to `regulatory_programs`, no FK to users,
  idempotent). Mounted in `register-inline-routes.ts`.

### AnA wiring (so the BLA suggestion pills actually run)
- Four model tools added to `ALL_ANA_TOOLS`: `assess_analytical_similarity`,
  `assess_comparability`, `assess_immunogenicity`, `assess_bla_filing_risk`, with
  executor handlers in `AnaToolExecutor.ts` that call the engines and report
  numbers/verdicts verbatim.

### JNDA orphan closed
- `services/regulatory/pyramids/jnda-pyramid.ts` — PMDA Shōnin, biologic-aware
  (pre-application consultation, ICH E5 bridging/ethnic factor, J-CTD Module 1
  添付文書, J-GCP/GPSP, J-RMP, foreign-manufacturer accreditation). Wired into
  `getPyramidForProject` with `JNDA` added to `SubmissionType`.

### Tests
- `tests/services/biologics/*` (statistics + three engines) and JNDA added to
  the pyramid suite — **40 tests, all green** against table values and
  hand-computable cases.

---

## 2b. Multi-region build+submit and the SOP generator

**Multi-region (FDA/EMA/PMDA) submit + build was already real** — confirmed by a
full sweep. `server/services/submission-gateways/regional-packager.ts` builds the
region-correct Module 1 backbone for each of the US/EU/JP; `ectd-regional-rules.ts`
carries the per-gateway validation profiles; `fda-esg.ts` / `ema-cesp.ts` /
`pmda-gateway.ts` transmit (AS2/SFTP + ACK 1/2/3; OAuth2 + EUDAMED; mTLS + HMAC),
and `shared/regulatory/global-document-registry.ts` maps 70+ filing types × 12
regions. The gap was a single resolver tying it together. Added:

- **`server/services/regulatory/submission-resolver.ts`** — given a filing
  (IND/NDA/BLA/MAA/JNDA) and product class, resolves the regional equivalent per
  region (a biologic marketing application → US BLA, EU MAA, JP JNDA), each with
  dossier standard, Module 1 path, validation profile, blueprints, and gateway;
  plus `submissionCoverageMatrix()` that asserts every core (filing × region)
  combination supports region-correct build and gateway submission.
- **`GET /api/biopharma/submissions/plan` and `/coverage`** + AnA tool
  `resolve_submission_plan` so AnA answers "can we build+submit this in the US,
  EU and Japan, and how."

**Client-side SOP generator inside AnA** — `server/services/sop-generator.ts`
produces a GxP-structured, region-aware (FDA/EMA/PMDA) Standard Operating
Procedure (Purpose, Scope, Responsibilities, Definitions, Procedure, Records,
References, Revision history, Approval) with real starter procedures for common
regulated processes (change control, CAPA, deviation, document control, eCTD
publishing, regulatory submission, pharmacovigilance, training, supplier
qualification, internal audit) and region-appropriate references. Exposed as the
AnA tool `generate_sop`.

---

## 3. Design alignment

UI is untouched per the design contract — these are the backend services and
data contracts the design's BLA workbench binds to. The engine outputs are
structured for direct surfacing (per-attribute rows, verdicts, CIs, overall
conclusion, recommendations), so the design can render them without reshaping.

---

## 4. Remaining roadmap (sequenced)

1. **BLA-specific regulatory intelligence** — delivered as the `regulatory-risk.ts`
   filing-risk engine (biologics RTF/CRL triggers feeding off the three science
   engines + readiness signals). Remaining: auto-populate its readiness/admin
   signals from live program data, and feed its output into the general
   precedent/risk model so BLA stops reusing the NDA model wholesale.
2. **JNDA templates + rule-pack outlines** — marketing-approval templates and
   `nda:pmda` / `bla:pmda` authoring outlines (today only CTN templates exist).
3. **MAA depth** — RMP gap rules and Type IA/IB/II variation classification.
4. **Persist-and-surface** — wire the design's BLA workbench to
   `/api/biopharma/bla/*` and the `c2c_bla_assessments` store when the kit ships.
