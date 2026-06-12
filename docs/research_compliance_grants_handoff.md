# Build & Handoff Report — Research Compliance + Sponsored Programs Suite


## ✅ DB verification — DONE (no longer deferred)

The governed backend was run and verified against a live Postgres 16:
- All domain migrations apply cleanly (DDL + CHECK constraints + FKs + indexes); a negative insert is rejected by the `chk_fcoi_form_matches_flag` constraint.
- **40/40 governed-path assertions pass** (`scripts/db-verify/verify-research-compliance.ts`): FCOI derive→certify→provenance→audit-hash-chain→c2c_ana_actions ledger→signature-invalidation; controlled-substances perpetual ledger rejects negative inventory; HA commitment threads 2 provenance links; IACUC approval stamps the 3-year expiration + Module 4 provenance; training gate ("no index until trained") blocks then clears; effort certification (certify + content hash + over-commit rejection); research-security COI (foreign-nexus flag + review); preclinical bridge (digested → governed registry + Module 4 provenance); Report-OS domain providers compute real numbers; deadline events flow to central `unified_tasks`.
- Reproducible via `scripts/db-verify/README.md`.

Remaining per-capability DB checks (RLS session-var enforcement, full report-run resolution) are listed under each capability below.

Living handoff for the roadmap (C2C-01 … C2C-15). Backend lands first (no UI per
directive); this report is what the follow-on session uses to build UI surfaces
and to run the deferred DB-backed verification. Updated as each capability lands.

## Roadmap & status

| ID | Capability | Tier | Status |
|----|-----------|------|--------|
| C2C-01 | Clinical Investigator Financial Disclosure (21 CFR 54) | 1 | **Backend complete** (this report) |
| C2C-02 | ALCOA+ Provenance Spine | 1 | **Seed landed** (`provenance_links` + service); full spine later |
| C2C-03 | HA Interaction & Commitment Mgmt | 1 | **Backend complete** |
| C2C-04 | Nonclinical Study Mgmt + SEND | 2 | **Backend complete** |
| C2C-05 | IACUC / Animal Study Governance | 2 | **Backend complete** |
| C2C-06 | IRB/IEC Submission & Amendment Mgmt | 2 | **Backend complete** |
| C2C-07 | IBC / Biosafety (Novel Modality) | 2 | **Backend complete** |
| C2C-08 | AI-native eTMF | 2 | **Backend complete** |
| C2C-09 | Device / IVD Technical Documentation | 2 | Pre-existing on trunk (CER/PER/IVDR/510k/DHF) — not rebuilt |
| C2C-10 | PV Intake + DSUR/PBRER | 3 | Planned |
| C2C-11 | Lifecycle Obligation Tracking | 3 | **Backend complete** |
| C2C-12 | RIM-lite Registration Grid + Labeling | 3 | **Backend complete** |
| C2C-13 | Inspection Readiness (BIMO/PAI) | 3 | Planned |
| C2C-14 | eGrants / Funder-Milestone Mgmt | 3 | **Backend complete** |
| C2C-15 | Controlled Substances Tracking (DEA) | 3 | **Backend complete** |

**Principle:** reuse central infra (governed-actions + audit, tasking, Projects,
Report-OS, `/api/metrics`, connectors, ingestion, reasoning-engine); every
mutation governed + audited; conversational (AnA) and manual entry share one
audited path; no fabrication (cited regulatory rule data).

---

## C2C-01 — Clinical Investigator Financial Disclosure (21 CFR 54)

### Data model (`shared/schema/financial-disclosures.ts`; migration `migrations/20260610_financial_disclosure_21cfr54.sql`)
- `clinical_investigators`, `financial_disclosures`, `disclosure_interests`, and the generic `provenance_links` (C2C-02 seed).
- Form FDA 3454 = certification of none; 3455 = disclosure. `form_type` is derived and DB-constrained to match `has_disclosable_interests`. Four 21 CFR 54.2 interest categories.

### API (`/api/financial-disclosures`, governed + org-scoped)
| Method | Path | Governed action | Notes |
|--------|------|-----------------|-------|
| POST | `/investigators` | `create` | |
| GET | `/investigators` | — | org-scoped list |
| POST | `/disclosures` | `create` | derives `form_type` |
| GET | `/disclosures?submissionId=` | — | list |
| GET | `/disclosures/:id` | — | disclosure + snapshot + deterministic validation |
| PATCH | `/disclosures/:id` | `update` | re-derives form_type; **invalidates signature** on edit |
| POST | `/disclosures/:id/interests` | `update` | add a 3455 interest |
| DELETE | `/disclosures/:id` | `delete` | soft delete |
| POST | `/disclosures/:id/certify` | `sign` | **re-auth required**; gate floor blocks high-risk; writes provenance link |
| POST | `/disclosures/:id/ai-review` | — | deterministic gate + gateway narration (fails safe to gate) |

Request bodies are zod-validated; mutations require `reason` (≥8 chars).

