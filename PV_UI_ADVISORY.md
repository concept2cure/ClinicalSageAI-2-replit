# Pharmacovigilance — UI advisory for Claude Design

**Audience:** Claude Design (the design system).
**Author:** Claude Code (backend).
**Status:** PV backend reconciled + extended on `concept2cure-v2`; UI is designed in
`ui_kits/` first (per `CLAUDE.md`). This advisory tells you what exists, what the
eight-tab PV surface must do, and every dependency it binds to.

---

## 0. Critical fix you should know about

The PV service (`server/services/compliance/pharmacovigilanceService.ts`) reads/
writes **unprefixed** tables (`adverse_events`, `icsrs`, `safety_signals`,
`risk_management_plans`, `periodic_safety_reports`) with TEXT (UUID) ids, but the
only PV tables that existed were `pv_`-prefixed with SERIAL ids (migration
`20260317`). So **every PV write silently hit the 42P01 fallback and degraded to
in-memory** — PV was wired but not persistent.

Migration `migrations/20260603_pv_operational.sql` creates the tables the service
actually uses (so PV is now genuinely persistent with no service-logic change)
and adds the E2B(R3) / MedDRA / triage-workflow fields + a structured benefit-
risk table. **It must be applied/validated against the preview DB** (the repo's
`preview_db_test` gate) before this is "done" in a deployed environment.

---

## 1. What exists (the substrate)

- **Service:** `server/services/compliance/pharmacovigilanceService.ts` (~1,200 lines):
  adverse-event intake, expedited-deadline calc (7d/15d per FDA/EMA/PMDA/NMPA/
  Health Canada), ICSR (E2B R3) generation, periodic reports, signals, RMP, plus
  new `computeReportingClock`, `searchMeddraTerms`, `submitCaseToTriage`.
- **Routes:** `server/routes/pharmacovigilance-routes.ts`, mounted auth-gated at
  `/api/pharmacovigilance` (`register-regulatory-routes.ts`).
- **Gateways:** `server/services/submission-gateways/{fda-esg,ema-cesp,pmda-gateway}.ts`
  + `submissionTransmittals` table with ACK1/2/3 states (real AS2/OAuth2/mTLS infra).
- **MedDRA:** `meddra_term_reference` (SOC→HLGT→HLT→PT→LLT), now queryable via
  `searchMeddraTerms` (org-scoped). The licensed dictionary must be ingested per org.
- **Living Record spine:** `shared/schema/living-record-spine.ts` (`canonicalFacts`/
  `factBindings`/`factDrift`) — exists; PV not yet bound to it.

---

## 2. What the UI must do — the eight tabs

1. **Cases** — MedDRA-coded ICSR line listing: case · patient · suspect product ·
   reaction PT · MedDRA code · seriousness · causality · outcome · **status** ·
   reporting clock. Hook: `GET /adverse-events` (+ per-row clock from
   `computeReportingClock`).
2. **Case intake** — E2B(R3) form: Patient · Suspect product · Reaction (MedDRA PT
   picker via `GET /meddra/search` + seriousness checkboxes) · Assessment (WHO-UMC
   causality + expectedness vs RSI) · narrative · reporter/source. Required-field
   markers. **Save draft** (`POST /adverse-events`, `case_status='draft'`) and
   **Submit-to-triage** (`POST /adverse-events/:id/submit-to-triage` → assigns the
   clock + writes a Part 11 audit).
3. **Reporting** — aggregate calendar (PBRER/PSUR · DSUR · PADER with due-date +
   DLP clocks) and expedited-ICSR gateway submission tracking (FAERS/ESG,
   EudraVigilance, PMDA) with ACK1/ACK2/EVPOST status; flag the **day-6-of-15 case
   still in draft** (use the clock `day6Flag` + `case_status='draft'`).
4. **RMP** — GVP V: important identified/potential risks + missing information, each
   with its risk-minimization measure and state. Hook: `GET /rmp/:projectId`,
   `POST /rmp`.
5. **Signals** — signal listing + management; disproportionality (PRR/ROR/EB05
   columns exist, computation is a backend follow-up). Hook: `GET/POST /signals`.
6. **ICSR clocks** — expedited deadlines, day-6 urgency, overdue. Hooks:
   `GET /adverse-events/overdue`, `POST /calculate-deadline`, clock object.
7. **PSUR/PBRER** — periodic report detail. Hook: `GET/POST /periodic-reports`.
8. **Benefit-risk** — structured benefit/risk/conclusion (table
   `pv_benefit_risk_assessments`; endpoints are a backend follow-up — see §4).

Overview KPIs: `GET /overview`. Per-region status: `GET /compliance-matrix`.

