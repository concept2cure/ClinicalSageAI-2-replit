# Stability UAT — Workflow, CAPA, Excursions, Protocol, Score

> Purpose: prove "Step 6" workflow features: results review, CAPA, chamber excursions, protocol drafting, score.

## Preflight

- [ ] `/healthz` → ok
- [ ] `/readyz` → ready
- [ ] Router mount order: `/api/stability` **above** SPA fallback.

## Select/Create study

- [ ] GET `/api/stability/studies` → choose a `study_id` (SID).
- [ ] If none, POST `/api/stability/studies` to create; save SID.

## Results Review

- [ ] POST 3 LT assay results (0M,3M,6M): `/studies/{SID}/results`
- [ ] GET `/studies/{SID}/results/pending` → PENDING rows appear
- [ ] POST `/results/{RID}/review` with `{"status":"REVIEWED"}` → row changes
- [ ] Approve one → `{"status":"APPROVED"}`

## CAPA

- [ ] POST `/studies/{SID}/capa` with `{"title":"OOT investigation","owner":"QA"}` → row appears
- [ ] PATCH `/capa/{ID}` → set `{"status":"IN_PROGRESS"}` then `{"status":"DONE"}`

## Excursions

- [ ] Upload CSV to `/studies/{SID}/excursions/import` (cols: `timestamp,metric,value,low,high,duration_min`)
- [ ] Response shows `{inserted:N}`

## Protocol

- [ ] POST `/studies/{SID}/protocol/draft` → markdown returned
- [ ] (optional) save a template `/protocols`; apply with `/studies/{SID}/apply-protocol`

## Score

- [ ] GET `/studies/{SID}/score` → `{"score":X,"breakdown":{...}}`

## OOT Monitor sanity

- [ ] GET `/api/stability/oot-surveillance?studyId={SID}&test=Assay` → JSON (never HTML)

## Pass Criteria

- All endpoints return JSON or files; audit rows exist; CAPA updates; excursions import; protocol draft returns MD; score > 0 after linking methods/sign-off.