### AnA conversational tools (same governed/audited path, surface `ana`)
`create_clinical_investigator`, `create_financial_disclosure`, `add_disclosure_interest`, `review_financial_disclosure` (read-only gate). Certify is intentionally **not** an AnA tool — it needs re-auth in the panel.

### Deterministic core (`fcoi-logic.ts`, pure, tested)
`deriveFormType`, `validateDisclosureCompleteness` (cited 21 CFR 54 findings + risk level; the AI review is bounded by this floor), `computeDisclosureContentHash` (e-sign binding; post-sign edit invalidates).

### Central-module wiring
- **Reports:** report type `fcoi.disclosure_register` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/fcoi-metrics.ts` → `/api/metrics` (`fcoi_disclosures_created_total`, `fcoi_certifications_total`, `fcoi_signature_invalidations_total`, `fcoi_reviews_total`).
- **AI:** gateway prompt `fcoi-completeness-review@v1.0`.

### UI surfaces to build (deferred)
1. **Financial Disclosures list** (`/compliance/financial-disclosures`) — DataTable of disclosures (investigator, form 3454/3455, status, submission), KPI cards (draft/signed counts from `fcoi.disclosure_register` / `/api/metrics`), filters by submission.
2. **Disclosure detail** (`/compliance/financial-disclosures/:id`) — header + status badge; interests editor (4 categories, monetary value, minimize-bias); the deterministic findings panel (from `GET /:id`); **Certify** action → ConfirmDialog with password/TOTP re-auth → `POST /certify`; "AI review" button → `POST /ai-review`. Reuse existing DataTable/StatusBadge/ConfirmDialog/KPICard.
3. **Investigator registry** mini-CRUD.
4. **AnA panel** already supports the conversational tools — no new surface needed beyond passing `disclosureId` as page context.

### Deferred DB verification (run in a DB-enabled environment)
- [ ] `npx drizzle-kit push` clean; the 4 tables + indexes + CHECK constraints verified in `information_schema`.
- [ ] Org-scoping: Org A cannot read Org B disclosures.
- [ ] Governed audit rows (`audit_logs` + `c2c_ana_actions`, sha256 chain) written for create/update/delete/sign; provenance_link row written on certify.
- [ ] Certify re-auth enforced; editing a signed disclosure reverts to draft and clears the signature.
- [ ] AnA tools mutate through the same governed path (surface `ana`).
- [ ] `fcoi.disclosure_register` report run resolves; `/api/metrics` exposes `fcoi_*`.

### Tests landed (no-DB)
`fcoi-logic.test.ts` (12) — form-type, gate, content hash. `ana/__tests__/fcoi-tools.test.ts` (8) — tool registration + input guards. Whole-repo typecheck clean.

---

## C2C-03 — HA Interaction & Commitment Management

### Data model (`shared/schema/ha-interactions.ts`; migration `migrations/20260610_ha_interactions_commitments.sql`)
- `ha_interactions` (Pre-IND/EOP1/EOP2/pre-NDA/pre-BLA/Type A-B-C/scientific advice; status lifecycle planned→…→closed), `ha_interaction_questions` (sponsor question + agency response + agreement), `regulatory_commitments` (PMR/PMC/REMS/meeting; statutory basis; due/fulfilled dates), `commitment_milestones`.
- Threading: commitments link to the source interaction and to the submission via `provenance_links` (`ha_interaction → regulatory_commitment` role `creates`; `regulatory_commitment → submission_module1` role `supports`).

### API (`/api/ha-interactions`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST | `/interactions` | `create` |
| GET | `/interactions?submissionId=` | — |
| PATCH | `/interactions/:id/status` | `transition` |
| POST | `/interactions/:id/questions` | `update` |
| GET | `/interactions/:id/readiness` | — (deterministic meeting-readiness gate) |
| POST | `/commitments` | `create` (writes provenance links) |
| GET | `/commitments?submissionId=` | — (effective status + urgency summary) |
| POST | `/commitments/:id/fulfill` | `resolve` |
| POST | `/commitments/:id/milestones` | `update` |

### AnA tools (same governed path, surface `ana`)
`create_ha_interaction`, `create_regulatory_commitment` (threads provenance), `review_commitment_portfolio` (read-only urgency summary).

### Deterministic core (`ha-logic.ts`, pure, tested)
`deriveCommitmentStatus` (past-due → overdue, terminal states preserved), `commitmentUrgency` + `summarizeCommitmentPortfolio` (overdue/due_30/due_90/later/undated/closed), `evaluateMeetingReadiness` (FDA Formal Meetings guidance: briefing package + question list expected once scheduled/held).

### Central-module wiring
- **Reports:** `ha.commitment_register` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/ha-metrics.ts` → `/api/metrics` (`ha_interactions_created_total`, `ha_commitments_created_total{type}`, `ha_commitments_fulfilled_total`).