---

## 3. Dependencies (exact contracts)

All under `/api/pharmacovigilance`, auth-gated; org resolved from tenant context
(`getOrgId`). All responses are `{ success, data }`.

| Tab | Method + path | Notes |
| --- | --- | --- |
| Cases | `GET /adverse-events` | filters: eventType, seriousnessCriteria, reportedToAuthorities, expeditedReportRequired, fromDate, toDate |
| Case intake | `POST /adverse-events` | body = E2B(R3) fields (see below); creates `case_status='draft'` |
| Case intake | `POST /adverse-events/:id/submit-to-triage` | body `{ reason }` (≥8 chars) → `{ id, caseStatus, submittedAt, reportingClock, auditWritten }` |
| Case intake | `GET /meddra/search?q=&limit=` | → `[{ ptCode, ptName, socCode, socName, lltCode, lltName }]` |
| ICSR | `POST /icsr/generate` | body `{ adverseEventId }` |
| Clocks | `GET /adverse-events/overdue`, `POST /calculate-deadline` | deadline calc 7d/15d |
| Reporting | `GET/POST /periodic-reports` | DSUR/PSUR/PBRER/PADER |
| Signals | `GET/POST /signals` | |
| RMP | `GET /rmp/:projectId`, `POST /rmp` | |
| Dashboard | `GET /overview`, `GET /compliance-matrix` | |

**Adverse-event fields now in the schema** (`adverse_events`): event_type,
patient_id, event_description, onset_date, report_date, seriousness_criteria,
causality (WHO-UMC), outcome, reporter_type, country_of_occurrence,
regulatory_reporting_deadline, reported_to_authorities, expedited_report_required,
**reaction_pt, reaction_pt_code, reaction_soc(_code), suspect_product(_strength/
_route/_dose), expectedness, rsi_reference, reporter_name/_contact/_organization,
narrative, case_status, created_by, submitted_by, submitted_at**.

**Reporting clock object** (`computeReportingClock`):
`{ deadline, daysRemaining, day6Flag, breached, status: 'none'|'on_track'|'due_soon'|'day6'|'breached' }`.

---

## 4. Backend follow-ups (mine to land before/with the UI)

The schema + the read path support the new fields; these wire them end-to-end.
Each is additive and should be validated against the preview DB:

1. **Persist the new intake fields** — extend `reportAdverseEvent` INSERT +
   `adverseEventSchema` (route) + `mapRowToAdverseEvent` to carry reaction_pt /
   reaction_pt_code / suspect_product* / expectedness / rsi_reference / reporter_*
   / narrative / case_status. (Columns exist; the create path doesn't set them yet.)
2. **Clock on listings** — add `computeReportingClock(deadline)` to each row of
   `GET /adverse-events` and `/overdue` so the UI gets `day6Flag`/`status`.
3. **Benefit-risk endpoints** — `GET/POST /benefit-risk` over
   `pv_benefit_risk_assessments` (table shipped), linked to a periodic report.
4. **Signal disproportionality** — compute PRR/ROR/EB05 into the columns shipped.
5. **Periodic DLP/schedule** — use `data_lock_point` + `frequency_months` to
   auto-create the next PSUR/PBRER; surface DLP in the calendar.
6. **RMP ↔ living record** — bind RMP risks to `canonicalFacts` so labeling /
   PSUR §16 benefit-risk consistency is enforced (drift detection).
7. **Gateway ACK automation** — parse RFC 4130 MDN, auto-advance ACK1→ACK2.
8. **MedDRA ingestion** — load the licensed dictionary per org (the lookup
   returns [] until then).

---

## 5. Design-system non-negotiables (from `CLAUDE.md` / `README.md`)

- Sentence case; no Title Case / ALL CAPS (except 10px metadata). No emoji, no
  exclamation marks. Second person.
- Body 13px; max title 18–24px. Numbers over adjectives.
- Claude orange (`#d97757`) once per screen, for the single focal point.
- Lucide icons only. 200ms ease-out motion.
- Clocks/seriousness/status are **status, not alarm**: calm treatments. The single
  legitimate escalations are an overdue/breached clock and a day-6 draft — render
  those as a focused status, not a red error wash.

## 6. Suggested build order

1. Cases line listing + clocks (read-only; highest signal).
2. Case intake form (E2B R3) + MedDRA PT picker + Save-draft/Submit-to-triage.
3. Reporting calendar + gateway ACK tracking.
4. RMP, Signals, PSUR/PBRER, Benefit-risk.

Open questions for the designer go under a new "Open questions" section here; I
answer the backend ones and land the §4 follow-ups to match.
