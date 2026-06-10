# IND Lifecycle Module — Backend Catalog & Runbook

Backend for the FDA Investigational New Drug (IND) lifecycle across eCTD
Modules 1/2/4/5, the Regulatory Affairs workflows, pharmacovigilance, and 21 CFR
Part 11 controls. Everything below is implemented, typechecked (0 errors) and
unit-tested, and lands on the `concept2cure-v2` branch (the product default).

All HTTP routes are auth-gated (`authenticateToken` at mount) and tenant-scoped
(org resolved from the session, never from the body). Mounted by
`server/bootstrap/register-ind-lifecycle-routes.ts`.

---

## 1. Source of truth

- **Section map**: `services/regulatory/ind-ectd-sections.ts` — the canonical
  108-section IND eCTD map (the scrambled CTD module model was corrected here and
  in `services/regulatory/pyramids/ind-pyramid.ts`; M3=Quality/CMC, M4=Nonclinical,
  M5=Clinical, M2=Summaries, M1=Administrative).
- **Blueprint**: `server/services/regulatory/registry/blueprints/usIndBlueprint.ts`.

## 2. Module 1 — Administrative / Regulatory Affairs

| Capability | Service | Routes |
|---|---|---|
| FDA forms 1571/1572/3674/3454/3455 | `ind-forms/ind-form-data-builders`, `ind-form-fill-service` | `GET /api/ind-forms`, `POST /api/ind-forms/:formId/build`, `/:formId/pdf`, `/1572/pdf-all` |
| Forms auto-filled from registries | `ind-forms/form-context-assembler` | `POST /api/ind-forms/:formId/pdf-from-records` |
| Sponsor / US-agent (312.3) / investigator registries | `ind-master-data/ind-master-data-service`, schema `shared/schema/ind-master-data` | `GET/POST/PATCH /api/ind-master-data/{sponsors,agents,investigators}` |
| Cover letter (m1.2) | `ind-lifecycle/ind-cover-letter-service`, `cover-letter-context` | `POST /api/ind-lifecycle/cover-letter`, `/cover-letter/pdf`, `/cover-letter/pdf-from-records` |
| FDA meeting briefing book (Pre-IND / Type A/B/C) | `ind-lifecycle/ind-briefing-book-service` | `POST /api/ind-lifecycle/briefing-book`, `/briefing-book/pdf` |
| us-regional envelope XML | `ind-lifecycle/ind-ectd-envelope` | `POST /api/ind-lifecycle/envelope` |

## 3. RA lifecycle workflows

| Capability | CFR / ICH | Service | Routes |
|---|---|---|---|
| IND Safety Report (7/15-day classify + narrative + amendment intent) | 21 CFR 312.32 | `ind-lifecycle/ind-safety-report-service` | `POST /api/ind-lifecycle/safety-report`, `/safety-report/classify`, `/safety-report/pdf`, `/safety-report/file` |
| Annual Report / DSUR | 21 CFR 312.33 / ICH E2F | `ind-lifecycle/ind-annual-report-service` | `/annual-report`, `/annual-report/pdf`, `/annual-report/file` |
| Protocol / information amendment planning | 21 CFR 312.30/312.31 | `ind-lifecycle/ind-amendment-service` | `/amendment-plan`, `/amendment/file` |
| Filing → audited eCTD sequence + leaves | — | `ind-lifecycle/ind-lifecycle-persistence` (→ submission-service) | the `*/file` routes above |
| Filing-readiness verdict | 21 CFR 312.23 | `ind-lifecycle/ind-readiness-service` | `POST /api/ind-lifecycle/readiness` |
| Regulatory clock + clinical-hold tracker | 21 CFR 312.40/312.42/312.45 | `ind-lifecycle/ind-regulatory-clock` | `POST /api/ind-lifecycle/clock` |
| Regulatory timeline / milestones | 21 CFR 312.40 + 312.33 | `ind-lifecycle/ind-timeline-service` | `POST /api/ind-lifecycle/timeline` |
| Submission overview / dashboard | — | `ind-lifecycle/ind-submission-overview`, `ind-dashboard` | `GET /api/ind-lifecycle/submission/:id/overview`, `POST /submission/:id/dashboard` (folds in readiness + clock + timeline) |

## 4. Module 2/4/5 — Medical writing

| Capability | Service | Routes |
|---|---|---|
| Module 2 summaries (2.3/2.4/2.5/2.7) | `m2-summary-builders` (existing) | — |
| Module 2 summary → PDF leaf | `authoring/m2-summary-renderer` | `POST /api/authoring-pdf/m2-summary/pdf` |
| Investigator's Brochure (ICH E6 §7) | `authoring/ib-builder` | — |
| Module 4 nonclinical study report | `authoring/nonclinical-study-report-builder` | — |
| Lifecycle document → bookmarked PDF | `ind-lifecycle/ind-document-renderer` | (used by the `*/pdf` routes) |

## 5. eCTD submission-grade output

- `ectd/leaf-pdf-renderer` — `renderLeafPdf` (flat) and `renderStructuredLeafPdf`
  (section tree → **page-accurate bookmarks**); deterministic bytes (md5 contract).
- `ectd/pdf-bookmark-generator` — real `/Outlines` tree + TOC helpers.
- `ectd/pdfa-pipeline` — PDF/A-1b via Ghostscript/veraPDF, feature-detected;
  wired into `submission-gateways/regional-packager` before checksum.

## 6. Compliance

- `audit/audit-hmac-seal` + `audit/chain` (`computeAuditChainSealed`,
  `verifyAuditChainSeals`) — HMAC-sealed audit hash-chain (21 CFR Part 11 §11.70),
  fail-safe (no key ⇒ unsealed, never throws). Writers: pharmacovigilanceService,
  c2c/actions, c2c/commitments.
- `compliance/pv-signal-detection` — PRR / ROR+CI / Yates χ² / EBGM / EB05.
- `compliance/pv-periodic-scheduler` — DSUR/PSUR/PBRER/PADER due dates.

## 7. Migrations

Run before deploying code that writes these columns/tables:

- `migrations/20260609_ind_master_data.sql` — sponsors / regulatory_agents / investigators.
- `migrations/20260609_audit_hmac_seal.sql` — `audit_logs.hmac_seal` (nullable, additive).

## 8. Deployment prerequisites (non-code)

These are environment/asset steps; the code feature-detects and degrades gracefully without them.

1. Drop official FDA AcroForm PDFs into `templates/forms/acroforms/` (`FDA_1571.pdf`, …);
   until then the form service renders a deterministic labeled fallback PDF.
2. Install **Ghostscript** (and optionally **veraPDF**) in the deployment image for
   real PDF/A-1b conversion (else PDFs pass through unchanged).
3. Set **`AUDIT_HMAC_KEY`** to activate audit HMAC sealing (else rows are written
   unsealed, still covered by the sha256 chain).
4. Run the two migrations in §7.

## 9. Tests

Unit tests accompany every service (deterministic logic; submission-service is
mocked where persistence is involved). Run the module footprint with:

```
npx vitest run \
  server/services/ind-lifecycle/__tests__/ \
  server/services/ind-forms/__tests__/ \
  server/services/ind-master-data/__tests__/ \
  server/services/authoring/__tests__/ \
  server/services/audit/__tests__/chain.test.ts \
  server/services/ectd/__tests__/leaf-pdf-renderer.test.ts \
  server/services/ectd/__tests__/pdf-bookmark-generator.test.ts \
  server/services/ectd/__tests__/pdfa-pipeline.test.ts \
  server/services/compliance/__tests__/
```