### UI surfaces to build (deferred)
1. **Interaction timeline** (per submission) — meeting cards with type/agency/status, the readiness gate panel (`GET /:id/readiness`), question/response table.
2. **Commitment portfolio** — table sorted by urgency with the summary KPI band (from `GET /commitments`), fulfill action, milestone sub-rows; provenance "created by meeting / supports submission" chips.
3. **AnA panel** — conversational tools already wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 4 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows for create/transition/update/resolve; provenance links written on commitment create.
- [ ] `ha.commitment_register` report run resolves; `/api/metrics` exposes `ha_*`.

### Tests landed (no-DB)
`ha-logic.test.ts` (8), `ana/__tests__/ha-tools.test.ts` (7). Typecheck clean.

---

## C2C-05 — IACUC / Animal Study Governance

### Data model (`shared/schema/iacuc.ts`; migration `migrations/20260610_iacuc_animal_governance.sql`)
- `iacuc_protocols` (USDA pain category B-E; 3 Rs; category-E justification; 3-year de novo expiration), `iacuc_animal_cohorts` (census), `iacuc_reviews` (DMR/FCR determinations), `iacuc_amendments`, `iacuc_facility_inspections` (semi-annual).
- The IACUC protocol is the **origin node of the preclinical provenance chain**: approval threads `iacuc_protocol → submission_module4` (role `supports`) via `provenance_links`.

### API (`/api/iacuc`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST | `/protocols` | `create` (returns recommended review pathway) |
| GET | `/protocols?submissionId=` | — |
| PATCH | `/protocols/:id/status` | `transition` |
| POST | `/protocols/:id/reviews` | `sign` (approve) / `resolve` — sets 3-yr expiration + provenance |
| POST | `/protocols/:id/cohorts` | `update` (census) |
| POST | `/protocols/:id/amendments` | `update` |
| GET | `/protocols/:id/completeness` | — (3 Rs gate + continuing-review status) |

### AnA tools (same governed path, surface `ana`)
`create_iacuc_protocol`, `register_animal_cohort`, `review_iacuc_protocol` (read-only gate).

### Deterministic core (`iacuc-logic.ts`, pure, tested)
USDA pain-category catalog (cited); `recommendReviewType` (category E → full committee review); `evaluateProtocolCompleteness` (3 Rs, category-D analgesia / category-E justification, animal numbers — cited findings + risk); `reviewStatus` (3-year expiration + annual continuing-review due).

### Central-module wiring
- **Reports:** `iacuc.protocol_register` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/iacuc-metrics.ts` → `/api/metrics` (`iacuc_protocols_created_total{pain_category}`, `iacuc_approvals_total`, `iacuc_reviews_total{outcome}`).

### UI surfaces to build (deferred)
1. **Protocol register** — table by status/pain-category/expiration; KPI band (open/approved/expiring).
2. **Protocol detail** — 3 Rs editor, animal census (cohorts) sub-table, the completeness gate panel (`GET /:id/completeness`), committee determination action (`POST /reviews`, FCR/DMR), amendments, provenance "supports Module 4" chip.
3. **Facility inspections** mini-CRUD (semi-annual schedule).
4. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 5 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; provenance link written on approval; 3-yr expiration stamped.
- [ ] `iacuc.protocol_register` report run resolves; `/api/metrics` exposes `iacuc_*`.

### Tests landed (no-DB)
`iacuc-logic.test.ts` (12), `ana/__tests__/iacuc-tools.test.ts` (7). Typecheck clean.

---

## C2C-06 — IRB / IEC Submission & Amendment Management

### Data model (`shared/schema/irb.ts`; migration `migrations/20260610_irb_submissions.sql`)
- `irb_submissions` (review type exempt/expedited/full_board; risk minimal/greater; vulnerable populations; sIRB flag; consent waiver; continuing-review expiration), `irb_sites` (sIRB multi-site), `irb_consent_documents`, `irb_reviews` (determinations), `irb_amendments`, `irb_reportable_events` (UPIRSO).
- Approval threads `irb_submission → submission_module5` (role `supports`) via `provenance_links` — ethics approval woven into the clinical conduct record.

### API (`/api/irb`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST | `/submissions` | `create` (returns recommended review type) |
| GET | `/submissions?submissionId=` | — |
| PATCH | `/submissions/:id/status` | `transition` |
| POST | `/submissions/:id/reviews` | `sign` (approve → expiration + provenance) / `resolve` |
| POST | `/submissions/:id/sites` | `update` (sIRB) |
| POST | `/submissions/:id/consent-documents` | `update` |
| POST | `/submissions/:id/amendments` | `update` |
| POST | `/submissions/:id/reportable-events` | `update` (UPIRSO) |
| GET | `/submissions/:id/completeness` | — (45 CFR 46.111 gate + continuing review) |

### AnA tools (same governed path, surface `ana`)
`create_irb_submission`, `add_irb_site`, `review_irb_submission` (read-only gate).

### Deterministic core (`irb-logic.ts`, pure, tested)
`recommendReviewType` (greater-than-minimal → full board; minimal+category → expedited/exempt); `evaluateIrbCompleteness` (45 CFR 46.111: consent/waiver, vulnerable-population safeguards, sIRB for multi-site, risk-vs-review-type — cited findings + risk); `continuingReviewStatus` (full board → annual continuing review + 1-yr expiration; expedited/exempt exempt under the revised Common Rule).

### Central-module wiring
- **Reports:** `irb.submission_register` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/irb-metrics.ts` → `/api/metrics` (`irb_submissions_created_total{risk}`, `irb_approvals_total{review_type}`, `irb_reportable_events_total{event_type}`).

