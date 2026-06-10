# Build & Handoff Report — Research Compliance + Sponsored Programs Suite

Living handoff for the roadmap (C2C-01 … C2C-15). Backend lands first (no UI per
directive); this report is what the follow-on session uses to build UI surfaces
and to run the deferred DB-backed verification. Updated as each capability lands.

## Roadmap & status

| ID | Capability | Tier | Status |
|----|-----------|------|--------|
| C2C-01 | Clinical Investigator Financial Disclosure (21 CFR 54) | 1 | **Backend complete** (this report) |
| C2C-02 | ALCOA+ Provenance Spine | 1 | **Seed landed** (`provenance_links` + service); full spine later |
| C2C-03 | HA Interaction & Commitment Mgmt | 1 | Planned |
| C2C-04 | Nonclinical Study Mgmt + SEND | 2 | Planned |
| C2C-05 | IACUC / Animal Study Governance | 2 | Planned |
| C2C-06 | IRB/IEC Submission & Amendment Mgmt | 2 | Planned |
| C2C-07 | IBC / Biosafety (Novel Modality) | 2 | Planned |
| C2C-08 | AI-native eTMF | 2 | Planned |
| C2C-09 | Device / IVD Technical Documentation | 2 | Planned |
| C2C-10 | PV Intake + DSUR/PBRER | 3 | Planned |
| C2C-11 | Lifecycle Obligation Tracking | 3 | Planned |
| C2C-12 | RIM-lite Registration Grid + Labeling | 3 | Planned |
| C2C-13 | Inspection Readiness (BIMO/PAI) | 3 | Planned |
| C2C-14 | eGrants / Funder-Milestone Mgmt | 3 | Planned |
| C2C-15 | Controlled Substances Tracking (DEA) | 3 | Planned |

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
