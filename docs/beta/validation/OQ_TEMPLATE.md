# Operational Qualification (OQ) — Concept2Cure.RI BETA workflows

**Template version:** 1.0 — 2026-05-01.
**Customer fills in:** test data, observed values, dates, signatures.
**Concept2Cure provides:** the seeded demo project, the workflow specs,
remediation if any test step fails.

OQ proves the application performs the documented functions correctly
under a representative scenario. PQ (separate template) proves it does so
under expected production load.

## Pre-conditions

- [ ] IQ has been executed and signed.
- [ ] The labelled demonstration program exists (`npm run demo:seed -- --pack mdx`); its id is in `docs/evidence/DEMO/mdx/manifest.json`. Below, `<demo>` is that program.
- [ ] Test user accounts exist for each role (RA Lead, RA Specialist, V&V Engineer).
- [ ] No production traffic is mixed into this run.

## Test scenarios

Each scenario maps to one of the BETA workflows defined in
`docs/reports/MDX_BETA_AUDIT_2026-05-01.md`. Capture: pre-condition data,
exact actions taken, observed result, screenshot or logged response,
pass/fail.

### W1 — Read program state (510(k))

| Step | Action                                                       | Expected                                       | Observed | P/F |
|------|--------------------------------------------------------------|------------------------------------------------|----------|-----|
| 1    | Log in as RA Lead, navigate to `/concept2cure/project/<demo>/k510` | Surface loads with KPIs, predicates, SE matrix |          |     |
| 2    | Verify the predicate panel lists only predicates recorded for `<demo>` | No sample candidates; none recorded reads as none |   |     |
| 3    | Verify SE matrix is non-empty                                | rows ≥ 1                                       |          |     |
| 4    | Verify Evidence Sufficiency score is shown                   | numeric 0-100                                  |          |     |
| 5    | Verify Audit-trail strip shows correct last-edited-by        | matches user                                   |          |     |

### W2 — Author eSTAR + run validation

| Step | Action                                                       | Expected                                       | Observed | P/F |
|------|--------------------------------------------------------------|------------------------------------------------|----------|-----|
| 1    | Open eSTAR §6 (Substantial Equivalence) for `<demo>`         | Section content loads                          |          |     |
| 2    | Edit the section body, save                                  | 200; updated content persisted                 |          |     |
| 3    | Trigger validation                                           | findings list rendered                         |          |     |
| 4    | Apply e-signature to approve the section                     | signature captured; chain integrity green      |          |     |
| 5    | Verify `audit_logs` row written with `action=section.approve` | row exists                                    |          |     |

### W3 — Pre-Sub cycle

| Step | Action                                                       | Expected                                       | Observed | P/F |
|------|--------------------------------------------------------------|------------------------------------------------|----------|-----|
| 1    | Create a Pre-Sub for `<demo>` via POST `/api/q-sub`           | 201; new row appears in the Pre-Sub Manager    |          |     |
| 2    | Open it                                                       | Detail loads with its sections                 |          |     |
| 3    | Edit a section via PUT `/api/q-sub/<id>/sections/<key>`, save | 200; updated content persisted                 |          |     |
| 4    | Attempt cross-tenant: log in as Org-B user, hit `/api/q-sub/<id>` | 404                                        |          |     |

Marking a commitment rolled in (PATCH `/api/q-sub/commitments/<id>/rolled-in`)
is not exercised: commitments cannot be recorded in the product yet (ledger
L166 — the capture half of the Pre-Sub cycle is unbuilt), and the only rows
it ever ran against were seven seeded Q-Subs whose FDA feedback was invented
(the seed was removed 2026-10-15).

### W4 — AI letter response (UI gated; backend smoke)

This workflow's UI is gated on Claude Design brief #2. For OQ the backend
is exercised:

| Step | Action                                                       | Expected                                       | Observed | P/F |
|------|--------------------------------------------------------------|------------------------------------------------|----------|-----|
| 1    | POST `/api/regulatory-correspondence/ingest` with a sample AI letter | 200; correspondence persisted        |          |     |
| 2    | Call response-package compile (with cover-letter)             | Cover-letter draft contains §3, §6, §11, §12 verbatim |   |     |
| 3    | Verify `coverLetterMissingSections` is empty when seed populated | empty array                                |          |     |

### W5 — Pre-flight + transmit + clock (backend smoke)

UI is gated on Claude Design brief #8. Backend smoke:

| Step | Action                                                       | Expected                                       | Observed | P/F |
|------|--------------------------------------------------------------|------------------------------------------------|----------|-----|
| 1    | GET pre-flight status for `<demo>`                            | All gates resolved or explicit blockers listed |          |     |
| 2    | Attempt transmit while a blocker is open                       | 409 / 422 (gate refuses)                       |          |     |
| 3    | Resolve blocker, retry transmit                                | 200; ESG receipt captured                      |          |     |

## Cross-cutting checks

| Check                                                       | Expected | Observed | P/F |
|-------------------------------------------------------------|----------|----------|-----|
| All mutations under §3 above produced an `audit_logs` row    | yes      |          |     |
| All mutations triggered a tamper-proof hash-chain entry      | yes      |          |     |
| No 5xx responses in the application logs during the run     | none     |          |     |
| Predicate-shadow `/ready` was 200 throughout                | yes      |          |     |

## Sign-off

| Role            | Name | Signature | Date |
|-----------------|------|-----------|------|
| OQ executed by  |      |           |      |
| QA reviewer     |      |           |      |
| RA reviewer     |      |           |      |