### UI surfaces to build (deferred)
1. **Submission register** — table by status/review-type/expiration; KPI band; sIRB indicator.
2. **Submission detail** — sites (sIRB) sub-table, consent documents, the 45 CFR 46.111 gate panel (`GET /:id/completeness`), determination action (`POST /reviews`), amendments, reportable-events log, provenance "supports Module 5" chip.
3. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 6 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; provenance link written on approval; full-board 1-yr expiration stamped.
- [ ] `irb.submission_register` report run resolves; `/api/metrics` exposes `irb_*`.

### Tests landed (no-DB)
`irb-logic.test.ts` (11), `ana/__tests__/irb-tools.test.ts` (7). Typecheck clean.

---

## C2C-07 — IBC / Biosafety

### Data model (`shared/schema/ibc.ts`; migration `migrations/20260610_ibc_biosafety.sql`)
- `ibc_registrations` (NIH Guidelines section III-A..F/exempt; declared BSL-1..4; recombinant DNA / human gene transfer flags; annual expiration), `ibc_biological_agents` (risk group RG1-4 → derived required BSL), `ibc_reviews` (determinations; convened-quorum flag).
- Approval threads `ibc_registration → submission_module4` (role `supports`) via `provenance_links` — biosafety clearance into the IND-enabling record.

### API (`/api/ibc`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST | `/registrations` | `create` (returns convened-review flag) |
| GET | `/registrations?submissionId=` | — |
| PATCH | `/registrations/:id/status` | `transition` |
| POST | `/registrations/:id/agents` | `update` (required BSL derived from risk group) |
| POST | `/registrations/:id/reviews` | `sign` (approve → expiration + provenance) / `resolve` |
| GET | `/registrations/:id/containment` | — (containment-adequacy gate + expiration) |

### AnA tools (same governed path, surface `ana`)
`create_ibc_registration`, `add_biological_agent` (derives required BSL), `review_ibc_registration` (read-only gate).

### Deterministic core (`ibc-logic.ts`, pure, tested)
Risk-group catalog (RG1-4 → BSL-1..4, cited NIH Guidelines/BMBL); `evaluateContainment` (declared BSL must meet the highest agent requirement; agent vs risk-group check; convened-review note for III-A/B/C + human gene transfer — cited findings + risk); `requiresConvenedReview`; `registrationExpiration` (annual).

### Central-module wiring
- **Reports:** `ibc.registration_register` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/ibc-metrics.ts` → `/api/metrics` (`ibc_registrations_created_total{bsl}`, `ibc_approvals_total`, `ibc_agents_registered_total{risk_group}`).

### UI surfaces to build (deferred)
1. **Registration register** — table by status/BSL/section/expiration; KPI band; human-gene-transfer indicator.
2. **Registration detail** — biological-agents sub-table (risk group → required BSL), the containment gate panel (`GET /:id/containment`), determination action (`POST /reviews`, convened quorum), provenance "supports Module 4" chip.
3. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 3 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; provenance link written on approval; required BSL derived (not trusted from input).
- [ ] `ibc.registration_register` report run resolves; `/api/metrics` exposes `ibc_*`.

### Tests landed (no-DB)
`ibc-logic.test.ts` (9), `ana/__tests__/ibc-tools.test.ts` (7). Typecheck clean.

---

## C2C-04 — Nonclinical Study Management + SEND

**Note:** distinct from `ctd_nonclinical_studies` (AI-extraction landing zone, program-keyed). This is the **governed, submission-linked management** layer.

### Data model (`shared/schema/nonclinical.ts`; migration `migrations/20260610_nonclinical_send.sql`)
- `nonclinical_studies` (study type → derived CTD Module 4 section; GLP; species; NOAEL; links to authorizing `iacuc_protocol_id` and `submission_id`), `send_datasets` (SENDIG version, domains present, define.xml, nSDRG, validation status/counts).
- Provenance: `iacuc_protocol → nonclinical_study` (`authorizes`) and `nonclinical_study → submission_module4` (`supports`) — **completes the preclinical provenance chain** from IACUC (C2C-05) through Module 4.

### API (`/api/nonclinical`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST | `/studies` | `create` (derives CTD section + provenance; returns required SEND domains) |
| GET | `/studies?submissionId=` | — |
| PATCH | `/studies/:id/status` | `transition` |
| PUT | `/studies/:id/send` | `update` (upsert SEND dataset metadata) |
| GET | `/studies/:id/send-readiness` | — (SENDIG readiness gate) |

### AnA tools (same governed path, surface `ana`)
`create_nonclinical_study` (threads provenance), `review_send_readiness` (read-only gate).

### Deterministic core (`nonclinical-logic.ts`, pure, tested)
`ctdSectionFor` (study type → CTD 4.2.x); `requiredSendDomains` + `sendInScope` (SENDIG 3.x domain catalog); `evaluateSendReadiness` (required domains, define.xml mandatory, nSDRG, validation errors — cited findings + risk + missing domains).

### Central-module wiring
- **Reports:** `nonclinical.study_send_register` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/nonclinical-metrics.ts` → `/api/metrics` (`nonclinical_studies_created_total{study_type}`, `nonclinical_send_validations_total{status}`).

