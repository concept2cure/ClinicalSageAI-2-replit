# Stability UAT — Full Pass Checklist

> Goal: prove the Stability tab is **fully working, AI-assisted, and cross-wired** (DB, API, AI, Authoring).
> If any step fails: STOP and capture (a) file path, (b) exact change/snippet, (c) last 30 server log lines.

---

## Preflight

- [ ] `/healthz` returns JSON with `ok:true`
- [ ] `/readyz` returns JSON with `ready:true`
- [ ] Router mount order confirmed: `app.use("/api/stability", stabilityRouter)` is **above** SPA `app.get("*")`

---

## Create / Select Study

- [ ] GET `/api/stability/studies` returns JSON list (not HTML)
- [ ] If empty, POST `/api/stability/studies` with:
  - name: `UAT Tablet 10mg`
  - code: `SS-UAT-001` (or similar)
  - scope: `DP`
  - zone: `IVa`
  - CQAs: `Assay, Dissolution, Impurities, Appearance`
- [ ] Store returned `study_id` for use below

---

## Verify Overview

- [ ] GET `/api/stability/studies/{SID}` returns:
  - [ ] `study` with `name, code, climatic_zone, duration_months`
  - [ ] `conditions`: LT + ACC
  - [ ] `timepoints`: LT (0/3/6/9/12M), ACC (6M)
  - [ ] `tests`: Assay, Dissolution, Impurities, Appearance
  - [ ] `storage_condition` (compatibility field) present

---

## Enter Results (no CSV)

- [ ] POST `/api/stability/studies/{SID}/results` 3x for LT Assay:
  - 0M = 100.0
  - 3M = 99.2
  - 6M = 98.6
- [ ] GET `/api/stability/studies/{SID}/trends?test=Assay&cond=LT` shows 3 points

---

## OOT/OOS Monitor

- [ ] GET `/api/stability/oot-surveillance?studyId={SID}&test=Assay` returns JSON `{items:[]|[...]}` (never HTML)

---

## Modeling — Arrhenius

- [ ] POST one ACC Assay at 6M = 96.5
- [ ] POST `/api/stability/studies/{SID}/model/arrhenius` with `targetTempC=30, lowerSpec=90` returns:
  - [ ] `Ea_kJmol`
  - [ ] `r2`
  - [ ] `t90_months`

---

## AI Helpers

- [ ] POST `/api/stability/studies/{SID}/ai/explain` returns non-empty explanation
- [ ] GET `/api/stability/studies/{SID}/ai/coach` returns suggestions
- [ ] GET `/api/stability/studies/{SID}/validate` returns list (maybe empty)
- [ ] If any `Q1A-00x` issues → POST `/api/stability/studies/{SID}/ai/fix` then re-validate
- [ ] POST `/api/stability/studies/{SID}/ai/label` saves a label (or returns recommendation)
- [ ] POST `/api/stability/studies/{SID}/ai/draft-p8` returns markdown

---

## P.8 / Authoring

- [ ] POST `/api/stability/studies/{SID}/p8/export?fmt=pdf` returns a PDF file
- [ ] POST `/api/stability/studies/{SID}/p8/push` returns `{ tokens, markdown }` and writes a row to `stab_exports`

---

## In-Use & Sampling

- [ ] POST `/api/stability/studies/{SID}/inuse` with `{ multi_dose:true, opened_frequency:'daily', hold_time_days:14 }`
- [ ] POST `/api/stability/studies/{SID}/schedule` returns an `.ics` calendar file

---

## Compliance (Sign-offs)

- [ ] GET `/api/stability/studies/{SID}/signoffs` returns JSON array
- [ ] POST `/api/stability/studies/{SID}/signoffs` with real user credentials returns `{ok:true, hash}`

---

## UI (quick pass)

- [ ] `/stability` shows cards for real studies (search/filter works)
- [ ] "New Study" wizard creates + navigates
- [ ] Overview → Conditions/Timepoints/Tests visible
- [ ] Results → grid entry & chart
- [ ] Validation → run + One-click fix + re-run
- [ ] Edit → inline edits persist
- [ ] In-Use → save
- [ ] Sampling → download ICS
- [ ] OOT Monitor → lists items (if any)
- [ ] Modeling → Arrhenius outputs
- [ ] Bracketing → plan JSON
- [ ] P.8 → export & push
- [ ] Compliance → sign-offs appear

---

## Pass criteria

- All API calls return **JSON** (or a **file** for export), never HTML.
- OOT endpoint returns JSON (no 404 page).
- Results can be added and graphed.
- P.8 PDF downloads; P.8 push returns tokens + draft.
- At least one sign-off recorded.
- `stab_audit` has rows for the actions performed.