### UI surfaces to build (deferred)
1. **Study register** — table by type/CTD section/status; KPI band; GLP indicator; provenance "authorized by IACUC / supports Module 4" chips.
2. **Study detail** — SEND dataset panel (domains present vs required, define.xml/nSDRG, validation), the readiness gate (`GET /:id/send-readiness`), status transitions.
3. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 2 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; provenance links written on study create (IACUC + Module 4).
- [ ] `nonclinical.study_send_register` report run resolves; `/api/metrics` exposes `nonclinical_*`.

### Tests landed (no-DB)
`nonclinical-logic.test.ts` (9), `ana/__tests__/nonclinical-tools.test.ts` (5). Typecheck clean.

---

## C2C-14 — eGrants / Funder-Milestone Management

Directly fulfills the original grants/pre-award/post-award/invoicing ask. Grants is greenfield (no prior tables).

### Data model (`shared/schema/grants.ts`; migration `migrations/20260610_egrants.sql`)
- `grant_opportunities` (pre-award; agency, mechanism SBIR/STTR/R01…, grants.gov `external_id`), `grant_proposals` (applications; opportunity + Project links), `grant_awards` (post-award; period, total), `grant_milestones` (scientific/progress/financial/deliverable/regulatory + reporting deadlines), `grant_invoices` (sponsor billing).
- Provenance: `grant_proposal → grant_award` (`results_in`) preserves the pre→post-award thread. Proposals/awards attach to `projects`.

### API (`/api/grants`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST | `/opportunities` | `create` |
| POST | `/proposals` · GET `/proposals` · PATCH `/proposals/:id/status` | `create`/`transition` |
| POST | `/awards` (proposal→award provenance) · GET `/awards` | `create` |
| GET | `/awards/:id/reporting` | — (2 CFR 200.344 obligations + period state) |
| POST | `/awards/:id/milestones` · GET `/milestones` (urgency summary) | `update` |
| POST | `/awards/:id/invoices` · GET `/invoices` · PATCH `/invoices/:id/status` | `create`/`transition` |

### AnA tools (same governed path, surface `ana`)
`create_grant_proposal`, `record_grant_award` (threads provenance), `review_grant_reporting` (read-only federal obligations).

### Deterministic core (`grants-logic.ts`, pure, tested)
`deadlineUrgency` + `summarizeDeadlines` (overdue/due_30/due_90/later/undated/closed) for proposals/milestones/invoices; `reportingObligations` (annual RPPR + final performance/financial 120 days post-period, 2 CFR 200.344); `awardPeriodState` (pre_start/active/closeout_window/lapsed).

### Central-module wiring
- **Reports:** `grants.portfolio_register` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/grants-metrics.ts` → `/api/metrics` (`grants_proposals_created_total`, `grants_awards_recorded_total{agency}`, `grants_invoices_total{status}`).
- **Tasking (documented follow-on):** milestone/invoice deadlines are the natural feed for `unified_tasks`; wiring needs a `'Grants'` `moduleType` registered in `unifiedTaskService` MODULE_CONFIG.
- **grants.gov connector (documented follow-on):** `external_id` on opportunities is the hook; build `server/services/connectors/grants-gov.ts` per the `DataConnector` + credentialVault pattern.

### UI surfaces to build (deferred)
1. **Pre-award pipeline** — opportunities + proposals kanban by status; deadline urgency band.
2. **Post-award dashboard** — awards with period state, budget vs invoiced, the reporting-obligations panel (`GET /awards/:id/reporting`), milestone urgency.
3. **Invoice register** — sponsor invoices by status/aging; status transitions.
4. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 5 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; proposal→award provenance link written; proposal marked awarded.
- [ ] `grants.portfolio_register` report run resolves; `/api/metrics` exposes `grants_*`.

### Tests landed (no-DB)
`grants-logic.test.ts` (5), `ana/__tests__/grants-tools.test.ts` (6). Typecheck clean.


---

## C2C-12 — RIM-lite Registration Grid + Labeling

### Data model (`shared/schema/rim.ts`; migration `migrations/20260610_rim_lite.sql`)
- `rim_products` (registry; INN, dosage form, ATC), `rim_registrations` (product × country grid; market status, registration number, MA holder, approval + renewal dates), `rim_labels` (versions; USPI/SmPC/PIL/CCDS; approve supersedes prior).

### API (`/api/rim`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST/GET | `/products` | `create` |
| PUT | `/products/:id/registrations` | `update` (upsert grid cell) |
| GET | `/registrations?productId=` | — (grid + renewal summary) |
| POST | `/products/:id/labels` | `sign` (approve supersedes) / `update` |
| GET | `/products/:id/label-currency` | — (label-currency gate) |
| GET | `/expected-label-type?country=` | — |

### AnA tools (same governed path, surface `ana`)
`create_rim_product`, `set_registration_status`, `review_label_currency` (read-only gate).

### Deterministic core (`rim-logic.ts`, pure, tested)
`expectedLabelType` (US→USPI / EU→SmPC / else CCDS, cited); `renewalUrgency` (approved-registration renewal buckets); `summarizeGrid` (status counts + renewal urgency); `evaluateLabelCurrency` (approved markets must carry a current approved label of the right type — cited findings + risk).

### Central-module wiring
- **Reports:** `rim.registration_grid` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/rim-metrics.ts` → `/api/metrics` (`rim_products_created_total`, `rim_registrations_total{status}`, `rim_labels_approved_total{label_type}`).

### UI surfaces to build (deferred)
1. **Registration grid** — product × country matrix with status colors, renewal urgency band, filters.
2. **Product detail** — registration rows + label-version history; the label-currency gate panel; approve-label action (supersession).
3. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 3 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; approve-label supersedes prior approved of the same slot.
- [ ] `rim.registration_grid` report run resolves; `/api/metrics` exposes `rim_*`.

### Tests landed (no-DB)
`rim-logic.test.ts` (8), `ana/__tests__/rim-tools.test.ts` (7). Typecheck clean.


---

## C2C-13 — Inspection Readiness (BIMO / PAI)

### Data model (`shared/schema/inspection.ts`; migration `migrations/20260610_inspection_readiness.sql`)
- `inspections` (BIMO/PAI/GCP/GMP; outcome NAI/VAI/OAI), `inspection_findings` (Form 483 observations; classification), `finding_responses` (CAPA; 15-business-day due date), `readiness_assessments` (per-area mock-inspection prep).
- (Note: iacuc's facility-inspection status type renamed to `FacilityInspectionStatus` to free `InspectionStatus` for this module.)

### API (`/api/inspections`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST/GET | `/` | `create` |
| PATCH | `/:id/status` | `transition` (status + outcome) |
| POST/GET | `/:id/findings` | `update` |
| POST | `/findings/responses` | `resolve` (auto 15-business-day due date) |
| PUT | `/readiness` | `update` (per-area) |
| GET | `/readiness/score` | — (readiness score + blockers) |

### AnA tools (same governed path, surface `ana`)
`create_inspection`, `log_inspection_finding`, `review_inspection_readiness` (read-only score).

### Deterministic core (`inspection-logic.ts`, pure, tested)
`addBusinessDays` / `responseDueDate` (the 15-business-day 483 clock, weekend-aware); `responseUrgency`; `outcomeSeverity` (OAI>VAI>NAI); `findingPriority`; `scoreReadiness` (ready=1/in_progress=0.5/at_risk=0 → 0-100 + verdict + blockers).

### Central-module wiring
- **Reports:** `inspection.readiness_pack` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/inspection-metrics.ts` → `/api/metrics` (`inspections_created_total{type}`, `inspection_findings_total{classification}`, `inspection_outcomes_total{outcome}`).

### UI surfaces to build (deferred)
1. **Inspection list** — by type/agency/status/outcome; readiness band.
2. **Inspection detail** — 483 findings table with classification, response tracker (15-business-day clock + urgency), per-area readiness checklist with the score gauge.
3. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 4 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; response due date defaults to 15 business days from inspection end.
- [ ] `inspection.readiness_pack` report run resolves; `/api/metrics` exposes inspection counters.

### Tests landed (no-DB)
`inspection-logic.test.ts` (8), `ana/__tests__/inspection-tools.test.ts` (7). Typecheck clean.


---

## C2C-15 — Controlled Substances Tracking (DEA)

### Data model (`shared/schema/controlled-substances.ts`; migration `migrations/20260610_controlled_substances.sql`)
- `dea_registrations` (registrant, DEA number, business activity, authorized schedules, expiration), `controlled_substances` (inventory; schedule I-V, unit, current_balance), `cs_transactions` (perpetual ledger; type, quantity, running balance_after, witness).

### API (`/api/controlled-substances`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST/GET | `/registrations` | `create` (GET adds expiry status) |
| POST/GET | `/substances` | `create` |
| POST | `/substances/:id/transactions` | `update` (reconciles balance; rejects negative) |
| GET | `/substances/:id/transactions` | — |
| GET | `/substances/:id/recordkeeping` | — (recordkeeping gate) |

### AnA tools (same governed path, surface `ana`)
`register_dea`, `log_cs_transaction` (reconciles balance), `review_cs_balance` (read-only inventory).

### Deterministic core (`cs-logic.ts`, pure, tested)
DEA schedule catalog (I-V, cited 21 CFR 1308); `reconcileBalance` (receipt/adjustment add, dispense/use/disposal/transfer subtract, signed adjustments, no-negative invariant); `registrationExpiryStatus`; `evaluateRecordkeeping` (active registration required; disposal witness; Schedule II Form 222 — cited).

### Central-module wiring
- **Reports:** `controlled_substances.inventory_ledger` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/cs-metrics.ts` → `/api/metrics` (`cs_registrations_created_total`, `cs_substances_created_total{schedule}`, `cs_transactions_total{type}`).

### UI surfaces to build (deferred)
1. **Registration list** — DEA registrations with expiry status; schedules chips.
2. **Inventory** — substances with current balance by schedule; low/negative guards.
3. **Substance ledger** — perpetual transaction history with running balance; record-transaction form (witness for disposals); the recordkeeping gate panel.
4. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 3 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; balance reconciliation rejects negative inventory under the row lock.
- [ ] `controlled_substances.inventory_ledger` report run resolves; `/api/metrics` exposes `cs_*`.

### Tests landed (no-DB)
`cs-logic.test.ts` (9), `ana/__tests__/cs-tools.test.ts` (7). Typecheck clean.


---

## C2C-11 — Lifecycle Obligation Tracking

### Data model (`shared/schema/lifecycle.ts`; migration `migrations/20260610_lifecycle_obligations.sql`)
- `lifecycle_obligations` (variation/supplement/periodic_report/pediatric/renewal/annual_report; region; classification IA/IB/II/PAS/CBE/PSUR/PREA; due date; recurrence cadence), `lifecycle_obligation_events` (generated recurring occurrences). Links to `rim_products` and submissions.

### API (`/api/lifecycle`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST/GET | `/obligations` | `create` (periodic → auto-generates occurrences; returns review pathway) |
| GET | `/obligations/:id/events` | — |
| PATCH | `/obligations/:id/status` · `/events/:id/status` | `transition` |
| GET | `/calendar` | — (urgency summary across obligations + events) |

### AnA tools (same governed path, surface `ana`)
`create_lifecycle_obligation` (generates occurrences), `review_lifecycle_calendar` (read-only urgency).

### Deterministic core (`lifecycle-logic.ts`, pure, tested)
`OBLIGATION_CLASSIFICATIONS` + `classificationPathway` (EU IA/IB/II per Reg 1234/2008; FDA PAS/CBE/annual report per 21 CFR 314.70 — cited pathways); `generateOccurrences` (PSUR cadence engine: period windows + due ~70 days after period end, ICH E2C); `obligationUrgency` + `summarizeCalendar`.

### Central-module wiring
- **Reports:** `lifecycle.obligation_calendar` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/lifecycle-metrics.ts` → `/api/metrics` (`lifecycle_obligations_created_total{type}`, `lifecycle_occurrences_generated_total`, `lifecycle_submissions_total`).

### UI surfaces to build (deferred)
1. **Obligation calendar** — timeline/list by urgency across obligations + recurring occurrences; KPI band.
2. **Obligation detail** — classification pathway, recurrence settings, generated occurrences with per-occurrence status.
3. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 2 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; periodic obligation generates the expected occurrences with correct dates.
- [ ] `lifecycle.obligation_calendar` report run resolves; `/api/metrics` exposes `lifecycle_*`.

### Tests landed (no-DB)
`lifecycle-logic.test.ts` (4), `ana/__tests__/lifecycle-tools.test.ts` (5). Typecheck clean.


---

## C2C-08 — AI-native eTMF

### Data model (`shared/schema/etmf.ts`; migration `migrations/20260610_etmf.sql`)
- `tmf_files` (per-study TMF container; DIA RM model), `tmf_artifacts` (classified to zone 1-11/section; expected + completeness-required flags; status expected/received/in_review/final/missing/not_applicable).

### API (`/api/etmf`, governed + org-scoped)
| Method | Path | Governed action |
|--------|------|-----------------|
| POST/GET | `/files` | `create` |
| POST | `/files/:id/artifacts` | `update` (auto-classifies when zone omitted) |
| GET | `/files/:id/artifacts` | — |
| PATCH | `/artifacts/:id/status` | `transition` |
| GET | `/files/:id/completeness` | — (gap-check; feeds inspection readiness) |
| GET | `/classify?artifactName=` | — (deterministic auto-classify preview) |

### AnA tools (same governed path, surface `ana`)
`create_tmf`, `classify_tmf_artifact` (auto-classifies), `review_tmf_completeness` (read-only gap-check).

### Deterministic core (`etmf-logic.ts`, pure, tested)
DIA TMF RM 11-zone catalog; `classifyArtifact` (keyword auto-classifier baseline an LLM can refine; defaults to Zone 2); `evaluateCompleteness` (required-and-final → completeness %, per-zone coverage, gap list, inspection-readiness verdict).

### Central-module wiring
- **Reports:** `etmf.completeness_pack` in `REPORT_TYPE_SEED`.
- **Metrics:** `server/services/etmf-metrics.ts` → `/api/metrics` (`etmf_files_created_total`, `etmf_artifacts_added_total{zone}`, `etmf_artifacts_auto_classified_total`).
- **Cross-link:** the completeness gap-check is the data feed for C2C-13 inspection readiness (TMF readiness area).

### UI surfaces to build (deferred)
1. **TMF dashboard** — completeness gauge + per-zone coverage heatmap; gap list.
2. **Artifact grid** — zone × artifact with status; auto-classify-on-add (with override); status transitions.
3. **AnA panel** — conversational tools wired.

### Deferred DB verification
- [ ] `drizzle-kit push` clean; 2 tables + indexes + CHECK constraints in `information_schema`.
- [ ] Org-scoping; governed audit rows; artifact auto-classification matches the deterministic classifier.
- [ ] `etmf.completeness_pack` report run resolves; `/api/metrics` exposes `etmf_*`.

### Tests landed (no-DB)
`etmf-logic.test.ts` (10), `ana/__tests__/etmf-tools.test.ts` (6). Typecheck clean.

---

## Roadmap complete

All 15 capabilities are accounted for: **C2C-01 through C2C-08, C2C-11 through C2C-15 built end-to-end (backend)**; **C2C-02** is the provenance spine threaded by 7+ consumers; **C2C-09** (Device/IVD) and **C2C-10** (PV/DSUR) pre-exist on the trunk and were not rebuilt. Every built capability: CHECK-constrained schema + authored migration, a regulation-cited pure deterministic gate with tests, a governed transactional service, governed REST + AnA conversational tools on one audited path, a Report-OS report type + `/api/metrics` counters, and this handoff entry. DB-backed paths are authored-but-not-runtime-verified in this container; each capability carries its deferred DB-verification checklist above.

---

## Add-ons, connectors & ingestion bridge (post-roadmap workstreams)

Four ISU-brief-driven additions, built on existing infrastructure (no rebuilds). **DB-verified end-to-end against live Postgres 16 — `scripts/db-verify/verify-research-compliance.ts`: 40/40 assertions pass.**

### A1 — Effort certification (2 CFR 200.430)
- Schema `effort_certifications` + `effort_lines`; migration `20260611_effort_certification.sql`.
- Deterministic gate `validateEffort` (total ≤ 100%; sponsored committed↔actual deviation > 25% triggers recertification) — 7 unit tests; `computeEffortContentHash` (order-independent).
- Governed service `certifyTx` (gate is the floor — over-commit certify is rejected; binds sha256 content hash).
- **API** `/api/effort-certification` (CRUD + `/:id/validation` + `/:id/certify` [command `sign`]). **AnA:** `create_effort_certification`, `add_effort_line`. **Report:** `effort.certification_register`.

### A2 — Research security / COI-FCOI (NSPM-33 / NOT-OD-26-017 / 42 CFR 50 F)
- Schema `coi_disclosures`; migration `20260611_research_security.sql`. Foreign appointment/support (or non-US country) auto-flagged for research-security review.
- Governed service create + review (management plan). **API** `/api/research-security` (CRUD + `/:id/review`). **AnA:** `create_coi_disclosure`. **Report:** `research_security.coi_register` (foreign-nexus + unmanaged-conflict rollups).

### A3 — Sponsored-programs connectors (extend `DataConnector` catalog — not a new framework)
- `grants_gov` (free) — Grants.gov Search2/fetchOpportunity; pre-award NOFO pipeline.
- `sam_exclusions` (apiKey) — SAM.gov Exclusions restricted-party screening (2 CFR 200.214 / research security); a "search" is a screen, zero matches = clean.
- `ellucian_banner` (baseUrl + apiKey) — Banner via Ethos Integration as **system of record**; read-only by design (Banner stays authoritative).
- Registered in `connector-registry.ts`; catalog entries carry full setup guides. New categories `funding` / `compliance` / `sor`.

### A4 — Preclinical ingestion → governed registry bridge
- `preclinical-governed-bridge.ts`: maps the extraction taxonomy → CTD Module 4 study-type union (`mapStudyType`) and threads a digested `ctd_nonclinical_studies` row into the governed `nonclinical_studies` registry under a governed action, with provenance `ctd_nonclinical_study → nonclinical_study (derived_from)` and `nonclinical_study → submission_module4 (supports)`.
- `ingestStudy()` gains an **opt-in** `governance` context; legacy program-only digestion is unchanged when it is omitted. Route `/api/preclinical/ingest` passes governance when tenant+user context and `governed=true`/`submissionId` are present. Digestion is retained even if the bridge fails (fail-open on the bridge, not the extraction).

### UI surfaces to build (deferred — for the follow-on session)
1. **Effort certification** — statement editor (lines, live validation banner, recert flag), certify-with-reason (e-sign), register grid.
2. **Research security / COI** — disclosure intake, foreign-nexus queue, review/manage panel with management plan.
3. **Connectors** — surface the 3 new catalog entries in the existing connector settings UI (setup guides already supplied); a "screen party" action for `sam_exclusions`; a Banner reconciliation view.
4. **Preclinical** — show `governedStudyId` + CTD section + provenance chain on the ingest result; Module 4 evidence link.
